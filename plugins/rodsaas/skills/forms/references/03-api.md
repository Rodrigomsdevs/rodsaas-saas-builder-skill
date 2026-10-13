# API

Padrão da base em tudo: `/v1`, tenant do token, `withTenant`, schemas Zod de entrada (estritos) e saída (com nome no OpenAPI), RFC 9457, cursor, `config` declarativo. Esquema e respostas validados com o `forms-lib` (o mesmo do front).

Os formatos marcados com ★ fazem parte do **contrato testável** (`skills/verify/contract.json`, grupo `presets.forms`): mantenha nomes de rota e de campo exatamente assim.

## Formulários

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/forms` | — | lista com `status` (`DRAFT`, `PUBLISHED`, `CLOSED`, vários), `q`, `ownerId=me`, `favorite=true`, `sort` (`-updatedAt` padrão, `-lastResponseAt`, `title`), cursor; item `{ id, title, slug, status, hasUnpublishedChanges, responsesCount, unreadCount, lastResponseAt, owner, favorite, canSeeResponses, updatedAt }` (contadores só para quem vê as respostas) |
| ★ `POST /v1/forms` | idempotente, audit | `{ title, templateId?, schema?, settings? }` → **`{ id, title, slug, status: 'DRAFT', draftVersion, draft, settings }`**; com `templateId` copia o modelo (do sistema ou da empresa); sem nada, um esquema com uma pergunta de texto curto |
| ★ `GET /v1/forms/:id` | — | detalhe: `draft`, `draftVersion`, `published` (esquema da versão publicada) e `publishedVersion`, `hasUnpublishedChanges`, `settings`, `status`, `closedReason`, `publicUrl`, colaboradores, `canEdit`, `canSeeResponses` |
| ★ `PUT /v1/forms/:id/draft` | editor | `{ version, schema }` → `validateSchema` (400 `INVALID_FORM_SCHEMA` com `errors[]` no caminho do campo) → `{ draftVersion }`; versão velha → 409 `VERSION_CONFLICT` com `currentVersion` e quem salvou; body até 1 MB |
| ★ `PATCH /v1/forms/:id` | editor | `{ title?, slug?, settings? }` (slug: `isValidSlug`, único → 409 `SLUG_TAKEN`; `settings` é mesclado por seção: cada chave enviada, como `limits` ou `thanks`, substitui a seção inteira, as outras ficam; validado com Zod; `showBranding: false` exige `forms_branding`). Configurações valem para o público **na hora** (não precisam de nova publicação) |
| ★ `POST /v1/forms/:id/publish` | editor · audit | publica o rascunho (regras em `02-modelo.md`); features usadas no esquema sem o plano → 403 `FEATURE_NOT_IN_PLAN` com a pergunta; `formsPublished` no limite → 403 `PLAN_LIMIT_REACHED` → **`{ publishedVersion, slug, publicUrl }`** |
| ★ `POST /v1/forms/:id/close` · ★ `POST /v1/forms/:id/reopen` | editor | encerrar / reabrir |
| `POST /v1/forms/:id/discard-draft` | editor | rascunho volta a ser igual à versão publicada |
| `POST /v1/forms/:id/duplicate` | idempotente | cópia em rascunho, "(cópia)", sem respostas, slug novo |
| `POST /v1/forms/:id/save-as-template` | editor | vira modelo da empresa (cópia com `isTemplate`) |
| `DELETE /v1/forms/:id` · `POST /v1/forms/:id/restore` | dono ou owner/admin · audit | soft delete (link para na hora) e desfazer |
| `PUT /v1/forms/:id/collaborators` | dono ou owner/admin | `[{ userId, role: 'EDITOR' \| 'VIEWER' }]` (membros da empresa) |
| `PUT/DELETE /v1/forms/:id/favorite` | — | estrela por usuário |
| `GET /v1/forms/templates` | — | modelos do sistema (`templates.json`) + modelos da empresa, com nome, descrição e prévia das perguntas |

## Respostas (só quem vê as respostas; senão 404)

| Rota | Faz |
|---|---|
| ★ `GET /v1/forms/:id/responses` | `{ data: [{ id, version, submittedAt, answers, hidden, read, starred, respondentEmail, durationSec }], meta }`; filtros `from`, `to`, `q` (busca no texto), `read`, `starred`, `field.<fieldId>=<valor>` (opção, sim/não, número exato), cursor; `sort=-submittedAt` padrão |
| `GET /v1/forms/:id/responses/:rid` | detalhe com o esquema da versão respondida (para mostrar as perguntas como eram), arquivos (com link temporário do `uploads`), `prevId`/`nextId` com os mesmos filtros; abrir marca como lida |
| `PATCH /v1/forms/:id/responses/:rid` | `{ read?, starred? }` |
| `DELETE /v1/forms/:id/responses/:rid` · `POST .../restore` | soft delete e desfazer (editor) |
| `POST /v1/forms/:id/responses/bulk` | `{ ids (≤500), action: 'read' \| 'unread' \| 'star' \| 'unstar' \| 'delete' }` |
| `GET /v1/forms/:id/responses/export?format=csv\|xlsx&<filtros>` | `responsesToCsv` (CSV `;` com BOM) ou planilha; streaming; audit `forms.exported`; rate limit 5/min |
| `GET /v1/forms/:id/summary?from=&to=` | `{ totals: { views, starts, responses, completionRate, avgDurationSec }, fields: summarize(...) }` sobre a versão publicada atual (respostas de versões antigas entram nas perguntas que ainda existem) |
| `GET /v1/forms/:id/funnel?version=` | páginas com `reached` e queda entre elas |
| `GET /v1/forms/responses/recent` | caixa "Respostas" do menu: últimas respostas de todos os formulários que a pessoa vê, com título do formulário e um resumo (2 primeiras respostas) |

## Integrações (`feature: 'forms_integrations'`, dono do formulário ou owner/admin)

| Rota | Faz |
|---|---|
| `GET/POST /v1/forms/:id/webhooks` · `PATCH/DELETE /v1/form-webhooks/:id` | `{ url, active }`; o `secret` é gerado e devolvido (pode ser mostrado de novo para quem edita) |
| `POST /v1/form-webhooks/:id/test` | entrega um evento `form.test` agora e devolve o resultado |
| `GET /v1/form-webhooks/:id/deliveries` | histórico (últimas 100) com status, tempo e erro; `POST /v1/form-webhook-deliveries/:id/retry` |
| `GET/PUT /v1/forms/:id/crm` | só com o preset `crm`: `{ enabled, mapping, sourceId, assignMode, assigneeIds }`; o mapeamento só aceita perguntas do tipo certo (e-mail → email, telefone → phone, CNPJ → cnpj, valor → value) |

## LGPD (owner/admin)

| Rota | Faz |
|---|---|
| `POST /v1/forms/privacy/search` | `{ email }` → formulários e quantidade de respostas daquele e-mail |
| `POST /v1/forms/privacy/erase` | `{ email, confirm: true }` → apaga **de vez** as respostas e arquivos daquele e-mail em todos os formulários; audit `forms.privacy_erased` (sem guardar o conteúdo) |

## API pública (sem login; `public: true`; **sem checagem de Origin/CSRF** porque não usa cookie, exceto formulário "só membros")

| Rota | Faz |
|---|---|
| ★ `GET /v1/public/forms/:slug` | busca o `FormPublicLookup` (sem RLS), abre `withTenant` e devolve **só**: `{ title, status, schema (versão publicada), settings públicas (layout, theme, welcome, thanks, showBranding, access), productName, version }`. Rascunho/inexistente/excluído → 404; encerrado → **410 `FORM_CLOSED`** com `closedMessage`; limite mensal do plano → 410 `FORM_CLOSED` (mensagem genérica). Cache curto (`Cache-Control: public, max-age=30`) |
| ★ `POST /v1/public/forms/:slug/responses` | `{ answers, hidden?, startedAt?, browserKey?, _gotcha?, _ts? }` + header `Idempotency-Key` → **201 `{ id }`**; regras abaixo |
| `POST /v1/public/forms/:slug/events` | `{ type: 'view' \| 'start' \| 'page', pageIndex?, version }` → 204 (melhor esforço; nunca falha para o usuário) |
| `POST /v1/public/forms/:slug/uploads` · `.../uploads/:id/complete` | upload para pergunta de arquivo (fluxo do add-on `uploads`, `purpose: form_upload`, tipos e tamanho da pergunta, máx. 25 MB); o arquivo fica pendente e só é ligado à resposta no envio; sem envio, some em 24 h |

Regras do envio (service `submitResponse`, numa transação com trava na linha do formulário):
1. **Anti-spam**: `_gotcha` preenchido ou `_ts` com menos de 2 s → responde 201 com um id falso e **não grava** (o robô não aprende). Rate limit: 10 envios/min por IP por formulário e 100/h por IP no total; body até 256 KB. A checagem de `_ts` só acontece **depois** da validação: quem clica em enviar com campos vazios logo ao abrir a página vê os erros, nunca um sucesso falso.
2. Formulário publicado e aberto (status, `closeAt`, `maxResponses`, limite mensal) → senão 410 `FORM_CLOSED`.
3. Acesso "só membros": exige sessão de um membro da empresa (cookies normais, **com** checagem de Origin) → senão 401; grava `respondentUserId`.
4. `validateAnswers(schemaPublicado, answers, { now, timeZone, fileCheck })` → erros como **400 `VALIDATION_ERROR` com `errors: [{ path: "answers.<fieldId>", message }]`** (o front mostra no campo certo). `fileCheck` confere que cada arquivo foi enviado por este formulário, está pronto e não pertence a outra resposta.
5. Uma por e-mail/usuário/navegador (se ligado) → 409 `ALREADY_RESPONDED`.
6. Grava `FormResponse` (versão, respostas normalizadas, ocultos com `pickHidden`, `answersText`, e-mail, `ipHash`, duração), liga arquivos, atualiza contadores e `FormDailyStat.submits`, encerra se atingiu `maxResponses`.
7. Depois do commit, na fila (pg-boss): notificação/e-mail do dono e colaboradores, resposta automática, webhooks, lead no CRM. Falha nessas tarefas **nunca** desfaz a resposta.
8. Resposta: só `{ id }` (nunca devolve os dados enviados nem nada da empresa).

## Erros novos

| code | Status | Quando |
|---|---|---|
| `INVALID_FORM_SCHEMA` | 400 | esquema inválido (traz `errors[]` com o caminho) |
| `VERSION_CONFLICT` | 409 | rascunho salvo com versão velha |
| `SLUG_TAKEN` | 409 | endereço em uso |
| `FORM_CLOSED` | 410 | formulário encerrado, fora do prazo, no limite de respostas ou do plano |
| `ALREADY_RESPONDED` | 409 | "uma resposta por pessoa" ligada e a pessoa já respondeu |
| `FORM_NOT_PUBLISHED` | 409 | encerrar/reabrir um rascunho |

## Testes obrigatórios (API)

- **Rascunho × publicado**: o público só vê a versão publicada; editar o rascunho não muda o link até publicar de novo; rascunho nunca publicado → 404 público.
- Esquema: ids repetidos, condição com pergunta posterior, opção inexistente, tipo desconhecido → 400 com o caminho certo; `VERSION_CONFLICT` em dois salvamentos com a mesma versão.
- **Envio público sem Origin e sem cookie** funciona; com cookie de outra empresa não muda nada; resposta não devolve dados.
- Validação por tipo (um válido e um inválido por tipo, incluindo CPF/CNPJ/telefone/CEP/data com mínimo "hoje" no fuso da empresa) e **lógica**: campo escondido não é exigido nem gravado; página escondida idem.
- Limites: `maxResponses` com 20 envios em paralelo (exatamente N gravados, o resto 410), `closeAt`, limite mensal do plano, uma por e-mail/navegador/usuário.
- Anti-spam: isca e `_ts` não gravam; rate limit por IP.
- **Visibilidade das respostas**: membro sem ser dono/colaborador recebe 404 em respostas, resumo, funil, exportação e busca; outra empresa 404 em tudo.
- Features do plano ao publicar (lógica, arquivo, sem rodapé) e formulário publicado antes do rebaixamento continua respondendo.
- Arquivos: só os enviados por aquele formulário e ainda não usados; tipo e tamanho da pergunta.
- Resumo e NPS batem com um conjunto conhecido; CSV com BOM, `;`, colunas de perguntas removidas e proteção de fórmula.
- Webhook: assinatura confere com `verifyWebhook`; novas tentativas no tempo de `webhookBackoff`; desativa após 20 falhas.
- CRM: com o preset, uma resposta vira lead com o mapeamento; sem o preset, a rota responde 404.
- LGPD: exclusão por e-mail apaga respostas e arquivos de todos os formulários da empresa e de nenhuma outra.
