# 09 · WhatsApp e chat, clientes com SLA e contrato de horas, dividir, aprovação, categorias e sugestão de artigos

O que separa um Suporte que aguenta o dia a dia de um que só registra chamados: o cliente fala por onde quiser (WhatsApp, chat do site, e-mail); cliente que paga mais tem prazo melhor e o contrato de horas é controlado sem planilha; chamado com dois assuntos vira dois; o que precisa de aval espera o aval; cada tipo de pedido pede as informações certas; e a resposta pronta da base aparece antes de alguém digitar. Tudo **núcleo** (vale para qualquer perfil, `10-perfis-de-segmento.md`). Regras no `helpdesk-lib` (seção "operação avançada"). Formatos ★ fazem parte do contrato (grupo `presets.helpdesk`).

## Modelo (somar ao `02-modelo.md`)

```prisma
model HdAccount {                 // cliente (empresa atendida)
  id String @id @default(uuid())
  orgId String
  name String
  domains String[] @default([])   // nunca domínio gratuito (FREE_MAIL_DOMAINS)
  contactEmails String[] @default([])
  slaPolicy Json?                 // sobrepõe a da empresa por prioridade (effectiveSlaPolicy)
  priorityFloor String?           // prioridade mínima dos chamados do cliente
  crmCompanyId String?            // ligação com a empresa do CRM, quando instalado
  notes String?
}
model HdContract { id String @id @default(uuid()); orgId String; accountId String; name String; hoursMonthly Decimal; startDay Int @default(1); extraHourCents Int @default(0); active Boolean @default(true); startsOn String; endsOn String? }
model HdTimeEntry { id String @id @default(uuid()); orgId String; ticketId String; userId String; minutes Int; date String; billable Boolean @default(true); note String?; contractId String?; createdAt DateTime @default(now()) }
model HdApproval { id String @id @default(uuid()); orgId String; ticketId String; approverUserId String?; approverEmail String?; tokenHash String?; note String?; status String; comment String?; requestedById String; decidedAt DateTime?; createdAt DateTime @default(now()) }
model HdCategory { id String @id @default(uuid()); orgId String; name String; queueId String?; defaultPriority String?; fields Json @default("[]"); active Boolean @default(true); position Int; profileKey String? }
model HdChatSession { id String @id @default(uuid()); orgId String; ticketId String; tokenHash String; lastSeenAt DateTime; endedAt DateTime? }
// HdContact ganha accountId (resolveAccount ao criar e quando o e-mail muda), phone (WhatsApp)
// HdTicket ganha categoryId, accountId, splitFromId, approvalStatus (null | PENDING | APPROVED | REJECTED), channel WHATSAPP | CHAT
```

RLS `FORCE` em tudo; o token do chat e o da aprovação só como hash (como os do chamado).

## Clientes e SLA por cliente

| Rota | Faz |
|---|---|
| ★ `GET /v1/helpdesk/accounts` · ★ `POST` · `PATCH/DELETE /:id` | owner/admin escrevem · **`{ name, domains?, contactEmails?, slaPolicy?, priorityFloor?, crmCompanyId? }`** → `validateAccount` (400 com `path`; domínio gratuito recusado; domínio já de outro cliente → 409 `DOMAIN_TAKEN`) → 201 **`{ id, name, domains, contactEmails, slaPolicy, priorityFloor, contactsCount, openTickets, contract: { id, name, usage } \| null }`**; criar/editar reatribui os contatos pelo `resolveAccount` |
| chamado | ao criar (qualquer canal): conta pelo `resolveAccount(email)`; prioridade com `applyPriorityFloor`; prazos com `slaDueDates({ policy: effectiveSlaPolicy(org, conta) })` (exige `helpdesk_sla`). A visão do chamado ganha **`account: { id, name } \| null`** |

Tela ★ `/suporte/clientes` (lista com chamados abertos e o saldo do contrato; detalhe com contatos, chamados, política de SLA e contrato). No chamado, o selo do cliente (VIP quando tem piso de prioridade).

## Contrato de horas (`feature: 'helpdesk_contracts'`)

| Rota | Faz |
|---|---|
| ★ `POST /v1/helpdesk/accounts/:id/contracts` · `PATCH /v1/helpdesk/contracts/:id` | **`{ name, hoursMonthly, startDay?, extraHourCents?, startsOn }`** → 201 contrato (um ativo por cliente: 409 `CONTRACT_EXISTS`) |
| ★ `GET /v1/helpdesk/contracts/:id` | **`{ id, name, hoursMonthly, startDay, extraHourCents, usage: { start, end, includedMinutes, usedMinutes, remainingMinutes, overMinutes, overAmountCents, pct, status } }`** (`contractUsage`, ciclo de hoje; `?date=` outro ciclo) |
| ★ `POST /v1/helpdesk/tickets/:id/time` | **`{ minutes, date?, billable?, note? }`** → `validateTimeEntry` (400 com `path`) → grava (contrato ativo do cliente do chamado, se houver) → **201 `{ entry, usage \| null }`**; passou de 80% → nota no chamado e aviso `helpdesk.contract.warning` aos owners/admins; excedeu → `helpdesk.contract.exceeded` com o valor do excedente |
| `GET /v1/helpdesk/tickets/:id/time` · `DELETE /v1/helpdesk/time/:id` | lançamentos do chamado; apagar só o próprio (owner/admin qualquer) |
| `GET /v1/helpdesk/reports/time.csv?accountId=&from=&to=` | horas por cliente, chamado e atendente (para faturar no Financeiro) |

No chamado, **Lançar tempo** (`hd-time-add` → `hd-time-minutes`, `hd-time-save`) com o cronômetro opcional, a lista dos lançamentos (`hd-time-row`) e o saldo do contrato (`hd-contract-usage`, `data-status`). Com o Financeiro instalado: "Faturar excedente" cria a conta a receber do cliente com o valor do `overAmountCents`.

## Dividir chamado

★ `POST /v1/helpdesk/tickets/:id/split` **`{ messageIds, subject }`** → `splitPlan` (400 `SPLIT_EMPTY` / `SPLIT_UNKNOWN` / `SPLIT_ALL` / `SPLIT_NOTES_ONLY`); fechado → 409 `TICKET_CLOSED` → chamado novo com o mesmo solicitante, fila, cliente e categoria, as mensagens escolhidas **movidas** (com anexos), `splitFromId`; eventos "Dividido em #N" / "Dividido de #M"; o cliente recebe a confirmação do novo número → **201 `{ ticket, from: { id, number } }`**.

Tela: na conversa, **Dividir** (`hd-split`) liga a seleção das mensagens (`hd-split-select`, `data-message`), pede o assunto (`hd-split-subject`) e confirma (`hd-split-confirm`).

## Aprovação

| Rota | Faz |
|---|---|
| ★ `POST /v1/helpdesk/tickets/:id/approvals` | **`{ approverUserId? \| approverEmail?, note? }`** → `canRequestApproval` (409 `TICKET_CLOSED`, 409 `APPROVAL_PENDING`) → status **Em espera** com `approvalStatus: PENDING`, prazo de solução pausado → membro: notificação `helpdesk.approval.requested`; e-mail de fora: link público com token → **201 `{ id, status: "PENDING" }`** |
| ★ `POST /v1/helpdesk/approvals/:id/decide` | só o aprovador (outro → 404) · **`{ decision: "APPROVED" \| "REJECTED", comment? }`** → `decideApproval` (409 `APPROVAL_DECIDED`, 400 `COMMENT_REQUIRED`) → nota interna com a decisão, chamado volta para **Aberto** (prazo retomado), `approvalStatus`, aviso ao responsável → **200 `{ id, status, comment }`** |
| `GET /v1/public/helpdesk/approvals/:token` · `POST .../decide` | o aprovador externo decide pelo link (mesmas regras) |
| `GET /v1/helpdesk/approvals?mine=1` | o que espera a minha aprovação (selo no menu) |

Tela: no chamado, **Pedir aprovação** (`hd-approval-request`) e o quadro da aprovação com o status (`hd-approval-status`, `data-status`); para o aprovador, **Aprovar** / **Reprovar** (`hd-approval-approve`, `hd-approval-reject`).

## Categorias e campos por categoria

| Rota | Faz |
|---|---|
| ★ `GET /v1/helpdesk/categories` · ★ `POST` · `PATCH/DELETE /:id` | owner/admin · **`{ name, queueId?, defaultPriority?, fields: [{ key, label, type, required?, options? }] }`** → `validateFieldDefs` → 201 |
| chamado | `categoryId` no criar (equipe, portal, widget, API) e no `PATCH`; `fields` validados por `validateTicketFields` (400 com `path: "fields.<chave>"`); a categoria escolhe a fila e a prioridade padrão |
| ★ portal | `GET /v1/public/helpdesk/:slug` passa a devolver **`ticketCategories: [{ id, name, fields }]`** (o `categories` que já existe é o da base de conhecimento) e o `POST` do chamado aceita `categoryId` + `fields` (400 com `path: "fields.<chave>"`) |

Tela: no formulário do portal/widget, escolher a categoria (`portal-category`) mostra os campos dela (`portal-field`, `data-key`); no chamado, os campos aparecem no painel lateral e podem ser editados.

## Sugestão de artigos

- ★ `GET /v1/helpdesk/tickets/:id/suggested-articles` → **`{ data: [{ id, title, publicUrl, internal, score }] }`** (`suggestArticles` com assunto + primeira mensagem; internos marcados, só para a equipe).
- Portal/widget: ao digitar o assunto, `GET /v1/public/helpdesk/:slug/articles?q=` já existia; agora usa o mesmo `suggestArticles` (sem internos) e registra "resolvido pelo artigo" quando o cliente desiste de abrir o chamado (`POST .../deflections`, conta no relatório).
- Confirmação por e-mail inclui "Talvez isto ajude" com até 2 artigos com nota ≥ 4.

No chamado, o quadro **Artigos sugeridos** (`hd-suggested-article`) com "Inserir na resposta".

## WhatsApp (pelo motor `/rodsaas:whatsapp`) e chat no widget

**WhatsApp**: o Suporte registra o handler `helpdesk` no motor. Mensagem que chega (roteada para o Suporte: chamado aberto do mesmo telefone, ou app padrão da conexão = Suporte) → entra no chamado aberto do contato com aquele telefone, ou **abre um chamado** canal `WHATSAPP` (assunto = começo da mensagem, solicitante = contato pelo telefone, criado se não existe). Resposta **pública** do atendente num chamado `WHATSAPP` sai por `whatsapp.send({ ref: { app: "helpdesk", entity: "ticket", id } })`: texto livre dentro da janela de 24 h; fora dela, o modelo `suporte_atualizacao` com o link do chamado. Nota interna nunca sai. Falha de envio aparece na mensagem com "tentar de novo".

**Chat no widget** (`feature: 'helpdesk_chat'`):

| Rota | Faz |
|---|---|
| ★ `GET /v1/public/helpdesk/:slug/chat` | **`{ online, agents }`** (`chatAvailability`: alguém disponível dentro do horário) |
| ★ `POST /v1/public/helpdesk/:slug/chat` | **`{ name, email, message }`** (+ anti-robô do portal) → chamado canal `CHAT` + sessão → **201 `{ token, ticketNumber, online }`**; offline: o chamado nasce igual e a tela diz "Respondemos por e-mail" |
| ★ `GET /v1/public/helpdesk/chat/:token/messages?after=` | **`{ messages: [{ id, authorKind, authorName, body, createdAt }], status, agentTyping }`** (só públicas; o widget consulta a cada 3 s com a aba aberta) |
| ★ `POST /v1/public/helpdesk/chat/:token/messages` | **`{ body }`** → mensagem do cliente no chamado |

No portal e no widget, o botão **Conversar agora** (`portal-chat-open`) aparece só quando `online`; o formulário (`portal-chat-name`, `portal-chat-email`, `portal-chat-message`, `portal-chat-send`) abre a conversa com as mensagens (`portal-chat-row`, `data-author` `CUSTOMER`/`AGENT`) e o campo de resposta (`portal-chat-input` + `portal-chat-reply`).

Na caixa de entrada, a visão **Chats ao vivo** (canal `CHAT` com sessão ativa nos últimos 2 min), com o aviso sonoro; a resposta do atendente é a resposta pública normal (aparece no widget na próxima consulta). Sessão parada por 30 min encerra o chat: o chamado segue por e-mail.

## Planos, avisos e erros

Features `helpdesk_contracts` e `helpdesk_chat` (Pro e Business); clientes, dividir, aprovação, categorias e sugestão em todos os planos. Notificações novas no catálogo: `helpdesk.approval.requested`, `helpdesk.approval.decided`, `helpdesk.contract.warning`, `helpdesk.contract.exceeded`, `helpdesk.chat.waiting`. Erros novos: `DOMAIN_TAKEN` · `CONTRACT_EXISTS` · `APPROVAL_PENDING` · `APPROVAL_DECIDED` · `TICKET_CLOSED` (409), `SPLIT_EMPTY` · `SPLIT_UNKNOWN` · `SPLIT_ALL` · `SPLIT_NOTES_ONLY` · `COMMENT_REQUIRED` (400).

## Testes obrigatórios

- Cliente por domínio (gratuito nunca), política do cliente encurta o prazo, piso de prioridade.
- Contrato: lançar consome no ciclo, não cobrável não conta, aviso aos 80%, excedente com valor; minutos inválidos 400.
- Dividir: mensagens movidas, ligação nos dois, todas/nenhuma/só nota recusadas, fechado 409.
- Aprovação: pede (Em espera, prazo pausado), segunda pendente 409, só o aprovador decide, reprovar sem comentário 400, decisão volta para Aberto.
- Categorias: campos obrigatórios e tipos no criar (equipe e portal), chave desconhecida 400.
- Sugestão: publicados que combinam, internos fora do portal.
- WhatsApp: mensagem abre chamado, a segunda entra no mesmo, resposta pública sai com o `ref`, nota não sai.
- Chat: online/offline, chat vira chamado `CHAT`, resposta do atendente aparece na consulta do cliente, nota nunca.
