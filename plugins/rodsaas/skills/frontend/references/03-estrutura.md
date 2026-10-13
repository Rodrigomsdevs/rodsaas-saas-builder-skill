# Estrutura do projeto

## Árvore

```
web/
├── public/
│   └── logo.svg
├── scripts/
│   └── brand.mjs                    # cópia do script de tema (o projeto não depende do plugin)
├── src/
│   ├── app/
│   │   ├── layout.tsx               # html, fontes, providers, Toaster
│   │   ├── not-found.tsx            # 404 global (fora do app logado)
│   │   ├── global-error.tsx         # quebra do layout raiz
│   │   ├── icon.svg / apple-icon.png
│   │   ├── (auth)/
│   │   │   ├── layout.tsx           # tela dividida: marca à esquerda, formulário à direita
│   │   │   ├── entrar/page.tsx
│   │   │   ├── cadastro/page.tsx
│   │   │   ├── esqueci-senha/page.tsx
│   │   │   ├── redefinir-senha/page.tsx
│   │   │   ├── verificar-email/page.tsx
│   │   │   └── convite/page.tsx     # ?token=
│   │   └── (app)/
│   │       ├── layout.tsx           # casca de apps (12-casca-e-apps.md): trilho, menu do app, topo, banners
│   │       ├── loading.tsx          # skeleton genérico da casca
│   │       ├── error.tsx            # erro dentro do app (mantém a casca)
│   │       ├── not-found.tsx        # 404 dentro do app (mantém a casca)
│   │       ├── inicio/page.tsx
│   │       ├── sem-empresa/page.tsx # usuário sem organização ativa
│   │       ├── projetos/
│   │       │   ├── page.tsx         # lista
│   │       │   ├── loading.tsx
│   │       │   └── [id]/page.tsx    # detalhe
│   │       ├── configuracoes/
│   │       │   ├── layout.tsx       # abas laterais
│   │       │   ├── empresa/page.tsx
│   │       │   ├── membros/page.tsx
│   │       │   ├── plano/page.tsx
│   │       │   ├── apps/page.tsx    # apps da empresa + meu trilho
│   │       │   └── atividade/page.tsx
│   │       └── perfil/page.tsx
│   ├── components/
│   │   ├── ui/                      # shadcn (gerados, ajustáveis)
│   │   └── app/                     # componentes do produto
│   │       ├── shell/               # casca de apps
│   │       │   ├── app-shell.tsx        # escolhe modo clássico × trilho, desktop × celular
│   │       │   ├── app-rail.tsx         # trilho
│   │       │   ├── app-sidebar.tsx      # coluna do menu do app (e menu clássico)
│   │       │   ├── app-flyout.tsx       # menu flutuante (recolhido + mouse por cima)
│   │       │   ├── app-launcher.tsx     # "Todos os apps"
│   │       │   ├── mobile-topbar.tsx
│   │       │   ├── mobile-tabbar.tsx
│   │       │   ├── mobile-drawer.tsx
│   │       │   └── sidebar-blocks.tsx   # SidebarSection, SidebarItem, SidebarTree
│   │       ├── app-topbar.tsx
│   │       ├── org-switcher.tsx
│   │       ├── user-menu.tsx
│   │       ├── global-banners.tsx
│   │       ├── logo.tsx
│   │       ├── page-header.tsx
│   │       ├── empty-state.tsx
│   │       ├── error-state.tsx
│   │       ├── loading-button.tsx
│   │       ├── confirm-dialog.tsx
│   │       ├── form-sheet.tsx
│   │       ├── data-table/          # tabela, toolbar, paginação, skeleton, versão mobile
│   │       ├── plan-gate.tsx        # selo "Pro" + bloqueio de feature
│   │       ├── upgrade-dialog.tsx
│   │       ├── can.tsx              # mostra filhos se o papel permitir
│   │       └── theme-toggle.tsx
│   ├── features/                    # um diretório por módulo da API (cada app tem features/<app>/app.tsx)
│   │   ├── auth/
│   │   ├── session/                 # useSession, troca de empresa
│   │   ├── organizations/
│   │   ├── members/
│   │   ├── invitations/
│   │   ├── billing/
│   │   ├── audit/
│   │   ├── apps/                    # useApps(), fixados, apps desligados, última rota por app
│   │   ├── cadastros/app.tsx        # AppDef do app Cadastros (lista os módulos)
│   │   └── projects/                # módulo de exemplo (molde)
│   │       ├── api.ts               # query keys + hooks (useProjects, useCreateProject…)
│   │       ├── schemas.ts           # Zod dos formulários
│   │       ├── columns.tsx          # colunas da DataTable
│   │       └── components/          # project-form.tsx, project-card.tsx…
│   ├── lib/
│   │   ├── api/
│   │   │   ├── schema.d.ts          # GERADO do openapi.json — não editar
│   │   │   ├── client.ts            # openapi-fetch + cookies + refresh + idempotência
│   │   │   ├── errors.ts            # ApiError
│   │   │   └── error-messages.ts    # code → mensagem pt-BR
│   │   ├── query-client.ts
│   │   ├── format.ts                # datas, moeda, números, relativo
│   │   ├── masks.ts                 # CPF, CNPJ, telefone, CEP, moeda (+ validação de dígitos)
│   │   └── utils.ts                 # cn() do shadcn
│   ├── config/
│   │   ├── product.ts               # nome, tenantLabel e concordância (de rodsaas.json)
│   │   ├── apps.ts                  # registro de apps (12-casca-e-apps.md)
│   │   ├── settings-navigation.ts   # abas de Configurações (com papel/feature exigidos)
│   │   └── ui.ts                    # densidade: alturas de controle e de linha
│   ├── styles/
│   │   ├── globals.css              # tailwind + base shadcn + import do theme.css
│   │   └── theme.css                # GERADO pelo brand.mjs — não editar
│   ├── providers.tsx                # QueryClient, nuqs, next-themes
│   └── middleware.ts                # guard de rota (ou proxy.ts, conforme a versão do Next)
├── e2e/                             # Playwright
├── .env.example
├── biome.json
└── README.md
```

## Rotas

URLs em **português** (o usuário vê), código em **inglês**.

| Rota | Acesso |
|---|---|
| `/entrar`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha`, `/verificar-email`, `/convite` | pública; logado em `/entrar` ou `/cadastro` → `/inicio` |
| `/` | redireciona: logado → `/inicio`, deslogado → `/entrar` |
| `/inicio`, `/projetos`, `/configuracoes/*` (inclui `/configuracoes/apps`), `/perfil` | logado com empresa ativa |
| `/sem-empresa` | logado sem empresa ativa |

## Convenções

- Arquivos em kebab-case; componentes em PascalCase.
- Uma feature não importa os componentes internos de outra; o que for compartilhado sobe para `components/app` ou `lib`.
- Páginas são finas: montam `PageHeader` + componentes da feature. Lógica de dados fica nos hooks de `features/*/api.ts`.
- Nada de `fetch` solto: toda chamada passa pelo client de `lib/api/client.ts`.
- Nada de cor fixa (`#...`, `bg-blue-500`): só tokens (`bg-primary`, `text-muted-foreground`, `bg-success/15`).
- Textos com o nome do tenant sempre via `config/product.ts`.

## Apps e configurações

O menu é montado pelo **registro de apps** (`config/apps.ts`), descrito em `12-casca-e-apps.md`. O projeto nasce com um app só (**Cadastros**, com o módulo de exemplo), então começa no menu clássico; o trilho aparece quando o segundo app é registrado.

```ts
// features/cadastros/app.tsx
export const cadastrosApp: AppDef = {
  id: 'cadastros', name: 'Cadastros', description: 'Cadastros e módulos da empresa',
  icon: Database, category: 'geral', order: 0, defaultPinned: true,
  match: ['/projetos'],                 // o /rodsaas:module acrescenta a rota de cada módulo novo
  home: '/projetos',
  Sidebar: CadastrosSidebar,            // SidebarItem por módulo: { label: 'Projetos', href: '/projetos', icon: FolderKanban }
}

// config/settings-navigation.ts (abas de Configurações)
export const settingsNavigation = [
  { label: tenant.settingsTitle, href: '/configuracoes/empresa', icon: Building2, roles: ['OWNER', 'ADMIN'] },
  { label: 'Membros', href: '/configuracoes/membros', icon: Users },
  { label: 'Plano e cobrança', href: '/configuracoes/plano', icon: CreditCard, roles: ['OWNER', 'ADMIN'] },
  { label: 'Apps', href: '/configuracoes/apps', icon: LayoutGrid },
  { label: 'Atividade', href: '/configuracoes/atividade', icon: History, feature: 'audit_log' },
  // apps com `settings` acrescentam a aba deles aqui, lida do registro
] satisfies NavItem[]
```

Item com `roles` some para quem não tem o papel; item com `feature` aparece com selo do plano que libera.
