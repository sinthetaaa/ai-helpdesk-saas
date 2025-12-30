-- CreateEnum
CREATE TYPE "KnowledgeSourceStatus" AS ENUM ('QUEUED', 'INDEXING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('INDEX_KB_SOURCE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "FeedbackRating" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "UsageEventType" AS ENUM ('AI_ASSIST_CALL', 'KB_EMBEDDING');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED');

-- AlterTable
ALTER TABLE "KnowledgeChunk" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "KnowledgeSource" ADD COLUMN     "error" TEXT,
ADD COLUMN     "indexedAt" TIMESTAMP(3),
ADD COLUMN     "status" "KnowledgeSourceStatus" NOT NULL DEFAULT 'QUEUED';

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "sourceId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" "FeedbackRating" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "UsageEventType" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeCustomer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "planId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "maxAgents" INTEGER NOT NULL DEFAULT 3,
    "maxKbSources" INTEGER NOT NULL DEFAULT 10,
    "maxAiMsgsPerMonth" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_tenantId_status_createdAt_idx" ON "Job"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_tenantId_type_status_idx" ON "Job"("tenantId", "type", "status");

-- CreateIndex
CREATE INDEX "Job_sourceId_idx" ON "Job"("sourceId");

-- CreateIndex
CREATE INDEX "AiFeedback_tenantId_createdAt_idx" ON "AiFeedback"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AiFeedback_ticketId_createdAt_idx" ON "AiFeedback"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_tenantId_type_createdAt_idx" ON "UsageEvent"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_tenantId_key" ON "StripeCustomer"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_stripeCustomerId_key" ON "StripeCustomer"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_tenantId_key" ON "Entitlement"("tenantId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_tenantId_status_createdAt_idx" ON "KnowledgeSource"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TicketComment_tenantId_createdAt_idx" ON "TicketComment"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeCustomer" ADD CONSTRAINT "StripeCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
