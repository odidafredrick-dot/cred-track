import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    const admin = await requireAdmin(request);
    if ("error" in admin) {
        return admin.error;
    }

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entityId")?.trim() || null;

    const [orders, restocks] = await Promise.all([
        prisma.supplierOrder.findMany({
            where: entityId ? { OR: [{ supplierId: entityId }, { buyerUserId: entityId }] } : undefined,
            select: {
                id: true,
                buyerName: true,
                buyerPhone: true,
                status: true,
                smsStatus: true,
                smsMessageId: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
        }),
        prisma.restockRequest.findMany({
            where: entityId ? { OR: [{ supplierUserId: entityId }, { businessUserId: entityId }] } : undefined,
            select: {
                id: true,
                businessUserId: true,
                supplierUserId: true,
                product: true,
                quantity: true,
                status: true,
                smsStatus: true,
                smsMessageId: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
        }),
    ]);

    return NextResponse.json({ orders, restocks });
}
