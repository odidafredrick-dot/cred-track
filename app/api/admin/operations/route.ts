import { NextRequest, NextResponse } from "next/server";
import { recordAdminAction, requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { isUserRole, type UserRole } from "@/lib/user-profile";

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const [announcements, featureFlags, auditLogs] = await Promise.all([
    prisma.systemAnnouncement.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.featureFlag.findMany({
      orderBy: { key: "asc" },
    }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({ announcements, featureFlags, auditLogs });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const body = (await request.json()) as {
    type?: "announcement" | "featureFlag";
    title?: string;
    body?: string;
    audience?: UserRole | "";
    key?: string;
    name?: string;
    description?: string;
    enabled?: boolean;
  };

  if (body.type === "announcement") {
    const title = clean(body.title, 120);
    const message = clean(body.body, 1000);
    const audience = body.audience && isUserRole(body.audience) ? body.audience : null;

    if (!title || !message) {
      return NextResponse.json(
        { error: "Announcement title and body are required." },
        { status: 400 }
      );
    }

    const announcement = await prisma.systemAnnouncement.create({
      data: {
        title,
        body: message,
        audience,
        createdByUserId: admin.user.uid,
      },
    });

    await recordAdminAction({
      adminUserId: admin.user.uid,
      action: "ANNOUNCEMENT_CREATED",
      targetType: "SystemAnnouncement",
      targetId: announcement.id,
      summary: `Created announcement ${announcement.title}.`,
    });

    return NextResponse.json({ announcement }, { status: 201 });
  }

  if (body.type === "featureFlag") {
    const key = clean(body.key, 80).toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
    const name = clean(body.name, 120);

    if (!key || !name) {
      return NextResponse.json(
        { error: "Feature key and name are required." },
        { status: 400 }
      );
    }

    const featureFlag = await prisma.featureFlag.upsert({
      where: { key },
      update: {
        name,
        description: clean(body.description, 500) || null,
        enabled: Boolean(body.enabled),
      },
      create: {
        key,
        name,
        description: clean(body.description, 500) || null,
        enabled: Boolean(body.enabled),
      },
    });

    await recordAdminAction({
      adminUserId: admin.user.uid,
      action: "FEATURE_FLAG_UPSERTED",
      targetType: "FeatureFlag",
      targetId: featureFlag.id,
      summary: `${featureFlag.enabled ? "Enabled" : "Disabled"} feature ${
        featureFlag.key
      }.`,
    });

    return NextResponse.json({ featureFlag }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown operation type." }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const body = (await request.json()) as {
    type?: "announcement" | "featureFlag";
    id?: string;
    active?: boolean;
    enabled?: boolean;
    title?: string;
    body?: string;
    audience?: UserRole | "";
  };
  const id = clean(body.id, 160);

  if (!id) {
    return NextResponse.json({ error: "Missing item id." }, { status: 400 });
  }

  if (body.type === "announcement") {
    const updateData: {
      active?: boolean;
      title?: string;
      body?: string;
      audience?: UserRole | null;
    } = {};

    if (body.active !== undefined) {
      updateData.active = Boolean(body.active);
    }

    if (body.title !== undefined) {
      const title = clean(body.title, 120);
      if (!title) {
        return NextResponse.json({ error: "Announcement title cannot be empty." }, { status: 400 });
      }
      updateData.title = title;
    }

    if (body.body !== undefined) {
      const message = clean(body.body, 1000);
      if (!message) {
        return NextResponse.json({ error: "Announcement body cannot be empty." }, { status: 400 });
      }
      updateData.body = message;
    }

    if (body.audience !== undefined) {
      updateData.audience = body.audience && isUserRole(body.audience) ? body.audience : null;
    }

    const announcement = await prisma.systemAnnouncement.update({
      where: { id },
      data: updateData,
    });

    await recordAdminAction({
      adminUserId: admin.user.uid,
      action: "ANNOUNCEMENT_UPDATED",
      targetType: "SystemAnnouncement",
      targetId: announcement.id,
      summary: `Updated announcement ${announcement.title}.`,
    });

    return NextResponse.json({ announcement });
  }

  if (body.type === "featureFlag") {
    const featureFlag = await prisma.featureFlag.update({
      where: { id },
      data: { enabled: Boolean(body.enabled) },
    });

    await recordAdminAction({
      adminUserId: admin.user.uid,
      action: "FEATURE_FLAG_UPDATED",
      targetType: "FeatureFlag",
      targetId: featureFlag.id,
      summary: `${featureFlag.enabled ? "Enabled" : "Disabled"} feature ${
        featureFlag.key
      }.`,
    });

    return NextResponse.json({ featureFlag });
  }

  return NextResponse.json({ error: "Unknown operation type." }, { status: 400 });
}
