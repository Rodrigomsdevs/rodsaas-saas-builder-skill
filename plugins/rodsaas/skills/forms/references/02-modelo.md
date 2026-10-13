# Modelo de dados e regras

Todas as tabelas têm `organizationId` e **RLS com `FORCE`** (policy padrão da base), menos `FormPublicLookup` (explicada abaixo). Relações recebem o trigger `rodsaas_assert_same_org` (função da skill `module`, `references/02-backend.md`). Prefixo `Form` em tudo.

## Esquema do formulário (JSON)

O formulário é um documento JSON validado por `forms-lib validateSchema` (no back, sempre antes de gravar):

```json
{
  "version": 1,
  "fields": [
    { "id": "f_tipo", "type": "single_choice", "label": "Você é", "required": true,
      "options": [{ "id": "o_pf", "label": "Pessoa física" }, { "id": "o_pj", "label": "Empresa" }] },
    { "id": "f_cnpj", "type": "cnpj", "label": "CNPJ",
      "visibleIf": { "match": "all", "rules": [{ "field": "f_tipo", "op": "eq", "value": "o_pj" }] } },
    { "id": "p_2", "type": "page", "label": "Sobre o pedido" },
    { "id": "f_msg", "type": "long_text", "label": "Conte mais", "validation": { "maxLength": 2000 } }
  ],
  "hidden": [{ "key": "utm_source" }]
}
```

- **Lista plana** de campos; `page` abre uma página nova (o título é o `label`), `statement` é só texto. Isso deixa o construtor simples (arrastar numa lista) e o modo "uma por vez" trivial (`stepsOf`).
- **Ids estáveis** (`f_` + 6 caracteres, gerados no front com `newId`): a resposta é guardada por id, então renomear uma pergunta não perde nada.
- **Condições** (`visibleIf`) só podem usar perguntas **anteriores** (sem ciclos); operadores em `forms-lib OPS`. Campo escondido pela lógica não é exigido, não é gravado e não conta para as condições seguintes.
- Configurações do formulário ficam fora do esquema, em `Form.settings` (abaixo).

## Formulários e versões

```prisma
enum FormStatus { DRAFT PUBLISHED CLOSED }

model Form {
  id               String     @id @default(uuid(7)) @db.Uuid
  organizationId   String     @db.Uuid
  title            String
  slug             String     @unique                       // único no sistema todo (endereço público)
  status           FormStatus @default(DRAFT)
  draft            Json                                     // esquema em edição
  draftVersion     Int        @default(1)                   // controle de conflito do salvamento automático
  publishedVersion Int?                                     // versão em FormVersion que o público vê
  hasUnpublishedChanges Boolean @default(false)
  settings         Json       @default("{}")                // ver "Configurações"
  ownerId          String     @db.Uuid                      // quem criou (dono das permissões)
  closedAt         DateTime?
  closedReason     String?                                  // manual, limite de respostas, data, plano
  responsesCount   Int        @default(0)
  unreadCount      Int        @default(0)
  lastResponseAt   DateTime?
  isTemplate       Boolean    @default(false)               // "modelo da empresa"
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  deletedAt        DateTime?
  @@index([organizationId, status, updatedAt])
}

model FormVersion {                    // cada publicação vira uma versão imutável
  organizationId String   @db.Uuid
  formId         String   @db.Uuid
  version        Int
  schema         Json
  settings       Json                  // cópia das configurações públicas no momento
  publishedById  String   @db.Uuid
  publishedAt    DateTime @default(now())
  @@id([formId, version])
}

model FormCollaborator {
  organizationId String   @db.Uuid
  formId         String   @db.Uuid
  userId         String   @db.Uuid
  role           String                // EDITOR | VIEWER
  @@id([formId, userId])
}

model FormFavorite { organizationId String @db.Uuid; formId String @db.Uuid; userId String @db.Uuid; createdAt DateTime @default(now()); @@id([formId, userId]) }

model FormPublicLookup {               // SEM RLS: o público chega só com o slug, antes de saber a empresa
  slug           String   @id
  formId         String   @unique @db.Uuid
  organizationId String   @db.Uuid
}
```

- **Publicar**: valida o rascunho (`validateSchema` + features do plano), cria `FormVersion` com `version = (publishedVersion ?? 0) + 1`, aponta `publishedVersion`, `status = PUBLISHED`, `hasUnpublishedChanges = false`, grava/atualiza `FormPublicLookup` e confere o limite `formsPublished`. Tudo numa transação.
- **Salvar rascunho**: `PUT /draft` com `version`; diferente de `draftVersion` → 409 `VERSION_CONFLICT` (outra aba ou colaborador salvou). Sucesso incrementa `draftVersion` e marca `hasUnpublishedChanges` se já houver publicação.
- **Encerrar**: `status = CLOSED` (manual, `maxResponses` atingido, `closeAt` passou ou limite do plano); o link mostra a mensagem de encerrado. **Reabrir** volta a `PUBLISHED` (conferindo limites).
- **Slug**: gerado com `formSlug(title)`; editável (`isValidSlug`, único; o antigo deixa de funcionar e a tela avisa). `FormPublicLookup` só tem linha para formulário publicado ou encerrado (rascunho não tem endereço público).
- **Excluir**: soft delete; apaga a linha do lookup (link para de funcionar na hora); "Desfazer" restaura; job apaga de vez depois de 30 dias, com as respostas e os arquivos.
- A tabela sem RLS guarda **só** slug → ids. Toda a leitura do formulário acontece depois, dentro de `withTenant(organizationId)`. Registre a justificativa no README do projeto (como a do `notion` e a da captura do `crm`).

### Configurações (`Form.settings`, validadas com Zod)

```ts
{
  layout: 'classic' | 'one_by_one',
  theme: { mode: 'brand' | 'custom', primary?: string, background?: string, coverFileId?: string, logoFileId?: string },
  welcome: { enabled: boolean, title?: string, text?: string, button?: string },
  thanks: { title: string, text?: string, buttonLabel?: string, buttonUrl?: string, redirectUrl?: string, redirectDelaySec?: number },
  limits: { maxResponses?: number, closeAt?: string /* ISO */, onePer: 'none' | 'browser' | 'email' | 'user' },
  access: 'public' | 'members',
  closedMessage: string,
  notify: { mode: 'each' | 'daily' | 'off' },
  autoReply: { enabled: boolean, subject?: string, body?: string, includeAnswers: boolean },
  privacy: { retentionDays?: number },
  showBranding: boolean                 // rodapé "Feito com {produto}"; false exige forms_branding
}
```

`buttonUrl` e `redirectUrl` só `https:` (ou `http:` em dev). Cor do tema em hex válido. `closeAt` no futuro.

## Respostas

```prisma
model FormResponse {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  formId         String    @db.Uuid
  version        Int                                  // versão do formulário respondida
  answers        Json                                 // { fieldId: valor normalizado } (validateAnswers)
  hidden         Json      @default("{}")             // campos ocultos (pickHidden)
  answersText    String    @default("")               // busca (answersText)
  respondentEmail String?                             // respondentEmail(), minúsculo
  respondentUserId String? @db.Uuid                   // formulário "só membros"
  browserKey     String?                              // hash do identificador do navegador (uma por navegador)
  ipHash         String?                              // sha256(ip + segredo do servidor); nunca o IP puro
  userAgent      String?
  startedAt      DateTime?
  submittedAt    DateTime  @default(now())
  durationSec    Int?
  readAt         DateTime?
  starred        Boolean   @default(false)
  createdLeadId  String?   @db.Uuid                   // lead criado no CRM, se houver
  deletedAt      DateTime?
  search         Unsupported("tsvector")?
  @@index([organizationId, formId, submittedAt])
  @@index([organizationId, respondentEmail])
}

model FormResponseFile {               // arquivos enviados (add-on uploads, purpose form_upload)
  organizationId String @db.Uuid
  responseId     String @db.Uuid
  fieldId        String
  fileId         String @unique @db.Uuid
  @@id([responseId, fileId])
}
```

**Regras de envio numa transação só**, com trava na linha do formulário (`SELECT ... FROM "Form" WHERE id = $1 FOR UPDATE`): conferir status e `closeAt`, contar `maxResponses` e o limite mensal do plano, aplicar "uma resposta por e-mail / usuário / navegador" (`409 ALREADY_RESPONDED`), gravar a resposta e os contadores, e encerrar o formulário se a resposta atingiu `maxResponses`. Com a trava, 2 envios simultâneos nunca passam do limite (teste com 20 envios em paralelo e `maxResponses: 5`).

- `answers` guarda o valor **normalizado** pelo `validateAnswers` da versão publicada; a tela de respostas usa `displayAnswer` com o esquema da versão de cada resposta (pergunta removida continua aparecendo como coluna "removida" na exportação: `responsesToCsv(..., { removedFields })`).
- Coluna `search` gerada de `answersText` (português, GIN).
- Contadores (`responsesCount`, `unreadCount`, `lastResponseAt`) atualizados na mesma transação da resposta, da leitura e da exclusão.
- Excluir resposta: soft delete com desfazer; job apaga de vez em 30 dias (com os arquivos).

## Estatísticas (funil)

```prisma
model FormDailyStat {
  organizationId String   @db.Uuid
  formId         String   @db.Uuid
  date           DateTime @db.Date      // fuso da empresa
  views          Int      @default(0)
  starts         Int      @default(0)   // primeira interação
  submits        Int      @default(0)
  @@id([formId, date])
}

model FormPageStat {                    // quantos chegaram a cada página (funil), por versão
  organizationId String @db.Uuid
  formId         String @db.Uuid
  version        Int
  pageIndex      Int
  reached        Int    @default(0)
  @@id([formId, version, pageIndex])
}
```

Incrementos com `INSERT ... ON CONFLICT DO UPDATE SET views = views + 1`. Eventos chegam do formulário público (`POST /events`) com limite por IP e só uma contagem de `view`/`start` por sessão do navegador (o front guarda que já contou em `sessionStorage`).

## Integrações

```prisma
model FormWebhook {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  formId         String    @db.Uuid
  url            String                          // só https (http só em dev)
  secret         String                          // gerado (32 bytes), mostrado na tela, usado no signWebhook
  active         Boolean   @default(true)
  lastStatus     Int?
  lastDeliveryAt DateTime?
  failureCount   Int       @default(0)            // 20 falhas seguidas → desativa e avisa o dono
  createdAt      DateTime  @default(now())
}

model FormWebhookDelivery {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  webhookId      String    @db.Uuid
  responseId     String?   @db.Uuid
  event          String                          // form.response.created | form.test
  attempt        Int       @default(1)
  status         Int?                            // HTTP de quem recebeu; null = erro de rede/tempo
  error          String?
  durationMs     Int?
  createdAt      DateTime  @default(now())
  @@index([webhookId, createdAt])
}

model FormCrmLink {                    // só existe se o preset crm estiver instalado
  organizationId String  @db.Uuid
  formId         String  @id @db.Uuid
  enabled        Boolean @default(true)
  mapping        Json                           // leadFromResponse mapping: { personName, email, phone, companyName, cnpj, message[], value }
  sourceId       String? @db.Uuid               // origem do lead no CRM (padrão: "Site")
  assignMode     String  @default("FIXED")      // FIXED | ROUND_ROBIN | NONE, como na captura do CRM
  assigneeIds    String[] @default([]) @db.Uuid
  rrCursor       Int     @default(0)
}
```

## Travas de mesma empresa

| Tabela | Colunas com `rodsaas_assert_same_org` |
|---|---|
| `FormVersion`, `FormCollaborator`, `FormFavorite`, `FormResponse`, `FormDailyStat`, `FormPageStat`, `FormWebhook`, `FormCrmLink` | `formId` → `Form` |
| `FormResponseFile` | `responseId` → `FormResponse` |
| `FormWebhookDelivery` | `webhookId` → `FormWebhook` |

Usuários (`ownerId`, colaboradores, `assigneeIds`) são conferidos no service (membros da empresa).

## Visibilidade das respostas

Helper único aplicado em **todas** as rotas de resposta, resumo, funil, exportação, busca e notificações:

```ts
export function canSeeResponses(auth: TenantAuth, form: { ownerId: string; collaborators: { userId: string }[] }) {
  return auth.role === 'OWNER' || auth.role === 'ADMIN' || form.ownerId === auth.userId ||
    form.collaborators.some((c) => c.userId === auth.userId)
}
```

Sem permissão → **404**. Teste rota a rota.
