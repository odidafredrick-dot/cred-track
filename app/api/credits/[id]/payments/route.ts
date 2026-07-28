import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeCreditStatus } from "@/lib/credit-status";

type CreatePaymentBody = {
  amount?: number;
  note?: string;
};

const creditInclude = {
  customer: true,
  items: true,
  payments: {
    orderBy: {
      createdAt: "desc" as const,
    },
  },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as CreatePaymentBody;
  const requestedAmount = Number(body.amount || 0);

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return NextResponse.json(
      { error: "Enter a payment amount greater than zero." },
      { status: 400 }
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const credit = await tx.credit.findUnique({
      where: { id },
    });

    if (!credit) {
      return { error: "Credit not found", status: 404 as const };
    }

    const totalAmount = Number(credit.totalAmount);
    const currentPaid = Number(credit.amountPaid);
    const remaining = Math.max(0, totalAmount - currentPaid);

    if (remaining <= 0) {
      return { error: "This credit is already fully paid.", status: 400 as const };
    }

    const appliedAmount = Math.min(requestedAmount, remaining);
    const nextAmountPaid = currentPaid + appliedAmount;
    const status = computeCreditStatus({
      dueDate: credit.dueDate,
      totalAmount,
      amountPaid: nextAmountPaid,
      requestedStatus: credit.status,
    });

    await tx.creditPayment.create({
      data: {
        creditId: credit.id,
        amount: appliedAmount,
        note: body.note?.trim() || null,
      },
    });

    const updatedCredit = await tx.credit.update({
      where: { id: credit.id },
      data: {
        amountPaid: nextAmountPaid,
        status,
      },
      include: creditInclude,
    });

    return { credit: updatedCredit, appliedAmount };
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({
    credit: result.credit,
    appliedAmount: result.appliedAmount,
  });
}
