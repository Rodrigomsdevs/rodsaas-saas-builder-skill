# API

Padrão da base em tudo: `/v1`, tenant do token, `withTenant`, schemas Zod de entrada (estritos) e saída (com nome no OpenAPI), RFC 9457, cursor, `config` declarativo. Toda rota de tarefa aplica `visibleProjectsWhere(auth)`: projeto privado de que a pessoa não é membro responde **404**, nunca 403.

## Projetos

| Rota | Config | Faz |
|---|---|---|
| `GET /v1/task-projects` | — | projetos visíveis, com contadores (abertas, atrasadas, minhas) e sprint ativa; `?archived=true` |
| `POST /v1/task-projects` | `limit: 'taskProjects'`, idempotente, audit | `{ name, key?, icon?, color?, visibility?, estimateType?, sprintsEnabled? }`; cria o fluxo padrão; `PRIVATE` exige `private_projects`; `sprintsEnabled` exige `sprints` |
| `GET /v1/task-projects/:id` | — | detalhe + statuses + labels + membros (privado) |
| `GET /v1/task-projects/by-key/:key` | — | resolve chave (inclui aliases) → projeto |
| `PATCH /v1/task-projects/:id` | owner/admin/líder | nome, chave (grava alias), ícone, cor, descrição, líder, visibilidade, estimativa, sprints |
| `POST /v1/task-projects/:id/archive` / `unarchive` | owner/admin/líder | — |
| `DELETE /v1/task-projects/:id` | owner/admin · audit | `{ confirmKey }` |
| `PUT /v1/task-projects/:id/members` | owner/admin/líder | lista de userIds (só privado); quem sai perde a visão e deixa de seguir as tarefas |
| `POST/PATCH/DELETE /v1/task-projects/:id/statuses[/:statusId]` | owner/admin/líder | criar, renomear, cor, categoria, reordenar; `DELETE` exige `{ moveToStatusId }`; mínimo um TODO e um DONE |
| `POST/PATCH/DELETE /v1/task-projects/:id/labels[/:labelId]` | membros | etiquetas |
| `GET /v1/task-projects/:id/board` | — | colunas (statuses) com as primeiras 50 tarefas de cada + total + `nextCursor` por coluna; aplica os mesmos filtros de `/tasks`; `?swimlane=assignee\|priority` agrupa por raia |

## Tarefas

| Rota | Config | Faz |
|---|---|---|
| `GET /v1/tasks` | — | lista com filtros (abaixo), cursor, ordenação |
| `GET /v1/tasks/mine` | — | `?bucket=overdue\|today\|week\|later\|nodate`, todas as tarefas abertas atribuídas a mim nos projetos visíveis, com contagem por bucket |
| `GET /v1/tasks/by-key/:key` | — | `MKT-123` → tarefa (resolve aliases de projeto e de tarefa movida) |
| `GET /v1/tasks/:id` | — | detalhe completo: campos, projeto, status, responsável, etiquetas, pai, subtarefas (resumo), checklist, vínculos (com status do outro lado), seguidores, contagem de anexos/comentários, total de horas, `descriptionVersion`, `isWatching`, `blocked` |
| `POST /v1/tasks` | idempotente, audit | `{ projectId, title, statusId?, priority?, assigneeId?, startDate?, dueDate?, dueTime?, estimate?, labelIds?, newLabels?, sprintId?, parentId?, afterTaskId? }`; sem status → primeiro TODO; `newLabels` cria as etiquetas; posição no fim da coluna ou depois de `afterTaskId` |
| `PATCH /v1/tasks/:id` | — | qualquer campo exceto descrição; valida cada um (responsável membro, sprint do projeto, pai válido…); grava atividade e notifica |
| `PATCH /v1/tasks/:id/description` | — | `{ version, content }` → nova versão; versão velha → 409 `VERSION_CONFLICT` com `currentVersion` e quem editou; body limit 2 MB; sanitiza links |
| `POST /v1/tasks/:id/move` | — | `{ statusId?, beforeId?, afterId? }` posição no quadro (e status, se mudou de coluna) |
| `POST /v1/tasks/:id/move-project` | audit | `{ projectId, statusId? }` → número novo, alias do antigo; etiquetas sem equivalente no destino são descartadas (o front avisa); sprint é removida; subtarefas vão junto |
| `POST /v1/tasks/:id/duplicate` | idempotente | `{ withSubtasks, withChecklist }` título "(cópia)", sem comentários, horas e anexos |
| `POST /v1/tasks/bulk` | — | `{ ids (≤100), set: { statusId?, assigneeId?, priority?, sprintId?, dueDate?, addLabelIds?, removeLabelIds? } }` ou `{ ids, action: 'archive' \| 'delete' }`; tudo ou nada; atividade por tarefa; notificações agrupadas |
| `POST /v1/tasks/:id/archive` / `unarchive` | — | arquivar só DONE/CANCELED |
| `DELETE /v1/tasks/:id` | criador ou owner/admin · audit | lixeira (com subtarefas) |
| `GET /v1/tasks/trash` | — | por projeto; restaurar `POST /v1/tasks/:id/restore`; excluir de vez `DELETE /v1/tasks/:id/permanent` (owner/admin) |
| `GET /v1/tasks/search?q=` | — | código exato (`^[A-Z]{2,6}-\d+$`) → abre direto; senão busca textual com trecho destacado; usado pelo provedor do Ctrl+K e pelos seletores de vínculo/pai |

### Filtros de `/tasks` e do quadro

`projectId` (um ou vários) · `statusId` · `statusCategory` (`open` = BACKLOG+TODO+IN_PROGRESS) · `assigneeId` (`me`, `none` ou ids) · `priority` · `labelId` · `sprintId` (`active`, `none` = backlog, id) · `due` (`overdue`, `today`, `week`, `none`) ou `dueFrom`/`dueTo` · `createdById` · `parentId` (`none` = só tarefas de topo) · `blocked=true` · `q` · `archived` · `sort` (`position`, `dueDate`, `-priority`, `-createdAt`, `-updatedAt`, `number`) — cursor com ordenação como no `module` (valor + id).

## Subtarefas, checklist e vínculos

| Rota | Faz |
|---|---|
| `POST /v1/tasks/:id/subtasks` | cria subtarefa (herda projeto e sprint) |
| `POST /v1/tasks/:id/checklist` · `PATCH/DELETE .../checklist/:itemId` · `POST .../checklist/reorder` | itens; marcar grava quem e quando |
| `POST /v1/tasks/:id/checklist/:itemId/convert` | vira subtarefa (remove o item) |
| `POST /v1/tasks/:id/convert-to-task` | subtarefa vira tarefa de topo |
| `POST /v1/tasks/:id/links` `{ toTaskId, type: 'blocks' \| 'blocked_by' \| 'relates' \| 'duplicates' }` · `DELETE /v1/task-links/:id` | `blocked_by` é gravado como BLOCKS invertido |

## Comentários, reações, histórico e seguidores

| Rota | Faz |
|---|---|
| `GET /v1/tasks/:id/timeline?filter=all\|comments&cursor=` | comentários + atividades em ordem cronológica, paginado (mais recentes por último, carregar anteriores) |
| `POST /v1/tasks/:id/comments` | idempotente; `{ body }`; extrai `bodyText`; menções (`userId`s no conteúdo) viram seguidores e notificação; quem comenta passa a seguir |
| `PATCH /v1/comments/:id` | só o autor; marca `editedAt`; novas menções notificam, antigas não |
| `DELETE /v1/comments/:id` | autor ou owner/admin; soft delete ("comentário excluído") |
| `PUT /v1/comments/:id/reactions/:emoji` · `DELETE` | emojis permitidos: 👍 ❤️ 😄 🎉 👀 🚀 ✅ 🙏 |
| `PUT /v1/tasks/:id/watch` · `DELETE` | seguir/deixar de seguir |

## Anexos (via add-on uploads)

| Rota | Faz |
|---|---|
| `GET /v1/tasks/:id/attachments` | lista com `File` (nome, tipo, tamanho, quem, quando) |
| `POST /v1/tasks/:id/attachments` | `{ fileId }`: arquivo READY, da empresa, `purpose: task_attachment`, enviado por quem está ligando; atividade + notificação aos seguidores |
| `DELETE /v1/task-attachments/:id` | quem anexou ou owner/admin; marca o `File` como DELETED |

Imagens coladas na descrição/comentário usam `purpose: editor_image` (mesmo fluxo do notion).

## Horas

| Rota | Faz |
|---|---|
| `GET /v1/timer` | cronômetro rodando do usuário (tarefa, início) ou `null` |
| `POST /v1/tasks/:id/timer/start` | para o que estiver rodando (devolve o que parou) e inicia neste |
| `POST /v1/timer/stop` | `{ note?, billable?, minutesOverride? }` grava; >12 h exige `minutesOverride` ou `confirmLong: true` |
| `DELETE /v1/timer` | descarta o cronômetro sem lançar |
| `GET /v1/tasks/:id/time-entries` | lançamentos da tarefa + total + estimativa (quando em horas) |
| `POST /v1/tasks/:id/time-entries` | manual `{ minutes, date, note?, billable? }` (o front converte "1h30" com `parseDuration`) |
| `PATCH/DELETE /v1/time-entries/:id` | dono ou owner/admin |
| `GET /v1/time-entries?userId=&projectId=&from=&to=&billable=` | folha de horas (padrão: semana atual do usuário); outro usuário só owner/admin |
| `GET /v1/reports/time?groupBy=user\|project\|task\|day&from=&to=` | `feature: 'task_reports'`; totais e faturável |
| `GET /v1/reports/time.csv?...` | `feature: 'task_reports'`; CSV com `;` e vírgula decimal (abre direto no Excel em pt-BR), UTF-8 com BOM |

## Sprints

`feature: 'sprints'` em todas as escritas; leitura liberada (para histórico após rebaixar o plano).

| Rota | Faz |
|---|---|
| `GET /v1/task-projects/:id/sprints?status=` | lista |
| `POST /v1/task-projects/:id/sprints` | `{ name?, goal?, startDate, endDate }` (nome sugerido "Sprint N") |
| `PATCH/DELETE /v1/sprints/:id` | `DELETE` só PLANNED (tarefas voltam ao backlog) |
| `POST /v1/sprints/:id/start` | 409 se já houver ativa; grava escopo inicial |
| `POST /v1/sprints/:id/complete` | `{ moveOpenTo: 'backlog' \| 'next' \| <sprintId> }` → resumo |
| `GET /v1/sprints/:id/burndown` | snapshots + linha ideal |
| `GET /v1/task-projects/:id/velocity?last=6` | pontos (ou tarefas) entregues por sprint |
| `GET /v1/sprints/:id/planning` | soma de estimativas por responsável e total |

## Relatórios (`feature: 'task_reports'`)

| Rota | Faz |
|---|---|
| `GET /v1/task-projects/:id/reports/throughput?weeks=12` | concluídas por semana |
| `GET /v1/task-projects/:id/reports/workload` | abertas e estimativa por responsável |
| `GET /v1/task-projects/:id/reports/overdue` | atrasadas por responsável e por idade |
| `GET /v1/task-projects/:id/reports/cycle-time?weeks=12` | tempo médio do primeiro IN_PROGRESS até DONE (pelo histórico) |

## Visões salvas

`GET/POST/PATCH/DELETE /v1/task-views` — pessoais livres; do projeto (`ownerId: null`) exigem a feature e papel owner/admin/líder.

## Notificações (módulo `notifications`)

| Rota | Faz |
|---|---|
| `GET /v1/notifications?unread=true&cursor=` | caixa de entrada do usuário |
| `GET /v1/notifications/unread-count` | contador do sino (o front consulta ao focar a janela e a cada 60 s) |
| `POST /v1/notifications/:id/read` · `POST /v1/notifications/read-all` | — |
| `GET/PUT /v1/notification-preferences` | `emailMode`, `disabledTypes` |

### Quando notificar (service `notify()`)

| Evento | Destinatários | Tipo |
|---|---|---|
| atribuição | novo responsável | `task.assigned` |
| menção em comentário/descrição | mencionados | `task.mentioned` |
| comentário novo | seguidores | `task.commented` |
| mudança de status | seguidores | `task.status` |
| prazo amanhã (job 8 h, fuso da empresa) | responsável | `task.due_soon` |
| prazo vencido (job 8 h) | responsável | `task.overdue` |
| sprint iniciada/concluída | membros com tarefas na sprint | `sprint.started` / `sprint.completed` |

Regras: **nunca notificar quem fez a ação**; não notificar quem perdeu acesso (projeto privado); respeitar `disabledTypes`; agrupar eventos iguais da mesma tarefa para a mesma pessoa em 2 min (atualiza a notificação existente).

E-mail (pg-boss): `IMMEDIATE` envia em até 1 min (já agrupado); `DAILY` envia um resumo às 8 h no fuso da empresa ("Você tem 3 tarefas vencendo hoje e 5 novidades"); links levam para a tarefa. Templates em português com a marca do `rodsaas.json` e link para as preferências.

## Erros novos

| code | Status | Quando |
|---|---|---|
| `VERSION_CONFLICT` | 409 | descrição com versão velha |
| `INVALID_PARENT` | 400 | pai de outro projeto, pai que é subtarefa, ou ciclo |
| `INVALID_STATUS` | 400 | status de outro projeto; excluir o último TODO/DONE |
| `SPRINT_ALREADY_ACTIVE` | 409 | iniciar com outra ativa |
| `TIMER_ALREADY_STOPPED` | 409 | parar sem cronômetro rodando |
| `PROJECT_KEY_TAKEN` | 409 | chave em uso (inclui aliases) |

## Testes obrigatórios (API)

- **Visibilidade de projeto privado em todas as rotas**: não membro recebe 404 em projeto, tarefa, quadro, comentários, horas, anexos, sprints e busca; não aparece em `/mine`, listas e notificações. Owner/admin veem.
- Isolamento entre empresas (404) e vínculo/pai/anexo/sprint apontando para outra empresa barrado (inclusive pelo trigger).
- **Sequência de código**: 50 criações concorrentes no mesmo projeto geram 1..50 sem repetir nem pular.
- Mover entre projetos: número novo, link antigo resolve.
- Status DONE preenche/limpa `completedAt`; excluir status exige destino; mínimo TODO/DONE.
- Conflito de descrição (409) e sanitização de links.
- Subtarefa: 1 nível, mesmo projeto; excluir pai leva filhas para a lixeira.
- Edição em massa: tudo ou nada (um id inválido → nada muda).
- Cronômetro: um por pessoa (índice), iniciar outro para o atual, parar calcula minutos, >12 h exige confirmação, limites 1–1440.
- Sprints: uma ativa; concluir move pendentes para o destino; burndown com snapshots.
- Notificações: não notifica o autor; menção notifica; agrupamento; preferências respeitadas; ninguém lê notificação de outro.
- Features do plano: sprints, relatórios, privado, visões do projeto → 403 `FEATURE_NOT_IN_PLAN` no Free; limite de projetos.
- CSV de horas com `;`, vírgula decimal e acentos corretos.
