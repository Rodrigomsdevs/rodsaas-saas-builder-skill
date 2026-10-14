# 01 · Envio

## Peças

```
api/src/lib/email/
├── lib/                 # porte do scripts/email-lib.mjs + testes (Vitest)
├── config.ts            # validateEmailEnv(process.env) no boot; exporta emailConfig
├── mailer.ts            # interface Mailer + send() que enfileira
├── drivers/smtp.ts      # nodemailer → Mailpit (dev) ou SMTP real
├── drivers/resend.ts    # SDK `resend` (ou fetch) → POST /emails
├── drivers/memory.ts    # testes: guarda as mensagens numa lista
├── layout.ts            # layout HTML padrão (marca do rodsaas.json) + versão texto
└── jobs.ts              # worker da fila email.send
```

## Interface

```ts
type MailMessage = {
  to: string | string[]; cc?: string[]; bcc?: string[];
  subject: string; html: string; text: string;
  from?: string | { name: string; address: string };   // padrão: RESEND_FROM
  replyTo?: string;                                     // padrão: RESEND_REPLY_TO
  headers?: Record<string, string>;                     // List-Unsubscribe, Message-ID, In-Reply-To, Auto-Submitted…
  tags?: Record<string, string>;                        // tipo do e-mail, orgId (vão para o painel do Resend)
  attachments?: { filename: string; content: Buffer | string; contentType?: string; contentId?: string }[];
  organizationId?: string | null;                       // vai para o EmailLog
  template: string;                                     // "auth.verify", "invite", "notification.immediate"… (EmailLog e tag)
};
mailer.send(msg, { idempotencyKey?, delaySeconds? }): Promise<{ queued: true; logId: string }>
```

- `send()` **só enfileira** (`email.send`, com o `EmailLog` criado como `QUEUED`). Nenhuma rota espera o provedor.
- Chamado dentro de uma transação, enfileire no `afterCommit` (e-mail de ação desfeita não sai). Para garantir que não se perde, o `EmailLog QUEUED` é gravado na transação e um job `email.sweep` (a cada 5 min) reenfileira `QUEUED` com mais de 5 min.
- `from` de um app (ex.: "Acme Suporte") precisa continuar **no domínio verificado**: o app troca só o nome, o endereço é o de `RESEND_FROM` (ou outro endereço do mesmo domínio). O `Mailer` confere com `isOwnDomain(endereço, RESEND_DOMAIN)` e recusa endereço de fora com erro claro (o Resend recusaria de qualquer jeito).

## Worker `email.send`

```
1. carrega o EmailLog; já SENT → fim (job repetido)
2. filterSuppressed(destinatários, supressões) → todos suprimidos: status SUPPRESSED, fim
3. driver.send(mensagem)   // resend: toResendPayload + header Idempotency-Key = idempotencyKeyFor(logId)
4. ok → status SENT, providerId (id do Resend), sentAt
5. erro → retryDecision({ status, retryAfter, attempt }):
     retry → reagenda em delayMs (429: retry-after; 5xx/rede: 2^n s, até 60 s); 5 tentativas
     não → status FAILED com o motivo (sem dado sensível) e log de erro
```

- **Limite do Resend**: 10 requisições por segundo por time (padrão). O worker roda com concorrência limitada (ex.: 5) e o 429 é tratado; várias filas do projeto (notificações, Suporte, Agenda) passam pela mesma fila, então o limite vale para todas.
- **Um destinatário por envio** nos e-mails que têm link pessoal (convite, senha, chamado do cliente, notificação): nunca juntar pessoas diferentes no mesmo `to` (cada um teria o link do outro). `cc`/`bcc` só quando o conteúdo é o mesmo para todos.
- Assunto sem quebra de linha (o `toResendPayload` limpa) e até 998 caracteres.

## Drivers

| Driver | Quando | Detalhes |
|---|---|---|
| `smtp` | dev (Mailpit) ou quem usa SMTP próprio | nodemailer com `SMTP_*`; mesmos cabeçalhos e anexos |
| `resend` | produção | SDK oficial `resend` (versão atual) ou `fetch` em `https://api.resend.com/emails`; `Authorization: Bearer RESEND_API_KEY`; corpo do `toResendPayload` (campos `from`, `to`, `subject`, `html`, `text`, `reply_to`, `cc`, `bcc`, `headers`, `tags`, `attachments`); resposta `{ id }` → `providerId` |
| `memory` | testes automatizados | guarda as mensagens; os testes conferem destinatário, assunto, links e cabeçalhos |

O driver é escolhido por `resolveDriver()` no boot e logado ("e-mail: resend (mock-lab.dev)" / "e-mail: smtp → localhost:1025").

## EmailLog (tabela de sistema)

```prisma
enum EmailStatus { QUEUED SENT DELIVERED DELAYED BOUNCED COMPLAINED FAILED SUPPRESSED }

model EmailLog {
  id             String      @id @default(uuid(7)) @db.Uuid
  organizationId String?     @db.Uuid
  template       String
  to             String                   // um destinatário (ou o primeiro, com cc)
  subject        String
  status         EmailStatus @default(QUEUED)
  providerId     String?     @unique      // id do Resend (o webhook acha o envio por aqui)
  attempts       Int         @default(0)
  error          String?
  sentAt         DateTime?
  updatedAt      DateTime    @updatedAt
  createdAt      DateTime    @default(now())
  @@index([organizationId, createdAt])
  @@index([to, createdAt])
}
```

- Tabela **de sistema** (como `StripeEvent`): sem RLS, nunca exposta por rota de tenant; o owner vê só os da empresa dele pela rota de "e-mails com problema" (`02`), que filtra por `organizationId`. Justifique no README do projeto.
- Não guarda o corpo (pode ter link com token). Retenção: 30 dias (job diário `email.cleanup`).

## Layout padrão

- `layout({ title, preheader, bodyHtml, cta?: { label, url }, footer? })` → `{ html, text }`: uma coluna até 600 px, logo e cor da marca do `rodsaas.json`, botão com fallback de link em texto, rodapé com `product.name`, "Precisa de ajuda? Responda este e-mail ou escreva para <RESEND_SUPPORT_EMAIL>", e o motivo do e-mail.
- Versão texto sempre (o Resend gera do HTML se faltar, mas a nossa é mais limpa).
- Todos os e-mails da base passam a usar o layout: verificação de e-mail, redefinir senha, convite, pagamento recusado, aviso de troca de plano.
- E-mails de presets (notificações, Suporte, Agenda, Forms) usam o mesmo `Mailer` e o mesmo layout (ou o layout próprio deles por cima do padrão).

## Testes obrigatórios

- `validateEmailEnv`: `.env` do exemplo passa; cada erro comum barra o boot com a chave certa.
- Worker com o Resend simulado (servidor HTTP local ou `fetch` mockado): corpo com `from`/`reply_to` padrão e `Idempotency-Key`; 429 com `retry-after: 2` reagenda em 2 s; 503 tenta de novo; 422 vira `FAILED` sem repetir; job repetido depois de `SENT` não manda de novo.
- Suprimido não recebe (status `SUPPRESSED`) e o resto do envio segue.
- Rota que manda e-mail responde sem esperar o provedor (driver lento não atrasa a resposta).
- E-mail com link pessoal sai um por destinatário.
