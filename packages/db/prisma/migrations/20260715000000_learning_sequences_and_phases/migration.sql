-- CreateEnum
CREATE TYPE "LearningPhase" AS ENUM ('CALIBRATION', 'ACQUISITION', 'CONSOLIDATION', 'TRANSFER');

-- Add the column as nullable so every existing session can be backfilled safely.
ALTER TABLE "LearningSession" ADD COLUMN "learningPhase" "LearningPhase";

-- The mapping is part of the SFv2 migration contract. TRAINING is deterministically
-- ACQUISITION; REVIEW and RETURN consolidate; INTERVIEW and BATTLE transfer.
UPDATE "LearningSession"
SET "learningPhase" = CASE "mode"
    WHEN 'ASSESSMENT' THEN 'CALIBRATION'::"LearningPhase"
    WHEN 'TRAINING' THEN 'ACQUISITION'::"LearningPhase"
    WHEN 'REVIEW' THEN 'CONSOLIDATION'::"LearningPhase"
    WHEN 'RETURN' THEN 'CONSOLIDATION'::"LearningPhase"
    WHEN 'INTERVIEW' THEN 'TRANSFER'::"LearningPhase"
    WHEN 'BATTLE' THEN 'TRANSFER'::"LearningPhase"
END;

ALTER TABLE "LearningSession" ALTER COLUMN "learningPhase" SET NOT NULL;

-- Staged-rollout safety only. Application code must explicitly persist the
-- SessionMode -> LearningPhase mapping above instead of relying on this default.
ALTER TABLE "LearningSession" ALTER COLUMN "learningPhase" SET DEFAULT 'ACQUISITION';

-- CreateTable
CREATE TABLE "LearningSequenceBlueprint" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "topicId" UUID NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "phase" "LearningPhase" NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "steps" JSONB NOT NULL,
    "completionRule" JSONB NOT NULL,
    "sourcePack" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningSequenceBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearningSequenceBlueprint_key_version_key" ON "LearningSequenceBlueprint"("key", "version");

-- CreateIndex
CREATE INDEX "LearningSequenceBlueprint_topicId_phase_idx" ON "LearningSequenceBlueprint"("topicId", "phase");

-- CreateIndex
CREATE INDEX "LearningSequenceBlueprint_checksum_idx" ON "LearningSequenceBlueprint"("checksum");

-- CreateIndex
CREATE INDEX "LearningSequenceBlueprint_sourcePack_sourceVersion_idx" ON "LearningSequenceBlueprint"("sourcePack", "sourceVersion");

-- AddForeignKey
ALTER TABLE "LearningSequenceBlueprint" ADD CONSTRAINT "LearningSequenceBlueprint_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
