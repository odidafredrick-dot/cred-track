import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";

function normalizeProduct(value: string) {
  return value.trim().toLowerCase();
}

function stockStatus(quantity: number) {
  if (quantity < 5) {
    return "Extremely low";
  }

  if (quantity < 10) {
    return "Low";
  }

  return "Normal";
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const supplierUserId = searchParams.get("supplierUserId")?.trim();

  if (!supplierUserId) {
    return NextResponse.json(
      { error: "Missing supplier user" },
      { status: 400 }
    );
  }

  if (supplierUserId !== user.uid) {
    return forbiddenResponse();
  }

  const supplierProfile = await prisma.userProfile.findUnique({
    where: { userId: supplierUserId },
  });

  if (supplierProfile?.role !== "SUPPLIER") {
    return NextResponse.json(
      { error: "Only supplier users can view business stock signals" },
      { status: 403 }
    );
  }

  const orders = await prisma.supplierOrder.findMany({
    where: { supplierId: supplierProfile.id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  const productsByBusiness = new Map<string, Set<string>>();
  const lastOrderByBusiness = new Map<string, (typeof orders)[number]>();

  for (const order of orders) {
    if (!productsByBusiness.has(order.buyerUserId)) {
      productsByBusiness.set(order.buyerUserId, new Set());
    }

    for (const item of order.items) {
      productsByBusiness.get(order.buyerUserId)?.add(normalizeProduct(item.product));
    }

    if (!lastOrderByBusiness.has(order.buyerUserId)) {
      lastOrderByBusiness.set(order.buyerUserId, order);
    }
  }

  const businessUserIds = Array.from(productsByBusiness.keys());

  if (businessUserIds.length === 0) {
    return NextResponse.json({ customers: [] });
  }

  const [businessProfiles, stockItems] = await Promise.all([
    prisma.userProfile.findMany({
      where: {
        userId: { in: businessUserIds },
        role: "BUSINESS",
      },
      orderBy: { businessName: "asc" },
    }),
    prisma.stockItem.findMany({
      where: {
        userId: { in: businessUserIds },
      },
      orderBy: { product: "asc" },
    }),
  ]);

  const stockByBusiness = new Map<string, typeof stockItems>();
  for (const item of stockItems) {
    const items = stockByBusiness.get(item.userId) || [];
    items.push(item);
    stockByBusiness.set(item.userId, items);
  }

  const customers = businessProfiles.map((profile) => {
    const orderedProducts = productsByBusiness.get(profile.userId) || new Set();
    const visibleStock = (stockByBusiness.get(profile.userId) || [])
      .filter((item) => orderedProducts.has(normalizeProduct(item.product)))
      .map((item) => ({
        id: item.id,
        product: item.product,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        status: stockStatus(item.quantity),
        isLow: item.quantity < 10,
      }));
    const lastOrder = lastOrderByBusiness.get(profile.userId);

    return {
      profile,
      lastOrderAt: lastOrder?.createdAt || null,
      orderedProducts: Array.from(orderedProducts),
      stockItems: visibleStock,
    };
  });

  return NextResponse.json({ customers });
}
