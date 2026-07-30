import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

function adminEmailSet() {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return adminEmailSet().has(email.trim().toLowerCase());
}

export async function requireAdmin(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.uid },
  });

  const isAdminProfile = String(profile?.role || "") === "ADMIN";
  if (!isAdminProfile && !isAdminEmail(user.email)) {
    return {
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }

  return { user, profile };
}

export async function recordAdminAction({
  adminUserId,
  action,
  targetType,
  targetId,
  summary,
  metadata,
}: {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  metadata?: unknown;
}) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminUserId,
        action,
        targetType,
        targetId: targetId || null,
        summary,
        metadata: metadata === undefined ? undefined : JSON.parse(JSON.stringify(metadata)),
      },
    });
  } catch {
    // Admin actions should not fail the primary operation if the audit table has
    // not been migrated yet.
  }
}
