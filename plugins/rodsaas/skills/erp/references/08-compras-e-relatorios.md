# 08 · Compras e relatórios

## Compras (feature `erp_purchases`)

Fluxo: **Rascunho** → **Enviado** (e-mail ao fornecedor com o PDF) → **Parcial** → **Recebido**; **Cancelado** só sem recebimento.

- **Pedido de compra** (`C-0001`): fornecedor (cadastro único), depósito de entrada, itens (busca + leitor; quantidade, custo unitário — sugerido pelo último custo desse fornecedor), frete, outras despesas, previsão de entrega, condição de pagamento, observações. "Da sugestão de compra" cria o pedido com os itens sugeridos do fornecedor.
- **Receber** (`/erp/compras/[id]/receber`): cada linha com o que falta; ler o código de barras soma 1; quantidade recebida (`validateReceipt`: não passa do que falta — tolerância configurável, padrão 0 → 422 `RECEIPT_RULES` com `OVER_RECEIPT`); frete/despesas **deste** recebimento (padrão: proporcional ao que está sendo recebido do total que falta).
- **Custo de entrada**: `landedUnitCosts(linhas recebidas, extra)` rateia frete e despesas pelo valor de cada linha → movimentação `PURCHASE` com esse custo → `averageCost` atualiza o médio.
- **Situação** pelo `purchaseStatus` (aberto, parcial, recebido); itens recebidos aparecem nas "Etiquetas do recebimento".
- **Contas a pagar** (com o Financeiro): no recebimento, pelo valor recebido (itens + extra), nas parcelas da condição; recebimento parcial gera a conta da parte recebida.
- **Em compras abertas** (`incoming`) entra na sugestão de compra e na posição ("chegando: 20").

## Relatórios (feature `erp_reports`; o Início mostra o resumo sem a feature)

| Relatório | Mostra | Regras |
|---|---|---|
| **Vendas** | por dia/semana/mês, vendedor, cliente, produto, categoria, canal (balcão, pedido, PDV, Comercial): quantidade, faturamento, ticket médio, desconto dado; margem e lucro (quem vê custo) | só `DELIVERED`, menos devoluções do período |
| **Curva ABC** | produtos por faturamento (ou quantidade, ou margem): participação, acumulado, classe A/B/C | `abcCurve`: A até 80% (o item que cruza ainda é A), B até 95%, C o resto |
| **Posição de estoque** | por depósito e categoria: em estoque, reservado, disponível, custo médio, valor | valor só para quem vê custo |
| **Giro e cobertura** | vendido no período, dias de estoque (`daysOfStock`), parados (sem venda há N dias) | sem venda → "parado" |
| **Sugestão de compra** | a lista do `reorderSuggestion` agrupada por fornecedor, com "Criar pedido de compra" | — |
| **Caixas** | sessões: operador, abertura, fechamento, esperado, contado, diferença, por forma | — |

Filtros sempre visíveis (período padrão: mês atual); exportar CSV; gráfico + tabela; clique leva à lista filtrada (pedidos, movimentações).

## Testes obrigatórios

- Compra de 10 un a R$ 10,00 + 2 un a R$ 50,00 com R$ 20,00 de frete: receber tudo → custos de entrada R$ 11,00 e R$ 55,00; com 10 un já em estoque a R$ 12,00 → médio R$ 11,50.
- Receber 6 de 10 → `PARTIAL`; receber 5 dos 4 que faltam → 422 `OVER_RECEIPT`; receber 4 → `RECEIVED`.
- Cancelar compra com recebimento → 409.
- Curva ABC com 4 produtos (70%, 20%, 6%, 4%) → A, A, B, C.
- Com o Financeiro: recebimento gera a conta a pagar do valor recebido.
