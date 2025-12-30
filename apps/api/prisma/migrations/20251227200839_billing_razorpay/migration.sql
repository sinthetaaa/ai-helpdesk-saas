-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('RAZORPAY', 'STRIPE');

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "providerSubscriptionId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_tenantId_key" ON "BillingSubscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_providerSubscriptionId_key" ON "BillingSubscription"("providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingWebhookEvent_provider_bodyHash_key" ON "BillingWebhookEvent"("provider", "bodyHash");

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
