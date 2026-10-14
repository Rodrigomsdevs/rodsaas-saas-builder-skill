# 06 · Cobranças pela Stripe (Connect)

## Modelo

- A Stripe do projeto (configurada no `/rodsaas:backend`) é a **plataforma**. Cada empresa conecta a **própria conta Stripe** (Connect) e as cobranças são **cobranças diretas** na conta dela: a empresa é quem vende (aparece no boleto/Pix/fatura), paga as tarifas da Stripe e recebe na conta dela. O SaaS não segura o dinheiro nem responde por estorno.
- Meios no Brasil (confira os limites na doc atual da Stripe antes de portar; estão em `STRIPE_BR` no `financeiro-lib`):

| Meio | Regras que o sistema aplica (`validateCharge`) |
|---|---|
| **Boleto** | conta brasileira; R$ 5,00 a R$ 49.999,99; vence em 0 a 60 dias (`expires_after_days`); exige nome e CPF/CNPJ do pagador; confirmação em até 1 dia útil depois do pagamento; **não tem estorno** pela Stripe; serve para recorrente |
| **Pix** | conta brasileira: **só avulso** (Pix Automático indisponível no Brasil); a partir de R$ 0,50 e com limite por transação (aviso acima de `pixMaxCents`); confirmação na hora; estorno em até 90 dias |
| **Cartão** | avulso e recorrente; parcelamento no cartão conforme a conta da empresa (fora da v1: o cliente paga à vista na cobrança) |

- **Modo** (`GET /v1/fin/settings → charges.mode`): `stripe` (há `STRIPE_SECRET_KEY` e a empresa conectou), `fake` (sem chave da Stripe ou `FIN_CHARGES_MODE=fake`: tudo funciona com uma página de pagamento de teste) ou `disabled` (há chave, a empresa ainda não conectou → a tela de cobrança leva ao "Conectar Stripe").

## Conectar a conta da empresa

1. Configurações → Cobranças → **Conectar Stripe** (`FIN_ADMIN`). Antes de abrir, a tela explica: "As cobranças caem na conta Stripe da {empresa}; as tarifas da Stripe são cobradas pela Stripe da {empresa}" (+ a taxa da plataforma, se `FIN_APPLICATION_FEE_CENTS` > 0).
2. `POST /v1/fin/stripe/connect`: cria a conta conectada (uma vez por empresa; confira na doc atual a forma recomendada para contas com **Dashboard completo da Stripe**, a empresa pagando as tarifas e a Stripe responsável pelas perdas — hoje, `controller: { stripe_dashboard: { type: "full" }, fees: { payer: "account" }, losses: { payments: "stripe" } }`, `country: "BR"`) e um **Account Link** de onboarding → `{ url }`. Grava `stripeAccountId` e `FinStripeAccountLookup`.
3. Volta para `/financeiro/configuracoes/cobrancas?stripe=retorno`: busca a conta, mostra o status (`PENDING` "Faltam dados na Stripe" com "Continuar cadastro", `RESTRICTED` com o que falta, `ACTIVE`) e os meios ativos (`card_payments`, `boleto_payments`, `pix_payments`: Pix e boleto podem precisar ser ativados no Dashboard da Stripe da empresa — a tela diz como).
4. `account.updated` (webhook) mantém status e meios atualizados. Ao ficar `ACTIVE`, cria a conta financeira "Stripe" (tipo `STRIPE`).
5. Desconectar: para de criar cobranças; as pendentes são canceladas (com confirmação listando quantas).

## Cobrar um lançamento

1. Num a receber em aberto (lista, detalhe ou Início → "Cobrar"): meios (padrão da configuração; boleto some se o contato não tem CPF/CNPJ, com "Adicionar documento"), vencimento (padrão: o do lançamento; vencido → pede novo vencimento e oferece somar multa e juros com `lateCharges`), "Enviar por e-mail" (marcado se o contato tem e-mail).
2. `validateCharge` → 422 `CHARGE_RULES` com os códigos (`BOLETO_NEEDS_DOCUMENT`, `BOLETO_DUE_TOO_FAR` → "o boleto será gerado mais perto do vencimento": a cobrança fica agendada e o job gera o boleto 60 dias antes, `PIX_NOT_RECURRING`…).
3. Cria `FinCharge` (`PENDING`, valor = o que falta no lançamento), token aleatório (32 bytes, guarda o hash e o `tokenEnc`) e `FinChargeLookup`. O link é `{painel}/pagar/<token>` — o mesmo em todos os e-mails e lembretes.
4. E-mail ao cliente (marca da empresa, `reply-to` = `financeEmail`): descrição, valor, vencimento, botão "Pagar" → `/pagar/<token>`. Copiar link (para WhatsApp) na tela.

## Página pública `/pagar/[token]`

Marca da empresa, descrição, valor, vencimento, situação. Escolha do meio → `POST /v1/public/fin/charges/:token/checkout` → **Checkout Session da Stripe na conta conectada** (cabeçalho `Stripe-Account`), `mode: "payment"`, `payment_method_types` = os meios da cobrança, `payment_method_options.boleto.expires_after_days` (`boletoExpiresAfterDays`), cliente da conta conectada criado/reaproveitado (`stripeCustomerId` no contato; nome, e-mail e documento pré-preenchidos), `metadata: { orgId, chargeId }`, `payment_intent_data.application_fee_amount` se houver taxa da plataforma, `success_url`/`cancel_url` de volta para `/pagar/<token>`. A sessão é reaproveitada enquanto válida (não cria uma nova a cada clique).

Voltar do Checkout **não** dá baixa: a página mostra "Recebemos seu pedido de pagamento" (boleto/Pix: "assim que o pagamento for confirmado, você recebe o recibo por e-mail") e consulta a situação. Paga → "Pagamento confirmado" com o recibo. Expirada/cancelada → "Esta cobrança não está mais disponível: fale com a {empresa}" com o contato.

**Modo de teste**: a página mostra "Ambiente de teste" e os botões "Simular Pix", "Simular boleto pago" e "Simular cartão" → `POST .../fake-pay { method }` → o **mesmo serviço** do webhook (`handleChargePaid`), com tarifa simulada `FIN_FAKE_FEE_CENTS` (padrão 0). A rota não existe fora do modo `fake` (404).

## Webhook do Connect (`POST /v1/webhooks/stripe-connect`)

Endpoint próprio, cadastrado na Stripe como **"Connected accounts"** (eventos das contas conectadas), segredo `STRIPE_CONNECT_WEBHOOK_SECRET` (diferente do webhook da assinatura do SaaS). Corpo cru para conferir a assinatura (mesma regra do webhook da base), fora da checagem de Origin, **idempotente por `event.id`** (`FinWebhookEvent`). A empresa vem de `event.account` → `FinStripeAccountLookup`.

| Evento | Faz |
|---|---|
| `checkout.session.completed` | `payment_status: "paid"` (cartão) → `handleChargePaid`; `"unpaid"` (boleto/Pix gerado) → cobrança `PROCESSING` com o meio escolhido |
| `checkout.session.async_payment_succeeded` | boleto/Pix confirmado → `handleChargePaid` |
| `checkout.session.async_payment_failed` · `checkout.session.expired` | cobrança `FAILED`/`EXPIRED` (o lançamento continua em aberto; aviso `fin.charge.failed`) |
| `invoice.paid` (assinatura de cliente) | lançamento do período (a receber) criado e baixado pelo mesmo serviço |
| `invoice.payment_failed` | assinatura `PAST_DUE` + aviso |
| `charge.refunded` | estorno total/parcial → baixa estornada (total) ou lançamento de devolução (parcial), aviso |
| `payout.paid` | transferência Stripe → conta bancária padrão do repasse (`stripePayoutId` único) |
| `account.updated` | status e meios da conta |

`handleChargePaid(charge, { method, paidAt, paymentIntentId })` numa transação: cobrança `PAID`; **baixa** do lançamento na conta "Stripe" pelo valor da cobrança (`method` BOLETO/PIX/CARD, `chargeId`); busca a **tarifa** (balance transaction da cobrança na conta conectada) e cria o lançamento de despesa "Tarifa Stripe · {descrição}" em "Tarifas bancárias e de cobrança", já baixado na conta Stripe; aviso `fin.charge.paid` para `FIN_ADMIN`/`FIN`; recibo por e-mail ao cliente. Se o lançamento já tinha sido baixado à mão (cliente pagou duas vezes), não baixa de novo: cria um a receber "Pagamento em duplicidade" já baixado e avisa (a empresa decide estornar na Stripe).

Em dev: `stripe listen --forward-connect-to localhost:3333/v1/webhooks/stripe-connect` (o README do projeto explica).

## Régua de cobrança

`reminderDue({ dueDate, offsets, sent, today })` no job das 9 h: para cada cobrança pendente, manda **só o lembrete mais recente** ainda não enviado (nunca uma fila de atrasados de uma vez). Textos: antes ("Lembrete: vence em 3 dias"), no dia ("Vence hoje"), depois ("Está em atraso há 3 dias" — com o mesmo link; boleto vencido: "gere uma nova via pelo link", que leva à 2ª via com multa/juros se a empresa ligou). A empresa configura os dias e liga/desliga; cada cobrança tem "Pausar lembretes". Com o add-on WhatsApp no futuro, o mesmo lembrete vai pelos dois canais.

## Cobrança recorrente de clientes

Assinatura (mensalidade de um cliente): contato, descrição, valor, mensal/anual, cartão ou boleto (Pix não), categoria, início. Na Stripe da empresa: produto/preço e **Subscription** do cliente (cartão: o cliente cadastra pela página `/pagar/<token>` da 1ª cobrança; boleto: fatura enviada a cada ciclo). Cada `invoice.paid` → lançamento a receber do período criado e baixado. Cancelar na tela cancela na Stripe. No modo de teste, a 1ª cobrança é uma `FinCharge` normal e o job cria as próximas no ciclo.

## Segurança

- Chave secreta só no servidor; contas conectadas pelo id (`acct_…`), nunca por chave da empresa.
- Página pública: lookup pelo hash do token, rate limit, nada interno na resposta (nem id do lançamento, nem e-mail do cliente inteiro).
- Webhook: assinatura conferida com o corpo cru, tolerância de horário padrão, evento processado uma vez.
- Valor da cobrança vem do banco, nunca do cliente.

## Testes obrigatórios

- `validateCharge` portado; boleto sem documento → 422; boleto a 61 dias → agendado.
- Modo de teste: criar cobrança → link `/pagar/<token>`; página pública sem login; `fake-pay` baixa (conta Stripe, método certo), cobrança `PAID`, pagar de novo 409; `fake-pay` fora do modo de teste → 404.
- Webhook (com eventos assinados de teste): `checkout.session.completed` com cartão baixa; com boleto deixa `PROCESSING` e o `async_payment_succeeded` baixa; mesmo evento duas vezes baixa uma vez; assinatura errada → 401; tarifa lançada.
- Régua: lembrete certo por dia, nunca dois no mesmo dia, nenhum depois de pago.
