# 10 · Atendimento no balcão: chegada, conclusão, comissões, clube, fidelidade e fila

O que acontece **depois** que o horário foi marcado. Tudo calculado no servidor pelo `agenda-lib` (`commissionFor`, `commissionStatement`, `clubCoverage`, `clubPeriodOf`, `loyaltyStatus`, `queueEstimate`, `clientSummary`, `recallDate`).

## Chegada (check-in)

- `POST /v1/agenda/appointments/:id/check-in` grava `checkedInAt` (a partir de 2 h antes do início; antes disso 409 `TOO_EARLY`). Agendamento cancelado/recusado → 409 `INVALID_STATUS`. Fazer de novo não muda o horário gravado (idempotente).
- A recepção vê "chegou às 09:12" e o atraso ("chegou 12 min atrasado"). Quem passou 15 min do início sem chegar aparece como **atrasado** (destaque, sem mudar o status).
- Desfazer o check-in (`DELETE …/check-in`) enquanto não concluiu.

## Concluir o atendimento

`POST /v1/agenda/appointments/:id/complete` (só depois do check-in ou do início; agendamento confirmado):

```jsonc
{
  "items": [                                             // opcional: sem items, vale o que foi agendado (serviço + adicionais)
    { "kind": "SERVICE", "serviceId": "<tipo>", "hostId": "<pessoa>?", "amountCents": 4000? },
    { "kind": "PRODUCT", "productId": "<produto do ERP>?", "name": "Pomada", "qty": 1, "unitCents": 3500 }
  ],
  "discountCents": 0,
  "payments": [{ "method": "PIX" | "CASH" | "CREDIT" | "DEBIT" | "CLUB" | "INSURANCE", "amountCents": 7500 }],
  "redeemLoyalty": false
}
```

1. Monta as linhas: serviços do agendamento com o preço do momento do agendamento (`Appointment.priceCents` rateado por serviço), **coberto pelo clube → R$ 0** (com `baseCents` = preço de tabela, para a comissão), **convênio → valor do convênio**, resgate de fidelidade → o serviço do prêmio sai por R$ 0 (sem `baseCents`: não comissiona).
2. Desconto geral rateado nas linhas (centavo que sobra na última); nada abaixo de zero.
3. Pagamentos somam o total (422 `PAYMENT_MISMATCH` com `{ totalCents, paidCents }`); troco só em dinheiro.
4. **Comissão** de cada linha com `commissionFor` e as regras do momento; gravada na linha (`AppointmentItem.commissionCents`) e **não muda** se a regra mudar depois.
5. `attendance = ATTENDED`, `completedAt`; o horário que sobrou é liberado (`end` vira o momento da conclusão se for antes do fim; a trava acompanha) — encaixe e fila podem usar.
6. Integrações (fila, sem desfazer a conclusão se falharem): **Financeiro** (receita já recebida por forma de pagamento, categoria `servicos`; produtos em `vendas`), **ERP** (produto com `productId` baixa o estoque pelo ERP, como uma venda de balcão), **fidelidade** (carimbo), **retorno** (se o tipo tem `returnAfterDays`, cria o `AgendaRecall` com `recallDate`), pesquisa depois do atendimento.
7. Resposta: `{ completedAt, items: [{ kind, name, qty, amountCents, hostId, commissionCents }], totalCents, commissionCents, loyalty: { stamps, rewardsAvailable, nextIn } | null, recall: { dueDate } | null }`.

Reabrir (`POST …/reopen`) só owner/admin e só fora de período de comissão fechado (409 `PERIOD_CLOSED`).

## Comissões

- Regras (`AgendaCommissionRule`): por tipo de linha (`SERVICE`/`PRODUCT`), opcionalmente por pessoa e/ou por serviço, em % ou valor fixo por unidade. **A mais específica ganha** (pessoa + serviço > serviço > pessoa > padrão), pelo `commissionRule`.
- `GET /v1/agenda/reports/commissions?from&to&hostId` → `commissionStatement` das linhas concluídas no período: por pessoa, serviços, produtos, comissão, quantidade; e `closed` se o período está fechado. MEMBER vê só a própria.
- **Fechar o período** (`POST /v1/agenda/commissions/close { from, to }`, owner/admin): grava o extrato (`AgendaCommissionClosing`) e trava as linhas do período (concluir/reabrir/editar ali → 409 `PERIOD_CLOSED`); fechar um período que se sobrepõe a outro fechado → 409 `PERIOD_CLOSED`. Com o Financeiro, gera as contas a pagar das comissões (uma por pessoa; categoria `terceiros` por padrão — no salão parceiro da Lei 13.352/2016 o profissional é parceiro, não empregado — ou `salarios` quando a empresa escolhe "CLT" nas configurações de comissão).
- Exportar CSV (`;`, BOM) com uma linha por atendimento.

## Clube de assinatura

- Plano (`AgendaClubPlan`): nome, preço mensal, serviços que cobre, usos por mês (`null` = ilimitado), ativo. Ex.: "Clube Corte" R$ 89,90, corte + barba, 4 usos.
- Assinatura (`AgendaClubSubscription`): cliente, plano, data de início (âncora do período: `clubPeriodOf`), status `ACTIVE` · `PAST_DUE` · `CANCELED`. Criada pela equipe ou pelo link de assinatura da página pública; a cobrança mensal é uma **recorrência no Financeiro** (cartão ou Pix), e a falta de pagamento põe `PAST_DUE` (não cobre até pagar).
- No agendamento (público ou interno), o cliente que assina (casado por e-mail/telefone) tem a visita coberta pelo `clubCoverage`: preço R$ 0 nos serviços do plano, `paymentKind = CLUB`, um uso por visita; esgotou → preço normal com o aviso "Seus 4 usos do mês acabaram". O uso só conta quando a visita é concluída ou o cliente falta (cancelado não gasta uso).
- Tela do clube: assinantes, usos do mês, inadimplentes, receita recorrente.

## Fidelidade

- `AgendaSettings.loyalty = { everyN, serviceIds }` (ex.: a cada 10 cortes, 1 corte grátis); desligado = `null`.
- Conta as visitas concluídas com algum serviço da lista (resgate não conta) → `loyaltyStatus`. Na conclusão, `redeemLoyalty: true` com prêmio disponível zera o preço do primeiro serviço elegível; sem prêmio → 409 `NO_REWARD`.
- Ficha do cliente e painel mostram o cartão ("7 de 10 · faltam 3").

## Fila do dia (sem hora marcada)

- `POST /v1/agenda/queue { name, phone?, serviceIds, hostId? }` → entra na fila do dia (fuso da empresa); `GET /v1/agenda/queue?date=` → entradas com `position`, `etaMin` e o profissional previsto (`queueEstimate`, a partir de quando cada um fica livre: fim do compromisso atual e dos próximos já marcados).
- **Chamar** (`POST /v1/agenda/queue/:id/call { hostId? }`): cria o agendamento começando agora (`createdVia: WALK_IN`, confirmado e com check-in) com a pessoa livre (ou a escolhida); ocupada → 409 `SLOT_TAKEN` com o horário em que fica livre. **Desistiu** (`/leave`).
- A fila é por empresa e por dia; aparece na Recepção do dia e numa tela para TV (`/agenda/fila/tv`, só nomes abreviados e posição).

## Ficha do cliente

`GET /v1/agenda/clients/:id` → cadastro + `clientSummary` (visitas, faltas, cancelamentos, gasto, último atendimento com quem, profissional preferido, intervalo médio, próximo), fidelidade, clube, convênio, retornos e anotações (`PATCH` com `notes`, `tags`, `birthDate`, `insuranceId`, `insuranceCard`). Aniversário aparece na recepção ("faz aniversário hoje").

## Testes obrigatórios

- Check-in cedo demais 409; concluir sem check-in nem início 409; concluir duas vezes 409; pagamentos que não fecham 422.
- Comissão: regra mais específica, % arredondado, fixo por unidade, clube pela base, resgate sem comissão; mudar a regra não muda o já concluído; fechar o período trava e não deixa fechar de novo.
- Clube: coberto sai por R$ 0 e gasta um uso só ao concluir; esgotado cobra; `PAST_DUE` não cobre; período ancorado no dia do início.
- Fidelidade: 10ª visita libera o prêmio; resgatar sem prêmio 409.
- Fila: posições e previsão; chamar cria o agendamento com check-in; pessoa ocupada 409.
- Concluir antes do fim libera o resto do horário; com o Financeiro, a receita entra recebida; com o ERP, o produto baixa o estoque.
