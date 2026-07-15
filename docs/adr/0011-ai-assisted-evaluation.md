# ADR 0011: Bounded AI-assisted evaluation

- Статус: принято
- Дата: 2026-07-15

## Контекст

Manual export/import безопасен и обязателен, но не даёт быстрый feedback свободным ответам. Provider output может быть убедительным и неверным, prompt-injected или дорогим. Встраивание общего чата нарушило бы mission и усилило зависимость от готовых решений.

## Решение

1. Сохранить `AI_MODE=manual` как default и полноценный fallback без API key.
2. Разрешить только feature-specific rubric grading, content review и одну подсказку.
3. Ввести provider abstraction, deterministic fake provider и opt-in OpenAI Responses API adapter со Structured Outputs.
4. Любой provider output проверять strict local schema и domain rules.
5. Сохранять candidate draft, показывать preview и применять только explicit idempotent transaction.
6. Apply создаёт обычные append-only Evaluation/Evidence; AI не пишет `TopicState`/mastery/readiness.
7. Ввести versioned prompt registry, stable cache key и audit metadata без raw answer в logs.
8. Ограничить reliability single-pass AI contract и отклонять unknown keys/status assignments.
9. Использовать atomic monthly reserve/reconcile ledger с hard default limit 10 USD и separate feature flags.
10. Не включать grading по умолчанию до human-reviewed gold calibration report без hard-gate violations.

## Последствия

- Provider outage/budget exhaustion не блокирует learning loop и manual import.
- Появляются additive AI tables, security/operations surface и обязательные concurrency tests.
- Cache снижает повторные расходы, но остаётся version-bound.
- Reject сохраняет audit без knowledge mutation; rollback использует compensating provenance.
- Реальный paid smoke является отдельной operator action, не условием build/test/Docker start.

## Отклонённые варианты

- embedded AI tutor/chat;
- direct status update из model JSON;
- хранение ключа в web/browser;
- отсутствие hard budget или optimistic check без atomic reservation;
- автоматическая публикация AI-reviewed content;
- agent framework и vector database ради evaluator.
