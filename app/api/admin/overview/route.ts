import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

type ActivityItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  tone: "info" | "success" | "warning";
};

type GroupBy = "day" | "week" | "month";
type PeriodKey = "7d" | "30d" | "90d" | "year";
type RiskBucketKey = "safe" | "review" | "high" | "noHistory";

type TrendBucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

const periodDays: Record<PeriodKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  year: 365,
};

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parsePeriod(value: string | null): PeriodKey {
  return value === "7d" || value === "30d" || value === "90d" || value === "year"
    ? value
    : "30d";
}

function parseGroupBy(value: string | null, period: PeriodKey): GroupBy {
  if (value === "day" || value === "week" || value === "month") {
    return value;
  }

  if (period === "year") {
    return "month";
  }

  if (period === "90d") {
    return "week";
  }

  return "day";
}

function bucketLabel(start: Date, end: Date, groupBy: GroupBy) {
  if (groupBy === "month") {
    return start.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  if (groupBy === "week") {
    const lastDay = addDays(end, -1);
    return `${start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })}-${lastDay.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })}`;
  }

  return start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function createBuckets(start: Date, end: Date, groupBy: GroupBy) {
  const buckets: TrendBucket[] = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    let next: Date;

    if (groupBy === "month") {
      next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    } else {
      next = addDays(cursor, groupBy === "week" ? 7 : 1);
    }

    const cappedEnd = next > end ? addDays(end, 1) : next;
    buckets.push({
      key: dateKey(cursor),
      label: bucketLabel(cursor, cappedEnd, groupBy),
      start: new Date(cursor),
      end: cappedEnd,
    });
    cursor = next;
  }

  return buckets;
}

function bucketForDate(buckets: TrendBucket[], date: Date) {
  return buckets.find((bucket) => date >= bucket.start && date < bucket.end);
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? null : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function riskBucket(level: unknown): RiskBucketKey {
  const value = String(level || "");

  if (value === "EXCELLENT" || value === "LOW_RISK") {
    return "safe";
  }

  if (value === "MODERATE_RISK" || value === "LIMITED_HISTORY") {
    return "review";
  }

  if (value === "NO_HISTORY") {
    return "noHistory";
  }

  return "high";
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const { searchParams } = new URL(request.url);
  const period = parsePeriod(searchParams.get("period"));
  const groupBy = parseGroupBy(searchParams.get("groupBy"), period);
  const days = periodDays[period];
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const currentStart = period === "year"
    ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    : startOfDay(addDays(now, -(days - 1)));
  const previousStart = addDays(currentStart, -days);
  const buckets = createBuckets(currentStart, now, groupBy);

  const [
    totalUsers,
    roleCounts,
    credits,
    payments,
    lowStockItems,
    supplierOrders,
    riskChecks,
    recentCredits,
    recentPayments,
    recentOrders,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userProfile.groupBy({
      by: ["role"],
      _count: { _all: true },
    }),
    prisma.credit.findMany({
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        totalAmount: true,
        amountPaid: true,
        status: true,
        dueDate: true,
        createdAt: true,
      },
    }),
    prisma.creditPayment.findMany({
      select: { id: true, amount: true, createdAt: true },
    }),
    prisma.stockItem.findMany({
      where: { quantity: { lt: 10 } },
      select: {
        id: true,
        product: true,
        quantity: true,
        sellingPrice: true,
        userId: true,
      },
      orderBy: [{ quantity: "asc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.supplierOrder.findMany({
      select: {
        id: true,
        supplierId: true,
        buyerName: true,
        totalAmount: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.holwaRiskScoreCheck.findMany({
      where: { createdAt: { gte: previousStart } },
      select: {
        id: true,
        debtorPhone: true,
        score: true,
        riskLevel: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.credit.findMany({
      select: {
        id: true,
        customerName: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.creditPayment.findMany({
      select: {
        id: true,
        amount: true,
        createdAt: true,
        credit: {
          select: {
            customerName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.supplierOrder.findMany({
      select: {
        id: true,
        buyerName: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const usersByRole = roleCounts.reduce<Record<string, number>>(
    (acc, row) => {
      acc[String(row.role)] = row._count._all;
      return acc;
    },
    {
      BUSINESS: 0,
      SUPPLIER: 0,
      INDIVIDUAL: 0,
      ADMIN: 0,
    }
  );

  const activeCredits = credits.filter(
    (credit) =>
      String(credit.status) !== "PAID" &&
      money(credit.totalAmount) - money(credit.amountPaid) > 0
  );
  const overdueCredits = activeCredits.filter(
    (credit) => new Date(credit.dueDate) < today
  );
  const amountOutstanding = activeCredits.reduce(
    (sum, credit) => sum + Math.max(0, money(credit.totalAmount) - money(credit.amountPaid)),
    0
  );
  const amountOverdue = overdueCredits.reduce(
    (sum, credit) => sum + Math.max(0, money(credit.totalAmount) - money(credit.amountPaid)),
    0
  );
  const paymentsCollected = payments.reduce(
    (sum, payment) => sum + money(payment.amount),
    0
  );
  const supplierOrderAmount = supplierOrders.reduce(
    (sum, order) => sum + money(order.totalAmount),
    0
  );

  const currentCredits = credits.filter((credit) => credit.createdAt >= currentStart);
  const previousCredits = credits.filter(
    (credit) => credit.createdAt >= previousStart && credit.createdAt < currentStart
  );
  const currentPayments = payments.filter((payment) => payment.createdAt >= currentStart);
  const previousPayments = payments.filter(
    (payment) => payment.createdAt >= previousStart && payment.createdAt < currentStart
  );
  const currentRiskChecks = riskChecks.filter((check) => check.createdAt >= currentStart);
  const previousRiskChecks = riskChecks.filter(
    (check) => check.createdAt >= previousStart && check.createdAt < currentStart
  );

  const creditTrendMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      { date: bucket.key, label: bucket.label, value: 0, count: 0 },
    ])
  );
  for (const credit of credits) {
    const bucket = bucketForDate(buckets, credit.createdAt);
    if (bucket) {
      const row = creditTrendMap.get(bucket.key);
      if (row) {
        row.value += money(credit.totalAmount);
        row.count += 1;
      }
    }
  }

  const paymentTrendMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      { date: bucket.key, label: bucket.label, value: 0, count: 0 },
    ])
  );
  for (const payment of payments) {
    const bucket = bucketForDate(buckets, payment.createdAt);
    if (bucket) {
      const row = paymentTrendMap.get(bucket.key);
      if (row) {
        row.value += money(payment.amount);
        row.count += 1;
      }
    }
  }

  const riskTrend = buckets.map((bucket) => {
    const checks = riskChecks.filter(
      (check) => check.createdAt >= bucket.start && check.createdAt < bucket.end
    );
    const scored = checks.filter((check) => check.score !== null);
    const averageScore =
      scored.length > 0
        ? Math.round(
            scored.reduce((sum, check) => sum + Number(check.score || 0), 0) /
              scored.length
          )
        : null;
    const levelCounts = checks.reduce(
      (acc, check) => {
        acc[riskBucket(check.riskLevel)] += 1;
        return acc;
      },
      { safe: 0, review: 0, high: 0, noHistory: 0 }
    );
    return {
      date: bucket.key,
      label: bucket.label,
      checks: checks.length,
      averageScore,
      ...levelCounts,
    };
  });

  const currentCreditAmount = currentCredits.reduce(
    (sum, credit) => sum + money(credit.totalAmount),
    0
  );
  const previousCreditAmount = previousCredits.reduce(
    (sum, credit) => sum + money(credit.totalAmount),
    0
  );
  const currentPaymentAmount = currentPayments.reduce(
    (sum, payment) => sum + money(payment.amount),
    0
  );
  const previousPaymentAmount = previousPayments.reduce(
    (sum, payment) => sum + money(payment.amount),
    0
  );
  const scoredCurrentRiskChecks = currentRiskChecks.filter((check) => check.score !== null);
  const scoredPreviousRiskChecks = previousRiskChecks.filter((check) => check.score !== null);
  const averageCurrentRiskScore =
    scoredCurrentRiskChecks.length > 0
      ? Math.round(
          scoredCurrentRiskChecks.reduce(
            (sum, check) => sum + Number(check.score || 0),
            0
          ) / scoredCurrentRiskChecks.length
        )
      : null;
  const averagePreviousRiskScore =
    scoredPreviousRiskChecks.length > 0
      ? Math.round(
          scoredPreviousRiskChecks.reduce(
            (sum, check) => sum + Number(check.score || 0),
            0
          ) / scoredPreviousRiskChecks.length
        )
      : null;
  const riskLevelCounts = currentRiskChecks.reduce(
    (acc, check) => {
      acc[riskBucket(check.riskLevel)] += 1;
      return acc;
    },
    { safe: 0, review: 0, high: 0, noHistory: 0 }
  );

  const customers = new Map<
    string,
    { name: string; phone: string; totalIssued: number; outstanding: number }
  >();
  for (const credit of credits) {
    const key = credit.customerPhone || credit.customerName;
    const existing =
      customers.get(key) ||
      {
        name: credit.customerName,
        phone: credit.customerPhone,
        totalIssued: 0,
        outstanding: 0,
      };
    existing.totalIssued += money(credit.totalAmount);
    existing.outstanding += Math.max(0, money(credit.totalAmount) - money(credit.amountPaid));
    customers.set(key, existing);
  }

  const suppliers = new Map<
    string,
    { supplierId: string; orders: number; volume: number }
  >();
  for (const order of supplierOrders) {
    const existing =
      suppliers.get(order.supplierId) ||
      { supplierId: order.supplierId, orders: 0, volume: 0 };
    existing.orders += 1;
    existing.volume += money(order.totalAmount);
    suppliers.set(order.supplierId, existing);
  }

  const supplierProfiles = await prisma.userProfile.findMany({
    where: { userId: { in: Array.from(suppliers.keys()) } },
    select: { userId: true, businessName: true, phoneNumber: true },
  });
  const supplierNames = new Map(
    supplierProfiles.map((profile) => [
      profile.userId,
      profile.businessName || profile.phoneNumber || profile.userId,
    ])
  );

  const activity: ActivityItem[] = [
    ...recentCredits.map((credit) => ({
      id: `credit-${credit.id}`,
      title: "Credit issued",
      body: `${credit.customerName} received goods/services worth KES ${money(
        credit.totalAmount
      ).toLocaleString()}`,
      time: credit.createdAt.toISOString(),
      tone: "info" as const,
    })),
    ...recentPayments.map((payment) => ({
      id: `payment-${payment.id}`,
      title: "Payment collected",
      body: `${payment.credit.customerName} paid KES ${money(
        payment.amount
      ).toLocaleString()}`,
      time: payment.createdAt.toISOString(),
      tone: "success" as const,
    })),
    ...recentOrders.map((order) => ({
      id: `order-${order.id}`,
      title: "Supplier order",
      body: `${order.buyerName} ordered KES ${money(
        order.totalAmount
      ).toLocaleString()} of stock`,
      time: order.createdAt.toISOString(),
      tone: "warning" as const,
    })),
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 10);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    period: {
      key: period,
      days,
      groupBy,
      currentStart: currentStart.toISOString(),
      previousStart: previousStart.toISOString(),
      previousEnd: currentStart.toISOString(),
    },
    kpis: {
      totalUsers,
      usersByRole,
      activeBusinesses: usersByRole.BUSINESS || 0,
      activeSuppliers: usersByRole.SUPPLIER || 0,
      totalCreditsIssued: credits.length,
      periodCreditsIssuedCount: currentCredits.length,
      periodCreditsIssuedAmount: currentCreditAmount,
      amountOutstanding,
      amountOverdue,
      overdueCount: overdueCredits.length,
      paymentsCollected,
      periodPaymentsCollected: currentPaymentAmount,
      periodPaymentCount: currentPayments.length,
      lowStockCount: lowStockItems.length,
      supplierOrderCount: supplierOrders.length,
      supplierOrderAmount,
      riskChecks30d: currentRiskChecks.length,
      periodRiskChecks: currentRiskChecks.length,
      periodAverageRiskScore: averageCurrentRiskScore,
      riskLevelCounts,
    },
    comparisons: {
      creditsIssuedAmountPct: percentChange(
        currentCreditAmount,
        previousCreditAmount
      ),
      creditsIssuedCountPct: percentChange(currentCredits.length, previousCredits.length),
      paymentsCollectedPct: percentChange(currentPaymentAmount, previousPaymentAmount),
      paymentCountPct: percentChange(currentPayments.length, previousPayments.length),
      riskChecksPct: percentChange(currentRiskChecks.length, previousRiskChecks.length),
      riskAverageScoreDelta:
        averageCurrentRiskScore !== null && averagePreviousRiskScore !== null
          ? averageCurrentRiskScore - averagePreviousRiskScore
          : null,
    },
    trends: {
      creditsIssued: Array.from(creditTrendMap.values()),
      paymentsCollected: Array.from(paymentTrendMap.values()),
      riskScore: riskTrend,
    },
    topCustomers: Array.from(customers.values())
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 8),
    topSuppliers: Array.from(suppliers.values())
      .map((supplier) => ({
        ...supplier,
        name: supplierNames.get(supplier.supplierId) || supplier.supplierId,
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 8),
    lowStockItems,
    recentActivity: activity,
  });
}
