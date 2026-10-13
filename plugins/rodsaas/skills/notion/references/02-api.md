# API

Todas as rotas seguem o padrão da base: `/v1`, tenant pelo token, `withTenant`, schemas Zod de entrada **e** saída, erros RFC 9457, paginação por cursor onde houver lista, `config` declarativo (`roles`, `limit`, `feature`, `idempotent`, `audit`).

## Páginas

| Rota | Config | Faz |
|---|---|---|
| `GET /v1/pages/tree` | — | árvore leve do workspace para o menu: `id, parentId, type, title, icon, position, hasChildren`, sem arquivadas e **sem linhas de database** |
| `GET /v1/pages/:id` | — | página completa (com `content`, `version`, `lastEditedBy`, `updatedAt`) + `breadcrumbs` (ancestrais com id, título e ícone) + `isFavorite`; registra a visita em `PageVisit` (upsert) |
| `POST /v1/pages` | `limit: 'pages'` (exceto linha de database), idempotente, audit | `{ parentId?, type?, title?, afterId? }`; posição no fim dos irmãos ou depois de `afterId`; devolve a página criada |
| `PATCH /v1/pages/:id` | — | `{ version, title?, content? }` → versão nova; 409 `VERSION_CONFLICT` se a versão estiver velha. Body limit desta rota: 2 MB |
| `PATCH /v1/pages/:id/meta` | — | `{ icon?, cover?, fullWidth? }`, sem versão |
| `POST /v1/pages/:id/move` | audit | `{ parentId: string \| null, beforeId?, afterId? }`; valida mesmo workspace, não arquivado e **sem ciclo** (400 `INVALID_MOVE`) |
| `POST /v1/pages/:id/duplicate` | `limit: 'pages'`, idempotente | copia a página e os descendentes (título com " (cópia)"), logo abaixo da original |
| `DELETE /v1/pages/:id` | audit | manda para a lixeira com os descendentes |
| `GET /v1/trash` | — | páginas raiz da lixeira (`archivedRootId = id`), busca por título, cursor |
| `POST /v1/trash/:id/restore` | audit | restaura o lote; volta para a raiz se o pai não existir mais |
| `DELETE /v1/trash/:id` | owner/admin ou criador · audit | exclui de vez (com descendentes, valores, favoritos, visitas, link público) |
| `PUT /v1/pages/:id/favorite` / `DELETE` | — | favorita/desfavorita para o usuário atual |
| `GET /v1/pages/favorites` | — | favoritos do usuário na ordem dele |
| `POST /v1/pages/favorites/reorder` | — | `{ pageId, beforeId?, afterId? }` |
| `GET /v1/pages/recent` | — | últimas visitas do usuário (até 20), sem arquivadas |

Regras de cada operação: `01-escopo-e-modelo.md`.

### Conteúdo

- `content` é a lista de blocos do editor (JSON). Valide como **array de objetos** com tamanho máximo, sem tentar espelhar o schema inteiro do editor (ele evolui).
- No save, o backend:
  1. **sanitiza links**: qualquer `href`/`url` que não seja `http:`, `https:`, `mailto:` ou link interno (`/pagina/<id>`) é removido;
  2. extrai `contentText` para a busca;
  3. atualiza `lastEditedById`.
- Menções de página guardam o id; a resposta do `GET` não precisa resolver títulos (o front resolve pelo cache da árvore).

## Busca

`GET /v1/search?q=texto&limit=20&cursor=...`

```sql
SELECT id, title, icon, type, "parentId",
       ts_headline('portuguese', "contentText", q, 'MaxWords=18, MinWords=8, StartSel=<mark>, StopSel=</mark>') AS snippet,
       ts_rank(search, q) AS rank
FROM "Page", websearch_to_tsquery('portuguese', $1) q
WHERE "organizationId" = $2 AND "archivedAt" IS NULL AND search @@ q
ORDER BY rank DESC, id DESC
LIMIT $3
```

- Rode dentro do `withTenant` (RLS ativo) e **também** com o filtro de `organizationId`.
- `q` vazio → 400; menos de 2 caracteres → busca só por prefixo de título (`ILIKE 'texto%'`).
- O trecho volta com `<mark>`; o front renderiza **escapando todo o resto** (nunca `dangerouslySetInnerHTML` com o snippet cru — troque só as marcas por elementos).

## Databases

Uma database é uma `Page` com `type: DATABASE`. As **linhas são páginas filhas** dela: cada linha tem título, conteúdo próprio e `properties`.

| Rota | Config | Faz |
|---|---|---|
| `GET /v1/databases/:id` | — | propriedades, visões e metadados da database |
| `POST /v1/databases/:id/properties` | — | `{ name, type, options? }` |
| `PATCH /v1/databases/:id/properties/:propertyId` | — | renomear, opções, mudar tipo (ver regra abaixo) |
| `DELETE /v1/databases/:id/properties/:propertyId` | — | remove a propriedade e o valor dela de todas as linhas |
| `POST /v1/databases/:id/properties/reorder` | — | posição |
| `POST /v1/databases/:id/views` / `PATCH` / `DELETE .../views/:viewId` | — | visões e `config` |
| `GET /v1/databases/:id/rows?viewId=&cursor=&limit=` | — | linhas aplicando filtro e ordenação da visão; quadro: agrupado por `groupBy` |
| `POST /v1/databases/:id/rows` | idempotente | `{ title?, properties?, afterId? }` (não conta no limite de páginas) |
| `PATCH /v1/pages/:id/properties` | — | `{ [propertyId]: valor }`, validado pelo tipo |

### Valores por tipo

| Tipo | Valor guardado | Validação |
|---|---|---|
| TEXT | string | até 2.000 caracteres |
| NUMBER | number | finito |
| SELECT | id da opção | precisa existir em `options` |
| MULTI_SELECT | lista de ids | todos existentes, sem repetição |
| DATE | `{ start: ISO, end?: ISO }` | datas válidas, `end >= start` |
| CHECKBOX | boolean | — |
| PERSON | lista de userIds | todos **membros do workspace** |
| URL | string | `http`/`https` |

Valor inválido → 400 `VALIDATION_ERROR` com `errors[].path = properties.<propertyId>`.

**Mudar o tipo de uma propriedade** converte o que dá (texto ↔ número quando numérico, seleção ↔ texto pelo nome da opção) e descarta o resto. O front avisa antes.

### Filtro, ordenação e agrupamento (`config` da visão)

```json
{
  "filters": [{ "propertyId": "...", "op": "is|is_not|contains|gt|lt|is_empty|is_not_empty|checked|unchecked|before|after", "value": "..." }],
  "sorts": [{ "propertyId": "...|title|createdAt", "direction": "asc|desc" }],
  "groupBy": "<propertyId do tipo SELECT>",
  "visibleProperties": ["..."],
  "columnWidths": { "<propertyId>": 180 }
}
```

- Aplique no servidor com consultas sobre o `jsonb` (`properties->>'<id>'`), sempre com parâmetros (o id da propriedade vem validado contra as propriedades da database; nunca interpole texto do cliente no SQL).
- Quadro: as colunas são as opções do `groupBy` na ordem delas, mais "Sem status". Arrastar um card = `PATCH /v1/pages/:id/properties` + `POST /v1/pages/:id/move` para a nova posição.
- Se a database ficar grande, crie índices de expressão para as propriedades mais filtradas; na v1, não é necessário.

## Compartilhamento público

| Rota | Config | Faz |
|---|---|---|
| `GET /v1/pages/:id/share` | — | `{ enabled, url }` |
| `PUT /v1/pages/:id/share` | `feature: 'public_pages'` · audit | liga: cria `PublicShare` com token aleatório (32 bytes) e devolve a URL `APP_URL/publico/<token>` |
| `DELETE /v1/pages/:id/share` | audit | desliga (apaga o token; o link antigo para de funcionar na hora) |
| `GET /v1/public/pages/:token` | `public: true`, rate limit por IP | busca `PublicShare` pelo token (tabela sem RLS), abre `withTenant(organizationId)` e devolve **só** `title, icon, cover, fullWidth, content, updatedAt` e o nome do workspace |

Regras do link público:
- Mostra só aquela página. Sub-páginas e links internos aparecem como texto, sem navegar (na v1).
- Página arquivada ou excluída → 404, mesmo com token válido.
- Rebaixar o plano para um sem `public_pages` desliga os links da organização (no processamento do webhook da Stripe).
- Resposta com `Cache-Control: no-store` e `X-Robots-Tag: noindex`.

## Códigos de erro novos

| code | Status | Quando |
|---|---|---|
| `VERSION_CONFLICT` | 409 | `PATCH` de conteúdo com versão velha; `detail` diz quem editou e quando, e a resposta inclui `currentVersion` |
| `INVALID_MOVE` | 400 | mover para dentro de si mesma/descendente, para outro workspace ou para página arquivada |

Acrescente ao catálogo do backend e ao `error-messages.ts` do front.

## Testes obrigatórios

- isolamento: usuário de outro workspace recebe 404 em todas as rotas com `:id` (página, database, propriedade, visão, lixeira, compartilhamento);
- mover: ciclo direto e indireto → `INVALID_MOVE`; reordenar mantém a ordem; posições continuam ordenadas depois de 50 inserções no mesmo lugar;
- conflito: dois `PATCH` com a mesma versão → o segundo recebe 409;
- lixeira: excluir pai arquiva os filhos; restaurar volta o lote; pai excluído de vez → restaura na raiz; arquivadas somem da busca e da árvore;
- busca: acha por palavra do conteúdo e por variação ("relatórios" acha "relatório"); não acha de outro workspace nem da lixeira;
- databases: cada tipo aceita o válido e rejeita o inválido; PERSON rejeita quem não é membro; filtro e ordenação corretos; excluir propriedade limpa os valores;
- público: token inválido 404; página arquivada 404; resposta não traz campos internos; desligar invalida na hora; plano sem `public_pages` → 403 `FEATURE_NOT_IN_PLAN`;
- sanitização: `javascript:` em link some do conteúdo salvo;
- limite: no `free`, a 101ª página → `PLAN_LIMIT_REACHED`; linhas de database não contam;
- workspace novo nasce com "Comece aqui" e "Tarefas".
