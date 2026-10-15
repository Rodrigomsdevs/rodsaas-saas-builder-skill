# 04 · Catálogo de tipos e ligação com os apps

Cada tipo de notificação está no catálogo com rótulo (tela de preferências), descrição, **frase padrão**, agrupamento e e-mail padrão. As definições ficam em `notifications-lib` (`BASE_TYPES` e `PRESET_TYPES`) para todos os projetos usarem as mesmas frases; cada módulo de app registra **só os dele** no boot:

```ts
// api/src/modules/tasks/index.ts
registerNotificationTypes("tarefas", PRESET_TYPES.filter((t) => t.appId === "tarefas"));
```

O boot falha se `validateCatalog(getCatalog())` tiver erro. App novo (`/rodsaas:module`, presets futuros) acrescenta os tipos dele à lib do projeto **com teste de frase** (o teste "todos os modelos renderizam sem chave sobrando" cobre).

## Como escrever um tipo

- Nome `area.evento` em minúsculas (`task.commented`, `crm.deal.won`).
- Frase em português, curta, com o sujeito primeiro: `{actor}` (ator mais recente), `{actors}` ("Ana", "Ana e Bia", "Ana e mais 2"), `{title}` (do `data.title`), `{count}`, `{org}`, `{data.campo}` e `{singular|plural}` (pelo número de atores distintos). Quando agrupa, use `{ one, many }`: `many` vale com `count > 1`.
- `group.by`: `entity` (mesmo registro: comentários na mesma tarefa), `key` (mesma chave: "3 tarefas atribuídas a você" no mesmo projeto; passe `groupKey` e `groupUrl`) ou `none` (cada evento conta: status, prazo estourado).
- `defaultEmail`: `IMMEDIATE` para o que pede ação; `DAILY` para o que é só informação; `OFF` raramente.
- `critical: true` só para segurança e cobrança.
- `roles`: papéis que podem receber (ex.: `["OWNER"]` para cobrança); quem não pode não vê o tipo nas preferências nem no catálogo. O `notify()` não depende disso (quem chama já escolhe os destinatários), mas o teste do app confere que os dois batem.

## Tipos da base (sempre)

| Tipo | Quem | Agrupa | E-mail padrão |
|---|---|---|---|
| `org.member_joined` | owners e admins | por empresa, 60 min (até 24 h) | resumo |
| `org.role_changed` | o membro | não | imediato |
| `org.access_requested` | quem pode aprovar (owners; admins quando cabe nos assentos) | por empresa, 10 min | imediato |
| `org.access_decided` | quem pediu (ou ganhou o acesso pelo pedido do convite) | não | imediato |
| `org.access_issue` | quem convidou (ou fez o ajuste) | não | imediato |
| `whatsapp.connection_error` | owners e admins (add-on `whatsapp`: conexão expirou ou erro `AUTH` do provedor) | não | imediato |
| `fiscal.rejected` | quem emitiu, owners e admins (add-on `fiscal`: rejeição da SEFAZ com o motivo) | não | imediato |
| `fiscal.contingency` | owners e admins (add-on `fiscal`: NFC-e em contingência há mais de 12 h) | não | imediato |
| `billing.payment_failed` | owners | não | imediato, **obrigatório** |
| `billing.trial_ending` | owners | não | imediato |
| `files.quota_warning` (com `uploads`) | owners e admins | não | imediato |

## Tipos de cada app

Ao instalar (ou revisar) um preset com este add-on presente, o preset chama `notify()` exatamente nestes eventos. `canSee` é a regra de visibilidade do próprio app.

### Tarefas (`tarefas`)

| Tipo | Evento | Destinatários | entity · groupKey | url |
|---|---|---|---|---|
| `task.assigned` | responsável definido/trocado | novo responsável | task · projectId (`groupUrl` `/tarefas/minhas`) | `/tarefas/t/<KEY-N>` |
| `task.mentioned` | @menção em comentário/descrição | mencionados | task | idem, com `#comentario-<id>` |
| `task.commented` | comentário novo | seguidores | task | idem |
| `task.status` | mudança de status | seguidores | task (agrupa em 2 min e mostra o último status, `data.to`) | idem |
| `task.due_soon` | job 8 h no fuso da empresa | responsável | task · `due:<data>` (`groupUrl` `/tarefas/minhas`) | idem |
| `task.overdue` | job 8 h | responsável | task · `overdue:<data>` | idem |
| `sprint.started` / `sprint.completed` | iniciar/concluir | membros com tarefa na sprint | sprint | `/tarefas/p/<id>/sprints/<id>` |

`canSee`: projeto público da empresa ou membro do projeto privado. Sair do projeto privado → `retract({ entityType: "task", userIds: [quem saiu] })` das tarefas daquele projeto.

### CRM (`crm`)

| Tipo | Evento | Destinatários | entity · groupKey | url |
|---|---|---|---|---|
| `crm.deal.assigned` | negócio atribuído | novo responsável | deal · `assigned` (`groupUrl` `/crm/negocios?responsavel=eu`) | `/crm/negocios/<id>` |
| `crm.lead.assigned` | lead atribuído (manual ou captura) | responsável | lead · `assigned` | `/crm/leads/<id>` |
| `crm.lead.unassigned` | lead capturado sem responsável | owners/admins | lead · `unassigned` (`groupUrl` `/crm/leads?responsavel=ninguem`) | idem |
| `crm.mentioned` | @menção em anotação | mencionados | deal/lead/contact/company do registro | registro |
| `crm.activity.assigned` | atividade atribuída por outra pessoa | responsável | activity | registro da atividade |
| `crm.activity.digest` | job 8 h | quem tem atividade hoje ou atrasada | user (`entityId` = userId) | `/crm/atividades` |
| `crm.deal.won` | negócio ganho | owners/admins e responsável (se outro ganhou) | deal | `/crm/negocios/<id>` |
| `crm.import.done` | importação terminou | quem importou (ator nulo: é o job) | import | `/crm/importacoes/<id>` |
| `crm.goal.reached` | meta do período batida | o vendedor da meta e owners/admins (meta da equipe: todos os vendedores) | goal | `/crm/metas` |
| `crm.lead.hot` | lead passou para quente pela pontuação | responsável; sem responsável, owners/admins | lead | `/crm/leads/<id>` |
| `crm.automation.notice` | ação `NOTIFY` de uma automação | quem a automação escolheu | deal | `/crm/negocios/<id>` |
| `crm.automation.failed` | ação de automação falhou (agrupado por dia) | owners/admins | automation | `/crm/automacoes/<id>` |

`canSee`: visibilidade do negócio (modo "só os meus": responsável, owners/admins). Negócio passou para outro no modo "só os meus" → `retract` para o antigo.

### Forms (`forms`)

| Tipo | Evento | Destinatários | entity | url |
|---|---|---|---|---|
| `forms.response.new` | resposta nova (formulário em "cada resposta") | dono e colaboradores com acesso às respostas | form (agrupa: "5 novas respostas em Orçamento") | `/forms/<id>/respostas` |
| `forms.response.digest` | job diário | quem escolheu "resumo diário" no formulário | user | `/forms` |
| `forms.limit` | 80% e 100% do limite mensal | owners/admins | organization | `/configuracoes/plano` |
| `forms.closed` | encerrado por data ou limite | dono | form | `/forms/<id>` |
| `forms.webhook_disabled` | webhook desativado por falhas | dono | form | `/forms/<id>/integracoes` |

### Agenda (`agenda`)

| Tipo | Evento | Destinatários | entity · groupKey | url |
|---|---|---|---|---|
| `agenda.booked` | novo agendamento | quem atende | appointment · hostId (`groupUrl` `/agenda`) | `/agenda/agendamentos/<id>` |
| `agenda.pending` | pedido aguardando aprovação | quem atende | appointment | idem |
| `agenda.rescheduled` | remarcado pelo cliente | quem atende | appointment | idem |
| `agenda.canceled` | cancelado pelo cliente | quem atende | appointment | idem |
| `agenda.daily` | job 7 h | quem tem atendimento no dia | user | `/agenda` |
| `agenda.deposit_paid` | sinal pago (webhook do Financeiro) | quem atende | appointment (`groupUrl` `/agenda/recepcao`) | `/agenda/agendamentos/<id>` |
| `agenda.deposit_expired` | job: sinal não pago no prazo, horário liberado | quem atende | appointment | idem |
| `agenda.waitlist_booked` | cliente aceitou a vaga oferecida pela lista de espera | quem atende | appointment | idem |
| `agenda.recalls_due` | job segunda 8 h (`agenda_clinic`) | owner/admin e quem atende | organização | `/agenda/retornos` |
| `agenda.club_past_due` | recorrência do clube não paga (Financeiro) | owner/admin | assinatura | `/agenda/clube` |

O ator dos eventos feitos pelo cliente é **nulo** (o cliente não é membro). O que a própria equipe faz pelo painel tem o membro como ator (e ele não recebe).

### Suporte (`helpdesk`)

| Tipo | Evento | Destinatários | entity · groupKey | url |
|---|---|---|---|---|
| `helpdesk.ticket_created` | chamado novo na fila | atendentes da fila (sem responsável) | ticket · queueId (`groupUrl` `/suporte?visao=sem-responsavel`) | `/suporte/chamados/<numero>` |
| `helpdesk.assigned` | atribuído | novo responsável | ticket · `assigned` | idem |
| `helpdesk.customer_replied` | cliente respondeu | responsável (ou atendentes da fila, sem responsável) | ticket | idem |
| `helpdesk.mentioned` | @menção em nota | mencionados | ticket | idem |
| `helpdesk.sla_warning` / `helpdesk.sla_breached` | job de SLA | responsável (estourado: também owners/admins) | ticket | idem |
| `helpdesk.daily` | job 8 h | atendentes | user | `/suporte` |

`canSee`: atendente (e, se a empresa restringe, da fila do chamado). Deixar de ser atendente → `retract` das notificações de chamados dessa pessoa.

### Pessoas (`pessoas`, preset `rh`)

| Tipo | Evento | Destinatários | entity · groupKey | url |
|---|---|---|---|---|
| `rh.approval.requested` | pedido entrou na etapa (férias, ausência, despesa, solicitação, alteração de dados) | aprovadores da etapa (já com delegação) | approval · `to_approve` (`groupUrl` `/pessoas/aprovacoes`) | `/pessoas/aprovacoes/<id>` |
| `rh.approval.reminder` | job 9 h: etapa parada há N dias úteis | quem ainda não decidiu | approval · `reminder` | idem |
| `rh.approval.decided` | aprovado/recusado (com o comentário em `data.comment`) | quem pediu | approval | idem |
| `rh.vacation.expiring` | job 8 h: concessivo termina em 60, 30 e 7 dias com saldo | a pessoa, o gestor e o RH | employee | `/pessoas/ferias` (RH: ficha) |
| `rh.vacation.starting` | job 8 h de segunda | gestor | employee · `vacation-week` | `/pessoas/ausencias` |
| `rh.document.expiring` | job 8 h: 30 e 7 dias antes, e no dia | RH e a pessoa | document · `expiring` | ficha, aba Documentos |
| `rh.document.ack_requested` | política publicada pedindo ciência | público-alvo | document | `/pessoas/documentos/<id>` |
| `rh.payslip.published` | lote publicado | cada pessoa casada | payslip | `/pessoas/holerites` |
| `rh.admission.submitted` | pré-admissão enviada pelo candidato (ator nulo) | RH | admission | `/pessoas/admissoes/<id>` |
| `rh.checklist.assigned` | checklist criado/tarefa atribuída | responsável de cada tarefa (RH, gestor, TI, a pessoa) | checklist | `/pessoas/admissoes/<id>` ou `/pessoas` (a pessoa) |
| `rh.review.assigned` | fase do ciclo começa | cada avaliador | review · cycleId | `/pessoas/desempenho/avaliacoes/<id>` |
| `rh.review.released` | RH libera o resultado | avaliado | review | idem |
| `rh.feedback.received` / `rh.feedback.requested` | feedback dado / pedido | destinatário | feedback | `/pessoas/feedback` |
| `rh.one_on_one.soon` | job 8 h, véspera | os dois | one_on_one | `/pessoas/one-on-ones/<id>` |
| `rh.goal.checkin_due` | job semanal (dia da empresa) | dono da meta sem check-in na semana | goal · `checkin` | `/pessoas/metas` |
| `rh.survey.open` | pesquisa lançada / pulso aberto | público-alvo que ainda não respondeu | survey | `/pessoas/clima/<id>/responder` |
| `rh.expense.paid` | financeiro marca pago | quem pediu | expense_report | `/pessoas/despesas/<id>` |
| `rh.birthday` | job 8 h | a equipe da pessoa (opção da empresa; quem escondeu o aniversário não entra) | employee · `birthday` | `/pessoas` |

`canSee`: a regra de visibilidade do próprio Pessoas (pedido: quem pediu, aprovadores e RH; ficha: `visibleGroups`). Nunca coloque salário, CID, motivo de atestado ou nota de avaliação no texto do aviso nem no e-mail. A pesquisa nunca avisa "fulano respondeu".

### Financeiro (`financeiro`)

| Tipo | Evento | Destinatários | entity · groupKey | url |
|---|---|---|---|---|
| `fin.due_today` | job 8 h (dias com algo) | `FIN_ADMIN` e `FIN` | organization (`entityId` = orgId) | `/financeiro/lancamentos?status=OVERDUE` |
| `fin.charge.paid` | baixa automática de cobrança (ator nulo) | `FIN_ADMIN` e `FIN` | charge · `paid` (`groupUrl` `/financeiro/cobrancas?status=PAID`) | `/financeiro/lancamentos/<id>` |
| `fin.charge.failed` | cobrança expirou ou falhou | quem criou a cobrança (ou `FIN_ADMIN`) | charge | idem |
| `fin.approval.requested` | `FIN` lançou pagamento acima do limite | `FIN_ADMIN` | entry · `to_approve` (`groupUrl` `/financeiro/lancamentos?status=AWAITING_APPROVAL`) | `/financeiro/lancamentos/<id>` |
| `fin.approval.decided` | aprovado/recusado | quem lançou | entry | idem |
| `fin.import.done` | importação de extrato terminou | quem importou | statement_import | `/financeiro/conciliacao?conta=<id>` |
| `fin.stripe.account` | `account.updated` mudou o status (pendência, restrição, ativa) | `FIN_ADMIN` | organization | `/financeiro/configuracoes/cobrancas` |
| `fin.subscription.past_due` | `invoice.payment_failed` | `FIN_ADMIN` e `FIN` | subscription | `/financeiro/assinaturas` |

`canSee`: ter papel no Financeiro. Tirar o papel → `retract` das notificações do app dessa pessoa. Nunca coloque saldo de conta no aviso.

### Comercial (`comercial`)

| Tipo | Evento | Destinatários | entity · groupKey | url |
|---|---|---|---|---|
| `com.approval.requested` | vendedor salvou proposta acima do limite de desconto/valor | `COM_ADMIN` | proposal · `to_approve` (`groupUrl` `/comercial/propostas?status=PENDING_APPROVAL`) | `/comercial/propostas/<id>` |
| `com.approval.decided` | admin aprovou/recusou | dono da proposta | proposal | idem |
| `com.proposal.viewed` | primeira visualização do cliente (no máximo 1 por dia por proposta) | dono da proposta | proposal | idem |
| `com.proposal.commented` | cliente deixou dúvida na página pública (ator nulo) | dono da proposta | proposal | idem |
| `com.proposal.accepted` | aceite online (ator nulo) | dono da proposta e `COM_ADMIN` | proposal | idem |
| `com.proposal.rejected` | recusa com motivo (ator nulo) | dono da proposta | proposal | idem |
| `com.proposal.expiring` | job 9 h: vence hoje/amanhã sem decisão | dono da proposta | proposal · `expiring` (`groupUrl` `/comercial/propostas?status=SENT,VIEWED`) | `/comercial/propostas/<id>` |
| `com.envelope.completed` | último signatário assinou | quem enviou e dono do contrato | envelope | `/comercial/assinaturas/<id>` |
| `com.envelope.refused` | signatário recusou | quem enviou e dono do contrato | envelope | idem |
| `com.envelope.expired` | job: prazo do envelope terminou | quem enviou | envelope | idem |
| `com.contract.expiring` | job 8 h: contrato entrou no aviso prévio (ou faz aniversário de reajuste) | dono do contrato e `COM_ADMIN` | contract · `expiring` (`groupUrl` `/comercial/contratos?status=EXPIRING`) | `/comercial/contratos/<id>` |
| `com.contract.renewed` | renovação automática | dono do contrato | contract | idem |
| `com.integration.failed` | falha ao ganhar o negócio no CRM ou criar as contas a receber | `COM_ADMIN` | proposal | `/comercial?integracoes=1` |

`canSee`: ter papel no Comercial e, para `SELLER`, ser o dono da proposta/contrato. Tirar o papel → `retract`. Os e-mails para **clientes e signatários** (proposta, código, convite para assinar, lembretes, PDF final) não passam por aqui: saem pelo app com a marca da empresa.

### ERP (`erp`)

| Tipo | Evento | Destinatários | entity · groupKey | url |
|---|---|---|---|---|
| `erp.stock.low` | job 7 h: produtos que cruzaram o mínimo desde ontem (um aviso por produto, agrupados) | `ERP_ADMIN` e `STOCK` | product · `low_stock` (`groupUrl` `/erp/estoque?baixo=1`) | `/erp/produtos/<id>` |
| `erp.order.to_pick` | pedido confirmado (inclusive o que veio do Comercial) | `STOCK` | order · `to_pick` (`groupUrl` `/erp/vendas?aba=separar`) | `/erp/vendas/<id>` |
| `erp.quote.expiring` | job 9 h: orçamentos que vencem amanhã | o vendedor | order · `expiring` | `/erp/vendas/<id>` |
| `erp.cash.difference` | caixa fechado com diferença ≠ 0 | `ERP_ADMIN` | cash_session | `/erp/relatorios?aba=caixas` |
| `erp.session.stale` | job: caixa aberto há mais de 18 h | o operador e `ERP_ADMIN` | cash_session | `/erp/pdv` |
| `erp.purchase.received` | recebimento de compra | quem criou a compra | purchase | `/erp/compras/<id>` |

`canSee`: ter papel no ERP; custo nunca vai no texto do aviso.

## Regras que valem para todos os apps

- Nunca gravar `Notification` direto nem mandar e-mail de aviso para membro por conta própria: tudo por `notify()`. (E-mails para **clientes** — confirmação de agendamento, resposta do chamado, resposta automática do formulário — continuam no app, porque cliente não é membro.)
- O resumo do app (`*.digest`, `*.daily`) é um tipo como os outros: a pessoa pode desligar.
- Ao apagar o registro, `retract()` na mesma transação.
