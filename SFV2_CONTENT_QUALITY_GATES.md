# SkillForge Content Quality Gates

# 1. Цель

JSON schema validation подтверждает форму файла, но не подтверждает педагогическую и фактическую ценность задания.

Контент проходит последовательные состояния:

```text
DRAFT
→ SCHEMA_VALID
→ TECHNICALLY_REVIEWED
→ PEDAGOGICALLY_REVIEWED
→ APPROVED
→ ACTIVE
→ ARCHIVED
```

Текущая DB enum может не содержать все authoring states. До отдельного workflow они хранятся в review report/manifest metadata, а в БД импортируются только APPROVED/ACTIVE материалы.

# 2. Gate 0 — Content design

До генерации должны быть определены:

- target audience;
- pack purpose;
- topic map;
- prerequisites;
- learning outcomes;
- evidence families;
- difficulty dimensions;
- task taxonomy;
- source policy;
- human reviewer;
- expected assessment/session role.

Без этого массовая генерация запрещена.

# 3. Gate 1 — Schema and graph

Проверяет автоматически:

- valid JSON;
- schema version;
- stable English keys;
- uniqueness;
- TaskVersion versioning;
- manifest counts;
- existing topic references;
- no prerequisite cycles;
- assessment references;
- required CODE fields;
- source fields;
- strict unknown field policy;
- sequence step references;
- checksum stability.

Status: BLOCK_IMPORT при любой ошибке.

# 4. Gate 2 — Technical correctness

Для каждого задания:

- код выполняется;
- expected answer корректен;
- публичные и hidden tests согласованы;
- тесты не принимают очевидно неправильное решение;
- тесты не требуют неописанного поведения;
- timeout соблюдается;
- starter code синтаксически корректен;
- prompt не противоречит acceptance criteria;
- нет несуществующих browser/runtime guarantees;
- версия языка/платформы указана, если важна.

CODE item без проверенных tests: BLOCK_IMPORT.

# 5. Gate 3 — Rubric quality

Rubric должен:

- соответствовать learning outcome;
- разделять dimensions;
- позволять partial credit там, где это осмысленно;
- не требовать exact-match для объяснения;
- описывать необходимые и запрещённые выводы;
- не смешивать terminology и mechanism;
- учитывать help level;
- не присваивать transfer за canonical example;
- быть применимым human и AI evaluator.

Слабый rubric: NEEDS_HUMAN_REVIEW.

# 6. Gate 4 — Pedagogical fit

Проверить:

- соответствует ли item фазе;
- не слишком ли много новой нагрузки одновременно;
- не проверяет ли он неизвестный prerequisite;
- не является ли trivia;
- не маскирует ли reading под production;
- есть ли contrast sibling;
- есть ли ожидаемый misconception signal;
- не дублирует ли он предыдущий item;
- полезна ли задача взрослому практикующему разработчику;
- не требует ли она длинной бессмысленной ручной работы.

# 7. Gate 5 — Language and UX

- русский текст понятен;
- начальная диагностика не перегружена терминологией;
- код отформатирован;
- вопрос содержит все условия;
- нет гендерной/культурной ненужной специфики;
- нет guilt copy;
- `Не знаю` допустим в calibration;
- оценка времени реалистична;
- пользователь понимает, что вводить.

# 8. Gate 6 — Sources

Приоритет:

1. спецификация стандарта;
2. официальная документация платформы;
3. MDN/официальные руководства;
4. первичная книга/статья;
5. вторичный источник только при необходимости.

Проверить:

- URL существует;
- источник подтверждает утверждение;
- нет ссылки на поисковую выдачу;
- дата/версия актуальны;
- источник не используется для оправдания спорной формулировки.

# 9. Gate 7 — Assessment fairness

Для diagnostic items:

- item измеряет заявленную capability family;
- unknown term не делает mechanism answer невозможным без необходимости;
- нет скрытой ловушки;
- canonical JS quirks отделены от practical foundation;
- selection/stop rule не делает слишком сильный вывод из одного item;
- разные branches сопоставимы по цели;
- pass/fail не используется вместо routing profile.

# 10. Gate 8 — AI review

AI review может:

- искать ambiguity;
- сравнивать rubric и prompt;
- искать дубли;
- проверять probable test gaps;
- оценивать stage fit;
- выявлять solution leakage;
- проверять metadata consistency.

AI review не заменяет:

- запуск tests;
- human pedagogical judgment;
- source verification;
- решение об активации.

# 11. Gate 9 — Dry run

До включения в baseline:

- пройти item человеком;
- проверить UI rendering;
- проверить autosave;
- проверить evaluator output;
- проверить time estimate;
- проверить, что feedback не раскрывается раньше времени;
- проверить export/import representation.

Anchor items желательно пройти несколькими людьми, когда появятся тестовые пользователи.

# 12. Gate 10 — Release

Pack активируется только если:

- validation green;
- content diff просмотрен;
- manifest counts верны;
- human review записан;
- BLOCK_IMPORT отсутствует;
- assessment snapshot tests пройдены;
- docs обновлены;
- backup выполнен перед рискованным импортом;
- import идемпотентен.

# 13. Review report format

```json
{
  "packKey": "js-prebaseline-v1",
  "packVersion": "1.0.0",
  "reviewedAt": "2026-07-15T00:00:00Z",
  "reviewers": ["human:mikhail", "ai:model/prompt-version"],
  "summary": {
    "pass": 14,
    "needsHumanReview": 3,
    "blockImport": 1
  },
  "items": [
    {
      "stableKey": "...",
      "version": 1,
      "status": "NEEDS_HUMAN_REVIEW",
      "findings": [],
      "resolvedFindings": []
    }
  ]
}
```

# 14. Quality metrics for authoring

Полезно считать:

- AI draft acceptance rate;
- findings per item;
- test failures before approval;
- duplicate rejection rate;
- human editing time;
- item retirement rate после реального использования;
- ambiguous response rate;
- evaluator disagreement;
- количество items, которые реально изменили routing decision.

Не считать качество по количеству созданных задач.
