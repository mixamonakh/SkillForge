# Журнал изменений

Все заметные изменения SkillForge документируются здесь. Формат основан на Keep a Changelog, версии следуют Semantic Versioning после первого релиза.

## [Unreleased]

### Added

- Начальная production-архитектура monorepo SkillForge.
- Документационный контракт продукта, домена, API, эксплуатации, качества и ADR 0001–0007.
- Базовый контур JavaScript assessment, evidence/mastery, manual AI import/export и browser worker определяется как обязательный MVP.

### Security

- Зафиксирована local single-user threat model и ограничение browser worker как неполного sandbox.
- Импорт внешнего анализа считается недоверенным advisory-вводом.

> Этот раздел описывает состав текущей разработки, а не подтверждает успешное прохождение release verification. Результат проверок фиксируется отдельно в CI/финальном отчёте.

## Политика

- `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security` используются по необходимости.
- Изменения незавершённого MVP остаются в `Unreleased`.
- Перед релизом раздел получает номер версии и дату в формате `YYYY-MM-DD`.
- Изменения формул learning engine дополнительно требуют ADR и версии алгоритма.
