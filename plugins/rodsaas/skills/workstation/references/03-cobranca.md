# 03 · Cobrança por app

## Dados

```prisma
model Subscription {                       // o da base, com campos novos
  // … campos da base (provider, stripeCustomerId, stripeSubscriptionId, interval, status, currentPeriodEnd, cancelAtPeriodEnd…)
  model            String   @default("trial")   // trial | free | apps | completo | legacy
  trialEndsAt      DateTime?
  currentPeriodStart DateTime?
}

model SubscriptionItem {
  id                 String   @id @default(uuid(7)) @db.Uuid
  organizationId     String   @db.Uuid
  key                String                       // "app:crm" | "suite:rh" | "completo"
  quantity           Int                          // assentos, colaboradores ou 1
  tier               Int?                         // faixa (Forms)
  stripeItemId       String?  @unique
  unitPrice          Int                          // centavos no momento da contratação (mostra o preço que vale para a empresa)
  cancelAtPeriodEnd  Boolean  @default(false)     // app saindo no fim do período
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@unique([organizationId, key])
}

model AppAccess {
  organizationId String   @db.Uuid
  appId          String
  userId         String   @db.Uuid
  grantedById    String?  @db.Uuid
  createdAt      DateTime @default(now())
  @@id([organizationId, appId, userId])
  @@index([organizationId, userId])
}
```

RLS `FORCE` nas três; `rodsaas_assert_same_org` no `AppAccess` (usuário precisa ser membro da empresa).

## Stripe

**Sync** (`npm run billing:sync`, estendido): para cada item vendável do catálogo — cada app pago (`app:<id>`), cada faixa (`app:forms` t0/t1), cada suíte (`suite:rh`) e o `completo` — produto com metadado `rodsaas_ws=<key>` e preços mensal e anual com `lookup_key` de `lookupKey()` (anual = mensal × `annualMonthsCharged`).
- Por pessoa/colaborador: preço `per_unit` com quantidade.
- **Suíte RH com mínimo**: preço por **volume** com duas faixas — até `ceil(mínimo/preço) − 1` unidades com `flat_amount = mínimo` e `unit_amount = 0`; acima disso `unit_amount = preço` (confira na doc atual da Stripe o formato de `tiers` com `tiers_mode: volume`).
- Completo: `per_unit` por usuário; o mínimo de 3 é garantido pela quantidade enviada.
- Por uso (WhatsApp, Cobranças…): fora daqui (cada add-on cobra o seu).

**Uma assinatura por empresa com vários itens** (todos no mesmo ciclo). Checkout com `line_items` de `desiredItems()` (sem `trial_period_days`: o teste já aconteceu no app, sem cartão).

**Mudar** (ligar app, quantidade, faixa, Completo ↔ por app): `diffItems(atuais, desejados)` → uma chamada de atualização da assinatura com os itens adicionados, alterados (`quantity`/preço) e removidos, `proration_behavior: "create_prorations"` (remover app no fim do período: `cancelAtPeriodEnd` no item local e remoção pelo job de virada de período, ou agendamento da Stripe — escolha o que a doc atual recomendar e registre). **Prévia** com a pré-visualização de fatura da Stripe com os mesmos parâmetros.

**Webhooks** (os da base, mais): `customer.subscription.created/updated/deleted` → sincroniza modelo (`completo` se tiver o item completo, senão `apps`), status, período e **os itens** (por `rodsaas_ws` do produto de cada item); `invoice.payment_failed` → `paymentIssue` + notificação `billing.payment_failed`; assinatura cancelada → `model: free`. Idempotente (`StripeEvent`).

**Modo de teste (fake)**: mesmas rotas, aplicando na hora no banco, com o proporcional calculado por `prorate()` e o período de 1 mês/ano a partir da assinatura.

## Rotas

Só o **owner** muda valores. O admin vê a assinatura e gerencia o acesso das pessoas quando isso não muda o valor (teste e Completo); no modelo `apps`, dar acesso aumenta a quantidade, então só o owner confirma.

| Rota | Faz |
|---|---|
| ★ `GET /v1/workstation/catalog` | público: apps com `status` (disponível/em breve), preço e unidade, categorias, regras do grátis, teste, Completo e anual (do `config/workstation.ts`) |
| ★ `GET /v1/workstation/subscription` | `{ model, status, paymentIssue, trialEndsAt, trialDaysLeft, cycle, items: [{ key, appId, quantity, tier, unitPrice, total, cancelAtPeriodEnd }], monthly, currentPeriodEnd, cancelAtPeriodEnd, mode, canManage, intent }` |
| ★ `POST /v1/workstation/quote` | `{ apps, users, employees, cycle }` → o mesmo `quote()` do catálogo (para a tela não divergir do servidor) |
| ★ `POST /v1/workstation/preview` | `{ model: "apps" \| "completo", apps, users?, employees?, cycle }` → `{ currentMonthly, newMonthly, amountDueNow, nextBillingAt, changes: { add, update, remove }, overLimits }` |
| ★ `POST /v1/workstation/checkout` | owner · idempotente · `{ model, apps, users?, employees?, cycle }` para quem **não** tem assinatura paga → `{ url }` (Stripe Checkout; fake: aplica e devolve a URL de sucesso) |
| ★ `POST /v1/workstation/change` | owner · idempotente · mesmo corpo, para quem **já** assina → aplica a diferença com proporcional → `{ subscription }` |
| ★ `POST /v1/workstation/apps/:appId/activate` | owner/admin · liga o app: no `trial`/`completo` liga e `activateApp`; no `apps`, exige `confirm: true` e cria o item (owner) com proporcional; no `free`, só apps do grátis (senão 402 `APP_REQUIRES_SUBSCRIPTION` com a prévia) |
| ★ `POST /v1/workstation/apps/:appId/deactivate` | owner · `{ when: "period_end" \| "now" }` tira o item (padrão no fim do período) e desliga da interface |
| ★ `GET /v1/workstation/apps/:appId/access` · ★ `PUT …/access` | `{ userIds }` de quem usa o app; no `apps`, se as pessoas com acesso passarem da quantidade comprada, o PUT exige `confirm: true` e aumenta a quantidade (sem ele: 409 `CONFIRM_REQUIRED` com `{ newMonthly, amountDueNow }`); dentro dos assentos comprados não muda o valor |
| `POST /v1/workstation/cancel` · `POST /v1/workstation/resume` | cancelar no fim do período / desfazer |
| `POST /v1/billing/portal-sessions` | o da base (cartão e faturas) |
| ★ `POST /v1/billing/fake/simulate` | o da base, com o evento novo `trial_end` (só modo fake: termina o teste agora e roda o job) |

Erros novos: `SEATS_IN_USE` (409, quantidade menor que as pessoas com acesso), `APP_NOT_ACTIVE` (403, `{ appId }`), `APP_ACCESS_DENIED` (403, `{ appId }`), `APP_REQUIRES_SUBSCRIPTION` (402, `{ appId, preview }`), `CONFIRM_REQUIRED` (409, `{ newMonthly, amountDueNow }`), `NOT_SUBSCRIBED` / `ALREADY_SUBSCRIBED` (da base), `BILLING_NOT_CONFIGURED` (da base).

## Jobs

| Job | Quando | Faz |
|---|---|---|
| `workstation.trial-reminders` | a cada hora | empresas em teste com 3 e com 1 dia restante (`trialState`) que ainda não receberam aquele aviso → notificação `billing.trial_ending` + e-mail para os owners (resumo: apps usados, pessoas, estimativa com `quote`, botão para a Assinatura) |
| `workstation.trial-end` | a cada 15 min | teste vencido sem assinatura → `model: free`, audit `billing.plan_changed`, notificação e e-mail "Seu teste terminou" (o que ficou só leitura e como assinar) |
| `workstation.period-end` | a cada 15 min (modo fake) | itens com `cancelAtPeriodEnd` e período vencido saem; assinatura cancelada vira `free` |
| `workstation.seats-reconcile` | diário | garante quantidade ≥ pessoas com acesso (`seatsFromAccess`) em cada item e avisa o owner de assentos livres |

## Testes obrigatórios (API)

- Catálogo público: disponíveis com preço, "em breve" sem preço.
- Checkout por app (fake): itens e `monthly` iguais ao `quote`; Completo com mínimo de 3; suíte com mínimo.
- Prévia: proporcional certo no meio do período; nada muda sem confirmar.
- Acesso: dar acesso além dos assentos comprados aumenta a quantidade (exige `confirm`); dentro dos comprados não cobra; reduzir a quantidade abaixo de quem tem acesso → 409 `SEATS_IN_USE`; membro removido some de todos os acessos.
- Ligar app no `free` fora do grátis → 402 com prévia; no `trial` liga e roda o conteúdo inicial uma vez.
- Fim do teste (simulado): vira `free`; escrita em app pago → 403 `APP_NOT_ACTIVE`; leitura funciona; voltar a assinar libera na hora sem perder dados.
- Webhooks (assinatura gerada com o helper de teste do SDK): sincroniza itens e modelo; repetido não duplica; pagamento falhou marca `paymentIssue`.
- Só o owner muda valores (admin → 403); outra empresa → 404.
