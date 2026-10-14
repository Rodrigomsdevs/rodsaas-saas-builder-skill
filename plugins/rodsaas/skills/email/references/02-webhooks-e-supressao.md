# 02 · Webhook e supressão

## Rota

★ `POST /v1/webhooks/resend` — pública (assinatura do Resend), sem checagem de Origin, sem rate limit por usuário, fora do OpenAPI público (`schema: { hide: true }`).

Corpo **cru**, igual ao webhook da Stripe da base (escopo encapsulado com parser próprio):

```ts
app.register(async (scope) => {
  scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body))
  scope.post('/v1/webhooks/resend', { config: { public: true, csrf: false, rateLimit: false }, schema: { hide: true } }, resendWebhook)
})
```

## Processamento

```
1. sem RESEND_WEBHOOK_SECRET → 503 WEBHOOK_NOT_CONFIGURED (log de erro; em produção o boot já barrou)
2. new Webhook(RESEND_WEBHOOK_SECRET).verify(corpoCru, { svix-id, svix-timestamp, svix-signature })   // lib svix
   (ou resend.webhooks.verify da versão atual do SDK) → falhou: 401 INVALID_WEBHOOK_SIGNATURE
   A lib recusa horário fora de ±5 min (reenvio de evento capturado). Nunca JSON.parse + JSON.stringify antes.
   Só depois de conferir: evento = JSON.parse(corpoCru). (Na `svix` 2.x o `verify` não devolve o evento: o retorno é
   `undefined`; não use o retorno como payload — confira na versão instalada.)
3. EmailWebhookEvent(svixId) já existe → 200 (o Resend reenvia; nada é processado duas vezes)
4. classifyEvent(evento) → trata (tabela abaixo) e grava EmailWebhookEvent na MESMA transação
5. 200 { ok: true }
```

- Evento de um envio que não conhecemos (outro ambiente usando a mesma conta, envio antigo já limpo) → **200** e ignora. Tipo desconhecido → 200 e ignora. Erro nosso ao processar → log de erro e **500 só se for transitório** (banco fora); nunca 500 por dado inesperado, senão o Resend reenvia para sempre.
- Responda rápido: o que é pesado (buscar o e-mail recebido) vai para a fila (`email.inbound`) e a rota já devolve 200.

```prisma
model EmailWebhookEvent {
  svixId     String   @id
  type       String
  receivedAt DateTime @default(now())
}

enum SuppressionReason { BOUNCE COMPLAINT PROVIDER MANUAL }

model EmailSuppression {
  address   String            @id          // minúsculas
  reason    SuppressionReason
  detail    String?                        // subType da devolução ("General", "Suppressed"…)
  createdAt DateTime          @default(now())
}
```

Tabelas **de sistema** (sem RLS, sem `organizationId`): guardam só o endereço e o motivo, e valem para o produto inteiro (um endereço que devolve, devolve para qualquer empresa). Justifique no README. `EmailWebhookEvent` limpa com 30 dias.

## O que cada evento faz

| Evento | `classifyEvent` | Ação |
|---|---|---|
| `email.delivered` | `delivered` | `EmailLog` (por `providerId` = `data.email_id`) → `DELIVERED` |
| `email.delivery_delayed` | `delayed` | → `DELAYED` (o Resend continua tentando) |
| `email.bounced` com `bounce.type = Permanent` | `suppress` | → `BOUNCED` + `EmailSuppression(BOUNCE, subType)` para cada endereço de `data.to` |
| `email.bounced` temporária | `delayed` | → `DELAYED`, **sem** suprimir |
| `email.complained` | `suppress` | → `COMPLAINED` + `EmailSuppression(COMPLAINT)`; se for e-mail de notificação, também desliga o e-mail de notificações da pessoa (preferência `emailMode: OFF` do add-on `notificacoes`) |
| `email.suppressed` | `suppress` | `EmailSuppression(PROVIDER)` (o próprio Resend já bloqueou) |
| `email.failed` | `failed` | → `FAILED` com o motivo |
| `email.received` | `received` | `InboundEmail(RECEIVED)` + fila `email.inbound` (`03-recebimento.md`) |
| o resto (`email.sent`, `opened`, `clicked`, contatos…) | `ignore` | 200 |

Eventos que o webhook assina: `WEBHOOK_EVENTS` da lib (`email.received`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`). Abertura e clique ficam de fora (rastreio desligado por padrão: privacidade e entregabilidade).

## Efeitos da supressão no produto

- O `Mailer` não envia para suprimidos (`01-envio.md`), em qualquer driver (vale também em dev, para testar).
- **Membros** (`/configuracoes/membros`): membro com e-mail suprimido aparece com o selo "E-mail não entrega" e a dica ("Peça para a pessoa conferir o endereço em Perfil"); `GET /v1/members` devolve `emailDeliverable: false`.
- **Perfil**: trocar o e-mail (fluxo de verificação da base) com um endereço novo resolve; o owner/admin pode **remover da lista** (`DELETE /v1/email-suppressions/:address`, só para endereço de membro da empresa dele, com confirmação e `AuditLog`) quando a pessoa garantir que a caixa voltou a funcionar — reclamação de spam (`COMPLAINT`) só sai pelo próprio dono do endereço, marcando de novo que quer receber.
- **E-mails com problema** (owner/admin, Configurações → E-mails): `GET /v1/email-logs?status=BOUNCED|COMPLAINED|FAILED|SUPPRESSED&cursor=` da empresa (por `organizationId`), com destinatário mascarado (`maskEmail`) para quem não é owner, modelo, data e motivo. Ajuda a responder "o convite não chegou".

## Erros novos

| code | Status | Quando |
|---|---|---|
| `INVALID_WEBHOOK_SIGNATURE` | 401 | assinatura ausente, errada ou fora do horário |
| `WEBHOOK_NOT_CONFIGURED` | 503 | `RESEND_WEBHOOK_SECRET` vazio |

## Testes obrigatórios

- Assinatura: sem cabeçalhos → 401; assinatura de outro segredo → 401; corpo alterado → 401; horário de 10 min atrás → 401; válida → 200 (assinatura gerada com `signSvix` da lib, conferida também pela lib `svix` no próprio teste).
- Mesmo `svix-id` duas vezes → processa uma vez.
- `email.delivered` de envio desconhecido → 200 sem erro.
- Devolução definitiva → endereço suprimido → o próximo e-mail para ele vira `SUPPRESSED` e não sai; devolução temporária não suprime; reclamação suprime e desliga o e-mail de notificações.
- `GET /v1/email-logs` só da empresa; membro → 403; remover da lista exige ser endereço de membro da empresa.
