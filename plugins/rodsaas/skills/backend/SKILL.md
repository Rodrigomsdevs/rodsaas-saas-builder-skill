---
name: backend
description: Cria o backend completo de um SaaS B2B multi-tenant no padrão rodsaas — Fastify + TypeScript + Postgres + Prisma + Zod, com auth JWT + refresh, organizações, membros, convites, planos e Stripe, API REST padronizada (erros RFC 9457, paginação por cursor, OpenAPI) e segurança por padrão. Use sempre que o usuário pedir para iniciar, criar, gerar ou montar o backend/API de um SaaS, "projeto novo rodsaas", "backend multi-tenant", ou chamar /rodsaas:backend, mesmo que não cite todas as peças da stack.
---

# rodsaas · backend

Esta skill gera, do zero, a pasta `api/` de um SaaS B2B multi-tenant pronto para receber regras de negócio. Ao final, o usuário tem uma API rodando com cadastro, login, organizações, membros, convites, planos com Stripe, documentação OpenAPI e testes de isolamento entre tenants passando.

O objetivo não é só "funcionar": é que todo projeto gerado pela skill seja **igual aos outros** (mesma estrutura, mesmos padrões, mesmos nomes) e **seguro por padrão**, porque o Rodrigo mantém vários SaaS ao mesmo tempo e precisa abrir qualquer um deles e já saber onde tudo está.

## Stack fixa

| Camada | Escolha |
|---|---|
| Runtime | Node.js LTS atual + TypeScript (strict) |
| HTTP | Fastify |
| Validação / schemas | Zod (via type provider do Fastify) |
| Banco | PostgreSQL |
| ORM | Prisma |
| Auth | JWT de acesso curto + refresh token opaco com rotação (feito à mão, sem lib de auth) |
| Billing | Stripe (Checkout + Customer Portal + webhooks) |
| Fila | pg-boss (usa o próprio Postgres) |
| E-mail | Provider abstrato; SMTP em produção, Mailpit em dev |
| Docs | OpenAPI gerado das rotas + UI em `/docs` |
| Testes | Vitest contra um Postgres real (docker) |
| Lint/format | Biome |

Não troque peças da stack por conta própria. Se o usuário pedir algo diferente, siga o pedido dele e registre a divergência no README do projeto.

## Regra de versões: sempre a mais recente, nunca de memória

Esta skill **não fixa versões de propósito**, porque elas envelhecem em meses e o modelo tende a lembrar de APIs antigas. Antes de instalar ou configurar qualquer pacote:

1. Rode `npm view <pacote> version` para saber a versão atual.
2. Leia a documentação oficial atual do pacote (Context7 se estiver disponível, senão WebFetch na doc oficial) para o setup daquela versão — principalmente **Prisma** (generator, config e driver adapter mudam entre majors), **fastify-type-provider-zod** (compatibilidade com a versão do Zod e do `@fastify/swagger`) e **Stripe** (versão da API).
3. Se a doc atual contradiz um exemplo desta skill, **a doc vence**: adapte o código e anote no relatório final o que mudou.
4. Depois de instalado, o lockfile trava tudo. "Mais recente" vale para a criação, não para cada build.

Detalhes e lista de pacotes: `references/01-stack-e-versoes.md`.

## Antes de começar

Pergunte só o que não dá para deduzir (em uma única mensagem):

- **Nome do projeto** (vira nome do pacote, do banco e título da doc da API).
- **Onde criar** — padrão: pasta `api/` no diretório atual (o front vai depois em `web/`, pela skill de frontend).
- **Planos iniciais** — nomes, limites e features. Se o usuário não souber ainda, use o padrão `free` / `pro` / `business` com limites de exemplo e deixe claro que é placeholder.

Grave as respostas em **`rodsaas.json`** na raiz do projeto (crie se não existir, preserve o que já houver): `product.name`, `domains.app` e `domains.api` (em dev, `http://localhost:3000` e `http://localhost:3333`). Todas as skills rodsaas leem desse arquivo; o `/rodsaas:frontend` completa a parte de marca. Use `product.name` nos e-mails transacionais e no título da documentação da API.

Confira também que existe Docker disponível (o Postgres e o Mailpit de dev rodam no docker compose). Se não houver, avise e peça uma connection string de um Postgres acessível.

## Como construir: em fases, cada uma terminando verde

Gere o projeto **em fases**. Cada fase termina com: `tsc --noEmit` sem erros, `biome check` limpo, testes da fase passando e um commit git com mensagem convencional (`feat: ...`). Não avance com uma fase quebrada — erro acumulado entre fases é o que transforma um scaffold em dia perdido de debug.

Use a lista de tarefas para mostrar o progresso fase a fase.

### Fase 1 — Base
Projeto Node/TS, `app.ts` (factory `buildApp()` usada pelo servidor e pelos testes), `server.ts` com graceful shutdown, env validado com Zod no boot, logger pino com redact, request id, error handler RFC 9457, OpenAPI + `/docs`, health check, docker compose (Postgres + Mailpit), Biome, Vitest.
→ Leia `references/02-estrutura.md` e `references/03-api-padrao.md`.

### Fase 2 — Banco e multi-tenant
Primeiro, provisione o banco seguindo a skill **`/rodsaas:db`** (leia o `SKILL.md` dela e execute o fluxo, passando o que já sabe: nome do projeto, pasta `api/`, ambiente dev). Ela cria o banco, o banco de teste, o usuário dono e o usuário da aplicação sem privilégios, e grava as URLs no `.env`. Depois: schema Prisma com os models base, migrations, RLS com `FORCE`, helper `withTenant()`.
→ Leia `references/05-multi-tenant.md`.

### Fase 3 — Auth
Cadastro (cria usuário + organização + membership owner), login, refresh com rotação e detecção de reuso, logout, logout de todos, verificação de e-mail, esqueci/redefinir senha, troca de organização, `/me`.
→ Leia `references/04-auth.md`.

### Fase 4 — Organizações, membros e convites
CRUD da organização, listagem/alteração de papel/remoção de membros, convites por e-mail (criar, reenviar, revogar, aceitar), `tokenVersion` incrementado em remoção ou rebaixamento.
→ Leia as seções "Papéis" e "Membros e convites" de `references/05-multi-tenant.md`.

### Fase 5 — Billing
`config/plans.ts`, cliente Stripe, checkout, portal, webhook com body cru + assinatura + idempotência, assinatura espelhada no banco, guards de feature e limite.
→ Leia `references/06-billing.md`.

### Fase 6 — Plataforma
Audit log, pg-boss (envio de e-mail, limpeza de tokens expirados), provider de e-mail, rate limit por organização, idempotency-key.
→ Leia `references/07-seguranca.md`.

### Fase 7 — Módulo de exemplo
Um CRUD completo (`projects`) usando todos os padrões: tenant, RLS, paginação, erros, guard de limite de plano, OpenAPI, audit, testes. Ele é o **molde** que a skill de módulos copia, então capriche e mantenha simples.
→ Leia `references/08-modulos.md`.

### Fase 8 — Fechamento
Rode a checklist de `references/09-testes-e-checklist.md` item por item, gere `openapi.json` (script `openapi:export`, usado depois pelo front para gerar o client tipado) e escreva o README do projeto.

## Princípios que guiam as decisões

Quando surgir um caso que a skill não cobre, decida por estes princípios:

- **Seguro por padrão.** Toda rota nasce autenticada e com tenant; rota pública declara `config: { public: true }`. Esquecer algo deve resultar em "fechado demais", nunca em vazamento.
- **Duas camadas de isolamento.** O código sempre filtra por `organizationId` *e* o Postgres aplica RLS. Uma camada sozinha falha um dia.
- **Schema é contrato.** Toda rota declara schema de entrada *e* de resposta. A resposta serializada só contém campos declarados — isso impede vazar `passwordHash` por acidente, e é de onde sai a documentação OpenAPI.
- **Erros previsíveis.** Todo erro sai no formato RFC 9457 com um `code` do catálogo. O front trata por `code`, nunca por texto.
- **Estado de billing é local.** A verdade sobre o plano vem do banco (espelhado via webhook); nunca consulte a Stripe dentro de uma request comum.
- **Nada de mágica.** Prefira código explícito e legível a abstrações espertas. Quem abrir o projeto daqui a um ano precisa entender sem ler a skill.

## Relatório final

Termine com uma mensagem curta contendo:
- como subir (`docker compose up -d`, `npm run db:migrate`, `npm run dev`) e onde está a doc (`/docs`);
- variáveis de ambiente que o usuário precisa preencher (Stripe, SMTP, segredos);
- o que precisou desviar da skill porque a doc atual de algum pacote mudou;
- próximo passo natural: `/rodsaas:frontend` para gerar o `web/` (ele usa o `openapi.json` exportado e o `rodsaas.json`).

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-stack-e-versoes.md` | Antes de instalar qualquer pacote |
| `references/02-estrutura.md` | Fase 1 — árvore de pastas, scripts, convenções de nomes |
| `references/03-api-padrao.md` | Fase 1 e em toda rota — REST, erros, paginação, OpenAPI |
| `references/04-auth.md` | Fase 3 — tokens, cookies, fluxos |
| `references/05-multi-tenant.md` | Fase 2 — schema, RLS, `withTenant` |
| `references/06-billing.md` | Fase 5 — planos, Stripe, guards |
| `references/07-seguranca.md` | Fase 1 e 6 — pipeline de hooks e checklist de segurança |
| `references/08-modulos.md` | Fase 7 — anatomia de um módulo |
| `references/09-testes-e-checklist.md` | Fase 8 — testes obrigatórios e checklist final |
