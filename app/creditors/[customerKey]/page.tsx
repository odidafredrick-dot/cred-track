"use client";

import { hasPendingAuthRedirect, useSession } from "@/lib/auth-client";
import { normalizePhoneNumber } from "@/lib/phone";
import type { RiskLevel } from "@/lib/risk-score";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type CreditItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type CreditPayment = {
  id: string;
  amount: number;
  note?: string | null;
  createdAt: string;
};

type CustomerInfo = {
  id: string;
  name: string;
  phone: string;
};

type CreditRecord = {
  id: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  status: "PENDING" | "DUE" | "OVERDUE" | "PARTIALLY_PAID" | "PAID";
  createdAt: string;
  customer?: CustomerInfo;
  items: CreditItem[];
  payments?: CreditPayment[];
};

type CustomerCreditGroup = {
  key: string;
  name: string;
  phone: string;
  credits: CreditRecord[];
  unpaidCredits: CreditRecord[];
  totalUnpaid: number;
  earliestDueDate: string | null;
  status: CreditRecord["status"];
};

type RiskScoreResult = {
  requestedPhone?: string;
  phone: string;
  score: number | null;
  riskLevel: RiskLevel;
  riskLabel: string;
  recommendation: string;
  suggestedLimit: number;
  checkedAt: string;
  hasHistory: boolean;
  error?: string;
};

type DetailSection = "records" | "payments" | "items";

const statusLabels: Record<CreditRecord["status"], string> = {
  PENDING: "Pending",
  DUE: "Due",
  OVERDUE: "Overdue",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString();
}

function normalizePhone(value: string) {
  return normalizePhoneNumber(value);
}

function amountOwed(record: CreditRecord) {
  return Number(record.totalAmount) - Number(record.amountPaid);
}

function isUnpaid(record: CreditRecord) {
  return record.status !== "PAID" && amountOwed(record) > 0;
}

function totalItemQuantity(items: Array<{ quantity: number }>) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function getCustomerKey(record: CreditRecord) {
  return (
    record.customer?.id ||
    record.customerId ||
    normalizePhone(record.customerPhone) ||
    record.customerName.trim().toLowerCase()
  );
}

function getGroupStatus(records: CreditRecord[]): CreditRecord["status"] {
  if (!records.length) {
    return "PAID";
  }
  if (records.some((record) => record.status === "OVERDUE")) {
    return "OVERDUE";
  }
  if (records.some((record) => record.status === "DUE")) {
    return "DUE";
  }
  if (records.some((record) => record.status === "PARTIALLY_PAID")) {
    return "PARTIALLY_PAID";
  }
  return "PENDING";
}

function buildCustomerGroup(records: CreditRecord[], customerKey: string) {
  const matchingCredits = records.filter(
    (record) => getCustomerKey(record) === customerKey
  );

  if (!matchingCredits.length) {
    return null;
  }

  const firstRecord = matchingCredits[0];
  const unpaidCredits = matchingCredits.filter(isUnpaid);
  const earliestDueDate = unpaidCredits.reduce<string | null>((earliest, record) => {
    if (!earliest || new Date(record.dueDate) < new Date(earliest)) {
      return record.dueDate;
    }
    return earliest;
  }, null);

  return {
    key: customerKey,
    name: firstRecord.customer?.name || firstRecord.customerName,
    phone: firstRecord.customer?.phone || firstRecord.customerPhone,
    credits: matchingCredits,
    unpaidCredits,
    totalUnpaid: unpaidCredits.reduce(
      (sum, record) => sum + amountOwed(record),
      0
    ),
    earliestDueDate,
    status: getGroupStatus(unpaidCredits),
  } satisfies CustomerCreditGroup;
}

function getRiskTone(riskLevel: RiskLevel) {
  if (riskLevel === "EXCELLENT" || riskLevel === "LOW_RISK") {
    return {
      badge: "border-emerald-100 bg-emerald-50 text-emerald-700",
      card: "border-emerald-100 bg-emerald-50 text-emerald-900",
    };
  }

  if (riskLevel === "MODERATE_RISK" || riskLevel === "LIMITED_HISTORY") {
    return {
      badge: "border-amber-100 bg-amber-50 text-amber-700",
      card: "border-amber-100 bg-amber-50 text-amber-900",
    };
  }

  if (riskLevel === "NO_HISTORY") {
    return {
      badge: "border-gray-200 bg-gray-50 text-gray-600",
      card: "border-gray-100 bg-gray-50 text-gray-800",
    };
  }

  return {
    badge: "border-red-100 bg-red-50 text-red-700",
    card: "border-red-100 bg-red-50 text-red-900",
  };
}

function RiskSummaryCard({
  result,
  isLoading,
}: {
  result: RiskScoreResult | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-blue-900">
        <p className="text-xs font-semibold uppercase">Holwa Trade Score</p>
        <p className="mt-2 text-sm">Checking debtor score...</p>
      </section>
    );
  }

  if (!result || result.error) {
    return (
      <section className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-gray-800">
        <p className="text-xs font-semibold uppercase">Holwa Trade Score</p>
        <p className="mt-3 text-2xl font-semibold">No score</p>
        <p className="mt-1 text-sm">
          No Holwa trade score is available for this debtor yet.
        </p>
      </section>
    );
  }

  const tone = getRiskTone(result.riskLevel);
  const scoreText = result.score === null ? "No score" : `${result.score}/100`;

  return (
    <section className={`rounded-xl border p-4 ${tone.card}`}>
      <p className="text-xs font-semibold uppercase">Holwa Trade Score</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-3xl font-semibold">{scoreText}</p>
          <p className="mt-1 text-sm font-semibold">{result.riskLabel}</p>
        </div>
        <p className="text-sm font-medium sm:max-w-sm sm:text-right">
          {result.recommendation}
        </p>
      </div>
    </section>
  );
}

function SectionButton({
  title,
  body,
  meta,
  active,
  onClick,
}: {
  title: string;
  body: string;
  meta: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
        active
          ? "border-blue-300 ring-2 ring-blue-100"
          : "border-gray-100 hover:border-blue-200 hover:bg-blue-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-950">{title}</h3>
          <p className="mt-1 text-sm text-gray-500">{body}</p>
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
          {meta}
        </span>
      </div>
    </button>
  );
}

export default function CreditorDetailPage() {
  const router = useRouter();
  const params = useParams<{ customerKey: string }>();
  const sessionResult = useSession();
  const session = sessionResult.data;
  const isPending = sessionResult.isPending;
  const [credits, setCredits] = useState<CreditRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "warning";
  } | null>(null);
  const [activeSection, setActiveSection] = useState<DetailSection | null>(null);
  const [riskResult, setRiskResult] = useState<RiskScoreResult | null>(null);
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [paymentRecordId, setPaymentRecordId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);

  const customerKey = useMemo(() => {
    try {
      return decodeURIComponent(params.customerKey || "");
    } catch {
      return params.customerKey || "";
    }
  }, [params.customerKey]);

  const group = useMemo(
    () => buildCustomerGroup(credits, customerKey),
    [credits, customerKey]
  );

  const unpaidItemRows = useMemo(() => {
    if (!group) {
      return [];
    }

    return group.unpaidCredits.flatMap((record) =>
      record.items.map((item) => ({
        ...item,
        creditId: record.id,
        dueDate: record.dueDate,
      }))
    );
  }, [group]);

  const paymentRows = useMemo(() => {
    if (!group) {
      return [];
    }

    return group.credits
      .flatMap((record) =>
        (record.payments || []).map((payment) => ({
          ...payment,
          creditId: record.id,
          dueDate: record.dueDate,
          totalAmount: record.totalAmount,
        }))
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [group]);

  const loadCredits = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/credits?userId=${session.user.id}`);
      if (!response.ok) {
        throw new Error("Failed to load creditor details.");
      }

      const data = (await response.json()) as { credits?: CreditRecord[] };
      setCredits(data.credits || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load creditor details."
      );
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!isPending && !session) {
      if (hasPendingAuthRedirect()) {
        return;
      }
      router.push("/");
    }
  }, [isPending, router, session]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  useEffect(() => {
    if (!group?.phone || !session?.user?.id) {
      return;
    }

    let isActive = true;

    const loadRiskScore = async () => {
      setIsRiskLoading(true);
      setRiskResult(null);

      try {
        const response = await fetch("/api/risk-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: session.user.id,
            phone: group.phone,
            saveCheck: false,
          }),
        });

        const data = (await response.json()) as {
          score?: RiskScoreResult;
          error?: string;
        };

        if (!isActive) {
          return;
        }

        if (!response.ok || !data.score) {
          setRiskResult({
            phone: group.phone,
            score: null,
            riskLevel: "NO_HISTORY",
            riskLabel: "No History",
            recommendation:
              data.error || "No Holwa trade score is available for this debtor yet.",
            suggestedLimit: 0,
            checkedAt: new Date().toISOString(),
            hasHistory: false,
          });
          return;
        }

        setRiskResult(data.score);
      } finally {
        if (isActive) {
          setIsRiskLoading(false);
        }
      }
    };

    void loadRiskScore();

    return () => {
      isActive = false;
    };
  }, [group?.phone, session?.user?.id]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleStatusChange = async (
    recordId: string,
    status: CreditRecord["status"]
  ) => {
    const response = await fetch(`/api/credits/${recordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    const data = (await response.json()) as {
      credit?: CreditRecord;
      error?: string;
    };

    if (!response.ok || !data.credit) {
      setToast({
        message: data.error || "Failed to update credit record.",
        variant: "warning",
      });
      return;
    }

    setCredits((prev) =>
      prev.map((record) => (record.id === recordId ? data.credit! : record))
    );
    setToast({ message: "Credit record updated.", variant: "success" });
  };

  const handleRemind = async (recordId: string) => {
    if (!session?.user?.id) {
      return;
    }

    const response = await fetch("/api/reminders/send-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.user.id, creditId: recordId }),
    });

    const data = (await response.json()) as { error?: string };

    setToast({
      message: response.ok
        ? "Reminder sent."
        : data.error || "Failed to send reminder.",
      variant: response.ok ? "success" : "warning",
    });
  };

  const handleDeleteCredit = async (recordId: string) => {
    if (!window.confirm("Delete this credit record?")) {
      return;
    }

    const response = await fetch(`/api/credits/${recordId}`, {
      method: "DELETE",
    });

    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok) {
      setToast({
        message: data.error || "Failed to delete credit record.",
        variant: "warning",
      });
      return;
    }

    setCredits((prev) => prev.filter((record) => record.id !== recordId));
    setToast({ message: "Credit record deleted.", variant: "success" });

    if (group && group.credits.length <= 1) {
      router.push("/dashboard");
    }
  };

  const openPaymentForm = (record: CreditRecord) => {
    setActiveSection("records");
    setPaymentRecordId(record.id);
    setPaymentAmount("");
    setPaymentNote("");
    setPaymentError("");
  };

  const handleRecordPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!paymentRecordId) {
      return;
    }

    const amount = Number(paymentAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a payment amount greater than zero.");
      return;
    }

    setIsPaymentSubmitting(true);
    setPaymentError("");

    try {
      const response = await fetch(`/api/credits/${paymentRecordId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          note: paymentNote,
        }),
      });

      const data = (await response.json()) as {
        credit?: CreditRecord;
        error?: string;
      };

      if (!response.ok || !data.credit) {
        setPaymentError(data.error || "Failed to record payment.");
        return;
      }

      setCredits((prev) =>
        prev.map((record) =>
          record.id === data.credit!.id ? data.credit! : record
        )
      );
      setPaymentRecordId(null);
      setPaymentAmount("");
      setPaymentNote("");
      setToast({ message: "Payment recorded.", variant: "success" });
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  if (isPending || isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-5xl text-sm text-gray-500">
          Loading creditor details...
        </div>
      </main>
    );
  }

  if (error || !group) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
          {error || "Creditor details not found."}
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-4 block rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white"
          >
            Back to dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            Dashboard
          </button>
        </div>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-blue-700">Creditor details</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-950">{group.name}</h1>
              <p className="mt-1 text-sm text-gray-500">{group.phone}</p>
            </div>
            {riskResult && !riskResult.error ? (
              <span
                className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${
                  getRiskTone(riskResult.riskLevel).badge
                }`}
              >
                {riskResult.score === null ? "No score" : `${riskResult.score}/100`}{" "}
                {riskResult.riskLabel}
              </span>
            ) : null}
          </div>
        </section>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Total unpaid</p>
            <p className="mt-2 text-xl font-semibold text-gray-950">
              {formatMoney(group.totalUnpaid)}
            </p>
          </section>
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Open credits</p>
            <p className="mt-2 text-xl font-semibold text-gray-950">
              {group.unpaidCredits.length}
            </p>
          </section>
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Earliest due</p>
            <p className="mt-2 text-xl font-semibold text-gray-950">
              {group.earliestDueDate ? formatDate(group.earliestDueDate) : "None"}
            </p>
          </section>
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Status</p>
            <p className="mt-2 text-xl font-semibold text-gray-950">
              {statusLabels[group.status]}
            </p>
          </section>
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Unpaid items</p>
            <p className="mt-2 text-xl font-semibold text-gray-950">
              {totalItemQuantity(unpaidItemRows)}
            </p>
          </section>
        </div>

        <div className="mt-5">
          <RiskSummaryCard result={riskResult} isLoading={isRiskLoading} />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <SectionButton
            title="Update credit records"
            body="Change status, record payment, send reminder, or delete a credit."
            meta={`${group.credits.length}`}
            active={activeSection === "records"}
            onClick={() =>
              setActiveSection(activeSection === "records" ? null : "records")
            }
          />
          <SectionButton
            title="Payment history"
            body="Review all payments made by this debtor."
            meta={`${paymentRows.length}`}
            active={activeSection === "payments"}
            onClick={() =>
              setActiveSection(activeSection === "payments" ? null : "payments")
            }
          />
          <SectionButton
            title="Unpaid items"
            body="See goods and services still unpaid."
            meta={`${totalItemQuantity(unpaidItemRows)}`}
            active={activeSection === "items"}
            onClick={() =>
              setActiveSection(activeSection === "items" ? null : "items")
            }
          />
        </div>

        {!activeSection ? (
          <p className="mt-5 rounded-xl border border-gray-100 bg-white px-4 py-5 text-sm text-gray-500 shadow-sm">
            Choose an action above to open that section.
          </p>
        ) : null}

        {activeSection === "items" ? (
          <section className="mt-5 rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-950">Unpaid items</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {unpaidItemRows.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-500">
                  No unpaid items.
                </p>
              ) : (
                unpaidItemRows.map((item) => (
                  <div
                    key={`${item.creditId}-${item.id}`}
                    className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-gray-950">{item.name}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {item.quantity} x {formatMoney(Number(item.unitPrice))} ·
                        due {formatDate(item.dueDate)}
                      </p>
                    </div>
                    <p className="font-semibold text-gray-950">
                      {formatMoney(Number(item.total))}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {activeSection === "payments" ? (
          <section className="mt-5 rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-950">
                Payment history
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {paymentRows.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-500">
                  No payments recorded yet.
                </p>
              ) : (
                paymentRows.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-gray-950">
                        {formatMoney(Number(payment.amount))}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {formatDate(payment.createdAt)}
                        {payment.note ? ` · ${payment.note}` : ""}
                      </p>
                    </div>
                    <p className="text-sm text-gray-500">
                      Credit due {formatDate(payment.dueDate)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {activeSection === "records" ? (
          <section className="mt-5 rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-950">
                Update credit records
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {group.credits.map((record) => {
                const balance = Math.max(0, amountOwed(record));
                const isPaymentFormOpen = paymentRecordId === record.id;

                return (
                  <div key={record.id} className="space-y-4 px-5 py-5">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                      <div>
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="font-medium text-gray-950">
                          {formatMoney(Number(record.totalAmount))}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Paid</p>
                        <p className="font-medium text-gray-950">
                          {formatMoney(Number(record.amountPaid))}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Balance</p>
                        <p className="font-medium text-gray-950">
                          {formatMoney(balance)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Due date</p>
                        <p className="font-medium text-gray-950">
                          {formatDate(record.dueDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Items</p>
                        <p className="font-medium text-gray-950">
                          {totalItemQuantity(record.items)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Created</p>
                        <p className="font-medium text-gray-950">
                          {formatDate(record.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <select
                        value={record.status}
                        onChange={(event) =>
                          void handleStatusChange(
                            record.id,
                            event.target.value as CreditRecord["status"]
                          )
                        }
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openPaymentForm(record)}
                          disabled={!isUnpaid(record)}
                          className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Record payment
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemind(record.id)}
                          disabled={!isUnpaid(record)}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remind
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCredit(record.id)}
                          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {isPaymentFormOpen ? (
                      <form
                        className="rounded-xl border border-blue-100 bg-blue-50 p-4"
                        onSubmit={handleRecordPayment}
                      >
                        <h3 className="font-semibold text-gray-950">
                          Record payment
                        </h3>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">
                              Amount received
                            </label>
                            <input
                              type="number"
                              min="1"
                              max={Math.max(1, balance)}
                              step="0.01"
                              value={paymentAmount}
                              onChange={(event) =>
                                setPaymentAmount(event.target.value)
                              }
                              placeholder="KES"
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">
                              Note
                            </label>
                            <input
                              type="text"
                              value={paymentNote}
                              onChange={(event) => setPaymentNote(event.target.value)}
                              placeholder="Optional"
                              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </div>
                        </div>
                        {paymentError ? (
                          <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {paymentError}
                          </div>
                        ) : null}
                        <div className="mt-4 flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setPaymentRecordId(null)}
                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isPaymentSubmitting}
                            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-200"
                          >
                            {isPaymentSubmitting ? "Saving..." : "Save payment"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      {toast ? (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm px-4 sm:px-0">
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
              toast.variant === "success"
                ? "bg-emerald-600 text-white"
                : "bg-amber-500 text-white"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </main>
  );
}
