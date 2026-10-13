# Multi-tenant

## Modelo

- **Banco compartilhado**, toda tabela de negócio com `organizationId`.
- Um usuário pode pertencer a várias organizações (`Membership`), com um papel em cada.
- A organização ativa vem **do access token**, nunca do body, URL ou header.
- Isolamento em **duas camadas**: o código filtra por `organizationId` e o Postgres aplica RLS.

## Papéis

| Papel | Pode |
|---|---|
| `OWNER` | tudo, incluindo billing, excluir a organização e transferir a posse |
| `ADMIN` | gerenciar membros e convites (exceto owners), configurações da organização |
| `MEMBER` | usar o produto |

Regras invariantes (com teste):
- toda organização tem **pelo menos um owner**; não dá para remover ou rebaixar o último;
- admin não altera nem remove owner;
- ninguém altera o próprio papel.

## Schema base (Prisma)

```prisma
enum Role { OWNER ADMIN MEMBER }

model User {
  id                 String    @id @default(uuid(7)) @db.Uuid
  email              String    @unique            // sempre salvo em minúsculas
  name               String
  passwordHash       String
  emailVerifiedAt    DateTime?
  lastOrganizationId String?   @db.Uuid
  failedLoginCount   Int       @default(0)
  lockedUntil        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  memberships        Membership[]
}

model Organization {
  id          String   @id @default(uuid(7)) @db.Uuid
  name        String
  slug        String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  memberships Membership[]
  invitations Invitation[]
  subscription Subscription?
}

model Membership {
  id             String       @id @default(uuid(7)) @db.Uuid
  organizationId String       @db.Uuid
  userId         String       @db.Uuid
  role           Role
  tokenVersion   Int          @default(0)
  createdAt      DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([organizationId, userId])
  @@index([userId])
}

model Invitation {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  email          String
  role           Role                     // nunca OWNER via convite
  tokenHash      String    @unique
  invitedById    String    @db.Uuid
  expiresAt      DateTime                 // 7 dias
  acceptedAt     DateTime?
  revokedAt      DateTime?
  createdAt      DateTime  @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId])
}

model AuditLog {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  actorUserId    String?  @db.Uuid
  action         String                   // "member.removed", "project.created"...
  entityType     String?
  entityId       String?
  metadata       Json?
  ip             String?
  createdAt      DateTime @default(now())
  @@index([organizationId, createdAt])
}

model IdempotencyKey {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  key            String
  requestHash    String
  responseStatus Int
  responseBody   Json
  expiresAt      DateTime
  @@unique([organizationId, key])
}
```

`RefreshToken` e `VerificationToken`: `04-auth.md`. `Subscription` e `StripeEvent`: `06-billing.md`.

## Onde tem RLS e onde não tem

| Tabelas | RLS | Por quê |
|---|---|---|
| Tabelas de negócio (`Project` e todas que vierem) + `AuditLog` | **sim** | são os dados do cliente; é aqui que um vazamento dói |
| `User`, `Organization`, `Membership`, `Invitation`, `RefreshToken`, `VerificationToken`, `Subscription`, `StripeEvent`, `IdempotencyKey` | não | login, aceite de convite, refresh e webhook precisam ler antes de existir organização ativa. Protegidas por filtro explícito no código + testes |

Regra para módulos novos: **toda tabela de negócio nasce com `organizationId` e RLS**. Sem exceção sem justificativa escrita.

## Dois usuários de banco

O dono das tabelas e o superuser **ignoram RLS**. Por isso:

- `<projeto>_owner`: dono do banco e das tabelas, roda as migrations (`MIGRATION_DATABASE_URL`).
- `<projeto>_app`: usado pela aplicação (`DATABASE_URL`), sem superuser, sem `BYPASSRLS`, só DML; dono do schema `pgboss`.

Quem cria os dois, os bancos (principal e de teste), os grants e grava as URLs no `.env` é a skill **`/rodsaas:db`**. Não escreva SQL de usuários/grants no projeto nem senha fixa em arquivo nenhum.

A CLI do Prisma usa `MIGRATION_DATABASE_URL` e o client em runtime usa `DATABASE_URL`. A forma de separar isso depende da versão do Prisma (arquivo de config, `directUrl`, etc.) — siga a doc atual.

## RLS nas migrations

Crie a migration com `prisma migrate dev --create-only`, acrescente o SQL e só então aplique:

```sql
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Project"
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);
```

- `FORCE` faz a policy valer até para o dono da tabela (cinto e suspensório).
- O `NULLIF(..., '')` faz uma query **fora** de `withTenant` não enxergar nada e não conseguir inserir nada: falha fechada, em vez de erro de cast ou vazamento.
- `WITH CHECK` impede gravar linha com `organizationId` de outra organização.

## `withTenant` (`lib/tenant.ts`)

Toda leitura/escrita em tabela com RLS passa por aqui:

```ts
import { prisma } from './prisma'
import type { Prisma } from '@prisma/client' // confira o caminho do client na versão instalada

export type Tx = Prisma.TransactionClient

export async function withTenant<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // `true` = vale só para esta transação; com pool de conexões, nunca use SET sem LOCAL
    await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`
    return fn(tx)
  })
}
```

Uso no service:

```ts
export async function getProject(auth: TenantAuth, id: string) {
  return withTenant(auth.orgId, async (tx) => {
    const project = await projectsRepo.findById(tx, auth.orgId, id)
    if (!project) throw new NotFoundError('Projeto')
    return project
  })
}
```

E o repository **também** filtra por `organizationId` (segunda camada):

```ts
export const findById = (tx: Tx, orgId: string, id: string) =>
  tx.project.findFirst({ where: { id, organizationId: orgId } })
```

Não use `findUnique({ where: { id } })` em tabela de tenant: troque por `findFirst` com `organizationId`.

`TenantAuth` é o `request.auth` com `orgId` garantidamente não nulo (o plugin de auth já devolveu 403 `NO_ACTIVE_ORGANIZATION` se fosse nulo numa rota de tenant).

## Membros e convites

Rotas (todas de tenant):

| Rota | Quem | Faz |
|---|---|---|
| `GET /v1/members` | todos | lista membros (paginado) |
| `PATCH /v1/members/:id` | owner, admin | muda papel (respeitando as invariantes) e incrementa `tokenVersion` |
| `DELETE /v1/members/:id` | owner, admin | remove; como a membership deixa de existir, o `authorize` já barra o token antigo em rotas com `roles` |
| `POST /v1/members/leave` | todos | sai da organização (último owner não pode) |
| `GET /v1/invitations` | owner, admin | lista convites pendentes |
| `POST /v1/invitations` | owner, admin · `limit: 'members'` · idempotente | convida `{ email, role }` (role ≠ OWNER); 409 se já é membro ou já tem convite pendente |
| `POST /v1/invitations/:id/resend` | owner, admin | gera novo token, renova validade, reenvia |
| `DELETE /v1/invitations/:id` | owner, admin | revoga |
| `GET /v1/invitations/preview?token=` | público | nome da organização e e-mail convidado (para a tela de aceite) |
| `POST /v1/invitations/accept` | autenticado · `tenant: false` | `{ token }`; exige que o e-mail do usuário logado seja o do convite; cria a membership e troca a organização ativa |

Quem ainda não tem conta: o front mostra cadastro com o e-mail do convite pré-preenchido e, logo após o `register`, chama `accept`. Nesse caso, o `register` aceita `{ invitationToken }` opcional e **não** cria organização própria: entra direto na organização do convite.

Ao remover um membro, revogue também os refresh tokens dele? **Não**: ele pode ser membro de outras organizações. O `tokenVersion` já corta o acesso àquela organização.

## Slug da organização

Gerado a partir do nome (minúsculas, sem acento, hífens) com sufixo curto se já existir. É só para exibição/URLs bonitas do front; **a API nunca resolve tenant por slug**.
