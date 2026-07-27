"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  authRedirectErrorEvent,
  authRedirectErrorKey,
  signIn,
  signUp,
} from "@/lib/auth-client";
import { isUserRole, roleLabels, type UserRole } from "@/lib/user-profile";

const selectedRoleStorageKey = "holwa:selected-role";

const roleOptions: Array<{
  role: UserRole;
  title: string;
  description: string;
}> = [
  {
    role: "BUSINESS",
    title: "Business",
    description: "Track customers, stock, payments, and reminders.",
  },
  {
    role: "SUPPLIER",
    title: "Supplier",
    description: "Manage supply requests and customer updates.",
  },
  {
    role: "INDIVIDUAL",
    title: "Individual",
    description: "View your inbox and manage personal credit activity.",
  },
];

export default function SignUpPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    const params = new URLSearchParams(window.location.search);
    const roleFromUrl = params.get("role");
    const roleFromStorage = window.localStorage.getItem(
      selectedRoleStorageKey
    );
    const role = isUserRole(roleFromUrl)
      ? roleFromUrl
      : isUserRole(roleFromStorage)
      ? roleFromStorage
      : null;

    if (role) {
      window.localStorage.setItem(selectedRoleStorageKey, role);
      setSelectedRole(role);
    }

    window.addEventListener(authRedirectErrorEvent, handleRedirectError);

    return () => {
      window.removeEventListener(authRedirectErrorEvent, handleRedirectError);
    };
  }, []);

  const rememberSelectedRole = () => {
    if (selectedRole) {
      window.localStorage.setItem(selectedRoleStorageKey, selectedRole);
    }
  };

  const dashboardPath =
    selectedRole === "INDIVIDUAL" ? "/dashboard" : "/profile?setup=1";

  const handlePhoneSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedRole) {
      setError("Choose an account type before creating your account.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
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
        name,
      });

      if (result.error) {
        setError(result.error.message || "Failed to sign up");
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

  const handleGoogleSignUp = async () => {
    setError("");

    if (!selectedRole) {
      setError("Choose an account type before creating your account.");
      return;
    }

    setIsLoading(true);
    rememberSelectedRole();

    try {
      const result = await signIn.social({
        provider: "google",
        callbackURL: dashboardPath,
      });

      if (result.error) {
        setError(result.error.message || "Failed to sign up with Google");
        setIsLoading(false);
      }
    } catch (err) {
      setError("Failed to sign up with Google");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-emerald-100 px-4 py-12">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-xl">
        {/* Logo/Header */}
        <div className="text-center">
          <div className="flex justify-center items-center gap-2 mb-2">
            <Image src="/logo.jpeg" alt="Holwa logo" width={36} height={36} />
            <h1 className="text-4xl font-bold text-blue-700">Holwa</h1>
          </div>
          <h2 className="text-2xl font-semibold text-gray-800">Create your account</h2>
          <p className="mt-2 text-sm text-gray-600">
            {selectedRole
              ? `Join Holwa as ${roleLabels[selectedRole]}`
              : "Join Holwa to start tracking credits"}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Phone/Password Form */}
        <form onSubmit={handlePhoneSignUp} className="mt-8 space-y-6">
          <div>
            <p className="mb-3 block text-sm font-medium text-gray-700">
              Account type
            </p>
            <div className="grid gap-3">
              {roleOptions.map((option) => {
                const isSelected = selectedRole === option.role;

                return (
                  <button
                    key={option.role}
                    type="button"
                    onClick={() => {
                      setSelectedRole(option.role);
                      window.localStorage.setItem(
                        selectedRoleStorageKey,
                        option.role
                      );
                      setError("");
                    }}
                    className={`rounded-lg border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                      isSelected
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50"
                    }`}
                    aria-pressed={isSelected}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-gray-900">
                        {option.title}
                      </span>
                      <span
                        className={`h-3 w-3 rounded-full border ${
                          isSelected
                            ? "border-blue-700 bg-blue-700"
                            : "border-gray-300"
                        }`}
                      />
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-gray-600">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Full name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                placeholder="Enter your full name"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
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
                className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                placeholder="+254..."
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                placeholder="Create a password (min. 8 characters)"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                placeholder="Confirm your password"
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              required
              className="h-4 w-4 text-blue-700 focus:ring-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="terms" className="ml-2 block text-sm text-gray-700">
              I agree to the{" "}
              <a href="#" className="text-blue-700 hover:text-blue-600">
                Terms and Conditions
              </a>
            </label>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isLoading ? "Creating account..." : "Create account"}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with</span>
          </div>
        </div>

        {/* Google Sign Up */}
        <div>
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
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
            Sign up with Google
          </button>
        </div>

        {/* Sign In Link */}
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/" className="font-medium text-blue-700 hover:text-blue-600">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
