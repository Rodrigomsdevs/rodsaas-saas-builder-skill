# Stack e versões

## Como descobrir a versão atual

```bash
npm view next version
npm view tailwindcss version
npm view @tanstack/react-query version
# ...um por pacote
```

E leia a doc oficial da versão que vai instalar. Nunca configure de memória.

## Criação do projeto

- Crie com o `create-next-app` atual (confira as flags na doc): TypeScript, App Router, Tailwind, `src/`, alias `@/*`, sem ESLint (usamos Biome).
- Rode o `init` atual do shadcn/ui e adicione os componentes abaixo.
- Node: a mesma LTS do backend (`.nvmrc`).

## Pacotes

### Produção
| Pacote | Para quê | Atenção na doc atual |
|---|---|---|
| `next`, `react`, `react-dom` | framework | APIs assíncronas (`cookies()`, `params`, `searchParams`); nome do arquivo de middleware/proxy |
| `tailwindcss` (+ plugin PostCSS da versão) | estilo | v4: config no CSS, sem `tailwind.config.js` |
| shadcn/ui (via CLI) | componentes | variáveis de tema e lista de componentes |
| `@tanstack/react-query` (+ devtools em dev) | dados | — |
| `openapi-fetch` | client HTTP tipado | API de middleware |
| `react-hook-form`, `@hookform/resolvers`, `zod` | formulários | resolver compatível com a versão do Zod |
| `nuqs` | estado na URL | adapter do Next App Router |
| `next-themes` | claro/escuro | — |
| `sonner` | toasts (vem com o shadcn) | — |
| `lucide-react` | ícones | — |
| `date-fns` | datas (locale `ptBR`) | — |
| `recharts` | gráficos (via componente chart do shadcn) | só se a tela usar |

### Desenvolvimento
| Pacote | Para quê |
|---|---|
| `openapi-typescript` | gera `src/lib/api/schema.d.ts` do `openapi.json` |
| `@biomejs/biome` | lint + format |
| `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` | testes de componente |
| `@playwright/test` | testes ponta a ponta dos fluxos principais |

## Componentes shadcn a adicionar

`button`, `input`, `label`, `textarea`, `select`, `checkbox`, `switch`, `radio-group`, `form` (se existir na versão), `card`, `badge`, `avatar`, `separator`, `skeleton`, `table`, `dialog`, `alert-dialog`, `sheet`, `drawer`, `dropdown-menu`, `popover`, `command`, `tooltip`, `tabs`, `sonner`, `sidebar`, `breadcrumb`, `progress`, `calendar`, `chart` (se usar gráficos).

Componentes do shadcn são código do projeto: ajuste à vontade, mas mantenha o visual vindo dos tokens (nada de cor fixa).

## Scripts do package.json

| Script | Faz |
|---|---|
| `dev` | `next dev` (porta 3000) |
| `build` / `start` | build e produção |
| `typecheck` | `tsc --noEmit` |
| `lint` / `format` | Biome |
| `test` | Vitest |
| `test:e2e` | Playwright |
| `api:types` | `openapi-typescript ../api/openapi.json -o src/lib/api/schema.d.ts` |
| `brand` | `node <skill>/scripts/brand.mjs ../rodsaas.json --css src/styles/theme.css` (copie o script para `web/scripts/brand.mjs` para o projeto não depender do plugin instalado) |

`api:types` roda depois de todo `openapi:export` do backend. Se o tipo gerado mudou e algo quebrou, conserte o front; não edite o arquivo gerado.

## Variáveis de ambiente (`web/.env.example`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3333
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Nada secreto no front: tudo com `NEXT_PUBLIC_` vai para o navegador.
