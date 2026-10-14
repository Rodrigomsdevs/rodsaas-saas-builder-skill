# 03 · API

Padrão da base em tudo: `/v1`, tenant do token, `withTenant`, Zod estrito, RFC 9457, cursor, `Idempotency-Key` nos POST que criam, vendem ou movimentam. Dinheiro em centavos; quantidade número com até 3 casas (inteira nas unidades inteiras); datas `"YYYY-MM-DD"`. Toda rota exige papel no ERP (`ErpRole` ou owner): senão 403 `NOT_ERP_MEMBER`; sem o papel da ação → 403 `FORBIDDEN`. **Custo** (`costCents`, `avgCostCents`, `marginPct`, posição valorizada) só para `ERP_ADMIN`/`STOCK`; para os outros a API devolve `null` (nunca omite a chave).

Os formatos marcados com ★ fazem parte do **contrato testável** (`skills/verify/contract.json`, grupo `presets.erp`).

Erros novos: `NOT_ERP_MEMBER` (403), `SKU_TAKEN` · `BARCODE_TAKEN` · `DOCUMENT_TAKEN` (409), `INSUFFICIENT_STOCK` (409, `{ items: [{ productId, available, requested, missing }] }`), `INVALID_TRANSITION` (409, `{ from, to }`), `QUOTE_EXPIRED` (409), `CREDIT_LIMIT` (422, `{ availableCents }`), `DISCOUNT_ABOVE_LIMIT` (422, `{ maxDiscountPct }`), `RETURN_RULES` · `RECEIPT_RULES` (422, `violations`), `PRODUCT_NOT_FOUND` (404, leitura do PDV), `PAYMENT_RULES` (422, `violations`: `OVERPAY_NON_CASH`, `UNDERPAID`…), `SESSION_OPEN` (409, já há caixa aberto no terminal ou pela pessoa), `NO_OPEN_SESSION` (409), `SESSION_CLOSED` (409), `NOT_SELLABLE` (400, pai da grade ou inativo).

## Pessoa, configurações, depósitos e tabelas

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/erp/me` | — | **`{ roles, canSeeCost, maxDiscountPct, pending: { lowStock, toPick, openSession: { id, registerId } \| null } }`** |
| ★ `GET /v1/erp/settings` · `PATCH` | escrita `ERP_ADMIN` | `ErpSettings` (sem os contadores) |
| ★ `PUT /v1/erp/roles/:userId` | `ERP_ADMIN` | **`{ roles: [...] }`** (vazio = sem acesso; owner sempre `ERP_ADMIN` → 409 `OWNER_IS_ERP_ADMIN`) |
| ★ `GET /v1/erp/warehouses` · `POST` | escrita `ERP_ADMIN`, `limit: 'erpWarehouses'` | **`{ name, code }`** → `{ id, name, code, isDefault }` |
| ★ `GET /v1/erp/price-tables` · `POST` · `PATCH /:id` | escrita `ERP_ADMIN`, `feature: 'erp_pricing'` (a padrão existe sem) | **`{ name, kind: "PERCENT", pct }`** → `{ id, name, kind, pct, isDefault }` |

## Produtos

Visão de produto ★ (**produto**): `{ id, type, name, sku, barcode, unit, fractional, priceCents, costCents, avgCostCents, marginPct, categoryId, brand, minStock, maxStock, status, parentId, variantLabel, variantValues, attributes, variations: [{ id, name, variantLabel, variantValues, sku, barcode, priceCents, status, stock }], components: [{ productId, name, qty }], tiers: [{ minQty, priceCents }], prices: [{ tableId, priceCents }], stock: { onHand, reserved, available, byWarehouse: [{ warehouseId, onHand, reserved, available }] } }` — `fractional` vem da unidade; `stock` do kit = `kitAvailable` (sem `onHand`); serviço e pai da grade: `stock: null`.

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/erp/products` | — | `?q` (nome, SKU, código de barras), `type`, `status` (padrão `ACTIVE`), `categoryId`, `lowStock=1`, `sellable=1` (só o que vende: simples, variação, kit, serviço), cursor; item **`{ id, type, name, sku, barcode, unit, priceCents, costCents, status, parentId, variantLabel, stock: { onHand, reserved, available } \| null }`** (o pai da grade traz a soma das variações) |
| ★ `POST /v1/erp/products` | `ERP_ADMIN`, `limit: 'erpProducts'`, idempotente | **`{ type, name, unit, priceCents, sku?, barcode?, costCents?, minStock?, maxStock?, categoryId?, brand?, attributes?, components?, tiers?, prices?, fiscal?, description?, initialStock?: { qty, warehouseId?, unitCostCents? } }`** → `validateProduct` (400 com `errors` no caminho) → `VARIANT` cria as variações (`variantCombinations`, SKU `variantSku` se o pai tem SKU) → `initialStock` (só simples) vira movimentação `IN` "Saldo inicial" no depósito padrão, com o custo informado ou o `costCents` (nunca grava saldo direto) → 201 **produto** |
| ★ `GET /v1/erp/products/:id` · ★ `PATCH` | escrita `ERP_ADMIN` | produto; `PATCH` com `attributes` aplica `diffVariants` (cria as novas, **arquiva** as que saíram — com movimento ou não, nunca apaga) → **produto** + `{ variantsChange: { created, archived } }` |
| ★ `PATCH /v1/erp/products/:id/variations/:variationId` | `ERP_ADMIN` | `{ sku?, barcode?, priceCents? (null = herda), status? }` |
| ★ `POST /v1/erp/products/:id/barcode` | `ERP_ADMIN` | gera o código interno (`internalBarcode(next)`) se o produto/variação não tem → **`{ barcode }`** |
| ★ `GET /v1/erp/price` | — | **`?productId&qty&tableId?&customerId?`** → **`{ unitCents, source: "table" \| "tier", tier, tableId }`** (`unitPrice`; tabela = a pedida, senão a do cliente, senão a padrão) |
| `POST /v1/erp/products/import` · `GET …/export` | `ERP_ADMIN` | CSV (simples e grade, com prévia e relatório de linhas com problema) |
| `POST /v1/erp/products/reprice` | `ERP_ADMIN` | `{ filter: { categoryId?, brand? }, pct, tableId? }` com `preview: true` primeiro |
| `POST /v1/erp/labels` | — | `{ items: [{ productId, copies }], layout }` → PDF de etiquetas (código de barras, nome, preço) |

## Estoque

| Rota | Config | Faz |
|---|---|---|
| ★ `POST /v1/erp/stock/movements` | `ERP_ADMIN`/`STOCK`, idempotente | **`{ type: "IN" \| "OUT" \| "ADJUST", productId, warehouseId, qty, unitCostCents?, reason? }`** (`ADJUST` com `qty` negativo ou positivo; `IN` com custo atualiza o médio) → `canTakeOut` (409 `INSUFFICIENT_STOCK`) → 201 **`{ movement: { id, type, qty, balanceAfter, avgCostAfter }, balance: { onHand, reserved, available, avgCostCents } }`**; kit/serviço/pai → 400 `NOT_STOCKABLE` |
| ★ `GET /v1/erp/stock` | — | `?warehouseId&q&lowStock=1`, cursor → posição **`{ data: [{ productId, name, sku, warehouseId, onHand, reserved, available, minStock, avgCostCents, valueCents }], meta: { totalValueCents } }`** (custo e valor `null` para quem não vê custo) |
| ★ `GET /v1/erp/products/:id/movements` | — | extrato: **`[{ id, at, type, qty, balanceAfter, warehouseId, refType, refId, reason, actor }]`** |
| ★ `POST /v1/erp/stock/transfers` | `ERP_ADMIN`/`STOCK` | **`{ fromWarehouseId, toWarehouseId, items: [{ productId, qty }], reason? }`** → `TRANSFER_OUT` + `TRANSFER_IN` na mesma transação (custo médio do de origem) → 201 `{ id, items }` |
| ★ `POST /v1/erp/inventories` · ★ `PUT /:id/counts` · ★ `POST /:id/apply` | `ERP_ADMIN`/`STOCK` | abrir `{ warehouseId }` → `{ id }`; contagens **`{ counts: [{ productId, counted }] }`** (soma por produto; repetido substitui); aplicar → `inventoryAdjustments` → movimentações `INVENTORY` → **`{ adjustments: [{ productId, expected, counted, diff }] }`** |
| ★ `GET /v1/erp/reorder` | `ERP_ADMIN`/`STOCK` | sugestão de compra: **`[{ productId, name, onHand, reserved, incoming, minStock, maxStock, suggestedQty, lastCostCents, supplierId }]`** (`reorderSuggestion`) |

## Clientes e fornecedores

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/erp/parties` · ★ `POST` · `PATCH /:id` | escrita conforme o papel (`01`) | **`{ kinds: ["CUSTOMER"] \| ["SUPPLIER"] \| ambos, name, document?, email?, phone?, address?, priceTableId?, creditLimitCents?, paymentTerms? }`** → documento com `documentType` (400 no campo), único (409 `DOCUMENT_TAKEN`) → 201 **`{ id, kinds, personType, name, document, email, priceTableId, creditLimitCents, openCents }`** (`openCents` = fiado/a prazo em aberto) |

## Vendas

Visão de pedido ★ (**pedido**): `{ id, number, code, status, channel, customer: { id, name, document } \| null, seller: { id, name } \| null, warehouseId, priceTableId, items: [{ id, productId, name, qty, unitCents, priceSource, discountPct, discountCents, grossCents, netCents, returnedQty }], totals: { subtotalCents, itemDiscountCents, globalDiscountCents, freightCents, totalCents }, payment: { method, installments, schedule: [{ number, amountCents, dueDate }] } \| null, payments: [{ method, amountCents, changeCents }], validUntil, createdAt, confirmedAt, deliveredAt, canceledAt }` — `code` = "V-0001"; `status` com `quoteStatus` (orçamento vencido → `EXPIRED`).

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/erp/orders` | — | `?status` (vários), `channel`, `customerId`, `sellerId`, período, `q` (número, cliente), cursor; `SELLER` só os próprios |
| ★ `POST /v1/erp/orders` | `ERP_ADMIN`/`SELLER`, idempotente | **`{ status?: "QUOTE" \| "CONFIRMED", customerId?, priceTableId?, warehouseId?, items: [{ productId, qty, unitCents?, discountPct?, discountCents? }], discountPct?, discountCents?, freightCents?, payment?: { method: "CASH" \| "PIX" \| "CREDIT" \| "DEBIT" \| "BOLETO" \| "ON_ACCOUNT" \| "VOUCHER", installments?, firstDue? }, validUntil?, notes? }`** → `validateLines` (400 com `items.N.campo`), produto vendável (400 `NOT_SELLABLE`), preço de cada linha pelo `unitPrice` quando `unitCents` não vem (`priceSource`), preço digitado diferente só `ERP_ADMIN` (`manual`), `orderTotals`; desconto efetivo acima de `maxDiscountPct` para `SELLER` → 422 `DISCOUNT_ABOVE_LIMIT`; `CONFIRMED` já reserva (como `/confirm`) → 201 **pedido** |
| ★ `PATCH /v1/erp/orders/:id` | escrita | só `QUOTE` (senão 409 `INVALID_TRANSITION`); recalcula |
| ★ `POST /v1/erp/orders/:id/confirm` | escrita | `QUOTE` vencido → 409 `QUOTE_EXPIRED` (renovar com `PATCH { validUntil }`); `creditCheck` quando a forma é `BOLETO` ou `ON_ACCOUNT` (422 `CREDIT_LIMIT`); estoque disponível de cada linha (kit pelos componentes) → 409 `INSUFFICIENT_STOCK` com a lista; **reserva** → **pedido** `CONFIRMED` |
| ★ `POST /v1/erp/orders/:id/pick` · ★ `/deliver` · ★ `/cancel` | `ERP_ADMIN`/`STOCK` (entregar também `SELLER`) | `canTransition` (409 `INVALID_TRANSITION`); entregar = baixa (`SALE`, kit pelo `explodeKit`) + tira a reserva + custo da linha + contas a receber no Financeiro; cancelar (`{ reason }`) = libera a reserva |
| ★ `POST /v1/erp/orders/:id/returns` | `ERP_ADMIN`/`SELLER`/`STOCK` | **`{ items: [{ lineId, qty }], refundMethod: "CASH" \| "CREDIT" \| "ORIGINAL", reason? }`** → só `DELIVERED` (senão 409 `INVALID_TRANSITION`); `returnPlan` (422 `RETURN_RULES`) → `RETURN` no estoque (custo da linha) → 201 **`{ id, number, refundCents, items }`** |
| `GET /v1/erp/orders/:id/pdf` · `POST /:id/email` · `POST /:id/duplicate` | leitura / escrita | orçamento/pedido em PDF (fila), e-mail ao cliente, duplicar como orçamento |

## PDV

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/erp/registers` · `POST` | escrita `ERP_ADMIN`, `limit: 'erpRegisters'` | caixas `{ id, name, warehouseId, openSession: { id, operator } \| null }` |
| ★ `POST /v1/erp/pdv/sessions` | `CASHIER`/`ERP_ADMIN`, `feature: 'erp_pdv'` | **`{ registerId, openingCents }`** → já aberto no caixa ou pela pessoa → 409 `SESSION_OPEN` → 201 **sessão** `{ id, registerId, operatorId, openingCents, openedAt, closedAt }` |
| ★ `GET /v1/erp/pdv/sessions/current` | — | a sessão aberta da pessoa ou 404 |
| ★ `GET /v1/erp/pdv/lookup` | `CASHIER`/`ERP_ADMIN` | **`?code=`** (código de barras exato, SKU exato, ou busca por nome com `q`) → **`{ product: { id, name, sku, barcode, unit, fractional, priceCents, available, photoUrl } }`**; não achou → 404 `PRODUCT_NOT_FOUND` |
| ★ `POST /v1/erp/pdv/sales` | `CASHIER`/`ERP_ADMIN`, idempotente (`Idempotency-Key` obrigatório: clique duplo não vende duas vezes) | **`{ sessionId, items: [{ productId, qty }], customerId?, discountCents?, payments: [{ method, amountCents }] }`** → sessão aberta e da pessoa (409 `NO_OPEN_SESSION`); preço pelo `unitPrice` (tabela do cliente); `settlePayments` (422 `PAYMENT_RULES`, `violations` com `OVERPAY_NON_CASH` · `UNDERPAID` (falta pagar) · `CUSTOMER_REQUIRED` (fiado sem cliente)); fiado com `creditCheck`; estoque (409 `INSUFFICIENT_STOCK`) → pedido `DELIVERED` canal `PDV`, baixa, pagamentos, `SALE_CASH` (dinheiro menos o troco) → 201 **`{ order: pedido, changeCents, receiptUrl }`** |
| ★ `POST /v1/erp/pdv/sessions/:id/movements` | dono da sessão ou `ERP_ADMIN` | **`{ type: "SUPPLY" \| "WITHDRAWAL", amountCents, reason }`** (sangria acima do esperado → 422 `PAYMENT_RULES`/`WITHDRAWAL_TOO_HIGH`) |
| ★ `POST /v1/erp/pdv/sessions/:id/close` | dono ou `ERP_ADMIN` | **`{ countedCents }`** (fechamento cego: o esperado só aparece na resposta) → `cashExpected` + `closeCash` → **`{ expectedCents, countedCents, diffCents, status: "OK" \| "SHORT" \| "OVER", summary: { [method]: { salesCents, refundsCents, count } } }`**; fechada não aceita venda (409 `SESSION_CLOSED`); diferença ≠ 0 → aviso `erp.cash.difference` aos `ERP_ADMIN` |
| `GET /v1/erp/pdv/receipts/:orderId` | — | comprovante não fiscal (HTML de 80 mm para imprimir; "Documento sem valor fiscal") |

## Compras

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/erp/purchases` · ★ `POST` | `ERP_ADMIN`/`STOCK`, `feature: 'erp_purchases'` | **`{ supplierId, warehouseId?, items: [{ productId, qty, unitCostCents }], freightCents?, otherCents?, expectedAt?, payment? }`** → 201 **compra** `{ id, number, code, status, supplier, items: [{ id, productId, name, qty, unitCostCents, receivedQty }], freightCents, otherCents, totalCents }` (`code` = "C-0001") |
| ★ `POST /v1/erp/purchases/:id/receive` | idem | **`{ items: [{ lineId, qty }], extraCents? }`** (frete/despesas deste recebimento; padrão: proporcional ao que falta) → `validateReceipt` (422 `RECEIPT_RULES` com `OVER_RECEIPT`) → `landedUnitCosts` → `PURCHASE` com custo → `averageCost` → status (`purchaseStatus`) → contas a pagar → **compra** |
| `POST /v1/erp/purchases/:id/send` · `/cancel` | idem | enviar ao fornecedor (e-mail com PDF); cancelar (só sem recebimento) |

## Relatórios

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/erp/reports/abc` | `feature: 'erp_reports'` | **`?from&to&by=revenue`** → **`{ rows: [{ productId, name, qty, valueCents, sharePct, cumulativePct, class }] }`** (`abcCurve` sobre as vendas entregues menos devoluções) |
| `GET /v1/erp/reports/sales` | idem | por dia, vendedor, cliente, produto, canal; margem só para quem vê custo |
| `GET /v1/erp/reports/stock` | idem | posição valorizada, giro, `daysOfStock`, parados há N dias |
| `GET /v1/erp/reports/cash` | idem | sessões com esperado, contado, diferença e formas |

## Jobs

| Job | Quando | Faz |
|---|---|---|
| `erp.stock.low` | 7 h | produtos que **cruzaram** o mínimo desde ontem → um aviso `erp.stock.low` por empresa (resumo) a `ERP_ADMIN`/`STOCK` |
| `erp.quotes.expiring` | 9 h | orçamentos que vencem amanhã → aviso ao vendedor |
| `erp.sessions.stale` | 2 h | caixa aberto há mais de 18 h → aviso ao operador e aos admins |
| `erp.pdf` / `erp.import` | sob demanda | PDFs de orçamento, pedido, compra e etiquetas; importação de CSV |

## Testes obrigatórios (API)

- Produtos: EAN inválido e SKU repetido; grade 2 × 3 cria 6 variações com SKU; mudar a grade arquiva sem apagar; código interno válido; custo `null` para `SELLER`/`CASHIER`.
- Preço: atacado −10%, faixa 10+ e 50+, o menor dos dois.
- Estoque: entrada com custo → médio; saída acima do disponível 409; transferência; inventário com ajuste; kit pelo componente.
- Vendas: totais com rateio e frete; confirmar reserva (disponível cai) e cancelar libera; entregar baixa e gera contas a receber (com o Financeiro); orçamento vencido 409; limite de crédito 422; desconto acima do limite para o vendedor 422; devolução parcial e acima do vendido 422.
- PDV: abrir (segundo caixa da mesma pessoa 409), vender com pagamento misto e troco, cartão acima do total 422, sangria, fechamento com diferença, venda em caixa fechado 409, clique duplo com a mesma chave não vende duas vezes.
- Compras: recebimento parcial com frete no custo e custo médio; receber a mais 422.
- Papéis: sem papel 403; `CASHIER` não cria produto; `SELLER` não vê pedido de outro.
