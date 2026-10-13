# Modelo de dados e regras

Todas as tabelas têm `organizationId` e **RLS com `FORCE`**, menos as de busca pública (`HelpdeskPortalLookup`, `HelpdeskTokenLookup`, `HelpdeskInboundLookup` e `HelpdeskApiKeyLookup`, explicadas abaixo). Relações recebem o trigger `rodsaas_assert_same_org` (função da skill `module`). Horários em `timestamptz` (UTC); o horário de atendimento usa o fuso da empresa.

## Configurações, filas e atendentes

```prisma
model HelpdeskSettings {                // uma por empresa (criada na instalação e em empresas novas)
  organizationId    String   @id @db.Uuid
  portalSlug        String   @unique              // /ajuda/<portalSlug>; único no sistema todo
  portalTitle       String                        // padrão: "Central de ajuda · <empresa>"
  portalTheme       Json     @default("{}")       // cor, logo (feature helpdesk_branding)
  showBranding      Boolean  @default(true)
  nextNumber        Int      @default(1)          // próximo número de chamado (ver "Numeração")
  visibility        String   @default("ALL")      // ALL | QUEUES
  agentsCanPublish  Boolean  @default(true)       // atendentes publicam artigos
  autoCloseDays     Int      @default(4)
  pendingReminderDays Int?   @default(3)          // lembra o cliente que não respondeu; null = não lembra
  pendingAutoSolveDays Int?                       // resolve sozinho depois de N dias aguardando; null = nunca
  timeZone          String   @default("America/Sao_Paulo")
  businessHours     Json     @default("{\"1\":[[\"08:00\",\"12:00\"],[\"13:00\",\"18:00\"]],\"2\":[[\"08:00\",\"12:00\"],[\"13:00\",\"18:00\"]],\"3\":[[\"08:00\",\"12:00\"],[\"13:00\",\"18:00\"]],\"4\":[[\"08:00\",\"12:00\"],[\"13:00\",\"18:00\"]],\"5\":[[\"08:00\",\"12:00\"],[\"13:00\",\"18:00\"]]}")
  businessOverrides Json     @default("{}")       // { "2026-12-24": [["08:00","12:00"]], "2026-12-31": [] }
  blockNationalHolidays Boolean @default(true)
  slaPolicy         Json?                         // { URGENT: { firstResponse, resolution, calendar }, ... } (helpdesk-lib DEFAULT_SLA ao ligar)
  csatEnabled       Boolean  @default(true)
  ticketFields      Json     @default("{\"version\":1,\"fields\":[],\"hidden\":[]}")   // esquema do forms-lib (campos do chamado)
  portalFieldIds    String[]                      // quais campos aparecem no formulário do portal
  spamBlocklist     String[]                      // e-mails e domínios bloqueados (@dominio.com)
  updatedAt         DateTime @updatedAt
}

model HelpdeskQueue {                   // fila (equipe)
  id               String   @id @default(uuid(7)) @db.Uuid
  organizationId   String   @db.Uuid
  name             String                        // "Suporte", "Financeiro"
  description      String?
  assignment       String   @default("MANUAL")   // MANUAL | ROUND_ROBIN | LOAD
  maxOpenPerAgent  Int?                          // limite de abertos por atendente na distribuição
  isDefault        Boolean  @default(false)
  position         String
  createdAt        DateTime @default(now())
  deletedAt        DateTime?
  @@unique([organizationId, name])
}

model HelpdeskAgent {                   // membro que atende
  organizationId   String   @db.Uuid
  userId           String   @db.Uuid
  active           Boolean  @default(true)      // conta no limite helpdeskAgents
  available        Boolean  @default(true)      // recebe distribuição automática
  signature        String?                      // assinatura das respostas (HTML simples)
  lastAssignedAt   DateTime?
  createdAt        DateTime @default(now())
  @@id([organizationId, userId])
}
model HelpdeskQueueAgent { organizationId String @db.Uuid; queueId String @db.Uuid; userId String @db.Uuid; @@id([queueId, userId]) }

model HelpdeskPortalLookup {            // SEM RLS: o público chega só com o slug
  portalSlug     String @id
  organizationId String @unique @db.Uuid
}
```

## Contatos

```prisma
model HelpdeskContact {
  id              String   @id @default(uuid(7)) @db.Uuid
  organizationId  String   @db.Uuid
  email           String?                        // normalizado (helpdesk-lib normalizeEmail)
  name            String?
  phone           String?                        // 55DDDNÚMERO
  companyName     String?                        // preenchido pelo domínio quando não é e-mail pessoal (gmail, hotmail…)
  notes           String?
  blocked         Boolean  @default(false)       // e-mails dele vão direto para spam
  crmContactId    String?  @db.Uuid
  ticketsCount    Int      @default(0)
  lastTicketAt    DateTime?
  createdAt       DateTime @default(now())
  @@unique([organizationId, email])
  @@index([organizationId, phone])
}
```

## Chamados e mensagens

```prisma
enum HelpdeskStatus   { OPEN PENDING ON_HOLD SOLVED CLOSED }
enum HelpdeskPriority { LOW NORMAL HIGH URGENT }
enum HelpdeskChannel  { EMAIL PORTAL WIDGET API INTERNAL PHONE WHATSAPP }

model HelpdeskTicket {
  id                  String           @id @default(uuid(7)) @db.Uuid
  organizationId      String           @db.Uuid
  number              Int                                     // #1024, único na empresa
  subject             String
  status              HelpdeskStatus   @default(OPEN)
  priority            HelpdeskPriority @default(NORMAL)
  channel             HelpdeskChannel
  queueId             String           @db.Uuid
  assigneeId          String?          @db.Uuid
  requesterId         String           @db.Uuid               // HelpdeskContact
  inboxId             String?          @db.Uuid               // caixa por onde entrou/sai o e-mail
  tags                String[]
  fields              Json             @default("{}")         // respostas dos campos personalizados
  firstResponseAt     DateTime?                               // primeira resposta pública da equipe
  firstResponseDueAt  DateTime?
  resolutionDueAt     DateTime?
  slaPausedAt         DateTime?                               // aguardando cliente
  slaRemainingMin     Int?                                    // o que restava ao pausar (helpdesk-lib slaPause)
  slaBreachedAt       DateTime?                               // primeira vez que estourou (relatório)
  solvedAt            DateTime?
  closedAt            DateTime?
  lastCustomerReplyAt DateTime?
  lastAgentReplyAt    DateTime?
  reopenedCount       Int              @default(0)
  followUpOfId        String?          @db.Uuid               // chamado fechado que originou este
  mergedIntoId        String?          @db.Uuid
  spam                Boolean          @default(false)
  overPlan            Boolean          @default(false)        // criado acima do limite mensal
  csatRating          String?                                 // GOOD | BAD
  csatComment         String?
  csatAt              DateTime?
  createdById         String?          @db.Uuid               // atendente que abriu (canal INTERNAL/PHONE)
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  deletedAt           DateTime?
  @@unique([organizationId, number])
  @@index([organizationId, status, assigneeId])
  @@index([organizationId, queueId, status])
  @@index([organizationId, requesterId])
  @@index([organizationId, resolutionDueAt])
}

model HelpdeskTicketCc { organizationId String @db.Uuid; ticketId String @db.Uuid; contactId String @db.Uuid; @@id([ticketId, contactId]) }

enum HelpdeskMessageKind { PUBLIC NOTE SYSTEM }

model HelpdeskMessage {
  id              String              @id @default(uuid(7)) @db.Uuid
  organizationId  String              @db.Uuid
  ticketId        String              @db.Uuid
  kind            HelpdeskMessageKind
  authorKind      String                              // AGENT | CUSTOMER | SYSTEM
  authorUserId    String?             @db.Uuid        // atendente
  authorContactId String?             @db.Uuid        // cliente
  channel         HelpdeskChannel
  bodyHtml        String                              // sanitizado (sanitize-html, lista fechada de tags)
  bodyText        String                              // texto puro (busca, e-mail em texto, notificações)
  emailMessageId  String?                             // Message-ID (enviado ou recebido)
  emailMeta       Json?                               // { from, to, cc, subject, inReplyTo, references, auto } do e-mail recebido
  rawFileId       String?             @db.Uuid        // .eml original guardado no uploads (só e-mail recebido)
  hasRemoteImages Boolean             @default(false) // HTML tinha imagens externas (bloqueadas até "mostrar imagens")
  mentions        String[]                            // userIds mencionados (só NOTE)
  deliveryStatus  String?                             // QUEUED | SENT | FAILED (resposta pública por e-mail)
  createdAt       DateTime            @default(now())
  @@index([ticketId, createdAt])
  @@unique([organizationId, emailMessageId])
}

model HelpdeskAttachment { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; messageId String @db.Uuid; fileId String @db.Uuid; inline Boolean @default(false); contentId String? }

model HelpdeskTicketEvent {             // histórico (quem mudou o quê)
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  ticketId       String   @db.Uuid
  type           String                  // created, status, priority, queue, assignee, tags, fields, merged, sla_breached, csat, rule_fired, spam
  actorKind      String                  // AGENT | CUSTOMER | SYSTEM | RULE
  actorId        String?  @db.Uuid
  data           Json                    // { from, to, ruleName } legível sem joins
  createdAt      DateTime @default(now())
  @@index([ticketId, createdAt])
}
```

## Numeração

Número por empresa, sequencial, sem repetir e sem buracos por corrida: dentro da mesma transação que cria o chamado,

```sql
UPDATE "HelpdeskSettings" SET "nextNumber" = "nextNumber" + 1
WHERE "organizationId" = $1 RETURNING "nextNumber" - 1 AS number;
```

A linha fica travada até o commit, então dois chamados simultâneos recebem números diferentes e consecutivos (`@@unique([organizationId, number])` é a última palavra). Se a transação falhar, o número volta junto (sem buraco).

## Tokens do cliente e tabelas de busca

- Cada **destinatário** (solicitante e cada CC) tem o seu link `/chamado/<token>`: `HelpdeskTicketAccess (organizationId, ticketId, contactId, tokenHash @unique, tokenEnc, createdAt, lastSeenAt)`. A busca é pelo `hashToken()`; o `tokenEnc` (AES-256-GCM com `HELPDESK_ENCRYPTION_KEY`) existe só para repetir **o mesmo link** em todos os e-mails do chamado — nunca volta pela API interna. Mesclar chamados repontam os acessos para o chamado que ficou.
- **Meus chamados**: `HelpdeskPortalSession (organizationId, contactId, tokenHash, expiresAt)` criada pelo link mágico (24 h, pode abrir mais de uma vez — leitores de e-mail abrem links sozinhos).
- **CSAT**: pelo mesmo token do chamado; os links do e-mail abrem a página com a nota marcada e um botão **Enviar** (GET nunca grava — antivírus de e-mail visitam os links).
- Tabelas **sem RLS** (o público chega só com o segredo; toda leitura depois acontece em `withTenant(organizationId)`; justificativa no README):

```prisma
model HelpdeskTokenLookup   { tokenHash String @id; organizationId String @db.Uuid; kind String /* TICKET | SESSION */; refId String @db.Uuid }
model HelpdeskInboundLookup { inboundKeyHash String @id; organizationId String @db.Uuid; inboxId String @unique @db.Uuid }
model HelpdeskApiKeyLookup  { keyHash String @id; organizationId String @db.Uuid; apiKeyId String @unique @db.Uuid }
```

## Caixas de e-mail

```prisma
model HelpdeskInbox {
  id              String   @id @default(uuid(7)) @db.Uuid
  organizationId  String   @db.Uuid
  name            String                         // "Suporte"
  address         String                         // suporte@empresa.com.br (remetente das respostas)
  queueId         String   @db.Uuid              // fila dos chamados que entram por aqui
  mode            String                         // IMAP | WEBHOOK
  imapHost        String?; imapPort Int?; imapSecure Boolean @default(true); imapUser String?
  imapPasswordEnc String?                        // AES-256-GCM com HELPDESK_ENCRYPTION_KEY
  imapFolder      String   @default("INBOX")
  imapLastUid     BigInt?                        // até onde já leu (UIDVALIDITY junto)
  imapUidValidity BigInt?
  smtpHost        String?; smtpPort Int?; smtpSecure Boolean @default(true); smtpUser String?
  smtpPasswordEnc String?                        // sem SMTP próprio: sai pelo SMTP da base com Reply-To = address
  inboundKeyPrefix String?                       // webhook: /v1/public/helpdesk/inbound/<key>
  status          String   @default("OK")        // OK | AUTH_ERROR | ERROR
  lastError       String?
  lastCheckedAt   DateTime?
  createdAt       DateTime @default(now())
  @@unique([organizationId, address])
}

model HelpdeskInboundFailure {          // e-mail que não deu para processar: nunca some
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  inboxId        String   @db.Uuid
  rawFileId      String?  @db.Uuid
  error          String
  createdAt      DateTime @default(now())
  resolvedAt     DateTime?
}
```

## Macros, gatilhos, visões

```prisma
model HelpdeskMacro { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; ownerId String? @db.Uuid /* null = da empresa */; name String; bodyHtml String?; actions Json @default("[]"); usageCount Int @default(0); position String; createdAt DateTime @default(now()) }
model HelpdeskRule  { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; active Boolean @default(true); on String[]; conditions Json; actions Json; position String; firedCount Int @default(0); createdAt DateTime @default(now()) }
model HelpdeskView  { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; ownerId String? @db.Uuid; name String; filters Json; sort String @default("due"); position String }
```

Regras validadas com `validateRule`; execução com `runRules` (cada regra no máximo uma vez por evento; até 3 rodadas). Ações com efeito fora do chamado (`notify`, `add_note`, `auto_assign`) são executadas pelo service depois do commit.

## Base de conhecimento

```prisma
model HelpdeskCategory { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; slug String; description String?; icon String?; position String; @@unique([organizationId, slug]) }

model HelpdeskArticle {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  categoryId     String?  @db.Uuid
  title          String
  slug           String                          // único na empresa
  bodyJson       Json                            // documento do editor
  bodyHtml       String                          // renderizado e sanitizado (portal)
  bodyText       String                          // busca e trechos
  status         String   @default("DRAFT")      // DRAFT | PUBLISHED
  internal       Boolean  @default(false)        // só para a equipe (nunca no portal)
  publishedAt    DateTime?
  authorId       String   @db.Uuid
  views          Int      @default(0)
  helpfulYes     Int      @default(0)
  helpfulNo      Int      @default(0)
  searchVector   Unsupported("tsvector")?        // gerado (abaixo)
  position       String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?
  @@unique([organizationId, slug])
}
```

```sql
-- busca em português, sem diferenciar acento (unaccent é extensão confiável; crie na migration)
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE TEXT SEARCH CONFIGURATION pt_unaccent (COPY = portuguese);
ALTER TEXT SEARCH CONFIGURATION pt_unaccent ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
ALTER TABLE "HelpdeskArticle" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (setweight(to_tsvector('pt_unaccent', coalesce(title,'')), 'A') || setweight(to_tsvector('pt_unaccent', coalesce("bodyText",'')), 'B')) STORED;
CREATE INDEX "HelpdeskArticle_search" ON "HelpdeskArticle" USING gin ("searchVector");
-- chamados: busca por assunto e texto das mensagens (caixa de entrada)
ALTER TABLE "HelpdeskTicket" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;   -- atualizado pelo service ao criar/mensagem (assunto + últimas mensagens públicas)
CREATE INDEX "HelpdeskTicket_search" ON "HelpdeskTicket" USING gin ("searchVector");
```

Busca: `websearch_to_tsquery('pt_unaccent', $q)` ordenada por `ts_rank`; trecho com `excerpt` do `helpdesk-lib`. Se a criação da configuração falhar por permissão, use `portuguese` sem unaccent e normalize no app (`fold`), registrando no README.

## Integrações

`HelpdeskApiKey (id, organizationId, name, prefix, keyHash, createdById, lastUsedAt, revokedAt)` — mostrada uma vez (`newApiKey`), lista com o prefixo. `HelpdeskWebhook` e `HelpdeskWebhookDelivery`: iguais aos do Forms (`skills/forms/references/06-respostas-e-integracoes.md`).

## Travas de mesma empresa

| Tabela | Colunas com `rodsaas_assert_same_org` |
|---|---|
| `HelpdeskTicket` | `queueId`, `requesterId`, `inboxId`, `followUpOfId`, `mergedIntoId` |
| `HelpdeskTicketCc`, `HelpdeskTicketAccess` | `ticketId`, `contactId` |
| `HelpdeskMessage`, `HelpdeskTicketEvent` | `ticketId` (+ `authorContactId`) |
| `HelpdeskAttachment` | `messageId` |
| `HelpdeskQueueAgent` | `queueId` |
| `HelpdeskInbox` | `queueId` |
| `HelpdeskArticle` | `categoryId` |
| `HelpdeskWebhookDelivery` | `webhookId` |

Usuários (`assigneeId`, atendentes, autores) conferidos no service: membros da empresa e, para responsável, atendentes ativos.

## Conteúdo inicial

Na instalação (para cada empresa) e na criação de empresa nova: `HelpdeskSettings` (slug do portal a partir do nome da empresa, único com sufixo; `HelpdeskPortalLookup`), fila padrão **Suporte**, owner como **atendente** da fila, duas macros da empresa ("Pedir mais detalhes" e "Resolvido — algo mais?"), uma categoria "Primeiros passos" com um artigo de exemplo em **rascunho** (nada aparece no portal sem a empresa publicar). Nenhuma caixa de e-mail é criada sozinha: o portal e o widget já funcionam desde o início.
