# 05 · Estoque

## Livro de movimentações

Toda mudança de estoque é uma `ErpStockMovement` (imutável) feita pelo **serviço de estoque**, o único que grava `ErpStockBalance`:

```ts
stockService.move(tx, orgId, [{ productId, warehouseId, qty /* ± */, type, unitCostCents?, refType, refId, reason }], { actorId, allowNegative })
  // 1. trava os saldos envolvidos: SELECT … FOR UPDATE (ordem por productId, warehouseId)
  // 2. saída: canTakeOut({ availableQty: onHand − reserved, qty, allowNegative }) → senão INSUFFICIENT_STOCK com a lista
  // 3. entrada com custo: avgCostCents = averageCost({ qty: onHand, avgCostCents }, { inQty, unitCostCents })
  // 4. grava a movimentação com balanceAfter/avgCostAfter e atualiza o saldo
stockService.reserve(tx, …, ±qty) / release(…)          // só mexe em reserved (pedido confirmado/cancelado)
```

| Tipo | Origem | Sinal | Custo |
|---|---|---|---|
| `IN` | entrada manual (saldo inicial, doação, achado) | + | informado (atualiza o médio) ou o médio atual |
| `OUT` | saída manual (perda, consumo, brinde) com motivo obrigatório | − | médio atual |
| `ADJUST` | correção manual com motivo | ± | — |
| `TRANSFER_OUT` / `TRANSFER_IN` | transferência entre depósitos (mesma transação) | − / + | o médio da origem entra no destino |
| `SALE` | pedido entregue, venda do PDV | − | médio (gravado na linha do pedido) |
| `RETURN` | devolução de cliente | + | o custo gravado na linha vendida |
| `PURCHASE` | recebimento de compra | + | `landedUnitCosts` (com frete rateado) |
| `INVENTORY` | aplicar inventário | ± | — |

- **Estoque negativo**: desligado por padrão (`allowNegativeStock`); ligado, a saída passa e a tela mostra o saldo em vermelho com "negativo".
- **Kit, serviço e pai da grade** não têm movimentação (400 `NOT_STOCKABLE`); o kit sai pelos componentes (`explodeKit`).
- Quantidade inteira nas unidades inteiras (`isQty(q, { fractional: false })`), até 3 casas nas fracionáveis; somas com `roundQty`.

## Disponível e reserva

- `onHand` (em estoque) − `reserved` (pedidos `CONFIRMED`/`PICKING` ainda não entregues) = **disponível** (`available`). Venda, PDV e confirmação olham o **disponível**.
- Confirmar pedido reserva cada linha (kit: reserva os componentes); cancelar ou voltar a orçamento libera; entregar tira da reserva e baixa (`SALE`).
- Kit: `kitAvailable(componentes, disponívelDe)` — o menor `floor(disponível / quantidade)`.

## Custo médio

- `averageCost`: saldo ≤ 0 → o custo da entrada; senão média ponderada arredondada ao centavo. Saída não muda o médio.
- Por **produto e depósito** (`ErpStockBalance.avgCostCents`); transferência leva o médio da origem para o destino (o destino recalcula como entrada).
- O custo de cada linha vendida é gravado na entrega (`ErpOrderLine.costCents`) — a margem da venda não muda quando o médio muda depois.

## Transferência

Escolher origem, destino e itens (busca + leitor); quantidade ≤ disponível na origem; as duas movimentações na mesma transação (`TRANSFER_OUT` + `TRANSFER_IN`, mesmo `refId`). Comprovante para imprimir (lista de separação).

## Inventário

1. **Abrir** num depósito (`OPEN`): a tela lista os produtos do depósito (filtro por categoria) com o campo de contagem; ler o código de barras soma 1 (ou a quantidade de "3*código"); várias pessoas contam ao mesmo tempo (as contagens somam por produto; "substituir" quando reconta).
2. **Conferir**: `inventoryAdjustments(contagens, saldo atual)` mostra só o que difere (esperado, contado, diferença e o valor da diferença pelo custo médio para quem vê custo). Produtos não contados ficam como estão (opção "zerar os não contados" com confirmação).
3. **Aplicar** (`ERP_ADMIN`/`STOCK`): uma movimentação `INVENTORY` por diferença, na mesma transação; o inventário fica `APPLIED` com o relatório. Vendas durante a contagem continuam (o ajuste é calculado na hora de aplicar).

## Mínimo, máximo e sugestão de compra

- Estoque mínimo/máximo por produto (variação herda do pai se vazio).
- **Estoque baixo** = disponível ≤ mínimo: selo na lista, filtro `lowStock=1`, widget no Início, aviso diário `erp.stock.low` (só os que **cruzaram** o mínimo desde ontem, num resumo por empresa).
- **Sugestão de compra** (`reorderSuggestion`): abaixo do mínimo → completar até o máximo (ou o mínimo) descontando o reservado e somando o que já está em compras abertas; mostra o último custo e o último fornecedor; "Criar pedido de compra" agrupa por fornecedor.

## Telas

- **Posição** (`/erp/estoque`): por depósito (ou todos), colunas produto, SKU, em estoque, reservado, disponível, mínimo, custo médio e valor (quem vê custo), selo de baixo/negativo; total valorizado no rodapé; ações em massa: entrada, saída, transferência, etiquetas.
- **Movimentações**: lista com filtros (tipo, produto, depósito, período, pessoa) e o documento de origem com link.
- **Extrato do produto** (no detalhe): cada movimentação com saldo depois, custo médio depois, origem.
- **Entrada/saída/ajuste** (diálogo): produto (busca + leitor), depósito, quantidade, custo (entrada), motivo (obrigatório na saída e no ajuste).

## Testes obrigatórios

- Entrada 10 un a R$ 10,00 + 30 un a R$ 12,00 → médio R$ 11,50; saída de 41 com 40 em estoque → 409 `INSUFFICIENT_STOCK` com `missing: 1`.
- Pedido confirmado de 5 → disponível cai 5, em estoque não; cancelar volta.
- Transferência de 5 do Principal para a Loja → saldos certos nos dois; acima do disponível 409.
- Inventário: contado 8 com 10 esperados → ajuste −2; aplicar de novo → 409 (`APPLIED`).
- Kit de 2 canetas + 1 caderno com 9 canetas → 4 disponíveis; vender 2 kits baixa 4 canetas e 2 cadernos.
- Movimentação manual de serviço ou kit → 400 `NOT_STOCKABLE`.
