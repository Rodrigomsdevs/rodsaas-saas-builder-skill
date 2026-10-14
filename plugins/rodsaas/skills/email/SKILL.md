---
name: email
description: Configura todo o e-mail de um projeto rodsaas com o Resend — envio de todos os e-mails (cadastro, convites, senha, cobrança, notificações, Suporte, Agenda, Forms) pela API do Resend com remetente e resposta do domínio verificado, fila com nova tentativa respeitando o limite do Resend, chave de idempotência, lista de supressão (devolução definitiva e reclamação de spam), webhook assinado (Svix) com status de entrega, recebimento de e-mails (email.received) com roteador para os apps (Suporte) e encaminhamento do que ninguém pegou, script que confere o domínio e cria o webhook, e Mailpit em dev. Use quando o usuário pedir Resend, configurar e-mail, domínio de e-mail, SPF/DKIM, receber e-mails, webhook de e-mail, e-mails caindo no spam ou não chegando num projeto rodsaas, ou chamar /rodsaas:email. O /rodsaas:backend já usa esta skill na fase de plataforma.
---

# rodsaas · email

Deixa o e-mail do projeto **pronto para produção com o Resend**, nos dois sentidos:

- **Envio**: todo e-mail do projeto passa por um `Mailer` único. Em dev vai para o Mailpit (o `/rodsaas:verify` lê de lá); em produção vai pela API do Resend, com remetente e "responder para" do domínio verificado.
- **Webhook**: o Resend avisa entregue, atrasado, devolvido, reclamação de spam e falha. Devolução definitiva e spam entram na **lista de supressão** e o endereço não recebe mais (proteger a reputação do domínio).
- **Recebimento**: e-mail que chega no domínio vira o evento `email.received`; a API busca o conteúdo e entrega para quem cuida daquele endereço (o Suporte, por exemplo). O que ninguém pegou é **encaminhado** para a caixa real do dono, sem loop.

## Como funciona

```
app ── mailer.send({ to, subject, html, text, headers, tags }) ──▶ fila email.send (pg-boss)
          supressão? → descarta e registra · senão driver: smtp (Mailpit, dev) | resend (produção)
          resend: POST /emails com Idempotency-Key; 429 espera o retry-after; 5xx tenta de novo; 4xx falha
Resend ── POST /v1/webhooks/resend (svix-id, svix-timestamp, svix-signature; corpo cru) ──▶ API
          confere assinatura (±5 min) → já processado? 200 → trata → 200
          delivered/delayed/failed → EmailLog · bounced(Permanent)/complained/suppressed → EmailSuppression
          received → fila email.inbound → GET /emails/receiving/{id} → roteador → app | encaminhar | UNROUTED
```

## Antes de começar

- Projeto rodsaas com `api/` verde (fila pg-boss e `Mailer` da base). Em projeto novo, o `/rodsaas:backend` chama esta skill na Fase 6.
- Conta no Resend com o domínio adicionado. O usuário preenche o `.env`; a skill **nunca** inventa nem grava chave real no código.
- Mesma regra de versões das outras skills: `npm view resend version`, `npm view svix version` e a doc atual do Resend (envio, webhooks, recebimento). Se a doc atual contradiz esta skill, a doc vence e o desvio vai para o relatório.

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo**, exceto o que está marcado como fora do escopo. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": enviar direto sem fila, webhook sem conferir a assinatura, sem lista de supressão ou receber sem roteador **não é** o e-mail desta skill.
3. **O contrato testável (rota ★ e comportamento do webhook) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.**
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem e-mail (revisão)

Se `rodsaas.json → addons` já tem `email`, ou o projeto já manda e-mail (`api/src/lib/mailer.ts` com SMTP/nodemailer), rode em **modo revisão**:

1. Leia todas as referências inteiras.
2. Compare item a item com o código e monte a tabela de lacunas (item · ✅/❌ · onde está ou o que falta). Comece pelo "Pronto quando" das fases 1 e 2 (é onde mais se simplifica: envio fora da fila, remetente fora do domínio verificado, sem `Idempotency-Key`, webhook com `JSON.parse` antes de conferir a assinatura, sem supressão).
3. Mostre a tabela e complete **fase por fase**, sem quebrar o que já funciona: o SMTP vira o driver `smtp` (continua valendo em dev e para quem não usa o Resend), `MAIL_FROM` continua aceito como nome antigo de `RESEND_FROM`.
4. Feche com `references/04-checklist.md` e o `/rodsaas:verify` (`-g "E-mail"`).

## Variáveis (em `api/.env`)

```bash
MAIL_DRIVER=                 # vazio = resend se houver RESEND_API_KEY, senão smtp (Mailpit). Em dev pode forçar smtp
RESEND_API_KEY=              # re_... (painel do Resend → API Keys). Com recebimento ou email:setup, use "Full access" (leem a API); só envio: "Sending access" basta
RESEND_DOMAIN="mock-lab.dev"                                  # domínio verificado no Resend (sem ponto e vírgula no fim)
RESEND_FROM="Rodsaas Claude <no-reply@mock-lab.dev>"          # remetente padrão de todos os e-mails
RESEND_REPLY_TO="Rodsaas Claude <support@mock-lab.dev>"       # para onde vão as respostas dos e-mails automáticos
RESEND_SUPPORT_EMAIL="Rodsaas Claude <support@mock-lab.dev>"  # contato de suporte mostrado nos e-mails e no app
RESEND_SUPPORT_NAME="Rodsaas Claude"
RESEND_WEBHOOK_SECRET=       # whsec_... (o npm run email:setup cria o webhook e mostra uma vez)
RESEND_INBOUND_FORWARD_TO=   # opcional: caixa real (Gmail etc.) que recebe o que chegou e nenhum app pegou

SMTP_HOST=localhost          # Mailpit em dev (driver smtp)
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
```

O `env.ts` valida com `validateEmailEnv()` (de `scripts/email-lib.mjs`) e o boot para com a mensagem do campo errado: remetente fora do domínio verificado, ponto e vírgula sobrando, chave sem `re_`, produção sem webhook, produção mandando para o Mailpit, encaminhamento para o próprio domínio (loop).

## Fases

Cada fase termina com typecheck, lint, testes e commit (`feat(email): ...`).

1. **Envio** — porte do `email-lib` (com os testes), `env.ts`, `Mailer` com drivers `smtp` e `resend`, fila `email.send`, supressão antes de enviar, `EmailLog`, layout padrão, e-mails da base passando por ele. → `references/01-envio.md`
   - *Pronto quando*: todo e-mail do projeto sai pelo `Mailer` e pela fila; driver `resend` com `Idempotency-Key`, `retry-after` no 429 e sem repetir 4xx; remetente/resposta padrão do `.env`; suprimidos não recebem; `EmailLog` grava cada envio; testes com mailer em memória e com o Resend simulado.
2. **Webhook e supressão** — rota `POST /v1/webhooks/resend` com corpo cru e assinatura, idempotência por `svix-id`, status de entrega, supressão, tela de e-mails com problema para o owner. → `references/02-webhooks-e-supressao.md`
   - *Pronto quando*: assinatura conferida com a lib `svix` no corpo cru (±5 min), evento repetido não reprocessa, evento desconhecido responde 200, devolução definitiva/reclamação/suprimido entram na lista, membro com e-mail suprimido aparece marcado em Membros.
3. **Recebimento** — `email.received` → fila → busca do conteúdo e anexos → roteador (`routeInbound`) → app; encaminhamento sem loop; `InboundEmail` com reprocessar. → `references/03-recebimento.md`
   - *Pronto quando*: conteúdo buscado em `GET /emails/receiving/{id}`, anexos baixados dentro de 1 h (pelo `uploads`, se houver), roteador com handlers registrados pelos apps, o que ninguém pegou encaminhado (ou `UNROUTED`), automáticos e do próprio domínio nunca encaminhados, nada se perde.
4. **Script e fechamento** — `npm run email:setup` / `email:check`, README do projeto, `rodsaas.json → addons` com `email`, `references/04-checklist.md` e `/rodsaas:verify -g "E-mail"`.
   - *Pronto quando*: o script mostra o status do domínio (envio e recebimento) e os registros DNS pendentes, cria o webhook com os eventos certos e mostra o segredo uma vez, manda o e-mail de teste; o README do projeto tem o passo a passo.

## Princípios

- **Um caminho só.** Nenhum código chama o Resend ou o nodemailer direto: tudo pelo `Mailer`, tudo pela fila. Trocar de provedor é trocar o driver.
- **Dev nunca manda e-mail de verdade.** Sem `RESEND_API_KEY` (ou com `MAIL_DRIVER=smtp`), tudo vai para o Mailpit — é de lá que o `/rodsaas:verify` lê.
- **Reputação do domínio.** Devolução definitiva e spam nunca recebem de novo; remetente sempre do domínio verificado; `Reply-To` para uma caixa que alguém lê.
- **Webhook é porta aberta.** Assinatura conferida no corpo cru antes de qualquer coisa; repetido é ignorado; erro nosso nunca vira 500 em loop (o Resend reenvia).
- **Nenhum e-mail recebido se perde.** Ou um app pegou, ou foi encaminhado, ou está em `InboundEmail` com reprocessar.

## Relatório final

Driver ativo em dev e produção, domínio e status (envio/recebimento), registros DNS pendentes, webhook criado (URL e eventos), endereços que recebem e quem cuida de cada um, variáveis que faltam preencher, resultado do `/rodsaas:verify -g "E-mail"`, desvios.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-envio.md` | Fase 1 |
| `references/02-webhooks-e-supressao.md` | Fase 2 |
| `references/03-recebimento.md` | Fase 3 |
| `references/04-checklist.md` | Fase 4 (e o passo a passo do DNS e do painel do Resend) |
| `scripts/email-lib.mjs` + `email-lib.test.mjs` | endereços, validação do `.env`, driver, corpo do Resend, nova tentativa, assinatura Svix, eventos, roteamento, normalização do recebido, encaminhamento sem loop: porte para TS com os testes |
