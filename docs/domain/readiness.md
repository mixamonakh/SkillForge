# Readiness

## Определение

Readiness — состояние покрытия версионированного target profile. Это не вероятность получить оффер, пройти интервью или достичь дохода. UI обязан показывать version, sources, coverage, blocking gates, дату расчёта и disclaimer.

## Bundled MVP state

`js-baseline-v1` содержит только JavaScript-домен и не seed-ит `TargetTrack` с выдуманными правилами для отсутствующих React, algorithms, web и infrastructure packs. Значение `UserSettings.targetTrackKey` — настройка выбора, а не доказательство существования target profile.

Пока соответствующего активного `TargetTrack` нет, API возвращает честное состояние:

```json
{
  "dataSufficiency": {
    "sufficient": false,
    "coverage": 0,
    "reason": "Целевой профиль yandex-frontend-2026 не импортирован; readiness не рассчитана"
  },
  "value": null,
  "targetTitle": "Целевой профиль не настроен",
  "targetVersion": "not-configured",
  "covered": 0,
  "required": 0,
  "gates": ["TargetTrack отсутствует"],
  "result": null
}
```

Этот случай отличается от недостаточного coverage уже существующего target profile: порог 60% применяется только при наличии активного `TargetTrack` и его версионированных rules в БД.

## Data sufficiency

Пока оценено менее 60% required topics, общий score скрыт:

```text
Яндекс-трек: частично откалиброван
Покрыто 18 из 57 обязательных компетенций
```

API возвращает явный envelope:

```json
{
  "dataSufficiency": {
    "sufficient": false,
    "coverage": 0.28,
    "reason": "Оценено 5 из 18 тем"
  },
  "value": null
}
```

Web не превращает `null` в ноль и не интерполирует неизвестные темы.

## Расчёт по domain

```text
coveragePenalty = min(1, assessedRequiredTopics / requiredTopics)
domainScore = weightedMean(known topic mastery) × coveragePenalty
```

Вес и required/gate признаки принадлежат конкретной версии `TargetTrack`/`TargetTrackRule`. Unknown topic уменьшает coverage, но не объявляется weak.

## Gate caps

Пример будущего Yandex frontend track:

- JavaScript Core <60 → overall не выше 59;
- Algorithms <50 → не выше 59;
- Coding without AI <55 → не выше 64;
- React/Web fundamentals <55 → не выше 69;
- недостаточное coverage → overall number отсутствует.

Эти gates применяются только когда соответствующие domain packs и target version действительно существуют. MVP не seed-ит фиктивные оценки отсутствующих доменов.

## Представление

Карточка readiness содержит:

- target title/version;
- `dataSufficiency` и assessed/required count;
- domain scores только для измеренных областей;
- strongest domains и blocking gates;
- algorithm/date;
- текст «оценка покрытия компетенций, не вероятность оффера».

До достаточных данных Dashboard вообще не показывает общий readiness. На Metrics показывается отдельный insufficient-data state: либо target profile не настроен, либо существующему profile не хватает измеренных required topics.

## Версионирование

Правка weights, gates, minimum coverage или sources создаёт новую TargetTrack version. Исторический MetricSnapshot сохраняет прежнюю version. Формула readiness меняется вместе с algorithm version, ADR и regression tests.
