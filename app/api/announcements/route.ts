import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";

export async function GET(request: NextRequest) {
    const authenticatedUser = await getAuthenticatedUser(request);
    if (!authenticatedUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
        where: { userId: authenticatedUser.uid },
        select: { role: true },
    });

    const announcementsEnabled = await isFeatureEnabled("announcements_feed", true);
    if (!announcementsEnabled) {
        return NextResponse.json({ announcements: [] });
    }

    const now = new Date();
    const announcements = await prisma.systemAnnouncement.findMany({
        where: { active: true },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            title: true,
            body: true,
            audience: true,
            startsAt: true,
            endsAt: true,
            createdAt: true,
        },
        take: 10,
    });

    const userRole = profile?.role ?? null;

    const visibleAnnouncements = announcements.filter((announcement) => {
        if (announcement.audience) {
            if (!userRole) {
                return false;
            }

            if (announcement.audience !== userRole) {
                return false;
            }
        }

        if (announcement.startsAt && new Date(announcement.startsAt) > now) {
            return false;
        }

        if (announcement.endsAt && new Date(announcement.endsAt) < now) {
            return false;
        }

        return true;
    });

    return NextResponse.json({ announcements: visibleAnnouncements });
}
