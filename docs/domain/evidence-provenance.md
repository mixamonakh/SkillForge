# Evidence и provenance

## Почему provenance обязателен

SkillForge должен отвечать не только «какой статус», но и «на основании чего». Любой Evidence ведёт к первичному событию: Evaluation конкретного Attempt/TaskVersion или подтверждённому ExternalArtifact.

## Цепочки

Внутренняя задача:

```text
TopicState
← Evidence(topic, kind, normalized score, weight)
← Evaluation(evaluator type/version, reliability, rubric result)
← Attempt(answer/code/help/confidence, submittedAt)
← TaskVersion(prompt/rubric/tests/checksum)
← content pack/version
```

External AI:

```text
TopicState ← Evidence ← Evaluation(EXTERNAL_AI)
← ImportBatch(checksum, sourceBundleId, schema version)
← ExportBundle ← original Attempt
```

Battle/transfer:

```text
TopicState ← Evidence(BATTLE|TRANSFER)
← confirmation/evaluation ← ExternalArtifact(project, acceptance criteria, result URL)
```

## Минимальные provenance fields

Машиночитаемый payload evidence фиксирует:

- user/topic IDs и stable topic key;
- attempt/evaluation или external artifact ID;
- evaluator type/version/reliability;
- task stable key/version/checksum;
- source pack/version либо source bundle/import checksum;
- help level и occurredAt;
- algorithm/schema version, создавшие нормализованное evidence.

Полный answer body не дублируется в provenance и не логируется; он доступен через защищённую user-scoped связь с Attempt.

## Append-only semantics

- Evaluation не редактируется; исправление создаёт новую запись с `supersedesId`.
- ExportBundle immutable.
- Applied import сохраняется в audit trail.
- Пересчёт меняет TopicState cache, но не историю evidence.
- Дедупликация checksum предотвращает повторное применение одного анализа.

Если оценка отзывается, используется compensating record/action с причиной, а не тихое удаление истории. Recompute учитывает актуальную цепочку supersession/revocation по явным правилам.

## Внешний AI

Imported reliability по контракту ограничена 0..1, default 0.65; значение не делает AI источником истины. Unknown topic/attempt не маппится по похожему русскому title автоматически и не создаёт mastery. Preview показывает match/warnings до apply.

## UI

Topic Detail показывает evidence timeline с kind, score, evaluator, help, date и ссылкой на попытку/источник. Объяснение TopicState агрегирует число независимых дней/task/evidence kinds, no-help/delayed/transfer gates и конфликтующие свежие провалы.

## Privacy

Provenance нужен для проверки решения, но minimization сохраняется: логи содержат IDs/request metadata, не ответы. Экспорт данных является явным действием пользователя. Backup защищается владельцем локальной машины.
