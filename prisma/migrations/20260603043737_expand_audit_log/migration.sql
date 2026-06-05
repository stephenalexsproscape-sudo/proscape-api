-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "newValues" JSONB,
ADD COLUMN     "oldValues" JSONB;
