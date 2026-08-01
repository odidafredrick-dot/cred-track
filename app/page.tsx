"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  authRedirectErrorEvent,
  authRedirectErrorKey,
  hasPendingAuthRedirect,
  signIn,
  signUp,
  useSession,
} from "@/lib/auth-client";
import { roleLabels, type UserRole } from "@/lib/user-profile";

type AuthMode = "signin" | "signup";

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
const desktopBreakpoint = 1024;

export default function LoginPage() {
  const router = useRouter();
  const sessionResult = useSession();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

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

  useEffect(() => {
    const updateViewportMode = () => {
      setIsDesktop(window.innerWidth >= desktopBreakpoint);
    };

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    if (sessionResult.data?.user) {
      if (hasPendingAuthRedirect()) {
        return;
      }

      window.sessionStorage.removeItem(authRedirectErrorKey);
      setError("");
      router.replace("/dashboard");
    }
  }, [router, sessionResult.data?.user]);

  const rememberSelectedRole = (role = selectedRole) => {
    if (role) {
      window.localStorage.setItem(selectedRoleStorageKey, role);
    }
  };

  const dashboardPath =
    selectedRole === "INDIVIDUAL" ? "/dashboard" : "/profile?setup=1";
  const isSignUpMode = authMode === "signup";

  const openAuthModal = (
    role: UserRole = "BUSINESS",
    mode: AuthMode = "signin"
  ) => {
    setSelectedRole(role);
    setAuthMode(mode);
    setError("");
  };

  const closeAuthModal = () => {
    if (isLoading) {
      return;
    }
    setSelectedRole(null);
    setError("");
  };

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError("");
    setPassword("");
    setConfirmPassword("");
  };

  const handlePhoneSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedRole) {
      setError("Choose how you want to continue.");
      return;
    }

    const normalized = normalizePhone(phone);
    const digits = normalized.replace(/\D/g, "");
    if (
      !normalized.startsWith("+") ||
      digits.length < 10 ||
      /[^\d+]/.test(normalized)
    ) {
      setError("Enter a valid phone number using digits only, starting with +.");
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

  const handlePhoneSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedRole) {
      setError("Choose how you want to continue.");
      return;
    }

    if (!name.trim()) {
      setError("Enter your full name.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    const normalized = normalizePhone(phone);
    const digits = normalized.replace(/\D/g, "");
    if (
      !normalized.startsWith("+") ||
      digits.length < 10 ||
      /[^\d+]/.test(normalized)
    ) {
      setError("Enter a valid phone number using digits only, starting with +.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await signUp.email({
        email: toAuthEmail(normalized),
        password,
        name: name.trim(),
      });

      if (result.error) {
        setError(result.error.message || "Failed to create account");
      } else {
        rememberSelectedRole();
        router.push(dashboardPath);
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
    <div className={`min-h-screen ${isDesktop ? "bg-slate-950 text-slate-100" : "bg-gray-50 text-gray-900"}`}>
      {isDesktop ? (
        <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between rounded-full border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <Image src="/logo.jpeg" alt="Holwa logo" width={42} height={42} className="rounded-full" />
              <div>
                <p className="text-lg font-semibold text-white">Holwa</p>
                <p className="text-sm text-slate-300">Credit tracking for Kenyan businesses</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => openAuthModal("BUSINESS", "signup")}
                className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => openAuthModal("BUSINESS", "signin")}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                Sign in
              </button>
            </div>
          </header>

          <section className="flex flex-1 flex-col justify-center py-16 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="max-w-2xl">
                <p className="inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300">
                  Built for fast-moving teams
                </p>
                <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                  Holwa credit tracking for Kenyan businesses.
                </h1>
                <p className="mt-6 text-lg leading-8 text-slate-300">
                  Track goods and services credit, customer balances, supplier orders, stock, M-Pesa payments, and reminders without juggling scattered notes.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => openAuthModal("BUSINESS", "signup")}
                    className="rounded-full bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500"
                  >
                    Get started
                  </button>
                  <a href="#features" className="rounded-full border border-slate-700 px-6 py-3 font-semibold text-slate-200 transition hover:bg-slate-800">
                    Explore features
                  </a>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
                <h3 className="text-xl font-semibold text-white">What Holwa helps you manage</h3>
                <ul className="mt-5 space-y-4 text-sm leading-7 text-slate-300">
                  <li className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">Track customer credit balances and outstanding payments.</li>
                  <li className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">Send reminders and keep every follow-up inside one dashboard.</li>
                  <li className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">Give business, supplier, and individual teams the right view of the work.</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="features" className="pb-16">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="text-lg font-semibold text-white">Simple workflows</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">Move from credit review to payment follow-up in a few clicks.</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="text-lg font-semibold text-white">Role-based access</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">Business, supplier, and personal accounts each get their own streamlined view.</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="text-lg font-semibold text-white">Trusted by growing teams</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">Designed to keep records organized while reducing missed follow-ups and delays.</p>
              </div>
            </div>
          </section>

          <section className="pb-16">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">Privacy and trust</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Useful documents for every user</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">Review the key policies, terms, and security guidance before you start using Holwa.</p>
                </div>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <Link href="/privacy" className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 transition hover:border-blue-500">
                  <h4 className="font-semibold text-white">Privacy Policy</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-300">How we collect, protect, and use account information.</p>
                </Link>
                <Link href="/terms" className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 transition hover:border-blue-500">
                  <h4 className="font-semibold text-white">Terms of Service</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-300">The rules for using Holwa and accessing your workspace.</p>
                </Link>
                <Link href="/policy" className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 transition hover:border-blue-500">
                  <h4 className="font-semibold text-white">Security & Data Policy</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-300">What we do to keep your data secure and your account safe.</p>
                </Link>
              </div>
            </div>
          </section>
        </main>
      ) : (
        <>
          <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image src="/logo.jpeg" alt="Holwa logo" width={36} height={36} />
                <h1 className="text-3xl font-bold text-blue-700">Holwa</h1>
              </div>
              <button
                type="button"
                onClick={() => openAuthModal("BUSINESS", "signup")}
                className="text-sm font-medium text-blue-700 hover:text-blue-600"
              >
                Create account
              </button>
            </div>

            <section className="flex flex-1 flex-col justify-center py-12">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-emerald-700">
                  Choose your workspace
                </p>
                <h1 className="mt-3 text-4xl font-bold text-gray-900 sm:text-5xl">
                  Holwa credit tracking for Kenyan businesses.
                </h1>
                <p className="mt-4 max-w-xl text-base text-gray-600">
                  Sign in once to track goods and services credit, customer balances,
                  supplier orders, stock, M-Pesa payments, and reminders.
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
                    onClick={() => openAuthModal(option.role, "signin")}
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
        </>
      )}

      {selectedRole ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 text-gray-900 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-700">
                  {roleLabels[selectedRole]}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-gray-900">
                  {isSignUpMode ? "Create your account" : "Sign in to continue"}
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

            {isSignUpMode ? (
              <div className="mt-5 grid grid-cols-3 gap-2">
                {roleOptions.map((option) => (
                  <button
                    key={option.role}
                    type="button"
                    onClick={() => {
                      setSelectedRole(option.role);
                      setError("");
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      selectedRole === option.role
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                  >
                    {roleLabels[option.role]}
                  </button>
                ))}
              </div>
            ) : null}

            <form
              onSubmit={isSignUpMode ? handlePhoneSignUp : handlePhoneSignIn}
              className="mt-6 space-y-4"
            >
              {isSignUpMode ? (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Full name
                  </label>
                  <input
                    id="auth-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Enter your full name"
                  />
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="auth-phone"
                  className="block text-sm font-medium text-gray-700"
                >
                  Phone number
                </label>
                <input
                  id="auth-phone"
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
                  htmlFor="auth-password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={isSignUpMode ? "new-password" : "current-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder={
                    isSignUpMode
                      ? "Create a password"
                      : "Enter your password"
                  }
                />
              </div>

              {isSignUpMode ? (
                <div>
                  <label
                    htmlFor="auth-confirm-password"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Confirm password
                  </label>
                  <input
                    id="auth-confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Confirm your password"
                  />
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full justify-center rounded-lg border border-transparent bg-blue-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading
                  ? isSignUpMode
                    ? "Creating account..."
                    : "Signing in..."
                  : isSignUpMode
                  ? "Create account"
                  : "Sign in"}
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
              {isSignUpMode ? "Continue with Google" : "Sign in with Google"}
            </button>

            <p className="mt-5 text-center text-sm text-gray-600">
              {isSignUpMode ? "Already have an account? " : "Do not have an account? "}
              <button
                type="button"
                onClick={() => switchAuthMode(isSignUpMode ? "signin" : "signup")}
                className="font-medium text-blue-700 hover:text-blue-600"
              >
                {isSignUpMode ? "Sign in" : "Sign up"}
              </button>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
