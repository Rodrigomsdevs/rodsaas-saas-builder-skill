# 02 · Modelo de dados

Todas as tabelas têm `organizationId` e **RLS com `FORCE`**; relações com o trigger `rodsaas_assert_same_org`. Dinheiro em centavos (`Int`); quantidade `Decimal(14,3)` (nunca `Float`); datas de calendário `@db.Date`; instantes `timestamptz`. Ids `uuid(7)`.

```prisma
model ErpSettings {
  organizationId      String  @id @db.Uuid
  allowNegativeStock  Boolean @default(false)
  maxDiscountPct      Decimal @default(10) @db.Decimal(5, 2)    // SELLER/CASHIER; acima só ERP_ADMIN
  quoteValidityDays   Int     @default(7)
  defaultWarehouseId  String? @db.Uuid
  defaultPriceTableId String? @db.Uuid
  nextOrderNumber     Int     @default(1)                      // V-0001
  nextPurchaseNumber  Int     @default(1)                      // C-0001
  nextReturnNumber    Int     @default(1)                      // D-0001
  nextInternalBarcode Int     @default(1)                      // internalBarcode(seq)
  receiptHeader       String?                                  // cabeçalho do comprovante do PDV
  updatedAt           DateTime @updatedAt
}

model ErpRole {
  organizationId String   @db.Uuid
  userId         String   @db.Uuid
  roles          String[]                                      // ERP_ADMIN | SELLER | STOCK | CASHIER | VIEWER
  @@id([organizationId, userId])
}

model ErpCategory { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; parentId String? @db.Uuid; @@unique([organizationId, parentId, name]) }

model ErpProduct {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  type           String                                        // SIMPLE | VARIANT (pai) | VARIATION (filha) | KIT | SERVICE
  parentId       String?   @db.Uuid                            // VARIATION → o VARIANT
  variantKey     String?                                       // "azul|p" (variantCombinations)
  variantValues  Json?                                         // { Cor: "Azul", Tamanho: "P" }
  attributes     Json?                                         // VARIANT: [{ name, values }]
  name           String                                        // VARIATION: "Camiseta Azul / P" (nome do pai + label)
  description    String?
  categoryId     String?   @db.Uuid
  brand          String?
  unit           String    @default("UN")                      // UNITS do erp-lib
  sku            String?
  barcode        String?
  priceCents     Int?                                          // VARIATION: null = herda do pai
  costCents      Int?                                          // custo informado (SERVICE/KIT calculado) — o médio fica no saldo
  minStock       Decimal?  @db.Decimal(14, 3)
  maxStock       Decimal?  @db.Decimal(14, 3)
  photos         String[]  @default([]) @db.Uuid               // uploads; [0] = capa
  fiscal         Json?                                         // { ncm, cest, origin, taxUnit } — para a nota futura
  status         String    @default("ACTIVE")                  // ACTIVE | INACTIVE | ARCHIVED (variação que saiu da grade)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@unique([organizationId, sku])                              // índice parcial: WHERE sku IS NOT NULL
  @@unique([organizationId, barcode])                          // idem
  @@index([organizationId, parentId])
}

model ErpKitComponent {
  organizationId String  @db.Uuid
  kitId          String  @db.Uuid
  productId      String  @db.Uuid                              // SIMPLE ou VARIATION (kit dentro de kit fora da v1)
  qty            Decimal @db.Decimal(14, 3)
  @@id([kitId, productId])
}

model ErpPriceTable {
  id             String  @id @default(uuid(7)) @db.Uuid
  organizationId String  @db.Uuid
  name           String                                        // "Varejo", "Atacado"
  kind           String  @default("PERCENT")                   // BASE (o preço do produto) | PERCENT
  pct            Decimal @default(0) @db.Decimal(6, 2)         // −10 = 10% menor
  isDefault      Boolean @default(false)
  archivedAt     DateTime?
}
model ErpProductPrice {                                        // preço fixo do produto numa tabela (override)
  organizationId String @db.Uuid
  productId      String @db.Uuid
  tableId        String @db.Uuid
  priceCents     Int
  @@id([productId, tableId])
}
model ErpPriceTier {                                           // faixas por quantidade (validateTiers)
  id             String  @id @default(uuid(7)) @db.Uuid
  organizationId String  @db.Uuid
  productId      String  @db.Uuid
  minQty         Decimal @db.Decimal(14, 3)
  priceCents     Int
  @@unique([productId, minQty])
}

model ErpWarehouse { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; code String; isDefault Boolean @default(false); archivedAt DateTime?; @@unique([organizationId, code]) }

model ErpStockMovement {                                       // IMUTÁVEL (trigger recusa UPDATE/DELETE)
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  productId      String   @db.Uuid                             // nunca VARIANT, KIT ou SERVICE
  warehouseId    String   @db.Uuid
  type           String                                        // MOVE_TYPES do erp-lib
  qty            Decimal  @db.Decimal(14, 3)                   // + entra, − sai
  unitCostCents  Int?                                          // entradas com custo (compra, entrada manual)
  balanceAfter   Decimal  @db.Decimal(14, 3)                   // saldo do depósito depois desta (para o extrato)
  avgCostAfter   Int?
  refType        String?                                       // ORDER | PDV_SALE | RETURN | PURCHASE | TRANSFER | INVENTORY | MANUAL
  refId          String?  @db.Uuid
  reason         String?
  actorId        String?  @db.Uuid
  at             DateTime @default(now())
  @@index([organizationId, productId, at])
}
model ErpStockBalance {                                        // derivado: só o serviço de estoque grava (FOR UPDATE)
  organizationId String  @db.Uuid
  productId      String  @db.Uuid
  warehouseId    String  @db.Uuid
  onHand         Decimal @default(0) @db.Decimal(14, 3)
  reserved       Decimal @default(0) @db.Decimal(14, 3)
  avgCostCents   Int     @default(0)                           // custo médio do produto neste depósito
  @@id([productId, warehouseId])
}

model ErpParty {
  id               String   @id @default(uuid(7)) @db.Uuid
  organizationId   String   @db.Uuid
  kinds            String[]                                   // CUSTOMER, SUPPLIER
  personType       String                                     // PF | PJ (pelo documento; sem documento = PF)
  name             String
  tradeName        String?
  document         String?                                    // só dígitos; único por empresa
  stateRegistration String?
  email            String?
  phone            String?
  address          Json?                                      // { cep, street, number, complement, district, city, uf }
  priceTableId     String?  @db.Uuid
  creditLimitCents Int?                                       // null = sem limite
  paymentTerms     Json?                                      // { method, installments, intervalDays }
  notes            String?
  finContactId     String?  @db.Uuid                          // Financeiro (pelo documento)
  crmContactId     String?  @db.Uuid
  archivedAt       DateTime?
  createdAt        DateTime @default(now())
  @@unique([organizationId, document])
}

model ErpOrder {
  id               String    @id @default(uuid(7)) @db.Uuid
  organizationId   String    @db.Uuid
  number           Int                                        // V-0001 (orçamento e pedido compartilham)
  status           String    @default("QUOTE")                // QUOTE | CONFIRMED | PICKING | DELIVERED | CANCELED (quoteStatus deriva EXPIRED)
  channel          String    @default("ORDER")                // COUNTER | ORDER | PDV | COMERCIAL
  customerId       String?   @db.Uuid                         // null = consumidor final
  sellerId         String?   @db.Uuid
  warehouseId      String    @db.Uuid
  priceTableId     String?   @db.Uuid
  discountPct      Decimal?  @db.Decimal(5, 2)
  discountCents    Int?
  freightCents     Int       @default(0)
  totals           Json                                       // orderTotals (cache, recalculado a cada mudança)
  payment          Json?                                      // { method, installments, firstDue } + schedule
  validUntil       DateTime? @db.Date                         // orçamento
  notes            String?
  sourceRef        Json?                                      // { type: "COMERCIAL", proposalId } …
  pdvSessionId     String?   @db.Uuid
  confirmedAt      DateTime?
  deliveredAt      DateTime?
  canceledAt       DateTime?
  cancelReason     String?
  createdById      String    @db.Uuid
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  @@unique([organizationId, number])
}
model ErpOrderLine {
  id             String  @id @default(uuid(7)) @db.Uuid
  organizationId String  @db.Uuid
  orderId        String  @db.Uuid
  productId      String  @db.Uuid                              // SIMPLE, VARIATION, KIT ou SERVICE
  name           String                                        // congelado na venda
  qty            Decimal @db.Decimal(14, 3)
  unitCents      Int                                           // unitPrice no momento (ou o digitado por quem pode)
  priceSource    String                                        // table | tier | manual
  discountPct    Decimal? @db.Decimal(5, 2)
  discountCents  Int?
  netCents       Int                                           // depois do desconto geral rateado (para devolução e nota)
  costCents      Int?                                          // custo médio no momento da entrega (margem da venda)
  returnedQty    Decimal @default(0) @db.Decimal(14, 3)
  position       Int
}
model ErpPayment {                                             // PDV e vendas pagas na hora
  id             String @id @default(uuid(7)) @db.Uuid
  organizationId String @db.Uuid
  orderId        String @db.Uuid
  method         String                                        // PAYMENT_METHODS
  amountCents    Int
  changeCents    Int    @default(0)                            // só CASH
  sessionId      String? @db.Uuid
}

model ErpReturn { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; number Int; orderId String @db.Uuid; lines Json /* [{ lineId, qty, refundCents }] */; refundCents Int; refundMethod String /* CASH | CREDIT | ORIGINAL */; reason String?; sessionId String? @db.Uuid; createdById String @db.Uuid; createdAt DateTime @default(now()) }

model ErpRegister { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; warehouseId String @db.Uuid; archivedAt DateTime? }
model ErpCashSession {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  registerId     String    @db.Uuid
  operatorId     String    @db.Uuid
  openingCents   Int
  openedAt       DateTime  @default(now())
  closedAt       DateTime?
  expectedCents  Int?                                          // cashExpected no fechamento
  countedCents   Int?
  diffCents      Int?
  summary        Json?                                         // por forma de pagamento: vendas, devoluções, total
  // índices únicos parciais (migration): um aberto por caixa e um aberto por pessoa → WHERE closedAt IS NULL
}
model ErpCashMovement { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; sessionId String @db.Uuid; type String /* SALE_CASH | SUPPLY | WITHDRAWAL | REFUND_CASH */; amountCents Int; reason String?; refId String? @db.Uuid; actorId String @db.Uuid; at DateTime @default(now()) }

model ErpPurchase {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  number         Int                                           // C-0001
  supplierId     String    @db.Uuid
  warehouseId    String    @db.Uuid
  status         String    @default("DRAFT")                   // DRAFT | SENT | PARTIAL | RECEIVED | CANCELED
  freightCents   Int       @default(0)
  otherCents     Int       @default(0)
  expectedAt     DateTime? @db.Date
  payment        Json?
  notes          String?
  createdById    String    @db.Uuid
  createdAt      DateTime  @default(now())
  @@unique([organizationId, number])
}
model ErpPurchaseLine { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; purchaseId String @db.Uuid; productId String @db.Uuid; qty Decimal @db.Decimal(14, 3); unitCostCents Int; receivedQty Decimal @default(0) @db.Decimal(14, 3) }
model ErpReceipt { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; purchaseId String @db.Uuid; lines Json /* [{ lineId, qty, landedUnitCents }] */; extraCents Int; createdById String @db.Uuid; createdAt DateTime @default(now()) }

model ErpInventory { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; warehouseId String @db.Uuid; status String @default("OPEN") /* OPEN | APPLIED | CANCELED */; counts Json @default("[]") /* [{ productId, counted, by, at }] */; appliedAt DateTime?; adjustments Json?; createdById String @db.Uuid; createdAt DateTime @default(now()) }
```

## Regras do banco

- **Movimentação imutável**: trigger recusa `UPDATE`/`DELETE` em `ErpStockMovement`. Corrigir = movimentação de ajuste.
- **Saldo só pelo serviço** (`stockService.move(tx, …)`): `SELECT … FROM "ErpStockBalance" WHERE productId = ANY(...) FOR UPDATE` (ordem fixa por id para não travar em ciclo), confere `canTakeOut`, grava a movimentação com `balanceAfter`, atualiza `onHand`/`reserved`/`avgCostCents`. Nenhum outro código grava saldo.
- **Kit e serviço não têm saldo**; o pai `VARIANT` também não (as variações têm).
- **Numeração** sem buraco nem repetição: `UPDATE "ErpSettings" SET "nextOrderNumber" = "nextOrderNumber" + 1 RETURNING …` na mesma transação.
- **SKU e código de barras** únicos por empresa (índices parciais com `WHERE … IS NOT NULL`): repetido → 409 `SKU_TAKEN` / `BARCODE_TAKEN`.
- **Pedido entregue** não muda (trigger, menos `returnedQty` pelo serviço de devolução); orçamento e pedido confirmado mudam pelo serviço (`PATCH` só em `QUOTE`; em `CONFIRMED` volta a `QUOTE` antes — libera a reserva).
- **Sessão de caixa**: índices únicos parciais `(registerId) WHERE closedAt IS NULL` e `(operatorId) WHERE closedAt IS NULL`.
- **Documento** do cliente/fornecedor único por empresa (só dígitos).

## Conteúdo inicial (`seedErp`, uma vez, pelo `registerAppActivation`)

- `ErpSettings`; `ErpRole` do owner `["ERP_ADMIN"]`.
- Depósito "Principal" (`code: "PRI"`, padrão); tabela "Varejo" (`kind: BASE`, padrão); caixa "Caixa 1" no depósito Principal (só se o plano tiver `erp_pdv`; senão, ao ganhar a feature).
- Categorias de exemplo ("Geral").
- Nenhum produto de exemplo (o Início ensina com "Cadastre seu primeiro produto" e "Importar planilha").

## Testes obrigatórios

- RLS: outra empresa não lê nada do ERP.
- Movimentação não muda (trigger); saldo = soma das movimentações depois de 50 operações aleatórias (teste de propriedade).
- 20 vendas simultâneas do último item disponível → só uma passa, as outras 409 `INSUFFICIENT_STOCK`; saldo nunca negativo.
- Numeração: 10 pedidos simultâneos → números seguidos.
- Dois caixas abertos no mesmo terminal ou pela mesma pessoa → 409.
