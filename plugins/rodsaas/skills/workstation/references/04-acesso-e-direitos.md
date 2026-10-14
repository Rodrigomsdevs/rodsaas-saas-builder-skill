# 04 · Acesso e direitos

## `getEntitlements` (substitui o da base quando `billing.model = "apps"`)

```
sub = Subscription da empresa
{ model, paymentIssue } = effectiveModel(sub)
model "legacy" → getEntitlements antigo da base (plano antigo, intacto)
states = appStates({ model, items, catalog, available })
plan   = entitlements({ model, states, featureMap, catalog, trialMaxUsers })   // { id, name, features, limits }
→ { plan, model, states, paymentIssue, trialEndsAt, cycle, … }   (mesmo formato que os guards e o /v1/me já usam)
```

Calculado uma vez por request quando a rota precisa (cache por request). Assim:

- `config: { feature: 'crm_capture' }` continua funcionando: a feature está no plano se o CRM está `active`/`trial`.
- `config: { limit: 'helpdesk_agents' }` continua funcionando: limite do app pago, do grátis, ou 0 se bloqueado.
- `config: { limit: 'members' }` (convites): 2 no grátis, 10 no teste, sem limite nos pagos.

## Guard de app (`plugins/app-guard.ts`)

Cada rota de app declara de qual app é: `config: { app: 'crm' }` — ou, para não tocar em cada rota, um mapa de prefixos registrado por cada preset (`registerAppRoutes('crm', ['/v1/crm'])`; Tarefas: `/v1/task-projects`, `/v1/tasks`, `/v1/timer`, `/v1/sprints`; Páginas: `/v1/pages`, `/v1/databases`, `/v1/trash`; Forms: `/v1/forms`; Agenda: `/v1/agenda`; Suporte: `/v1/helpdesk`). Rotas públicas dos apps (portal, formulário, agendamento) **não** passam pelo guard de app: o dono do conteúdo é a empresa, e o bloqueio é tratado pelo próprio app (formulário de app bloqueado mostra "indisponível no momento").

```
onRequest (rotas autenticadas com app):
  state = states[app]; access = AppAccess(org, app, user) existe
  canUseApp({ state, hasAccess: access }) →
    APP_ACCESS_DENIED → 403 em qualquer método
    APP_NOT_ACTIVE    → GET/HEAD passam (só leitura); POST/PUT/PATCH/DELETE → 403 { code: "APP_NOT_ACTIVE", appId }
```

- **Só leitura de verdade**: exportações (GET) funcionam; jobs do app bloqueado não disparam ações para fora (e-mails de lembrete, webhooks) — cada preset consulta `isAppActive(orgId, appId)` antes de enviar.
- Notificações de app bloqueado continuam chegando só como leitura? Não: `notify()` não cria aviso de app `locked` (como app desligado).

## Acesso por pessoa

- `AppAccess` é autorização (vale em todos os modelos) e, no modelo `apps`, também é o assento cobrado.
- Padrão ao ligar um app (`defaultAccess`): teste e Completo → todos os membros; por app → só quem ligou.
- Membro novo (convite aceito): no teste, no Completo e no plano antigo, ganha o `AppAccess` de todos os apps ligados; no por app, só dos apps escolhidos no convite. Os **papéis de dentro dos apps** (atendente, papel no Financeiro, no Pessoas, no Comercial…) nunca vêm sozinhos, em nenhum modelo: são escolhidos no convite. Tudo isso passa pelo convite com acessos da base (`skills/backend/references/10-acessos-por-pessoa.md`) e pela política abaixo.
- Owner e admin veem a loja e a tela de acesso de todos os apps mesmo sem acesso ao app.
- O trilho, a grade, o Ctrl+K e o Início mostram só os apps com acesso (os outros aparecem na loja com **Pedir acesso**, que cria o pedido da base, `POST /v1/access/requests`, e avisa quem pode aprovar com `org.access_requested`).

## Política de concessão (`registerGrantPolicy`)

A workstation registra a política que a base usa no convite (`POST /v1/invitations`, `…/check`), no aceite, no ajuste da pessoa (`PUT /v1/members/:id/access`) e na aprovação de pedidos. Para cada app escolhido:

| Situação | Owner | Admin |
|---|---|---|
| teste, Completo, plano antigo (sem custo por pessoa) | vale | vale |
| por app, **com assento livre** (`freeSeats({ purchased, used, reserved })`: comprados − em uso − reservados por convites pendentes) | vale | vale |
| por app, **sem assento livre** (ou app ainda não assinado) | vale com **confirmação do novo valor** (`needsConfirm`: 409 `CONFIRM_REQUIRED` `{ newMonthly, amountDueNow, apps }` sem `confirm`) | **vira pedido** (`NO_SEAT`): o convite segue, a pessoa entra sem aquele app, o pedido nasce sozinho no aceite e o owner aprova com o valor |
| app cobrado por empresa (Financeiro) ou valor que não ocupa assento (`countsSeat` falso: Comercial `VIEWER`, Pessoas sem ficha nova) | vale | vale |

- **Assento** = o contador do app: `AppAccess` nos apps por pessoa; `registerSeatCounter` nos outros (vendedores do Comercial, colaboradores do Pessoas). O registro do app diz se o valor escolhido ocupa assento (`countsSeat`).
- **Reserva**: o convite pendente com um app que ocupa assento reserva o assento até ser aceito, revogado ou vencer (a prévia mostra "2 assentos livres, 1 reservado por convite").
- **Cobrança no aceite**, nunca no convite: o owner confirma o valor ao convidar; a quantidade sobe quando a pessoa aceita (`syncSeats` na fila, idempotente). Convite que vence não cobra nada.
- **Pedido aprovado** pelo owner com o mesmo `CONFIRM_REQUIRED`; admin aprovando um pedido que muda o valor → 403 `OWNER_APPROVAL_REQUIRED` (aprova os que cabem nos assentos livres).

## `GET /v1/me` (acrescenta)

```json
"workstation": {
  "model": "trial",
  "trialEndsAt": "2026-10-28T12:00:00.000Z",
  "trialDaysLeft": 14,
  "paymentIssue": false,
  "onboardingCompleted": false,
  "apps": { "crm": { "state": "trial", "hasAccess": true }, "helpdesk": { "state": "trial", "hasAccess": false } }
}
```

`me.plan` continua existindo com o plano calculado (`entitlements`), para o front e os testes antigos.

## Testes obrigatórios

- Guard: sem acesso → 403 `APP_ACCESS_DENIED` em GET e POST; bloqueado → GET 200, POST 403 `APP_NOT_ACTIVE` com `appId`.
- Features e limites dos presets mudam com o estado do app (ex.: `crm_capture` some quando o CRM fica bloqueado).
- Convite no grátis com 2 pessoas → `PLAN_LIMIT_REACHED` (`members`).
- `me.workstation` reflete modelo, dias e estado por app.
