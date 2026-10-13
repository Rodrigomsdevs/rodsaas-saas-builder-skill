# Billing (planos, assinatura e Stripe)

## Princípios

- **Planos ficam em código** (`config/plans.ts`): nome, limites, features **e preços**. A Stripe é sincronizada a partir dele por um comando (`npm run billing:sync`); ninguém copia `price_...` para o `.env`.
- **Funciona sem Stripe em desenvolvimento.** Sem chave configurada (e nunca em produção), a cobrança entra em **modo de teste**: assinar e trocar de plano aplicam na hora. Assim limites, features, telas e testes funcionam desde o primeiro minuto.
- **A assinatura é espelhada no banco.** Requests comuns nunca consultam a Stripe; o webhook (ou o modo de teste) atualiza o espelho.
- **Quem paga é a organização**, não o usuário. Um customer por organização.
- **Só o `OWNER` mexe em cobrança.** Admin vê o plano e o uso; membro vê o que o plano libera.
- **Toda situação tem saída na tela**: assinar, trocar, cancelar, retomar, gerenciar cobrança, e a mensagem certa quando a pessoa não pode ou a cobrança não está configurada.

## Modos de cobrança

| Modo | Quando | Comportamento |
|---|---|---|
| `stripe` | `STRIPE_SECRET_KEY` preenchida | Checkout, portal, troca de plano e cancelamento pela Stripe; plano muda quando o webhook confirma |
| `fake` | **sem** chave e `NODE_ENV !== 'production'` | assinar/trocar/cancelar/retomar aplicam na hora no banco; tela mostra o aviso "Modo de teste: nenhuma cobrança real" |
| `disabled` | sem chave **em produção** | planos visíveis, botões desabilitados com "Cobrança não configurada"; a API responde 503 `BILLING_NOT_CONFIGURED` |

Variável `BILLING_MODE=auto` (padrão) escolhe pela tabela. Valores explícitos permitidos: `stripe`, `fake`, `disabled`. **`fake` com `NODE_ENV=production` faz o boot falhar** com mensagem clara (validação no `env.ts`) — o modo de teste nunca pode ir para produção.

O modo vai para o front em `GET /v1/me` (`billing.mode`) e em `GET /v1/billing/subscription`.

## `config/plans.ts`

```ts
export const plans = {
  free: {
    name: 'Free',
    description: 'Para começar',
    prices: null,                                   // grátis
    limits: { members: 3, projects: 5 },
    features: [] as const,
  },
  pro: {
    name: 'Pro',
    description: 'Para equipes em crescimento',
    prices: { month: 9900, year: 99000 },          // centavos, BRL; "year" é opcional
    trialDays: 0,                                   // opcional: dias grátis no primeiro checkout
    limits: { members: 10, projects: 50 },
    features: ['api_access', 'audit_log'] as const,
    highlight: true,                                // destaque visual ("Mais escolhido")
  },
  business: {
    name: 'Business',
    description: 'Para operações maiores',
    prices: { month: 29900, year: 299000 },
    limits: { members: 50, projects: Number.POSITIVE_INFINITY },
    features: ['api_access', 'audit_log', 'priority_support'] as const,
  },
} as const

export const CURRENCY = 'brl'
export type PlanId = keyof typeof plans
export type BillingInterval = 'month' | 'year'
export type LimitKey = keyof (typeof plans)['free']['limits']
export type Feature = (typeof plans)[PlanId]['features'][number]
export const DEFAULT_PLAN: PlanId = 'free'
export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'business']   // para "upgrade" × "downgrade"
```

Valores acima são **placeholder**: use os planos que o usuário informou. `Infinity` não serializa em JSON: nas respostas vira `null` ("ilimitado").

**Mudar preço** = editar `prices` e rodar `npm run billing:sync`: a Stripe ganha um preço novo para novas assinaturas; quem já assina continua no preço antigo (é como a Stripe recomenda; migrar clientes antigos é uma decisão de negócio, feita à parte).

## Sincronização com a Stripe (`npm run billing:sync`)

Script `scripts/billing-sync.ts` (modelo pronto em `templates/billing-sync.ts` desta skill — copie e confira na doc atual do SDK da Stripe). Idempotente: pode rodar quantas vezes quiser, em teste e em produção (cada um com a sua chave).

Para cada plano pago:
1. **Produto**: acha pelo metadado `rodsaas_plan=<id>`; cria se não existir; atualiza nome e descrição.
2. **Preço por ciclo** (`month`, `year`): acha pelo **`lookup_key`** `rodsaas_<plano>_<ciclo>` (ex.: `rodsaas_pro_month`). Não existe, ou o valor/moeda mudou → cria um preço novo com o mesmo `lookup_key` e `transfer_lookup_key: true` (a chave passa para o novo) e desativa o antigo para novas vendas.
3. **Portal do cliente**: cria/atualiza uma configuração do Customer Portal (marcada com o metadado `rodsaas_managed=true`) permitindo trocar entre os preços dos planos, atualizar cartão, ver faturas e cancelar no fim do período.
4. `--webhook <url>` (produção): cria o endpoint de webhook na Stripe com os eventos necessários, se não existir, e **mostra o segredo uma única vez** para colocar em `STRIPE_WEBHOOK_SECRET`.
5. `--dry-run` mostra o que faria sem mudar nada.

No boot, em modo `stripe`, a API busca os preços pelos `lookup_key` (cache em memória por 10 min). Faltando algum, loga aviso claro ("rode npm run billing:sync") e as rotas de checkout respondem 503 `BILLING_NOT_CONFIGURED` em vez de erro genérico.

**Plano de uma assinatura** (no webhook): vem do metadado `rodsaas_plan` do **produto** do preço — funciona para preços antigos e novos. Ciclo: `recurring.interval` do preço.

## Models

```prisma
enum BillingProvider { STRIPE FAKE }

model Subscription {
  id                   String           @id @default(uuid(7)) @db.Uuid
  organizationId       String           @unique @db.Uuid
  provider             BillingProvider  @default(STRIPE)
  stripeCustomerId     String?          @unique
  stripeSubscriptionId String?          @unique
  plan                 String           @default("free")   // PlanId
  interval             String?                              // month | year
  status               String?                              // trialing, active, past_due, canceled, incomplete…
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean          @default(false)
  trialEndsAt          DateTime?
  pendingCheckoutAt    DateTime?                            // owner foi para o checkout e ainda não voltou confirmado
  updatedAt            DateTime         @updatedAt
  organization         Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

model StripeEvent {
  id          String   @id            // evt_...
  type        String
  processedAt DateTime @default(now())
}
```

Confira na doc atual da API da Stripe **onde fica o fim do período** (em versões recentes saiu da Subscription e foi para os itens da assinatura).

## Plano efetivo (`getEntitlements`)

```
FAKE: plano gravado; se cancelAtPeriodEnd e o período acabou → free (aplica na leitura)
STRIPE: status trialing | active → plano da assinatura
        status past_due         → mantém o plano e marca paymentIssue: true
        qualquer outro          → free
sem assinatura                  → free
```

`getEntitlements(orgId)` → `{ plan, interval, limits, features, status, paymentIssue, cancelAtPeriodEnd, currentPeriodEnd }`. Uma vez por request quando a rota precisar.

## Rotas

| Rota | Quem | Faz |
|---|---|---|
| `GET /v1/billing/plans` | público | planos na ordem de `PLAN_ORDER`: `{ id, name, description, prices: { month, year } \| null, currency, trialDays, limits, features, highlight }` |
| `GET /v1/billing/subscription` | owner, admin | `{ mode, plan, interval, status, paymentIssue, cancelAtPeriodEnd, currentPeriodEnd, trialEndsAt, usage, limits, canManage, hasStripeCustomer, pending }` |
| `POST /v1/billing/checkout-sessions` | owner · idempotente | `{ plan, interval }` para quem **não tem assinatura paga** → `{ url }` (modo stripe: Checkout; modo fake: aplica e devolve a URL de sucesso) |
| `GET /v1/billing/change-plan/preview?plan=&interval=` | owner | prévia da troca: `{ amountDue, currency, nextBillingAt, prorated: true }` (fake: valores calculados localmente) |
| `POST /v1/billing/change-plan` | owner · idempotente | `{ plan, interval }` para quem **já assina** um plano pago: troca imediata com cobrança/crédito proporcional |
| `POST /v1/billing/cancel` | owner | cancela no **fim do período** (vira free quando acabar) |
| `POST /v1/billing/resume` | owner | desfaz o cancelamento agendado |
| `POST /v1/billing/portal-sessions` | owner | `{ url }` do Customer Portal (só modo stripe e com customer) |
| `POST /v1/billing/webhook` | público (assinatura da Stripe) | processa eventos |
| `POST /v1/billing/fake/simulate` | owner · **só modo fake** | `{ event: 'payment_failed' \| 'payment_recovered' \| 'period_end' }` para testar banners e expiração sem Stripe |

Erros novos: `BILLING_NOT_CONFIGURED` (503), `ALREADY_SUBSCRIBED` (409, use change-plan), `NOT_SUBSCRIBED` (409, use checkout), `SAME_PLAN` (400), `PLAN_NOT_PURCHASABLE` (400, ex.: free no checkout), `DOWNGRADE_OVER_LIMIT` (409, ver abaixo).

### Checkout (assinar, saindo do Free)

1. Plano pago e com preço para o ciclo; senão `PLAN_NOT_PURCHASABLE`. Já tem assinatura paga ativa → `ALREADY_SUBSCRIBED`.
2. **Modo fake**: grava `provider: FAKE`, `plan`, `interval`, `status: active`, `currentPeriodEnd = agora + 1 mês/ano`, audit `billing.plan_changed`; devolve `{ url: APP_URL/configuracoes/plano?status=success }`.
3. **Modo stripe**: garante o customer da organização (`metadata.organizationId`), cria a sessão `mode: 'subscription'` com o preço do `lookup_key`, `client_reference_id: orgId`, `subscription_data.metadata.organizationId`, `trial_period_days` se `trialDays > 0` (só na primeira assinatura da organização), `allow_promotion_codes: true`, `success_url: APP_URL/configuracoes/plano?status=success&session_id={CHECKOUT_SESSION_ID}`, `cancel_url: APP_URL/configuracoes/plano?status=canceled`; grava `pendingCheckoutAt`.

### Trocar de plano (quem já assina)

- Destino pago: **modo stripe** atualiza o item da assinatura para o novo preço com `proration_behavior: 'create_prorations'` (upgrade cobra a diferença proporcional; downgrade gera crédito na próxima fatura). A prévia usa a pré-visualização de fatura da Stripe com os mesmos parâmetros (confira o nome atual do método no SDK). **Modo fake** aplica na hora.
- Destino **free** = cancelar no fim do período (`/cancel`), não troca imediata.
- **Downgrade acima do limite** (ex.: 8 membros indo para um plano de 3): a troca é **permitida**, mas a resposta da prévia traz `overLimits: [{ limit: 'members', usage: 8, max: 3 }]` para o front avisar. Depois da troca, nada é apagado: só fica bloqueado criar mais até ficar dentro do limite. (Se o produto preferir bloquear, responda `DOWNGRADE_OVER_LIMIT`; registre a escolha no README.)

### Cancelar e retomar

Stripe: `cancel_at_period_end: true/false` na assinatura. Fake: mesmo campo no banco. Cancelado continua com o plano até `currentPeriodEnd`.

### Portal

Sessão do Customer Portal com a configuração gerenciada pelo sync e `return_url: APP_URL/configuracoes/plano`. É para cartão, faturas e dados de cobrança; trocar de plano e cancelar também ficam **dentro do app** (não dependem do portal).

## Webhook

### Body cru

A verificação de assinatura precisa do body exatamente como chegou. Rota num escopo encapsulado com parser próprio:

```ts
app.register(async (scope) => {
  scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
  scope.post('/v1/billing/webhook', {
    config: { public: true, csrf: false, rateLimit: false },
    schema: { hide: true },
  }, webhookHandler)
})
```

(Confirme na doc do Fastify da versão instalada que o override do parser no escopo encapsulado continua funcionando assim.)

### Processamento

```
1. stripe.webhooks.constructEvent(rawBody, header 'stripe-signature', STRIPE_WEBHOOK_SECRET) → falhou: 400
2. StripeEvent(id) já existe → 200
3. trata o evento + grava StripeEvent  (mesma transação)
4. 200
```

Não confie na ordem de chegada: para eventos de assinatura, busque a assinatura atual (`subscriptions.retrieve` com o preço e o produto expandidos) e faça upsert.

| Evento | Ação |
|---|---|
| `checkout.session.completed` | liga customer/assinatura à organização (`client_reference_id`), sincroniza, limpa `pendingCheckoutAt` |
| `customer.subscription.created` / `updated` / `deleted` | sincroniza; plano pelo metadado `rodsaas_plan` do produto |
| `invoice.paid` | sincroniza |
| `invoice.payment_failed` | sincroniza e enfileira e-mail para os owners |

Produto sem `rodsaas_plan` → loga erro e mantém o plano anterior (nunca 500, senão a Stripe reenvia sem parar). Toda mudança de plano/status grava `billing.plan_changed` no `AuditLog`.

**Saúde do webhook**: `GET /v1/billing/subscription` devolve `pending: true` se há `pendingCheckoutAt` há mais de 2 min sem confirmação — o front mostra "Pagamento recebido pela Stripe, mas a confirmação ainda não chegou" e, em dev, a dica do `stripe listen`.

## Guards (`plugins/plan-guard.ts`)

```ts
config: { feature: 'api_access' }   // 403 FEATURE_NOT_IN_PLAN se o plano não tem
config: { limit: 'projects' }       // 403 PLAN_LIMIT_REACHED se uso atual >= limite
```

Contadores de uso em `lib/usage.ts`:

```ts
export const usageCounters: Record<LimitKey, (tx: Tx, orgId: string) => Promise<number>> = {
  members: async (tx, orgId) =>
    (await tx.membership.count({ where: { organizationId: orgId } })) +
    (await tx.invitation.count({ where: { organizationId: orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })),
  projects: (tx, orgId) => tx.project.count({ where: { organizationId: orgId } }),
}
```

Convites pendentes contam no limite de membros. A pequena janela de corrida da checagem é aceitável; não complique.

## Plano escolhido no cadastro

O front pode mandar a pessoa de uma página de preços para `/cadastro?plano=pro&ciclo=month`. O cadastro em si não muda (sempre nasce no Free); logo depois, o front chama `checkout-sessions` com o plano escolhido. Em modo fake o plano já vem aplicado; em stripe, a pessoa vai direto para o pagamento.

## Dev local

- Sem chave: modo **fake** automático. Tudo funciona, com o aviso de modo de teste na tela.
- Com Stripe de teste: `STRIPE_SECRET_KEY=sk_test_...` → `npm run billing:sync` → `stripe listen --forward-to localhost:<porta da API>/v1/billing/webhook` (o Stripe CLI mostra o `whsec_...` para `STRIPE_WEBHOOK_SECRET`) → cartão de teste `4242 4242 4242 4242`.
- Testes automatizados não chamam a Stripe: rodam em modo fake, e o cliente Stripe fica atrás de uma interface pequena (`lib/stripe.ts`) para os testes do webhook (assinatura gerada com o helper de teste do SDK).
