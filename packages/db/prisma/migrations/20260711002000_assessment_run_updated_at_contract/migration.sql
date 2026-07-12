-- Prisma @updatedAt is maintained by the client and must not have a database default.
-- The previous migration used a temporary default to backfill existing rows safely.
ALTER TABLE "AssessmentRun"
  ALTER COLUMN "updatedAt" DROP DEFAULT;
