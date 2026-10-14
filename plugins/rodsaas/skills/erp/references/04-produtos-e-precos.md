# 04 · Produtos e preços

As regras saem do `erp-lib` portado (`api/src/modules/erp/lib/`); o front usa a mesma lib para a prévia ao vivo e o servidor recalcula ao salvar.

## Tipos de produto

| Tipo | O que é | Estoque | Vende |
|---|---|---|---|
| `SIMPLE` | um item com um código (caneta, saco de cimento, 1 kg de café) | próprio | sim |
| `VARIANT` | o **pai da grade** (Camiseta): guarda nome, descrição, fotos, categoria, preço e custo padrão e os atributos | não (mostra a soma das variações) | não (400 `NOT_SELLABLE`) |
| `VARIATION` | cada combinação da grade (Camiseta Azul / P): SKU, código de barras, preço (ou herda) e foto próprios | próprio | sim |
| `KIT` | composição de outros produtos (Kit escritório = 2 canetas + 1 caderno + 0,5 m de fita) com preço próprio | **não**: disponível = `kitAvailable`; a venda baixa os componentes (`explodeKit`) | sim |
| `SERVICE` | mão de obra, frete, instalação | não controla | sim |

O tipo não muda depois de criado (exceto `SIMPLE` → `VARIANT` sem movimento: "Transformar em grade", que cria as variações e arquiva o simples).

## Cadastro (formulário)

Seções, na ordem, com o que está escondido em "Mais opções":

1. **Básico**: tipo (cartões com ícone e uma frase), nome, categoria (com "Nova categoria" inline), marca, unidade (UN, CX, PC, PAR, KG, G, L, ML, M, M2, M3, H; as de peso/medida aceitam fração), descrição curta.
2. **Códigos**: SKU (sugestão a partir do nome: "CAMISETA-BASICA" em maiúsculas sem acento, editável; único) e código de barras (digitar/ler com o leitor ou a câmera do celular; `isValidGtin` na hora com "dígito verificador errado"; **Gerar código interno** usa `internalBarcode` com a sequência da empresa).
3. **Preço**: preço de venda, custo, **margem e markup ao vivo** (`margin`), "Calcular preço pelo markup" (`priceFromMarkup`); tabelas de preço extras (cada uma mostra o preço calculado, com "fixar preço" para o override); **faixas por quantidade** (linhas "A partir de [10] un · R$ [9,00]", `validateTiers` na hora, prévia "1 un R$ 10,00 · 10 un R$ 9,00 (−10%) · 50 un R$ 8,00 (−20%)").
4. **Estoque** (não aparece em serviço, kit e pai da grade): estoque mínimo e máximo; **saldo inicial** por depósito com custo (só no cadastro; vira movimentação `IN` "Saldo inicial").
5. **Grade** (`VARIANT`): atributos (até 3: "Cor", "Tamanho" — sugestões prontas com os valores comuns: P, M, G, GG; 36…44), valores como etiquetas; a tabela das variações aparece embaixo (`variantCombinations`) com SKU sugerido (`variantSku`), código de barras, preço (vazio = do pai) e saldo inicial por variação; "aplicar a todas" no preço e no código interno. Mais de 200 combinações → erro antes de salvar.
6. **Kit**: busca de produtos (só `SIMPLE` e `VARIATION`), quantidade de cada (fração se a unidade aceita), custo do kit calculado (`kitCost`), disponível calculado (`kitAvailable`) e a diferença de preço ("comprando separado sai R$ 34,50; o kit sai R$ 29,90").
7. **Fotos** (uploads; arrastar para ordenar; a primeira é a capa; recorte quadrado).
8. **Fiscal (para a nota futura)**: NCM (8 dígitos), CEST, origem (0–8), unidade tributável — opcional, com a frase "Usado quando a emissão de nota fiscal for ligada".

Salvar → `validateProduct` no servidor (erros no campo pelo `path`). "Salvar e cadastrar outro" mantém tipo, categoria e unidade.

## Mudar a grade

`PATCH` com `attributes` → `diffVariants(chavesAtuais, novos)`:

- **novas** combinações → variações criadas (SKU sugerido, sem saldo);
- **mantidas** → nada muda (SKU, código, preço, saldo e histórico continuam);
- **que saíram** → `status: ARCHIVED` (somem da venda e da busca, continuam nos relatórios e no extrato; com saldo, a tela avisa "Azul / GG sai da grade com 3 un em estoque — faça a saída ou a transferência antes").

Renomear um valor ("Azul" → "Azul royal") é edição do valor: as variações mantêm o id (troca a chave e o label), sem arquivar.

## Preços

- **Tabela padrão** "Varejo" = o preço do produto. Tabelas extras: % sobre o base (`PERCENT`, ex.: Atacado −10%) com preço fixo por produto opcional (`ErpProductPrice`, override). `tablePrice` arredonda ao centavo.
- **Faixas por quantidade** (`ErpPriceTier`): por produto (na variação, valem as do pai). `unitPrice({ basePriceCents, table, overrideCents, tiers, qty })`: começa no preço da tabela; a faixa com o **maior `minQty` ≤ quantidade** vale se for **menor** que o da tabela (quem compra mais nunca paga mais caro).
- **Qual tabela**: a escolhida no pedido → a do cliente → a padrão. O pedido grava `priceSource` (`table` · `tier` · `manual`) em cada linha.
- **Preço digitado**: só `ERP_ADMIN` muda o preço unitário na linha (`manual`); os outros dão desconto (com o limite).
- **Reajuste em lote**: filtro (categoria, marca, tabela), % e arredondamento (para ,90 / ,99 / inteiro) com prévia linha a linha antes de aplicar; registra no histórico de preço.
- **Histórico de preço** por produto (quem, quando, de/para), no detalhe.

## Margem e custo

- Custo do produto = **custo médio** do saldo (depósito padrão) quando há estoque; senão o custo informado. Kit = `kitCost` dos componentes.
- `margin({ priceCents, costCents })` → margem sobre o preço e markup sobre o custo, com 1 casa; cor por faixa (vermelho < 0, amarelo < 15%, verde) **com o número** (cor nunca sozinha).
- Custo, margem e markup só para `ERP_ADMIN`/`STOCK` (a API devolve `null` para os outros; a tela esconde a coluna).

## Importar, exportar e etiquetas

- **Importar CSV** (modelo para baixar): nome, tipo (`SIMPLE` padrão), SKU, código de barras, unidade, preço, custo, categoria, marca, mínimo, saldo inicial, depósito; grade: linhas com o mesmo "SKU do pai" e colunas "Atributo 1"/"Valor 1"… Prévia com as primeiras 20 linhas, mapeamento das colunas, validação (`validateProduct`, `isValidGtin`, SKU repetido no arquivo e no banco), relatório "120 criados, 3 com problema (baixar)". Atualizar existentes pelo SKU (opcional, marcado).
- **Exportar** a lista filtrada em CSV (abre certo no Excel: `;` e BOM).
- **Etiquetas**: escolher produtos e quantidades (ou "do recebimento da compra C-0012") → PDF A4 (3 × 10) ou térmica (40 × 25 mm) com nome, preço e código de barras EAN-13/Code-128.

## Testes obrigatórios

- Simples com EAN válido; EAN com dígito errado 400 no campo `barcode`; SKU repetido 409 `SKU_TAKEN`; código interno começa com 2 e passa no `isValidGtin`.
- Grade Cor (Azul, Preto) × Tamanho (P, M, G) → 6 variações com SKU `CAMISETA-AZUL-P`…; mudar para Cor (Azul, Branco) → 3 criadas, 3 arquivadas, as de Azul mantidas com o mesmo id.
- Kit com componente repetido ou ele mesmo → 400; disponível do kit pelo componente mais escasso.
- Faixas fora de ordem → 400; `GET /price` com 9, 10 e 50 un; tabela atacado −15% vence a faixa de 10 e perde para a de 50.
- `SELLER` lê produto com `costCents: null`.
