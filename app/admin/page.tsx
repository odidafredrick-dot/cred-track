"use client";

import { AuthLoadingScreen } from "@/components/loading-states";
import { hasPendingAuthRedirect, signOut, useSession } from "@/lib/auth-client";
import {
  roleLabels,
  statusLabels,
  userRoles,
  userStatuses,
  type UserRole,
  type UserStatus,
} from "@/lib/user-profile";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type AdminTab =
  | "dashboard"
  | "users"
  | "businesses"
  | "subscriptions"
  | "sms"
  | "credit"
  | "inventory"
  | "reports"
  | "notifications"
  | "support"
  | "agents"
  | "finance"
  | "marketing"
  | "feedback"
  | "analytics"
  | "security"
  | "settings"
  | "backup"
  | "pricing"
  | "operations";

type AnalyticsPeriod = "7d" | "30d" | "90d" | "year";
type AnalyticsGroupBy = "day" | "week" | "month";

type TrendRow = {
  date: string;
  label: string;
  value: number;
  count: number;
};

type UserGrowthRow = {
  date: string;
  label: string;
  newUsers: number;
  activeUsers: number;
};

type OverviewData = {
  generatedAt: string;
  period: {
    key: AnalyticsPeriod;
    days: number;
    groupBy: AnalyticsGroupBy;
    currentStart: string;
    previousStart: string;
    previousEnd: string;
  };
  kpis: {
    totalUsers: number;
    usersByRole: Record<string, number>;
    activeBusinesses: number;
    activeSuppliers: number;
    totalCreditsIssued: number;
    periodCreditsIssuedCount: number;
    periodCreditsIssuedAmount: number;
    amountOutstanding: number;
    amountOverdue: number;
    overdueCount: number;
    paymentsCollected: number;
    periodPaymentsCollected: number;
    periodPaymentCount: number;
    lowStockCount: number;
    supplierOrderCount: number;
    supplierOrderAmount: number;
    riskChecks30d: number;
    periodRiskChecks: number;
    periodAverageRiskScore: number | null;
    activeSessionsToday: number;
    newUsersToday: number;
    newUsersThisMonth: number;
    riskLevelCounts: {
      safe: number;
      review: number;
      high: number;
      noHistory: number;
    };
  };
  comparisons: {
    creditsIssuedAmountPct: number | null;
    creditsIssuedCountPct: number | null;
    paymentsCollectedPct: number | null;
    paymentCountPct: number | null;
    riskChecksPct: number | null;
    riskAverageScoreDelta: number | null;
  };
  trends: {
    creditsIssued: TrendRow[];
    paymentsCollected: TrendRow[];
    userGrowth?: UserGrowthRow[];
    riskScore: Array<{
      date: string;
      label: string;
      checks: number;
      averageScore: number | null;
      safe: number;
      review: number;
      high: number;
      noHistory: number;
    }>;
  };
  topCustomers: Array<{
    name: string;
    phone: string;
    totalIssued: number;
    outstanding: number;
  }>;
  topSuppliers: Array<{
    supplierId: string;
    name: string;
    orders: number;
    volume: number;
  }>;
  lowStockItems: Array<{
    id: string;
    product: string;
    quantity: number;
    sellingPrice: number;
    supplierPhone?: string;
    userId?: string;
  }>;
  recentActivity: Array<{
    id: string;
    title: string;
    body: string;
    time: string;
    tone: "info" | "success" | "warning";
  }>;
};

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  role: UserRole | null;
  businessName: string | null;
  businessType: string | null;
  currentPlan: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  location: string;
  profileComplete: boolean;
  status: UserStatus;
  lastSeenAt: string;
  sessionCount: number;
  createdAt: string;
};

type AdminBusiness = AdminUser & {
  description: string | null;
};

type PriceRule = {
  id: string;
  name: string;
  scope: "GLOBAL" | "SUPPLIER" | "CATEGORY";
  scopeValue: string | null;
  minMarkupPercent: number | string | null;
  maxMarkupPercent: number | string | null;
  minSellingPrice: number | string | null;
  maxSellingPrice: number | string | null;
  status: "ACTIVE" | "PAUSED";
  notes: string | null;
  updatedAt: string;
};

type PriceViolation = {
  ruleId: string;
  ruleName: string;
  violationCount: number;
  violations: Array<{
    stockItemId: string;
    product: string;
    supplierPhone: string;
    buyingPrice: number;
    sellingPrice: number;
    quantity: number;
    reason: string;
  }>;
};

type OperationsData = {
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    active: boolean;
    audience: UserRole | null;
    updatedAt: string;
  }>;
  featureFlags: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    enabled: boolean;
    updatedAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string | null;
    summary: string;
    createdAt: string;
  }>;
};

type OperationAnnouncement = OperationsData["announcements"][number];

type FinanceData = {
  summary: {
    totalCreditsIssued: number;
    totalPaid: number;
    totalTopups: number;
    paidTopups: number;
    successfulTopupValue: number;
    openOrders: number;
  };
  credits: Array<{
    id: string;
    customerName: string;
    totalAmount: number | string;
    amountPaid: number | string;
    status: string;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    amount: number | string;
    createdAt: string;
    credit: { customerName: string };
  }>;
  topups: Array<{
    id: string;
    phone: string;
    amount: number | string;
    status: string;
    createdAt: string;
  }>;
  orders: Array<{
    id: string;
    buyerName: string;
    totalAmount: number | string;
    status: string;
    createdAt: string;
  }>;
};

type SmsData = {
  orders: Array<{
    id: string;
    buyerName: string;
    buyerPhone: string | null;
    status: string;
    smsStatus: string | null;
    smsMessageId: string | null;
    createdAt: string;
  }>;
  restocks: Array<{
    id: string;
    businessUserId: string;
    supplierUserId: string;
    product: string;
    quantity: number | null;
    status: string;
    smsStatus: string | null;
    smsMessageId: string | null;
    createdAt: string;
  }>;
};

type AdminModule = {
  id: AdminTab;
  label: string;
  icon: string;
  implemented?: boolean;
};

type GlobalEntitySearchItem = {
  id: string;
  label: string;
  type: "account" | "business";
};

const adminModules: AdminModule[] = [
  { id: "dashboard", label: "Dashboard", icon: "M3 13h8V3H3v10Zm10 8h8V3h-8v18ZM3 21h8v-6H3v6Z", implemented: true },
  { id: "users", label: "User Management", icon: "M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3ZM8 11c1.4 0 2.5-1.1 2.5-2.5S9.4 6 8 6 5.5 7.1 5.5 8.5 6.6 11 8 11Zm8 2c-2.7 0-5 1.4-5 3.2V18h10v-1.8c0-1.8-2.3-3.2-5-3.2ZM8 13c-2.2 0-4 1.1-4 2.5V18h5v-1.8c0-1 .5-1.9 1.3-2.6-.7-.4-1.5-.6-2.3-.6Z", implemented: true },
  { id: "businesses", label: "Business Management", icon: "M4 21V7l8-4 8 4v14h-6v-6h-4v6H4Zm3-3h2v-2H7v2Zm0-4h2v-2H7v2Zm4 0h2v-2h-2v2Zm4 0h2v-2h-2v2Zm0-4h2V8h-2v2Zm-4 0h2V8h-2v2Z", implemented: true },
  { id: "subscriptions", label: "Subscription Management", icon: "M4 6h16v12H4V6Zm2 3v2h8V9H6Zm0 4v2h5v-2H6Zm11 1.5 2-2-1.4-1.4-.6.6V9h-2v2.7l-.6-.6L13 12.5l2 2h2Z" },
  { id: "sms", label: "SMS Management", icon: "M4 5h16v11H7l-3 3V5Zm4 4h8V7H8v2Zm0 4h6v-2H8v2Z", implemented: true },
  { id: "credit", label: "Credit Analytics", icon: "M4 19h16v2H4v-2Zm1-8h3v6H5v-6Zm5-5h3v11h-3V6Zm5 3h3v8h-3V9Z" },
  { id: "inventory", label: "Inventory Analytics", icon: "M4 7 12 3l8 4-8 4-8-4Zm0 3 8 4 8-4v7l-8 4-8-4v-7Z" },
  { id: "reports", label: "Reports", icon: "M6 3h9l3 3v15H6V3Zm8 1.5V7h2.5L14 4.5ZM8 11h8V9H8v2Zm0 4h8v-2H8v2Zm0 4h5v-2H8v2Z" },
  { id: "support", label: "Customer Support", icon: "M12 3a7 7 0 0 0-7 7v4a3 3 0 0 0 3 3h1v-6H7v-1a5 5 0 0 1 10 0v1h-2v6h1a3 3 0 0 0 3-3v-4a7 7 0 0 0-7-7Zm-2 15h4v2h-4v-2Z" },
  { id: "agents", label: "Agent Management", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8c.5-3.4 3.8-6 8-6s7.5 2.6 8 6H4Z" },
  { id: "finance", label: "Finance", icon: "M4 7h16v10H4V7Zm2 2v6h12V9H6Zm6 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", implemented: true },
  { id: "marketing", label: "Marketing", icon: "M4 10v4h3l7 4V6l-7 4H4Zm12-2.5v9l2-1.2V8.7l-2-1.2Z" },
  { id: "feedback", label: "Feedback", icon: "M4 5h16v10H7l-3 4V5Zm4 4h8V7H8v2Zm0 3h6v-2H8v2Z" },
  { id: "analytics", label: "Analytics Dashboard", icon: "M4 19h16v2H4v-2Zm2-8 4 3 4-7 4 5 2-2v4l-2 2-4-5-4 7-5-4 1-3Z", implemented: true },
  { id: "security", label: "Security", icon: "M12 2 5 5v6c0 4.5 3 8.7 7 10 4-1.3 7-5.5 7-10V5l-7-3Zm-1 13-3-3 1.4-1.4 1.6 1.6 3.6-3.6L16 10l-5 5Z" },
  { id: "settings", label: "System Settings", icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 4c0-.5-.1-1-.2-1.5l2-1.5-2-3.4-2.4 1a8.2 8.2 0 0 0-2.6-1.5L14.5 2h-5l-.3 3.1c-.9.3-1.8.8-2.6 1.5l-2.4-1-2 3.4 2 1.5A8 8 0 0 0 4 12c0 .5.1 1 .2 1.5l-2 1.5 2 3.4 2.4-1c.8.7 1.7 1.2 2.6 1.5l.3 3.1h5l.3-3.1c.9-.3 1.8-.8 2.6-1.5l2.4 1 2-3.4-2-1.5c.1-.5.2-1 .2-1.5Z" },
  { id: "backup", label: "Backup & Recovery", icon: "M12 3a8 8 0 0 0-8 8H2l3 3 3-3H6a6 6 0 1 1 2 4.5L6.6 17A8 8 0 1 0 12 3Zm-1 4h2v5l4 2-1 1.7-5-2.7V7Z" },
  { id: "pricing", label: "Price Control", icon: "M5 5h14v4H5V5Zm0 6h6v8H5v-8Zm8 0h6v8h-6v-8Z", implemented: true },
  { id: "operations", label: "Operations", icon: "M4 4h16v4H4V4Zm0 6h7v10H4V10Zm9 0h7v10h-7V10Z", implemented: true },
];

const periodOptions: Array<{ id: AnalyticsPeriod; label: string }> = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "year", label: "This year" },
];

const groupOptions: Array<{ id: AnalyticsGroupBy; label: string }> = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
];

const modulePlans: Partial<Record<AdminTab, string[]>> = {
  subscriptions: [
    "Plan list, subscription revenue, upgrade and downgrade actions.",
    "Pending, active, cancelled, and expired subscription filters.",
    "Subscription history and renewal reports.",
  ],
  sms: [
    "SMS balance, sent, failed, pending, provider cost, and retry queue.",
    "Broadcast tools for all users, businesses, suppliers, or individuals.",
    "SMS usage reports by date, business, and campaign.",
  ],
  credit: [
    "Debt issued vs repaid trends, overdue balances, and repayment periods.",
    "Largest balances, top businesses, risky debtors, and Holwa score trends.",
    "Credit analytics export by county, category, and date.",
  ],
  inventory: [
    "Low-stock products, fast-moving goods, stock value, and stock movement.",
    "Category and supplier performance across the Holwa network.",
    "Inventory alerts and reorder recommendations.",
  ],
  reports: [
    "PDF, Excel, and CSV exports for revenue, SMS, credit, and users.",
    "Filters by date, county, business type, subscription, and status.",
    "Saved report templates for admin review.",
  ],
  notifications: [
    "System announcements, feature messages, promotions, and maintenance alerts.",
    "Audience targeting for all users, businesses, suppliers, or individuals.",
    "Delivery history and notification status.",
  ],
  support: [
    "Customer tickets, status, assignments, response times, and resolution notes.",
    "Support messages connected to users and businesses.",
    "Escalation and issue category tracking.",
  ],
  agents: [
    "Agent accounts, assigned regions, onboarding progress, and activity.",
    "Business acquisition and support performance.",
    "Commission and verification workflow.",
  ],
  finance: [
    "M-Pesa payments, subscriptions, SMS purchases, refunds, income, and expenses.",
    "Profit and loss summaries with exportable transactions.",
    "Refund and reconciliation workflow.",
  ],
  marketing: [
    "Campaigns, promotions, broadcasts, conversion tracking, and audience lists.",
    "County and role-based targeting.",
    "Campaign cost and performance summaries.",
  ],
  feedback: [
    "Ratings, suggestions, feature requests, bug reports, and admin replies.",
    "Priority sorting and issue status.",
    "Feedback trends by role and date.",
  ],
  security: [
    "Login history, failed attempts, devices, IPs, and suspicious activity.",
    "Admin audit logs and account lock actions.",
    "Security settings and access review.",
  ],
  settings: [
    "SMS provider, sender ID, subscription prices, currency, tax, and contacts.",
    "Maintenance mode, app version, terms, and privacy settings.",
    "Feature defaults and platform configuration.",
  ],
  backup: [
    "Backup schedule, last backup, next backup, and recovery status.",
    "Manual backup action and restore history.",
    "Database health and retention settings.",
  ],
};

const emptyPriceForm = {
  name: "",
  scope: "GLOBAL" as PriceRule["scope"],
  scopeValue: "",
  minMarkupPercent: "",
  maxMarkupPercent: "",
  minSellingPrice: "",
  maxSellingPrice: "",
  notes: "",
};

function formatMoney(amount: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Number(value || 0)
  );
}

function formatCompactNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function formatCompactMoney(value: number | string | null | undefined) {
  return `KES ${formatCompactNumber(value)}`;
}

function getNiceChartMax(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const paddedValue = value * 1.12;
  const power = Math.pow(10, Math.floor(Math.log10(paddedValue)));
  const fraction = paddedValue / power;
  const niceFraction =
    fraction <= 1
      ? 1
      : fraction <= 1.5
        ? 1.5
        : fraction <= 2
          ? 2
          : fraction <= 2.5
            ? 2.5
            : fraction <= 5
              ? 5
              : 10;

  return niceFraction * power;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDateRange(start: string, end: string) {
  return `${formatShortDate(start)} - ${formatDate(end)}`;
}

function formatRelative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function compareText(value: number | null, noun = "previous") {
  if (value === null) {
    return "New activity";
  }

  if (value === 0) {
    return `No change vs ${noun}`;
  }

  return `${value > 0 ? "+" : ""}${value}% vs ${noun}`;
}

function numberOrNull(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function AdminSvgIcon({
  path,
  className = "h-4 w-4",
}: {
  path: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d={path} />
    </svg>
  );
}

function DarkPill({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "emerald" | "green" | "amber" | "red" | "purple" | "slate";
}) {
  const tones = {
    blue: "border-blue-400/30 bg-blue-500/10 text-blue-200",
    emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    green: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    red: "border-rose-400/30 bg-rose-500/10 text-rose-200",
    purple: "border-violet-400/30 bg-violet-500/10 text-violet-200",
    slate: "border-white/10 bg-white/5 text-slate-300",
  };

  return (
    <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function DarkPanel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-white/10 bg-slate-900/80 shadow-[0_18px_50px_rgba(0,0,0,0.18)] ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyDark({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

function DarkInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/10 ${props.className || ""}`}
    />
  );
}

function DarkSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/10 ${props.className || ""}`}
    />
  );
}

function DarkTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/10 ${props.className || ""}`}
    />
  );
}

function ActionButton({
  children,
  tone = "blue",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "blue" | "green" | "ghost" | "red";
}) {
  const tones = {
    blue: "bg-blue-600 text-white hover:bg-blue-500",
    green: "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
    ghost: "border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800",
    red: "border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
  };

  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${props.className || ""}`}
    >
      {children}
    </button>
  );
}

function OverviewCard({
  title,
  icon,
  accent,
  action,
  groups,
}: {
  title: string;
  icon: string;
  accent: "blue" | "green" | "purple" | "orange";
  action?: ReactNode;
  groups: Array<Array<{ label: string; value: string; tone?: "green" | "red" | "amber" }>>;
}) {
  const accents = {
    blue: "bg-blue-600 text-white shadow-blue-600/20",
    green: "bg-emerald-500 text-white shadow-emerald-500/20",
    purple: "bg-violet-600 text-white shadow-violet-600/20",
    orange: "bg-orange-500 text-white shadow-orange-500/20",
  };

  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg shadow-lg ${accents[accent]}`}>
            <AdminSvgIcon path={icon} />
          </span>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-5 space-y-4">
        {groups.map((group, index) => (
          <div key={index} className={`grid grid-cols-3 gap-3 ${index > 0 ? "border-t border-white/10 pt-4" : ""}`}>
            {group.map((item) => (
              <div key={`${item.label}-${item.value}`}>
                <p className="text-[11px] text-slate-400">{item.label}</p>
                <p
                  className={`mt-1 text-lg font-semibold ${item.tone === "green"
                    ? "text-emerald-400"
                    : item.tone === "red"
                      ? "text-rose-400"
                      : item.tone === "amber"
                        ? "text-amber-300"
                        : "text-white"
                    }`}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ChartFrame({
  title,
  children,
  label = "This period",
}: {
  title: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <DarkPill tone="slate">{label}</DarkPill>
      </div>
      {children}
    </section>
  );
}

function LineChart({
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
  primaryColor = "#22c55e",
  secondaryColor = "#3b82f6",
  valueMode = "number",
  aggregateMode = "sum",
  emptyText,
}: {
  primary: Array<{ label: string; value: number }>;
  secondary?: Array<{ label: string; value: number }>;
  primaryLabel: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  valueMode?: "number" | "money";
  aggregateMode?: "sum" | "average";
  emptyText: string;
}) {
  const baseRows = primary.map((row, index) => ({
    label: row.label,
    primary: Number(row.value || 0),
    secondary: Number(secondary?.[index]?.value || 0),
  }));
  const displayBucketSize =
    baseRows.length > 18 ? Math.ceil(baseRows.length / 12) : 1;
  const aggregateValues = (values: number[]) =>
    aggregateMode === "average"
      ? values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
      : values.reduce((sum, value) => sum + value, 0);
  const rows =
    displayBucketSize === 1
      ? baseRows
      : Array.from(
        { length: Math.ceil(baseRows.length / displayBucketSize) },
        (_, bucketIndex) => {
          const bucketRows = baseRows.slice(
            bucketIndex * displayBucketSize,
            bucketIndex * displayBucketSize + displayBucketSize
          );
          const first = bucketRows[0];
          const last = bucketRows[bucketRows.length - 1];

          return {
            label:
              first.label === last.label
                ? first.label
                : `${first.label}-${last.label}`,
            primary: aggregateValues(bucketRows.map((row) => row.primary)),
            secondary: aggregateValues(bucketRows.map((row) => row.secondary)),
          };
        }
      );
  const max = Math.max(0, ...rows.map((row) => Math.max(row.primary, row.secondary)));
  const scaleMax = getNiceChartMax(max);
  const width = 620;
  const height = 250;
  const top = 22;
  const bottom = 190;
  const left = valueMode === "money" ? 54 : 34;
  const right = 18;
  const labelStep = Math.max(1, Math.ceil(rows.length / 7));
  const xFor = (index: number) =>
    rows.length <= 1 ? width / 2 : left + (index / (rows.length - 1)) * (width - left - right);
  const yFor = (value: number) => bottom - (value / scaleMax) * (bottom - top);
  const lineFor = (key: "primary" | "secondary") =>
    rows.map((row, index) => `${xFor(index)},${yFor(row[key])}`).join(" ");
  const valueText = (value: number) =>
    valueMode === "money" ? formatCompactMoney(value) : formatCompactNumber(value);
  const summarize = (values: number[]) =>
    aggregateMode === "average"
      ? values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
      : values.reduce((sum, value) => sum + value, 0);
  const primarySummary = summarize(baseRows.map((row) => row.primary));
  const secondarySummary = summarize(baseRows.map((row) => row.secondary));
  const primaryPeak = Math.max(0, ...baseRows.map((row) => row.primary));
  const secondaryPeak = Math.max(0, ...baseRows.map((row) => row.secondary));
  const hasSecondary = Boolean(secondary);

  if (max <= 0) {
    return <EmptyDark text={emptyText} />;
  }

  return (
    <div>
      <div className={`mb-3 grid gap-2 ${hasSecondary ? "grid-cols-2" : "grid-cols-3"}`}>
        <div className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-slate-400">
            {hasSecondary
              ? primaryLabel
              : aggregateMode === "average"
                ? "Average"
                : "Total"}
          </p>
          <p className="mt-1 text-sm font-bold text-white">{valueText(primarySummary)}</p>
        </div>
        {hasSecondary ? (
          <div className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-slate-400">
              {secondaryLabel}
            </p>
            <p className="mt-1 text-sm font-bold text-white">{valueText(secondarySummary)}</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Peak</p>
              <p className="mt-1 text-sm font-bold text-white">{valueText(primaryPeak)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Scale</p>
              <p className="mt-1 text-sm font-bold text-white">{valueText(scaleMax)}</p>
            </div>
          </>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-300">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: primaryColor }} />
          {primaryLabel}
        </span>
        {secondary ? (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: secondaryColor }} />
            {secondaryLabel}
          </span>
        ) : null}
        <span className="text-slate-500">
          {displayBucketSize > 1 ? "Grouped for visibility" : `Peak ${valueText(Math.max(primaryPeak, secondaryPeak))}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full">
        {[0, 1, 2, 3].map((line) => {
          const y = top + line * ((bottom - top) / 3);
          const labelValue = scaleMax - (line / 3) * scaleMax;
          return (
            <g key={line}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" />
              <text x="0" y={y + 4} className="fill-slate-400 text-[10px]">
                {valueText(labelValue)}
              </text>
            </g>
          );
        })}
        <polyline
          points={`${lineFor("primary")} ${xFor(rows.length - 1)},${bottom} ${xFor(0)},${bottom}`}
          fill={primaryColor}
          opacity="0.12"
        />
        {secondary ? (
          <polyline
            points={lineFor("secondary")}
            fill="none"
            stroke={secondaryColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ) : null}
        <polyline
          points={lineFor("primary")}
          fill="none"
          stroke={primaryColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {rows.map((row, index) => (
          <g key={`${row.label}-${index}`}>
            <circle cx={xFor(index)} cy={yFor(row.primary)} r="3.5" fill={primaryColor}>
              <title>{`${row.label}: ${valueText(row.primary)}`}</title>
            </circle>
            {secondary ? (
              <circle cx={xFor(index)} cy={yFor(row.secondary)} r="3.5" fill={secondaryColor}>
                <title>{`${row.label}: ${valueText(row.secondary)}`}</title>
              </circle>
            ) : null}
            {index % labelStep === 0 || index === rows.length - 1 ? (
              <text x={xFor(index)} y="226" textAnchor="middle" className="fill-slate-500 text-[10px]">
                {row.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function BarComparisonChart({
  issued,
  repaid,
}: {
  issued: TrendRow[];
  repaid: TrendRow[];
}) {
  const baseRows = issued.map((row, index) => ({
    date: row.date,
    label: row.label,
    issued: Number(row.value || 0),
    repaid: Number(repaid[index]?.value || 0),
  }));
  const displayBucketSize =
    baseRows.length > 18 ? Math.ceil(baseRows.length / 12) : 1;
  const rows =
    displayBucketSize === 1
      ? baseRows
      : Array.from(
        { length: Math.ceil(baseRows.length / displayBucketSize) },
        (_, bucketIndex) => {
          const bucketRows = baseRows.slice(
            bucketIndex * displayBucketSize,
            bucketIndex * displayBucketSize + displayBucketSize
          );
          const first = bucketRows[0];
          const last = bucketRows[bucketRows.length - 1];

          return {
            date: first.date,
            label:
              first.label === last.label
                ? first.label
                : `${first.label}-${last.label}`,
            issued: bucketRows.reduce((sum, row) => sum + row.issued, 0),
            repaid: bucketRows.reduce((sum, row) => sum + row.repaid, 0),
          };
        }
      );
  const totalIssued = baseRows.reduce((sum, row) => sum + row.issued, 0);
  const totalRepaid = baseRows.reduce((sum, row) => sum + row.repaid, 0);
  const repaymentRate = totalIssued > 0 ? (totalRepaid / totalIssued) * 100 : 0;
  const issuedMax = Math.max(0, ...rows.map((row) => row.issued));
  const repaidMax = Math.max(0, ...rows.map((row) => row.repaid));
  const issuedScaleMax = getNiceChartMax(issuedMax);
  const repaidScaleMax = getNiceChartMax(repaidMax);
  const max = Math.max(issuedMax, repaidMax);
  const labelStep = Math.max(1, Math.ceil(rows.length / 7));
  const width = 660;
  const height = 270;
  const top = 22;
  const bottom = 212;
  const left = 68;
  const right = 68;
  const plotWidth = width - left - right;
  const plotHeight = bottom - top;
  const groupWidth = rows.length > 0 ? plotWidth / rows.length : plotWidth;
  const barWidth = Math.max(8, Math.min(18, groupWidth * 0.32));
  const yForIssued = (value: number) =>
    bottom - (value / issuedScaleMax) * plotHeight;
  const yForRepaid = (value: number) =>
    bottom - (value / repaidScaleMax) * plotHeight;
  const ticks = [1, 0.5, 0];

  if (max <= 0) {
    return <EmptyDark text="No credit or repayment activity in this period." />;
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-blue-200">Created</p>
          <p className="mt-1 text-sm font-bold text-white">{formatCompactMoney(totalIssued)}</p>
        </div>
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-emerald-200">Repaid</p>
          <p className="mt-1 text-sm font-bold text-white">{formatCompactMoney(totalRepaid)}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-slate-400">Rate</p>
          <p className="mt-1 text-sm font-bold text-white">{repaymentRate.toFixed(1)}%</p>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-300">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-blue-500" />
          Credit Created
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-emerald-500" />
          Credit Repaid
        </span>
        <span className="text-slate-500">
          {displayBucketSize > 1 ? "Grouped for visibility" : "Daily view"}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full overflow-visible">
        {ticks.map((tick) => {
          const y = top + (1 - tick) * plotHeight;
          return (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke="rgba(148,163,184,0.16)"
              />
              <text x="0" y={y + 4} className="fill-blue-300 text-[10px]">
                {formatCompactMoney(issuedScaleMax * tick)}
              </text>
              <text
                x={width}
                y={y + 4}
                textAnchor="end"
                className="fill-emerald-300 text-[10px]"
              >
                {formatCompactMoney(repaidScaleMax * tick)}
              </text>
            </g>
          );
        })}
        <line
          x1={left}
          x2={width - right}
          y1={bottom}
          y2={bottom}
          stroke="rgba(148,163,184,0.22)"
        />
        {rows.map((row, index) => {
          const center = left + index * groupWidth + groupWidth / 2;
          const issuedHeight = row.issued > 0 ? bottom - yForIssued(row.issued) : 0;
          const repaidHeight = row.repaid > 0 ? bottom - yForRepaid(row.repaid) : 0;
          return (
            <g key={row.date}>
              <rect
                x={center - barWidth - 1}
                y={bottom - Math.max(issuedHeight, row.issued > 0 ? 7 : 0)}
                width={barWidth}
                height={Math.max(issuedHeight, row.issued > 0 ? 7 : 0)}
                rx="3"
                fill="#3b82f6"
              >
                <title>{`${row.label}: ${formatMoney(row.issued)} created`}</title>
              </rect>
              <rect
                x={center + 1}
                y={bottom - Math.max(repaidHeight, row.repaid > 0 ? 7 : 0)}
                width={barWidth}
                height={Math.max(repaidHeight, row.repaid > 0 ? 7 : 0)}
                rx="3"
                fill="#10b981"
              >
                <title>{`${row.label}: ${formatMoney(row.repaid)} repaid`}</title>
              </rect>
              {index % labelStep === 0 || index === rows.length - 1 ? (
                <text
                  x={center}
                  y="244"
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px]"
                >
                  {row.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DonutChart({
  segments,
  centerLabel,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  centerLabel: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[150px_1fr]">
      <svg viewBox="0 0 120 120" className="h-36 w-36">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#1e293b" strokeWidth="20" />
        {segments.map((segment) => {
          const length = total > 0 ? (segment.value / total) * circumference : 0;
          const circle = (
            <circle
              key={segment.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="20"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
            />
          );
          offset += length;
          return circle;
        })}
        <circle cx="60" cy="60" r="27" fill="#0f172a" />
        <text x="60" y="64" textAnchor="middle" className="fill-slate-300 text-[10px] font-semibold">
          {centerLabel}
        </text>
      </svg>
      <div className="space-y-3">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <span className="h-3 w-3 rounded" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <span className="text-sm font-semibold text-white">
              {formatNumber(segment.value)}
              {total > 0 ? ` (${Math.round((segment.value / total) * 100)}%)` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const sessionResult = useSession();
  const session = sessionResult.data;
  const isPending = sessionResult.isPending;
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>("30d");
  const [analyticsGroupBy, setAnalyticsGroupBy] = useState<AnalyticsGroupBy>("day");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [violations, setViolations] = useState<PriceViolation[]>([]);
  const [operations, setOperations] = useState<OperationsData | null>(null);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [sms, setSms] = useState<SmsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<GlobalEntitySearchItem | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [businessSearch, setBusinessSearch] = useState("");
  const [businessRoleFilter, setBusinessRoleFilter] = useState("");
  const [businessStatusFilter, setBusinessStatusFilter] = useState("");
  const [businessPlanFilter, setBusinessPlanFilter] = useState("");
  const [priceForm, setPriceForm] = useState(emptyPriceForm);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    body: "",
    audience: "",
  });
  const [flagForm, setFlagForm] = useState({
    key: "",
    name: "",
    description: "",
    enabled: false,
  });

  const loadAdmin = async () => {
    setIsLoading(true);
    setError("");

    try {
      const entityQuery = selectedEntity?.id ? `&entityId=${encodeURIComponent(selectedEntity.id)}` : "";
      const [overviewResponse, usersResponse, businessesResponse, priceResponse, operationsResponse, financeResponse, smsResponse] =
        await Promise.all([
          fetch(`/api/admin/overview?period=${analyticsPeriod}&groupBy=${analyticsGroupBy}${entityQuery}`),
          fetch("/api/admin/users"),
          fetch("/api/admin/businesses"),
          fetch("/api/admin/price-rules"),
          fetch("/api/admin/operations"),
          fetch(`/api/admin/finance${entityQuery ? `?entityId=${encodeURIComponent(selectedEntity!.id)}` : ""}`),
          fetch(`/api/admin/sms${entityQuery ? `?entityId=${encodeURIComponent(selectedEntity!.id)}` : ""}`),
        ]);

      if (
        overviewResponse.status === 403 ||
        usersResponse.status === 403 ||
        businessesResponse.status === 403 ||
        priceResponse.status === 403 ||
        operationsResponse.status === 403 ||
        financeResponse.status === 403 ||
        smsResponse.status === 403
      ) {
        router.replace("/dashboard");
        return;
      }

      if (!overviewResponse.ok) {
        throw new Error("Admin analytics could not load.");
      }

      const overviewData = (await overviewResponse.json()) as OverviewData;
      const usersData = usersResponse.ok
        ? ((await usersResponse.json()) as { items: AdminUser[] })
        : { items: [] };
      const businessesData = businessesResponse.ok
        ? ((await businessesResponse.json()) as { items: AdminBusiness[] })
        : { items: [] };
      const priceData = priceResponse.ok
        ? ((await priceResponse.json()) as {
          rules: PriceRule[];
          violations: PriceViolation[];
        })
        : { rules: [], violations: [] };
      const operationsData = operationsResponse.ok
        ? ((await operationsResponse.json()) as OperationsData)
        : null;
      const financeData = financeResponse.ok
        ? ((await financeResponse.json()) as FinanceData)
        : null;
      const smsData = smsResponse.ok
        ? ((await smsResponse.json()) as SmsData)
        : null;

      setOverview(overviewData);
      setUsers(usersData.items || []);
      setBusinesses(businessesData.items || []);
      setPriceRules(priceData.rules || []);
      setViolations(priceData.violations || []);
      setOperations(operationsData);
      setFinance(financeData);
      setSms(smsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin dashboard failed.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isPending && !session) {
      if (hasPendingAuthRedirect()) {
        return;
      }

      router.replace("/");
      return;
    }

    if (session?.user?.id) {
      void loadAdmin();
    }
  }, [analyticsGroupBy, analyticsPeriod, isPending, selectedEntity?.id, session?.user?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const exportDashboard = () => {
    setIsExporting(true);

    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        overview,
        users,
        businesses,
        priceRules,
        violations,
        operations,
        finance,
        sms,
        filters: {
          selectedEntity,
          globalSearchQuery,
          userSearch,
          roleFilter,
          statusFilter,
          businessSearch,
          businessRoleFilter,
          businessStatusFilter,
          businessPlanFilter,
        },
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `holwa-admin-export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setIsProfileMenuOpen(false);
    } finally {
      setIsExporting(false);
    }
  };

  const globalSearchResults = useMemo(() => {
    const term = globalSearchQuery.trim().toLowerCase();
    if (!term) {
      return [];
    }

    const seen = new Set<string>();
    const results: GlobalEntitySearchItem[] = [];

    const pushResult = (item: GlobalEntitySearchItem) => {
      const key = `${item.type}:${item.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(item);
      }
    };

    users.forEach((user) => {
      const label = [user.businessName, user.name, user.email, user.phoneNumber]
        .filter(Boolean)
        .join(" ");
      if (label.toLowerCase().includes(term)) {
        pushResult({
          id: user.id,
          label: user.businessName || user.name || user.email,
          type: "account",
        });
      }
    });

    businesses.forEach((business) => {
      const label = [business.businessName, business.name, business.email, business.phoneNumber]
        .filter(Boolean)
        .join(" ");
      if (label.toLowerCase().includes(term)) {
        pushResult({
          id: business.id,
          label: business.businessName || business.name || business.email,
          type: "business",
        });
      }
    });

    return results.slice(0, 8);
  }, [businesses, globalSearchQuery, users]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return users.filter((user) => {
      const selectedMatches = selectedEntity ? user.id === selectedEntity.id : true;
      const roleMatches = roleFilter ? user.role === roleFilter : true;
      const statusMatches = statusFilter ? user.status === statusFilter : true;
      const searchMatches = term
        ? [user.email, user.name, user.businessName, user.phoneNumber, user.location]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term)
        : true;
      return selectedMatches && roleMatches && statusMatches && searchMatches;
    });
  }, [roleFilter, selectedEntity, statusFilter, userSearch, users]);

  const filteredBusinesses = useMemo(() => {
    const term = businessSearch.trim().toLowerCase();
    return businesses.filter((business) => {
      const selectedMatches = selectedEntity ? business.id === selectedEntity.id : true;
      const roleMatches = businessRoleFilter ? business.role === businessRoleFilter : true;
      const statusMatches = businessStatusFilter ? business.status === businessStatusFilter : true;
      const planMatches = businessPlanFilter
        ? business.currentPlan?.toLowerCase().includes(businessPlanFilter.toLowerCase())
        : true;
      const searchMatches = term
        ? [
          business.email,
          business.name,
          business.businessName,
          business.businessType,
          business.phoneNumber,
          business.location,
          business.currentPlan,
          business.role,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term)
        : true;
      return selectedMatches && roleMatches && statusMatches && planMatches && searchMatches;
    });
  }, [businessPlanFilter, businessRoleFilter, businessSearch, businessStatusFilter, businesses, selectedEntity]);

  const updateUser = async (
    userId: string,
    updates: { role?: UserRole; status?: UserStatus }
  ) => {
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...updates }),
    });

    if (!response.ok) {
      setError("Could not update user profile.");
      return;
    }

    await loadAdmin();
  };

  const updateBusiness = async (
    userId: string,
    updates: {
      status?: UserStatus;
      currentPlan?: string | null;
      businessType?: string | null;
    }
  ) => {
    const response = await fetch("/api/admin/businesses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...updates }),
    });

    if (!response.ok) {
      setError("Could not update business profile.");
      return;
    }

    await loadAdmin();
  };

  const createPriceRule = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/admin/price-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...priceForm,
        minMarkupPercent: numberOrNull(priceForm.minMarkupPercent),
        maxMarkupPercent: numberOrNull(priceForm.maxMarkupPercent),
        minSellingPrice: numberOrNull(priceForm.minSellingPrice),
        maxSellingPrice: numberOrNull(priceForm.maxSellingPrice),
      }),
    });

    if (!response.ok) {
      setError("Could not create price rule.");
      return;
    }

    setPriceForm(emptyPriceForm);
    await loadAdmin();
  };

  const togglePriceRule = async (rule: PriceRule) => {
    const response = await fetch("/api/admin/price-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: rule.id,
        status: rule.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
      }),
    });

    if (!response.ok) {
      setError("Could not update price rule.");
      return;
    }

    await loadAdmin();
  };

  const createAnnouncement = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/admin/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "announcement", ...announcementForm }),
    });

    if (!response.ok) {
      setError("Could not create announcement.");
      return;
    }

    setAnnouncementForm({ title: "", body: "", audience: "" });
    await loadAdmin();
  };

  const updateAnnouncement = async (
    id: string,
    updates: { title?: string; body?: string; audience?: UserRole | "" }
  ) => {
    const response = await fetch("/api/admin/operations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "announcement", id, ...updates }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(data.error || "Could not update announcement.");
      return false;
    }

    await loadAdmin();
    return true;
  };

  const createFeatureFlag = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/admin/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "featureFlag", ...flagForm }),
    });

    if (!response.ok) {
      setError("Could not save feature flag.");
      return;
    }

    setFlagForm({ key: "", name: "", description: "", enabled: false });
    await loadAdmin();
  };

  const toggleAnnouncement = async (id: string, active: boolean) => {
    await fetch("/api/admin/operations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "announcement", id, active }),
    });
    await loadAdmin();
  };

  const toggleFeatureFlag = async (id: string, enabled: boolean) => {
    await fetch("/api/admin/operations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "featureFlag", id, enabled }),
    });
    await loadAdmin();
  };

  if (isPending || (session && isLoading && !overview)) {
    return <AuthLoadingScreen message="Loading admin console..." />;
  }

  if (!session) {
    return null;
  }

  const activeModule =
    adminModules.find((module) => module.id === activeTab) || adminModules[0];

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] grid-cols-1 lg:grid-cols-[278px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/10 bg-[#07111f] px-4 py-5 lg:block">
          <div className="mb-6 flex items-center gap-3 px-2">
            <Image src="/logo.jpeg" alt="Holwa" width={46} height={46} className="rounded-xl" />
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#73d64f]">Holwa</h2>
              <p className="text-[10px] font-medium text-emerald-300">Track. Recover. Grow.</p>
            </div>
          </div>

          <nav className="space-y-1">
            {adminModules.map((module) => {
              const isActive = activeTab === module.id;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setActiveTab(module.id)}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${isActive
                    ? "bg-emerald-500/16 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.18)]"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center ${isActive ? "text-emerald-300" : "text-slate-400 group-hover:text-slate-200"
                      }`}
                  >
                    <AdminSvgIcon path={module.icon} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{module.label}</span>
                  <span className="text-slate-500">›</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-8 rounded-xl border border-white/10 bg-slate-900/70 p-4 text-center shadow-[0_18px_50px_rgba(0,0,0,0.2)]">
            <p className="text-sm font-semibold text-white">Holwa Growth Tip</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Active users today: <span className="font-semibold text-emerald-300">{formatNumber(overview?.kpis.activeSessionsToday)}</span>
            </p>
            <ActionButton
              type="button"
              tone="green"
              className="mt-4 w-full"
              onClick={() => setActiveTab("analytics")}
            >
              View Full Analytics
            </ActionButton>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#07111f]/95 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 lg:hidden"
                  aria-label="Open menu"
                >
                  <span className="text-lg">≡</span>
                </button>
                <div className="hidden h-9 w-px bg-white/10 lg:block" />
                <div className="relative hidden items-center gap-2 rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-400 md:flex">
                  <AdminSvgIcon path="M10 4a6 6 0 0 1 4.7 9.7l4.3 4.3-1.4 1.4-4.3-4.3A6 6 0 1 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
                  <input
                    type="search"
                    placeholder="Search business/account..."
                    value={globalSearchQuery}
                    onChange={(event) => setGlobalSearchQuery(event.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 120)}
                    className="w-72 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                  />
                  {selectedEntity ? (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSelectedEntity(null);
                        setGlobalSearchQuery("");
                        setIsSearchFocused(false);
                      }}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 transition hover:text-slate-200"
                    >
                      Clear
                    </button>
                  ) : (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                      Ctrl + K
                    </span>
                  )}
                  {isSearchFocused && globalSearchResults.length > 0 ? (
                    <div className="absolute left-0 top-full z-30 mt-2 w-[320px] rounded-lg border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-black/40">
                      {globalSearchResults.map((item) => (
                        <button
                          key={`${item.type}-${item.id}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSelectedEntity(item);
                            setGlobalSearchQuery(item.label);
                            setIsSearchFocused(false);
                          }}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
                        >
                          <span>
                            <span className="block font-medium text-white">{item.label}</span>
                            <span className="text-xs text-slate-500">{item.type === "business" ? "Business" : "Account"}</span>
                          </span>
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            View scope
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-slate-900/80 text-slate-300 transition hover:border-emerald-400/40 hover:text-emerald-300"
                  aria-label="Open operations"
                  onClick={() => setActiveTab("operations")}
                >
                  <AdminSvgIcon path="M12 22a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 22Zm7-5-2-2v-5a5 5 0 0 0-10 0v5l-2 2v1h14v-1Z" />
                  <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                    {formatNumber(operations?.announcements.filter((item) => item.active).length || 0)}
                  </span>
                </button>
                <div className="relative hidden sm:block" ref={profileMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen((current) => !current)}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-2 text-left transition hover:border-emerald-400/40"
                  >
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold text-white">
                      {session.user.image ? (
                        <img src={session.user.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        "A"
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{session.user.name || "Admin"}</p>
                      <p className="text-xs text-slate-400">Super Admin</p>
                    </div>
                    <span className="text-slate-500">⌄</span>
                  </button>

                  <div className={`absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-xl border border-white/10 bg-slate-950/95 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.35)] transition-all duration-200 ${isProfileMenuOpen ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                      onClick={() => {
                        exportDashboard();
                      }}
                      disabled={isExporting}
                    >
                      <span>{isExporting ? "Preparing export..." : "Export Dashboard"}</span>
                      <span className="text-xs text-slate-400">↗</span>
                    </button>
                    <button
                      type="button"
                      className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        void signOut();
                      }}
                    >
                      <span>Sign out</span>
                      <span className="text-xs text-slate-400">→</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-2 lg:hidden">
              {adminModules.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setActiveTab(module.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === module.id
                    ? "bg-emerald-500/16 text-emerald-300"
                    : "bg-slate-900 text-slate-300"
                    }`}
                >
                  <AdminSvgIcon path={module.icon} className="h-3.5 w-3.5" />
                  {module.label}
                </button>
              ))}
            </div>
          </header>

          <div className="px-4 py-5 sm:px-6">
            <section className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">{activeModule.label}</h1>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedEntity ? `Focused view for ${selectedEntity.label}.` : "Welcome back, Admin. Here&apos;s what&apos;s happening on Holwa."}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <DarkSelect
                  value={analyticsPeriod}
                  onChange={(event) => {
                    const nextPeriod = event.target.value as AnalyticsPeriod;
                    setAnalyticsPeriod(nextPeriod);
                    setAnalyticsGroupBy(nextPeriod === "year" ? "month" : nextPeriod === "90d" ? "week" : "day");
                  }}
                >
                  {periodOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </DarkSelect>
                <DarkSelect
                  value={analyticsGroupBy}
                  onChange={(event) => setAnalyticsGroupBy(event.target.value as AnalyticsGroupBy)}
                >
                  {groupOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </DarkSelect>
                <div className="rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm font-semibold text-slate-200">
                  {overview ? formatDateRange(overview.period.currentStart, overview.generatedAt) : "Loading"}
                </div>
              </div>
            </section>

            {error ? (
              <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            {overview && activeTab === "dashboard" ? (
              <DashboardTab
                overview={overview}
                users={users}
                businesses={businesses}
                operations={operations}
                setActiveTab={setActiveTab}
              />
            ) : null}

            {overview && activeTab === "analytics" ? (
              <AnalyticsTab overview={overview} />
            ) : null}

            {activeTab === "users" ? (
              <UsersTab
                users={filteredUsers}
                userSearch={userSearch}
                roleFilter={roleFilter}
                statusFilter={statusFilter}
                setUserSearch={setUserSearch}
                setRoleFilter={setRoleFilter}
                setStatusFilter={setStatusFilter}
                updateUser={updateUser}
              />
            ) : null}

            {activeTab === "businesses" ? (
              <BusinessesTab
                businesses={filteredBusinesses}
                search={businessSearch}
                roleFilter={businessRoleFilter}
                statusFilter={businessStatusFilter}
                planFilter={businessPlanFilter}
                setSearch={setBusinessSearch}
                setRoleFilter={setBusinessRoleFilter}
                setStatusFilter={setBusinessStatusFilter}
                setPlanFilter={setBusinessPlanFilter}
                updateBusiness={updateBusiness}
              />
            ) : null}

            {activeTab === "pricing" ? (
              <PricingTab
                priceForm={priceForm}
                setPriceForm={setPriceForm}
                createPriceRule={createPriceRule}
                priceRules={priceRules}
                violations={violations}
                togglePriceRule={togglePriceRule}
              />
            ) : null}

            {activeTab === "operations" ? (
              <OperationsTab
                operations={operations}
                announcementForm={announcementForm}
                setAnnouncementForm={setAnnouncementForm}
                createAnnouncement={createAnnouncement}
                flagForm={flagForm}
                setFlagForm={setFlagForm}
                createFeatureFlag={createFeatureFlag}
                toggleAnnouncement={toggleAnnouncement}
                updateAnnouncement={updateAnnouncement}
                toggleFeatureFlag={toggleFeatureFlag}
              />
            ) : null}

            {activeTab === "finance" ? (
              <FinanceTab finance={finance} />
            ) : null}

            {!["dashboard", "analytics", "users", "businesses", "pricing", "operations"].includes(activeTab) ? (
              <ComingSoonTab activeTab={activeTab} />
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "emerald" | "amber" | "red";
}) {
  const tones = {
    blue: "border-blue-400/20 bg-blue-500/10 text-blue-200",
    emerald: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-400/20 bg-amber-500/10 text-amber-200",
    red: "border-rose-400/20 bg-rose-500/10 text-rose-200",
  };

  return (
    <div className={`rounded-xl border p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] ${tones[tone]}`}>
      <p className="text-sm text-slate-300">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold text-slate-100">{title}</h3>;
}

function StatusPill({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "emerald" | "amber" | "red" }) {
  const tones = {
    blue: "border-blue-400/20 bg-blue-500/10 text-blue-700",
    emerald: "border-emerald-400/20 bg-emerald-500/10 text-emerald-700",
    amber: "border-amber-400/20 bg-amber-500/10 text-amber-700",
    red: "border-rose-400/20 bg-rose-500/10 text-rose-700",
  };

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function FinanceTab({ finance }: { finance: FinanceData | null }) {
  if (!finance) {
    return (
      <section className="rounded-xl border border-gray-100 bg-white p-8 text-sm text-gray-500 shadow-sm">
        No finance data available yet.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Credits issued" value={formatMoney(finance.summary.totalCreditsIssued)} detail="Total value of issued credits" tone="blue" />
        <KpiCard label="Payments received" value={formatMoney(finance.summary.totalPaid)} detail="Collected across all credits" tone="emerald" />
        <KpiCard label="M-Pesa purchases" value={formatMoney(finance.summary.successfulTopupValue)} detail={`${finance.summary.paidTopups} successful reminder purchases`} tone="amber" />
        <KpiCard label="Open orders" value={formatNumber(finance.summary.openOrders)} detail="Supplier orders still pending" tone="red" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DarkPanel title="Recent credits" className="flex h-[50vh] min-h-[280px] flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto pr-1">
            {finance.credits.length ? (
              <div className="space-y-2">
                {finance.credits.map((credit) => (
                  <div key={credit.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-white">{credit.customerName}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{formatDate(credit.createdAt)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-semibold text-white">{formatMoney(credit.totalAmount)}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{credit.status}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyDark text="No credits yet." />
            )}
          </div>
        </DarkPanel>

        <DarkPanel title="Recent payments" className="flex h-[50vh] min-h-[280px] flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto pr-1">
            {finance.payments.length ? (
              <div className="space-y-2">
                {finance.payments.map((payment) => (
                  <div key={payment.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-white">{payment.credit.customerName}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{formatDate(payment.createdAt)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-semibold text-white">{formatMoney(payment.amount)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyDark text="No payments yet." />
            )}
          </div>
        </DarkPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DarkPanel title="M-Pesa reminder purchases" className="flex h-[50vh] min-h-[280px] flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto pr-1">
            {finance.topups.length ? (
              <div className="space-y-2">
                {finance.topups.map((topup) => (
                  <div key={topup.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-white">{topup.phone}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{topup.status}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-semibold text-white">{formatMoney(topup.amount)}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{formatDate(topup.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyDark text="No reminder purchases yet." />
            )}
          </div>
        </DarkPanel>

        <DarkPanel title="Supplier orders" className="flex h-[50vh] min-h-[280px] flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto pr-1">
            {finance.orders.length ? (
              <div className="space-y-2">
                {finance.orders.map((order) => (
                  <div key={order.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-white">{order.buyerName}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{formatDate(order.createdAt)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-semibold text-white">{formatMoney(order.totalAmount)}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{order.status}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyDark text="No supplier orders yet." />
            )}
          </div>
        </DarkPanel>
      </section>
    </div>
  );
}

function SmsTab({ sms }: { sms: SmsData | null }) {
  if (!sms) {
    return (
      <section className="rounded-xl border border-gray-100 bg-white p-8 text-sm text-gray-500 shadow-sm">
        No SMS activity available yet.
      </section>
    );
  }

  const sentOrders = sms.orders.filter((order) => order.smsStatus === "SENT").length;
  const pendingOrders = sms.orders.filter((order) => order.smsStatus !== "SENT").length;
  const sentRestocks = sms.restocks.filter((item) => item.smsStatus === "SENT").length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Supplier SMS" value={formatNumber(sentOrders)} detail="Orders sent successfully" tone="emerald" />
        <KpiCard label="Pending SMS" value={formatNumber(pendingOrders)} detail="Needs follow-up" tone="amber" />
        <KpiCard label="Restock alerts" value={formatNumber(sentRestocks)} detail="Restock SMS sent" tone="blue" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Supplier order SMS log" />
          </div>
          <div className="divide-y divide-gray-100">
            {sms.orders.map((order) => (
              <div key={order.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-950">{order.buyerName}</p>
                    <p className="text-sm text-gray-500">{order.buyerPhone || "No phone"}</p>
                  </div>
                  <StatusPill tone={order.smsStatus === "SENT" ? "emerald" : "amber"}>
                    {order.smsStatus || "PENDING"}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm text-gray-500">{order.status}</p>
                {order.smsMessageId ? <p className="mt-1 text-xs text-gray-400">Ref: {order.smsMessageId}</p> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Restock request SMS log" />
          </div>
          <div className="divide-y divide-gray-100">
            {sms.restocks.map((item) => (
              <div key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-950">{item.product}</p>
                    <p className="text-sm text-gray-500">Qty: {item.quantity ?? "-"}</p>
                  </div>
                  <StatusPill tone={item.smsStatus === "SENT" ? "emerald" : "amber"}>
                    {item.smsStatus || "PENDING"}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm text-gray-500">{item.status}</p>
                {item.smsMessageId ? <p className="mt-1 text-xs text-gray-400">Ref: {item.smsMessageId}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function DashboardTab({
  overview,
  users,
  businesses,
  operations,
  setActiveTab,
}: {
  overview: OverviewData;
  users: AdminUser[];
  businesses: AdminBusiness[];
  operations: OperationsData | null;
  setActiveTab: (tab: AdminTab) => void;
}) {
  const riskSegments = [
    { label: "Safe", value: overview.kpis.riskLevelCounts.safe, color: "#22c55e" },
    { label: "Review", value: overview.kpis.riskLevelCounts.review, color: "#f59e0b" },
    { label: "High risk", value: overview.kpis.riskLevelCounts.high, color: "#ef4444" },
    { label: "No history", value: overview.kpis.riskLevelCounts.noHistory, color: "#64748b" },
  ];
  const userGrowth = overview.trends.userGrowth || overview.trends.creditsIssued.map((row) => ({
    date: row.date,
    label: row.label,
    newUsers: row.count,
    activeUsers: overview.trends.paymentsCollected.find((item) => item.date === row.date)?.count || 0,
  }));
  const quickAccess = adminModules.filter((module) =>
    ["users", "businesses", "subscriptions", "sms", "credit", "inventory", "reports", "finance", "support", "agents", "feedback", "backup"].includes(module.id)
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-500/15 text-blue-300">
          <AdminSvgIcon path="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm1 14h-2v-6h2v6Zm0-8h-2V7h2v2Z" className="h-3 w-3" />
        </span>
        Overview
      </div>

      <section className="grid gap-3 xl:grid-cols-[1.05fr_1.05fr_1fr_1fr]">
        <OverviewCard
          title="User Statistics"
          icon={adminModules.find((module) => module.id === "users")?.icon || adminModules[0].icon}
          accent="blue"
          action={<button className="text-xs font-semibold text-blue-300" type="button" onClick={() => setActiveTab("users")}>View all -&gt;</button>}
          groups={[
            [
              { label: "Total Users", value: formatNumber(overview.kpis.totalUsers) },
              { label: "Active Today", value: formatNumber(overview.kpis.activeSessionsToday) },
              { label: "Active This Month", value: formatNumber(overview.kpis.newUsersThisMonth) },
            ],
            [
              { label: "New Today", value: formatNumber(overview.kpis.newUsersToday) },
              { label: "New This Month", value: formatNumber(overview.kpis.newUsersThisMonth) },
              { label: "Admins", value: formatNumber(overview.kpis.usersByRole.ADMIN || 0), tone: "amber" },
            ],
          ]}
        />
        <OverviewCard
          title="Business Statistics"
          icon={adminModules.find((module) => module.id === "businesses")?.icon || adminModules[0].icon}
          accent="green"
          action={<button className="text-xs font-semibold text-emerald-300" type="button" onClick={() => setActiveTab("businesses")}>View all -&gt;</button>}
          groups={[
            [
              { label: "Businesses", value: formatNumber(overview.kpis.activeBusinesses) },
              { label: "Suppliers", value: formatNumber(overview.kpis.activeSuppliers) },
              { label: "Individuals", value: formatNumber(overview.kpis.usersByRole.INDIVIDUAL || 0) },
            ],
            [
              { label: "Active Businesses", value: formatNumber(businesses.filter((item) => item.status === "ACTIVE").length) },
              { label: "Pending", value: formatNumber(businesses.filter((item) => item.status === "PENDING").length) },
              { label: "Low Stock", value: formatNumber(overview.kpis.lowStockCount), tone: overview.kpis.lowStockCount > 0 ? "amber" : "green" },
            ],
          ]}
        />
        <OverviewCard
          title="Financial Overview"
          icon={adminModules.find((module) => module.id === "finance")?.icon || adminModules[0].icon}
          accent="purple"
          action={<button className="text-xs font-semibold text-violet-300" type="button" onClick={() => setActiveTab("finance")}>View all -&gt;</button>}
          groups={[
            [
              { label: "Outstanding", value: formatCompactMoney(overview.kpis.amountOutstanding), tone: overview.kpis.amountOutstanding > 0 ? "amber" : "green" },
              { label: "Overdue", value: formatCompactMoney(overview.kpis.amountOverdue), tone: overview.kpis.amountOverdue > 0 ? "red" : "green" },
              { label: "Collected", value: formatCompactMoney(overview.kpis.periodPaymentsCollected), tone: "green" },
            ],
            [
              { label: "Credits Issued", value: formatCompactMoney(overview.kpis.periodCreditsIssuedAmount) },
              { label: "Supplier Orders", value: formatCompactMoney(overview.kpis.supplierOrderAmount) },
              { label: "All Payments", value: formatCompactMoney(overview.kpis.paymentsCollected), tone: "green" },
            ],
          ]}
        />
        <OverviewCard
          title="Activity (Today)"
          icon="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8Zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5Zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11Zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5Z"
          accent="orange"
          action={<button className="text-xs font-semibold text-amber-300" type="button" onClick={() => setActiveTab("analytics")}>View all -&gt;</button>}
          groups={[
            [
              { label: "Customers Added", value: formatNumber(overview.kpis.newUsersToday), tone: "green" },
              { label: "Credit Records", value: formatNumber(overview.kpis.periodCreditsIssuedCount) },
              { label: "Inventory Items", value: formatNumber(overview.kpis.lowStockCount) },
            ],
            [
              { label: "Payments Recorded", value: formatNumber(overview.kpis.periodPaymentCount), tone: "green" },
              { label: "Risk Checks", value: formatNumber(overview.kpis.periodRiskChecks) },
              { label: "Supplier Orders", value: formatNumber(overview.kpis.supplierOrderCount) },
            ],
          ]}
        />
      </section>

      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-500/15 text-blue-300">
          <AdminSvgIcon path={adminModules.find((module) => module.id === "analytics")?.icon || adminModules[0].icon} className="h-3 w-3" />
        </span>
        Analytics At A Glance
      </div>

      <section className="grid gap-3 xl:grid-cols-4">
        <ChartFrame title="User Growth" label="This period">
          <LineChart
            primary={userGrowth.map((row) => ({ label: row.label, value: row.newUsers }))}
            secondary={userGrowth.map((row) => ({ label: row.label, value: row.activeUsers }))}
            primaryLabel="New Users"
            secondaryLabel="Active Users"
            emptyText="No user activity is available for this period."
          />
        </ChartFrame>
        <ChartFrame title="Revenue Overview" label="This period">
          <LineChart
            primary={overview.trends.paymentsCollected.map((row) => ({ label: row.label, value: row.value }))}
            primaryLabel="Payments"
            primaryColor="#22c55e"
            valueMode="money"
            emptyText="No payments were collected in this period."
          />
        </ChartFrame>
        <ChartFrame title="Risk Score Mix" label={`${formatNumber(overview.kpis.periodRiskChecks)} checks`}>
          <DonutChart segments={riskSegments} centerLabel="Risk" />
        </ChartFrame>
        <ChartFrame title="Credit vs Repaid" label="This period">
          <BarComparisonChart issued={overview.trends.creditsIssued} repaid={overview.trends.paymentsCollected} />
        </ChartFrame>
      </section>

      <DarkPanel
        title="Quick Access"
        action={<span className="text-xs text-slate-400">Jump to admin modules</span>}
      >
        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
          {quickAccess.map((module) => (
            <button
              key={module.id}
              type="button"
              onClick={() => setActiveTab(module.id)}
              className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-4 text-center transition hover:border-emerald-400/30 hover:bg-slate-900"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300">
                <AdminSvgIcon path={module.icon} className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold text-slate-200">{module.label.replace(" Management", "")}</span>
            </button>
          ))}
        </div>
      </DarkPanel>

      <section className="grid gap-3 xl:grid-cols-[1fr_1fr_1.35fr]">
        <DarkPanel title="Recent Users" action={<button type="button" onClick={() => setActiveTab("users")} className="text-xs font-semibold text-blue-300">View all -&gt;</button>}>
          <CompactUsersTable users={users.slice(0, 5)} />
        </DarkPanel>
        <DarkPanel title="Recent Businesses" action={<button type="button" onClick={() => setActiveTab("businesses")} className="text-xs font-semibold text-blue-300">View all -&gt;</button>}>
          <CompactBusinessesTable businesses={businesses.slice(0, 5)} />
        </DarkPanel>
        <DarkPanel title="Recent Transactions" action={<button type="button" onClick={() => setActiveTab("finance")} className="text-xs font-semibold text-blue-300">View all -&gt;</button>}>
          <RecentActivityTable items={overview.recentActivity.slice(0, 5)} />
        </DarkPanel>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatusWidget
          title="SMS Status"
          lines={[
            ["Reminder Credits", `${formatNumber(overview.kpis.periodPaymentCount)} used`],
            ["Provider", "AfricasTalking"],
            ["Cost per SMS", "KES 1.00"],
          ]}
          action="View SMS Reports ->"
          onClick={() => setActiveTab("sms")}
        />
        <StatusWidget
          title="System Status"
          lines={[
            ["System", "Operational"],
            ["Database", "Operational"],
            ["Uptime", "Live"],
          ]}
          tone="green"
          action="View Logs ->"
          onClick={() => setActiveTab("security")}
        />
        <StatusWidget
          title="Backup Status"
          lines={[
            ["Last Backup", "Not configured"],
            ["Next Backup", "Pending setup"],
            ["Status", "Review"],
          ]}
          tone="amber"
          action="Backup Module ->"
          onClick={() => setActiveTab("backup")}
        />
        <StatusWidget
          title="Operations"
          lines={[
            ["Active Announcements", formatNumber(operations?.announcements.filter((item) => item.active).length || 0)],
            ["Feature Flags", formatNumber(operations?.featureFlags.length || 0)],
            ["Risk Checks", formatNumber(overview.kpis.periodRiskChecks)],
          ]}
          action="Open Operations ->"
          onClick={() => setActiveTab("operations")}
        />
        <DarkPanel title="Support Tickets">
          <DonutChart
            centerLabel="Tickets"
            segments={[
              { label: "Open", value: 0, color: "#3b82f6" },
              { label: "In Progress", value: 0, color: "#f59e0b" },
              { label: "Resolved", value: 0, color: "#22c55e" },
            ]}
          />
          <button
            type="button"
            onClick={() => setActiveTab("support")}
            className="mt-4 text-xs font-semibold text-blue-300"
          >
            View All Tickets -&gt;
          </button>
        </DarkPanel>
      </section>
    </div>
  );
}

function StatusWidget({
  title,
  lines,
  action,
  onClick,
  tone = "blue",
}: {
  title: string;
  lines: Array<[string, string]>;
  action: string;
  onClick: () => void;
  tone?: "blue" | "green" | "amber";
}) {
  const dotColor = tone === "green" ? "bg-emerald-400" : tone === "amber" ? "bg-amber-400" : "bg-blue-400";

  return (
    <DarkPanel title={title}>
      <div className="space-y-3">
        {lines.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between border-b border-white/10 pb-2 last:border-0 last:pb-0">
            <span className="text-xs text-slate-400">{label}</span>
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-100">
              <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
              {value}
            </span>
          </div>
        ))}
      </div>
      <button type="button" onClick={onClick} className="mt-4 text-xs font-semibold text-blue-300">
        {action}
      </button>
    </DarkPanel>
  );
}

function AnalyticsTab({ overview }: { overview: OverviewData }) {
  const riskScoreRows = overview.trends.riskScore
    .filter((row) => row.averageScore !== null)
    .map((row) => ({ label: row.label, value: Number(row.averageScore || 0) }));

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SimpleKpi title="Credits issued" value={formatMoney(overview.kpis.periodCreditsIssuedAmount)} detail={compareText(overview.comparisons.creditsIssuedAmountPct)} />
        <SimpleKpi title="Payments collected" value={formatMoney(overview.kpis.periodPaymentsCollected)} detail={compareText(overview.comparisons.paymentsCollectedPct)} tone="green" />
        <SimpleKpi title="Risk-score checks" value={formatNumber(overview.kpis.periodRiskChecks)} detail={compareText(overview.comparisons.riskChecksPct)} tone="purple" />
        <SimpleKpi title="Overdue amount" value={formatMoney(overview.kpis.amountOverdue)} detail={`${formatNumber(overview.kpis.overdueCount)} overdue credits`} tone="amber" />
      </section>
      <section className="grid gap-3 xl:grid-cols-3">
        <ChartFrame title="Credits Issued" label="Time series">
          <LineChart
            primary={overview.trends.creditsIssued.map((row) => ({ label: row.label, value: row.value }))}
            primaryLabel="Credit Created"
            primaryColor="#3b82f6"
            valueMode="money"
            emptyText="No goods/services credit was issued in this period."
          />
        </ChartFrame>
        <ChartFrame title="Payments Collected" label="Time series">
          <LineChart
            primary={overview.trends.paymentsCollected.map((row) => ({ label: row.label, value: row.value }))}
            primaryLabel="Payments"
            primaryColor="#22c55e"
            valueMode="money"
            emptyText="No payments were collected in this period."
          />
        </ChartFrame>
        <ChartFrame title="Risk-score Trend" label={`${formatNumber(overview.kpis.periodRiskChecks)} checks`}>
          <LineChart
            primary={riskScoreRows}
            primaryLabel="Average Score"
            primaryColor="#a855f7"
            aggregateMode="average"
            emptyText="No Holwa score checks were made in this period."
          />
        </ChartFrame>
      </section>
      <section className="grid gap-3 xl:grid-cols-2">
        <DarkPanel title="Top Customers By Outstanding Debt">
          <CustomerList customers={overview.topCustomers} />
        </DarkPanel>
        <DarkPanel title="Low-stock Items">
          <LowStockList items={overview.lowStockItems} />
        </DarkPanel>
      </section>
    </div>
  );
}

function SimpleKpi({
  title,
  value,
  detail,
  tone = "blue",
}: {
  title: string;
  value: string;
  detail: string;
  tone?: "blue" | "green" | "purple" | "amber";
}) {
  const tones = {
    blue: "text-blue-300 bg-blue-500/10 border-blue-400/20",
    green: "text-emerald-300 bg-emerald-500/10 border-emerald-400/20",
    purple: "text-violet-300 bg-violet-500/10 border-violet-400/20",
    amber: "text-amber-300 bg-amber-500/10 border-amber-400/20",
  };

  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
      <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
        {detail}
      </span>
    </section>
  );
}

function CompactUsersTable({ users }: { users: AdminUser[] }) {
  if (users.length === 0) {
    return <EmptyDark text="No users yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="text-slate-400">
          <tr className="border-b border-white/10">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Phone</th>
            <th className="pb-2 font-medium">Business</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {users.map((user) => (
            <tr key={user.id}>
              <td className="py-2 text-slate-100">{user.name || user.email}</td>
              <td className="py-2 text-slate-300">{user.phoneNumber || "-"}</td>
              <td className="py-2 text-slate-300">{user.businessName || "-"}</td>
              <td className="py-2">
                <DarkPill tone={user.status === "ACTIVE" ? "green" : user.status === "SUSPENDED" ? "red" : "amber"}>
                  {statusLabels[user.status]}
                </DarkPill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactBusinessesTable({ businesses }: { businesses: AdminBusiness[] }) {
  if (businesses.length === 0) {
    return <EmptyDark text="No businesses yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] text-left text-xs">
        <thead className="text-slate-400">
          <tr className="border-b border-white/10">
            <th className="pb-2 font-medium">Business Name</th>
            <th className="pb-2 font-medium">Owner</th>
            <th className="pb-2 font-medium">Plan</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {businesses.map((business) => (
            <tr key={business.id}>
              <td className="py-2 text-slate-100">{business.businessName || business.email}</td>
              <td className="py-2 text-slate-300">{business.name || "-"}</td>
              <td className="py-2 text-slate-300">{business.currentPlan || "Basic"}</td>
              <td className="py-2">
                <DarkPill tone={business.status === "ACTIVE" ? "green" : business.status === "SUSPENDED" ? "red" : "amber"}>
                  {statusLabels[business.status]}
                </DarkPill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentActivityTable({ items }: { items: OverviewData["recentActivity"] }) {
  if (items.length === 0) {
    return <EmptyDark text="No recent transactions yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-xs">
        <thead className="text-slate-400">
          <tr className="border-b border-white/10">
            <th className="pb-2 font-medium">Type</th>
            <th className="pb-2 font-medium">Description</th>
            <th className="pb-2 font-medium">Date</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="py-2 text-slate-100">{item.title}</td>
              <td className="py-2 text-slate-300">{item.body}</td>
              <td className="py-2 text-slate-300">{formatRelative(item.time)}</td>
              <td className="py-2">
                <DarkPill tone={item.tone === "success" ? "green" : item.tone === "warning" ? "amber" : "blue"}>
                  {item.tone}
                </DarkPill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerList({ customers }: { customers: OverviewData["topCustomers"] }) {
  if (customers.length === 0) {
    return <EmptyDark text="No customer credit data yet." />;
  }

  return (
    <div className="divide-y divide-white/10">
      {customers.map((customer) => (
        <div key={`${customer.phone}-${customer.name}`} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="font-semibold text-white">{customer.name}</p>
            <p className="text-sm text-slate-400">{customer.phone}</p>
          </div>
          <div className="sm:text-right">
            <p className="font-semibold text-white">{formatMoney(customer.outstanding)}</p>
            <p className="text-sm text-slate-400">Issued {formatMoney(customer.totalIssued)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function LowStockList({ items }: { items: OverviewData["lowStockItems"] }) {
  if (items.length === 0) {
    return <EmptyDark text="No low-stock items." />;
  }

  return (
    <div className="divide-y divide-white/10">
      {items.map((item) => (
        <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="font-semibold text-white">{item.product}</p>
            <p className="text-sm text-slate-400">Supplier {item.supplierPhone || item.userId || "unknown"}</p>
          </div>
          <div className="sm:text-right">
            <DarkPill tone={item.quantity < 5 ? "red" : "amber"}>{item.quantity} left</DarkPill>
            <p className="mt-1 text-sm text-slate-400">{formatMoney(item.sellingPrice)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersTab({
  users,
  userSearch,
  roleFilter,
  statusFilter,
  setUserSearch,
  setRoleFilter,
  setStatusFilter,
  updateUser,
}: {
  users: AdminUser[];
  userSearch: string;
  roleFilter: string;
  statusFilter: string;
  setUserSearch: (value: string) => void;
  setRoleFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  updateUser: (userId: string, updates: { role?: UserRole; status?: UserStatus }) => Promise<void>;
}) {
  return (
    <DarkPanel
      title="User Management"
      action={<DarkPill tone="blue">{formatNumber(users.length)} users</DarkPill>}
    >
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_180px_180px]">
        <DarkInput value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search users" />
        <DarkSelect value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="">All roles</option>
          {userRoles.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </DarkSelect>
        <DarkSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>
          {userStatuses.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </DarkSelect>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr className="border-b border-white/10">
              <th className="pb-3 font-medium">User</th>
              <th className="pb-3 font-medium">Role</th>
              <th className="pb-3 font-medium">Profile</th>
              <th className="pb-3 font-medium">Last seen</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="py-3">
                  <p className="font-semibold text-white">{user.businessName || user.name || user.email}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                  <p className="text-xs text-slate-500">{user.phoneNumber || "No phone"} {user.location ? `- ${user.location}` : ""}</p>
                </td>
                <td className="py-3 text-slate-300">{user.role ? roleLabels[user.role] : "Unset"}</td>
                <td className="py-3">
                  <DarkPill tone={user.profileComplete ? "green" : "amber"}>
                    {user.profileComplete ? "Complete" : "Pending"}
                  </DarkPill>
                </td>
                <td className="py-3 text-slate-300">{formatRelative(user.lastSeenAt)}</td>
                <td className="py-3">
                  <DarkSelect
                    value={user.status}
                    onChange={(event) => void updateUser(user.id, { status: event.target.value as UserStatus })}
                    className="w-40"
                  >
                    {userStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </DarkSelect>
                </td>
                <td className="py-3">
                  <DarkSelect
                    value={user.role || ""}
                    onChange={(event) => void updateUser(user.id, { role: event.target.value as UserRole })}
                    className="w-44"
                  >
                    <option value="">Select role</option>
                    {userRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </DarkSelect>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 ? <EmptyDark text="No users match this filter." /> : null}
      </div>
    </DarkPanel>
  );
}

function BusinessesTab({
  businesses,
  search,
  roleFilter,
  statusFilter,
  planFilter,
  setSearch,
  setRoleFilter,
  setStatusFilter,
  setPlanFilter,
  updateBusiness,
}: {
  businesses: AdminBusiness[];
  search: string;
  roleFilter: string;
  statusFilter: string;
  planFilter: string;
  setSearch: (value: string) => void;
  setRoleFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  setPlanFilter: (value: string) => void;
  updateBusiness: (
    userId: string,
    updates: { status?: UserStatus; currentPlan?: string | null; businessType?: string | null }
  ) => Promise<void>;
}) {
  return (
    <DarkPanel
      title="Business Management"
      action={<DarkPill tone="green">{formatNumber(businesses.length)} profiles</DarkPill>}
    >
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_170px_170px_170px]">
        <DarkInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search businesses" />
        <DarkSelect value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="">All roles</option>
          {userRoles
            .filter((role) => role === "BUSINESS" || role === "SUPPLIER")
            .map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
        </DarkSelect>
        <DarkSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>
          {userStatuses.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </DarkSelect>
        <DarkInput value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} placeholder="Filter plan" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr className="border-b border-white/10">
              <th className="pb-3 font-medium">Business</th>
              <th className="pb-3 font-medium">Owner</th>
              <th className="pb-3 font-medium">Role</th>
              <th className="pb-3 font-medium">Plan</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {businesses.map((business) => (
              <tr key={business.id}>
                <td className="py-3">
                  <p className="font-semibold text-white">{business.businessName || business.email}</p>
                  <p className="text-xs text-slate-400">{business.phoneNumber || "No phone"} {business.location ? `- ${business.location}` : ""}</p>
                  {business.description ? <p className="mt-1 max-w-md text-xs text-slate-500">{business.description}</p> : null}
                </td>
                <td className="py-3 text-slate-300">{business.name || "-"}</td>
                <td className="py-3 text-slate-300">{business.role ? roleLabels[business.role] : "Unset"}</td>
                <td className="py-3">
                  <DarkInput
                    value={business.currentPlan || ""}
                    onChange={(event) => void updateBusiness(business.id, { currentPlan: event.target.value || null })}
                    placeholder="Plan"
                    className="w-36"
                  />
                </td>
                <td className="py-3">
                  <DarkSelect
                    value={business.status}
                    onChange={(event) => void updateBusiness(business.id, { status: event.target.value as UserStatus })}
                    className="w-40"
                  >
                    {userStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </DarkSelect>
                </td>
                <td className="py-3">
                  <DarkInput
                    value={business.businessType || ""}
                    onChange={(event) => void updateBusiness(business.id, { businessType: event.target.value || null })}
                    placeholder="Type"
                    className="w-40"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {businesses.length === 0 ? <EmptyDark text="No businesses match this filter." /> : null}
      </div>
    </DarkPanel>
  );
}

function PricingTab({
  priceForm,
  setPriceForm,
  createPriceRule,
  priceRules,
  violations,
  togglePriceRule,
}: {
  priceForm: typeof emptyPriceForm;
  setPriceForm: (value: typeof emptyPriceForm) => void;
  createPriceRule: (event: FormEvent) => Promise<void>;
  priceRules: PriceRule[];
  violations: PriceViolation[];
  togglePriceRule: (rule: PriceRule) => Promise<void>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <form onSubmit={createPriceRule} className="rounded-xl border border-white/10 bg-slate-900/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <h2 className="mb-4 text-sm font-semibold text-white">Create Price Rule</h2>
        <div className="space-y-3">
          <DarkInput value={priceForm.name} onChange={(event) => setPriceForm({ ...priceForm, name: event.target.value })} placeholder="Rule name" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <DarkSelect value={priceForm.scope} onChange={(event) => setPriceForm({ ...priceForm, scope: event.target.value as PriceRule["scope"] })}>
              <option value="GLOBAL">Global</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="CATEGORY">Category/product</option>
            </DarkSelect>
            <DarkInput value={priceForm.scopeValue} onChange={(event) => setPriceForm({ ...priceForm, scopeValue: event.target.value })} placeholder="Scope value" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DarkInput type="number" value={priceForm.minMarkupPercent} onChange={(event) => setPriceForm({ ...priceForm, minMarkupPercent: event.target.value })} placeholder="Min markup %" />
            <DarkInput type="number" value={priceForm.maxMarkupPercent} onChange={(event) => setPriceForm({ ...priceForm, maxMarkupPercent: event.target.value })} placeholder="Max markup %" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DarkInput type="number" value={priceForm.minSellingPrice} onChange={(event) => setPriceForm({ ...priceForm, minSellingPrice: event.target.value })} placeholder="Min price" />
            <DarkInput type="number" value={priceForm.maxSellingPrice} onChange={(event) => setPriceForm({ ...priceForm, maxSellingPrice: event.target.value })} placeholder="Max price" />
          </div>
          <DarkTextarea value={priceForm.notes} onChange={(event) => setPriceForm({ ...priceForm, notes: event.target.value })} placeholder="Notes" className="min-h-24" />
          <ActionButton type="submit" tone="green" className="w-full">Save Rule</ActionButton>
        </div>
      </form>

      <div className="space-y-4">
        <DarkPanel title="Active Price Rules" action={<DarkPill tone="blue">{formatNumber(priceRules.length)} rules</DarkPill>}>
          <div className="divide-y divide-white/10">
            {priceRules.length === 0 ? (
              <EmptyDark text="No price rules configured." />
            ) : (
              priceRules.map((rule) => (
                <div key={rule.id} className="grid gap-3 py-3 lg:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{rule.name}</p>
                      <DarkPill tone={rule.status === "ACTIVE" ? "green" : "slate"}>{rule.status}</DarkPill>
                      <DarkPill tone="blue">{rule.scope}</DarkPill>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {rule.scopeValue || "All stock"} - Markup {rule.minMarkupPercent || "any"}% to {rule.maxMarkupPercent || "any"}% - Price{" "}
                      {rule.minSellingPrice ? formatMoney(rule.minSellingPrice) : "any"} to {rule.maxSellingPrice ? formatMoney(rule.maxSellingPrice) : "any"}
                    </p>
                    {rule.notes ? <p className="mt-1 text-sm text-slate-500">{rule.notes}</p> : null}
                  </div>
                  <ActionButton type="button" tone="ghost" onClick={() => void togglePriceRule(rule)}>
                    {rule.status === "ACTIVE" ? "Pause" : "Activate"}
                  </ActionButton>
                </div>
              ))
            )}
          </div>
        </DarkPanel>

        <DarkPanel title="Price Rule Violations">
          {violations.every((rule) => rule.violations.length === 0) ? (
            <EmptyDark text="No price violations found." />
          ) : (
            <div className="space-y-3">
              {violations
                .filter((rule) => rule.violations.length > 0)
                .map((rule) => (
                  <div key={rule.ruleId} className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="font-semibold text-amber-100">{rule.ruleName}</p>
                      <DarkPill tone="amber">{rule.violations.length} issues</DarkPill>
                    </div>
                    <div className="space-y-2">
                      {rule.violations.map((violation) => (
                        <div key={violation.stockItemId} className="rounded-lg bg-slate-950/60 px-3 py-2 text-sm">
                          <p className="font-semibold text-white">{violation.product}</p>
                          <p className="mt-1 text-slate-400">{violation.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </DarkPanel>
      </div>
    </div>
  );
}

function OperationsTab({
  operations,
  announcementForm,
  setAnnouncementForm,
  createAnnouncement,
  flagForm,
  setFlagForm,
  createFeatureFlag,
  toggleAnnouncement,
  updateAnnouncement,
  toggleFeatureFlag,
}: {
  operations: OperationsData | null;
  announcementForm: { title: string; body: string; audience: string };
  setAnnouncementForm: (value: { title: string; body: string; audience: string }) => void;
  createAnnouncement: (event: FormEvent) => Promise<void>;
  flagForm: { key: string; name: string; description: string; enabled: boolean };
  setFlagForm: (value: { key: string; name: string; description: string; enabled: boolean }) => void;
  createFeatureFlag: (event: FormEvent) => Promise<void>;
  toggleAnnouncement: (id: string, active: boolean) => Promise<void>;
  updateAnnouncement: (
    id: string,
    updates: { title?: string; body?: string; audience?: UserRole | "" }
  ) => Promise<boolean>;
  toggleFeatureFlag: (id: string, enabled: boolean) => Promise<void>;
}) {
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<{
    title: string;
    body: string;
    audience: UserRole | "";
  }>({ title: "", body: "", audience: "" });

  const startEditingAnnouncement = (announcement: OperationAnnouncement) => {
    setEditingAnnouncementId(announcement.id);
    setEditingAnnouncement({
      title: announcement.title,
      body: announcement.body,
      audience: announcement.audience || "",
    });
  };

  const cancelEditingAnnouncement = () => {
    setEditingAnnouncementId(null);
    setEditingAnnouncement({ title: "", body: "", audience: "" });
  };

  const saveAnnouncementEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingAnnouncementId) {
      return;
    }

    const saved = await updateAnnouncement(editingAnnouncementId, editingAnnouncement);
    if (saved) {
      cancelEditingAnnouncement();
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <form onSubmit={createAnnouncement} className="rounded-xl border border-white/10 bg-slate-900/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <h2 className="mb-4 text-sm font-semibold text-white">System Announcement</h2>
          <div className="space-y-3">
            <DarkInput value={announcementForm.title} onChange={(event) => setAnnouncementForm({ ...announcementForm, title: event.target.value })} placeholder="Title" required />
            <DarkTextarea value={announcementForm.body} onChange={(event) => setAnnouncementForm({ ...announcementForm, body: event.target.value })} placeholder="Message" className="min-h-24" required />
            <DarkSelect value={announcementForm.audience} onChange={(event) => setAnnouncementForm({ ...announcementForm, audience: event.target.value })}>
              <option value="">All users</option>
              {userRoles
                .filter((role) => role !== "ADMIN")
                .map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
            </DarkSelect>
            <ActionButton type="submit" tone="green" className="w-full">Publish Announcement</ActionButton>
          </div>
        </form>

        <form onSubmit={createFeatureFlag} className="rounded-xl border border-white/10 bg-slate-900/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <h2 className="mb-4 text-sm font-semibold text-white">Feature Flag</h2>
          <div className="space-y-3">
            <DarkInput value={flagForm.key} onChange={(event) => setFlagForm({ ...flagForm, key: event.target.value })} placeholder="feature_key" required />
            <DarkInput value={flagForm.name} onChange={(event) => setFlagForm({ ...flagForm, name: event.target.value })} placeholder="Feature name" required />
            <DarkTextarea value={flagForm.description} onChange={(event) => setFlagForm({ ...flagForm, description: event.target.value })} placeholder="Description" className="min-h-20" />
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={flagForm.enabled} onChange={(event) => setFlagForm({ ...flagForm, enabled: event.target.checked })} />
              Enabled
            </label>
            <ActionButton type="submit" tone="green" className="w-full">Save Feature Flag</ActionButton>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <DarkPanel title="Announcements">
          {operations?.announcements.length ? (
            <div className="divide-y divide-white/10">
              {operations.announcements.map((announcement) => (
                <div key={announcement.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  {editingAnnouncementId === announcement.id ? (
                    <form onSubmit={saveAnnouncementEdit} className="space-y-3">
                      <DarkInput value={editingAnnouncement.title} onChange={(event) => setEditingAnnouncement({ ...editingAnnouncement, title: event.target.value })} placeholder="Title" required />
                      <DarkTextarea value={editingAnnouncement.body} onChange={(event) => setEditingAnnouncement({ ...editingAnnouncement, body: event.target.value })} placeholder="Message" className="min-h-24" required />
                      <DarkSelect value={editingAnnouncement.audience} onChange={(event) => setEditingAnnouncement({ ...editingAnnouncement, audience: event.target.value as UserRole | "" })}>
                        <option value="">All users</option>
                        {userRoles
                          .filter((role) => role !== "ADMIN")
                          .map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                      </DarkSelect>
                      <div className="flex flex-wrap gap-2">
                        <ActionButton type="submit" tone="green">Save</ActionButton>
                        <ActionButton type="button" tone="ghost" onClick={cancelEditingAnnouncement}>Cancel</ActionButton>
                      </div>
                    </form>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-white">{announcement.title}</p>
                          <DarkPill tone={announcement.active ? "green" : "slate"}>
                            {announcement.active ? "Active" : "Paused"}
                          </DarkPill>
                          <DarkPill tone="blue">{announcement.audience ? roleLabels[announcement.audience] : "All users"}</DarkPill>
                        </div>
                        <p className="mt-1 text-sm text-slate-400">{announcement.body}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ActionButton type="button" tone="ghost" onClick={() => startEditingAnnouncement(announcement)}>
                          Edit
                        </ActionButton>
                        <ActionButton type="button" tone="ghost" onClick={() => void toggleAnnouncement(announcement.id, !announcement.active)}>
                          {announcement.active ? "Pause" : "Activate"}
                        </ActionButton>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyDark text="No announcements yet." />
          )}
        </DarkPanel>

        <DarkPanel title="Feature Flags">
          {operations?.featureFlags.length ? (
            <div className="divide-y divide-white/10">
              {operations.featureFlags.map((flag) => (
                <div key={flag.id} className="grid gap-3 py-3 lg:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{flag.name}</p>
                      <DarkPill tone={flag.enabled ? "green" : "slate"}>{flag.enabled ? "Enabled" : "Disabled"}</DarkPill>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{flag.key}</p>
                    {flag.description ? <p className="mt-1 text-sm text-slate-400">{flag.description}</p> : null}
                  </div>
                  <ActionButton type="button" tone="ghost" onClick={() => void toggleFeatureFlag(flag.id, !flag.enabled)}>
                    {flag.enabled ? "Disable" : "Enable"}
                  </ActionButton>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDark text="No feature flags yet." />
          )}
        </DarkPanel>

        <DarkPanel title="Audit Trail">
          {operations?.auditLogs.length ? (
            <div className="divide-y divide-white/10">
              {operations.auditLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="py-3">
                  <p className="font-semibold text-white">{log.action}</p>
                  <p className="mt-1 text-sm text-slate-400">{log.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatRelative(log.createdAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDark text="No audit activity yet." />
          )}
        </DarkPanel>
      </div>
    </div>
  );
}

function ComingSoonTab({ activeTab }: { activeTab: AdminTab }) {
  const module = adminModules.find((item) => item.id === activeTab);
  const plan = modulePlans[activeTab] || [
    "Admin controls for this area are planned.",
    "The module will keep the same dark admin console style.",
    "Data will be connected to the existing Holwa backend before release.",
  ];

  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <DarkPill tone="blue">Next phase</DarkPill>
          <h2 className="mt-4 text-2xl font-bold text-white">{module?.label || activeTab}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            This module is represented in the admin navigation from the uploaded dashboard document.
            It is ready for dedicated schema and workflow work when you want to build the full feature.
          </p>
        </div>
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
          <AdminSvgIcon path={module?.icon || adminModules[0].icon} className="h-6 w-6" />
        </span>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {plan.map((item) => (
          <div key={item} className="rounded-xl border border-white/10 bg-slate-950/70 p-4 text-sm leading-6 text-slate-300">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
