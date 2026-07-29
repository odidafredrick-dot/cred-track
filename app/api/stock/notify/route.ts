import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbiddenResponse,
  getAuthenticatedUser,
  unauthorizedResponse,
} from "@/lib/auth-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

type NotifyBody = {
  userId: string;
  itemId: string;
};

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as NotifyBody;

  if (!body.userId || !body.itemId) {
    return NextResponse.json(
      { error: "Missing userId or itemId" },
      { status: 400 }
    );
  }

  if (body.userId !== user.uid) {
    return forbiddenResponse();
  }

  const rateLimit = checkRateLimit({
    key: `stock-notify:${user.uid}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const item = await prisma.stockItem.findFirst({
    where: { id: body.itemId, userId: user.uid },
  });

  if (!item) {
    return NextResponse.json({ error: "Stock item not found" }, { status: 404 });
  }

  if (!item.supplierPhone?.startsWith("+")) {
    return NextResponse.json(
      { error: "Supplier phone must be in +254... format" },
      { status: 400 }
    );
  }

  const message = `Please restock ${item.product}. Current stock is ${item.quantity}.`;

  try {
    const { sendSms } = await import("@/lib/africastalking");
    await sendSms({ to: item.supplierPhone, message });
    return NextResponse.json({ sent: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send SMS" },
      { status: 502 }
    );
  }
}
