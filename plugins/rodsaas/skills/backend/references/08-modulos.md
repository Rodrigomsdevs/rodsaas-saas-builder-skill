# Módulos: o molde `projects`

O módulo `projects` é o exemplo vivo de todos os padrões. A skill de módulos (`/rodsaas:module`) copia este molde para criar módulos novos, então ele deve ser **simples, completo e sem atalhos**.

## Model

```prisma
model Project {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String
  description    String?
  status         ProjectStatus @default(ACTIVE)
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId, id])
}

enum ProjectStatus { ACTIVE ARCHIVED }
```

+ migration com RLS (`05-multi-tenant.md`) + contador `projects` em `lib/usage.ts`.

## `projects.schemas.ts`

```ts
import { z } from 'zod'
import { paginationQuery } from '../../lib/pagination'

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  createdAt: z.date(),   // serializado como ISO; confira como o type provider trata Date
  updatedAt: z.date(),
})

export const CreateProjectBody = z.strictObject({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
})

export const UpdateProjectBody = CreateProjectBody.partial().extend({
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
})

export const ListProjectsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
})

export const IdParam = z.object({ id: z.string().uuid() })
```

(`z.strictObject` / `.strict()` conforme a versão do Zod.)

## `projects.repository.ts`

Só acesso a dados. Recebe `tx` e `orgId`; **sempre** filtra por `organizationId`.

```ts
import type { Tx } from '../../lib/tenant'
import { cursorArgs } from '../../lib/pagination'

export const projectsRepo = {
  list: (tx: Tx, orgId: string, q: { limit: number; cursor?: string; q?: string; status?: 'ACTIVE' | 'ARCHIVED' }) =>
    tx.project.findMany({
      ...cursorArgs(q),
      where: {
        organizationId: orgId,
        ...(q.status && { status: q.status }),
        ...(q.q && { name: { contains: q.q, mode: 'insensitive' } }),
      },
      orderBy: { id: 'desc' },
    }),

  findById: (tx: Tx, orgId: string, id: string) =>
    tx.project.findFirst({ where: { id, organizationId: orgId } }),

  create: (tx: Tx, data: { organizationId: string; name: string; description?: string; createdById: string }) =>
    tx.project.create({ data }),

  update: (tx: Tx, orgId: string, id: string, data: { name?: string; description?: string; status?: 'ACTIVE' | 'ARCHIVED' }) =>
    tx.project.updateMany({ where: { id, organizationId: orgId }, data }),

  delete: (tx: Tx, orgId: string, id: string) =>
    tx.project.deleteMany({ where: { id, organizationId: orgId } }),
}
```

`updateMany`/`deleteMany` com `organizationId` no `where` garantem que nunca se altera linha de outra organização; o service confere `count === 0` → 404.

## `projects.service.ts`

```ts
import { withTenant } from '../../lib/tenant'
import { NotFoundError } from '../../lib/errors'
import { toPage } from '../../lib/pagination'
import { projectsRepo } from './projects.repository'
import type { TenantAuth } from '../../types/auth'

export const projectsService = {
  list: (auth: TenantAuth, q: ListQuery) =>
    withTenant(auth.orgId, async (tx) => toPage(await projectsRepo.list(tx, auth.orgId, q), q.limit)),

  get: (auth: TenantAuth, id: string) =>
    withTenant(auth.orgId, async (tx) => {
      const p = await projectsRepo.findById(tx, auth.orgId, id)
      if (!p) throw new NotFoundError('Projeto')
      return p
    }),

  create: (auth: TenantAuth, body: CreateBody) =>
    withTenant(auth.orgId, (tx) =>
      projectsRepo.create(tx, {
        organizationId: auth.orgId,
        createdById: auth.userId,
        name: body.name,
        description: body.description,
      })),

  update: (auth: TenantAuth, id: string, body: UpdateBody) =>
    withTenant(auth.orgId, async (tx) => {
      const { count } = await projectsRepo.update(tx, auth.orgId, id, {
        name: body.name, description: body.description, status: body.status,
      })
      if (count === 0) throw new NotFoundError('Projeto')
      return projectsRepo.findById(tx, auth.orgId, id)
    }),

  remove: (auth: TenantAuth, id: string) =>
    withTenant(auth.orgId, async (tx) => {
      const { count } = await projectsRepo.delete(tx, auth.orgId, id)
      if (count === 0) throw new NotFoundError('Projeto')
    }),
}
```

Note que o service monta os objetos **campo a campo**: nada de espalhar o body.

## `projects.routes.ts`

```ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod' // confira o nome do tipo na versão instalada
import { z } from 'zod'
import { paginated } from '../../lib/pagination'
import { Problem } from '../../lib/problem'
import { ProjectSchema, CreateProjectBody, UpdateProjectBody, ListProjectsQuery, IdParam } from './projects.schemas'
import { projectsService } from './projects.service'

export const projectsRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['Projects']

  app.get('/v1/projects', {
    schema: { tags, summary: 'Lista projetos', querystring: ListProjectsQuery,
      response: { 200: paginated(ProjectSchema), 401: Problem, 403: Problem } },
  }, (req) => projectsService.list(req.auth, req.query))

  app.get('/v1/projects/:id', {
    schema: { tags, summary: 'Detalha um projeto', params: IdParam,
      response: { 200: ProjectSchema, 404: Problem } },
  }, (req) => projectsService.get(req.auth, req.params.id))

  app.post('/v1/projects', {
    config: { limit: 'projects', idempotent: true, audit: 'project.created' },
    schema: { tags, summary: 'Cria um projeto', body: CreateProjectBody,
      response: { 201: ProjectSchema, 400: Problem, 403: Problem, 409: Problem } },
  }, async (req, reply) => {
    const project = await projectsService.create(req.auth, req.body)
    req.auditMeta = { entityType: 'project', entityId: project.id }
    return reply.status(201).send(project)
  })

  app.patch('/v1/projects/:id', {
    config: { audit: 'project.updated' },
    schema: { tags, summary: 'Atualiza um projeto', params: IdParam, body: UpdateProjectBody,
      response: { 200: ProjectSchema, 400: Problem, 404: Problem } },
  }, (req) => projectsService.update(req.auth, req.params.id, req.body))

  app.delete('/v1/projects/:id', {
    config: { roles: ['OWNER', 'ADMIN'], audit: 'project.deleted' },
    schema: { tags, summary: 'Remove um projeto', params: IdParam,
      response: { 204: z.null(), 403: Problem, 404: Problem } },
  }, async (req, reply) => {
    await projectsService.remove(req.auth, req.params.id)
    return reply.status(204).send()
  })
}
```

## `projects.test.ts` (mínimo)

- cria, lista (com paginação: 25 itens, `limit=10` → 3 páginas, sem repetição), detalha, atualiza, remove;
- **isolamento**: usuário da org B não lista, não vê, não altera e não remove projeto da org A (sempre 404);
- limite do plano: no `free`, o 6º projeto → 403 `PLAN_LIMIT_REACHED`;
- `member` não remove (403); `admin` remove;
- body com campo desconhecido → 400;
- `Idempotency-Key` repetida com mesmo body → mesma resposta, sem duplicar.

## Checklist de um módulo novo

- [ ] model com `organizationId` e índice `[organizationId, id]`
- [ ] migration com `ENABLE` + `FORCE` RLS + policy
- [ ] schemas Zod de entrada (estritos) e saída
- [ ] repository filtrando por `organizationId` em todas as queries
- [ ] service usando `withTenant` e montando dados campo a campo
- [ ] rotas com `tags`, `summary`, `response` completo e `config` (roles/limit/audit/idempotent)
- [ ] contador em `lib/usage.ts` se tiver limite de plano
- [ ] testes, incluindo isolamento entre organizações
- [ ] registrado em `app.ts`
