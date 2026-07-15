# Карта преобразования предыдущего пакета документов

Цель преобразования — изменить способ запуска, а не сократить scope.

| Предыдущий файл | Новый root-файл | Что произошло |
|---|---|---|
| `00_README.md` | `SFV2_START_HERE.md` | Переписан под схему «все файлы в корне + один Goal prompt» |
| `01_LEARNING_SYSTEM_V2_REFACTOR_PLAN.md` | `SFV2_IMPLEMENTATION_SPEC.md` | Скопирован полностью без сокращения требований |
| `02_CODEX_IMPLEMENTATION_PROMPTS.md` | `SFV2_TASK_LEDGER.md` + `CODEX_GOAL_PROMPT.md` | Все Phase 0–8 сохранены в ledger; разрозненные пользовательские prompts заменены одним orchestration prompt |
| `03_CONTENT_GENERATION_PROMPT_V2.md` | `CHATGPT_CONTENT_GENERATION_PROMPT.md` | Исходные правила сохранены и дополнены конкретной поставкой следующего production content release |
| `04_AI_EVALUATOR_GOLD_DATASET_SPEC.md` | `SFV2_AI_EVALUATOR_GOLD_SPEC.md` | Скопирован полностью |
| `05_CONTENT_QUALITY_GATES.md` | `SFV2_CONTENT_QUALITY_GATES.md` | Скопирован полностью |
| `06_ADR_CAPABILITY_MODEL_AND_AI.md` | `SFV2_ADR_CAPABILITY_AND_AI.md` | Скопирован полностью |
| `07_SAMPLE_CONTRACTS_AND_SCHEMAS.md` | `SFV2_CONTRACTS_AND_SCHEMAS.md` | Скопирован полностью |
| отсутствовал | `OPENAI_API_SETUP_AFTER_REFACTOR.md` | Добавлена отдельная post-development инструкция по API key, billing, env, smoke/calibration и security |

## Что сознательно изменено

Предыдущий пакет требовал запускать каждую фазу отдельным сообщением. Новый пакет оставляет те же фазы и acceptance criteria, но Codex Goal:

1. создаёт persistent execution log;
2. выполняет фазы последовательно в одном Goal;
3. использует агентов для независимых областей;
4. не ждёт подтверждения между фазами;
5. может безопасно продолжить после технического прерывания по execution log.

## Что не удалено

- capability profile;
- evaluation coverage;
- content schema v2;
- adaptive routing;
- session builder;
- pre-baseline;
- первый acquisition sequence;
- AI provider, budget, cache и audit;
- content review и one nudge;
- gold dataset;
- миграции и backward compatibility;
- unit/integration/contract/e2e/Docker checks;
- документация и manual user trial.
