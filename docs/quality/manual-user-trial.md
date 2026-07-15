# Manual user trial — Михаил

Статус: обязательная проверка после технического release gate. Успешные build/e2e и fake-provider calibration не доказывают педагогическую эффективность.

## Перед началом

1. Сделать backup по [инструкции](../operations/backup-restore.md) или использовать отдельный disposable Docker volume.
2. Убедиться, что `js-baseline-v1` и `js-prebaseline-v1` импортированы, а `js-core-training-v1` активирован только после явного human content approval.
3. Для проверки без расходов оставить `AI_MODE=manual` либо использовать явно включённый fake provider в disposable environment. Live OpenAI проверяется отдельно с hard budget.
4. Не копировать текст личных ответов в issue/log; записывать только run/draft IDs, наблюдение и ожидаемое поведение.

## Сценарий

### 1. Быстрая калибровка

- Запустить новый JavaScript Pre-Baseline.
- На одном item выбрать «Не знаю» и убедиться, что это нормальный ответ без guilt copy.
- Проверить autosave, refresh, pause/resume и возврат к первому незавершённому item.
- Дойти до adaptive stop и прочитать объяснение причины остановки.
- Сравнить Routing Profile со своим ощущением по TERM, MECHANISM, TRACE, DEBUG, CODE_PRODUCTION и TRANSFER.
- Зафиксировать: какие family кажутся завышенными, заниженными или действительно unknown.

### 2. Первая acquisition session

- Открыть единственную primary recommendation.
- Пройти interleaved sequence: explanation → worked example → predict → contrast → debug → guided completion → no-help code.
- На content step проверить читаемость и отсутствие раскрытого ответа к последующему task.
- На task проверить autosave и browser runner; затем завершить обязательные steps.
- Убедиться, что no-help completion gate нельзя обойти, а пауза не вызывает штраф/давление.
- После завершения проверить capability update, review scheduling и следующий объяснимый шаг.

### 3. AI evaluation preview

- Выбрать submitted free-text attempt с pending dimension.
- Запросить одну AI-проверку и убедиться, что session остаётся рабочей при disabled provider, budget error или timeout.
- В preview прочитать correct observations, errors, dimension scores, reliability, warnings, candidate evidence, projected state diff и стоимость.
- Один draft отклонить: knowledge state не должен измениться.
- Второй draft применить: должны появиться обычные Evaluation/Evidence и пересчитанный state, но не прямое AI-присваивание mastery/status.
- Выполнить rollback applied draft и убедиться, что compensating provenance сохраняется, Attempt/answer не удалены, state пересчитан.

### 4. One nudge

- На незавершённой попытке запросить одну минимальную подсказку.
- Проверить, что она не содержит final code/output/solution и не превращается в чат.
- Повторный запрос должен вернуть сохранённый результат или quota state без второго provider charge.
- После использования `HelpLevel` должен отражать `NUDGE` и влиять на evidence strength обычным engine path.

### 5. Старый baseline и manual fallback

- Открыть «Расширенную диагностику JavaScript Core» по старому machine key.
- Проверить existing resume и хотя бы один старый task-only snapshot.
- В `AI_MODE=manual` создать export, провалидировать внешний strict JSON, просмотреть preview и выполнить apply/rollback.
- Убедиться, что отсутствие `OPENAI_API_KEY` не скрывает и не ломает manual workflow.

## Вопросы после прохождения

- Routing Profile совпал с ощущениями? Где и почему нет?
- Первая recommendation действительно была полезнее альтернатив?
- Материал был достаточно коротким и не раскрывал решение заранее?
- Preview понятно отделяет совет AI от локального знания?
- Понятно, что изменится при Apply и что сделал Rollback?
- Следующий шаг объясним и выполним без daily goal/streak pressure?
- Что вызвало лишнюю cognitive load или желание остановиться?

## Критерий завершения trial

Trial считается проведённым только после реального ответа Михаила на вопросы выше. До этого release может быть технически готов, но в документации нельзя утверждать, что система педагогически успешна или откалибрована на пользователе.
