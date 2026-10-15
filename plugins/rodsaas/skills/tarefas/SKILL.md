---
name: tarefas
description: Preset que soma ao projeto rodsaas um gestor de tarefas completo (estilo Asana/Trello com sprints do Linear) — projetos com código de tarefa (MKT-123), fluxo de status personalizável, quadro kanban, lista, calendário, minhas tarefas, backlog e sprints com burndown, subtarefas, checklists, vínculos, comentários com menções e reações, histórico, seguidores, notificações (sino e e-mail), anexos, apontamento de horas com cronômetro, adição rápida com atalhos ("@ana !alta amanhã"), edição em massa, atalhos de teclado e relatórios — e a operação avançada: recorrência com dia útil e feriados, modelos de projeto com datas e dependências, campos personalizados, Gantt com dependências e caminho crítico, automações, carga por pessoa e cliente convidado que aprova, com perfis de escritório contábil (obrigações mensais com prazo legal), agência (horas faturadas no Financeiro) e obras (checklist com foto). Use depois do /rodsaas:backend e /rodsaas:frontend (com ou sem o preset notion) quando o usuário pedir tarefas, to-do, kanban, gestão de projetos, sprints, clone do Trello/Asana/Linear/Jira, ou chamar /rodsaas:tarefas.
---

# rodsaas · tarefas

Acrescenta a um projeto rodsaas um **gestor de tarefas de verdade**, para qualquer equipe (marketing, RH, operação) e com sprints opcionais para equipes de software. Ele **soma** ao que já existe: não troca a casca do app, entra como um **app** na casca (trilho), com widgets no Início e resultados na busca global — e convive com o preset `notion` e com os módulos criados pelo `/rodsaas:module`.

Tudo da base continua valendo: auth, empresas com RLS, membros, convites, planos, Stripe, padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json`, com typecheck, lint, build e testes **verdes**.
2. **Add-on `uploads`** (para os anexos): se `rodsaas.json` não tiver `uploads` em `addons`, rode o fluxo da skill `uploads` primeiro (leia o `SKILL.md` dela) e volte.
3. **Add-on `notificacoes`** (sino, e-mails de aviso, preferências): se `rodsaas.json` não tiver `notificacoes` em `addons`, rode o fluxo da skill `notificacoes` primeiro (leia o `SKILL.md` dela) e volte. Os avisos deste preset são registrados no catálogo dele e disparados pelo `notify()` dele (`skills/notificacoes/references/04-catalogo.md`, seção do app); nenhum aviso para membro é gravado ou enviado por conta própria.
4. Regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (dnd-kit, recharts, editor).

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo da v1**, exceto o que está marcado como fora da v1. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": uma tarefa sem subtarefas, checklist, comentários, histórico e horas, ou um quadro sem arrastar, **não é** o gestor de tarefas desta skill.
3. **O contrato testável (testids e rotas ★) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.** Passar no verify não significa que a fase acabou.
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase (cada linha de tabela e cada marcador) e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem o Tarefas (revisão)

Se `rodsaas.json → presets` já tem `tarefas` (ou existe `api/src/modules/tasks`), rode em **modo revisão** em vez de instalar de novo:

1. Leia todas as referências inteiras.
2. Compare item a item com o código (API, telas, testes) e monte a tabela de lacunas: item da referência · ✅/❌ · onde está ou o que falta. Comece pelo "Pronto quando" das fases 10 e 11 se o Tarefas foi instalado antes da versão 0.34 (recorrência, modelos, campos, Gantt, automações, carga, convidado e perfis não existiam) e depois pelas fases 3, 4 e 7 (é onde mais se simplifica: painel da tarefa sem subtarefas/checklist/vínculos/horas/histórico, sem calendário ou backlog, adição rápida sem os atalhos).
3. Mostre a tabela ao usuário e complete o que falta **fase por fase**, sem reescrever o que já está certo e sem perder dados (migrations só aditivas).
4. Feche com `references/06-checklist.md` e o `/rodsaas:verify` (`-g "Tarefas"`).

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Perfil | equilibrado: quadro e lista para todos; **sprints opcionais por projeto** |
| Responsável | **um** por tarefa (deixa claro de quem é); colaboradores entram como seguidores |
| Fluxo de status | **personalizável por projeto**, cada status numa de 5 categorias fixas |
| Estimativa | escolhida **por projeto**: nenhuma, pontos ou horas |
| Sprints | manuais (criar, planejar, iniciar, concluir) |
| Notificações | pelo add-on `notificacoes` (sino, e-mail imediato ou resumo diário, preferências por tipo); este preset registra os tipos `task.*`/`sprint.*` e chama `notify()` |
| Planos | Free: 3 projetos, horas e anexos; Pro: projetos ilimitados, sprints, relatórios, projetos privados; Business: igual ao Pro com mais limites |
| Projeto inicial | workspaces novos ganham o projeto "Primeiros passos" com tarefas de exemplo |
| Perfil | `GENERAL`; a workstation escolhe pelo segmento (contabilidade, agência/serviços, obras) — `references/08-perfis-de-segmento.md` |
| Recorrência | pela agenda, prorroga para dia útil com os feriados da empresa; a próxima nasce ao concluir |
| Gantt | dependência fim → início com folga; mover a barra empurra as sucessoras (nunca puxa para trás) |

Fora da v1 (registre no README como próximos passos): tempo real (a v1 atualiza ao focar a janela e a cada 30 s nas telas abertas), dependências início → início e fim → fim, nivelamento automático de recursos, convidado que comenta e envia arquivos, transmissão das obrigações ao governo (o Tarefas controla o prazo; quem entrega é o sistema fiscal), diário de obra em PDF.

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(tarefas): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e contrato** — registrar o preset e o **app Tarefas** no registro de apps (menu do app, widgets do Início, provedor da busca, contador no trilho), componentes compartilhados. → `references/01-escopo-e-integracao.md`
   - *Pronto quando*: app no trilho com o menu, widgets, busca e contador do `01`; `scripts/parsers.mjs` portado com os testes passando.
2. **Modelo e regras** — models, migrations com RLS, sequência de código, posições, fluxo de status, projeto inicial. → `references/02-modelo.md`
   - *Pronto quando*: **todos** os models do `02` (projetos e membros, status com categoria, tarefas com código sequencial, subtarefas, checklist, vínculos, comentários, reações, histórico, seguidores, sprints, horas, notificações) com RLS `FORCE` e as travas de mesma empresa.
3. **API de projetos e tarefas** — CRUD, quadro, filtros, minhas tarefas, edição em massa, descrição com versão, subtarefas, checklist, vínculos, lixeira, busca. → `references/03-api.md`
   - *Pronto quando*: quadro, lista, calendário e minhas tarefas servidos pela API com os filtros do `03`; código `MKT-123` sem repetir; subtarefas, checklist, vínculos, lixeira e edição em massa funcionando; descrição com versão (409 em conflito).
4. **Colaboração** — comentários, reações, histórico, seguidores, notificações (sino, e-mail, resumo diário, lembretes de prazo). → `references/03-api.md`
   - *Pronto quando*: comentário com @menção gera notificação para o mencionado; o histórico registra cada mudança de campo; seguidores recebem os avisos; e-mail imediato e resumo diário.
5. **Anexos e horas** — anexos via `uploads`; cronômetro, lançamento manual, folha de horas, exportação. → `references/03-api.md`
   - *Pronto quando*: cronômetro no servidor (um ativo por pessoa, sobrevive a recarregar), lançamento manual, folha de horas e exportação; anexos pelo `uploads`.
6. **Sprints e relatórios** — planejar, iniciar, concluir com resumo, burndown, velocidade, carga, atrasos. → `references/03-api.md`
   - *Pronto quando*: sprint planejar → iniciar → concluir com resumo (o que não terminou vai para o backlog ou a próxima sprint), burndown e velocidade.
7. **Telas** — seção de tarefas, projetos, visões (quadro, lista, calendário, backlog, minhas tarefas), detalhe da tarefa, horas, notificações, configurações do projeto. → `references/04-telas.md`
   - *Pronto quando*: todas as telas do `04` completas — quadro com arrastar, lista, calendário, backlog, minhas tarefas, horas e o **painel da tarefa** com descrição, subtarefas, checklist, vínculos, anexos, horas, comentários e histórico —, com todos os testids da seção "Contrato testável".
8. **Interações e estados** — adição rápida com atalhos, atalhos de teclado, arrastar e soltar, edição em massa, otimismo e desfazer, todos os estados de carregamento/vazio/erro. → `references/05-interacoes-e-estados.md`
   - *Pronto quando*: adição rápida com os atalhos (`@pessoa`, `!prioridade`, datas, `#etiqueta`), atalhos de teclado, arrastar, massa, otimismo com desfazer e todos os estados do `05`.
9. **Fechamento do núcleo** — `references/06-checklist.md`, testes ponta a ponta, `/rodsaas:verify` (tem uma parte só do Tarefas: `-g "Tarefas"`; ela exige os testids da seção "Contrato testável" de `04-telas.md` e os formatos ★ de `03-api.md`), README do projeto.
10. **Operação avançada** — recorrência, modelos, campos personalizados, Gantt com dependências, automações, carga por pessoa, cliente convidado que aprova. → `references/07-operacao-avancada.md`
   - *Pronto quando*: concluir a recorrente cria a próxima no dia útil certo uma vez só; modelo aplicado com datas, vínculos, checklist e subtarefas; campos validados e obrigatório cobrado ao concluir; Gantt com ciclo recusado, cascata com folga e caminho crítico; automações com histórico e profundidade 3; carga com capacidade e feriados; convidado vê só o que é dele, aprova ou pede ajustes.
11. **Perfis de segmento** — escritório contábil (obrigações com prazo legal), agência (horas → Financeiro), obras (checklist com foto). → `references/08-perfis-de-segmento.md`
   - *Pronto quando*: perfil liga o que pede sem desligar nada; obrigações do mês geradas com prazo legal e folga, idempotentes, painel com atrasadas; horas arredondadas faturadas no Financeiro uma vez só; item com foto obrigatória e conclusão que exige o checklist. Feche com `/rodsaas:verify -g "Tarefas"` (inclui `34-tarefas-operacao.spec.ts`).

## Princípios

- **Soma, não substitui.** Nenhum arquivo da casca é reescrito; o preset registra o app dele (`config/apps.ts`) e a casca de apps faz o resto: o menu do Tarefas nunca se mistura com o de outro app.
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
| `references/07-operacao-avancada.md` | Fase 10 — recorrência, modelos, campos, Gantt, automações, carga, convidado |
| `references/08-perfis-de-segmento.md` | Fase 11 — contábil, agência, obras |
| `scripts/parsers.mjs` | adição rápida e duração de horas (porte para TS com os testes) |
| `scripts/tarefas-lib.mjs` + `tarefas-lib.test.mjs` | regras puras (dia útil, recorrência, modelos, campos, ciclo/cascata/caminho crítico, automações, carga, aprovação, obrigações, horas faturáveis, checklist com foto, perfis): porte para TS com os testes |
