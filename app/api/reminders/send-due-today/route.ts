import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

type SendRemindersBody = {
  userId: string;
};

function normalizeDate(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as SendRemindersBody;

  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (body.userId !== user.uid) {
    return forbiddenResponse();
  }

  const rateLimit = checkRateLimit({
    key: `reminder:due-today:${user.uid}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const today = normalizeDate(new Date());

  const credits = await prisma.credit.findMany({
    where: {
      userId: user.uid,
      status: { not: "PAID" },
    },
    include: { items: true },
  });

  const dueToday = credits.filter(
    (credit) => normalizeDate(new Date(credit.dueDate)).getTime() === today.getTime()
  );

  if (!dueToday.length) {
    return NextResponse.json({ sentCount: 0 });
  }

  const balance = await prisma.creditBalance.upsert({
    where: { userId: user.uid },
    update: {},
    create: { userId: user.uid, balance: 0 },
  });

  if (balance.balance < dueToday.length) {
    return NextResponse.json(
      { error: "Not enough credits to send all due today" },
      { status: 400 }
    );
  }

  const messageBase =
    "Reminder: Your account is due today. Please pay to avoid overdue charges.";

  const { sendSms } = await import("@/lib/africastalking");
  const sendResults = await Promise.allSettled(
    dueToday.map((credit) => {
      const total = Number(credit.totalAmount);
      const paid = Number(credit.amountPaid);
      const amountDue = total - paid;
      return sendSms({
        to: credit.customerPhone,
        message: `${messageBase} Amount due: Ksh ${amountDue.toFixed(2)}.`,
      });
    })
  );

  const sentCount = sendResults.filter((result) => result.status === "fulfilled")
    .length;

  if (sentCount !== dueToday.length) {
    return NextResponse.json(
      { error: "Failed to send all reminders" },
      { status: 502 }
    );
  }

  const updatedBalance = await prisma.creditBalance.update({
    where: { userId: user.uid },
    data: { balance: { decrement: sentCount } },
  });

  return NextResponse.json({ sentCount, balance: updatedBalance.balance });
}
