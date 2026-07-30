import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

type ActivityItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  tone: "info" | "success" | "warning";
};

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function emptyTrend(days = 14) {
  return Array.from({ length: days }, (_, index) => {
    const date = daysAgo(days - 1 - index);
    return { date: dateKey(date), value: 0 };
  });
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    roleCounts,
    credits,
    payments,
    lowStockItems,
    supplierOrders,
    riskChecks,
    recentCredits,
    recentPayments,
    recentOrders,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userProfile.groupBy({
      by: ["role"],
      _count: { _all: true },
    }),
    prisma.credit.findMany({
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        totalAmount: true,
        amountPaid: true,
        status: true,
        dueDate: true,
        createdAt: true,
      },
    }),
    prisma.creditPayment.findMany({
      select: { id: true, amount: true, createdAt: true },
    }),
    prisma.stockItem.findMany({
      where: { quantity: { lt: 10 } },
      select: {
        id: true,
        product: true,
        quantity: true,
        sellingPrice: true,
        userId: true,
      },
      orderBy: [{ quantity: "asc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.supplierOrder.findMany({
      select: {
        id: true,
        supplierId: true,
        buyerName: true,
        totalAmount: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.holwaRiskScoreCheck.findMany({
      where: { createdAt: { gte: daysAgo(30) } },
      select: {
        id: true,
        debtorPhone: true,
        score: true,
        riskLevel: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.credit.findMany({
      select: {
        id: true,
        customerName: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.creditPayment.findMany({
      select: {
        id: true,
        amount: true,
        createdAt: true,
        credit: {
          select: {
            customerName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.supplierOrder.findMany({
      select: {
        id: true,
        buyerName: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const usersByRole = roleCounts.reduce<Record<string, number>>(
    (acc, row) => {
      acc[String(row.role)] = row._count._all;
      return acc;
    },
    {
      BUSINESS: 0,
      SUPPLIER: 0,
      INDIVIDUAL: 0,
      ADMIN: 0,
    }
  );

  const activeCredits = credits.filter(
    (credit) =>
      String(credit.status) !== "PAID" &&
      money(credit.totalAmount) - money(credit.amountPaid) > 0
  );
  const overdueCredits = activeCredits.filter(
    (credit) => new Date(credit.dueDate) < today
  );
  const amountOutstanding = activeCredits.reduce(
    (sum, credit) => sum + Math.max(0, money(credit.totalAmount) - money(credit.amountPaid)),
    0
  );
  const amountOverdue = overdueCredits.reduce(
    (sum, credit) => sum + Math.max(0, money(credit.totalAmount) - money(credit.amountPaid)),
    0
  );
  const paymentsCollected = payments.reduce(
    (sum, payment) => sum + money(payment.amount),
    0
  );
  const supplierOrderAmount = supplierOrders.reduce(
    (sum, order) => sum + money(order.totalAmount),
    0
  );

  const creditTrendMap = new Map(emptyTrend().map((row) => [row.date, row.value]));
  for (const credit of credits) {
    const key = dateKey(credit.createdAt);
    if (creditTrendMap.has(key)) {
      creditTrendMap.set(key, (creditTrendMap.get(key) || 0) + 1);
    }
  }

  const paymentTrendMap = new Map(emptyTrend().map((row) => [row.date, row.value]));
  for (const payment of payments) {
    const key = dateKey(payment.createdAt);
    if (paymentTrendMap.has(key)) {
      paymentTrendMap.set(key, (paymentTrendMap.get(key) || 0) + money(payment.amount));
    }
  }

  const riskTrend = emptyTrend().map((row) => {
    const checks = riskChecks.filter((check) => dateKey(check.createdAt) === row.date);
    const scored = checks.filter((check) => check.score !== null);
    const averageScore =
      scored.length > 0
        ? Math.round(
            scored.reduce((sum, check) => sum + Number(check.score || 0), 0) /
              scored.length
          )
        : null;
    return {
      date: row.date,
      checks: checks.length,
      averageScore,
    };
  });

  const customers = new Map<
    string,
    { name: string; phone: string; totalIssued: number; outstanding: number }
  >();
  for (const credit of credits) {
    const key = credit.customerPhone || credit.customerName;
    const existing =
      customers.get(key) ||
      {
        name: credit.customerName,
        phone: credit.customerPhone,
        totalIssued: 0,
        outstanding: 0,
      };
    existing.totalIssued += money(credit.totalAmount);
    existing.outstanding += Math.max(0, money(credit.totalAmount) - money(credit.amountPaid));
    customers.set(key, existing);
  }

  const suppliers = new Map<
    string,
    { supplierId: string; orders: number; volume: number }
  >();
  for (const order of supplierOrders) {
    const existing =
      suppliers.get(order.supplierId) ||
      { supplierId: order.supplierId, orders: 0, volume: 0 };
    existing.orders += 1;
    existing.volume += money(order.totalAmount);
    suppliers.set(order.supplierId, existing);
  }

  const supplierProfiles = await prisma.userProfile.findMany({
    where: { userId: { in: Array.from(suppliers.keys()) } },
    select: { userId: true, businessName: true, phoneNumber: true },
  });
  const supplierNames = new Map(
    supplierProfiles.map((profile) => [
      profile.userId,
      profile.businessName || profile.phoneNumber || profile.userId,
    ])
  );

  const activity: ActivityItem[] = [
    ...recentCredits.map((credit) => ({
      id: `credit-${credit.id}`,
      title: "Credit issued",
      body: `${credit.customerName} received goods/services worth KES ${money(
        credit.totalAmount
      ).toLocaleString()}`,
      time: credit.createdAt.toISOString(),
      tone: "info" as const,
    })),
    ...recentPayments.map((payment) => ({
      id: `payment-${payment.id}`,
      title: "Payment collected",
      body: `${payment.credit.customerName} paid KES ${money(
        payment.amount
      ).toLocaleString()}`,
      time: payment.createdAt.toISOString(),
      tone: "success" as const,
    })),
    ...recentOrders.map((order) => ({
      id: `order-${order.id}`,
      title: "Supplier order",
      body: `${order.buyerName} ordered KES ${money(
        order.totalAmount
      ).toLocaleString()} of stock`,
      time: order.createdAt.toISOString(),
      tone: "warning" as const,
    })),
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 10);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    kpis: {
      totalUsers,
      usersByRole,
      activeBusinesses: usersByRole.BUSINESS || 0,
      activeSuppliers: usersByRole.SUPPLIER || 0,
      totalCreditsIssued: credits.length,
      amountOutstanding,
      amountOverdue,
      overdueCount: overdueCredits.length,
      paymentsCollected,
      lowStockCount: lowStockItems.length,
      supplierOrderCount: supplierOrders.length,
      supplierOrderAmount,
      riskChecks30d: riskChecks.length,
    },
    trends: {
      creditsIssued: Array.from(creditTrendMap.entries()).map(([date, value]) => ({
        date,
        value,
      })),
      paymentsCollected: Array.from(paymentTrendMap.entries()).map(([date, value]) => ({
        date,
        value,
      })),
      riskScore: riskTrend,
    },
    topCustomers: Array.from(customers.values())
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 8),
    topSuppliers: Array.from(suppliers.values())
      .map((supplier) => ({
        ...supplier,
        name: supplierNames.get(supplier.supplierId) || supplier.supplierId,
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 8),
    lowStockItems,
    recentActivity: activity,
  });
}
