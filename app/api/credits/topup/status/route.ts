import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  getAuthenticatedUser,
  unauthorizedResponse,
} from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

type DisplayStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "TIMEOUT";

const pendingTimeoutMs = 2 * 60 * 1000;
const cancelledResultCodes = new Set([1032]);
const timeoutResultCodes = new Set([1037]);

function buildStatusMessage({
  displayStatus,
  resultDescription,
  creditsAdded,
}: {
  displayStatus: DisplayStatus;
  resultDescription: string | null;
  creditsAdded: number;
}) {
  if (displayStatus === "SUCCESS") {
    return `Payment successful. Added ${creditsAdded} reminder credit${
      creditsAdded === 1 ? "" : "s"
    }.`;
  }

  if (displayStatus === "CANCELLED") {
    return "Payment cancelled. No reminder credits were added.";
  }

  if (displayStatus === "TIMEOUT") {
    return "Payment confirmation is taking too long. If M-Pesa deducted money, credits will update when Safaricom confirms.";
  }

  if (displayStatus === "FAILED") {
    return resultDescription || "Payment failed. No reminder credits were added.";
  }

  return "Waiting for Safaricom confirmation. Check your phone and enter your M-Pesa PIN.";
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const topupId = request.nextUrl.searchParams.get("topupId")?.trim();
  if (!topupId) {
    return NextResponse.json({ error: "Missing topupId" }, { status: 400 });
  }

  const topup = await prisma.creditTopup.findUnique({
    where: { id: topupId },
    select: {
      id: true,
      userId: true,
      amount: true,
      creditsAdded: true,
      status: true,
      resultCode: true,
      resultDescription: true,
      createdAt: true,
      completedAt: true,
    },
  });

  if (!topup) {
    return NextResponse.json({ error: "Top-up request not found" }, { status: 404 });
  }

  if (topup.userId !== user.uid) {
    return forbiddenResponse();
  }

  const balance = await prisma.creditBalance.upsert({
    where: { userId: user.uid },
    update: {},
    create: { userId: user.uid, balance: 0 },
  });

  let displayStatus: DisplayStatus = "PENDING";
  if (topup.status === "PAID") {
    displayStatus = "SUCCESS";
  } else if (topup.status === "FAILED") {
    if (topup.resultCode && cancelledResultCodes.has(topup.resultCode)) {
      displayStatus = "CANCELLED";
    } else if (topup.resultCode && timeoutResultCodes.has(topup.resultCode)) {
      displayStatus = "TIMEOUT";
    } else {
      displayStatus = "FAILED";
    }
  } else if (Date.now() - topup.createdAt.getTime() > pendingTimeoutMs) {
    displayStatus = "TIMEOUT";
  }

  return NextResponse.json({
    topupId: topup.id,
    status: topup.status,
    displayStatus,
    amount: Number(topup.amount),
    creditsAdded: topup.creditsAdded,
    balance: balance.balance,
    resultCode: topup.resultCode,
    resultDescription: topup.resultDescription,
    completedAt: topup.completedAt?.toISOString() || null,
    message: buildStatusMessage({
      displayStatus,
      resultDescription: topup.resultDescription,
      creditsAdded: topup.creditsAdded,
    }),
  });
}
