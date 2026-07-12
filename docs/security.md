# Security

Полная local single-user threat model, ограничения browser Web Worker и требования к import/secret/container находятся в [docs/quality/security.md](quality/security.md). Порядок приватного сообщения об уязвимости — в [SECURITY.md](../SECURITY.md).

Ключевое ограничение MVP: browser worker допустим только для одного доверенного локального пользователя и не является sandbox для multi-user deployment. Для внешнего/multi-user запуска нужен отдельный isolated runner и authentication layer.
