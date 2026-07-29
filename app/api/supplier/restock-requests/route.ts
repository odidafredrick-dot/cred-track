import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

type RestockBody = {
  supplierUserId: string;
  businessUserId: string;
  stockItemId: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProduct(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as RestockBody;
  const supplierUserId = clean(body.supplierUserId);
  const businessUserId = clean(body.businessUserId);
  const stockItemId = clean(body.stockItemId);

  if (!supplierUserId || !businessUserId || !stockItemId) {
    return NextResponse.json(
      { error: "Missing restock request details" },
      { status: 400 }
    );
  }

  if (supplierUserId !== user.uid) {
    return forbiddenResponse();
  }

  const rateLimit = checkRateLimit({
    key: `restock-request:${user.uid}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const [supplierProfile, businessProfile, stockItem] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: supplierUserId } }),
    prisma.userProfile.findUnique({ where: { userId: businessUserId } }),
    prisma.stockItem.findFirst({
      where: {
        id: stockItemId,
        userId: businessUserId,
      },
    }),
  ]);

  if (supplierProfile?.role !== "SUPPLIER") {
    return NextResponse.json(
      { error: "Only supplier users can send restock requests" },
      { status: 403 }
    );
  }

  if (businessProfile?.role !== "BUSINESS" || !stockItem) {
    return NextResponse.json(
      { error: "Business stock item not found" },
      { status: 404 }
    );
  }

  const previousOrders = await prisma.supplierOrder.findMany({
    where: {
      supplierId: supplierProfile.id,
      buyerUserId: businessUserId,
    },
    include: { items: true },
  });

  const hasProductRelationship = previousOrders.some((order) =>
    order.items.some(
      (item) => normalizeProduct(item.product) === normalizeProduct(stockItem.product)
    )
  );

  if (!hasProductRelationship) {
    return NextResponse.json(
      { error: "This stock item is not linked to a previous supplier order" },
      { status: 403 }
    );
  }

  const restockRequest = await prisma.restockRequest.create({
    data: {
      supplierUserId,
      businessUserId,
      stockItemId: stockItem.id,
      product: stockItem.product,
      quantity: stockItem.quantity,
      smsStatus: "PENDING",
    },
  });

  const message = [
    `${supplierProfile.businessName || "Your supplier"} noticed ${stockItem.product} is running low on Holwa.`,
    `Current stock: ${stockItem.quantity}.`,
    "Please restock or open the supplier store to order.",
  ].join("\n");

  try {
    if (!businessProfile.phoneNumber) {
      throw new Error("Business phone number is missing");
    }

    const { sendSms } = await import("@/lib/africastalking");
    const responseText = await sendSms({
      to: businessProfile.phoneNumber,
      message,
    });

    const updatedRequest = await prisma.restockRequest.update({
      where: { id: restockRequest.id },
      data: {
        smsStatus: "SENT",
        smsMessageId: responseText,
      },
    });

    return NextResponse.json({ restockRequest: updatedRequest }, { status: 201 });
  } catch (error) {
    const updatedRequest = await prisma.restockRequest.update({
      where: { id: restockRequest.id },
      data: {
        smsStatus: "FAILED",
        smsMessageId:
          error instanceof Error ? error.message.slice(0, 500) : "SMS failed",
      },
    });

    return NextResponse.json(
      {
        restockRequest: updatedRequest,
        warning: "Restock request was saved, but SMS failed to send.",
      },
      { status: 201 }
    );
  }
}
