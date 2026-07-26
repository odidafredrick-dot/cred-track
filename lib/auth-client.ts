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
  await fetch("/api/firebase-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: user.uid,
      email: user.email || `${user.uid}@firebase.local`,
      name: user.displayName,
      image: user.photoURL,
    }),
  });
}

function toAuthError(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  const friendlyMessages: Record<string, string> = {
    "auth/unauthorized-domain":
      "This app domain is not authorized for Google sign-in. Please contact support.",
    "auth/network-request-failed":
      "Network error while signing in. Check your connection and try again.",
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
      await setPersistence(firebaseAuth, browserLocalPersistence);

      if (shouldUseRedirectSignIn()) {
        setStoredRedirectCallback(callbackURL);
        await signInWithRedirect(firebaseAuth, googleProvider);
        return {};
      }

      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      await syncFirebaseUser(credential.user);
      window.location.assign(callbackURL);
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
      return {};
    }

    await syncFirebaseUser(redirectUser);
    const callbackURL = pendingCallbackURL || "/dashboard";
    clearStoredRedirectCallback();
    window.location.assign(callbackURL);
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
        await syncFirebaseUser(resolvedUser);
        setData(toSession(resolvedUser));
        setIsPending(false);
        return;
      }

      if (user) {
        await syncFirebaseUser(user);
        setData(toSession(user));
      } else {
        setData(null);
      }

      setIsPending(false);
    });
  }, []);

  return { data, isPending };
}
