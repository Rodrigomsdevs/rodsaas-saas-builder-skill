# Modelo de dados e regras

Todos os models têm `organizationId` e **RLS com `FORCE`** (policy padrão da base). Relações entre tabelas do preset recebem o trigger `rodsaas_assert_same_org` (definido na skill `module`, `references/02-backend.md`; crie a função se ainda não existir). Posições usam índice fracionário em coluna `text COLLATE "C"`.

## Projetos

```prisma
enum ProjectVisibility { PUBLIC PRIVATE }
enum EstimateType { NONE POINTS HOURS }
enum StatusCategory { BACKLOG TODO IN_PROGRESS DONE CANCELED }

model TaskProject {
  id              String            @id @default(uuid(7)) @db.Uuid
  organizationId  String            @db.Uuid
  name            String
  key             String                                  // 2–6 letras maiúsculas, única na empresa
  description     String?
  icon            String?                                 // emoji
  color           String            @default("default")   // token: default, info, success, warning, destructive, brand
  visibility      ProjectVisibility @default(PUBLIC)
  leadId          String?           @db.Uuid
  estimateType    EstimateType      @default(NONE)
  sprintsEnabled  Boolean           @default(false)
  nextNumber      Int               @default(1)
  position        String
  archivedAt      DateTime?
  createdById     String            @db.Uuid
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  @@unique([organizationId, key])
}

model TaskProjectMember {            // só usado em projeto PRIVATE
  organizationId String   @db.Uuid
  projectId      String   @db.Uuid
  userId         String   @db.Uuid
  createdAt      DateTime @default(now())
  @@id([projectId, userId])
}

model ProjectKeyAlias {              // chave antiga → projeto, para links velhos continuarem funcionando
  organizationId String @db.Uuid
  key            String
  projectId      String @db.Uuid
  @@id([organizationId, key])
}

model TaskStatus {
  id             String         @id @default(uuid(7)) @db.Uuid
  organizationId String         @db.Uuid
  projectId      String         @db.Uuid
  name           String
  category       StatusCategory
  color          String
  position       String
  @@index([projectId, position])
}

model TaskLabel {
  id             String @id @default(uuid(7)) @db.Uuid
  organizationId String @db.Uuid
  projectId      String @db.Uuid
  name           String
  color          String
  @@unique([projectId, name])
}
```

### Regras de projeto
- **Chave**: 2–6 letras A–Z, sugerida a partir do nome ("Marketing" → MKT), única na empresa. Trocar a chave grava a antiga em `ProjectKeyAlias` (links `MKT-12` continuam abrindo).
- **Fluxo inicial**: Backlog (BACKLOG), A fazer (TODO), Fazendo (IN_PROGRESS), Em revisão (IN_PROGRESS), Feito (DONE), Cancelado (CANCELED). Precisa existir **pelo menos um status em TODO e um em DONE**. Excluir status exige escolher para qual mover as tarefas.
- **Privado**: visível só para membros do projeto e para owner/admin da empresa. Para os outros, o projeto e tudo dele **não existe** (404, fora de listas, busca, minhas tarefas e notificações).
- **Arquivar** esconde do menu e das visões (somente leitura); **excluir** só owner/admin, com confirmação digitando a chave, e leva tudo junto.

### Visibilidade de projeto privado (camadas)
O RLS garante a empresa. A visibilidade do projeto privado é aplicada **em todas as queries** por um helper único:

```ts
// devolve o filtro de projetos visíveis para quem está pedindo
export function visibleProjectsWhere(auth: TenantAuth): Prisma.TaskProjectWhereInput {
  if (auth.role === 'OWNER' || auth.role === 'ADMIN') return {}
  return { OR: [{ visibility: 'PUBLIC' }, { members: { some: { userId: auth.userId } } }] }
}
```

Toda query de tarefa/sprint/comentário/horas/anexo passa por ele (via `project: visibleProjectsWhere(auth)`), e há **teste de visibilidade para cada rota** (seção de testes da API). Registre essa decisão no README do projeto.

## Tarefas

```prisma
enum TaskPriority { NONE LOW MEDIUM HIGH URGENT }

model Task {
  id                 String       @id @default(uuid(7)) @db.Uuid
  organizationId     String       @db.Uuid
  projectId          String       @db.Uuid
  number             Int
  title              String
  description        Json         @default("[]")
  descriptionText    String       @default("")     // extraído no servidor, para busca e e-mail
  descriptionVersion Int          @default(1)
  statusId           String       @db.Uuid
  priority           TaskPriority @default(NONE)
  assigneeId         String?      @db.Uuid
  startDate          DateTime?    @db.Date
  dueDate            DateTime?    @db.Date
  dueTime            String?                       // "HH:mm" no fuso da empresa; null = dia inteiro
  estimate           Decimal?     @db.Decimal(8, 2)
  sprintId           String?      @db.Uuid
  parentId           String?      @db.Uuid
  position           String                        // ordem dentro da coluna de status
  completedAt        DateTime?                     // preenchido ao entrar em DONE; limpo ao sair
  archivedAt         DateTime?
  deletedAt          DateTime?                     // lixeira (30 dias)
  createdById        String       @db.Uuid
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  search             Unsupported("tsvector")?
  @@unique([projectId, number])
  @@index([organizationId, projectId, statusId, position])
  @@index([organizationId, assigneeId, dueDate])
  @@index([organizationId, sprintId])
  @@index([organizationId, parentId])
}

model TaskLabelOnTask { organizationId String @db.Uuid; taskId String @db.Uuid; labelId String @db.Uuid; @@id([taskId, labelId]) }

model TaskChecklistItem {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  taskId         String    @db.Uuid
  text           String
  done           Boolean   @default(false)
  doneById       String?   @db.Uuid
  doneAt         DateTime?
  position       String
}

enum TaskLinkType { BLOCKS RELATES DUPLICATES }

model TaskLink {
  id             String       @id @default(uuid(7)) @db.Uuid
  organizationId String       @db.Uuid
  fromTaskId     String       @db.Uuid     // "fromTask BLOCKS toTask"; "bloqueada por" é a leitura inversa
  toTaskId       String       @db.Uuid
  type           TaskLinkType
  createdById    String       @db.Uuid
  createdAt      DateTime     @default(now())
  @@unique([fromTaskId, toTaskId, type])
}

model TaskWatcher { organizationId String @db.Uuid; taskId String @db.Uuid; userId String @db.Uuid; createdAt DateTime @default(now()); @@id([taskId, userId]) }

model TaskAttachment {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  taskId         String   @db.Uuid
  fileId         String   @unique @db.Uuid   // File do add-on uploads (purpose task_attachment)
  uploadedById   String   @db.Uuid
  createdAt      DateTime @default(now())
}
```

### Código da tarefa (sequência por projeto)
Gerado na transação de criação, com trava na linha do projeto (concorrência segura, sem buracos por corrida):

```sql
UPDATE "TaskProject" SET "nextNumber" = "nextNumber" + 1
WHERE id = $1 AND "organizationId" = $2
RETURNING "nextNumber" - 1 AS number;
```

(Testado com 50 criações concorrentes em 10 conexões: códigos 1–50, sem repetição nem buraco.) Se precisar num comando só, use CTE — `UPDATE` dentro de subquery no `FROM` não é aceito pelo Postgres:

```sql
WITH seq AS (
  UPDATE "TaskProject" SET "nextNumber" = "nextNumber" + 1
  WHERE id = $1 AND "organizationId" = $2
  RETURNING "nextNumber" - 1 AS n
)
INSERT INTO "Task" (..., "number") SELECT ..., n FROM seq RETURNING *;
```

Exibição: `${project.key}-${task.number}`. **Mover para outro projeto** dá número novo no destino e grava o antigo em `TaskKeyAlias (organizationId, projectKey, number, taskId)` para o link velho redirecionar.

### Regras da tarefa
- **Status ↔ conclusão**: entrar em categoria DONE preenche `completedAt`; sair limpa. CANCELED não conta como concluída nos relatórios.
- **Subtarefa**: `parentId` aponta para tarefa do **mesmo projeto** e que **não é subtarefa** (1 nível). Concluir a pai com subtarefas abertas: o front pergunta se conclui todas. Excluir a pai leva as subtarefas para a lixeira junto.
- **Vínculos**: sem auto-vínculo; RELATES guardado uma vez só (menor id em `fromTaskId`); vínculos entre projetos diferentes são permitidos (mesma empresa). Tarefa com bloqueio aberto mostra o selo "Bloqueada".
- **Prazo**: data (dia inteiro) ou data + hora no fuso da empresa (`rodsaas.json` → `timezone`, configurável por empresa). "Atrasada" = prazo passou e status não é DONE/CANCELED, calculado no fuso da empresa.
- **Estimativa**: só se `estimateType ≠ NONE`; pontos inteiros ou com meio (0,5); horas com até 2 casas.
- **Responsável**: precisa ser membro da empresa e, em projeto privado, membro do projeto. Atribuir alguém o torna seguidor.
- **Seguidores automáticos**: criador, responsável, quem comenta, quem é mencionado.
- **Lixeira**: `deletedAt`; restaurar até 30 dias (criador ou owner/admin); job diário apaga de vez (com anexos marcados para exclusão no uploads).
- **Arquivar**: só tarefas DONE/CANCELED; somem das visões, continuam na busca e no histórico.

### Busca
Coluna gerada `search` (português, título peso A, descrição peso B) com índice GIN, como no notion (`01-escopo-e-modelo.md` dela). Comentários entram via `TaskComment.bodyText` numa segunda consulta (ou numa view), se o usuário buscar com "incluir comentários".

## Colaboração

```prisma
model TaskComment {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  taskId         String    @db.Uuid
  authorId       String    @db.Uuid
  body           Json                       // editor em modo compacto
  bodyText       String
  editedAt       DateTime?
  deletedAt      DateTime?                  // mostra "comentário excluído" no histórico
  createdAt      DateTime  @default(now())
  @@index([taskId, createdAt])
}

model CommentReaction {
  organizationId String   @db.Uuid
  commentId      String   @db.Uuid
  userId         String   @db.Uuid
  emoji          String                     // conjunto permitido (ver API)
  createdAt      DateTime @default(now())
  @@id([commentId, userId, emoji])
}

model TaskActivity {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  taskId         String   @db.Uuid
  actorId        String?  @db.Uuid          // null = sistema (ex.: sprint concluída moveu a tarefa)
  type           String                     // created, status, assignee, priority, due, start, estimate, sprint, labels,
                                            // parent, moved_project, title, description, attachment_added/removed,
                                            // time_logged, link_added/removed, archived, restored
  data           Json                       // { from, to } legível sem joins (nomes junto com ids)
  createdAt      DateTime @default(now())
  @@index([taskId, createdAt])
}
```

- Atividade é gravada **no service**, na mesma transação da mudança.
- Mudanças seguidas do mesmo autor no mesmo campo em menos de 2 min são **agrupadas** (atualiza a última atividade) para o histórico não virar ruído — exceto status.
- Descrição: registra "editou a descrição" no máximo uma vez a cada 10 min por pessoa.

## Notificações (módulo genérico `notifications`)

```prisma
model Notification {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  userId         String    @db.Uuid         // destinatário
  type           String                     // task.assigned, task.mentioned, task.commented, task.status, task.due_soon, task.overdue, sprint.started, sprint.completed
  actorId        String?   @db.Uuid
  entityType     String                     // task, sprint
  entityId       String    @db.Uuid
  data           Json                       // título, código, trecho do comentário, de/para
  readAt         DateTime?
  emailedAt      DateTime?
  createdAt      DateTime  @default(now())
  @@index([userId, readAt, createdAt])
}

enum EmailMode { IMMEDIATE DAILY OFF }

model NotificationPreference {
  organizationId String    @db.Uuid
  userId         String    @db.Uuid
  emailMode      EmailMode @default(IMMEDIATE)
  disabledTypes  String[]  @default([])     // tipos que a pessoa desligou (no app e no e-mail)
  @@id([organizationId, userId])
}
```

Além do RLS por empresa, **toda** leitura filtra `userId = auth.userId` (ninguém lê notificação de outro).

## Sprints

```prisma
enum SprintStatus { PLANNED ACTIVE COMPLETED }

model Sprint {
  id             String       @id @default(uuid(7)) @db.Uuid
  organizationId String       @db.Uuid
  projectId      String       @db.Uuid
  name           String                     // "Sprint 12" (sugere o próximo número)
  goal           String?
  startDate      DateTime     @db.Date
  endDate        DateTime     @db.Date
  status         SprintStatus @default(PLANNED)
  startedAt      DateTime?
  completedAt    DateTime?
  summary        Json?                      // planejado × entregue, adicionadas no meio, movidas
  createdAt      DateTime     @default(now())
}

model SprintSnapshot {                      // um por dia da sprint ativa (burndown)
  organizationId String   @db.Uuid
  sprintId       String   @db.Uuid
  date           DateTime @db.Date
  totalCount     Int
  doneCount      Int
  totalPoints    Decimal  @db.Decimal(10, 2)
  donePoints     Decimal  @db.Decimal(10, 2)
  @@id([sprintId, date])
}
```

```sql
-- no máximo uma sprint ativa por projeto
CREATE UNIQUE INDEX "Sprint_one_active_per_project" ON "Sprint" ("projectId") WHERE status = 'ACTIVE';
```

- `endDate ≥ startDate`; sprints do mesmo projeto não se sobrepõem (aviso, não erro).
- **Iniciar**: só uma ativa; grava o escopo inicial (ids e estimativas) para o resumo.
- **Snapshot**: job diário (fuso da empresa) + atualização do snapshot do dia a cada mudança de status/estimativa/escopo da sprint ativa.
- **Concluir**: DONE ficam na sprint; abertas vão para o destino escolhido (próxima sprint, nova sprint ou backlog) com atividade de sistema; grava `summary`.
- Tarefa só entra em sprint do **mesmo projeto**, e só em projeto com `sprintsEnabled`.

## Horas

```prisma
model TimeEntry {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  taskId         String    @db.Uuid
  userId         String    @db.Uuid
  date           DateTime  @db.Date        // dia em que o trabalho conta (fuso da empresa)
  startedAt      DateTime?                 // cronômetro
  endedAt        DateTime?
  minutes        Int?                      // null enquanto o cronômetro está rodando
  note           String?
  billable       Boolean   @default(false)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@index([organizationId, userId, date])
  @@index([organizationId, taskId])
}
```

```sql
-- um cronômetro rodando por pessoa (na empresa)
CREATE UNIQUE INDEX "TimeEntry_one_running_per_user"
  ON "TimeEntry" ("organizationId", "userId") WHERE "minutes" IS NULL;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_minutes_range"
  CHECK ("minutes" IS NULL OR ("minutes" > 0 AND "minutes" <= 1440));
```

- **Iniciar cronômetro** com outro rodando: para o atual (gravando os minutos) e inicia o novo, na mesma transação; o front avisa ("Cronômetro de MKT-12 parado em 45min").
- **Parar**: `minutes = ceil((agora − startedAt)/60s)`, mínimo 1; mais de 12 h → o front pergunta se esqueceu ligado e permite ajustar antes de salvar.
- Lançamento manual: duração (`parseDuration`) + dia + nota + faturável.
- Editar/excluir: o dono do lançamento; owner/admin editam todos. Toda mudança gera atividade `time_logged` na tarefa.
- Total da tarefa = soma dos minutos (cronômetro rodando conta em tempo real só na tela).

## Visões salvas

```prisma
enum TaskViewType { BOARD LIST CALENDAR BACKLOG }

model TaskSavedView {
  id             String       @id @default(uuid(7)) @db.Uuid
  organizationId String       @db.Uuid
  projectId      String?      @db.Uuid     // null = visão de "Minhas tarefas"
  ownerId        String?      @db.Uuid     // null = visão do projeto (todos veem; feature do plano)
  name           String
  type           TaskViewType
  config         Json                      // filtros, agrupamento, ordenação, raias, colunas visíveis
  position       String
}
```

## Projeto inicial ("Primeiros passos")

Na criação de cada workspace (e, na instalação, oferecer criar para os workspaces existentes): projeto **PP**, público, com 6 tarefas que demonstram o produto — uma com subtarefas, uma com checklist, uma vencendo hoje atribuída ao owner, uma com comentário de boas-vindas, uma com etiqueta e prioridade alta, uma concluída. Sem sprints (para não exigir plano pago).
