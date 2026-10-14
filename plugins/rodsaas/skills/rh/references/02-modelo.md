# 02 · Modelo de dados

Todas as tabelas têm `organizationId` e **RLS com `FORCE`**, menos `RhAdmissionLookup` (busca pública do link de pré-admissão: só `tokenHash → organizationId, admissionId`, com justificativa no README). Relações entre tabelas recebem o trigger `rodsaas_assert_same_org` (função da skill `module`). Datas de calendário (admissão, férias, ausências, vencimentos) são `@db.Date` — dia de trabalho, sem fuso; instantes (`createdAt`, decisões, ciência) são `timestamptz` UTC. Dinheiro em **centavos** (`Int`). Ids `uuid(7)`.

Criptografia em repouso: `RH_ENCRYPTION_KEY` (32 bytes base64, AES-256-GCM, IV aleatório — o mesmo helper do projeto se já existir) para `bankAccountEnc`, `pixKeyEnc`, `cidEnc` e o `tokenEnc` da pré-admissão. Campos `*Enc` nunca voltam crus pela API: o serviço decifra só ao projetar o grupo permitido.

## Configurações e estrutura

```prisma
model RhSettings {                       // uma por empresa (criada na ativação do app)
  organizationId          String   @id @db.Uuid
  defaultRestDays         Int[]    @default([0])          // 0 = domingo; jornada seg–sex: [0,6]
  vacationRegimes         Json     @default("{\"CLT\":\"clt\",\"APRENDIZ\":\"clt\",\"TEMPORARIO\":\"clt\",\"ESTAGIO\":\"livre\",\"PJ\":\"livre\",\"AUTONOMO\":\"none\"}")
  vacationMinNoticeDays   Int      @default(30)
  vacationWarnDays        Int      @default(60)           // "vencendo" quando o concessivo acaba em ≤ N dias
  companyCitizen          Boolean  @default(false)        // Empresa Cidadã: maternidade 180, paternidade 20
  storeCid                Boolean  @default(false)
  managersSeeCompensation Boolean  @default(false)
  managersSeeDocuments    Boolean  @default(false)
  managersSeeIndirect     Boolean  @default(true)
  showBirthdays           Boolean  @default(true)
  surveyMinGroup          Int      @default(5)            // nunca menos que 3
  approvalReminderDays    Int      @default(2)            // dias úteis
  expenseMaxAgeDays       Int      @default(90)
  accountantEmail         String?                         // fechamento do mês
  accountantName          String?
  customFields            Json     @default("[]")         // [{ key, label, type: text|number|date|select, options?, group: "job"|"personal" }]
  values                  String[] @default([])           // valores da empresa (elogios do feedback)
  updatedAt               DateTime @updatedAt
}

model RhRole {                           // papel no app (independente do papel na empresa)
  organizationId String   @db.Uuid
  userId         String   @db.Uuid
  role           String                                   // RH_ADMIN | RH | FINANCE
  createdAt      DateTime @default(now())
  @@id([organizationId, userId])
}

model Department {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String
  parentId       String?  @db.Uuid                        // árvore (sem ciclo: mesma checagem do organograma)
  headEmployeeId String?  @db.Uuid                        // responsável (informativo; aprovação segue o gestor)
  costCenter     String?
  archivedAt     DateTime?
  @@unique([organizationId, name, parentId])
}

model Position {                          // cargo
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String                                   // "Analista de Suporte"
  level          String?                                  // Júnior | Pleno | Sênior | Especialista | Gestão…
  cbo            String?                                  // 6 dígitos, opcional
  salaryMinCents Int?
  salaryMaxCents Int?
  description    String?
  archivedAt     DateTime?
  @@unique([organizationId, name, level])
}

model WorkLocation {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String                                   // "Matriz SP", "Remoto"
  city           String?
  state          String?                                  // UF
  holidays       Json     @default("[]")                  // [{ date: "2026-01-25", name: "Aniversário de SP" }] (estaduais e municipais)
}
```

## Colaborador

```prisma
model Employee {
  id               String    @id @default(uuid(7)) @db.Uuid
  organizationId   String    @db.Uuid
  userId           String?   @db.Uuid                     // login do autoatendimento (null = sem login)
  status           String    @default("ACTIVE")           // PRE_ADMISSION | ACTIVE | ON_LEAVE | TERMINATED
  registration     String?                                // matrícula (única na empresa quando houver)
  fullName         String                                 // nome civil
  socialName       String?                                // nome social: é o exibido em tudo (displayName)
  photoFileId      String?   @db.Uuid
  workEmail        String?
  workPhone        String?
  personalEmail    String?
  personalPhone    String?
  birthDate        DateTime? @db.Date
  hideBirthday     Boolean   @default(false)
  cpf              String                                 // 11 dígitos, válido (isValidCpf)
  rg               String?
  pis              String?
  ctps             String?
  voterId          String?
  cnh              String?
  address          Json?                                  // { cep, street, number, complement, district, city, state }
  emergencyContacts Json     @default("[]")               // [{ name, relationship, phone }]
  bankName         String?
  bankAgency       String?
  bankAccountEnc   String?                                // AES-GCM
  pixKeyEnc        String?
  contractType     String                                 // CLT | APRENDIZ | ESTAGIO | TEMPORARIO | PJ | AUTONOMO
  admissionDate    DateTime  @db.Date
  weeklyHours      Int       @default(44)
  restDays         Int[]     @default([])                 // vazio = o padrão da empresa
  departmentId     String?   @db.Uuid
  positionId       String?   @db.Uuid
  managerId        String?   @db.Uuid                     // Employee (sem ciclo)
  locationId       String?   @db.Uuid
  costCenter       String?
  customFields     Json      @default("{}")
  rhNotes          String?                                // grupo rh_notes
  terminationDate  DateTime? @db.Date
  terminationType  String?                                // SEM_JUSTA_CAUSA | PEDIDO | JUSTA_CAUSA | ACORDO | FIM_CONTRATO | FIM_ESTAGIO | OUTRO
  terminationReason String?
  rehireEligible   Boolean?
  anonymizedAt     DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  @@unique([organizationId, cpf])
  @@unique([organizationId, userId])
  @@index([organizationId, managerId])
  @@index([organizationId, status])
}

model EmploymentEvent {                   // histórico (linha do tempo da ficha); nunca é editado, só acrescentado
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  kind           String                                   // ADMISSION | POSITION | DEPARTMENT | MANAGER | CONTRACT | LOCATION | STATUS | TERMINATION | REHIRE
  effectiveDate  DateTime @db.Date
  from           Json?                                    // { id, name } ou valor
  to             Json?
  reason         String?                                  // "Promoção", "Reestruturação"
  actorId        String?  @db.Uuid
  createdAt      DateTime @default(now())
  @@index([organizationId, employeeId, effectiveDate])
}

model Compensation {                      // salário com vigência (grupo compensation)
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  effectiveDate  DateTime @db.Date
  amountCents    Int                                      // mensal (ou por hora, conforme unit)
  unit           String   @default("MONTH")               // MONTH | HOUR
  reason         String?                                  // "Admissão", "Promoção", "Dissídio", "Mérito"
  actorId        String?  @db.Uuid
  createdAt      DateTime @default(now())
  @@index([organizationId, employeeId, effectiveDate])
}

model Dependent {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  name           String
  relationship   String                                   // FILHO | CONJUGE | PAI_MAE | OUTRO
  birthDate      DateTime? @db.Date
  cpf            String?
  forIncomeTax   Boolean  @default(false)
  forFamilyAllowance Boolean @default(false)
}

model DataChangeRequest {                 // pedido de alteração de dados pelo autoatendimento
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  changes        Json                                     // { address: {...}, bank: {...}, dependents: [...], emergencyContacts: [...] } (banco cifrado aqui também)
  approvalId     String?  @db.Uuid
  appliedAt      DateTime?
  createdAt      DateTime @default(now())
}

model RhAccessLog {                       // leitura de dados sensíveis
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  actorUserId    String   @db.Uuid
  employeeId     String   @db.Uuid
  action         String                                   // view_compensation | download_document | export | data_export | view_cid
  detail         String?
  ip             String?
  at             DateTime @default(now())
  @@index([organizationId, employeeId, at])
}
```

**Organograma sem ciclo**: o serviço recusa (`wouldCreateCycle`) e uma trigger `rh_employee_no_cycle` (CTE recursiva subindo `managerId`) protege o banco contra corrida. Desligar alguém com subordinados exige escolher o novo gestor deles na mesma operação.

## Férias e ausências

```prisma
model VacationPeriodAdjust {              // o que o RH decide sobre um período (o resto é calculado do histórico)
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  periodIndex    Int
  lost           Boolean  @default(false)                 // perdeu o direito (art. 133), com motivo
  extraAbsences  Int      @default(0)                     // faltas lançadas antes do sistema (migração)
  initialUsed    Int      @default(0)                     // dias já gozados antes do sistema
  note           String?
  @@id([organizationId, employeeId, periodIndex])
}

model VacationRequest {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  periodIndex    Int
  segments       Json                                     // [{ start, days, end, returnDate, paymentDue }] (de validateVacationPlan)
  abonoDays      Int      @default(0)
  advance13th    Boolean  @default(false)                 // pede adiantamento da 1ª parcela do 13º
  status         String   @default("PENDING")             // PENDING | APPROVED | REJECTED | CANCELED
  collectiveId   String?  @db.Uuid                        // veio de férias coletivas (já aprovado)
  approvalId     String?  @db.Uuid
  noticeAckAt    DateTime?                                // ciência do aviso de férias
  warnings       Json     @default("[]")
  note           String?
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())
  @@index([organizationId, employeeId, status])
}

model CollectiveVacation {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String                                   // "Recesso de fim de ano"
  departmentIds  String[] @db.Uuid                        // vazio = empresa toda
  locationIds    String[] @db.Uuid
  start          DateTime @db.Date
  days           Int
  impact         Json                                     // collectiveImpact no momento do lançamento
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())
}

model Leave {                             // ausências (LEAVE_TYPES), inclusive faltas e atestados
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  type           String                                   // id de LEAVE_TYPES (menos "ferias")
  start          DateTime @db.Date
  days           Int
  end            DateTime @db.Date
  halfDay        Boolean  @default(false)
  documentFileId String?  @db.Uuid
  cidEnc         String?                                  // só com storeCid
  note           String?
  status         String   @default("APPROVED")            // PENDING (tipos com aprovação) | APPROVED | REJECTED | CANCELED
  approvalId     String?  @db.Uuid
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())
  @@index([organizationId, employeeId, start])
  @@index([organizationId, start, end])
}
```

O saldo **não é guardado**: `acquisitionPeriods` roda com `taken` (pedidos `APPROVED` e `PENDING` — pendente reserva o saldo para não pedir duas vezes; recusado/cancelado devolve), `absences` (contagem de `Leave` tipo `falta` dentro de cada período + `extraAbsences`) e `lost`. É barato (poucos períodos por pessoa) e nunca desencontra.

## Aprovações

```prisma
model ApprovalFlow {                      // um por tipo; os padrão nascem na ativação
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  kind           String                                   // VACATION | LEAVE | EXPENSE_REPORT | DATA_CHANGE | REQUEST:<requestTypeId>
  steps          Json                                     // [{ type, role?, userId?, mode?, when? }] (resolveApprovers)
  updatedAt      DateTime @updatedAt
  @@unique([organizationId, kind])
}

model ApprovalRequest {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  kind           String
  subjectType    String                                   // vacation_request | leave | expense_report | data_change | custom_request
  subjectId      String   @db.Uuid
  title          String                                   // "Férias de 16/11 a 05/12 (20 dias)"
  requesterEmployeeId String @db.Uuid
  requesterUserId String  @db.Uuid
  data           Json                                     // { days, amount, … } usado nas condições
  steps          Json                                     // snapshot do resolveApprovers + decisões (applyDecision)
  status         String                                   // PENDING | APPROVED | REJECTED | CANCELED
  current        Int?
  approverIds    String[] @db.Uuid                        // pendentes da etapa atual (índice GIN para "Para aprovar")
  stepStartedAt  DateTime                                 // para lembrete
  remindedAt     DateTime?
  decidedAt      DateTime?
  createdAt      DateTime @default(now())
  @@index([organizationId, status])
  @@index([approverIds], type: Gin)
}

model ApprovalDelegation {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  fromUserId     String   @db.Uuid
  toUserId       String   @db.Uuid
  start          DateTime @db.Date
  end            DateTime @db.Date
  createdAt      DateTime @default(now())
}

model RequestType {                       // solicitações personalizadas
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String                                   // "Declaração de vínculo"
  description    String?
  fields         Json     @default("[]")                  // [{ key, label, type: text|textarea|number|money|date|select|file, required, options? }]
  active         Boolean  @default(true)
}

model CustomRequest {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  requestTypeId  String   @db.Uuid
  employeeId     String   @db.Uuid
  values         Json
  status         String   @default("PENDING")
  approvalId     String?  @db.Uuid
  resolutionNote String?                                  // RH responde ("declaração anexada")
  resolutionFileId String? @db.Uuid
  createdAt      DateTime @default(now())
}
```

As decisões ficam no `steps` (JSON imutável pelo serviço: só `applyDecision` acrescenta) **e** em `ApprovalEvent { approvalId, kind: CREATED|DECIDED|REMINDED|DELEGATED|CANCELED|OVERRIDDEN, actorId, comment, at }` para o histórico e a auditoria.

## Despesas

```prisma
model ExpenseCategory {
  id               String  @id @default(uuid(7)) @db.Uuid
  organizationId   String  @db.Uuid
  name             String                                 // Refeição, Transporte, Hospedagem, Quilometragem, Outros
  limitCents       Int?                                   // por despesa
  receiptAboveCents Int?                                  // recibo obrigatório acima
  perKmCents       Int?                                   // quilometragem
  active           Boolean @default(true)
}

model ExpenseReport {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  title          String                                   // "Visita cliente Campinas — out/2026"
  status         String   @default("DRAFT")               // DRAFT | SUBMITTED | APPROVED | REJECTED | PAID
  totalCents     Int      @default(0)
  approvalId     String?  @db.Uuid
  paidAt         DateTime? @db.Date
  paidById       String?  @db.Uuid
  paymentProofFileId String? @db.Uuid
  submittedAt    DateTime?
  createdAt      DateTime @default(now())
}

model Expense {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  reportId       String?  @db.Uuid                        // null = solta (ainda não está em relatório)
  categoryId     String   @db.Uuid
  date           DateTime @db.Date
  amountCents    Int                                      // calculado no servidor (km × perKm)
  km             Decimal? @db.Decimal(8, 1)
  description    String
  receiptFileId  String?  @db.Uuid
  justification  String?
  costCenter     String?
  createdAt      DateTime @default(now())
}
```

## Admissão, checklists e documentos

```prisma
model Admission {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid                        // Employee em PRE_ADMISSION
  status         String   @default("INVITED")             // INVITED | IN_PROGRESS | SUBMITTED | CHANGES_REQUESTED | COMPLETED | CANCELED
  tokenHash      String   @unique
  tokenEnc       String                                   // para reenviar o mesmo link
  expiresAt      DateTime
  requiredDocs   Json                                     // [{ key, label, required, status: PENDING|SENT|APPROVED|REJECTED, fileIds, reason }]
  candidateData  Json     @default("{}")                  // rascunho do que a pessoa preenche (vai para a ficha ao efetivar)
  submittedAt    DateTime?
  completedAt    DateTime?
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())
}

model RhAdmissionLookup {                 // sem RLS: o link público acha a empresa pelo hash
  tokenHash      String   @id
  organizationId String   @db.Uuid
  admissionId    String   @db.Uuid
}

model ChecklistTemplate {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  kind           String                                   // ONBOARDING | OFFBOARDING
  name           String
  filter         Json     @default("{}")                  // { contractTypes?, departmentIds?, locationIds? } (escolhe o modelo sozinho)
  items          Json                                     // [{ key, title, offsetDays, assignee, required, description? }]
  isDefault      Boolean  @default(false)
}

model Checklist {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  kind           String
  templateId     String?  @db.Uuid
  baseDate       DateTime @db.Date                        // admissão ou último dia
  items          Json                                     // checklistItems() + { doneAt, doneById, assigneeUserId }
  buddyEmployeeId String? @db.Uuid                        // padrinho (onboarding)
  welcome        Json?                                    // { firstDay: { time, address, who }, message, links }
  completedAt    DateTime?
  createdAt      DateTime @default(now())
}

model DocumentCategory {
  id             String  @id @default(uuid(7)) @db.Uuid
  organizationId String  @db.Uuid
  name           String                                   // Pessoais, Contrato, Saúde ocupacional, Certificações, Holerites…
  defaultVisibility String @default("EMPLOYEE")           // RH_ONLY | EMPLOYEE | SENSITIVE
  hasExpiry      Boolean @default(false)
}

model EmployeeDocument {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  categoryId     String   @db.Uuid
  name           String
  fileId         String   @db.Uuid
  visibility     String                                   // RH_ONLY | EMPLOYEE | SENSITIVE (health)
  issuedAt       DateTime? @db.Date
  expiresAt      DateTime? @db.Date
  uploadedById   String   @db.Uuid
  createdAt      DateTime @default(now())
}

model CompanyDocument {                   // políticas com ciência
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  title          String
  fileId         String?  @db.Uuid
  bodyHtml       String?                                  // ou texto no próprio app (sanitizado)
  version        Int      @default(1)
  audience       Json     @default("{}")                  // { departmentIds?, locationIds?, contractTypes? } vazio = todos
  requireAck     Boolean  @default(true)
  dueDate        DateTime? @db.Date
  publishedAt    DateTime?
  archivedAt     DateTime?
}

model DocumentAck {
  organizationId String   @db.Uuid
  documentId     String   @db.Uuid
  version        Int
  employeeId     String   @db.Uuid
  ackAt          DateTime @default(now())
  ip             String?
  userAgent      String?
  @@id([documentId, version, employeeId])
}

model PayslipBatch {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  kind           String                                   // PAYSLIP | INCOME_REPORT | VACATION_RECEIPT | THIRTEENTH | OTHER
  reference      String                                   // "2026-09" (holerite), "2025" (informe)
  label          String                                   // "Holerite de setembro/2026"
  status         String   @default("DRAFT")               // DRAFT | PUBLISHED
  preview        Json                                     // { matched, unmatched, ambiguous } (matchPayslips/groupPagesByCpf)
  publishedAt    DateTime?
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())
}

model Payslip {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  batchId        String   @db.Uuid
  employeeId     String   @db.Uuid
  fileId         String   @db.Uuid                        // o PDF da pessoa (separado, se veio de PDF único)
  viewedAt       DateTime?
  ackAt          DateTime?
  @@unique([batchId, employeeId])
}
```

## Desempenho, metas e feedback

```prisma
model ReviewTemplate {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String
  sections       Json                                     // [{ title, questions: [{ id, kind: SCALE|TEXT, text, competency?, weight, forTypes: [SELF,MANAGER,PEER,REPORT] }] }]
}

model ReviewCycle {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String                                   // "Avaliação 2026.2"
  templateId     String   @db.Uuid
  audience       Json     @default("{}")                  // { departmentIds?, admittedBefore? }
  types          String[]                                 // SELF, MANAGER, PEER, REPORT
  phases         Json                                     // [{ key: "autoavaliacao"|"pares"|"gestor"|"calibracao", start, end }]
  status         String   @default("DRAFT")               // DRAFT | ACTIVE | CALIBRATION | RELEASED | CLOSED
  peerMax        Int      @default(3)
  releasedAt     DateTime?
  createdAt      DateTime @default(now())
}

model Review {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  cycleId        String   @db.Uuid
  revieweeId     String   @db.Uuid                        // Employee
  reviewerId     String   @db.Uuid                        // Employee
  type           String                                   // SELF | MANAGER | PEER | REPORT
  status         String   @default("PENDING")             // PENDING | DRAFT | SUBMITTED | DECLINED
  answers        Json     @default("{}")                  // { [questionId]: { score?, text? } }
  score          Decimal? @db.Decimal(3, 2)               // reviewScore ao enviar
  submittedAt    DateTime?
  @@unique([cycleId, revieweeId, reviewerId, type])
}

model ReviewOutcome {                     // calibração e resultado por pessoa no ciclo
  organizationId String   @db.Uuid
  cycleId        String   @db.Uuid
  employeeId     String   @db.Uuid
  finalScore     Decimal? @db.Decimal(3, 2)               // nota do gestor (ou calibrada)
  potential      Int?                                     // 1 | 2 | 3
  nineBox        Int?                                     // nineBox()
  calibrationNote String?                                 // só RH e gestores da calibração
  managerSummary String?                                  // devolutiva liberada para a pessoa
  feedbackMeetingAt DateTime?
  @@id([cycleId, employeeId])
}

model OneOnOne {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  managerId      String   @db.Uuid                        // Employee
  employeeId     String   @db.Uuid
  scheduledAt    DateTime
  recurrence     String?                                  // WEEKLY | BIWEEKLY | MONTHLY
  agenda         Json     @default("[]")                  // [{ id, text, authorId, done }]
  sharedNotes    String?
  privateNotes   String?                                  // só o gestor
  actionItems    Json     @default("[]")                  // [{ id, text, ownerId, dueDate, done }]
  status         String   @default("SCHEDULED")           // SCHEDULED | DONE | CANCELED
}

model Feedback {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  fromEmployeeId String   @db.Uuid
  toEmployeeId   String   @db.Uuid
  kind           String                                   // PRAISE | CONSTRUCTIVE | REQUEST (pedido) | RESPONSE
  visibility     String   @default("PRIVATE")             // PRIVATE (pessoa + gestor dela) | PUBLIC (mural, só PRAISE)
  value          String?                                  // valor da empresa (elogio)
  body           String
  requestId      String?  @db.Uuid                        // responde um pedido
  createdAt      DateTime @default(now())
}

model DevelopmentAction {                 // PDI
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  employeeId     String   @db.Uuid
  title          String
  kind           String                                   // CURSO | PROJETO | MENTORIA | LEITURA | OUTRO
  competency     String?
  dueDate        DateTime? @db.Date
  status         String   @default("TODO")                // TODO | DOING | DONE | CANCELED
  cycleId        String?  @db.Uuid
}

model Goal {                              // objetivo (OKR) ou meta individual
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  level          String                                   // COMPANY | DEPARTMENT | INDIVIDUAL
  departmentId   String?  @db.Uuid
  ownerEmployeeId String? @db.Uuid
  parentId       String?  @db.Uuid                        // alinhado a um objetivo acima
  title          String
  periodStart    DateTime @db.Date
  periodEnd      DateTime @db.Date
  visibility     String   @default("COMPANY")             // COMPANY | PRIVATE (pessoa, gestor, RH)
  status         String   @default("ACTIVE")              // ACTIVE | CLOSED | CANCELED
  progress       Int      @default(0)                     // objectiveProgress (cache, recalculado no check-in)
}

model KeyResult {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  goalId         String   @db.Uuid
  title          String
  kind           String                                   // number | percent | currency | boolean
  start          Decimal  @default(0)
  target         Decimal
  current        Decimal  @default(0)
  weight         Int      @default(1)
  ownerEmployeeId String? @db.Uuid
}

model GoalCheckIn {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  keyResultId    String   @db.Uuid
  value          Decimal
  confidence     String?                                  // ALTA | MEDIA | BAIXA
  comment        String?
  authorId       String   @db.Uuid
  createdAt      DateTime @default(now())
}
```

## Clima (anonimato no modelo)

```prisma
model Survey {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  kind           String                                   // CLIMATE | ENPS | PULSE | EXIT | CUSTOM
  title          String
  anonymous      Boolean  @default(true)
  questions      Json                                     // [{ id, kind: SCALE|ENPS|TEXT|CHOICE, text, dimension?, options? }]
  audience       Json     @default("{}")
  groupBy        String   @default("department")          // recorte gravado na resposta: department | location
  minGroup       Int      @default(5)
  opensAt        DateTime
  closesAt       DateTime
  recurrence     String?                                  // PULSE: WEEKLY | BIWEEKLY | MONTHLY (gera rodadas)
  round          Int      @default(1)
  status         String   @default("DRAFT")               // DRAFT | OPEN | CLOSED
  invitedCount   Int      @default(0)
}

model SurveyParticipation {               // SÓ quem respondeu (para não responder duas vezes e a taxa de resposta)
  organizationId String   @db.Uuid
  surveyId       String   @db.Uuid
  round          Int
  employeeId     String   @db.Uuid
  respondedOn    DateTime @db.Date                        // só o dia
  @@id([surveyId, round, employeeId])
}

model SurveyResponse {                    // SEM employeeId, SEM horário: não dá para ligar à participação
  id             String   @id @default(uuid())            // uuid v4 (aleatório): v7 carrega o horário
  organizationId String   @db.Uuid
  surveyId       String   @db.Uuid
  round          Int
  groupId        String?                                  // área/local no momento da resposta
  tenureBand     String?                                  // "<1", "1-3", "3-5", "5+"
  enps           Int?
  answers        Json                                     // { [questionId]: valor }
  comments       Json     @default("[]")                  // respostas abertas
}
```

Pesquisa **anônima**: participação e resposta são gravadas na mesma transação, mas a resposta não tem pessoa nem horário e o id é aleatório (uuid v4); a listagem de respostas não existe na API. Pesquisa **identificada** (`anonymous: false`, só para `EXIT` e `CUSTOM`, avisado em destaque na tela) grava `employeeId` numa tabela separada `SurveyIdentifiedAnswer`.

## Conteúdo inicial (gancho `seedRh`, uma vez por empresa)

- `RhSettings` com os padrões; `RhRole` do owner como `RH_ADMIN`.
- `Employee` do owner (status ativo, admissão = hoje, CPF pendente: a ficha mostra "Complete seus dados"; o CPF é obrigatório para todos os outros).
- `ApprovalFlow`: `VACATION` e `LEAVE` = `[{ type: "manager" }]`; `EXPENSE_REPORT` = `[{ type: "manager" }, { type: "role", role: "FINANCE", when: { field: "amount", op: ">", value: 100000 } }]` (centavos); `DATA_CHANGE` = `[{ type: "role", role: "RH" }]` (o papel `RH` resolve para `RH_ADMIN` + `RH`).
- `ExpenseCategory`: Refeição (limite R$ 80, recibo acima de R$ 50), Transporte (recibo acima de R$ 50), Hospedagem (recibo sempre), Quilometragem (R$ 1,20/km), Outros (recibo acima de R$ 50).
- `DocumentCategory`: Pessoais, Contrato, Saúde ocupacional (validade, sensível), Certificações (validade), Advertências (só RH), Outros.
- `ChecklistTemplate` "Admissão padrão" (−7 colaborador envia documentos · −3 TI prepara notebook e acessos · −1 gestor define padrinho e plano da 1ª semana · 0 RH boas-vindas e assinatura do contrato · 0 gestor apresenta a equipe · 7 RH exame admissional conferido · 30 gestor 1:1 de 30 dias · 85 gestor avaliação de experiência) e "Desligamento padrão" (0 TI remove acessos · 0 gestor recolhe equipamentos · 0 RH entrevista de desligamento · 2 RH exame demissional · 10 RH documentos da rescisão enviados).
- `ReviewTemplate` "Competências essenciais" (Comunicação, Colaboração, Entrega, Autonomia, Aprendizado — peso 1 — e 2 perguntas abertas) e o modelo de pesquisa "Clima completo" (8 dimensões: liderança, reconhecimento, desenvolvimento, comunicação, ambiente, carga de trabalho, propósito, remuneração e benefícios, + eNPS) e "Pulso semanal" (3 perguntas).
- `RequestType`: "Declaração de vínculo", "Adiantamento salarial", "Equipamento ou material".

## Testes obrigatórios

- RLS: outra empresa não lê nenhuma tabela do Pessoas (um teste por grupo de tabelas).
- CPF inválido → 400 com `path`; CPF repetido na empresa → 409 `CPF_TAKEN`; mesmo CPF em outra empresa → ok.
- Gestor em ciclo → 400 `INVALID_MANAGER` (serviço) e a trigger barra o UPDATE direto.
- `SurveyResponse` não tem coluna de pessoa nem de horário (teste de schema).
- `bankAccountEnc` gravado cifrado (o valor no banco não contém os dígitos).
- Ativar o app duas vezes não duplica o conteúdo inicial.
