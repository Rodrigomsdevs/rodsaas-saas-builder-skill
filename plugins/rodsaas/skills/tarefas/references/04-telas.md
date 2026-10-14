# Telas

Todas dentro da casca existente (base ou notion), seguindo os componentes e estados da skill `frontend`. Estados detalhados em `05-interacoes-e-estados.md`.

## Rotas

| Rota | Tela |
|---|---|
| `/tarefas` | **Minhas tarefas** (padrão ao clicar em "Tarefas") |
| `/tarefas/projetos` | todos os projetos (cards) |
| `/tarefas/p/[key]` | projeto, na visão escolhida (`?visao=quadro\|lista\|calendario\|backlog`, padrão quadro) |
| `/tarefas/p/[key]/relatorios` | relatórios do projeto |
| `/tarefas/p/[key]/configuracoes` | configurações do projeto |
| `/tarefas/t/[codigo]` | tarefa em página inteira (`/tarefas/t/MKT-123`) |
| `/tarefas/horas` | folha de horas e relatório de horas |

Qualquer visão abre a tarefa no **painel lateral** com `?tarefa=MKT-123` na URL (voltar fecha; link abre direto).

## Menu do app Tarefas

(A coluna do menu do app na casca de apps; no menu clássico, quando é o único app, aparece abaixo do "Início".)

- **Minhas tarefas** (com contador de atrasadas em vermelho) · **Horas**
- **Projetos**: lista dos projetos visíveis (ícone/cor, nome, contador de abertas atribuídas a mim), recolhível, ordem arrastável (por usuário), "Ver todos", **+ Novo projeto**.
- Projetos arquivados não aparecem.

## Topo e trilho

- **Cronômetro ativo** (quando houver, em `topbarItems`, visível em qualquer app): chip (`tasks-timer-chip`) com código da tarefa e tempo correndo (`MKT-12 · 00:42:17`), clique abre a tarefa, botão ■ para parar (`tasks-timer-stop`). Atualiza a cada segundo só na tela; a verdade é o `startedAt` do servidor.
- **Sino** (no trilho): contador de não lidas; popover com as 20 mais recentes (agrupadas por Hoje / Anteriores), "Marcar todas como lidas", "Ver todas", e ícone de preferências.

## Minhas tarefas (`/tarefas`)

- Abas por grupo (`tasks-mine-tab-overdue`, `-today`, `-week`, `-later`, `-nodate`): **Atrasadas** · **Hoje** · **Esta semana** · **Depois** · **Sem prazo**, cada uma com contador; ou visão única agrupada (preferência salva).
- Linha (`tasks-mine-row` com `data-task-key`): checkbox de concluir (`tasks-mine-done`, otimista), código, título, projeto (cor), prioridade, prazo (vermelho se atrasada, "Hoje", "Amanhã", data), etiquetas, ícones de subtarefas (2/5), comentários e anexos.
- Adição rápida no topo (vai para o projeto padrão escolhido, lembrado por usuário; prazo "hoje" se estiver na aba Hoje).
- Filtro por projeto e prioridade; visões salvas pessoais.

## Projetos (`/tarefas/projetos`)

Cards com ícone/cor, nome, chave, líder, barra de progresso (concluídas / total do mês), abertas, atrasadas e sprint ativa. Filtro: ativos/arquivados. Cada card é `tasks-project-card` (`data-project-key`). **+ Novo projeto** (`tasks-project-new`) abre o `form-sheet`: nome (`field-name`, sugere a chave ao digitar), chave editável (`field-key`) com checagem de disponibilidade, ícone, cor, público/privado (selo Pro), estimativa, sprints (selo Pro).

## Projeto (`/tarefas/p/[key]`)

Cabeçalho: ícone, nome, chave, membros (avatares, em privado), sprint ativa (nome, dias restantes, progresso) quando houver, botões **Nova tarefa**, ⭐ (fixar no menu) e ⋯ (configurações, relatórios, arquivar).

Abas de visão (`tasks-view-tab` com `data-view` = `quadro`, `lista`, `calendario`, `backlog`): **Quadro** · **Lista** · **Calendário** · **Backlog** (só com sprints) + visões salvas. Barra de filtros comum (responsável, prioridade, etiqueta, prazo, sprint, "só minhas", busca), agrupamento e ordenação; tudo na URL. "Salvar visão" quando os filtros mudaram.

### Quadro
- Quadro `tasks-board`; uma coluna por status (`tasks-column` com `data-status-id` e `data-category`), na ordem do fluxo, com cor, nome e contador (e soma de estimativa, se houver).
- Card (`tasks-card` com `data-task-id` e `data-task-key`): código, título (até 3 linhas), prioridade (ícone), etiquetas (até 3), responsável (avatar), prazo (selo colorido), subtarefas (2/5), comentários, anexos, selo "Bloqueada".
- Arrastar entre colunas (muda status) e dentro da coluna (ordem); arrastar com várias selecionadas move todas.
- Raias opcionais (por responsável ou prioridade), recolhíveis.
- Colunas DONE/CANCELED mostram as últimas 20 concluídas + "Ver todas" (para não ficarem gigantes); recolher coluna.
- Adição rápida no fim de cada coluna ("+ Adicionar tarefa": campo `tasks-quick-add` dentro da coluna; Enter cria com o `parseQuickAdd` — `@pessoa`, `!prioridade`, datas, `#etiqueta`, `~estimativa` — e mostra os trechos reconhecidos como chips enquanto digita).
- Rolagem horizontal com as colunas; no celular, uma coluna por tela com encaixe (snap) e abas dos status no topo.

### Lista
- Linhas `tasks-list-row` (`data-task-key`). Agrupada (status, responsável, prioridade, sprint, prazo, sem grupo), grupos recolhíveis com contador.
- Colunas configuráveis: código, título, status, prioridade, responsável, prazo, etiquetas, estimativa, sprint, criada, atualizada.
- **Edição na própria linha** (status, prioridade, responsável, prazo, etiquetas) com popovers.
- Subtarefas recolhidas sob a pai (expandir); seleção múltipla com checkbox e Shift+clique; barra de edição em massa.
- Adição rápida no fim de cada grupo; "Carregar mais" por cursor.

### Calendário
- Calendário `tasks-calendar`; dias com `data-date`; cada tarefa `tasks-calendar-item` (`data-task-key`). Mês (padrão) e semana; tarefas no dia do prazo (com hora, se tiver); cor pela prioridade ou projeto.
- Arrastar para outro dia muda o prazo (otimista); clicar num dia vazio cria com aquele prazo.
- "+3 mais" no dia cheio abre a lista do dia; painel "Sem prazo" lateral para arrastar para o calendário.

### Backlog (planejamento de sprint)
- À esquerda o **backlog** (sem sprint, ordenável), à direita as **sprints planejadas e a ativa**, cada uma com datas, objetivo, total de tarefas e de estimativa, e a soma por responsável.
- Arrastar do backlog para uma sprint (e entre sprints); seleção múltipla.
- Botões: **Criar sprint**, **Iniciar sprint** (dialog com nome, objetivo e datas), **Concluir sprint** (dialog: "4 tarefas não foram concluídas. Mover para: próxima sprint / nova sprint / backlog" + prévia do resumo).
- Após concluir: tela de resumo (planejado × entregue, adicionadas durante, movidas, velocidade).

## Tarefa (painel lateral e página)

Mesma estrutura nos dois (`tasks-task-panel`); no painel, propriedades no topo em grade; na página, coluna lateral direita.

1. **Barra superior**: breadcrumb (Projeto › Tarefa pai), código com copiar, seguir/deixar de seguir (avatares dos seguidores), ▶ cronômetro, ⋯ (Copiar link, Duplicar, Mover para projeto, Converter em tarefa / em subtarefa, Arquivar, Excluir), abrir em página inteira, fechar.
2. **Título** (`tasks-task-title`) editável no lugar (Enter salva, Esc cancela).
3. **Propriedades**: Status (`tasks-task-status`) · Prioridade · Responsável (com "Atribuir a mim") · Início · Prazo (com hora opcional) · Etiquetas (criar na hora) · Estimativa · Sprint · Tarefa pai. Cada uma é um popover com busca e teclado.
4. **Descrição**: editor de blocos com autosave, indicador "Salvando…/Salvo", placeholder "Adicione uma descrição… (digite / para comandos)", colar imagem (upload), menções.
5. **Subtarefas**: progresso (3/5), lista (`tasks-subtask-row`) com checkbox, título, responsável e prazo; adicionar inline (`tasks-subtask-add`, Enter cria); arrastar para reordenar; abrir no painel.
6. **Checklist**: itens (`tasks-checklist-item`, com o `<input type="checkbox">` dentro) com checkbox, adicionar (`tasks-checklist-add`, Enter cria o próximo), editar, reordenar, converter em subtarefa, excluir; progresso.
7. **Vínculos**: agrupados (Bloqueia / Bloqueada por / Relacionada / Duplicada), cada um com código, título e status; "+ Vincular" (`tasks-link-add`) abre busca de tarefas; cada vínculo é `tasks-link-row`.
8. **Anexos**: `Dropzone` compacto + lista/grade, pré-visualização, baixar, excluir; colar arquivo com a tarefa em foco.
9. **Horas**: total gasto × estimativa (barra; vermelha se passou), botão iniciar/parar (`tasks-timer-toggle`), "+ Lançar horas" (duração "1h30", dia, nota, faturável), lista dos lançamentos (quem, quando, duração, nota) com editar/excluir.
10. **Atividade** (itens `tasks-timeline-item`): abas **Comentários** · **Tudo**; itens do histórico em texto discreto ("Ana mudou o status de A fazer para Fazendo · há 2 h"); comentários com avatar, nome, hora, "(editado)", reações, menu (editar, excluir, copiar link do comentário); "Carregar anteriores".
11. **Caixa de comentário** fixa no rodapé (`tasks-comment-input`, botão `tasks-comment-submit`): editor compacto, `@` para mencionar, colar imagem, **Ctrl+Enter** envia, rascunho guardado por tarefa.

Rodapé discreto: "Criada por Bruno em 12/10/2026 · atualizada há 5 min".

## Horas (`/tarefas/horas`)

- **Minha semana**: grade dias × tarefas com totais por dia e da semana; células editáveis (duração); navegar entre semanas; "+ Lançar"; cronômetro ativo em destaque.
- **Relatório** (Pro): filtros por período (esta semana, mês, mês passado, intervalo), pessoa, projeto, faturável; agrupamento (pessoa, projeto, tarefa, dia); totais; gráfico de barras por dia; **Exportar CSV**. Owner/admin veem todos; membros, só os próprios.

## Relatórios do projeto (Pro)

Cartões: abertas, concluídas na semana, atrasadas, tempo médio de ciclo. Gráficos (usando a skill/padrão de gráficos do projeto e as cores do tema): concluídas por semana (barras), carga por pessoa (barras horizontais), atrasadas por idade, burndown da sprint ativa (linha real × ideal), velocidade (barras). Sem a feature: prévia borrada com `PlanGate`.

## Configurações do projeto

Abas: **Geral** (nome, chave com aviso de alias, ícone, cor, descrição, líder) · **Fluxo** (status arrastáveis, cor, categoria, renomear, excluir com destino) · **Etiquetas** · **Membros** (só privado) · **Estimativa e sprints** · **Zona de perigo** (arquivar, excluir digitando a chave).

## Notificações

- Sino, painel, `/notificacoes` e `/configuracoes/notificacoes` são do add-on `notificacoes` (`skills/notificacoes/references/06-telas.md`). Aqui: a tela da tarefa abre pela `url` da notificação (com `#comentario-<id>` rolando até o comentário e destacando-o por 2 s), e os tipos `task.*`/`sprint.*` aparecem no grupo "Tarefas" das preferências.

## Home (widgets)

- **Minhas tarefas de hoje** (até 5 + "ver todas"), com concluir direto.
- **Atrasadas** (contador + lista curta).
- **Sprint ativa** de cada projeto em que a pessoa tem tarefas (progresso e dias restantes).

## Contrato testável (data-testid)

A bateria do `/rodsaas:verify` (`suite/tests/14-tarefas.spec.ts`) roda quando `rodsaas.json` tem `tarefas` em `presets`. Lista canônica em `skills/verify/contract.json` (`presets.tarefas`). Ela confere o mínimo; o escopo é a tela inteira descrita acima.

| testid | Elemento |
|---|---|
| `tasks-project-card` (`data-project-key`), `tasks-project-new` (abre `form-sheet` com `field-name`, `field-key`, `form-submit`) | projetos |
| `tasks-view-tab` (`data-view`) | abas Quadro · Lista · Calendário · Backlog |
| `tasks-board`, `tasks-column` (`data-status-id`, `data-category`), `tasks-card` (`data-task-id`, `data-task-key`), `tasks-quick-add` | quadro (arrastar o card para outra coluna muda o status) |
| `tasks-list-row` (`data-task-key`) | lista |
| `tasks-calendar`, `tasks-calendar-item` (`data-task-key`) | calendário |
| `tasks-mine-tab-overdue`, `tasks-mine-tab-today`, `tasks-mine-tab-week`, `tasks-mine-tab-later`, `tasks-mine-tab-nodate`, `tasks-mine-row` (`data-task-key`), `tasks-mine-done` | minhas tarefas |
| `tasks-task-panel`, `tasks-task-title`, `tasks-task-status` | painel da tarefa (`?tarefa=MKT-12`) |
| `tasks-subtask-add`, `tasks-subtask-row`, `tasks-checklist-add`, `tasks-checklist-item`, `tasks-link-add`, `tasks-link-row` | subtarefas, checklist, vínculos |
| `tasks-comment-input`, `tasks-comment-submit`, `tasks-timeline-item` | comentários e histórico |
| `tasks-timer-toggle`, `tasks-timer-chip`, `tasks-timer-stop` | cronômetro (painel e topo) |

