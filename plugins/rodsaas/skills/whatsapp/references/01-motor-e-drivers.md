# 01 · Motor e drivers

Código em `api/src/modules/whatsapp/` (`lib/` = porte do `whatsapp-lib`, `drivers/` = um arquivo por driver, `service.ts` = `whatsapp.send()` e o processamento do webhook). Toda tabela com `organizationId` e **RLS `FORCE`**, menos a de busca do webhook (só token → ids).

## Modelo

```prisma
model WhatsAppConnection {               // uma por empresa
  organizationId   String   @id @db.Uuid
  driver           String                       // fake | meta | zenvia | rodticket
  phone            String                       // E.164 sem "+" (normalizePhone)
  displayName      String?
  credentialsEnc   String?                      // JSON criptografado (AES-256-GCM, WHATSAPP_ENCRYPTION_KEY)
  webhookTokenHash String   @unique             // token da URL do webhook (só o hash)
  webhookSecretEnc String                       // segredo da assinatura (mostrado uma vez)
  status           String   @default("CONNECTED") // CONNECTED | ERROR | DISCONNECTED
  lastError        String?
  defaultApp       String?                      // rota padrão do que chega (helpdesk, crm…)
  connectedAt      DateTime @default(now())
}
model WhatsAppWebhookLookup { tokenHash String @id; organizationId String @db.Uuid }  // SEM RLS: o provedor chega só com o token

model WhatsAppTemplate {
  id             String  @id @default(uuid(7)) @db.Uuid
  organizationId String  @db.Uuid
  name           String                         // único na empresa (validateTemplate)
  category       String                         // UTILITY | MARKETING | AUTHENTICATION
  language       String  @default("pt_BR")
  body           String
  buttons        String[]
  status         String  @default("PENDING")    // PENDING | APPROVED | REJECTED (o provedor decide)
  rejectedReason String?
  providerId     String?
  system         Boolean @default(false)        // criado pelo motor (agenda_lembrete…), não apaga
  @@unique([organizationId, name])
}

model WhatsAppConversation {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  phone          String
  name           String?                         // do contato do provedor ou do app
  lastInboundAt  DateTime?                       // abre a janela (windowState)
  lastMessageAt  DateTime?
  optedOutAt     DateTime?                       // PARAR
  app            String?                         // último app que conversou (routeInbound)
  unread         Int       @default(0)
  @@unique([organizationId, phone])
}

model WhatsAppMessage {
  id                String   @id @default(uuid(7)) @db.Uuid
  organizationId    String   @db.Uuid
  conversationId    String   @db.Uuid
  direction         String                       // IN | OUT
  mode              String?                      // FREEFORM | TEMPLATE (saída)
  templateName      String?
  variables         String[]
  text              String
  payload           String?                      // botão respondido
  status            String   @default("QUEUED")  // OUT: QUEUED | SENT | DELIVERED | READ | FAILED; IN: RECEIVED
  errorCode         String?                      // interno (normalizeError)
  attempts          Int      @default(0)
  providerMessageId String?
  replyToId         String?  @db.Uuid            // resposta a esta mensagem nossa
  refApp            String?                      // quem mandou/recebe: agenda, crm, helpdesk…
  refEntity         String?
  refId             String?
  createdById       String?  @db.Uuid
  createdAt         DateTime @default(now())
  @@unique([organizationId, providerMessageId])  // dedupe do webhook
  @@index([conversationId, createdAt])
}
```

## Serviço `whatsapp.send(input)`

`{ orgId, to, text? , template?: { name, variables }, media?, ref?: { app, entity, id }, actorId? }` →

1. Conexão `CONNECTED` (senão `NOT_CONNECTED`); limite `whatsappMessagesMonthly` (senão `PLAN_LIMIT_REACHED`).
2. `normalizePhone(to)` (senão `VALIDATION_ERROR` em `to`); conversa criada ou achada pelo número.
3. Descadastrado (`optedOutAt`) → `OPTED_OUT` (o app trata: e-mail continua).
4. Modelo: existe e `APPROVED` (senão `TEMPLATE_NOT_APPROVED`); `renderTemplate` (variáveis faltando → `VALIDATION_ERROR` em `template.variables.N`).
5. `chooseSendMode` com a janela (`windowState(lastInboundAt)`) e as capacidades do driver → senão `OUTSIDE_WINDOW`.
6. Texto livre longo → `splitText` (uma mensagem por parte).
7. Grava `WhatsAppMessage` `QUEUED` e enfileira `wa.send` (chave = id da mensagem: nunca manda duas vezes).

Fila `wa.send`: `driver.send()` → `SENT` com `providerMessageId`; erro → `normalizeError(driver, código)` → `retryDelay` (repete com espera) ou `FAILED` com `errorCode` (a tela mostra `ERRORS[code].message` e "tentar de novo"). Erro `AUTH` marca a conexão `ERROR` e avisa o owner (`whatsapp.connection_error`).

Os apps nunca chamam o provedor: usam `whatsapp.send()` e registram o handler do que chega com `registerWhatsAppHandler(app, { onMessage, quickReplies? })`.

## Contrato do driver

```ts
interface WhatsAppDriver {
  id: string                                  // fake | meta | zenvia | rodticket
  capabilities: { templates?, freeformAnytime?, media?, buttons?, inbound?, statuses?, readReceipts? }
  connect(creds, phone): Promise<{ displayName?, providerAccountId? }>      // confere as credenciais
  send(msg: { to, mode, text, templateName?, language?, variables?, buttons?, media? }): Promise<{ providerMessageId }>
  submitTemplate?(t): Promise<{ providerId, status }>                        // provedores que aprovam modelos
  verifyWebhook(rawBody, headers, secret): boolean
  parseWebhook(rawBody): Array<{ type: "message", id, from, text, payload?, replyTo?, at }
                              | { type: "status", messageId, status, errorCode?, at }
                              | { type: "template", providerId, status, reason? }>
}
```

Registrar com `validateDriver`; o motor decide **pelas capacidades**, nunca pelo nome do driver. Todo driver passa pela **mesma bateria de contrato** (`api/test/whatsapp/driver-contract.test.ts`): conectar, mandar texto e modelo, receber webhook de mensagem, status fora de ordem, erro que repete e erro que não repete.

### Driver falso (`fake`) — o da instalação

- `capabilities`: `templates`, `buttons`, `inbound`, `statuses`, `readReceipts` (sem `freeformAnytime`: imita a regra da janela da Meta).
- `send`: devolve `fake_<uuid>`; número terminado em `0000` falha com `FAKE_NOT_ON_WA` (não tem WhatsApp), em `0429` com `FAKE_RATE` (repete). `submitTemplate`: aprova na hora; nome começando com `reprovar_` volta `REJECTED`.
- Webhook no formato do motor `{ events: [...] }` com `x-hub-signature-256: sha256=<HMAC do corpo>`; em dev, `POST /v1/whatsapp/fake/inbound` e `/fake/status` geram o evento assinado para simular o cliente pela tela (rotas que não existem em produção).

### Drivers reais (quando o usuário escolher)

| Driver | O que ler antes | Observações |
|---|---|---|
| `meta` (Cloud API oficial, integração nativa) | doc atual da WhatsApp Cloud API (envio, modelos, webhooks, Embedded Signup) | cada cliente conecta o número pelo Embedded Signup (o dono do SaaS precisa ser Tech Provider na Meta); webhook com `X-Hub-Signature-256` do app; modelos aprovados pela Meta; cobrança por conversa na conta do cliente; códigos de erro em `DRIVER_ERROR_MAP.meta` (confira na doc) |
| `zenvia` | doc atual da API da Zenvia (canal WhatsApp, webhooks/subscriptions) | credencial por token; modelos aprovados pela Zenvia; preencha a tabela de erros |
| `rodticket` | API do RodTicket (pedir a doc ao dono do RodTicket) | o número fica conectado no RodTicket; o driver só envia e recebe pela API dele; atenção para não responder em dobro se o RodTicket também atende |

Driver real só entra com a bateria de contrato verde contra o sandbox do provedor; credenciais vêm do usuário, criptografadas, nunca no código.

## Testes obrigatórios

- Os testes do `whatsapp-lib` portados; a bateria de contrato com o driver falso.
- `send`: não conectado, número inválido, descadastrado, fora da janela, modelo não aprovado, variável faltando, limite do plano; texto longo em partes.
- Fila: erro que repete tenta de novo com espera; erro que não repete falha com o motivo; `AUTH` marca a conexão.
