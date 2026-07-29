import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";

type CreateStockBody = {
  userId: string;
  product: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  supplierPhone: string;
  offers?: string;
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

  const items = await prisma.stockItem.findMany({
    where: { userId: user.uid },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as CreateStockBody;

  if (
    !body.userId ||
    !body.product ||
    !body.supplierPhone ||
    body.buyingPrice === undefined ||
    body.sellingPrice === undefined ||
    body.quantity === undefined
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (body.userId !== user.uid) {
    return forbiddenResponse();
  }

  const item = await prisma.stockItem.create({
    data: {
      userId: user.uid,
      product: body.product.trim(),
      buyingPrice: Number(body.buyingPrice),
      sellingPrice: Number(body.sellingPrice),
      quantity: Number(body.quantity),
      supplierPhone: body.supplierPhone.trim(),
      offers: body.offers?.trim() || null,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
