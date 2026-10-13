# Segurança e pipeline de hooks

## Pipeline de cada request

No Fastify, "middleware" são plugins + hooks. A ordem de registro em `buildApp()` define a ordem de execução:

| # | Etapa | Hook / plugin | Observação |
|---|---|---|---|
| 1 | Request ID | `genReqId` (uuidv7) + header `x-request-id` | aceita o header vindo do cliente só se for um uuid válido |
| 2 | Headers de segurança | `@fastify/helmet` | API JSON: CSP mínima; habilite HSTS em produção |
| 3 | CORS | `@fastify/cors` | `origin: [APP_URL]` (lista fechada), `credentials: true` |
| 4 | Cookies | `@fastify/cookie` | assinados com `COOKIE_SECRET` |
| 5 | Rate limit | `@fastify/rate-limit` | global por IP; regras por rota (abaixo) |
| 6 | Checagem de Origin (CSRF) | `onRequest` | abaixo |
| 7 | Autenticação | `onRequest` (`plugins/auth.ts`) | protegido por padrão; `public: true` libera |
| 8 | Organização ativa | `onRequest` | rota de tenant (padrão) sem `orgId` → 403 `NO_ACTIVE_ORGANIZATION`; `tenant: false` libera |
| 9 | Validação | type provider Zod | body, query, params |
| 10 | Autorização | `preHandler` (`plugins/authorize.ts`) | `roles` + revalidação de `tokenVersion` |
| 11 | Plano | `preHandler` (`plugins/plan-guard.ts`) | `feature` / `limit` |
| 12 | Idempotência | `preHandler` + `onSend` | `idempotent: true` |
| 13 | Handler | — | — |
| 14 | Erros | `setErrorHandler` | RFC 9457 |
| 15 | Auditoria | `onResponse` | mutações bem-sucedidas com `audit` configurado |

## Configuração declarativa na rota

```ts
app.delete('/v1/members/:id', {
  config: { roles: ['OWNER', 'ADMIN'], audit: 'member.removed' },
  schema: { tags: ['Members'], params: IdParam, response: { 204: z.null(), 403: Problem, 404: Problem } },
}, handler)
```

| Chave | Padrão | Efeito |
|---|---|---|
| `public` | `false` | sem autenticação |
| `tenant` | `true` | exige organização ativa |
| `roles` | — | exige um dos papéis e revalida a membership |
| `feature` | — | exige feature do plano |
| `limit` | — | checa limite do plano antes de criar |
| `idempotent` | `false` | aceita/aplica `Idempotency-Key` |
| `audit` | — | nome da ação registrada no audit log |
| `csrf` | `true` | `false` só para webhooks |
| `rateLimit` | global | sobrescreve o limite da rota |

**Teste de proteção**: um teste percorre todas as rotas registradas (`app.printRoutes` ou hook `onRoute` coletando) e falha se alguma rota sem `public: true` responder sem 401 quando chamada sem cookie. Esse teste é o que garante o "seguro por padrão" ao longo do tempo.

## CSRF

Com cookies `SameSite=Lax`, navegadores não enviam o cookie em POST cross-site, o que já cobre o caso clássico. Segunda camada:

- Em todo método que altera estado (`POST`, `PUT`, `PATCH`, `DELETE`) de rota com `csrf !== false`: o header `Origin` (ou, na falta dele, `Referer`) **precisa** estar na lista de origens permitidas. Ausente ou diferente → 403 `FORBIDDEN`.
- A API só aceita `application/json` no body (o Fastify já rejeita outros tipos sem parser), o que bloqueia formulários HTML cross-site.

## Rate limit

| Escopo | Sugestão inicial |
|---|---|
| Global por IP | 300 req/min |
| `POST /v1/auth/login` | 10/min por IP |
| `POST /v1/auth/register` | 5/min por IP |
| `POST /v1/auth/forgot-password`, `resend-verification` | 3/min por IP |
| Rotas autenticadas | 600/min por organização (`keyGenerator` usando `request.auth.orgId`) |

Resposta 429 no formato RFC 9457 com `code: RATE_LIMITED`. Em produção com várias instâncias, o rate limit precisa de store compartilhado; documente isso no README (em instância única, memória serve).

## Entrada e saída

- Body limit global de 1 MB (`bodyLimit`); rotas que precisarem de mais declaram.
- Strings sempre com `.max()` no schema; e-mails normalizados (`trim` + minúsculas).
- Objetos Zod **estritos** na entrada: campo desconhecido → 400. Nunca passe `req.body` direto para o Prisma; o service monta o objeto campo a campo (sem mass assignment).
- **Schema de resposta obrigatório** em toda rota: o serializador só emite campos declarados.

## Logs

- pino com `redact` para: `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, `*.password`, `*.passwordHash`, `*.token`, `*.refreshToken`.
- Logger filho por request com `reqId`, `userId`, `orgId`.
- Erro 5xx: log `error` com stack. 4xx: log `info` (sem stack).
- Reuso de refresh token e bloqueio de login: log `warn` com tag `security`.

## Servidor

- `connectionTimeout` e `requestTimeout` configurados (ex.: 30 s).
- `trustProxy` ligado só se estiver atrás de proxy (env `TRUST_PROXY`), para o IP do rate limit ser o real.
- Graceful shutdown em `SIGTERM`/`SIGINT`: `app.close()` (para de aceitar requests, termina as em andamento), para o pg-boss, desconecta o Prisma.
- `/health` (processo vivo, sem tocar no banco) e `/ready` (testa banco). Ambos públicos, sem rate limit.

## Audit log

Plugin em `onResponse`: se a rota tem `config.audit` e o status é 2xx, grava `{ organizationId, actorUserId, action, entityType, entityId, ip, metadata }` via `withTenant`. O service pode enriquecer com `request.auditMeta = { entityId, ... }`. Falha ao gravar audit **não** derruba a resposta, mas é logada como erro.

Ações mínimas auditadas: login (em um log de segurança do usuário, não do tenant), membro convidado/removido/papel alterado, convite revogado, organização alterada, plano alterado, e as mutações do módulo de exemplo.

Leitura: `GET /v1/audit` (owner/admin, `feature: 'audit_log'`), paginado por cursor, com filtros `action` e `actorUserId`, devolvendo também o nome do autor para exibição.

## Jobs (pg-boss)

- `lib/jobs.ts` inicia o pg-boss com `DATABASE_URL` no schema `pgboss` (criado pelo `/rodsaas:db`).
- Filas iniciais: `email.send` (com retry e backoff), `tokens.cleanup` (diário: apaga refresh/verification expirados há mais de 30 dias e idempotency keys vencidas).
- Workers rodam no mesmo processo por padrão; deixe a separação em processo próprio documentada como opção.

## E-mail

- `Mailer` é uma interface `{ send({ to, subject, html, text }) }` com implementação SMTP (nodemailer).
- Em dev, SMTP aponta para o Mailpit (UI em `localhost:8025`). Nos testes, um mailer em memória para verificar envios.
- Templates simples em TS (funções que devolvem `{ subject, html, text }`), em português.

## Checklist de segurança (conferida na Fase 8)

- [ ] Toda rota sem `public: true` exige auth (teste automático passando)
- [ ] usuário da aplicação (`<projeto>_app`) sem superuser/bypassrls; RLS com `FORCE` em todas as tabelas de negócio
- [ ] Teste de isolamento entre organizações passando em todas as rotas de tenant
- [ ] Recurso de outra organização → 404
- [ ] Refresh com rotação, detecção de reuso e janela de tolerância testados
- [ ] Erros de login e forgot-password não revelam se o e-mail existe
- [ ] Cookies httpOnly, secure em produção, sameSite lax, refresh com path restrito
- [ ] Checagem de Origin em mutações
- [ ] CORS com lista fechada
- [ ] Schemas de resposta em todas as rotas
- [ ] Redact de segredos no logger
- [ ] Env validado no boot (segredos com tamanho mínimo)
- [ ] Webhook Stripe com verificação de assinatura e idempotência
- [ ] 500 sem detalhe interno em produção
- [ ] `/docs` desligado por padrão em produção
