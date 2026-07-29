import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";
import { getPhoneSearchVariants, normalizePhoneNumber } from "@/lib/phone";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { calculateHolwaRiskScore } from "@/lib/risk-score";

type RiskScoreRequest = {
  userId?: string;
  phone?: string;
  phones?: string[];
  saveCheck?: boolean;
};

async function calculateForPhone(
  requestedPhone: string,
  requesterUserId: string,
  saveCheck: boolean
) {
  const phone = normalizePhoneNumber(requestedPhone);
  const variants = getPhoneSearchVariants(requestedPhone);

  if (!phone || variants.length === 0) {
    return {
      requestedPhone,
      phone,
      error: "Enter a valid phone number.",
    };
  }

  const credits = await prisma.credit.findMany({
    where: {
      OR: [
        { customerPhone: { in: variants } },
        { customer: { phone: { in: variants } } },
      ],
    },
    select: {
      dueDate: true,
      totalAmount: true,
      amountPaid: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const result = calculateHolwaRiskScore(
    phone,
    credits.map((credit) => ({
      dueDate: credit.dueDate,
      totalAmount: Number(credit.totalAmount),
      amountPaid: Number(credit.amountPaid),
      status: credit.status,
      createdAt: credit.createdAt,
      updatedAt: credit.updatedAt,
    }))
  );

  if (saveCheck) {
    await prisma.$transaction(async (tx) => {
      const snapshot = await tx.holwaRiskScoreSnapshot.create({
        data: {
          debtorPhone: phone,
          score: result.score,
          riskLevel: result.riskLevel,
          recommendation: result.recommendation,
          suggestedLimit: result.suggestedLimit,
          creditCount: credits.length,
        },
      });

      await tx.holwaRiskScoreCheck.create({
        data: {
          requesterUserId,
          debtorPhone: phone,
          score: result.score,
          riskLevel: result.riskLevel,
          recommendation: result.recommendation,
          suggestedLimit: result.suggestedLimit,
          snapshotId: snapshot.id,
        },
      });
    });
  }

  return {
    ...result,
    requestedPhone,
  };
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as RiskScoreRequest;

  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (body.userId !== user.uid) {
    return forbiddenResponse();
  }

  const rateLimit = checkRateLimit({
    key: `risk-score:${user.uid}`,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const requestedPhones = body.phones?.length
    ? body.phones
    : body.phone
    ? [body.phone]
    : [];

  if (requestedPhones.length === 0) {
    return NextResponse.json(
      { error: "Enter a debtor phone number." },
      { status: 400 }
    );
  }

  if (requestedPhones.length > 50) {
    return NextResponse.json(
      { error: "Check 50 debtors or fewer at a time." },
      { status: 400 }
    );
  }

  const uniquePhones = Array.from(
    new Set(requestedPhones.map((phone) => phone.trim()).filter(Boolean))
  );
  const saveCheck = body.phones?.length ? false : body.saveCheck !== false;
  const scores = await Promise.all(
    uniquePhones.map((phone) => calculateForPhone(phone, user.uid, saveCheck))
  );

  if (body.phones?.length) {
    return NextResponse.json({ scores });
  }

  return NextResponse.json({ score: scores[0] });
}
