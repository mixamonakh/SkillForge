# Security design

## Threat model MVP

Активы: пользовательские answers/code, evaluations/evidence, local DB/backups, optional API key и integrity content/import. Trust boundaries: browser↔API, imported file/AI text, content pack, worker execution и container↔host.

Предположение: один доверенный пользователь, bind на localhost. Это не оправдывает потерю данных, XSS или arbitrary host code execution. Внешний bind без auth не поддерживается.

## Input и rendering

- HTTP DTO, IDs, enums, env и JSON валидируются runtime schemas;
- import default max 5 MiB, depth/array/string limits;
- Markdown/HTML sanitizes allowlist; unsafe URL/event/script запрещены;
- no raw `dangerouslySetInnerHTML`;
- error response не содержит stack/SQL/full payload;
- arbitrary filesystem paths из user input запрещены;
- Prisma queries parameterized.

## Web headers

Production web/API задают CSP, `X-Content-Type-Options: nosniff`, frame/referrer/permissions policy, где применимо. CSP учитывает CodeMirror/worker implementation минимально необходимыми directives; широкие `unsafe-eval`/wildcard network не добавляются без ADR/threat review.

## Code runner

User code работает только в отдельном browser Web Worker:

- без DOM;
- `fetch`, WebSocket, EventSource, importScripts/network отключены;
- timeout по умолчанию 2000 ms с `terminate()`;
- source не более 50 KiB и console output capped;
- output рендерится как text;
- main window не вызывает `eval` пользовательского source.

Worker не является secure sandbox против malicious multi-user. Browser-hidden tests доступны владельцу DevTools. Для cloud нужен isolated runner container/service с resource/network/filesystem isolation.

## Import trust

External AI analysis — untrusted advisory data. Он не может:

- исполнять код;
- изменять settings/user/content version;
- удалять attempts/evidence;
- устанавливать topic status/mastery;
- создавать unknown topics по похожему title.

Строгая schema, source bundle match, preview, transaction, checksum deduplication и provenance обязательны.

## Secrets и privacy

- manual mode без secret — default;
- optional API key только server-side env, не client bundle;
- `.env`/backups исключены из Git/build context;
- logs не содержат answer code/text, raw import, prompt bundle или key;
- third-party analytics/Sentry отключены;
- export — explicit user action.

## Containers/DB/supply chain

- exact images/dependencies/lockfile, no `latest`;
- non-root runtime;
- PostgreSQL не публикуется host в основном compose;
- migrations committed и применяются deploy, без automatic reset;
- dependency audit и content validation в CI;
- backup до destructive changes.

## Future auth

Перед bind вне localhost: local credentials, Argon2id, secure HttpOnly session, CSRF, TLS/reverse proxy, per-user service scoping и access audit. OAuth остаётся optional. Добавление auth требует ADR и e2e threat tests.

Порядок сообщения об уязвимости: [SECURITY.md](../../SECURITY.md).
