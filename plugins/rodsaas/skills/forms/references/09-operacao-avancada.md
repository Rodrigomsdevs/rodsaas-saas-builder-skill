# 09 · Resposta parcial, cálculo e quiz, pagamento, assinatura desenhada, agendar no fim e resposta → chamado

O que quem usa formulário de verdade pede depois do básico: **não perder quem desistiu no meio**, **calcular** o orçamento (ou a nota do quiz) na hora, **cobrar** na própria resposta, **assinar** com o dedo, **marcar o horário** sem sair do formulário e **abrir o chamado** a partir da resposta. Tudo **núcleo** (vale para qualquer perfil; `10-perfis-de-segmento.md` decide o que já vem ligado). Regras no `forms-lib` (seção "operação avançada"). Formatos ★ fazem parte do contrato (grupo `presets.forms`).

## Modelo (somar ao `02-modelo.md`)

```prisma
model FormPartial { id String @id @default(uuid()); orgId String; formId String; version Int; tokenHash String @unique; answers Json; hidden Json?; lastFieldId String?; progressPct Int; completedResponseId String?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; expiresAt DateTime }
// FormResponse ganha calculations Json?, quiz Json?, status String @default("COMPLETE") ("COMPLETE" | "AWAITING_PAYMENT" | "PAID" | "WAITLIST" | "CANCELED"),
//   payment Json? ({ amountCents, entryId, chargeId, payUrl, paidAt }), appointmentId String?, ticketId String?, ticketCode String?, checkedInAt DateTime?, alerts Json?
// Esquema (Form.draft/published) ganha: calculations [{ id, label, formula, format }], quiz { passPct, outcomes }, opção com points/capacity, pergunta com correct/points/sensitive/settings.alertIf
// FormSettings ganha savePartials (false), schedule ({ agendaTypeId } | null), integrations.helpdesk ({ enabled, queueId?, subjectField? }), capacity (null), waitlist (true), segment
```

Tipos novos de pergunta: **`signature`** (assinatura desenhada; resposta `{ dataUrl, strokes, name? }` ou o id do arquivo) e **`payment`** (cobrança: `settings.amountCents` fixo **ou** `settings.amountFrom` = id de um cálculo; `methods` pix/card/boleto). `validateSchema` confere os dois, os cálculos e o quiz.

## Resposta parcial (`settings.savePartials`)

- ★ `PUT /v1/public/forms/:slug/partials` **`{ token?, answers, hidden? }`** (o formulário chama ao trocar de página ou a cada 10 s com mudança) → **`{ token, progress: { answered, total, pct, lastFieldId } }`** (`mergePartial`, `partialProgress`); o `token` fica no navegador e no link "continuar depois" (e-mail opcional ao respondente quando ele digitou o e-mail). Arquivos e assinatura não são guardados no parcial. Parcial vence em 30 dias.
- ★ `GET /v1/public/forms/:slug/partials/:token` → **`{ answers, progress }`** (retomar); token desconhecido ou vencido → 404 `PARTIAL_NOT_FOUND`.
- Enviar a resposta com o **`partialToken`** fecha o parcial (`completedResponseId`). Sem o consentimento LGPD respondido, o parcial guarda só as respostas sem dado pessoal (e-mail, telefone, CPF/CNPJ ficam de fora).
- ★ `GET /v1/forms/:id/drop-off` → **`{ partials, completed, fields: [{ fieldId, label, stopped }] }`** (`dropOff`: onde quem não terminou parou; `fieldId: null` = abriu e não respondeu nada). Aba "Desistências" no funil.

## Cálculo e quiz

- Esquema com **`calculations: [{ id, label, formula, format: "number" | "money" | "percent" }]`**: fórmula segura (`parseFormula`/`evalFormula`: números, `{idDaPergunta}`, `{idDeUmCálculoAnterior}`, `+ − × ÷`, parênteses, `min`, `max`, `round`); valor de cada pergunta por `fieldNumber` (número, valor em centavos, estrelas/NPS/escala, **pontos da opção** escolhida, sim = 1); pergunta escondida vale 0; divisão por zero → "sem valor". Referência a pergunta que não existe ou a um cálculo de depois → 400 `INVALID_FORM_SCHEMA` em `calculations.N.formula`.
- **Quiz**: pergunta de escolha com **`correct`** (id, ou ids na múltipla — só conta inteira certa) e `points` (padrão 1); `quiz: { passPct?, outcomes: [{ min, max, title, message }] }` → `quizScore`.
- O público mostra os cálculos ao vivo (`form-calc`, `data-calc`) e, no fim, o resultado do quiz (`form-quiz-result`); ★ a resposta grava **`calculations: { [id]: valor }`** e **`quiz: { score, max, pct, passed, outcome }`** (calculados no servidor, nunca aceitos do navegador) e devolve os dois no 201 para a tela de agradecimento (`{{calc.total}}` e `{{quiz.pct}}` no texto).

## Pagamento na resposta (Financeiro com `fin_charges`)

- Formulário com pergunta **`payment`**: no envio, `paymentAmount` (fixo ou do cálculo, mínimo R$ 0,50) → a resposta nasce **`AWAITING_PAYMENT`**, o Financeiro lança a receita ("Formulário · título · respondente") e cria a **cobrança**; ★ o 201 devolve **`{ id, status: "AWAITING_PAYMENT", payment: { amountCents, payUrl } }`** e a tela leva para a página de pagamento. Valor 0 (cálculo zerado) → resposta normal sem cobrança.
- Pagamento confirmado (webhook) → `PAID` e só então saem os avisos, a resposta automática e as integrações (CRM, chamado); não pago em 48 h → a cobrança expira e a resposta fica `AWAITING_PAYMENT` (filtro na tabela).
- Sem o Financeiro: publicar com pergunta de pagamento → 409 `PAYMENTS_UNAVAILABLE`.

## Assinatura desenhada

- Pergunta **`signature`**: quadro para desenhar com o dedo ou o mouse, "limpar" e, com `settings.requireName`, o nome completo; `validateSignatureData` (PNG até 150 KB, ao menos um traço, nome com nome e sobrenome) → 400 em `answers.<id>`. O servidor grava a imagem como arquivo (add-on `uploads`) com o **SHA-256** e a hora, e a resposta guarda o id do arquivo. A exportação mostra "Assinado por …"; o PDF da resposta traz a imagem.

## Agendar no fim (Agenda)

- `settings.schedule: { agendaTypeId }` (tipo de atendimento da Agenda): depois do envio, a tela de agradecimento mostra os horários livres (`GET /v1/public/agenda/...` do link público da Agenda) e ★ `POST /v1/public/forms/:slug/responses/:id/book` **`{ start, token }`** (o `token` da resposta veio no 201) agenda com **nome, e-mail e telefone da resposta** (`contactFromResponse`) → **`{ appointment: { id, start, status } }`**; horário ocupado → 409 `SLOT_TAKEN`; resposta já agendada → 409 `ALREADY_BOOKED`. O agendamento leva o link da resposta nas observações; a resposta ganha `appointmentId`.

## Resposta → chamado (Suporte)

- `settings.integrations.helpdesk: { enabled, queueId?, subjectField? }` (além do lead no CRM que já existe): cada resposta (paga, quando há pagamento) abre um **chamado** no Suporte com `ticketFromResponse` (assunto da pergunta mapeada ou o título; texto com "pergunta: resposta"; solicitante pelo e-mail da resposta) → ★ a resposta ganha **`ticket: { id, number } | null`** no detalhe. Sem o Suporte instalado a opção não aparece.

## Planos, avisos e erros

Feature nova `forms_advanced` (cálculo, quiz, pagamento, assinatura, agendar no fim, chamado — Pro e Business); resposta parcial em todos os planos. Avisos novos: `forms.payment.received`. Erros novos: `PARTIAL_NOT_FOUND` (404), `PAYMENTS_UNAVAILABLE`, `SLOT_TAKEN`, `ALREADY_BOOKED` (409).

## Testes obrigatórios

- Parcial: salvar, retomar pelo token, progresso, desistências por pergunta, envio fecha o parcial.
- Cálculo: fórmula inválida 400; orçamento calculado no servidor (o valor mandado pelo navegador é ignorado).
- Quiz: nota, aprovação e resultado pela faixa.
- Pagamento: resposta `AWAITING_PAYMENT` com o valor do cálculo; pago pelo modo de teste vira `PAID`.
- Assinatura: sem traço 400; com nome; "Assinado por" no detalhe.
- Agendar: horário da resposta vira agendamento com o contato; ocupado 409.
- Chamado: resposta abre o chamado com o assunto mapeado.
