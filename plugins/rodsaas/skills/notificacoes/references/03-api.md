# 03 · Serviço e API

Padrão da base em tudo: REST, erros RFC 9457, cursor, schemas de resposta, OpenAPI → tipos do front. ★ = formato que o `/rodsaas:verify` confere (o mínimo, não o escopo).

## `notify()` — o único jeito de avisar alguém

```ts
// api/src/modules/notifications/service.ts
notify(tx: Tx, ev: {
  type: string;                                   // do catálogo (04-catalogo.md)
  actorId: string | null;                         // quem fez (null = sistema/job)
  recipients: string[];                           // candidatos (responsável, seguidores, mencionados, owners/admins…)
  canSee?: Set<string> | ((userId: string) => boolean | Promise<boolean>);   // acesso ao registro
  entity: { type: string; id: string };
  data: Record<string, unknown>;                  // title (obrigatório se a frase usa {title}), snippet, de/para…
  url: string;                                    // caminho relativo no painel
  groupKey?: string;                              // tipos com group.by = "key" (ex.: projectId)
  groupUrl?: string;                              // link quando a notificação passa a falar de vários registros
}): Promise<{ created: number; merged: number; skipped: { userId: string; reason: string }[] }>
```

Passos, nesta ordem, **dentro da transação de quem chamou** (o aviso nasce e morre com a mudança):

1. Tipo do catálogo; tipo desconhecido **lança erro** (é bug de programação; teste cobre). `url` relativa (`/` seguido de não-`/`); `data.snippet` passa pelo `snippet()`.
2. App do tipo desligado na empresa (`disabledApps`) → não cria nada.
3. Membros ativos entre os candidatos (uma consulta) e `resolveRecipients({ candidates, actorId, activeMemberIds, canSee })`: tira repetidos, **o ator**, quem não é membro e quem não vê. Os pulados vão para o log em nível debug (nunca para a resposta HTTP).
4. Preferências dos que sobraram (uma consulta) → `channelsFor(def, prefs)`. `inApp` falso **e** e-mail `OFF` → pula (motivo `muted`).
5. Para cada destinatário: com `groupKeyFor` ≠ null, trava + busca a aberta + `canGroup` → `mergeInto` (UPDATE); senão `newNotification` (INSERT). Ver "Agrupamento sem duplicar" no `02-modelo.md`.
6. Depois do commit (`afterCommit` da transação): para cada notificação com `emailMode = IMMEDIATE`, enfileira `notifications.email` com `startAfter = emailDueAt − agora` e `singletonKey = id` (`05-email-e-jobs.md`). Falha ao enfileirar não desfaz nada (o `notifications.sweep` recolhe).

`notify()` **nunca** é chamado com `await` fora da transação para "não atrasar a resposta": ele faz 2–3 consultas leves; o que é lento (e-mail) já vai para a fila.

## `retract()` e afins

| Função | Quando |
|---|---|
| `retract(tx, { entityType, entityId, userIds?, types? })` | registro apagado (tarefa, negócio, chamado), pessoa perdeu acesso (saiu do projeto privado, negócio passou para outro no modo "só os meus"), menção removida antes de alguém ler. Apaga as notificações que batem (lidas ou não) |
| `retractUser(tx, userId)` | membro removido da empresa: apaga as dele naquela empresa e a preferência |
| `registerNotificationTypes(appId, defs)` | no boot de cada módulo de app (`04-catalogo.md`) |

## Rotas da caixa de entrada (usuário logado)

Toda rota filtra **`organizationId` (RLS) e `userId = auth.userId`**. Notificação de outra pessoa ou de outra empresa = **404**. Notificações de app desligado ficam fora da lista, do contador e das ações em massa. Só `inApp = true` aparece.

| Rota | Faz |
|---|---|
| ★ `GET /v1/notifications?status=unread\|all&app=&type=&cursor=&limit=` | lista, mais recente primeiro (`updatedAt desc, id desc`), `limit` 20 (máx. 50). Aceita também `unread=true` (formato antigo do tarefas) |
| ★ `GET /v1/notifications/unread-count` | `{ count, byApp }` — o sino consulta ao focar a janela, a cada 60 s e depois de cada ação |
| ★ `POST /v1/notifications/:id/read` | marca como lida → `{ id, readAt }` (idempotente: já lida mantém a data) |
| ★ `POST /v1/notifications/:id/unread` | volta a não lida → `{ id, readAt: null }` |
| ★ `POST /v1/notifications/read-all` | `{ app?, type?, before? }` → `{ updated }`. `before` (ISO): só as com `updatedAt ≤ before`, para não marcar o que chegou depois de a pessoa abrir a lista |
| `DELETE /v1/notifications/:id` | remove da caixa (204) |
| ★ `GET /v1/notification-types` | catálogo visível para a pessoa: `{ data: [{ type, appId, appLabel, label, description, critical }] }` (apps ligados, app com papel para ela e `roles` do tipo) |
| ★ `GET /v1/notification-preferences` · ★ `PUT /v1/notification-preferences` | preferências (abaixo) |

### ★ Formato de uma notificação

```json
{
  "id": "0192…",
  "type": "task.commented",
  "appId": "tarefas",
  "text": "Ana e Bia comentaram 3 vezes em MKT-12 · Revisar contrato",
  "segments": [{ "text": "Ana e Bia", "bold": true }, { "text": " comentaram 3 vezes em ", "bold": false }, { "text": "MKT-12 · Revisar contrato", "bold": true }],
  "actor": { "id": "…", "name": "Ana Souza", "avatarUrl": null },
  "actorsCount": 2,
  "count": 3,
  "entity": { "type": "task", "id": "…" },
  "url": "/tarefas/t/MKT-12",
  "snippet": "Combinado, mando hoje.",
  "read": false,
  "readAt": null,
  "createdAt": "2026-10-13T12:00:00.000Z",
  "updatedAt": "2026-10-13T12:03:00.000Z"
}
```

- `text` e `segments` vêm do `renderSegments()` com os nomes **atuais** dos atores (uma consulta de nomes por página, nunca por item) e o nome da empresa.
- Lista: `{ data: Notification[], meta: { nextCursor, hasMore } }` (`encodeCursor`/`decodeCursor`; cursor estragado → 400 `VALIDATION_ERROR`).
- `unread-count`: `{ "count": 4, "byApp": { "tarefas": 3, "geral": 1 } }` (o `byApp` alimenta o contador de cada app no trilho, quando o app não tem contador próprio).

### Preferências

★ `GET /v1/notification-preferences` devolve o `prefsView(prefs, catálogo, { role })` — só os tipos que o papel da pessoa pode receber (`roles` do tipo: membro não vê "Pagamento recusado"):

```json
{
  "emailMode": "IMMEDIATE",
  "digestHour": 8,
  "disabledTypes": ["task.status"],
  "groups": [
    { "appId": "geral", "label": "Geral", "types": [
      { "type": "org.member_joined", "label": "Alguém entrou na empresa", "description": "…", "critical": false, "inApp": true, "email": "DEFAULT", "effectiveEmail": "DAILY" },
      { "type": "billing.payment_failed", "label": "Pagamento recusado", "description": "…", "critical": true, "inApp": true, "email": "IMMEDIATE", "effectiveEmail": "IMMEDIATE" }
    ] },
    { "appId": "tarefas", "label": "Tarefas", "types": [ … ] }
  ]
}
```

★ `PUT /v1/notification-preferences` aceita qualquer parte de `{ emailMode, digestHour, types: { "<tipo>": { inApp?, email? } } }` (o que não vier fica como está) e o formato antigo `{ emailMode, disabledTypes }`; valida com `normalizePrefs()` e devolve o mesmo formato do GET. Erros → 400 `VALIDATION_ERROR` com `errors[{ path, message }]` (tipo desconhecido, valor inválido, **tipo obrigatório** não pode ser desligado). Só `billing.payment_failed` é obrigatório (e só owners o veem).

## Descadastro (público, sem login)

Token assinado (`signUnsubscribe`/`verifyUnsubscribe`, segredo `NOTIFICATIONS_UNSUBSCRIBE_SECRET`, validade 180 dias), um por e-mail: o tipo daquele aviso, ou `"*"` no resumo diário e no rodapé "parar de receber todos".

| Rota | Faz |
|---|---|
| ★ `GET /v1/public/notifications/unsubscribe?token=` | `{ scope: "type" \| "all", type, typeLabel, organizationName, emailMasked }` para a página mostrar o que vai acontecer |
| ★ `POST /v1/public/notifications/unsubscribe?token=` | aplica (`applyUnsubscribe`): e-mail daquele tipo `OFF` (ou `emailMode: OFF` para `"*"`). Aceita corpo vazio, JSON `{}` ou `application/x-www-form-urlencoded` com `List-Unsubscribe=One-Click` (o POST que Gmail/Yahoo fazem sozinhos). Idempotente → `{ ok: true, scope, type }` |
| `POST /v1/public/notifications/unsubscribe/undo?token=` | volta ao valor anterior (`prev` do token) |

- Token inválido, adulterado ou vencido → 400 `INVALID_UNSUBSCRIBE_TOKEN` (a página mostra "Link inválido ou vencido" com o link para as preferências, que pede login).
- Essas rotas **dispensam a checagem de Origin** da base (provedores de e-mail fazem o POST sem Origin); são seguras porque só desligam e-mail da pessoa do token. Rate limit da base para rotas públicas.
- Usuário removido da empresa do token → 200 sem efeito (não revela nada).
- O sino **não muda** no descadastro (só o e-mail).

## Avisos da própria base

| Evento (onde) | Quem recebe | Tipo | url |
|---|---|---|---|
| convite aceito (cadastro com convite ou `POST /v1/invitations/accept`) | owners e admins | `org.member_joined` (agrupa por empresa, janela 60 min) | `/configuracoes/membros` |
| papel alterado (`PATCH /v1/members/:id`) | o membro alterado | `org.role_changed` (`data.roleLabel`: "Owner", "Admin", "Membro") | `/configuracoes/membros` |
| cobrança falhou (webhook Stripe `invoice.payment_failed`) | owners | `billing.payment_failed` (obrigatório) | `/configuracoes/plano` |
| teste acabando (webhook `customer.subscription.trial_will_end`) | owners | `billing.trial_ending` | `/configuracoes/plano` |
| armazenamento em 80% e 100% (add-on `uploads`, uma vez por faixa por mês) | owners e admins | `files.quota_warning` | `/configuracoes/plano` |

O ator nunca recebe: quem aceita o convite não é avisado da própria entrada; quem muda o papel não é avisado. Os owners/admins que entram depois **não** recebem avisos antigos.

## Erros novos

| code | Status | Quando |
|---|---|---|
| `INVALID_UNSUBSCRIBE_TOKEN` | 400 | token de descadastro inválido, adulterado ou vencido |

## Testes obrigatórios (API)

- `notify()`: ator nunca recebe; não membro e quem não vê (`canSee`) não recebem; candidatos repetidos viram um; tipo desconhecido lança; `url` absoluta é recusada; app desligado não cria.
- Preferências: `inApp: false` com e-mail ligado cria só para e-mail (fora da lista e do contador); tudo desligado não cria; `emailMode` geral e por tipo respeitados; tipo obrigatório ignora preferência.
- Agrupamento: mesmo tipo e registro em 2 min → 1 notificação com `count` e `actorIds`; depois de lida, nova notificação; depois do e-mail enviado, nova notificação; janela vencida, nova; **5 `notify()` simultâneos → 1 com `count = 5`**.
- Lista: ordem por `updatedAt` (a agrupada sobe), filtros `status`, `app`, `type`, `unread=true`, cursor sem repetir nem pular, `limit` máximo.
- Contador: só não lidas `inApp` de apps ligados; `byApp` certo.
- Ler, não lida, todas (com `app`, `type`, `before`), remover; tudo de outra pessoa ou outra empresa = 404 e não altera nada.
- Preferências: formato novo, antigo, validação, obrigatório recusado, por empresa (a mesma pessoa em duas empresas).
- Descadastro: GET mostra o tipo; POST JSON e POST form `List-Unsubscribe=One-Click` sem Origin funcionam e são idempotentes; desfazer; token adulterado/vencido → 400; não mexe no sino.
- Base: convite aceito avisa owners/admins e não o novo membro; dois aceites em sequência → 1 notificação "Ana e Bia entraram na Acme"; papel alterado avisa o membro e não quem alterou.
- `retract()` apaga; membro removido some com as dele.
- Migração do formato antigo (`02-modelo.md`).
