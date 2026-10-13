---
name: notion
description: Preset que soma a um projeto rodsaas o app Páginas, uma réplica do Notion — workspaces (as organizações do SaaS), árvore de páginas aninhadas com arrastar e soltar, editor de blocos com menu "/", autosave com controle de conflito, favoritos, recentes, lixeira, busca em todo o conteúdo (Ctrl+K), databases com visão de tabela e quadro (kanban) e páginas públicas por link. Use depois do /rodsaas:backend e do /rodsaas:frontend, quando o usuário pedir "réplica do Notion", "clone do Notion", "app de notas/documentos estilo Notion", ou chamar /rodsaas:notion.
---

# rodsaas · notion

Acrescenta a um projeto rodsaas (API em `api/`, painel em `web/`) o app **Páginas**, no estilo Notion, como mais um app da casca de apps (`skills/frontend/references/12-casca-e-apps.md`): ele não troca a casca nem o menu dos outros apps. Tudo o que a base já tem continua valendo e é reaproveitado: auth, multi-tenant com RLS, membros, convites, planos, Stripe, padrão REST, estados de tela, marca. O preset **acrescenta** o produto em cima.

| Na base rodsaas | No Notion |
|---|---|
| Organização (tenant) | **Workspace** |
| Membros, convites, papéis | membros do workspace |
| Planos e limites | limite de páginas, páginas públicas no plano pago |
| Módulo de exemplo `projects` | substituído pelo módulo `pages` (que vira o novo molde) |
| `FormSheet` (drawer lateral) | "side peek" para abrir linhas de database |
| `Command` (Ctrl+K) | busca em todo o workspace |

## Pré-requisitos

1. `api/` e `web/` gerados pelas skills `backend` e `frontend`, com typecheck, lint, build e testes **passando**. Se algo estiver quebrado, conserte antes: não empilhe o preset sobre uma base vermelha.
2. `rodsaas.json` na raiz.
3. Mesma regra de versões das outras skills: `npm view` + documentação atual antes de cada pacote novo (principalmente o editor de blocos e a lib de arrastar e soltar).

## Perguntas (uma rodada, com padrões)

- **Remover o módulo de exemplo `projects`?** Padrão: **sim**, se o projeto ainda só tiver o exemplo (API, tabela, telas, item no app Cadastros e limite de plano). Sem nenhum módulo, o app Cadastros sai do registro e o Páginas fica sendo o único app (menu clássico) até entrar outro.
- **Planos:** padrão `free` com 3 membros e 100 páginas; `pro` com 10 membros, páginas ilimitadas e a feature `public_pages`; `business` com 50 membros, ilimitado, `public_pages` e `audit_log`.
- **Nome do tenant:** padrão **manter o atual**. Se o Páginas for o produto principal (único app), sugira **Workspace** (masculino: "Novo workspace"). Grave em `rodsaas.json`.

## Fases

Cada fase termina com typecheck, lint, build, testes da fase passando e commit (`feat(notion): ...`). Não avance com fase quebrada. Use a lista de tarefas.

### Fase 1 — Ajustes de produto
`tenantLabel` (se mudou), planos novos em `config/plans.ts` (limite `pages`, feature `public_pages`), remoção do `projects` se confirmada (migration que remove a tabela, rotas, telas, item no app Cadastros, contador de uso), códigos de erro novos (`VERSION_CONFLICT`, `INVALID_MOVE`).
→ `references/01-escopo-e-modelo.md`

### Fase 2 — API de páginas
Models e migrations (com RLS), árvore, criar/editar/mover/duplicar, autosave com versão, lixeira, favoritos, recentes, busca em português, páginas iniciais criadas junto com cada workspace, testes.
→ `references/01-escopo-e-modelo.md`, `references/02-api.md`

### Fase 3 — API de databases
Propriedades tipadas, linhas (que são páginas), valores validados por tipo, visões de tabela e quadro com filtro/ordenação/agrupamento.
→ `references/02-api.md`

### Fase 4 — App Páginas na casca
Registro do app **Páginas** (`/paginas`) em `config/apps.ts`: menu do app com busca, favoritos, árvore de páginas com arrastar e soltar e lixeira; tela inicial do app com recentes; widgets no Início global. Projeto com menu antigo: rode antes o `/rodsaas:apps`.
→ `references/04-frontend.md`

### Fase 5 — Página e editor
Título, ícone, capa, breadcrumbs, editor de blocos com menu "/", atalhos markdown, arrastar blocos, autosave com indicador e tratamento de conflito.
→ `references/03-editor.md`

### Fase 6 — Databases no front
Visão de tabela editável, visão de quadro com arrastar entre colunas, nova propriedade, filtros/ordenação, abrir linha no side peek.
→ `references/04-frontend.md`

### Fase 7 — Compartilhamento público
Diálogo "Compartilhar" (link público liga/desliga, conforme o plano) e a página pública somente leitura.
→ `references/02-api.md`, `references/04-frontend.md`

### Fase 8 — Fechamento
Checklist de `references/05-checklist.md`, testes ponta a ponta, README do projeto atualizado.

## Princípios

- **A base não muda de regra.** RLS em toda tabela de conteúdo, `organizationId` vindo do token, schema de entrada e saída em toda rota, erros RFC 9457, estados de tela completos. O preset segue o padrão; não cria atalhos.
- **Nunca perder o que o usuário escreveu.** Autosave com debounce, salvamento ao sair da página, indicador de estado visível, conflito detectado por versão (nada de "o último que salvar vence" em silêncio).
- **Tudo é página.** Documento, linha de database e sub-página são o mesmo model. Isso mantém árvore, busca, lixeira, favoritos e compartilhamento funcionando para tudo, sem código duplicado.
- **Rápido como o Notion.** Atualização otimista na árvore, nos favoritos, nos cards do quadro e nas células; a interface não espera a API para reagir.
- **Fora do escopo da v1** (registre no README como próximos passos, não implemente pela metade): edição colaborativa em tempo real, comentários, histórico de versões, upload de arquivos, templates, integrações, permissões por página.

## Relatório final

O que foi criado, o que foi removido (`projects`), os planos novos, como testar (criar workspace → páginas iniciais → editar → database → compartilhar), o que ficou fora da v1, e qualquer desvio por mudança de versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-modelo.md` | Fases 1 e 2 — escopo, models, RLS, regras de árvore/lixeira/versão |
| `references/02-api.md` | Fases 2, 3 e 7 — todas as rotas, busca, databases, link público |
| `references/03-editor.md` | Fase 5 — editor de blocos, autosave, conflito, segurança do conteúdo |
| `references/04-frontend.md` | Fases 4, 6 e 7 — app Páginas na casca de apps, árvore, busca, lixeira, databases, página pública |
| `references/05-checklist.md` | Fase 8 |
