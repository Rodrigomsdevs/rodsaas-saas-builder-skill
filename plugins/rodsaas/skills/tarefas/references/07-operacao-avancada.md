# 07 · Recorrência, modelos, campos personalizados, Gantt com dependências, automações, carga por pessoa e cliente que aprova

O que toda equipe pede depois do quadro: a tarefa que **volta todo mês sozinha**, o projeto que **nasce de um modelo** com prazos e dependências, os **campos do negócio** na tarefa, a **linha do tempo** que empurra o resto quando algo atrasa, as **regras automáticas** ("quando for para revisão, atribuir à Ana"), a **carga de cada pessoa** antes de prometer prazo e o **cliente convidado** que vê só o que é dele e aprova. Tudo **núcleo** (vale para qualquer perfil; `08-perfis-de-segmento.md` decide o que já vem ligado e as palavras). Regras no `scripts/tarefas-lib.mjs` (porte para `api/src/modules/tasks/lib/` com os testes). Formatos ★ fazem parte do contrato (grupo `presets.tarefas`; testes em `suite/tests/34-tarefas-operacao.spec.ts`).

## Modelo (somar ao `02-modelo.md`)

```prisma
model TaskRecurrence { id String @id @default(uuid()); orgId String; taskId String @unique; rule Json; occurrence Int @default(1); nextTaskId String?; createdAt DateTime @default(now()) }
model TaskTemplate { id String @id @default(uuid()); orgId String; name String; tasks Json; createdById String; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt }
model TaskFieldDef { id String @id @default(uuid()); orgId String; projectId String; key String; label String; type String; options String[]; required Boolean @default(false); position Int; @@unique([projectId, key]) }
model TaskAutomation { id String @id @default(uuid()); orgId String; projectId String; name String; active Boolean @default(true); trigger Json; conditions Json; actions Json; createdById String; createdAt DateTime @default(now()) }
model TaskAutomationRun { id String @id @default(uuid()); orgId String; automationId String; taskId String; event String; ok Boolean; error String?; createdAt DateTime @default(now()) }
model TaskCapacity { orgId String; userId String; hoursPerDay Decimal; @@id([orgId, userId]) }
model TaskGuest { id String @id @default(uuid()); orgId String; projectId String; name String; email String; tokenHash String @unique; revokedAt DateTime?; lastSeenAt DateTime?; createdById String; createdAt DateTime @default(now()) }
model TaskHoliday { orgId String; date String; name String?; @@id([orgId, date]) }
// Task ganha: startDate (já existe), customFields Json @default("{}"), clientVisible Boolean @default(false),
//   approval Json? ({ status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED", comment, requestedAt, decidedAt, decidedBy: { guestId, name } })
// TaskLink ganha lagDays Int @default(0) (só BLOCKS)
// TaskProject ganha autoSchedule Boolean @default(true)
```

Todas com `orgId`, RLS `FORCE` e as travas de mesma empresa (tarefa ↔ projeto ↔ automação ↔ convidado). O feriado da empresa (`TaskHoliday`) serve à recorrência, aos modelos em dias úteis, à carga e às obrigações do perfil contábil; com o add-on RH instalado, os feriados dele entram juntos.

## Recorrência

- ★ `PUT /v1/tasks/:id/recurrence` **`{ rule }`** — `rule` como em `validateRecurrence`: **`freq`** (`daily` · `weekly` · `monthly` · `yearly`), `interval` (1–99), `weekdays` (semanal, 0 = domingo), `monthDay` (mensal; 31 = último dia) **ou** `nth: { n: 1–4 | -1, weekday }` ("2ª terça", "última sexta"), **`mode`** (`schedule` = pela agenda; `after_done` = conta a partir do dia em que concluiu), **`onNonBusiness`** (`keep` · `before` antecipa · `after` prorroga para dia útil, com os feriados da empresa), `until`, `count`. Regra inválida → 400 `VALIDATION_ERROR` com `errors[].path` em `rule.<campo>`; tarefa **sem prazo** → 400 em `dueDate` ("Defina o prazo antes de repetir"). → **`{ recurrence: { rule, occurrence, nextDue } }`** (`nextDue` calculado por `nextDue`).
- `DELETE /v1/tasks/:id/recurrence` → 204 (as já criadas ficam).
- **Concluir** a tarefa recorrente (categoria DONE, por qualquer caminho: arrastar, PATCH, massa, automação) cria a **próxima** na mesma transação: mesmo projeto, título, descrição, responsável, prioridade, etiquetas, campos personalizados, seguidores, **checklist desmarcado** e subtarefas recriadas abertas; prazo = `nextDue(rule, { currentDue, doneOn: hoje, start, occurrence, holidays })`, início deslocado na mesma distância do prazo; status = primeiro TODO; `occurrence + 1`. A concluída guarda `nextTaskId` — reabrir e concluir de novo **não** cria outra. `count` ou `until` esgotados → não cria e a regra mostra "Terminou". Atividade nas duas ("Repetição: criada MKT-31 para 20/11").
- ★ `TaskDetail` ganha **`recurrence: { rule, occurrence, nextDue, nextTaskId } | null`**.
- `GET/PUT /v1/tasks/holidays` **`{ dates: [{ date, name? }] }`** (owner/admin): feriados da empresa (o front oferece os nacionais do ano para marcar).
- Tela: no painel da tarefa, "Repetir" (`tasks-recurrence`) abre o editor com resumo em português ("Todo mês no dia 20, prorroga se cair em fim de semana ou feriado"), a próxima data e o fim; ícone ↻ no card, na lista e no calendário (as ocorrências futuras aparecem esmaecidas no calendário até 3 meses à frente, sem criar tarefa).

## Modelos de projeto e de tarefa

- ★ `POST /v1/task-templates` **`{ name, tasks: [{ key, title, offsetDays, businessDays?, durationDays?, assigneeRole?, priority?, checklist?: [string | { text, requirePhoto }], subtasks?: [{ title, offsetDays? }], dependsOn?: [key] }] }`** → 201 **`{ id, name, tasks }`**; `validateTemplate` (chave repetida, prazo negativo, dependência que não existe) → 400 com `errors[].path` em `tasks.N.<campo>`. `GET /v1/task-templates`, `PATCH /v1/task-templates/:id`, `DELETE` (owner/admin ou quem criou).
- `POST /v1/tasks/:id/save-as-template` **`{ name }`** → modelo com a tarefa, as subtarefas (prazo relativo ao início) e o checklist.
- ★ `POST /v1/task-templates/:id/apply` **`{ projectId, startDate, assignees?: { [assigneeRole]: userId } }`** → 201 **`{ tasks: [TaskCard] }`** na ordem do modelo: `instantiateTemplate` com os feriados (dias úteis a partir do primeiro dia útil do início), checklist, subtarefas, responsável pelo papel (membro do projeto; papel sem pessoa → sem responsável) e **`dependsOn` vira vínculo `blocks`** (que o Gantt usa). Tudo numa transação; atividade "Criada pelo modelo Onboarding de cliente".
- Tela `/tarefas/modelos` (lista, editor com a tabela de tarefas e a prévia das datas) e "Aplicar modelo" no menu do projeto (escolhe o início e quem faz cada papel).

## Campos personalizados (`feature: 'task_advanced'`)

- ★ `PUT /v1/task-projects/:id/fields` **`{ fields: [{ key, label, type, options?, required? }] }`** (owner/admin/líder) → **`{ fields }`**; tipos `CUSTOM_FIELD_TYPES` (texto, número, valor em centavos, data, seleção, múltipla, sim/não, pessoa, link); `validateFieldDefs` → 400 em `fields.N.<campo>`; até 50 por projeto. Tirar um campo apaga os valores (o front avisa quantas tarefas têm valor).
- `PATCH /v1/tasks/:id` aceita **`customFields: { [key]: valor | null }`** (mescla; `null` limpa) → `validateCustomValues` (pessoa = membro do projeto) → 400 em `customFields.<key>`; mudança grava atividade e dispara o gatilho `field_changed`. ★ `TaskDetail.customFields` **`{ [key]: valor }`**.
- **Obrigatório é cobrado ao concluir**: mover para DONE com obrigatório vazio → 409 **`CUSTOM_FIELDS_REQUIRED`** com `errors` (o front abre o painel no campo).
- ★ Filtro **`/v1/tasks?cf.<key>=<valor>`** (seleção, sim/não, pessoa, texto exato) e no quadro; colunas na lista (ordenar e somar número/valor no rodapé); exportação leva os campos.

## Gantt com dependências (`feature: 'task_advanced'`)

- Vínculo `blocks`/`blocked_by` aceita **`lagDays`** (0–365, "começa 2 dias depois"); criar um que fecha ciclo (`wouldCreateCycle`) → 409 **`DEPENDENCY_CYCLE`**.
- ★ `GET /v1/task-projects/:id/gantt` → **`{ tasks: [{ id, key, title, startDate, dueDate, status: { category }, assignee, critical }], links: [{ id, fromId, toId, lagDays }], criticalPath: { ids, days } }`** — tarefas de topo com prazo (sem início = barra de um dia), `criticalPath` pela soma das durações e folgas (`criticalPath`), `critical` marca as do caminho.
- ★ `PATCH /v1/tasks/:id/schedule` **`{ startDate?, dueDate }`** (arrastar ou esticar a barra) → **`{ task, moved: [{ id, key, startDate, dueDate }] }`**: início depois do prazo → 400; com `autoSchedule` do projeto ligado (padrão), `cascade` empurra as sucessoras que começariam antes do fim + folga (mantendo a duração, **nunca puxa para trás**), cada uma com atividade "Remarcada por MKT-3"; desligado, só avisa quais ficaram em conflito (`conflicts`).
- Tela: aba **Gantt** no projeto (`tasks-view-tab` `data-view="gantt"`): barras por semana/mês (`tasks-gantt`, `tasks-gantt-bar` com `data-task-key` e `data-critical`), setas das dependências, arrastar/esticar, ligar dependência puxando da ponta da barra, linha de hoje, caminho crítico em destaque, toast "3 tarefas foram remarcadas · Desfazer".

## Automações (`feature: 'task_advanced'`)

- ★ `POST /v1/task-projects/:id/automations` **`{ name, trigger: { type, toStatusId?, field? }, conditions?: [{ on, value, key? }], actions: [{ type, … }] }`** → 201 **`{ id, name, active, trigger, conditions, actions }`**; `validateAutomation` → 400 com `errors[].path` (a ação que desfaz o próprio gatilho é **`LOOP`**); até 20 por projeto. `GET` lista; `PATCH /v1/task-automations/:id` (inclusive `active`); `DELETE`.
- Gatilhos `AUTOMATION_TRIGGERS`: tarefa criada · mudou de status (para um status ou qualquer) · mudou o responsável · venceu o prazo (job das 8 h) · mudou um campo · todas as subtarefas concluídas (na mãe). Condições: prioridade, responsável (inclusive "sem"), etiqueta, status, campo. Ações `AUTOMATION_ACTIONS`: atribuir (`userId`), prioridade, etiqueta, mover para status, criar subtarefa (`title`), prazo em N dias úteis (`days`), avisar (`to: "assignee" | "watchers" | userId`, `message` — pelo `notify()` com o tipo `task.automation`), comentar (`text`, autor "Automação").
- Execução na mesma transação do evento (`automationMatches`), em ordem de criação; o que uma ação muda pode disparar outra automação até a **profundidade 3** (depois para, sem erro: evita pingue-pongue entre regras). Ação que falha (responsável que saiu da empresa) não desfaz a ação de quem mexeu: grava a execução com erro e avisa o criador da regra.
- ★ `GET /v1/task-automations/:id/runs` → **`{ data: [{ taskId, taskKey, event, ok, error, at }] }`** (últimas 100); atividade na tarefa "Automação **Revisão**: atribuiu a Ana".
- Tela: Configurações do projeto → aba **Automações** com o construtor "Quando … se … então …", liga/desliga e o histórico de execuções.

## Carga por pessoa (`feature: 'task_advanced'`)

- `PUT /v1/task-capacity/:userId` **`{ hoursPerDay }`** (owner/admin; 0–24, padrão 8; meio período 4).
- ★ `GET /v1/tasks/workload` **`?from&to&projectId?`** → **`{ from, to, people: [{ user: { id, name }, hoursPerDay, weeks: [{ week, hours, capacity, overloaded }] }] }`** — `workload`: estimativa em horas das tarefas **abertas** (projetos com estimativa em horas) espalhada nos dias úteis entre o início (ou hoje) e o prazo; capacidade da semana = horas/dia × dias úteis dela no período (feriados tiram); `overloaded` quando passa.
- Tela `/tarefas/carga` (`tasks-workload`): pessoas × semanas, célula com horas/capacidade em verde/amarelo/vermelho (`tasks-workload-cell` com `data-user`, `data-week`, `data-overloaded`), clique lista as tarefas da semana e permite **reatribuir arrastando** para outra pessoa; filtro por projeto. O seletor de responsável na tarefa mostra a carga da semana do prazo ao lado do nome.

## Cliente convidado que aprova (`feature: 'task_guests'`)

- ★ `POST /v1/task-projects/:id/guests` **`{ name, email }`** (owner/admin/líder) → 201 **`{ id, name, email, createdAt }`** e e-mail com o link **`/convidado/<token>`** (token de 32 bytes, guardado só o hash; não conta como assento). `GET` lista (com último acesso); `DELETE /v1/task-guests/:id` revoga (o link para de abrir na hora).
- O convidado **só vê** as tarefas do projeto marcadas **`clientVisible`** (`guestCanSee`): título, status, prazo, a descrição e os anexos marcados como "do cliente" — nunca comentários internos, horas, valores nem os outros projetos.
- ★ `POST /v1/tasks/:id/approval` (pedir aprovação) → **`{ approval: { status: "PENDING", requestedAt } }`**: marca `clientVisible`, avisa os convidados por e-mail; `canMoveApproval` (já pendente → 409 **`APPROVAL_INVALID`**).
- ★ `GET /v1/public/task-guest/:token` → **`{ project: { name }, guest: { name }, tasks: [{ id, key, title, dueDate, status: { name, category }, approval }] }`**; token revogado ou desconhecido → 404.
- ★ `POST /v1/public/task-guest/:token/tasks/:taskId/decision` **`{ decision: "approve" | "request_changes", comment? }`** → **`{ approval: { status, comment, decidedAt, decidedBy: { name } } }`**; `validateDecision` (pedir ajustes sem dizer o quê → 400 em `comment`); tarefa que o convidado não vê → 404; não pendente → 409 **`APPROVAL_NOT_PENDING`**. Aprovar → comentário "✅ Aprovado por {nome} (cliente)" e aviso `task.approval` aos seguidores; pedir ajustes → a tarefa volta para o **primeiro status IN_PROGRESS**, comentário com o pedido e o mesmo aviso. Limite de 30 decisões por hora por token.
- ★ `TaskDetail` ganha **`clientVisible`** e **`approval: { status, comment, requestedAt, decidedAt, decidedBy } | null`**; `PATCH /v1/tasks/:id { clientVisible }`.
- Telas: portal `/convidado/[token]` sem login e com a marca da empresa (`task-guest-row` com `data-task-key` e `data-approval`, `task-guest-approve`, `task-guest-changes`, `task-guest-comment`); no painel da tarefa, "Pedir aprovação do cliente" e o selo do estado; filtro "aguardando cliente".

## Planos, avisos e erros

| | Free | Pro | Business |
|---|---|---|---|
| recorrência, modelos e feriados | ✅ | ✅ | ✅ |
| feature `task_advanced` (campos, Gantt, automações, carga) | — | ✅ | ✅ |
| feature `task_guests` (cliente convidado que aprova) | — | ✅ | ✅ |

Avisos novos no catálogo do `notificacoes` (grupo Tarefas): `task.automation` (ação "avisar" de uma automação), `task.approval` (cliente aprovou ou pediu ajustes). Erros novos: `DEPENDENCY_CYCLE`, `CUSTOM_FIELDS_REQUIRED`, `APPROVAL_INVALID`, `APPROVAL_NOT_PENDING` (409).

## Testes obrigatórios

- Recorrência: regra inválida 400; tarefa sem prazo 400; concluir cria a próxima no dia útil certo (com feriado), com checklist desmarcado; reabrir e concluir não duplica; `count` esgotado não cria.
- Modelo: inválido 400; aplicar cria as tarefas com as datas em dias úteis, os vínculos, o checklist e as subtarefas, e o responsável pelo papel.
- Campos: definição inválida 400; valor inválido 400 no caminho; filtro `cf.`; obrigatório vazio impede concluir (409).
- Gantt: ciclo 409; mover a barra empurra as sucessoras com a folga e não puxa para trás; caminho crítico.
- Automações: `LOOP` 400; mudar o status atribui e dá prazo; execuções registradas; duas regras que se chamam param na profundidade 3.
- Carga: semana acima da capacidade marcada; aumentar a capacidade desmarca; feriado tira capacidade.
- Convidado: vê só o visível ao cliente; pedir ajustes sem comentário 400; pedir ajustes devolve para "fazendo"; aprovar registra; decisão repetida 409; revogado 404; sem a feature 403.
