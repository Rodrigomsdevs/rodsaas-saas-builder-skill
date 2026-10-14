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
`rodsaas.json` ganha `"presets": [..., "tarefas"]` e o app em `"apps"`. Leia antes para saber o que existe (`notion`, módulos, `uploads`).

### 2. App no registro (`web/src/config/apps.ts`)
O preset registra **o app Tarefas** na casca de apps (`skills/frontend/references/12-casca-e-apps.md`; abra `skills/frontend/assets/simulador-navegacao.html` para ver o comportamento). Ele **não** mexe no menu de outro app nem acrescenta seções no menu de ninguém.

```ts
// web/src/features/tasks/app.tsx
export const tarefasApp: AppDef = {
  id: 'tarefas', name: 'Tarefas', description: 'Projetos, quadro, sprints e horas',
  icon: ListChecks, category: 'trabalho', order: 20, defaultPinned: true,
  match: ['/tarefas'], home: '/tarefas',
  Sidebar: TasksSidebar,                       // menu do app (04-telas.md, "Menu do app")
  action: { label: 'Nova tarefa', onSelect: openQuickAdd },
  useBadge: useOverdueMineCount,               // atrasadas atribuídas a mim
  widgets: [todayWidget, overdueWidget, activeSprintWidget],
  search: tasksSearchProvider,
}
```

- Acrescente `tarefasApp` em `config/apps.ts` e `{ id, name, home }` em `rodsaas.json → apps`.
- Projeto que ainda tem `config/navigation.ts` em lista ou em seções (anterior ao modelo de apps): rode antes o `/rodsaas:apps`, que converte a casca. Não acrescente seções no menu antigo.
- Com o segundo app registrado, a casca troca sozinha do menu clássico para o trilho.

### 3. Início, busca e notificações
- **Widgets do Início** e **provedor do Ctrl+K** vão no `AppDef` (`widgets`, `search`); o Início e a busca globais leem do registro.
- **Sino**: vem do add-on `notificacoes` (pré-requisito), que a casca põe no trilho (ou no rodapé do menu clássico); a página `/notificacoes` é global, fora de qualquer app. Este preset só registra os tipos dele e chama `notify()`.

### 4. Topo
O topo da casca tem o ponto de extensão `topbarItems` (à direita, antes da busca): o Tarefas acrescenta ali o **cronômetro ativo**, visível em qualquer app.

### 5. Configurações
Se o app tiver configurações próprias, elas ficam dentro do app (configurações do projeto); nada novo em `/configuracoes`.

### 6. Componentes compartilhados (`web/src/components/app/`)
Reutilize se existirem, crie aqui se não: `Kanban` (colunas + arrastar, usado pelo database do notion e pelos módulos), `SidePeek`, `RelationSelect`, `MemberSelect`, `UserAvatar`, `Dropzone`/`FileList` (do uploads), editor de blocos (do notion; se não houver notion, instale o mesmo editor aqui seguindo `03-editor.md` da skill notion).

### 7. Backend
Plugins de rota próprios registrados no `app.ts`; contadores em `lib/usage.ts`; features/limites em `config/plans.ts`; códigos de erro no catálogo; avisos pelo `notify()` do add-on `notificacoes` (`modules/notifications/`), com os tipos registrados no boot do módulo de tarefas.

## Acessos no convite (`registerMemberAccess('tarefas', …)`)

O registro é da base (`skills/backend/references/10-acessos-por-pessoa.md`): a tela de convite e a de "Acessos da pessoa" desenham estes campos sem conhecer o app; `read` lê da fonte da verdade do app (nunca de uma cópia) e `apply` é idempotente.

| Campo | Tipo | Padrão | Aplica |
|---|---|---|---|
| `privateProjectIds` | multiselect "Projetos privados" (`source`: projetos `PRIVATE`; só aparece com a feature `private_projects`) | vazio | `TaskProjectMember` em cada projeto |

- `canGrant`: OWNER, ADMIN ou o membro que já participa do projeto (só para aquele projeto). Projetos públicos não precisam de nada.
- `countsSeat`: sim.

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
