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
- Membro novo (convite aceito): no teste e no Completo, ganha acesso a todos os apps ligados; no por app, aos apps escolhidos no convite (o convite ganha o campo opcional `apps: []`, confirmado pelo owner com o valor) — sem escolha, nenhum.
- Owner e admin veem a loja e a tela de acesso de todos os apps mesmo sem acesso ao app.
- O trilho, a grade, o Ctrl+K e o Início mostram só os apps com acesso (os outros aparecem na loja com "Pedir acesso", que avisa os owners por notificação).

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
