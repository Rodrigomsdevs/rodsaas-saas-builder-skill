---
name: erp
description: Preset que soma ao projeto rodsaas o app ERP, um ERP simples no estilo Bling/Tiny/Omie para pequenas empresas — produtos simples, com grade de variações (cor × tamanho), kits e serviços, código de barras EAN e código interno, tabelas de preço (varejo/atacado) e faixas por quantidade, margem; estoque por depósito com movimentações, reservado × disponível, custo médio, transferências, inventário e estoque mínimo; clientes e fornecedores com CPF/CNPJ e limite de crédito; orçamentos que viram pedido, separação, entrega, devolução; PDV de balcão com leitor de código, pagamento misto com troco e caixa (abertura, sangria, fechamento); compras com recebimento parcial e frete no custo; curva ABC e sugestão de compra; integra com Financeiro, Comercial e CRM; NF-e e NFC-e pelo motor fiscal, comissão de vendedor, lote e validade, promoções, troca e vale-troca, carnê do fiado e ordem de produção simples; perfis de mercado/padaria (balança), loja de roupa, material de construção (unidade de venda) e distribuidora (múltiplo e pedido mínimo). Use depois do /rodsaas:backend e /rodsaas:frontend quando o usuário pedir ERP, produtos, estoque, vendas, orçamento, PDV, frente de caixa, compras, comissão, validade, promoção, carnê, produção, ou chamar /rodsaas:erp.
---

# rodsaas · erp (app ERP)

Acrescenta ao projeto o app **ERP**: o dia a dia da empresa que vende mercadoria. Cadastra o produto uma vez (com grade, kit ou preço por quantidade), sabe quanto tem em cada depósito e quanto já está prometido, faz o orçamento que vira pedido com um clique, vende no balcão pelo **PDV** com o leitor de código de barras e fecha o caixa no fim do dia, compra do fornecedor e dá entrada com o custo certo. O preset **soma**: entra como um app na casca de apps (`skills/frontend/references/12-casca-e-apps.md`), sem mexer nos outros apps.

| # | Área | O que resolve |
|---|---|---|
| 1 | **Produtos e preços** | produto simples, **com variações** (grade de até 3 atributos, cada variação com SKU, código de barras, preço e estoque próprios), **kit** (composição, sem estoque próprio), serviço; EAN-8/13 validado e código interno gerado; unidades inteiras e fracionadas (kg, m, L); **tabelas de preço** (varejo, atacado: fixo ou % sobre o base) e **faixas por quantidade** (10+, 50+); custo, margem e markup; fotos, categoria, marca, campos fiscais guardados para a nota futura; importar e exportar CSV; etiquetas |
| 2 | **Estoque** | depósitos, movimentações imutáveis (entrada, saída, ajuste, transferência, venda, devolução, compra, inventário), saldo **em estoque × reservado × disponível**, sem estoque negativo (configurável), **custo médio ponderado**, kit disponível pelo componente mais escasso, inventário com contagem, estoque mínimo e máximo com aviso e **sugestão de compra**, histórico por produto |
| 3 | **Clientes e fornecedores** | cadastro único com CPF/CNPJ validado, endereço por CEP, tabela de preço do cliente, **limite de crédito**, histórico de compras; o mesmo cadastro do Financeiro e do CRM (pelo documento) |
| 4 | **Orçamentos e vendas** | orçamento com validade que vira pedido com um clique; pedido com preço da tabela/faixa, desconto por item e geral (rateado), frete, condição de pagamento (à vista, parcelado), **reserva do estoque** ao confirmar, separação, entrega com baixa, cancelamento, **devolução** parcial; impressão; vendedor com limite de desconto |
| 5 | **PDV** | frente de caixa de balcão em tela cheia, **leitor de código de barras** ("3*7891…" para quantidade), busca por nome/código, consumidor final ou cliente, desconto (com limite), **pagamento misto** (dinheiro, Pix, crédito, débito, vale, fiado) com **troco só em dinheiro**, comprovante não fiscal; **caixa** com abertura, suprimento, sangria e fechamento com diferença; atalhos de teclado |
| 6 | **Compras** | pedido de compra ao fornecedor, **recebimento parcial**, frete e despesas **rateados no custo**, custo médio atualizado, contas a pagar no Financeiro |
| 7 | **Relatórios** | vendas por período, vendedor, cliente e produto; **curva ABC**; posição de estoque valorizada; giro e dias de estoque; parados; sugestão de compra; resumo de caixas |

Tudo da base continua valendo: auth, empresas com RLS, membros, acessos da pessoa no convite, planos (ou a workstation), padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca, contrato de testids.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json` verdes e já na casca de apps (existe `web/src/config/apps.ts`; senão, `/rodsaas:apps` antes).
2. Acessos da pessoa da base (`skills/backend/references/10-acessos-por-pessoa.md`): o ERP registra os papéis dele no convite. Projeto anterior: rode o backend em modo revisão antes.
3. Add-on **`uploads`** (fotos de produto, anexos de compra): sem ele, rode o `/rodsaas:uploads` antes.
4. Add-on **`notificacoes`**: os avisos do ERP passam pelo catálogo e pelo `notify()` (`references/01-escopo-e-papeis.md`, "Avisos").
5. Fila de jobs da base (pg-boss): aviso de estoque baixo, orçamentos vencendo, relatórios pesados, importação.
6. Mesma regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (leitura de código de barras pela câmera no celular — `@zxing/browser` ou a `BarcodeDetector` nativa —, geração de etiquetas e comprovante em PDF).
7. Com a `/rodsaas:workstation`, o app é cobrado **por empresa**; leia `references/01-escopo-e-papeis.md`, seção "Workstation".

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo da v1**, exceto o que está marcado como fora da v1. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": estoque guardado num campo editável, saldo que fica negativo sem querer, kit com estoque próprio, preço calculado no front, pedido que baixa o estoque sem reservar, troco no cartão, caixa sem fechamento **não são** o ERP desta skill.
3. **O contrato testável (testids e rotas ★) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.** Passar no verify não significa que a fase acabou.
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase (cada linha de tabela e cada marcador) e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem o ERP (revisão)

Se `rodsaas.json → presets` já tem `erp` (ou existe `api/src/modules/erp`), rode em **modo revisão** em vez de instalar de novo:

1. Leia todas as referências inteiras.
2. Compare item a item com o código (API, telas, testes) e monte a tabela de lacunas: item da referência · ✅/❌ · onde está ou o que falta. Comece pelo "Pronto quando" das fases 10 e 11 se o ERP foi instalado antes da versão 0.30 (nota, comissão, lote, promoção, vale-troca, carnê, produção e perfis não existiam) e depois pelas fases 3, 4, 6 e 7 (é onde mais se simplifica: saldo editável em vez de movimentações, sem reserva, custo médio errado, kit com estoque próprio, faixa de preço que só funciona na tela, PDV sem troco certo e sem fechamento de caixa).
3. Mostre a tabela ao usuário e complete o que falta **fase por fase**, sem reescrever o que já está certo e sem perder dados (migrations só aditivas; saldo antigo vira movimentação de "saldo inicial").
4. Feche com `references/10-checklist.md` e o `/rodsaas:verify` (`-g "ERP"`).

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Nome do app | **ERP** (rotas `/erp/...`, API `/v1/erp/...`, id do app `erp`, preset `erp`); PDV em `/erp/pdv` (tela cheia, sem casca) |
| Papéis | `ERP_ADMIN` (tudo: produtos, preços, custos, configurações, aprova), `SELLER` (clientes, orçamentos e pedidos; não vê custo), `STOCK` (estoque, inventário, compras e recebimento; vê custo), `CASHIER` (PDV com o próprio caixa; não vê custo), `VIEWER`; a pessoa pode ter **mais de um** (vendedor que também é caixa); o owner é sempre `ERP_ADMIN` |
| Dinheiro e quantidade | **centavos inteiros**; quantidade com até 3 casas nas unidades fracionáveis (KG, G, L, ML, M, M2, M3, H) e inteira nas outras (UN, CX, PC, PAR); tudo calculado no servidor pelo `erp-lib` |
| Estoque | **livro de movimentações** imutável + saldo derivado; sem estoque negativo (configurável); reserva no pedido confirmado; **custo médio ponderado** |
| Preços | tabela padrão "Varejo" (preço base) + tabelas extras (atacado: −10%); faixas por quantidade por produto; vale o **menor** entre tabela e faixa |
| Descontos | `SELLER`/`CASHIER` até **10%** por venda (configurável); acima, só `ERP_ADMIN` (422 `DISCOUNT_ABOVE_LIMIT`) |
| Orçamento | validade de 7 dias; vence no fim do dia; vencido não confirma sem renovar |
| Contas no Financeiro | venda **entregue** gera as contas a receber (uma por parcela; PDV já baixadas pela forma de pagamento); compra **recebida** gera as contas a pagar |
| PDV | um caixa aberto por terminal e por pessoa; troco só em dinheiro; fechamento cego (a pessoa conta antes de ver o esperado); comprovante não fiscal de 80 mm |
| Planos (modelo de planos) | Free: 50 produtos, 1 depósito, sem PDV; Pro: produtos ilimitados, 5 depósitos, PDV (2 caixas), compras, tabelas e faixas de preço, relatórios; Business: depósitos e caixas ilimitados |
| Workstation | app **por empresa** (R$ 79), acesso pelo papel do app |
| Nota fiscal | pelo add-on `fiscal` (driver falso até escolher o provedor): pedido → NF-e no botão; PDV → NFC-e só quando `pdvIssueNfce` está ligado |
| Comissão | regra da Agenda (vendedor + produto > produto > categoria > vendedor > padrão) sobre o líquido; devolução estorna |
| Perfil | o segmento do onboarding ou a pergunta na primeira abertura; `GENERAL` se pular |

Fora da v1 (registre no README do projeto): NFS-e e SAT (a NF-e e a NFC-e vêm pelo add-on `fiscal`), PDV offline, TEF/maquininha integrada (o PDV registra a forma; a maquininha é separada), número de série, pedido condicional ("mala" de roupa para provar em casa), MRP e roteiro de produção com várias etapas, múltiplas moedas, e-commerce e marketplaces.

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(erp): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e regras** — registro do preset e do **app ERP**, papéis (vários por pessoa), planos (ou workstation), acessos no convite, avisos, porte de `scripts/erp-lib.mjs` (com os testes) para `api/src/modules/erp/lib/`. → `references/01-escopo-e-papeis.md`
   - *Pronto quando*: app no trilho só para quem tem papel; cada papel checado na API (custo some para quem não pode ver); planos ou workstation; `registerMemberAccess('erp')`; tipos de aviso registrados; `erp-lib` portado com os testes passando.
2. **Modelo** — produtos (variações, kits), preços, depósitos, movimentações e saldos, clientes/fornecedores, pedidos, devoluções, caixas e sessões, compras, inventários; RLS `FORCE`; numeração; conteúdo inicial. → `references/02-modelo.md`
   - *Pronto quando*: models com RLS `FORCE`; movimentação imutável (trigger) e saldo só atualizado pelo serviço com `FOR UPDATE`; numeração sem buraco (`V-0001`, `C-0001`); SKU e código de barras únicos por empresa; conteúdo inicial (depósito Principal, tabela Varejo, caixa 1).
3. **Produtos e preços** — cadastro dos quatro tipos, grade, kit, códigos, tabelas, faixas, margem, importação, etiquetas. → `references/03-api.md` e `references/04-produtos-e-precos.md`
   - *Pronto quando*: `validateProduct`, `variantCombinations`/`diffVariants` (mudar a grade arquiva, nunca apaga), `isValidGtin`/`internalBarcode`, `unitPrice` no servidor (o front só mostra), custo escondido para quem não pode ver.
4. **Estoque** — movimentações, saldos por depósito, reserva, custo médio, transferência, inventário, mínimo/máximo, sugestão de compra. → `references/05-estoque.md`
   - *Pronto quando*: saldo = soma das movimentações (sem campo editável), `canTakeOut` com 409 `INSUFFICIENT_STOCK`, `averageCost` nas entradas com custo, kit pelo `kitAvailable`/`explodeKit`, inventário pelo `inventoryAdjustments`, aviso de estoque baixo.
5. **Clientes, orçamentos e vendas** — cadastro único, orçamento, pedido, reserva, separação, entrega, cancelamento, devolução, limite de crédito, integração com Financeiro e Comercial. → `references/06-vendas.md`
   - *Pronto quando*: `orderTotals` (desconto rateado), fluxo pelo `canTransition`, reserva no confirmar e baixa na entrega, `creditCheck`, `returnPlan`, contas a receber geradas na entrega, proposta aceita do Comercial vira pedido.
6. **PDV** — tela de balcão, leitura, pagamento, troco, caixa, comprovante, atalhos. → `references/07-pdv.md`
   - *Pronto quando*: `parseScan`, `settlePayments` (troco só em dinheiro), venda do PDV baixa o estoque na hora, sessão de caixa única por terminal/pessoa, sangria/suprimento, fechamento cego pelo `cashExpected`/`closeCash`, comprovante.
7. **Compras e relatórios** — pedido de compra, recebimento parcial, frete no custo, contas a pagar; relatórios. → `references/08-compras-e-relatorios.md`
   - *Pronto quando*: `validateReceipt`/`purchaseStatus`/`landedUnitCosts`, custo médio depois do recebimento, `abcCurve`, `daysOfStock`, `reorderSuggestion`.
8. **Telas** — Início, produtos, estoque, clientes, vendas, PDV, compras, relatórios, configurações. → `references/09-telas.md`
   - *Pronto quando*: todas as rotas e testids da seção "Contrato testável", PDV usável só com teclado e leitor, tudo no celular (menos o PDV, que exige tela ≥ 768 px ou mostra o modo compacto).
9. **Fechamento do núcleo** — `references/10-checklist.md`, testes ponta a ponta, `/rodsaas:verify` (parte do ERP: `-g "ERP"`; exige os formatos ★ de `03-api.md` e os testids de `09-telas.md`), README do projeto.
10. **Operação avançada** — NF-e/NFC-e pelo motor fiscal, comissão de vendedor, lote e validade (FEFO), promoções, troca e vale-troca, carnê do fiado, ordem de produção. → `references/11-operacao-avancada.md`
    - *Pronto quando*: pedido vira NF-e e o PDV emite NFC-e quando ligado; comissão do período por vendedor com estorno; lote obrigatório na entrada e vencido nunca sai; promoção aplicada no servidor; devolução emite vale e o PDV aceita; carnê com multa e juros; produção baixa insumos e entra com custo.
11. **Perfis de segmento** — mercado/padaria (balança), loja de roupa, material de construção (unidade de venda), distribuidora (múltiplo e pedido mínimo). → `references/12-perfis-de-segmento.md`
    - *Pronto quando*: escolher o perfil liga o que ele pede; etiqueta de balança vira a quantidade; caixa vira m²; múltiplo e mínimo recusados. Feche com `/rodsaas:verify -g "ERP"` (inclui `30-erp-operacao.spec.ts`).

## Princípios

- **Estoque é um livro, não um número.** Toda mudança é uma movimentação com quem, quando, por quê e o documento de origem; o saldo é a soma. Corrigir = nova movimentação (ajuste), nunca editar.
- **Prometido não é disponível.** Pedido confirmado reserva; o PDV e os outros pedidos só enxergam o disponível.
- **Conta no servidor.** Preço (tabela, faixa), totais, rateio, custo médio, troco, esperado do caixa saem do `erp-lib` portado; o front mostra e pré-calcula com a mesma lib.
- **Custo é dado sensível.** Só `ERP_ADMIN` e `STOCK` veem custo e margem; a API devolve `null` para os outros.
- **O balcão não espera.** PDV abre em menos de 1 s, aceita o leitor como teclado, funciona só com o teclado e nunca perde a venda em andamento (rascunho local até finalizar).
- **Um cadastro só.** Cliente e fornecedor pelo CPF/CNPJ, o mesmo do Financeiro e do CRM; produto do ERP é o catálogo do Comercial e do CRM quando o ERP está instalado.
- **Segurança da base, sem exceção.** RLS `FORCE` em tudo; movimentação imutável; números sem buraco.
- **Todo estado tem tela e toda ação tem feedback** (`references/09-telas.md`).

## Relatório final

O que foi adicionado (app, telas, PDV), papéis, planos ou workstation, como testar em 5 minutos (cadastrar uma camiseta com grade cor × tamanho e um kit → entrada de estoque com custo → orçamento com faixa de preço → confirmar e ver o reservado → entregar → abrir o PDV, ler "2*<código>", pagar com Pix + dinheiro e ver o troco → fechar o caixa → pedido de compra e recebimento parcial → curva ABC), integrações ligadas, o resultado do `/rodsaas:verify`, o que ficou fora da v1 (documentos fiscais primeiro) e desvios por versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-papeis.md` | Fase 1: escopo, app na casca, papéis, planos, workstation, acessos no convite, integrações, avisos |
| `references/02-modelo.md` | Fase 2: models, RLS, imutabilidade, numeração, conteúdo inicial |
| `references/03-api.md` | Fases 3–7: rotas, formatos ★, erros, jobs, testes |
| `references/04-produtos-e-precos.md` | Fase 3 |
| `references/05-estoque.md` | Fase 4 |
| `references/06-vendas.md` | Fase 5 |
| `references/07-pdv.md` | Fase 6 |
| `references/08-compras-e-relatorios.md` | Fase 7 |
| `references/09-telas.md` | Fase 8: rotas do front, telas, estados, contrato de testids |
| `references/10-checklist.md` | Fase 9 |
| `references/11-operacao-avancada.md` | Fase 10: nota pelo motor, comissão, lote e validade, promoções, troca e vale-troca, carnê, produção |
| `references/12-perfis-de-segmento.md` | Fase 11: mercado/padaria, loja de roupa, material de construção, distribuidora |
| `scripts/erp-lib.mjs` + `erp-lib.test.mjs` | código de barras, produtos e grade, preços (tabela e faixas), margem, saldos, custo médio, kit, inventário, sugestão de compra, totais e rateio, fluxo do pedido, crédito, parcelas, devolução, PDV (leitura, pagamentos, caixa), compras (recebimento, frete no custo), curva ABC: porte para TS com os testes |
