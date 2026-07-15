-- Additive storage for rendered CONTENT steps in versioned learning sessions.
-- Existing sessions, answers, attempts, evaluations, evidence, snapshots, and imports are untouched.
CREATE TABLE "LearningSessionContentStep" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "sequencePosition" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "snapshot" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningSessionContentStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningSessionContentStep_sessionId_sequencePosition_key"
ON "LearningSessionContentStep"("sessionId", "sequencePosition");

CREATE INDEX "LearningSessionContentStep_contentItemId_idx"
ON "LearningSessionContentStep"("contentItemId");

CREATE INDEX "LearningSessionContentStep_sessionId_completedAt_idx"
ON "LearningSessionContentStep"("sessionId", "completedAt");

ALTER TABLE "LearningSessionContentStep"
ADD CONSTRAINT "LearningSessionContentStep_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "LearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningSessionContentStep"
ADD CONSTRAINT "LearningSessionContentStep_contentItemId_fkey"
FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
