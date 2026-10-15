# 12 · Perfis de segmento (mercado/padaria, loja de roupa, material de construção, distribuidora)

O ERP é **um só**; o perfil decide o que já vem ligado, as palavras e alguns campos do cadastro. Recurso que serve a mais de um segmento fica no núcleo (`11`).

## Onde fica

- `ErpSettings.segment` (`GENERAL` · `MARKET` · `APPAREL` · `BUILDING` · `WHOLESALE`), escolhido no onboarding da workstation (comércio → pergunta entre mercado, loja de roupa e material de construção; indústria/distribuidora → `WHOLESALE`) ou na primeira abertura do ERP. Muda em Configurações → Perfil.
- ★ `PATCH /v1/erp/settings { segment }` (`ERP_ADMIN`) aplica o perfil (`erpSegment(id).on`): liga as opções do perfil (sem desligar nada que já está ligado) e devolve **`{ ...settings, segment, words, on }`**; ★ `GET /v1/erp/settings` também devolve `segment`, `words` e `on`. Trocar não apaga nada.

## O que cada perfil liga

| Perfil | Liga | O que muda |
|---|---|---|
| `GENERAL` | — | — |
| `MARKET` (mercado, padaria, hortifrúti) | balança, lote e validade, promoções, produção, NFC-e no PDV | **etiqueta de balança** no PDV (abaixo), produto por KG com `scaleCode`, promoção por dia da semana, produção diária da padaria, relatório "vencendo" na tela inicial |
| `APPAREL` (roupa, calçado, acessórios) | grade, vale-troca, promoções, comissão, carnê | grade cor × tamanho em destaque no cadastro, troca e vale-troca no PDV, "leve 3 pague 2", comissão por vendedora, carnê do crediário |
| `BUILDING` (material de construção) | unidade de venda, carnê, comissão, entrega | **unidade de venda** diferente da de estoque (abaixo), quantidades fracionadas (m, m², kg), orçamento com validade maior (15 dias), entrega agendada no pedido |
| `WHOLESALE` (distribuidora, atacado) | tabelas de preço, múltiplo de venda, pedido mínimo, comissão, lote | **múltiplo de venda** e **pedido mínimo** (abaixo), tabela de preço por cliente, faixas por quantidade, comissão por vendedor externo; vocabulário "pedido" |

## Balança (mercado)

- Produto com **`scaleCode`** (6 dígitos, o código cadastrado na balança) e unidade KG.
- ★ `GET /v1/erp/pdv/lookup?code=` reconhece a etiqueta (`parseScaleBarcode`, `scaleMode` PRICE ou WEIGHT): devolve o produto e **`scale: { priceCents?, weightKg?, qty }`** — `qty` em kg (pelo peso, ou preço ÷ preço do kg, 3 casas); o PDV lança a linha com essa quantidade.
- Etiqueta com dígito errado ou produto sem `scaleCode` → 404 `PRODUCT_NOT_FOUND`.

## Unidade de venda (material de construção)

- Produto com **`saleUnit: { unit, factor }`** (caixa de piso = 2,5 m²; saco de cimento = 50 kg): o item do pedido/PDV aceita **`unit`**; quando é a unidade de venda, a quantidade do estoque é `toStockQty(qty, factor)` e o preço é o do estoque × essa quantidade. A linha mostra os dois ("2 CX = 5 m²") e guarda `saleUnit`/`saleQty`.

## Múltiplo de venda e pedido mínimo (distribuidora)

- Produto com **`saleMultiple`** (caixa com 12): quantidade fora do múltiplo → 400 em `items.N.qty` com `code: "QTY_MULTIPLE"` (`isMultipleOf`).
- `minimumOrderCents` nas configurações: pedido (não PDV) com o líquido dos itens abaixo → 422 `MIN_ORDER_VALUE` com `minimumCents` (`meetsMinimumOrder`); o vendedor vê quanto falta.

## Testids

| testid | Onde |
|---|---|
| `erp-segment` | Configurações → Perfil |
| `erp-commission-row` (`data-seller`) | Comissões |
| `erp-lot-row` (`data-expired`), `erp-expiring-row` | produto → Lotes; relatório Vencendo |
| `pdv-voucher-code`, `pdv-pay-voucher`, `pdv-receive` | PDV |

## Testes obrigatórios

- Aplicar cada perfil liga o que ele pede sem desligar nada; palavras do perfil.
- Balança: etiqueta por preço e por peso viram a quantidade certa; dígito errado não acha.
- Unidade de venda: 2 caixas viram 5 m² no estoque e no preço.
- Múltiplo e pedido mínimo recusados com o código certo.
