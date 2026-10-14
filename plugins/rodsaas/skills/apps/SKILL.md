---
name: apps
description: Atualiza um projeto rodsaas já gerado para a casca de apps (trilho de apps + menu do app, como no simulador) — converte o menu lateral antigo (lista ou seções misturadas de presets) num registro de apps, transforma o preset notion no app Páginas em /paginas, registra Tarefas, CRM e os cadastros do /rodsaas:module como apps, acrescenta no backend os apps desligados pela empresa e os fixados por usuário, cria Configurações → Apps e roda o /rodsaas:verify. Use quando o usuário pedir para atualizar o menu/sidebar para o modelo novo, colocar o trilho de apps, a sidebar estiver confusa misturando módulos, ou chamar /rodsaas:apps. Rodar de novo num projeto já convertido só confere e corrige.
---

# rodsaas · apps

Leva um projeto gerado antes do modelo de apps para a casca nova, sem gerar nada do zero e sem perder telas. A especificação da casca é a da skill `frontend`:

- `skills/frontend/references/12-casca-e-apps.md`: o que construir (leia inteiro antes de começar);
- `skills/frontend/assets/simulador-navegacao.html`: abra no navegador, é a referência de comportamento;
- `skills/backend/references/05-multi-tenant.md` (seção "Apps da interface") e `04-auth.md` (formato do `/v1/me`): o que muda na API.

(Sem `CLAUDE_PLUGIN_ROOT`, use o caminho do repositório das skills. Fora do Claude Code, no Gemini ou no ChatGPT, peça: "siga a skill apps do rodsaas".)

## 0. Antes de mexer

1. Projeto com `api/`, `web/` e `rodsaas.json`. Rode typecheck, lint, build e testes de `api/` e `web/` e anote o que **já** estava vermelho (não é culpa da migração, mas precisa ser dito no relatório).
2. Se for um repositório git: confira que não há alterações pendentes e trabalhe num branch (`rodsaas/apps`). Commit por fase (`refactor(web): casca de apps …`).
3. Projeto que já está no modelo novo (existe `web/src/config/apps.ts` com `AppDef`): pule para a fase 5 (conferência).

## 1. Diagnóstico (não altera nada)

Levante e mostre ao usuário, numa tabela curta, **o que vira cada app**:

| Procure | O que significa |
|---|---|
| `web/src/config/navigation.ts` como lista simples | base antiga: os itens viram o app **Cadastros** (módulo de exemplo e módulos do `/rodsaas:module`) |
| `navigation.ts` com `navigationSections` (seções `base`, `tarefas`, `crm`…) | cada seção de preset vira o app dele; a seção `base` vira Cadastros |
| `rodsaas.json → presets` | `notion` → app **Páginas**; `tarefas` → **Tarefas**; `crm` → **CRM** |
| casca do notion (`app-sidebar` com árvore de páginas, rotas `/pagina/[id]`, Início com recentes) | a árvore vira o menu do app Páginas; rotas vão para `/paginas` |
| `config/home-widgets.ts`, `config/search-providers.ts`, `topbarItems` | widgets e provedores passam para o `AppDef` de cada app; `topbarItems` continua como ponto de extensão do topo |
| `features/notifications`, sino no topo | o sino vai para o trilho; se o módulo de notificações foi criado por um preset (sem `notificacoes` em `rodsaas.json → addons`), registre para depois o `/rodsaas:notificacoes` em modo revisão |
| itens de configurações dentro do menu | viram `config/settings-navigation.ts` (abas de Configurações) |

Pergunte **só** se algum item do menu não tiver dono claro (ex.: uma tela solta que tanto pode ser um cadastro quanto parte do CRM). O resto segue a tabela. Se ninguém estiver acompanhando, use os padrões e registre no topo do relatório.

## 2. Backend

Seguindo `skills/backend/references/05-multi-tenant.md`, seção "Apps da interface":

1. Migration (com `prisma migrate dev --create-only`, revisada): `Organization.disabledApps String[] @default([])` e `Membership.pinnedApps Json?`.
2. `GET /v1/me`: `organization.disabledApps` e `preferences: { pinnedApps }` (da membership da organização ativa).
3. `PATCH /v1/organizations/current` aceita `disabledApps` (owner/admin; ids `^[a-z0-9-]{2,40}$`, até 100, sem repetidos, nunca `inicio`).
4. `PUT /v1/me/preferences { pinnedApps: string[] | null }` (todos; grava na membership da organização ativa).
5. Testes de `09-testes-e-checklist.md` (itens de `disabledApps` e preferências), `openapi:export` e, no `web/`, `api:types`.

## 3. Casca de apps no front

Construa a casca de `12-casca-e-apps.md`, reaproveitando o que existe (`OrgSwitcher`, `UserMenu`, `ThemeToggle`, banners, Ctrl+K, sino):

1. Tipos e registro: `config/apps.ts`, `features/apps/` (`useApps`, fixados com `PUT /v1/me/preferences`, apps desligados, última rota por app) e os blocos `SidebarSection`/`SidebarItem`/`SidebarTree`.
2. Componentes em `components/app/shell/`: `app-shell` (modo clássico × trilho, desktop × celular), `app-rail`, `app-sidebar`, `app-flyout`, `app-launcher`, `mobile-topbar`, `mobile-tabbar`, `mobile-drawer`. Desktop e celular renderizam peças diferentes (nada de testid repetido no DOM).
3. `(app)/layout.tsx` passa a usar o `AppShell`. O topo fica com breadcrumb, `topbarItems`, busca e `theme-toggle`.
4. `/configuracoes/apps` (apps da empresa + meu trilho) e `config/settings-navigation.ts`.
5. Início global: "Visão geral" com os blocos da base + os `widgets` de cada app; menu do Início com "Seus apps".
6. Apague `config/navigation.ts` (e `home-widgets.ts`/`search-providers.ts`, se viraram derivados) **só depois** que todos os itens tiverem sido levados para algum app. Confira com `grep` que nada mais importa esses arquivos.

## 4. Converter cada app

Faça um por vez, com commit e build verde entre eles.

- **Cadastros** (`features/cadastros/app.tsx`): um `SidebarItem` por módulo que estava no menu da base (Projetos e os do `/rodsaas:module`), com o mesmo rótulo, ícone e `roles`; `match` com a rota de cada um; `home` = a primeira. Sem nenhum módulo (ex.: notion removeu o `projects`), o app Cadastros não entra no registro.
- **Tarefas**: o conteúdo de `TasksSidebarSection` vira `TasksSidebar` do `tarefasApp` (`skills/tarefas/references/01-escopo-e-integracao.md`, seção 2); widgets "Minhas tarefas de hoje", "Atrasadas" e "Sprint ativa" e o provedor de busca entram no `AppDef`; contador de atrasadas em `useBadge`; o cronômetro continua em `topbarItems`.
- **CRM**: o mesmo com o `crmApp` (`skills/crm/references/01-escopo-e-integracao.md`, item 2), incluindo `settings` (Configurações do CRM).
- **Páginas** (notion, `skills/notion/references/04-frontend.md`):
  1. mova `app/(app)/pagina/[id]` para `app/(app)/paginas/[id]` e crie `app/(app)/pagina/[id]/page.tsx` que só faz `redirect('/paginas/<id>')` (links antigos e conteúdo salvo continuam abrindo);
  2. o Início do notion (recentes e favoritos) vira a tela `/paginas`; o `/inicio` passa a ser o Início global, com os widgets "Páginas recentes" e "Favoritos" do `paginasApp`;
  3. a casca do notion (`app-sidebar` próprio) sai: a árvore, os favoritos, a busca e a lixeira viram o `PagesSidebar` do app; seletor de workspace, configurações e usuário passam a ser os do trilho;
  4. links internos gerados pelo editor passam a usar `/paginas/<id>`; a sanitização do backend aceita os dois formatos (`skills/notion/references/02-api.md`);
  5. o Ctrl+K próprio do notion vira o provedor `pagesSearchProvider` da busca global.
- **Outros presets** que existirem no projeto: o mesmo padrão (um `AppDef` em `features/<app>/app.tsx`, sem mexer no menu de outro app).

Grave `rodsaas.json → apps` com `[{ id, name, home }]` de cada app registrado.

## 5. Conferir

1. typecheck, lint, build e testes de `api/` e `web/` verdes (o que já estava vermelho na fase 0 fica registrado).
2. Na mão, com a API e o front rodando, comparando com o simulador: trocar de app pelo trilho; recolher com `[` e recarregar; menu flutuante com o mouse por cima; "Todos os apps" com busca e estrela; Configurações → Apps desligando e ligando um app; celular (gaveta e barra de apps); links antigos `/pagina/<id>` redirecionando.
3. **`/rodsaas:verify`** (leia o `SKILL.md` dele): a auditoria do contrato confere os testids novos da casca e a bateria tem a parte "Casca de apps". O trabalho só termina com tudo verde.

## Relatório final

Curto: a tabela "o que virou cada app", o que mudou na API (migration e rotas), rotas que mudaram de lugar (com redirecionamento), o resultado do `/rodsaas:verify`, o que já estava quebrado antes, e como desfazer (o branch, se houver).
