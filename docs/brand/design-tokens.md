# Design tokens

## Цвета

Источник токенов — CSS variables в `packages/ui`; значения ниже являются контрактом light theme.

```css
:root {
  --sf-brand-primary: #104ff2;
  --sf-brand-primary-hover: #0b43d4;
  --sf-brand-primary-active: #0838b6;
  --sf-brand-ink: #0b1a2b;
  --sf-brand-sky: #7cc0ff;
  --sf-brand-sky-soft: #eaf4ff;
  --sf-bg: #ffffff;
  --sf-surface: #ffffff;
  --sf-surface-subtle: #f2f7fd;
  --sf-surface-accent: #eaf3ff;
  --sf-text: #0b1a2b;
  --sf-text-muted: #5f7590;
  --sf-border: #d8e2f0;
  --sf-border-strong: #b7c8df;
  --sf-focus-ring: #104ff2;
  --sf-danger: #e5484d;
  --sf-danger-bg: #fdebec;
  --sf-warning: #f0a020;
  --sf-warning-bg: #fff4df;
  --sf-success: #22a06b;
  --sf-success-bg: #e6f6ef;
  --sf-info: #104ff2;
  --sf-info-bg: #e8efff;
  --sf-radius-sm: 8px;
  --sf-radius-md: 10px;
  --sf-radius-lg: 14px;
  --sf-radius-xl: 18px;
}
```

Статусный mapping:

| Статус     | Dot       | Текст     | Фон       | Обязательный label/icon        |
| ---------- | --------- | --------- | --------- | ------------------------------ |
| `unknown`  | серый     | `#5f7590` | `#f2f7fd` | `CircleHelp`, «Нет данных»     |
| `weak`     | `#e5484d` | `#d63b41` | `#fdebec` | красная точка, «Слабая»        |
| `unstable` | `#f0a020` | `#c9800f` | `#fff4df` | янтарная точка, «Нестабильная» |
| `solid`    | `#22a06b` | `#104ff2` | `#e8efff` | зелёная точка, «Уверенная»     |
| `mastered` | `#c58a00` | `#18895b` | `#e6f6ef` | trophy, «Освоенная»            |

## Типографика

- body/UI: Inter Variable с system fallback;
- headings/code/metrics: JetBrains Mono Variable с monospace fallback;
- шрифты поставляются npm/local assets, runtime CDN запрещён.

| Token     | Size | Line-height | Назначение       |
| --------- | ---: | ----------: | ---------------- |
| `display` | 32px |        40px | редкий hero      |
| `h1`      | 28px |        38px | page title, mono |
| `h2`      | 22px |        32px | section, mono    |
| `h3`      | 18px |        27px | card/group       |
| `body`    | 16px |        24px | основной текст   |
| `body-sm` | 14px |        21px | вторичный текст  |
| `caption` | 12px |        18px | metadata         |
| `code`    | 14px |        22px | editor/snippet   |

## Layout и spacing

- sidebar 280px, collapsed 72px;
- topbar 80px;
- content max-width 1440px;
- horizontal padding 32/20/16px на desktop/tablet/mobile;
- spacing base 4px, основные gaps 8/12/16/24/32px;
- стандартная карточка: border 1px, radius 14px, без постоянной тяжёлой тени;
- hover меняет border/background, не scale;
- focus ring 2px с offset 2px;
- motion 120–200ms и отключается при `prefers-reduced-motion`.

## Responsive contract

- `>=1200`: full sidebar, 2–3 columns, side controls active session;
- `768–1199`: collapsible sidebar, две колонки, controls ниже content;
- `<768`: drawer, одна колонка, sticky bottom actions, editor не ниже 300px.

Изменение значений должно происходить централизованно в `packages/ui` и сопровождаться визуальной проверкой контраста, focus и responsive layouts.
