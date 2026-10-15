# 10 · Perfis de segmento (prestador de serviço, comércio com maquininha, clínica com convênio)

O Financeiro é **um só**; o perfil decide o que já vem ligado, as palavras e duas áreas próprias (maquininha e convênio). Recurso que serve a mais de um segmento fica no núcleo (`09`).

## Onde fica

- `FinSettings.segment` (`GENERAL` · `SERVICES` · `RETAIL` · `CLINIC`), escolhido no onboarding da workstation (agência, escritório e tecnologia → `SERVICES`; comércio → `RETAIL`; saúde e odonto → `CLINIC`) ou na primeira abertura do app. Muda em Configurações → Perfil.
- ★ `PATCH /v1/fin/settings { segment }` (`FIN_ADMIN`) aplica o perfil (`finSegment(id).on`): liga as opções do perfil sem desligar nada e devolve **`{ ...settings, segment, words, on }`**; ★ `GET /v1/fin/settings` também devolve `segment`, `words` e `on`. Trocar não apaga nada.

## O que cada perfil liga

| Perfil | Liga | O que muda |
|---|---|---|
| `GENERAL` | — | — |
| `SERVICES` (agência, consultoria, contabilidade, TI) | NFS-e, **NFS-e na baixa** (`nfseOnPayment`), retenções, recorrência | serviço padrão nas configurações; lançamento de receita com o bloco "Nota de serviço"; mensalidade de cliente (recorrência) emite a nota a cada pagamento; vocabulário "honorário" |
| `RETAIL` (loja, restaurante, mercado) | **maquininhas** (abaixo), antecipação, orçamento | venda no cartão vira os recebíveis certos; a tela inicial mostra "a receber das maquininhas" por data |
| `CLINIC` (clínica, consultório, laboratório) | **convênios e glosa** (abaixo), NFS-e, orçamento | vocabulário "paciente"/"convênio"; guia → lote → recebível do convênio; glosa e recurso; índice de glosa por convênio |

## Maquininha de cartão (comércio · `feature: 'fin_card_machines'`)

- ★ `POST /v1/fin/card-machines` (`FIN_ADMIN`) **`{ name, accountId, debitPct, creditPct, installmentPct, debitDays?, creditDays?, anticipationMonthlyPct? }`** (`validateCardMachine`; padrão D+1 e D+30; `accountId` = onde o dinheiro cai) · `GET` · `PATCH /:id`.
- ★ `POST /v1/fin/card-sales` (escrita, idempotente) **`{ machineId, kind: "DEBIT" \| "CREDIT", installments?, amountCents, saleDate, description?, categoryId? }`** → **201 `{ sale: { id, schedule: [{ number, total, dueDate, grossCents, feeCents, netCents }] }, entries }`** (`cardSaleSchedule`): por parcela, **uma receita bruta** (categoria de vendas, vencimento na data do repasse, conta da maquininha) e **uma despesa da taxa** (categoria "Tarifas de cartão", despesa financeira, criada na primeira venda; mesma data) — a DRE vê a venda cheia e a taxa; o saldo vê o líquido.
- ★ `GET /v1/fin/card-receivables` **`?machineId&from&to`** → **`{ data: [{ saleId, number, total, dueDate, grossCents, feeCents, netCents, incomeEntryId, feeEntryId }], totals: { grossCents, feeCents, netCents } }`** (o que ainda não caiu).
- ★ `POST /v1/fin/card-receivables/settle` (escrita) **`{ machineId, date, until? }`** → baixa receita e taxa de cada parcela vencida até `until` (padrão `date`) na conta da maquininha → **`{ settled, netCents }`**. O depósito do extrato concilia com o líquido (sugestão pelo total do dia da maquininha).
- ★ `POST /v1/fin/card-receivables/anticipate` (escrita) **`{ machineId, date, saleIds? }`** → `anticipation` (`anticipationMonthlyPct` pro rata pelos dias): baixa as parcelas futuras na data e lança a despesa "Antecipação de recebíveis" (despesa financeira, criada na primeira antecipação) já paga → **`{ netCents, discountCents, receiveCents, items }`**.

## Convênios e glosa (clínica · `feature: 'fin_claims'`)

- Convênio é um contato com **`insurer: { paymentDays, ansCode? }`** (`PATCH /v1/fin/contacts/:id`).
- ★ `POST /v1/fin/claims` (escrita) **`{ insurerId, patientName, guideNumber, serviceDate, amountCents, procedures? }`** → 201 guia `OPEN`; guia duplicada no convênio → 409 `GUIDE_TAKEN`.
- ★ `POST /v1/fin/claim-batches` (escrita) **`{ insurerId, claimIds, sentOn? }`** → envia o lote: guias `SENT` (`canMoveClaim`) e **uma receita do convênio** com a soma, vencimento `sentOn + paymentDays`, categoria de serviços → **201 `{ batch: { id, number, totalCents, dueDate, entryId } }`**; guia de outro convênio ou já enviada → 409 `CLAIM_RULES` com `violations`.
- ★ `POST /v1/fin/claims/:id/glosa` (escrita) **`{ amountCents, reason, code? }`** (`validateGlosa`: 400; total glosado ≤ valor da guia) → a receita do lote **baixa o valor glosado** do que falta receber (o lançamento do lote cai para o esperado; com baixa já maior → 409 `AMOUNT_BELOW_PAID`); → **`{ claim: { id, status, billedCents, glosaCents, recoveredCents, expectedCents } }`**.
- ★ `POST /v1/fin/claims/:id/appeal` **`{ text }`** (recurso de glosa: guia com glosa aberta) e ★ `POST /v1/fin/claims/:id/appeal-result` **`{ recoveredCents }`** (`validateRecovery`: até o glosado em aberto; zero = recurso negado) → o recuperado vira **nova receita do convênio** ("Recurso de glosa — guia N") com vencimento em `paymentDays`.
- ★ `GET /v1/fin/reports/glosas` (`fin_reports`) **`?from&to`** → **`{ data: [{ insurer: { id, name }, billedCents, glosaCents, recoveredCents, netGlosaCents, ratePct }] }`** (`glosaRate`, por convênio; data do atendimento).
- Tela `/financeiro/convenios`: guias por convênio e situação (`fin-claim-row`, `data-status`), lote, glosa e recurso.

## Testids

| testid | Onde |
|---|---|
| `fin-segment` | Configurações → Perfil |
| `fin-entry-nfse`, `fin-nfse-issue` | lançamento |
| `fin-allocation-row` | formulário e detalhe do lançamento |
| `fin-budget-row` (`data-status`) | Orçamento |
| `fin-card-invoice` (`data-ref`, `data-status`) | Contas → cartão |
| `fin-locked`, `fin-lock-month` | lançamento; Configurações → Fechamento |
| `fin-card-receivable-row`, `fin-card-settle` | Maquininhas |
| `fin-claim-row` (`data-status`), `fin-claim-glosa` | Convênios |

## Testes obrigatórios

- Aplicar cada perfil liga o que ele pede sem desligar nada; vocabulário do perfil.
- Maquininha: débito D+1 com taxa; crédito parcelado em 3 com a taxa de parcelado; DRE com a venda bruta e a taxa; baixar repasse; antecipar com desconto.
- Convênio: lote vira receita com o vencimento do convênio; glosa baixa o esperado; recurso recupera parte em nova receita; índice de glosa.
- Prestador: receita com serviço quitada emite a NFS-e sozinha.
