# 07 · Perfis de segmento (manual de processos, base de conhecimento pública, atas → tarefas)

O Páginas é **um só**; o perfil decide o que já vem ligado, as palavras e os modelos sugeridos. Recurso que serve a mais de um segmento fica no núcleo (`06`).

## Onde fica

- `PageSettings.segment` do workspace (`GENERAL` · `PROCESSES` · `KNOWLEDGE_BASE` · `MEETINGS`), escolhido no onboarding da workstation (`pageProfileFor`: indústria e escritório → `PROCESSES`; tecnologia → `KNOWLEDGE_BASE`; agência → `MEETINGS`) ou na primeira abertura. Muda em `/paginas/configuracoes` → Perfil (`pages-segment`).
- ★ `GET /v1/pages/settings` · ★ `PATCH /v1/pages/settings { segment }` (owner/admin) aplica o perfil (`pageSegment(id).on`) **sem desligar nada** → **`{ segment, words, on }`**; o perfil sugere os modelos dele no "Nova página".

## O que cada perfil liga

| Perfil | Liga | O que muda |
|---|---|---|
| `GENERAL` | — | — |
| `PROCESSES` (manual de processos, POP, qualidade) | verificação, histórico, permissões, modelos, ciência | **página verificada com revisão periódica** e **"li e entendi"** (abaixo); vocabulário "procedimento"; modelos POP, Política, Checklist de rotina |
| `KNOWLEDGE_BASE` (central de ajuda, documentação pública) | site público, "isso ajudou?", histórico, modelos | **base pública com endereço próprio** (abaixo); vocabulário "artigo"; modelos Artigo, Perguntas frequentes, Novidades |
| `MEETINGS` (atas e reuniões) | itens de ação, modelos, comentários, calendário | **ata → tarefas** (abaixo); vocabulário "ata"; modelos Ata de reunião, Reunião 1:1, Retrospectiva |

## Manual de processos: verificação e ciência (`PROCESSES`)

- ★ `POST /v1/pages/:id/verify` **`{ reviewEveryDays? }`** (quem tem total na página; padrão 90, 7 a 730) → **`{ verification: { status, verifiedAt, verifiedBy: { id, name }, reviewEveryDays, expiresOn } }`** (`verificationStatus`); `DELETE` tira o selo. A página ganha **`verification`** no formato ★ da página; vencida, o selo fica "revisar" e quem verificou recebe `page.review_due` (job diário).
- ★ `GET /v1/pages/verification?status=verified|expired|unverified` → **`{ data: [{ id, title, status, expiresOn, verifiedBy }] }`** (painel "Para revisar").
- ★ `POST /v1/pages/:id/ack` ("li e entendi") → **`{ ackedAt }`**; ★ `GET /v1/pages/:id/acks` → **`{ data: [{ user: { id, name }, ackedAt }], pending: [{ id, name }] }`** — vale a ciência dada **depois da última verificação** (reverificar pede ciência de novo); `pending` = membros que veem a página e ainda não deram ciência; botão "Cobrar ciência" avisa os pendentes.
- Tela: selo verde/âmbar no topo (`page-verified` com `data-status`), "Verificar" com o prazo, barra "Li e entendi" (`page-ack`) e a lista de quem já leu (`page-acks`).

## Base de conhecimento pública (`KNOWLEDGE_BASE`, feature `public_pages`)

- ★ `PUT /v1/pages/:id/site` **`{ enabled, slug? }`** (total na página) → **`{ enabled, slug, url }`**: publica a página **e as sub-páginas** no site do workspace `APP_URL/docs/<siteKey>/<slug>` (`slugify` + `uniqueSlug`; slug repetido ganha "-2"); `slug` inválido → 400. Desligar tira a página e as filhas na hora.
- ★ `GET /v1/public/site/:siteKey` → **`{ workspaceName, pages: [{ title, slug, parentSlug }] }`** (navegação); ★ `GET /v1/public/site/:siteKey/:slug` → **`{ title, content, updatedAt, nav: [{ title, slug }], helpful: { yes, no, total, pct } }`**; ★ `GET /v1/public/site/:siteKey/search?q=` → **`{ data: [{ title, slug, snippet }] }`** só nas publicadas. Página não publicada, arquivada ou restrita → 404. `Cache-Control` curto, SEO (título, descrição, sitemap em `/docs/<siteKey>/sitemap.xml`), sem campos internos.
- ★ `POST /v1/public/site/:siteKey/:slug/feedback` **`{ helpful: true | false }`** → **`{ helpful }`** (`helpfulness`; um voto por página por visitante, rate limit por IP); no painel, artigos com pior avaliação primeiro.
- Tela pública `/docs/[siteKey]/[slug]` com menu lateral, busca, "Isso ajudou? 👍 👎" (`kb-page`, `kb-nav-item`, `kb-search`, `kb-helpful-yes`, `kb-helpful-no`); no app, "Publicar no site" (`page-site-toggle`).

## Atas → tarefas (`MEETINGS`, preset `tarefas`)

- ★ `POST /v1/pages/:id/action-items` **`{ projectId }`** → **`{ created: [{ blockId, taskKey, title, assigneeId, dueDate }], skipped }`** — `extractActionItems`: cada **to-do não marcado** da ata vira tarefa no projeto (responsável = primeira menção a um membro; prazo = "hoje", "amanhã", "20/11" ou "20/11/2027"; título sem a data), com o link da ata na descrição; **idempotente** pelo bloco (rodar de novo só cria os novos). Sem o Tarefas → 409 **`TASKS_UNAVAILABLE`**; projeto que a pessoa não vê → 400 em `projectId`.
- ★ `GET /v1/pages/:id/action-items` → **`{ data: [{ blockId, title, taskKey, status: { name, category } }] }`**; quando a tarefa é **concluída** no Tarefas, o to-do da ata fica **marcado** (e reabrir desmarca).
- Modelo "Ata de reunião" (`{{data}}`, participantes, pauta, decisões, ações); visão de calendário das atas pela data da reunião.
- Tela: "Criar tarefas das ações" no topo da ata (`page-action-items` com o seletor de projeto), selo com o código da tarefa ao lado de cada to-do (`page-action-item` com `data-task-key`).

## Testids

| testid | Onde |
|---|---|
| `pages-segment` | `/paginas/configuracoes` → Perfil |
| `page-comments`, `page-comment-input`, `page-comment-submit`, `page-comment-resolve`, `page-comment-mark` (`data-thread-id`) | comentários |
| `page-history`, `page-history-restore` | histórico |
| `page-file` | blocos de arquivo |
| `pages-template-pick` (`data-template-id`) | modelos |
| `page-access`, `page-access-restricted`, `page-access-grant` (`data-user`, `data-level`) | permissão |
| `db-list-row`, `db-calendar`, `db-calendar-day` (`data-date`), `db-calendar-item`, `db-gallery`, `db-gallery-card` (`data-page-id`) | visões novas |
| `page-export` (`data-format`) | exportar |
| `page-verified` (`data-status`), `page-ack`, `page-acks` | manual de processos |
| `page-site-toggle`, `kb-page`, `kb-nav-item`, `kb-search`, `kb-helpful-yes`, `kb-helpful-no` | base pública |
| `page-action-items`, `page-action-item` (`data-task-key`) | atas |

## Testes obrigatórios

- Aplicar cada perfil liga o que ele pede sem desligar nada.
- Verificação: selo com vencimento; vencida aparece no painel; ciência antes da reverificação não vale; pendentes certos.
- Base pública: publicar com slug único; filha publicada junto; não publicada 404; busca só no publicado; voto conta.
- Atas: to-dos viram tarefas com responsável e prazo, sem repetir; concluir a tarefa marca o to-do.
