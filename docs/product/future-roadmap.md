# Future roadmap

Этот документ описывает направления после обязательного MVP. Наличие пункта не означает, что функция реализована, включена в UI или имеет срок выпуска. Planned-возможности не должны маскироваться под рабочие кнопки.

## Текущая поставка — Learning System v2

Capability Profile, pre-baseline, rule-based routing, sequence builder и bounded AI features входят в утверждённый [контракт Learning System v2](learning-system-v2.md). До завершения соответствующей фазы в `SFV2_EXECUTION_LOG.md` они не считаются работающими runtime-функциями.

## Следующая предметная область — TypeScript и React

- diagnostic packs для TypeScript и React/Next;
- TypeScript compiler diagnostics;
- изолированные component tasks;
- rendering/debugging и architecture evidence;
- версионированные source links.

## Algorithms / LeetCode

- roadmap алгоритмических паттернов;
- ручная привязка LeetCode solutions без хрупкого scraping;
- complexity rubric и solution replay;
- spaced review паттернов;
- interview mode с timed coding.

## Internet, servers и infrastructure

- HTTP labs и request inspector;
- SQL, Docker, nginx/reverse proxy exercises;
- backend fundamentals и terminal tasks.

## GitHub integration

- OAuth с явными разрешениями;
- repository linking, commit/PR/diff evidence;
- Codex task bundles и code review analysis;
- приватные репозитории остаются opt-in, архитектура не зависит от одного repo.

## Статистическая адаптивность после накопления данных

- item difficulty calibration;
- BKT/IRT только после проверяемого датасета;
- validated misconception graph;
- calibrated probabilistic selection и confidence intervals;
- оценка качества recommendation engine.

Сложная статистическая модель не вводится без возможности калибровки и объяснения результата.

## Multi-user/cloud

- authentication, Argon2id, secure sessions и CSRF;
- row isolation, tenant/user scoping;
- server-side isolated runner, object storage, queue/workers;
- encrypted secrets, production deployment и audit/admin tools.

## Дополнительные направления

- PWA/offline draft, service worker и conflict resolution;
- content authoring UI с draft/review/publish;
- безопасный import из внешних источников;
- multi-language UI после стабилизации русского контракта.

## Архитектурные условия

Нынешний модульный монолит, versioned contracts, stable keys, user-scoped domain и pure learning engine должны позволить эти расширения без переписывания основных инвариантов. Каждая новая фаза требует отдельного решения о продуктовой ценности, threat model, ADR и тестовом контракте.
