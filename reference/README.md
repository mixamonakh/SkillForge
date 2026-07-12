# Reference assets

Эта директория предназначена только для визуальных/исторических референсов, например исходного Figma Make prototype и screenshots.

Из референса допустимо переносить палитру, typography, sidebar/topbar proportions, card geometry, route names, ResumeBanner и общий тон. Нельзя переносить production logic из mock data, global AppStore/localStorage, title-derived slugs, fake percentages, ручного mastery switch, regex JSON extraction или неработающих placeholder buttons.

Reference code не входит в runtime/build graph и не является source of truth. Production architecture описана в [`docs/architecture`](../docs/architecture/overview.md), design contract — в [`docs/brand`](../docs/brand/brandbook.md).

Если исходный архив добавляется сюда, необходимо проверить лицензию, исключить secrets/personal data и явно обозначить его как read-only reference.
