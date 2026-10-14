# 03 · API

Padrão da base em tudo: `/v1`, tenant do token, `withTenant`, schemas Zod de entrada (estritos) e saída (com nome no OpenAPI), RFC 9457, cursor, `config` declarativo, `Idempotency-Key` nos POST que criam (lançamentos, baixas, cobranças, importação). **Dinheiro em centavos inteiros** (`…Cents`, Zod `z.number().int()`); datas de calendário `"YYYY-MM-DD"`; "hoje" no fuso de `FinSettings.timeZone`. Toda rota exige papel do app (`FinRole` ou owner): senão 403 `NOT_FIN_MEMBER`. Escrita: `FIN_ADMIN`/`FIN` (403 `FORBIDDEN` para `VIEWER`); configuração: `FIN_ADMIN`.

Os formatos marcados com ★ fazem parte do **contrato testável** (`skills/verify/contract.json`, grupo `presets.financeiro`).

Erros novos: `NOT_FIN_MEMBER` (403), `CATEGORY_TYPE_MISMATCH` (400, `path: "categoryId"`), `DOCUMENT_TAKEN` (409), `PAYMENT_RULES` (422, `violations`), `ALREADY_REVERSED` (409), `HAS_PAYMENTS` (409), `AMOUNT_BELOW_PAID` (409), `NOT_AWAITING_APPROVAL` (409), `COMMENT_REQUIRED` (400), `INVALID_STATEMENT` (400), `STATEMENT_ACCOUNT_MISMATCH` (409), `AMOUNT_MISMATCH` (409), `TRANSACTION_NOT_PENDING` (409), `CHARGE_RULES` (422, `violations`), `ENTRY_NOT_RECEIVABLE` (409), `CHARGE_EXISTS` (409), `CHARGE_NOT_PENDING` (409), `CHARGE_NOT_FOUND` (404), `STRIPE_NOT_CONNECTED` (409), `INVALID_WEBHOOK_SIGNATURE` (401).

Erros de regra (baixa, cobrança) usam **422** com `violations: [{ code, message, path? }]` e `warnings` (os códigos do `financeiro-lib`) — diferente de `errors` (formato, 400 da base).

## Pessoa, configurações e estrutura

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/fin/me` | — | **`{ role, canApprove, pending: { toApprove, toReconcile, overdueReceivable, dueTodayPayable } }`** |
| ★ `GET /v1/fin/settings` · `PATCH` | escrita `FIN_ADMIN` | campos de `FinSettings` + **`charges: { mode: "stripe" \| "fake" \| "disabled", accountStatus, capabilities }`** |
| ★ `PUT /v1/fin/roles/:userId` | `FIN_ADMIN` | `{ role: "FIN_ADMIN" \| "FIN" \| "VIEWER" \| null }` (membro da empresa; o owner não perde `FIN_ADMIN` → 409 `OWNER_IS_FIN_ADMIN`) |
| ★ `GET /v1/fin/categories` · `POST` · `PATCH /:id` · `POST /:id/archive` | escrita `FIN_ADMIN` | **`[{ id, key, name, type, parentId, dreGroup, archived }]`**; `dreGroup` coerente com o tipo (`dreGroup(...).type`); arquivar com uso mantém os lançamentos |
| `GET/POST /v1/fin/cost-centers` · `PATCH /:id` | escrita `FIN_ADMIN` | |
| ★ `GET /v1/fin/accounts` · ★ `POST` · `PATCH /:id` · `POST /:id/archive` | escrita `FIN_ADMIN`; `limit: 'finAccounts'` | **`[{ id, name, type, openingBalanceCents, openingDate, balanceCents, projectedBalanceCents, archived }]`** (`balanceCents` = hoje; `projectedBalanceCents` = + previstos dos próximos 30 dias); `POST { name, type, openingBalanceCents, openingDate, bankCode?, agency?, number? }` |
| ★ `POST /v1/fin/transfers` · `GET` · `DELETE /:id` | escrita | **`{ fromAccountId, toAccountId, date, amountCents, description? }`** → 201; contas diferentes e ativas |
| ★ `GET /v1/fin/contacts` · ★ `POST` · `PATCH /:id` | escrita | **`{ kind, name, document?, email?, phone?, address?, pixKey? }`**; `document` com `documentType` (400 `path: "document"`), único na empresa (409 `DOCUMENT_TAKEN`) |

## Lançamentos

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/fin/entries` | — | `?type=INCOME\|EXPENSE`, `status=OPEN\|OVERDUE\|PARTIAL\|PAID\|CANCELED\|AWAITING_APPROVAL` (vários com vírgula), `from`/`to` (vencimento), `competenceFrom`/`competenceTo`, `categoryId`, `costCenterId`, `accountId`, `contactId`, `q` (descrição, documento, contato), `sort=due\|created`, cursor; item **`{ id, type, description, contact: { id, name } \| null, category: { id, name }, costCenterId, accountId, amountCents, paidCents, remainingCents, dueDate, competenceDate, status, overdue, daysLate, installment: { number, total } \| null, recurrenceId, charge: { id, status } \| null, createdAt }`**; `meta.totals: { amountCents, paidCents, remainingCents }` do filtro inteiro |
| ★ `POST /v1/fin/entries` | escrita, idempotente | **`{ type, description, categoryId, amountCents, dueDate, competenceDate?, contactId?, costCenterId?, accountId?, installments?: { count, interval? }, documentNumber?, notes?, attachments?, source? }`** → 201 **`{ entries: [item] }`** (1 ou N parcelas, `splitInstallments`; a descrição ganha " (2/3)"); categoria do tipo errado → 400 `CATEGORY_TYPE_MISMATCH`; despesa lançada por `FIN` com total acima de `paymentApprovalAboveCents` → `status: "AWAITING_APPROVAL"` + aviso aos `FIN_ADMIN` |
| ★ `GET /v1/fin/entries/:id` | — | item + **`payments: [{ id, date, accountId, amountCents, discountCents, interestCents, fineCents, method, reversed }]`**, `events`, `attachments`, **`suggestedLate: { daysLate, fineCents, interestCents } \| null`** (`lateCharges` com a configuração, só se vencido) |
| `PATCH /v1/fin/entries/:id` | escrita | campos do POST + `applyTo: "this" \| "following"` (parcelas e recorrência); `amountCents` abaixo do pago → 409 `AMOUNT_BELOW_PAID`; cancelado não muda |
| ★ `POST /v1/fin/entries/:id/payments` | escrita, idempotente | **`{ accountId, date, amountCents, interestCents?, fineCents?, discountCents?, method?, receiptFileId? }`** → 201 **`{ payment, entry }`** (`applyPayment`; violações → 422 **`PAYMENT_RULES`**: `OVERPAYMENT`, `FUTURE_DATE`, `AWAITING_APPROVAL`, `ENTRY_CANCELED`, `INVALID_AMOUNT`) |
| ★ `POST /v1/fin/payments/:id/reverse` | escrita | estorna (não apaga): `reversedAt`, `paidCents` recalculado na mesma transação, transação do extrato conciliada volta a pendente → **`{ entry }`**; já estornada → 409 `ALREADY_REVERSED` |
| `POST /v1/fin/entries/:id/cancel` | escrita | `{ reason }` (obrigatório); com baixa ativa → 409 `HAS_PAYMENTS` (estorne antes); cobrança pendente é cancelada junto |
| ★ `POST /v1/fin/entries/:id/approval` | `FIN_ADMIN` | **`{ decision: "approve" \| "reject", comment? }`**; recusar exige comentário (400 `COMMENT_REQUIRED`); não aguardando → 409 `NOT_AWAITING_APPROVAL`; recusado vira cancelado com o motivo |
| `POST /v1/fin/entries/bulk` | escrita | `{ ids (até 200), action: "pay" \| "cancel" \| "category" \| "due", data }` → `{ done, failed: [{ id, code }] }` |
| `POST /v1/fin/entries/:id/duplicate` | escrita | cópia em aberto |
| ★ `POST /v1/fin/recurrences` · `GET` · `PATCH /:id` · `POST /:id/stop` | escrita, `feature: 'fin_recurring'` | **`{ template: { type, description, categoryId, amountCents, contactId?, costCenterId?, accountId? }, start, interval, every?, count?, until? }`** → 201 **`{ recurrence, entries }`** (gera os lançamentos de `recurrenceDates` até 12 meses à frente, ou até `count`/`until`; o job diário estende); `stop` cancela os futuros em aberto |

## Fluxo, DRE e relatórios

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/fin/cashflow` | — | `?from&to&groupBy=day\|month&accountId?` → **`{ openingCents, periods: [{ key, inCents, outCents, forecastInCents, forecastOutCents, netCents, balanceCents }], closingCents }`** (`cashFlow`) |
| ★ `GET /v1/fin/reports/dre` | `feature: 'fin_reports'` | `?from&to&basis=competence\|cash` → **`{ groups: { RECEITA_BRUTA, DEDUCOES, … }, receitaLiquida, lucroBruto, resultadoOperacional, resultadoFinanceiro, resultadoAntesIR, lucroLiquido, margemBruta, margemOperacional, margemLiquida }`** (`dre`) + `months` (o mesmo por mês) |
| ★ `GET /v1/fin/reports/aging` | `feature: 'fin_reports'` | `?type=INCOME\|EXPENSE` → **`{ buckets: { a_vencer, d1_30, d31_60, d61_90, d90_mais }, byContact: [{ contact, overdueCents, oldestDueDate }] }`** |
| `GET /v1/fin/reports/by-category` · `/by-cost-center` · `/by-contact` | `fin_reports` | período, tipo, base |
| `GET /v1/fin/export.csv` | `fin_reports` | `?from&to&kind=entries\|payments\|transfers` (`toCsv`, `centsToDecimal`, documento formatado, categoria com o grupo da DRE) |
| `POST /v1/fin/export/send` | `fin_reports`, `FIN_ADMIN` | e-mail ao `accountantEmail` com os 3 CSV do mês anexos |

## Conciliação (`05-conciliacao.md`)

| Rota | Config | Faz |
|---|---|---|
| ★ `POST /v1/fin/accounts/:id/statements` | escrita, `feature: 'fin_reconciliation'` | **`{ fileName, content }`** (texto do arquivo; ou `fileId` do `uploads`) → 201 **`{ import: { id, imported, duplicates, statementBalanceCents }, transactions: [tx] }`**; formato pela extensão/conteúdo (`parseOfx`/`parseCsvStatement`); ilegível → 400 `INVALID_STATEMENT`; OFX de outra conta (BANKID/ACCTID diferentes dos gravados) → 409 `STATEMENT_ACCOUNT_MISMATCH` (com `confirm: true` importa e grava os ids) |
| ★ `GET /v1/fin/accounts/:id/transactions` | — | `?status=PENDING\|RECONCILED\|IGNORED`, período, cursor; item **`{ id, date, amountCents, memo, name, status, suggestions: [{ entryId, description, contactName, dueDate, remainingCents, score }], rule: { ruleId, categoryId, contactId } \| null }`** (`matchCandidates`, `applyRules`) |
| ★ `POST /v1/fin/transactions/:id/reconcile` | escrita | **`{ entryIds }`** (Σ em aberto = \|valor\|, tipo pelo sinal; senão 409 `AMOUNT_MISMATCH`) → baixa cada lançamento na data e conta da transação (`method: TRANSFER`, `bankTransactionId`) → **`{ transaction, entries }`**; transação não pendente → 409 `TRANSACTION_NOT_PENDING` |
| ★ `POST /v1/fin/transactions/:id/create-entry` | escrita | **`{ categoryId?, contactId?, description?, costCenterId? }`** (padrão: da regra) → lançamento do tipo do sinal já baixado → **`{ transaction, entry }`** |
| `POST /v1/fin/transactions/:id/transfer` | escrita | `{ otherAccountId }` → cria (ou casa com) a transferência e concilia os dois lados |
| ★ `POST /v1/fin/transactions/:id/ignore` · `POST /:id/undo` | escrita | `{ reason }`; `undo` volta a pendente (estornando as baixas criadas pela conciliação) |
| ★ `GET /v1/fin/rules` · ★ `POST` · `PATCH /:id` · `DELETE /:id` | escrita `FIN_ADMIN` | **`{ name, priority?, match: { contains?, sign?, minCents?, maxCents? }, set: { categoryId, contactId?, costCenterId? }, active? }`** (regra sem nenhum critério → 400) |

## Cobranças (`06-cobrancas-stripe.md`)

| Rota | Config | Faz |
|---|---|---|
| `POST /v1/fin/stripe/connect` · `GET /v1/fin/stripe/status` · `POST /v1/fin/stripe/disconnect` | `FIN_ADMIN`, `feature: 'fin_charges'` | onboarding do Connect → `{ url }`; status da conta e dos meios (boleto, Pix, cartão) |
| ★ `POST /v1/fin/charges` | escrita, `fin_charges`, idempotente | **`{ entryId, methods?, dueDate?, sendEmail? }`** → 201 **`{ charge: { id, status, provider, methods, amountCents, dueDate, url } }`** (`url` = `/pagar/<token>` no domínio do painel); `validateCharge` → 422 **`CHARGE_RULES`**; lançamento de despesa, pago ou cancelado → 409 `ENTRY_NOT_RECEIVABLE`; já há cobrança pendente → 409 `CHARGE_EXISTS`; modo `stripe` sem conta conectada ativa → 409 `STRIPE_NOT_CONNECTED` |
| ★ `GET /v1/fin/charges` · `GET /:id` | — | `?status`; item com `entry`, `contact`, `paidMethod`, `paidAt`, `feeCents`, `remindersSent` |
| `POST /v1/fin/charges/:id/cancel` · `/resend` · `/second-copy` | escrita | cancelar (expira a sessão da Stripe); reenviar o e-mail; 2ª via com novo vencimento e `lateCharges` |
| ★ `GET /v1/public/fin/charges/:token` | público, rate limit | **`{ company: { name, logoUrl }, description, amountCents, dueDate, status, methods, mode }`** (nada interno; documento do cliente mascarado); token inválido → 404 `CHARGE_NOT_FOUND` |
| ★ `POST /v1/public/fin/charges/:token/checkout` | público | **`{ url }`**: sessão do Checkout da Stripe **na conta conectada** (modo `fake`: a própria página com `?simular=1`); não pendente → 409 `CHARGE_NOT_PENDING` |
| ★ `POST /v1/public/fin/charges/:token/fake-pay` | público, **só no modo `fake`** (404 nos outros) | **`{ method }`** → processa exatamente como o webhook de pagamento confirmado → **`{ status: "PAID" }`**; não pendente → 409 `CHARGE_NOT_PENDING` |
| `POST /v1/webhooks/stripe-connect` | público, assinatura com `STRIPE_CONNECT_WEBHOOK_SECRET`, fora da checagem de Origin | eventos das contas conectadas (`06-cobrancas-stripe.md`); idempotente por `event.id` |
| ★ `POST /v1/fin/subscriptions` · `GET` · `POST /:id/cancel` | escrita, `fin_charges` | **`{ contactId, description, amountCents, interval: "month" \| "year", method: "card" \| "boleto", categoryId, startDate }`** → 201 `{ subscription, firstCharge }` |

## Jobs (pg-boss, fuso da empresa)

| Job | Quando | Faz |
|---|---|---|
| `fin.recurrences` | 2 h | estende cada recorrência ativa até 12 meses à frente (sem duplicar: `generatedUntil`) |
| `fin.reminders` | 9 h | `reminderDue` para cada cobrança pendente → e-mail ao cliente + `remindersSent` (só com `isAppActive`) |
| `fin.digest` | 8 h | `fin.due_today` para `FIN_ADMIN`/`FIN`: a pagar vencendo hoje, a receber vencidos ontem |
| `fin.charges.expire` | de hora em hora | boleto/Pix vencidos sem pagamento → `EXPIRED` (o lançamento continua em aberto) |
| `fin.stripe.reconcile` | 4 h | confere na Stripe as cobranças `PENDING`/`PROCESSING` com sessão (rede de segurança se um webhook se perdeu) |

## Testes obrigatórios (API)

- Estrutura: plano de contas padrão com grupos; conta com saldo inicial; 3ª conta no Free → 403; transferência muda os dois saldos e não entra no fluxo nem na DRE.
- Lançamentos: categoria de tipo errado 400; valor não inteiro 400; 3 parcelas de 100,00 = 33,34 + 33,33 + 33,33 com vencimentos no dia âncora; recorrência mensal no dia 31.
- Baixa: parcial → `PARTIAL`; acima do saldo → 422 `OVERPAYMENT`; juros entram no caixa e não abatem a dívida; estorno volta a situação e o saldo; vencido aparece sozinho e tem `suggestedLate`.
- Aprovação: `FIN` acima do limite → `AWAITING_APPROVAL`; baixar antes → 422 `AWAITING_APPROVAL`; `FIN_ADMIN` aprova; recusar sem comentário 400.
- Fluxo e DRE: números exatos de um cenário conhecido; transferência fora; cancelado fora.
- Conciliação: OFX importado duas vezes não duplica; sugestão com o lançamento do mesmo valor; conciliar baixa na data do extrato; regra categoriza a tarifa e cria o lançamento já baixado; ignorar.
- Cobranças (modo de teste): boleto sem CPF/CNPJ → 422 `BOLETO_NEEDS_DOCUMENT`; página pública sem login; `fake-pay` baixa o lançamento e a cobrança vira `PAID`; pagar de novo → 409; `fake-pay` no modo `stripe` → 404.
- Permissões: sem papel 403 `NOT_FIN_MEMBER`; `VIEWER` lê e não escreve; outra empresa 404.
