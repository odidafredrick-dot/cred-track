"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import {
  AuthLoadingScreen,
  SupplierStoreSkeleton,
} from "@/components/loading-states";
import { roleLabels, type PaymentMode, type UserRole } from "@/lib/user-profile";

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

type StoreItem = {
  id: string;
  product: string;
  sellingPrice: string | number;
  quantity: number;
  offers: string | null;
};

type StoreResponse = {
  supplier: UserProfile;
  buyerProfile: UserProfile;
  items: StoreItem[];
};

type OrderResponse = {
  order: {
    id: string;
    smsStatus: string | null;
    totalAmount: string | number;
  };
  warning?: string;
  error?: string;
};

const selectedRoleStorageKey = "holwa:selected-role";

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatLocation(profile: UserProfile | null) {
  if (!profile) {
    return "Location not added";
  }

  return (
    [profile.county, profile.town, profile.estate].filter(Boolean).join(", ") ||
    "Location not added"
  );
}

export default function SupplierStorePage() {
  const router = useRouter();
  const params = useParams<{ supplierId: string }>();
  const sessionResult = useSession();
  const session = sessionResult.data;
  const isPending = sessionResult.isPending;
  const [supplier, setSupplier] = useState<UserProfile | null>(null);
  const [buyerProfile, setBuyerProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/");
    }
  }, [isPending, router, session]);

  useEffect(() => {
    if (!session?.user?.id || !params.supplierId) {
      return;
    }

    let isActive = true;

    const loadStore = async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/suppliers/${params.supplierId}?buyerUserId=${session.user.id}`
        );

        if (response.status === 403) {
          throw new Error("Only business users can view supplier stores.");
        }

        if (!response.ok) {
          throw new Error("Failed to load supplier store.");
        }

        const data = (await response.json()) as StoreResponse;

        if (!isActive) {
          return;
        }

        setSupplier(data.supplier);
        setBuyerProfile(data.buyerProfile);
        setItems(data.items || []);
      } catch (err) {
        if (isActive) {
          setError(
            err instanceof Error ? err.message : "Failed to load supplier store."
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadStore();

    return () => {
      isActive = false;
    };
  }, [params.supplierId, session?.user?.id]);

  const cartItems = useMemo(
    () =>
      items
        .map((item) => ({
          ...item,
          selectedQuantity: quantities[item.id] || 0,
          price: Number(item.sellingPrice),
        }))
        .filter((item) => item.selectedQuantity > 0),
    [items, quantities]
  );

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + item.price * item.selectedQuantity,
        0
      ),
    [cartItems]
  );

  const cartItemCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.selectedQuantity, 0),
    [cartItems]
  );

  const updateQuantity = (item: StoreItem, nextQuantity: number) => {
    const quantity = Math.max(0, nextQuantity || 0);
    setQuantities((prev) => ({
      ...prev,
      [item.id]: quantity,
    }));
  };

  const handleSendOrder = async () => {
    if (!session?.user?.id || cartItems.length === 0) {
      return;
    }

    setIsSending(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/suppliers/${params.supplierId}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerUserId: session.user.id,
          items: cartItems.map((item) => ({
            stockItemId: item.id,
            quantity: item.selectedQuantity,
          })),
        }),
      });

      const data = (await response.json()) as OrderResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to send order.");
      }

      setQuantities({});
      setSuccess(
        data.warning ||
          `Order ${data.order.id} sent to ${supplier?.businessName || "supplier"}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send order.");
    } finally {
      setIsSending(false);
    }
  };

  if (isPending) {
    return <AuthLoadingScreen />;
  }

  if (!session) {
    return null;
  }

  if (isLoading) {
    return <SupplierStoreSkeleton />;
  }

  if (error && !supplier) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-red-100 bg-red-50 p-5 text-sm text-red-700">
          {error}
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
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            {buyerProfile ? roleLabels[buyerProfile.role] : "Business"}
          </span>
        </div>

        <section className="border-b border-gray-200 bg-white px-5 py-6 shadow-sm sm:rounded-lg sm:border">
          <p className="text-sm font-medium text-blue-700">Supplier store</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950">
            {supplier?.businessName}
          </h1>
          <p className="mt-2 text-sm text-gray-600">{formatLocation(supplier)}</p>
          {supplier?.description ? (
            <p className="mt-3 max-w-3xl text-sm text-gray-700">
              {supplier.description}
            </p>
          ) : null}
        </section>

        {error ? (
          <div className="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-5 rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="min-w-0 rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-950">In Store</h2>
            </div>

            {items.length === 0 ? (
              <div className="px-5 py-8 text-sm text-gray-500">
                This supplier has not added store items yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((item) => {
                  const quantity = quantities[item.id] || 0;

                  return (
                    <div
                      key={item.id}
                      className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-950">
                          {item.product}
                        </h3>
                        <p className="mt-1 text-sm font-medium text-gray-800">
                          {formatMoney(Number(item.sellingPrice))}
                        </p>
                        {item.offers ? (
                          <p className="mt-1 text-sm text-gray-500">
                            {item.offers}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex h-11 items-center justify-between rounded-lg border border-gray-300 bg-white sm:w-40">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item, quantity - 1)}
                          className="h-full w-11 text-lg font-semibold text-gray-600 hover:bg-gray-50"
                          aria-label={`Reduce ${item.product}`}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={quantity}
                          onChange={(event) =>
                            updateQuantity(item, Number(event.target.value))
                          }
                          className="h-full w-16 border-x border-gray-200 bg-white text-center text-sm font-semibold text-gray-950 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(item, quantity + 1)}
                          className="h-full w-11 text-lg font-semibold text-gray-600 hover:bg-gray-50"
                          aria-label={`Add ${item.product}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="h-fit rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-950">Cart</h2>
            </div>

            {cartItems.length === 0 ? (
              <div className="px-5 py-6 text-sm text-gray-500">
                Select items from the supplier store.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {cartItems.map((item) => (
                  <div key={item.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-950">
                          {item.product}
                        </p>
                        <p className="text-sm text-gray-500">
                          {item.selectedQuantity} x {formatMoney(item.price)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-gray-950">
                        {formatMoney(item.price * item.selectedQuantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-gray-200 px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-gray-500">Items selected</span>
                <strong className="text-sm text-gray-950">{cartItemCount}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total</span>
                <strong className="text-lg text-gray-950">
                  {formatMoney(cartTotal)}
                </strong>
              </div>
              <button
                type="button"
                onClick={handleSendOrder}
                disabled={isSending || cartItems.length === 0}
                className="mt-4 w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-200"
              >
                {isSending ? "Sending..." : "Send order via SMS"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
