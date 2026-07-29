import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";

type UpdateStockBody = {
  reduceBy?: number;
  product?: string;
  buyingPrice?: number;
  sellingPrice?: number;
  quantity?: number;
  supplierPhone?: string;
  offers?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const { id } = await params;
  const body = (await request.json()) as UpdateStockBody;

  const item = await prisma.stockItem.findUnique({
    where: { id },
  });

  if (!item) {
    return NextResponse.json({ error: "Stock item not found" }, { status: 404 });
  }

  if (item.userId !== user.uid) {
    return forbiddenResponse();
  }

  if (body.reduceBy !== undefined) {
    const reduceBy = Number(body.reduceBy);
    if (!Number.isFinite(reduceBy) || reduceBy <= 0) {
      return NextResponse.json(
        { error: "Invalid reduce quantity" },
        { status: 400 }
      );
    }

    if (reduceBy > item.quantity) {
      return NextResponse.json(
        { error: "Cannot reduce more than available quantity" },
        { status: 400 }
      );
    }

    const updated = await prisma.stockItem.update({
      where: { id },
      data: { quantity: { decrement: reduceBy } },
    });

    return NextResponse.json({ item: updated });
  }

  const product = clean(body.product);
  const supplierPhone = clean(body.supplierPhone);
  const buyingPrice = Number(body.buyingPrice);
  const sellingPrice = Number(body.sellingPrice);
  const quantity = Number(body.quantity);

  if (
    !product ||
    !supplierPhone ||
    !Number.isFinite(buyingPrice) ||
    !Number.isFinite(sellingPrice) ||
    !Number.isFinite(quantity) ||
    quantity < 0
  ) {
    return NextResponse.json(
      { error: "Missing or invalid stock fields" },
      { status: 400 }
    );
  }

  const updated = await prisma.stockItem.update({
    where: { id },
    data: {
      product,
      buyingPrice,
      sellingPrice,
      quantity,
      supplierPhone,
      offers: clean(body.offers) || null,
    },
  });

  return NextResponse.json({ item: updated });
}
