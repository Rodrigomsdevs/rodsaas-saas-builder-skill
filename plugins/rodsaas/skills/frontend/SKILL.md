---
name: frontend
description: Cria o frontend/dashboard de um SaaS B2B no padrão rodsaas — Next.js (App Router) + Tailwind + shadcn/ui + TanStack Query, ligado à API do /rodsaas:backend por um client tipado gerado do OpenAPI. Pergunta a identidade visual (nome, cor, logo, estilo), mostra uma prévia e gera login, cadastro, convites, seletor de empresa, configurações, membros, plano/Stripe, home e o módulo de exemplo, com todos os estados (loading, vazio, erro, 404) e detalhes de UX prontos. Use sempre que o usuário pedir para criar o frontend, o dashboard, o painel, as telas ou a interface de um SaaS rodsaas, ou chamar /rodsaas:frontend.
---

# rodsaas · frontend

Esta skill gera a pasta `web/` de um SaaS B2B: o painel logado completo, conversando com a API gerada pelo `/rodsaas:backend`. Ao final, o usuário consegue se cadastrar, entrar, convidar a equipe, trocar de empresa, assinar um plano e usar o módulo de exemplo, tudo com a cara do produto dele.

O frontend é **sem nicho**: entrega a casca que todo SaaS B2B precisa e as peças (tabela, formulário, drawer, kanban, cards de indicador) com que qualquer nicho é montado depois. O que faz parecer "feito para aquele ramo" vem da marca e do vocabulário (`tenantLabel`: Empresa, Clínica, Loja…), não de telas específicas.

## Stack fixa

| Camada | Escolha |
|---|---|
| Framework | Next.js (App Router) + React + TypeScript strict |
| Estilo | Tailwind CSS + shadcn/ui (componentes copiados para o projeto) |
| Dados | TanStack Query no navegador, client tipado gerado do `openapi.json` da API (`openapi-typescript` + `openapi-fetch`) |
| Formulários | React Hook Form + Zod |
| Estado na URL | `nuqs` (filtros, busca, ordenação, cursor) |
| Feedback | sonner (toasts), skeletons do shadcn |
| Tema | `next-themes` (claro/escuro/sistema) + tokens gerados da marca |
| Ícones | lucide-react |
| Datas | date-fns com locale pt-BR |
| Testes | Vitest + Testing Library; Playwright para os fluxos principais |
| Lint/format | Biome |

A área logada busca dados **no navegador** (TanStack Query), não em Server Components: é um painel interativo, sem SEO, e o refresh do token fica num lugar só. Server Components ficam para layout estático e para o guard de rota. Não misture os dois para a mesma tela.

## Regra de versões: sempre a mais recente, nunca de memória

Mesma regra do backend. Antes de criar o projeto e antes de cada pacote: `npm view <pacote> version` e a documentação oficial atual (Context7 se disponível, senão WebFetch). Atenção especial a:

- **Next.js** — flags do `create-next-app`, nome e local do arquivo de middleware/proxy, APIs de `cookies()`/`searchParams` (assíncronas em versões recentes).
- **Tailwind** — a v4 configura no CSS (`@import "tailwindcss"`, `@theme`), sem `tailwind.config.js`. Modelos costumam gerar o setup antigo; não gere.
- **shadcn/ui** — comando de `init`, nomes das variáveis de tema e quais componentes existem.
- **openapi-fetch** — API de middleware (usada no refresh do token).

Se a doc atual contradiz um exemplo desta skill, a doc vence; anote no relatório final.

## Antes de começar

1. **Precisa do backend.** Procure `api/` com `openapi.json` (ou o script `openapi:export` para gerá-lo). Sem backend, pare e sugira `/rodsaas:backend` primeiro: o front é gerado a partir do contrato da API.
2. Leia o **`rodsaas.json`** na raiz do projeto, se existir (o backend cria com nome, portas e domínios). As respostas de marca vão para ele. O front roda em `ports.web` e fala com a API em `domains.api`.

## Fases

Cada fase termina com `tsc --noEmit`, `biome check`, `next build` e testes da fase passando, mais um commit (`feat(web): ...`). Não avance com fase quebrada. Mostre o progresso na lista de tarefas.

### Fase 1 — Marca e prévia
Pergunte a identidade visual, grave em `rodsaas.json`, gere os tokens com `scripts/brand.mjs` e mostre a prévia. **Espere a aprovação** antes da Fase 2 (se ninguém estiver acompanhando, siga com o que foi respondido e registre isso no topo do trabalho).
→ `references/02-marca.md`

### Fase 2 — Base do projeto
Next.js, Tailwind, shadcn/ui com os componentes da lista, tema gerado, fontes do estilo, `next-themes`, Biome, Vitest, env (`NEXT_PUBLIC_API_URL`), utilitários de formatação e máscaras BR.
→ `references/01-stack-e-versoes.md`, `references/03-estrutura.md`

### Fase 3 — API e sessão
Tipos gerados do OpenAPI, client com cookies + refresh único + `Idempotency-Key`, `ApiError` e mensagens por `code`, QueryClient, providers, guard de rota, sessão (`/v1/me`), troca de empresa.
→ `references/04-api-e-sessao.md`

### Fase 4 — Casca e componentes do app
Layout logado (menu lateral, topo, seletor de empresa, menu do usuário, banners), `not-found`/`error`/`global-error`/`loading`, e os componentes base: `PageHeader`, `EmptyState`, `LoadingButton`, `ConfirmDialog`, `FormSheet`, `DataTable`, `PlanGate`/`UpgradeDialog`, `Can`.
→ `references/05-estados-e-feedback.md`, `references/07-tabelas.md`, `references/08-overlays.md`

### Fase 5 — Telas de autenticação
Login, cadastro, esqueci/redefinir senha, verificar e-mail, aceitar convite, "sem empresa".
→ `references/06-formularios.md`, `references/09-telas.md`

### Fase 6 — Home e configurações
Home com dados reais (primeiros passos, uso do plano, atividade recente), configurações da empresa, membros, convites, plano e cobrança (Stripe), perfil.
→ `references/09-telas.md`

### Fase 7 — Módulo de exemplo
Telas do `projects` (lista, detalhe, criar/editar em drawer, excluir com confirmação, limite de plano → upgrade). É o **molde** que a skill de módulos vai copiar: simples, completo, sem atalhos.
→ `references/09-telas.md`, `references/07-tabelas.md`

### Fase 8 — Fechamento e verificação
Checklist de `references/10-checklist.md` item a item, README do `web/`, e então **a verificação obrigatória**: com API, front e Mailpit rodando, siga a skill **`/rodsaas:verify`** (leia o `SKILL.md` dela). Ela audita o contrato e roda a bateria de testes no navegador (cadastro, login, sessão, criar e trocar de empresa, convites, papéis, estados, plano, celular). **O frontend só está pronto com a bateria 100% verde**; falhou, corrija o projeto e rode de novo.

## Contrato testável (desde a Fase 4)

Todo elemento-chave recebe o `data-testid` definido em `skills/verify/references/contrato.md` (lista em `skills/verify/contract.json`): campos e botões de login/cadastro/convite, casca (`app-shell`, `org-switcher`, `org-switcher-current`, `user-menu`…), estados (`page-not-found`, `error-state`, `empty-state`, `skeleton`…), membros, plano e o módulo de exemplo. As rotas e os formatos da API do contrato também são fixos. Coloque os testids **ao criar** cada componente, não no fim. `LoadingButton` fica `disabled` + `aria-busy="true"` durante a ação; `ErrorState` mostra o `requestId` em `error-request-id`.

## Princípios

- **Todo estado tem tela.** Carregando, vazio, vazio por filtro, erro, sem permissão, não encontrado. Se você criou um bloco que busca dado e não tratou os quatro primeiros, não terminou.
- **Toda ação tem feedback.** Botão com loading e sem clique duplo, toast de resultado, erro traduzido pelo `code` da API, confirmação no que destrói.
- **O backend é a fonte da verdade.** Esconder um botão por papel ou plano é usabilidade; a segurança é da API. Nunca duplique regra de negócio no front além do necessário para a experiência.
- **A URL guarda o estado da tela.** Filtros, busca, ordenação e página vão para a URL: link compartilhável e botão voltar funcionando.
- **Tipos vêm do contrato.** Nada de declarar à mão o formato de resposta da API; tudo sai do `openapi.json`. Mudou a API, regenera os tipos e o compilador aponta o que quebrou.
- **Marca em um arquivo só.** Cores, raio, nome e vocabulário vêm de `rodsaas.json` / tema gerado. Nenhuma cor hexadecimal solta em componente.
- **Português do Brasil de verdade.** Textos naturais, datas e moeda no formato BR, e concordância com o `tenantLabel` (feminino/masculino).

## Relatório final

Mensagem curta com: como subir (`npm run dev` no `web/` com a API rodando), URL local, o que ficou a configurar (domínios, Stripe no painel, logo definitivo), desvios da skill por mudança de versão, e o próximo passo natural (criar o primeiro módulo do produto).

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-stack-e-versoes.md` | Fase 2, antes de instalar |
| `references/02-marca.md` | Fase 1 — perguntas, `rodsaas.json`, script de tema, prévia |
| `references/03-estrutura.md` | Fase 2 — pastas, rotas, convenções |
| `references/04-api-e-sessao.md` | Fase 3 — client, refresh, erros, QueryClient, guard |
| `references/05-estados-e-feedback.md` | Fase 4 e sempre — loading, vazio, erro, toasts, botões, banners |
| `references/06-formularios.md` | Fase 5 em diante — RHF + Zod, erros da API, máscaras BR |
| `references/07-tabelas.md` | Fase 4 e 7 — DataTable, URL, cursor, mobile |
| `references/08-overlays.md` | Fase 4 — dialog, drawer, confirmação, upgrade |
| `references/09-telas.md` | Fases 5 a 7 — o que cada tela tem |
| `references/10-checklist.md` | Fase 8 |
| `skills/verify/references/contrato.md` | desde a Fase 4 — data-testid, rotas e formatos fixos |
