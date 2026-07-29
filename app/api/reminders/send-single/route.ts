import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

type SendSingleBody = {
  userId: string;
  creditId: string;
};

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as SendSingleBody;

  console.log("[Remind] send-single request", {
    userId: body.userId,
    creditId: body.creditId,
  });

  if (!body.userId || !body.creditId) {
    return NextResponse.json(
      { error: "Missing userId or creditId" },
      { status: 400 }
    );
  }

  if (body.userId !== user.uid) {
    return forbiddenResponse();
  }

  const rateLimit = checkRateLimit({
    key: `reminder:single:${user.uid}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const balance = await prisma.creditBalance.upsert({
    where: { userId: user.uid },
    update: {},
    create: { userId: user.uid, balance: 0 },
  });

  if (balance.balance < 1) {
    return NextResponse.json(
      { error: "Not enough credits" },
      { status: 400 }
    );
  }

  const credit = await prisma.credit.findFirst({
    where: {
      id: body.creditId,
      userId: user.uid,
      status: { not: "PAID" },
    },
  });

  if (!credit) {
    return NextResponse.json({ error: "Credit not found" }, { status: 404 });
  }

  if (!credit.customerPhone?.startsWith("+")) {
    return NextResponse.json(
      { error: "Customer phone must be in +254... format" },
      { status: 400 }
    );
  }

  try {
    const total = Number(credit.totalAmount);
    const paid = Number(credit.amountPaid);
    const amountDue = total - paid;
    const { sendSms } = await import("@/lib/africastalking");
    const responseText = await sendSms({
      to: credit.customerPhone,
      message: `Reminder: Your account is due. Amount due: Ksh ${amountDue.toFixed(
        2
      )}.`,
    });

    const updatedBalance = await prisma.creditBalance.update({
      where: { userId: user.uid },
      data: { balance: { decrement: 1 } },
    });

    console.log("[Remind] send-single success", {
      creditId: credit.id,
      phone: credit.customerPhone,
      response: responseText,
    });

    return NextResponse.json({
      sent: true,
      response: responseText,
      balance: updatedBalance.balance,
    });
  } catch (error) {
    console.error("[Remind] send-single failed", {
      creditId: credit.id,
      phone: credit.customerPhone,
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send SMS" },
      { status: 502 }
    );
  }

  return NextResponse.json({ sent: true });
}
