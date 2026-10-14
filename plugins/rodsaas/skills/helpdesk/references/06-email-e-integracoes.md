# E-mail, avisos, jobs e integrações

## Caixas de e-mail

Duas formas de receber, por caixa (`HelpdeskInbox.mode`):

| Modo | Como funciona | Quando usar |
|---|---|---|
| **IMAP** | job a cada minuto por caixa (`imapflow`): conecta, lê as mensagens novas por UID (guardando `imapLastUid` + `UIDVALIDITY`), processa e marca como lida (nunca apaga). Lock por caixa (`pg_try_advisory_lock`) para não ler duas vezes | a empresa já tem `suporte@empresa.com.br` no Gmail/Microsoft 365/Zoho/Locaweb; sem mexer em DNS |
| **WEBHOOK** | o provedor de recebimento (Postmark, Mailgun, SendGrid, Cloudflare Email Workers) faz `POST` para `/v1/public/helpdesk/inbound/<chave>[/<provedor>]` | volume alto ou domínio dedicado (`suporte@ajuda.empresa.com.br`) |

Variáveis em `api/.env`:

```
HELPDESK_ENCRYPTION_KEY=          # 32 bytes em base64 (openssl rand -base64 32); criptografa senhas IMAP/SMTP
HELPDESK_MAIL_DOMAIN=             # domínio dos Message-ID que geramos (ex.: app.seusaas.com.br)
```

- Senhas: AES-256-GCM, IV aleatório; nunca voltam pela API. Gmail e Microsoft 365 exigem **senha de app** (ou OAuth): a tela explica com o passo a passo e link para a ajuda de cada um (confira o procedimento atual).
- Erro de login → `status: AUTH_ERROR`, aviso no topo da caixa de entrada para owner/admin ("A caixa suporte@… parou de receber: confira a senha") e notificação; o job tenta de novo a cada 15 min, sem bloquear as outras caixas.
- **Enviar**: com SMTP da caixa, sai como `suporte@empresa.com.br` (o cliente vê o endereço da empresa e a resposta volta para a caixa). Sem SMTP próprio, sai pelo SMTP da base com `From: "Acme Suporte" <no-reply@produto>` e `Reply-To: suporte@empresa.com.br` (ou o endereço de recebimento do webhook). Explique SPF/DKIM no README do projeto.

## Recebendo um e-mail (service `ingestEmail`)

Todo caminho (IMAP, webhook, adaptadores) chega no mesmo formato normalizado e no mesmo service:

1. Guarda o `.eml` original no `uploads` (quando veio inteiro) e deduplica por `Message-ID` na empresa (`@@unique([organizationId, emailMessageId])`): o mesmo e-mail duas vezes não gera nada.
2. Remetente (`parseAddress`): nosso próprio endereço (alguma caixa da empresa ou `no-reply` do produto) → ignora (`ignored: 'own'`); bloqueado → spam.
3. `isAutoReply`: devolução (bounce) → marca a resposta original como `FAILED` (se der para casar) e não cria chamado; resposta automática/lista → se casar com um chamado, entra como mensagem do cliente marcada "automática", **sem** reabrir e **sem** confirmação; se não casar, é ignorada (`ignored: 'loop'`, registrada no log) — nunca abre chamado nem gera confirmação.
4. Encadeamento (`matchThread`) com os `Message-ID` guardados e o `[#N]` do assunto (remetente precisa ser solicitante ou CC). Casou → resposta do cliente (`onCustomerReply`), corpo com `stripQuotedReply` (o original completo fica em "ver e-mail original"); CCs novos do e-mail entram como CC do chamado.
5. Não casou → chamado novo (`createCustomerTicket`, canal `EMAIL`, fila da caixa): assunto `normalizeSubject`, CC do e-mail viram CC do chamado, destinatários que são caixas nossas ignorados.
6. HTML: `sanitize-html` (sem script, style externo, formulário, iframe); imagens `cid:` viram anexos inline; imagens externas trocadas por um marcador (`hasRemoteImages`) até o atendente clicar em "mostrar imagens" (evita rastreamento). Anexos pelo `uploads` (limite do plano; acima disso, o anexo vira um aviso na mensagem).
7. Confirmação ao cliente só para chamado novo e com `shouldAutoAck` (até 3 por hora por remetente).
8. Qualquer erro → `HelpdeskInboundFailure` com o `.eml`, visível em Configurações › Caixas › "E-mails com problema" com **Reprocessar**. Nunca descarta em silêncio.

## E-mails que saem

Pela fila (pg-boss), com 3 novas tentativas; falha final → `deliveryStatus: FAILED` com **Reenviar** na mensagem.

- Cabeçalhos: `Subject: ticketSubject(assunto, número)`, `Message-ID: messageIdFor(...)` (guardado na mensagem), `In-Reply-To` (última mensagem do cliente), `References` (cadeia do chamado), `Auto-Submitted: auto-generated` nas confirmações e avisos automáticos (resposta da equipe vai sem ele), `X-Rodsaas-Ticket: <número>`.
- Corpo: a resposta, a assinatura do atendente, uma linha "Responda este e-mail ou acompanhe pelo link" com o link **do destinatário** (`/chamado/<token>`), e as últimas 3 mensagens públicas abaixo (histórico curto). Versão texto junto.
- Cada destinatário (solicitante e CCs) recebe o seu e-mail com o seu token (nada de um link servindo para todos).

| Para | Quando | Conteúdo |
|---|---|---|
| cliente | chamado aberto (portal, widget, API, e-mail) | "Recebemos seu chamado #N", resumo, link, prazo de primeira resposta em linguagem natural quando houver SLA ("respondemos em até 4 h úteis") |
| cliente | resposta pública da equipe | a resposta (acima) |
| cliente | resolvido | "Seu chamado #N foi resolvido" + pesquisa (👍 / 👎 levando a `/chamado/<token>?avaliar=bom|ruim`) quando `csatEnabled` e `helpdesk_csat`; "Não resolveu? Responda este e-mail" |
| cliente | aguardando há `pendingReminderDays` | lembrete "Ainda precisamos da sua resposta" (uma vez) |
| cliente | link mágico | "Seus chamados em <empresa>" (24 h) |
| equipe | chamado novo na fila / atribuído a você / cliente respondeu / menção em nota / prazo vencendo (warning) e estourado / resumo diário (8 h no fuso da empresa) | pelo `notify()` do add-on `notificacoes` (sino + e-mail conforme a preferência; `canSee` = atendente com acesso à fila), tipos `helpdesk.ticket_created`, `helpdesk.assigned`, `helpdesk.customer_replied`, `helpdesk.mentioned`, `helpdesk.sla_warning`, `helpdesk.sla_breached`, `helpdesk.daily` |

O ponto de extensão para **WhatsApp** fica pronto: `ingestMessage({ channel: 'WHATSAPP', from: { phone, name }, text, attachments, externalId })` cria/encadeia chamados pelo telefone do contato, e `deliverPublicReply(ticket, message)` escolhe o canal de saída pelo canal do chamado (hoje só e-mail).

## Jobs (pg-boss)

| Job | Quando | Faz |
|---|---|---|
| `helpdesk.imap-poll` | a cada minuto, um por caixa IMAP | lê mensagens novas → `ingestEmail` |
| `helpdesk.sla-check` | a cada minuto | chamados com prazo que entrou em `warning` (avisa uma vez) ou passou (`slaBreachedAt`, evento, aviso) |
| `helpdesk.auto-close` | agendado no `autoCloseAt` | se continua Resolvido e sem resposta do cliente → Fechado (`canSetStatus` com `system`) |
| `helpdesk.pending-reminder` / `pending-auto-solve` | diário | lembrete único e, se configurado, resolve sozinho com nota do sistema |
| `helpdesk.daily-digest` | 8 h no fuso da empresa | resumo para cada atendente |
| `helpdesk.webhook-deliver` | fila | entregas com assinatura e novas tentativas |

Todos idempotentes (chave única por chamado + tipo + prazo) e conferindo o estado de novo antes de agir.

## CRM (preset `crm` + `helpdesk_integrations`)

- Contato do Suporte casa com o **contato do CRM** por e-mail (ou cria, se "criar no CRM" estiver ligado); `crmContactId`.
- No contato e no negócio do CRM: aba **Chamados** (abertos primeiro, com status e link) e botão **Abrir chamado**.
- No chamado: link "Ver no CRM" e, para chamados de clientes com negócio aberto, o nome do negócio e o responsável (a equipe de vendas sabe que o cliente está com problema).
- Atividade "Chamado #N aberto/resolvido" no histórico do contato do CRM.

## Forms

- **Campos do chamado** são um esquema do `forms-lib` (tipos, obrigatório, opções, validações brasileiras), renderizados no portal com `PublicField` e no chamado como propriedades.
- **Formulário vira chamado**: ação "Criar chamado no Suporte" nas integrações de um formulário do Forms (mapeando nome, e-mail, assunto e descrição), pelo service `createCustomerTicket` com canal `PORTAL`.

## Webhooks (`helpdesk_integrations`)

Eventos `ticket.created`, `ticket.updated` (com os campos que mudaram), `ticket.solved`, `ticket.closed`, `message.created` (só públicas por padrão; notas apenas se o webhook marcar "incluir notas internas", com aviso), `csat.received`. Mesmo formato, assinatura (`signWebhook` do `forms-lib`), novas tentativas, proteção SSRF e histórico do Forms (`skills/forms/references/06-respostas-e-integracoes.md`). Corpo com o chamado (número, assunto, status, prioridade, fila, responsável, solicitante, etiquetas, campos), **sem** os tokens dos links do cliente.

## API com chave

Para o sistema do cliente abrir chamados (botão "Falar com o suporte" dentro do produto dele): `POST /v1/public/helpdesk/api/tickets` com a chave (`03-api.md`). Mostre na tela um exemplo com `curl` e `fetch`, e avise para nunca colocar a chave no navegador (usar no servidor deles).
