# API

Padrão da base em tudo: `/v1`, tenant do token, `withTenant`, schemas Zod de entrada (estritos) e saída (com nome no OpenAPI), RFC 9457, cursor, `config` declarativo. Horários em ISO 8601 UTC. Toda rota interna exige **atendente ativo** (ou owner/admin): senão 403 `NOT_AN_AGENT`. HTML que entra (resposta, artigo, e-mail recebido) passa pelo `sanitize-html` com lista fechada de tags e atributos; `bodyText` é gerado no servidor.

Os formatos marcados com ★ fazem parte do **contrato testável** (`skills/verify/contract.json`, grupo `presets.helpdesk`).

## Configurações, filas, atendentes, SLA

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/helpdesk/settings` | — | `{ portalSlug, portalUrl, portalTitle, timeZone, businessHours, businessOverrides, blockNationalHolidays, slaPolicy, autoCloseDays, pendingReminderDays, visibility, csatEnabled, showBranding }` |
| `PATCH /v1/helpdesk/settings` | owner/admin | campos acima (menos SLA); `portalSlug` único (409 `SLUG_TAKEN`) |
| ★ `PUT /v1/helpdesk/sla` | owner/admin, `feature: 'helpdesk_sla'` | `{ policy, timeZone?, businessHours?, businessOverrides?, blockNationalHolidays? }` (`validateSlaPolicy`, `validateWeekly`); vale para chamados novos e para mudanças de prioridade |
| ★ `GET /v1/helpdesk/queues` · ★ `POST` · `PATCH /:id` · `DELETE /:id` | escrita owner/admin | `{ name, description?, assignment?: 'MANUAL'\|'ROUND_ROBIN'\|'LOAD', maxOpenPerAgent?, agentIds? }`; distribuição automática exige `helpdesk_automation`; excluir pede a fila de destino dos chamados |
| ★ `GET /v1/helpdesk/agents` | — | membros com `{ userId, name, email, isAgent, active, available, queueIds, openCount }` |
| ★ `PUT /v1/helpdesk/agents/:userId` | owner/admin, `limit: 'helpdeskAgents'` ao ativar | `{ active, queueIds? }` (torna atendente; tirar de atendente mantém os chamados com ele, com aviso) |
| ★ `PUT /v1/helpdesk/me/availability` | — | `{ available }` |
| `PUT /v1/helpdesk/me/signature` | — | `{ signature }` |

## Chamados

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/helpdesk/views/counts` | — | `{ mine, unassigned, open, pending, on_hold, breaching, solved, spam, views: { <id>: n } }` (das filas que a pessoa vê). `mine`, `unassigned` e `open` contam os **não resolvidos** (Aberto, Aguardando cliente, Em espera); `breaching` = prazo estourado ou em aviso |
| ★ `GET /v1/helpdesk/tickets` | — | `?view=mine\|unassigned\|open\|pending\|on_hold\|breaching\|solved\|closed\|spam\|all\|<viewId>`, `status`, `priority`, `queueId`, `assigneeId` (`me`, `none`, id), `requesterId`, `channel`, `tag`, `q` (número `#123`, assunto, texto, e-mail do solicitante), `sort=due\|updated\|created`, cursor; item **`{ id, number, subject, status, priority, channel, queue: { id, name }, assignee: { id, name } \| null, requester: { id, name, email }, tags, createdAt, updatedAt, lastCustomerReplyAt, sla: { firstResponse: { dueAt, state }, resolution: { dueAt, state } } }`** (`state` do `slaState`) |
| ★ `POST /v1/helpdesk/tickets` | `limit: 'helpdeskTicketsMonthly'` (só marca `overPlan`), idempotente | criado pela equipe: `{ subject, requester: { name?, email } \| { contactId }, body, as?: 'CUSTOMER'\|'PUBLIC'\|'NOTE', channel?: 'PHONE'\|'INTERNAL', priority?, queueId?, assigneeId?, tags?, fields?, ccs? }` → 201 chamado; `as: 'CUSTOMER'` (padrão) registra o pedido do cliente sem mandar e-mail; `PUBLIC` é contato ativo (manda e-mail com o link) |
| ★ `GET /v1/helpdesk/tickets/:id` | — | o item acima + `messages: [{ id, kind, authorKind, author: { id, name, email }, bodyHtml, bodyText, channel, attachments, hasRemoteImages, deliveryStatus, createdAt }]`, `events`, `ccs`, `fields`, `csat: { rating, comment, at }`, `followUpOf`, `mergedInto` |
| ★ `PATCH /v1/helpdesk/tickets/:id` | — | `{ status?, priority?, queueId?, assigneeId?, tags?, subject?, fields?, ccs? }`; `status` pelo `canSetStatus` (fechar à mão → 409 `INVALID_STATUS_TRANSITION`; fechado não muda → 409 `TICKET_CLOSED`); responsável precisa ser atendente ativo da fila (400 com `path`) |
| ★ `POST /v1/helpdesk/tickets/:id/messages` | — | `{ kind: 'PUBLIC'\|'NOTE', body, status?, attachments?, macroId?, ccs? }` → **201 `{ message, ticket: { status, firstResponseAt, ... } }`**; regras abaixo |
| ★ `POST /v1/helpdesk/tickets/:id/merge` | — | `{ intoId }` → **`{ ticket }`** (o destino): mensagens e acessos vão para o destino (que precisa estar aberto, mesma empresa, não o mesmo; 409 `MERGE_INVALID`), o origem vira Fechado com "Mesclado em #N" |
| `POST /v1/helpdesk/tickets/:id/spam` · `DELETE .../spam` | — | marca/desmarca spam (e opcionalmente bloqueia o remetente) |
| `POST /v1/helpdesk/tickets/bulk` | — | `{ ids (até 100), patch }` (mesmas regras do PATCH, uma transação por chamado; devolve o que falhou e por quê) |
| `POST /v1/helpdesk/tickets/:id/presence` | — | `{ typing }` → `{ viewers: [{ userId, name, typing }] }` (memória com expiração de 30 s; a tela chama a cada 10 s) |
| `GET /v1/helpdesk/tickets/:id/messages/:mid/original` | — | `.eml` original (download) |
| `POST /v1/helpdesk/tickets/:id/messages/:mid/resend` | — | reenvia resposta com `deliveryStatus: FAILED` |

**Resposta da equipe** (service `addAgentMessage`, numa transação):
1. `PUBLIC` em chamado `CLOSED` → 409 `TICKET_CLOSED` (a tela oferece "Abrir chamado novo"); `NOTE` sempre pode.
2. Sanitiza; anexos do `uploads` (limite do plano); macro aplicada conta uso.
3. `PUBLIC`: `firstResponseAt` (se vazio) → meta de primeira resposta cumprida; `status = onAgentReply(status, body.status)` (padrão "Aguardando cliente"); entrando em `PENDING`, pausa a solução (`slaPause` → `slaPausedAt`, `slaRemainingMin`); `SOLVED` → `solvedAt`, job de fechamento (`autoCloseAt`) e pesquisa (se `csatEnabled` e `helpdesk_csat`).
4. `NOTE`: `mentions` (atendentes citados com `@`) → notificação; não conta como resposta nem muda o SLA.
5. Evento no histórico; gatilhos `updated` (`runRules`).
6. Depois do commit, na fila: e-mail para solicitante e CCs (`references/06-email-e-integracoes.md`), notificações, webhooks.

**Mudanças de status pela equipe**: saindo de `PENDING` retoma o prazo (`slaResume`); `SOLVED` → `OPEN` limpa `solvedAt`, `reopenedCount + 1`; mudar a prioridade recalcula os prazos a partir de `createdAt` (metas já cumpridas ficam cumpridas).

## Macros, gatilhos, visões, contatos

| Rota | Config | Faz |
|---|---|---|
| ★ `GET/POST /v1/helpdesk/macros` · `PATCH/DELETE /:id` | da empresa: owner/admin; pessoais: dono | `{ name, bodyHtml?, actions: [{ type, value }], shared }` (`TEMPLATE_VARS` no editor) |
| ★ `POST /v1/helpdesk/macros/:id/apply` | — | `{ ticketId }` → **`{ bodyHtml, patch: { status?, priority?, queueId?, assigneeId?, tags? } }`** (com `renderTemplate` e `applyActions`) (a tela aplica no rascunho; nada é gravado até enviar) |
| ★ `GET /v1/helpdesk/rules` · ★ `POST` · `PATCH/DELETE /:id` · `POST /reorder` | owner/admin, `feature: 'helpdesk_automation'` | `{ name, active, on, conditions, actions }` (`validateRule`) |
| `GET/POST /v1/helpdesk/views` · `PATCH/DELETE /:id` | da empresa: owner/admin | visões salvas `{ name, filters, sort, shared }` |
| `GET /v1/helpdesk/contacts` · `GET/PATCH /:id` | — | contatos com contadores; detalhe com chamados; `blocked` |

## Caixas de e-mail

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/helpdesk/inboxes` | owner/admin | caixas com `status`, `lastCheckedAt`, `lastError` (nunca a senha) |
| ★ `POST /v1/helpdesk/inboxes` | owner/admin, `limit: 'helpdeskInboxes'` | `{ name, address, queueId?, mode: 'IMAP'\|'WEBHOOK', imap?: { host, port, secure, user, password, folder? }, smtp?: { host, port, secure, user, password } }` → `{ id, ..., inboundUrl? }`; IMAP/SMTP testados antes de salvar (400 `INBOX_AUTH_FAILED` com a mensagem do servidor); `inboundUrl` (com a chave) **só aparece aqui e ao regenerar** |
| `PATCH /:id` · `DELETE /:id` · `POST /:id/test` · `POST /:id/regenerate-key` | owner/admin | — |
| `GET /v1/helpdesk/inbound-failures` · `POST /:id/retry` · `POST /:id/dismiss` | owner/admin | e-mails com problema |

## Base de conhecimento

| Rota | Config | Faz |
|---|---|---|
| `GET/POST /v1/helpdesk/kb/categories` · `PATCH/DELETE /:id` · `POST /reorder` | — | — |
| ★ `GET /v1/helpdesk/kb/articles` | — | `?q=&categoryId=&status=&internal=`; inclui `views`, `helpfulYes`, `helpfulNo` |
| ★ `POST /v1/helpdesk/kb/articles` | publicar exige `agentsCanPublish` (ou owner/admin) | `{ title, bodyHtml, bodyJson?, categoryId?, status?: 'DRAFT'\|'PUBLISHED', internal?, slug? }` → **`{ id, slug, status, publicUrl }`** |
| ★ `GET /v1/helpdesk/kb/articles/:id` · ★ `PATCH` · `DELETE` | idem | editar, publicar/despublicar, mover |
| `GET /v1/helpdesk/kb/suggest?q=` | — | artigos para inserir na resposta (internos incluídos, marcados) |

## Relatórios e integrações

- `GET /v1/helpdesk/reports/overview?from=&to=&queueId=&assigneeId=&channel=` → criados, resolvidos, fila acumulada por dia, primeira resposta e solução (mediana e 90%, em minutos de atendimento quando há SLA), % SLA cumprido, CSAT (`csatSummary`), por atendente, fila, canal, prioridade e etiqueta, mapa de calor dia × hora. SQL no servidor, fuso da empresa. `GET .../overview.csv` (`;` com BOM, `csvSafe`).
- `GET /v1/helpdesk/api-keys` · ★ `POST /v1/helpdesk/api-keys` `{ name }` → **`{ id, name, prefix, key }`** · `DELETE /:id` (owner/admin, `helpdesk_integrations`): a chave aparece uma vez.
- `GET/POST /v1/helpdesk/webhooks` · `PATCH/DELETE /:id` · entregas: iguais às do Forms.

## API pública (sem login, `public: true`, **sem checagem de Origin/CSRF**, rate limit por IP)

| Rota | Faz |
|---|---|
| ★ `GET /v1/public/helpdesk/:portal` | `{ title, theme, showBranding, categories: [{ slug, name, description, articleCount }], popular: [{ slug, title }], form: { fields } }` (`fields` = campos do portal, esquema do `forms-lib`) |
| ★ `GET /v1/public/helpdesk/:portal/articles?q=&category=` | **`{ data: [{ slug, title, excerpt, category }] }`** — só publicados e não internos; busca em português sem acento |
| ★ `GET /v1/public/helpdesk/:portal/articles/:slug` | `{ title, bodyHtml, updatedAt, category, related }`; rascunho, interno ou excluído → 404; conta visualização (uma por visitante/dia) |
| `POST /v1/public/helpdesk/:portal/articles/:slug/feedback` | `{ helpful: boolean }` |
| ★ `POST /v1/public/helpdesk/:portal/tickets` | `{ name, email, subject, description, fields?, attachments?, source?: 'PORTAL'\|'WIDGET', _gotcha?, _ts? }` + `Idempotency-Key` → **201 `{ number, ticketUrl }`**; regras abaixo |
| ★ `GET /v1/public/helpdesk/tickets/:token` | **`{ number, subject, status, statusLabel, createdAt, requester: { name }, messages: [{ id, authorKind: 'AGENT'\|'CUSTOMER', authorName, bodyHtml, attachments, createdAt }], canReply, canSolve, csat: { available, rating, comment } }`** — só mensagens públicas; atendente aparece pelo primeiro nome |
| ★ `POST /v1/public/helpdesk/tickets/:token/replies` | `{ body, attachments? }` → 201; chamado fechado → 201 `{ followUp: { number, ticketUrl } }` (chamado novo ligado) |
| ★ `POST /v1/public/helpdesk/tickets/:token/solve` | cliente diz que resolveu → `SOLVED` |
| ★ `POST /v1/public/helpdesk/tickets/:token/csat` | `{ rating: 'GOOD'\|'BAD', comment? }` → 200; só com o chamado Resolvido/Fechado, pesquisa ligada e `helpdesk_csat` (senão 409 `CSAT_NOT_AVAILABLE`); pode trocar a nota em até 7 dias |
| `POST /v1/public/helpdesk/:portal/my-tickets/link` | `{ email }` → sempre 202 (não revela se existe); manda o link mágico |
| `GET /v1/public/helpdesk/session/tickets` · `GET .../session/tickets/:number` · `POST .../:number/replies` | com o header `X-Helpdesk-Session` (token do link mágico): meus chamados |
| `GET /v1/public/helpdesk/attachments/:id?token=` | download de anexo de mensagem pública (com o token do chamado ou da sessão) |
| ★ `POST /v1/public/helpdesk/inbound/:key` | e-mail recebido no formato normalizado `{ from, to, cc?, subject, text?, html?, messageId, inReplyTo?, references?, headers?, attachments?: [{ filename, contentType, contentBase64, contentId? }] }` → **202 `{ ticketNumber, created }`** (ou 202 `{ ignored: 'loop'\|'spam'\|'own' }`); chave errada → 404; `references/06-email-e-integracoes.md` |
| `POST /v1/public/helpdesk/inbound/:key/:provider` | adaptadores `postmark`, `mailgun`, `sendgrid`, `cloudflare` → formato normalizado (confira o formato atual de cada provedor na doc) |
| ★ `POST /v1/public/helpdesk/api/tickets` | `Authorization: Bearer hd_...` (chave da API) → `{ subject, description, requester: { name?, email }, priority?, tags?, fields?, externalId? }` → **201 `{ id, number, ticketUrl }`**; chave inválida/revogada → 401 `API_KEY_INVALID`; 60/min por chave; `externalId` repetido devolve o mesmo chamado |

**Chamado aberto pelo cliente** (service `createCustomerTicket`, usado pelo portal, widget, API e e-mail):
1. Anti-spam: `_gotcha` preenchido ou `_ts` (quando a página abriu) com menos de 2 s → 201 falso (número e link que não abrem nada), nada gravado; sem `_ts` segue normal. Limites: 20 chamados/h por IP em cada portal, 100/h por IP no total, 10 por e-mail por dia em cada portal. A checagem de `_ts` só acontece **depois** da validação: quem clica em enviar com campos vazios logo ao abrir a página vê os erros, nunca um sucesso falso.
2. Validação → 400 `VALIDATION_ERROR` com `path` (`name`, `email`, `subject`, `description`, `fields.<id>`); assunto até 200, descrição até 20.000 caracteres, campos com `validateAnswers`.
3. Remetente bloqueado (contato `blocked` ou na `spamBlocklist`) → grava como spam (aparece na visão Spam), sem confirmação nem aviso; nunca descarta.
4. Contato pelo e-mail (cria ou atualiza o nome vazio); número (`Numeração` em `02-modelo.md`); fila padrão (ou a da caixa de e-mail); prazos de SLA (`slaDueDates`, se `helpdesk_sla`); gatilhos `created` (`runRules`); distribuição (`pickAgent`, se a fila for automática e `helpdesk_automation`); mensagem do cliente (`authorKind: CUSTOMER`); acesso com token para o solicitante.
5. Limite mensal atingido: grava com `overPlan = true` (nunca recusa).
6. Depois do commit, na fila: confirmação ao cliente (com número e link), aviso à fila/responsável, webhooks, CRM.
7. Resposta só com o necessário: número e link do próprio solicitante.

**Cliente respondeu** (link, sessão ou e-mail): `onCustomerReply` — volta para `OPEN` (retoma o prazo; reabre se estava Resolvido), ou, se Fechado, cria chamado novo com `followUpOfId` e o assunto "Re: …"; `lastCustomerReplyAt`; aviso ao responsável (ou à fila).

## Erros novos

| code | Status | Quando |
|---|---|---|
| `NOT_AN_AGENT` | 403 | membro que não é atendente nas rotas internas |
| `TICKET_CLOSED` | 409 | resposta pública ou mudança em chamado fechado |
| `INVALID_STATUS_TRANSITION` | 409 | status não permitido (`canSetStatus`) |
| `MERGE_INVALID` | 409 | mesclar consigo mesmo, com fechado ou em cadeia |
| `CSAT_NOT_AVAILABLE` | 409 | avaliação fora da hora ou sem a feature |
| `INBOX_AUTH_FAILED` | 400 | IMAP/SMTP recusou a conexão ou a senha |
| `API_KEY_INVALID` | 401 | chave da API errada ou revogada |
| `SLUG_TAKEN` | 409 | endereço do portal ou do artigo em uso |

## Testes obrigatórios (API)

- **Lib**: os testes do `helpdesk-lib` portados (horário comercial, horário de verão, feriados, SLA com pausa, estados, endereços, assunto, encadeamento, citação, resposta automática, distribuição, gatilhos, macros, números).
- Numeração: 20 chamados simultâneos na mesma empresa → números distintos e consecutivos; outra empresa começa do seu próprio 1.
- Portal sem Origin/cookie cria chamado; erros por campo; isca; limite mensal só marca `overPlan`.
- Resposta pública vai por e-mail (com `[#N]`, `Message-ID`, `In-Reply-To`), nota interna nunca (nem no link do cliente, nem nos webhooks).
- E-mail recebido: novo vira chamado; resposta pelo `In-Reply-To` e pelo `[#N]` de um participante entra no mesmo; `[#N]` de quem não participa vira chamado novo; resposta automática e devolução não geram confirmação; nosso próprio endereço não abre chamado; chave errada 404; falha de processamento vai para `HelpdeskInboundFailure`.
- Estados: cliente responde → Aberto (e reabre Resolvido); fechado → chamado novo ligado; equipe não fecha à mão.
- SLA: prazos por prioridade, primeira resposta cumprida pela resposta pública (nota não conta), pausa em Aguardando cliente e retomada, estouro registrado.
- Distribuição: rodízio entre atendentes disponíveis da fila; indisponível não recebe; limite de abertos.
- Gatilhos: condição sem acento → fila/prioridade/etiqueta; regra inativa não roda.
- CSAT: só depois de resolver; GET dos links do e-mail não grava.
- Base de conhecimento: rascunho e interno nunca no portal; busca sem acento.
- Isolamento (404), membro não atendente (403), visibilidade por fila.
