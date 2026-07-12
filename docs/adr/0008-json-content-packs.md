# ADR 0008: JSON как сериализация content pack v1

- Статус: принято
- Дата: 2026-07-11

## Контекст

ТЗ показывает YAML-примеры, но обязательный контракт требует прежде всего versioned Git source of truth, строгую runtime-валидацию, checksum, cycle detection и идемпотентный import. Формат сериализации не участвует в доменной модели.

## Решение

Первый pack `js-baseline-v1` хранится в JSON. Каждый файл проверяется Zod-схемой до построения import plan. Stable keys, version и checksum остаются независимыми от display title. Import не использует `JSON.parse` без последующей строгой semantic validation.

## Причины

- JSON читается Node.js без дополнительного parser и уменьшает content supply-chain surface;
- один синтаксис используется в content pack, export/import contracts и JSON Schema artifacts;
- deterministic serialization упрощает воспроизводимый SHA-256 checksum;
- это самое простое устойчивое решение для локального MVP.

## Последствия

- авторинг менее удобен для длинного Markdown, чем YAML block scalars;
- CLI и content schema не должны зависеть от расширения файла, поэтому YAML можно добавить новой версией authoring adapter без изменения БД;
- переход на другой формат не меняет stable keys и не создаёт новую TaskVersion сам по себе.
