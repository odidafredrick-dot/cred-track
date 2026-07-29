import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.uid },
    select: { role: true },
  });

  if (profile?.role !== "BUSINESS") {
    return forbiddenResponse();
  }

  const suppliers = await prisma.userProfile.findMany({
    where: {
      role: "SUPPLIER",
      businessName: { not: null },
    },
    orderBy: { businessName: "asc" },
  });

  return NextResponse.json({ suppliers });
}
