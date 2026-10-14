# 06 · Clientes, orçamentos e vendas

## Clientes e fornecedores (cadastro único)

- `ErpParty` com `kinds` (`CUSTOMER`, `SUPPLIER` ou os dois). PF/PJ pelo documento (`documentType`); sem documento = PF ("consumidor").
- Documento só dígitos, único por empresa (409 `DOCUMENT_TAKEN` com o link para o cadastro existente).
- **CEP** preenche o endereço (ViaCEP ou BrasilAPI pelo backend, com cache; falhou → digita).
- **Um cadastro só com os outros apps**: ao salvar, procura pelo documento o contato do Financeiro (`FinContact`) e do CRM (contato/empresa) e liga (`finContactId`, `crmContactId`); não existindo, cria no Financeiro quando a primeira conta a receber/pagar nascer. Editar nome/e-mail/telefone aqui atualiza o do Financeiro (o CRM mantém o dele; o detalhe mostra o link).
- **Cliente**: tabela de preço, limite de crédito, condição de pagamento padrão (à vista, 30/60/90…), observação que aparece no pedido e no PDV ("só vende à vista").
- **Histórico**: vendas (com total do ano), devoluções, em aberto no Financeiro (a prazo e fiado), última compra; **fornecedor**: compras, produtos fornecidos com o último custo.
- Busca por nome, fantasia, documento (com ou sem máscara), telefone, e-mail.

## Fluxo do pedido

```
QUOTE (orçamento) ──confirm──► CONFIRMED (reserva) ──pick──► PICKING (separando) ──deliver──► DELIVERED (baixa)
     │  validUntil < hoje → EXPIRED (quoteStatus; renovar = PATCH validUntil)        │                    │
     └──cancel──► CANCELED ◄──cancel── CONFIRMED / PICKING (libera a reserva)      └──deliver──────────┘
CONFIRMED ──back to quote──► QUOTE (libera; para editar)        DELIVERED ──returns──► devolução (parcial ou total)
```

- Transições pelo `canTransition` (409 `INVALID_TRANSITION` `{ from, to }`); venda do PDV nasce `DELIVERED`; proposta aceita do Comercial nasce `CONFIRMED` (canal `COMERCIAL`).
- Número `V-0001` compartilhado por orçamento e pedido (o orçamento confirmado mantém o número).

## Orçamento e pedido (tela)

Página `/erp/vendas/nova` (ou diálogo grande):

1. **Cliente**: busca (nome, documento, telefone) com "Novo cliente" inline; consumidor final permitido em orçamento e venda à vista. Ao escolher: tabela de preço e condição do cliente vêm junto; observação do cliente em destaque; limite de crédito disponível visível quando a forma é a prazo.
2. **Itens**: busca por nome/SKU/código ou **leitor de código de barras** (Enter adiciona; "3*código" adiciona 3); produto com grade abre a escolha da variação (grade em tabela: cor × tamanho com o disponível de cada); quantidade (fração conforme a unidade), preço (do `GET /price` — mostra "faixa 10+" quando é faixa), desconto do item (% ou R$), total da linha; disponível ao lado da quantidade com aviso "só 3 disponíveis" (não bloqueia o orçamento; bloqueia confirmar).
3. **Desconto geral** (% ou R$, rateado pelas linhas — `orderTotals`), **frete**, totais sempre visíveis (subtotal, descontos, frete, total).
4. **Pagamento**: forma (dinheiro, Pix, cartão, boleto, a prazo, fiado), parcelas (`installments`, 1–24, a cada 30 dias por padrão), 1º vencimento; o cronograma aparece.
5. **Validade** do orçamento (padrão `quoteValidityDays`), observações (saem no PDF), observação interna.
6. Botões: **Salvar orçamento**, **Confirmar pedido** (reserva), **Imprimir/PDF**, **Enviar por e-mail**.

Vendedor: quem criou (`SELLER`); `ERP_ADMIN` escolhe. Desconto efetivo do `SELLER` acima de `maxDiscountPct` → 422 `DISCOUNT_ABOVE_LIMIT` com a faixa "acima do seu limite de 10%: peça a um administrador".

## Confirmar, separar, entregar

- **Confirmar**: orçamento vencido → 409 `QUOTE_EXPIRED`; a prazo/fiado → `creditCheck({ limitCents, openCents, orderCents })` (422 `CREDIT_LIMIT` com o disponível); estoque disponível de cada linha (kit pelos componentes) → 409 `INSUFFICIENT_STOCK` listando produto, pedido e disponível; tudo ok → reserva (uma transação).
- **Separar** (`PICKING`): lista de separação para imprimir (por localização/categoria) e a tela "A separar" para o estoque, com conferência por leitor (cada leitura marca o item; quantidade conferida ≠ pedida avisa).
- **Entregar** (`DELIVERED`): baixa (`SALE`; kit pelos componentes), tira a reserva, grava o custo de cada linha, gera as **contas a receber** no Financeiro (uma por parcela do cronograma, com o cliente; à vista já baixada na conta escolhida) e avisa o vendedor (`erp.order.delivered`, opcional).
- **Cancelar**: motivo obrigatório; libera a reserva; entregue não cancela (é devolução).

## Devolução

`POST /orders/:id/returns` (só `DELIVERED`):

- Escolher itens e quantidades (até o que foi vendido menos o já devolvido — `returnPlan`; 422 `RETURN_RULES` com `RETURN_QTY_EXCEEDED`).
- Valor devolvido proporcional ao líquido da linha (já com o desconto geral rateado).
- Estoque volta (`RETURN`, com o custo gravado na venda; produto com defeito → opção "não volta ao estoque", vai para o depósito "Avarias" se existir ou não entra).
- Reembolso: **dinheiro** (no PDV: `REFUND_CASH` do caixa aberto), **crédito** do cliente (lançamento no Financeiro a abater) ou **forma original** (estorno da conta a receber em aberto, ou despesa de devolução).
- Número `D-0001`, comprovante para imprimir.

## Integração com o Comercial

- Itens da proposta escolhidos dos produtos do ERP (busca com preço da tabela do cliente).
- **Proposta aceita** → pedido `CONFIRMED` (canal `COMERCIAL`, `sourceRef: { type: "COMERCIAL", proposalId }`) com os itens/opcionais aceitos e o plano de pagamento; sem estoque suficiente, o pedido nasce `QUOTE` com o aviso "estoque insuficiente para confirmar" para o vendedor (a proposta aceita não volta atrás).
- Contas a receber: quem cria é a **entrega** do pedido (com o ERP instalado, a integração do Comercial com o Financeiro passa a ser feita pelo ERP, sem duplicar).

## Testes obrigatórios

- Pedido com 3 un a R$ 10,00 com 10% + 1,5 un a R$ 3,33 com R$ 1,00 + desconto geral R$ 1,01 + frete R$ 15,00 → totais do `orderTotals` e rateio somando exato.
- Confirmar reserva; cancelar libera; entregar baixa e não muda o reservado de outros pedidos.
- Orçamento vencido → 409 `QUOTE_EXPIRED`; `PATCH` em pedido confirmado → 409.
- Cliente com limite R$ 1.000,00 e R$ 700,00 em aberto: pedido a prazo de R$ 300,01 → 422 `CREDIT_LIMIT`; à vista passa.
- Vendedor com 15% de desconto → 422 `DISCOUNT_ABOVE_LIMIT`; admin passa.
- Devolução de 2 de 3 → estoque +2, valor proporcional; devolver mais 2 → 422.
- Com o Financeiro: entregar em 3 parcelas → 3 contas a receber com o centavo na 1ª.
