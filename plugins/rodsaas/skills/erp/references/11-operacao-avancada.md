# 11 · Nota fiscal, comissão, lote e validade, promoções, troca e vale-troca, carnê do fiado e produção

O que o comércio pequeno pede logo depois de vender e controlar estoque: **nota fiscal** sem sair do ERP, **comissão** do vendedor sem planilha, **validade** para não vender vencido, **promoção** que o caixa não precisa lembrar, **troca** com vale, **carnê** do fiado com juros certos e **produção** simples (padaria, confeitaria, marcenaria). Tudo **núcleo** (vale para qualquer perfil; `12-perfis-de-segmento.md` decide o que já vem ligado). Regras no `erp-lib` (seção "operação avançada"). Formatos ★ fazem parte do contrato (grupo `presets.erp`).

## Modelo (somar ao `02-modelo.md`)

```prisma
model ErpCommissionRule { id String @id @default(uuid()); orgId String; sellerId String?; productId String?; categoryId String?; kind String @default("PRODUCT"); pct Decimal?; fixedCents Int? }
model ErpCommissionClosing { id String @id @default(uuid()); orgId String; from String; to String; bySeller Json; totalCents Int; payableIds String[]; closedById String; closedAt DateTime @default(now()) }
model ErpLot { id String @id @default(uuid()); orgId String; productId String; warehouseId String; code String; expiresOn String?; onHand Decimal @default(0); createdAt DateTime @default(now()); @@unique([orgId, productId, warehouseId, code]) }
// ErpMovement ganha lotId; saída de produto com lote vira um movimento por lote (FEFO)
model ErpPromotion { id String @id @default(uuid()); orgId String; name String; type String; pct Decimal?; priceCents Int?; take Int?; pay Int?; productIds String[]; categoryIds String[]; from String?; to String?; weekdays Int[]; channels String[]; minQty Decimal?; active Boolean @default(true) }
model ErpVoucher { id String @id @default(uuid()); orgId String; code String; customerId String?; originalCents Int; balanceCents Int; expiresOn String?; status String @default("ACTIVE"); returnId String?; createdAt DateTime @default(now()); @@unique([orgId, code]) }
model ErpVoucherUse { id String @id @default(uuid()); voucherId String; orderId String; amountCents Int; at DateTime @default(now()) }
model ErpReceivable { id String @id @default(uuid()); orgId String; customerId String; orderId String; number Int; dueDate String; amountCents Int; paidCents Int @default(0); status String @default("OPEN") }   // carnê
model ErpReceivablePayment { id String @id @default(uuid()); receivableId String; amountCents Int; chargesCents Int; method String; sessionId String?; at DateTime @default(now()) }
model ErpRecipe { productId String @id; orgId String; yieldQty Decimal; components Json }
model ErpProductionOrder { id String @id @default(uuid()); orgId String; number Int; productId String; qty Decimal; warehouseId String; status String; needs Json; unitCostCents Int?; createdAt DateTime @default(now()); doneAt DateTime? }
// ErpProduct ganha tracksLots, scaleCode (6 dígitos da balança), saleUnit Json? ({ unit, factor }), saleMultiple Decimal?
// ErpOrderItem ganha promoId, promoDiscountCents, saleUnit, saleQty, lots Json
// ErpSettings ganha segment, pdvIssueNfce, invoiceOnDeliver, allowExpiredSale, voucherValidityDays (90), lateFinePct (2), lateMonthlyInterestPct (1), minimumOrderCents, scaleMode ("PRICE" | "WEIGHT")
```

## Nota fiscal pelo motor (`/rodsaas:fiscal`)

O ERP **não fala com SEFAZ nem com provedor**: chama o `fiscal.issue()` do add-on `fiscal` (driver falso até a empresa escolher o provedor).

- **Pedido → NF-e**: ★ `POST /v1/erp/orders/:id/invoice` (formato em `skills/fiscal/references/03-telas-e-integracoes.md`): itens com o NCM do cadastro, cliente com documento e UF, `ref` do pedido; `invoice` na visão do pedido; botão **Emitir NF-e** no detalhe. `invoiceOnDeliver` emite sozinho na entrega.
- **PDV → NFC-e**: com `pdvIssueNfce` (padrão desligado) cada venda do PDV emite a NFC-e com os pagamentos da venda e o **CPF na nota** quando informado (`cpf` no corpo da venda, pergunta "CPF na nota?" no pagamento). A resposta da venda ganha **`nfce: { id, status, number, key, qrCodeUrl } | null`** e o comprovante vira o DANFE NFC-e com o QR Code. SEFAZ fora → contingência (a venda não para). Produto sem NCM → a venda sai, a NFC-e não (aviso ao `ERP_ADMIN`). Sem o add-on `fiscal`: comprovante "sem valor fiscal" como antes.

## Comissão de vendedor (`feature: 'erp_commissions'`)

Mesma regra da Agenda (`agenda-lib` → `commissionRule`): a mais específica vence — **vendedor + produto > produto > categoria > vendedor > padrão do tipo** (produto ou serviço) — sobre o **líquido** da linha (já com promoção e desconto); valor fixo é por unidade.

| Rota | Faz |
|---|---|
| ★ `GET /v1/erp/commission-rules` · ★ `POST` · `PATCH/DELETE /:id` | `ERP_ADMIN` · **`{ sellerId?, productId?, categoryId?, kind?, pct? \| fixedCents? }`** (um dos dois; `pct` 0–100) → 201 |
| ★ `GET /v1/erp/commissions` | **`?from&to&sellerId?`** → **`{ sellers: [{ sellerId, name, salesCents, commissionCents, lines }], totalCommissionCents }`** (`commissionStatementErp`): pedidos **entregues** no período (dia no fuso da empresa) pelo vendedor do pedido (PDV: quem vendeu), menos as devoluções do período (comissão estornada); `SELLER` só vê a dele |
| `POST /v1/erp/commissions/close` | `{ from, to }` → fecha o período (não muda mais) e, com o Financeiro, cria uma conta a pagar por vendedor |

Tela `/erp/comissoes`: período, uma linha por vendedor (`erp-commission-row`, `data-seller`) com vendas, comissão e o extrato; regras em Configurações.

## Lote e validade

- Produto com **`tracksLots`**: toda entrada (`IN`, compra recebida, devolução) pede **`lot: { code, expiresOn? }`** (`validateLot`: 400 `LOT_REQUIRED`, `LOT_EXPIRED`); devolução volta para o lote de onde saiu.
- Toda saída (venda, PDV, entrega, transferência, produção) consome por **FEFO** (`fefoPick`: vence primeiro, sai primeiro); **vencido não sai** (`allowExpiredSale` desligado) — conta como indisponível: venda maior que o saldo não vencido → 409 `INSUFFICIENT_STOCK`.
- ★ `GET /v1/erp/products/:id/lots` → **`{ data: [{ id, code, expiresOn, warehouseId, onHand, expired }] }`** (só lotes com saldo, o que vence primeiro em cima); ★ `GET /v1/erp/lots/expiring?days=30` → **`{ data: [{ productId, name, lotId, code, expiresOn, onHand, expired, daysLeft }] }`** (`expiringLots`), também como aviso diário `erp.lots.expiring` ao `ERP_ADMIN`/`STOCK`.
- Tela: aba **Lotes** no produto (`erp-lot-row`, `data-expired`) e o relatório **Vencendo** (`erp-expiring-row`) com "fazer promoção".

## Promoções (`feature: 'erp_promotions'`)

| Rota | Faz |
|---|---|
| ★ `GET /v1/erp/promotions` · ★ `POST` · `PATCH/DELETE /:id` | `ERP_ADMIN` · **`{ name, type: "PERCENT_OFF" \| "FIXED_PRICE" \| "TAKE_PAY", pct?, priceCents?, take?, pay?, productIds?, categoryIds?, from?, to?, weekdays?, channels?, minQty?, active? }`** → `validatePromotion` (400 com `path`) → 201 |
| pedido e PDV | cada linha recebe a **melhor** promoção que vale hoje (`applyPromotions`; período, dia da semana — "terça da fruta" —, canal, produto/categoria, quantidade mínima; não acumulam) **antes** do desconto manual; a linha da visão de pedido ganha **`promotion: { id, name, discountCents } \| null`**; o limite de desconto do vendedor não conta a promoção |
| ★ `GET /v1/erp/price` | também devolve `promotion` |

No PDV a linha mostra o selo da promoção e o "leve 3 pague 2" se resolve sozinho ao bipar o terceiro.

## Troca e vale-troca

- Devolução com **`refundMethod: "VOUCHER"`** emite o **vale-troca** (`newVoucherCode`, validade `voucherValidityDays`): a resposta da devolução ganha **`voucher: { code, balanceCents, expiresOn }`**; impressão do vale com o código.
- ★ `GET /v1/erp/vouchers/:code` → **`{ code, balanceCents, expiresOn, status, customer }`** (404 se não existe); ★ `POST /v1/erp/vouchers` (`ERP_ADMIN`, vale avulso) **`{ amountCents, customerId?, expiresOn? }`**.
- Pagamento com **`{ method: "VOUCHER", amountCents, voucherCode }`** no PDV e no pedido: `voucherUse` → violações em `PAYMENT_RULES` (`VOUCHER_INVALID`, `VOUCHER_EXPIRED`, `VOUCHER_INSUFFICIENT`, `VOUCHER_CANCELED`); não gera troco (é como cartão); o saldo baixa na mesma transação da venda.
- ★ `POST /v1/erp/exchanges` **`{ orderId, returns: [{ lineId, qty }], items: [{ productId, qty }], payments?, sessionId? }`** → devolução (`returnPlan`) + venda nova entregue na mesma transação; `exchangeBalance`: diferença a pagar exige `payments` completos (`PAYMENT_RULES`), crédito a favor do cliente vira vale → **201 `{ returnId, order, toPayCents, voucher \| null }`**.

## Carnê do fiado

- Venda a prazo no PDV (`ON_ACCOUNT`) aceita **`carne: { installments, firstDue }`** (padrão 1 parcela em 30 dias); pedido com `payment: { method: "ON_ACCOUNT", installments, firstDue }` gera as parcelas na entrega. Cada parcela vira um `ErpReceivable` (e a conta a receber no Financeiro, quando instalado).
- ★ `GET /v1/erp/parties/:id/receivables` → **`{ data: [{ id, orderId, number, dueDate, amountCents, openCents, status, charges: { daysLate, fineCents, interestCents, totalCents } }], totalOpenCents, totalDueCents }`** (`lateCharges`: multa `lateFinePct` uma vez + juros simples `lateMonthlyInterestPct` ao mês pro rata).
- ★ `POST /v1/erp/parties/:id/receivables/pay` **`{ amountCents, method, sessionId? }`** → `allocateCarnePayment` (mais antigas primeiro, cada uma com multa e juros do dia) → **201 `{ applied: [{ id, paidCents, chargesCents, settled }], leftoverCents }`**; dinheiro entra no caixa aberto (`RECEIPT_CASH` no fechamento); sobra vira troco ou crédito.
- `GET /v1/erp/parties/:id/carne` → carnê para imprimir (uma folha por parcela, com o valor, o vencimento e o Pix copia-e-cola quando o Financeiro tem cobrança).
- No PDV, **Receber fiado** (`pdv-receive`) busca o cliente e mostra as parcelas com os encargos.

## Ordem de produção simples (`feature: 'erp_production'`)

| Rota | Faz |
|---|---|
| ★ `PUT /v1/erp/products/:id/recipe` | `ERP_ADMIN` · **`{ yieldQty, components: [{ productId, qty }] }`** → `validateRecipe` (insumos estocáveis; o produto não é insumo dele mesmo) |
| ★ `POST /v1/erp/production-orders` | `ERP_ADMIN`/`STOCK` · **`{ productId, qty, warehouseId? }`** → 201 **`{ id, number, status: "PLANNED", needs }`** (`productionNeeds`) |
| ★ `POST /v1/erp/production-orders/:id/complete` | insumos disponíveis (409 `INSUFFICIENT_STOCK` com a lista) → saída dos insumos (`PRODUCTION_OUT`, FEFO quando têm lote) e entrada do produzido (`PRODUCTION_IN`) com o custo `productionUnitCost` → **`{ status: "DONE", unitCostCents }`** |
| `POST /v1/erp/production-orders/:id/cancel` | `PRODUCTION_FLOW`; nada mexe no estoque |

Tela `/erp/producao`: ordens do dia (padaria produz de manhã), "produzir de novo" a última.

## Planos, avisos e erros

Features `erp_commissions`, `erp_promotions`, `erp_production` (Pro e Business); lote/validade, vale-troca, troca e carnê em todos os planos. Avisos novos: `erp.lots.expiring`, `erp.receivables.overdue` (resumo diário ao `ERP_ADMIN`). Erros novos: `LOT_REQUIRED` · `LOT_EXPIRED` · `QTY_MULTIPLE` (400), `MIN_ORDER_VALUE` (422), violações de pagamento `VOUCHER_*`.

## Testes obrigatórios

- Comissão: regra mais específica, base líquida, devolução estorna, período pelo dia da entrega, vendedor só vê a dele.
- Lote: entrada sem lote 400, FEFO na venda, vencido não sai (409), vencendo.
- Promoção: leve 3 pague 2, porcentagem por categoria, fora do período não vale, a maior ganha.
- Vale-troca: devolução emite, PDV paga com o vale, saldo baixa, insuficiente/vencido recusados; troca com diferença a pagar e com crédito.
- Carnê: parcelas da venda a prazo, encargos de atraso, pagamento das mais antigas.
- Produção: insumos proporcionais, falta de insumo 409, custo do produzido.
- NFC-e do PDV pelo motor quando ligado, com o CPF.
