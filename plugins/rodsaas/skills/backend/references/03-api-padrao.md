# Padrão da API REST

## Convenções gerais

- Prefixo `/v1` em tudo (exceto `/health`, `/ready` e `/docs`).
- Recursos no plural: `GET /v1/projects`, `GET /v1/projects/:id`, `POST /v1/projects`, `PATCH /v1/projects/:id`, `DELETE /v1/projects/:id`.
- `PATCH` para atualização parcial; não use `PUT` salvo motivo claro.
- Ações que não são CRUD viram sub-recurso com verbo no substantivo: `POST /v1/invitations/:id/resend`, `POST /v1/auth/switch-organization`.
- **Nunca** aceite `organizationId` no body ou na URL das rotas de tenant: ele vem do token. Isso elimina a classe inteira de bugs "mandei o id de outra org".
- Datas em ISO 8601 UTC. IDs uuidv7 (`@default(uuid(7))` no Prisma — confira na doc atual).
- JSON em camelCase.

### Status codes

| Situação | Status |
|---|---|
| Criado | 201 (com o recurso no body) |
| Sem conteúdo (delete, logout) | 204 |
| Validação | 400 `VALIDATION_ERROR` |
| Sem autenticação / token inválido | 401 |
| Autenticado mas sem permissão | 403 |
| Não existe **ou é de outra organização** | 404 |
| Conflito (e-mail já usado, já é membro) | 409 |
| Limite do plano / feature fora do plano | 403 `PLAN_LIMIT_REACHED` / `FEATURE_NOT_IN_PLAN` |
| Rate limit | 429 |
| Erro inesperado | 500 (mensagem genérica) |

## Respostas de sucesso

- Recurso único: o objeto direto, sem envelope. `{ "id": "...", "name": "..." }`
- Lista: sempre com envelope de paginação (abaixo).

## Erros: RFC 9457 (Problem Details)

Content-Type `application/problem+json`.

```json
{
  "type": "https://docs.seusaas.com/errors/plan-limit-reached",
  "title": "Limite do plano atingido",
  "status": 403,
  "code": "PLAN_LIMIT_REACHED",
  "detail": "Seu plano permite até 5 membros.",
  "instance": "/v1/invitations",
  "requestId": "0192c0a1-...",
  "errors": [{ "path": "email", "message": "E-mail inválido" }]
}
```

- `code` é o contrato com o front. `title`/`detail` podem mudar; `code` não.
- `errors` só aparece em validação.
- Em produção, 500 nunca expõe mensagem interna nem stack — só `title: "Erro interno"` e o `requestId`. O detalhe vai para o log.

### Classes de erro (`lib/errors.ts`)

```ts
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  NO_ACTIVE_ORGANIZATION: 'NO_ACTIVE_ORGANIZATION',
  PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',
  FEATURE_NOT_IN_PLAN: 'FEATURE_NOT_IN_PLAN',
  SUBSCRIPTION_INACTIVE: 'SUBSCRIPTION_INACTIVE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: { path: string; message: string }[],
  ) {
    super(detail ?? title)
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(404, ErrorCode.NOT_FOUND, `${resource} não encontrado`)
  }
}
export class ForbiddenError extends AppError {
  constructor(detail?: string) {
    super(403, ErrorCode.FORBIDDEN, 'Acesso negado', detail)
  }
}
export class ConflictError extends AppError {
  constructor(detail: string) {
    super(409, ErrorCode.CONFLICT, 'Conflito', detail)
  }
}
export class PlanLimitError extends AppError {
  constructor(limit: string, max: number) {
    super(403, ErrorCode.PLAN_LIMIT_REACHED, 'Limite do plano atingido',
      `Seu plano permite até ${max} ${limit}.`)
  }
}
// UnauthorizedError, FeatureNotInPlanError... mesmo padrão
```

O catálogo de códigos também vai para a documentação (seção "Erros" no README e um schema `Problem` reutilizado nas respostas de erro do OpenAPI).

### Error handler (`plugins/error-handler.ts`)

Um único `setErrorHandler` trata, nesta ordem:
1. `AppError` → status/código dele.
2. Erro de validação do type provider Zod → 400 `VALIDATION_ERROR` com `errors[]` (use os helpers do `fastify-type-provider-zod` para detectar; confira os nomes na versão instalada).
3. Erro de serialização da resposta → **é bug nosso**: loga como erro e devolve 500.
4. Erros do Fastify com `statusCode` < 500 (ex.: JSON malformado, 413, 429) → mapeia para o código correspondente.
5. Erro do Prisma de unique (`P2002`) → 409 `CONFLICT`; registro não encontrado (`P2025`) → 404.
6. Qualquer outra coisa → 500 genérico, logado com stack.

Também registre `setNotFoundHandler` devolvendo 404 no mesmo formato.

## Paginação por cursor

Padrão para toda listagem. Como os IDs são uuidv7 (ordenáveis pelo tempo de criação), ordenar por `id desc` já dá "mais recentes primeiro" de forma estável.

### Query
```
GET /v1/projects?limit=20&cursor=<opaco>&sort=-createdAt&filter[status]=active&q=texto
```
- `limit`: padrão 20, **máximo 100** (validado no schema).
- `cursor`: string opaca (base64url). O cliente nunca monta cursor.

### Resposta
```json
{
  "data": [ ... ],
  "meta": { "nextCursor": "MDE5MmMw...", "hasMore": true }
}
```

### Helper (`lib/pagination.ts`)

```ts
import { z } from 'zod'

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
})

export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
  })

const encode = (id: string) => Buffer.from(id).toString('base64url')
const decode = (c: string) => Buffer.from(c, 'base64url').toString('utf8')

/** Use: const rows = await tx.project.findMany({ ...cursorArgs(q), where, orderBy: { id: 'desc' } }) */
export function cursorArgs(q: { limit: number; cursor?: string }) {
  return {
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: decode(q.cursor) }, skip: 1 } : {}),
  }
}

export function toPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  return { data, meta: { hasMore, nextCursor: hasMore ? encode(data.at(-1)!.id) : null } }
}
```

Cursor inválido (não decodifica ou não existe) → 400 `VALIDATION_ERROR`, nunca 500.

Ordenação por outro campo (`sort=name`): o cursor passa a carregar `(valor, id)` e a ordem é `[{ campo }, { id }]`. Implemente só quando um módulo precisar; o padrão é `id desc`.

Offset (`page`/`pageSize` com `total`) só para telas de admin que precisam de "página 7 de 12", e só se o módulo pedir.

## OpenAPI

- Registre o type provider Zod (`validatorCompiler` e `serializerCompiler`) e o `@fastify/swagger` com o `transform` do provider, para os schemas Zod virarem JSON Schema no documento.
- Toda rota declara: `tags`, `summary`, `body`/`querystring`/`params` quando houver, e `response` com **todos** os status de sucesso e os de erro relevantes (usando o schema `Problem`).
- Security scheme `cookieAuth` (cookie `access_token`) aplicado globalmente; rotas públicas sobrescrevem com `security: []`.
- Schemas reutilizados (`Project`, `Member`, `Problem`, `Paginated…`) saem **com nome** em `components.schemas` (registre os schemas Zod com id/nome conforme o type provider instalado). O front gera os tipos desse arquivo; schema anônimo vira tipo ilegível do lado de lá.
- UI em `/docs` (Scalar). Em produção, deixe `/docs` atrás de uma flag `DOCS_ENABLED` (padrão: ligado em dev, desligado em prod).
- `scripts/export-openapi.ts` sobe o app com `buildApp()`, chama `app.ready()`, grava `app.swagger()` em `openapi.json` e encerra. É desse arquivo que o front gera o client tipado.

### Exemplo de rota completa

```ts
app.get('/v1/projects', {
  schema: {
    tags: ['Projects'],
    summary: 'Lista projetos da organização',
    querystring: paginationQuery.extend({ q: z.string().max(100).optional() }),
    response: { 200: paginated(ProjectSchema), 401: Problem, 403: Problem },
  },
}, async (req) => projectsService.list(req.auth, req.query))
```

## Idempotência

POSTs marcados com `config: { idempotent: true }` aceitam o header `Idempotency-Key` (uuid). Guarde `(organizationId, key, hash do body)` com a resposta por 24h:
- mesma chave + mesmo body → devolve a resposta salva;
- mesma chave + body diferente → 409 `IDEMPOTENCY_CONFLICT`.

Marque como idempotentes ao menos: criação de checkout, convites e o `POST` do módulo de exemplo.
