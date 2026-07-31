import { NextRequest, NextResponse } from "next/server";
import { createDarajaStkPush, normalizeMpesaPhone } from "@/lib/daraja";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

type TopupBody = {
  userId: string;
  phone: string;
  amount: number;
};

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as TopupBody;

  if (!body.userId || !body.phone || !body.amount) {
    return NextResponse.json(
      { error: "Missing userId, phone, or amount" },
      { status: 400 }
    );
  }

  if (body.userId !== user.uid) {
    return forbiddenResponse();
  }

  const rateLimit = checkRateLimit({
    key: `topup:${user.uid}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (!Number.isInteger(amount)) {
    return NextResponse.json(
      { error: "Amount must be a whole KES amount" },
      { status: 400 }
    );
  }

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeMpesaPhone(body.phone);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Phone number must be a valid Kenyan M-Pesa number.",
      },
      { status: 400 }
    );
  }

  const creditsAdded = amount;
  const apiRef = `topup_${user.uid}_${Date.now()}`;

  const existingUser = await prisma.user.findUnique({
    where: { id: user.uid },
  });

  if (!existingUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const topup = await prisma.creditTopup.create({
    data: {
      userId: user.uid,
      phone: normalizedPhone,
      amount,
      creditsAdded,
      apiRef,
    },
  });

  try {
    const response = await createDarajaStkPush({
      phoneNumber: normalizedPhone,
      amount,
      apiRef,
      narrative: "Holwa reminder credits",
    });

    const checkoutId = response.CheckoutRequestID || null;

    await prisma.creditTopup.update({
      where: { id: topup.id },
      data: { invoiceId: checkoutId },
    });

    return NextResponse.json({
      topupId: topup.id,
      checkoutId,
      merchantRequestId: response.MerchantRequestID || null,
      status: "PENDING",
      message:
        response.CustomerMessage ||
        "STK push sent. Check your phone and enter your M-Pesa PIN.",
    });
  } catch (error) {
    console.error("[Topup] STK push failed", {
      userId: user.uid,
      phone: normalizedPhone,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    await prisma.creditTopup.update({
      where: { id: topup.id },
      data: {
        status: "FAILED",
        resultDescription:
          error instanceof Error ? error.message : "STK push failed",
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "STK push failed" },
      { status: 502 }
    );
  }
}
