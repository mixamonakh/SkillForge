# ADR 0006: Browser Web Worker для JS runner MVP

- Статус: принято
- Дата: 2026-07-11

## Контекст

Baseline требует детерминированно проверять небольшие JavaScript functions/output. Выполнять пользовательский код в API process опасно. Отдельный judge cluster/container значительно увеличивает local MVP deployment. Пользователь в MVP доверенный и имеет DevTools.

## Решение

Выполнять JS/транспилированный TS в отдельном browser Web Worker. Protocol versioned request/response содержит requestId, language, source, harness, timeout, tests, console, duration и safe error.

Worker не имеет DOM; network APIs/importScripts отключены; source ≤50 KiB, timeout default 2000 ms, console capped, infinite loop прекращается `terminate()`. Output рендерится как text. API process не исполняет source.

Worker — local-mode failure boundary, но не secure sandbox. Hidden tests в browser являются UX-механикой, не секретом. Multi-user/cloud потребует isolated server runner.

## Последствия

Положительные:

- deterministic feedback без дополнительного service;
- infinite loop не блокирует main UI;
- clean Compose остаётся из web/API/DB;
- подходит для небольших baseline tasks.

Стоимость/риски:

- browser owner может увидеть harness/tests;
- Web Worker isolation не защищает от всех browser/runtime атак;
- TypeScript transpilation увеличивает client bundle и не равна full typecheck;
- результат нельзя считать server-side anti-cheat proof.

Меры: lazy load runner/compiler, CSP, protocol validation, worker termination/output cap и чёткая security документация.

## Рассмотренные варианты

- **`eval` в main window:** отклонено из-за freeze/DOM/security risk.
- **Код в Nest process:** отклонено из-за host/API compromise risk.
- **Отдельный judge service сейчас:** безопаснее при правильной isolation, но непропорционален trusted single-user MVP; обязателен для future multi-user.
- **Не проверять code:** отклонено, так как разрушает обязательный assessment loop.
