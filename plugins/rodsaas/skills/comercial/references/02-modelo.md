# 02 · Modelo de dados

Todas as tabelas têm `organizationId` e **RLS com `FORCE`**, menos os lookups públicos `ComProposalLookup`, `ComSignerLookup` e `ComVerification` (só hash → ids; justificativa no README). Relações com o trigger `rodsaas_assert_same_org`. Dinheiro em centavos (`Int`); quantidade `Decimal(12,3)`; datas de calendário `@db.Date`; instantes `timestamptz`. Ids `uuid(7)`.

```prisma
model ComSettings {
  organizationId       String  @id @db.Uuid
  maxDiscountPct       Decimal @default(15) @db.Decimal(5, 2)   // acima disso, aprovação
  maxTotalCents        Int?                                     // acima disso, aprovação (opcional)
  proposalValidityDays Int     @default(15)
  nextProposalNumber   Int     @default(1)
  nextContractNumber   Int     @default(1)
  contractNoticeDays   Int     @default(30)
  envelopeExpiryDays   Int     @default(30)
  reminderEveryDays    Int     @default(3)
  requireSignerCode    Boolean @default(true)
  onAcceptCreateReceivables Boolean @default(true)              // Financeiro
  onAcceptCreateCharges     Boolean @default(false)
  defaultTerms         String?                                  // condições padrão da proposta
  updatedAt            DateTime @updatedAt
}

model ComRole {
  organizationId String @db.Uuid
  userId         String @db.Uuid
  role           String                                         // COM_ADMIN | SELLER | VIEWER
  @@id([organizationId, userId])
}

model ComTemplate {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  kind           String                                         // PROPOSAL | CONTRACT | AMENDMENT
  name           String
  bodyHtml       String                                         // sanitizado; variáveis validadas (validateTemplate)
  isDefault      Boolean  @default(false)
  system         Boolean  @default(false)                       // modelos prontos (não apaga; duplica para editar)
  archivedAt     DateTime?
  updatedAt      DateTime @updatedAt
}

model ComProposal {
  id               String    @id @default(uuid(7)) @db.Uuid
  organizationId   String    @db.Uuid
  number           Int                                          // P-0001 (todas as versões compartilham)
  version          Int       @default(1)
  previousId       String?   @db.Uuid
  supersededById   String?   @db.Uuid
  title            String
  ownerId          String    @db.Uuid                           // vendedor
  client           Json                                         // { name, companyName?, document?, email, phone? }
  crmDealId        String?   @db.Uuid
  crmContactId     String?   @db.Uuid
  templateId       String?   @db.Uuid
  items            Json                                         // [{ id, description, details?, qty, unit?, unitCents, discountPct?, discountCents?, recurring, optional, selected }]
  globalDiscountPct   Decimal? @db.Decimal(5, 2)
  globalDiscountCents Int?
  totals           Json                                         // proposalTotals (cache, recalculado a cada mudança)
  paymentPlan      Json?                                        // { kind, installments, downPaymentPct, firstDue } + schedule
  validUntil       DateTime? @db.Date
  notes            String?
  terms            String?
  attachments      String[]  @default([]) @db.Uuid
  approvalStatus   String?                                      // null | PENDING | APPROVED | REJECTED
  approvalReasons  Json?
  approvalBy       String?   @db.Uuid
  approvalComment  String?
  sentAt           DateTime?
  viewedAt         DateTime?                                    // 1ª visualização do cliente
  tokenHash        String?   @unique
  tokenEnc         String?
  acceptedAt       DateTime?
  acceptance       Json?                                        // { name, document, ip, userAgent, selectedOptionalIds, totals, documentSha256 }
  rejectedAt       DateTime?
  rejectionReason  String?
  canceledAt       DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  @@unique([organizationId, number, version])
}

model ComProposalView {                    // rastreio (1 linha por sessão do navegador)
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  proposalId     String   @db.Uuid
  sessionId      String                                         // aleatório no navegador do cliente
  firstAt        DateTime @default(now())
  lastAt         DateTime @default(now())
  seconds        Int      @default(0)                           // somado pelos pings a cada 15 s com a aba visível
  ip             String?
  userAgent      String?
}

model ComProposalComment {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  proposalId     String   @db.Uuid
  author         String                                         // nome do cliente ou do membro
  fromClient     Boolean
  body           String
  createdAt      DateTime @default(now())
}

model ComContract {
  id               String    @id @default(uuid(7)) @db.Uuid
  organizationId   String    @db.Uuid
  number           Int                                          // C-0001
  title            String
  ownerId          String    @db.Uuid
  proposalId       String?   @db.Uuid
  templateId       String?   @db.Uuid
  bodyHtml         String?                                      // texto renderizado (congelado ao enviar para assinatura)
  parties          Json                                         // [{ role: CONTRACTOR|CONTRACTED|INTERVENING, name, document, email }]
  valueCents       Int
  recurrence       String    @default("once")                   // once | month | year
  startDate        DateTime  @db.Date
  months           Int
  endDate          DateTime  @db.Date                           // contractTerm (atualizado na renovação)
  noticeDays       Int       @default(30)
  autoRenew        Boolean   @default(false)
  renewalMonths    Int?
  readjustIndex    String?                                      // "IPCA", "IGP-M" (texto)
  status           String    @default("DRAFT")                  // DRAFT | IN_REVIEW | AWAITING_SIGNATURE | SIGNED | CANCELED | TERMINATED (contractStatus deriva o resto)
  signedAt         DateTime?
  signedFileId     String?   @db.Uuid                           // PDF final (ou o PDF do contrato existente)
  existing         Boolean   @default(false)                    // cadastrado já assinado
  terminatedAt     DateTime? @db.Date
  terminationReason String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

model ComContractEvent {                   // renovações, reajustes, aditivos, encerramento (histórico)
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  contractId     String   @db.Uuid
  kind           String                                         // RENEWED | READJUSTED | AMENDMENT | TERMINATED | SIGNED | CREATED
  data           Json                                           // { from, to, pct, endDate… }
  actorId        String?  @db.Uuid
  at             DateTime @default(now())
}

model ComEnvelope {
  id               String    @id @default(uuid(7)) @db.Uuid
  organizationId   String    @db.Uuid
  title            String
  contractId       String?   @db.Uuid
  amendmentOf      String?   @db.Uuid
  sourceFileId     String?   @db.Uuid                           // PDF avulso
  documentFileId   String    @db.Uuid                           // PDF enviado (congelado)
  documentSha256   String                                       // do PDF enviado
  finalFileId      String?   @db.Uuid                           // PDF + folha de assinaturas
  finalSha256      String?
  verificationCode String?   @unique                            // verificationCode(sha256(documentSha256 + id)) — vai impresso no manifesto (06-assinatura.md)
  status           String    @default("IN_PROGRESS")            // envelopeStatus
  expiresAt        DateTime
  canceledAt       DateTime?
  completedAt      DateTime?
  createdById      String    @db.Uuid
  createdAt        DateTime  @default(now())
}

model ComSigner {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  envelopeId     String    @db.Uuid
  name           String
  email          String
  document       String?                                         // exigido se requireDocument
  requireDocument Boolean  @default(true)
  role           String                                          // SIGNER | WITNESS | APPROVER
  order          Int       @default(1)
  status         String    @default("PENDING")                   // PENDING | SIGNED | REFUSED
  tokenHash      String    @unique
  tokenEnc       String                                          // para "copiar link" e lembretes
  otpHash        String?                                         // código atual (hash)
  otpCreatedAt   DateTime?
  otpAttempts    Int       @default(0)
  signedAt       DateTime?
  signedName     String?
  signedDocument String?
  ip             String?
  userAgent      String?
  refusedAt      DateTime?
  refusalReason  String?
  lastRemindedAt DateTime?
}

model ComEnvelopeEvent {                   // vira o manifesto (manifestLines)
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  envelopeId     String   @db.Uuid
  signerId       String?  @db.Uuid
  type           String                                          // CREATED | SENT | VIEWED | CODE_SENT | SIGNED | REFUSED | CANCELED | REMINDED | COMPLETED
  ip             String?
  userAgent      String?
  at             DateTime @default(now())
}

model ComProposalLookup {                  // sem RLS
  tokenHash      String @id
  organizationId String @db.Uuid
  proposalId     String @db.Uuid
}

model ComSignerLookup {                    // sem RLS
  tokenHash      String @id
  organizationId String @db.Uuid
  signerId       String @db.Uuid
}

model ComVerification {                    // sem RLS: verificação pública
  code           String @id                                    // XXXX-XXXX-XXXX
  sha256         String @unique
  organizationId String @db.Uuid
  envelopeId     String @db.Uuid
}
```

## Regras do banco

- **Numeração** sem buraco nem repetição: `UPDATE ComSettings SET nextProposalNumber = nextProposalNumber + 1 RETURNING …` na mesma transação (como o Suporte). Nova versão mantém o número.
- **Imutável**: trigger recusa `UPDATE` em `ComProposal` com `acceptedAt` não nulo (menos campos de integração) e em `ComEnvelope`/`ComSigner` de envelope `COMPLETED`; contrato `SIGNED` só muda `endDate`/`valueCents` por evento (renovação/reajuste) e `status` para `TERMINATED`.
- Proposta enviada (`sentAt`) só aceita mudanças de validade (`expire`/`validity`), cancelamento e campos de integração; o resto → 409 `PROPOSAL_LOCKED` (serviço) — a nova versão é o caminho.
- Tokens: 32 bytes aleatórios; o banco guarda o hash (busca) e o `tokenEnc` (AES-256-GCM com `COM_ENCRYPTION_KEY`, para reenviar o mesmo link); código por e-mail só como hash.

## Conteúdo inicial (`seedComercial`, uma vez)

- `ComSettings`; `ComRole` do owner como `COM_ADMIN`.
- Modelos prontos (`system: true`): "Proposta comercial" (capa com logo, apresentação, itens, plano de pagamento, condições, validade, aceite) e "Contrato de prestação de serviços" (partes com documento formatado, objeto, valor por extenso, vigência, renovação, reajuste, rescisão, foro, assinaturas) usando só variáveis permitidas.

## Testes obrigatórios

- RLS: outra empresa não lê nada do Comercial.
- Numeração: 10 propostas simultâneas → números seguidos; nova versão mantém o número.
- Proposta aceita não muda (serviço 409 e trigger); envelope concluído não muda.
- Lookups: o token cru não está no banco.
