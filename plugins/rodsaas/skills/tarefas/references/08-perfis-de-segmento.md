# 08 · Perfis de segmento (escritório contábil, agência e serviços, obras e manutenção)

O Tarefas é **um só**; o perfil decide o que já vem ligado, as palavras e os modelos sugeridos. Recurso que serve a mais de um segmento fica no núcleo (`07`).

## Onde fica

- `TaskSettings.segment` da empresa (`GENERAL` · `ACCOUNTING` · `AGENCY` · `CONSTRUCTION`), escolhido no onboarding da workstation (`taskProfileFor`: escritório contábil → `ACCOUNTING`; agência, serviços e tecnologia → `AGENCY`) ou na primeira abertura (obras, reformas e manutenção escolhem `CONSTRUCTION` ali). Muda em `/tarefas/configuracoes` → Perfil (`tasks-segment`).
- ★ `GET /v1/tasks/settings` · ★ `PATCH /v1/tasks/settings { segment }` (owner/admin) aplica o perfil (`taskSegment(id).on`) **sem desligar nada** → **`{ segment, words, on }`**. As palavras (`words`: tarefa/obrigação/job/serviço, projeto/carteira/conta/obra) trocam os rótulos do menu, dos botões e dos vazios; o código, as rotas e os testids não mudam.

## O que cada perfil liga

| Perfil | Liga | O que muda |
|---|---|---|
| `GENERAL` | — | — |
| `ACCOUNTING` (escritório contábil) | recorrência, obrigações, modelos, carga | **obrigações mensais com prazo legal** (abaixo); vocabulário "obrigação" e "carteira" |
| `AGENCY` (agência, consultoria, serviços) | horas → Financeiro, convidado que aprova, campos, modelos | **horas faturáveis por conta** (abaixo); vocabulário "job" e "conta" |
| `CONSTRUCTION` (obras, reformas, manutenção) | checklist com foto, Gantt, modelos, convidado | **checklist com foto obrigatória** (abaixo); vocabulário "serviço" e "obra" |

## Escritório contábil: obrigações mensais com prazo legal (`ACCOUNTING`)

- Catálogo: `OBLIGATIONS_BR` (DAS, FGTS Digital, eSocial, EFD-Reinf — **confira a regra vigente antes de portar**; o catálogo é dado, não código) + as da empresa: `PUT /v1/tasks/obligation-types` **`{ types: [{ code, name, day, monthsAfter?, onNonBusiness, leadDays? }] }`** (mesmo `code` sobrescreve o padrão, por exemplo a folga `leadDays`).
- ★ `PUT /v1/tasks/obligation-clients` **`{ clients: [{ id?, name, document?, obligations: [code], assigneeId? }] }`** → **`{ clients }`** (a carteira; com o CRM instalado, escolhe a empresa do CRM). Código fora do catálogo → 400 em `clients.N.obligations`.
- ★ `POST /v1/tasks/obligations/generate` **`{ projectId, competence: "AAAA-MM" }`** → **`{ created, skipped, tasks: [{ key, title, code, clientName, legalDue, dueDate }] }`** — `monthlyObligations` com os feriados: uma tarefa por cliente × obrigação, **prazo legal** já no dia útil certo (DAS prorroga, FGTS antecipa) e prazo interno `leadDays` úteis antes; responsável do cliente; **idempotente** pela chave cliente:obrigação:competência (rodar de novo só cria o que falta). Job no dia 1 de cada mês gera a competência anterior nos projetos marcados.
- ★ `GET /v1/tasks/obligations?competence=` → **`{ data: [{ clientName, code, name, legalDue, dueDate, taskKey, status, late }], totals: { total, done, open, late } }`** — `late` = aberta com o prazo legal já passado.
- ★ `TaskDetail` ganha **`obligation: { code, competence, legalDue, clientName } | null`**; concluir pede o protocolo/recibo como anexo quando o tipo marca `requireReceipt`.
- Tela `/tarefas/obrigacoes`: mês × cliente com as obrigações em linhas (`tasks-obligation-row` com `data-code` e `data-late`), totais do mês, "Gerar mês", filtro por responsável; o vencimento legal aparece no card ("legal 20/11").

## Agência e serviços: horas → Financeiro (`AGENCY`)

- O projeto é a **conta** do cliente: `PATCH /v1/task-projects/:id { client: { name, contactId? } }` (com o CRM, liga ao contato). Lançamentos de horas nascem **faturáveis** neste perfil (o base já tem `billable`).
- ★ `PUT /v1/tasks/rates` **`{ defaultRateCents, roundTo?, users?: { [userId]: centavosPorHora } }`** (owner/admin) → o mesmo; `roundTo` arredonda **para cima** por pessoa e conta (15 = quarto de hora, `roundMinutes`).
- ★ `GET /v1/tasks/billing?from&to` → **`{ data: [{ project: { id, key, name, client }, minutes, amountCents, lines: [{ user: { id, name }, minutes, rateCents, amountCents }] }], totalCents }`** — `billableHours` só com o que ainda **não foi faturado**.
- ★ `POST /v1/tasks/billing/invoice` **`{ projectId, from, to }`** → 201 **`{ entryId, amountCents, minutes }`**: lança a **receita no Financeiro** ("Horas · {cliente} · 01/10 a 31/10", categoria de serviços, vencimento em 10 dias; com `fin_charges`, oferece gerar a cobrança) e marca os lançamentos com `invoicedEntryId`; nada a faturar → 409 **`NOTHING_TO_INVOICE`**; sem o Financeiro → 409 **`FINANCE_UNAVAILABLE`**. Lançamento já faturado não se edita nem exclui (409 **`TIME_ENTRY_INVOICED`**).
- Tela `/tarefas/faturamento`: período, contas com horas e valor (`tasks-billing-row` com `data-project-key`), detalhe por pessoa, "Faturar" (`tasks-billing-invoice`) com prévia; o job mostra "horas faturadas" no relatório de horas.

## Obras e manutenção: checklist com foto (`CONSTRUCTION`)

- Item de checklist com **`requirePhoto`** (no `POST`/`PATCH` do item e nos modelos); ★ `POST /v1/tasks/:id/checklist/:itemId/photos` **`{ fileId }`** (arquivo do `uploads`, `purpose: task_photo`, imagem, READY, da empresa) → o item com **`photoIds`**, quem e quando; marcar o item que pede foto sem foto → 409 **`PHOTO_REQUIRED`** (`canCheckItem`).
- Projeto com **`requireChecklist`** (`PATCH /v1/task-projects/:id`): concluir a tarefa com checklist incompleto ou item feito sem a foto → 409 **`CHECKLIST_INCOMPLETE`** (`canCompleteTask`, `checklistStatus`), por qualquer caminho (arrastar, massa, automação).
- No celular: o item abre a câmera direto, a foto sai com data/hora e geolocalização (quando permitida) gravadas no arquivo; galeria da obra por tarefa. Modelos do perfil: "Vistoria de entrega", "Manutenção preventiva", "Etapas da obra" (com dependências para o Gantt).

## Testids

| testid | Onde |
|---|---|
| `tasks-segment` | `/tarefas/configuracoes` → Perfil |
| `tasks-recurrence` | painel da tarefa |
| `tasks-gantt`, `tasks-gantt-bar` (`data-task-key`, `data-critical`) | aba Gantt (`tasks-view-tab` `data-view="gantt"`) |
| `tasks-workload`, `tasks-workload-cell` (`data-user`, `data-week`, `data-overloaded`) | `/tarefas/carga` |
| `task-guest-row` (`data-task-key`, `data-approval`), `task-guest-approve`, `task-guest-changes`, `task-guest-comment` | `/convidado/[token]` |
| `tasks-obligation-row` (`data-code`, `data-late`) | `/tarefas/obrigacoes` |
| `tasks-billing-row` (`data-project-key`), `tasks-billing-invoice` | `/tarefas/faturamento` |

## Testes obrigatórios

- Aplicar cada perfil liga o que ele pede sem desligar nada.
- Obrigações: gerar a competência com o prazo legal no dia útil certo (feriado), folga interna, idempotente; painel com atrasadas.
- Horas: arredondamento, valor por pessoa, faturar lança no Financeiro e não fatura de novo (409).
- Obras: item com foto obrigatória sem foto 409; com foto marca; concluir com checklist incompleto 409.
