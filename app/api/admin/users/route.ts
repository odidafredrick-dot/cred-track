import { NextRequest, NextResponse } from "next/server";
import { recordAdminAction, requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  isUserRole,
  isUserStatus,
  type UserRole,
  type UserStatus,
} from "@/lib/user-profile";

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
  const requestedRole = clean(searchParams.get("role"), 40);
  const requestedStatus = clean(searchParams.get("status"), 40);
  const role = isUserRole(requestedRole) ? requestedRole : "";
  const status = isUserStatus(requestedStatus) ? requestedStatus : "";

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
        status: true,
        businessName: true,
        businessType: true,
        currentPlan: true,
        phoneNumber: true,
        phoneVerified: true,
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
        businessType: profile?.businessType || null,
        currentPlan: profile?.currentPlan || null,
        phoneNumber: profile?.phoneNumber || null,
        phoneVerified: profile?.phoneVerified ?? false,
        location: [profile?.county, profile?.town, profile?.estate]
          .filter(Boolean)
          .join(", "),
        profileComplete,
        status: (profile?.status as UserStatus) || "ACTIVE",
        lastSeenAt: session?._max.updatedAt?.toISOString() || user.updatedAt.toISOString(),
        sessionCount: session?._count._all || 0,
        createdAt: user.createdAt.toISOString(),
      };
    })
    .filter((user) => (role ? user.role === role : true))
    .filter((user) => (status ? user.status === status : true))
    .filter((user) =>
      includesTerm(
        [
          user.email,
          user.name,
          user.businessName,
          user.phoneNumber,
          user.location,
        ],
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
    status?: UserStatus;
  };
  const userId = clean(body.userId, 160);
  const requestedRole = body.role || null;
  const requestedStatus = body.status || null;

  if (!userId) {
    return NextResponse.json(
      { error: "Missing user" },
      { status: 400 }
    );
  }

  if (!isUserRole(requestedRole) && !isUserStatus(requestedStatus)) {
    return NextResponse.json(
      { error: "Missing or invalid role/status" },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updateData: { role?: UserRole; status?: UserStatus } = {};
  if (isUserRole(requestedRole)) {
    updateData.role = requestedRole;
  }
  if (isUserStatus(requestedStatus)) {
    updateData.status = requestedStatus;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "Invalid update properties" },
      { status: 400 }
    );
  }

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    update: updateData,
    create: {
      userId,
      role: updateData.role ?? "INDIVIDUAL",
      status: updateData.status ?? "ACTIVE",
    },
  });

  const summaryParts = [];
  if (updateData.role) {
    summaryParts.push(`role to ${updateData.role}`);
  }
  if (updateData.status) {
    summaryParts.push(`status to ${updateData.status}`);
  }

  await recordAdminAction({
    adminUserId: admin.user.uid,
    action: "USER_PROFILE_UPDATED",
    targetType: "User",
    targetId: userId,
    summary: `Updated ${targetUser.email} ${summaryParts.join(" and ")}.`,
    metadata: updateData,
  });

  return NextResponse.json({ profile });
}
