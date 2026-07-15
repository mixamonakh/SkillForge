-- Additive persistence for bounded AI-assisted evaluation. Existing answers,
-- attempts, evaluations, evidence, snapshots, and imports are not rewritten.

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM (
  'ATTEMPT_EVALUATION',
  'NUDGE',
  'CONTENT_REVIEW',
  'MISCONCEPTION_SYNTHESIS'
);

-- CreateEnum
CREATE TYPE "AiInvocationStatus" AS ENUM (
  'RESERVED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'REJECTED_BUDGET',
  'CACHED'
);

-- CreateEnum
CREATE TYPE "AiEvaluationDraftStatus" AS ENUM (
  'PENDING',
  'APPLIED',
  'REJECTED',
  'ROLLED_BACK'
);

-- CreateTable
CREATE TABLE "AiPromptVersion" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "feature" "AiFeature" NOT NULL,
  "systemPrompt" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiPromptVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiPromptVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "AiPromptVersion_key_check" CHECK (length("key") > 0),
  CONSTRAINT "AiPromptVersion_schemaVersion_check" CHECK (length("schemaVersion") > 0),
  CONSTRAINT "AiPromptVersion_checksum_check" CHECK (length("checksum") > 0)
);

-- CreateTable
CREATE TABLE "AiBudgetPeriod" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "period" TEXT NOT NULL,
  "limitUsd" DECIMAL(8,2) NOT NULL,
  "spentUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
  "reservedUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiBudgetPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiBudgetPeriod_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "AiBudgetPeriod_limitUsd_check" CHECK ("limitUsd" >= 0),
  CONSTRAINT "AiBudgetPeriod_spentUsd_check" CHECK ("spentUsd" >= 0),
  CONSTRAINT "AiBudgetPeriod_reservedUsd_check" CHECK ("reservedUsd" >= 0),
  CONSTRAINT "AiBudgetPeriod_hard_limit_check" CHECK ("spentUsd" + "reservedUsd" <= "limitUsd")
);

-- CreateTable
CREATE TABLE "AiInvocation" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "feature" "AiFeature" NOT NULL,
  "status" "AiInvocationStatus" NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersionId" UUID NOT NULL,
  "promptKey" TEXT NOT NULL,
  "promptVersion" INTEGER NOT NULL,
  "inputHash" TEXT NOT NULL,
  "cacheKey" TEXT,
  "cacheSourceInvocationId" UUID,
  "budgetPeriodId" UUID NOT NULL,
  "inputTokens" INTEGER,
  "cachedInputTokens" INTEGER,
  "outputTokens" INTEGER,
  "estimatedCostUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
  "actualCostUsd" DECIMAL(10,6),
  "latencyMs" INTEGER,
  "relatedAttemptId" UUID,
  "relatedTaskVersionId" UUID,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "AiInvocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiInvocation_promptVersion_check" CHECK ("promptVersion" > 0),
  CONSTRAINT "AiInvocation_estimatedCostUsd_check" CHECK ("estimatedCostUsd" >= 0),
  CONSTRAINT "AiInvocation_actualCostUsd_check" CHECK ("actualCostUsd" IS NULL OR "actualCostUsd" >= 0),
  CONSTRAINT "AiInvocation_inputTokens_check" CHECK ("inputTokens" IS NULL OR "inputTokens" >= 0),
  CONSTRAINT "AiInvocation_cachedInputTokens_check" CHECK ("cachedInputTokens" IS NULL OR "cachedInputTokens" >= 0),
  CONSTRAINT "AiInvocation_outputTokens_check" CHECK ("outputTokens" IS NULL OR "outputTokens" >= 0),
  CONSTRAINT "AiInvocation_latencyMs_check" CHECK ("latencyMs" IS NULL OR "latencyMs" >= 0),
  CONSTRAINT "AiInvocation_cache_source_check" CHECK (
    ("status" = 'CACHED' AND "cacheSourceInvocationId" IS NOT NULL)
    OR ("status" <> 'CACHED' AND "cacheSourceInvocationId" IS NULL)
  ),
  CONSTRAINT "AiInvocation_cache_not_self_check" CHECK (
    "cacheSourceInvocationId" IS NULL OR "cacheSourceInvocationId" <> "id"
  ),
  CONSTRAINT "AiInvocation_cached_cost_check" CHECK (
    "status" <> 'CACHED'
    OR ("estimatedCostUsd" = 0 AND "actualCostUsd" = 0)
  ),
  CONSTRAINT "AiInvocation_completion_check" CHECK (
    ("status" IN ('RESERVED', 'RUNNING') AND "completedAt" IS NULL)
    OR ("status" IN ('SUCCEEDED', 'FAILED', 'REJECTED_BUDGET', 'CACHED') AND "completedAt" IS NOT NULL)
  ),
  CONSTRAINT "AiInvocation_success_cost_check" CHECK (
    "status" <> 'SUCCEEDED' OR "actualCostUsd" IS NOT NULL
  )
);

-- CreateTable
CREATE TABLE "AiEvaluationDraft" (
  "id" UUID NOT NULL,
  "invocationId" UUID NOT NULL,
  "attemptId" UUID NOT NULL,
  "status" "AiEvaluationDraftStatus" NOT NULL DEFAULT 'PENDING',
  "normalizedJson" JSONB NOT NULL,
  "preview" JSONB,
  "appliedEvaluationId" UUID,
  "rollbackEvaluationId" UUID,
  "appliedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rolledBackAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiEvaluationDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiEvaluationDraft_lifecycle_check" CHECK (
    (
      "status" = 'PENDING'
      AND "appliedEvaluationId" IS NULL
      AND "rollbackEvaluationId" IS NULL
      AND "appliedAt" IS NULL
      AND "rejectedAt" IS NULL
      AND "rolledBackAt" IS NULL
    )
    OR (
      "status" = 'APPLIED'
      AND "appliedEvaluationId" IS NOT NULL
      AND "rollbackEvaluationId" IS NULL
      AND "appliedAt" IS NOT NULL
      AND "rejectedAt" IS NULL
      AND "rolledBackAt" IS NULL
    )
    OR (
      "status" = 'REJECTED'
      AND "appliedEvaluationId" IS NULL
      AND "rollbackEvaluationId" IS NULL
      AND "appliedAt" IS NULL
      AND "rejectedAt" IS NOT NULL
      AND "rolledBackAt" IS NULL
    )
    OR (
      "status" = 'ROLLED_BACK'
      AND "appliedEvaluationId" IS NOT NULL
      AND "rollbackEvaluationId" IS NOT NULL
      AND "appliedAt" IS NOT NULL
      AND "rejectedAt" IS NULL
      AND "rolledBackAt" IS NOT NULL
    )
  )
);

-- CreateIndex
CREATE UNIQUE INDEX "AiPromptVersion_key_version_key"
ON "AiPromptVersion"("key", "version");

-- CreateIndex
CREATE INDEX "AiPromptVersion_feature_active_idx"
ON "AiPromptVersion"("feature", "active");

-- CreateIndex
CREATE INDEX "AiPromptVersion_checksum_idx"
ON "AiPromptVersion"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "AiBudgetPeriod_userId_period_key"
ON "AiBudgetPeriod"("userId", "period");

-- CreateIndex
CREATE INDEX "AiBudgetPeriod_period_idx"
ON "AiBudgetPeriod"("period");

-- Only one provider-producing invocation may own a stable cache key at a time.
-- FAILED/REJECTED rows retain audit metadata, and CACHED audit rows may repeat.
CREATE UNIQUE INDEX "AiInvocation_cacheKey_provider_result_key"
ON "AiInvocation"("cacheKey")
WHERE "cacheKey" IS NOT NULL
  AND "status" IN ('RESERVED', 'RUNNING', 'SUCCEEDED');

-- CreateIndex
CREATE INDEX "AiInvocation_userId_createdAt_idx"
ON "AiInvocation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInvocation_feature_status_idx"
ON "AiInvocation"("feature", "status");

-- CreateIndex
CREATE INDEX "AiInvocation_cacheKey_idx"
ON "AiInvocation"("cacheKey");

-- CreateIndex
CREATE INDEX "AiInvocation_cacheSourceInvocationId_idx"
ON "AiInvocation"("cacheSourceInvocationId");

-- CreateIndex
CREATE INDEX "AiInvocation_budgetPeriodId_idx"
ON "AiInvocation"("budgetPeriodId");

-- CreateIndex
CREATE INDEX "AiInvocation_promptVersionId_idx"
ON "AiInvocation"("promptVersionId");

-- CreateIndex
CREATE INDEX "AiInvocation_relatedAttemptId_idx"
ON "AiInvocation"("relatedAttemptId");

-- CreateIndex
CREATE INDEX "AiInvocation_relatedTaskVersionId_idx"
ON "AiInvocation"("relatedTaskVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationDraft_invocationId_key"
ON "AiEvaluationDraft"("invocationId");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationDraft_appliedEvaluationId_key"
ON "AiEvaluationDraft"("appliedEvaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationDraft_rollbackEvaluationId_key"
ON "AiEvaluationDraft"("rollbackEvaluationId");

-- CreateIndex
CREATE INDEX "AiEvaluationDraft_attemptId_createdAt_idx"
ON "AiEvaluationDraft"("attemptId", "createdAt");

-- CreateIndex
CREATE INDEX "AiEvaluationDraft_status_createdAt_idx"
ON "AiEvaluationDraft"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AiBudgetPeriod"
ADD CONSTRAINT "AiBudgetPeriod_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInvocation"
ADD CONSTRAINT "AiInvocation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInvocation"
ADD CONSTRAINT "AiInvocation_promptVersionId_fkey"
FOREIGN KEY ("promptVersionId") REFERENCES "AiPromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInvocation"
ADD CONSTRAINT "AiInvocation_budgetPeriodId_fkey"
FOREIGN KEY ("budgetPeriodId") REFERENCES "AiBudgetPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInvocation"
ADD CONSTRAINT "AiInvocation_relatedAttemptId_fkey"
FOREIGN KEY ("relatedAttemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInvocation"
ADD CONSTRAINT "AiInvocation_relatedTaskVersionId_fkey"
FOREIGN KEY ("relatedTaskVersionId") REFERENCES "TaskVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInvocation"
ADD CONSTRAINT "AiInvocation_cacheSourceInvocationId_fkey"
FOREIGN KEY ("cacheSourceInvocationId") REFERENCES "AiInvocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationDraft"
ADD CONSTRAINT "AiEvaluationDraft_invocationId_fkey"
FOREIGN KEY ("invocationId") REFERENCES "AiInvocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationDraft"
ADD CONSTRAINT "AiEvaluationDraft_attemptId_fkey"
FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationDraft"
ADD CONSTRAINT "AiEvaluationDraft_appliedEvaluationId_fkey"
FOREIGN KEY ("appliedEvaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationDraft"
ADD CONSTRAINT "AiEvaluationDraft_rollbackEvaluationId_fkey"
FOREIGN KEY ("rollbackEvaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prompt text and identity are append-only. Registry activation may change, but
-- a published version cannot be rewritten or removed from the audit chain.
CREATE OR REPLACE FUNCTION "prevent_ai_prompt_version_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AiPromptVersion is immutable; create a new integer version'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."key" IS DISTINCT FROM NEW."key"
     OR OLD."version" IS DISTINCT FROM NEW."version"
     OR OLD."feature" IS DISTINCT FROM NEW."feature"
     OR OLD."systemPrompt" IS DISTINCT FROM NEW."systemPrompt"
     OR OLD."schemaVersion" IS DISTINCT FROM NEW."schemaVersion"
     OR OLD."checksum" IS DISTINCT FROM NEW."checksum"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'AiPromptVersion is immutable; create a new integer version'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AiPromptVersion_prevent_mutation"
BEFORE UPDATE OR DELETE ON "AiPromptVersion"
FOR EACH ROW
EXECUTE FUNCTION "prevent_ai_prompt_version_mutation"();
