ALTER TABLE "AssessmentRun"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "AssessmentRun_userId_createdAt_idx"
  ON "AssessmentRun"("userId", "createdAt");
