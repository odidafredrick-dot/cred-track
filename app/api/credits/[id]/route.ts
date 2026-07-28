import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeCreditStatus } from "@/lib/credit-status";

type UpdateCreditBody = {
  status?: "PENDING" | "DUE" | "OVERDUE" | "PARTIALLY_PAID" | "PAID";
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as UpdateCreditBody;

  if (!body.status) {
    return NextResponse.json({ error: "Missing status" }, { status: 400 });
  }

  const existing = await prisma.credit.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Credit not found" }, { status: 404 });
  }

  const nextAmountPaid =
    body.status === "PAID" ? Number(existing.totalAmount) : Number(existing.amountPaid);
  const status = computeCreditStatus({
    requestedStatus: body.status,
    dueDate: existing.dueDate,
    totalAmount: Number(existing.totalAmount),
    amountPaid: nextAmountPaid,
  });

  const credit = await prisma.credit.update({
    where: { id },
    data: {
      status,
      amountPaid: nextAmountPaid,
    },
    include: creditInclude,
  });

  return NextResponse.json({ credit });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.credit.delete({
    where: { id },
  });

  return NextResponse.json({ deleted: true });
}
