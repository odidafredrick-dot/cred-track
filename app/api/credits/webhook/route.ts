import { NextRequest, NextResponse } from "next/server";
import {
  DarajaStkCallback,
  extractDarajaCallbackMetadata,
  verifyMpesaCallbackToken,
} from "@/lib/daraja";
import { prisma } from "@/lib/prisma";

type WebhookPayload = {
  Body?: {
    stkCallback?: DarajaStkCallback;
  };
};

function darajaAck() {
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

export async function POST(request: NextRequest) {
  if (!verifyMpesaCallbackToken(request.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as WebhookPayload;
  const stkCallback = payload.Body?.stkCallback;

  if (!stkCallback?.CheckoutRequestID) {
    return NextResponse.json(
      { error: "Missing Daraja checkout request id" },
      { status: 400 }
    );
  }

  const topup = await prisma.creditTopup.findFirst({
    where: { invoiceId: stkCallback.CheckoutRequestID },
  });

  if (!topup) {
    console.warn("[Daraja] Callback topup not found", {
      checkoutId: stkCallback.CheckoutRequestID,
      merchantRequestId: stkCallback.MerchantRequestID,
    });
    return darajaAck();
  }

  const resultCode = Number(stkCallback.ResultCode);

  if (resultCode === 0) {
    const metadata = extractDarajaCallbackMetadata(stkCallback);
    const amountPaid = Number(metadata.Amount || 0);
    const expectedAmount = Number(topup.amount);

    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      console.warn("[Daraja] Callback had invalid amount", {
        checkoutId: stkCallback.CheckoutRequestID,
        amountPaid,
      });
      await prisma.creditTopup.update({
        where: { id: topup.id },
        data: { status: "FAILED" },
      });
      return darajaAck();
    }

    if (Math.abs(expectedAmount - amountPaid) > 1) {
      console.warn("[Daraja] Callback amount mismatch", {
        checkoutId: stkCallback.CheckoutRequestID,
        expectedAmount,
        amountPaid,
      });
      await prisma.creditTopup.update({
        where: { id: topup.id },
        data: { status: "FAILED" },
      });
      return darajaAck();
    }

    if (topup.status === "PAID") {
      return darajaAck();
    }

    await prisma.$transaction([
      prisma.creditTopup.update({
        where: { id: topup.id },
        data: { status: "PAID" },
      }),
      prisma.creditBalance.upsert({
        where: { userId: topup.userId },
        update: { balance: { increment: topup.creditsAdded } },
        create: { userId: topup.userId, balance: topup.creditsAdded },
      }),
    ]);
  } else {
    await prisma.creditTopup.update({
      where: { id: topup.id },
      data: { status: "FAILED" },
    });
  }

  return darajaAck();
}
