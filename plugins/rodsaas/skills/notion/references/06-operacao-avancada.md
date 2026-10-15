# 06 · Comentários, histórico e restaurar, arquivos, modelos, permissão por página, databases em lista/calendário/galeria, relações e exportar

O que uma equipe pede depois de escrever as primeiras páginas: **conversar no próprio texto**, **voltar uma versão** quando alguém apaga o parágrafo errado, **pôr arquivo e imagem de verdade** (não só link), **começar de um modelo**, **fechar uma página** só para quem pode, ver a database **como lista, calendário ou galeria**, **ligar uma database à outra** com soma e contagem, e **tirar em PDF**. Tudo **núcleo** (vale para qualquer perfil; `07-perfis-de-segmento.md` decide o que já vem ligado). Regras no `scripts/paginas-lib.mjs` (porte para `api/src/modules/pages/lib/` com os testes). Formatos ★ fazem parte do contrato (grupo `presets.notion`; testes em `suite/tests/35-paginas-operacao.spec.ts`).

## Modelo (somar ao `01-escopo-e-modelo.md`)

```prisma
model PageComment { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; pageId String @db.Uuid; parentId String? @db.Uuid; blockId String?; quote String?; body String; mentions String[]; authorId String @db.Uuid; resolvedAt DateTime?; resolvedById String? @db.Uuid; editedAt DateTime?; deletedAt DateTime?; createdAt DateTime @default(now()) }
model PageVersion { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; pageId String @db.Uuid; version Int; title String; content Json; authorId String @db.Uuid; restoredFromId String? @db.Uuid; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; @@index([organizationId, pageId, createdAt]) }
model PageTemplate { id String @id @default(uuid(7)) @db.Uuid; organizationId String @db.Uuid; name String; tree Json; createdById String @db.Uuid; createdAt DateTime @default(now()) }
// Page ganha access Json? ({ restricted, workspaceLevel?, grants: [{ type: "user" | "role", id, level }] })
// DatabaseProperty ganha config Json @default("{}") (RELATION: { databaseId, twoWay, reversePropertyId }; ROLLUP: { relationPropertyId, propertyId, fn })
// ViewType ganha LIST, CALENDAR, GALLERY
```

RLS `FORCE` em todas; comentário, versão e modelo sempre do mesmo workspace da página (trava no banco).

## Comentários

- ★ `POST /v1/pages/:id/comments` **`{ body, blockId?, quote?, parentId? }`** → 201 **`{ id, body, blockId, quote, parentId, author: { id, name }, createdAt, resolvedAt }`** — no bloco (com o trecho citado) ou na página; `parentId` responde a uma conversa. `validateComment` (vazio, mais de 5.000, bloco que não existe mais, trecho sem bloco) → 400 com `errors[].path`. Menções `@[Nome](userId)` (`extractMentions`) avisam (`page.mentioned`); os outros participantes e quem criou a página recebem `page.commented`. Exige o nível **comentar** (abaixo).
- ★ `GET /v1/pages/:id/comments?status=open|resolved` → **`{ data: [{ id, blockId, quote, resolvedAt, orphaned, comments: [{ id, body, author, createdAt, editedAt }] }] }`** — conversas com as respostas; `orphaned` = o bloco saiu da página (`orphanedThreads`), mostrada no fim como "bloco removido".
- `PATCH /v1/page-comments/:id { body }` (só o autor, `canEditComment`, marca `editedAt`) · `DELETE` (autor ou owner/admin; vira "comentário excluído") · ★ `POST /v1/page-comments/:id/resolve` e `/reopen` (quem comenta na página) → a conversa.
- Tela: destaque amarelo no trecho comentado, balão na margem (`page-comment-mark`, `data-thread-id`), painel lateral de comentários (`page-comments`, `page-comment-input`, `page-comment-submit`, `page-comment-resolve`), contador no topo; atalho Ctrl+Alt+M comenta a seleção.

## Histórico de versões e restaurar

- Cada save (`PATCH /v1/pages/:id`) grava a versão pelo **`shouldSnapshot`**: versão nova quando não há nenhuma, quando mudou o autor ou quando passaram 10 minutos; senão atualiza a última (edição contínua da mesma pessoa vira uma versão só).
- ★ `GET /v1/pages/:id/versions` → **`{ data: [{ id, version, createdAt, author: { id, name }, diff: { added, removed, changed } }] }`** (mais recente primeiro; `diffBlocks` contra a anterior).
- ★ `GET /v1/pages/:id/versions/:versionId` → **`{ id, title, content, createdAt }`** (prévia somente leitura).
- ★ `POST /v1/pages/:id/versions/:versionId/restore` **`{ version }`** → **`{ version, updatedAt }`**: a página volta ao título e conteúdo daquela versão **como uma versão nova** ("Restaurada da versão de 14/10 15:20" — nada se perde, dá para desfazer a restauração); versão da página velha → 409 `VERSION_CONFLICT`. Exige **editar**.
- Retenção por plano (`pruneVersions`, job diário): Free 7 dias, Pro 90 dias, Business sem limite; a mais recente fica sempre.
- Tela: "Histórico" no menu da página (`page-history`), lista à esquerda com autor e o resumo (+2 −1 ~3 blocos), prévia à direita, "Restaurar esta versão" (`page-history-restore`).

## Imagens e arquivos (add-on `uploads`)

- Blocos `image`, `file`, `video`, `audio` e `pdf` com **`props.fileId`** (envio pelo `uploads` com `purpose: page_file` ou `editor_image`; arrastar para a página, colar imagem, "/arquivo"). No save, todo `fileId` do conteúdo precisa ser **da empresa e READY** (senão 400 em `content`, "Arquivo inválido").
- ★ `GET /v1/pages/:id/files` → **`{ data: [{ fileId, name, mimeType, size, url }] }`** — arquivos usados pelo conteúdo atual (`fileIdsInBlocks`), com URL assinada; o público só vê os da página pública.
- Arquivo que sai do conteúdo (`filesToRelease`) continua guardado enquanto alguma versão do histórico o usar; depois o job do `uploads` limpa. Conta na cota do plano.
- Tela: pré-visualização de imagem com legenda e largura, PDF embutido, card de arquivo com ícone, nome e tamanho (`page-file`).

## Modelos

- ★ `POST /v1/page-templates` **`{ name, pageId }`** (salvar a página e as sub-páginas como modelo) **ou** **`{ name, title, content }`** → 201 **`{ id, name }`**; `GET /v1/page-templates` (os do workspace + os do perfil, com `builtin: true`), `DELETE /v1/page-templates/:id` (quem criou ou owner/admin).
- ★ `POST /v1/page-templates/:id/apply` **`{ parentId? }`** → 201 **página** (formato ★ da página): `instantiatePageTemplate` troca `{{data}}`, `{{hoje}}`, `{{autor}}`, `{{workspace}}` nos títulos e textos, cria as sub-páginas junto e conta no limite de páginas.
- Database: "modelo de linha" (a linha nova nasce com o conteúdo e as propriedades do modelo) — `POST /v1/databases/:id/rows { templateId }`.
- Tela: "Modelos" no "Nova página" (`pages-template-pick`, `data-template-id`), "Salvar como modelo" no menu da página.

## Permissão por página

- Níveis `PERMISSION_LEVELS`: **nenhum**, **ver**, **comentar**, **editar**, **total** (compartilhar, permissões, excluir). Sem nada configurado, todo membro tem **total** (como hoje); owner e admin sempre têm total.
- ★ `PUT /v1/pages/:id/access` **`{ restricted, workspaceLevel?, grants: [{ type: "user" | "role", id, level }] }`** (exige total) → **`{ access, level }`**; `validateAccess` (pessoa de fora, papel inválido, nível inválido) → 400 com `errors[].path`. `DELETE` volta a herdar.
- ★ `GET /v1/pages/:id/access` → **`{ access, inheritedFrom: { id, title } | null, level }`** — `effectivePermission`: vale a página mais próxima (ela ou um ancestral) que tem regra; restrita sem você = **nenhum**.
- Aplicação em **todas** as rotas: nenhum → 404 (página, árvore, busca, favoritos, recentes, lixeira, databases e linhas, histórico, comentários, exportação); ver → editar conteúdo, propriedades, mover e excluir respondem 403 `FORBIDDEN`; comentar → só comenta. Linha de database herda da database.
- Tela: "Compartilhar" ganha a aba **Acesso** (`page-access`, `page-access-restricted`, `page-access-grant` com `data-user` e `data-level`), cadeado na árvore para página restrita, aviso "herdado de …".

## Databases: lista, calendário e galeria

- Visões novas `LIST` (título e propriedades escolhidas em linhas), `CALENDAR` (`config.dateProperty` obrigatório, do tipo data → senão 400 em `config.dateProperty`) e `GALLERY` (`config.coverProperty?` URL; senão a primeira imagem do conteúdo da linha, `galleryCard`).
- ★ `GET /v1/databases/:id/rows?viewId=&month=AAAA-MM` aplica **filtro e ordenação da visão no servidor** (`applyView`: todas as condições; `contains`, `is`, `is_not`, `gt`, `lt`, `before`, `after`, `is_empty`, `is_not_empty`, `checked`, `unchecked`; vazios no fim) e devolve, conforme o tipo: calendário **`{ data, calendar: { days: { "AAAA-MM-DD": [ids] }, undated: [ids] } }`** (`calendarMonth`; período ocupa cada dia), galeria cada linha com **`cover`**.
- Tela: abas de visão com os ícones novos (`db-view-tab` com `data-view-type`), lista (`db-list-row`), calendário do mês com navegação e arrastar a linha para outro dia (`db-calendar`, `db-calendar-day` com `data-date`, `db-calendar-item`), galeria em cards (`db-gallery`, `db-gallery-card` com `data-page-id`).

## Relações e rollup

- Propriedade **`RELATION`** `config: { databaseId, twoWay }`: valor = lista de ids de linhas da database alvo (`validateRelation`: outra database, repetida, mais de 100 → 400 em `properties.<id>`). Com `twoWay`, a database alvo ganha a propriedade de volta ("Relacionado a Projetos", `config.reversePropertyId`) e os dois lados se mantêm (`relationDiff`).
- Propriedade **`ROLLUP`** `config: { relationPropertyId, propertyId, fn }` (`ROLLUP_FNS`: contar, contar vazios, somar, média, mínimo, máximo, % marcados) — **calculada** na leitura das linhas (`rollup`), nunca gravada nem aceita no PATCH.
- ★ `POST /v1/databases/:id/properties` aceita `RELATION`/`ROLLUP` com `config`; database alvo de outro workspace ou propriedade do rollup que não existe → 400 em `config.*`. Excluir a relação apaga a de volta e os rollups que dependem dela (o front avisa).
- Tela: célula de relação com as linhas em "chips" e seletor com busca; rollup somente leitura com o formato da propriedade de origem.

## Exportar

- ★ `GET /v1/pages/:id/export?format=pdf|html|md` (exige ver): **PDF** gerado no servidor a partir do `blocksToHtml` (HTML escapado; links e imagens só http/https) com o tema de impressão da marca, título, data e numeração de páginas; **HTML** e **Markdown** (`blocksToMarkdown`) para levar a outro lugar. `Content-Disposition: attachment; filename="<título>.pdf"`. Com sub-páginas: `?include=children` gera um ZIP.
- Tela: "Exportar" no menu da página (`page-export` com `data-format`).

## Planos, avisos e erros

| | Free | Pro | Business |
|---|---|---|---|
| comentários, arquivos (cota do `uploads`), modelos, exportar | ✅ | ✅ | ✅ |
| histórico de versões | 7 dias | 90 dias | sem limite |
| feature `page_permissions` (permissão por página) | — | ✅ | ✅ |
| feature `page_databases_plus` (relação, rollup, calendário e galeria) | — | ✅ | ✅ |

Avisos novos no catálogo do `notificacoes` (grupo Páginas): `page.commented`, `page.mentioned`, `page.review_due` (perfil manual de processos). Erros novos: `FORBIDDEN` com o nível que falta no `detail`.

## Testes obrigatórios

- Comentários: vazio e bloco inexistente 400; menção avisa; resolver e reabrir; conversa órfã quando o bloco sai; quem só vê não comenta (403).
- Histórico: edições seguidas da mesma pessoa viram uma versão; outra pessoa abre outra; restaurar volta o conteúdo como versão nova; versão velha 409.
- Arquivos: `fileId` de outra empresa ou não concluído 400; lista com URL.
- Modelos: salvar a página como modelo e aplicar com as variáveis trocadas e as sub-páginas.
- Permissão: restrita some (404) para quem não está, inclusive da árvore e da busca; "ver" não edita (403); filha herda; owner sempre vê; sem a feature 403.
- Databases: calendário sem propriedade de data 400; calendário do mês com período; galeria com capa; filtro e ordenação no servidor.
- Relação: linha de outra database 400; mão dupla atualiza o outro lado (inclusive ao tirar); rollup soma.
- Exportar: Markdown com títulos e listas; HTML escapa `<script>`; PDF com `application/pdf`; sem acesso 404.
