# 10 · Checklist final

Confira **usando o app** (API e front rodando), com: o owner (`ERP_ADMIN`), uma pessoa `SELLER`, uma `STOCK`, uma `CASHIER`, um membro sem papel, uma segunda empresa, um leitor de código de barras (ou a digitação do código + Enter) e o Mailpit. Cada item ✅ com o arquivo/tela onde está; o que faltar vira pendência no relatório.

## Base e integração
- [ ] typecheck, lint, build e todos os testes (base + presets + erp, com os do `erp-lib` portados) verdes
- [ ] `rodsaas.json` com `erp` em `presets` e o app em `apps`
- [ ] app só para quem tem papel; vários papéis por pessoa; menu por papel; badge; widgets; busca no Ctrl+K (produto por código de barras)
- [ ] ativação cria configurações, depósito Principal, tabela Varejo, caixa 1 (com PDV) e o papel do owner (uma vez só)
- [ ] `registerMemberAccess('erp')` com os papéis; admin da empresa não dá `ERP_ADMIN`/`STOCK`
- [ ] avisos registrados e disparados (estoque baixo, orçamento vencendo, diferença de caixa, caixa esquecido aberto)
- [ ] planos (`erpProducts`, `erpWarehouses`, `erpRegisters`, `erp_*`) ou workstation (por empresa, acesso pelo papel)
- [ ] **nenhum `Float`** no schema nem `parseFloat` no caminho do dinheiro e da quantidade

## Produtos e preços
- [ ] os quatro tipos (+ variação); tipo não muda depois (menos simples → grade sem movimento)
- [ ] grade com até 3 atributos e 200 variações, SKU sugerido, código e preço por variação; mudar a grade arquiva, nunca apaga
- [ ] kit com componentes, custo e disponível calculados, sem estoque próprio
- [ ] EAN validado na hora, código interno gerado, SKU e código únicos
- [ ] tabelas de preço (% e preço fixo), faixas por quantidade, o menor vale; preço no servidor
- [ ] margem e markup ao vivo; custo escondido para quem não pode ver (API devolve `null`)
- [ ] importar CSV (com grade) com prévia e relatório; exportar; etiquetas em PDF; reajuste em lote com prévia

## Estoque
- [ ] movimentação imutável; saldo = soma; nenhum lugar edita saldo
- [ ] reserva no confirmar, libera no cancelar, baixa na entrega; disponível em todo lugar que vende
- [ ] sem negativo por padrão; 20 vendas simultâneas do último item → uma passa
- [ ] custo médio nas entradas com custo; custo gravado na linha vendida
- [ ] transferência, inventário com contagem por leitor e aplicar, mínimo/máximo, aviso de baixo, sugestão de compra

## Clientes e vendas
- [ ] cadastro único com documento validado e único, CEP, ligado ao Financeiro e ao CRM pelo documento
- [ ] orçamento com validade e PDF/e-mail; vira pedido; vencido não confirma
- [ ] totais com rateio e frete; desconto acima do limite bloqueado para o vendedor; limite de crédito
- [ ] separar com conferência por leitor; entregar gera as contas a receber; cancelar; devolução parcial com reembolso
- [ ] proposta aceita do Comercial vira pedido confirmado (sem duplicar as contas a receber)

## PDV
- [ ] abrir com fundo de troco; um caixa por terminal e por pessoa
- [ ] leitor como teclado ("3*código"), busca por nome, grade, kit, cliente, desconto com limite
- [ ] pagamento misto, troco só em dinheiro, fiado com limite; clique duplo não vende duas vezes
- [ ] comprovante "sem valor fiscal"; venda em andamento sobrevive a recarregar
- [ ] suprimento, sangria, fechamento cego com diferença; aviso de diferença
- [ ] atalhos F2–F12 funcionando e visíveis; usável só com teclado; modo compacto no celular

## Compras e relatórios
- [ ] pedido de compra, envio, recebimento parcial pelo leitor, frete rateado no custo, contas a pagar
- [ ] vendas, curva ABC, posição valorizada, giro/parados, sugestão de compra, caixas; exportar CSV

## Telas e qualidade
- [ ] todas as rotas e testids do contrato (`09-telas.md`)
- [ ] celular sem rolagem lateral; tema escuro; cor nunca sozinha
- [ ] estados de carregando, vazio, erro e sem permissão
- [ ] RLS: a segunda empresa não vê nada (API e telas)
- [ ] `/rodsaas:verify -g "ERP"` verde (e a bateria completa sem regressão)
- [ ] README do projeto: o que o ERP faz, papéis, como configurar caixas e o leitor, o que ficou fora da v1 (documentos fiscais primeiro)
