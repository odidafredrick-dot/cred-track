import { prisma } from "@/lib/prisma";

export async function isFeatureEnabled(key: string, fallback = true) {
    try {
        const flag = await prisma.featureFlag.findUnique({
            where: { key },
            select: { enabled: true },
        });

        return flag ? flag.enabled : fallback;
    } catch {
        return fallback;
    }
}
