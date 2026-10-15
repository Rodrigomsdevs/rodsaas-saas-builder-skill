# 08 · Metas, automações, sequências, duplicados, modelos, pontuação e WhatsApp

O que separa um CRM que a equipe **usa** de um que só guarda contatos: o gestor vê a meta de cada um; o sistema cria a próxima tarefa sozinho; ninguém esquece o follow-up; duplicado se junta em vez de se acumular; e-mail e WhatsApp saem com o nome do cliente preenchido; e o vendedor sabe qual lead atacar primeiro. Tudo aqui é **núcleo** (vale para qualquer perfil, `09-perfis-de-segmento.md`). Regras puras no `crm-lib` (seção "vendas avançadas"); mesmo padrão da `03-api.md` (visibilidade, RLS, 404 para quem não vê). Formatos ★ fazem parte do contrato testável (grupo `presets.crm`).

## Modelo (somar ao `02-modelo.md`)

```prisma
model CrmGoal {
  id         String  @id @default(uuid())
  orgId      String
  metric     String          // WON_VALUE | WON_COUNT | DEALS_CREATED | ACTIVITIES_DONE (GOAL_METRICS)
  ownerId    String?         // null = meta da equipe
  pipelineId String?         // null = todos os funis
  period     String          // "2026-10" ou "2026-Q4" (periodBounds)
  target     Int             // centavos (WON_VALUE) ou quantidade
  @@unique([orgId, metric, ownerId, pipelineId, period])
}
model CrmAutomation {
  id         String  @id @default(uuid())
  orgId      String
  name       String
  pipelineId String?
  trigger    Json            // { type: DEAL_CREATED | STAGE_ENTERED | DEAL_WON | DEAL_LOST | DEAL_ROTTING, stageId? }
  conditions Json @default("[]")   // [{ field, op, value }] — todas precisam bater (conditionMatches)
  actions    Json            // até 10 (validateAutomation)
  active     Boolean @default(true)
  rrCursor   Int     @default(0)   // rodízio do ASSIGN_OWNER
  profileKey String?         // criada por um perfil (não duplica ao trocar de perfil)
}
model CrmAutomationRun {
  id String @id @default(uuid())
  orgId String
  automationId String
  dealId String
  eventId String            // um evento (mudança de etapa, ganho…) roda cada automação uma vez só
  status String             // DONE | FAILED | SKIPPED
  actions Json              // [{ type, result: "ok" | mensagem }]
  error String?
  at DateTime @default(now())
  @@unique([automationId, dealId, eventId])
}
model CrmSequence {
  id String @id @default(uuid())
  orgId String
  name String
  steps Json                // [{ dayOffset, type: CALL|EMAIL|WHATSAPP|TASK|MEETING, subject, templateId?, snippetId?, auto? }]
  businessDays Boolean @default(true)
  stopOn Json @default("[\"DEAL_WON\",\"DEAL_LOST\",\"REPLIED\",\"OPTED_OUT\"]")
  active Boolean @default(true)
  profileKey String?
}
model CrmSequenceEnrollment {
  id String @id @default(uuid())
  orgId String
  sequenceId String
  dealId String?
  leadId String?
  contactId String?
  currentStep Int @default(0)
  status String              // ACTIVE | COMPLETED | STOPPED
  stoppedReason String?      // DEAL_WON | DEAL_LOST | REPLIED | OPTED_OUT | MANUAL
  startedAt DateTime @default(now())
  endedAt DateTime?
  // uma inscrição ativa por negócio (índice parcial WHERE status = 'ACTIVE')
}
model CrmEmailTemplate { id String @id @default(uuid()); orgId String; name String; subject String; body String; ownerId String?; shared Boolean @default(true) }
model CrmWhatsappSnippet { id String @id @default(uuid()); orgId String; name String; body String; templateName String?; stageIds String[] @default([]); profileKey String? }
model CrmScoring { orgId String @id; rules Json @default("[]"); warmAt Int @default(30); hotAt Int @default(70) }
// CrmActivity ganha: sequenceEnrollmentId String?, sequenceStep Int?, automationRunId String?, doneAt DateTime?
// CrmLead ganha: score Int @default(0), temperature String @default("COLD"), scoreBreakdown Json?
// CrmContact / CrmCompany ganham: mergedIntoId String? (a origem da mesclagem fica excluída e aponta para o destino)
```

Tudo com RLS `FORCE` e as travas de mesma empresa (gatilho) como no `02`.

## Metas por vendedor (`feature: 'crm_goals'`)

| Rota | Faz |
|---|---|
| ★ `GET /v1/crm/goals` | `?period=2026-10` (padrão: mês atual no fuso da empresa) → **`{ data: [{ id, metric, ownerId, owner: { id, name } \| null, pipelineId, period, target, achieved, pct, expectedPct, status, remaining, daysLeft, perDayNeeded }] }`** — `achieved` pelo `goalAchieved` (ganho conta pela data do ganho; reabrir tira; perdido não conta), o resto pelo `goalProgress`. MEMBER vê as da equipe e as dele; owner/admin todas |
| ★ `POST /v1/crm/goals` | owner/admin · **`{ metric, ownerId?, pipelineId?, period, target }`** → 400 com `path` (`metric`, `period` pelo `periodBounds`, `target` > 0, `ownerId` membro); repetida → 409 `GOAL_EXISTS` → 201 |
| `PATCH/DELETE /v1/crm/goals/:id` · `POST /v1/crm/goals/copy` `{ from, to }` | owner/admin; copiar as metas de um período para o seguinte |

Tela ★ `/crm/metas`: período (mês/trimestre) com setas, uma linha por meta (`crm-goal-row`, `data-status` = `status`, `data-owner`): pessoa ou "Equipe", barra com o atingido e a marca do esperado para hoje, "faltam R$ X · R$ Y por dia"; **+ Meta** (`crm-goal-new`). Widget no Início ("Sua meta do mês") e no relatório por vendedor (coluna Meta). Notificação `crm.goal.reached` quando a meta é batida (vendedor e gestores).

## Automações por etapa (`feature: 'crm_automations'`, limite `crmAutomations`)

| Rota | Faz |
|---|---|
| ★ `GET /v1/crm/automations` · ★ `POST` · `PATCH/DELETE /:id` | owner/admin · **`{ name, pipelineId?, trigger: { type, stageId? }, conditions?, actions, active? }`** → `validateAutomation` (400 com `path`, ids conferidos na empresa) → 201 **`{ id, name, pipelineId, trigger, conditions, actions, active, runsCount, lastRunAt }`** |
| ★ `GET /v1/crm/automations/:id/runs` | **`{ data: [{ id, dealId, deal: { id, title }, status, actions: [{ type, result }], error, at }] }`** (últimas 100) |

**Execução** (job `crm.automation.run`, na fila, nunca dentro da requisição do vendedor):

1. Os eventos do negócio (criado, mudou de etapa, ganho, perdido; parado = job diário com o `rottingInfo`) gravam um `eventId` e enfileiram.
2. Para cada automação ativa: `automationMatches(automação, evento, negócio)`; já existe `CrmAutomationRun` com a mesma chave → pula (repetição da fila não duplica).
3. `planActions` resolve: `CREATE_ACTIVITY` (prazo em dias corridos ou úteis com os feriados da empresa, responsável = dono do negócio ou a pessoa escolhida), `ASSIGN_OWNER` (rodízio com `rrCursor`, pulando quem saiu), `ADD_TAG`, `SEND_EMAIL` (modelo, abaixo), `SEND_WHATSAPP` (modelo aprovado do motor), `START_SEQUENCE`, `NOTIFY` (`crm.automation.notice`).
4. Ação que falha (sem e-mail, WhatsApp desconectado) não derruba as outras: o run fica `FAILED` com a mensagem e o negócio ganha um evento na linha do tempo ("Automação X: não mandou o e-mail — contato sem e-mail").
5. **Laço**: ação que gera evento (mudar dono não gera etapa) carrega `depth + 1`; acima de `MAX_AUTOMATION_DEPTH` (3) para e registra `SKIPPED`.

Tela ★ `/crm/automacoes`: lista (`crm-automation-row`, `data-active`), editor em frases ("Quando o negócio **entrar em Proposta** no funil **Vendas**, se **valor ≥ R$ 5.000**, então **criar ligação** para **o dono** em **3 dias**"), ligar/desligar, histórico de execuções com o motivo das falhas.

## Sequências de follow-up (`feature: 'crm_sequences'`, limite `crmSequences`)

| Rota | Faz |
|---|---|
| ★ `GET /v1/crm/sequences` · ★ `POST` · `PATCH/DELETE /:id` | owner/admin cria; todos usam · **`{ name, steps, businessDays?, stopOn? }`** → `validateSequence` → 201 **`{ id, name, steps, businessDays, stopOn, active, activeEnrollments }`** |
| ★ `POST /v1/crm/sequences/:id/enroll` | **`{ dealId }`** (ou `leadId`) → negócio fechado 409 `DEAL_NOT_OPEN`; já em sequência ativa 409 `ALREADY_ENROLLED` → cria a atividade do passo 0 (`stepDueDate(steps, 0, hoje)`, dono do negócio) → **201 `{ id, sequenceId, dealId, status: "ACTIVE", currentStep: 0, activityId }`** |
| ★ `GET /v1/crm/enrollments` | `?dealId=` / `leadId` / `status` → **`{ data: [{ id, sequence: { id, name, steps: n }, status, currentStep, stoppedReason, startedAt, endedAt }] }`** |
| ★ `POST /v1/crm/enrollments/:id/stop` | → `STOPPED` `MANUAL`; a atividade pendente do passo sai da agenda |

Regras:
- Concluir a atividade de um passo cria a do próximo (`nextStepIndex`, `stepDueDate` a partir da data da conclusão); concluir o último → `COMPLETED`. Reabrir a atividade não volta a sequência.
- Passo `EMAIL`/`WHATSAPP` com `auto: true` e modelo escolhido **manda sozinho** no dia (job das 9 h no fuso da empresa) e conclui o passo; sem `auto`, vira atividade "Mandar e-mail"/"Mandar WhatsApp" com o modelo pronto para um clique.
- **Para sozinha** (`sequenceStopReason`): ganho/perda do negócio, resposta do contato (e-mail recebido pelo add-on `email` ou mensagem do WhatsApp do mesmo telefone), descadastro (PARAR no WhatsApp). A atividade pendente sai; a linha do tempo mostra "Sequência X parou: cliente respondeu".
- A atividade de sequência mostra o selo "Passo 2 de 5 · Prospecção" (`sequence: { enrollmentId, step, total, name }` no item de `/activities`).

Tela: ★ `/crm/sequencias` (lista e editor com a linha do tempo dos passos: "Dia 0 · E-mail", "Dia 2 · Ligação"…); no negócio, **Sequência** (`crm-deal-sequence`) com o status (`crm-deal-sequence-status`, `data-status`) e **Inscrever** (`crm-deal-sequence-enroll` → `crm-sequence-option`) / **Parar** (`crm-deal-sequence-stop`).

## Mesclar duplicados

| Rota | Faz |
|---|---|
| ★ `GET /v1/crm/duplicates/groups` | `?entity=contacts` (ou `companies`) → **`{ data: [{ by: "cpf" \| "email" \| "phone" \| "name", key, records: [{ id, name, email, phone, openDeals }] }] }`** (`duplicateGroups`; empresas por CNPJ e nome) |
| ★ `POST /v1/crm/contacts/:id/merge` | o `:id` é o **destino** · **`{ sourceId, choices?: { campo: "source" } }`** → `sourceId === id` 400 `MERGE_SAME`; origem de outra empresa ou inexistente 404; quem não vê os dois 404 → numa transação: `mergeRecords` (vazio preenchido, conflito fica o destino salvo `choices`, etiquetas somadas, campos personalizados por chave), **move** negócios, atividades, anotações, anexos, leads, inscrições, ligações com empresas e mensagens do WhatsApp; a origem fica excluída com `mergedIntoId`; evento "mesclado com X" nos dois → **200 `{ contact, moved: { deals, activities, notes, attachments, leads } }`** |
| `POST /v1/crm/companies/:id/merge` | o mesmo para empresas (CNPJ diferente nos dois → 409 `MERGE_CNPJ_CONFLICT`: empresas diferentes não se juntam) |

A origem mesclada responde 404 com `mergedIntoId` no corpo (o front redireciona). Quem pode: owner/admin, ou quem é dono dos dois registros. Desfazer: não há (aviso no diálogo), mas o evento guarda os valores antigos.

Tela: ★ `/crm/duplicados` (grupos com "Mesclar"); no contato, **Mesclar com…** (`crm-contact-merge`) abre o diálogo (`crm-merge-dialog`) com a busca do outro contato (`crm-merge-search` → `crm-merge-option`), os campos lado a lado com a escolha nos conflitos e **Mesclar** (`crm-merge-confirm`). O aviso de duplicado do formulário (`crm-duplicate-warning`) ganha "Mesclar".

## Modelos de e-mail (envio pelo add-on `email`)

| Rota | Faz |
|---|---|
| ★ `GET /v1/crm/email-templates` · ★ `POST` · `PATCH/DELETE /:id` | **`{ name, subject, body, shared? }`** → `validateTemplateVars` (400 com `path` `subject`/`body` e a variável desconhecida) → 201 |
| ★ `POST /v1/crm/emails` | idempotente · **`{ dealId? \| contactId?, templateId?, subject?, body?, to? }`** → destinatário = `to` ou o e-mail do contato (sem e-mail → 409 `CONTACT_NO_EMAIL`); contato que pediu para não receber → 409 `CONTACT_OPTED_OUT`; `renderCrmTemplate` com contato, empresa, negócio (etapa, valor), vendedor e hoje → variável usada sem valor → **422 `TEMPLATE_MISSING_DATA` com `missing`** (o front mostra e deixa editar) → manda pelo add-on `email` (remetente "Nome do vendedor via Empresa", resposta para o e-mail do vendedor, cabeçalhos para a resposta voltar ao CRM quando o recebimento está ligado) → atividade `EMAIL` concluída + evento na linha do tempo → **201 `{ id, to, subject, activityId }`**; sem o add-on `email` → 409 `EMAIL_NOT_CONFIGURED` |

Variáveis (`TEMPLATE_VARS`): `{{contato.nome}}`, `{{contato.primeiro_nome}}`, `{{contato.email}}`, `{{contato.telefone}}`, `{{empresa.nome}}`, `{{negocio.titulo}}`, `{{negocio.valor}}`, `{{negocio.etapa}}`, `{{vendedor.nome}}`, `{{vendedor.primeiro_nome}}`, `{{vendedor.email}}`, `{{hoje}}`. Editor com o menu de variáveis e a prévia com um negócio de verdade. Rastreio de abertura e sincronização de caixa de e-mail continuam fora.

## Pontuação de lead (`feature: 'crm_scoring'`)

| Rota | Faz |
|---|---|
| ★ `GET /v1/crm/scoring` · ★ `PUT` | owner/admin · **`{ rules: [{ id?, field, op, value, points }], warmAt, hotAt }`** → `validateScoring` → recalcula os leads abertos (job) → 200 |
| leads | o item de ★ `GET /v1/crm/leads` ganha **`score`** e **`temperature`** (`COLD`/`WARM`/`HOT`); filtros `?temperature=HOT`, `?sort=-score`; o detalhe traz `scoreBreakdown` ("+30 indicação · +15 tem telefone") |

O placar (`leadScore`) recalcula ao criar, editar, capturar e converter; campos: `sourceId`, `via`, `hasEmail`, `hasPhone`, `hasCompany`, `hasCnpj`, `value`, `utmSource`, `utmCampaign`, `cf.<chave>`. Lead que vira **quente** avisa o responsável (`crm.lead.hot`). Na caixa de leads, o selo da temperatura (`crm-lead-temperature`, `data-temperature`) e ordenação por pontuação.

## Mensagens prontas de WhatsApp

| Rota | Faz |
|---|---|
| ★ `GET /v1/crm/whatsapp-snippets` · ★ `POST` · `PATCH/DELETE /:id` | **`{ name, body, templateName?, stageIds? }`** (variáveis como nos modelos de e-mail; `templateName` = modelo aprovado do motor para quando a janela de 24 h está fechada) |
| ★ `POST /v1/crm/deals/:id/whatsapp` | **`{ snippetId? , text? }`** → contato sem telefone 409 `CONTACT_NO_PHONE`; texto renderizado (422 `TEMPLATE_MISSING_DATA`) → **com o motor de WhatsApp conectado** (`/rodsaas:whatsapp`): `whatsapp.send({ to, text, ref: { app: "crm", entity: "deal", id } })` (janela fechada e mensagem sem `templateName` → 409 `OUTSIDE_WINDOW`; com `templateName` sai o modelo) → **201 `{ channel: "WHATSAPP_API", messageId, activityId }`**; **sem o motor**: **201 `{ channel: "LINK", link: "https://wa.me/55…?text=…", activityId }`** (o front abre o link) — nos dois casos atividade `WHATSAPP` concluída e evento na linha do tempo |

Com o motor, a conversa aparece na linha do tempo do contato (casada pelo telefone) e a resposta do cliente para as sequências dele. O botão WhatsApp do negócio/contato abre a lista das mensagens prontas da etapa atual primeiro (`crm-whatsapp-snippet`), com a prévia já preenchida.

## Erros novos

`GOAL_EXISTS` · `ALREADY_ENROLLED` · `DEAL_NOT_OPEN` (inscrever negócio fechado) · `MERGE_CNPJ_CONFLICT` · `CONTACT_NO_EMAIL` · `CONTACT_NO_PHONE` · `CONTACT_OPTED_OUT` · `EMAIL_NOT_CONFIGURED` · `OUTSIDE_WINDOW` (409), `MERGE_SAME` (400), `TEMPLATE_MISSING_DATA` (422). Planos: features `crm_goals`, `crm_automations`, `crm_sequences`, `crm_scoring` (Pro e Business), limites `crmAutomations` (Pro 10, Business ilimitado) e `crmSequences` (Pro 5, Business ilimitado) — `FEATURE_NOT_IN_PLAN` / `PLAN_LIMIT_REACHED` como na base.

## Notificações novas (catálogo do add-on, seção CRM)

`crm.goal.reached` (vendedor e owners/admins), `crm.lead.hot` (responsável; sem responsável, owners/admins), `crm.automation.notice` (quem a ação `NOTIFY` escolheu), `crm.automation.failed` (owners/admins, agrupado por dia).

## Testes obrigatórios

- Metas: ganho no período conta pela data do ganho, perdido e reaberto não, de outro vendedor não; meta da equipe soma todos; ritmo (`status`) com relógio fixo; 409 repetida; MEMBER não cria.
- Automações: entrar na etapa cria a atividade com prazo e dono; condição barra; desligada não roda; mesmo evento não roda duas vezes; ação que falha registra e não derruba as outras; laço para no limite.
- Sequências: inscrever cria o passo 0; concluir cria o próximo no intervalo em dias úteis; último → `COMPLETED`; ganho/perda/resposta param e tiram a pendente; inscrição repetida 409.
- Mesclar: tudo que era da origem vai para o destino, vazio preenchido, escolha respeitada, origem 404 com `mergedIntoId`, consigo mesmo 400, de outra empresa 404; grupos de duplicados.
- E-mail: variável desconhecida 400; envio com tudo preenchido chega e vira atividade; dado faltando 422; sem e-mail 409.
- Pontuação: soma, teto/piso, temperatura, ordenação e recálculo ao editar.
- WhatsApp: com o motor sai pela API com o `ref` do CRM e para a sequência quando o cliente responde; sem o motor devolve o link; janela fechada sem modelo 409.
