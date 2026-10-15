# 10 · Perfis de segmento (pesquisas NPS/CSAT, eventos com vagas e check-in, ficha e anamnese)

O Forms é **um só**; o perfil decide o que já vem ligado, as palavras e os modelos sugeridos. Recurso que serve a mais de um segmento fica no núcleo (`09`).

## Onde fica

- `FormsSettings.segment` da empresa (`GENERAL` · `SURVEY` · `EVENTS` · `HEALTH`), escolhido no onboarding da workstation (saúde, odonto, beleza e pet → `HEALTH`; educação → `EVENTS`) ou na primeira abertura. Muda em Configurações do Forms → Perfil.
- ★ `GET /v1/forms/settings` · ★ `PATCH /v1/forms/settings { segment }` (owner/admin) aplica o perfil (`formsSegment(id).on`) sem desligar nada → **`{ segment, words, on }`**. O perfil sugere os modelos do segmento na criação.

## O que cada perfil liga

| Perfil | Liga | O que muda |
|---|---|---|
| `GENERAL` | — | — |
| `SURVEY` (pós-venda, RH, satisfação) | NPS por mês, retorno ao detrator, respostas parciais | **NPS ao longo do tempo** e CSAT (abaixo); nota baixa abre o retorno; vocabulário "pesquisa" |
| `EVENTS` (eventos, cursos, workshops) | vagas, lista de espera, ingresso com QR, pagamento | **vagas e check-in** (abaixo); vocabulário "inscrição"/"inscritos" |
| `HEALTH` (clínica, consultório, estética, pet) | respostas sensíveis, assinatura, alertas da ficha, agendar no fim | **ficha e anamnese** (abaixo); vocabulário "ficha" |

## Pesquisas: NPS e CSAT (`SURVEY`)

- ★ `GET /v1/forms/:id/nps` **`?from&to&fieldId?`** → **`{ score, promoters, passives, detractors, count, months: [{ month, score, count, promoters, passives, detractors }] }`** (`npsScore`, `npsTrend` no fuso da empresa); ★ `GET /v1/forms/:id/csat` **`?fieldId`** (estrelas) → **`{ count, satisfied, pct }`** (`csatScore`: as duas maiores notas da escala).
- `settings.detractorFollowUp: "helpdesk" | "task" | null`: nota de 0 a 6 (`isDetractor`) abre um chamado no Suporte (ou uma tarefa no Tarefas) "Retorno ao detrator · {nome}" com a resposta → ★ a resposta mostra **`followUp: { kind, id } | null`**.
- Tela do formulário → aba NPS com o gráfico por mês (`form-nps-trend`, `data-month`).

## Eventos: vagas, lista de espera e check-in (`EVENTS`)

- **Vagas** no formulário (`settings.capacity`) e/ou por opção (`options[].capacity`: lote, sessão, turma). No envio, `registrationStatus`: com vaga → `COMPLETE` com **ingresso** (`ticketCode`, 10 caracteres com dígito de controle, enviado por e-mail com o QR); lotado → **`WAITLIST`** (com `settings.waitlist`) ou 409 **`FORM_FULL`** (`{ optionId? }`). ★ O 201 devolve **`{ id, status, ticketCode | null }`**; ★ `GET /v1/public/forms/:slug` mostra as vagas que restam por opção (`seats`).
- Cancelar uma inscrição (`POST /v1/forms/:id/responses/:responseId/cancel`) libera a vaga e **promove a lista de espera** (`promoteWaitlist`: os mais antigos), com e-mail ao promovido.
- ★ `POST /v1/forms/:id/checkin` **`{ code }`** (editor ou quem tem o papel "portaria") → `isTicketCode` (400 `TICKET_INVALID`) → **`{ responseId, name, option, checkedInAt }`**; código de outro evento → 404; segunda leitura → 409 **`ALREADY_CHECKED_IN`** com a hora da primeira. ★ `GET /v1/forms/:id/attendees` → **`{ data: [{ responseId, name, email, option, status, ticketCode, checkedInAt }], totals: { confirmed, waitlist, checkedIn } }`**.
- Tela de check-in no celular (`/forms/:id/checkin`) lendo o QR pela câmera ou digitando o código (`form-checkin-code`, `form-checkin-result` com `data-status`).

## Ficha e anamnese (`HEALTH`)

- Pergunta com **`sensitive: true`** (alergias, medicamentos, histórico): a resposta fica cifrada em repouso e só quem tem o papel do Forms **"vê dados de saúde"** (ou owner) lê; os outros veem `•••` (`maskSensitive`) na tabela, no detalhe e na exportação; exportação com sensíveis exige o papel e fica no audit log.
- **Alertas**: pergunta com `settings.alertIf: { op, value?, message }` → `intakeAlerts` na resposta (★ **`alerts: [{ fieldId, label, answer, message }]`**), destacados no detalhe e enviados no aviso `forms.intake.alert` a quem atende.
- **Validade** (`settings.intakeValidityMonths`, padrão 12): `intakeExpiresOn`; com a Agenda, o agendamento do cliente mostra "ficha vencida — reenviar" e o link já preenchido com o e-mail.
- Assinatura desenhada obrigatória no fim (termo de consentimento) e **agendar no fim** ligados por padrão nos modelos do perfil (Ficha de anamnese, Ficha estética, Ficha do pet).

## Testids

| testid | Onde |
|---|---|
| `forms-segment` | Configurações do Forms → Perfil |
| `form-calc` (`data-calc`), `form-quiz-result` | formulário público |
| `form-signature-pad`, `form-signature-clear` | pergunta de assinatura |
| `form-pay-redirect`, `form-book-slot` | agradecimento |
| `form-nps-trend` (`data-month`) | aba NPS |
| `form-seats` (`data-option`), `form-ticket` | formulário público e agradecimento |
| `form-checkin-code`, `form-checkin-result` (`data-status`) | check-in |
| `form-alert`, `form-sensitive-mask` | detalhe da resposta |

## Testes obrigatórios

- Aplicar cada perfil liga o que ele pede sem desligar nada.
- NPS por mês e detrator abrindo o retorno.
- Vagas: última vaga confirma, a seguinte vai para a lista; cancelar promove; check-in e segunda leitura 409.
- Ficha: sensível mascarada para quem não pode ver; alerta na resposta.
