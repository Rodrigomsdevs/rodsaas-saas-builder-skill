# Modelo de dados e regras

Todas as tabelas têm `organizationId` e **RLS com `FORCE`**, menos as duas de busca pública (`AgendaPublicLookup` e `AgendaTokenLookup`, explicadas abaixo). Relações recebem o trigger `rodsaas_assert_same_org` (função da skill `module`). Horários sempre em `timestamptz` (UTC); datas de disponibilidade e feriados são datas **locais** da pessoa.

## Configurações e página

```prisma
model AgendaSettings {                  // uma por empresa (criada na instalação e em empresas novas)
  organizationId    String   @id @db.Uuid
  pageSlug          String   @unique              // /agendar/<pageSlug>; único no sistema todo
  pageTitle         String                        // nome mostrado na página (padrão: nome da empresa)
  pageDescription   String?
  timeZone          String   @default("America/Sao_Paulo")
  blockNationalHolidays Boolean @default(true)
  blockOptionalHolidays Boolean @default(false)    // Carnaval, Corpus Christi
  reminderOffsets   Int[]    @default([1440, 60])  // minutos antes (padrão dos tipos novos)
  showBranding      Boolean  @default(true)
  theme             Json     @default("{}")        // cor, capa, logo (feature agenda_branding)
  whatsapp          String?                        // botão "falar no WhatsApp" na página
  segment           AgendaSegment @default(GENERAL)  // perfil (09-perfis-de-segmento.md)
  requestConfirmation Boolean @default(true)       // o lembrete pede "confirmo"
  confirmationHoursBefore Int @default(24)
  depositAfterNoShows Int?                         // exige sinal de quem faltou N vezes (null = nunca)
  defaultDeposit    Json     @default("{\"kind\":\"PERCENT\",\"value\":50}")
  depositExpiresMin Int      @default(30)          // prazo para pagar o sinal (segura o horário)
  refundIfHoursBefore Int    @default(24)          // devolve o sinal se o cliente cancelar com essa antecedência
  waitlistOfferMin  Int      @default(30)          // prazo para aceitar a vaga oferecida pela lista de espera
  loyalty           Json?                          // { everyN, serviceIds } ou null
  commissionMode    String   @default("PARTNER")   // PARTNER (salão parceiro) | CLT — categoria das contas a pagar
  updatedAt         DateTime @updatedAt
}

enum AgendaSegment { GENERAL BARBERSHOP SALON CLINIC DENTAL PET CONSULTING }

model AgendaHoliday { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; date DateTime @db.Date; name String; @@unique([organizationId, date]) }

model AgendaPublicLookup {              // SEM RLS: o público chega só com o slug da empresa
  pageSlug       String @id
  organizationId String @unique @db.Uuid
}
```

Membros que atendem têm um **slug por empresa** para a página da pessoa: `AgendaMemberProfile (organizationId, userId, slug, displayName, bio?, avatarFileId?, @@unique([organizationId, slug]))`.

## Disponibilidade

```prisma
model AgendaSchedule {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  userId         String   @db.Uuid
  name           String                        // "Horário comercial", "Retornos"
  timeZone       String                        // IANA; validado com isValidTimeZone
  weekly         Json                          // { "1": [["09:00","12:00"],["14:00","18:00"]], ... } (validateWeekly)
  isDefault      Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model AgendaScheduleOverride {
  organizationId String   @db.Uuid
  scheduleId     String   @db.Uuid
  date           DateTime @db.Date             // data local
  intervals      Json                          // [] = folga; [["09:00","12:00"]] = horário especial
  note           String?
  @@id([scheduleId, date])
}
```

- Toda pessoa que atende tem **uma agenda padrão** (índice único parcial `WHERE "isDefault"` por `userId` + empresa). Criada automaticamente: "Horário comercial", seg–sex 09:00–18:00, fuso da empresa.
- Exceção vale mais que feriado; feriado vale mais que o horário semanal (`agenda-lib windowsFor`).
- Feriados aplicados: nacionais (BrasilAPI com cache por ano; `brazilHolidays` como reserva se o serviço falhar), facultativos se ligados, e os de `AgendaHoliday`.

## Tipos de agendamento

```prisma
enum AgendaAssignment { ONE ANY ALL CLIENT }
enum AgendaLocationKind { IN_PERSON JITSI GOOGLE_MEET LINK PHONE_CLIENT PHONE_HOST WHATSAPP TBD }

model AgendaEventType {
  id               String             @id @default(uuid(7)) @db.Uuid
  organizationId   String             @db.Uuid
  name             String
  slug             String                              // único na empresa
  description      String?
  color            String             @default("brand")
  durations        Int[]                               // minutos; a primeira é a padrão
  priceCents       Int?
  locationKind     AgendaLocationKind @default(JITSI)
  locationValue    String?                             // endereço, link fixo, telefone
  assignment       AgendaAssignment   @default(ONE)
  slotIntervalMin  Int?                                // null = a duração
  bufferBeforeMin  Int                @default(0)
  bufferAfterMin   Int                @default(0)
  minNoticeMin     Int                @default(120)
  maxDaysAhead     Int                @default(60)
  maxPerDay        Int?
  capacity         Int                @default(1)       // >1 = turma
  requiresApproval Boolean            @default(false)
  phoneRequired    Boolean            @default(false)   // sempre true quando o local é PHONE_CLIENT ou WHATSAPP
  questions        Json               @default("{\"version\":1,\"fields\":[],\"hidden\":[]}")   // esquema do forms-lib
  cancelPolicy     Json               @default("{\"minHoursBefore\":2,\"allowReschedule\":true,\"allowCancel\":true}")
  reminderOffsets  Int[]
  followUpFormId   String?            @db.Uuid          // formulário do Forms enviado depois do atendimento
  resourceIds      String[]           @db.Uuid          // grupo de recursos: basta UM livre (vazio = não usa recurso)
  combinable       Boolean            @default(false)   // pode ser somado a outro serviço (adicional do combo)
  addOnIds         String[]           @db.Uuid          // adicionais oferecidos junto deste (vazio = nenhum)
  comboDiscountPct Decimal?           @db.Decimal(5, 2)
  deposit          Json?                                // { kind: "PERCENT" | "FIXED", value } — sinal exigido
  waitlist         Boolean            @default(false)   // aceita lista de espera
  allowRecurring   Boolean            @default(false)
  insuranceIds     String[]           @db.Uuid          // convênios aceitos (vazio = só particular)
  intakeFormId     String?            @db.Uuid          // anamnese (Forms) antes da primeira vez
  consentTemplateId String?           @db.Uuid          // termo de consentimento (Comercial)
  returnAfterDays  Int?                                 // retorno sugerido depois de concluir
  active           Boolean            @default(true)
  hidden           Boolean            @default(false)   // fora da página da empresa, só com o link direto
  position         String
  createdById      String             @db.Uuid
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  deletedAt        DateTime?
  @@unique([organizationId, slug])
}

model AgendaEventTypeHost {
  organizationId String  @db.Uuid
  eventTypeId    String  @db.Uuid
  userId         String  @db.Uuid
  scheduleId     String? @db.Uuid               // null = agenda padrão da pessoa
  priority       Int     @default(0)            // ordem do rodízio em empate
  @@id([eventTypeId, userId])
}
```

- Configuração validada com `agenda-lib validateEventTypeConfig` (e o esquema das perguntas com `forms-lib validateSchema`). As perguntas fixas (nome, e-mail, WhatsApp) não ficam no esquema: sempre existem, com WhatsApp obrigatório ou opcional por tipo.
- `ONE` exige uma pessoa; `ANY`/`ALL`/`CLIENT` exigem 2+ e a feature `agenda_team`; turma (`capacity > 1`) não combina com `ANY`.

## Agendamentos (com trava contra sobreposição)

```prisma
enum AppointmentKind   { APPOINTMENT BLOCK }
enum AppointmentStatus { HELD AWAITING_PAYMENT PENDING CONFIRMED CANCELED DECLINED }

model Appointment {
  id               String            @id @default(uuid(7)) @db.Uuid
  organizationId   String            @db.Uuid
  kind             AppointmentKind   @default(APPOINTMENT)
  eventTypeId      String?           @db.Uuid
  title            String                                // "Consulta · Ana Souza" (bloqueio: "Almoço")
  start            DateTime
  end              DateTime
  status           AppointmentStatus
  holdExpiresAt    DateTime?                             // reserva temporária (HELD)
  capacity         Int               @default(1)
  seatsTaken       Int               @default(0)
  locationKind     AgendaLocationKind?
  location         String?                               // endereço ou link resolvido (sala Jitsi gerada aqui)
  notes            String?                               // anotações internas
  createdVia       String            @default("PUBLIC")  // PUBLIC | INTERNAL | API
  createdById      String?           @db.Uuid
  rescheduledFromId String?          @db.Uuid
  cancelReason     String?
  canceledBy       String?                               // CLIENT | TEAM
  canceledAt       DateTime?
  externalEvents   Json              @default("{}")      // { google: { userId: eventId }, microsoft: {...} }
  sequence         Int               @default(0)         // .ics: incrementa a cada remarcação
  serviceIds       String[]          @db.Uuid            // combo: o tipo principal + os adicionais, na ordem
  priceCents       Int?                                  // preço do momento (combo, clube, convênio)
  paymentKind      String            @default("PRIVATE") // PRIVATE | CLUB | INSURANCE | LOYALTY
  insuranceId      String?           @db.Uuid
  clubSubscriptionId String?         @db.Uuid
  resourceId       String?           @db.Uuid
  seriesId         String?           @db.Uuid
  deposit          Json?                                 // { amountCents, chargeId, status: PENDING|PAID|REFUNDED|RETAINED|EXPIRED, expiresAt, reason, refundCents }
  clientConfirmedAt DateTime?
  checkedInAt      DateTime?
  completedAt      DateTime?
  intake           Json?                                 // { formId, required, responseId? }
  consentEnvelopeId String?          @db.Uuid
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  @@index([organizationId, start])
  @@index([organizationId, status, start])
}

model AppointmentHost {                // uma linha por pessoa que atende (coletiva = várias)
  organizationId String   @db.Uuid
  appointmentId  String   @db.Uuid
  userId         String   @db.Uuid
  blockStart     DateTime              // início − intervalo antes (blockRange)
  blockEnd       DateTime              // fim + intervalo depois
  active         Boolean  @default(true) // false quando o agendamento é cancelado/recusado ou a reserva expira
  @@id([appointmentId, userId])
  @@index([organizationId, userId, blockStart])
}

model AppointmentAttendee {
  id               String    @id @default(uuid(7)) @db.Uuid
  organizationId   String    @db.Uuid
  appointmentId    String    @db.Uuid
  clientId         String    @db.Uuid
  name             String
  email            String
  phone            String?
  timeZone         String                            // do cliente, para os e-mails
  answers          Json      @default("{}")          // forms-lib validateAnswers
  status           String    @default("BOOKED")       // BOOKED | CANCELED
  attendance       String?                           // ATTENDED | NO_SHOW
  manageTokenHash  String    @unique                 // hashToken(token do link "gerenciar")
  manageTokenEnc   String                            // o mesmo token criptografado (AES-256-GCM, AGENDA_ENCRYPTION_KEY): a equipe copia/reenvia o link e monta as mensagens de WhatsApp; nunca sai na lista
  createdAt        DateTime  @default(now())
}

model AgendaClient {
  id               String   @id @default(uuid(7)) @db.Uuid
  organizationId   String   @db.Uuid
  name             String
  email            String?                          // minúsculo
  phone            String?                          // 55DDDNÚMERO
  crmContactId     String?  @db.Uuid
  bookingsCount    Int      @default(0)
  noShowCount      Int      @default(0)
  lastBookingAt    DateTime?
  createdAt        DateTime @default(now())
  @@index([organizationId, email])
  @@index([organizationId, phone])
}

model AgendaEvent {                    // histórico do agendamento (painel e auditoria)
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  appointmentId  String   @db.Uuid
  type           String                  // created, confirmed, declined, rescheduled, canceled, attendance, reminder_sent, email_failed
  actorId        String?  @db.Uuid       // null = cliente ou sistema
  actorKind      String                  // TEAM | CLIENT | SYSTEM
  data           Json                    // { from, to, reason } legível sem joins
  createdAt      DateTime @default(now())
  @@index([appointmentId, createdAt])
}

model AppointmentResource {             // trava do recurso (cadeira, sala) — mesma ideia do AppointmentHost
  organizationId String   @db.Uuid
  appointmentId  String   @db.Uuid
  resourceId     String   @db.Uuid
  blockStart     DateTime
  blockEnd       DateTime
  active         Boolean  @default(true)
  @@id([appointmentId, resourceId])
}

model AppointmentItem {                 // linhas do atendimento concluído (serviços e produtos)
  id              String   @id @default(uuid(7)) @db.Uuid
  organizationId  String   @db.Uuid
  appointmentId   String   @db.Uuid
  kind            String                     // SERVICE | PRODUCT
  serviceId       String?  @db.Uuid
  productId       String?  @db.Uuid          // produto do ERP, se instalado
  name            String
  qty             Decimal  @db.Decimal(12, 3)
  unitCents       Int
  amountCents     Int                        // líquido (depois do desconto)
  baseCents       Int?                       // base da comissão quando diferente (clube)
  hostId          String   @db.Uuid
  commissionCents Int                        // gravada na conclusão; não muda com a regra
  completedAt     DateTime                   // = Appointment.completedAt (para o extrato do período)
  @@index([organizationId, completedAt])
}

model AgendaTokenLookup {              // SEM RLS: o link do cliente chega só com o token
  tokenHash      String @id
  organizationId String @db.Uuid
  attendeeId     String @unique @db.Uuid
}
```

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ninguém atende dois compromissos ao mesmo tempo (inclui intervalos antes/depois, reservas e bloqueios)
ALTER TABLE "AppointmentHost" ADD CONSTRAINT "AppointmentHost_no_overlap"
  EXCLUDE USING gist ("organizationId" WITH =, "userId" WITH =, tstzrange("blockStart", "blockEnd") WITH &&)
  WHERE (active);

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_range" CHECK ("end" > "start");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_seats" CHECK ("seatsTaken" >= 0 AND "seatsTaken" <= capacity);
-- uma agenda padrão por pessoa na empresa
CREATE UNIQUE INDEX "AgendaSchedule_default_uq" ON "AgendaSchedule" ("organizationId", "userId") WHERE "isDefault";
```

- **Turma**: um `Appointment` por sessão (horário), com `capacity` e `seatsTaken`; cada pessoa que agenda vira um `AppointmentAttendee`. Agendar numa sessão existente trava a linha do `Appointment` (`FOR UPDATE`), confere as vagas e incrementa; a trava do `AppointmentHost` vale para a sessão inteira (uma vez).
- **Coletiva** (`ALL`): uma linha em `AppointmentHost` para cada pessoa; se qualquer uma estiver ocupada, a restrição recusa e nada é gravado.
- **Reserva temporária** (`HELD`): criada quando o cliente escolhe o horário (5 min), já com as linhas de `AppointmentHost` ativas (segura o horário). Ao agendar, vira `PENDING`/`CONFIRMED`. Job a cada minuto desativa reservas vencidas (`active = false`, status `CANCELED`); o service também limpa as vencidas daquela pessoa dentro da transação antes de inserir. Para turma, a reserva segura uma vaga (`seatsTaken + 1`).
- **Bloqueio** (`kind = BLOCK`): mesmas tabelas (sem participantes), então a trava também vale para ele.
- Violação da restrição (`23P01`) vira **409 `SLOT_TAKEN`** com mensagem amigável.
- Cancelar/recusar: `status`, `canceledAt`, `cancelReason`, `active = false` nas linhas de `AppointmentHost` (libera o horário na hora). Remarcar: cria um novo `Appointment` com `rescheduledFromId` (o antigo vira `CANCELED` com motivo "Remarcado") e **o mesmo token** do participante passa a apontar para o novo; `sequence + 1` para o `.ics` atualizar o evento no calendário do cliente.
- Cliente (`AgendaClient`): casado por e-mail, depois telefone (normalizados); criado se não existir; contadores atualizados por agendamento e por falta.
- **Tokens**: `newToken()` vai só no link; o banco guarda `hashToken()` (e a linha em `AgendaTokenLookup`). Token não expira enquanto o agendamento existir; depois de 30 dias do horário, o link só mostra o resumo.
- As tabelas sem RLS guardam **só** slug/hash → ids; toda leitura acontece depois, dentro de `withTenant(organizationId)`. Justificativa no README do projeto.

## Recursos, séries, lista de espera e clínica

```prisma
model AgendaResource {
  id             String  @id @default(uuid(7)) @db.Uuid
  organizationId String  @db.Uuid
  name           String                       // "Cadeira 1", "Consultório 2", "Autoclave"
  kind           String  @default("ROOM")     // CHAIR | ROOM | BED | EQUIPMENT | OTHER
  active         Boolean @default(true)
  position       String
}

model AgendaSeries {                     // agendamentos recorrentes
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  eventTypeId    String   @db.Uuid
  clientId       String   @db.Uuid
  hostId         String   @db.Uuid
  rule           Json                          // { freq, interval, count?, until? }
  createdAt      DateTime @default(now())
}

model AgendaWaitlistEntry {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  eventTypeId    String   @db.Uuid
  hostId         String?  @db.Uuid
  clientId       String   @db.Uuid
  dateFrom       DateTime @db.Date
  dateTo         DateTime @db.Date
  periods        String[]                      // MORNING | AFTERNOON | EVENING (vazio = qualquer)
  status         String   @default("WAITING")  // WAITING | OFFERED | BOOKED | EXPIRED | CANCELED
  offer          Json?                         // { start, end, hostId, holdId, expiresAt }
  offerTokenHash String?  @unique
  createdAt      DateTime @default(now())
  @@index([organizationId, eventTypeId, status, createdAt])
}

model AgendaInsurance { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; active Boolean @default(true); prices Json @default("{}") /* { [eventTypeId]: centavos do paciente } */ }

model AgendaRecall {                     // retorno sugerido
  id                  String   @id @default(uuid(7)) @db.Uuid
  organizationId      String   @db.Uuid
  clientId            String   @db.Uuid
  eventTypeId         String   @db.Uuid
  dueDate             DateTime @db.Date
  sourceAppointmentId String   @db.Uuid
  status              String   @default("OPEN") // OPEN | BOOKED | DISMISSED
  contactedAt         DateTime?
}
```

## Balcão: fila, comissões, clube e fidelidade

```prisma
model AgendaQueueEntry {                 // fila do dia (sem hora marcada)
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  date           DateTime @db.Date             // dia local da empresa
  name           String
  phone          String?
  clientId       String?  @db.Uuid
  serviceIds     String[] @db.Uuid
  hostId         String?  @db.Uuid             // preferência
  status         String   @default("WAITING")  // WAITING | CALLED | LEFT
  appointmentId  String?  @db.Uuid
  createdAt      DateTime @default(now())
}

model AgendaCommissionRule { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; kind String /* SERVICE|PRODUCT */; hostId String? @db.Uuid; serviceId String? @db.Uuid; pct Decimal? @db.Decimal(5, 2); fixedCents Int? }
model AgendaCommissionClosing { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; from DateTime @db.Date; to DateTime @db.Date; totals Json; closedById String @db.Uuid; closedAt DateTime @default(now()) }

model AgendaClubPlan { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; priceCents Int; serviceIds String[] @db.Uuid; usesPerPeriod Int?; active Boolean @default(true) }
model AgendaClubSubscription {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  planId         String   @db.Uuid
  clientId       String   @db.Uuid
  anchorDate     DateTime @db.Date             // início: âncora dos períodos (clubPeriodOf)
  status         String   @default("ACTIVE")   // ACTIVE | PAST_DUE | CANCELED
  financeRecurrenceId String? @db.Uuid         // recorrência no Financeiro
  createdAt      DateTime @default(now())
  canceledAt     DateTime?
}
model AgendaLoyaltyRedemption { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; clientId String @db.Uuid; appointmentId String @unique @db.Uuid; createdAt DateTime @default(now()) }
```

`AgendaClient` ganha `notes String?`, `tags String[]`, `birthDate DateTime? @db.Date`, `insuranceId String? @db.Uuid`, `insuranceCard String?` e `whatsappOptOut Boolean @default(false)` (quem pediu para não receber mensagem).

```sql
-- recurso também não atende dois ao mesmo tempo (sessão de turma é uma linha só)
ALTER TABLE "AppointmentResource" ADD CONSTRAINT "AppointmentResource_no_overlap"
  EXCLUDE USING gist ("organizationId" WITH =, "resourceId" WITH =, tstzrange("blockStart", "blockEnd") WITH &&)
  WHERE (active);
-- uma assinatura ativa por cliente e plano; uma entrada da fila aberta por telefone e dia
CREATE UNIQUE INDEX "AgendaClubSubscription_active_uq" ON "AgendaClubSubscription" ("organizationId", "clientId", "planId") WHERE status <> 'CANCELED';
```

Regras:
- **Recurso**: escolhido na reserva/agendamento entre os livres do grupo do tipo (o primeiro livre pela posição, ou o pedido); a linha de `AppointmentResource` entra na mesma transação e a restrição `EXCLUDE` é a última palavra (`23P01` → 409 `SLOT_TAKEN`). Cancelar/recusar/reserva vencida → `active = false`.
- `AWAITING_PAYMENT` **segura o horário** como `HELD` (linhas ativas) até `deposit.expiresAt`; o job das reservas vencidas também cancela o sinal vencido (`deposit.status = EXPIRED`, motivo "Sinal não pago") e oferece a vaga à lista de espera.
- Concluir antes do fim encurta `end` e `blockEnd` (libera o resto); linhas de `AppointmentItem` são imutáveis depois de um `AgendaCommissionClosing` que cobre a data.

## Integrações

```prisma
model AgendaCalendarConnection {        // Google ou Microsoft, por pessoa
  id              String   @id @default(uuid(7)) @db.Uuid
  organizationId  String   @db.Uuid
  userId          String   @db.Uuid
  provider        String                       // GOOGLE | MICROSOFT
  accountEmail    String
  accessTokenEnc  String                       // AES-256-GCM com AGENDA_ENCRYPTION_KEY
  refreshTokenEnc String
  expiresAt       DateTime
  checkCalendars  Json     @default("[]")      // ids das agendas que contam como ocupado
  writeCalendarId String?                      // onde criar os eventos
  status          String   @default("OK")      // OK | NEEDS_REAUTH
  lastError       String?
  createdAt       DateTime @default(now())
  @@unique([organizationId, userId, provider])
}

model AgendaFeedToken { organizationId String @db.Uuid; userId String @db.Uuid; tokenHash String @unique; createdAt DateTime @default(now()); @@id([organizationId, userId]) }

model AgendaWebhook { /* igual ao FormWebhook do forms: url, secret, active, lastStatus, failureCount */ }
model AgendaWebhookDelivery { /* igual ao FormWebhookDelivery */ }
```

## Travas de mesma empresa

| Tabela | Colunas com `rodsaas_assert_same_org` |
|---|---|
| `AgendaScheduleOverride` | `scheduleId` |
| `AgendaEventTypeHost` | `eventTypeId`, `scheduleId` |
| `Appointment` | `eventTypeId`, `rescheduledFromId` |
| `AppointmentHost`, `AppointmentAttendee`, `AgendaEvent` | `appointmentId` (+ `clientId` no participante) |
| `AgendaWebhookDelivery` | `webhookId` |
| `AppointmentResource` | `appointmentId`, `resourceId` |
| `AppointmentItem` | `appointmentId` |
| `AgendaSeries`, `AgendaWaitlistEntry`, `AgendaRecall` | `eventTypeId`, `clientId` (+ `sourceAppointmentId` no retorno) |
| `AgendaQueueEntry` | `clientId`, `appointmentId` |
| `AgendaClubSubscription` | `planId`, `clientId` |

Usuários (`userId` de agendas, pessoas que atendem, conexões) conferidos no service (membros da empresa).

## Conteúdo inicial

Na instalação (para cada empresa) e na criação de empresa nova: `AgendaSettings` (slug da página a partir do nome da empresa, único com sufixo se preciso; `AgendaPublicLookup`), agenda padrão do owner (e de cada membro: quem ainda não tem ganha a padrão — seg–sex 09:00–18:00 no fuso da empresa — no primeiro `GET /v1/agenda/schedules` dele ou ao entrar como pessoa que atende num tipo), perfil do owner (slug do nome) e os tipos de exemplo **inativos** do perfil de segmento (`GENERAL`: "Reunião de 30 minutos" com Jitsi; os outros em `09-perfis-de-segmento.md`), para a tela não começar vazia sem publicar nada sozinho. Perfis que ligam comissões criam as regras padrão (40% serviços, 10% produtos).
