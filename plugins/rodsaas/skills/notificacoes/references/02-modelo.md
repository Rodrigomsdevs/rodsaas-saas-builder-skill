# 02 · Modelo

As duas tabelas têm `organizationId` e **RLS com `FORCE`** (política padrão da base por `app.org_id`). Horários em `timestamptz` (UTC). O add-on não cria tabela de busca pública: o descadastro usa token assinado (sem tabela).

## Notification

```prisma
enum NotificationEmailStatus { NONE PENDING SENT SKIPPED FAILED }
enum NotificationEmailMode { IMMEDIATE DAILY }

model Notification {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  userId         String    @db.Uuid                 // destinatário
  type           String                             // do catálogo: "task.commented", "org.member_joined"…
  appId          String                             // "tarefas", "crm"… ou "geral" (avisos da base)
  actorId        String?   @db.Uuid                 // ator mais recente (null = sistema)
  actorIds       String[]  @db.Uuid @default([])    // atores distintos, mais recente primeiro (até 50)
  count          Int       @default(1)              // eventos juntados nesta notificação
  entityType     String                             // "task", "deal", "ticket", "organization"…
  entityId       String    @db.Uuid
  groupKey       String?                            // null = não agrupa (groupKeyFor)
  groupOpenUntil DateTime?                          // até quando aceita eventos novos
  data           Json      @default("{}")           // title, snippet, de/para… legível sem joins
  url            String                             // caminho no painel ("/tarefas/t/MKT-12"), sempre relativo
  inApp          Boolean   @default(true)           // false = existe só para o e-mail (pessoa desligou o sino deste tipo)
  emailMode      NotificationEmailMode?             // fixado na criação pela preferência; null = sem e-mail
  emailStatus    NotificationEmailStatus @default(NONE)
  emailedAt      DateTime?
  readAt         DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @default(now())          // muda quando junta evento (a lista ordena por aqui)

  @@index([organizationId, userId, updatedAt(sort: Desc), id(sort: Desc)])          // lista
  @@index([organizationId, userId, readAt])                                         // contador
  @@index([organizationId, userId, groupKey])                                       // agrupamento
  @@index([emailStatus, emailMode, updatedAt])                                      // jobs de e-mail
  @@index([entityType, entityId])                                                   // retract
}
```

Regras:
- `url` é sempre **relativa** ao painel e começa com `/` (validado no `notify()`: nada de `http://`, `//` ou `javascript:`).
- `data.title` é obrigatório para tipos cuja frase usa `{title}`; `data.snippet` passa pelo `snippet()` da lib (texto puro, uma linha, 140 caracteres).
- Índice parcial extra para o contador (Postgres puro, numa migration SQL): `CREATE INDEX ... ON "Notification" ("organizationId", "userId") WHERE "readAt" IS NULL AND "inApp";`.
- Nenhuma FK para as tabelas dos apps (é genérico); quando o registro some, o app chama `retract()`.

## NotificationPreference

```prisma
enum EmailMode { IMMEDIATE DAILY OFF }

model NotificationPreference {
  organizationId String    @db.Uuid
  userId         String    @db.Uuid
  emailMode      EmailMode @default(IMMEDIATE)
  digestHour     Int       @default(8)              // 0–23, fuso da empresa
  types          Json      @default("{}")           // { "task.commented": { inApp: false, email: "DEFAULT" } } — só o que difere do padrão
  lastDigestAt   DateTime?                          // último resumo enviado (digestDue)
  updatedAt      DateTime  @updatedAt
  @@id([organizationId, userId])
}
```

- Preferência é **por empresa** (a mesma pessoa pode querer tudo na empresa A e só o resumo na B).
- Sem linha = `defaultPrefs()` da lib. O `GET` não cria linha; o primeiro `PUT` cria (`upsert`).
- `types` é validado pelo `normalizePrefs()` (tipo do catálogo, valores permitidos, tipos críticos recusados).

## Agrupamento sem duplicar (concorrência)

Dois eventos ao mesmo tempo para a mesma pessoa e chave não podem criar duas notificações. Dentro da transação do `notify()`, para cada destinatário com `groupKey`:

```sql
SELECT pg_advisory_xact_lock(hashtextextended($userId || ':' || $groupKey, 0));
SELECT * FROM "Notification"
 WHERE "organizationId" = $org AND "userId" = $user AND "groupKey" = $key
   AND "readAt" IS NULL AND "emailStatus" IN ('NONE','PENDING') AND "groupOpenUntil" > now()
 ORDER BY "updatedAt" DESC LIMIT 1;
-- achou → UPDATE com mergeInto(); não achou → INSERT com newNotification()
```

A trava é da transação (solta sozinha no commit/rollback). Teste obrigatório: 5 `notify()` simultâneos do mesmo tipo e registro para a mesma pessoa → **1** notificação com `count = 5`.

## Vindo do módulo antigo (criado pelo tarefas/crm/forms)

Projetos antigos têm `Notification` com `type, actorId, entityType, entityId, data, readAt, emailedAt, createdAt` e `NotificationPreference` com `emailMode` e `disabledTypes`. Migration **aditiva**:

1. `Notification`: adicionar `appId` (preencher pelo prefixo do tipo: `task.`/`sprint.` → `tarefas`, `crm.` → `crm`, `forms.` → `forms`, `agenda.` → `agenda`, `helpdesk.` → `helpdesk`, o resto → `geral`), `actorIds` (`ARRAY["actorId"]` quando houver), `count` (1), `groupKey`, `groupOpenUntil` (null), `url` (montar pelo app a partir de `entityType`/`entityId`; o que não der, `/notificacoes`), `inApp` (true), `emailMode`/`emailStatus` (`emailedAt` preenchido → `SENT`; senão `NONE`: notificação antiga não dispara e-mail atrasado), `updatedAt` (= `createdAt`).
2. `NotificationPreference`: adicionar `digestHour`, `types`, `lastDigestAt`, `updatedAt`; converter `disabledTypes` em `types` (`{ inApp: false, email: "OFF" }` para cada um) e **manter a coluna antiga** por uma versão (deprecada, sem uso), com remoção registrada no README.
3. Os índices novos.
4. Teste da migração: base com dados no formato antigo → depois da migration, lista, contador e preferências respondem igual (mesmos ids, mesmas lidas, tipos desligados continuam desligados).

## Limpeza

Job diário `notifications.cleanup` apaga em lotes de 1.000 (`retentionCutoffs()`): lidas com `readAt` antes de 90 dias e não lidas com `createdAt` antes de 180 dias.
