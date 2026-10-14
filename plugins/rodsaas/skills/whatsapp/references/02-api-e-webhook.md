# 02 · API e webhook

Padrão da base: `/v1`, tenant do token, Zod estrito, RFC 9457. Conexão e modelos: owner/admin; conversas e envio: membros com acesso a algum app que usa WhatsApp. Os formatos ★ fazem parte do contrato testável (`skills/verify/contract.json`, grupo `presets.whatsapp`).

## Conexão e modelos

| Rota | Faz |
|---|---|
| ★ `GET /v1/whatsapp/connection` | **`{ driver, status, phone, displayName, capabilities, webhookUrl, defaultApp }`** (`driver: null` e `status: "DISCONNECTED"` quando não conectou) |
| ★ `PUT /v1/whatsapp/connection` | **`{ driver, phone, credentials?, defaultApp? }`** → driver registrado (senão 400 em `driver`), `normalizePhone` (400 em `phone`), `driver.connect()` (falha → 422 `CONNECTION_FAILED` com o motivo) → cria os modelos do sistema → 200 com **`webhookSecret`** (só nesta resposta) |
| `DELETE /v1/whatsapp/connection` | desconecta (mensagens ficam; envio passa a dar `NOT_CONNECTED`) |
| `POST /v1/whatsapp/connection/test` | `{ to }` manda o modelo `teste_conexao` |
| ★ `GET /v1/whatsapp/templates` · ★ `POST` | **`{ name, category, language, body, buttons? }`** → `validateTemplate` (400 com `path`), nome repetido 409 `TEMPLATE_EXISTS` → `driver.submitTemplate` → 201 **`{ id, name, status, rejectedReason, body, buttons }`** |

## Mensagens e conversas

| Rota | Faz |
|---|---|
| ★ `POST /v1/whatsapp/messages` | **`{ to, text? , template?: { name, variables }, ref? }`** → `whatsapp.send()` → **202 `{ id, status: "QUEUED", mode, conversationId }`**; erros: 409 `NOT_CONNECTED`, 400 `VALIDATION_ERROR` (`to`, `template.variables.N`), 409 `OPTED_OUT`, 409 `OUTSIDE_WINDOW`, 409 `TEMPLATE_NOT_APPROVED`, 403 `PLAN_LIMIT_REACHED` |
| ★ `GET /v1/whatsapp/conversations` | `?q&app&unread=1` → **`{ data: [{ id, phone, name, lastMessageAt, window: { open, closesAt }, optedOut, unread, app }] }`** |
| ★ `GET /v1/whatsapp/conversations/:id/messages` | **`{ data: [{ id, direction, text, status, mode, errorCode, error, providerMessageId, ref: { app, entity, id } \| null, createdAt }] }`** (marca como lidas) |
| `POST /v1/whatsapp/messages/:id/retry` | só `FAILED` com erro que pode repetir |

## Webhook

★ `POST /v1/public/whatsapp/webhook/:token` (sem login, sem checagem de Origin, **corpo cru**):

1. Token → `WhatsAppWebhookLookup` (senão 404). Driver da conexão `verifyWebhook(raw, headers, segredo)` → senão **401 `INVALID_SIGNATURE`** (nada processado).
2. `parseWebhook` → eventos. Cada um numa transação; repetido (mesmo `providerMessageId`) é ignorado. Responde **200 `{ received }`** rápido; trabalho pesado na fila. Erro nosso → 200 com o erro registrado (o provedor reenviaria em loop).
3. **message**: grava `IN`, `lastInboundAt` (abre a janela), `unread + 1`. `isOptOut` → `optedOutAt` e resposta automática "Pronto, você não vai mais receber mensagens. Para voltar, envie VOLTAR." (texto livre: a janela acabou de abrir); `isOptIn` → limpa. Senão `routeInbound` (resposta → app da mensagem respondida; recente; chamado aberto; padrão; caixa) → `onMessage` do app (o da Agenda entende "1/Confirmo" com `parseQuickReply`).
4. **status**: `nextStatus` na mensagem pelo `providerMessageId` (fora de ordem não volta); `FAILED` com o código traduzido.
5. **template**: atualiza o status do modelo (`APPROVED`/`REJECTED` com o motivo).

Formato do driver falso (e do `/rodsaas:verify`): `{ "events": [{ "type": "message", "id": "w1", "from": "5544999991234", "text": "1", "replyTo": "fake_…" }, { "type": "status", "messageId": "fake_…", "status": "DELIVERED" }] }` com `x-hub-signature-256: sha256=<HMAC-SHA256 do corpo com o webhookSecret>`.

## Erros novos

`NOT_CONNECTED` · `OPTED_OUT` · `OUTSIDE_WINDOW` · `TEMPLATE_NOT_APPROVED` · `TEMPLATE_EXISTS` (409), `CONNECTION_FAILED` (422), `INVALID_SIGNATURE` (401), `PLAN_LIMIT_REACHED` (403).

## Testes obrigatórios

- Conectar com driver desconhecido e número inválido (400); segredo do webhook só na resposta da conexão.
- Modelo inválido com os caminhos; aprovado e reprovado pelo driver falso.
- Janela: sem conversa → `OUTSIDE_WINDOW`; depois de uma mensagem do cliente, texto livre passa.
- Webhook: assinatura errada 401; repetido não duplica; status fora de ordem não volta; PARAR bloqueia e VOLTAR libera.
- Roteamento: resposta à confirmação da Agenda confirma a presença.
- Outra empresa não vê a conversa (404).
