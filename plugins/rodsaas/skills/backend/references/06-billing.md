# Billing com Stripe

## Princípios

- **Planos ficam em código** (`config/plans.ts`), versionados no git. A Stripe só sabe dos preços.
- **A assinatura é espelhada no banco** via webhook. Requests comuns nunca consultam a Stripe.
- **Quem paga é a organização**, não o usuário. Um Stripe Customer por organização.
- Só o `OWNER` mexe em billing.

## `config/plans.ts`

```ts
import { env } from './env'

export const plans = {
  free: {
    name: 'Free',
    stripePriceId: null,
    limits: { members: 3, projects: 5 },
    features: [] as const,
  },
  pro: {
    name: 'Pro',
    stripePriceId: env.STRIPE_PRICE_PRO,
    limits: { members: 10, projects: 50 },
    features: ['api_access', 'audit_log'] as const,
  },
  business: {
    name: 'Business',
    stripePriceId: env.STRIPE_PRICE_BUSINESS,
    limits: { members: 50, projects: Number.POSITIVE_INFINITY },
    features: ['api_access', 'audit_log', 'priority_support'] as const,
  },
} as const

export type PlanId = keyof typeof plans
export type LimitKey = keyof (typeof plans)['free']['limits']
export type Feature = (typeof plans)[PlanId]['features'][number]
export const DEFAULT_PLAN: PlanId = 'free'
```

Os valores acima são **placeholder**; use os planos que o usuário informou. Mudar limite = mudar este arquivo e fazer deploy.

`Infinity` não serializa em JSON: na rota que expõe planos/limites, converta para `null` ("ilimitado").

## Models

```prisma
model Subscription {
  id                   String    @id @default(uuid(7)) @db.Uuid
  organizationId       String    @unique @db.Uuid
  stripeCustomerId     String    @unique
  stripeSubscriptionId String?   @unique
  plan                 String    @default("free")   // PlanId
  status               String?                       // espelho do status da Stripe
  stripePriceId        String?
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean   @default(false)
  trialEndsAt          DateTime?
  updatedAt            DateTime  @updatedAt
  organization         Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

model StripeEvent {
  id          String   @id            // id do evento na Stripe (evt_...)
  type        String
  processedAt DateTime @default(now())
}
```

Confira na doc atual da API da Stripe **onde fica o fim do período** (em versões recentes ele saiu da Subscription e foi para os itens da assinatura).

## Plano efetivo (`getEntitlements`)

```
status trialing | active  → plano da assinatura
status past_due           → mantém o plano (a Stripe ainda está tentando cobrar) e marca `paymentIssue: true`
qualquer outro ou sem assinatura → free
```

`getEntitlements(orgId)` devolve `{ plan, limits, features, status, paymentIssue }`. Carregue uma vez por request quando a rota precisar (decorando `request`) e reutilize.

## Rotas

| Rota | Quem | Faz |
|---|---|---|
| `GET /v1/billing/plans` | público | planos, limites e features (para a página de preços) |
| `GET /v1/billing/subscription` | owner, admin | plano efetivo, status, fim do período, uso atual vs. limites |
| `POST /v1/billing/checkout-sessions` | owner · idempotente | `{ plan }` → `{ url }` do Stripe Checkout |
| `POST /v1/billing/portal-sessions` | owner | `{ url }` do Customer Portal |
| `POST /v1/billing/webhook` | público (assinatura da Stripe) | processa eventos |

### Checkout

1. Rejeite o plano `free` ou sem `stripePriceId` (400).
2. Se a organização já tem assinatura ativa, devolva 409 com `detail` orientando usar o portal (troca de plano é feita lá, com proration da Stripe).
3. Garanta o Stripe Customer da organização (crie na primeira vez, com `metadata.organizationId`, e salve em `Subscription.stripeCustomerId`).
4. Crie a sessão: `mode: 'subscription'`, `customer`, `line_items: [{ price, quantity: 1 }]`, `client_reference_id: orgId`, `subscription_data.metadata.organizationId: orgId`, `success_url: APP_URL/billing?status=success`, `cancel_url: APP_URL/billing`.

### Portal

Cria a sessão do Customer Portal para o customer da organização com `return_url: APP_URL/billing`. A configuração do portal (o que o cliente pode trocar/cancelar) é feita no painel da Stripe; documente isso no README.

## Webhook

### Body cru

A verificação de assinatura precisa do body **exatamente como chegou**. Registre a rota num escopo encapsulado com parser próprio, sem afetar o resto da API:

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
1. stripe.webhooks.constructEvent(rawBody, header 'stripe-signature', STRIPE_WEBHOOK_SECRET)
   → falhou: 400
2. se StripeEvent(id) já existe → 200 (já processado)
3. trata o evento
4. grava StripeEvent(id, type)    ← passos 3 e 4 na mesma transação de banco
5. 200
```

Para eventos de assinatura, **não confie na ordem de chegada** (a Stripe não garante). Em vez de aplicar o payload do evento, busque a assinatura atual (`stripe.subscriptions.retrieve`) e faça upsert. Aqui chamar a Stripe é ok: é o webhook, não uma request de usuário.

| Evento | Ação |
|---|---|
| `checkout.session.completed` | liga `stripeSubscriptionId` à organização (via `client_reference_id`) e sincroniza |
| `customer.subscription.created` / `updated` / `deleted` | sincroniza (retrieve + upsert); mapeia `stripePriceId` → `PlanId` pelo `plans.ts` |
| `invoice.paid` | sincroniza |
| `invoice.payment_failed` | sincroniza e enfileira e-mail para os owners |

Price ID desconhecido (não está no `plans.ts`) → loga erro e mantém o plano anterior; nunca derrube o webhook com 500 por isso, senão a Stripe fica reenviando.

Toda mudança de plano/status gera um registro no `AuditLog` (`billing.plan_changed`).

## Guards (`plugins/plan-guard.ts`)

Declarados na rota:

```ts
config: { feature: 'api_access' }   // 403 FEATURE_NOT_IN_PLAN se o plano não tem
config: { limit: 'projects' }       // 403 PLAN_LIMIT_REACHED se uso atual >= limite
```

O guard de limite precisa saber contar o uso. Cada módulo registra seu contador em `lib/usage.ts`:

```ts
export const usageCounters: Record<LimitKey, (tx: Tx, orgId: string) => Promise<number>> = {
  members: async (tx, orgId) =>
    (await tx.membership.count({ where: { organizationId: orgId } })) +
    (await tx.invitation.count({ where: { organizationId: orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })),
  projects: (tx, orgId) => tx.project.count({ where: { organizationId: orgId } }),
}
```

Convites pendentes contam no limite de membros, senão dá para convidar 100 pessoas num plano de 3.

A checagem no preHandler tem uma pequena janela de corrida (duas criações simultâneas). Para limites de plano isso é aceitável; não complique.

## Dev local

- Stripe em modo teste; chaves `sk_test_...`.
- `stripe listen --forward-to localhost:3333/v1/billing/webhook` (Stripe CLI) fornece o `STRIPE_WEBHOOK_SECRET` de dev.
- Testes automatizados não chamam a Stripe: o cliente fica atrás de uma interface pequena (`lib/stripe.ts`) que os testes substituem; o webhook é testado gerando a assinatura com o helper de teste do SDK.
