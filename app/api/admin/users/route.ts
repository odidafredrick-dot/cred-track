import { NextRequest, NextResponse } from "next/server";
import { recordAdminAction, requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { isUserRole, type UserRole } from "@/lib/user-profile";

function clean(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function includesTerm(values: Array<string | null | undefined>, term: string) {
  if (!term) {
    return true;
  }

  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(term);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const { searchParams } = new URL(request.url);
  const term = clean(searchParams.get("q"), 80).toLowerCase();
  const role = clean(searchParams.get("role"), 40);

  const [users, profiles, sessions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 250,
    }),
    prisma.userProfile.findMany({
      select: {
        id: true,
        userId: true,
        role: true,
        businessName: true,
        phoneNumber: true,
        county: true,
        town: true,
        estate: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.session.groupBy({
      by: ["userId"],
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
  ]);

  const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  const sessionByUser = new Map(sessions.map((session) => [session.userId, session]));

  const items = users
    .map((user) => {
      const profile = profileByUser.get(user.id) || null;
      const session = sessionByUser.get(user.id);
      const profileComplete =
        profile?.role === "INDIVIDUAL" ||
        profile?.role === "ADMIN" ||
        Boolean(
          profile?.businessName &&
            profile.phoneNumber &&
            profile.county &&
            profile.town &&
            profile.estate &&
            profile.description
        );

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        emailVerified: user.emailVerified,
        role: profile?.role || null,
        businessName: profile?.businessName || null,
        phoneNumber: profile?.phoneNumber || null,
        location: [profile?.county, profile?.town, profile?.estate]
          .filter(Boolean)
          .join(", "),
        profileComplete,
        status: profileComplete ? "active" : "pending_profile",
        lastSeenAt: session?._max.updatedAt?.toISOString() || user.updatedAt.toISOString(),
        sessionCount: session?._count._all || 0,
        createdAt: user.createdAt.toISOString(),
      };
    })
    .filter((user) => (role ? user.role === role : true))
    .filter((user) =>
      includesTerm(
        [user.email, user.name, user.businessName, user.phoneNumber, user.location],
        term
      )
    );

  return NextResponse.json({ items });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const body = (await request.json()) as {
    userId?: string;
    role?: UserRole;
  };
  const userId = clean(body.userId, 160);
  const requestedRole = body.role || null;

  if (!userId || !isUserRole(requestedRole)) {
    return NextResponse.json(
      { error: "Missing user or invalid role" },
      { status: 400 }
    );
  }

  const role = requestedRole;

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    update: { role },
    create: {
      userId,
      role,
    },
  });

  await recordAdminAction({
    adminUserId: admin.user.uid,
    action: "USER_ROLE_UPDATED",
    targetType: "User",
    targetId: userId,
    summary: `Updated ${targetUser.email} role to ${role}.`,
    metadata: { role },
  });

  return NextResponse.json({ profile });
}
