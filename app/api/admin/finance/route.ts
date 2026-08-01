import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

function money(value: unknown) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? amount : 0;
}

export async function GET(request: NextRequest) {
    const admin = await requireAdmin(request);
    if ("error" in admin) {
        return admin.error;
    }

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entityId")?.trim() || null;

    const [credits, payments, topups, orders] = await Promise.all([
        prisma.credit.findMany({
            where: entityId ? { userId: entityId } : undefined,
            select: {
                id: true,
                customerName: true,
                totalAmount: true,
                amountPaid: true,
                status: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
        }),
        prisma.creditPayment.findMany({
            where: entityId ? { credit: { userId: entityId } } : undefined,
            select: {
                id: true,
                amount: true,
                createdAt: true,
                credit: { select: { customerName: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
        }),
        prisma.creditTopup.findMany({
            where: entityId ? { userId: entityId } : undefined,
            select: {
                id: true,
                phone: true,
                amount: true,
                status: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
        }),
        prisma.supplierOrder.findMany({
            where: entityId ? { OR: [{ supplierId: entityId }, { buyerUserId: entityId }] } : undefined,
            select: {
                id: true,
                buyerName: true,
                totalAmount: true,
                status: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
        }),
    ]);

    const totalCreditsIssued = credits.reduce((sum, credit) => sum + money(credit.totalAmount), 0);
    const totalPaid = payments.reduce((sum, payment) => sum + money(payment.amount), 0);
    const totalTopups = topups.reduce((sum, topup) => sum + money(topup.amount), 0);
    const paidTopups = topups.filter((topup) => String(topup.status).toUpperCase() === "PAID").length;
    const successfulTopupValue = topups
        .filter((topup) => String(topup.status).toUpperCase() === "PAID")
        .reduce((sum, topup) => sum + money(topup.amount), 0);
    const openOrders = orders.filter((order) => String(order.status).toUpperCase() !== "PAID").length;

    return NextResponse.json({
        summary: {
            totalCreditsIssued,
            totalPaid,
            totalTopups,
            paidTopups,
            successfulTopupValue,
            openOrders,
        },
        credits,
        payments,
        topups,
        orders,
    });
}
