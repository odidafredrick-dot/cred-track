import { NextRequest, NextResponse } from "next/server";
import { createDarajaStkPush, normalizeMpesaPhone } from "@/lib/daraja";
import { prisma } from "@/lib/prisma";

type TopupBody = {
  userId: string;
  phone: string;
  amount: number;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as TopupBody;

  if (!body.userId || !body.phone || !body.amount) {
    return NextResponse.json(
      { error: "Missing userId, phone, or amount" },
      { status: 400 }
    );
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
  const apiRef = `topup_${body.userId}_${Date.now()}`;

  const user = await prisma.user.findUnique({
    where: { id: body.userId },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const topup = await prisma.creditTopup.create({
    data: {
      userId: body.userId,
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
    });
  } catch (error) {
    console.error("[Topup] STK push failed", {
      userId: body.userId,
      phone: body.phone,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    await prisma.creditTopup.update({
      where: { id: topup.id },
      data: { status: "FAILED" },
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "STK push failed" },
      { status: 502 }
    );
  }
}
