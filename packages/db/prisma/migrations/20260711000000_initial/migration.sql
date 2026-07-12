-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- UUID functions are kept available for operational SQL and future migrations.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('UNKNOWN', 'WEAK', 'UNSTABLE', 'SOLID', 'MASTERED');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('ASSESSMENT', 'TRAINING', 'REVIEW', 'INTERVIEW', 'RETURN', 'BATTLE');

-- CreateEnum
CREATE TYPE "LoadMode" AS ENUM ('MINIMAL', 'NORMAL', 'DEEP', 'RETURN');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'EXPLAIN', 'PREDICT_OUTPUT', 'FIND_BUG', 'CODE', 'COMPARE_SOLUTIONS', 'AI_REVIEW', 'FLASHCARD');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "HelpLevel" AS ENUM ('NONE', 'NUDGE', 'HINT', 'MULTIPLE_HINTS', 'SOLUTION_VIEWED');

-- CreateEnum
CREATE TYPE "EvaluatorType" AS ENUM ('EXACT_MATCH', 'TEST_RUNNER', 'MANUAL', 'EXTERNAL_AI', 'API_AI', 'SELF_REPORT');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('RECALL', 'EXPLANATION', 'PREDICT_OUTPUT', 'DEBUGGING', 'CODE_CORRECTNESS', 'EDGE_CASES', 'COMPLEXITY_REASONING', 'INTERVIEW_RESPONSE', 'TRANSFER', 'BATTLE', 'AI_REVIEW', 'SELF_REPORT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RECEIVED', 'VALIDATED', 'PREVIEWED', 'APPLIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ru',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "targetTrackKey" TEXT NOT NULL DEFAULT 'yandex-frontend-2026',
    "defaultLoadMode" "LoadMode" NOT NULL DEFAULT 'NORMAL',
    "codeLanguage" TEXT NOT NULL DEFAULT 'typescript',
    "aiMode" TEXT NOT NULL DEFAULT 'manual',
    "apiMonthlyBudgetUsd" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "resumeThresholdDays" INTEGER NOT NULL DEFAULT 7,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPack" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "checksum" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourcePack" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "trackId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "whyImportant" TEXT NOT NULL,
    "atWork" TEXT NOT NULL,
    "atInterview" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "defaultHalfLifeDays" INTEGER NOT NULL DEFAULT 90,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourcePack" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicDependency" (
    "topicId" UUID NOT NULL,
    "prerequisiteId" UUID NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "TopicDependency_pkey" PRIMARY KEY ("topicId","prerequisiteId")
);

-- CreateTable
CREATE TABLE "TopicState" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "status" "TopicStatus" NOT NULL DEFAULT 'UNKNOWN',
    "masteryEstimate" DOUBLE PRECISION,
    "masteryConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "independentDays" INTEGER NOT NULL DEFAULT 0,
    "taskKindCount" INTEGER NOT NULL DEFAULT 0,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "lastEvidenceAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "algorithmVersion" TEXT NOT NULL,
    "explanation" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" UUID NOT NULL,
    "stableKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "topicId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT,
    "payload" JSONB,
    "sourcePack" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "stableKey" TEXT NOT NULL,
    "topicId" UUID NOT NULL,
    "kind" "TaskKind" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskVersion" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "promptMarkdown" TEXT NOT NULL,
    "starterCode" TEXT,
    "language" TEXT,
    "options" JSONB,
    "expectedAnswer" JSONB,
    "rubric" JSONB NOT NULL,
    "hints" JSONB NOT NULL,
    "acceptanceCriteria" JSONB NOT NULL,
    "metadata" JSONB,
    "sourcePack" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "TaskVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTestCase" (
    "id" UUID NOT NULL,
    "taskVersionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "input" JSONB,
    "expected" JSONB,
    "testCode" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,

    CONSTRAINT "TaskTestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentBlueprint" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalBlocks" INTEGER NOT NULL,
    "estimatedMin" INTEGER NOT NULL,
    "selectionRules" JSONB NOT NULL,
    "sourcePack" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentBlueprintItem" (
    "id" UUID NOT NULL,
    "blueprintId" UUID NOT NULL,
    "taskVersionId" UUID NOT NULL,
    "blockIndex" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "dimensionWeights" JSONB,

    CONSTRAINT "AssessmentBlueprintItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentRun" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "blueprintId" UUID NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'DRAFT',
    "currentBlock" INTEGER NOT NULL DEFAULT 0,
    "currentPosition" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "AssessmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assessmentRunId" UUID,
    "mode" "SessionMode" NOT NULL,
    "loadMode" "LoadMode" NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'DRAFT',
    "planSnapshot" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "loadFeedback" TEXT,
    "summary" TEXT,
    "lastStepLabel" TEXT,

    CONSTRAINT "LearningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionItem" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "taskVersionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "sessionItemId" UUID,
    "taskVersionId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "answerText" TEXT,
    "answerCode" TEXT,
    "selectedOptions" JSONB,
    "runnerOutput" JSONB,
    "selfRating" INTEGER,
    "confidence" INTEGER,
    "helpLevel" "HelpLevel" NOT NULL DEFAULT 'NONE',
    "hintsUsed" JSONB,
    "durationMs" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "importBatchId" UUID,
    "evaluatorType" "EvaluatorType" NOT NULL,
    "evaluatorVersion" TEXT NOT NULL,
    "rawScore" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "reliability" DOUBLE PRECISION NOT NULL,
    "dimensionScores" JSONB NOT NULL,
    "feedbackMarkdown" TEXT,
    "rubricResult" JSONB,
    "externalReference" TEXT,
    "supersedesId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "evaluationId" UUID,
    "externalArtifactId" UUID,
    "kind" "EvidenceKind" NOT NULL,
    "rawScore" DOUBLE PRECISION NOT NULL,
    "normalizedScore" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Misconception" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "remediation" TEXT NOT NULL,

    CONSTRAINT "Misconception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicMisconception" (
    "topicId" UUID NOT NULL,
    "misconceptionId" UUID NOT NULL,

    CONSTRAINT "TopicMisconception_pkey" PRIMARY KEY ("topicId","misconceptionId")
);

-- CreateTable
CREATE TABLE "EvaluationMisconception" (
    "evaluationId" UUID NOT NULL,
    "misconceptionId" UUID NOT NULL,
    "evidence" TEXT NOT NULL,
    "remediation" TEXT NOT NULL,

    CONSTRAINT "EvaluationMisconception_pkey" PRIMARY KEY ("evaluationId","misconceptionId")
);

-- CreateTable
CREATE TABLE "ReviewSchedule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalArtifact" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "projectName" TEXT,
    "repositoryUrl" TEXT,
    "resultUrl" TEXT,
    "description" TEXT NOT NULL,
    "acceptanceCriteria" JSONB NOT NULL,
    "beforeNotes" TEXT,
    "afterNotes" TEXT,
    "aiUsageNotes" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalArtifactTopic" (
    "externalArtifactId" UUID NOT NULL,
    "topicId" UUID NOT NULL,

    CONSTRAINT "ExternalArtifactTopic_pkey" PRIMARY KEY ("externalArtifactId","topicId")
);

-- CreateTable
CREATE TABLE "ExportBundle" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "bundleType" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceBundleId" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'RECEIVED',
    "checksum" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "normalized" JSONB,
    "preview" JSONB,
    "validationErrors" JSONB,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetTrack" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetTrackRule" (
    "id" UUID NOT NULL,
    "targetTrackId" UUID NOT NULL,
    "trackId" UUID,
    "topicId" UUID,
    "weight" DOUBLE PRECISION NOT NULL,
    "minimum" DOUBLE PRECISION,
    "gate" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "TargetTrackRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "ContentPack_key_status_idx" ON "ContentPack"("key", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPack_key_version_key" ON "ContentPack"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Track_key_key" ON "Track"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_key_key" ON "Topic"("key");

-- CreateIndex
CREATE INDEX "Topic_trackId_position_idx" ON "Topic"("trackId", "position");

-- CreateIndex
CREATE INDEX "Topic_status_idx" ON "Topic"("status");

-- CreateIndex
CREATE INDEX "TopicDependency_prerequisiteId_idx" ON "TopicDependency"("prerequisiteId");

-- CreateIndex
CREATE INDEX "TopicState_userId_status_idx" ON "TopicState"("userId", "status");

-- CreateIndex
CREATE INDEX "TopicState_userId_nextReviewAt_idx" ON "TopicState"("userId", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "TopicState_userId_topicId_key" ON "TopicState"("userId", "topicId");

-- CreateIndex
CREATE INDEX "ContentItem_topicId_kind_idx" ON "ContentItem"("topicId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_stableKey_version_key" ON "ContentItem"("stableKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Task_stableKey_key" ON "Task"("stableKey");

-- CreateIndex
CREATE INDEX "Task_topicId_kind_idx" ON "Task"("topicId", "kind");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "TaskVersion_checksum_idx" ON "TaskVersion"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "TaskVersion_taskId_version_key" ON "TaskVersion"("taskId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTestCase_taskVersionId_position_key" ON "TaskTestCase"("taskVersionId", "position");

-- CreateIndex
CREATE INDEX "AssessmentBlueprint_status_idx" ON "AssessmentBlueprint"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentBlueprint_key_version_key" ON "AssessmentBlueprint"("key", "version");

-- CreateIndex
CREATE INDEX "AssessmentBlueprintItem_taskVersionId_idx" ON "AssessmentBlueprintItem"("taskVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentBlueprintItem_blueprintId_blockIndex_position_key" ON "AssessmentBlueprintItem"("blueprintId", "blockIndex", "position");

-- CreateIndex
CREATE INDEX "AssessmentRun_userId_status_idx" ON "AssessmentRun"("userId", "status");

-- CreateIndex
CREATE INDEX "AssessmentRun_blueprintId_status_idx" ON "AssessmentRun"("blueprintId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LearningSession_assessmentRunId_key" ON "LearningSession"("assessmentRunId");

-- CreateIndex
CREATE INDEX "LearningSession_userId_status_idx" ON "LearningSession"("userId", "status");

-- CreateIndex
CREATE INDEX "LearningSession_userId_completedAt_idx" ON "LearningSession"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "SessionItem_taskVersionId_idx" ON "SessionItem"("taskVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionItem_sessionId_position_key" ON "SessionItem"("sessionId", "position");

-- CreateIndex
CREATE INDEX "Attempt_userId_taskVersionId_idx" ON "Attempt"("userId", "taskVersionId");

-- CreateIndex
CREATE INDEX "Attempt_sessionId_sessionItemId_idx" ON "Attempt"("sessionId", "sessionItemId");

-- CreateIndex
CREATE INDEX "Attempt_submittedAt_idx" ON "Attempt"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_sessionId_sessionItemId_sequence_key" ON "Attempt"("sessionId", "sessionItemId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_supersedesId_key" ON "Evaluation"("supersedesId");

-- CreateIndex
CREATE INDEX "Evaluation_attemptId_createdAt_idx" ON "Evaluation"("attemptId", "createdAt");

-- CreateIndex
CREATE INDEX "Evaluation_userId_createdAt_idx" ON "Evaluation"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_importBatchId_attemptId_key" ON "Evaluation"("importBatchId", "attemptId");

-- CreateIndex
CREATE INDEX "Evidence_userId_topicId_occurredAt_idx" ON "Evidence"("userId", "topicId", "occurredAt");

-- CreateIndex
CREATE INDEX "Evidence_evaluationId_idx" ON "Evidence"("evaluationId");

-- CreateIndex
CREATE INDEX "Evidence_externalArtifactId_idx" ON "Evidence"("externalArtifactId");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_evaluationId_topicId_kind_key" ON "Evidence"("evaluationId", "topicId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_externalArtifactId_topicId_kind_key" ON "Evidence"("externalArtifactId", "topicId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Misconception_key_key" ON "Misconception"("key");

-- CreateIndex
CREATE INDEX "TopicMisconception_misconceptionId_idx" ON "TopicMisconception"("misconceptionId");

-- CreateIndex
CREATE INDEX "EvaluationMisconception_misconceptionId_idx" ON "EvaluationMisconception"("misconceptionId");

-- CreateIndex
CREATE INDEX "ReviewSchedule_userId_dueAt_idx" ON "ReviewSchedule"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "ReviewSchedule_userId_topicId_completedAt_idx" ON "ReviewSchedule"("userId", "topicId", "completedAt");

-- CreateIndex
CREATE INDEX "ExternalArtifact_userId_occurredAt_idx" ON "ExternalArtifact"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "ExternalArtifactTopic_topicId_idx" ON "ExternalArtifactTopic"("topicId");

-- CreateIndex
CREATE INDEX "ExportBundle_userId_createdAt_idx" ON "ExportBundle"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExportBundle_userId_checksum_key" ON "ExportBundle"("userId", "checksum");

-- CreateIndex
CREATE INDEX "ImportBatch_userId_createdAt_idx" ON "ImportBatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_userId_checksum_key" ON "ImportBatch"("userId", "checksum");

-- CreateIndex
CREATE INDEX "MetricSnapshot_userId_createdAt_idx" ON "MetricSnapshot"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MetricSnapshot_userId_scope_createdAt_idx" ON "MetricSnapshot"("userId", "scope", "createdAt");

-- CreateIndex
CREATE INDEX "TargetTrack_status_idx" ON "TargetTrack"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TargetTrack_key_version_key" ON "TargetTrack"("key", "version");

-- CreateIndex
CREATE INDEX "TargetTrackRule_targetTrackId_idx" ON "TargetTrackRule"("targetTrackId");

-- CreateIndex
CREATE INDEX "TargetTrackRule_trackId_idx" ON "TargetTrackRule"("trackId");

-- CreateIndex
CREATE INDEX "TargetTrackRule_topicId_idx" ON "TargetTrackRule"("topicId");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicDependency" ADD CONSTRAINT "TopicDependency_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicDependency" ADD CONSTRAINT "TopicDependency_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicState" ADD CONSTRAINT "TopicState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicState" ADD CONSTRAINT "TopicState_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskVersion" ADD CONSTRAINT "TaskVersion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTestCase" ADD CONSTRAINT "TaskTestCase_taskVersionId_fkey" FOREIGN KEY ("taskVersionId") REFERENCES "TaskVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentBlueprintItem" ADD CONSTRAINT "AssessmentBlueprintItem_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "AssessmentBlueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentBlueprintItem" ADD CONSTRAINT "AssessmentBlueprintItem_taskVersionId_fkey" FOREIGN KEY ("taskVersionId") REFERENCES "TaskVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRun" ADD CONSTRAINT "AssessmentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRun" ADD CONSTRAINT "AssessmentRun_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "AssessmentBlueprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_assessmentRunId_fkey" FOREIGN KEY ("assessmentRunId") REFERENCES "AssessmentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionItem" ADD CONSTRAINT "SessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionItem" ADD CONSTRAINT "SessionItem_taskVersionId_fkey" FOREIGN KEY ("taskVersionId") REFERENCES "TaskVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "SessionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_taskVersionId_fkey" FOREIGN KEY ("taskVersionId") REFERENCES "TaskVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Evaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_externalArtifactId_fkey" FOREIGN KEY ("externalArtifactId") REFERENCES "ExternalArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMisconception" ADD CONSTRAINT "TopicMisconception_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMisconception" ADD CONSTRAINT "TopicMisconception_misconceptionId_fkey" FOREIGN KEY ("misconceptionId") REFERENCES "Misconception"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMisconception" ADD CONSTRAINT "EvaluationMisconception_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMisconception" ADD CONSTRAINT "EvaluationMisconception_misconceptionId_fkey" FOREIGN KEY ("misconceptionId") REFERENCES "Misconception"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSchedule" ADD CONSTRAINT "ReviewSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSchedule" ADD CONSTRAINT "ReviewSchedule_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalArtifact" ADD CONSTRAINT "ExternalArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalArtifactTopic" ADD CONSTRAINT "ExternalArtifactTopic_externalArtifactId_fkey" FOREIGN KEY ("externalArtifactId") REFERENCES "ExternalArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalArtifactTopic" ADD CONSTRAINT "ExternalArtifactTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportBundle" ADD CONSTRAINT "ExportBundle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetTrackRule" ADD CONSTRAINT "TargetTrackRule_targetTrackId_fkey" FOREIGN KEY ("targetTrackId") REFERENCES "TargetTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetTrackRule" ADD CONSTRAINT "TargetTrackRule_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetTrackRule" ADD CONSTRAINT "TargetTrackRule_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain-level integrity that Prisma cannot express in schema.prisma.
ALTER TABLE "UserSettings"
  ADD CONSTRAINT "UserSettings_budget_check" CHECK ("apiMonthlyBudgetUsd" >= 0 AND "apiMonthlyBudgetUsd" <= 10),
  ADD CONSTRAINT "UserSettings_resume_days_check" CHECK ("resumeThresholdDays" >= 1);

ALTER TABLE "TopicState"
  ADD CONSTRAINT "TopicState_mastery_estimate_check" CHECK ("masteryEstimate" IS NULL OR ("masteryEstimate" >= 0 AND "masteryEstimate" <= 100)),
  ADD CONSTRAINT "TopicState_mastery_confidence_check" CHECK ("masteryConfidence" >= 0 AND "masteryConfidence" <= 100),
  ADD CONSTRAINT "TopicState_counts_check" CHECK ("evidenceWeight" >= 0 AND "evidenceCount" >= 0 AND "independentDays" >= 0 AND "taskKindCount" >= 0);

ALTER TABLE "AssessmentBlueprintItem"
  ADD CONSTRAINT "AssessmentBlueprintItem_position_check" CHECK ("blockIndex" >= 0 AND "position" >= 0);

ALTER TABLE "AssessmentRun"
  ADD CONSTRAINT "AssessmentRun_position_check" CHECK ("currentBlock" >= 0 AND "currentPosition" >= 0);

ALTER TABLE "LearningSession"
  ADD CONSTRAINT "LearningSession_duration_check" CHECK ("durationSec" >= 0);

ALTER TABLE "Attempt"
  ADD CONSTRAINT "Attempt_revision_check" CHECK ("revision" >= 0),
  ADD CONSTRAINT "Attempt_sequence_check" CHECK ("sequence" >= 1),
  ADD CONSTRAINT "Attempt_self_rating_check" CHECK ("selfRating" IS NULL OR ("selfRating" >= 1 AND "selfRating" <= 5)),
  ADD CONSTRAINT "Attempt_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 100)),
  ADD CONSTRAINT "Attempt_duration_check" CHECK ("durationMs" IS NULL OR "durationMs" >= 0);

ALTER TABLE "Evaluation"
  ADD CONSTRAINT "Evaluation_score_check" CHECK ("rawScore" IS NULL OR ("rawScore" >= 0 AND "rawScore" <= 100)),
  ADD CONSTRAINT "Evaluation_reliability_check" CHECK ("reliability" >= 0 AND "reliability" <= 1),
  ADD CONSTRAINT "Evaluation_not_self_superseding_check" CHECK ("supersedesId" IS NULL OR "supersedesId" <> "id");

ALTER TABLE "Evidence"
  ADD CONSTRAINT "Evidence_score_check" CHECK ("rawScore" >= 0 AND "rawScore" <= 100 AND "normalizedScore" >= 0 AND "normalizedScore" <= 100),
  ADD CONSTRAINT "Evidence_weight_check" CHECK ("weight" >= 0),
  ADD CONSTRAINT "Evidence_single_source_check" CHECK (num_nonnulls("evaluationId", "externalArtifactId") = 1);

ALTER TABLE "ReviewSchedule"
  ADD CONSTRAINT "ReviewSchedule_interval_check" CHECK ("intervalDays" >= 1);

ALTER TABLE "TargetTrackRule"
  ADD CONSTRAINT "TargetTrackRule_weight_check" CHECK ("weight" >= 0),
  ADD CONSTRAINT "TargetTrackRule_minimum_check" CHECK ("minimum" IS NULL OR ("minimum" >= 0 AND "minimum" <= 100)),
  ADD CONSTRAINT "TargetTrackRule_scope_check" CHECK (num_nonnulls("trackId", "topicId") = 1);

-- A version referenced by an attempt is immutable, including its tests.
CREATE OR REPLACE FUNCTION "prevent_used_task_version_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Attempt" WHERE "taskVersionId" = OLD."id" LIMIT 1
  ) THEN
    RAISE EXCEPTION 'TaskVersion % is immutable because attempts reference it', OLD."id"
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TaskVersion_prevent_used_mutation"
BEFORE UPDATE OR DELETE ON "TaskVersion"
FOR EACH ROW
EXECUTE FUNCTION "prevent_used_task_version_mutation"();

CREATE OR REPLACE FUNCTION "prevent_used_task_test_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Attempt" WHERE "taskVersionId" = OLD."taskVersionId" LIMIT 1
  ) THEN
    RAISE EXCEPTION 'TaskTestCase is immutable because attempts reference TaskVersion %', OLD."taskVersionId"
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TaskTestCase_prevent_used_mutation"
BEFORE UPDATE OR DELETE ON "TaskTestCase"
FOR EACH ROW
EXECUTE FUNCTION "prevent_used_task_test_mutation"();
