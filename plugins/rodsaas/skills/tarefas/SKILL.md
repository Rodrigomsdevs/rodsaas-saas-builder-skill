---
name: tarefas
description: Preset que soma ao projeto rodsaas um gestor de tarefas completo (estilo Asana/Trello com sprints do Linear) — projetos com código de tarefa (MKT-123), fluxo de status personalizável, quadro kanban, lista, calendário, minhas tarefas, backlog e sprints com burndown, subtarefas, checklists, vínculos, comentários com menções e reações, histórico, seguidores, notificações (sino e e-mail), anexos, apontamento de horas com cronômetro, adição rápida com atalhos ("@ana !alta amanhã"), edição em massa, atalhos de teclado e relatórios. Use depois do /rodsaas:backend e /rodsaas:frontend (com ou sem o preset notion) quando o usuário pedir tarefas, to-do, kanban, gestão de projetos, sprints, clone do Trello/Asana/Linear/Jira, ou chamar /rodsaas:tarefas.
---

# rodsaas · tarefas

Acrescenta a um projeto rodsaas um **gestor de tarefas de verdade**, para qualquer equipe (marketing, RH, operação) e com sprints opcionais para equipes de software. Ele **soma** ao que já existe: não troca a casca do app, entra como uma seção nova do menu, widgets na home e resultados na busca global — e convive com o preset `notion` e com os módulos criados pelo `/rodsaas:module`.

Tudo da base continua valendo: auth, empresas com RLS, membros, convites, planos, Stripe, padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json`, com typecheck, lint, build e testes **verdes**.
2. **Add-on `uploads`** (para os anexos): se `rodsaas.json` não tiver `uploads` em `addons`, rode o fluxo da skill `uploads` primeiro (leia o `SKILL.md` dela) e volte.
3. Regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (dnd-kit, recharts, editor).

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Perfil | equilibrado: quadro e lista para todos; **sprints opcionais por projeto** |
| Responsável | **um** por tarefa (deixa claro de quem é); colaboradores entram como seguidores |
| Fluxo de status | **personalizável por projeto**, cada status numa de 5 categorias fixas |
| Estimativa | escolhida **por projeto**: nenhuma, pontos ou horas |
| Sprints | manuais (criar, planejar, iniciar, concluir) |
| Notificações | sino no app + e-mail (imediato ou resumo diário), num módulo genérico `notifications` reutilizável |
| Planos | Free: 3 projetos, horas e anexos; Pro: projetos ilimitados, sprints, relatórios, projetos privados; Business: igual ao Pro com mais limites |
| Projeto inicial | workspaces novos ganham o projeto "Primeiros passos" com tarefas de exemplo |

Fora da v1 (registre no README como próximos passos): recorrência, modelos de tarefa, campos personalizados, linha do tempo (Gantt), convidados externos, automações, tempo real (a v1 atualiza ao focar a janela e a cada 30 s nas telas abertas).

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(tarefas): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e contrato** — registrar o preset, seção no menu, widgets da home, provedor da busca global, componentes compartilhados. → `references/01-escopo-e-integracao.md`
2. **Modelo e regras** — models, migrations com RLS, sequência de código, posições, fluxo de status, projeto inicial. → `references/02-modelo.md`
3. **API de projetos e tarefas** — CRUD, quadro, filtros, minhas tarefas, edição em massa, descrição com versão, subtarefas, checklist, vínculos, lixeira, busca. → `references/03-api.md`
4. **Colaboração** — comentários, reações, histórico, seguidores, notificações (sino, e-mail, resumo diário, lembretes de prazo). → `references/03-api.md`
5. **Anexos e horas** — anexos via `uploads`; cronômetro, lançamento manual, folha de horas, exportação. → `references/03-api.md`
6. **Sprints e relatórios** — planejar, iniciar, concluir com resumo, burndown, velocidade, carga, atrasos. → `references/03-api.md`
7. **Telas** — seção de tarefas, projetos, visões (quadro, lista, calendário, backlog, minhas tarefas), detalhe da tarefa, horas, notificações, configurações do projeto. → `references/04-telas.md`
8. **Interações e estados** — adição rápida com atalhos, atalhos de teclado, arrastar e soltar, edição em massa, otimismo e desfazer, todos os estados de carregamento/vazio/erro. → `references/05-interacoes-e-estados.md`
9. **Fechamento** — `references/06-checklist.md`, testes ponta a ponta, README do projeto.

## Princípios

- **Soma, não substitui.** Nenhum arquivo da casca é reescrito; o preset se registra nos pontos de extensão (menu, home, busca). Se o `notion` existir, a seção entra no menu dele.
- **Rápido como app nativo.** Mudar status, arrastar card, atribuir, marcar checklist, reagir, ligar/desligar cronômetro: tudo otimista, com desfazer automático e aviso se a API recusar.
- **Nada se perde.** Descrição com autosave e controle de versão; rascunho de comentário guardado; cronômetro vive no servidor (sobrevive a recarregar e trocar de aparelho).
- **Uma fonte de verdade.** Código da tarefa, posições, categorias de status, horas e uso do plano são calculados no servidor; o front nunca inventa número.
- **Segurança da base, sem exceção.** RLS `FORCE` em todas as tabelas novas; projeto privado escondido (404) para quem não é membro; relações (tarefa ↔ projeto, sprint, pai, vínculo, anexo) sempre da mesma empresa, garantido no banco.
- **Todo estado tem tela e toda ação tem feedback** — a lista completa está em `references/05-interacoes-e-estados.md`; ela é parte do escopo, não acabamento.

## Relatório final

O que foi adicionado (menu, telas, rotas), planos e limites novos, como testar em 5 minutos (criar projeto → adição rápida com atalhos → arrastar no quadro → comentar mencionando alguém → ligar o cronômetro → anexar arquivo → criar e concluir uma sprint), o que ficou fora da v1, e desvios por versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-integracao.md` | Fase 1 — escopo, contrato de preset, convivência com notion/módulos, planos |
| `references/02-modelo.md` | Fase 2 — models, RLS, triggers, regras de código, posição, status, sprints, horas |
| `references/03-api.md` | Fases 3 a 6 — todas as rotas, filtros, notificações, horas, anexos, relatórios, testes |
| `references/04-telas.md` | Fase 7 — cada tela e o que ela tem |
| `references/05-interacoes-e-estados.md` | Fase 8 — adição rápida, teclado, arrastar, massa, otimismo, estados |
| `references/06-checklist.md` | Fase 9 |
| `scripts/parsers.mjs` | adição rápida e duração de horas (porte para TS com os testes) |
