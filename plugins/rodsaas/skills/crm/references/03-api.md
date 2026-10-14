# API

Padrão da base em tudo: `/v1`, tenant do token, `withTenant`, schemas Zod de entrada (estritos) e saída (com nome no OpenAPI), RFC 9457, cursor, `config` declarativo (`roles`, `limit`, `feature`, `idempotent`, `audit`). Toda rota de negócio/lead/atividade/anotação/anexo/evento aplica os helpers de visibilidade (`02-modelo.md`): o que a pessoa não vê responde **404**.

Os formatos marcados com ★ fazem parte do **contrato testável** (`skills/verify/contract.json`, grupo `crm`): mantenha nomes de rota e de campo exatamente assim.

## Configurações, funis e listas

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/crm/settings` | — | `{ visibility: 'ALL' \| 'OWN', requireLostReason, defaultPipelineId, whatsappTemplate }` |
| ★ `PATCH /v1/crm/settings` | owner/admin · audit | qualquer campo acima |
| ★ `GET /v1/crm/pipelines` | — | `{ data: [{ id, name, isDefault, archivedAt, stages: [{ id, name, position, probability, rottingDays }] }] }` na ordem; `?archived=true` inclui arquivados |
| `POST /v1/crm/pipelines` | owner/admin · `limit: 'crmPipelines'` | `{ name, stages?: [{ name, probability?, rottingDays? }] }` (sem etapas: copia as do padrão) |
| `PATCH /v1/crm/pipelines/:id` | owner/admin | nome, posição, `isDefault: true` |
| `POST /v1/crm/pipelines/:id/archive` · `unarchive` | owner/admin | arquivar o padrão exige outro padrão antes |
| `DELETE /v1/crm/pipelines/:id` | owner/admin · audit | `{ moveToPipelineId?, moveToStageId? }` obrigatórios se houver negócios (`PIPELINE_HAS_DEALS`); último funil → `LAST_PIPELINE` |
| `POST/PATCH/DELETE /v1/crm/pipelines/:id/stages[/:stageId]` | owner/admin | criar, renomear, probabilidade, dias de alerta, reordenar (`beforeId`/`afterId`); `DELETE` exige `{ moveToStageId }` se houver negócios; última etapa → `LAST_STAGE` |
| ★ `GET /v1/crm/lost-reasons` · `POST/PATCH/DELETE` | escrita owner/admin | lista ordenada; excluir com uso = arquivar |
| `GET /v1/crm/sources` · `POST/PATCH/DELETE` | escrita owner/admin | idem |
| `GET /v1/crm/tags` · `POST/PATCH/DELETE` | criar: todos; editar/excluir: owner/admin | `{ name, color }` (tokens do tema) |
| `GET /v1/crm/custom-fields?entity=` · `POST/PATCH` · `POST .../archive` · `DELETE` | escrita owner/admin · `limit: 'crmCustomFields'` no POST e no desarquivar | `DELETE` exige `{ confirmLabel }` e agenda a limpeza |
| `POST /v1/crm/sample-data` · `DELETE /v1/crm/sample-data` | owner/admin · idempotente | carrega/apaga os dados de exemplo (3 empresas, 6 contatos, 8 negócios em etapas diferentes, 2 ganhos, 1 perdido, atividades de hoje/atrasada/futura, 2 leads) |

## Empresas

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/crm/companies` | — | lista com filtros (abaixo) e cursor; item: `{ id, name, legalName, cnpj, segment, phone, email, addressCity, addressState, owner, tagIds, openDeals: { count, value }, customFields, createdAt }` |
| ★ `POST /v1/crm/companies` | `limit: 'crmContacts'`, idempotente | campos do model (`{ name, legalName?, cnpj?, phone?, email?, ... }` → `{ id, name, ... }`); CNPJ repetido → 409 `COMPANY_DUPLICATE` `{ existing: { id, name } }` |
| ★ `GET /v1/crm/companies/:id` | — | detalhe + `contacts: [{ id, name, isPrimary }]` + **`deals: [DealCard]`** (visíveis, abertos primeiro) + resumo (abertos, ganhos, perdidos, valores) |
| `PATCH /v1/crm/companies/:id` · `DELETE` · `POST .../restore` | excluir: criador, responsável ou owner/admin | soft delete com desfazer |
| `PUT /v1/crm/companies/:id/contacts/:contactId` · `DELETE` | — | ligar/desligar contato (`{ isPrimary?, role? }`) |
| `GET /v1/crm/lookup/cnpj/:cnpj` | rate limit 20/min por usuário | dados públicos do CNPJ (abaixo) |

### Busca por CNPJ
- O backend consulta um serviço público de CNPJ (ex.: BrasilAPI `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`; confira a documentação atual e, se quiser, um segundo serviço de reserva), com **timeout de 5 s**, e guarda o resultado por 7 dias em `CrmCnpjCache (cnpj @id, data Json, fetchedAt)`, tabela **sem RLS** (dado público, sem empresa).
- Devolve `{ legalName, name, segment (descrição do CNAE principal), phone, email, address: {...}, status (situação cadastral), openedAt }` já normalizado. Situação diferente de "ATIVA" vem com aviso para o front mostrar.
- CNPJ alfanumérico ainda sem suporte no serviço, CNPJ inexistente ou serviço fora: `404 CNPJ_NOT_FOUND` ou `503 CNPJ_LOOKUP_UNAVAILABLE`; o front deixa preencher à mão sem travar nada.

## Contatos

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/crm/contacts` | — | lista com filtros e cursor; item: `{ id, name, jobTitle, email, phone, phoneIsWhatsapp, company: { id, name } \| null (principal), owner, tagIds, openDeals: { count, value }, lastActivityAt, customFields }`; `?q=` serve ao `RelationSelect` |
| ★ `POST /v1/crm/contacts` | `limit: 'crmContacts'`, idempotente | `{ name, email?, phone?, phoneIsWhatsapp?, jobTitle?, cpf?, birthday?, companyId?, ownerId?, tagIds?, customFields? }` (`companyId` vira a empresa principal); e-mail ou CPF repetido → **409 `CONTACT_DUPLICATE` `{ existing: { id, name } }`** |
| ★ `GET /v1/crm/contacts/:id` | — | detalhe + `companies: [{ id, name, isPrimary }]` + **`deals: [DealCard]`** (visíveis, abertos primeiro) + próximas atividades |
| `PATCH` · `DELETE` · `POST .../restore` | idem empresas | — |
| `GET /v1/crm/duplicates?email=&phone=&cpf=&cnpj=&excludeId=` | — | `{ contacts: [{ id, name, matchedBy }], companies: [...] }` para o aviso no formulário enquanto digita |

## Negócios

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/crm/pipelines/:id/board` | — | `{ pipeline: { id, name }, totals: { count, value, weighted }, stages: [{ id, name, probability, rottingDays, count, value, weighted, deals: [DealCard], nextCursor }] }`; só abertos; primeiras 50 por etapa; mesmos filtros de `/deals`; `?stageId=&cursor=` carrega mais de uma etapa |
| ★ `GET /v1/crm/deals` | — | lista com filtros, ordenação e cursor (`status` padrão `OPEN`; `all` para todos); `{ data: [DealCard], meta, totals: { count, value, weighted } }` |
| ★ `POST /v1/crm/deals` | idempotente, audit | `{ title, value?, pipelineId?, stageId?, companyId?, contactId?, ownerId?, sourceId?, expectedCloseDate?, probability?, tagIds?, customFields? }`; `contactId`/`companyId` que não existem (ou são de outra empresa) → **400 `VALIDATION_ERROR`** com `path` no campo; só `contactId` com empresa principal preenche `companyId` |
| ★ `GET /v1/crm/deals/:id` | — | `DealDetail` (abaixo) |
| ★ `PATCH /v1/crm/deals/:id` | — | qualquer campo do POST (mudar `stageId`/`pipelineId` segue as regras de mudança de etapa); `contactId: null`/`companyId: null` desvincula; `value` com `valueMode: ITEMS` → 409 `DEAL_VALUE_FROM_ITEMS` |
| ★ `POST /v1/crm/deals/:id/move` | — | `{ stageId, beforeId?, afterId? }` (etapa e posição no quadro); fechado → 409 `DEAL_NOT_OPEN` |
| ★ `POST /v1/crm/deals/:id/won` | — | ganho; já fechado → 409 `DEAL_NOT_OPEN` |
| ★ `POST /v1/crm/deals/:id/lost` | — | `{ lostReasonId?, lostNote? }`; sem motivo com `requireLostReason` → **400 `LOST_REASON_REQUIRED`** |
| ★ `POST /v1/crm/deals/:id/reopen` | — | aberto → 409 `DEAL_NOT_CLOSED` |
| `POST /v1/crm/deals/:id/duplicate` | idempotente | cópia aberta na primeira etapa, com itens, sem histórico |
| `POST /v1/crm/deals/bulk` | — | `{ ids (≤100), set: { ownerId?, stageId?, addTagIds?, removeTagIds?, expectedCloseDate? } }` ou `{ ids, action: 'delete' }`; tudo ou nada |
| `DELETE /v1/crm/deals/:id` · `POST .../restore` | responsável ou owner/admin | soft delete com desfazer |
| `GET /v1/crm/deals/:id/items` · ★ `POST /v1/crm/deals/:id/items` · `PATCH/DELETE /v1/crm/deal-items/:id` · `POST .../items/reorder` | escrita: `feature: 'crm_products'` | ★ POST `{ productId?, name?, unitPrice?, quantity, discountPercent? }` (com `productId`, nome e preço vêm do catálogo se não enviados; sem, `name` e `unitPrice` obrigatórios) → **201 `{ item: { id, name, unitPrice, quantity, discountPercent, total }, value }`**; `total` pelo `itemTotal` do `crm-lib`; o primeiro item muda o negócio para `valueMode: ITEMS`; toda resposta traz o `value` novo do negócio |
| `PUT /v1/crm/deals/:id/value-mode` | — | `{ mode: 'MANUAL' \| 'ITEMS' }` |

**DealCard** ★: `{ id, title, value, status, pipelineId, stageId, position, owner: { id, name }, company: { id, name } \| null, contact: { id, name, phone, phoneIsWhatsapp } \| null, expectedCloseDate, effectiveProbability, weightedValue, nextActivity: { id, type, subject, dueDate, dueTime, state } \| null, rotting: { days } \| null, tagIds, cardFields: [{ key, label, display }] }`

**DealDetail** ★: DealCard + `{ probability, valueMode, items, source, lostReason, lostNote, wonAt, lostAt, stageChangedAt, stages: [{ id, name, daysInStage, current }], customFields, leadId, createdBy, createdAt, updatedAt }`.

### Filtros de negócios (lista e quadro)
`pipelineId` · `stageId` · `status` (`OPEN` padrão, `WON`, `LOST`, `all`) · `ownerId` (`me` ou ids) · `companyId` · `contactId` · `sourceId` · `tagIds` (contém todas) · `expectedClose` (`overdue`, `this_month`, `next_month`, `none`) ou `expectedCloseFrom/To` · `nextActivity` (`overdue`, `today`, `none`) · `rotting=true` · `valueMin/valueMax` · `wonFrom/wonTo` · `lostReasonId` · `q` · `cf.<key>` · `sort` (`position`, `-value`, `expectedCloseDate`, `nextActivityDate`, `-createdAt`, `-updatedAt`, `title`). Cursor com ordenação como no `module` (valor + id).

## Produtos (catálogo)

★ `GET /v1/crm/products?q=&active=` (todos) · ★ `POST /v1/crm/products` `{ name, unitPrice, code?, unit?, description? }` → `{ id, ... }` · `PATCH/DELETE /v1/crm/products/:id` (owner/admin, `feature: 'crm_products'`). Excluir produto usado em negócios = desativar (os itens guardam nome e preço próprios). Código repetido → 409 `PRODUCT_CODE_TAKEN`.

## Leads

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/crm/leads` | — | `?status=OPEN` (padrão) `\| ARCHIVED \| CONVERTED`, `ownerId` (`me`, `none`), `sourceId`, `via`, `tagIds`, `q`, `createdFrom/To`, cursor; item `{ id, title, personName, email, phone, companyName, source, via, owner, status, seen, nextActivity, tagIds, createdAt, hasMatch }` |
| `GET /v1/crm/leads/counts` | — | `{ mineNew, unassigned }` para o menu |
| ★ `POST /v1/crm/leads` | idempotente | criação manual `{ title?, personName?, email?, phone?, companyName?, cnpj?, value?, message?, sourceId?, ownerId?, tagIds?, customFields? }` (e-mail ou telefone ou nome obrigatório; sem título → padrão) |
| ★ `GET /v1/crm/leads/:id` | — | detalhe + `matches: { contact?, company? }` + `utm`, `extra`; abrir pelo responsável marca `seenAt` |
| `PATCH /v1/crm/leads/:id` · `DELETE` · `POST .../restore` | — | — |
| ★ `POST /v1/crm/leads/:id/convert` | audit | `{ pipelineId?, stageId?, title?, value?, ownerId?, contactId?, companyId?, createContact?: boolean, createCompany?: boolean }` → **`{ deal: { id }, contact: { id, matched: boolean } \| null, company: { id, matched: boolean } \| null }`**; regras em `02-modelo.md`; já convertido → 409 `LEAD_ALREADY_CONVERTED` |
| `POST /v1/crm/leads/:id/archive` `{ reason? }` · `POST .../unarchive` | — | descartar / restaurar |
| `POST /v1/crm/leads/bulk` | — | atribuir, etiquetar, descartar em massa |

## Atividades

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/crm/activities` | — | `?bucket=overdue\|today\|upcoming\|done`, `ownerId` (`me` padrão, ids, `all` para owner/admin), `type`, `dealId`, `leadId`, `contactId`, `companyId`, `from/to` (calendário), cursor; item `{ id, type, subject, note, dueDate, dueTime, durationMinutes, state, done, owner, deal: { id, title } \| null, lead, contact, company }`; `meta.counts: { overdue, today, upcoming }` |
| ★ `POST /v1/crm/activities` | idempotente | `{ type, subject, dueDate, dueTime?, durationMinutes?, note?, ownerId?, dealId?, leadId?, contactId?, companyId?, done? }` (`done: true` = registrar algo que já aconteceu, ex.: ligação feita agora) |
| `PATCH /v1/crm/activities/:id` · `DELETE` | dono, responsável do negócio ou owner/admin | reagendar, trocar responsável, editar |
| ★ `POST /v1/crm/activities/:id/complete` · ★ `POST .../reopen` | — | concluir/reabrir; resposta traz `nextActivity` atualizada do negócio/lead |

Toda mudança devolve (ou invalida) a próxima atividade do negócio/lead; o front atualiza o card sem recarregar o quadro.

## Linha do tempo, anotações e anexos

| Rota | Faz |
|---|---|
| ★ `GET /v1/crm/timeline?dealId=\|leadId=\|contactId=\|companyId=&filter=all\|notes\|activities\|changes\|files&cursor=` | itens mesclados em ordem decrescente, `{ kind: 'note' \| 'activity' \| 'event' \| 'attachment', at, ... }`; anotações fixadas vêm à parte em `pinned` na primeira página |
| `POST /v1/crm/notes` | idempotente; `{ body, dealId? \| leadId? \| contactId? \| companyId? }`; menções viram notificação |
| `PATCH/DELETE /v1/crm/notes/:id` · `PUT/DELETE /v1/crm/notes/:id/pin` | — |
| `POST /v1/crm/attachments` | `{ fileId, dealId? \| ... }`: arquivo READY, da empresa, `purpose: crm_attachment`, enviado por quem liga |
| `DELETE /v1/crm/attachments/:id` | quem anexou ou owner/admin; marca o `File` como DELETED |

## Busca

`GET /v1/crm/search?q=&types=deals,leads,contacts,companies&limit=5` → grupos com `{ id, title, subtitle, href }`; e-mail, CPF, CNPJ e telefone inteiros vão por igualdade. Usado pelo provedor do Ctrl+K e pelos seletores.

## Relatórios (`feature: 'crm_reports'`)

Todos aceitam `pipelineId`, `ownerId` (`me`, ids; no modo restrito MEMBER só vê os próprios), `from`, `to` (padrão: últimos 90 dias) e respeitam a visibilidade.

| Rota | Faz |
|---|---|
| `GET /v1/crm/reports/funnel` | dos negócios **criados no período** no funil: quantos chegaram a cada etapa (pelo histórico; pular etapa conta como passar), % de passagem etapa a etapa, ganhos e taxa de ganho |
| `GET /v1/crm/reports/won-lost?months=12` | por mês: ganhos (qtd, valor), perdidos (qtd, valor), taxa de ganho |
| `GET /v1/crm/reports/forecast?months=6` | abertos por mês de previsão: valor total e ponderado; "sem previsão" e "previsão vencida" separados |
| `GET /v1/crm/reports/by-owner` | por vendedor: ganhos (qtd, valor), perdidos, taxa, ticket médio, ciclo médio (criação → ganho), abertos e ponderado |
| `GET /v1/crm/reports/lost-reasons` | perdidos por motivo (qtd, valor, %) |
| `GET /v1/crm/reports/stage-time` | tempo médio e mediano em cada etapa (passagens fechadas no período) |
| `GET /v1/crm/reports/activities` | concluídas por vendedor e tipo; atrasadas por vendedor |
| `GET /v1/crm/reports/<nome>.csv` | mesmo conteúdo em CSV (`;`, vírgula decimal, UTF-8 com BOM) |

Tudo calculado em SQL no servidor (agregações + `CrmDealStageHistory`), com teste de cada número sobre um conjunto de dados montado no teste.

## Notificações (add-on `notificacoes`)

| Evento | Destinatários | Tipo |
|---|---|---|
| negócio atribuído a alguém | novo responsável | `crm.deal.assigned` |
| lead atribuído (manual ou pela captura) | responsável | `crm.lead.assigned` |
| lead capturado sem responsável | owners/admins | `crm.lead.unassigned` |
| menção em anotação | mencionados | `crm.mentioned` |
| atividade atribuída por outra pessoa | responsável | `crm.activity.assigned` |
| resumo das atividades do dia (job 8 h, fuso da empresa) | quem tem atividade hoje ou atrasada | `crm.activity.digest` |
| negócio ganho | owners/admins e responsável (se outro ganhou) | `crm.deal.won` |

Tudo pelo `notify()` do add-on, na mesma transação do evento, com `actorId`, `canSee` = visibilidade do registro (modo "só os meus": responsável e owners/admins), `data.title` e `url` do registro (`skills/notificacoes/references/04-catalogo.md`, seção CRM). Regras (nunca o ator, preferências, agrupamento, e-mail imediato ou resumo) são do add-on. Negócio que muda de responsável no modo "só os meus" → `retract` para o antigo.

## Erros novos

| code | Status | Quando |
|---|---|---|
| `CONTACT_DUPLICATE` | 409 | e-mail ou CPF já cadastrado (traz `existing`) |
| `COMPANY_DUPLICATE` | 409 | CNPJ já cadastrado (traz `existing`) |
| `LOST_REASON_REQUIRED` | 400 | perder sem motivo com a configuração ligada |
| `DEAL_NOT_OPEN` | 409 | mover, ganhar ou perder negócio fechado |
| `DEAL_NOT_CLOSED` | 409 | reabrir negócio aberto |
| `INVALID_STAGE` | 400 | etapa de outro funil |
| `LEAD_ALREADY_CONVERTED` | 409 | converter de novo |
| `DEAL_VALUE_FROM_ITEMS` | 409 | mudar o valor à mão com produtos no negócio |
| `PIPELINE_HAS_DEALS` | 409 | excluir funil/etapa com negócios sem destino |
| `LAST_PIPELINE` / `LAST_STAGE` | 400 | excluir o último |
| `PRODUCT_CODE_TAKEN` | 409 | código de produto repetido |
| `CNPJ_NOT_FOUND` / `CNPJ_LOOKUP_UNAVAILABLE` | 404 / 503 | busca de CNPJ |
| `CAPTURE_KEY_INVALID` | 401 | captura com chave errada ou revogada |
| `FORM_ORIGIN_NOT_ALLOWED` | 403 | formulário público enviado de uma origem fora da lista |
| `IMPORT_INVALID_FILE` | 400 | arquivo ilegível, sem cabeçalho, acima do limite de linhas |

Campos personalizados inválidos usam `VALIDATION_ERROR` com `path: "customFields.<key>"`. Limites usam `PLAN_LIMIT_REACHED` e features `FEATURE_NOT_IN_PLAN`, como na base.

## Testes obrigatórios (API)

- **Visibilidade em todas as rotas** (modo OWN): MEMBER recebe 404 no negócio de outro (detalhe, PATCH, move, won, lost, itens, anotações, anexos, linha do tempo); não vê no quadro, lista, totais, busca, relatórios, exportação, atividades e notificações; passa a ver quando recebe uma atividade no negócio; owner/admin veem tudo; voltar para ALL libera na hora.
- Isolamento entre empresas (404) e relações apontando para outra empresa barradas no service **e** no trigger (inclusive `tagIds`).
- Duplicidade: e-mail/CPF/CNPJ (409 com `existing`), excluído não bloqueia, telefone só avisa.
- Funil: etapa de outro funil barrada (service e trigger); excluir etapa/funil exige destino; último funil/etapa protegido; probabilidade 0–100.
- Mudança de etapa grava histórico (uma passagem aberta por negócio); reordenar não grava; ganho/perda/reabertura com datas coerentes (constraint) e `LOST_REASON_REQUIRED`.
- Valor com produtos: total do item, soma no negócio, volta para manual; feature exigida.
- Próxima atividade recalculada em criar/editar/concluir/reabrir/excluir; estados `overdue/today/future/none` no fuso da empresa (teste com relógio fixo perto da meia-noite).
- Conversão de lead: reaproveita contato por e-mail e empresa por CNPJ; cria quando não há; grava `leadId` no negócio; move atividades e anotações; não converte duas vezes; limite `crmContacts` na criação.
- Negócio com contato e empresa: `DealCard`/`DealDetail` devolvem os dois; contato e empresa listam o negócio; desvincular com `null`; relação de outra empresa → 400; filtros `contactId`/`companyId`.
- Produtos: itens calculados no servidor (`itemTotal`), valor do negócio = soma, `DEAL_VALUE_FROM_ITEMS` ao editar o valor com itens, voltar para manual.
- Campos personalizados: cada tipo válido e inválido, obrigatório na criação, chave desconhecida, opção removida, filtro `cf.`.
- Relatórios: números exatos sobre um conjunto conhecido (funil com etapa pulada, ganho/perda por mês, previsão, tempo por etapa).
- Planos: `crmPipelines`, `crmContacts`, `crmCustomFields`, `crm_products`, `crm_capture`, `crm_reports` → 403 com o code certo no Free.
- Captura, importação e exportação: testes em `06-captura-e-importacao.md`.
