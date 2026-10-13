# Modelo de dados e regras

Todos os models têm `organizationId` e **RLS com `FORCE`** (policy padrão da base). Toda relação entre tabelas do preset recebe o trigger `rodsaas_assert_same_org` (função da skill `module`, `references/02-backend.md`; crie se ainda não existir). Posições no quadro usam índice fracionário em `text COLLATE "C"`, como no `tarefas`. Dinheiro é `Int` em **centavos**, com teto de R$ 20 milhões por valor (`crm-lib MAX_CENTS`; o `Int` do Postgres vai até ~R$ 21,4 mi): valide com Zod (`max(MAX_CENTS)`) e devolva `VALIDATION_ERROR` no campo em vez de deixar o banco estourar. Se o cliente vender acima disso, migre as colunas de valor para `BigInt` e serialize como string. Datas "do dia" (`@db.Date`) são interpretadas no fuso da empresa.

Prefixo `Crm` em todos os models: não colide com módulos do usuário (`Client`, `Product`…) nem com outros presets.

### Travas de mesma empresa (no banco)

| Tabela | Colunas com `rodsaas_assert_same_org` |
|---|---|
| `CrmStage` | `pipelineId` → `CrmPipeline` |
| `CrmContactCompany` | `contactId`, `companyId` |
| `CrmDeal` | `pipelineId`, `stageId`, `companyId`, `contactId`, `sourceId`, `lostReasonId`, `leadId` |
| `CrmDealStageHistory` | `dealId`, `stageId` |
| `CrmDealItem` | `dealId`, `productId` |
| `CrmLead` | `contactId`, `companyId`, `sourceId`, `convertedDealId` |
| `CrmActivity`, `CrmNote`, `CrmAttachment`, `CrmEvent` | `dealId`, `leadId`, `contactId`, `companyId` |

Usuários (`ownerId`, `authorId`…) são conferidos no service (membro da empresa), como na base. Para os arrays de etiquetas, uma função própria:

```sql
CREATE OR REPLACE FUNCTION crm_assert_tags_same_org() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF cardinality(NEW."tagIds") > 0 AND EXISTS (
    SELECT 1 FROM unnest(NEW."tagIds") AS t(id)
    WHERE NOT EXISTS (SELECT 1 FROM "CrmTag" g WHERE g.id = t.id AND g."organizationId" = NEW."organizationId")
  ) THEN
    RAISE EXCEPTION 'etiqueta de outra empresa ou inexistente (%)', TG_TABLE_NAME USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
-- em CrmCompany, CrmContact, CrmDeal e CrmLead:
CREATE TRIGGER "CrmDeal_tags_same_org" BEFORE INSERT OR UPDATE OF "tagIds" ON "CrmDeal"
  FOR EACH ROW EXECUTE FUNCTION crm_assert_tags_same_org();
```

Excluir uma etiqueta remove o id dos arrays na mesma transação (`UPDATE ... SET "tagIds" = array_remove("tagIds", $1) WHERE $1 = ANY("tagIds")`).

## Configurações, funis e listas

```prisma
enum CrmVisibility { ALL OWN }

model CrmSettings {                       // uma linha por empresa (criada na instalação e em empresas novas)
  organizationId    String        @id @db.Uuid
  visibility        CrmVisibility @default(ALL)
  requireLostReason Boolean       @default(true)
  defaultPipelineId String?       @db.Uuid
  whatsappTemplate  String        @default("Olá {primeiro_nome}, tudo bem?")
  updatedAt         DateTime      @updatedAt
}

model CrmPipeline {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  name           String
  position       String
  archivedAt     DateTime?
  createdAt      DateTime  @default(now())
  @@unique([organizationId, name])
}

model CrmStage {
  id             String  @id @default(uuid(7)) @db.Uuid
  organizationId String  @db.Uuid
  pipelineId     String  @db.Uuid
  name           String
  position       String
  probability    Int     @default(0)        // 0–100
  rottingDays    Int?                       // null = sem alerta de parado
  @@index([pipelineId, position])
}

model CrmLostReason { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; position String; archivedAt DateTime?; @@unique([organizationId, name]) }
model CrmSource     { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; position String; archivedAt DateTime?; @@unique([organizationId, name]) }
model CrmTag        { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; color String; @@unique([organizationId, name]) }
```

```sql
ALTER TABLE "CrmStage" ADD CONSTRAINT "CrmStage_probability" CHECK (probability BETWEEN 0 AND 100);
ALTER TABLE "CrmStage" ADD CONSTRAINT "CrmStage_rotting" CHECK ("rottingDays" IS NULL OR "rottingDays" BETWEEN 1 AND 365);
```

### Conteúdo inicial (na instalação, para cada empresa existente, e na criação de cada empresa nova)

- `CrmSettings` com os padrões.
- Funil **"Vendas"** (padrão): Prospecção 10% (7 dias) · Qualificação 25% (7) · Proposta enviada 50% (10) · Negociação 75% (10) · Fechamento 90% (5).
- Motivos de perda: Preço · Escolheu um concorrente · Sem orçamento · Sem resposta · Não era o momento · Fora do perfil · Outro.
- Origens: Indicação · Site · Meta Ads · Google Ads · Instagram · WhatsApp · Prospecção ativa · Evento · Outro.

Use o mesmo gancho de "empresa criada" que o `tarefas` usa para o projeto inicial (ou crie um `onOrganizationCreated` no service de organizações, chamado na mesma transação). A instalação roda um script idempotente para as empresas existentes.

### Regras de funil e etapa
- Pelo menos **um funil ativo** e **uma etapa** por funil. Excluir etapa com negócios exige escolher a etapa de destino (`moveToStageId`); excluir funil com negócios exige o funil+etapa de destino.
- Arquivar funil: some do seletor e do quadro; negócios continuam acessíveis pelos links, listas e relatórios.
- `defaultPipelineId` aponta para um funil ativo; arquivar o padrão exige escolher outro.
- Mudar a probabilidade de uma etapa muda o ponderado de todos os negócios sem probabilidade própria (é calculado na leitura).

## Empresas e contatos

```prisma
model CrmCompany {
  id               String    @id @default(uuid(7)) @db.Uuid
  organizationId   String    @db.Uuid
  name             String                       // nome de exibição (fantasia)
  legalName        String?                      // razão social
  cnpj             String?                      // 14 posições, maiúsculas, sem pontuação
  segment          String?
  website          String?
  phone            String?                      // só dígitos, com DDI (ver crm-lib normalizePhoneBR)
  email            String?                      // minúsculo
  addressZip       String?
  addressStreet    String?
  addressNumber    String?
  addressComplement String?
  addressDistrict  String?
  addressCity      String?
  addressState     String?                      // UF
  ownerId          String?   @db.Uuid
  tagIds           String[]  @default([]) @db.Uuid
  customFields     Json      @default("{}")
  isSample         Boolean   @default(false)
  importId         String?   @db.Uuid
  createdById      String    @db.Uuid
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  deletedAt        DateTime?
  search           Unsupported("tsvector")?
  @@index([organizationId, name])
  @@index([organizationId, ownerId])
}

model CrmContact {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  name           String
  jobTitle       String?
  email          String?                        // minúsculo
  phone          String?                        // só dígitos, com DDI
  phoneIsWhatsapp Boolean  @default(true)
  secondaryPhone String?
  cpf            String?                        // 11 dígitos
  birthday       DateTime? @db.Date
  ownerId        String?   @db.Uuid
  tagIds         String[]  @default([]) @db.Uuid
  customFields   Json      @default("{}")
  isSample       Boolean   @default(false)
  importId       String?   @db.Uuid
  createdById    String    @db.Uuid
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?
  search         Unsupported("tsvector")?
  @@index([organizationId, name])
  @@index([organizationId, phone])
}

model CrmContactCompany {
  organizationId String   @db.Uuid
  contactId      String   @db.Uuid
  companyId      String   @db.Uuid
  isPrimary      Boolean  @default(false)
  role           String?                       // cargo naquela empresa, se diferente
  createdAt      DateTime @default(now())
  @@id([contactId, companyId])
  @@index([companyId])
}
```

```sql
-- sem duplicidade dentro da empresa (registros excluídos não contam)
CREATE UNIQUE INDEX "CrmCompany_cnpj_uq" ON "CrmCompany" ("organizationId", cnpj) WHERE cnpj IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "CrmContact_email_uq" ON "CrmContact" ("organizationId", email) WHERE email IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "CrmContact_cpf_uq" ON "CrmContact" ("organizationId", cpf) WHERE cpf IS NOT NULL AND "deletedAt" IS NULL;
-- no máximo uma empresa principal por contato
CREATE UNIQUE INDEX "CrmContactCompany_primary_uq" ON "CrmContactCompany" ("contactId") WHERE "isPrimary";
-- etiquetas e campos personalizados filtráveis
CREATE INDEX "CrmCompany_tags" ON "CrmCompany" USING gin ("tagIds");
CREATE INDEX "CrmContact_tags" ON "CrmContact" USING gin ("tagIds");
CREATE INDEX "CrmCompany_cf" ON "CrmCompany" USING gin ("customFields" jsonb_path_ops);
CREATE INDEX "CrmContact_cf" ON "CrmContact" USING gin ("customFields" jsonb_path_ops);
```

### Regras de empresas e contatos
- **Normalização no service** (com as funções de `scripts/crm-lib.mjs`): e-mail em minúsculas e sem espaços; telefone só dígitos com DDI (`normalizePhoneBR`: "(44) 99999-1234" → `5544999991234`); CPF só dígitos; CNPJ maiúsculo sem pontuação. Valide CPF/CNPJ com os validadores da base (`masks.ts` no front; mesmas regras no back, inclusive CNPJ alfanumérico).
- **Duplicidade**: e-mail, CPF e CNPJ repetidos → 409 (`CONTACT_DUPLICATE` / `COMPANY_DUPLICATE`) com `existing: { id, name }` para o front oferecer "Abrir o existente". Telefone repetido não bloqueia: aparece como aviso no formulário (`GET /v1/crm/duplicates`).
- **Contato ↔ empresa**: N para N, no máximo uma principal. Ao ligar a primeira empresa, ela vira a principal. Excluir empresa desliga os contatos (eles continuam).
- **Excluir** (soft delete): some de listas e busca; negócios e leads continuam, mostrando "(excluído)" no lugar do nome; "Desfazer" no toast restaura. Job diário apaga de vez depois de 30 dias (com anexos marcados para exclusão no `uploads`). E-mail/CPF/CNPJ de excluído não bloqueiam um cadastro novo.
- **Contagem do plano** `crmContacts` = contatos + empresas não excluídos.

## Negócios

```prisma
enum CrmDealStatus { OPEN WON LOST }
enum CrmValueMode  { MANUAL ITEMS }

model CrmDeal {
  id                String        @id @default(uuid(7)) @db.Uuid
  organizationId    String        @db.Uuid
  title             String
  value             Int           @default(0)            // centavos
  valueMode         CrmValueMode  @default(MANUAL)
  pipelineId        String        @db.Uuid
  stageId           String        @db.Uuid
  position          String                                // ordem dentro da etapa
  status            CrmDealStatus @default(OPEN)
  probability       Int?                                  // null = a da etapa
  companyId         String?       @db.Uuid
  contactId         String?       @db.Uuid
  ownerId           String        @db.Uuid
  sourceId          String?       @db.Uuid
  expectedCloseDate DateTime?     @db.Date
  stageChangedAt    DateTime      @default(now())          // "parado há X dias"
  wonAt             DateTime?
  lostAt            DateTime?
  lostReasonId      String?       @db.Uuid
  lostNote          String?
  nextActivityId    String?       @db.Uuid                 // mantidos pelo service (ver Atividades)
  nextActivityDate  DateTime?     @db.Date
  nextActivityTime  String?
  lastActivityAt    DateTime?
  leadId            String?       @db.Uuid                 // lead de origem (conversão)
  tagIds            String[]      @default([]) @db.Uuid
  customFields      Json          @default("{}")
  isSample          Boolean       @default(false)
  createdById       String        @db.Uuid
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  deletedAt         DateTime?
  search            Unsupported("tsvector")?
  @@index([organizationId, pipelineId, stageId, position])
  @@index([organizationId, ownerId, status])
  @@index([organizationId, status, expectedCloseDate])
  @@index([organizationId, companyId])
  @@index([organizationId, contactId])
}

model CrmDealStageHistory {               // uma linha por passagem por etapa; base do funil e do tempo por etapa
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  dealId         String    @db.Uuid
  pipelineId     String    @db.Uuid
  stageId        String    @db.Uuid
  enteredAt      DateTime  @default(now())
  leftAt         DateTime?
  @@index([dealId, enteredAt])
  @@index([organizationId, pipelineId, stageId, enteredAt])
}

model CrmProduct {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  name           String
  code           String?                     // SKU, único na empresa quando preenchido
  description    String?
  unitPrice      Int                          // centavos
  unit           String    @default("un")    // un, h, mês, kg, m², serviço…
  active         Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

model CrmDealItem {
  id              String   @id @default(uuid(7)) @db.Uuid
  organizationId  String   @db.Uuid
  dealId          String   @db.Uuid
  productId       String?  @db.Uuid           // null = item avulso
  name            String                       // cópia do nome no momento (o catálogo pode mudar)
  unitPrice       Int                          // centavos
  quantity        Decimal  @db.Decimal(12, 3)
  discountPercent Decimal  @default(0) @db.Decimal(5, 2)
  total           Int                          // centavos, calculado no servidor (crm-lib itemTotal)
  position        String
}
```

```sql
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_value" CHECK (value >= 0);
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_probability" CHECK (probability IS NULL OR probability BETWEEN 0 AND 100);
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_status_dates" CHECK (
  (status = 'OPEN' AND "wonAt" IS NULL AND "lostAt" IS NULL) OR
  (status = 'WON'  AND "wonAt" IS NOT NULL AND "lostAt" IS NULL) OR
  (status = 'LOST' AND "lostAt" IS NOT NULL AND "wonAt" IS NULL));
ALTER TABLE "CrmDealItem" ADD CONSTRAINT "CrmDealItem_values" CHECK ("unitPrice" >= 0 AND quantity > 0 AND "discountPercent" BETWEEN 0 AND 100 AND total >= 0);
CREATE UNIQUE INDEX "CrmProduct_code_uq" ON "CrmProduct" ("organizationId", code) WHERE code IS NOT NULL;
-- uma passagem aberta por negócio
CREATE UNIQUE INDEX "CrmDealStageHistory_open_uq" ON "CrmDealStageHistory" ("dealId") WHERE "leftAt" IS NULL;
CREATE INDEX "CrmDeal_tags" ON "CrmDeal" USING gin ("tagIds");
CREATE INDEX "CrmDeal_cf" ON "CrmDeal" USING gin ("customFields" jsonb_path_ops);
-- etapa sempre do funil do negócio
CREATE OR REPLACE FUNCTION crm_assert_stage_in_pipeline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "CrmStage" s WHERE s.id = NEW."stageId" AND s."pipelineId" = NEW."pipelineId" AND s."organizationId" = NEW."organizationId") THEN
    RAISE EXCEPTION 'etapa não pertence ao funil do negócio' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CrmDeal_stage_in_pipeline" BEFORE INSERT OR UPDATE OF "stageId", "pipelineId" ON "CrmDeal"
  FOR EACH ROW EXECUTE FUNCTION crm_assert_stage_in_pipeline();
```

### Regras do negócio
- **Criação**: sem funil → o padrão; sem etapa → a primeira do funil; responsável padrão = quem cria; título sugerido "Negócio {empresa ou contato}". Abre uma linha em `CrmDealStageHistory`.
- **Mudar de etapa** (`move`, ou PATCH de `stageId`/`pipelineId`): só negócio `OPEN` (`DEAL_NOT_OPEN`); fecha a passagem atual (`leftAt`) e abre outra; atualiza `stageChangedAt`; grava evento. Reordenar dentro da mesma etapa não mexe no histórico. Mudar de funil exige a etapa do funil novo.
- **Ganhar**: `status = WON`, `wonAt = agora`, fecha a passagem; a probabilidade efetiva passa a 100. **Perder**: exige `lostReasonId` se `requireLostReason` (`LOST_REASON_REQUIRED`); grava `lostAt`, motivo e observação. **Reabrir**: volta a `OPEN` na mesma etapa, limpa datas e motivo, abre passagem nova.
- **Probabilidade efetiva** = `probability ?? stage.probability` (aberto), 100 (ganho), 0 (perdido). **Ponderado** = `round(value × probabilidade / 100)` (`crm-lib weightedValue`).
- **Parado** = aberto e `hoje − stageChangedAt ≥ stage.rottingDays` (no fuso da empresa; `crm-lib rottingInfo`).
- **Valor com produtos**: o primeiro item muda `valueMode` para `ITEMS`; a partir daí `value = soma dos totais` recalculado no servidor a cada mudança de item (na mesma transação). Voltar para `MANUAL` mantém os itens e libera o campo. `total = round(unitPrice × quantity × (1 − desconto/100))` (`crm-lib itemTotal`). Itens exigem a feature `crm_products` para escrita.
- **Empresa e contato**: se os dois forem informados e o contato não estiver ligado à empresa, liga (o front avisa). Contato com empresa principal e negócio sem empresa: sugere a principal.
- **Excluir**: soft delete com desfazer; atividades pendentes do negócio são excluídas junto (e restauradas junto); anotações e anexos ficam ligados e voltam na restauração.
- Mudanças de etapa, status, valor, responsável, previsão e funil geram evento na linha do tempo (ver Histórico).

## Leads

```prisma
enum CrmLeadStatus { OPEN CONVERTED ARCHIVED }
enum CrmLeadVia    { MANUAL API FORM IMPORT }

model CrmLead {
  id               String        @id @default(uuid(7)) @db.Uuid
  organizationId   String        @db.Uuid
  title            String
  status           CrmLeadStatus @default(OPEN)
  via              CrmLeadVia    @default(MANUAL)
  captureKeyId     String?       @db.Uuid
  personName       String?
  email            String?                       // normalizado
  phone            String?                       // normalizado
  companyName      String?
  cnpj             String?
  value            Int?                          // centavos, estimado
  message          String?
  sourceId         String?       @db.Uuid
  utm              Json          @default("{}")  // utm_source, utm_medium, utm_campaign, utm_term, utm_content, página, referência
  extra            Json          @default("{}")  // campos do formulário que não têm lugar fixo
  contactId        String?       @db.Uuid        // ligado manualmente ou na conversão
  companyId        String?       @db.Uuid
  ownerId          String?       @db.Uuid        // null = sem responsável (aparece em "Não atribuídos")
  seenAt           DateTime?                     // primeira vez que o responsável abriu (contador "novos")
  archivedReason   String?
  convertedDealId  String?       @db.Uuid
  convertedAt      DateTime?
  nextActivityId   String?       @db.Uuid
  nextActivityDate DateTime?     @db.Date
  nextActivityTime String?
  tagIds           String[]      @default([]) @db.Uuid
  customFields     Json          @default("{}")  // usa as definições de DEAL
  isSample         Boolean       @default(false)
  importId         String?       @db.Uuid
  createdById      String?       @db.Uuid        // null quando veio por captura
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  deletedAt        DateTime?
  search           Unsupported("tsvector")?
  @@index([organizationId, status, createdAt])
  @@index([organizationId, ownerId, status])
  @@index([organizationId, email])
  @@index([organizationId, phone])
}
```

### Regras do lead
- **Título** padrão: "{nome ou empresa} · {origem}" (ex.: "Ana Souza · Site").
- **Possível duplicado**: na leitura do lead, o service procura contato por e-mail, CPF ou telefone e empresa por CNPJ (`crm-lib dedupeKeys`) e devolve `matches: { contact?, company? }`. O front mostra "Já existe: Ana Souza (2 negócios abertos)".
- **Converter** (`LEAD_ALREADY_CONVERTED` se já convertido), numa transação:
  1. contato: o escolhido (`contactId`), senão o que casar pelo e-mail/CPF/telefone, senão cria com nome, e-mail e telefone do lead (vale o limite `crmContacts`);
  2. empresa: a escolhida, senão a que casar pelo CNPJ, senão cria se houver `companyName` (e liga ao contato como principal);
  3. negócio no funil/etapa escolhidos (padrão: funil padrão, primeira etapa), com título, valor, responsável, origem, etiquetas e campos personalizados do lead, `leadId`;
  4. move anotações, atividades e anexos do lead para o negócio (mantendo `contactId`/`companyId` nos eventos);
  5. lead `CONVERTED`, `convertedDealId`, evento "convertido em negócio".
- **Descartar**: `ARCHIVED` com motivo opcional; some da caixa (aba "Descartados"); restaurar volta para `OPEN`.
- **Atribuição** de leads capturados: regra da chave de captura (`06-captura-e-importacao.md`).

## Atividades

```prisma
enum CrmActivityType { CALL MEETING TASK EMAIL WHATSAPP VISIT DEADLINE }

model CrmActivity {
  id              String          @id @default(uuid(7)) @db.Uuid
  organizationId  String          @db.Uuid
  type            CrmActivityType
  subject         String
  note            String?
  dueDate         DateTime        @db.Date
  dueTime         String?                          // "HH:mm" no fuso da empresa; null = dia inteiro
  durationMinutes Int?
  ownerId         String          @db.Uuid         // quem faz
  dealId          String?         @db.Uuid
  leadId          String?         @db.Uuid
  contactId       String?         @db.Uuid
  companyId       String?         @db.Uuid
  done            Boolean         @default(false)
  doneAt          DateTime?
  doneById        String?         @db.Uuid
  createdById     String          @db.Uuid
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  deletedAt       DateTime?
  @@index([organizationId, ownerId, done, dueDate])
  @@index([organizationId, dealId])
  @@index([organizationId, leadId])
  @@index([organizationId, contactId])
  @@index([organizationId, companyId])
}
```

```sql
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_has_target"
  CHECK ("dealId" IS NOT NULL OR "leadId" IS NOT NULL OR "contactId" IS NOT NULL OR "companyId" IS NOT NULL);
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_duration" CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 1440);
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_done" CHECK ((done AND "doneAt" IS NOT NULL) OR (NOT done AND "doneAt" IS NULL));
```

### Regras da atividade
- Criada a partir de um negócio herda `contactId` e `companyId` dele (aparece nas linhas do tempo dos três).
- **Próxima atividade**: depois de criar, editar, concluir, reabrir ou excluir, o service recalcula na **mesma transação** `nextActivity*` do negócio/lead ligado: a pendente mais antiga por (`dueDate`, `dueTime` nulo por último no dia, `createdAt`). `lastActivityAt` = última conclusão. Função única `refreshNextActivity(tx, { dealId?, leadId? })`, testada.
- **Situação** (`crm-lib activityState`): `overdue` (dia passou, ou hoje com hora passada), `today`, `future`; negócio aberto sem pendente = `none` (selo de alerta no card).
- Responsável precisa ser membro; no modo restrito, atribuir a alguém uma atividade num negócio dá a essa pessoa visão do negócio (ver Visibilidade).
- Concluir grava `doneAt`/`doneById` e evento; reabrir limpa.

## Histórico, anotações e anexos

```prisma
model CrmNote {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  body           String                         // texto com menções no formato @[Nome](userId); até 20.000 caracteres
  mentionIds     String[]  @default([]) @db.Uuid
  pinned         Boolean   @default(false)
  dealId         String?   @db.Uuid
  leadId         String?   @db.Uuid
  contactId      String?   @db.Uuid
  companyId      String?   @db.Uuid
  authorId       String    @db.Uuid
  editedAt       DateTime?
  createdAt      DateTime  @default(now())
  deletedAt      DateTime?
}

model CrmAttachment {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  fileId         String   @unique @db.Uuid    // File do uploads (purpose crm_attachment)
  dealId         String?  @db.Uuid
  leadId         String?  @db.Uuid
  contactId      String?  @db.Uuid
  companyId      String?  @db.Uuid
  uploadedById   String   @db.Uuid
  createdAt      DateTime @default(now())
}

model CrmEvent {                               // linha do tempo: o que aconteceu
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  type           String   // deal.created, deal.stage, deal.value, deal.owner, deal.won, deal.lost, deal.reopened, deal.pipeline,
                          // deal.expected_close, lead.created, lead.converted, lead.archived, lead.restored, contact.created,
                          // company.created, activity.done, attachment.added, attachment.removed, import.created
  actorId        String?  @db.Uuid               // null = sistema/captura
  dealId         String?  @db.Uuid
  leadId         String?  @db.Uuid
  contactId      String?  @db.Uuid
  companyId      String?  @db.Uuid
  data           Json                            // { from, to } legível sem joins (nomes junto com ids)
  createdAt      DateTime @default(now())
  @@index([organizationId, dealId, createdAt])
  @@index([organizationId, leadId, createdAt])
  @@index([organizationId, contactId, createdAt])
  @@index([organizationId, companyId, createdAt])
}
```

- Mesma restrição "pelo menos um alvo" das atividades em `CrmNote` e `CrmAttachment`.
- **Espalhamento na gravação**: evento, anotação e anexo de um negócio guardam também o `contactId` e o `companyId` do negócio naquele momento, então a linha do tempo do contato e da empresa é uma consulta simples por coluna.
- Evento gravado **no service**, na mesma transação da mudança. Mudanças seguidas do mesmo autor no mesmo campo em menos de 2 min são agrupadas (atualiza o último evento), menos etapa e status.
- Anotação: editar só o autor (marca `editedAt`); excluir autor ou owner/admin; fixar qualquer um que vê o registro (fixadas aparecem no topo). Menções notificam e são extraídas no servidor (só ids de membros da empresa).

## Campos personalizados

```prisma
enum CrmFieldEntity { COMPANY CONTACT DEAL }   // DEAL vale para negócios e leads
enum CrmFieldType   { TEXT TEXTAREA NUMBER MONEY DATE SELECT MULTISELECT BOOLEAN URL EMAIL PHONE CPF CNPJ }

model CrmCustomField {
  id             String         @id @default(uuid(7)) @db.Uuid
  organizationId String         @db.Uuid
  entity         CrmFieldEntity
  key            String                         // slug imutável (crm-lib slugifyFieldKey), único por entidade
  label          String
  type           CrmFieldType
  options        Json           @default("[]")  // [{ id, label, color }] para SELECT/MULTISELECT; ids estáveis
  required       Boolean        @default(false)
  showInList     Boolean        @default(false)
  showOnCard     Boolean        @default(false) // só DEAL; no máximo 2
  position       String
  archivedAt     DateTime?
  createdAt      DateTime       @default(now())
  @@unique([organizationId, entity, key])
}
```

- Valores ficam em `customFields` (jsonb) da entidade, **pela `key`**: `{ "num_funcionarios": 45, "segmento_extra": "opt_3" }`.
- Validação no servidor com `crm-lib validateCustomFields(defs, values, { partial })`: tipos, opções existentes, CPF/CNPJ/telefone/e-mail/URL, obrigatórios na criação; chave desconhecida → erro. Erro sai como `VALIDATION_ERROR` com `path: "customFields.<key>"` (o formulário mostra no campo certo). Dinheiro em centavos; data `YYYY-MM-DD`; MULTISELECT lista de ids de opção.
- **Mudar o tipo** não é permitido (crie outro campo). **Remover opção**: valores antigos ficam e aparecem como "(opção removida)". **Arquivar** esconde o campo e preserva os valores; **excluir de vez** (owner/admin, confirmação digitando o nome) apaga a chave de todos os registros num job.
- Filtro: `cf.<key>=valor` nas listas (`customFields @> '{"key": valor}'`; MULTISELECT com `customFields -> 'key' ? 'opt_id'`).
- Limite do plano `crmCustomFields` conta campos não arquivados das três entidades.

## Visibilidade (modo "cada vendedor vê os seus")

O RLS garante a empresa. A visibilidade comercial é um helper único, aplicado em **todas** as queries de negócio, lead, atividade, anotação, anexo, evento, quadro, relatório, busca e exportação:

```ts
export function visibleDealsWhere(auth: TenantAuth, s: CrmSettings): Prisma.CrmDealWhereInput {
  if (s.visibility === 'ALL' || auth.role === 'OWNER' || auth.role === 'ADMIN') return {}
  return { OR: [{ ownerId: auth.userId }, { activities: { some: { ownerId: auth.userId, deletedAt: null } } }] }
}
export function visibleLeadsWhere(auth: TenantAuth, s: CrmSettings): Prisma.CrmLeadWhereInput {
  if (s.visibility === 'ALL' || auth.role === 'OWNER' || auth.role === 'ADMIN') return {}
  return { OR: [{ ownerId: auth.userId }, { ownerId: null }] }      // não atribuídos ficam visíveis para alguém pegar
}
// atividade: visível se é minha OU o negócio/lead dela é visível
// anotação/anexo/evento: visível se o negócio/lead dele é visível (os de contato/empresa sem negócio são de todos)
```

- Negócio não visível = **404** (nunca 403), fora do quadro, listas, totais, busca, relatórios, exportação e notificações.
- No contato/empresa, a lista de negócios e a linha do tempo mostram só os visíveis; os totais mostram só o que a pessoa vê.
- Trocar o modo vale na hora (as queries leem `CrmSettings` a cada request; cache por request apenas).
- Há **teste de visibilidade para cada rota** (seção de testes da API). Registre a decisão no README do projeto.

## Importações e captura

Models `CrmImport`, `CrmCaptureKey` e as regras de rodízio estão em `06-captura-e-importacao.md`.

## Busca

Coluna gerada `search` (português, `unaccent` se disponível) com índice GIN, como no `tarefas`:
- negócio: título (A), nome da empresa e do contato não entram na coluna (estão em outra tabela); a busca do negócio faz `OR` com empresa/contato por join;
- contato: nome (A), e-mail (B), telefone (B, só dígitos; a busca normaliza o termo com `normalizePhoneBR` quando ele tem 8+ dígitos);
- empresa: nome e razão social (A), CNPJ (B);
- lead: título e pessoa (A), empresa, e-mail e telefone (B).
CNPJ, CPF e e-mail digitados inteiros vão direto por igualdade (mais rápido e exato).
