"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasPendingAuthRedirect, signOut, useSession } from "@/lib/auth-client";
import {
  isUserRole,
  needsBusinessProfile,
  paymentModeLabels,
  paymentModes,
  roleLabels,
  type PaymentMode,
  type UserRole,
} from "@/lib/user-profile";

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

export default function ProfilePage() {
  const router = useRouter();
  const sessionResult = useSession();
  const session = sessionResult.data;
  const isPending = sessionResult.isPending;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileRole, setProfileRole] = useState<UserRole | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyProfileForm);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const profileImage =
    session?.user && "image" in session.user ? session.user.image : null;
  const displayName =
    profile?.businessName || session?.user?.name || "Holwa user";
  const displayEmail = session?.user?.email || "No email";
  const displayRole = profileRole ? roleLabels[profileRole] : "Account";
  const mustCompleteProfile =
    profileRole && needsBusinessProfile(profileRole) && !profile
      ? true
      : profile
      ? !hasBusinessProfileDetails(profile)
      : false;

  useEffect(() => {
    if (!isPending && !session) {
      if (hasPendingAuthRedirect()) {
        return;
      }

      router.push("/");
    }
  }, [isPending, router, session]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    let isActive = true;

    const loadProfile = async () => {
      setIsLoadingProfile(true);
      setError("");

      const storedRole = window.localStorage.getItem(selectedRoleStorageKey);
      const selectedRole = isUserRole(storedRole) ? storedRole : null;

      try {
        const response = await fetch(`/api/profile?userId=${session.user.id}`);
        if (!response.ok) {
          throw new Error("Failed to load profile");
        }

        const data = (await response.json()) as {
          profile: UserProfile | null;
        };

        if (!isActive) {
          return;
        }

        if (data.profile) {
          setProfile(data.profile);
          setProfileRole(selectedRole || data.profile.role);
          setForm(toProfileForm(data.profile));
          return;
        }

        if (selectedRole) {
          setProfileRole(selectedRole);
        }
      } catch (err) {
        if (isActive) {
          setError("Failed to load profile.");
        }
      } finally {
        if (isActive) {
          setIsLoadingProfile(false);
        }
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [session?.user?.id]);

  const handleInputChange = <K extends keyof ProfileForm>(
    field: K,
    value: ProfileForm[K]
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!session?.user?.id || !profileRole) {
      return;
    }

    setError("");

    if (
      needsBusinessProfile(profileRole) &&
      (!form.businessName ||
        !form.county ||
        !form.town ||
        !form.estate ||
        !form.phoneNumber ||
        !form.paymentMode ||
        !form.description)
    ) {
      setError("Please complete all profile fields.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          role: profileRole,
          businessName: form.businessName.trim(),
          county: form.county.trim(),
          town: form.town.trim(),
          estate: form.estate.trim(),
          phoneNumber: form.phoneNumber.trim(),
          paymentMode: form.paymentMode,
          description: form.description.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || "Failed to save profile.");
        return;
      }

      setProfile(data.profile);
      window.localStorage.removeItem(selectedRoleStorageKey);
      router.push("/dashboard");
    } finally {
      setIsSaving(false);
    }
  };

  if (isPending || isLoadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-lg text-gray-700">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-xl text-gray-700 shadow-sm hover:bg-gray-50"
            aria-label="Back to dashboard"
          >
            {"<"}
          </button>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Log out
          </button>
        </div>

        <section className="mt-4 bg-white px-6 py-8 text-center shadow-sm sm:rounded-lg">
          <div className="relative mx-auto h-32 w-32">
            {profileImage ? (
              <img
                src={profileImage}
                alt=""
                className="h-32 w-32 rounded-full object-cover ring-4 ring-blue-50"
              />
            ) : (
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-blue-700 text-4xl font-semibold text-white ring-4 ring-blue-50">
                {(displayName || "H").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white shadow">
              +
            </div>
          </div>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">
            {displayName}
          </h1>
          <p className="mt-1 text-sm font-medium text-blue-700">
            {displayRole}
          </p>
        </section>

        <section className="mt-6 bg-white shadow-sm sm:rounded-lg">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Account</h2>
          </div>
          <div className="space-y-3 px-6 py-5">
            <div className="grid gap-2 rounded-lg bg-gray-50 px-4 py-4 sm:grid-cols-[160px_1fr]">
              <span className="text-sm text-gray-500">Name</span>
              <span className="font-medium text-gray-900">{displayName}</span>
            </div>
            <div className="grid gap-2 rounded-lg bg-gray-50 px-4 py-4 sm:grid-cols-[160px_1fr]">
              <span className="text-sm text-gray-500">Email</span>
              <span className="font-medium text-gray-900">{displayEmail}</span>
            </div>
            <div className="grid gap-2 rounded-lg bg-gray-50 px-4 py-4 sm:grid-cols-[160px_1fr]">
              <span className="text-sm text-gray-500">Role</span>
              <span className="font-medium text-gray-900">{displayRole}</span>
            </div>
          </div>
        </section>

        {profileRole && needsBusinessProfile(profileRole) ? (
          <section className="mt-6 bg-white shadow-sm sm:rounded-lg">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {mustCompleteProfile ? "Complete profile" : "Profile details"}
              </h2>
            </div>

            <form className="space-y-4 px-6 py-5" onSubmit={handleSave}>
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Business name
                </label>
                <input
                  type="text"
                  value={form.businessName}
                  onChange={(event) =>
                    handleInputChange("businessName", event.target.value)
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
                    value={form.county}
                    onChange={(event) =>
                      handleInputChange("county", event.target.value)
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
                    value={form.town}
                    onChange={(event) =>
                      handleInputChange("town", event.target.value)
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
                    value={form.estate}
                    onChange={(event) =>
                      handleInputChange("estate", event.target.value)
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
                    value={form.phoneNumber}
                    onChange={(event) =>
                      handleInputChange("phoneNumber", event.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Mode of payment
                  </label>
                  <select
                    value={form.paymentMode}
                    onChange={(event) =>
                      handleInputChange(
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
                  value={form.description}
                  onChange={(event) =>
                    handleInputChange("description", event.target.value)
                  }
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save profile"}
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}
