import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/admin";
import { sanitizeText } from "@/lib/sanitize";
import {
  isPaymentMode,
  isUserRole,
  needsBusinessProfile,
  type PaymentMode,
  type UserRole,
} from "@/lib/user-profile";

type ProfileBody = {
  userId: string;
  role: UserRole;
  businessName?: string;
  county?: string;
  town?: string;
  estate?: string;
  phoneNumber?: string;
  paymentMode?: PaymentMode;
  description?: string;
};

function clean(value: unknown) {
  return sanitizeText(value, 200);
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId")?.trim();

  if (!requestedUserId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (requestedUserId !== user.uid) {
    return forbiddenResponse();
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.uid },
  });

  return NextResponse.json({
    profile,
    isAdmin: String(profile?.role || "") === "ADMIN" || isAdminEmail(user.email),
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as ProfileBody;
  const userId = clean(body.userId);
  const role = body.role;

  if (!userId || !isUserRole(role)) {
    return NextResponse.json(
      { error: "Missing or invalid user role" },
      { status: 400 }
    );
  }

  if (userId !== user.uid) {
    return forbiddenResponse();
  }

  const businessName = clean(body.businessName);
  const county = clean(body.county);
  const town = clean(body.town);
  const estate = clean(body.estate);
  const phoneNumber = clean(body.phoneNumber);
  const description = clean(body.description);
  const paymentMode = body.paymentMode;
  const resolvedPaymentMode = isPaymentMode(paymentMode || null)
    ? paymentMode
    : null;

  if (needsBusinessProfile(role)) {
    if (
      !businessName ||
      !county ||
      !town ||
      !estate ||
      !phoneNumber ||
      !resolvedPaymentMode ||
      !description
    ) {
      return NextResponse.json(
        { error: "Please complete all profile fields" },
        { status: 400 }
      );
    }
  }

  const profileData = needsBusinessProfile(role)
    ? {
        role,
        businessName,
        county,
        town,
        estate,
        phoneNumber,
        paymentMode: resolvedPaymentMode,
        description,
      }
    : {
        role,
        businessName: null,
        county: null,
        town: null,
        estate: null,
        phoneNumber: null,
        paymentMode: null,
        description: null,
      };

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    update: profileData,
    create: {
      userId,
      ...profileData,
    },
  });

  return NextResponse.json({ profile });
}
