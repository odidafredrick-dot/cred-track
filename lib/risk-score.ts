export type CreditRiskInput = {
  dueDate: Date | string;
  totalAmount: number;
  amountPaid: number;
  status: "PENDING" | "DUE" | "OVERDUE" | "PARTIALLY_PAID" | "PAID";
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type RiskLevel =
  | "EXCELLENT"
  | "LOW_RISK"
  | "MODERATE_RISK"
  | "HIGH_RISK"
  | "VERY_HIGH_RISK"
  | "DO_NOT_EXTEND"
  | "LIMITED_HISTORY"
  | "NO_HISTORY";

export type HolwaRiskScoreResult = {
  phone: string;
  score: number | null;
  riskLevel: RiskLevel;
  riskLabel: string;
  recommendation: string;
  suggestedLimit: number;
  checkedAt: string;
  hasHistory: boolean;
};

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(
    0,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );
}

function monthsBetween(start: Date, end: Date) {
  const years = end.getFullYear() - start.getFullYear();
  const months = end.getMonth() - start.getMonth();
  return Math.max(1, years * 12 + months + 1);
}

function scoreFromRatio(ratio: number, maxPoints: number) {
  return Math.max(0, Math.min(maxPoints, ratio * maxPoints));
}

function tierScore(
  ratio: number,
  points: Array<{ max: number; score: number }>
) {
  const match = points.find((point) => ratio <= point.max);
  return match ? match.score : 0;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getRiskLevel(score: number, creditCount: number): RiskLevel {
  if (creditCount < 2) {
    return "LIMITED_HISTORY";
  }

  if (score >= 90) {
    return "EXCELLENT";
  }

  if (score >= 80) {
    return "LOW_RISK";
  }

  if (score >= 70) {
    return "MODERATE_RISK";
  }

  if (score >= 60) {
    return "HIGH_RISK";
  }

  if (score >= 40) {
    return "VERY_HIGH_RISK";
  }

  return "DO_NOT_EXTEND";
}

export const riskLabels: Record<RiskLevel, string> = {
  EXCELLENT: "Excellent",
  LOW_RISK: "Low Risk",
  MODERATE_RISK: "Moderate Risk",
  HIGH_RISK: "High Risk",
  VERY_HIGH_RISK: "Very High Risk",
  DO_NOT_EXTEND: "Do Not Extend",
  LIMITED_HISTORY: "Limited History",
  NO_HISTORY: "No History",
};

function reliabilityMultiplier(score: number) {
  if (score >= 90) {
    return 3;
  }
  if (score >= 80) {
    return 2.5;
  }
  if (score >= 70) {
    return 2;
  }
  if (score >= 60) {
    return 1.5;
  }
  if (score >= 50) {
    return 1;
  }
  if (score >= 40) {
    return 0.5;
  }
  return 0;
}

function roundedLimit(amount: number) {
  if (amount <= 0) {
    return 0;
  }

  return Math.round(amount / 100) * 100;
}

function buildRecommendation(
  riskLevel: RiskLevel,
  suggestedLimit: number
) {
  if (riskLevel === "NO_HISTORY") {
    return "No Holwa trade history yet. Start with upfront payment or a small first goods/services order.";
  }

  if (riskLevel === "LIMITED_HISTORY") {
    return `Limited Holwa trade history. Review carefully and keep goods/services credit near ${formatMoney(
      suggestedLimit
    )}.`;
  }

  if (riskLevel === "EXCELLENT" || riskLevel === "LOW_RISK") {
    return `Safe to extend goods/services credit up to ${formatMoney(suggestedLimit)}.`;
  }

  if (riskLevel === "MODERATE_RISK") {
    return `Review carefully before extending goods/services credit above ${formatMoney(
      suggestedLimit
    )}.`;
  }

  if (riskLevel === "HIGH_RISK") {
    return `High risk. Use upfront payment or keep goods/services credit near ${formatMoney(
      suggestedLimit
    )}.`;
  }

  if (riskLevel === "VERY_HIGH_RISK") {
    return "Very high risk. Avoid goods/services credit unless secured by upfront payment.";
  }

  return "Do not extend goods/services credit based on current Holwa trade history.";
}

export function calculateHolwaRiskScore(
  phone: string,
  records: CreditRiskInput[]
): HolwaRiskScoreResult {
  const checkedAt = new Date();

  if (records.length === 0) {
    return {
      phone,
      score: null,
      riskLevel: "NO_HISTORY",
      riskLabel: riskLabels.NO_HISTORY,
      recommendation: buildRecommendation("NO_HISTORY", 0),
      suggestedLimit: 0,
      checkedAt: checkedAt.toISOString(),
      hasHistory: false,
    };
  }

  const normalizedRecords = records.map((record) => {
    const dueDate = new Date(record.dueDate);
    const createdAt = new Date(record.createdAt);
    const updatedAt = new Date(record.updatedAt);
    const totalAmount = Number(record.totalAmount || 0);
    const amountPaid = Number(record.amountPaid || 0);
    const outstanding = Math.max(0, totalAmount - amountPaid);
    const isPaid = record.status === "PAID" || outstanding <= 0;
    const settledAt = isPaid ? updatedAt : checkedAt;
    const daysLate = settledAt > endOfDay(dueDate) ? daysBetween(dueDate, settledAt) : 0;

    return {
      ...record,
      dueDate,
      createdAt,
      updatedAt,
      totalAmount,
      amountPaid,
      outstanding,
      isPaid,
      daysLate,
    };
  });

  const paymentBaseRecords = normalizedRecords.filter(
    (record) => record.isPaid || record.dueDate <= checkedAt
  );
  const onTimePayments = paymentBaseRecords.filter(
    (record) => record.isPaid && record.daysLate <= 0
  ).length;
  const paymentRate =
    paymentBaseRecords.length > 0
      ? onTimePayments / paymentBaseRecords.length
      : 0.6;
  const paymentHistoryPoints = scoreFromRatio(paymentRate, 35);

  const averageDaysLate =
    normalizedRecords.reduce((sum, record) => sum + record.daysLate, 0) /
    normalizedRecords.length;
  const delayPoints = tierScore(averageDaysLate, [
    { max: 5, score: 20 },
    { max: 15, score: 15 },
    { max: 30, score: 10 },
    { max: 60, score: 5 },
  ]);

  const totalGranted = normalizedRecords.reduce(
    (sum, record) => sum + record.totalAmount,
    0
  );
  const outstandingDebt = normalizedRecords.reduce(
    (sum, record) => sum + record.outstanding,
    0
  );
  const outstandingRatio =
    totalGranted > 0 ? (outstandingDebt / totalGranted) * 100 : 100;
  const outstandingPoints = tierScore(outstandingRatio, [
    { max: 20, score: 15 },
    { max: 40, score: 12 },
    { max: 60, score: 8 },
    { max: 80, score: 4 },
  ]);

  const defaults = normalizedRecords.filter(
    (record) => !record.isPaid && record.daysLate >= 90
  ).length;
  const defaultPoints =
    defaults === 0
      ? 15
      : defaults === 1
      ? 12
      : defaults === 2
      ? 8
      : defaults === 3
      ? 4
      : 0;

  const largestPreviousDebt = Math.max(
    ...normalizedRecords.map((record) => record.totalAmount),
    0
  );
  const firstCreditDate = normalizedRecords.reduce(
    (earliest, record) =>
      record.createdAt < earliest ? record.createdAt : earliest,
    normalizedRecords[0].createdAt
  );
  const activeMonths = monthsBetween(firstCreditDate, checkedAt);
  const averageMonthlyPurchases = totalGranted / activeMonths;
  const estimatedLimitBase = Math.max(
    averageMonthlyPurchases * 3,
    largestPreviousDebt,
    totalGranted * 0.25,
    1
  );
  const utilizationRatio = (outstandingDebt / estimatedLimitBase) * 100;
  const utilizationPoints = tierScore(utilizationRatio, [
    { max: 20, score: 10 },
    { max: 40, score: 8 },
    { max: 60, score: 5 },
    { max: 80, score: 2 },
  ]);

  const relationshipPoints =
    activeMonths >= 36 ? 5 : activeMonths >= 12 ? 4 : activeMonths >= 6 ? 2 : 1;

  const rawScore =
    paymentHistoryPoints +
    delayPoints +
    outstandingPoints +
    defaultPoints +
    utilizationPoints +
    relationshipPoints;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const riskLevel = getRiskLevel(score, normalizedRecords.length);
  const suggestedLimit = roundedLimit(
    averageMonthlyPurchases * reliabilityMultiplier(score)
  );

  return {
    phone,
    score,
    riskLevel,
    riskLabel: riskLabels[riskLevel],
    recommendation: buildRecommendation(riskLevel, suggestedLimit),
    suggestedLimit,
    checkedAt: checkedAt.toISOString(),
    hasHistory: true,
  };
}
