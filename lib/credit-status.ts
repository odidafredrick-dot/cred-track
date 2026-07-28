export type CreditStatus =
  | "PENDING"
  | "DUE"
  | "OVERDUE"
  | "PARTIALLY_PAID"
  | "PAID";

function normalizeDate(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function computeCreditStatus({
  dueDate,
  totalAmount,
  amountPaid,
  requestedStatus,
}: {
  dueDate: Date;
  totalAmount: number;
  amountPaid: number;
  requestedStatus?: CreditStatus | string;
}): CreditStatus {
  if (totalAmount > 0 && amountPaid >= totalAmount) {
    return "PAID";
  }

  if (amountPaid > 0) {
    return "PARTIALLY_PAID";
  }

  if (requestedStatus === "PAID") {
    return "PAID";
  }

  const today = normalizeDate(new Date());
  const due = normalizeDate(dueDate);

  if (due < today) {
    return "OVERDUE";
  }

  if (due.getTime() === today.getTime()) {
    return "DUE";
  }

  return "PENDING";
}
