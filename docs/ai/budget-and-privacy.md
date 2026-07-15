# AI budget, cache and privacy

## Defaults

```env
AI_MODE=manual
AI_MONTHLY_BUDGET_USD=10
AI_ATTEMPT_REVIEW_ENABLED=false
AI_CONTENT_REVIEW_ENABLED=false
AI_NUDGE_ENABLED=false
```

Build, tests, Docker start и manual mode не требуют `OPENAI_API_KEY`.

Paid OpenAI feature включается только при полном наборе server-side значений:

```env
AI_MODE=api-assisted
OPENAI_API_KEY=...
OPENAI_PRICE_INPUT_USD_PER_MILLION=...
OPENAI_PRICE_CACHED_INPUT_USD_PER_MILLION=...
OPENAI_PRICE_OUTPUT_USD_PER_MILLION=...
```

Цены намеренно не зашиты в репозиторий: operator копирует актуальные rates для настроенного model с официальной pricing page. Неполная pricing configuration отклоняется до provider call, потому что нулевая или выдуманная reservation нарушила бы hard budget. Для isolated fake-provider runtime нужен отдельный явный `AI_FAKE_PROVIDER_ENABLED=true`; default остаётся `false`.

## Hard budget protocol

Для каждого paid invocation API:

1. оценивает maximum cost;
2. начинает transaction и блокирует/создаёт user-period ledger;
3. проверяет `limit - spent - reserved`;
4. атомарно резервирует стоимость;
5. вызывает provider вне долгой DB transaction;
6. в новой transaction сверяет actual cost и освобождает остаток;
7. при error освобождает reservation и записывает безопасный error code.

Concurrent requests не могут зарезервировать больше hard monthly limit. Повтор reconcile идемпотентен. Отдельные quotas/feature flags ограничивают nudge и content review.

## Cache

Идентичная проверка использует cache key из immutable task checksum, answer/rubric hashes, prompt version, model и contract version. Cache hit создаёт audit invocation со статусом `CACHED`, не списывает повторную provider cost и использует тот же validated normalized result. Для другого Attempt API rebinding-ит только `attemptId`, повторно выполняет local/domain validation и создаёт отдельный draft; source draft остаётся provenance, а не переиспользованной пользовательской записью.

## Хранение и логи

В БД допустимы input hash, normalized candidate/draft, token/cost/latency metadata, related IDs, prompt/model versions и error code. Raw answer уже хранится в `Attempt` и не копируется в обычные logs. API key, provider authorization headers, полные answer/import bodies и raw provider payload не логируются.

Key доступен только server runtime, никогда не попадает в browser bundle. При provider failure UI предлагает manual export/import без потери attempt.

## Usage read model

Usage показывает limit, spent/reserved, request count, average/applied cost, cache hits, failures, applied/rejected ratio и model/prompt versions. Финансовые числа — audit metadata, а не метрика качества обучения.
