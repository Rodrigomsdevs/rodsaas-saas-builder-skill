# Escopo e integração

## Escopo da v1

| Área | Inclui |
|---|---|
| **Projetos** | nome, chave (MKT), ícone, cor, descrição, líder, público/privado, membros (privado), fluxo de status, etiquetas, tipo de estimativa, sprints liga/desliga, arquivar, excluir |
| **Tarefa** | código `MKT-123`, título, descrição (editor de blocos com autosave e versão), status, prioridade, responsável, início, prazo (data ou data e hora), etiquetas, estimativa, sprint, tarefa pai, subtarefas (1 nível), checklist, vínculos (bloqueia / bloqueada por / relacionada / duplicada), seguidores, anexos, horas, arquivar, lixeira |
| **Colaboração** | comentários com formatação e menções, editar/excluir os próprios, reações, histórico de atividade, seguir/deixar de seguir |
| **Visões** | quadro (com raias opcionais), lista agrupada, calendário, minhas tarefas, backlog/planejamento, visões salvas (pessoais e do projeto) |
| **Sprints** | criar, planejar com soma de estimativas, iniciar, acompanhar, concluir com destino das pendentes e resumo, burndown, velocidade |
| **Horas** | cronômetro (um por pessoa, vive no servidor), lançamento manual ("1h30"), faturável, total × estimativa, folha de horas semanal, relatório por pessoa/projeto/tarefa, exportação CSV |
| **Notificações** | sino com contador, caixa de entrada, e-mail imediato ou resumo diário, preferências por tipo, lembretes de prazo |
| **Produtividade** | adição rápida com atalhos, atalhos de teclado, edição em massa, painel lateral (side peek), copiar link/código, duplicar, mover entre projetos, converter checklist ↔ subtarefa |
| **Relatórios** | concluídas por semana, carga por pessoa, atrasadas, tempo de ciclo, burndown, velocidade, horas |
| **Busca** | por código (`MKT-123`), título e descrição, dentro do Ctrl+K global |

## Contrato de preset (como "somar" ao projeto)

Este preset é o primeiro escrito neste formato; os próximos (forms, crm, helpdesk…) seguem o mesmo contrato.

### 1. Registro
`rodsaas.json` ganha `"presets": [..., "tarefas"]`. Leia antes para saber o que existe (`notion`, módulos, `uploads`).

### 2. Menu (`web/src/config/navigation.ts`)
Navegação por **seções**. Se o arquivo ainda for uma lista simples (projeto anterior a este contrato), converta para seções sem mudar o que já aparece:

```ts
export const navigationSections: NavSection[] = [
  { id: 'base', items: [{ label: 'Início', href: '/inicio', icon: Home }] },
  // presets e módulos acrescentam seções aqui, nunca reescrevem as outras
  { id: 'tarefas', label: 'Tarefas', items: [...], dynamic: TasksSidebarSection },
]
```

- Se o preset `notion` existir, o menu lateral dele (`app-sidebar`) passa a renderizar `navigationSections` entre os favoritos e a árvore de páginas, em vez de itens fixos. Faça essa adaptação mínima no componente do notion (sem mudar o resto dele).
- `dynamic` permite que a seção tenha conteúdo próprio (a lista de projetos com contadores).

### 3. Home (`web/src/config/home-widgets.ts`)
Lista de widgets ordenados; a página de início renderiza todos. O tarefas acrescenta "Minhas tarefas de hoje", "Atrasadas" e "Sprint ativa". Se a home atual for fixa (da base ou do notion), extraia os blocos dela para widgets nesse registro, sem mudar o visual.

### 4. Busca global (`web/src/config/search-providers.ts`)
Cada preset registra um provedor `{ id, label, search(q), render(item), href(item) }`. O Ctrl+K mostra os resultados agrupados por provedor. Se o Ctrl+K atual for do notion, adapte para usar os provedores (o notion vira um provedor também).

### 5. Topo do app
Pontos de extensão no topo: `topbarItems` (o tarefas adiciona o **cronômetro ativo**) e o **sino de notificações** (do módulo genérico `notifications`, criado aqui se não existir).

### 6. Componentes compartilhados (`web/src/components/app/`)
Reutilize se existirem, crie aqui se não: `Kanban` (colunas + arrastar, usado pelo database do notion e pelos módulos), `SidePeek`, `RelationSelect`, `MemberSelect`, `UserAvatar`, `Dropzone`/`FileList` (do uploads), editor de blocos (do notion; se não houver notion, instale o mesmo editor aqui seguindo `03-editor.md` da skill notion).

### 7. Backend
Plugins de rota próprios registrados no `app.ts`; contadores em `lib/usage.ts`; features/limites em `config/plans.ts`; códigos de erro no catálogo; o módulo `notifications` em `modules/notifications/` (genérico: outros presets disparam notificações por ele).

## Planos

Acrescente em **todos** os planos de `config/plans.ts` (preservando o que existe):

| | Free | Pro | Business |
|---|---|---|---|
| limite `taskProjects` | 3 | ilimitado | ilimitado |
| feature `sprints` | — | ✅ | ✅ |
| feature `task_reports` (relatórios e exportação de horas) | — | ✅ | ✅ |
| feature `private_projects` | — | ✅ | ✅ |
| visões salvas **do projeto** (pessoais são livres) | — | ✅ | ✅ |
| cronômetro, horas na tarefa e folha pessoal | ✅ | ✅ | ✅ |
| anexos (limites do `uploads`) | ✅ | ✅ | ✅ |

Rebaixar de plano não apaga nada: sprints e relatórios ficam somente leitura/ocultos com convite para upgrade; projetos privados continuam privados.
