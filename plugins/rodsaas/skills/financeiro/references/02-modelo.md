# 02 · Modelo de dados

Todas as tabelas têm `organizationId` e **RLS com `FORCE`**, menos `FinChargeLookup` (busca pública da página de pagamento: só `tokenHash → organizationId, chargeId`) e `FinStripeAccountLookup` (webhook do Connect: `stripeAccountId → organizationId`), ambas com justificativa no README. Relações recebem o trigger `rodsaas_assert_same_org` (função da skill `module`). **Dinheiro em centavos** (`Int`; use `BigInt` só se a empresa puder passar de R$ 21 milhões num único valor — não na v1). Datas de calendário em `@db.Date`; instantes em `timestamptz` UTC. Ids `uuid(7)`.

## Configurações, papéis e estrutura

```prisma
model FinSettings {                         // uma por empresa (criada na ativação)
  organizationId          String   @id @db.Uuid
  timeZone                String   @default("America/Sao_Paulo")
  finePct                 Decimal  @default(2) @db.Decimal(5, 2)       // multa sugerida na baixa de atrasado
  monthlyInterestPct      Decimal  @default(1) @db.Decimal(5, 2)       // juros ao mês pro rata
  paymentApprovalAboveCents Int?   @default(500000)                    // null = sem aprovação
  reminderOffsets         Int[]    @default([-3, 0, 3, 7])             // régua de cobrança (dias do vencimento)
  reminderEmails          Boolean  @default(true)
  chargeMethods           String[] @default(["boleto", "pix", "card"]) // padrão ao cobrar
  financeEmail            String?                                      // reply-to das cobranças
  accountantEmail         String?
  stripeAccountId         String?                                      // conta conectada (acct_…)
  stripeAccountStatus     String?                                      // PENDING | RESTRICTED | ACTIVE | DISCONNECTED
  stripeCapabilities      Json     @default("{}")                      // { card_payments, boleto_payments, pix_payments }
  stripeFinAccountId      String?  @db.Uuid                            // conta financeira "Stripe"
  updatedAt               DateTime @updatedAt
}

model FinRole {
  organizationId String @db.Uuid
  userId         String @db.Uuid
  role           String                                                // FIN_ADMIN | FIN | VIEWER
  @@id([organizationId, userId])
}

model FinAccount {
  id                  String    @id @default(uuid(7)) @db.Uuid
  organizationId      String    @db.Uuid
  name                String                                           // "Itaú PJ", "Caixa da loja"
  type                String                                           // CHECKING | SAVINGS | CASH | CREDIT_CARD | INVESTMENT | STRIPE
  bankCode            String?                                          // 341
  agency              String?
  number              String?
  color               String?
  openingBalanceCents Int       @default(0)
  openingDate         DateTime  @db.Date
  cardClosingDay      Int?                                             // cartão: dia de fechamento
  cardDueDay          Int?                                             // cartão: dia de vencimento da fatura
  ofxBankId           String?                                          // para reconhecer o arquivo certo na importação
  ofxAccountId        String?
  archivedAt          DateTime?
  createdAt           DateTime  @default(now())
}

model FinCategory {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  key            String?                                               // do plano padrão (defaultCategories)
  name           String
  type           String                                                // INCOME | EXPENSE
  parentId       String?   @db.Uuid                                    // 2 níveis
  dreGroup       String                                                // DRE_GROUPS (financeiro-lib)
  archivedAt     DateTime?
  @@unique([organizationId, key])
}

model FinCostCenter {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  name           String
  archivedAt     DateTime?
}

model FinContact {
  id              String    @id @default(uuid(7)) @db.Uuid
  organizationId  String    @db.Uuid
  kind            String    @default("BOTH")                           // CUSTOMER | SUPPLIER | BOTH
  name            String
  document        String?                                              // só dígitos; CPF/CNPJ válido
  email           String?
  phone           String?
  address         Json?                                                // { cep, street, number, complement, district, city, state }
  pixKey          String?                                              // fornecedor
  notes           String?
  crmContactId    String?   @db.Uuid
  crmCompanyId    String?   @db.Uuid
  stripeCustomerId String?                                             // cliente na conta conectada
  archivedAt      DateTime?
  createdAt       DateTime  @default(now())
  @@unique([organizationId, document])
}
```

## Lançamentos e baixas

```prisma
model FinEntry {
  id               String    @id @default(uuid(7)) @db.Uuid
  organizationId   String    @db.Uuid
  type             String                                              // INCOME | EXPENSE
  description      String
  contactId        String?   @db.Uuid
  categoryId       String    @db.Uuid                                  // tipo da categoria = tipo do lançamento
  costCenterId     String?   @db.Uuid
  accountId        String?   @db.Uuid                                  // conta prevista (a baixa diz a real)
  amountCents      Int                                                 // > 0, sempre positivo (o tipo dá o sinal)
  paidCents        Int       @default(0)                               // principal quitado (cache das baixas não estornadas)
  dueDate          DateTime  @db.Date
  competenceDate   DateTime  @db.Date                                  // padrão = vencimento
  issueDate        DateTime? @db.Date
  documentNumber   String?
  notes            String?
  tags             String[]  @default([])
  attachments      String[]  @default([]) @db.Uuid                     // File ids
  installmentGroup String?   @db.Uuid                                  // mesmo id para as parcelas
  installmentNumber Int?
  installmentTotal Int?
  recurrenceId     String?   @db.Uuid
  canceledAt       DateTime?
  cancelReason     String?
  approvalStatus   String?                                             // null | PENDING | APPROVED | REJECTED
  approvalBy       String?   @db.Uuid
  approvalAt       DateTime?
  approvalComment  String?
  source           Json?                                               // { app: "crm", id, url } (integrações)
  createdById      String    @db.Uuid
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  @@index([organizationId, type, dueDate])
  @@index([organizationId, competenceDate])
}

model FinPayment {                          // baixa
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  entryId        String    @db.Uuid
  accountId      String    @db.Uuid
  date           DateTime  @db.Date
  amountCents    Int                                                 // principal pago em dinheiro
  discountCents  Int       @default(0)
  interestCents  Int       @default(0)
  fineCents      Int       @default(0)
  method         String?                                             // PIX | BOLETO | CARD | TRANSFER | CASH | DEBIT | OTHER
  receiptFileId  String?   @db.Uuid
  bankTransactionId String? @db.Uuid                                 // conciliação
  chargeId       String?   @db.Uuid                                  // veio de uma cobrança
  reversedAt     DateTime?
  reversedById   String?   @db.Uuid
  createdById    String?   @db.Uuid                                  // null = automático (webhook)
  createdAt      DateTime  @default(now())
  @@index([organizationId, accountId, date])
}

model FinTransfer {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  fromAccountId  String   @db.Uuid
  toAccountId    String   @db.Uuid
  date           DateTime @db.Date
  amountCents    Int
  description    String?
  stripePayoutId String?  @unique                                     // repasse da Stripe para o banco
  fromTransactionId String? @db.Uuid                                  // conciliado no extrato de origem
  toTransactionId   String? @db.Uuid
  createdById    String?  @db.Uuid
  createdAt      DateTime @default(now())
}

model FinRecurrence {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  template       Json                                                // campos do lançamento (type, description, contactId, categoryId, costCenterId, accountId, amountCents)
  start          DateTime  @db.Date
  interval       String                                              // INTERVALS do financeiro-lib
  every          Int       @default(1)
  count          Int?
  until          DateTime? @db.Date
  generatedUntil DateTime? @db.Date                                  // até onde já virou lançamento
  active         Boolean   @default(true)
  createdAt      DateTime  @default(now())
}

model FinEntryEvent {                       // histórico (nunca editado)
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  entryId        String   @db.Uuid
  kind           String                                              // CREATED | UPDATED | PAID | REVERSED | CANCELED | APPROVED | REJECTED | CHARGED | REMINDED
  data           Json?                                               // { from, to } dos campos mudados
  actorId        String?  @db.Uuid
  at             DateTime @default(now())
}
```

**Saldo de conta** (`accountBalance`): `openingBalanceCents` + Σ baixas não estornadas daquela conta (`+ (amount + interest + fine)` em receita, `−` em despesa) ± transferências. Calculado por consulta (índice por conta e data); nunca um campo "saldo". `paidCents` do lançamento é cache **atualizado na mesma transação** da baixa/estorno e conferido por teste (Σ baixas = `paidCents`).

**Situação** (`entryStatus`) é calculada na leitura: o "vencido" aparece no dia seguinte ao vencimento sem job nenhum. Filtro `status=OVERDUE` na API vira `dueDate < hoje AND paidCents < amountCents AND canceledAt IS NULL`.

## Conciliação

```prisma
model FinStatementImport {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  accountId      String   @db.Uuid
  fileName       String
  format         String                                              // OFX | CSV
  fileId         String?  @db.Uuid
  imported       Int
  duplicates     Int
  statementBalanceCents Int?                                         // LEDGERBAL do OFX
  statementBalanceDate  DateTime? @db.Date
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())
}

model FinBankTransaction {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  accountId      String   @db.Uuid
  importId       String   @db.Uuid
  fitId          String
  date           DateTime @db.Date
  amountCents    Int                                                 // com sinal (+ crédito, − débito)
  memo           String
  name           String?
  status         String   @default("PENDING")                        // PENDING | RECONCILED | IGNORED
  ignoreReason   String?
  ruleId         String?  @db.Uuid                                   // regra que sugeriu categoria
  reconciledAt   DateTime?
  reconciledById String?  @db.Uuid
  @@unique([accountId, fitId])
  @@index([organizationId, accountId, status, date])
}

model FinRule {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String
  priority       Int      @default(100)
  match          Json                                                // { contains: [], sign: "in"|"out", minCents, maxCents, accountId? }
  set            Json                                                // { categoryId, contactId?, costCenterId? }
  active         Boolean  @default(true)
  hits           Int      @default(0)
}
```

## Cobranças

```prisma
model FinCharge {
  id                 String    @id @default(uuid(7)) @db.Uuid
  organizationId     String    @db.Uuid
  entryId            String    @db.Uuid                              // o lançamento a receber
  contactId          String?   @db.Uuid
  amountCents        Int                                             // o que falta receber no momento da cobrança (+ multa/juros na 2ª via)
  methods            String[]                                        // boleto | pix | card
  dueDate            DateTime  @db.Date
  status             String    @default("PENDING")                   // PENDING | PROCESSING (boleto/Pix pago, aguardando confirmação) | PAID | EXPIRED | CANCELED | FAILED
  provider           String                                          // STRIPE | FAKE
  tokenHash          String    @unique                               // /pagar/<token>
  tokenEnc           String                                          // para repetir o mesmo link nos e-mails
  stripeCheckoutSessionId String?
  stripePaymentIntentId   String?
  boletoExpiresAfterDays  Int?
  paidMethod         String?
  paidAt             DateTime?
  feeCents           Int?                                            // tarifa da Stripe (balance transaction)
  applicationFeeCents Int?
  remindersSent      Int[]     @default([])                          // offsets já enviados
  subscriptionId     String?   @db.Uuid
  createdById        String?   @db.Uuid
  createdAt          DateTime  @default(now())
}

model FinChargeLookup {                     // sem RLS
  tokenHash      String @id
  organizationId String @db.Uuid
  chargeId       String @db.Uuid
}

model FinCustomerSubscription {             // cobrança recorrente de clientes
  id                   String    @id @default(uuid(7)) @db.Uuid
  organizationId       String    @db.Uuid
  contactId            String    @db.Uuid
  description          String                                        // "Mensalidade plano Ouro"
  amountCents          Int
  interval             String                                        // month | year
  categoryId           String    @db.Uuid
  costCenterId         String?   @db.Uuid
  method               String                                        // card | boleto
  dayOfMonth           Int?
  status               String    @default("PENDING")                 // PENDING (aguardando o cliente) | ACTIVE | PAST_DUE | CANCELED
  stripeSubscriptionId String?
  startDate            DateTime  @db.Date
  canceledAt           DateTime?
  createdAt            DateTime  @default(now())
}

model FinStripeAccountLookup {              // sem RLS: webhook do Connect acha a empresa pela conta
  stripeAccountId String @id
  organizationId  String @db.Uuid
}

model FinWebhookEvent {                     // idempotência (sem RLS, só ids)
  id         String   @id                                            // evt_…
  receivedAt DateTime @default(now())
}
```

## Conteúdo inicial (gancho `seedFinanceiro`, uma vez por empresa)

- `FinSettings` com os padrões; `FinRole` do owner como `FIN_ADMIN`.
- Plano de contas de `defaultCategories()` (com `key`, pai e grupo da DRE).
- Conta "Caixa" (tipo CASH, saldo 0, hoje) e centro de custo "Geral".
- Regras prontas (inativas, para a empresa ligar): "Tarifas" (`contains: ["tarifa", "pacote servicos", "cesta"]`, saída → Tarifas bancárias), "Juros/IOF" (`["iof", "juros", "encargos"]`, saída → Juros e multas pagos), "Rendimentos" (`["rendimento", "rend pago"]`, entrada → Rendimentos).

## Testes obrigatórios

- RLS: outra empresa não lê nenhuma tabela do Financeiro.
- Dinheiro: schema sem `Float`; API recusa `amountCents` não inteiro (400).
- Σ baixas não estornadas = `paidCents` depois de baixar, estornar e baixar de novo.
- `@@unique([accountId, fitId])`: importar o mesmo OFX duas vezes não cria transação nova.
- Ativar o app duas vezes não duplica o plano de contas.
