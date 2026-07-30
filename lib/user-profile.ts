export const userRoles = ["BUSINESS", "SUPPLIER", "INDIVIDUAL", "ADMIN"] as const;

export type UserRole = (typeof userRoles)[number];

export const roleLabels: Record<UserRole, string> = {
  BUSINESS: "Business",
  SUPPLIER: "Supplier",
  INDIVIDUAL: "Individual",
  ADMIN: "Admin",
};

export const paymentModes = ["POCHI", "PAY_BILL", "CASH", "TILL"] as const;

export type PaymentMode = (typeof paymentModes)[number];

export const paymentModeLabels: Record<PaymentMode, string> = {
  POCHI: "Pochi",
  PAY_BILL: "Pay Bill",
  CASH: "Cash",
  TILL: "Till",
};

export function isUserRole(value: string | null): value is UserRole {
  return userRoles.includes(value as UserRole);
}

export function isPaymentMode(value: string | null): value is PaymentMode {
  return paymentModes.includes(value as PaymentMode);
}

export function needsBusinessProfile(role: UserRole | null | undefined) {
  return role === "BUSINESS" || role === "SUPPLIER";
}
