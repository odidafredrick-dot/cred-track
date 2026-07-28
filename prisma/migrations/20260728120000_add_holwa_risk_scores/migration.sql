CREATE TYPE "RiskLevel" AS ENUM (
  'EXCELLENT',
  'LOW_RISK',
  'MODERATE_RISK',
  'HIGH_RISK',
  'VERY_HIGH_RISK',
  'DO_NOT_EXTEND',
  'LIMITED_HISTORY',
  'NO_HISTORY'
);

CREATE TABLE "HolwaRiskScoreSnapshot" (
  "id" TEXT NOT NULL,
  "debtorPhone" TEXT NOT NULL,
  "score" INTEGER,
  "riskLevel" "RiskLevel" NOT NULL,
  "recommendation" TEXT NOT NULL,
  "suggestedLimit" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "creditCount" INTEGER NOT NULL DEFAULT 0,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HolwaRiskScoreSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HolwaRiskScoreCheck" (
  "id" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "debtorPhone" TEXT NOT NULL,
  "score" INTEGER,
  "riskLevel" "RiskLevel" NOT NULL,
  "recommendation" TEXT NOT NULL,
  "suggestedLimit" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "snapshotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HolwaRiskScoreCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HolwaRiskScoreSnapshot_debtorPhone_idx" ON "HolwaRiskScoreSnapshot"("debtorPhone");
CREATE INDEX "HolwaRiskScoreSnapshot_calculatedAt_idx" ON "HolwaRiskScoreSnapshot"("calculatedAt");
CREATE INDEX "HolwaRiskScoreCheck_requesterUserId_idx" ON "HolwaRiskScoreCheck"("requesterUserId");
CREATE INDEX "HolwaRiskScoreCheck_debtorPhone_idx" ON "HolwaRiskScoreCheck"("debtorPhone");
CREATE INDEX "HolwaRiskScoreCheck_createdAt_idx" ON "HolwaRiskScoreCheck"("createdAt");

ALTER TABLE "HolwaRiskScoreCheck" ADD CONSTRAINT "HolwaRiskScoreCheck_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "HolwaRiskScoreSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
