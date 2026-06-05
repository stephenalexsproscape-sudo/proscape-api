-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "isPremium" BOOLEAN NOT NULL DEFAULT false;
