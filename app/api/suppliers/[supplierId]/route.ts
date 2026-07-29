import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";

type RouteContext = {
  params: Promise<{ supplierId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const { supplierId } = await context.params;
  const { searchParams } = new URL(request.url);
  const buyerUserId = searchParams.get("buyerUserId")?.trim();

  if (!buyerUserId) {
    return NextResponse.json({ error: "Missing buyer user" }, { status: 400 });
  }

  if (buyerUserId !== user.uid) {
    return forbiddenResponse();
  }

  const buyerProfile = await prisma.userProfile.findUnique({
    where: { userId: buyerUserId },
  });

  if (buyerProfile?.role !== "BUSINESS") {
    return NextResponse.json(
      { error: "Supplier stores are only available to business users" },
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

  const items = await prisma.stockItem.findMany({
    where: {
      userId: supplier.userId,
      quantity: { gt: 0 },
    },
    orderBy: { product: "asc" },
  });

  return NextResponse.json({ supplier, items, buyerProfile });
}
