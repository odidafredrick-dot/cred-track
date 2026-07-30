ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';

CREATE TYPE "PriceRuleScope" AS ENUM ('GLOBAL', 'SUPPLIER', 'CATEGORY');
CREATE TYPE "PriceRuleStatus" AS ENUM ('ACTIVE', 'PAUSED');

CREATE TABLE "PriceRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "PriceRuleScope" NOT NULL DEFAULT 'GLOBAL',
    "scopeValue" TEXT,
    "minMarkupPercent" DECIMAL(10,2),
    "maxMarkupPercent" DECIMAL(10,2),
    "minSellingPrice" DECIMAL(10,2),
    "maxSellingPrice" DECIMAL(10,2),
    "status" "PriceRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PriceRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceAuditLog" (
    "id" TEXT NOT NULL,
    "priceRuleId" TEXT,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "audience" "UserRole",
    "createdByUserId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceRule_scope_idx" ON "PriceRule"("scope");
CREATE INDEX "PriceRule_status_idx" ON "PriceRule"("status");
CREATE INDEX "PriceAuditLog_priceRuleId_idx" ON "PriceAuditLog"("priceRuleId");
CREATE INDEX "PriceAuditLog_adminUserId_idx" ON "PriceAuditLog"("adminUserId");
CREATE INDEX "PriceAuditLog_createdAt_idx" ON "PriceAuditLog"("createdAt");
CREATE INDEX "AdminAuditLog_adminUserId_idx" ON "AdminAuditLog"("adminUserId");
CREATE INDEX "AdminAuditLog_targetType_idx" ON "AdminAuditLog"("targetType");
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX "SystemAnnouncement_active_idx" ON "SystemAnnouncement"("active");
CREATE INDEX "SystemAnnouncement_audience_idx" ON "SystemAnnouncement"("audience");
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

ALTER TABLE "PriceAuditLog" ADD CONSTRAINT "PriceAuditLog_priceRuleId_fkey"
FOREIGN KEY ("priceRuleId") REFERENCES "PriceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
