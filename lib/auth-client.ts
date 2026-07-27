"use client";

import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";

type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type Session = {
  user: SessionUser;
};

type AuthResult = {
  data?: Session;
  error?: { message: string };
};

const googleRedirectCallbackKey = "holwa:google-redirect-callback";
const selectedRoleStorageKey = "holwa:selected-role";
export const authRedirectErrorKey = "holwa:auth-redirect-error";
export const authRedirectErrorEvent = "holwa:auth-redirect-error";

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function shouldUseRedirectSignIn() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent;
  const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    window.matchMedia("(display-mode: standalone)").matches ||
    document.referrer.startsWith("android-app://");

  return isMobile;
}

function toSession(user: FirebaseUser): Session {
  return {
    user: {
      id: user.uid,
      name: user.displayName,
      email: user.email,
      image: user.photoURL,
    },
  };
}

async function syncFirebaseUser(user: FirebaseUser) {
  const response = await fetch("/api/firebase-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: user.uid,
      email: user.email || `${user.uid}@firebase.local`,
      name: user.displayName,
      image: user.photoURL,
    }),
  });

  if (!response.ok) {
    throw new Error("Could not sync your account. Please try again.");
  }
}

function toAuthError(error: unknown) {
  const code = getAuthErrorCode(error);

  const friendlyMessages: Record<string, string> = {
    "auth/argument-error":
      "Google sign-in could not start. Please close the app and try again.",
    "auth/unauthorized-domain":
      "This app domain is not authorized for Google sign-in. Please contact support.",
    "auth/network-request-failed":
      "Network error while signing in. Check your connection and try again.",
    "auth/popup-blocked":
      "Google sign-in was blocked. Please try again.",
    "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
    "auth/cancelled-popup-request":
      "Google sign-in was cancelled. Please try again.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/invalid-credential":
      "The login details are incorrect or expired. Please try again.",
    "auth/invalid-email": "Enter a valid email or phone login.",
    "auth/wrong-password": "Incorrect password. Please try again.",
  };

  return {
    message:
      friendlyMessages[code] ||
      (error instanceof Error
        ? error.message
        : "Authentication failed. Try again."),
  };
}

function getAuthErrorCode(error: unknown) {
  return (
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : ""
  );
}

function getStoredRedirectCallback() {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window.sessionStorage.getItem(googleRedirectCallbackKey) ||
    window.localStorage.getItem(googleRedirectCallbackKey)
  );
}

function setStoredRedirectCallback(callbackURL: string) {
  window.sessionStorage.setItem(googleRedirectCallbackKey, callbackURL);
  window.localStorage.setItem(googleRedirectCallbackKey, callbackURL);
}

function clearStoredRedirectCallback() {
  window.sessionStorage.removeItem(googleRedirectCallbackKey);
  window.localStorage.removeItem(googleRedirectCallbackKey);
}

export function hasPendingAuthRedirect() {
  return Boolean(getStoredRedirectCallback());
}

async function resolvePostAuthURL(user: FirebaseUser, fallbackURL = "/dashboard") {
  const profileResponse = await fetch(`/api/profile?userId=${user.uid}`);

  if (!profileResponse.ok) {
    return fallbackURL;
  }

  const data = (await profileResponse.json()) as {
    profile?: { role?: string } | null;
  };

  if (data.profile) {
    window.localStorage.removeItem(selectedRoleStorageKey);
    return "/dashboard";
  }

  const selectedRole = window.localStorage.getItem(selectedRoleStorageKey);

  if (selectedRole === "INDIVIDUAL") {
    const saveResponse = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.uid,
        role: selectedRole,
      }),
    });

    if (saveResponse.ok) {
      window.localStorage.removeItem(selectedRoleStorageKey);
      return "/dashboard";
    }
  }

  return "/profile?setup=1";
}

function waitForCurrentUser(timeoutMs = 20000) {
  if (firebaseAuth.currentUser) {
    return Promise.resolve(firebaseAuth.currentUser);
  }

  return new Promise<FirebaseUser | null>((resolve) => {
    let unsubscribe = () => {};

    const timeoutId = window.setTimeout(() => {
      unsubscribe();
      resolve(firebaseAuth.currentUser);
    }, timeoutMs);

    unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      window.clearTimeout(timeoutId);
      unsubscribe();
      resolve(user);
    });
  });
}

export const signIn = {
  email: async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<AuthResult> => {
    try {
      if (!email.trim() || !password.trim()) {
        throw new Error("Enter your phone number and password.");
      }

      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email,
        password
      );
      await syncFirebaseUser(credential.user);
      return { data: toSession(credential.user) };
    } catch (error) {
      return { error: toAuthError(error) };
    }
  },
  social: async ({
    provider,
    callbackURL = "/dashboard",
  }: {
    provider: "google";
    callbackURL?: string;
  }): Promise<AuthResult> => {
    try {
      if (provider !== "google") {
        throw new Error("Unsupported social provider");
      }

      const googleProvider = createGoogleProvider();
      let credential;

      try {
        credential = await signInWithPopup(firebaseAuth, googleProvider);
      } catch (popupError) {
        const code = getAuthErrorCode(popupError);
        const canFallBackToRedirect =
          shouldUseRedirectSignIn() &&
          (code === "auth/popup-blocked" ||
            code === "auth/operation-not-supported-in-this-environment");

        if (!canFallBackToRedirect) {
          throw popupError;
        }

        await setPersistence(firebaseAuth, browserLocalPersistence);
        setStoredRedirectCallback(callbackURL);
        await signInWithRedirect(firebaseAuth, googleProvider);
        return {};
      }

      await syncFirebaseUser(credential.user);
      const postAuthURL = await resolvePostAuthURL(credential.user, callbackURL);
      window.location.assign(postAuthURL);
      return { data: toSession(credential.user) };
    } catch (error) {
      return { error: toAuthError(error) };
    }
  },
};

export const signUp = {
  email: async ({
    email,
    password,
    name,
  }: {
    email: string;
    password: string;
    name?: string;
  }): Promise<AuthResult> => {
    try {
      if (!email.trim() || !password.trim()) {
        throw new Error("Enter your email and password.");
      }

      const credential = await createUserWithEmailAndPassword(
        firebaseAuth,
        email,
        password
      );

      if (name) {
        await updateProfile(credential.user, { displayName: name });
      }

      await syncFirebaseUser(credential.user);
      return { data: toSession(credential.user) };
    } catch (error) {
      return { error: toAuthError(error) };
    }
  },
};

export async function signOut() {
  await firebaseSignOut(firebaseAuth);
  window.location.assign("/");
}

export async function handleAuthRedirectResult(): Promise<AuthResult> {
  try {
    const credential = await getRedirectResult(firebaseAuth);
    const pendingCallbackURL = getStoredRedirectCallback();
    const redirectUser =
      credential?.user || (pendingCallbackURL ? await waitForCurrentUser() : null);

    if (!redirectUser) {
      if (pendingCallbackURL) {
        clearStoredRedirectCallback();
        return {
          error: {
            message:
              "Google sign-in returned without an account. Please try again.",
          },
        };
      }

      return {};
    }

    await syncFirebaseUser(redirectUser);
    const callbackURL = pendingCallbackURL || "/dashboard";
    const postAuthURL = await resolvePostAuthURL(redirectUser, callbackURL);
    clearStoredRedirectCallback();
    window.location.assign(postAuthURL);
    return { data: toSession(redirectUser) };
  } catch (error) {
    clearStoredRedirectCallback();
    return { error: toAuthError(error) };
  }
}

export function useSession() {
  const [data, setData] = useState<Session | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, async (user) => {
      const pendingCallbackURL = getStoredRedirectCallback();
      const resolvedUser =
        user || (pendingCallbackURL ? await waitForCurrentUser() : null);

      if (resolvedUser) {
        try {
          await syncFirebaseUser(resolvedUser);
        } catch {
          // Keep the Firebase session visible while the explicit sign-in flow
          // shows the sync error to the user.
        }
        setData(toSession(resolvedUser));
        setIsPending(false);
        return;
      }

      if (user) {
        try {
          await syncFirebaseUser(user);
        } catch {
          // Avoid leaving the app permanently loading on a transient API error.
        }
        setData(toSession(user));
      } else {
        setData(null);
      }

      setIsPending(false);
    });
  }, []);

  return { data, isPending };
}
