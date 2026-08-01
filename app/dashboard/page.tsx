"use client";

import { hasPendingAuthRedirect, useSession, signOut } from "@/lib/auth-client";
import {
  AuthLoadingScreen,
  InlineListSkeleton,
} from "@/components/loading-states";
import {
  getUnpaidItemRowsForCredit,
  totalItemQuantity,
  type UnpaidCreditItemRow,
} from "@/lib/credit-items";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { normalizePhoneNumber } from "@/lib/phone";
import type { RiskLevel } from "@/lib/risk-score";
import {
  isUserRole,
  needsBusinessProfile,
  paymentModeLabels,
  paymentModes,
  roleLabels,
  type PaymentMode,
  type UserRole,
} from "@/lib/user-profile";

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

type CreditItemDraft = {
  id: string;
  name: string;
  quantity: string;
  unitPrice: string;
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
  unpaidItems: UnpaidCreditItemRow<CreditItem>[];
  totalUnpaid: number;
  earliestDueDate: string | null;
  status: CreditRecord["status"];
};

type StockItem = {
  id: string;
  product: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  supplierPhone: string;
  offers?: string | null;
  createdAt: string;
};

type UserProfile = {
  id: string;
  userId: string;
  role: UserRole;
  businessName: string | null;
  county: string | null;
  town: string | null;
  estate: string | null;
  phoneNumber: string | null;
  paymentMode: PaymentMode | null;
  description: string | null;
};

type ProfileForm = {
  businessName: string;
  county: string;
  town: string;
  estate: string;
  phoneNumber: string;
  paymentMode: PaymentMode | "";
  description: string;
};

type InboxItem = {
  id: string;
  title: string;
  body: string;
  variant: "info" | "warning";
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

type MobileTab = "analytics" | "creditors" | "network" | "inbox" | "profile";

type SupplierProfile = UserProfile;

type SupplierCustomerStockItem = {
  id: string;
  product: string;
  quantity: number;
  sellingPrice: number;
  status: string;
  isLow: boolean;
};

type SupplierCustomer = {
  profile: UserProfile;
  lastOrderAt: string | null;
  orderedProducts: string[];
  stockItems: SupplierCustomerStockItem[];
};

type TopupStage =
  | "idle"
  | "sending"
  | "waiting"
  | "success"
  | "failed"
  | "cancelled"
  | "timeout";

type TopupTone = "info" | "success" | "warning" | "error";

type TopupStatusState = {
  stage: TopupStage;
  tone: TopupTone;
  title: string;
  message: string;
  topupId?: string;
};

type TopupStatusResponse = {
  displayStatus: "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "TIMEOUT";
  message?: string;
  balance?: number;
  creditsAdded?: number;
};

const today = new Date();
const selectedRoleStorageKey = "holwa:selected-role";
const emptyProfileForm: ProfileForm = {
  businessName: "",
  county: "",
  town: "",
  estate: "",
  phoneNumber: "",
  paymentMode: "",
  description: "",
};
const initialTopupStatus: TopupStatusState = {
  stage: "idle",
  tone: "info",
  title: "Reminder credits",
  message: "Each Ksh 1 adds 1 reminder credit.",
};
const topupToneClasses: Record<TopupTone, string> = {
  info: "border-blue-100 bg-blue-50 text-blue-800",
  success: "border-emerald-100 bg-emerald-50 text-emerald-800",
  warning: "border-amber-100 bg-amber-50 text-amber-800",
  error: "border-red-100 bg-red-50 text-red-700",
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

function isReminder(dueDate: string, status: CreditRecord["status"]) {
  if (status === "PAID") {
    return false;
  }
  const due = new Date(dueDate);
  const diffDays = Math.ceil(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diffDays <= 7;
}

const statusLabels: Record<CreditRecord["status"], string> = {
  PENDING: "Pending",
  DUE: "Due",
  OVERDUE: "Overdue",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
};

function normalizePhone(value: string) {
  return normalizePhoneNumber(value);
}

function getRiskTone(riskLevel: RiskLevel) {
  if (riskLevel === "EXCELLENT" || riskLevel === "LOW_RISK") {
    return {
      badge: "bg-emerald-50 text-emerald-700 border-emerald-100",
      card: "border-emerald-100 bg-emerald-50 text-emerald-900",
    };
  }

  if (riskLevel === "MODERATE_RISK" || riskLevel === "LIMITED_HISTORY") {
    return {
      badge: "bg-amber-50 text-amber-700 border-amber-100",
      card: "border-amber-100 bg-amber-50 text-amber-900",
    };
  }

  if (riskLevel === "NO_HISTORY") {
    return {
      badge: "bg-gray-50 text-gray-600 border-gray-200",
      card: "border-gray-100 bg-gray-50 text-gray-800",
    };
  }

  return {
    badge: "bg-red-50 text-red-700 border-red-100",
    card: "border-red-100 bg-red-50 text-red-900",
  };
}

function RiskBadge({ result }: { result?: RiskScoreResult }) {
  if (!result || result.error) {
    return null;
  }

  const tone = getRiskTone(result.riskLevel);
  const scoreText = result.score === null ? "No score" : `${result.score}/100`;

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.badge}`}
    >
      {scoreText} {result.riskLabel}
    </span>
  );
}

function RiskSummaryCard({ result }: { result: RiskScoreResult }) {
  const tone = getRiskTone(result.riskLevel);
  const scoreText = result.score === null ? "No score" : `${result.score}/100`;

  return (
    <div className={`rounded-lg border p-4 ${tone.card}`}>
      <p className="text-xs font-semibold uppercase">
        Holwa Trade Score
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-3xl font-semibold">{scoreText}</p>
          <p className="mt-1 text-sm font-semibold">{result.riskLabel}</p>
        </div>
        <div className="sm:max-w-xs sm:text-right">
          <p className="text-sm font-medium">{result.recommendation}</p>
        </div>
      </div>
    </div>
  );
}

function amountOwed(record: CreditRecord) {
  return Number(record.totalAmount) - Number(record.amountPaid);
}

function isUnpaid(record: CreditRecord) {
  return record.status !== "PAID" && amountOwed(record) > 0;
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

function MobileTabIcon({ tab }: { tab: MobileTab }) {
  const common = {
    className: "h-5 w-5",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (tab === "analytics") {
    return (
      <svg {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 16V9" />
        <path d="M12 16V7" />
        <path d="M16 16v-5" />
      </svg>
    );
  }

  if (tab === "creditors") {
    return (
      <svg {...common}>
        <path d="M8 6h12" />
        <path d="M8 12h12" />
        <path d="M8 18h12" />
        <path d="M4 6h.01" />
        <path d="M4 12h.01" />
        <path d="M4 18h.01" />
      </svg>
    );
  }

  if (tab === "network") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (tab === "inbox") {
    return (
      <svg {...common}>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 1 0-16 0" />
    </svg>
  );
}

function toProfileForm(profile: UserProfile): ProfileForm {
  return {
    businessName: profile.businessName || "",
    county: profile.county || "",
    town: profile.town || "",
    estate: profile.estate || "",
    phoneNumber: profile.phoneNumber || "",
    paymentMode: profile.paymentMode || "",
    description: profile.description || "",
  };
}

function hasBusinessProfileDetails(profile: UserProfile) {
  if (!needsBusinessProfile(profile.role)) {
    return true;
  }

  return Boolean(
    profile.businessName &&
    profile.county &&
    profile.town &&
    profile.estate &&
    profile.phoneNumber &&
    profile.paymentMode &&
    profile.description
  );
}

export default function DashboardPage() {
  const sessionResult = useSession();
  const router = useRouter();
  const session = sessionResult.data;
  const isPending = sessionResult.isPending;
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reminderBalance, setReminderBalance] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "warning";
  } | null>(null);
  const [credits, setCredits] = useState<CreditRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [riskScoresByPhone, setRiskScoresByPhone] = useState<
    Record<string, RiskScoreResult>
  >({});
  const [isRiskDialogOpen, setIsRiskDialogOpen] = useState(false);
  const [riskPhone, setRiskPhone] = useState("");
  const [riskResult, setRiskResult] = useState<RiskScoreResult | null>(null);
  const [riskError, setRiskError] = useState("");
  const [isRiskChecking, setIsRiskChecking] = useState(false);
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const [topupPhone, setTopupPhone] = useState("");
  const [topupAmount, setTopupAmount] = useState("1");
  const [isTopupSubmitting, setIsTopupSubmitting] = useState(false);
  const [topupStatus, setTopupStatus] =
    useState<TopupStatusState>(initialTopupStatus);
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
  const [isStockSubmitting, setIsStockSubmitting] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockReduceAmounts, setStockReduceAmounts] = useState<
    Record<string, string>
  >({});
  const [paymentCredit, setPaymentCredit] = useState<CreditRecord | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [stockEditingItem, setStockEditingItem] = useState<StockItem | null>(
    null
  );
  const [stockForm, setStockForm] = useState({
    product: "",
    buyingPrice: "",
    sellingPrice: "",
    quantity: "",
    supplierPhone: "",
    offers: "",
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [pendingProfileRole, setPendingProfileRole] =
    useState<UserRole | null>(null);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isProfileSubmitting, setIsProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileForm, setProfileForm] =
    useState<ProfileForm>(emptyProfileForm);
  const [systemAnnouncements, setSystemAnnouncements] = useState<InboxItem[]>([]);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] =
    useState<MobileTab>("analytics");
  const [isSuppliersDrawerOpen, setIsSuppliersDrawerOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>([]);
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(false);
  const [isCustomersDrawerOpen, setIsCustomersDrawerOpen] = useState(false);
  const [supplierCustomers, setSupplierCustomers] = useState<
    SupplierCustomer[]
  >([]);
  const [isCustomersLoading, setIsCustomersLoading] = useState(false);
  const [restockRequestIds, setRestockRequestIds] = useState<
    Record<string, boolean>
  >({});
  const [formState, setFormState] = useState({
    customerName: "",
    customerPhone: "",
    dueDate: "",
    amountPaid: "",
    items: [{ id: crypto.randomUUID(), name: "", quantity: "", unitPrice: "" }],
  });
  const isSupplierDashboard = userProfile?.role === "SUPPLIER";
  const isBusinessDashboard = userProfile?.role === "BUSINESS";
  const profileImage =
    session?.user && "image" in session.user ? session.user.image : null;
  const displayAccountName =
    userProfile?.businessName || session?.user?.name || session?.user?.email || "Holwa user";
  const displayInitial = displayAccountName.charAt(0).toUpperCase();
  const mobileNetworkLabel = isSupplierDashboard ? "Customers" : "Suppliers";
  const mobileTabs: Array<{ id: MobileTab; label: string }> = [
    { id: "analytics", label: "Home" },
    { id: "creditors", label: "Creditors" },
    { id: "network", label: mobileNetworkLabel },
    { id: "inbox", label: "Inbox" },
    { id: "profile", label: "Profile" },
  ];
  const canDismissProfileDialog = userProfile
    ? hasBusinessProfileDetails(userProfile)
    : false;
  const isTopupInProgress =
    topupStatus.stage === "sending" || topupStatus.stage === "waiting";
  const isTopupFinal =
    topupStatus.stage === "success" ||
    topupStatus.stage === "failed" ||
    topupStatus.stage === "cancelled" ||
    topupStatus.stage === "timeout";

  const openTopupDialog = () => {
    setTopupStatus(initialTopupStatus);
    setIsTopupOpen(true);
  };

  const closeTopupDialog = async () => {
    if (isTopupInProgress) {
      return;
    }

    await refreshCreditData();
    setIsTopupOpen(false);
    setTopupStatus(initialTopupStatus);

    if (isTopupFinal) {
      setTopupPhone("");
      setTopupAmount("1");
    }
  };

  useEffect(() => {
    if (!isPending && !session) {
      if (hasPendingAuthRedirect()) {
        return;
      }

      router.push("/");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    let isActive = true;

    const loadAnnouncements = async () => {
      try {
        const response = await fetch("/api/announcements");
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          announcements?: Array<{
            id: string;
            title: string;
            body: string;
          }>;
        };

        if (isActive) {
          setSystemAnnouncements(
            (data.announcements || []).map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              variant: "info" as const,
            }))
          );
        }
      } catch {
        if (isActive) {
          setSystemAnnouncements([]);
        }
      }
    };

    void loadAnnouncements();

    return () => {
      isActive = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    let isActive = true;

    const loadProfile = async () => {
      const storedRole = window.localStorage.getItem(selectedRoleStorageKey);
      const selectedRole = isUserRole(storedRole) ? storedRole : null;

      try {
        const response = await fetch(`/api/profile?userId=${session.user.id}`);
        if (!response.ok) {
          throw new Error("Failed to load profile");
        }

        const data = (await response.json()) as {
          profile: UserProfile | null;
          isAdmin?: boolean;
        };

        if (!isActive) {
          return;
        }

        if (data.isAdmin || data.profile?.role === "ADMIN") {
          window.localStorage.removeItem(selectedRoleStorageKey);
          router.replace("/admin");
          return;
        }

        if (data.profile) {
          if (selectedRole && selectedRole !== data.profile.role) {
            if (
              selectedRole === "INDIVIDUAL" ||
              hasBusinessProfileDetails(data.profile)
            ) {
              const saveResponse = await fetch("/api/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: session.user.id,
                  role: selectedRole,
                  businessName: data.profile.businessName || "",
                  county: data.profile.county || "",
                  town: data.profile.town || "",
                  estate: data.profile.estate || "",
                  phoneNumber: data.profile.phoneNumber || "",
                  paymentMode: data.profile.paymentMode || "",
                  description: data.profile.description || "",
                }),
              });

              if (!saveResponse.ok) {
                throw new Error("Failed to save profile");
              }

              const saved = (await saveResponse.json()) as {
                profile: UserProfile;
              };

              if (isActive) {
                setUserProfile(saved.profile);
                window.localStorage.removeItem(selectedRoleStorageKey);
              }
              return;
            }

            setUserProfile(data.profile);
            router.push("/profile?setup=1");
            return;
          }

          setUserProfile(data.profile);
          if (!hasBusinessProfileDetails(data.profile)) {
            router.push("/profile?setup=1");
          } else {
            window.localStorage.removeItem(selectedRoleStorageKey);
          }
          return;
        }

        if (!selectedRole) {
          return;
        }

        if (selectedRole === "INDIVIDUAL") {
          const saveResponse = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: session.user.id,
              role: selectedRole,
            }),
          });

          if (!saveResponse.ok) {
            throw new Error("Failed to save profile");
          }

          const saved = (await saveResponse.json()) as {
            profile: UserProfile;
          };

          if (isActive) {
            setUserProfile(saved.profile);
            window.localStorage.removeItem(selectedRoleStorageKey);
          }
          return;
        }

        router.push("/profile?setup=1");
      } catch (error) {
        if (isActive) {
          setToast({
            message: "Profile setup could not load. You can keep using the dashboard.",
            variant: "warning",
          });
        }
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [session?.user?.id]);

  async function refreshCreditData() {
    if (!session?.user?.id) {
      return;
    }

    const response = await fetch(`/api/credits?userId=${session.user.id}`);
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    setCredits(data.credits || []);
    setReminderBalance(Number(data.balance || 0));
  }

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const fetchStock = async () => {
      const response = await fetch(`/api/stock?userId=${session.user.id}`);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setStockItems(data.items || []);
    };

    void refreshCreditData();
    fetchStock();
  }, [session?.user?.id]);

  const totalOwed = useMemo(
    () =>
      credits
        .filter(isUnpaid)
        .reduce((sum, record) => sum + amountOwed(record), 0),
    [credits]
  );
  const stockValue = useMemo(
    () =>
      stockItems.reduce(
        (sum, item) => sum + Number(item.buyingPrice) * item.quantity,
        0
      ),
    [stockItems]
  );

  const reminders = useMemo(
    () => credits.filter((record) => isReminder(record.dueDate, record.status)),
    [credits]
  );
  const dueTodayCount = useMemo(() => {
    const todayString = new Date().toDateString();
    return credits.filter((record) => {
      if (record.status === "PAID") {
        return false;
      }
      return new Date(record.dueDate).toDateString() === todayString;
    }).length;
  }, [credits]);
  const overdueCount = useMemo(
    () => credits.filter((record) => record.status === "OVERDUE").length,
    [credits]
  );
  const lowStockItems = useMemo(
    () => stockItems.filter((item) => item.quantity < 10),
    [stockItems]
  );
  const inboxItems = useMemo<InboxItem[]>(() => {
    const items: InboxItem[] = [];

    if (systemAnnouncements.length > 0) {
      items.push(...systemAnnouncements);
    }

    if (isProfileDialogOpen && pendingProfileRole) {
      items.push({
        id: "profile",
        title: "Complete your profile",
        body: `${roleLabels[pendingProfileRole]} users need profile details before continuing.`,
        variant: "warning",
      });
    }

    if (overdueCount > 0) {
      items.push({
        id: "overdue",
        title: "Overdue credits",
        body: `${overdueCount} credit record${overdueCount === 1 ? " is" : "s are"
          } overdue.`,
        variant: "warning",
      });
    }

    if (dueTodayCount > 0) {
      items.push({
        id: "due-today",
        title: "Due today",
        body: `${dueTodayCount} credit record${dueTodayCount === 1 ? " is" : "s are"
          } due today.`,
        variant: "info",
      });
    }

    if (lowStockItems.length > 0) {
      items.push({
        id: "low-stock",
        title: "Low stock",
        body: `${lowStockItems.length} stock item${lowStockItems.length === 1 ? " needs" : "s need"
          } attention.`,
        variant: "warning",
      });
    }

    if (reminderBalance === 0) {
      items.push({
        id: "reminders",
        title: "Reminder credits",
        body: "Recharge reminder credits before sending customer SMS.",
        variant: "info",
      });
    }

    return items;
  }, [
    dueTodayCount,
    isProfileDialogOpen,
    lowStockItems.length,
    overdueCount,
    pendingProfileRole,
    reminderBalance,
    systemAnnouncements,
  ]);
  const filteredSuppliers = useMemo(() => {
    const term = supplierSearch.trim().toLowerCase();
    if (!term) {
      return suppliers;
    }

    return suppliers.filter((supplier) => {
      const haystack = [
        supplier.businessName,
        supplier.county,
        supplier.town,
        supplier.estate,
        supplier.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [supplierSearch, suppliers]);
  const customerGroups = useMemo<CustomerCreditGroup[]>(() => {
    const groups = new Map<string, CustomerCreditGroup>();

    credits.forEach((record) => {
      const key = getCustomerKey(record);
      const existing = groups.get(key);
      const name = record.customer?.name || record.customerName;
      const phone = record.customer?.phone || record.customerPhone;
      const unpaid = isUnpaid(record);
      const unpaidItemRows = unpaid ? getUnpaidItemRowsForCredit(record) : [];

      if (!existing) {
        groups.set(key, {
          key,
          name,
          phone,
          credits: [record],
          unpaidCredits: unpaid ? [record] : [],
          unpaidItems: unpaidItemRows,
          totalUnpaid: unpaid ? amountOwed(record) : 0,
          earliestDueDate: unpaid ? record.dueDate : null,
          status: unpaid ? record.status : "PAID",
        });
        return;
      }

      existing.credits.push(record);
      if (unpaid) {
        existing.unpaidCredits.push(record);
        existing.unpaidItems.push(...unpaidItemRows);
        existing.totalUnpaid += amountOwed(record);
        if (
          !existing.earliestDueDate ||
          new Date(record.dueDate) < new Date(existing.earliestDueDate)
        ) {
          existing.earliestDueDate = record.dueDate;
        }
      }
      existing.status = getGroupStatus(existing.unpaidCredits);
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (a.totalUnpaid !== b.totalUnpaid) {
        return b.totalUnpaid - a.totalUnpaid;
      }
      return a.name.localeCompare(b.name);
    });
  }, [credits]);

  const selectedCustomerGroup = useMemo(
    () =>
      selectedCustomerKey
        ? customerGroups.find((group) => group.key === selectedCustomerKey) ||
        null
        : null,
    [customerGroups, selectedCustomerKey]
  );

  const filteredCustomerGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return customerGroups;
    }
    return customerGroups.filter(
      (group) =>
        group.name.toLowerCase().includes(term) ||
        group.phone.toLowerCase().includes(term)
    );
  }, [customerGroups, searchTerm]);
  const pageSize = 5;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredCustomerGroups.length / pageSize)
  );
  const paginatedCustomerGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredCustomerGroups.slice(startIndex, startIndex + pageSize);
  }, [filteredCustomerGroups, currentPage]);
  const customerScorePhones = useMemo(
    () =>
      Array.from(
        new Set(
          customerGroups
            .map((group) => normalizePhone(group.phone))
            .filter(Boolean)
        )
      ),
    [customerGroups]
  );
  const customerScorePhoneKey = customerScorePhones.join("|");
  const getRiskResultForPhone = (phone: string) =>
    riskScoresByPhone[normalizePhone(phone)] || riskScoresByPhone[phone];

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (
      !session?.user?.id ||
      !isBusinessDashboard ||
      customerScorePhones.length === 0
    ) {
      return;
    }

    let isActive = true;

    const loadRiskBadges = async () => {
      try {
        const response = await fetch("/api/risk-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: session.user.id,
            phones: customerScorePhones,
          }),
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          scores?: RiskScoreResult[];
        };

        if (!isActive || !data.scores) {
          return;
        }

        setRiskScoresByPhone((prev) => {
          const next = { ...prev };
          data.scores?.forEach((score) => {
            if (score.error) {
              return;
            }
            next[normalizePhone(score.phone)] = score;
            if (score.requestedPhone) {
              next[normalizePhone(score.requestedPhone)] = score;
            }
          });
          return next;
        });
      } catch {
        // Score badges are helpful, but the dashboard should still load without them.
      }
    };

    loadRiskBadges();

    return () => {
      isActive = false;
    };
  }, [
    customerScorePhoneKey,
    customerScorePhones,
    isBusinessDashboard,
    session?.user?.id,
  ]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (topupStatus.stage !== "waiting" || !topupStatus.topupId) {
      return;
    }

    let isActive = true;
    let timer: number | undefined;

    const pollTopupStatus = async () => {
      try {
        const response = await fetch(
          `/api/credits/topup/status?topupId=${encodeURIComponent(
            topupStatus.topupId || ""
          )}`
        );
        const data = (await response.json().catch(() => ({}))) as
          | TopupStatusResponse
          | { error?: string };

        if (!isActive) {
          return;
        }

        if (!response.ok) {
          setTopupStatus({
            stage: "failed",
            tone: "error",
            title: "Could not confirm payment",
            message:
              "Payment status could not be checked. Please close and check your reminder balance.",
            topupId: topupStatus.topupId,
          });
          return;
        }

        const statusData = data as TopupStatusResponse;
        if (statusData.balance !== undefined) {
          setReminderBalance(Number(statusData.balance));
        }

        if (statusData.displayStatus === "SUCCESS") {
          setTopupStatus({
            stage: "success",
            tone: "success",
            title: "Payment successful",
            message:
              statusData.message ||
              "Payment successful. Reminder credits have been added.",
            topupId: topupStatus.topupId,
          });
          return;
        }

        if (statusData.displayStatus === "CANCELLED") {
          setTopupStatus({
            stage: "cancelled",
            tone: "warning",
            title: "Payment cancelled",
            message:
              statusData.message ||
              "Payment cancelled. No reminder credits were added.",
            topupId: topupStatus.topupId,
          });
          return;
        }

        if (statusData.displayStatus === "FAILED") {
          setTopupStatus({
            stage: "failed",
            tone: "error",
            title: "Payment failed",
            message:
              statusData.message ||
              "Payment failed. No reminder credits were added.",
            topupId: topupStatus.topupId,
          });
          return;
        }

        if (statusData.displayStatus === "TIMEOUT") {
          setTopupStatus({
            stage: "timeout",
            tone: "warning",
            title: "Still waiting",
            message:
              statusData.message ||
              "Payment confirmation is taking too long. Close and check your balance shortly.",
            topupId: topupStatus.topupId,
          });
          return;
        }

        setTopupStatus((current) =>
          current.stage === "waiting"
            ? {
              ...current,
              message:
                statusData.message ||
                "Waiting for Safaricom confirmation. Check your phone and enter your M-Pesa PIN.",
            }
            : current
        );
      } catch {
        if (!isActive) {
          return;
        }
        setTopupStatus((current) =>
          current.stage === "waiting"
            ? {
              ...current,
              message:
                "Still checking payment status. Keep this card open while we wait for Safaricom.",
            }
            : current
        );
      }

      if (isActive) {
        timer = window.setTimeout(pollTopupStatus, 3000);
      }
    };

    timer = window.setTimeout(pollTopupStatus, 2500);

    return () => {
      isActive = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [topupStatus.stage, topupStatus.topupId]);

  if (isPending) {
    return <AuthLoadingScreen />;
  }

  if (!session) {
    return null;
  }

  const handleInputChange = (field: keyof typeof formState) => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormState((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };
  };

  const handleItemChange = (
    index: number,
    field: "name" | "quantity" | "unitPrice",
    value: string
  ) => {
    setFormState((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  const handleAddItem = () => {
    setFormState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { id: crypto.randomUUID(), name: "", quantity: "", unitPrice: "" },
      ],
    }));
  };

  const handleRemoveItem = (index: number) => {
    setFormState((prev) => {
      const items = prev.items.filter((_, idx) => idx !== index);
      return {
        ...prev,
        items: items.length
          ? items
          : [{ id: crypto.randomUUID(), name: "", quantity: "", unitPrice: "" }],
      };
    });
  };

  const openRiskDialog = (phone = "") => {
    const normalizedPhone = normalizePhone(phone);
    setRiskPhone(normalizedPhone);
    setRiskResult(normalizedPhone ? getRiskResultForPhone(normalizedPhone) || null : null);
    setRiskError("");
    setIsRiskDialogOpen(true);
  };

  const handleCheckRisk = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!session.user?.id) {
      return;
    }

    setRiskError("");
    setRiskResult(null);
    setIsRiskChecking(true);

    try {
      const response = await fetch("/api/risk-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          phone: riskPhone,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        score?: RiskScoreResult;
      };

      if (!response.ok || !data.score || data.score.error) {
        setRiskError(data.score?.error || data.error || "Risk check failed.");
        return;
      }

      setRiskResult(data.score);
      setRiskScoresByPhone((prev) => ({
        ...prev,
        [normalizePhone(data.score!.phone)]: data.score!,
        ...(data.score!.requestedPhone
          ? { [normalizePhone(data.score!.requestedPhone)]: data.score! }
          : {}),
      }));
    } finally {
      setIsRiskChecking(false);
    }
  };

  const handleAddCredit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session.user?.id) {
      return;
    }

    const items = formState.items
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
      }));
    const amountPaid = Number(formState.amountPaid || 0);
    const totalAmount = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
    const newAmountOwed = Math.max(0, totalAmount - amountPaid);
    const customerPhone = normalizePhone(formState.customerPhone);

    if (
      !formState.customerName ||
      !formState.customerPhone ||
      !formState.dueDate ||
      items.length === 0
    ) {
      return;
    }

    const existingGroup = customerGroups.find(
      (group) => normalizePhone(group.phone) === customerPhone
    );

    if (existingGroup && existingGroup.totalUnpaid > 0) {
      const shouldContinue = window.confirm(
        [
          `${existingGroup.name} already has unpaid credit of ${formatMoney(
            existingGroup.totalUnpaid
          )}.`,
          `New credit: ${formatMoney(newAmountOwed)}.`,
          `Total after adding: ${formatMoney(
            existingGroup.totalUnpaid + newAmountOwed
          )}.`,
          `Unpaid item count after adding: ${totalItemQuantity(existingGroup.unpaidItems) +
          totalItemQuantity(items)
          }.`,
          "",
          "Add this credit anyway?",
        ].join("\n")
      );

      if (!shouldContinue) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          customerName: formState.customerName.trim(),
          customerPhone,
          dueDate: formState.dueDate,
          amountPaid,
          items,
        }),
      });

      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setCredits((prev) => [data.credit, ...prev]);
      setFormState({
        customerName: "",
        customerPhone: "",
        dueDate: "",
        amountPaid: "",
        items: [{ id: crypto.randomUUID(), name: "", quantity: "", unitPrice: "" }],
      });
      setIsAddDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (
    recordId: string,
    status: CreditRecord["status"]
  ) => {
    const response = await fetch(`/api/credits/${recordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    setCredits((prev) =>
      prev.map((record) =>
        record.id === recordId ? data.credit : record
      )
    );
  };

  const openPaymentDialog = (record: CreditRecord) => {
    setPaymentCredit(record);
    setPaymentAmount("");
    setPaymentNote("");
    setPaymentError("");
  };

  const handleRecordPayment = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!paymentCredit) {
      return;
    }

    const amount = Number(paymentAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a payment amount greater than zero.");
      return;
    }

    setPaymentError("");
    setIsPaymentSubmitting(true);

    try {
      const response = await fetch(`/api/credits/${paymentCredit.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          note: paymentNote,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        credit?: CreditRecord;
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
      setPaymentCredit(null);
      setToast({ message: "Payment recorded.", variant: "success" });
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  const handleDeleteCredit = async (recordId: string) => {
    const response = await fetch(`/api/credits/${recordId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setToast({
        message: "Failed to delete credit. Please try again.",
        variant: "warning",
      });
      return;
    }
    setCredits((prev) => prev.filter((record) => record.id !== recordId));
    setToast({ message: "Credit deleted.", variant: "success" });
  };

  const handleRemind = async (creditId: string) => {
    if (reminderBalance === 0) {
      setToast({
        message: "Reminders are finished. Please recharge your account.",
        variant: "warning",
      });
      return;
    }
    if (!session?.user?.id) {
      return;
    }
    const response = await fetch("/api/reminders/send-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.user.id, creditId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.sent) {
      setToast({
        message: data?.error || "Failed to send reminder. Please try again.",
        variant: "warning",
      });
      return;
    }
    console.log("[Remind] client success", data);
    setReminderBalance(Number(data.balance ?? reminderBalance));
    setToast({ message: "Reminder sent.", variant: "success" });
  };

  const handleSendAllDueToday = async () => {
    if (dueTodayCount === 0) {
      return;
    }
    if (reminderBalance === 0) {
      setToast({
        message: "Reminders are finished. Please recharge your account.",
        variant: "warning",
      });
      return;
    }
    if (reminderBalance < dueTodayCount) {
      setToast({
        message:
          "Not enough reminders to send all due today. Please recharge your account.",
        variant: "warning",
      });
      return;
    }
    if (!session?.user?.id) {
      return;
    }
    const response = await fetch("/api/reminders/send-due-today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.user.id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setToast({
        message: data?.error || "Failed to send reminders. Please try again.",
        variant: "warning",
      });
      return;
    }
    if (!data?.sentCount && data?.error) {
      setToast({ message: data.error, variant: "warning" });
      return;
    }
    setReminderBalance(Number(data.balance ?? reminderBalance));
    setToast({ message: "Reminders sent.", variant: "success" });
  };

  const handleSendOverdue = async () => {
    if (overdueCount === 0) {
      return;
    }
    if (reminderBalance === 0) {
      setToast({
        message: "Reminders are finished. Please recharge your account.",
        variant: "warning",
      });
      return;
    }
    if (reminderBalance < overdueCount) {
      setToast({
        message:
          "Not enough reminders to send all overdue. Please recharge your account.",
        variant: "warning",
      });
      return;
    }
    if (!session?.user?.id) {
      return;
    }
    const response = await fetch("/api/reminders/send-overdue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.user.id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setToast({
        message: data?.error || "Failed to send reminders. Please try again.",
        variant: "warning",
      });
      return;
    }
    if (!data?.sentCount && data?.error) {
      setToast({ message: data.error, variant: "warning" });
      return;
    }
    setReminderBalance(Number(data.balance ?? reminderBalance));
    setToast({ message: "Reminders sent.", variant: "success" });
  };

  const resetStockForm = () => {
    setStockEditingItem(null);
    setStockForm({
      product: "",
      buyingPrice: "",
      sellingPrice: "",
      quantity: isSupplierDashboard ? "1" : "",
      supplierPhone: userProfile?.phoneNumber || "",
      offers: "",
    });
  };

  const openAddStockDialog = () => {
    resetStockForm();
    setIsStockDialogOpen(true);
  };

  const openEditStockDialog = (item: StockItem) => {
    setStockEditingItem(item);
    setStockForm({
      product: item.product,
      buyingPrice: String(item.buyingPrice),
      sellingPrice: String(item.sellingPrice),
      quantity: String(item.quantity),
      supplierPhone: item.supplierPhone,
      offers: item.offers || "",
    });
    setIsStockDialogOpen(true);
  };

  const handleStockInputChange = (field: keyof typeof stockForm) => {
    return (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      setStockForm((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };
  };

  const handleSaveStock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.user?.id) {
      return;
    }
    const sellingPrice = Number(stockForm.sellingPrice);
    const buyingPrice = isSupplierDashboard
      ? sellingPrice
      : Number(stockForm.buyingPrice);
    const quantity = isSupplierDashboard
      ? Number(stockForm.quantity || 1)
      : Number(stockForm.quantity);
    const supplierPhone = isSupplierDashboard
      ? stockForm.supplierPhone.trim() || userProfile?.phoneNumber || ""
      : stockForm.supplierPhone.trim();

    if (
      !stockForm.product ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice < 0 ||
      !Number.isFinite(buyingPrice) ||
      buyingPrice < 0 ||
      !Number.isFinite(quantity) ||
      quantity < 0 ||
      !supplierPhone
    ) {
      setToast({
        message: "Please complete the stock item details.",
        variant: "warning",
      });
      return;
    }

    setIsStockSubmitting(true);
    try {
      const response = await fetch(
        stockEditingItem ? `/api/stock/${stockEditingItem.id}` : "/api/stock",
        {
          method: stockEditingItem ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: session.user.id,
            product: stockForm.product.trim(),
            buyingPrice,
            sellingPrice,
            quantity,
            supplierPhone,
            offers: stockForm.offers.trim(),
          }),
        }
      );

      if (!response.ok) {
        setToast({
          message: stockEditingItem
            ? "Failed to update stock. Please try again."
            : "Failed to add stock. Please try again.",
          variant: "warning",
        });
        return;
      }
      const data = await response.json();
      setStockItems((prev) =>
        stockEditingItem
          ? prev.map((item) =>
            item.id === stockEditingItem.id ? data.item : item
          )
          : [data.item, ...prev]
      );
      resetStockForm();
      setIsStockDialogOpen(false);
      setToast({
        message: stockEditingItem ? "Stock item updated." : "Stock item added.",
        variant: "success",
      });
    } finally {
      setIsStockSubmitting(false);
    }
  };

  const handleReduceStock = async (itemId: string) => {
    if (!session?.user?.id) {
      return;
    }
    const reduceBy = Number(stockReduceAmounts[itemId] || 0);
    if (!Number.isFinite(reduceBy) || reduceBy <= 0) {
      setToast({
        message: "Enter a valid quantity to reduce.",
        variant: "warning",
      });
      return;
    }

    const response = await fetch(`/api/stock/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reduceBy }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setToast({
        message: data?.error || "Failed to reduce stock.",
        variant: "warning",
      });
      return;
    }
    setStockItems((prev) =>
      prev.map((item) => (item.id === itemId ? data.item : item))
    );
    setStockReduceAmounts((prev) => ({ ...prev, [itemId]: "" }));
    setToast({ message: "Stock updated.", variant: "success" });
  };

  const handleNotifySupplier = async (itemId: string) => {
    if (!session?.user?.id) {
      return;
    }
    const response = await fetch("/api/stock/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.user.id, itemId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setToast({
        message: data?.error || "Failed to notify supplier.",
        variant: "warning",
      });
      return;
    }
    setToast({ message: "Supplier notified.", variant: "success" });
  };

  const handleTopup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.user?.id) {
      return;
    }
    if (isTopupInProgress) {
      return;
    }

    const topupPhoneValue = topupPhone.trim();
    const cleanTopupPhone = topupPhoneValue.replace(/[\s-]/g, "");
    const isKenyanPhone =
      /^\+?254\d{9}$/.test(cleanTopupPhone) ||
      /^0\d{9}$/.test(cleanTopupPhone) ||
      /^7\d{8}$/.test(cleanTopupPhone);

    if (!isKenyanPhone) {
      setTopupStatus({
        stage: "idle",
        tone: "error",
        title: "Check phone number",
        message: "Enter a valid M-Pesa number, for example 07... or +254...",
      });
      return;
    }
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      setTopupStatus({
        stage: "idle",
        tone: "error",
        title: "Check amount",
        message: "Amount must be a whole KES amount.",
      });
      return;
    }

    setIsTopupSubmitting(true);
    setTopupStatus({
      stage: "sending",
      tone: "info",
      title: "Sending STK push",
      message: "Contacting Safaricom. Keep this card open.",
    });
    try {
      const response = await fetch("/api/credits/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          phone: topupPhoneValue,
          amount,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setTopupStatus({
          stage: "failed",
          tone: "error",
          title: "Could not start payment",
          message: data?.error || "Failed to start STK push.",
        });
        return;
      }
      if (!data?.topupId) {
        setTopupStatus({
          stage: "failed",
          tone: "error",
          title: "Could not track payment",
          message: "STK push started, but Holwa could not track the payment status.",
        });
        return;
      }
      setTopupStatus({
        stage: "waiting",
        tone: "info",
        title: "Waiting for M-Pesa",
        message:
          data?.message ||
          "STK push sent. Check your phone and enter your M-Pesa PIN.",
        topupId: data?.topupId,
      });
      if (data?.balance !== undefined) {
        setReminderBalance(Number(data.balance));
      }
    } catch {
      setTopupStatus({
        stage: "failed",
        tone: "error",
        title: "Network error",
        message: "Network error while starting payment. Please try again.",
      });
    } finally {
      setIsTopupSubmitting(false);
    }
  };

  const handleProfileInputChange = <K extends keyof ProfileForm>(
    field: K,
    value: ProfileForm[K]
  ) => {
    setProfileForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const loadSuppliers = async () => {
    setIsSuppliersLoading(true);

    try {
      const response = await fetch("/api/profile/suppliers");
      if (!response.ok) {
        throw new Error("Failed to load suppliers");
      }

      const data = (await response.json()) as {
        suppliers: SupplierProfile[];
      };
      setSuppliers(data.suppliers || []);
    } catch (error) {
      setToast({
        message: "Failed to load suppliers. Please try again.",
        variant: "warning",
      });
    } finally {
      setIsSuppliersLoading(false);
    }
  };

  const openSuppliersDrawer = async () => {
    setIsSuppliersDrawerOpen(true);
    await loadSuppliers();
  };

  const loadCustomers = async () => {
    if (!session?.user?.id) {
      return;
    }

    setIsCustomersLoading(true);

    try {
      const response = await fetch(
        `/api/supplier/customers?supplierUserId=${encodeURIComponent(
          session.user.id
        )}`
      );
      if (!response.ok) {
        throw new Error("Failed to load customers");
      }

      const data = (await response.json()) as {
        customers: SupplierCustomer[];
      };
      setSupplierCustomers(data.customers || []);
    } catch (error) {
      setToast({
        message: "Failed to load business stock signals.",
        variant: "warning",
      });
    } finally {
      setIsCustomersLoading(false);
    }
  };

  const openCustomersDrawer = async () => {
    setIsCustomersDrawerOpen(true);
    await loadCustomers();
  };

  const handleMobileTabChange = (tab: MobileTab) => {
    setActiveMobileTab(tab);

    if (tab === "network") {
      if (isBusinessDashboard) {
        void loadSuppliers();
      }
      if (isSupplierDashboard) {
        void loadCustomers();
      }
    }
  };

  const handleSendRestockRequest = async (
    customer: SupplierCustomer,
    item: SupplierCustomerStockItem
  ) => {
    if (!session?.user?.id) {
      return;
    }

    setRestockRequestIds((prev) => ({ ...prev, [item.id]: true }));

    try {
      const response = await fetch("/api/supplier/restock-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierUserId: session.user.id,
          businessUserId: customer.profile.userId,
          stockItemId: item.id,
        }),
      });
      const data = (await response.json()) as {
        warning?: string;
        error?: string;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to send restock request");
      }

      setToast({
        message:
          data.warning ||
          `Restock request sent to ${customer.profile.businessName || "business"
          }.`,
        variant: data.warning ? "warning" : "success",
      });
    } catch (error) {
      setToast({
        message:
          error instanceof Error
            ? error.message
            : "Failed to send restock request.",
        variant: "warning",
      });
    } finally {
      setRestockRequestIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const openProfileDialog = () => {
    if (!userProfile) {
      return;
    }

    if (!needsBusinessProfile(userProfile.role)) {
      setToast({
        message: "Individual accounts do not need extra profile details yet.",
        variant: "success",
      });
      return;
    }

    setProfileError("");
    setPendingProfileRole(userProfile.role);
    setProfileForm(toProfileForm(userProfile));
    setIsProfileDialogOpen(true);
  };

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!session?.user?.id || !pendingProfileRole) {
      return;
    }

    setProfileError("");

    if (
      !profileForm.businessName ||
      !profileForm.county ||
      !profileForm.town ||
      !profileForm.estate ||
      !profileForm.phoneNumber ||
      !profileForm.paymentMode ||
      !profileForm.description
    ) {
      setProfileError("Please complete all profile fields.");
      return;
    }

    setIsProfileSubmitting(true);

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          role: pendingProfileRole,
          businessName: profileForm.businessName.trim(),
          county: profileForm.county.trim(),
          town: profileForm.town.trim(),
          estate: profileForm.estate.trim(),
          phoneNumber: profileForm.phoneNumber.trim(),
          paymentMode: profileForm.paymentMode,
          description: profileForm.description.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setProfileError(data?.error || "Failed to save profile.");
        return;
      }

      setUserProfile(data.profile);
      setIsProfileDialogOpen(false);
      setPendingProfileRole(null);
      window.localStorage.removeItem(selectedRoleStorageKey);
      setToast({ message: "Profile saved.", variant: "success" });
    } finally {
      setIsProfileSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="hidden bg-white shadow-sm md:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Image src="/logo.jpeg" alt="Holwa logo" width={32} height={32} />
              <h1 className="text-xl font-bold text-blue-700 sm:text-2xl">
                Holwa
              </h1>
            </div>
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              {userProfile ? (
                <button
                  type="button"
                  onClick={() => {
                    window.localStorage.setItem(
                      selectedRoleStorageKey,
                      userProfile.role
                    );
                    router.push("/profile");
                  }}
                  className="flex min-w-0 items-center gap-2 rounded-full bg-gray-50 py-1 pl-1 pr-2 text-left ring-1 ring-gray-100"
                >
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-semibold text-white">
                      {displayInitial}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block max-w-28 truncate text-xs font-semibold text-gray-900">
                      {displayAccountName}
                    </span>
                    <span className="block text-[11px] font-medium text-blue-700">
                      {roleLabels[userProfile.role]}
                    </span>
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-expanded={isMobileMenuOpen}
                aria-label="Open navigation menu"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <span className="space-y-1.5">
                  <span className="block h-0.5 w-5 rounded-full bg-current" />
                  <span className="block h-0.5 w-5 rounded-full bg-current" />
                  <span className="block h-0.5 w-5 rounded-full bg-current" />
                </span>
              </button>
            </div>
            <div className="hidden items-center gap-4 md:flex">
              {isBusinessDashboard ? (
                <button
                  type="button"
                  onClick={openSuppliersDrawer}
                  className="px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
                >
                  Suppliers
                </button>
              ) : null}
              {isSupplierDashboard ? (
                <button
                  type="button"
                  onClick={openCustomersDrawer}
                  className="px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
                >
                  Customers
                </button>
              ) : null}
              <button
                onClick={() => setIsInboxOpen(true)}
                className="relative px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100"
              >
                Inbox
                {inboxItems.length > 0 ? (
                  <span className="ml-2 rounded-full bg-blue-700 px-2 py-0.5 text-xs text-white">
                    {inboxItems.length}
                  </span>
                ) : null}
              </button>
              {userProfile ? (
                <button
                  type="button"
                  onClick={() => {
                    window.localStorage.setItem(
                      selectedRoleStorageKey,
                      userProfile.role
                    );
                    router.push("/profile");
                  }}
                  className="hidden items-center gap-2 rounded-full bg-gray-100 py-1 pl-1 pr-3 text-xs font-medium text-gray-700 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:inline-flex"
                >
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-700 text-xs font-semibold text-white">
                      {(session.user?.name || session.user?.email || "H")
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                  )}
                  <span>{roleLabels[userProfile.role]}</span>
                </button>
              ) : null}
              <span className="max-w-48 truncate text-gray-700">
                {displayAccountName}
              </span>
              <button
                onClick={() => signOut()}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="absolute right-0 top-0 flex h-full w-[86vw] max-w-sm flex-col bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt=""
                      className="h-11 w-11 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white">
                      {displayInitial}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-gray-950">
                      {displayAccountName}
                    </p>
                    {userProfile ? (
                      <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {roleLabels[userProfile.role]}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="rounded-lg px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Close navigation menu"
                >
                  x
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
              {isBusinessDashboard ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openSuppliersDrawer();
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-blue-100 bg-white px-4 py-3 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  Suppliers
                </button>
              ) : null}
              {isSupplierDashboard ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openCustomersDrawer();
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-blue-100 bg-white px-4 py-3 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  Customers
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsInboxOpen(true);
                }}
                className="flex w-full items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                <span>Inbox</span>
                {inboxItems.length > 0 ? (
                  <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs text-white">
                    {inboxItems.length}
                  </span>
                ) : null}
              </button>
              {userProfile ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    window.localStorage.setItem(
                      selectedRoleStorageKey,
                      userProfile.role
                    );
                    router.push("/profile");
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
                >
                  <span>Profile</span>
                  <span className="text-xs font-medium text-gray-500">
                    {roleLabels[userProfile.role]}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  openTopupDialog();
                }}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Recharge
                <span className="text-xs font-medium text-gray-500">
                  {reminderBalance}
                </span>
              </button>
            </div>

            <div className="border-t border-gray-100 p-4">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  signOut();
                }}
                className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Sign out
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <main className="space-y-5 px-4 pb-28 pt-5 md:hidden">
        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Image src="/logo.jpeg" alt="Holwa logo" width={28} height={28} />
                <h1 className="text-xl font-bold text-blue-700">Holwa</h1>
              </div>
              <p className="mt-2 truncate text-sm font-semibold text-gray-900">
                {displayAccountName}
              </p>
              {userProfile ? (
                <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {roleLabels[userProfile.role]}
                </span>
              ) : null}
            </div>
            {profileImage ? (
              <img
                src={profileImage}
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-700 text-base font-semibold text-white">
                {displayInitial}
              </span>
            )}
          </div>
        </section>

        {activeMobileTab === "analytics" ? (
          <>
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs font-medium text-gray-500">Money owed</p>
                <p className="mt-2 text-xl font-semibold text-gray-900">
                  {formatMoney(totalOwed)}
                </p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs font-medium text-gray-500">Stock value</p>
                <p className="mt-2 text-xl font-semibold text-gray-900">
                  {formatMoney(stockValue)}
                </p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs font-medium text-gray-500">Reminders</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xl font-semibold text-gray-900">
                    {reminderBalance}
                  </p>
                  <button
                    type="button"
                    onClick={openTopupDialog}
                    className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Recharge
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs font-medium text-gray-500">Due today</p>
                <p className="mt-2 text-xl font-semibold text-gray-900">
                  {dueTodayCount}
                </p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs font-medium text-gray-500">Overdue</p>
                <p className="mt-2 text-xl font-semibold text-gray-900">
                  {overdueCount}
                </p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs font-medium text-gray-500">Actions</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSendAllDueToday}
                    disabled={dueTodayCount === 0}
                    className="rounded-lg border border-blue-200 px-2 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
                  >
                    Due
                  </button>
                  <button
                    type="button"
                    onClick={handleSendOverdue}
                    disabled={overdueCount === 0}
                    className="rounded-lg border border-blue-200 px-2 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
                  >
                    Overdue
                  </button>
                </div>
              </div>
            </section>

            {isSupplierDashboard ? (
              <section className="rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4">
                  <h2 className="text-base font-semibold text-gray-900">
                    In Store
                  </h2>
                  <button
                    type="button"
                    onClick={openAddStockDialog}
                    className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Add item
                  </button>
                </div>
                <div className="divide-y divide-gray-100">
                  {stockItems.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-500">
                      No store items added yet.
                    </div>
                  ) : (
                    stockItems.map((item) => (
                      <div key={item.id} className="space-y-3 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {item.product}
                            </p>
                            <p className="mt-1 text-sm text-gray-500">
                              {formatMoney(Number(item.sellingPrice))}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openEditStockDialog(item)}
                            className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700"
                          >
                            Edit
                          </button>
                        </div>
                        <p className="text-sm text-gray-500">
                          {item.offers || "No offer added"}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {activeMobileTab === "creditors" ? (
          <section className="rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
            <div className="space-y-3 border-b border-gray-100 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-900">
                  Creditors
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openRiskDialog()}
                    className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700"
                  >
                    Check risk
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddDialogOpen(true)}
                    className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Add credit
                  </button>
                </div>
              </div>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search customers"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="divide-y divide-gray-100">
              {paginatedCustomerGroups.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-500">
                  No creditors found.
                </div>
              ) : (
                paginatedCustomerGroups.map((group) => (
                  <button
                    type="button"
                    key={group.key}
                    onClick={() =>
                      router.push(`/creditors/${encodeURIComponent(group.key)}`)
                    }
                    className="w-full px-4 py-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {group.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-xs text-gray-500">{group.phone}</p>
                          <RiskBadge result={getRiskResultForPhone(group.phone)} />
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatMoney(group.totalUnpaid)}
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-500">
                      <span>{group.unpaidCredits.length} credits</span>
                      <span>{totalItemQuantity(group.unpaidItems)} items</span>
                      <span>{statusLabels[group.status]}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : null}

        {activeMobileTab === "network" ? (
          <section className="rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
            <div className="space-y-3 border-b border-gray-100 px-4 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                {mobileNetworkLabel}
              </h2>
              {isBusinessDashboard ? (
                <input
                  type="search"
                  value={supplierSearch}
                  onChange={(event) => setSupplierSearch(event.target.value)}
                  placeholder="Search supplier or location"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              ) : null}
            </div>
            <div className="divide-y divide-gray-100">
              {isBusinessDashboard ? (
                isSuppliersLoading ? (
                  <InlineListSkeleton rows={4} />
                ) : filteredSuppliers.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">
                    No suppliers found.
                  </div>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <button
                      type="button"
                      key={supplier.id}
                      onClick={() => router.push(`/suppliers/${supplier.id}`)}
                      className="w-full px-4 py-4 text-left"
                    >
                      <p className="font-semibold text-gray-900">
                        {supplier.businessName}
                      </p>
                      {supplier.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-gray-700">
                          {supplier.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-gray-500">
                        {[supplier.county, supplier.town, supplier.estate]
                          .filter(Boolean)
                          .join(", ") || "Location not added"}
                      </p>
                    </button>
                  ))
                )
              ) : isCustomersLoading ? (
                <InlineListSkeleton rows={4} />
              ) : supplierCustomers.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-500">
                  No business customers yet.
                </div>
              ) : (
                supplierCustomers.map((customer) => (
                  <div key={customer.profile.userId} className="px-4 py-4">
                    <p className="font-semibold text-gray-900">
                      {customer.profile.businessName || "Business"}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {[
                        customer.profile.county,
                        customer.profile.town,
                        customer.profile.estate,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Location not added"}
                    </p>
                    <p className="mt-2 text-xs text-blue-700">
                      Last order{" "}
                      {customer.lastOrderAt
                        ? formatDate(customer.lastOrderAt)
                        : "unknown"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {activeMobileTab === "inbox" ? (
          <section className="rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
            <div className="border-b border-gray-100 px-4 py-4">
              <h2 className="text-base font-semibold text-gray-900">Inbox</h2>
              <p className="mt-1 text-sm text-gray-500">
                Messages and alerts for your account.
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {inboxItems.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-500">
                  No messages yet.
                </div>
              ) : (
                inboxItems.map((item) => (
                  <div key={item.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">{item.body}</p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.variant === "warning"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700"
                          }`}
                      >
                        {item.variant === "warning" ? "Action" : "Info"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {activeMobileTab === "profile" ? (
          <section className="space-y-4">
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <div className="flex items-center gap-3">
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-lg font-semibold text-white">
                    {displayInitial}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-gray-900">
                    {displayAccountName}
                  </p>
                  {userProfile ? (
                    <p className="text-sm font-medium text-blue-700">
                      {roleLabels[userProfile.role]}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Phone</span>
                  <span className="font-medium text-gray-900">
                    {userProfile?.phoneNumber || "Not added"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Location</span>
                  <span className="text-right font-medium text-gray-900">
                    {[userProfile?.county, userProfile?.town, userProfile?.estate]
                      .filter(Boolean)
                      .join(", ") || "Not added"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Payment</span>
                  <span className="font-medium text-gray-900">
                    {userProfile?.paymentMode
                      ? paymentModeLabels[userProfile.paymentMode]
                      : "Not added"}
                  </span>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  onClick={openProfileDialog}
                  className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white"
                >
                  Edit profile
                </button>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700"
                >
                  Sign out
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <main className="mx-auto hidden max-w-7xl px-4 py-8 sm:px-6 lg:px-8 md:block md:space-y-6">
        <div className="grid gap-6 md:grid-cols-4">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Total money owed</p>
            <h2 className="text-2xl font-semibold text-gray-800 mt-2">
              {formatMoney(totalOwed)}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Stock value: {formatMoney(stockValue)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Reminders</p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold text-gray-800">
                {reminderBalance}
              </h2>
              <button
                onClick={openTopupDialog}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                Recharge
              </button>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Due today</p>
            <h2 className="text-2xl font-semibold text-gray-800 mt-2">
              {dueTodayCount}
            </h2>
            <button
              onClick={handleSendAllDueToday}
              disabled={dueTodayCount === 0}
              className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send due today
            </button>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Overdue</p>
            <h2 className="text-2xl font-semibold text-gray-800 mt-2">
              {overdueCount}
            </h2>
            <button
              onClick={handleSendOverdue}
              disabled={overdueCount === 0}
              className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send overdue
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="flex flex-col gap-3 px-6 py-4 border-b md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Inbox</h3>
              <p className="text-sm text-gray-500">
                Messages and alerts for your account.
              </p>
            </div>
            <button
              onClick={() => setIsInboxOpen(true)}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
            >
              Open Inbox
            </button>
          </div>
          <div className="divide-y">
            {inboxItems.length === 0 ? (
              <div className="px-6 py-6 text-sm text-gray-500">
                No messages yet.
              </div>
            ) : (
              inboxItems.slice(0, 3).map((item) => (
                <div key={item.id} className="px-6 py-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">{item.body}</p>
                    </div>
                    <span
                      className={`mt-2 rounded-full px-3 py-1 text-xs font-medium sm:mt-0 ${item.variant === "warning"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-blue-50 text-blue-700"
                        }`}
                    >
                      {item.variant === "warning" ? "Action" : "Info"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow">
          <div className="flex flex-col gap-3 px-6 py-4 border-b md:flex-row md:items-center md:justify-between">
            <div className="flex items-center justify-between gap-3 md:justify-start">
              <h3 className="text-lg font-semibold text-gray-800">
                List of Creditors
              </h3>
              <div className="flex items-center gap-2 md:hidden">
                <button
                  onClick={() => openRiskDialog()}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                >
                  Check Risk
                </button>
                <button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                >
                  Add Credit
                </button>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center md:flex-1 md:justify-center">
              <div className="w-full max-w-xs">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search customers"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <button
                onClick={() => openRiskDialog()}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
              >
                Check Risk
              </button>
              <button
                onClick={() => setIsAddDialogOpen(true)}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                Add Credit
              </button>
            </div>
          </div>
          <div className="divide-y">
            {paginatedCustomerGroups.map((group) => (
              <div
                key={group.key}
                className="flex flex-col md:flex-row md:items-center md:justify-between px-6 py-4 gap-4"
              >
                <div>
                  <p className="text-sm text-gray-500">Customer</p>
                  <p className="text-base font-semibold text-gray-800">
                    {group.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-gray-500">{group.phone}</p>
                    <RiskBadge result={getRiskResultForPhone(group.phone)} />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total unpaid</p>
                  <p className="text-base font-semibold text-gray-800">
                    {formatMoney(group.totalUnpaid)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Earliest due</p>
                  <p className="text-base font-semibold text-gray-800">
                    {group.earliestDueDate
                      ? formatDate(group.earliestDueDate)
                      : "No unpaid credit"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Open credits</p>
                  <p className="text-base font-semibold text-gray-800">
                    {group.unpaidCredits.length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Items</p>
                  <p className="text-base font-semibold text-gray-800">
                    {totalItemQuantity(group.unpaidItems)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <p className="text-base font-semibold text-gray-800">
                    {statusLabels[group.status]}
                  </p>
                </div>
                <button
                  onClick={() =>
                    router.push(`/creditors/${encodeURIComponent(group.key)}`)
                  }
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                >
                  View
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-gray-500">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {isSupplierDashboard ? (
          <div className="bg-white rounded-lg shadow">
            <div className="flex flex-col gap-3 px-6 py-4 border-b md:flex-row md:items-center md:justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                {isSupplierDashboard ? "In Store" : "Stock items"}
              </h3>
              <button
                onClick={openAddStockDialog}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                {isSupplierDashboard ? "Add item" : "Add stock"}
              </button>
            </div>
            <div className="divide-y">
              {stockItems.length === 0 ? (
                <div className="px-6 py-6 text-sm text-gray-500">
                  No stock items added yet.
                </div>
              ) : (
                stockItems.map((item) => (
                  <div
                    key={item.id}
                    className={
                      isSupplierDashboard
                        ? "grid gap-4 px-6 py-4 md:grid-cols-[2fr_1fr_3fr_auto] md:items-center"
                        : "flex flex-col md:flex-row md:items-center md:justify-between px-6 py-4 gap-4"
                    }
                  >
                    <div>
                      <p className="text-sm text-gray-500">Product</p>
                      <p className="text-base font-semibold text-gray-800">
                        {item.product}
                      </p>
                    </div>
                    {isSupplierDashboard ? (
                      <>
                        <div>
                          <p className="text-sm text-gray-500">Price</p>
                          <p className="text-base font-semibold text-gray-800">
                            {formatMoney(Number(item.sellingPrice))}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Offers (Text)</p>
                          <p className="text-sm text-gray-700">
                            {item.offers || "No offer added"}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-500">Alert</p>
                        <p
                          className={`text-base font-semibold ${item.quantity < 5
                              ? "text-red-600"
                              : item.quantity < 10
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}
                        >
                          {item.quantity < 5
                            ? "Extremely low"
                            : item.quantity < 10
                              ? "Low"
                              : "Normal"}
                        </p>
                      </div>
                    )}
                    <button
                      onClick={() =>
                        isSupplierDashboard
                          ? openEditStockDialog(item)
                          : setSelectedStock(item)
                      }
                      className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                    >
                      {isSupplierDashboard ? "Edit" : "View"}
                    </button>
                    {!isSupplierDashboard ? (
                      <button
                        onClick={() => handleNotifySupplier(item.id)}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                      >
                        Notify supplier
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {mobileTabs.map((tab) => {
            const isActive = activeMobileTab === tab.id;

            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => handleMobileTabChange(tab.id)}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold transition ${isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  }`}
              >
                <MobileTabIcon tab={tab.id} />
                <span className="max-w-full truncate">{tab.label}</span>
                {tab.id === "inbox" && inboxItems.length > 0 ? (
                  <span className="absolute right-3 top-1 rounded-full bg-blue-700 px-1.5 py-0.5 text-[10px] leading-none text-white">
                    {inboxItems.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      {isProfileDialogOpen && pendingProfileRole ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-700">
                  {roleLabels[pendingProfileRole]} profile
                </p>
                <h3 className="mt-1 text-xl font-semibold text-gray-900">
                  Complete your profile
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  These details help customers and partners identify your account.
                </p>
              </div>
              {canDismissProfileDialog ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileDialogOpen(false);
                    setPendingProfileRole(null);
                    setProfileError("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close profile"
                >
                  x
                </button>
              ) : null}
            </div>

            {profileError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {profileError}
              </div>
            ) : null}

            <form className="mt-5 space-y-4" onSubmit={handleProfileSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Business name
                </label>
                <input
                  type="text"
                  value={profileForm.businessName}
                  onChange={(event) =>
                    handleProfileInputChange("businessName", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    County
                  </label>
                  <input
                    type="text"
                    value={profileForm.county}
                    onChange={(event) =>
                      handleProfileInputChange("county", event.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Town
                  </label>
                  <input
                    type="text"
                    value={profileForm.town}
                    onChange={(event) =>
                      handleProfileInputChange("town", event.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Estate
                  </label>
                  <input
                    type="text"
                    value={profileForm.estate}
                    onChange={(event) =>
                      handleProfileInputChange("estate", event.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Phone number
                  </label>
                  <input
                    type="tel"
                    value={profileForm.phoneNumber}
                    onChange={(event) =>
                      handleProfileInputChange("phoneNumber", event.target.value)
                    }
                    placeholder="+254..."
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Mode of payment
                  </label>
                  <select
                    value={profileForm.paymentMode}
                    onChange={(event) =>
                      handleProfileInputChange(
                        "paymentMode",
                        event.target.value as PaymentMode | ""
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  >
                    <option value="">Choose payment mode</option>
                    {paymentModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {paymentModeLabels[mode]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Goods or services offered
                </label>
                <textarea
                  value={profileForm.description}
                  onChange={(event) =>
                    handleProfileInputChange("description", event.target.value)
                  }
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isProfileSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isProfileSubmitting ? "Saving..." : "Save and open dashboard"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isInboxOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Inbox</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Account alerts and messages.
                </p>
              </div>
              <button
                onClick={() => setIsInboxOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                x
              </button>
            </div>
            <div className="mt-5 divide-y rounded-lg border border-gray-100">
              {inboxItems.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-500">
                  No messages yet.
                </div>
              ) : (
                inboxItems.map((item) => (
                  <div key={item.id} className="px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {item.body}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${item.variant === "warning"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700"
                          }`}
                      >
                        {item.variant === "warning" ? "Action" : "Info"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setIsInboxOpen(false)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isSuppliersDrawerOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Suppliers
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Find available suppliers by business name or location.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSuppliersDrawerOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close suppliers drawer"
                >
                  x
                </button>
              </div>
              <div className="mt-4">
                <input
                  type="search"
                  value={supplierSearch}
                  onChange={(event) => setSupplierSearch(event.target.value)}
                  placeholder="Search supplier or location"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {isSuppliersLoading ? (
                <InlineListSkeleton rows={4} framed />
              ) : filteredSuppliers.length === 0 ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  No suppliers found.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSuppliers.map((supplier) => (
                    <button
                      type="button"
                      key={supplier.id}
                      onClick={() => router.push(`/suppliers/${supplier.id}`)}
                      className="w-full rounded-lg border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                    >
                      <h4 className="text-base font-semibold text-gray-900">
                        {supplier.businessName}
                      </h4>
                      {supplier.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-gray-700">
                          {supplier.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-gray-500">
                        {[supplier.county, supplier.town, supplier.estate]
                          .filter(Boolean)
                          .join(", ") || "Location not added"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isCustomersDrawerOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Customers
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Businesses that have ordered from your store.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCustomersDrawerOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close customers drawer"
                >
                  x
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {isCustomersLoading ? (
                <InlineListSkeleton rows={4} framed />
              ) : supplierCustomers.length === 0 ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  No business customers yet. They will appear here after sending
                  an order from your store.
                </div>
              ) : (
                <div className="space-y-4">
                  {supplierCustomers.map((customer) => (
                    <div
                      key={customer.profile.userId}
                      className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-base font-semibold text-gray-900">
                            {customer.profile.businessName || "Business"}
                          </h4>
                          <p className="mt-1 text-sm text-gray-500">
                            {[
                              customer.profile.county,
                              customer.profile.town,
                              customer.profile.estate,
                            ]
                              .filter(Boolean)
                              .join(", ") || "Location not added"}
                          </p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                          Last order{" "}
                          {customer.lastOrderAt
                            ? formatDate(customer.lastOrderAt)
                            : "unknown"}
                        </span>
                      </div>

                      <div className="mt-4 space-y-3">
                        {customer.stockItems.length === 0 ? (
                          <div className="rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-500">
                            No matching business stock items found yet.
                          </div>
                        ) : (
                          customer.stockItems.map((item) => (
                            <div
                              key={item.id}
                              className="grid gap-3 rounded-lg border border-gray-100 px-3 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                            >
                              <div>
                                <p className="font-medium text-gray-900">
                                  {item.product}
                                </p>
                                <p className="text-sm text-gray-500">
                                  Current stock: {item.quantity}
                                </p>
                              </div>
                              <span
                                className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${item.isLow
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-emerald-50 text-emerald-700"
                                  }`}
                              >
                                {item.status}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSendRestockRequest(customer, item)
                                }
                                disabled={restockRequestIds[item.id]}
                                className="inline-flex items-center justify-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-200"
                              >
                                {restockRequestIds[item.id]
                                  ? "Sending..."
                                  : "Request restock"}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isRiskDialogOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Check Holwa Trade Score
              </h3>
              <button
                onClick={() => setIsRiskDialogOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={handleCheckRisk}>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Customer phone number
                </label>
                <input
                  type="tel"
                  value={riskPhone}
                  onChange={(event) => setRiskPhone(event.target.value)}
                  placeholder="+254..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              {riskError ? (
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {riskError}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={isRiskChecking}
                className="inline-flex w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-200"
              >
                {isRiskChecking ? "Checking..." : "Check Trade Score"}
              </button>
            </form>
            {riskResult ? (
              <div className="mt-4">
                <RiskSummaryCard result={riskResult} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isAddDialogOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Add Credit
              </h3>
              <button
                onClick={() => setIsAddDialogOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={handleAddCredit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Customer name
                </label>
                <input
                  type="text"
                  value={formState.customerName}
                  onChange={handleInputChange("customerName")}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Customer phone
                </label>
                <input
                  type="tel"
                  value={formState.customerPhone}
                  onChange={handleInputChange("customerPhone")}
                  placeholder="+254..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Items taken
                </label>
                <div className="mt-2 space-y-3 max-h-72 overflow-y-auto pr-1">
                  {formState.items.map((item, index) => (
                    <div
                      key={item.id}
                      className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-center"
                    >
                      <input
                        type="text"
                        value={item.name}
                        onChange={(event) =>
                          handleItemChange(index, "name", event.target.value)
                        }
                        placeholder="Item name"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        required
                      />
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={item.quantity}
                        onChange={(event) =>
                          handleItemChange(index, "quantity", event.target.value)
                        }
                        placeholder="Qty"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        required
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) =>
                          handleItemChange(index, "unitPrice", event.target.value)
                        }
                        placeholder="Unit price"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        required
                      />
                      <div className="flex items-center rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 md:justify-end">
                        {formatMoney(
                          Number(item.quantity || 0) * Number(item.unitPrice || 0)
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 md:justify-self-end"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-sm font-medium text-blue-700 hover:text-blue-600"
                  >
                    + Add another item
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Amount paid (optional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.amountPaid}
                  onChange={handleInputChange("amountPaid")}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Due date
                </label>
                <input
                  type="date"
                  value={formState.dueDate}
                  onChange={handleInputChange("dueDate")}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddDialogOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                >
                  {isSubmitting ? "Saving..." : "Save Credit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isTopupOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Load Credits
              </h3>
              <button
                type="button"
                onClick={() => void closeTopupDialog()}
                disabled={isTopupInProgress}
                className="text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Close load credits"
              >
                ✕
              </button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={handleTopup}>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Phone number
                </label>
                <input
                  type="tel"
                  value={topupPhone}
                  onChange={(event) => setTopupPhone(event.target.value)}
                  placeholder="07... or +254..."
                  disabled={isTopupInProgress || isTopupFinal}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Amount (KES)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={topupAmount}
                  onChange={(event) => setTopupAmount(event.target.value)}
                  disabled={isTopupInProgress || isTopupFinal}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${topupToneClasses[topupStatus.tone]}`}
                role={topupStatus.tone === "error" ? "alert" : "status"}
              >
                <p className="font-semibold">{topupStatus.title}</p>
                <p className="mt-1">{topupStatus.message}</p>
                {isTopupInProgress ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-700" />
                  </div>
                ) : null}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                {isTopupFinal ? (
                  <button
                    type="button"
                    onClick={() => void closeTopupDialog()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                  >
                    Close
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void closeTopupDialog()}
                      disabled={isTopupInProgress}
                      className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isTopupSubmitting || isTopupInProgress}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {topupStatus.stage === "sending"
                        ? "Sending..."
                        : topupStatus.stage === "waiting"
                          ? "Waiting..."
                          : "Send STK Push"}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedCustomerGroup ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Creditor Details
              </h3>
              <button
                onClick={() => setSelectedCustomerKey(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500">Customer</span>
                <span className="font-medium">{selectedCustomerGroup.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total unpaid</span>
                <span className="font-medium">
                  {formatMoney(selectedCustomerGroup.totalUnpaid)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Open credits</span>
                <span className="font-medium">{selectedCustomerGroup.unpaidCredits.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Phone</span>
                <span className="font-medium">{selectedCustomerGroup.phone}</span>
              </div>
              {getRiskResultForPhone(selectedCustomerGroup.phone) ? (
                <RiskSummaryCard
                  result={getRiskResultForPhone(selectedCustomerGroup.phone)!}
                />
              ) : (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-blue-900">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Holwa Trade Score
                      </p>
                      <p className="mt-1 text-sm text-blue-700">
                        Check the trade score for this customer.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openRiskDialog(selectedCustomerGroup.phone)}
                      className="inline-flex items-center justify-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
                    >
                      Check Risk
                    </button>
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Earliest due</span>
                <span className="font-medium">
                  {selectedCustomerGroup.earliestDueDate
                    ? formatDate(selectedCustomerGroup.earliestDueDate)
                    : "No unpaid credit"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className="font-medium">
                  {statusLabels[selectedCustomerGroup.status]}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Unpaid items</span>
                <span className="font-medium">
                  {totalItemQuantity(selectedCustomerGroup.unpaidItems)}
                </span>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs uppercase text-gray-400">Unpaid item details</p>
                <div className="mt-2 space-y-2">
                  {selectedCustomerGroup.unpaidItems.length === 0 ? (
                    <p className="text-sm text-gray-500">No unpaid items.</p>
                  ) : null}
                  {selectedCustomerGroup.unpaidItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-sm text-gray-700"
                    >
                      <span>
                        {item.name} ({item.quantity} ×{" "}
                        {formatMoney(item.unitPrice)})
                      </span>
                      <span className="font-medium">{formatMoney(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white">
                <div className="border-b border-gray-100 px-3 py-2">
                  <p className="text-xs uppercase text-gray-400">Credit records</p>
                </div>
                <div className="divide-y">
                  {selectedCustomerGroup.credits.map((record) => (
                    <div key={record.id} className="space-y-3 px-3 py-3">
                      <div className="grid gap-3 md:grid-cols-6">
                        <div>
                          <p className="text-xs text-gray-500">Total</p>
                          <p className="font-medium">
                            {formatMoney(Number(record.totalAmount))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Paid</p>
                          <p className="font-medium">
                            {formatMoney(Number(record.amountPaid))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Balance</p>
                          <p className="font-medium">
                            {formatMoney(amountOwed(record))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Due date</p>
                          <p className="font-medium">
                            {formatDate(record.dueDate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Items</p>
                          <p className="font-medium">
                            {totalItemQuantity(record.items)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Created</p>
                          <p className="font-medium">
                            {formatDate(record.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <select
                          value={record.status}
                          onChange={(event) =>
                            handleStatusChange(
                              record.id,
                              event.target.value as CreditRecord["status"]
                            )
                          }
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openPaymentDialog(record)}
                            disabled={!isUnpaid(record)}
                            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Record payment
                          </button>
                          <button
                            onClick={() => handleRemind(record.id)}
                            disabled={!isUnpaid(record)}
                            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Remind
                          </button>
                          <button
                            onClick={() => handleDeleteCredit(record.id)}
                            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                        <p className="text-xs uppercase text-gray-400">
                          Payment history
                        </p>
                        <div className="mt-2 space-y-2">
                          {record.payments?.length ? (
                            record.payments.map((payment) => (
                              <div
                                key={payment.id}
                                className="flex flex-col gap-1 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <span className="font-medium">
                                  {formatMoney(Number(payment.amount))}
                                </span>
                                <span className="text-gray-500">
                                  {formatDate(payment.createdAt)}
                                  {payment.note ? ` - ${payment.note}` : ""}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-500">
                              No payments recorded yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedCustomerKey(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {paymentCredit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Record Payment
              </h3>
              <button
                onClick={() => setPaymentCredit(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Customer</span>
                <span className="font-medium text-gray-900">
                  {paymentCredit.customer?.name || paymentCredit.customerName}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span className="text-gray-500">Balance</span>
                <span className="font-medium text-gray-900">
                  {formatMoney(amountOwed(paymentCredit))}
                </span>
              </div>
            </div>
            <form className="mt-4 space-y-4" onSubmit={handleRecordPayment}>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Amount received
                </label>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, amountOwed(paymentCredit))}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
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
              {paymentError ? (
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {paymentError}
                </div>
              ) : null}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentCredit(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPaymentSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-200"
                >
                  {isPaymentSubmitting ? "Saving..." : "Save payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {isStockDialogOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                {stockEditingItem
                  ? isSupplierDashboard
                    ? "Edit store item"
                    : "Edit stock"
                  : isSupplierDashboard
                    ? "Add store item"
                    : "Add stock"}
              </h3>
              <button
                onClick={() => {
                  setIsStockDialogOpen(false);
                  resetStockForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={handleSaveStock}>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Product
                </label>
                <input
                  type="text"
                  value={stockForm.product}
                  onChange={handleStockInputChange("product")}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              {!isSupplierDashboard ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Buying price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={stockForm.buyingPrice}
                    onChange={handleStockInputChange("buyingPrice")}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
              ) : null}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {isSupplierDashboard ? "Price" : "Selling price"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stockForm.sellingPrice}
                  onChange={handleStockInputChange("sellingPrice")}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              {!isSupplierDashboard ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={stockForm.quantity}
                    onChange={handleStockInputChange("quantity")}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
              ) : null}
              {!isSupplierDashboard ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Supplier phone
                  </label>
                  <input
                    type="tel"
                    value={stockForm.supplierPhone}
                    onChange={handleStockInputChange("supplierPhone")}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
              ) : null}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Offers (Text)
                </label>
                <textarea
                  value={stockForm.offers}
                  onChange={handleStockInputChange("offers")}
                  rows={3}
                  placeholder="Example: Free delivery, bulk discount, limited offer"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsStockDialogOpen(false);
                    resetStockForm();
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isStockSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                >
                  {isStockSubmitting
                    ? "Saving..."
                    : stockEditingItem
                      ? "Save changes"
                      : isSupplierDashboard
                        ? "Save item"
                        : "Save stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {selectedStock && !isSupplierDashboard ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Stock details
              </h3>
              <button
                onClick={() => setSelectedStock(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500">Product</span>
                <span className="font-medium">{selectedStock.product}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Buying price</span>
                <span className="font-medium">
                  {formatMoney(Number(selectedStock.buyingPrice))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Selling price</span>
                <span className="font-medium">
                  {formatMoney(Number(selectedStock.sellingPrice))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Quantity</span>
                <span className="font-medium">{selectedStock.quantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Supplier phone</span>
                <span className="font-medium">
                  {selectedStock.supplierPhone}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="font-medium">
                  {formatDate(selectedStock.createdAt)}
                </span>
              </div>
              <div className="pt-2">
                <label className="block text-sm font-medium text-gray-700">
                  Reduce quantity
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={stockReduceAmounts[selectedStock.id] || ""}
                    onChange={(event) =>
                      setStockReduceAmounts((prev) => ({
                        ...prev,
                        [selectedStock.id]: event.target.value,
                      }))
                    }
                    placeholder="Qty sold"
                    className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    onClick={() => handleReduceStock(selectedStock.id)}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                  >
                    Reduce
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => handleNotifySupplier(selectedStock.id)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                Notify supplier
              </button>
              <button
                onClick={() => setSelectedStock(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${toast.variant === "success"
                ? "bg-emerald-600 text-white"
                : "bg-amber-500 text-white"
              }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}
