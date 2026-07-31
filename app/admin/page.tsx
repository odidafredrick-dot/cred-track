"use client";

import { AuthLoadingScreen } from "@/components/loading-states";
import { hasPendingAuthRedirect, signOut, useSession } from "@/lib/auth-client";
import { roleLabels, userRoles, type UserRole } from "@/lib/user-profile";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type AdminTab = "analytics" | "users" | "pricing" | "operations";
type AnalyticsPeriod = "7d" | "30d" | "90d" | "year";
type AnalyticsGroupBy = "day" | "week" | "month";

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
    creditsIssued: Array<{ date: string; label: string; value: number; count: number }>;
    paymentsCollected: Array<{ date: string; label: string; value: number; count: number }>;
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
    supplierPhone: string;
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
  phoneNumber: string | null;
  location: string;
  profileComplete: boolean;
  status: "active" | "pending_profile";
  lastSeenAt: string;
  sessionCount: number;
  createdAt: string;
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

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "analytics", label: "Analytics" },
  { id: "users", label: "Users" },
  { id: "pricing", label: "Price Control" },
  { id: "operations", label: "Operations" },
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

const emptyPriceForm = {
  name: "",
  scope: "GLOBAL",
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
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

function numberOrNull(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function scoreDeltaText(value: number | null) {
  if (value === null) {
    return "No prior score";
  }

  if (value === 0) {
    return "No score change";
  }

  return `${value > 0 ? "+" : ""}${value} score points`;
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
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-3 text-2xl font-bold text-gray-950">{value}</p>
      <span
        className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
      >
        {detail}
      </span>
    </section>
  );
}

function StatusPill({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "gray" | "blue" | "emerald" | "amber" | "red";
}) {
  const tones = {
    gray: "border-gray-200 bg-gray-50 text-gray-600",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-gray-950">{title}</h2>
      {action}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
            value === option.id
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-600 hover:text-blue-700"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TimeSeriesBarChart({
  rows,
  mode = "number",
  emptyText,
  countLabel,
}: {
  rows: Array<{ date: string; label: string; value: number; count: number }>;
  mode?: "number" | "money" | "score";
  emptyText: string;
  countLabel: string;
}) {
  const max = Math.max(0, ...rows.map((row) => Number(row.value || 0)));

  if (max <= 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 text-center">
        <p className="text-sm text-gray-500">{emptyText}</p>
      </div>
    );
  }

  const valueText = (value: number) =>
    mode === "money"
      ? formatMoney(value)
      : mode === "score"
      ? `${formatNumber(value)}/100`
      : formatNumber(value);
  const labelStep = Math.max(1, Math.ceil(rows.length / 10));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>0</span>
        <span>{mode === "money" ? formatCompactMoney(max) : valueText(max)}</span>
      </div>
      <div className="flex h-40 items-end gap-2 border-b border-gray-100">
      {rows.map((row, index) => {
        const value = Number(row.value || 0);
        const height = value > 0 ? Math.max(8, (value / max) * 100) : 0;
        return (
          <div key={row.date} className="flex flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t bg-blue-600/80 transition-all"
              style={{ height: `${height}%` }}
              title={`${row.label}: ${valueText(value)} · ${row.count} ${countLabel}`}
            />
            <span className="hidden max-w-14 text-center text-[10px] leading-tight text-gray-400 sm:inline">
              {index % labelStep === 0 || index === rows.length - 1 ? row.label : ""}
            </span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function RiskTrendChart({
  rows,
  emptyText,
}: {
  rows: OverviewData["trends"]["riskScore"];
  emptyText: string;
}) {
  const scoredRows = rows.filter((row) => row.averageScore !== null);
  const hasChecks = rows.some((row) => row.checks > 0);

  if (!hasChecks) {
    return (
      <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 text-center">
        <p className="text-sm text-gray-500">{emptyText}</p>
      </div>
    );
  }

  const width = 360;
  const height = 150;
  const chartTop = 18;
  const chartBottom = 118;
  const xForIndex = (index: number) =>
    rows.length <= 1 ? width / 2 : 16 + (index / (rows.length - 1)) * (width - 32);
  const yForScore = (score: number) =>
    chartBottom - (Math.max(0, Math.min(100, score)) / 100) * (chartBottom - chartTop);
  const points = rows
    .map((row, index) =>
      row.averageScore === null
        ? null
        : `${xForIndex(index)},${yForScore(row.averageScore)}`
    )
    .filter(Boolean)
    .join(" ");
  const labelStep = Math.max(1, Math.ceil(rows.length / 10));

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
        <rect x="0" y="0" width={width} height={height} rx="12" fill="#f8fafc" />
        {[25, 50, 75, 100].map((score) => (
          <line
            key={score}
            x1="16"
            x2={width - 16}
            y1={yForScore(score)}
            y2={yForScore(score)}
            stroke="#e5e7eb"
            strokeDasharray="4 4"
          />
        ))}
        {points ? (
          <polyline
            points={points}
            fill="none"
            stroke="#2563eb"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ) : null}
        {rows.map((row, index) =>
          row.averageScore === null ? null : (
            <circle
              key={row.date}
              cx={xForIndex(index)}
              cy={yForScore(row.averageScore)}
              r="4"
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth="2"
            >
              <title>{`${row.label}: ${row.averageScore}/100 · ${row.checks} checks`}</title>
            </circle>
          )
        )}
        {rows.map((row, index) =>
          index % labelStep === 0 || index === rows.length - 1 ? (
            <text
              key={`${row.date}-label`}
              x={xForIndex(index)}
              y="140"
              textAnchor="middle"
              className="fill-gray-400 text-[9px]"
            >
              {row.label}
            </text>
          ) : null
        )}
      </svg>
      <div className="flex flex-wrap gap-2 text-xs">
        <StatusPill tone="emerald">
          Safe {rows.reduce((sum, row) => sum + row.safe, 0)}
        </StatusPill>
        <StatusPill tone="amber">
          Review {rows.reduce((sum, row) => sum + row.review, 0)}
        </StatusPill>
        <StatusPill tone="red">
          High risk {rows.reduce((sum, row) => sum + row.high, 0)}
        </StatusPill>
        <StatusPill tone="gray">
          No history {rows.reduce((sum, row) => sum + row.noHistory, 0)}
        </StatusPill>
      </div>
      {scoredRows.length === 0 ? (
        <p className="text-sm text-gray-500">
          Risk checks exist, but none had enough history for an average score.
        </p>
      ) : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-4 py-5 text-sm text-gray-500">{text}</p>;
}

export default function AdminPage() {
  const router = useRouter();
  const sessionResult = useSession();
  const session = sessionResult.data;
  const isPending = sessionResult.isPending;
  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>("30d");
  const [analyticsGroupBy, setAnalyticsGroupBy] = useState<AnalyticsGroupBy>("day");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [violations, setViolations] = useState<PriceViolation[]>([]);
  const [operations, setOperations] = useState<OperationsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [priceForm, setPriceForm] = useState(emptyPriceForm);
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
      const [overviewResponse, usersResponse, priceResponse, operationsResponse] =
        await Promise.all([
          fetch(
            `/api/admin/overview?period=${analyticsPeriod}&groupBy=${analyticsGroupBy}`
          ),
          fetch("/api/admin/users"),
          fetch("/api/admin/price-rules"),
          fetch("/api/admin/operations"),
        ]);

      if (
        overviewResponse.status === 403 ||
        usersResponse.status === 403 ||
        priceResponse.status === 403 ||
        operationsResponse.status === 403
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
      const priceData = priceResponse.ok
        ? ((await priceResponse.json()) as {
            rules: PriceRule[];
            violations: PriceViolation[];
          })
        : { rules: [], violations: [] };
      const operationsData = operationsResponse.ok
        ? ((await operationsResponse.json()) as OperationsData)
        : null;

      setOverview(overviewData);
      setUsers(usersData.items || []);
      setPriceRules(priceData.rules || []);
      setViolations(priceData.violations || []);
      setOperations(operationsData);
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
  }, [analyticsGroupBy, analyticsPeriod, isPending, session?.user?.id]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return users.filter((user) => {
      const roleMatches = roleFilter ? user.role === roleFilter : true;
      const searchMatches = term
        ? [
            user.email,
            user.name,
            user.businessName,
            user.phoneNumber,
            user.location,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(term)
        : true;
      return roleMatches && searchMatches;
    });
  }, [roleFilter, userSearch, users]);

  const updateUserRole = async (userId: string, role: UserRole) => {
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });

    if (!response.ok) {
      setError("Could not update user role.");
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

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-blue-700">Holwa Admin</p>
              <h1 className="text-2xl font-bold text-gray-950">
                Platform Control Center
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadAdmin()}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign out
              </button>
            </div>
          </div>

          <nav className="flex gap-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-blue-700 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error ? (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {activeTab === "analytics" && overview ? (
          <AnalyticsTab
            overview={overview}
            period={analyticsPeriod}
            groupBy={analyticsGroupBy}
            setPeriod={setAnalyticsPeriod}
            setGroupBy={setAnalyticsGroupBy}
          />
        ) : null}

        {activeTab === "users" ? (
          <UsersTab
            users={filteredUsers}
            userSearch={userSearch}
            roleFilter={roleFilter}
            setUserSearch={setUserSearch}
            setRoleFilter={setRoleFilter}
            updateUserRole={updateUserRole}
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
            toggleFeatureFlag={toggleFeatureFlag}
          />
        ) : null}
      </div>
    </main>
  );
}

function AnalyticsTab({
  overview,
  period,
  groupBy,
  setPeriod,
  setGroupBy,
}: {
  overview: OverviewData;
  period: AnalyticsPeriod;
  groupBy: AnalyticsGroupBy;
  setPeriod: (value: AnalyticsPeriod) => void;
  setGroupBy: (value: AnalyticsGroupBy) => void;
}) {
  const periodLabel =
    periodOptions.find((option) => option.id === period)?.label || "30 days";
  const groupLabel =
    groupOptions.find((option) => option.id === groupBy)?.label || "Daily";
  const riskScore = overview.kpis.periodAverageRiskScore;
  const riskTone =
    riskScore === null
      ? "blue"
      : riskScore >= 80
      ? "emerald"
      : riskScore >= 60
      ? "amber"
      : "red";
  const updatePeriod = (nextPeriod: AnalyticsPeriod) => {
    setPeriod(nextPeriod);
    setGroupBy(nextPeriod === "year" ? "month" : nextPeriod === "90d" ? "week" : "day");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">
              Analytics overview
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Showing {periodLabel.toLowerCase()} grouped {groupLabel.toLowerCase()}.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Current period starts {formatDate(overview.period.currentStart)}.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <SegmentedControl
              value={period}
              options={periodOptions}
              onChange={updatePeriod}
            />
            <SegmentedControl
              value={groupBy}
              options={groupOptions}
              onChange={setGroupBy}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Total users"
          value={formatNumber(overview.kpis.totalUsers)}
          detail={`${overview.kpis.activeBusinesses} businesses, ${overview.kpis.activeSuppliers} suppliers`}
          tone="blue"
        />
        <KpiCard
          label="Outstanding"
          value={formatMoney(overview.kpis.amountOutstanding)}
          detail={`${overview.kpis.overdueCount} overdue · ${formatMoney(
            overview.kpis.amountOverdue
          )}`}
          tone={overview.kpis.amountOverdue > 0 ? "amber" : "emerald"}
        />
        <KpiCard
          label="Credits issued"
          value={formatMoney(overview.kpis.periodCreditsIssuedAmount)}
          detail={`${formatNumber(
            overview.kpis.periodCreditsIssuedCount
          )} records · ${compareText(overview.comparisons.creditsIssuedAmountPct)}`}
          tone="blue"
        />
        <KpiCard
          label="Payments collected"
          value={formatMoney(overview.kpis.periodPaymentsCollected)}
          detail={`${formatNumber(
            overview.kpis.periodPaymentCount
          )} payments · ${compareText(overview.comparisons.paymentsCollectedPct)}`}
          tone="emerald"
        />
        <KpiCard
          label="Risk score"
          value={riskScore === null ? "No score" : `${riskScore}/100`}
          detail={`${formatNumber(overview.kpis.periodRiskChecks)} checks · ${scoreDeltaText(
            overview.comparisons.riskAverageScoreDelta
          )}`}
          tone={riskTone}
        />
        <KpiCard
          label="Supplier orders"
          value={formatNumber(overview.kpis.supplierOrderCount)}
          detail={formatMoney(overview.kpis.supplierOrderAmount)}
          tone="blue"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <SectionTitle
            title="Credits issued"
            action={
              <StatusPill tone="blue">
                {formatNumber(overview.kpis.periodCreditsIssuedCount)} records
              </StatusPill>
            }
          />
          <TimeSeriesBarChart
            rows={overview.trends.creditsIssued}
            mode="money"
            countLabel="records"
            emptyText="No goods/services credit was issued in this period."
          />
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <SectionTitle
            title="Payments collected"
            action={
              <StatusPill tone="emerald">
                {formatNumber(overview.kpis.periodPaymentCount)} payments
              </StatusPill>
            }
          />
          <TimeSeriesBarChart
            rows={overview.trends.paymentsCollected}
            mode="money"
            countLabel="payments"
            emptyText="No payments were collected in this period."
          />
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <SectionTitle
            title="Risk-score trend"
            action={
              <StatusPill tone={riskTone}>
                {formatNumber(overview.kpis.periodRiskChecks)} checks
              </StatusPill>
            }
          />
          <RiskTrendChart
            rows={overview.trends.riskScore}
            emptyText="No Holwa score checks were made in this period."
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Top customers by outstanding debt" />
          </div>
          <div className="divide-y divide-gray-100">
            {overview.topCustomers.length === 0 ? (
              <EmptyState text="No customer credit data yet." />
            ) : (
              overview.topCustomers.map((customer) => (
                <div
                  key={`${customer.phone}-${customer.name}`}
                  className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-semibold text-gray-950">{customer.name}</p>
                    <p className="text-sm text-gray-500">{customer.phone}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="font-semibold text-gray-950">
                      {formatMoney(customer.outstanding)}
                    </p>
                    <p className="text-sm text-gray-500">
                      Issued {formatMoney(customer.totalIssued)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Recent activity" />
          </div>
          <div className="divide-y divide-gray-100">
            {overview.recentActivity.length === 0 ? (
              <EmptyState text="No recent platform activity yet." />
            ) : (
              overview.recentActivity.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-950">{item.title}</p>
                      <p className="mt-1 text-sm text-gray-500">{item.body}</p>
                    </div>
                    <StatusPill
                      tone={
                        item.tone === "success"
                          ? "emerald"
                          : item.tone === "warning"
                          ? "amber"
                          : "blue"
                      }
                    >
                      {formatRelative(item.time)}
                    </StatusPill>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Top suppliers by order volume" />
          </div>
          <div className="divide-y divide-gray-100">
            {overview.topSuppliers.length === 0 ? (
              <EmptyState text="No supplier orders yet." />
            ) : (
              overview.topSuppliers.map((supplier) => (
                <div
                  key={supplier.supplierId}
                  className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-semibold text-gray-950">{supplier.name}</p>
                    <p className="text-sm text-gray-500">
                      {supplier.orders} orders
                    </p>
                  </div>
                  <p className="font-semibold text-gray-950 sm:text-right">
                    {formatMoney(supplier.volume)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Low-stock items" />
          </div>
          <div className="divide-y divide-gray-100">
            {overview.lowStockItems.length === 0 ? (
              <EmptyState text="No low-stock items." />
            ) : (
              overview.lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-semibold text-gray-950">{item.product}</p>
                    <p className="text-sm text-gray-500">
                      Supplier {item.supplierPhone || "unknown"}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <StatusPill tone={item.quantity < 5 ? "red" : "amber"}>
                      {item.quantity} left
                    </StatusPill>
                    <p className="mt-1 text-sm text-gray-500">
                      {formatMoney(item.sellingPrice)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function UsersTab({
  users,
  userSearch,
  roleFilter,
  setUserSearch,
  setRoleFilter,
  updateUserRole,
}: {
  users: AdminUser[];
  userSearch: string;
  roleFilter: string;
  setUserSearch: (value: string) => void;
  setRoleFilter: (value: string) => void;
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
}) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-gray-100 px-4 py-4 lg:grid-cols-[1fr_220px]">
        <div>
          <h2 className="text-base font-semibold text-gray-950">
            User management
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Search users, review profile readiness, and assign platform roles.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <input
            type="search"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Search users"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">All roles</option>
            {userRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {users.length === 0 ? (
          <EmptyState text="No users match this filter." />
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              className="grid gap-4 px-4 py-4 xl:grid-cols-[1.5fr_1fr_220px]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-950">
                    {user.businessName || user.name || user.email}
                  </p>
                  <StatusPill tone={user.profileComplete ? "emerald" : "amber"}>
                    {user.profileComplete ? "Active" : "Pending profile"}
                  </StatusPill>
                </div>
                <p className="mt-1 text-sm text-gray-500">{user.email}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {user.phoneNumber || "No phone"} · {user.location || "No location"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-500">
                <div>
                  <p className="text-xs uppercase text-gray-400">Last seen</p>
                  <p className="font-medium text-gray-950">
                    {formatRelative(user.lastSeenAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-400">Joined</p>
                  <p className="font-medium text-gray-950">
                    {formatDate(user.createdAt)}
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium uppercase text-gray-400">
                  Role
                </label>
                <select
                  value={user.role || ""}
                  onChange={(event) =>
                    void updateUserRole(user.id, event.target.value as UserRole)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="" disabled>
                    Choose role
                  </option>
                  {userRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
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
      <form
        onSubmit={createPriceRule}
        className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
      >
        <SectionTitle title="Create price rule" />
        <div className="space-y-3">
          <input
            value={priceForm.name}
            onChange={(event) =>
              setPriceForm({ ...priceForm, name: event.target.value })
            }
            placeholder="Rule name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={priceForm.scope}
              onChange={(event) =>
                setPriceForm({ ...priceForm, scope: event.target.value })
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="GLOBAL">Global</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="CATEGORY">Category/product</option>
            </select>
            <input
              value={priceForm.scopeValue}
              onChange={(event) =>
                setPriceForm({ ...priceForm, scopeValue: event.target.value })
              }
              placeholder="Scope value"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="number"
              value={priceForm.minMarkupPercent}
              onChange={(event) =>
                setPriceForm({
                  ...priceForm,
                  minMarkupPercent: event.target.value,
                })
              }
              placeholder="Min markup %"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <input
              type="number"
              value={priceForm.maxMarkupPercent}
              onChange={(event) =>
                setPriceForm({
                  ...priceForm,
                  maxMarkupPercent: event.target.value,
                })
              }
              placeholder="Max markup %"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="number"
              value={priceForm.minSellingPrice}
              onChange={(event) =>
                setPriceForm({
                  ...priceForm,
                  minSellingPrice: event.target.value,
                })
              }
              placeholder="Min price"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <input
              type="number"
              value={priceForm.maxSellingPrice}
              onChange={(event) =>
                setPriceForm({
                  ...priceForm,
                  maxSellingPrice: event.target.value,
                })
              }
              placeholder="Max price"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <textarea
            value={priceForm.notes}
            onChange={(event) =>
              setPriceForm({ ...priceForm, notes: event.target.value })
            }
            placeholder="Notes"
            className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Save rule
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Active price rules" />
          </div>
          <div className="divide-y divide-gray-100">
            {priceRules.length === 0 ? (
              <EmptyState text="No price rules configured." />
            ) : (
              priceRules.map((rule) => (
                <div
                  key={rule.id}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-950">{rule.name}</p>
                      <StatusPill tone={rule.status === "ACTIVE" ? "emerald" : "gray"}>
                        {rule.status}
                      </StatusPill>
                      <StatusPill tone="blue">{rule.scope}</StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {rule.scopeValue || "All stock"} · Markup{" "}
                      {rule.minMarkupPercent || "any"}% to{" "}
                      {rule.maxMarkupPercent || "any"}% · Price{" "}
                      {rule.minSellingPrice
                        ? formatMoney(rule.minSellingPrice)
                        : "any"}{" "}
                      to{" "}
                      {rule.maxSellingPrice
                        ? formatMoney(rule.maxSellingPrice)
                        : "any"}
                    </p>
                    {rule.notes ? (
                      <p className="mt-1 text-sm text-gray-500">{rule.notes}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void togglePriceRule(rule)}
                    className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {rule.status === "ACTIVE" ? "Pause" : "Activate"}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Price rule violations" />
          </div>
          <div className="divide-y divide-gray-100">
            {violations.every((rule) => rule.violations.length === 0) ? (
              <EmptyState text="No price violations found." />
            ) : (
              violations
                .filter((rule) => rule.violations.length > 0)
                .map((rule) => (
                  <div key={rule.ruleId} className="px-4 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="font-semibold text-gray-950">{rule.ruleName}</p>
                      <StatusPill tone="amber">
                        {rule.violations.length} issues
                      </StatusPill>
                    </div>
                    <div className="space-y-2">
                      {rule.violations.map((violation) => (
                        <div
                          key={violation.stockItemId}
                          className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm"
                        >
                          <p className="font-semibold text-amber-950">
                            {violation.product}
                          </p>
                          <p className="mt-1 text-amber-800">{violation.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
            )}
          </div>
        </section>
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
  toggleFeatureFlag,
}: {
  operations: OperationsData | null;
  announcementForm: { title: string; body: string; audience: string };
  setAnnouncementForm: (value: { title: string; body: string; audience: string }) => void;
  createAnnouncement: (event: FormEvent) => Promise<void>;
  flagForm: { key: string; name: string; description: string; enabled: boolean };
  setFlagForm: (value: {
    key: string;
    name: string;
    description: string;
    enabled: boolean;
  }) => void;
  createFeatureFlag: (event: FormEvent) => Promise<void>;
  toggleAnnouncement: (id: string, active: boolean) => Promise<void>;
  toggleFeatureFlag: (id: string, enabled: boolean) => Promise<void>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <form
          onSubmit={createAnnouncement}
          className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <SectionTitle title="System announcement" />
          <div className="space-y-3">
            <input
              value={announcementForm.title}
              onChange={(event) =>
                setAnnouncementForm({
                  ...announcementForm,
                  title: event.target.value,
                })
              }
              placeholder="Title"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
            <textarea
              value={announcementForm.body}
              onChange={(event) =>
                setAnnouncementForm({
                  ...announcementForm,
                  body: event.target.value,
                })
              }
              placeholder="Message"
              className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
            <select
              value={announcementForm.audience}
              onChange={(event) =>
                setAnnouncementForm({
                  ...announcementForm,
                  audience: event.target.value,
                })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">All users</option>
              {userRoles
                .filter((role) => role !== "ADMIN")
                .map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Publish announcement
            </button>
          </div>
        </form>

        <form
          onSubmit={createFeatureFlag}
          className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <SectionTitle title="Feature flag" />
          <div className="space-y-3">
            <input
              value={flagForm.key}
              onChange={(event) =>
                setFlagForm({ ...flagForm, key: event.target.value })
              }
              placeholder="feature_key"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
            <input
              value={flagForm.name}
              onChange={(event) =>
                setFlagForm({ ...flagForm, name: event.target.value })
              }
              placeholder="Feature name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
            <textarea
              value={flagForm.description}
              onChange={(event) =>
                setFlagForm({ ...flagForm, description: event.target.value })
              }
              placeholder="Description"
              className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={flagForm.enabled}
                onChange={(event) =>
                  setFlagForm({ ...flagForm, enabled: event.target.checked })
                }
              />
              Enabled
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Save flag
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Announcements" />
          </div>
          <div className="divide-y divide-gray-100">
            {!operations?.announcements.length ? (
              <EmptyState text="No announcements yet." />
            ) : (
              operations.announcements.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-950">{item.title}</p>
                      <StatusPill tone={item.active ? "emerald" : "gray"}>
                        {item.active ? "Active" : "Paused"}
                      </StatusPill>
                      <StatusPill tone="blue">
                        {item.audience ? roleLabels[item.audience] : "All users"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{item.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleAnnouncement(item.id, !item.active)}
                    className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {item.active ? "Pause" : "Activate"}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Feature flags" />
          </div>
          <div className="divide-y divide-gray-100">
            {!operations?.featureFlags.length ? (
              <EmptyState text="No feature flags yet." />
            ) : (
              operations.featureFlags.map((flag) => (
                <div
                  key={flag.id}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-950">{flag.name}</p>
                      <StatusPill tone={flag.enabled ? "emerald" : "gray"}>
                        {flag.enabled ? "Enabled" : "Disabled"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{flag.key}</p>
                    {flag.description ? (
                      <p className="mt-1 text-sm text-gray-500">
                        {flag.description}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleFeatureFlag(flag.id, !flag.enabled)}
                    className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {flag.enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <SectionTitle title="Audit trail" />
          </div>
          <div className="divide-y divide-gray-100">
            {!operations?.auditLogs.length ? (
              <EmptyState text="No admin actions logged yet." />
            ) : (
              operations.auditLogs.map((log) => (
                <div key={log.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-950">{log.action}</p>
                      <p className="mt-1 text-sm text-gray-500">{log.summary}</p>
                    </div>
                    <StatusPill>{formatRelative(log.createdAt)}</StatusPill>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
