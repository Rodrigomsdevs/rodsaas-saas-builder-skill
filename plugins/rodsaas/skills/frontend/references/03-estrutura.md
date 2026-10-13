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
│   │       ├── layout.tsx           # casca: menu lateral, topo, banners
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
│   │       │   └── atividade/page.tsx
│   │       └── perfil/page.tsx
│   ├── components/
│   │   ├── ui/                      # shadcn (gerados, ajustáveis)
│   │   └── app/                     # componentes do produto
│   │       ├── app-sidebar.tsx
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
│   ├── features/                    # um diretório por módulo da API
│   │   ├── auth/
│   │   ├── session/                 # useSession, troca de empresa
│   │   ├── organizations/
│   │   ├── members/
│   │   ├── invitations/
│   │   ├── billing/
│   │   ├── audit/
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
│   │   ├── navigation.ts            # itens do menu lateral (com papel/feature exigidos)
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
| `/inicio`, `/projetos`, `/configuracoes/*`, `/perfil` | logado com empresa ativa |
| `/sem-empresa` | logado sem empresa ativa |

## Convenções

- Arquivos em kebab-case; componentes em PascalCase.
- Uma feature não importa os componentes internos de outra; o que for compartilhado sobe para `components/app` ou `lib`.
- Páginas são finas: montam `PageHeader` + componentes da feature. Lógica de dados fica nos hooks de `features/*/api.ts`.
- Nada de `fetch` solto: toda chamada passa pelo client de `lib/api/client.ts`.
- Nada de cor fixa (`#...`, `bg-blue-500`): só tokens (`bg-primary`, `text-muted-foreground`, `bg-success/15`).
- Textos com o nome do tenant sempre via `config/product.ts`.

## Menu lateral (`config/navigation.ts`)

```ts
export const navigation = [
  { label: 'Início', href: '/inicio', icon: Home },
  { label: 'Projetos', href: '/projetos', icon: FolderKanban },
  // módulos novos entram aqui
] satisfies NavItem[]

export const settingsNavigation = [
  { label: tenant.settingsTitle, href: '/configuracoes/empresa', icon: Building2, roles: ['OWNER', 'ADMIN'] },
  { label: 'Membros', href: '/configuracoes/membros', icon: Users },
  { label: 'Plano e cobrança', href: '/configuracoes/plano', icon: CreditCard, roles: ['OWNER', 'ADMIN'] },
  { label: 'Atividade', href: '/configuracoes/atividade', icon: History, feature: 'audit_log' },
] satisfies NavItem[]
```

Item com `roles` some para quem não tem o papel; item com `feature` aparece com selo do plano que libera.
