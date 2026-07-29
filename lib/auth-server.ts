import { NextRequest, NextResponse } from "next/server";

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
};

const FIREBASE_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

async function verifyFirebaseToken(idToken: string) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!apiKey) {
    return null;
  }

  const response = await fetch(`${FIREBASE_LOOKUP_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as {
    users?: Array<{ localId?: string; email?: string | null }> | null;
  } | null;

  const user = data?.users?.[0];

  if (!user?.localId) {
    return null;
  }

  return {
    uid: user.localId,
    email: user.email ?? null,
  } satisfies AuthenticatedUser;
}

export async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization")?.trim();
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (!token) {
    return null;
  }

  return verifyFirebaseToken(token);
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
