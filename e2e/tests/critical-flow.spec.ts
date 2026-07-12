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

let assessmentUrl = '';
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
    await expect(page.getByRole('link', { name: 'Начать диагностику JavaScript' })).toBeVisible();
  });

  test('assessment autosaves, survives refresh, pauses and resumes', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/assessment');
    await page.getByRole('button', { name: 'Начать', exact: true }).click();
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
});
