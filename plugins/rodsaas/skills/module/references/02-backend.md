# Geração da API

Siga a estrutura de módulo da skill `backend` (`references/08-modulos.md`): `routes`, `schemas`, `service`, `repository`, `test`, em `api/src/modules/<name>/`. Abaixo, o que cada parte recebe a partir da especificação.

## Model e migration

```prisma
enum AppointmentStatus { SCHEDULED DONE CANCELED }

model Appointment {
  id             String            @id @default(uuid(7)) @db.Uuid
  organizationId String            @db.Uuid
  title          String
  clientId       String            @db.Uuid
  client         Client            @relation(fields: [clientId], references: [id], onDelete: Restrict)
  startsAt       DateTime
  price          Int?                                     // centavos
  status         AppointmentStatus @default(SCHEDULED)
  assigneeId     String?           @db.Uuid
  notes          String?
  createdById    String            @db.Uuid
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  @@index([organizationId, id])
  @@index([organizationId, startsAt, id])                  // um índice por campo ordenável/filtrável principal
  @@index([organizationId, clientId])
}
```

- Nome da tabela = model (padrão Prisma). Campos opcionais = `?`.
- `unique: true` vira `@@unique([organizationId, campo])`: único **dentro da empresa** (duas empresas podem ter o mesmo CPF de cliente).
- No model alvo da relação, acrescente o lado inverso (`appointments Appointment[]`).

Crie com `prisma migrate dev --create-only`, **revise o SQL**, acrescente o bloco abaixo e só então aplique:

```sql
-- isolamento (igual a toda tabela de negócio da base)
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Appointment"
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- relação nunca aponta para registro de outra empresa
CREATE TRIGGER "Appointment_clientId_same_org"
  BEFORE INSERT OR UPDATE OF "clientId" ON "Appointment"
  FOR EACH ROW EXECUTE FUNCTION rodsaas_assert_same_org('Client', 'clientId');
```

### Relações seguras entre empresas

Uma foreign key comum só garante que o cliente **existe**, não que é da mesma empresa (a checagem de FK do Postgres ignora RLS). Por isso toda `relation` ganha o trigger acima. A função é criada **uma vez** no projeto, na primeira migration que precisar dela:

```sql
CREATE OR REPLACE FUNCTION rodsaas_assert_same_org() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_table text := TG_ARGV[0];
  fk_column    text := TG_ARGV[1];
  fk_value     uuid := (to_jsonb(NEW) ->> fk_column)::uuid;
  found        boolean;
BEGIN
  IF fk_value IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND "organizationId" = $2)', target_table)
    INTO found USING fk_value, NEW."organizationId";
  IF NOT found THEN
    RAISE EXCEPTION 'referência a registro de outra empresa ou inexistente (%.%)', TG_TABLE_NAME, fk_column
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
```

O código **também** confere (o service busca o alvo com `organizationId` antes de gravar e devolve 400 no campo). O trigger é a segunda camada, para o dia em que alguém esquecer.

`user` (membro) segue a mesma ideia: o service confere que o userId tem `Membership` na empresa.

## Schemas (Zod)

Gere três schemas a partir da tabela de tipos (`01-especificacao.md`):

- `Create<Model>Body`: objeto **estrito**; `required` → obrigatório; demais opcionais/nullable; limites e validações BR por tipo.
- `Update<Model>Body`: o de criação com tudo opcional (PATCH).
- `<Model>Schema` (saída): todos os campos + `id`, `createdAt`, `updatedAt`, `createdBy` (id e nome) e, para cada `relation`, o objeto resumido do alvo (`{ id, title }`) e para `user`, `{ id, name }`. `decimal`/`percent` saem como **string** (não perdem precisão).

Registre os schemas **com nome** para o OpenAPI (o front gera os tipos deles).

### Query da lista (`List<Model>Query`)

Paginação da base + filtros pelo tipo, com nomes previsíveis:

| Tipo do campo filtrável | Parâmetros |
|---|---|
| `status`, `select` | `status=SCHEDULED,DONE` (lista separada por vírgula) |
| `relation` | `clientId=<uuid>` |
| `user` | `assigneeId=<uuid>` |
| `boolean` | `active=true` |
| `date`, `datetime` | `startsAtFrom`, `startsAtTo` |
| `integer`, `decimal`, `money`, `percent` | `priceMin`, `priceMax` |
| `tags` | `tags=a,b` (contém todas) |
| `address` | `addressState=PR` |
| busca | `q` (procura nos campos com `search: true`, sem diferenciar maiúsculas) |
| ordenação | `sort=startsAt` ou `sort=-startsAt` (só campos com `sort: true` ou `createdAt`) |

## Repository

- Toda query com `organizationId` no `where`, dentro do `withTenant`.
- Busca: `OR` de `contains` + `mode: 'insensitive'` nos campos de busca. (Tabelas grandes: índice trigram exige a extensão `pg_trgm`, criada pelo admin do banco; registre como melhoria se fizer falta.)
- Inclui os resumos das relações (`include`/`select` só de `id` e campo de título do alvo).

### Cursor com ordenação

A base pagina por `id`. Com `sort`, o cursor carrega `(valor, id)`:

```ts
// cursor = base64url(JSON.stringify({ v: <valor do campo de ordenação>, id }))
// asc:  WHERE (campo > v) OR (campo = v AND id > id)  ORDER BY campo ASC,  id ASC
// desc: WHERE (campo < v) OR (campo = v AND id < id)  ORDER BY campo DESC, id DESC
```

Por isso `sort: true` só vale para campo **obrigatório** (sem nulos), o que o validador garante. Cursor inválido → 400.

## Service

- Monta os dados **campo a campo** (nada de espalhar o body).
- Normaliza: e-mail minúsculo; telefone, CPF, CEP só dígitos; CNPJ maiúsculo sem pontuação.
- Confere relações (`relation` existe na mesma empresa) e membros (`user` é membro); erro no campo certo.
- `onlyOwnRecords`: MEMBER só edita/exclui o que tem `createdById` igual ao dele → 403 `FORBIDDEN` ("Você só pode alterar registros criados por você"). Owner/admin passam.
- Excluir com `onDelete: restrict` no módulo que aponta para este: conte os dependentes antes; se houver → 409 `CONFLICT` com "Existem 3 agendamentos ligados a este cliente".
- Erros do Prisma: `P2002` (único) → 409 no campo; `P2003` (FK/trigger) → 400 no campo da relação.

## Rotas

| Rota | Config |
|---|---|
| `GET /v1/<name-kebab>` | lista com filtros, busca, ordenação, cursor |
| `GET /v1/<name-kebab>/options?q=` | `{ id, title }[]` (até 20), para os selects de relação de outros módulos |
| `GET /v1/<name-kebab>/:id` | detalhe |
| `POST /v1/<name-kebab>` | `roles: permissions.create`, `idempotent`, `limit` (se `planLimit`), `audit: '<name>.created'` |
| `PATCH /v1/<name-kebab>/:id` | `roles: permissions.update`, `audit: '<name>.updated'` |
| `DELETE /v1/<name-kebab>/:id` | `roles: permissions.delete`, `audit: '<name>.deleted'` |

Path da API em inglês kebab-case (`/v1/service-orders`); a rota do painel é a em português.

Registre o plugin de rotas em `app.ts`. Com `planLimit`, acrescente o contador em `lib/usage.ts` e a chave em **todos** os planos de `config/plans.ts` (pergunte os números ou use: free 50, pro 1.000, business ilimitado) e no retorno de uso do `/v1/me`.

## Testes (`<name>.test.ts`)

- CRUD completo e paginação sem itens repetidos/perdidos (com e sem `sort`).
- **Isolamento**: outra empresa recebe 404 em detalhe, edição e exclusão; a lista dela não mostra nada.
- **Relação cruzada**: criar apontando para registro de outra empresa → 400 (e o trigger bloqueia mesmo chamando o repository direto).
- `restrict`: excluir o alvo com dependentes → 409; `cascade`: exclui junto.
- Permissões por papel; `onlyOwnRecords`.
- Validação de cada tipo usado (um válido e um inválido por campo especial: CPF, CNPJ, telefone, e-mail, URL, CEP, status fora das opções).
- `unique` por empresa: repetir na mesma → 409; em outra → ok.
- Filtros e busca retornam o esperado.
- Limite de plano, se houver.
