/*
  Warnings:

  - You are about to drop the `BillingSubscription` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BillingWebhookEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StripeCustomer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Subscription` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "BillingSubscription" DROP CONSTRAINT "BillingSubscription_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "StripeCustomer" DROP CONSTRAINT "StripeCustomer_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_tenantId_fkey";

-- DropTable
DROP TABLE "BillingSubscription";

-- DropTable
DROP TABLE "BillingWebhookEvent";

-- DropTable
DROP TABLE "StripeCustomer";

-- DropTable
DROP TABLE "Subscription";

-- DropEnum
DROP TYPE "BillingProvider";

-- DropEnum
DROP TYPE "SubscriptionStatus";
