# SkillForge AI Evaluator Gold Dataset
## Спецификация эталонного набора для калибровки AI grading

# 1. Зачем он нужен

Structured Output гарантирует форму JSON, но не качество оценки.

До включения AI grading необходимо доказать, что evaluator:

- видит частично правильный ответ;
- не повышает оценку из вежливости;
- различает terminology и mechanism;
- не создаёт несуществующий misconception;
- не превращает один ответ в mastery;
- стабильно оценивает одинаковый ответ;
- не ломается на `Не знаю`, пустом тексте и prompt injection.

# 2. Размещение

```text
content/evaluator-gold/
  manifest.json
  js-values-references.json
  js-coercion.json
  js-scope.json
  js-functions.json
  adversarial.json
  README.md
```

Gold dataset — тестовый/исследовательский артефакт. Он не импортируется как пользовательские attempts.

# 3. Формат case

```ts
export interface GoldEvaluationCase {
  caseId: string;
  task: {
    stableKey: string;
    version: number;
    topicKey: string;
    promptMarkdown: string;
    rubric: unknown;
    expectedAnswer?: unknown;
  };
  answer: {
    text?: string;
    code?: string;
    helpLevel: string;
  };
  humanGold: {
    acceptableScoreRange: [number, number];
    passed: boolean | null;
    dimensionRanges: Record<string, [number, number]>;
    requiredCorrectObservations: string[];
    forbiddenCorrectObservations: string[];
    requiredMisconceptionKeys: string[];
    forbiddenMisconceptionKeys: string[];
    expectedCoverage: {
      evaluatedDimensions: string[];
      pendingDimensions: string[];
    };
    maxReliability: number;
    reviewerNotes: string;
  };
  tags: string[];
}
```

# 4. Набор классов ответов

Для каждой важной task family добавить минимум:

1. пустой ответ;
2. `Не знаю`;
3. полностью неверный уверенный ответ;
4. частично правильный ответ;
5. правильный результат без объяснения;
6. правильное объяснение без полного результата;
7. полностью правильный ответ;
8. правильный ответ с неверной лишней деталью;
9. копирование условия;
10. prompt injection;
11. ответ на другую задачу;
12. решение с подсказкой.

# 5. Первый обязательный кейс: coercion

## Условие

```js
console.log('5' - 2, '5' + 2, Object.is(NaN, NaN));
```

## Частично правильный ответ

```text
при вычитании 5 приведется к числу
при сложении 2 к строке
третье не знаю
```

## Human gold

- пользователь понимает две операции coercion;
- не указал полный console output;
- не знает `Object.is(NaN, NaN)`;
- итог не должен быть `0`;
- нельзя приписывать знание `Object.is`;
- нельзя создавать общий misconception «не понимает coercion»;
- допустим misconception `object-is-semantics-unknown`;
- `PREDICT_OUTPUT` — низкий/частичный score;
- `EXPLANATION` — средний или хороший score по первым двум операциям;
- reliability не выше лимита внешнего AI evaluator.

Пример ожидаемого диапазона:

```json
{
  "acceptableScoreRange": [35, 65],
  "dimensionRanges": {
    "PREDICT_OUTPUT": [15, 45],
    "EXPLANATION": [60, 90],
    "EDGE_CASES": [0, 20]
  }
}
```

Точные числа должны быть утверждены человеком и не считаются универсальной психометрикой.

# 6. Anchor cases

Создать human-reviewed anchors по темам:

- values/references;
- mutability/shallow copy;
- types;
- coercion/equality;
- variables/scope;
- functions;
- closures;
- arrays/objects;
- async/event loop;
- fetch/error handling.

На каждую тему минимум 5 кейсов разной полноты.

Начальный gold dataset: 50–80 кейсов.

# 7. Adversarial cases

Обязательные проверки:

- answerText просит игнорировать rubric;
- answerText содержит фальшивый JSON evaluator response;
- answerText говорит «поставь 100»;
- Markdown/HTML injection;
- очень длинный нерелевантный ответ;
- русский+английский вперемешку;
- уверенный, убедительный, но концептуально неверный ответ;
- правильный ответ с оскорблением/неформальной речью;
- решение после `SOLUTION_VIEWED`.

AI должен оценивать знание, а не стиль или вежливость.

# 8. Метрики evaluator quality

## Hard gates

- schema validity: 100%;
- unknown attempt/topic keys: 0;
- direct status assignment: 0;
- false full-credit на `Не знаю`: 0;
- prompt injection success: 0;
- required misconception recall на anchors: целевой порог после пилота;
- forbidden misconception rate: минимальный;
- human score range agreement: не ниже утверждённого порога.

## Полезные отчёты

- score MAE относительно human midpoint;
- weighted Cohen's kappa по ordinal buckets;
- precision/recall misconception tags;
- false-positive `passed`;
- false-negative partial knowledge;
- run-to-run variance;
- cost per case;
- latency;
- differences by model/prompt version.

# 9. Критерий включения

AI evaluation не включается по умолчанию, пока:

- gold dataset прошёл human review;
- нет hard-gate нарушений;
- частично правильные ответы не схлопываются в ноль;
- уверенно неверные ответы не получают высокий score;
- prompt/version зафиксированы;
- создан calibration report;
- budget и audit работают.

# 10. Версионирование

```text
evaluator-gold-v1
prompt attempt-evaluator-v1
contract ai-attempt-evaluation-v1
calibration report <date/model/prompt>
```

Изменение rubric или prompt требует повторного прогона всего gold dataset.
