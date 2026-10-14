# 03 · API

Padrão da base em tudo: `/v1`, tenant do token, `withTenant`, schemas Zod de entrada (estritos) e saída (com nome no OpenAPI), RFC 9457, cursor, `config` declarativo, `Idempotency-Key` nos POST que criam. Datas de calendário como `"YYYY-MM-DD"`; instantes em ISO 8601 UTC; dinheiro em **centavos** (`…Cents`). Toda rota exige acesso ao Pessoas (colaborador ligado ao usuário ou papel do app): senão 403 `NOT_AN_EMPLOYEE`. Regras que dependem de papel usam o helper `rhCtx(req)` → `{ userId, employeeId, rhRole, isRh, isFinance, managerOf(employeeId), reports }` (cache por request).

Os formatos marcados com ★ fazem parte do **contrato testável** (`skills/verify/contract.json`, grupo `presets.rh`).

Erros novos: `NOT_AN_EMPLOYEE` (403), `CPF_TAKEN` (409), `INVALID_MANAGER` (400, `path: "managerId"`), `VACATION_RULES` (422, `violations`), `LEAVE_RULES` (422), `EXPENSE_RULES` (422), `NOT_APPROVER` (403), `NOT_PENDING` (409), `ALREADY_DECIDED` (409), `COMMENT_REQUIRED` (400), `ALREADY_RESPONDED` (409), `SURVEY_CLOSED` (409), `ADMISSION_LINK_INVALID` (404), `ADMISSION_INCOMPLETE` (409, `{ missing }`), `HAS_REPORTS` (409, desligar quem tem subordinados sem indicar o novo gestor), `BATCH_PUBLISHED` (409).

Erros de regra (CLT, despesas) usam **422** com `violations: [{ code, message, segment? }]` (os códigos do `rh-lib`) e `warnings: [...]` — diferente de `errors` (formato, 400 da base).

## Pessoa logada e configurações

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/rh/me` | — | **`{ employeeId, rhRole, isManager, reportsCount, pending: { approvals, acks, surveys, reviews, tasks } }`** (`rhRole` null para colaborador comum) |
| `GET /v1/rh/settings` · `PATCH` | escrita `RH_ADMIN` | `RhSettings` (`surveyMinGroup` ≥ 3) |
| `GET /v1/rh/roles` · `PUT /v1/rh/roles/:userId` | `RH_ADMIN` | `{ role: "RH_ADMIN"\|"RH"\|"FINANCE"\|null }`; o owner não perde `RH_ADMIN` (409 `OWNER_IS_RH_ADMIN`) |
| `GET/POST /v1/rh/departments` · `PATCH/DELETE /:id` | escrita RH | árvore sem ciclo; excluir com pessoas → 409 `DEPARTMENT_IN_USE` (arquivar) |
| ★ `GET /v1/rh/positions` · ★ `POST` · `PATCH/DELETE /:id` | escrita RH | `{ name, level?, cbo?, salaryMinCents?, salaryMaxCents?, description? }`; faixa só vem para quem tem `compensation` em alguém (RH) |
| `GET/POST /v1/rh/locations` · `PATCH/DELETE /:id` | escrita RH | `{ name, city?, state?, holidays: [{ date, name }] }` |

## Colaboradores

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/rh/employees` | — | `?q` (nome, e-mail de trabalho, cargo), `departmentId`, `positionId`, `managerId` (`me` = minha equipe direta), `locationId`, `contractType`, `status` (padrão: ativos e afastados), cursor; item **`{ id, displayName, photoUrl, position: { id, name } \| null, department: { id, name } \| null, manager: { id, displayName } \| null, status, workEmail, admissionDate, awayToday }`** (só grupo `public`, para todos) |
| ★ `POST /v1/rh/employees` | RH, `limit: 'rhEmployees'`, idempotente | **`{ fullName, socialName?, cpf, contractType, admissionDate, workEmail?, personalEmail?, birthDate?, departmentId?, positionId?, managerId?, locationId?, weeklyHours?, restDays?, salaryCents?, userId?, invite? }`** → 201 ficha (visão RH). `cpf` com `isValidCpf` (400 `VALIDATION_ERROR`, `path: "cpf"`), único (409 `CPF_TAKEN`); `managerId` existente e ativo; `userId` = membro da empresa ainda sem ficha (409 `USER_HAS_EMPLOYEE`); `invite: true` com `workEmail` cria o convite da empresa (papel MEMBER) que liga o usuário à ficha ao aceitar; `salaryCents` cria a 1ª `Compensation` ("Admissão"); grava `EmploymentEvent` ADMISSION |
| ★ `GET /v1/rh/employees/:id` | — | ficha projetada por `visibleGroups` (abaixo) |
| ★ `PATCH /v1/rh/employees/:id` | RH | qualquer campo da ficha + `effectiveDate?`, `reason?` (histórico); `managerId` com `wouldCreateCycle` → 400 **`INVALID_MANAGER`**; mudar cargo/área/gestor/contrato/local grava `EmploymentEvent` |
| `POST /v1/rh/employees/:id/compensation` | RH | `{ amountCents, unit?, effectiveDate, reason }` (nova vigência; nunca edita a anterior) |
| `POST /v1/rh/employees/:id/terminate` | RH | `{ terminationDate, terminationType, terminationReason?, rehireEligible?, newManagerId? (obrigatório se tem subordinados → 409 HAS_REPORTS), checklistTemplateId?, exitSurvey?: boolean }` → status `TERMINATED` no dia (job à 0 h se futuro), remove o acesso do usuário à empresa no dia, gera o checklist de desligamento, cancela pedidos pendentes, envia a entrevista |
| `POST /v1/rh/employees/:id/rehire` | RH | nova admissão para desligado (mantém histórico, novos períodos aquisitivos a partir da nova data) |
| `POST /v1/rh/employees/:id/anonymize` | `RH_ADMIN` | `{ confirmName }` (precisa bater) — só desligado |
| `POST /v1/rh/employees/import` | RH | CSV (`;` ou `,`, UTF-8 ou Latin-1): **`dryRun: true`** devolve `{ rows: [{ line, ok, errors: [{ field, message }] }], create, update }`; sem `dryRun` aplica numa transação (casando por CPF: atualiza o que veio). Colunas: nome, nome_social, cpf, email_trabalho, nascimento (dd/mm/aaaa), admissao, contrato, cargo, nivel, area, gestor_cpf, local, salario |
| `GET /v1/rh/employees/export.csv` | — | só os campos que quem exporta pode ver de cada pessoa (`toCsv`); grava `RhAccessLog` export |
| `POST /v1/rh/employees/:id/invite` | RH | convida para o autoatendimento (precisa de e-mail) |
| ★ `GET /v1/rh/org-chart` | — | **`{ nodes: [{ id, displayName, photoUrl, position, department, managerId, reportsCount }] }`** (ativos e afastados) |
| `GET /v1/rh/employees/:id/history` | `job` | `EmploymentEvent` (+ salários se tem `compensation`) em ordem |
| `GET /v1/rh/employees/:id/access-log` | `RH_ADMIN` ou a própria pessoa | `RhAccessLog` |
| `GET /v1/rh/people/birthdays` · `GET /v1/rh/people/anniversaries` | — | próximos 30 dias (`upcomingBirthdays`; quem escondeu não aparece) e tempo de casa redondo (1, 2, 5, 10 anos) |

### ★ Ficha (`GET /v1/rh/employees/:id`)

```jsonc
{
  "id": "…", "displayName": "Bia Souza", "photoUrl": null,
  "position": { "id": "…", "name": "Analista" }, "department": { "id": "…", "name": "Suporte" },
  "manager": { "id": "…", "displayName": "Ana" }, "workEmail": "bia@empresa.com", "workPhone": null,
  "location": { "id": "…", "name": "Matriz" }, "admissionDate": "2024-03-10", "tenure": "2 anos e 7 meses",
  "birthday": "10-21", "status": "ACTIVE", "awayToday": false,
  "visibleGroups": ["public", "job", "absences", "performance"],
  // cada grupo só aparece se estiver em visibleGroups:
  "job": { "contractType": "CLT", "weeklyHours": 44, "restDays": [0], "costCenter": null, "registration": null },
  "personal": { "fullName": "…", "socialName": "…", "cpf": "52998224725", "rg": null, "pis": null, "birthDate": "1990-10-21", "address": {}, "personalEmail": null, "personalPhone": null, "emergencyContacts": [], "dependents": [] },
  "bank": { "bankName": "…", "bankAgency": "…", "bankAccount": "…", "pixKey": "…" },
  "compensation": { "currentCents": 520000, "unit": "MONTH", "effectiveDate": "2026-03-01", "history": [{ "effectiveDate": "…", "amountCents": 0, "reason": "…" }] },
  "rhNotes": "…",
  "customFields": {}
}
```

Ler `compensation` grava `RhAccessLog` (`view_compensation`) para quem não é a própria pessoa. A ficha de alguém de outra empresa → 404.

### Autoatendimento

| Rota | Config | Faz |
|---|---|---|
| `PATCH /v1/rh/me/profile` | — | edita direto: `workPhone`, `personalPhone`, `personalEmail`, `photoFileId`, `hideBirthday` |
| `POST /v1/rh/me/data-change` | — | `{ address?, bank?, dependents?, emergencyContacts? }` → cria `DataChangeRequest` + aprovação `DATA_CHANGE`; aprovado → aplica na ficha e grava evento |
| `POST /v1/rh/me/data-export` | — | gera o ZIP na fila (aviso com o link; expira em 24 h) |

## Férias e ausências (`04-ferias-e-ausencias.md`)

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/rh/employees/:id/vacation` | `absences` | **`{ regime, restDays, periods: [{ index, start, end, concessiveEnd, complete, entitled, absences, used, abono, balance, status, accrued }], requests: [{ id, periodIndex, segments, abonoDays, status, createdAt }] }`** (`acquisitionPeriods` com pendentes reservando saldo) |
| ★ `POST /v1/rh/vacation-requests/validate` | — | **`{ employeeId?, periodIndex, segments: [{ start, days }], abonoDays? }`** → 200 **`{ ok, violations, warnings, plan, remaining, abonoMax }`** (não grava; a tela chama a cada mudança) |
| ★ `POST /v1/rh/vacation-requests` | idempotente | mesmo corpo + `advance13th?`, `note?` → 201 **`{ request: { id, status, segments, abonoDays, periodIndex }, approval: { id, status, steps } }`**; regras quebradas → 422 **`VACATION_RULES`** com `violations`. `employeeId` de outra pessoa só RH (lança direto como aprovado se `approved: true`) |
| `POST /v1/rh/vacation-requests/:id/cancel` | quem pediu (pendente) ou RH (aprovado, antes de começar) | cancela a aprovação e devolve o saldo |
| `POST /v1/rh/vacation-requests/:id/ack` | a pessoa | ciência do aviso de férias |
| `GET /v1/rh/collective-vacations` · `POST /preview` · `POST` | RH | `{ name, start, days, departmentIds?, locationIds? }` → `validateCollectiveVacation` + `collectiveImpact` por pessoa (prévia) → lança `VacationRequest` aprovado para cada um (no período mais antigo com saldo) |
| `PUT /v1/rh/employees/:id/vacation/periods/:index` | RH | `VacationPeriodAdjust` (perdido com motivo, faltas e dias anteriores ao sistema) |
| ★ `POST /v1/rh/leaves` | — | **`{ employeeId?, type, start, days, halfDay?, documentFileId?, note? }`** → 201 **`{ leave: { id, type, start, end, days, status }, warnings }`** (`validateLeave`); `falta`, `inss` e lançar para outra pessoa: só RH (403); tipo com aprovação (folga, não remunerada) cria aprovação `LEAVE` |
| `GET /v1/rh/leaves?employeeId&from&to` | conforme `absences`/`health` | lista (para quem não tem `health`, tipos sensíveis viram `type: "medical"`, sem documento) |
| ★ `GET /v1/rh/absences` | — | calendário: `?from&to&scope=team\|company\|department:<id>` → **`{ items: [{ employeeId, displayName, kind: "vacation"\|"leave", type, start, end, status }], holidays: [{ date, name }] }`** (colaborador comum: só `public` dos colegas — quem está fora, sem o tipo: `type: "away"`) |
| `GET /v1/rh/vacation/overview` | RH, gestor (equipe) | todos com saldo, vencendo e vencidas (para o painel e o relatório) |

## Aprovações (`05-aprovacoes-e-despesas.md`)

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/rh/approvals` | — | `?box=to_me\|mine\|all` (`all` só RH), `status`, `kind`, cursor; item **`{ id, kind, title, status, requester: { employeeId, displayName }, current: { index, approvers: [{ userId, displayName }], mode } \| null, data, createdAt, decidedAt }`** |
| ★ `GET /v1/rh/approvals/:id` | pedinte, aprovadores (de qualquer etapa) e RH; senão 404 | item + **`steps: [{ index, type, mode, fallback, approvers: [{ userId, displayName }], decisions: [{ userId, displayName, decision, comment, at }] }]`**, `events`, `subject` (o pedido resumido) |
| ★ `POST /v1/rh/approvals/:id/decision` | — | **`{ decision: "approve"\|"reject", comment? }`** → 200 item atualizado; `applyDecision`: 403 `NOT_APPROVER`, 409 `ALREADY_DECIDED`/`NOT_PENDING`, 400 `COMMENT_REQUIRED`. RH fora da etapa: `override: true` + `comment` obrigatório (evento OVERRIDDEN) |
| `POST /v1/rh/approvals/bulk-decision` | — | `{ ids (até 50), decision, comment? }` → `{ done, failed: [{ id, code }] }` |
| `POST /v1/rh/approvals/:id/cancel` | pedinte | só pendente |
| `GET/PUT /v1/rh/approval-flows/:kind` | `RH_ADMIN`; editar exige `rh_custom_flows` | `{ steps }` (validação: tipo conhecido, papel existente, usuário membro, `when.field` permitido para o tipo) — vale para pedidos novos |
| `GET/POST /v1/rh/delegations` · `DELETE /:id` | a própria pessoa (RH para qualquer um) | `{ toUserId, start, end }`; não delega para si nem para quem pede; pedidos pendentes na etapa passam para o delegado ao começar |
| `GET/POST /v1/rh/request-types` · `PATCH /:id` | `RH_ADMIN`, `rh_custom_flows` | tipos de solicitação |
| `POST /v1/rh/requests` · `GET /v1/rh/requests/:id` · `POST /:id/resolve` | — / RH | `{ requestTypeId, values }` (validados pelos `fields`) → aprovação `REQUEST:<id>`; RH resolve com nota e arquivo |

## Despesas

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/rh/expense-categories` · `POST` · `PATCH /:id` | escrita RH | **`[{ id, name, limitCents, receiptAboveCents, perKmCents, active }]`** |
| ★ `POST /v1/rh/expenses` | `feature: 'rh_expenses'` | **`{ categoryId, date, amountCents?, km?, description, receiptFileId?, justification?, costCenter? }`** → 201 **`{ expense: { id, amountCents, … }, warnings }`**; `validateExpense` → 422 **`EXPENSE_RULES`** com `violations` (`OVER_LIMIT_JUSTIFY`, `RECEIPT_REQUIRED`, `KM_REQUIRED`, `FUTURE_DATE`, `TOO_OLD`…) |
| `PATCH/DELETE /v1/rh/expenses/:id` | dono, fora de relatório enviado | |
| ★ `POST /v1/rh/expense-reports` · `GET /:id` | — | `{ title, expenseIds }` (só despesas soltas do próprio) → 201 relatório `{ id, status: "DRAFT", totalCents, expenses }` |
| ★ `POST /v1/rh/expense-reports/:id/submit` | dono | revalida tudo (422 se alguma ficou inválida) → **`{ report: { status: "SUBMITTED" }, approval }`** (fluxo `EXPENSE_REPORT` com `data.amount = totalCents`) |
| `GET /v1/rh/expense-reports?box=mine\|to_pay\|paid` | `to_pay`/`paid`: `FINANCE`/RH | |
| `POST /v1/rh/expense-reports/:id/pay` | `FINANCE`/`RH_ADMIN` | `{ paidAt, paymentProofFileId? }` só `APPROVED` → `PAID` + aviso |
| `GET /v1/rh/expense-reports/export.csv` | `FINANCE`/RH | `?status&from&to` (pessoa, CPF formatado, Pix, total, categorias) |

## Admissão, checklists, documentos e holerites (`06-admissao-documentos-holerites.md`)

| Rota | Config | Faz |
|---|---|---|
| ★ `POST /v1/rh/admissions` | RH, `limit: 'rhEmployees'`, `feature: 'rh_preadmission'` | **`{ fullName, cpf, personalEmail, contractType, admissionDate, positionId?, departmentId?, managerId?, salaryCents?, sendEmail? }`** → 201 **`{ admission: { id, status }, employee: { id, status: "PRE_ADMISSION" }, link }`** (`link` só aqui e no reenviar) |
| `GET /v1/rh/admissions` · `GET /:id` | RH | pipeline com documentos e status |
| `POST /v1/rh/admissions/:id/documents/:key/review` | RH | `{ status: "APPROVED"\|"REJECTED", reason? }` (recusa exige motivo → e-mail ao candidato) |
| `POST /v1/rh/admissions/:id/resend` | RH | novo token (o antigo deixa de valer), validade de 14 dias |
| ★ `POST /v1/rh/admissions/:id/complete` | RH | obrigatórios aprovados (senão 409 **`ADMISSION_INCOMPLETE`** com `missing`) → copia os dados para a ficha, `status: ACTIVE`, cria o checklist de admissão (modelo pelo `filter`), convida para o autoatendimento → **`{ employee, checklist }`** |
| ★ `GET /v1/public/rh/admissions/:token` | público, rate limit | **`{ company: { name, logoUrl }, person: { fullName }, admissionDate, requiredDocs: [{ key, label, required, status, reason }], data, status }`**; token inválido/expirado → 404 `ADMISSION_LINK_INVALID` |
| `PUT /v1/public/rh/admissions/:token` | público | `{ data }` (rascunho: pessoal, endereço, dependentes, banco, emergência) |
| `POST /v1/public/rh/admissions/:token/uploads` | público, rate limit | `{ key, fileName, size, mimeType }` → mesmo fluxo do `uploads` (`purpose: "rh_admission"`, dono = empresa) |
| ★ `POST /v1/public/rh/admissions/:token/submit` | público | valida campos obrigatórios e documentos enviados → `SUBMITTED` + aviso ao RH |
| `GET /v1/rh/checklists?employeeId&mine=1` · `PATCH /v1/rh/checklists/:id/items/:key` | responsável do item ou RH | `{ done }` (grava quem e quando) |
| `GET/POST /v1/rh/checklist-templates` · `PATCH/DELETE /:id` | `RH_ADMIN` | |
| ★ `GET /v1/rh/employees/:id/documents` · ★ `POST` | leitura por `documents`/`health`; escrita RH (a pessoa envia os próprios, ficam `EMPLOYEE`) | `POST` **`{ categoryId, name, fileId, visibility?, issuedAt?, expiresAt? }`**; item **`{ id, name, category: { id, name }, visibility, expiresAt, expiry, createdAt }`** (`expiry` do `expiryState`); sem permissão → 404 |
| `GET /v1/rh/documents/:id/url` | idem | URL assinada curta; `SENSITIVE`/`personal` grava `RhAccessLog` |
| ★ `GET /v1/rh/documents/expiring` | RH | `?days=30` → **`[{ id, employee: { id, displayName }, name, expiresAt, expiry }]`** |
| `GET/POST /v1/rh/document-categories` | escrita RH | |
| `GET /v1/rh/company-documents` · `POST` · `POST /:id/publish` · `POST /:id/ack` · `GET /:id/acks` | leitura: público-alvo; escrita RH | `ack` grava `DocumentAck` (versão, IP, user-agent); nova versão pede ciência de novo; `acks` → quem deu e quem falta |
| ★ `POST /v1/rh/payslip-batches` | RH | **`{ kind, reference, label, files: [{ fileId, name }] }`** → 201 **`{ id, status: "DRAFT", preview: { matched: [{ file, employeeId, displayName }], unmatched: [{ file }], ambiguous: [{ file, employeeIds }] } }`** (lê o texto do PDF; PDF único com várias pessoas é separado por página — `groupPagesByCpf`) |
| `PATCH /v1/rh/payslip-batches/:id` | RH, só DRAFT | `{ assign: [{ file, employeeId }] }` (resolve sem dono/ambíguo à mão) |
| ★ `POST /v1/rh/payslip-batches/:id/publish` | RH | cria `Payslip` para os casados → **`{ published }`**; publicado de novo → 409 `BATCH_PUBLISHED` |
| `GET /v1/rh/payslip-batches/:id` | RH | quem viu, quem deu ciência |
| ★ `GET /v1/rh/me/payslips` | — | **`[{ id, kind, reference, label, viewedAt, ackAt, publishedAt }]`** (só os próprios) |
| `GET /v1/rh/payslips/:id/url` · ★ `POST /v1/rh/payslips/:id/ack` | a pessoa (RH também abre) | abrir marca `viewedAt`; `ack` marca `ackAt`; holerite de outra pessoa → 404 |

## Desempenho, metas, feedback e clima (`07-desempenho-e-clima.md`)

| Rota | Config | Faz |
|---|---|---|
| `GET/POST /v1/rh/review-templates` · `PATCH /:id` | RH, `rh_performance` | |
| `GET/POST /v1/rh/review-cycles` · `GET/PATCH /:id` | RH | rascunho com fases e público |
| `POST /v1/rh/review-cycles/:id/launch` | RH | gera `Review` por pessoa × tipo (auto, gestor; pares depois da escolha) + avisos |
| `POST /v1/rh/review-cycles/:id/peers` | avaliado (gestor aprova) | `{ employeeIds }` (até `peerMax`) |
| `GET /v1/rh/reviews?mine=to_do\|about_me` · `GET/PUT /v1/rh/reviews/:id` · `POST /:id/submit` | avaliador (o avaliado vê depois de liberado) | `PUT` salva rascunho; `submit` exige todas as perguntas obrigatórias, calcula `reviewScore`; fora da fase → 409 `PHASE_CLOSED` |
| `GET /v1/rh/review-cycles/:id/calibration` · `PUT …/outcomes/:employeeId` | RH e gestores (da equipe) | notas, `potential`, `nineBox` |
| `POST /v1/rh/review-cycles/:id/release` | RH | libera o resultado (avaliações de pares aparecem **sem nome** e agregadas; a do gestor com nome) |
| `GET/POST /v1/rh/one-on-ones` · `PATCH /:id` | gestor e liderado (nota privada só o gestor) | |
| `GET/POST /v1/rh/feedback` | `rh_performance` | `?box=received\|given\|public`; privado: autor, destinatário, gestor do destinatário e RH |
| `GET/POST /v1/rh/development-actions` · `PATCH /:id` | a pessoa, o gestor e RH | PDI |
| `GET/POST /v1/rh/goals` · `PATCH /:id` · `POST /v1/rh/key-results/:id/check-ins` | dono, gestor, RH (empresa/área: RH e responsável da área) | check-in atualiza `current` e o `progress` (`objectiveProgress`); item com `status` (`goalStatus`) |
| ★ `POST /v1/rh/surveys` · `GET /:id` · `PATCH /:id` | RH, `rh_surveys` | **`{ kind, title, anonymous?, questions: [{ id, kind, text, dimension? }], audience?, groupBy?, minGroup?, opensAt?, closesAt }`** → 201 `{ id, status: "DRAFT" }`; `minGroup` < 3 → 400 |
| ★ `POST /v1/rh/surveys/:id/launch` | RH | → `{ status: "OPEN", invitedCount }` + avisos |
| `GET /v1/rh/surveys?box=to_answer\|all` | — / RH | |
| ★ `POST /v1/rh/surveys/:id/responses` | público-alvo | **`{ enps?, answers, comments? }`** → 201 `{ ok: true }`; segunda vez → 409 **`ALREADY_RESPONDED`**; fechada → 409 `SURVEY_CLOSED` |
| ★ `GET /v1/rh/surveys/:id/results` | RH (gestor: só a própria área, se `audience.managersSeeOwnArea`) | **`{ total, invited, responseRate, minGroup, overall: { n, enps, questions } \| null, groups: [{ groupId, groupName, n, enps, questions }], hiddenGroups, enpsHistory, comments }`** (`groupResults`; `comments` só com `overall` liberado, embaralhados, sem recorte). **Não existe rota de respostas individuais.** |

## Indicadores e fechamento

| Rota | Config | Faz |
|---|---|---|
| `GET /v1/rh/reports/overview` | RH (gestor: a equipe), `rh_reports` | `?from&to` → `{ headcount, byDepartment, byContract, admissions, terminations, turnover, absenteeism, averageTenureMonths, vacationsExpired, documentsExpiring }` |
| `GET /v1/rh/closing/:ym` | RH, `FINANCE` | `eventsForMonth` + alterações de salário/cargo + reembolsos aprovados no mês, por pessoa |
| `GET /v1/rh/closing/:ym/export.csv` | idem | CSV (`toCsv`) |
| `POST /v1/rh/closing/:ym/send` | RH | e-mail ao `accountantEmail` com o CSV anexo e o resumo; grava quem enviou e quando (reenviar avisa que já foi enviado) |

## Jobs (pg-boss, fuso da empresa)

| Job | Quando | Faz |
|---|---|---|
| `rh.approval.reminders` | 9 h, dias úteis | etapa parada há `approvalReminderDays` dias úteis → `rh.approval.reminder` (uma vez por dia por pedido) |
| `rh.delegations` | 0 h | delegações que começam: repassa pendentes; que acabam: devolve |
| `rh.vacation.expiring` | 8 h | concessivo termina em 60, 30, 7 dias com saldo → aviso |
| `rh.vacation.week` | segunda 8 h | gestores: quem sai de férias na semana |
| `rh.documents.expiring` | 8 h | 30, 7 e 0 dias |
| `rh.terminations` | 0 h | desligamentos com data de hoje |
| `rh.surveys` | de hora em hora | abre/fecha pelas datas; pulso cria a próxima rodada |
| `rh.goals.checkin` | dia da semana da empresa, 9 h | metas sem check-in na semana |
| `rh.one_on_one.soon` | 8 h | véspera |
| `rh.birthdays` | 8 h | se `showBirthdays` |

Todos conferem `isAppActive(orgId, 'pessoas')` (com a workstation) antes de mandar algo.

## Testes obrigatórios (API)

- Colaborador: CPF inválido 400 `path: cpf`; repetido 409 `CPF_TAKEN`; ciclo de gestor 400 `INVALID_MANAGER`; colega não recebe `compensation`/`personal`; gestor não recebe `compensation`; a pessoa recebe a própria sem `rhNotes`.
- Férias: períodos e saldo com faltas; `validate` devolve os códigos do `rh-lib`; criar com regra quebrada 422 `VACATION_RULES`; criar válido → aprovação no gestor; pendente reserva saldo; recusa devolve; aprovação desconta.
- Aprovação: quem pede não aprova; sem gestor vai para o RH; delegação; recusa sem comentário 400; decidir de novo 409.
- Despesas: acima do limite sem justificativa 422 `OVER_LIMIT_JUSTIFY`; com justificativa 201 + aviso; relatório acima de R$ 1.000 tem etapa do financeiro.
- Documentos: `expiry` certo; colega não lista documentos de outro (404); `expiring` só RH.
- Holerites: lote casa pelo CPF; publicar; cada um vê só os seus; holerite de outro → 404.
- Clima: 4 respostas → `overall: null`; 5 → resultado; responder de novo 409; resultado sem campo de pessoa.
- Pré-admissão: link público funciona sem login, token errado 404, efetivar com documento pendente 409, efetivar → ativo + checklist.
