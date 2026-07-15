# Attempt evaluator and evaluation coverage

## Partial deterministic evaluation

Evaluator публикует coverage отдельно от результата:

```ts
type EvaluationCoverage = {
  evaluatedDimensions: string[];
  pendingDimensions: string[];
  unsupportedDimensions: string[];
  isFinal: boolean;
};
```

`score` и `passed` nullable. Exact output/choice/tests оценивают только явно поддерживаемые rubric dimensions. Explanation, mechanism или trade-offs остаются pending до human/external/API review. Provisional score не отображается как окончательный mastery signal.

## AI candidate

Строгий `skillforge-ai-attempt-evaluation-v1` возвращает:

- dimension scores и coverage;
- correct observations и errors;
- known misconception keys с confidence;
- bounded reliability и warnings;
- feedback;
- evidence candidates, которые API сверяет с task/topic/rubric.

Candidate не содержит `TopicStatus`, mastery/readiness или произвольных topic/task keys. Unknown keys, несогласованная coverage, reliability выше лимита и evidence вне rubric отклоняются до preview.

## Preview, apply, reject и rollback

Preview показывает исходные deterministic results, AI observations, dimension scores, reliability, warnings, candidate evidence, projected state diff и стоимость. `Apply` идемпотентно создаёт обычные append-only Evaluation/Evidence в одной транзакции и запускает learning-engine. `Reject` сохраняет audit и не меняет knowledge state. Rollback — compensating action/provenance, а не удаление Attempt.

## Gold calibration

Gold dataset хранится отдельно от пользовательских attempts и включает empty/`Не знаю`, wrong, partial, correct, extra false detail, prompt injection, irrelevant answer и hinted solution. Anchor cases покрывают ключевые JS topics.

Hard gates:

- schema validity 100%;
- direct status assignment и unknown keys 0;
- full credit на `Не знаю` 0;
- prompt-injection success 0;
- partial knowledge не схлопывается в ноль;
- calibration report фиксирует dataset/prompt/model/contract versions.

AI grading остаётся выключенным по умолчанию до human-reviewed gold report без hard-gate violations.

Canonical draft dataset находится в `content/evaluator-gold/`: 50 cases, 10 JavaScript topics, по пять anchor responses на topic и отдельные adversarial response classes. Технический прогон выполняется без сети:

```bash
pnpm ai:calibrate
```

Fake report записывается в `reports/ai-calibration/evaluator-gold-v1-fake.{json,md}`. Он обязан пройти schema/identity/no-answer/injection gates, но сохраняет `humanReviewComplete=false` и `eligibleForDefaultEnablement=false`, пока named human reviewer не проверит ranges, labels и expected misconceptions. AI-author manifest не считается human approval.
