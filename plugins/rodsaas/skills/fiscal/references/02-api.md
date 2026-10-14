# 02 · API

Padrão da base: `/v1`, tenant do token, Zod estrito, RFC 9457, `Idempotency-Key` nos `POST` que emitem. Emitente e regras: owner/admin; emitir, reenviar e eventos: owner/admin e quem tem acesso ao app que originou (ERP: `ERP_ADMIN`/`SELLER`/`CASHIER`). Feature `fiscal`, limite `fiscalDocumentsMonthly`. Os formatos ★ fazem parte do contrato testável (`skills/verify/contract.json`, grupo `presets.fiscal`).

## Emitente e regras

Visão ★ (**emitente**): `{ configured, cnpj, legalName, tradeName, ie, uf, cityCode, address, regime, environment, driver, capabilities, hasCredentials, hasCsc, series: { "55", "65" }, nextNumbers: { "55", "65" }, cancelWindowMin: { "55", "65" }, nfceIdentifyAboveCents, ibsCbsMode }` — credenciais e CSC **nunca** voltam (só `hasCredentials`/`hasCsc`).

| Rota | Faz |
|---|---|
| ★ `GET /v1/fiscal/issuer` | **emitente** (`configured: false` e o resto `null` quando não configurou) |
| ★ `PUT /v1/fiscal/issuer` | **`{ cnpj, legalName, tradeName?, ie, uf, cityCode, address, regime, driver?, credentials?, nfceCsc?: { id, csc }, series?, cancelWindowMin?, nfceIdentifyAboveCents?, ibsCbsMode?, environment?, confirmCnpj? }`** → 400 com `path` (`cnpj` inválido, `uf`, `ie` vazio, `cityCode` sem 7 dígitos, `regime`, `driver` não registrado); `driver.connect` (422 `CONNECTION_FAILED`); produção (`environment: 1`) exige `confirmCnpj` igual (422 `CONFIRM_PRODUCTION`) e driver real (422 `FAKE_IS_TEST_ONLY`); **primeira vez** cria as regras padrão (`defaultSimplesRules` ou, no regime normal, as mesmas com `review: true`) → 200 **emitente** |
| ★ `GET /v1/fiscal/rules` · `POST` · `PATCH /:id` · `DELETE /:id` | **`{ data: [{ id, name, when, set, review, active, position }] }`**; `set.cfop` com 4 dígitos, `csosn` ou `cst`, alíquotas 0–100 (400 com `path`); salvar pelo `PATCH` limpa o `review` |

## Documentos

Visão ★ (**nota**): `{ id, model, series, number, key, status, emissionType, environment, protocol, authorizedAt, rejection: { code, message } | null, lastError, recipient, items: [{ description, ncm, cfop, csosn, cst, unit, qty, unitCents, grossCents, discountCents, freightCents, icmsCents, ipiCents, pisCents, cofinsCents, cbsCents, ibsUfCents, ibsMunCents }], totals: { productsCents, discountCents, freightCents, otherCents, icmsBaseCents, icmsCents, ipiCents, pisCents, cofinsCents, cbsCents, ibsUfCents, ibsMunCents, totalCents }, payments, qrCodeUrl, ref: { app, entity, id } | null, corrections: [{ sequence, text, protocol, at }], canceledAt, cancelJustification, createdAt }`.

| Rota | Faz |
|---|---|
| ★ `POST /v1/fiscal/documents` | **`{ model: 55 \| 65, operation?: "SALE", recipient?: { document?, name?, uf?, foreign?, consumerFinal?, address?, email? }, items: [{ productId?, code?, description, ncm, unit, qty, unitCents, discountCents?, cfop? }], freightCents?, discountCents?, otherCents?, payments?: [{ method, amountCents }], additionalInfo?, ref? }`** → `fiscal.issue()` (`01`) → **201 nota** já com o resultado do driver (`AUTHORIZED`, `REJECTED`, `DENIED`, `CONTINGENCY` ou `PROCESSING`). Erros: 409 `ISSUER_NOT_CONFIGURED`, 400 `VALIDATION_ERROR` com `errors: [{ path, code, message }]` (os códigos do `validateDocument`: `CFOP_MISMATCH`, `NCM_INVALID`, `RECIPIENT_REQUIRED`, `NFCE_INTERSTATE`, `NFCE_CFOP`, `UNDERPAID`, `IBSCBS_REQUIRED`…), 422 `NO_TAX_RULE` / `RULES_NEED_REVIEW`, 409 `ALREADY_INVOICED` (mesmo `ref` com nota ativa), 403 `PLAN_LIMIT_REACHED` |
| ★ `GET /v1/fiscal/documents` | `?model&status` (vários) `&from&to&q` (número, chave, destinatário) `&refApp&refId`, cursor → **`{ data: [{ id, model, series, number, key, status, recipientName, totalCents, createdAt, ref }] }`** |
| ★ `GET /v1/fiscal/documents/:id` | **nota** (outra empresa → 404) |
| ★ `PATCH /v1/fiscal/documents/:id` | só `REJECTED` (senão 409 `INVALID_STATUS`): mesmo corpo do `POST` sem `model` → recalcula, valida, **mantém série e número** → 200 **nota** (continua `REJECTED` até reenviar) |
| ★ `POST /v1/fiscal/documents/:id/transmit` | `REJECTED`, `CONTINGENCY` ou `PROCESSING` (senão 409 `INVALID_STATUS`) → driver → **nota** |
| ★ `POST /v1/fiscal/documents/:id/cancel` | **`{ justification }`** → `cancelCheck`: 409 `INVALID_STATUS`, 400 `VALIDATION_ERROR` em `justification` (15–255), 409 `CANCEL_WINDOW_EXPIRED`; driver fora → 503 `SEFAZ_UNAVAILABLE` (nada muda) → 200 **nota** `CANCELED` |
| ★ `POST /v1/fiscal/documents/:id/corrections` | **`{ text }`** → `correctionCheck`: 409 `NFE_ONLY`, 409 `INVALID_STATUS`, 400 em `text` (15–1000), 409 `TOO_MANY_CORRECTIONS` → **201 `{ sequence, protocol, at }`** |
| ★ `POST /v1/fiscal/voids` · `GET` | **`{ model, series?, from, to, justification }`** → `voidCheck` com os números já gravados na série: 400 em `from`/`to` (`RANGE_INVALID`) ou `justification`, **409 `NUMBERS_IN_USE` com `numbers`** → **201 `{ id, model, series, from, to, protocol }`**; o próximo número pula a faixa |
| `GET /v1/fiscal/documents/:id/xml` | `application/xml` (o autorizado quando existe), `Content-Disposition` com a chave |
| `GET /v1/fiscal/documents/:id/danfe` | HTML para imprimir: DANFE (A4) da NF-e, DANFE NFC-e (80 mm, com o QR Code); homologação com "SEM VALOR FISCAL"; contingência com "EMITIDA EM CONTINGÊNCIA" |
| ★ `POST /v1/fiscal/fake/outage` | **`{ on: boolean }`** → **`{ on }`** — só driver falso fora de produção (senão 404) |

## Erros novos

`ISSUER_NOT_CONFIGURED` · `ALREADY_INVOICED` · `INVALID_STATUS` · `CANCEL_WINDOW_EXPIRED` · `NFE_ONLY` · `TOO_MANY_CORRECTIONS` · `NUMBERS_IN_USE` (409), `NO_TAX_RULE` · `RULES_NEED_REVIEW` · `CONNECTION_FAILED` · `CONFIRM_PRODUCTION` · `FAKE_IS_TEST_ONLY` (422), `SEFAZ_UNAVAILABLE` (503), `PLAN_LIMIT_REACHED` (403).

## Testes obrigatórios

- Emitente com CNPJ inválido e UF inválida (400 no campo); regras do Simples criadas uma vez; credenciais nunca voltam.
- NF-e: chave de 44 dígitos com DV certo (`parseAccessKey`), números seguidos, CFOP 5102 dentro e 6102 fora do estado, desconto e frete rateados e somando no total.
- Rejeição 778 (NCM `00000000`): corrigir pelo `PATCH` e reenviar autoriza **com o mesmo número**.
- NFC-e: QR Code v2 com hash de 40 caracteres; CFOP de outro estado 400; acima do limite sem CPF 400; pagamento menor 400.
- Cancelamento: justificativa curta 400; fora do prazo 409; cancela; repetido 409.
- Carta de correção: NFC-e 409 `NFE_ONLY`; NF-e sequência 1 e 2.
- Inutilização: faixa com número usado 409 com a lista; faixa livre 201 e o próximo número pula.
- SEFAZ fora: NFC-e `CONTINGENCY` com tpEmis 9 na chave; volta → reenviar autoriza; NF-e fica `PROCESSING`.
- ERP: pedido → NF-e com o NCM do produto e o cliente; segunda vez 409; produto sem NCM 400 no item.
- Outra empresa → 404.
