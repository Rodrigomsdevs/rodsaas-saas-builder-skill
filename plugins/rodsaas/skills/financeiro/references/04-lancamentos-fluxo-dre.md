# 04 · Lançamentos, baixas, saldos, fluxo de caixa e DRE

Tudo aqui sai do `financeiro-lib` portado (`splitInstallments`, `recurrenceDates`, `entryStatus`, `lateCharges`, `applyPayment`, `accountBalance`, `cashFlow`, `dre`, `aging`, `defaultCategories`, `DRE_GROUPS`).

## Lançamento

- **Tipo** (a receber / a pagar) e **categoria do mesmo tipo** (a tela filtra; a API recusa com `CATEGORY_TYPE_MISMATCH`).
- **Vencimento** (quando paga/recebe) ≠ **competência** (a que mês o resultado pertence: o aluguel de outubro pago em 5/11 é competência outubro). Competência padrão = vencimento; a tela deixa mudar com "Competência diferente do vencimento".
- **Valor** sempre positivo; o tipo dá o sinal. Campo de valor com máscara de moeda que trabalha em centavos (digitar "1234" mostra "R$ 12,34"; nada de `parseFloat`).
- Contato, conta prevista, centro de custo, número do documento, observação, anexos (boleto, nota, comprovante), etiquetas.
- Lançamento vindo de outro app guarda `source` e mostra "Veio do CRM · Negócio Loja Centro" com link.

## Parcelas

`splitInstallments(total, n, primeiroVencimento, { interval })`: a diferença de centavos vai para a **1ª parcela** (100,00 em 3 = 33,34 + 33,33 + 33,33); vencimentos com dia âncora (todo dia 31 → 28/02, 31/03, 30/04…). Todas compartilham `installmentGroup`; descrição "Notebook (2/10)". Editar uma parcela pergunta "Só esta" ou "Esta e as próximas" (`applyTo`). Excluir/cancelar o grupo cancela só as que não têm baixa.

Cartão de crédito da empresa: compra no cartão parcelada gera as parcelas com vencimento na **fatura** (pelo dia de fechamento e vencimento da conta do tipo cartão: compra depois do fechamento vai para a fatura seguinte). A fatura é a soma das parcelas daquele vencimento; pagar a fatura é uma transferência da conta corrente para o cartão.

## Recorrência

`recurrenceDates(regra, janela)`: aluguel todo dia 10, salário todo 5º dia… (v1: dia fixo do mês ou intervalo). A recorrência gera os lançamentos **de verdade** até 12 meses à frente (aparecem no fluxo previsto e podem ser editados um a um); o job diário estende. Mudar o valor da recorrência pergunta se vale para os futuros em aberto. Parar a recorrência cancela os futuros em aberto (os pagos ficam).

## Situação e atraso

`entryStatus` na leitura — nunca um job que marca "vencido": aberto, vencido (dia seguinte ao vencimento), parcial (com `overdue` se passou do vencimento), pago, cancelado, aguardando aprovação.

Vencido mostra os dias de atraso e, na baixa, **sugere** multa e juros (`lateCharges` com `finePct` e `monthlyInterestPct` da configuração: padrão 2% de multa — teto do Código de Defesa do Consumidor para consumidor, art. 52 §1º — e 1% ao mês pro rata). Os campos vêm preenchidos e editáveis; a empresa pode zerar.

## Baixa (pagar / receber)

Formulário: conta (padrão: a prevista; senão a última usada), data (padrão hoje; não pode ser futura), valor (padrão: o que falta), juros, multa, desconto, forma, comprovante. `applyPayment`:

- **valor** = principal pago em dinheiro; **desconto** quita principal sem entrar dinheiro; **juros e multa** entram no caixa e não abatem a dívida;
- valor + desconto > o que falta → 422 `OVERPAYMENT` ("O valor em aberto é R$ 600,00");
- baixa parcial deixa o restante em aberto com a mesma data de vencimento;
- tudo numa transação: `FinPayment` + `paidCents` + `FinEntryEvent`.

**Juros, multa e desconto no resultado**: na DRE, juros e multa **recebidos** entram em "Receitas financeiras", **pagos** em "Despesas financeiras"; desconto concedido em "Deduções", desconto obtido em "Receitas financeiras" (categorias do plano padrão; a baixa grava os valores separados e o relatório agrupa).

**Estorno**: marca `reversedAt` (nunca apaga), recalcula `paidCents`, devolve a transação do extrato a pendente se veio de conciliação; a cobrança paga não é estornada aqui (estorno de Pix/cartão é na Stripe — boleto não tem estorno pela Stripe; a tela explica).

**Ações em massa**: baixar vários de uma vez (mesma conta e data, cada um pelo valor em aberto), mudar categoria, mudar vencimento, cancelar, exportar.

## Aprovação de pagamentos

Despesa (ou o total das parcelas) lançada por `FIN` acima de `paymentApprovalAboveCents` → aguardando aprovação; não pode ser baixada (422 `AWAITING_APPROVAL`) nem cobrada; aviso `fin.approval.requested` para os `FIN_ADMIN`. Aprovar → aberto; recusar (com comentário) → cancelado com o motivo; `fin.approval.decided` para quem lançou. `FIN_ADMIN` nunca precisa de aprovação. Com o **Pessoas** instalado, a empresa pode trocar pelo motor de aprovações dele (fluxo `PAYMENT`, etapa por valor) — mesma regra, mais etapas.

## Contas e transferências

- Saldo da conta = `accountBalance(saldoInicial, movimentos, até)` com as baixas não estornadas e as transferências. **Não existe campo de saldo.**
- Transferência entre contas próprias: sai de uma, entra na outra, mesmo valor e data; não é receita nem despesa (fora do fluxo de entradas/saídas e da DRE); concilia nos dois extratos.
- Conta Stripe (criada ao conectar): recebe as cobranças pagas (líquido = bruto − tarifa); o repasse para o banco (`payout.paid`) vira transferência Stripe → conta bancária escolhida.
- Saldo projetado = saldo de hoje + previstos em aberto dos próximos 30 dias daquela conta.
- Conta arquivada some das listas de escolha; o histórico fica.

## Fluxo de caixa

`cashFlow`: saldo inicial (todas as contas, ou a filtrada) + o realizado antes do período; por **mês** (padrão: 12 meses a partir do mês atual − 2) ou **dia** (30/60/90 dias): entradas e saídas **realizadas** (baixas pela data da baixa), **previstas** (em aberto pelo vencimento; **vencidos entram em hoje**, destacados "inclui R$ X vencidos"), resultado e saldo acumulado. Transferências ficam fora das entradas/saídas. Clique num valor abre a lista dos lançamentos que o compõem. Saldo projetado negativo pinta o período de vermelho com o aviso "Saldo previsto negativo em 12/11".

## DRE gerencial

`dre` sobre os lançamentos não cancelados pela **competência** (padrão; regime de competência) ou sobre as baixas pela data (regime de caixa):

```
Receita bruta
(−) Deduções e impostos sobre vendas
= Receita líquida
(−) Custos (CMV/CSP)
= Lucro bruto                         margem bruta
(−) Despesas operacionais
= Resultado operacional               margem operacional
(+/−) Resultado financeiro (receitas − despesas financeiras)
(+/−) Outras receitas e despesas
= Resultado antes do IR
(−) IRPJ e CSLL
= Lucro líquido                       margem líquida
```

Mês a mês (colunas) e acumulado; clique numa linha abre as categorias, e numa categoria os lançamentos. Grupo `NAO_OPERACIONAL` (aportes, empréstimos, retiradas de sócios) aparece **abaixo**, fora do resultado, em "Movimentações fora do resultado". A tela diz: "DRE gerencial para decisão; a DRE oficial é a da contabilidade".

## Relatórios

- **Inadimplência** (`aging`): a receber em aberto por faixa (a vencer, 1–30, 31–60, 61–90, 90+), por cliente (maior atraso primeiro), com "Cobrar" direto.
- Contas a pagar e a receber por período; por categoria e por centro de custo (com % do total); por contato.
- Exportação para a contabilidade: lançamentos (com o código e o grupo da categoria), baixas e transferências do mês, CSV com `;` e decimal com vírgula (`centsToDecimal`), documento formatado; envio por e-mail ao contador.

## Testes obrigatórios

- Lib portada com todos os testes do `financeiro-lib.test.mjs`.
- API: os cenários de `03-api.md` → "Testes obrigatórios", seções Lançamentos, Baixa, Aprovação, Fluxo e DRE, com valores exatos.
- Σ baixas = `paidCents` em todo teste que baixa ou estorna.
