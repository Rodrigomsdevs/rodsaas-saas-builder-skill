# 03 · Recebimento

Com o recebimento ligado no domínio (registro MX do Resend, `04-checklist.md`), **qualquer endereço** `@RESEND_DOMAIN` recebe. O Resend dispara `email.received` só com os metadados (remetente, destinatários, assunto, `message_id`, lista de anexos); corpo, cabeçalhos e anexos são buscados na API.

## Fluxo

```
webhook email.received (02) → InboundEmail(RECEIVED, providerId = data.email_id) → fila email.inbound
worker email.inbound:
  1. GET https://api.resend.com/emails/receiving/{id}   (SDK: resend.emails.receiving.get(id))
     → normalizeReceived(resposta)  (from, to, cc, replyTo, receivedFor, subject, text, html, headers, messageId,
                                     inReplyTo, references, authentication, attachments, rawUrl)
  2. anexos: GET da lista de anexos (SDK: resend.emails.receiving.attachments.list({ emailId })) → download_url vale 1 h:
     baixa na hora e guarda pelo add-on uploads (File com purpose "inbound_email"); sem uploads, guarda só os metadados
     e o app mostra "anexo não guardado". Acima do limite do plano/da empresa: aviso no lugar do anexo
  3. routeInbound([...to, ...cc, ...receivedFor], handlers) →
       achou → handler.handle(mensagem, ctx)  → InboundEmail(ROUTED, handler, organizationId)
       não achou → shouldForward(mensagem, { forwardTo: RESEND_INBOUND_FORWARD_TO, domain }) →
                   encaminha com forwardMessage() pelo Mailer → FORWARDED; senão → UNROUTED
  4. erro (API fora, anexo falhou) → nova tentativa (3x, espera crescente) → FAILED com o motivo
```

- A busca do conteúdo precisa de chave com permissão de leitura (`Full access`).
- O `.eml` original (`raw.download_url`, também com validade curta) é guardado pelo `uploads` quando o handler pedir (o Suporte pede, para "ver e-mail original").
- `authentication` (`spf`, `dkim`, `dmarc`) vai junto: o handler pode marcar como suspeito quando DMARC falha (o Suporte mostra o aviso "remetente não confirmado").

## Roteador

```ts
// api/src/lib/email/inbound.ts
registerInboundHandler({
  id: 'helpdesk',
  match: (address, { local, plus, domain }) => /* ctx ou false */,
  handle: async (msg, ctx) => { /* chama o service do app */ },
})
```

- Os handlers são registrados no boot pelos módulos (ordem de registro = prioridade). O primeiro que casar leva.
- Endereço com `+` (`suporte+acme@…`) casa com o handler do endereço sem o `+` e entrega `plus` no contexto.
- **Handlers da base**:
  - `support`: o endereço de `RESEND_SUPPORT_EMAIL` (e `RESEND_REPLY_TO`, se for outro). Sem o Suporte instalado, encaminha para `RESEND_INBOUND_FORWARD_TO`; com o Suporte instalado e uma empresa "da casa" configurada (`HELPDESK_HOUSE_ORG_ID`), vira chamado nela — é o suporte do próprio SaaS.
  - `no-reply`: o endereço de `RESEND_FROM`. Resposta para o `no-reply` (gente que responde sem olhar) é encaminhada como o `support`, e o remetente recebe **uma vez por dia** um aviso curto "Este endereço não é lido; escreva para <RESEND_SUPPORT_EMAIL>" (nunca para automáticos, nunca para o próprio domínio).
- **Handlers dos apps**: o Suporte registra o endereço de cada empresa (`helpdesk/references/06-email-e-integracoes.md`, modo RESEND). Outros apps futuros (respostas por e-mail em Tarefas, por exemplo) entram do mesmo jeito.
- Partes locais reservadas (`isReservedLocalPart`: no-reply, postmaster, abuse, suporte, support, contato, financeiro, admin…) nunca viram endereço de empresa.

## InboundEmail (tabela de sistema)

```prisma
enum InboundStatus { RECEIVED ROUTED FORWARDED UNROUTED FAILED IGNORED }

model InboundEmail {
  id             String        @id @default(uuid(7)) @db.Uuid
  providerId     String        @unique                 // email_id do Resend (dedupe: o webhook repetido não duplica)
  messageId      String?
  fromAddress    String?
  toAddresses    String[]
  subject        String?
  status         InboundStatus @default(RECEIVED)
  handler        String?
  organizationId String?       @db.Uuid
  attempts       Int           @default(0)
  error          String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  @@index([status, createdAt])
}
```

- Sem corpo (o corpo fica com o app que cuidou, ou some depois do encaminhamento). Retenção: 90 dias.
- `npm run email:inbound -- --status FAILED|UNROUTED` lista; `-- --retry <id>` reprocessa (busca de novo no Resend; o `providerId` continua válido no Resend pelo período de retenção deles).
- `IGNORED`: automático sem dono (resposta automática, devolução, lista) — nunca encaminhado nem respondido.

## Proteções

- **Loop**: nunca encaminhar nem responder e-mail automático (`isAutomated`: `Auto-Submitted`, `Precedence: bulk/list/junk`, `List-Id`, `MAILER-DAEMON`), do próprio domínio, ou que já passou por aqui (`X-Rodsaas-Forwarded`). O encaminhamento sai com `Auto-Submitted: auto-forwarded`.
- **Destino do encaminhamento fora do domínio** (`validateEmailEnv` barra `RESEND_INBOUND_FORWARD_TO` no próprio domínio).
- **Dedupe**: `providerId` único e, no app, `Message-ID` único por empresa (o Suporte já faz).
- **Tamanho**: anexos acima do limite não derrubam o processamento (viram aviso).
- **HTML recebido nunca é mostrado sem sanitizar** (o app que exibe usa `sanitize-html`, como o Suporte).

## Testes obrigatórios

- Webhook `email.received` cria `InboundEmail` e enfileira; repetido não duplica.
- Worker com a API do Resend simulada: normaliza, baixa anexos, roteia para o handler certo (exato, com `+`, por `received_for`), encaminha o que ninguém pegou com `Reply-To` do remetente, `UNROUTED` sem destino.
- Automático, do próprio domínio e já encaminhado: nunca encaminha (`IGNORED`).
- Resposta para o `no-reply`: encaminha e avisa o remetente no máximo uma vez por dia.
- API fora: 3 tentativas e `FAILED`; `--retry` reprocessa.
