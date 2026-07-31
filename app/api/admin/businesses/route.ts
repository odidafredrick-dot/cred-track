import { NextRequest, NextResponse } from "next/server";
import { recordAdminAction, requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { isUserStatus, type UserStatus } from "@/lib/user-profile";

function clean(value: unknown, max = 160) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: NextRequest) {
    const admin = await requireAdmin(request);
    if ("error" in admin) {
        return admin.error;
    }

    const businesses = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            email: true,
            name: true,
            image: true,
            emailVerified: true,
            createdAt: true,
            updatedAt: true,
            sessions: {
                select: { id: true, updatedAt: true },
            },
            profile: {
                select: {
                    role: true,
                    status: true,
                    businessName: true,
                    businessType: true,
                    currentPlan: true,
                    phoneNumber: true,
                    phoneVerified: true,
                    description: true,
                    county: true,
                    town: true,
                    estate: true,
                },
            },
        },
    });

    const items = businesses
        .filter((user) => user.profile?.role === "BUSINESS" || user.profile?.role === "SUPPLIER")
        .map((user) => {
            const profile = user.profile;
            const location = [profile?.county, profile?.town, profile?.estate]
                .filter(Boolean)
                .join(", ");
            const lastSession = user.sessions.reduce(
                (latest, session) =>
                    session.updatedAt > latest.updatedAt ? session : latest,
                user.sessions[0] || { id: "", updatedAt: user.updatedAt }
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
                description: profile?.description || null,
                location,
                profileComplete:
                    Boolean(profile?.businessName && profile?.phoneNumber && profile?.county && profile?.town && profile?.estate && profile?.description),
                status: (profile?.status as UserStatus) || "ACTIVE",
                lastSeenAt: lastSession.updatedAt.toISOString(),
                sessionCount: user.sessions.length,
                createdAt: user.createdAt.toISOString(),
            };
        });

return NextResponse.json({ items });
}

export async function PATCH(request: NextRequest) {
    const admin = await requireAdmin(request);
    if ("error" in admin) {
        return admin.error;
    }

    const body = (await request.json()) as {
        userId?: string;
        status?: UserStatus;
        currentPlan?: string | null;
        businessType?: string | null;
    };

    const userId = clean(body.userId, 160);
    if (!userId) {
        return NextResponse.json({ error: "Missing business user id." }, { status: 400 });
    }

    const updateData: {
        status?: UserStatus;
        currentPlan?: string | null;
        businessType?: string | null;
    } = {};

    if (body.status !== undefined) {
        if (!isUserStatus(body.status)) {
            return NextResponse.json({ error: "Invalid business status." }, { status: 400 });
        }
        updateData.status = body.status;
    }

    if (body.currentPlan !== undefined) {
        updateData.currentPlan = clean(body.currentPlan, 80) || null;
    }

    if (body.businessType !== undefined) {
        updateData.businessType = clean(body.businessType, 80) || null;
    }

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: "No update fields provided." }, { status: 400 });
    }

    const profile = await prisma.userProfile.upsert({
        where: { userId },
        update: updateData,
        create: {
            userId,
            role: "BUSINESS",
            status: updateData.status ?? "ACTIVE",
            currentPlan: updateData.currentPlan ?? null,
            businessType: updateData.businessType ?? null,
        },
    });

    const summaryParts: string[] = [];
    if (updateData.status) {
        summaryParts.push(`status to ${updateData.status}`);
    }
    if (updateData.currentPlan !== undefined) {
        summaryParts.push(`plan to ${updateData.currentPlan || "none"}`);
    }
    if (updateData.businessType !== undefined) {
        summaryParts.push(`type to ${updateData.businessType || "none"}`);
    }

    await recordAdminAction({
        adminUserId: admin.user.uid,
        action: "BUSINESS_PROFILE_UPDATED",
        targetType: "UserProfile",
        targetId: profile.id,
        summary: `Updated business profile ${userId}: ${summaryParts.join(" and ")}`,
        metadata: updateData,
    });

    return NextResponse.json({ profile });
}
