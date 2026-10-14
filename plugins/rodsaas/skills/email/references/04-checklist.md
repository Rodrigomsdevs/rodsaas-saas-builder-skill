# 04 · Script, passo a passo e checklist

## `npm run email:setup` e `npm run email:check`

Script em `api/scripts/email-setup.ts` (como o `billing:sync`), usando a API do Resend com `RESEND_API_KEY` (precisa de `Full access`):

```
npm run email:check                                   # só confere e mostra o que falta
npm run email:setup -- --webhook https://api.meusaas.com.br/v1/webhooks/resend [--test voce@gmail.com]
```

1. `validateEmailEnv(process.env)`: mostra cada erro com a chave e para.
2. Domínio: `GET /domains` → o de nome `RESEND_DOMAIN` → `GET /domains/{id}`. Mostra `status` (precisa ser `verified`), `capabilities.sending` e `capabilities.receiving`, e **cada registro** de `records` que não está verificado (`record`, `type`, `name`, `value`, `priority`) num formato fácil de copiar para o DNS. Domínio não encontrado → "Adicione mock-lab.dev em resend.com/domains".
3. Webhook: `GET /webhooks` → procura um com `endpoint` igual ao `--webhook`.
   - existe: confere `status: enabled` e se `events` contém todos os `WEBHOOK_EVENTS`; faltando algum, lista e explica como marcar no painel;
   - não existe (só no `setup`): `POST /webhooks { endpoint, events: WEBHOOK_EVENTS }` e mostra **uma única vez** o `signing_secret` ("coloque em RESEND_WEBHOOK_SECRET e reinicie a API").
   - `--webhook` com `http://` ou `localhost` → recusa (o Resend precisa alcançar a URL; em dev use um túnel, abaixo).
4. `--test <e-mail>`: manda um e-mail de teste pelo driver `resend` (direto, fora da fila) e mostra o `id`; o webhook deve marcar `DELIVERED` em segundos (o script espera até 30 s consultando o `EmailLog`).
5. Recebimento ligado: lembra de mandar um e-mail de fora para `teste@RESEND_DOMAIN` e conferir `npm run email:inbound -- --status UNROUTED` (ou a caixa de `RESEND_INBOUND_FORWARD_TO`).

## Passo a passo no painel do Resend e no DNS (vai para o README do projeto)

1. **Domínio**: resend.com → Domains → Add domain (`mock-lab.dev`). Copie os registros que o painel mostra (DKIM, SPF/MX de retorno do envio) para o DNS e espere ficar **Verified**.
2. **DMARC** (recomendado; Gmail e Yahoo exigem para volume): TXT em `_dmarc` com `v=DMARC1; p=none; rua=mailto:<uma caixa sua>` para começar; depois de semanas sem problema, `p=quarantine`.
3. **Recebimento**: na página do domínio, ligue **Receiving** e crie o registro **MX** mostrado (só ele é verificado de novo). Atenção: se o domínio já recebe e-mail em outro lugar (Google Workspace, Microsoft 365, Zoho, Locaweb), o MX com **menor prioridade** vence — use um **subdomínio** para o Resend (ex.: `in.mock-lab.dev`) ou encaminhe da caixa atual para um endereço do domínio do Resend. Nunca dois MX com a mesma prioridade (entrega imprevisível).
4. **Chave**: API Keys → Create (`Full access` para o `email:setup` e o recebimento) → `RESEND_API_KEY`.
5. **Webhook**: `npm run email:setup -- --webhook https://api.<seu domínio>/v1/webhooks/resend` (ou no painel: Webhooks → Add endpoint, com os eventos de `WEBHOOK_EVENTS`) → `RESEND_WEBHOOK_SECRET`.
6. **Teste**: `npm run email:setup -- --webhook … --test voce@gmail.com`; abra o e-mail, veja "Mostrar original" (SPF, DKIM e DMARC = PASS).
7. **Dev**: deixe `RESEND_API_KEY` vazio (ou `MAIL_DRIVER=smtp`) e use o Mailpit (`localhost:8025`). Para testar o webhook do Resend em dev, exponha a API com um túnel (`cloudflared tunnel --url http://localhost:3333`) e crie um webhook **separado** para a URL do túnel (outro segredo; nunca aponte o webhook de produção para a máquina de dev).

## Checklist

### Envio
- [ ] `email-lib` portado com todos os testes passando
- [ ] `env.ts` com `validateEmailEnv`; boot para com mensagem clara em cada erro comum
- [ ] nenhum `nodemailer`/`resend` chamado fora de `lib/email/drivers` (procure no código)
- [ ] todo e-mail pela fila `email.send`, enfileirado depois do commit, com `EmailLog`; `email.sweep` reenfileira os perdidos
- [ ] driver `resend`: `Idempotency-Key`, 429 com `retry-after`, 5xx de novo, 4xx `FAILED`, concorrência limitada
- [ ] remetente sempre do domínio verificado; `Reply-To` padrão; um destinatário por e-mail com link pessoal
- [ ] layout padrão com a marca em todos os e-mails da base; versão texto
- [ ] suprimidos não recebem (em qualquer driver)

### Webhook e supressão
- [ ] rota com corpo cru e verificação pela lib `svix` (ou `resend.webhooks.verify`) antes de qualquer parse
- [ ] idempotência por `svix-id` na mesma transação; desconhecido = 200; nunca 500 por dado inesperado
- [ ] status de entrega no `EmailLog`; devolução definitiva/reclamação/suprimido → `EmailSuppression`; temporária não
- [ ] reclamação desliga o e-mail de notificações da pessoa (com o add-on `notificacoes`)
- [ ] Membros com "E-mail não entrega"; remover da lista com regra e `AuditLog`; "E-mails com problema" para owner/admin

### Recebimento
- [ ] `email.received` → `InboundEmail` + fila; conteúdo e anexos buscados na API (anexos em até 1 h)
- [ ] roteador com handlers da base (`support`, `no-reply`) e dos apps; `+` funciona; reservados protegidos
- [ ] encaminhamento sem loop; automáticos `IGNORED`; aviso do `no-reply` no máximo 1x/dia por remetente
- [ ] `FAILED` com novas tentativas e `email:inbound --retry`

### Fechamento
- [ ] `email:setup`/`email:check` funcionando (domínio, registros, webhook, teste)
- [ ] README do projeto com o passo a passo acima, as variáveis e o que cada endereço faz
- [ ] `rodsaas.json → addons` com `email`
- [ ] `/rodsaas:verify -g "E-mail"` verde (e a bateria inteira, que continua lendo o Mailpit em dev)
- [ ] **conferência final**: tabela item a item de todas as referências (01–03) com ✅/❌ e o arquivo onde está
