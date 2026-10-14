# 07 · PDV (frente de caixa)

Feature `erp_pdv`, limite `erpRegisters`. O PDV é para o **balcão**: rápido, só com teclado e leitor, sem casca, em tela cheia. Não emite documento fiscal na v1 — o comprovante diz "Documento sem valor fiscal" (NFC-e entra com os documentos fiscais).

## Caixa (sessão)

- **Caixas** (`ErpRegister`): terminais com nome e depósito (as vendas baixam desse depósito). Cadastrados pelo `ERP_ADMIN` (Configurações → Caixas).
- **Abrir**: escolher o caixa (o último usado vem marcado) e informar o **fundo de troco** (`openingCents`). Um caixa aberto por terminal **e** por pessoa (409 `SESSION_OPEN` com quem está usando).
- **Suprimento** (entrada de dinheiro) e **sangria** (retirada) com motivo; sangria acima do esperado na gaveta → 422.
- **Fechar** (fechamento **cego**): a pessoa conta o dinheiro (ajuda: campos por cédula/moeda que somam) e informa o total; só então vê o esperado (`cashExpected(abertura, movimentos)`), a diferença e a situação (`closeCash`: OK, faltou, sobrou). Resumo por forma de pagamento (vendas, devoluções, quantidade), impressão do fechamento. Diferença ≠ 0 → aviso `erp.cash.difference` aos `ERP_ADMIN`.
- Caixa aberto há mais de 18 h → aviso (job `erp.sessions.stale`). `ERP_ADMIN` fecha o caixa de outra pessoa (com o contado informado por ele).

## Tela de venda (`/erp/pdv`)

Layout (≥ 1024 px): à esquerda a **lista de itens** (número, nome, quantidade × preço, total, botão remover), grande; à direita o **campo de leitura** em foco permanente, o cliente, o **total grande**, os botões de pagamento e os atalhos visíveis. Abaixo de 768 px: modo compacto (lista em cima, total e botões fixos embaixo; leitura pela câmera com `BarcodeDetector`/`@zxing/browser`).

- **Leitura**: o leitor é um teclado que digita o código e Enter. `parseScan`: "7891000315507" → 1 un; "3*7891000315507" ou "3x…" → 3 un; "1,5*código" → 1,5 (unidade fracionável). `GET /pdv/lookup?code=`: código de barras exato → SKU exato → senão abre a busca por nome com o texto. Não achou → som/brilho de erro e "Produto não encontrado: 789…" (sem modal que tire o foco).
- **Mesmo produto lido de novo** soma na linha existente (configurável: "uma linha por leitura").
- **Produto com grade**: ler a variação direto (código de barras da variação); pelo nome, abre a grade para escolher.
- **Kit**: entra como uma linha; o disponível é o do kit.
- **Disponível**: item sem estoque disponível → aviso na linha e não deixa finalizar (a não ser com estoque negativo ligado).
- **Cliente** (F3): consumidor final por padrão; buscar por CPF/CNPJ/nome/telefone ou cadastro rápido (nome + documento); com cliente, vale a tabela de preço dele.
- **Desconto** (F6): na venda (R$ ou %), com o limite do papel (`maxDiscountPct`; acima, senha/aprovação de um `ERP_ADMIN` no próprio PDV).
- **Cancelar item** (Del na linha selecionada) e **cancelar venda** (Esc duas vezes, com confirmação).

## Pagamento (F9)

- Formas: Dinheiro, Pix, Crédito, Débito, Vale, **Fiado** (`ON_ACCOUNT`, só com cliente e dentro do limite — `creditCheck`).
- **Pagamento misto**: cada forma com o valor; o restante aparece sempre. `settlePayments(total, pagamentos)`: **troco só em dinheiro** (cartão/Pix/vale acima do total → `OVERPAY_NON_CASH`); finaliza quando pago ≥ total.
- Dinheiro: atalhos de cédulas (R$ 50, R$ 100, "valor exato") e o **troco grande** na tela.
- **Finalizar** (F10 ou Enter no pagamento completo): `POST /pdv/sales` com `Idempotency-Key` gerada quando a venda começou (clique duplo ou internet piscando não vendem duas vezes) → pedido `DELIVERED` canal `PDV`, baixa no depósito do caixa, pagamentos, `SALE_CASH` = dinheiro − troco.
- **Comprovante** (80 mm, abre a impressão do navegador ou "não imprimir" lembrado): empresa, data/hora, operador, itens, descontos, total, formas, troco, cliente, "Documento sem valor fiscal". Reimprimir pelo histórico.
- Venda em andamento salva no `localStorage` do terminal (rascunho): recarregar a página não perde os itens (com o aviso "venda recuperada").

## Atalhos

| Tecla | Ação |
|---|---|
| F2 | buscar produto por nome |
| F3 | cliente |
| F4 | mudar a quantidade do último item |
| F6 | desconto |
| F9 | pagamento |
| F10 | finalizar |
| Del | remover o item selecionado |
| Esc | voltar ao campo de leitura (2× cancela a venda, com confirmação) |
| F12 | menu do caixa (suprimento, sangria, reimprimir, fechar) |

Os atalhos aparecem na tela (rodapé) e funcionam com o foco em qualquer lugar do PDV.

## Devolução e cancelamento no PDV

- **Devolução** pelo número da venda ou pelo comprovante: itens e quantidades (`returnPlan`), reembolso em dinheiro sai do caixa aberto (`REFUND_CASH`), crédito do cliente, ou estorno no cartão (registrado; a maquininha é separada).
- **Cancelar venda finalizada** (até o fechamento do caixa): só `ERP_ADMIN`, com motivo; vira devolução total.

## Testes obrigatórios

- Abrir com R$ 100,00 de fundo; abrir outro caixa com a mesma pessoa → 409 `SESSION_OPEN`.
- `lookup` por código de barras e por SKU; código inexistente → 404 `PRODUCT_NOT_FOUND`.
- Venda de 2 × R$ 23,75 com Pix R$ 20,00 + dinheiro R$ 30,00 → troco R$ 2,50, estoque −2, pedido `DELIVERED` canal `PDV`.
- Crédito R$ 50,00 numa venda de R$ 47,50 → 422 `PAYMENT_RULES` (`OVERPAY_NON_CASH`); dinheiro R$ 40,00 → 422 (`UNDERPAID`).
- Mesma `Idempotency-Key` duas vezes → uma venda só.
- Sangria R$ 50,00, suprimento R$ 20,00; fechar contando R$ 0,50 a menos → `SHORT`, `diffCents: -50`; vender com o caixa fechado → 409 `SESSION_CLOSED`/`NO_OPEN_SESSION`.
- Tela: abrir o caixa, ler "2*<código>", pagar em dinheiro com troco, ver o comprovante.
