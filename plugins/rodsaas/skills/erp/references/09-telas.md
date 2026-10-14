# 09 · Telas

Tudo em `web/src/features/erp/` (rotas em `app/(app)/erp/...`; o PDV em `app/(pdv)/erp/pdv`, **sem casca**, tela cheia), com os componentes da base (tabelas, diálogos, `LoadingButton`, estados vazios, skeletons, toasts) e o menu do app (`01-escopo-e-papeis.md`). Dinheiro com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` a partir dos centavos; **campo de moeda em centavos** (digitar "2590" → R$ 25,90; colar "25,90" funciona; nunca `parseFloat`); quantidade aceita vírgula ("1,5") e respeita a unidade (inteira em UN). Custo, margem e valor do estoque só aparecem para quem vê custo (a coluna some, não fica vazia).

## Rotas

| Rota | Tela |
|---|---|
| ★ `/erp` | **Início**: vendas de hoje e do mês (total, quantidade, ticket médio, comparação com o mês passado), orçamentos abertos e vencendo, pedidos a separar, estoque baixo (top 5 com "Ver todos"), caixas abertos, atalhos (Nova venda, PDV, Novo produto, Entrada de estoque) |
| ★ `/erp/produtos` · ★ `/erp/produtos/novo` · ★ `/erp/produtos/[id]` | lista (filtros: tipo, categoria, marca, situação, estoque baixo; busca por nome/SKU/código com o leitor; colunas: foto, nome, SKU, preço, custo e margem para quem vê, disponível, situação; grade expande as variações); cadastro (`04`); detalhe com abas Dados · Preços · Estoque (por depósito) · Movimentações · Vendas |
| ★ `/erp/estoque` · `/erp/estoque/movimentacoes` · `/erp/estoque/transferencias` · ★ `/erp/estoque/inventarios/[id]` | posição, movimentações, transferências, inventário (`05`) |
| ★ `/erp/clientes` · `/erp/clientes/[id]` | clientes e fornecedores (abas), cadastro e histórico (`06`) |
| ★ `/erp/vendas` · ★ `/erp/vendas/nova` · ★ `/erp/vendas/[id]` | lista com abas Orçamentos · Pedidos · A separar · Entregues · Todos; novo orçamento/pedido; detalhe com linha do tempo, ações e devoluções (`06`) |
| ★ `/erp/pdv` | frente de caixa (`07`) |
| ★ `/erp/compras` · `/erp/compras/[id]` · `/erp/compras/[id]/receber` | compras e recebimento (`08`) |
| ★ `/erp/relatorios` | relatórios (`08`) |
| ★ `/erp/configuracoes` | geral (estoque negativo, desconto máximo, validade do orçamento, depósito e tabela padrão), depósitos, tabelas de preço, caixas, categorias, comprovante, papéis |

## Produto (formulário)

Página (tela cheia no celular). Tipo por cartões (`erp-product-type`, um `<select>` ou grupo de rádio com `data-value`); nome (`erp-product-name`), unidade (`erp-product-unit`), SKU (`erp-product-sku`), código de barras (`erp-product-barcode`, com **Gerar código interno** `erp-product-barcode-generate`), preço (`erp-product-price`), custo (`erp-product-cost`), **margem ao vivo** (`erp-product-margin`), saldo inicial (`erp-product-initial-stock`), mínimo (`erp-product-min`); grade: atributo (`erp-variant-attr-name`), valores (`erp-variant-attr-values`, etiquetas), tabela das variações (`erp-variant-row`, `data-key`); kit: componentes (`erp-kit-component`, `data-product`); faixas (`erp-tier-row`). Erros do servidor no campo (`erp-field-error`, `data-path`). **Salvar** (`erp-product-save`).

## Lista de produtos

Linha (`erp-product-row`, `data-id`, `data-type`): foto, nome (+ "6 variações"), SKU, preço, custo/margem (quem vê), disponível (`erp-product-stock`, vermelho com "baixo"/"negativo" escrito), situação. Vazio: "Cadastre seu primeiro produto" com **Novo produto** e **Importar planilha**. "+ Produto" (`erp-product-new`).

## Venda (orçamento e pedido)

Cliente (`erp-order-customer`), busca de itens / leitor (`erp-order-item-search`), linhas (`erp-order-line`, `data-product`) com quantidade (`erp-order-line-qty`), preço (com selo "faixa 10+") e desconto; desconto geral, frete, total (`erp-order-total`, `data-cents`); pagamento; **Salvar orçamento** (`erp-order-save-quote`), **Confirmar pedido** (`erp-order-confirm`). Erros de estoque listados com o produto (`erp-order-error`, `data-code`). Lista: `erp-order-row` (`data-id`, `data-status`); detalhe: `erp-order-status` (`data-status`), **Separar** (`erp-order-pick`), **Entregar** (`erp-order-deliver`), **Cancelar** (`erp-order-cancel`), **Devolver** (`erp-order-return`).

## PDV

Tela cheia sem casca, fundo neutro, fonte grande; foco sempre no campo de leitura; mobile em modo compacto.

- Sem caixa aberto: abertura (`pdv-open-form`) com o caixa (`pdv-register`, `<select>`), fundo de troco (`pdv-opening`, moeda) e **Abrir caixa** (`pdv-open-submit`).
- Venda (`pdv-page`): leitura (`pdv-scan`, `autofocus`, Enter adiciona), linhas (`pdv-line`, `data-product`, com `pdv-line-qty`), cliente (`pdv-customer`), total (`pdv-total`, `data-cents`), erro de leitura ou de estoque (`pdv-error`, `data-code`), **Pagamento** (`pdv-pay`, F9).
- Pagamento: formas (`pdv-payment-method`, `data-method`), valor (`pdv-payment-amount`, moeda, já com o restante), adicionar (`pdv-payment-add`), restante (`pdv-remaining`, `data-cents`), **troco** grande (`pdv-change`, `data-cents`), **Finalizar** (`pdv-finish`, F10).
- Depois de finalizar: comprovante (`pdv-receipt`) com imprimir e **Nova venda** (`pdv-new-sale`, Enter).
- Menu do caixa (`pdv-menu`, F12): suprimento, sangria, reimprimir, **Fechar caixa** (`pdv-close`): contado (`pdv-close-counted`), confirmar (`pdv-close-confirm`) e o resultado (`pdv-close-result`, `data-status`: `OK` · `SHORT` · `OVER`) com a diferença.

## Estados e interações

- Carregando: skeleton com o formato; erro: `error-state` com tentar de novo; vazio que ensina.
- Toda ação com `LoadingButton` e toast; "Desfazer" quando dá (cancelar orçamento → reabrir).
- Ações que mexem em estoque ou dinheiro (entregar, cancelar pedido confirmado, aplicar inventário, fechar caixa) com confirmação dizendo o efeito ("baixa 12 itens do Principal").
- Plano: recurso Pro com selo e "Conheça" (owner) ou "Fale com o responsável".
- Atalhos fora do PDV: `N` nova venda, `/` busca, `P` novo produto.
- Celular sem rolagem lateral em todas as rotas; tabelas viram cartões abaixo de 640 px; o leitor pela câmera aparece no celular (busca de produto, venda, inventário, recebimento).

## Contrato testável (testids)

| Testid | Onde |
|---|---|
| `erp-home`, `erp-sales-today`, `erp-low-stock`, `erp-to-pick` | Início |
| `erp-product-new`, `erp-product-row` (`data-id`, `data-type`), `erp-product-stock` | Lista de produtos |
| `erp-product-form`, `erp-product-type`, `erp-product-name`, `erp-product-unit`, `erp-product-sku`, `erp-product-barcode`, `erp-product-barcode-generate`, `erp-product-price`, `erp-product-cost`, `erp-product-margin`, `erp-product-initial-stock`, `erp-product-min`, `erp-variant-attr-name`, `erp-variant-attr-values`, `erp-variant-row` (`data-key`), `erp-kit-component` (`data-product`), `erp-tier-row`, `erp-field-error` (`data-path`), `erp-product-save` | Formulário de produto |
| `erp-stock-row` (`data-product`, `data-warehouse`), `erp-stock-available`, `erp-move-new` | Estoque |
| `erp-party-new`, `erp-party-row` (`data-id`) | Clientes e fornecedores |
| `erp-order-new`, `erp-order-row` (`data-id`, `data-status`), `erp-order-customer`, `erp-order-item-search`, `erp-order-line` (`data-product`), `erp-order-line-qty`, `erp-order-total` (`data-cents`), `erp-order-error` (`data-code`), `erp-order-save-quote`, `erp-order-confirm`, `erp-order-status` (`data-status`), `erp-order-pick`, `erp-order-deliver`, `erp-order-cancel`, `erp-order-return` | Vendas |
| `pdv-open-form`, `pdv-register`, `pdv-opening`, `pdv-open-submit`, `pdv-page`, `pdv-scan`, `pdv-line` (`data-product`), `pdv-line-qty`, `pdv-customer`, `pdv-total` (`data-cents`), `pdv-error` (`data-code`), `pdv-pay`, `pdv-payment-method` (`data-method`), `pdv-payment-amount`, `pdv-payment-add`, `pdv-remaining` (`data-cents`), `pdv-change` (`data-cents`), `pdv-finish`, `pdv-receipt`, `pdv-new-sale`, `pdv-menu`, `pdv-close`, `pdv-close-counted`, `pdv-close-confirm`, `pdv-close-result` (`data-status`) | PDV |
| `erp-purchase-new`, `erp-purchase-row` (`data-id`, `data-status`), `erp-purchase-receive`, `erp-receive-qty` (`data-line`), `erp-receive-confirm` | Compras |
| `erp-report-abc`, `erp-abc-row` (`data-class`) | Relatórios |

Os rótulos visíveis são livres (português claro); os testids e as rotas ★ não mudam.
