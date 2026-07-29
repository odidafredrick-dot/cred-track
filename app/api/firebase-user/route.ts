import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  getAuthenticatedUser,
  unauthorizedResponse,
} from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

type FirebaseUserBody = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const authenticatedUser = await getAuthenticatedUser(request);
  if (!authenticatedUser) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as FirebaseUserBody;
  const id = clean(body.id);
  const email = clean(authenticatedUser.email) || clean(body.email);
  const name = clean(body.name);
  const image = clean(body.image);

  if (!id) {
    return NextResponse.json(
      { error: "Missing Firebase user id" },
      { status: 400 }
    );
  }

  if (id !== authenticatedUser.uid) {
    return forbiddenResponse();
  }

  const fallbackEmail = `${authenticatedUser.uid}@firebase.local`;
  const requestedEmail = email || fallbackEmail;
  const existingById = await prisma.user.findUnique({
    where: { id: authenticatedUser.uid },
  });
  const existingByEmail = await prisma.user.findUnique({
    where: { email: requestedEmail },
  });
  const storedEmail =
    existingByEmail && existingByEmail.id !== authenticatedUser.uid
      ? fallbackEmail
      : requestedEmail;

  const user = await prisma.user.upsert({
    where: { id: authenticatedUser.uid },
    update: {
      email: storedEmail,
      name: name || null,
      image: image || null,
      emailVerified: true,
    },
    create: {
      id: authenticatedUser.uid,
      email: existingById ? existingById.email : storedEmail,
      name: name || null,
      image: image || null,
      emailVerified: true,
    },
  });

  return NextResponse.json({ user });
}
