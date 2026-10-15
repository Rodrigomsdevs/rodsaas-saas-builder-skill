# 11 · Perfis de segmento (locação, reforma/obra, escola)

O Comercial é **um só**; o perfil decide o que já vem ligado, as palavras e uma área própria por segmento. Recurso que serve a mais de um segmento fica no núcleo (`10`).

## Onde fica

- `ComSettings.segment` (`GENERAL` · `RENTAL` · `CONSTRUCTION` · `SCHOOL`), escolhido no onboarding da workstation (imobiliária e comércio de equipamentos → pergunta; educação → `SCHOOL`) ou na primeira abertura do app. Muda em Configurações → Perfil.
- ★ `PATCH /v1/com/settings { segment }` (`COM_ADMIN`) aplica o perfil (`comSegment(id).on`) sem desligar nada e devolve **`{ ...settings, segment, words, on }`**; ★ `GET /v1/com/settings` também devolve `segment`, `words` e `on`.

## O que cada perfil liga

| Perfil | Liga | O que muda |
|---|---|---|
| `GENERAL` | — | — |
| `RENTAL` (locação de equipamentos, andaimes, festas) | **itens de locação** (abaixo), sinal (caução), WhatsApp | proposta com período e diárias; disponibilidade no período; devolução com atraso e avaria; vocabulário "locatário", "contrato de locação" |
| `CONSTRUCTION` (reforma, obra, marcenaria, instalação) | **etapas e medição** (abaixo), sinal, catálogo do ERP | proposta com etapas e pesos; contrato faturado por medição com retenção técnica; vocabulário "orçamento da obra", "contrato de empreitada" |
| `SCHOOL` (escola, curso, idiomas) | **matrícula** (abaixo), sinal (taxa de matrícula), reajuste por índice | proposta de matrícula com anuidade em parcelas, irmão, bolsa e pontualidade; vocabulário "responsável", "contrato de matrícula" |

## Locação (`RENTAL` · `feature: 'com_rentals'`)

- ★ `POST /v1/com/rental-items` (`COM_ADMIN`) **`{ name, stockQty, dayCents, weekCents?, monthCents?, depositCents? }`** · `GET` · `PATCH /:id`.
- ★ `GET /v1/com/rental-items/:id/availability` **`?start&end`** → **`{ available, stockQty }`** (`rentalAvailable`: reservas e locações que se sobrepõem; devolvido ou cancelado não conta).
- Item da proposta com **`rental: { itemId, start, end }`** e `qty`: o preço unitário é o **mais barato** para as diárias (`rentalDays`, `rentalPrice`: diária, semana, mês) — calculado no servidor; a linha mostra o período e as diárias. Sem saldo no período → 409 **`RENTAL_UNAVAILABLE`** (no envio e no aceite) com `{ itemId, available }`.
- Aceite → **reservas** (`RESERVED`) por item; ★ `POST /v1/com/rentals/:id/checkout` (saiu) e ★ `POST /v1/com/rentals/:id/return` **`{ returnedAt, damagesCents?, notes? }`** → `lateReturn` (diárias extras após o fim, tolerância de 2 h) + avarias → **`{ rental: { status: "RETURNED", lateDays, lateChargeCents, damagesCents }, entryId \| null }`** (com o Financeiro, o extra vira receita do cliente).
- ★ `GET /v1/com/rentals` **`?status&from&to`** (agenda de saídas e devoluções; `com-rental-row`, `data-status`).

## Reforma e obra (`CONSTRUCTION` · `feature: 'com_measurements'`)

- Proposta e contrato com **`stages: [{ name, pct }]`** (`validateStages`: somam 100%; 400 em `stages.N.*`) e **`retentionPct?`** (retenção técnica, padrão 0; 5% é o comum).
- ★ `POST /v1/com/contracts/:id/measurements` **`{ progress: [0–100 por etapa], date?, notes? }`** → `measurement` (progresso acumulado; nunca volta: 400 `PROGRESS_BACKWARDS`) → **201 `{ measurement: { number, lines: [{ stage, before, now, amountCents }], grossCents, retentionCents, netCents }, entryId \| null }`**; com o Financeiro, o líquido vira receita do contratante (vencimento conforme o contrato, padrão 10 dias). Contrato não assinado → 409 `CONTRACT_NOT_SIGNED`; nada a medir → 400 `NOTHING_TO_MEASURE`.
- ★ `GET /v1/com/contracts/:id/measurements` → **`{ data, progress, measuredCents, retainedCents }`**; ★ `POST /v1/com/contracts/:id/release-retention` (todas as etapas em 100%; senão 409 `STAGES_NOT_DONE`) → receita da retenção acumulada.
- Tela do contrato: etapas com barra de progresso (`com-stage-row`, `data-progress`) e as medições.

## Escola (`SCHOOL` · `feature: 'com_enrollments'`)

- ★ `POST /v1/com/enrollments` **`{ student: { name, birthDate?, grade }, guardian: { name, document, email, phone? }, schoolYear, annualCents, installments, firstDue, scholarshipPct?, punctualityPct?, materialCents?, enrollmentFeeCents? }`** → cria a **proposta de matrícula** (itens: anuidade, material, taxa de matrícula como sinal) com o plano `tuitionPlan`; **desconto de irmão automático** (`siblingPct` das configurações, padrão 10%) quando o mesmo responsável (documento) já tem outra matrícula **aceita** no mesmo `schoolYear` → **201 `{ proposal, plan: { schedule: [{ number, dueDate, grossCents, discountCents, amountCents, onTimeCents }], enrollmentCents, totalCents }, siblingApplied }`**.
- Aceite → contrato de matrícula de 12 meses (quando `com_contracts`) e, com o Financeiro, uma receita por mensalidade com o valor cheio e a **pontualidade** anotada (`onTimeCents`; a baixa até o vencimento usa o desconto: `tuitionDue`).
- ★ `GET /v1/com/enrollments` **`?schoolYear`** (`com-enrollment-row`, `data-status`); rematrícula = nova matrícula no ano seguinte copiando os dados.

## Testids

| testid | Onde |
|---|---|
| `com-segment` | Configurações → Perfil |
| `proposal-deposit`, `proposal-deposit-pay` | página pública da proposta aceita |
| `com-send-whatsapp` | detalhe da proposta |
| `com-conversion`, `com-conversion-seller` (`data-seller`) | Relatórios |
| `com-rental-row` (`data-status`) | Locações |
| `com-stage-row` (`data-progress`) | contrato com etapas |
| `com-enrollment-row` (`data-status`) | Matrículas |

## Testes obrigatórios

- Aplicar cada perfil liga o que ele pede sem desligar nada; vocabulário.
- Locação: preço mais barato para 10 dias; indisponível no período 409; devolução atrasada cobra as diárias e a avaria.
- Obra: etapas somando 90% 400; medição com retenção; progresso que volta 400; liberar retenção só com tudo em 100%.
- Escola: plano com material e pontualidade; irmão automático na segunda matrícula do mesmo responsável no ano.
