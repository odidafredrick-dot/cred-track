import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{ supplierId: string }>;
};

type OrderItemInput = {
  stockItemId: string;
  quantity: number;
};

type CreateOrderBody = {
  buyerUserId: string;
  items: OrderItemInput[];
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(amount);
}

function compactLocation(parts: Array<string | null>) {
  return parts.filter(Boolean).join(", ");
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const { supplierId } = await context.params;
  const body = (await request.json()) as CreateOrderBody;
  const buyerUserId = clean(body.buyerUserId);
  const requestedItems = Array.isArray(body.items) ? body.items : [];

  if (!buyerUserId || requestedItems.length === 0) {
    return NextResponse.json(
      { error: "Select at least one item" },
      { status: 400 }
    );
  }

  if (buyerUserId !== user.uid) {
    return forbiddenResponse();
  }

  const rateLimit = checkRateLimit({
    key: `supplier-order:${user.uid}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const buyerProfile = await prisma.userProfile.findUnique({
    where: { userId: buyerUserId },
  });

  if (buyerProfile?.role !== "BUSINESS") {
    return NextResponse.json(
      { error: "Only business users can send supplier orders" },
      { status: 403 }
    );
  }

  const supplier = await prisma.userProfile.findFirst({
    where: {
      id: supplierId,
      role: "SUPPLIER",
    },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const itemQuantities = new Map<string, number>();
  for (const item of requestedItems) {
    const stockItemId = clean(item.stockItemId);
    const quantity = Number(item.quantity);
    if (stockItemId && Number.isInteger(quantity) && quantity > 0) {
      itemQuantities.set(stockItemId, (itemQuantities.get(stockItemId) || 0) + quantity);
    }
  }

  if (itemQuantities.size === 0) {
    return NextResponse.json(
      { error: "Select at least one valid item" },
      { status: 400 }
    );
  }

  const stockItems = await prisma.stockItem.findMany({
    where: {
      id: { in: Array.from(itemQuantities.keys()) },
      userId: supplier.userId,
      quantity: { gt: 0 },
    },
  });

  if (stockItems.length !== itemQuantities.size) {
    return NextResponse.json(
      { error: "Some selected items are no longer available" },
      { status: 400 }
    );
  }

  const orderItems = stockItems.map((item) => {
    const quantity = itemQuantities.get(item.id) || 0;
    return {
      product: item.product,
      price: item.sellingPrice,
      quantity,
      offers: item.offers,
      lineTotal: Number(item.sellingPrice) * quantity,
    };
  });
  const totalAmount = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const buyerName = buyerProfile.businessName || "Holwa business";
  const buyerLocation = compactLocation([
    buyerProfile.county,
    buyerProfile.town,
    buyerProfile.estate,
  ]);

  const order = await prisma.supplierOrder.create({
    data: {
      supplierId: supplier.id,
      buyerUserId,
      buyerName,
      buyerPhone: buyerProfile.phoneNumber,
      totalAmount,
      smsStatus: "PENDING",
      items: {
        create: orderItems.map((item) => ({
          product: item.product,
          price: item.price,
          quantity: item.quantity,
          offers: item.offers,
        })),
      },
    },
    include: { items: true },
  });

  const messageLines = [
    `New Holwa order ${order.id}`,
    `From: ${buyerName}`,
    buyerProfile.phoneNumber ? `Phone: ${buyerProfile.phoneNumber}` : null,
    buyerLocation ? `Location: ${buyerLocation}` : null,
    "Items:",
    ...orderItems.map(
      (item) =>
        `${item.quantity} x ${item.product} @ ${formatMoney(Number(item.price))}`
    ),
    `Total: ${formatMoney(totalAmount)}`,
  ].filter(Boolean);

  try {
    const { sendSms } = await import("@/lib/africastalking");
    const responseText = await sendSms({
      to: supplier.phoneNumber || stockItems[0]?.supplierPhone || "",
      message: messageLines.join("\n"),
    });

    const updatedOrder = await prisma.supplierOrder.update({
      where: { id: order.id },
      data: {
        smsStatus: "SENT",
        smsMessageId: responseText,
      },
      include: { items: true },
    });

    return NextResponse.json({ order: updatedOrder }, { status: 201 });
  } catch (error) {
    const updatedOrder = await prisma.supplierOrder.update({
      where: { id: order.id },
      data: {
        smsStatus: "FAILED",
        smsMessageId:
          error instanceof Error ? error.message.slice(0, 500) : "SMS failed",
      },
      include: { items: true },
    });

    return NextResponse.json(
      {
        order: updatedOrder,
        warning: "Order was saved, but SMS failed to send.",
      },
      { status: 201 }
    );
  }
}
