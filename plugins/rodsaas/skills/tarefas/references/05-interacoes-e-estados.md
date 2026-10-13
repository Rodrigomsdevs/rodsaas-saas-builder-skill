# Interações e estados

Esta parte é escopo, não acabamento. Cada item aqui tem que estar funcionando para a fase 8 terminar.

## Adição rápida

Campo que aparece no fim de cada coluna/grupo, no topo de Minhas tarefas e no atalho `C`.

- Digita o título; **Enter** cria e mantém o campo aberto para a próxima; **Shift+Enter** cria e abre a tarefa; **Esc** fecha (pergunta se havia texto).
- **Atalhos no texto** com o parser de `scripts/parsers.mjs` (porte para `web/src/features/tasks/lib/quick-add.ts` com os testes):
  - `@ana` responsável · `!alta` / `!urgente` / `!media` / `!baixa` (ou `!1`–`!4`) · `#etiqueta` · `hoje`, `amanhã`, `depois de amanhã`, `sexta`, `20/10`, `em 3 dias`, `em 2 semanas` · `~3` estimativa.
  - Enquanto digita, os trechos reconhecidos ficam **destacados** no campo e aparecem como **chips** abaixo ("👤 Ana", "🔴 Alta", "📅 qua, 14/10"). Clicar no × do chip **desfaz** o reconhecimento (o texto volta para o título). Isso resolve falsos positivos como "Reunião de sexta" quando "sexta" era só texto.
  - `@` abre sugestão de membros ao digitar; `#` sugere etiquetas (e "Criar etiqueta 'novidade'").
  - Menção ambígua ("@an" → Ana e Anderson) mostra as opções em vez de chutar.
- O contexto entra automático: status da coluna, grupo da lista, sprint da visão filtrada, prazo do dia (calendário/"Hoje").
- Criação **otimista**: o card aparece na hora com código provisório "…" e ganha o código real quando a API responde; erro → card some, texto volta para o campo, toast com o motivo.
- `Idempotency-Key` por envio.

## Atalhos de teclado

Ativos quando o foco **não** está num campo de texto ou no editor. `?` abre a folha de atalhos.

| Tecla | Ação |
|---|---|
| `C` | nova tarefa (no contexto atual) |
| `Ctrl+K` | busca global (`MKT-12` abre direto) |
| `/` | focar a busca/filtro da visão |
| `J` / `K` ou ↓ / ↑ | próxima / anterior |
| `Enter` | abrir no painel |
| `Esc` | fechar painel / limpar seleção |
| `X` | selecionar a tarefa em foco (edição em massa) |
| `Shift+↓/↑` | estender seleção |
| `S` | mudar status |
| `A` | responsável · `I` atribuir a mim |
| `P` | prioridade |
| `D` | prazo |
| `L` | etiquetas |
| `M` | mover para sprint |
| `T` | iniciar/parar cronômetro |
| `E` | editar título |
| `Ctrl+Enter` | enviar comentário |
| `Delete` | excluir (com confirmação) |

Cada atalho abre o mesmo popover do clique, já com busca focada. Atalho indisponível (sem permissão, feature do plano) não faz nada e mostra toast explicando.

## Arrastar e soltar

- Biblioteca: dnd-kit (ou a atual equivalente), com **sensor de teclado** e anúncios para leitor de tela ("MKT-12 movida para Fazendo, posição 3").
- Quadro: entre colunas (status) e dentro (ordem); várias selecionadas movem juntas; soltar fora cancela.
- Backlog: para sprint e entre sprints. Calendário: muda o prazo. Subtarefas e checklist: reordenar. Projetos no menu: reordenar.
- **Otimista**: move na hora; a API responde em segundo plano; erro → volta para o lugar e toast "Não foi possível mover MKT-12. Desfeito."
- Alternativa sem arrastar em tudo: menu "Mover para…" (status, sprint, posição), essencial no celular.

## Edição em massa

- Selecionar com checkbox, `X`, Shift+clique ou "Selecionar tudo" (só as carregadas na tela).
- Barra flutuante: "12 selecionadas" + Status · Responsável · Prioridade · Sprint · Prazo · Etiquetas · Arquivar · Excluir · Limpar seleção.
- Botão com loading: "Aplicando a 12 tarefas…"; resultado: toast "12 tarefas atualizadas" com **Desfazer** por 8 s (reaplica os valores anteriores numa nova chamada em massa).
- Excluir em massa: confirmação com a quantidade ("Mover 12 tarefas para a lixeira?").

## Otimismo e desfazer

| Ação | Comportamento |
|---|---|
| mudar status, prioridade, responsável, prazo, etiquetas, sprint | otimista; erro desfaz + toast |
| concluir pela checkbox | otimista, com animação curta; toast "MKT-12 concluída" + **Desfazer** |
| marcar item de checklist | otimista |
| reagir, seguir, marcar notificação como lida | otimista |
| arquivar | otimista + **Desfazer** |
| excluir | confirmação → toast "Movida para a lixeira" + **Desfazer** (restaura) |
| iniciar/parar cronômetro | otimista (o chip aparece/some na hora); erro reverte |
| comentário | aparece na hora com estado "enviando" (opaco); erro → fica marcado com "Tentar de novo" e o texto não se perde |

Toda mutação invalida as consultas afetadas (tarefa, quadro, minhas tarefas, contadores do menu, home) sem recarregar a página.

## Atualização sem tempo real

- Telas abertas (quadro, lista, tarefa, minhas tarefas) recarregam **ao focar a janela** e a cada **30 s** (só se a aba estiver visível), mantendo a rolagem e o que está sendo editado.
- Se a tarefa aberta mudou por outra pessoa enquanto você olhava, os campos atualizam; se você estava editando a descrição, vale o controle de versão (diálogo de conflito, igual ao notion).
- Sino: contador a cada 60 s e ao focar.

## Estados por tela

### Carregando (primeira vez) — skeleton com o formato real
| Onde | Skeleton |
|---|---|
| Quadro | colunas com cabeçalho e 3–4 cards cinza por coluna |
| Lista | cabeçalho de grupo + 8 linhas com as colunas |
| Calendário | grade do mês com 2–3 barras em dias aleatórios fixos |
| Minhas tarefas | abas com contadores em cinza + 6 linhas |
| Painel da tarefa | título, grade de propriedades, 4 linhas de descrição, 3 itens de atividade |
| Comentários | 3 blocos com avatar e linhas |
| Horas | grade da semana em cinza |
| Relatórios | cartões e retângulos dos gráficos |
| Menu (projetos) | 4 linhas com bolinha + texto |
| Sino | 4 itens no popover |

Recarregando (troca de filtro/página): mantém o conteúdo anterior com indicador fino no topo da área; nunca volta para o skeleton.

### Vazio — sempre com a próxima ação
| Onde | Mensagem | Ação |
|---|---|---|
| Nenhum projeto | "Organize o trabalho da {empresa} em projetos" | **Criar projeto** (+ link para o "Primeiros passos" se existir) |
| Projeto sem tarefas | "Nenhuma tarefa ainda" | adição rápida em foco + dica dos atalhos |
| Coluna vazia | área tracejada "Solte aqui" ao arrastar; senão só o "+ Adicionar" | — |
| Filtro sem resultado | "Nenhuma tarefa com esses filtros" | **Limpar filtros** |
| Minhas tarefas · Hoje | "Nada para hoje" | ver Esta semana |
| Minhas tarefas · Atrasadas | "Nenhuma tarefa atrasada. Tudo em dia!" | — |
| Backlog vazio | "O backlog está vazio" | adicionar tarefa |
| Sem sprints | "Planeje o trabalho em sprints de 1 a 4 semanas" | **Criar sprint** |
| Sprint sem tarefas | "Arraste tarefas do backlog para esta sprint" | — |
| Calendário sem prazos | "Nenhuma tarefa com prazo neste mês" | — |
| Subtarefas | (seção recolhida) "+ Adicionar subtarefa" | — |
| Anexos | o próprio Dropzone | — |
| Horas da tarefa | "Nenhuma hora lançada" | ▶ Iniciar · + Lançar |
| Folha da semana | "Nenhuma hora nesta semana" | + Lançar |
| Comentários | "Nenhum comentário ainda. Comece a conversa." | foco na caixa |
| Notificações | "Você está em dia" | — |
| Relatórios sem dados | "Conclua algumas tarefas para ver os gráficos" | — |
| Lixeira | "A lixeira está vazia" | — |

### Erro
- **Bloco** (coluna, lista, painel, comentários, gráficos): mensagem do `ApiError` + **Tentar de novo** no próprio bloco; o resto da tela continua funcionando.
- **Tarefa não encontrada** (404, inclusive projeto privado sem acesso): "Tarefa não encontrada ou você não tem acesso" com a casca, e link para Minhas tarefas. Código de tarefa movida redireciona sozinho.
- **Sem permissão** para uma ação: botões ocultos ou desabilitados com tooltip ("Só o líder do projeto pode editar o fluxo").
- **Feature fora do plano**: `PlanGate` (sprints, relatórios, privado, visões do projeto) e `UpgradeDialog` ao tentar.
- **Limite de projetos**: botão "Novo projeto" avisa antes; tentativa abre o `UpgradeDialog`.
- **Sem conexão**: banner global; mutações otimistas que falharem desfazem com aviso; comentário fica com "Tentar de novo".
- **Conflito de descrição**: diálogo "Ana editou esta descrição às 14:32 enquanto você escrevia" com as duas opções (igual ao notion).

### Botões com loading (mantendo a largura)
Criar projeto · Salvar configurações · Enviar comentário · Iniciar/Concluir sprint · Aplicar em massa · Lançar horas · Exportar CSV ("Gerando…") · Excluir projeto · Restaurar da lixeira. Upload: progresso por arquivo (do uploads).

### Formulários e alterações não salvas
- Dialog/sheet de projeto, sprint, lançamento de horas: validação no campo, erros da API no campo, "Descartar alterações?" ao fechar com mudanças.
- Rascunho da caixa de comentário e da adição rápida guardado por tarefa/contexto no `localStorage` (em try/catch); some ao enviar.

## Detalhes que fazem diferença
- Prazo: "Hoje", "Amanhã", "Ontem", dia da semana se for na semana, senão `14 out`; com hora `14 out, 15:30`; atrasada em vermelho com "há 3 dias" no tooltip.
- Prioridade com ícone e cor consistentes em toda parte (Urgente = vermelho/destrutivo, Alta = laranja/aviso, Média = info, Baixa = neutro, Sem = traço).
- Código da tarefa em fonte monoespaçada; clicar copia ("MKT-12 copiado").
- Avatares com iniciais e cor estável por pessoa; "Sem responsável" com ícone tracejado.
- Títulos longos truncados com tooltip; no painel, título completo.
- Contadores do menu e das abas atualizam após cada mutação.
- Título da aba do navegador: "MKT-12 · Revisar contrato · {Produto}"; com cronômetro rodando: "⏱ 00:42 · …".
- Celular: botão flutuante "+" para nova tarefa; painel da tarefa em tela cheia; quadro com uma coluna por vez; lista vira cards; atalhos de teclado desligados.
