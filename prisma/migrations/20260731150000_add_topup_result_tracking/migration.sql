-- AlterTable
ALTER TABLE "CreditTopup" ADD COLUMN "resultCode" INTEGER;
ALTER TABLE "CreditTopup" ADD COLUMN "resultDescription" TEXT;
ALTER TABLE "CreditTopup" ADD COLUMN "completedAt" TIMESTAMP(3);
