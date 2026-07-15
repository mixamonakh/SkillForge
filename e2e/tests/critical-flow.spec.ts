import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import {
  createLowScoreAnalysis,
  type ExportAttempt,
  type ExportBundle,
} from './fixtures/analysis-fixture';

type PersistedAnswer =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'choice'; label: string };

type ExportResponse = {
  bundleId: string;
  fileName: string;
  json: string;
  markdown: string;
  checksum: string;
};

type ImportPreview = {
  importId: string;
  projectedTopics: Array<{
    topicKey: string;
    currentStatus: string;
    projectedStatus: string;
  }>;
};

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const marker = `skillforge-e2e-${Date.now()}`;

function recordValue(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function capabilityEvidenceCount(value: unknown, family: string): number {
  const capabilities = recordValue(recordValue(value)?.capabilities);
  const state = recordValue(capabilities?.[family]);
  return typeof state?.evidenceCount === 'number' ? state.evidenceCount : 0;
}

function executeComposeSql(sql: string): void {
  const database = process.env.POSTGRES_DB ?? 'skillforge';
  const user = process.env.POSTGRES_USER ?? 'skillforge';
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'psql',
      '--username',
      user,
      '--dbname',
      database,
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      sql,
    ],
    { cwd: repositoryRoot, stdio: 'inherit', timeout: 30_000 },
  );
}

function activateDraftAcquisitionFixture(): void {
  if (process.env.E2E_EXPECT_CLEAN !== '1') {
    throw new Error('Draft acquisition activation is allowed only in a clean disposable stack');
  }
  executeComposeSql(`
BEGIN;
DO $fixture$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ContentPack"
    WHERE "key" = 'js-core-training-v1'
      AND "version" = '1.0.0'
      AND "status" = 'DRAFT'
      AND "manifest" ->> 'status' = 'draft'
  ) THEN
    RAISE EXCEPTION 'Expected an imported canonical DRAFT training pack';
  END IF;
END
$fixture$;

UPDATE "ContentPack"
SET "status" = 'ACTIVE'
WHERE "key" = 'js-core-training-v1' AND "version" = '1.0.0';

UPDATE "Task" AS task
SET "status" = 'ACTIVE'
WHERE task."stableKey" IN (
    'cs.mutability.training.cart-shallow-trace-001',
    'cs.mutability.training.board-mutation-debug-001',
    'cs.mutability.training.update-locale-guided-001',
    'cs.mutability.training.increment-line-independent-001'
  )
  AND EXISTS (
  SELECT 1 FROM "TaskVersion" AS version
  WHERE version."taskId" = task."id"
    AND version."sourcePack" = 'js-core-training-v1'
    AND version."sourceVersion" = '1.0.0'
);

UPDATE "ContentItem"
SET "status" = 'ACTIVE'
WHERE "stableKey" IN (
    'cs.mutability.training.canonical-boundaries',
    'cs.mutability.training.worked-contact-update',
    'cs.mutability.training.primitive-object-contrast',
    'cs.mutability.training.shallow-copy-mistake'
  )
  AND "sourcePack" = 'js-core-training-v1'
  AND "sourceVersion" = '1.0.0';

DO $fixture$
BEGIN
  IF (
    SELECT count(*)
    FROM "Task" AS task
    WHERE task."status" = 'ACTIVE'
      AND EXISTS (
        SELECT 1
        FROM "TaskVersion" AS version
        WHERE version."taskId" = task."id"
          AND version."sourcePack" = 'js-core-training-v1'
          AND version."sourceVersion" = '1.0.0'
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'Expected exactly four ACTIVE acquisition tasks';
  END IF;

  IF (
    SELECT count(*)
    FROM "ContentItem"
    WHERE "status" = 'ACTIVE'
      AND "sourcePack" = 'js-core-training-v1'
      AND "sourceVersion" = '1.0.0'
  ) <> 4 THEN
    RAISE EXCEPTION 'Expected exactly four ACTIVE acquisition content items';
  END IF;
END
$fixture$;

INSERT INTO "TopicState" (
  "id", "userId", "topicId", "status", "masteryEstimate", "masteryConfidence",
  "evidenceWeight", "evidenceCount", "independentDays", "taskKindCount",
  "needsReview", "algorithmVersion", "explanation", "updatedAt"
)
SELECT
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', topic."id", 'SOLID',
  75, 60, 2, 2, 2, 2, false, 'e2e-prerequisite-fixture-v1',
  '{"fixture":"disposable acquisition prerequisite"}'::jsonb, CURRENT_TIMESTAMP
FROM "Topic" AS topic
WHERE topic."key" = 'cs.values-and-references'
ON CONFLICT ("userId", "topicId") DO UPDATE SET
  "status" = EXCLUDED."status",
  "masteryEstimate" = EXCLUDED."masteryEstimate",
  "masteryConfidence" = EXCLUDED."masteryConfidence",
  "evidenceWeight" = EXCLUDED."evidenceWeight",
  "evidenceCount" = EXCLUDED."evidenceCount",
  "independentDays" = EXCLUDED."independentDays",
  "taskKindCount" = EXCLUDED."taskKindCount",
  "needsReview" = EXCLUDED."needsReview",
  "algorithmVersion" = EXCLUDED."algorithmVersion",
  "explanation" = EXCLUDED."explanation",
  "updatedAt" = CURRENT_TIMESTAMP;
COMMIT;
`);
}

function exhaustAiBudgetFixture(): void {
  if (process.env.E2E_EXPECT_CLEAN !== '1' || process.env.E2E_FAKE_AI !== '1') {
    throw new Error('AI budget fixture is allowed only for fake AI in a clean disposable stack');
  }
  executeComposeSql(`
BEGIN;
UPDATE "AiBudgetPeriod"
SET "limitUsd" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" = '00000000-0000-4000-8000-000000000001'
  AND "period" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM')
  AND "spentUsd" = 0
  AND "reservedUsd" = 0;

DO $fixture$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "AiBudgetPeriod"
    WHERE "userId" = '00000000-0000-4000-8000-000000000001'
      AND "period" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM')
      AND "limitUsd" = 0
      AND "spentUsd" = 0
      AND "reservedUsd" = 0
  ) THEN
    RAISE EXCEPTION 'Expected an idle current AI budget period before exhaustion fixture';
  END IF;
END
$fixture$;
COMMIT;
`);
}

function restoreAiBudgetFixture(): void {
  if (process.env.E2E_EXPECT_CLEAN !== '1' || process.env.E2E_FAKE_AI !== '1') {
    throw new Error('AI budget fixture is allowed only for fake AI in a clean disposable stack');
  }
  executeComposeSql(`
UPDATE "AiBudgetPeriod"
SET "limitUsd" = 10, "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" = '00000000-0000-4000-8000-000000000001'
  AND "period" = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM')
  AND "limitUsd" = 0
  AND "spentUsd" = 0
  AND "reservedUsd" = 0;
`);
}

let assessmentUrl = '';
let prebaselineUrl = '';
let persistedAnswer: PersistedAnswer | undefined;
let exportBundle: ExportBundle | undefined;
let evaluatedAttempt: ExportAttempt | undefined;

async function visible(locator: Locator): Promise<boolean> {
  return (await locator.count()) > 0 && locator.first().isVisible();
}

async function answerCurrentItem(page: Page, value: string): Promise<PersistedAnswer> {
  await expect(
    page
      .locator(
        'textarea.sf-answer-textarea, [role="textbox"][aria-label="Редактор кода"], .sf-choice',
      )
      .first(),
  ).toBeVisible();

  const textarea = page.locator('textarea.sf-answer-textarea');
  if (await visible(textarea)) {
    await textarea.fill(value);
    return { kind: 'text', value };
  }

  const codeEditor = page.getByRole('textbox', { name: 'Редактор кода' });
  if (await visible(codeEditor)) {
    const current = (await codeEditor.textContent()) ?? '';
    const next = `${current}\n// ${value}`;
    await codeEditor.fill(next);
    return { kind: 'code', value: next };
  }

  const choice = page.locator('.sf-choice').first();
  await expect(choice).toBeVisible();
  const label = (await choice.locator('span').textContent())?.trim() ?? '';
  await choice.locator('input').check();
  return { kind: 'choice', label };
}

async function expectPersistedAnswer(page: Page, answer: PersistedAnswer): Promise<void> {
  if (answer.kind === 'text') {
    await expect(page.locator('textarea.sf-answer-textarea')).toHaveValue(answer.value);
    return;
  }
  if (answer.kind === 'code') {
    await expect(page.getByRole('textbox', { name: 'Редактор кода' })).toContainText(answer.value);
    return;
  }
  await expect(
    page.locator('.sf-choice').filter({ hasText: answer.label }).locator('input'),
  ).toBeChecked();
}

async function resumePausedRunIfNeeded(page: Page): Promise<void> {
  const resumeButton = page.getByRole('button', { name: 'Продолжить', exact: true });
  const answerControl = page
    .locator(
      'textarea.sf-answer-textarea, [role="textbox"][aria-label="Редактор кода"], .sf-choice',
    )
    .first();
  await expect(answerControl.or(resumeButton)).toBeVisible();
  if (await visible(resumeButton)) await resumeButton.click();
}

async function expectUnknownAnswerPersisted(page: Page): Promise<void> {
  const textarea = page.locator('textarea.sf-answer-textarea');
  if (await visible(textarea)) {
    await expect(textarea).toHaveValue('Не знаю');
    return;
  }
  const unknownChoice = page.locator('.sf-choice').filter({ hasText: 'Не знаю' }).locator('input');
  await expect(unknownChoice).toBeChecked();
}

async function waitForApplication(request: APIRequestContext): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          const response = await request.get('/api/v1/health/ready', { timeout: 3_000 });
          return response.status();
        } catch {
          return 0;
        }
      },
      { timeout: 180_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe(200);

  await expect
    .poll(
      async () => {
        try {
          const response = await request.get('/', { timeout: 3_000 });
          return response.status();
        } catch {
          return 0;
        }
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe(200);
}

test.describe.serial('SkillForge critical local-first flow', () => {
  test('clean start is honest and has no streak pressure', async ({ page, request }) => {
    await waitForApplication(request);
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'SkillForge готов к калибровке' }),
    ).toBeVisible();
    await expect(page.getByText(/streak|дней подряд|потерял.*серию/i)).toHaveCount(0);
    await expect(page.getByText(/вероятность.*оффер|readiness.*%/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Начать короткую калибровку' })).toBeVisible();
  });

  test('assessment autosaves, survives refresh, pauses and resumes', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/assessment');
    const legacyBaseline = page
      .locator('.sf-assessment-card')
      .filter({ hasText: 'Расширенная диагностика JavaScript Core' });
    await legacyBaseline.getByRole('button', { name: 'Начать', exact: true }).click();
    await expect(page).toHaveURL(/\/assessment\/[0-9a-f-]+$/i);
    assessmentUrl = page.url();

    persistedAnswer = await answerCurrentItem(page, marker);
    await expect(page.getByRole('status')).toContainText('Сохранено', { timeout: 15_000 });

    await page.reload();
    await expectPersistedAnswer(page, persistedAnswer);

    await page.getByRole('button', { name: 'Пауза' }).click();
    await expect(page).toHaveURL(/\/assessment$/);
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await expect(page).toHaveURL(assessmentUrl);
    await resumePausedRunIfNeeded(page);
    await expectPersistedAnswer(page, persistedAnswer);
  });

  test('saved assessment data survives a Compose restart', async ({ page, request }) => {
    test.skip(
      process.env.E2E_COMPOSE_RESTART !== '1',
      'Set E2E_COMPOSE_RESTART=1 for container persistence verification.',
    );
    test.setTimeout(240_000);
    expect(assessmentUrl).not.toBe('');
    expect(persistedAnswer).toBeDefined();

    execFileSync('docker', ['compose', 'restart', 'db', 'api', 'web'], {
      cwd: repositoryRoot,
      stdio: 'inherit',
      timeout: 120_000,
    });
    await waitForApplication(request);

    await page.goto(assessmentUrl);
    await expectPersistedAnswer(page, persistedAnswer as PersistedAnswer);
  });

  test('browser runner is real and the baseline can be completed', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto(assessmentUrl);
    let runnerObserved = false;

    for (let item = 0; item < 50; item += 1) {
      if (await visible(page.getByRole('heading', { name: 'Локальная проверка завершена' }))) break;

      const continueBlockButton = page.getByRole('button', {
        name: 'Продолжить следующий блок',
      });
      if (await visible(continueBlockButton)) {
        await continueBlockButton.click();
        await expect(page.locator('.sf-task-card')).toBeVisible();
        continue;
      }

      const runButton = page.getByRole('button', { name: 'Запустить тесты' });
      if (!runnerObserved && (await visible(runButton))) {
        await runButton.click();
        await expect(page.locator('.sf-runner-output')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('.sf-runner-output')).toContainText(
          /Тесты пройдены|Нужна правка|Время истекло/,
        );
        runnerObserved = true;
      }

      await page.getByRole('button', { name: 'Не знаю' }).click();
      await expect(page.getByRole('status')).toContainText('Сохранено', { timeout: 15_000 });

      const taskIdentifier = page.locator('.sf-task-card .sf-card-title-row > .sf-muted');
      const currentTask = await taskIdentifier.textContent();
      const nextButton = page.getByRole('button', {
        name: /Сохранить и далее|Завершить диагностику/,
      });
      await nextButton.click();

      await expect
        .poll(
          async () => {
            if (
              await visible(page.getByRole('heading', { name: 'Локальная проверка завершена' }))
            ) {
              return 'completed';
            }
            if (await visible(continueBlockButton)) return 'block-completed';
            return (await taskIdentifier.textContent()) ?? '';
          },
          { timeout: 20_000 },
        )
        .not.toBe(currentTask ?? '');
    }

    await expect(page.getByRole('heading', { name: 'Локальная проверка завершена' })).toBeVisible();
    expect(runnerObserved).toBe(true);
    await expect(page.getByText('36', { exact: true }).first()).toBeVisible();
  });

  test('fake AI preview applies, rolls back, caches and fails closed at the hard budget', async ({
    page,
    request,
  }) => {
    test.skip(
      process.env.E2E_FAKE_AI !== '1',
      'Set E2E_FAKE_AI=1 only with the explicitly enabled fake provider.',
    );
    test.setTimeout(180_000);
    await page.goto(assessmentUrl);
    await expect(page.getByRole('heading', { name: 'Локальная проверка завершена' })).toBeVisible();

    const reviews = page.locator('[data-ai-review-attempt]');
    await expect(reviews.first()).toBeVisible();
    expect(await reviews.count()).toBeGreaterThanOrEqual(2);
    const first = reviews.first();
    const firstAttemptId = await first.getAttribute('data-ai-review-attempt');
    expect(firstAttemptId).toMatch(/^[0-9a-f-]{36}$/i);
    await first.locator('[data-ai-action="evaluate"]').click();
    await expect(first.getByTestId('ai-evaluation-preview')).toBeVisible();
    await expect(first.locator('[data-ai-draft-status="PENDING"]')).toBeVisible();
    await expect(first.getByText('Projected state diff')).toBeVisible();

    await first.locator('[data-ai-action="apply"]').click();
    await expect(first.locator('[data-ai-draft-status="APPLIED"]')).toBeVisible();
    await expect(first.locator('[data-ai-action="rollback"]')).toBeVisible();
    await first.locator('[data-ai-action="rollback"]').click();
    await expect(first.locator('[data-ai-draft-status="ROLLED_BACK"]')).toBeVisible();

    const cachedResponse = await request.post(
      `/api/v1/ai/attempts/${String(firstAttemptId)}/evaluate`,
    );
    expect(cachedResponse.ok()).toBe(true);
    const cached = (await cachedResponse.json()) as {
      draft: { id: string; status: string };
      invocation: { cacheHit: boolean };
    };
    expect(cached.invocation.cacheHit).toBe(true);
    expect(cached.draft.status).toBe('PENDING');
    const cachedReject = await request.post(`/api/v1/ai/evaluations/${cached.draft.id}/reject`);
    expect(cachedReject.ok()).toBe(true);

    exhaustAiBudgetFixture();
    try {
      const second = reviews.nth(1);
      const secondAttemptId = await second.getAttribute('data-ai-review-attempt');
      expect(secondAttemptId).toMatch(/^[0-9a-f-]{36}$/i);
      const budgetResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().endsWith(`/api/v1/ai/attempts/${String(secondAttemptId)}/evaluate`),
      );
      await second.locator('[data-ai-action="evaluate"]').click();
      const budgetResponse = await budgetResponsePromise;
      expect(budgetResponse.status()).toBe(429);
      await expect(second.getByRole('alert')).toContainText(/месячный AI-лимит/i);
      await expect(second.getByRole('link', { name: 'Manual export' })).toHaveAttribute(
        'href',
        new RegExp(`^/import-export\\?mode=export&assessmentRunId=[0-9a-f-]{36}$`, 'i'),
      );

      const usageResponse = await request.get('/api/v1/ai/usage/current');
      expect(usageResponse.ok()).toBe(true);
      const usage = (await usageResponse.json()) as {
        limitUsd: number;
        remainingUsd: number;
        requestCount: number;
        cacheHits: number;
        failures: number;
      };
      expect(usage).toMatchObject({ limitUsd: 0, remainingUsd: 0 });
      expect(usage.requestCount).toBeGreaterThanOrEqual(3);
      expect(usage.cacheHits).toBeGreaterThanOrEqual(1);
      expect(usage.failures).toBeGreaterThanOrEqual(1);

      await page.goto('/settings');
      await expect(page.getByTestId('ai-usage-panel')).toContainText('API-assisted');
      await expect(page.getByTestId('ai-usage-panel')).toContainText('fake-deterministic-v1');
    } finally {
      restoreAiBudgetFixture();
    }
  });

  test('strict JSON/Markdown export and transactional analysis import update Roadmap through evidence', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    if (assessmentUrl) {
      await page.goto(assessmentUrl);
    } else {
      await page.goto('/assessment');
      await page.getByRole('button', { name: 'Посмотреть результат' }).click();
      await expect(page).toHaveURL(/\/assessment\/[0-9a-f-]+$/i);
      assessmentUrl = page.url();
    }
    await expect(page.getByRole('heading', { name: 'Локальная проверка завершена' })).toBeVisible();
    await page.getByRole('link', { name: 'Экспортировать для ChatGPT' }).click();

    const exportResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/v1/exports'),
    );
    await page.getByRole('button', { name: 'Сформировать' }).click();
    const exportResponse = await exportResponsePromise;
    expect(exportResponse.ok()).toBe(true);
    const result = (await exportResponse.json()) as ExportResponse;
    exportBundle = JSON.parse(result.json) as ExportBundle;

    expect(exportBundle.schemaVersion).toBe('1.0');
    expect(exportBundle.bundleType).toBe('assessment-run');
    expect(exportBundle.attempts).toHaveLength(36);
    expect(result.markdown).toContain('skillforge-analysis-v1');
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);

    const jsonDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    expect((await jsonDownloadPromise).suggestedFilename()).toMatch(/\.json$/);
    const markdownDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Markdown', exact: true }).click();
    expect((await markdownDownloadPromise).suggestedFilename()).toMatch(/\.md$/);

    evaluatedAttempt =
      exportBundle.attempts.find((attempt) => attempt.taskKind === 'COMPARE_SOLUTIONS') ??
      exportBundle.attempts.find((attempt) => attempt.taskKind === 'EXPLAIN');
    expect(evaluatedAttempt).toBeDefined();

    const topicAttempts = exportBundle.attempts.filter(
      (attempt) => attempt.topicKey === (evaluatedAttempt as ExportAttempt).topicKey,
    );
    expect(topicAttempts.length).toBeGreaterThanOrEqual(2);
    const analysis = createLowScoreAnalysis(exportBundle, topicAttempts);
    await page.getByRole('tab', { name: 'Импорт' }).click();
    await page.locator('textarea.sf-import-textarea').fill(JSON.stringify(analysis));
    await page.getByRole('button', { name: 'Проверить схему' }).click();
    await expect(page.getByText('Schema 1.0 валидна')).toBeVisible();

    const previewResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/api\/v1\/imports\/[0-9a-f-]+\/preview$/i.test(response.url()),
    );
    await page.getByRole('button', { name: 'Рассчитать preview' }).click();
    const previewResponse = await previewResponsePromise;
    expect(previewResponse.ok()).toBe(true);
    const preview = (await previewResponse.json()) as ImportPreview;
    const projected = preview.projectedTopics.find(
      (topic) => topic.topicKey === (evaluatedAttempt as ExportAttempt).topicKey,
    );
    expect(projected).toBeDefined();
    expect(projected?.projectedStatus).not.toBe(projected?.currentStatus);
    await expect(page.getByText('Анализ ещё не применён')).toBeVisible();

    const applyResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/api\/v1\/imports\/[0-9a-f-]+\/apply$/i.test(response.url()),
    );
    await page.getByRole('button', { name: 'Применить транзакционно' }).click();
    expect((await applyResponsePromise).ok()).toBe(true);
    await expect(page.getByText('Анализ применён транзакционно')).toBeVisible();

    await page.goto('/roadmap');
    await page
      .getByRole('searchbox', { name: 'Поиск по темам' })
      .fill((evaluatedAttempt as ExportAttempt).topicKey);
    const topicCard = page.locator('.sf-topic-card').first();
    await expect(topicCard).toBeVisible();
    await expect(topicCard.locator('.sf-status')).not.toHaveText('Нет данных');
    await expect(topicCard.getByText(/Evidence/)).toBeVisible();
  });

  test('adaptive pre-baseline autosaves, resumes and stops after two unknown answers without evidence', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const capabilityBeforeResponse = await request.get('/api/v1/users/me/capability-summary');
    expect(capabilityBeforeResponse.ok()).toBe(true);
    const capabilityBefore: unknown = await capabilityBeforeResponse.json();

    await page.goto('/assessment');
    const quickCalibration = page
      .locator('.sf-assessment-card')
      .filter({ hasText: 'Быстрая калибровка' });
    await expect(quickCalibration).toBeVisible();
    await expect(quickCalibration).toContainText('Draft · нужен human review');
    await quickCalibration.getByRole('button', { name: 'Начать', exact: true }).click();
    await expect(page).toHaveURL(/\/assessment\/[0-9a-f-]+$/i);
    prebaselineUrl = page.url();
    await expect(page.getByText(/Быстрая калибровка/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Ответить: Не знаю' }).click();
    await expect(page.getByRole('status')).toContainText('Сохранено', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Пауза' }).click();
    await expect(page).toHaveURL(/\/assessment$/);

    const pausedCalibration = page
      .locator('.sf-assessment-card')
      .filter({ hasText: 'Быстрая калибровка' });
    await pausedCalibration.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await expect(page).toHaveURL(prebaselineUrl);
    await expectUnknownAnswerPersisted(page);
    await page.getByRole('button', { name: 'Сохранить и выбрать следующий шаг' }).click();

    await expect(page.getByRole('button', { name: 'Ответить: Не знаю' })).toBeVisible();
    await page.getByRole('button', { name: 'Ответить: Не знаю' }).click();
    await page.getByRole('button', { name: 'Сохранить и выбрать следующий шаг' }).click();

    await expect(
      page.getByRole('heading', { name: 'Следующий полезный шаг определён' }),
    ).toBeVisible();
    await expect(page.getByText('Данных достаточно для маршрута')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Маршрут по наблюдаемым темам' })).toBeVisible();
    await expect(page.getByText(/mastery|итоговый балл|сдано/i)).toHaveCount(0);

    const capabilityAfterResponse = await request.get('/api/v1/users/me/capability-summary');
    expect(capabilityAfterResponse.ok()).toBe(true);
    const capabilityAfter: unknown = await capabilityAfterResponse.json();
    expect(capabilityAfter).toEqual(capabilityBefore);
  });

  test('isolated draft activation exercises recommendation and the complete acquisition sequence', async ({
    page,
    request,
  }) => {
    test.skip(
      process.env.E2E_EXPECT_CLEAN !== '1',
      'Draft content may be activated only in the disposable clean-stack E2E run.',
    );
    test.setTimeout(300_000);
    activateDraftAcquisitionFixture();

    const beforeResponse = await request.get('/api/v1/topics/cs.mutability/capability-profile');
    expect(beforeResponse.ok()).toBe(true);
    const beforeProfile: unknown = await beforeResponse.json();
    const traceEvidenceBefore = capabilityEvidenceCount(beforeProfile, 'TRACE');
    const codeEvidenceBefore = capabilityEvidenceCount(beforeProfile, 'CODE_PRODUCTION');

    await page.goto('/sessions');
    const recommendation = page.locator('.sf-recommendation-strip');
    await expect(recommendation).toContainText('Мутабельность и копирование');
    await expect(recommendation).toContainText('Обязательных steps: 8');
    await expect(recommendation).toContainText('успешных ответов без подсказки: 1');
    await recommendation.getByRole('button', { name: 'Выбрать' }).click();
    await page.getByRole('button', { name: /Собрать и начать сессию/ }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/i);

    await expect(
      page.getByRole('heading', { name: 'Границы ссылок и неизменяемого обновления' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Изучено, дальше/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Worked example: обновление одной вложенной ветви' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Пауза' }).click();
    await expect(page.getByRole('heading', { name: /Контекст и ответы сохранены/ })).toBeVisible();
    await page.getByRole('button', { name: 'Продолжить сессию' }).click();
    await expect(
      page.getByRole('heading', { name: 'Worked example: обновление одной вложенной ветви' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Изучено, дальше/ }).click();

    await expect(page.getByText('PREDICT_BEFORE_REVEAL', { exact: true })).toBeVisible();
    await page.locator('textarea.sf-answer-textarea').fill('2\ntrue');
    await page.getByRole('button', { name: /Сохранить и далее/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Contrast pair: новое значение и общая идентичность' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Изучено, дальше/ }).click();

    await expect(page.getByText('MUTATION_DEBUG', { exact: true })).toBeVisible();
    await page
      .locator('textarea.sf-answer-textarea')
      .fill(
        'Внешний spread оставляет общими массив tasks и объект задачи. Нужно скопировать массив и найденный объект; если taskId не найден, вернуть исходный board.',
      );
    await page.getByRole('button', { name: /Сохранить и далее/ }).click();

    await expect(page.getByText('GUIDED_COMPLETION', { exact: true })).toBeVisible();
    if (process.env.E2E_FAKE_AI === '1') {
      await page.locator('[data-ai-action="nudge"]').click();
      await expect(page.getByTestId('ai-nudge')).toBeVisible();
      await expect(page.getByTestId('ai-nudge')).not.toContainText(/export function|return state/);
      await page.reload();
      await expect(page.getByTestId('ai-nudge')).toBeVisible();
      await expect(page.locator('[data-ai-action="nudge"]')).toHaveCount(0);
    }
    await page
      .getByRole('textbox', { name: 'Редактор кода' })
      .fill(
        'export function updateLocale(settings, locale) {\n  return { ...settings, preferences: { ...settings.preferences, locale } };\n}',
      );
    await page.getByRole('button', { name: 'Запустить тесты' }).click();
    await expect(page.locator('.sf-runner-output')).toContainText('Тесты пройдены');
    await page.getByRole('button', { name: /Сохранить и далее/ }).click();

    await expect(page.getByText('INDEPENDENT_NO_HELP_PRODUCTION', { exact: true })).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Редактор кода' })
      .fill(
        'export function incrementLineQuantity(state, lineId) {\n  const index = state.lines.findIndex((line) => line.id === lineId);\n  if (index < 0) return state;\n  return { ...state, lines: state.lines.map((line, position) => position === index ? { ...line, quantity: line.quantity + 1 } : line) };\n}',
      );
    await page.getByRole('button', { name: 'Запустить тесты' }).click();
    await expect(page.locator('.sf-runner-output')).toContainText('Тесты пройдены');
    await page.getByRole('button', { name: /Сохранить и далее/ }).click();

    await expect(
      page.getByRole('heading', {
        name: 'Common mistake: новый внешний объект после внутренней мутации',
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Изучено, дальше/ }).click();
    await expect(page.getByRole('heading', { name: 'Как прошла нагрузка?' })).toBeVisible();
    await page
      .getByLabel('Короткое наблюдение (необязательно)')
      .fill('Изолированный E2E: sequence пройден без раскрытия решения подсказкой.');
    await page.getByRole('button', { name: 'Завершить сессию' }).click();
    await expect(page.getByRole('heading', { name: 'Evidence сохранены' })).toBeVisible();

    const afterResponse = await request.get('/api/v1/topics/cs.mutability/capability-profile');
    expect(afterResponse.ok()).toBe(true);
    const afterProfile: unknown = await afterResponse.json();
    expect(capabilityEvidenceCount(afterProfile, 'TRACE')).toBeGreaterThan(traceEvidenceBefore);
    expect(capabilityEvidenceCount(afterProfile, 'CODE_PRODUCTION')).toBeGreaterThan(
      codeEvidenceBefore,
    );
  });
});
