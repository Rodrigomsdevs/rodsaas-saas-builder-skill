# API

Padrão da base em tudo: `/v1`, tenant do token, `withTenant`, schemas Zod de entrada (estritos) e saída (com nome no OpenAPI), RFC 9457, cursor, `config` declarativo. Todo horário entra e sai em ISO 8601 UTC; fusos são nomes IANA. Horários livres sempre calculados pelo `agenda-lib computeSlots`.

Os formatos marcados com ★ fazem parte do **contrato testável** (`skills/verify/contract.json`, grupo `presets.agenda`).

## Configurações, feriados e perfis

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/agenda/settings` | — | `{ pageSlug, publicUrl, pageTitle, pageDescription, timeZone, blockNationalHolidays, blockOptionalHolidays, reminderOffsets, showBranding, theme, whatsapp }` |
| `PATCH /v1/agenda/settings` | owner/admin | campos acima; `pageSlug` único (409 `SLUG_TAKEN`; atualiza o lookup; o link antigo deixa de funcionar e a tela avisa) |
| `GET /v1/agenda/holidays?year=` | — | nacionais (com `optional`) + os da empresa, com a indicação de quais bloqueiam |
| `POST/DELETE /v1/agenda/holidays[/:id]` | owner/admin | feriados da empresa (municipais, recessos) |
| `GET/PUT /v1/agenda/profiles/me` · `GET /v1/agenda/profiles` | — | slug e nome de exibição da pessoa na página pública |

## Disponibilidade

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/agenda/schedules?userId=` | própria; de outros só owner/admin | `{ data: [{ id, userId, name, timeZone, weekly, isDefault, overrides: [{ date, intervals, note }] }] }` (exceções dos próximos 12 meses) |
| `POST /v1/agenda/schedules` | idem | `{ name, timeZone, weekly, userId? }` |
| ★ `PATCH /v1/agenda/schedules/:id` | idem | `{ name?, timeZone?, weekly?, isDefault? }` (`validateWeekly`; erro em `weekly.<dia>.<i>`) |
| `DELETE /v1/agenda/schedules/:id` | idem | não pode excluir a padrão nem uma usada por tipo ativo (diz quais) |
| `PUT /v1/agenda/schedules/:id/overrides/:date` · `DELETE` | idem | exceção do dia (`intervals: []` = folga) |
| `GET /v1/agenda/availability/preview?scheduleId=&from=&to=` | idem | horários livres de 30 em 30 só pela disponibilidade (para a tela mostrar o efeito das mudanças) |

## Tipos de agendamento

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/agenda/event-types` | — | lista com pessoas, `publicUrl`, `active`, `hidden`, contagem de agendamentos futuros |
| ★ `POST /v1/agenda/event-types` | `limit: 'agendaEventTypes'` (se ativo), idempotente | `{ name, slug?, durations?, priceCents?, locationKind?, locationValue?, assignment?, hostIds?, slotIntervalMin?, bufferBeforeMin?, bufferAfterMin?, minNoticeMin?, maxDaysAhead?, maxPerDay?, capacity?, requiresApproval?, phoneRequired?, questions?, cancelPolicy?, reminderOffsets?, active? }` → **`{ id, slug, publicUrl, ... }`**; sem `hostIds` → quem cria; sem `durations` → `[30]`; slug gerado do nome e único na empresa |
| ★ `GET /v1/agenda/event-types/:id` · ★ `PATCH` | — | detalhe / alterar (mudanças valem para novos agendamentos; os marcados não mudam) |
| `POST /v1/agenda/event-types/:id/duplicate` · `DELETE` · `POST .../restore` | — | excluir com agendamentos futuros pede confirmação e não cancela os marcados |
| `PUT /v1/agenda/event-types/:id/hosts` | — | `[{ userId, scheduleId?, priority? }]` (limite `agendaHosts`) |

Validações: `validateEventTypeConfig`, `forms-lib validateSchema` nas perguntas, `ANY/ALL/CLIENT`, aprovação e turma exigem `agenda_team`; pessoas precisam ser membros com agenda.

## Agendamentos (interno)

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/agenda/appointments` | — | `?from=&to=` (obrigatório na visão de calendário), `hostId` (`me`, ids), `status` (`upcoming`, `pending`, `past`, `canceled`, ou os status), `eventTypeId`, `clientId`, `q`, `kind`, cursor; item **`{ id, kind, title, start, end, status, eventType: { id, name, color } \| null, hosts: [{ id, name }], attendees: [{ id, name, email, phone, attendance, status }], location, seatsTaken, capacity }`** |
| ★ `GET /v1/agenda/appointments/:id` | — | + respostas das perguntas, anotações, histórico (`AgendaEvent`: criado, remarcado, cancelado, aprovado, presença), links |
| ★ `POST /v1/agenda/appointments` | idempotente | encaixe interno: `{ eventTypeId, start, durationMin?, hostIds?, client: { name, email?, phone? } \| { clientId }, answers?, notes?, notify?: boolean, outsideAvailability?: boolean }` → `CONFIRMED`; fora da disponibilidade só com `outsideAvailability: true` (a tela pergunta); sobreposição nunca (409 `SLOT_TAKEN`) |
| ★ `PATCH /v1/agenda/appointments/:id` | — | remarcar `{ start, end?, hostIds? }` (arrastar na agenda), `notes`; avisa o cliente se `notify` (padrão: sim) |
| ★ `POST /v1/agenda/appointments/:id/confirm` · `POST .../decline { reason? }` | — | aprovação manual (`PENDING` → `CONFIRMED`/`DECLINED`) |
| ★ `POST /v1/agenda/appointments/:id/cancel` | — | `{ reason?, notify? }` → `CANCELED`, libera o horário |
| ★ `POST /v1/agenda/appointments/:id/attendance` | — | `{ attendeeId?, attendance: 'ATTENDED' \| 'NO_SHOW' \| null }` (só depois do início); atualiza contadores do cliente |
| `POST /v1/agenda/appointments/:id/resend` | — | reenvia a confirmação ao cliente |
| `POST /v1/agenda/blocks` · `DELETE /v1/agenda/blocks/:id` | — | bloqueio `{ start, end, title?, userId? }` (de outros só owner/admin) |
| `GET /v1/agenda/clients` · `GET /v1/agenda/clients/:id` | — | clientes com contadores e histórico |
| `GET /v1/agenda/booking-link?eventTypeId=&hostId=&prefill=` | — | link pronto (com nome/e-mail preenchidos) para mandar ao cliente; usado pelo CRM |

## Relatórios

`GET /v1/agenda/reports/overview?from=&to=&hostId=&eventTypeId=` → totais (agendados, realizados, faltas, cancelados pelo cliente e pela equipe, remarcados, taxa de comparecimento, receita estimada = soma dos preços dos realizados), série por dia, por tipo, por profissional (com ocupação = minutos agendados ÷ minutos disponíveis), mapa de calor dia da semana × hora e antecedência média dos cancelamentos. Tudo em SQL no servidor, no fuso da empresa. `GET /v1/agenda/reports/overview.csv` com `;` e BOM.

## API pública (sem login, `public: true`, **sem checagem de Origin/CSRF**, rate limit por IP)

| Rota | Faz |
|---|---|
| ★ `GET /v1/public/agenda/:page` | página da empresa: `{ title, description, timeZone, theme, showBranding, whatsapp, eventTypes: [{ slug, name, description, durations, priceCents, locationKind, capacity, color }], people: [{ slug, name, avatarUrl }] }` (só tipos ativos e não ocultos; limite do plano → 410 `AGENDA_UNAVAILABLE`) |
| ★ `GET /v1/public/agenda/:page/types/:type` | tipo: o acima + `questions`, `assignment`, `hosts` (quando o cliente escolhe), `phoneRequired` |
| `GET /v1/public/agenda/:page/people/:person` | página da pessoa: os tipos em que ela atende |
| ★ `GET /v1/public/agenda/:page/types/:type/slots?from=&to=&timeZone=&durationMin=&hostId=` | **`{ timeZone, days: { "YYYY-MM-DD": [{ start, end, seatsLeft }] } }`** no fuso pedido; intervalo de até 42 dias; nunca devolve quem atende quando é rodízio |
| ★ `POST /v1/public/agenda/:page/types/:type/holds` | `{ start, durationMin?, hostId? }` → `{ holdId, expiresAt }` (reserva de 5 min; rate limit 10/min por IP em cada página); horário ocupado → 409 `SLOT_TAKEN` |
| ★ `POST /v1/public/agenda/:page/types/:type/bookings` | `{ start, durationMin?, hostId?, holdId?, name, email, phone?, answers?, timeZone, _gotcha?, _ts? }` + `Idempotency-Key` → **201 `{ status: 'CONFIRMED' \| 'PENDING', start, end, manageUrl, location? }`** (o link do Jitsi/Meet só aparece para confirmado) |
| ★ `GET /v1/public/agenda/manage/:token` | `{ status, start, end, timeZone, eventType: { name }, hostNames, location, canCancel, canReschedule, policyMessage, attendee: { name } }` |
| ★ `POST /v1/public/agenda/manage/:token/cancel` | `{ reason? }` respeitando a política (`canChange`) → 200; fora da política 409 `CHANGE_NOT_ALLOWED` |
| ★ `POST /v1/public/agenda/manage/:token/reschedule` | `{ start, holdId? }` → novo horário (mesmo token) |
| `GET /v1/public/agenda/manage/:token/slots?from=&to=&timeZone=` | horários para remarcar (mesmo tipo e mesma regra de pessoa) |
| `GET /v1/public/agenda/manage/:token/ics` | `.ics` do agendamento (`buildIcs`) |
| `GET /v1/public/agenda/feed/:token.ics` | feed da pessoa: próximos 90 dias e últimos 30 (`method: PUBLISH`), sem dados sensíveis das respostas; token da `AgendaFeedToken` (regenerável) |

Regras do agendamento público (service `bookAppointment`, numa transação):
1. Anti-spam: `_gotcha` preenchido ou `_ts` (quando a página abriu) com menos de 2 s → 201 falso (com um `manageUrl` que não abre nada), nada gravado; sem `_ts` segue normal. Limites: 10 agendamentos/h por IP em cada página, 100/h por IP no total e 3 por e-mail por dia no mesmo tipo (contas diferentes de teste não se atrapalham; a bateria do verify cabe folgada).
2. Tipo ativo, página disponível (plano), limite mensal.
3. `validateAnswers` das perguntas; nome, e-mail (e telefone, se obrigatório) válidos → senão 400 `VALIDATION_ERROR` com `path` (`name`, `email`, `phone`, `answers.<id>`).
4. Recalcula os horários com `isSlotAvailable` (mesmos dados que a página usou, dentro da transação, com os compromissos e ocupados externos atuais) → senão 409 `SLOT_TAKEN`.
5. Escolhe a pessoa: `ONE` a do tipo; `CLIENT` a escolhida (ou rodízio se "qualquer um"); `ANY` com `pickHost` (contagem do mês e último agendamento); `ALL` todas.
6. Usa a reserva (`holdId`) se for do mesmo horário e não venceu; senão cria direto. Insere `Appointment` + `AppointmentHost` (com `blockRange`) + `AppointmentAttendee` + cliente; a restrição do banco é a última palavra (`23P01` → 409 `SLOT_TAKEN`).
7. Status: `PENDING` se o tipo exige aprovação, senão `CONFIRMED`; sala Jitsi gerada (`jitsiUrl`) ou Meet criado (fila).
8. Depois do commit, na fila: e-mails, lembretes agendados (`reminderTimes`), evento no Google/Outlook, webhooks, CRM. Falhas nessas tarefas não desfazem o agendamento.
9. Resposta: só o necessário (nada de dados de outras pessoas nem da equipe além dos nomes).

## Erros novos

| code | Status | Quando |
|---|---|---|
| `SLOT_TAKEN` | 409 | horário ocupado (motor, reserva ou restrição do banco) |
| `HOLD_EXPIRED` | 409 | reserva vencida e o horário foi pego por outra pessoa |
| `CHANGE_NOT_ALLOWED` | 409 | cancelar/remarcar fora da política ou agendamento passado/cancelado |
| `AGENDA_UNAVAILABLE` | 410 | tipo inativo, página desligada ou limite do plano |
| `SLUG_TAKEN` | 409 | endereço da página ou do tipo em uso |
| `OUTSIDE_AVAILABILITY` | 409 | encaixe interno fora da disponibilidade sem `outsideAvailability: true` |
| `CALENDAR_NOT_CONNECTED` | 409 | Google Meet escolhido e a pessoa não conectou o Google |

## Testes obrigatórios (API)

- **Motor**: os testes do `agenda-lib` portados (fusos, horário de verão, feriados, intervalos, antecedência, janela, limite por dia, equipe, turmas) e testes de integração com o banco reproduzindo os mesmos cenários pelas rotas.
- **Sem marcar duas vezes**: 20 agendamentos simultâneos no mesmo horário/pessoa → exatamente 1 criado, 19 com 409; coletiva com uma pessoa ocupada → nada gravado; turma com 3 vagas e 10 simultâneos → 3 criados.
- Reserva temporária segura o horário, vence em 5 min (relógio controlado) e libera; agendar com reserva vencida pega o horário se ainda estiver livre.
- Página pública sem Origin/cookie funciona; não devolve dados da equipe, das respostas de outros nem quem atende no rodízio.
- Remarcar e cancelar pelo token respeitando a política; token de outro agendamento/empresa não serve; remarcação mantém o token e incrementa `sequence`.
- Rodízio equilibra (30 agendamentos com 3 pessoas → 10 cada); "cliente escolhe" respeita a escolha.
- Aprovação manual: pendente não manda link de videochamada; recusar libera o horário.
- Encaixe interno fora da disponibilidade só com confirmação; sobreposição nunca.
- Presença só depois do início; contadores do cliente.
- Isolamento entre empresas (404) e visibilidade de agendas para MEMBER.
- Feriados: nacional bloqueia, exceção libera, facultativo só quando ligado.
- Planos: limites de tipos, pessoas e mensal; features de equipe e integrações.
- `.ics` e feed válidos (abrem no Google Agenda/Outlook: confira à mão uma vez).
