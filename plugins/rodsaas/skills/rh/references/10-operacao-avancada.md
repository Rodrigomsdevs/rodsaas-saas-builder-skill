# 10 · Escala de trabalho, recrutamento simples, comunicados com ciência, treinamentos com validade e mural de celebrações

O que o RH pede depois da ficha e das férias: **montar a escala** sem escalar quem está de férias nem quebrar a interjornada, **abrir uma vaga** e receber candidatos sem planilha, **mandar um comunicado** e saber quem leu, **controlar os treinamentos** que vencem e **celebrar** aniversários e tempo de casa. Tudo **núcleo** (vale para qualquer perfil; `11-perfis-de-segmento.md` decide o que já vem ligado). Regras no `scripts/pessoas-lib.mjs` (porte para `api/src/modules/rh/lib/` com os testes). Formatos ★ fazem parte do contrato (grupo `presets.rh`; testes em `suite/tests/36-pessoas-operacao.spec.ts`).

**Não é ponto eletrônico.** A escala é o **planejado** (quem trabalha quando); a marcação de entrada e saída, o banco de horas e o espelho de ponto continuam fora do Pessoas (Portaria 671/2021, outro app).

## Modelo (somar ao `02-modelo.md`)

```prisma
model RhShift { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; start String; end String; breakMinutes Int @default(0); color String?; active Boolean @default(true) }
model RhShiftNeed { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; weekday Int; shiftId String @db.Uuid; locationId String?; min Int }
model RhScheduleEntry { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; employeeId String @db.Uuid; date String; shiftId String? @db.Uuid; kind String @default("WORK") /* WORK | DAY_OFF */; publishedAt DateTime?; @@unique([organizationId, employeeId, date, shiftId]) }
model RhJob { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; title String; slug String; departmentId String?; locationId String?; description String; questions Json @default("[]"); status String @default("OPEN"); createdAt DateTime @default(now()) }
model RhCandidate { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; jobId String @db.Uuid; name String; email String; phone String?; answers Json; cvFileId String?; stage String @default("APPLIED"); history Json; consentAt DateTime; hiredAt DateTime?; createdAt DateTime @default(now()) }
model RhAnnouncement { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; title String; body String; audience Json; requireAck Boolean @default(false); ackDueDate String?; createdById String @db.Uuid; createdAt DateTime @default(now()) }
model RhAnnouncementAck { announcementId String @db.Uuid; employeeId String @db.Uuid; ackedAt DateTime @default(now()); @@id([announcementId, employeeId]) }
model RhTraining { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; code String?; validityMonths Int?; active Boolean @default(true) }
model RhTrainingRule { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; trainingId String @db.Uuid; all Boolean @default(false); positionIds String[]; departmentIds String[] }
model RhTrainingRecord { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; trainingId String @db.Uuid; employeeId String @db.Uuid; completedOn String; certificateFileId String?; createdById String @db.Uuid }
```

RLS `FORCE` em todas; candidato é dado pessoal (LGPD): consentimento gravado, apagado 6 meses depois da vaga fechada se não foi contratado.

## Escala de trabalho (`feature: 'rh_schedules'`)

- ★ `POST /v1/rh/shifts` **`{ name, start: "HH:MM", end: "HH:MM", breakMinutes }`** (RH) → 201 o turno; `validateShift` (horário inválido, intervalo fora de 0–240, mais de 12 h trabalhadas) → 400 com `errors[].path`. Fim antes do início = turno que vira a noite. `GET /v1/rh/shifts`.
- `PUT /v1/rh/shift-needs` **`{ needs: [{ weekday, shiftId, min }] }`** — quantas pessoas cada turno precisa por dia da semana (a cobertura).
- ★ `PUT /v1/rh/schedule` **`{ assignments: [{ employeeId, date, shiftId }], publish? }`** (RH, ou o gestor para a própria equipe) → **`{ assignments, warnings }`**, sempre recalculando a semana de cada pessoa com `scheduleConflicts`: **bloqueiam** (409 **`SCHEDULE_CONFLICT`** com `conflicts: [{ code, employeeId, date }]`) dois turnos que se cruzam (`OVERLAP`) e escalar quem está de **férias, ausência aprovada ou folga** (`ON_LEAVE`); **avisam** (gravam e devolvem em `warnings`) interjornada abaixo de 11 h (`REST_BETWEEN`), semana acima da jornada contratual (`WEEKLY_LIMIT`, padrão 44 h) e sétimo dia seguido sem folga (`NO_WEEKLY_REST`). `publish: true` avisa cada pessoa da escala nova (`rh.schedule.published`).
- ★ `GET /v1/rh/schedule?from&to&departmentId?` → **`{ assignments: [{ id, employeeId, date, shift: { id, name, start, end } }], daysOff: [{ employeeId, date }], warnings, gaps: [{ date, shiftId, min, have }] }`** (`coverageGaps` pelas necessidades).
- ★ `GET /v1/rh/me/schedule?from&to` → **`{ assignments, daysOff }`** — a pessoa vê a própria escala (autoatendimento, celular).
- Tela `/pessoas/escala`: grade pessoas × dias da semana (`rh-schedule`, `rh-schedule-cell` com `data-employee`, `data-date` e `data-conflict`), arrastar turno, copiar a semana anterior, faixa de cobertura vermelha quando falta gente, "Publicar escala"; `/pessoas/minha-escala` para o colaborador.

## Recrutamento simples (`feature: 'rh_recruiting'`)

- ★ `POST /v1/rh/jobs` **`{ title, description, departmentId?, locationId?, questions?: [{ id, label, required }] }`** (RH) → 201 **`{ id, title, slug, status: "OPEN", url }`** (página pública `APP_URL/vagas/<siteKey>/<slug>`); `PATCH /v1/rh/jobs/:id { status: "CLOSED" | "OPEN", … }`.
- ★ `GET /v1/public/jobs/:siteKey` → **`{ company, jobs: [{ id, title, slug, department, location }] }`** (só abertas); ★ `POST /v1/public/jobs/:siteKey/:slug/apply` **`{ name, email, phone?, answers?, cvFileId?, consent: true }`** → 201 **`{ id }`**: `validateApplication` (nome e sobrenome, e-mail, telefone com DDD, perguntas obrigatórias, **consentimento LGPD**) → 400; mesmo e-mail ou telefone já na vaga (`findDuplicate`) → 409 **`ALREADY_APPLIED`**; vaga fechada → 410 **`JOB_CLOSED`**. Rate limit por IP; currículo pelo `uploads` (`purpose: rh_cv`, PDF até 5 MB).
- ★ `GET /v1/rh/jobs/:id/candidates` → **`{ data: [{ id, name, email, phone, stage, appliedAt }], funnel: { reached, timeToHireDays } }`** (`recruitingFunnel`).
- ★ `POST /v1/rh/candidates/:id/move` **`{ stage, note?, notify? }`** → o candidato; `canMoveCandidate` (aplicado → triagem → entrevista → proposta → contratado; reprovar em qualquer etapa; reabrir só reprovado) → 409 **`INVALID_STAGE`**. **Contratado** devolve **`admission: { fullName, personalEmail, phone }`** para abrir a pré-admissão (`06-admissao-documentos-holerites.md`) já preenchida; reprovado com `notify` manda o e-mail de agradecimento.
- Telas: `/pessoas/vagas` (lista com contagem por etapa), quadro de candidatos por etapa (`rh-candidate-card` com `data-stage`, arrastar), página pública da vaga com o formulário (`job-apply-form`, `job-apply-submit`, `job-apply-done`).

## Comunicados com ciência

- ★ `POST /v1/rh/announcements` **`{ title, body, audience: { all } | { departmentIds?, locationIds?, employeeIds? }, requireAck, ackDueDate? }`** (RH) → 201 **`{ id, recipients }`** (`validateAnnouncement`, `audienceOf` com os ativos); aviso `rh.announcement` a cada destinatário com login (e-mail para quem não tem).
- ★ `GET /v1/rh/announcements` → para o colaborador, **os dele** **`{ data: [{ id, title, body, requireAck, ackDueDate, ackedAt }] }`**; para o RH, todos com o resumo da ciência.
- ★ `POST /v1/rh/announcements/:id/ack` → **`{ ackedAt }`** (só quem recebeu; outro → 404; repetir devolve a mesma data).
- ★ `GET /v1/rh/announcements/:id/acks` (RH) → **`{ total, acked, pct, overdue, pending: [{ id, name }] }`** (`ackStatus`); "Cobrar ciência" reenvia aos pendentes; vencido o prazo, o gestor de cada pendente recebe o aviso.
- Tela `/pessoas/comunicados` (`rh-announcement` com `data-acked`, `rh-announcement-ack`), contador no Início; no RH, barra de progresso da ciência e lista de pendentes.

## Treinamentos com validade (`feature: 'rh_trainings'`)

- ★ `POST /v1/rh/trainings` **`{ name, code?, validityMonths? }`** → 201; `PUT /v1/rh/training-rules` **`{ rules: [{ trainingId, all?, positionIds?, departmentIds? }] }`** (quem precisa de qual).
- ★ `POST /v1/rh/trainings/:id/records` **`{ employeeId, completedOn, certificateFileId? }`** → 201; data no futuro → 400 em `completedOn`. Certificado vai para a pasta de documentos da pessoa (categoria Certificações, com a validade).
- ★ `GET /v1/rh/trainings/compliance?departmentId?` → **`{ data: [{ employee: { id, name }, items: [{ trainingId, name, status, expiresOn }], ok }], totals: { ok, pending } }`** (`complianceMatrix`: `missing`, `valid`, `expiring` em 30 dias, `expired`; vale o registro mais recente). ★ `GET /v1/rh/me/trainings` → os itens da própria pessoa.
- Job diário: `rh.training.expiring` 30 dias antes para a pessoa e o gestor; vencido entra no painel do RH.
- Tela `/pessoas/treinamentos`: matriz pessoas × treinamentos (`rh-training-cell` com `data-status`), filtro por área, "Registrar conclusão" em lote.

## Mural de celebrações

- ★ `GET /v1/rh/celebrations?date=` → **`{ data: [{ type: "birthday" | "anniversary", employee: { id, name }, years? }] }`** (`celebrationsOn`: aniversário de quem não escondeu; tempo de casa redondo a partir de 1 ano; 29/02 comemora em 28/02 fora do bissexto). Widget no Início de todos, mensagem de parabéns (reconhecimento do `07`), e-mail opcional no dia.

## Planos, avisos e erros

| | Free | Pro | Business |
|---|---|---|---|
| comunicados com ciência, mural de celebrações | ✅ | ✅ | ✅ |
| feature `rh_schedules` (escala) | — | ✅ | ✅ |
| feature `rh_recruiting` (vagas e candidatos) | — | ✅ | ✅ |
| feature `rh_trainings` (treinamentos com validade) | — | ✅ | ✅ |

Avisos novos no catálogo do `notificacoes` (grupo Pessoas): `rh.schedule.published`, `rh.announcement`, `rh.training.expiring`. Erros novos: `SCHEDULE_CONFLICT`, `ALREADY_APPLIED`, `INVALID_STAGE` (409), `JOB_CLOSED` (410).

## Testes obrigatórios

- Escala: turno inválido 400; turnos que se cruzam e escalar em férias/ausência 409; interjornada curta e semana longa avisam; a pessoa vê a própria escala; cobertura com buraco.
- Recrutamento: candidatura sem consentimento ou sem sobrenome 400; repetida 409; vaga fechada 410; etapa pulada 409; contratado devolve os dados da admissão; funil.
- Comunicados: público por área; quem não recebeu não dá ciência (404); pendentes certos; ciência idempotente.
- Treinamentos: vencido, vencendo, faltando e válido na matriz; conclusão no futuro 400; vale o mais recente.
- Celebrações: aniversário escondido não aparece; tempo de casa redondo.
