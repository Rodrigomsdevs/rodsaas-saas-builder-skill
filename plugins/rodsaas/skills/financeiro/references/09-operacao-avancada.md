# 09 · NFS-e, rateio, previsto × realizado, fatura de cartão, mês travado e exportação ao contador

O que a empresa pequena pede logo depois de lançar e conciliar: **emitir a nota de serviço** sem outro sistema, **dividir** uma conta entre áreas, **orçar** o mês e ver onde estourou, **cartão de crédito** com fatura de verdade (a compra entra na fatura certa e a parcela cai nos meses seguintes), **fechar o mês** para ninguém mexer no que o contador já recebeu e **mandar ao contador** os lançamentos no formato dele. Tudo **núcleo** (vale para qualquer perfil; `10-perfis-de-segmento.md` decide o que já vem ligado). Regras no `financeiro-lib` (seção "operação avançada"). Formatos ★ fazem parte do contrato (grupo `presets.financeiro`).

## Modelo (somar ao `02-modelo.md`)

```prisma
model FinAllocation { id String @id @default(uuid()); orgId String; entryId String; categoryId String; costCenterId String?; pct Decimal?; amountCents Int }   // rateio; amountCents já calculado
model FinBudget { id String @id @default(uuid()); orgId String; categoryId String; costCenterId String?; month String; amountCents Int; @@unique([orgId, categoryId, costCenterId, month]) }
model FinCardPurchase { id String @id @default(uuid()); orgId String; accountId String; description String; categoryId String; costCenterId String?; contactId String?; date String; amountCents Int; installments Int; createdById String; createdAt DateTime @default(now()) }
model FinCardInstallment { id String @id @default(uuid()); purchaseId String; number Int; amountCents Int; refMonth String; invoiceEntryId String }
model FinPeriodLock { id String @id @default(uuid()); orgId String; lockedThrough String; byId String; reason String?; at DateTime @default(now()) }   // histórico; o vigente é o último
model FinNfse { entryId String @id; orgId String; fiscalDocumentId String; number String; key String; status String; taxes Json; issuedAt DateTime }
// FinAccount ganha closingDay?, dueDay?, limitCents?, paidFromAccountId? (cartão), ledgerCode?; FinCategory ganha ledgerCode?
// FinEntry ganha service Json? ({ code, description, issPct, issWithheld, irrfPct, pcc, inssPct, cityCode }), cardAccountId?, cardRefMonth?
// FinPayment ganha method "RETENTION" (impostos retidos pelo tomador: sem conta, fora do saldo e do fluxo)
// FinSettings ganha segment, lockedThrough, nfseOnPayment (false), defaultService Json?, budgetWarnPct (90); "optante do Simples" vem do regime do emitente no motor
```

## NFS-e pelo motor fiscal (`/rodsaas:fiscal`)

O Financeiro **não fala com prefeitura nem com provedor**: chama o `fiscal.issue()` do add-on `fiscal` com **`kind: "NFSE"`** (o motor ganha esse tipo além de NF-e e NFC-e; padrão nacional — DPS → NFS-e no Ambiente de Dados Nacional — ou o provedor escolhido; driver falso até a empresa escolher). O emitente é o do motor, com a **inscrição municipal** (`im`).

- **Serviço do lançamento**: a receita guarda **`service: { code, description, issPct, issWithheld?, irrfPct?, pcc?, inssPct?, cityCode? }`** (`validateService`: código de tributação nacional com 6 dígitos, ISS de 2% a 5%, município de incidência com 7 dígitos; padrão em `FinSettings.defaultService`).
- ★ `POST /v1/fin/entries/:id/nfse` (escrita; precisa da feature `fiscal`) → **201 `{ nfse: { id, number, key, status, taxes }, entry }`**:
  - só receita não cancelada (409 `ENTRY_NOT_RECEIVABLE`), com contato com CPF/CNPJ (400 `path: "contactId"`, `code: "DOCUMENT_REQUIRED"`), uma nota ativa por lançamento (409 `ALREADY_INVOICED`), emitente configurado (409 `ISSUER_NOT_CONFIGURED`);
  - **`taxes` = `serviceTaxes(valor, serviço, { simples })`**: ISS (retido ou não), IRRF, PIS/COFINS/CSLL, INSS; retenção federal abaixo de R$ 10,00 não é feita; optante do Simples (regime `SIMPLES` do emitente) sem IRRF e PCC;
  - **retenções baixam o lançamento** na mesma transação: uma baixa `method: "RETENTION"` sem conta (fora do saldo e do fluxo de caixa) com o total retido — o que falta receber é o líquido;
  - `key` = **chave de acesso de 50 posições** (`nfseAccessKey`; `isNfseKey` confere o DV);
  - o documento aparece no motor (`GET /v1/fiscal/documents/:id` com `kind: "NFSE"`, `ref: { app: "financeiro", entity: "entry", id }`).
- **Na baixa** (`nfseOnPayment`, perfil prestador): receita **quitada** com serviço e sem nota → emite sozinha; erro na emissão não desfaz a baixa (aviso `fin.nfse.failed` ao `FIN_ADMIN`).
- Cancelar a nota: `POST /v1/fin/entries/:id/nfse/cancel` (`{ reason }`, pelo motor; a baixa de retenção é estornada).
- Lista e detalhe mostram o número da nota (`fin-entry-nfse`); o PDF/XML vem do motor.

## Rateio

- ★ `POST /v1/fin/entries` e `PATCH /:id` aceitam **`allocations: [{ categoryId, costCenterId?, pct? | amountCents? }]`** (`validateAllocations`: pelo menos 2 partes, todas por porcentagem somando 100% ou todas em centavos somando o valor; 400 com `path: "allocations"` ou `allocations.N.*`). Os centavos de cada parte saem de `allocateAmount` (maior resto, soma exata) e o lançamento mostra **`allocations: [{ categoryId, costCenterId, pct, amountCents }]`**; a `categoryId` do lançamento é a da maior parte.
- **DRE, relatórios por categoria e por centro de custo e orçamento** usam as partes (`explodeAllocations`); uma baixa parcial divide na mesma proporção (`splitByShares`).
- Categoria da parte do tipo errado → 400 `CATEGORY_TYPE_MISMATCH` em `allocations.N.categoryId`. Parcelas e recorrência copiam o rateio em porcentagem.

## Previsto × realizado (`feature: 'fin_budget'`)

| Rota | Faz |
|---|---|
| ★ `PUT /v1/fin/budgets` | `FIN_ADMIN` · **`{ month, items: [{ categoryId, costCenterId?, amountCents }] }`** (`validateBudget`) → substitui o orçamento do mês; `copyFrom: "AAAA-MM"` copia de outro mês |
| ★ `GET /v1/fin/budgets/report` | **`?from=AAAA-MM&to=AAAA-MM&costCenterId?`** → **`{ rows: [{ categoryId, name, type, month, budgetCents, actualCents, diffCents, usedPct, status }], totals: { budgetCents, actualCents } }`** (`budgetVsActual`; realizado por **competência**, com rateio; cancelado fora); despesa: `OK` · `WARN` (≥ `budgetWarnPct`) · `OVER`; receita: `OK` (bateu) · `WARN` · `UNDER`; gasto sem orçamento: `NO_BUDGET` |

Aviso `fin.budget.over` ao `FIN_ADMIN` quando uma categoria passa do orçado no mês (uma vez por categoria e mês). Tela `/financeiro/orcamento` com a grade mês × categoria (`fin-budget-row`, `data-status`).

## Fatura de cartão de crédito

- Conta do tipo **`CREDIT_CARD`** com **`closingDay`, `dueDay`, `limitCents?`, `paidFromAccountId?`** (`validateCard`; vencimento diferente do fechamento).
- ★ `POST /v1/fin/cards/:accountId/purchases` (escrita) **`{ description, categoryId, amountCents, date, installments?, costCenterId?, contactId? }`** → **201 `{ purchase, installments: [{ number, amountCents, refMonth, dueOn }] }`** (`cardPurchasePlan`: compra no dia do fechamento ou depois vai para a próxima fatura; parcela a parcela nas faturas seguintes, centavo certo na 1ª).
- **Fatura = um lançamento a pagar** por cartão e mês (`refMonth` = mês do vencimento), criado na primeira compra, com vencimento no `dueOn`, valor = soma das parcelas daquele mês e **rateio pelas categorias das compras** (a DRE vê aluguel, combustível, software — não "cartão"). Compra numa fatura já paga → 409 `INVOICE_PAID`.
- ★ `GET /v1/fin/cards/:accountId/invoices` → **`{ data: [{ refMonth, closesOn, dueOn, status: "OPEN" \| "CLOSED" \| "PAID", totalCents, entryId, items: [{ purchaseId, description, number, total, amountCents }] }], limit: { limitCents, usedCents, availableCents } }`** (`usedCents` = parcelas ainda não pagas).
- Pagar a fatura é a baixa normal do lançamento (da conta `paidFromAccountId` por padrão). Estorno de compra: `DELETE /v1/fin/cards/purchases/:id` só sem fatura paga.

## Mês travado (competência fechada)

- ★ `POST /v1/fin/period-lock` (`FIN_ADMIN`) **`{ month }`** (`validateLock`: só mês que já terminou; não volta) → **`{ lockedThrough }`**; ★ `POST /v1/fin/period-lock/unlock` **`{ month, reason }`** (motivo obrigatório; volta para o mês anterior ao informado; registra no histórico); `GET /v1/fin/settings` mostra `lockedThrough`.
- Com o mês travado (`isLocked`), a API recusa com **409 `PERIOD_LOCKED`** (`{ lockedThrough }`): criar ou mudar lançamento com competência no período travado, **baixar** com data no período, **estornar** baixa do período, cancelar lançamento com competência travada, transferência com data travada, conciliar transação do período, compra de cartão de fatura travada.
- O que vale é a **data do fato**: receber hoje um lançamento com competência travada pode (o caixa é de hoje); o que não pode é mudar o que já está no período.
- A tela mostra o cadeado no lançamento e na baixa (`fin-locked`).

## Exportação ao contador

- Categoria e conta ganham **`ledgerCode`** (código do plano de contas do contador; `PATCH /v1/fin/categories/:id` e `/accounts/:id`).
- ★ `GET /v1/fin/export/accounting` (`fin_reports`) **`?from&to`** → **`{ rows: [{ date, debit, credit, amountCents, history, document }], missing: [{ kind: "account" \| "category", id, name }], totalCents }`** (`accountingEntries`: regime de caixa — o que foi pago e transferido; receita D banco / C receita, despesa D despesa / C banco, transferência D destino / C origem, rateio dividido; retenções fora); **`&format=csv`** devolve o CSV do contador (`accountingCsv`: data DD/MM/AAAA; débito; crédito; valor com vírgula; histórico; documento). Com `missing` não vazio, a tela lista o que falta mapear antes de enviar.
- `POST /v1/fin/export/send` passa a anexar também o CSV contábil; com `lock: true` trava o mês exportado.

## Planos, avisos e erros

Feature nova `fin_budget` (Pro e Business); rateio, cartão, mês travado e exportação contábil em todos os planos (a exportação dentro de `fin_reports`); NFS-e exige a feature `fiscal` do add-on. Avisos novos: `fin.budget.over`, `fin.nfse.failed`, `fin.card.invoice_closed` (fatura fechou, com o total). Erros novos: `PERIOD_LOCKED` (409), `INVOICE_PAID` (409), `ALREADY_INVOICED` (409), `DOCUMENT_REQUIRED` (400), `ALLOCATION_*` (400).

## Testes obrigatórios

- NFS-e: serviço inválido 400; sem documento do tomador 400; emite com a chave de 50 posições; retenções baixam e o restante é o líquido; segunda nota 409; emissão na baixa (perfil prestador).
- Rateio: soma errada 400; 33,33% × 3 com o centavo certo; DRE por categoria com as partes.
- Orçamento: estouro, alerta, meta de receita, gasto sem orçamento.
- Cartão: compra antes e no dia do fechamento; parcelada nas faturas seguintes; fatura com rateio pela categoria da compra; fatura paga recusa compra; limite usado.
- Mês travado: mês corrente 400; criar, baixar e estornar no período 409; destravar com motivo.
- Contador: partidas de receita, despesa e transferência; códigos faltando listados; CSV no formato.
