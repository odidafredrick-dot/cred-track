import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeCreditStatus } from "@/lib/credit-status";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";
import { normalizePhoneNumber } from "@/lib/phone";
import { sanitizeText } from "@/lib/sanitize";

type CreditItemInput = {
  name: string;
  quantity: number;
  unitPrice: number;
};

type CreateCreditBody = {
  userId: string;
  customerName: string;
  customerPhone: string;
  dueDate: string;
  amountPaid?: number;
  items: CreditItemInput[];
};

function normalizePhone(phone: string) {
  return normalizePhoneNumber(phone);
}

function sanitizeCustomerName(value: unknown) {
  return sanitizeText(value, 80);
}

const creditInclude = {
  customer: true,
  items: true,
  payments: {
    orderBy: {
      createdAt: "desc" as const,
    },
  },
};

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

  const balance = await prisma.creditBalance.upsert({
    where: { userId: user.uid },
    update: {},
    create: { userId: user.uid, balance: 0 },
  });

  const credits = await prisma.credit.findMany({
    where: { userId: user.uid },
    include: creditInclude,
    orderBy: { createdAt: "desc" },
  });

  const updates = credits
    .map((credit) => {
      const updatedStatus = computeCreditStatus({
        requestedStatus: credit.status,
        dueDate: credit.dueDate,
        totalAmount: Number(credit.totalAmount),
        amountPaid: Number(credit.amountPaid),
      });
      if (updatedStatus !== credit.status) {
        return prisma.credit.update({
          where: { id: credit.id },
          data: { status: updatedStatus },
        });
      }
      return null;
    })
    .filter(Boolean);

  if (updates.length) {
    await Promise.all(updates);
    const refreshedCredits = await prisma.credit.findMany({
      where: { userId: user.uid },
      include: creditInclude,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ credits: refreshedCredits, balance: balance.balance });
  }

  return NextResponse.json({ credits, balance: balance.balance });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as CreateCreditBody;

  if (
    !body.userId ||
    !body.customerName ||
    !body.customerPhone ||
    !body.dueDate
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (body.userId !== user.uid) {
    return forbiddenResponse();
  }

  if (!body.items || body.items.length === 0) {
    return NextResponse.json(
      { error: "At least one item is required" },
      { status: 400 }
    );
  }

  const totalAmount = body.items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    return sum + quantity * unitPrice;
  }, 0);
  const requestedAmountPaid = Number(body.amountPaid || 0);
  const amountPaid = Math.min(Math.max(0, requestedAmountPaid), totalAmount);
  const customerName = sanitizeCustomerName(body.customerName);
  const customerPhone = normalizePhone(body.customerPhone);
  const dueDate = new Date(body.dueDate);
  const status = computeCreditStatus({
    requestedStatus: "PENDING",
    dueDate,
    totalAmount,
    amountPaid,
  });

  const credit = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: {
        userId_phone: {
          userId: user.uid,
          phone: customerPhone,
        },
      },
      update: { name: customerName },
      create: {
        userId: user.uid,
        name: customerName,
        phone: customerPhone,
      },
    });

    return tx.credit.create({
      data: {
        userId: user.uid,
        customerId: customer.id,
        customerName,
        customerPhone,
        dueDate,
        totalAmount,
        amountPaid,
        status,
        items: {
          create: body.items.map((item) => ({
            name: sanitizeText(item.name, 80),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        },
        payments:
          amountPaid > 0
            ? {
                create: {
                  amount: amountPaid,
                  note: "Initial payment",
                },
              }
            : undefined,
      },
      include: creditInclude,
    });
  });

  return NextResponse.json({ credit }, { status: 201 });
}
