# API

Padrão da base em tudo: `/v1`, tenant do token, `withTenant`, schemas Zod de entrada (estritos) e saída (com nome no OpenAPI), RFC 9457, cursor, `config` declarativo. Todo horário entra e sai em ISO 8601 UTC; fusos são nomes IANA. Horários livres sempre calculados pelo `agenda-lib computeSlots`.

Os formatos marcados com ★ fazem parte do **contrato testável** (`skills/verify/contract.json`, grupo `presets.agenda`).

## Configurações, feriados e perfis

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/agenda/settings` | — | `{ pageSlug, publicUrl, pageTitle, pageDescription, timeZone, blockNationalHolidays, blockOptionalHolidays, reminderOffsets, showBranding, theme, whatsapp, segment, vocabulary, requestConfirmation, confirmationHoursBefore, depositAfterNoShows, defaultDeposit, depositExpiresMin, refundIfHoursBefore, waitlistOfferMin, loyalty, commissionMode }` (`vocabulary` = `agenda-lib vocabulary(segment)`) |
| ★ `PATCH /v1/agenda/settings` | owner/admin | campos acima (menos `publicUrl`/`vocabulary`); `pageSlug` único (409 `SLUG_TAKEN`; atualiza o lookup; o link antigo deixa de funcionar e a tela avisa); `segment` inválido 400; `loyalty` exige `agenda_loyalty`, `depositAfterNoShows` exige `agenda_deposits` |
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

Campos novos do tipo (POST/PATCH, devolvidos no detalhe): `resourceIds` (`agenda_resources`), `combinable`, `addOnIds`, `comboDiscountPct`, `deposit` (`agenda_deposits`; exige o Financeiro com cobranças ativas → senão 409 `PAYMENTS_NOT_CONFIGURED`), `waitlist` (`agenda_waitlist`), `allowRecurring` (`agenda_recurring`), `insuranceIds`, `intakeFormId`, `consentTemplateId`, `returnAfterDays` (`agenda_clinic`).

Validações: `validateEventTypeConfig`, `forms-lib validateSchema` nas perguntas, `ANY/ALL/CLIENT`, aprovação e turma exigem `agenda_team`; pessoas precisam ser membros com agenda; `resourceIds` de recursos ativos da empresa; `addOnIds` de tipos `combinable` atendidos pelas mesmas pessoas (senão 400 no caminho `addOnIds.N`); feature fora do plano → 403 `FEATURE_NOT_IN_PLAN`.

## Recursos, convênios, perfis

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/agenda/resources` · ★ `POST` · `PATCH /:id` · `DELETE /:id` | escrita owner/admin, `feature: 'agenda_resources'` | **`{ name, kind? }`** → `{ id, name, kind, active }`; excluir recurso usado por tipo ativo ou agendamento futuro → 409 `RESOURCE_IN_USE` (diz quais) |
| ★ `GET /v1/agenda/insurances` · ★ `POST` · `PATCH /:id` | escrita owner/admin, `feature: 'agenda_clinic'` | **`{ name, prices?: { [eventTypeId]: centavos } }`** → `{ id, name, active, prices }` |

## Agendamentos (interno)

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/agenda/appointments` | — | `?from=&to=` (obrigatório na visão de calendário), `hostId` (`me`, ids), `status` (`upcoming`, `pending`, `past`, `canceled`, ou os status), `eventTypeId`, `clientId`, `q`, `kind`, cursor; item **`{ id, kind, title, start, end, status, eventType: { id, name, color } \| null, hosts: [{ id, name }], attendees: [{ id, name, email, phone, attendance, status }], location, seatsTaken, capacity }`** |
| ★ `GET /v1/agenda/appointments/:id` | — | + respostas das perguntas, anotações, histórico (`AgendaEvent`: criado, remarcado, cancelado, aprovado, presença), links |
| ★ `POST /v1/agenda/appointments` | idempotente | encaixe interno: `{ eventTypeId, start, durationMin?, hostIds?, addOns?: [tipoId], resourceId?, insuranceId?, client: { name, email?, phone? } \| { clientId }, answers?, notes?, notify?: boolean, outsideAvailability?: boolean, recurrence?: { freq, interval?, count?, until?, onConflict?: "skip" \| "fail" } }` → `CONFIRMED`; fora da disponibilidade só com `outsideAvailability: true` (a tela pergunta); **no passado** (até 30 dias) só com `outsideAvailability: true` (lançar o que já aconteceu); sobreposição de pessoa ou recurso nunca (409 `SLOT_TAKEN`). Com `recurrence` (`agenda_recurring` e `allowRecurring` no tipo): **201 `{ seriesId, created: [agendamento], conflicts: [{ start, code }] }`** — `skip` (padrão) cria os livres e lista os que conflitam; `fail` não cria nada se algum conflitar (409 `SERIES_CONFLICT` com a lista) |
| ★ `PATCH /v1/agenda/appointments/:id` | — | remarcar `{ start, end?, hostIds? }` (arrastar na agenda), `notes`; avisa o cliente se `notify` (padrão: sim) |
| ★ `POST /v1/agenda/appointments/:id/confirm` · `POST .../decline { reason? }` | — | aprovação manual (`PENDING` → `CONFIRMED`/`DECLINED`) |
| ★ `POST /v1/agenda/appointments/:id/cancel` | — | `{ reason?, notify?, scope?: "this" \| "following" \| "all" }` → `CANCELED`, libera o horário; série: `following` cancela esta e as próximas, `all` todas as futuras → **`{ canceled: [ids], refund: { refundCents, retainedCents } \| null }`** (sinal: a equipe cancelar devolve tudo); oferece a vaga à lista de espera |
| ★ `POST /v1/agenda/appointments/:id/check-in` · `DELETE` | — | chegada (`10-atendimento-e-comissoes.md`): 409 `TOO_EARLY` antes de 2 h do início, 409 `INVALID_STATUS` se não está confirmado → `{ checkedInAt }` |
| ★ `POST /v1/agenda/appointments/:id/complete` | — | concluir com serviços, produtos e pagamentos (`10`) → **`{ completedAt, items, totalCents, commissionCents, loyalty, recall }`**; 409 `NOT_STARTED` (sem check-in e antes do início), 409 `ALREADY_COMPLETED`, 422 `PAYMENT_MISMATCH`, 409 `NO_REWARD`, 409 `PERIOD_CLOSED` |
| `POST /v1/agenda/appointments/:id/reopen` | owner/admin | desfaz a conclusão fora de período fechado |
| ★ `POST /v1/agenda/appointments/:id/attendance` | — | `{ attendeeId?, attendance: 'ATTENDED' \| 'NO_SHOW' \| null }` (só depois do início); atualiza contadores do cliente |
| `POST /v1/agenda/appointments/:id/resend` | — | reenvia a confirmação ao cliente |
| ★ `POST /v1/agenda/blocks` · ★ `DELETE /v1/agenda/blocks/:id` | — | bloqueio **`{ start, end, title?, userId?, resourceId? }`** (de outros só owner/admin; `resourceId` bloqueia a sala/cadeira) → 201 `{ id, kind: "BLOCK", start, end, title }`; em cima de um agendamento → 409 `SLOT_TAKEN`; aparece em `GET /appointments` com `kind: "BLOCK"` |
| `GET /v1/agenda/clients` · ★ `GET /v1/agenda/clients/:id` · `PATCH` | — | clientes com contadores; detalhe **`{ id, name, email, phone, notes, tags, birthDate, insuranceId, summary: clientSummary, loyalty: loyaltyStatus \| null, club: { planId, planName, status, usesLeft } \| null, recalls: [{ dueDate, eventTypeId, status }], history: [agendamento] }`** |
| `GET /v1/agenda/booking-link?eventTypeId=&hostId=&prefill=` | — | link pronto (com nome/e-mail preenchidos) para mandar ao cliente; usado pelo CRM e pelos retornos |

O detalhe ★ `GET /v1/agenda/appointments/:id` também traz **`whatsapp: { phone, links: { CONFIRMED, REMINDER, RESCHEDULED, CANCELED, PAYMENT? } } \| null`** (`waLink` + `clientMessage`, com o link de gerenciar; `null` sem telefone válido ou com `whatsappOptOut`), `clientConfirmedAt`, `checkedInAt`, `completedAt`, `paymentKind`, `priceCents`, `deposit`, `resource: { id, name } \| null`, `serviceIds`, `seriesId`, `items` (se concluído). A lista ganha `clientConfirmed`, `checkedIn`, `completed`, `resourceId` e `paymentKind` em cada item.

## Lista de espera, fila do dia, retornos

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/agenda/waitlist` · `DELETE /:id` | — | entradas (`?eventTypeId&status`) com cliente, janela, períodos, status e a oferta atual |
| `POST /v1/agenda/waitlist` | — | a equipe põe alguém na lista (mesmo corpo do público + `clientId`) |
| ★ `GET /v1/agenda/queue?date=` | — | fila do dia **`{ data: [{ id, name, phone, serviceIds, hostId, status, position, etaMin, expectedHostId, createdAt }] }`** (`queueEstimate`) |
| ★ `POST /v1/agenda/queue` | — | **`{ name, phone?, serviceIds, hostId? }`** → 201 entrada com `position` e `etaMin` |
| ★ `POST /v1/agenda/queue/:id/call` | — | **`{ hostId? }`** → cria o agendamento começando agora (check-in feito, `createdVia: WALK_IN`) → **`{ appointment }`**; pessoa ocupada → 409 `SLOT_TAKEN` com `{ freeAt }` |
| `POST /v1/agenda/queue/:id/leave` | — | desistiu |
| ★ `GET /v1/agenda/recalls?due=` | `agenda_clinic` | retornos abertos até a data **`{ data: [{ id, client: { id, name, phone }, eventType: { id, name }, dueDate, status, bookingLink }] }`** |
| `POST /v1/agenda/recalls/:id/dismiss` | — | não vai voltar |

## Comissões, clube e fidelidade

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/agenda/commission-rules` · ★ `PUT` | escrita owner/admin, `agenda_commissions` | **`{ rules: [{ kind, hostId?, serviceId?, pct?, fixedCents? }] }`** (troca a lista toda; cada regra com `pct` **ou** `fixedCents`) |
| ★ `GET /v1/agenda/reports/commissions?from=&to=&hostId=` | `agenda_commissions`; MEMBER só a própria | **`{ from, to, closed, byHost: [{ hostId, name, servicesCents, productsCents, commissionCents, lines }], totalCommissionCents }`** pelas linhas concluídas no período (fuso da empresa) |
| ★ `POST /v1/agenda/commissions/close` | owner/admin | **`{ from, to }`** → 201 fechamento; sobreposto a outro fechado → 409 `PERIOD_CLOSED`; com o Financeiro, contas a pagar por pessoa |
| ★ `GET /v1/agenda/club/plans` · ★ `POST` · `PATCH /:id` | escrita owner/admin, `agenda_club` | **`{ name, priceCents, serviceIds, usesPerPeriod? }`** → `{ id, name, priceCents, serviceIds, usesPerPeriod, active, subscribers }` |
| ★ `POST /v1/agenda/club/subscriptions` · `GET` · `POST /:id/cancel` | `agenda_club` | **`{ planId, clientId \| client: { name, email, phone? }, startDate? }`** → 201 `{ id, planId, clientId, status, anchorDate, period: { periodStart, periodEnd }, usesLeft }`; já assina o plano → 409 `ALREADY_SUBSCRIBED`; com o Financeiro, cria a recorrência mensal |

## Relatórios

`GET /v1/agenda/reports/overview?from=&to=&hostId=&eventTypeId=` → totais (agendados, realizados, faltas, cancelados pelo cliente e pela equipe, remarcados, taxa de comparecimento, **faturamento** = soma das linhas concluídas e receita estimada dos que ainda não foram concluídos), série por dia, por tipo, **por profissional** (atendimentos, faturamento, ticket médio, ocupação = minutos agendados ÷ minutos disponíveis, faltas), **por serviço** (quantidade e faturamento), por convênio, mapa de calor dia da semana × hora e antecedência média dos cancelamentos. Tudo em SQL no servidor, no fuso da empresa. `GET /v1/agenda/reports/overview.csv` com `;` e BOM.

## API pública (sem login, `public: true`, **sem checagem de Origin/CSRF**, rate limit por IP)

| Rota | Faz |
|---|---|
| ★ `GET /v1/public/agenda/:page` | página da empresa: `{ title, description, timeZone, theme, showBranding, whatsapp, vocabulary, eventTypes: [{ slug, name, description, durations, priceCents, locationKind, capacity, color, combinable, deposit: { amountCents } \| null, waitlist }], people: [{ slug, name, avatarUrl }], club: [{ id, name, priceCents, usesPerPeriod }] }` (só tipos ativos e não ocultos; limite do plano → 410 `AGENDA_UNAVAILABLE`) |
| ★ `GET /v1/public/agenda/:page/types/:type` | tipo: o acima + `questions`, `assignment`, `hosts` (quando o cliente escolhe), `phoneRequired`, **`addOns: [{ slug, name, durationMin, priceCents }]`**, **`insurances: [{ id, name }]`**, `intakeRequired` (anamnese na primeira vez) |
| `GET /v1/public/agenda/:page/people/:person` | página da pessoa: os tipos em que ela atende |
| ★ `GET /v1/public/agenda/:page/types/:type/slots?from=&to=&timeZone=&durationMin=&hostId=&addOns=` | **`{ timeZone, durationMin, priceCents, days: { "YYYY-MM-DD": [{ start, end, seatsLeft }] } }`** no fuso pedido; `addOns` (slugs separados por vírgula) soma a duração e o preço do combo (`combo`); recurso do tipo entra no motor (`resources`); intervalo de até 42 dias; nunca devolve quem atende quando é rodízio nem o recurso |
| ★ `POST /v1/public/agenda/:page/types/:type/holds` | `{ start, durationMin?, hostId?, addOns? }` → `{ holdId, expiresAt }` (reserva de 5 min; rate limit 10/min por IP em cada página); horário ocupado → 409 `SLOT_TAKEN` |
| ★ `POST /v1/public/agenda/:page/types/:type/bookings` | `{ start, durationMin?, hostId?, holdId?, addOns?, insuranceId?, name, email, phone?, answers?, timeZone, _gotcha?, _ts? }` + `Idempotency-Key` → **201 `{ status: 'CONFIRMED' \| 'PENDING' \| 'AWAITING_PAYMENT', start, end, manageUrl, location?, priceCents, paymentKind, payment: { amountCents, url, expiresAt, reason } \| null, intake: { url } \| null }`** (o link do Jitsi/Meet só aparece para confirmado; `payment` quando há sinal — `reason` `TYPE` ou `NO_SHOWS`; `intake` quando é a primeira vez e o tipo tem anamnese); convênio não aceito → 400 `VALIDATION_ERROR` em `insuranceId` |
| ★ `POST /v1/public/agenda/:page/types/:type/waitlist` | `{ name, email, phone?, dateFrom, dateTo, periods?, hostId? }` → 201 `{ id, status: "WAITING", position }`; tipo sem lista de espera → 409 `WAITLIST_DISABLED`; mesmo e-mail já esperando no tipo → 409 `ALREADY_WAITING` |
| ★ `GET /v1/public/agenda/waitlist/:token` · ★ `POST /v1/public/agenda/waitlist/:token/accept` | a oferta da vaga (`{ status, start, end, expiresAt, eventType: { name } }`); aceitar agenda o horário segurado (mesma resposta do agendamento) — já pego/vencido → 409 `OFFER_EXPIRED` |
| ★ `GET /v1/public/agenda/manage/:token` | `{ status, start, end, timeZone, eventType: { name }, hostNames, location, canCancel, canReschedule, canConfirm, clientConfirmed, policyMessage, attendee: { name }, payment: { amountCents, url, status, expiresAt } \| null }` |
| ★ `POST /v1/public/agenda/manage/:token/confirm` | o cliente confirma a presença (`clientConfirmedAt`); só confirmado e futuro (senão 409 `CHANGE_NOT_ALLOWED`); confirmar de novo não muda nada |
| ★ `POST /v1/public/agenda/manage/:token/cancel` | `{ reason? }` respeitando a política (`canChange`) → 200; fora da política 409 `CHANGE_NOT_ALLOWED` |
| ★ `POST /v1/public/agenda/manage/:token/reschedule` | `{ start, holdId? }` → novo horário (mesmo token) |
| `GET /v1/public/agenda/manage/:token/slots?from=&to=&timeZone=` | horários para remarcar (mesmo tipo e mesma regra de pessoa) |
| `GET /v1/public/agenda/manage/:token/ics` | `.ics` do agendamento (`buildIcs`) |
| `GET /v1/public/agenda/feed/:token.ics` | feed da pessoa: próximos 90 dias e últimos 30 (`method: PUBLISH`), sem dados sensíveis das respostas; token da `AgendaFeedToken` (regenerável) |

Cancelar pelo link com sinal pago: `depositRefund` com `by: "CLIENT"` → a resposta traz **`refund: { refundCents, retainedCents }`** e a política aparece antes ("Cancelando agora, o sinal de R$ 40,00 não é devolvido").

Regras do agendamento público (service `bookAppointment`, numa transação):
1. Anti-spam: `_gotcha` preenchido ou `_ts` (quando a página abriu) com menos de 2 s → 201 falso (com um `manageUrl` que não abre nada), nada gravado; sem `_ts` segue normal. Limites: 10 agendamentos/h por IP em cada página, 100/h por IP no total e 3 por e-mail por dia no mesmo tipo (contas diferentes de teste não se atrapalham; a bateria do verify cabe folgada). A checagem de `_ts` só acontece **depois** da validação: quem clica em enviar com campos vazios logo ao abrir a página vê os erros, nunca um sucesso falso.
2. Tipo ativo, página disponível (plano), limite mensal.
3. `validateAnswers` das perguntas; nome, e-mail (e telefone, se obrigatório) válidos → senão 400 `VALIDATION_ERROR` com `path` (`name`, `email`, `phone`, `answers.<id>`).
4. Recalcula os horários com `isSlotAvailable` (mesmos dados que a página usou, dentro da transação, com os compromissos e ocupados externos atuais) → senão 409 `SLOT_TAKEN`.
5. Escolhe a pessoa: `ONE` a do tipo; `CLIENT` a escolhida (ou rodízio se "qualquer um"); `ANY` com `pickHost` (contagem do mês e último agendamento); `ALL` todas.
6. Usa a reserva (`holdId`) se for do mesmo horário e não venceu; senão cria direto. Insere `Appointment` + `AppointmentHost` (com `blockRange`) + `AppointmentAttendee` + cliente; a restrição do banco é a última palavra (`23P01` → 409 `SLOT_TAKEN`).
7. Preço e forma: combo (`combo`), clube (`clubCoverage` do assinante casado por e-mail/telefone → R$ 0, `paymentKind: CLUB`), convênio (`insurancePrice`). **Sinal** (`depositRequired` pelo tipo ou pelas faltas do cliente → `depositAmount` > 0 e não coberto pelo clube/convênio): status `AWAITING_PAYMENT`, cobrança Pix/cartão criada no Financeiro com prazo `depositExpiresMin` (segura o horário); pago (webhook do Financeiro) → `PENDING` ou `CONFIRMED`; venceu → cancela e oferece à lista de espera. Recurso: o primeiro livre do grupo (`resourceIds` do slot). Anamnese: primeira vez do cliente num tipo com `intakeFormId` → `intake.required` e o link do formulário com os campos ocultos `agendamento` e `cliente`.
8. Status (sem sinal): `PENDING` se o tipo exige aprovação, senão `CONFIRMED`; sala Jitsi gerada (`jitsiUrl`) ou Meet criado (fila).
9. Depois do commit, na fila: e-mails, lembretes agendados (`reminderTimes`), evento no Google/Outlook, webhooks, CRM. Falhas nessas tarefas não desfazem o agendamento.
10. Resposta: só o necessário (nada de dados de outras pessoas, da equipe além dos nomes, nem do recurso).

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
| `SERIES_CONFLICT` | 409 | série com `onConflict: "fail"` e algum horário ocupado (`{ conflicts }`) |
| `WAITLIST_DISABLED` · `ALREADY_WAITING` · `OFFER_EXPIRED` | 409 | lista de espera |
| `PAYMENTS_NOT_CONFIGURED` | 409 | sinal sem o Financeiro com cobranças ativas |
| `TOO_EARLY` · `INVALID_STATUS` · `NOT_STARTED` · `ALREADY_COMPLETED` · `NO_REWARD` | 409 | check-in e conclusão |
| `PAYMENT_MISMATCH` | 422 | pagamentos não fecham o total (`{ totalCents, paidCents }`) |
| `PERIOD_CLOSED` | 409 | período de comissão fechado |
| `RESOURCE_IN_USE` · `ALREADY_SUBSCRIBED` | 409 | recurso em uso; cliente já assina o plano |

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
- Recursos: duas pessoas, uma sala → o segundo no mesmo horário 409; segunda sala libera; 20 simultâneos disputando a última sala → 1.
- Combo: duração e preço somados nos horários e no agendamento; adicional não combinável 400.
- Bloqueio some da página; encaixe por cima do bloqueio 409.
- Série: cria os livres, lista o conflito; `fail` não cria nada; cancelar "esta e as próximas".
- Lista de espera: cancelamento oferece ao primeiro (e-mail com o link), aceitar agenda, oferta vencida passa ao próximo.
- Sinal: `AWAITING_PAYMENT` segura o horário, pago confirma, vencido libera; faltou N vezes → sinal; cancelar em cima da hora retém, a empresa cancelar devolve.
- Confirmação pelo link; mensagens de WhatsApp com o link certo e sem telefone → `null`.
- Recepção, comissões, clube, fidelidade, fila e clínica: os testes de `10-atendimento-e-comissoes.md` e `09-perfis-de-segmento.md`.
