import { NextRequest, NextResponse } from "next/server";
import { recordAdminAction, requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

type PriceRuleInput = {
  id?: string;
  name?: string;
  scope?: "GLOBAL" | "SUPPLIER" | "CATEGORY";
  scopeValue?: string | null;
  minMarkupPercent?: number | null;
  maxMarkupPercent?: number | null;
  minSellingPrice?: number | null;
  maxSellingPrice?: number | null;
  status?: "ACTIVE" | "PAUSED";
  notes?: string | null;
};

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableMoney(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return amount;
}

function toNumber(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function ruleApplies(
  rule: {
    scope: string;
    scopeValue: string | null;
  },
  item: {
    product: string;
    supplierPhone: string;
    userId: string;
  }
) {
  if (rule.scope === "GLOBAL") {
    return true;
  }

  const value = (rule.scopeValue || "").trim().toLowerCase();
  if (!value) {
    return false;
  }

  if (rule.scope === "SUPPLIER") {
    return (
      item.supplierPhone.toLowerCase() === value ||
      item.userId.toLowerCase() === value
    );
  }

  return item.product.toLowerCase().includes(value);
}

function findViolation(
  rule: {
    minMarkupPercent: unknown;
    maxMarkupPercent: unknown;
    minSellingPrice: unknown;
    maxSellingPrice: unknown;
  },
  item: {
    buyingPrice: unknown;
    sellingPrice: unknown;
  }
) {
  const buying = toNumber(item.buyingPrice);
  const selling = toNumber(item.sellingPrice);
  const markup = buying > 0 ? ((selling - buying) / buying) * 100 : 0;
  const minMarkup = nullableMoney(rule.minMarkupPercent);
  const maxMarkup = nullableMoney(rule.maxMarkupPercent);
  const minSelling = nullableMoney(rule.minSellingPrice);
  const maxSelling = nullableMoney(rule.maxSellingPrice);

  if (minMarkup !== null && markup < minMarkup) {
    return `Markup ${markup.toFixed(1)}% is below ${minMarkup}%`;
  }

  if (maxMarkup !== null && markup > maxMarkup) {
    return `Markup ${markup.toFixed(1)}% is above ${maxMarkup}%`;
  }

  if (minSelling !== null && selling < minSelling) {
    return `Selling price KES ${selling.toLocaleString()} is below minimum`;
  }

  if (maxSelling !== null && selling > maxSelling) {
    return `Selling price KES ${selling.toLocaleString()} is above maximum`;
  }

  return null;
}

async function getRuleViolations() {
  const [rules, stockItems] = await Promise.all([
    prisma.priceRule.findMany({
      where: { status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.stockItem.findMany({
      select: {
        id: true,
        userId: true,
        product: true,
        supplierPhone: true,
        buyingPrice: true,
        sellingPrice: true,
        quantity: true,
      },
    }),
  ]);

  return rules.map((rule) => {
    const violations = stockItems
      .filter((item) => ruleApplies(rule, item))
      .map((item) => {
        const reason = findViolation(rule, item);
        if (!reason) {
          return null;
        }

        return {
          stockItemId: item.id,
          product: item.product,
          supplierPhone: item.supplierPhone,
          buyingPrice: toNumber(item.buyingPrice),
          sellingPrice: toNumber(item.sellingPrice),
          quantity: item.quantity,
          reason,
        };
      })
      .filter(Boolean)
      .slice(0, 8);

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      violations,
      violationCount: violations.length,
    };
  });
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const [rules, violations, audits] = await Promise.all([
    prisma.priceRule.findMany({
      orderBy: { updatedAt: "desc" },
    }),
    getRuleViolations(),
    prisma.priceAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({ rules, violations, audits });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const body = (await request.json()) as PriceRuleInput;
  const name = clean(body.name, 100);
  const scope = body.scope || "GLOBAL";
  const status = body.status || "ACTIVE";

  if (!name || !["GLOBAL", "SUPPLIER", "CATEGORY"].includes(scope)) {
    return NextResponse.json(
      { error: "Add a rule name and valid scope." },
      { status: 400 }
    );
  }

  const rule = await prisma.priceRule.create({
    data: {
      name,
      scope,
      scopeValue: clean(body.scopeValue, 120) || null,
      minMarkupPercent: nullableMoney(body.minMarkupPercent),
      maxMarkupPercent: nullableMoney(body.maxMarkupPercent),
      minSellingPrice: nullableMoney(body.minSellingPrice),
      maxSellingPrice: nullableMoney(body.maxSellingPrice),
      status,
      notes: clean(body.notes, 500) || null,
      createdByUserId: admin.user.uid,
    },
  });

  await Promise.all([
    prisma.priceAuditLog.create({
      data: {
        priceRuleId: rule.id,
        adminUserId: admin.user.uid,
        action: "CREATED",
        after: JSON.parse(JSON.stringify(rule)),
      },
    }),
    recordAdminAction({
      adminUserId: admin.user.uid,
      action: "PRICE_RULE_CREATED",
      targetType: "PriceRule",
      targetId: rule.id,
      summary: `Created price rule ${rule.name}.`,
    }),
  ]);

  return NextResponse.json({ rule }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const body = (await request.json()) as PriceRuleInput;
  const id = clean(body.id, 160);
  if (!id) {
    return NextResponse.json({ error: "Missing rule id." }, { status: 400 });
  }

  const existing = await prisma.priceRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  }

  const update = {
    name: body.name === undefined ? existing.name : clean(body.name, 100),
    scope: body.scope || existing.scope,
    scopeValue:
      body.scopeValue === undefined
        ? existing.scopeValue
        : clean(body.scopeValue, 120) || null,
    minMarkupPercent:
      body.minMarkupPercent === undefined
        ? existing.minMarkupPercent
        : nullableMoney(body.minMarkupPercent),
    maxMarkupPercent:
      body.maxMarkupPercent === undefined
        ? existing.maxMarkupPercent
        : nullableMoney(body.maxMarkupPercent),
    minSellingPrice:
      body.minSellingPrice === undefined
        ? existing.minSellingPrice
        : nullableMoney(body.minSellingPrice),
    maxSellingPrice:
      body.maxSellingPrice === undefined
        ? existing.maxSellingPrice
        : nullableMoney(body.maxSellingPrice),
    status: body.status || existing.status,
    notes:
      body.notes === undefined ? existing.notes : clean(body.notes, 500) || null,
  };

  const rule = await prisma.priceRule.update({
    where: { id },
    data: update,
  });

  await Promise.all([
    prisma.priceAuditLog.create({
      data: {
        priceRuleId: rule.id,
        adminUserId: admin.user.uid,
        action: "UPDATED",
        before: JSON.parse(JSON.stringify(existing)),
        after: JSON.parse(JSON.stringify(rule)),
      },
    }),
    recordAdminAction({
      adminUserId: admin.user.uid,
      action: "PRICE_RULE_UPDATED",
      targetType: "PriceRule",
      targetId: rule.id,
      summary: `Updated price rule ${rule.name}.`,
    }),
  ]);

  return NextResponse.json({ rule });
}
