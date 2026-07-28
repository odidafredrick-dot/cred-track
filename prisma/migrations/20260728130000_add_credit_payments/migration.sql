CREATE TABLE "CreditPayment" (
  "id" TEXT NOT NULL,
  "creditId" TEXT NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreditPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreditPayment_creditId_idx" ON "CreditPayment"("creditId");

ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_creditId_fkey"
FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
