# Escopo e modelo de dados

## O que entra na v1

| Área | Funcionalidades |
|---|---|
| **Páginas** | árvore aninhada sem limite de profundidade, título, ícone (emoji), capa (degradês da marca ou URL de imagem), largura cheia, duplicar, mover (arrastar ou "Mover para…"), copiar link |
| **Editor** | blocos: parágrafo, títulos 1–3, lista com marcadores, lista numerada, to-do, toggle, citação, callout, divisor, código, imagem por URL, link para página; menu "/", atalhos markdown, arrastar blocos, formatação inline (negrito, itálico, sublinhado, tachado, código, link, cor), menção de página com "@" |
| **Salvamento** | autosave com debounce, indicador "Salvando…/Salvo", versão para detectar edição simultânea |
| **Organização** | favoritos (por usuário), recentes (por usuário), lixeira com restaurar e excluir de vez (limpeza automática após 30 dias) |
| **Busca** | Ctrl+K em títulos e conteúdo, em português, com trecho destacado |
| **Databases** | propriedades texto, número, seleção, múltipla seleção, data, checkbox, pessoa, URL; visões **tabela** e **quadro**; filtro, ordenação e agrupamento; cada linha é uma página que abre no side peek |
| **Compartilhar** | link público somente leitura por página (feature `public_pages` do plano) |
| **Início** | páginas recentes e favoritas, atalho para nova página |
| **Workspace novo** | já nasce com páginas de exemplo ("Comece aqui" e um database "Tarefas" com quadro) |

## Fora da v1

Edição colaborativa em tempo real, comentários, histórico de versões, upload de arquivos, templates, permissões por página, integrações, exportar PDF/Markdown. Registre no README como próximos passos.

## Models (Prisma)

```prisma
enum PageType { DOCUMENT DATABASE }

model Page {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  parentId       String?   @db.Uuid                  // null = raiz do workspace
  type           PageType  @default(DOCUMENT)
  title          String    @default("")
  icon           String?                              // emoji
  cover          String?                              // "gradient:<n>" ou URL https
  fullWidth      Boolean   @default(false)
  content        Json      @default("[]")             // documento do editor (lista de blocos)
  contentText    String    @default("")               // texto puro extraído do content, para a busca
  properties     Json      @default("{}")             // valores de propriedades quando a página é linha de database
  position       String                               // índice fracionário entre irmãos (collation "C")
  version        Int       @default(1)
  archivedAt     DateTime?
  archivedRootId String?   @db.Uuid                   // página que foi para a lixeira e "levou" esta junto
  createdById    String    @db.Uuid
  lastEditedById String    @db.Uuid
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  search         Unsupported("tsvector")?             // coluna gerada (ver abaixo)
  parent         Page?     @relation("PageTree", fields: [parentId], references: [id], onDelete: Cascade)
  children       Page[]    @relation("PageTree")
  @@index([organizationId, parentId, position])
  @@index([organizationId, archivedAt])
}

model PageFavorite {
  organizationId String   @db.Uuid
  userId         String   @db.Uuid
  pageId         String   @db.Uuid
  position       String
  createdAt      DateTime @default(now())
  @@id([userId, pageId])
  @@index([organizationId, userId])
}

model PageVisit {
  organizationId String   @db.Uuid
  userId         String   @db.Uuid
  pageId         String   @db.Uuid
  visitedAt      DateTime @default(now())
  @@id([userId, pageId])
  @@index([organizationId, userId, visitedAt])
}

enum PropertyType { TEXT NUMBER SELECT MULTI_SELECT DATE CHECKBOX PERSON URL }

model DatabaseProperty {
  id             String       @id @default(uuid(7)) @db.Uuid
  organizationId String       @db.Uuid
  databaseId     String       @db.Uuid                // Page do tipo DATABASE
  name           String
  type           PropertyType
  options        Json         @default("[]")          // SELECT/MULTI_SELECT: [{ id, name, color }]
  position       String
  @@index([organizationId, databaseId])
}

enum ViewType { TABLE BOARD }

model DatabaseView {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  databaseId     String   @db.Uuid
  name           String
  type           ViewType
  config         Json     @default("{}")              // filtros, ordenação, groupBy, propriedades visíveis, larguras
  position       String
  @@index([organizationId, databaseId])
}

model PublicShare {                                   // SEM RLS: resolve token → workspace antes de existir tenant
  token          String   @id                         // 32 bytes aleatórios, base64url
  organizationId String   @db.Uuid
  pageId         String   @unique @db.Uuid
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())
}
```

Confira na doc atual do Prisma a forma de declarar coluna `tsvector` gerada sem o `migrate dev` acusar diferença ("drift"). Se a versão instalada não lidar bem, mantenha a coluna só no SQL e documente no README.

## RLS

`Page`, `PageFavorite`, `PageVisit`, `DatabaseProperty`, `DatabaseView`: **RLS com `FORCE`** e a mesma policy de `organizationId` da base (`05-multi-tenant.md` do backend). `PublicShare` fica sem RLS, como as outras tabelas "de roteamento" da base, protegida por filtro explícito e testes.

## SQL extra na migration

```sql
-- ordem de irmãos: índice fracionário precisa de comparação byte a byte, não da collation do idioma
ALTER TABLE "Page" ALTER COLUMN "position" TYPE text COLLATE "C";
ALTER TABLE "PageFavorite" ALTER COLUMN "position" TYPE text COLLATE "C";
ALTER TABLE "DatabaseProperty" ALTER COLUMN "position" TYPE text COLLATE "C";
ALTER TABLE "DatabaseView" ALTER COLUMN "position" TYPE text COLLATE "C";

-- busca em português (título pesa mais que conteúdo)
ALTER TABLE "Page" DROP COLUMN IF EXISTS "search";
ALTER TABLE "Page" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('portuguese', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('portuguese', coalesce("contentText", '')), 'B')
) STORED;
CREATE INDEX "Page_search_idx" ON "Page" USING GIN ("search");
```

Busca sem acento ("relatorio" achar "relatório") exige a extensão `unaccent`, que só o admin do banco cria. Se o usuário quiser, crie a extensão com o admin (modo do `/rodsaas:db`) e use uma configuração de busca com `unaccent`; senão, registre como melhoria.

## Regras

### Ordem (índice fracionário)
- `position` é uma string gerada entre a do vizinho de cima e a do de baixo (lib `fractional-indexing` ou equivalente atual). Mover = gerar uma posição nova; nunca renumerar todos os irmãos.
- Nova página sem destino definido vai para o fim dos irmãos.

### Árvore
- `parentId` só pode apontar para página do **mesmo workspace**, não arquivada.
- **Mover não pode criar ciclo**: o novo pai não pode ser a própria página nem um descendente dela. Verifique com CTE recursiva dos ancestrais do novo pai; se a página aparecer → 400 `INVALID_MOVE`.
- Linha de database: `parentId` = id do database. Mover uma linha para fora do database descarta os valores de propriedade (pergunte no front).

### Lixeira
- "Excluir" arquiva a página **e todos os descendentes**, numa transação: `archivedAt = now()` e `archivedRootId = <id da página clicada>` nos descendentes.
- Restaurar desarquiva tudo que tem aquele `archivedRootId`. Se o pai original estiver arquivado ou não existir mais, a página volta para a raiz.
- Excluir de vez: só da lixeira; owner/admin ou quem criou. Job diário do pg-boss apaga o que está na lixeira há mais de 30 dias.
- Páginas arquivadas não aparecem na árvore, na busca, nos favoritos nem nos recentes; o link público delas para de funcionar.

### Versão (edição simultânea)
- Todo `PATCH` de conteúdo manda a `version` que o cliente tem. O update só acontece com `where: { id, organizationId, version }` e incrementa a versão.
- Nada atualizado + página existe → 409 `VERSION_CONFLICT` com a versão atual e quem editou por último.
- Mudanças de metadados que não conflitam (ícone, capa, largura, mover, favoritar) não exigem versão.

### Texto para busca
O backend extrai `contentText` do `content` a cada save: percorre os blocos e filhos recursivamente, junta os textos, limita o tamanho. O front nunca manda `contentText`.

### Páginas iniciais
Ao criar um workspace (no cadastro e em `POST /v1/organizations`), na mesma transação:
- **"Comece aqui"**: título, callout de boas-vindas, lista de to-dos ("Crie uma página", "Use / para inserir blocos", "Convide sua equipe"), um toggle com dicas de atalhos.
- **"Tarefas"** (database): propriedades Status (seleção: A fazer, Fazendo, Feito), Responsável (pessoa), Prazo (data); visões "Quadro" (agrupado por Status) e "Tabela"; três linhas de exemplo.

### Limites do plano
- `pages`: conta páginas **não arquivadas** do tipo DOCUMENT e DATABASE que não são linhas de database (linhas não contam, como no Notion). Contador em `lib/usage.ts`.
- `public_pages`: feature exigida para ligar o link público.
