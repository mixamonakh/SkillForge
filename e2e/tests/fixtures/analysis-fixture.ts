export type ExportAttempt = {
  attemptId: string;
  taskKey: string;
  taskKind: string;
  topicKey: string;
};

export type ExportBundle = {
  schemaVersion: string;
  bundleId: string;
  bundleType: string;
  attempts: ExportAttempt[];
};

export function createLowScoreAnalysis(bundle: ExportBundle, attempts: ExportAttempt[]) {
  const primaryAttempt = attempts[0];
  if (!primaryAttempt) throw new Error('At least one exported attempt is required.');

  return {
    schemaVersion: '1.0',
    contract: 'skillforge-analysis-v1',
    sourceBundleId: bundle.bundleId,
    evaluator: {
      kind: 'external-ai',
      model: 'skillforge-e2e-fixture',
      analyzedAt: new Date().toISOString(),
    },
    attemptEvaluations: attempts.map((attempt) => ({
      attemptId: attempt.attemptId,
      overallScore: 15,
      passed: false,
      reliability: 0.65,
      dimensions: {
        EXPLANATION: 15,
        EDGE_CASES: 10,
        COMPLEXITY_REASONING: 15,
      },
      feedbackMarkdown:
        'Ответ «Не знаю» не подтверждает понимание. Нужна отдельная практика объяснения, edge cases и сложности.',
      misconceptions: [],
      topicEvidence: [
        { topicKey: attempt.topicKey, kind: 'EXPLANATION', score: 15 },
        { topicKey: attempt.topicKey, kind: 'EDGE_CASES', score: 10 },
        { topicKey: attempt.topicKey, kind: 'COMPLEXITY_REASONING', score: 15 },
      ],
    })),
    recommendations: [
      {
        topicKey: primaryAttempt.topicKey,
        priority: 5,
        sessionMode: 'TRAINING',
        reason: 'Нужна отдельная короткая сессия без подсказок.',
      },
    ],
    summary:
      'Тестовый внешний анализ фиксирует недостаток evidence, не выставляя mastery напрямую.',
    warnings: [],
  };
}
