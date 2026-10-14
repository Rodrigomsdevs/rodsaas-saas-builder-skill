# 03 · API

Padrão da base em tudo: `/v1`, tenant do token, `withTenant`, Zod estrito, RFC 9457, cursor, `Idempotency-Key` nos POST que criam ou enviam. Dinheiro em centavos; datas `"YYYY-MM-DD"`. Toda rota interna exige papel (`ComRole` ou owner): senão 403 `NOT_COM_MEMBER`. `SELLER` só enxerga as próprias propostas e contratos (o resto → 404). Escrita: `COM_ADMIN`/`SELLER`; `VIEWER` → 403 `FORBIDDEN`.

Os formatos marcados com ★ fazem parte do **contrato testável** (`skills/verify/contract.json`, grupo `presets.comercial`).

Erros novos: `NOT_COM_MEMBER` (403), `PROPOSAL_LOCKED` (409), `NEEDS_APPROVAL` (409, `{ reasons }`), `NOT_AWAITING_APPROVAL` (409), `COMMENT_REQUIRED` (400), `NOT_SENT` · `ALREADY_DECIDED` · `PROPOSAL_EXPIRED` · `PROPOSAL_CANCELED` · `PROPOSAL_SUPERSEDED` (409, do `canDecide`), `UNKNOWN_VARIABLE` (400, `errors` com o caminho), `CONTRACT_LOCKED` (409), `NOT_YOUR_TURN` · `ALREADY_SIGNED` · `ENVELOPE_REFUSED` · `ENVELOPE_CANCELED` · `ENVELOPE_EXPIRED` (409), `INVALID_CODE` · `CODE_EXPIRED` · `TOO_MANY_ATTEMPTS` · `CODE_NOT_SENT` (400), `LINK_INVALID` (404), `DISCOUNT_ABOVE_LIMIT` (422, sem a feature de aprovação), `PROPOSAL_NOT_ACCEPTED` · `ALREADY_COMPLETED` (409), `MISSING_VARIABLES` (422, `{ missing }`), `DUPLICATE_SIGNER` · `NO_SIGNERS` · `DOCUMENT_MISMATCH` · `PCT_INVALID` (400).

## Pessoa, configurações e modelos

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/com/me` | — | **`{ role, canApprove, pending: { toApprove, awaitingSignature, expiringContracts } }`** |
| ★ `GET /v1/com/settings` · `PATCH` | escrita `COM_ADMIN` | `ComSettings` |
| ★ `PUT /v1/com/roles/:userId` | `COM_ADMIN` | `{ role: "COM_ADMIN" \| "SELLER" \| "VIEWER" \| null }` (owner fica `COM_ADMIN` → 409 `OWNER_IS_COM_ADMIN`; workstation: vendedor além dos assentos → 409 `CONFIRM_REQUIRED`) |
| ★ `GET /v1/com/templates` · ★ `POST` · `PATCH /:id` · `POST /:id/archive` | escrita `COM_ADMIN`, `feature: 'com_templates'` (os prontos funcionam sem) | **`{ kind: "PROPOSAL" \| "CONTRACT" \| "AMENDMENT", name, bodyHtml, isDefault? }`**; HTML sanitizado; `validateTemplate` contra `VARIABLES[kind]` e `validateBlocks` → 400 **`UNKNOWN_VARIABLE`** (ou `UNKNOWN_FILTER`, `UNCLOSED_VARIABLE`, `UNKNOWN_BLOCK`) com `errors: [{ path, message }]` |
| ★ `GET /v1/com/templates/variables` | — | **`{ PROPOSAL: [paths], CONTRACT: [paths], AMENDMENT: [paths], filters: [...], blocks: { PROPOSAL, CONTRACT, AMENDMENT } }`** (as variáveis permitidas; `07-modelos-e-pdf.md`) |
| ★ `POST /v1/com/templates/:id/preview` | — | **`{ proposalId? \| contractId? \| data? }`** → **`{ html, missing }`** (`renderTemplate`) |

## Propostas

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/com/proposals` | — | `?status` (vários), `ownerId`, `q` (número, título, cliente), período, cursor; item **`{ id, number, code, version, title, status, client: { name, companyName }, owner: { id, name }, totals: { oneTimeCents, monthlyCents, yearlyCents }, validUntil, sentAt, viewedAt, acceptedAt, createdAt }`** (`code` = "P-0001 v2"; `status` do `proposalStatus`) |
| ★ `POST /v1/com/proposals` | escrita, idempotente | **`{ title, client: { name, companyName?, document?, email, phone? }, items, globalDiscountPct?, globalDiscountCents?, paymentPlan?, validUntil?, templateId?, notes?, terms?, crmDealId?, ownerId? }`** → 201 **proposta** (abaixo); itens com `validateItems` (400 com `errors` em `items.N.campo`); documento do cliente, se vier, com `documentType`; plano com `paymentPlan` (400 com os códigos); aprovação calculada (`needsApproval` com a configuração; `COM_ADMIN` nunca precisa) |
| ★ `GET /v1/com/proposals/:id` | dono, admin, viewer | **proposta**: `{ id, number, code, version, title, status, client, owner, items, totals: { lines, oneTime: { grossCents, itemDiscountCents, globalDiscountCents, totalCents }, monthlyCents, yearlyCents, effectiveDiscountPct }, paymentPlan: { kind, schedule } \| null, validUntil, approval: { required, status, reasons }, publicUrl \| null, views: { opens, sessions, totalSeconds, firstViewedAt, lastViewedAt }, acceptance \| null, rejectionReason, previousId, supersededById, events }` |
| ★ `PATCH /v1/com/proposals/:id` | escrita | só rascunho (ou aguardando aprovação, que volta a calcular a aprovação); enviada/aceita → 409 **`PROPOSAL_LOCKED`** |
| ★ `POST /v1/com/proposals/:id/approval` | `COM_ADMIN`, `feature: 'com_approvals'` | **`{ decision: "approve" \| "reject", comment? }`**; recusa exige comentário (400 `COMMENT_REQUIRED`); não aguardando → 409 `NOT_AWAITING_APPROVAL`; recusada volta a rascunho com o motivo (o vendedor ajusta) |
| ★ `POST /v1/com/proposals/:id/send` | escrita, `limit: 'comProposalsMonthly'` | **`{ sendEmail?: boolean, message? }`** → aprovação pendente → 409 **`NEEDS_APPROVAL`** com `reasons`; já enviada → 409 `PROPOSAL_LOCKED`; grava `sentAt`, `validUntil` (padrão: hoje + `proposalValidityDays`), token → **proposta com `publicUrl`** (`{painel}/proposta/<token>`); e-mail ao cliente |
| ★ `POST /v1/com/proposals/:id/new-version` | escrita | cria a versão seguinte em rascunho (mesmo número, itens copiados) e marca esta como substituída (o link antigo mostra "substituída" e não aceita) → 201 **proposta nova** |
| ★ `POST /v1/com/proposals/:id/expire` · `POST /:id/validity` · `POST /:id/cancel` | escrita | encerrar agora (`validUntil` = ontem); mudar a validade (`{ validUntil }` ≥ hoje); cancelar (motivo) |
| `POST /v1/com/proposals/:id/duplicate` · `GET /:id/pdf` | escrita / leitura | nova proposta (v1, número novo); PDF da versão (gerado na fila, cacheado pelo hash) |

### Páginas públicas da proposta

| Rota | Faz |
|---|---|
| ★ `GET /v1/public/com/proposals/:token` | **`{ company: { name, logoUrl }, code, title, client: { name }, items: [{ id, description, details, qty, unit, unitCents, discountPct, discountCents, recurring, optional, selected, netCents }], globalDiscountPct, globalDiscountCents, totals, paymentPlan, validUntil, status, decision, html, seller: { name, email } }`** (`decision` = `"OK"` ou o código do `canDecide`, para a página mostrar a faixa; o desconto geral serve para recalcular o total quando o cliente marca opcionais) (`html` = modelo renderizado); registra a visualização (`?session=<id>`; a primeira grava `viewedAt` e avisa o vendedor); token inválido → 404 `LINK_INVALID` |
| `POST /v1/public/com/proposals/:token/ping` | `{ session, seconds }` (tempo de leitura; só com a aba visível) |
| ★ `POST /v1/public/com/proposals/:token/accept` | **`{ name, document, agree, selectedOptionalIds? }`** → `canDecide` (409 com o código) → `validateAcceptance` (400 com `errors`) → recalcula os totais com os opcionais marcados, grava `acceptance` (nome, documento, IP, navegador, opcionais, totais, SHA-256 do HTML aceito), `acceptedAt` → **`{ status: "ACCEPTED", totals }`**; integrações (CRM, Financeiro) e aviso ao vendedor |
| ★ `POST /v1/public/com/proposals/:token/reject` | **`{ reason }`** (obrigatório) → `{ status: "REJECTED" }` |
| `POST /v1/public/com/proposals/:token/comments` | `{ name, body }` (pergunta do cliente → aviso ao vendedor; resposta pela tela interna aparece na página) |

## Contratos

| Rota | Config | Faz |
|---|---|---|
| ★ `GET /v1/com/contracts` | `feature: 'com_contracts'` | `?status=ACTIVE\|EXPIRING\|RENEWING\|ENDED\|SCHEDULED\|DRAFT\|AWAITING_SIGNATURE\|CANCELED\|TERMINATED`, `q`, cursor; item **`{ id, number, code, title, status, parties, valueCents, recurrence, startDate, endDate, noticeDate, autoRenew, envelope: { id, status } \| null }`** (`status` do `contractStatus`) |
| ★ `POST /v1/com/contracts` | escrita, `com_contracts` | **`{ title, proposalId?, templateId?, parties: [{ role, name, document, email }], valueCents, recurrence, startDate, months, noticeDays?, autoRenew?, renewalMonths?, readjustIndex?, existing?: { signedAt, fileId? } }`** → 201 contrato (`contractTerm`); da proposta: só aceita (409 `PROPOSAL_NOT_ACCEPTED`), partes e valor vêm do aceite; `existing` = já assinado (status `SIGNED`) |
| ★ `GET /v1/com/contracts/:id` · `PATCH` | escrita | item + `bodyHtml`, `events`; mudar só em `DRAFT`/`IN_REVIEW` (senão 409 **`CONTRACT_LOCKED`**) |
| ★ `POST /v1/com/contracts/:id/renew` | escrita | `renewTerm` → novo `endDate` (evento `RENEWED`) → contrato |
| ★ `POST /v1/com/contracts/:id/readjust` | escrita | **`{ pct, effectiveDate? }`** → `readjust` (evento `READJUSTED` com de/para) → contrato |
| `POST /v1/com/contracts/:id/terminate` · `POST /:id/amendments` | escrita | encerrar (`{ date, reason }`); aditivo (modelo `AMENDMENT` → envelope próprio) |

## Assinatura

| Rota | Config | Faz |
|---|---|---|
| ★ `POST /v1/com/contracts/:id/send-for-signature` | escrita, `feature: 'com_signatures'`, `limit: 'comEnvelopesMonthly'` | **`{ signers: [{ name, email, document?, requireDocument?, role, order }], expiresInDays?, message? }`** → congela o `bodyHtml`, gera o PDF, SHA-256 → 201 **envelope**; contrato vai a `AWAITING_SIGNATURE` |
| `POST /v1/com/envelopes` | idem | PDF avulso: `{ title, fileId, signers }` |
| ★ `GET /v1/com/envelopes/:id` | dono do contrato, admin, viewer | **envelope**: `{ id, title, status, contractId, documentSha256, finalSha256, verificationCode, expiresAt, completedAt, signers: [{ id, name, email, role, order, status, signedAt, signUrl }], events }` (`signUrl` para copiar e mandar por WhatsApp; o código continua indo só para o e-mail do signatário) |
| ★ `POST /v1/com/envelopes/:id/cancel` · `POST /:id/remind` | escrita | cancelar (links param de funcionar; contrato volta a `DRAFT`); lembrar quem está na vez |
| ★ `GET /v1/public/com/sign/:token` | público | **`{ company: { name }, envelope: { title, status }, signer: { name, emailMasked, role, status, requireDocument }, canSignNow, waitingFor: [names], documentHtml \| documentUrl }`** (registra `VIEWED`); token inválido → 404 `LINK_INVALID` |
| ★ `POST /v1/public/com/sign/:token/code` | público, 1 por minuto | envelope encerrado ou fora da vez → 409 com o código (`ENVELOPE_REFUSED`, `NOT_YOUR_TURN`…); antes de 1 minuto → 429; gera o código (6 dígitos), guarda o hash, manda por e-mail (sem link) → **`{ sentTo }`** (mascarado) |
| ★ `POST /v1/public/com/sign/:token/sign` | público | **`{ code, name, document?, agree }`** → `envelopeStatus`/`canSign` (409 com o código) → `checkOtp` (400 com o código; tentativa errada conta) → nome completo, documento (se exigido) e concordância (400 com `errors`) → assina com IP/navegador → **`{ status: "SIGNED", envelopeStatus }`**; último a assinar conclui: PDF final + manifesto + `finalSha256` + `verificationCode`, contrato `SIGNED`, e-mail com o PDF para todos |
| ★ `POST /v1/public/com/sign/:token/refuse` | público | **`{ reason }`** → envelope `REFUSED`, contrato volta a `DRAFT`, aviso ao dono |
| ★ `GET /v1/public/com/verify/:code` · ★ `POST /v1/public/com/verify` | público, rate limit | por código ou **`{ sha256 }`** (o navegador calcula o hash do arquivo com WebCrypto) → **`{ valid: true, title, completedAt, sha256, signers: [{ name, role, signedAt }] }`**; não encontrado → 404 `NOT_FOUND` |

## Jobs

| Job | Quando | Faz |
|---|---|---|
| `com.pdf` | sob demanda | HTML → PDF (Gotenberg) de proposta, contrato e PDF final (com `pdf-lib` juntando a folha de assinaturas) |
| `com.proposals.expiring` | 9 h | lembrete ao cliente 2 dias antes de vencer (se não decidiu) e aviso ao vendedor no vencimento |
| `com.envelopes.remind` | 10 h | lembrete a quem está na vez a cada `reminderEveryDays`; envelope vencido → `EXPIRED` |
| `com.contracts.notice` | 8 h | aviso de contratos que entram no aviso prévio (`EXPIRING`/`RENEWING`) |
| `com.contracts.renew` | 2 h | renovação automática no dia seguinte ao fim (`renewTerm`, evento, Financeiro estendido) |

## Testes obrigatórios (API)

- Propostas: totais exatos com opcional e recorrente; itens inválidos 400 com o caminho; desconto acima do limite → aprovação; enviar com aprovação pendente 409; aprovada envia; enviada não muda (409); página pública sem login registra a visualização; aceite com CPF/CNPJ inválido 400; aceite grava IP e hash; aceitar de novo 409; vencida 409 `PROPOSAL_EXPIRED`; recusa exige motivo; nova versão invalida o link antigo (409 `PROPOSAL_SUPERSEDED`).
- Modelos: variável desconhecida 400; prévia com moeda, extenso e documento formatado; faltando listado.
- Contratos: vigência e aviso calculados; contrato existente perto do fim aparece em "vencendo"; renovar estende; reajuste arredondado.
- Assinatura: ordem (testemunha antes das partes → 409 `NOT_YOUR_TURN`); código errado 400 e conta tentativa; assinatura com o código do e-mail; concluído gera hash e código; verificação pública por código e por hash; recusa encerra; cancelado não assina.
- Papéis: sem papel 403; vendedor não vê a proposta de outro; `VIEWER` não escreve; vendedor não aprova.
