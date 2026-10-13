# Testes e checklist final

## Como os testes rodam

- Vitest contra um **Postgres real** (o do docker compose, num banco `NOME_test`). Mock de banco esconde exatamente os bugs que importam aqui (RLS, unique, transação).
- O banco `NOME_test`, com os mesmos dois usuários e grants, é criado pelo `/rodsaas:db` (que grava as URLs em `.env.test`).
- `test/setup.ts`: aplica as migrations no banco de teste uma vez (`prisma migrate deploy` com a URL de migração de teste) e, antes de cada teste, faz `TRUNCATE ... RESTART IDENTITY CASCADE` em todas as tabelas (com o usuário dono).
- Os testes usam o app real via `buildApp()` + `app.inject()`, conectando como o usuário da aplicação (`DATABASE_URL` do `.env.test`), para que o RLS esteja valendo de verdade.
- Stripe e e-mail substituídos por implementações em memória.
- Rode os arquivos em série (`fileParallelism: false`) para não haver disputa no mesmo banco. Otimize depois, se ficar lento.

## Factories (`test/factories.ts`)

```ts
createUser({ email?, password?, verified? })
createOrg({ ownerId, name?, plan? })
addMember({ orgId, userId, role })
loginAs(user, orgId?) // devolve os cookies para usar no app.inject
```

## Testes obrigatórios

### Segurança (`test/security/`)
- **Rotas protegidas por padrão**: percorre todas as rotas registradas; toda rota sem `public: true` chamada sem cookie → 401.
- **Isolamento entre organizações**: para cada rota de tenant com `:id`, usuário da org B recebe 404 para recurso da org A; listagens da org B não contêm nada da org A.
- **RLS de verdade**: query direta via `prisma` (como usuário da aplicação) em tabela de negócio **sem** `withTenant` não retorna linhas; insert com `organizationId` de outra org dentro de `withTenant` falha.
- **Origin**: POST autenticado com `Origin` de outro domínio → 403.
- Resposta de erro 500 em produção não contém mensagem interna (simule um erro).

### Auth
- register cria user + org + owner e já autentica
- login certo / senha errada / e-mail inexistente (mesmo erro, mesmo status)
- bloqueio após 5 falhas
- refresh rotaciona (token antigo deixa de funcionar)
- **reuso** de refresh revogado (fora da janela) derruba a família inteira
- reuso dentro da janela de tolerância não derruba
- reset de senha revoga todos os refresh
- `TOKEN_EXPIRED` com access vencido (avance o relógio com fake timers)
- switch-organization para org em que não é membro → 403
- `session_hint` gravado em login/cadastro/refresh e apagado em logout e em refresh inválido
- `GET /v1/me` de um `MEMBER` traz plano efetivo, features, limites e uso (sem dados de cobrança)
- `disabledApps`: owner/admin alteram, membro recebe 403; ids inválidos/repetidos/`inicio` → 400; aparece em `organization.disabledApps` no `/v1/me`
- `PUT /v1/me/preferences`: grava por empresa (trocar de empresa traz os fixados da outra), `null` volta ao padrão, validação dos ids

### Organizações, membros e convites
- não remove/rebaixa o último owner
- admin não mexe em owner
- mudar papel incrementa `tokenVersion` e o token antigo recebe 401 `TOKEN_EXPIRED` em rota com `roles`; membro removido também é barrado nessas rotas
- convite: criar, aceitar (usuário novo e usuário existente), expirado, revogado, e-mail diferente do convidado
- convite conta no limite de membros

### Billing
- modo: sem chave em dev → `fake`; sem chave em produção → `disabled` (503 `BILLING_NOT_CONFIGURED`); `BILLING_MODE=fake` + produção → boot falha
- **modo fake**: checkout do Free → Pro aplica na hora (limites e features mudam); `change-plan` Pro → Business; prévia com `overLimits` num downgrade acima do limite; cancelar agenda (`cancelAtPeriodEnd`), retomar desfaz, `period_end` simulado volta para free; `payment_failed` simulado liga `paymentIssue`
- checkout de quem já assina → 409 `ALREADY_SUBSCRIBED`; change-plan de quem não assina → 409 `NOT_SUBSCRIBED`; mesmo plano → 400 `SAME_PLAN`; free no checkout → 400 `PLAN_NOT_PURCHASABLE`
- admin e member: 403 em checkout, change-plan, cancel, resume e portal; admin lê a assinatura, member não
- webhook com assinatura inválida → 400; mesmo evento duas vezes → processado uma vez
- `subscription.updated` muda o plano (pelo metadado `rodsaas_plan` do produto); `deleted` volta para free; `past_due` mantém o plano com `paymentIssue: true`; produto sem metadado não derruba o webhook
- guard de feature e de limite

### API
- erro de validação no formato RFC 9457 com `errors[]`
- paginação: sem itens repetidos ou perdidos entre páginas; `limit` > 100 → 400; cursor inválido → 400
- `Idempotency-Key`: replay e conflito

## Checklist final (Fase 8)

Rode e confirme cada item antes do relatório final:

- [ ] `npm run typecheck` sem erros
- [ ] `npm run lint` limpo
- [ ] `npm test` todo verde
- [ ] `docker compose up -d && npm run db:migrate && npm run dev` sobe do zero num clone limpo
- [ ] `/docs` abre e mostra todas as rotas com schemas e exemplos de erro
- [ ] `npm run openapi:export` gera `openapi.json` válido
- [ ] checklist de segurança de `07-seguranca.md` completa
- [ ] `.env.example` com todas as variáveis e comentários
- [ ] README do projeto com: como rodar, variáveis, estrutura, catálogo de erros, como criar um módulo, como configurar Stripe (produtos/preços, portal, webhook) e notas de produção (rate limit com store compartilhado, provisionar o banco de produção com `/rodsaas:db`, `DOCS_ENABLED`)
- [ ] **conferência final**: tabela item a item de cada referência com ✅/❌; nenhum ❌ sem pendência registrada no relatório
