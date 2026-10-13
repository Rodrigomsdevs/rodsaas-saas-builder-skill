# Estrutura do projeto

## Árvore

```
api/
├── docker-compose.yml          # mailpit (dev) + postgres só se a máquina não tiver um
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── server.ts               # entrypoint: sobe o app, graceful shutdown
│   ├── app.ts                  # buildApp(): registra plugins e módulos (usado também nos testes)
│   ├── config/
│   │   ├── env.ts              # schema Zod das variáveis; falha no boot se faltar algo
│   │   └── plans.ts            # planos, limites e features
│   ├── lib/
│   │   ├── prisma.ts           # client da aplicação (usuário sem privilégios)
│   │   ├── tenant.ts           # withTenant()
│   │   ├── errors.ts           # AppError + subclasses + catálogo de códigos
│   │   ├── problem.ts          # schema Zod `Problem` (RFC 9457) usado nas respostas de erro
│   │   ├── pagination.ts       # schemas e helpers de cursor
│   │   ├── usage.ts            # contadores de uso para os limites de plano
│   │   ├── crypto.ts           # tokens aleatórios, sha256, argon2
│   │   ├── stripe.ts
│   │   ├── mailer.ts           # interface + SMTP
│   │   └── jobs.ts             # pg-boss
│   ├── plugins/
│   │   ├── request-context.ts  # request id, logger child
│   │   ├── security.ts         # helmet, cors, cookie, rate limit, checagem de Origin
│   │   ├── auth.ts             # authenticate (rota protegida por padrão)
│   │   ├── authorize.ts        # roles + revalidação de membership
│   │   ├── plan-guard.ts       # feature / limit
│   │   ├── idempotency.ts
│   │   ├── audit.ts
│   │   ├── error-handler.ts
│   │   └── docs.ts             # swagger + scalar
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── organizations/
│   │   ├── members/
│   │   ├── invitations/
│   │   ├── billing/
│   │   ├── audit/
│   │   ├── health/
│   │   └── projects/           # módulo de exemplo (molde)
│   └── types/
│       ├── fastify.d.ts        # request.auth, request.auditMeta, config de rota tipada
│       └── auth.ts             # Role, Auth, TenantAuth (orgId não nulo)
├── test/
│   ├── setup.ts                # banco de teste, reset entre testes
│   ├── factories.ts            # createUser, createOrg, loginAs...
│   └── security/               # testes de isolamento e auth
├── scripts/
│   └── export-openapi.ts       # gera openapi.json
├── .env.example
├── biome.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Anatomia de um módulo

```
modules/projects/
├── projects.routes.ts      # rotas + config (roles, limit, idempotent) + schemas
├── projects.schemas.ts     # Zod: entrada, saída, query
├── projects.service.ts     # regra de negócio; abre withTenant; lança AppError
├── projects.repository.ts  # só Prisma; recebe o tx; nunca decide regra
└── projects.test.ts
```

Regras:
- **Rota** não fala com Prisma. **Repository** não lança erro de negócio. **Service** é onde mora a regra.
- Um módulo não importa o repository de outro; se precisar, chame o service do outro.

## Convenções de nomes

| O quê | Padrão | Exemplo |
|---|---|---|
| Arquivos | kebab-case + sufixo do papel | `plan-guard.ts`, `members.service.ts` |
| Paths HTTP | `/v1/` + recurso plural kebab-case | `/v1/billing/checkout-sessions` |
| JSON | camelCase | `createdAt`, `organizationId` |
| Models Prisma | PascalCase singular | `Membership` |
| Códigos de erro | SCREAMING_SNAKE | `PLAN_LIMIT_REACHED` |
| Env | SCREAMING_SNAKE | `JWT_ACCESS_SECRET` |

## Scripts do package.json

| Script | Faz |
|---|---|
| `dev` | `tsx watch src/server.ts` |
| `build` | `tsc` |
| `start` | `node dist/server.js` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `lint` | `biome check .` |
| `format` | `biome format --write .` |
| `typecheck` | `tsc --noEmit` |
| `db:migrate` | `prisma migrate dev` |
| `db:deploy` | `prisma migrate deploy` |
| `db:studio` | `prisma studio` |
| `openapi:export` | `tsx scripts/export-openapi.ts` → `openapi.json` |

## Variáveis de ambiente (`.env.example`)

```bash
NODE_ENV=development
HOST=127.0.0.1                           # só a própria máquina; acesso externo via nginx
PORT=3333                                # = ports.api do rodsaas.json
APP_URL=http://localhost:3000            # front (CORS, links de e-mail) — porta = ports.web
API_URL=http://localhost:3333
COOKIE_DOMAIN=                           # vazio em dev; em produção o /rodsaas:domain grava (ex.: meusaas.com.br)

# Gravadas no .env (e .env.test) pelo /rodsaas:db. No .env.example ficam só os formatos:
DATABASE_URL=postgresql://NOME_app:SENHA@localhost:5432/NOME          # aplicação (sem privilégios)
MIGRATION_DATABASE_URL=postgresql://NOME_owner:SENHA@localhost:5432/NOME # migrations (dono das tabelas)

JWT_ACCESS_SECRET=                       # mínimo 32 caracteres
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
COOKIE_SECRET=                           # mínimo 32 caracteres

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO=                        # um por plano pago de plans.ts
STRIPE_PRICE_BUSINESS=

DOCS_ENABLED=true                        # false por padrão em produção
TRUST_PROXY=false                        # true atrás do nginx (o /rodsaas:domain liga)

SMTP_HOST=localhost
SMTP_PORT=1025                           # mailpit em dev
SMTP_USER=
SMTP_PASS=
MAIL_FROM="NOME <no-reply@seusaas.com>"
```

`env.ts` valida tudo com Zod (inclusive tamanho mínimo dos segredos) e o processo encerra com mensagem clara se algo faltar. O price ID de cada plano fica em `plans.ts` lendo do env (`STRIPE_PRICE_PRO`, etc.).

## docker-compose.yml (dev)

- `mailpit` (SMTP na 1025, UI na 8025)
- `postgres` (imagem oficial, versão estável atual) **só se a máquina não tiver Postgres instalado**. A senha do superuser vem de `POSTGRES_PASSWORD` no `.env` (gerada, nunca fixa no arquivo). Os usuários e bancos do projeto são criados pelo `/rodsaas:db` em modo `docker`, não por script de init
- Opcional, comentado: `stripe-cli` com `listen --forward-to localhost:3333/v1/billing/webhook`
