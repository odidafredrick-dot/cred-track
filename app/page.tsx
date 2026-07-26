"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  authRedirectErrorEvent,
  authRedirectErrorKey,
  signIn,
} from "@/lib/auth-client";
import { roleLabels, type UserRole } from "@/lib/user-profile";

const roleOptions: Array<{
  role: UserRole;
  title: string;
  description: string;
}> = [
  {
    role: "BUSINESS",
    title: "Continue as Business",
    description: "Track customers, stock, payments, and reminders.",
  },
  {
    role: "SUPPLIER",
    title: "Continue as Supplier",
    description: "Manage supply requests, customer updates, and messages.",
  },
  {
    role: "INDIVIDUAL",
    title: "Continue as Individual",
    description: "View your inbox and manage personal credit activity.",
  },
];

const selectedRoleStorageKey = "holwa:selected-role";

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const normalizePhone = (value: string) => value.replace(/\s+/g, "");

  const toAuthEmail = (value: string) => {
    const normalized = normalizePhone(value);
    const digits = normalized.replace(/\D/g, "");
    return `phone-${digits}@cred.local`;
  };

  useEffect(() => {
    const handleRedirectError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;

      if (message) {
        setError(message);
      }
    };

    const redirectError = window.sessionStorage.getItem(authRedirectErrorKey);

    if (redirectError) {
      setError(redirectError);
      window.sessionStorage.removeItem(authRedirectErrorKey);
    }

    window.addEventListener(authRedirectErrorEvent, handleRedirectError);

    return () => {
      window.removeEventListener(authRedirectErrorEvent, handleRedirectError);
    };
  }, []);

  const rememberSelectedRole = (role = selectedRole) => {
    if (role) {
      window.localStorage.setItem(selectedRoleStorageKey, role);
    }
  };

  const openAuthModal = (role: UserRole) => {
    setSelectedRole(role);
    setError("");
  };

  const closeAuthModal = () => {
    if (isLoading) {
      return;
    }
    setSelectedRole(null);
    setError("");
  };

  const handlePhoneSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedRole) {
      setError("Choose how you want to continue.");
      return;
    }

    const normalized = normalizePhone(phone);
    if (!normalized.startsWith("+") || normalized.length < 10) {
      setError("Enter a valid phone number starting with +.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn.email({
        email: toAuthEmail(normalized),
        password,
      });

      if (result.error) {
        setError(result.error.message || "Failed to sign in");
      } else {
        rememberSelectedRole();
        router.push("/dashboard");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!selectedRole) {
      setError("Choose how you want to continue.");
      return;
    }

    setError("");
    setIsLoading(true);
    rememberSelectedRole();

    try {
      const result = await signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });

      if (result.error) {
        setError(result.error.message || "Failed to sign in with Google");
        setIsLoading(false);
      }
    } catch (err) {
      setError("Failed to sign in with Google");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.jpeg" alt="Holwa logo" width={36} height={36} />
            <h1 className="text-3xl font-bold text-blue-700">Holwa</h1>
          </div>
          <Link
            href="/signup"
            className="text-sm font-medium text-blue-700 hover:text-blue-600"
          >
            Create account
          </Link>
        </div>

        <section className="flex flex-1 flex-col justify-center py-12">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-emerald-700">
              Choose your workspace
            </p>
            <h2 className="mt-3 text-4xl font-bold text-gray-900 sm:text-5xl">
              Continue with the account type that fits your work.
            </h2>
            <p className="mt-4 max-w-xl text-base text-gray-600">
              Sign in once, then Holwa opens the right dashboard setup for your
              role.
            </p>
          </div>

          {error && !selectedRole ? (
            <div className="mt-6 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {roleOptions.map((option) => (
              <button
                key={option.role}
                type="button"
                onClick={() => openAuthModal(option.role)}
                className="flex min-h-44 flex-col justify-between rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <span>
                  <span className="text-lg font-semibold text-gray-900">
                    {option.title}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-gray-600">
                    {option.description}
                  </span>
                </span>
                <span className="mt-6 inline-flex text-sm font-semibold text-blue-700">
                  Sign in
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {selectedRole ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-700">
                  {roleLabels[selectedRole]}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-gray-900">
                  Sign in to continue
                </h3>
              </div>
              <button
                type="button"
                onClick={closeAuthModal}
                className="rounded-lg px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close login modal"
              >
                x
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <form onSubmit={handlePhoneSignIn} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-gray-700"
                >
                  Phone number
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="+254..."
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full justify-center rounded-lg border border-transparent bg-blue-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-medium uppercase text-gray-400">
                Or
              </span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>

            <p className="mt-5 text-center text-sm text-gray-600">
              Do not have an account?{" "}
              <Link
                href={`/signup?role=${selectedRole}`}
                onClick={() => rememberSelectedRole()}
                className="font-medium text-blue-700 hover:text-blue-600"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
