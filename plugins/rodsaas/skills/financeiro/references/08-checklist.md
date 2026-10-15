# 08 · Checklist final

Confira **usando o app** (API e front rodando), com: o owner (`FIN_ADMIN`), uma pessoa `FIN`, uma `VIEWER`, um membro sem papel, uma segunda empresa, uma aba anônima para a página de pagamento e o Mailpit. Cada item ✅ com o arquivo/tela onde está; o que faltar vira pendência no relatório.

## Base e integração
- [ ] typecheck, lint, build e todos os testes (base + presets + financeiro, com os do `financeiro-lib` portados) verdes
- [ ] `rodsaas.json` com `financeiro` em `presets` e o app em `apps`; `STRIPE_CONNECT_WEBHOOK_SECRET`, `FIN_CHARGES_MODE`, `FIN_APPLICATION_FEE_CENTS`, `FIN_FAKE_FEE_CENTS` no `.env.example` com instrução
- [ ] app só para quem tem papel; menu e badge; widgets no Início; busca no Ctrl+K
- [ ] ativação cria plano de contas, conta Caixa, centro Geral, regras prontas e o papel do owner (uma vez só)
- [ ] avisos registrados no catálogo e disparados nos eventos da tabela
- [ ] planos (`finAccounts`, `fin_*`) ou workstation (por empresa, acesso pelo papel, webhook fora do guard)
- [ ] **nenhum `Float`** no schema nem `parseFloat` no caminho do dinheiro (busca no código)

## Lançamentos, baixas e contas
- [ ] a receber e a pagar com vencimento ≠ competência, contato, centro de custo, anexos, etiquetas
- [ ] parcelas somando o total exato e com dia âncora; editar "só esta" e "esta e as próximas"
- [ ] recorrência gerando 12 meses e estendendo no job; parar cancela os futuros em aberto
- [ ] vencido aparece sozinho no dia seguinte; parcial vencido destacado
- [ ] baixa parcial, juros, multa e desconto (sugestão de multa/juros no atrasado); `OVERPAYMENT`; estorno sem apagar
- [ ] aprovação acima do limite para `FIN`; recusa com motivo
- [ ] saldo das contas calculado (baixas + transferências), sem campo de saldo; transferência fora da DRE e do fluxo
- [ ] cartão de crédito: compra parcelada na fatura certa pelo fechamento
- [ ] contatos com CPF/CNPJ válido e único
- [ ] ações em massa (baixar, categoria, vencimento, cancelar, exportar)

## Fluxo, DRE e relatórios
- [ ] fluxo por mês e por dia, realizado + previsto, vencidos em hoje, saldo negativo destacado, clique abre os lançamentos
- [ ] DRE por competência e caixa, mês a mês, margens, fora do resultado separado, drill-down até o lançamento
- [ ] inadimplência por faixa e por cliente com "Cobrar"
- [ ] exportação CSV para a contabilidade (abre certo no Excel) e envio ao contador

## Conciliação
- [ ] OFX de pelo menos 2 bancos reais (SGML e XML) e um CSV com mapeamento salvo
- [ ] importar de novo não duplica; arquivo de outra conta avisa
- [ ] sugestões certas; conciliar baixa na data do extrato; soma de vários lançamentos; parcial com diferença
- [ ] criar lançamento com a regra; transferência entre contas; ignorar; desfazer estorna
- [ ] saldo do extrato × sistema na importação

## Cobranças
- [ ] conectar a Stripe (conta de teste) com status e meios; desconectar
- [ ] cobrança com boleto, Pix e cartão; validações (documento, limites, 60 dias); e-mail com o link
- [ ] página pública com a marca da empresa, no celular, sem login
- [ ] pagamento de teste pela Stripe de verdade (cartão de teste, boleto e Pix de teste): baixa **pelo webhook**, tarifa lançada, recibo; webhook repetido não duplica
- [ ] modo de teste (sem chave): "Simular" baixa igual
- [ ] régua: um lembrete por dia no máximo, nenhum depois de pago; pausar
- [ ] assinatura de cliente: fatura paga vira lançamento baixado; cancelar
- [ ] repasse (`payout.paid`) vira transferência

## Telas e qualidade
- [ ] todas as rotas e testids do contrato (`07-telas.md`)
- [ ] campo de valor em centavos (digitar números e colar "1.500,00")
- [ ] celular sem rolagem lateral; tema escuro; cor nunca sozinha
- [ ] estados de carregando, vazio, erro e sem permissão
- [ ] RLS: a segunda empresa não vê nada (API e telas)
- [ ] `/rodsaas:verify -g "Financeiro"` verde (e a bateria completa sem regressão)
- [ ] README do projeto: o que o Financeiro faz, papéis, como conectar a Stripe (Connect, webhook de contas conectadas, `stripe listen --forward-connect-to`), como importar OFX, o que ficou fora da v1

## Operação avançada (`09`)
- [ ] NFS-e pelo motor: serviço validado (código nacional, ISS 2–5%), tomador com documento, chave de 50 posições, retenções (ISS, IRRF, PCC, INSS; mínimo de R$ 10; Simples) baixando o lançamento sem mexer no saldo; uma nota por lançamento; cancelar
- [ ] rateio em porcentagem e em centavos com soma exata; DRE e relatórios pelas partes; parcelas copiam
- [ ] orçamento por mês e categoria; relatório com `OK`/`WARN`/`OVER`/`UNDER`/`NO_BUDGET`; aviso de estouro uma vez
- [ ] cartão: fechamento e vencimento; compra no dia do fechamento vai para a próxima; parcelas nas faturas seguintes; fatura com rateio pelas categorias; fatura paga recusa compra; limite usado
- [ ] mês travado: só mês terminado; criar, mudar, baixar, estornar, cancelar, transferir e conciliar no período → 409 `PERIOD_LOCKED`; destravar com motivo e histórico
- [ ] exportação contábil com `ledgerCode`: partidas de receita, despesa, transferência e rateio; faltando listado; CSV do contador; envio com trava

## Perfis (`10`)
- [ ] perfil aplicado sem desligar nada; vocabulário
- [ ] maquininha: cadastro com taxas e prazos; venda vira receita bruta + taxa por parcela; repasse baixa as duas; antecipação com desconto pro rata
- [ ] convênio: guia, lote → receita com o prazo do convênio, glosa baixa o esperado, recurso recupera em nova receita, índice de glosa
- [ ] prestador: receita quitada com serviço emite a NFS-e sozinha; falha avisa sem desfazer a baixa
