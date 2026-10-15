---
name: financeiro
description: Preset que soma ao projeto rodsaas o app Financeiro, a gestão financeira da empresa no estilo Conta Azul/Omie/Nibo — contas a pagar e a receber com parcelas, recorrência, baixa parcial com juros, multa e desconto, contas bancárias, caixa e cartão com saldo, transferências, plano de contas com centros de custo, fluxo de caixa realizado e previsto, DRE gerencial, inadimplência, conciliação bancária por OFX/CSV com sugestões e regras automáticas, cobranças pela Stripe na conta da própria empresa (Connect: boleto, Pix e cartão, link de pagamento, baixa automática pelo webhook, tarifa lançada, régua de lembretes, cobrança recorrente), aprovação de pagamentos e exportação para a contabilidade; NFS-e pelo motor fiscal com retenções, rateio em categorias e centros de custo, previsto × realizado, fatura de cartão de crédito, mês travado e exportação contábil em partidas dobradas; perfis de prestador de serviço (nota na baixa), comércio (maquininha com taxa, repasse e antecipação) e clínica (convênio com lote, glosa e recurso). Use depois do /rodsaas:backend e /rodsaas:frontend quando o usuário pedir financeiro, contas a pagar, contas a receber, fluxo de caixa, DRE, conciliação bancária, OFX, cobrança, boleto, Pix, link de pagamento, inadimplência, nota de serviço, NFS-e, orçamento, rateio, cartão de crédito, maquininha, convênio, glosa, ou chamar /rodsaas:financeiro.
---

# rodsaas · financeiro (app Financeiro)

Acrescenta ao projeto o app **Financeiro**: o dinheiro da empresa num lugar só — o que ela tem a pagar e a receber, onde está o dinheiro (contas, caixa, cartão), para onde ele vai (fluxo de caixa e DRE), se o extrato do banco bate com o sistema (conciliação) e como cobrar os clientes sem sair do app (Stripe na conta da própria empresa). O preset **soma**: entra como um app na casca de apps (`skills/frontend/references/12-casca-e-apps.md`), sem mexer nos outros apps.

| # | Área | O que resolve |
|---|---|---|
| 1 | **Lançamentos** | contas a pagar e a receber com vencimento e competência, categoria, centro de custo, contato, anexos; parcelas com o centavo certo; recorrência mensal (dia 31 vira o último dia); baixa parcial com juros, multa e desconto; estorno; cancelamento; aprovação de pagamentos acima de um valor |
| 2 | **Contas e saldos** | conta corrente, poupança, caixa, cartão de crédito, investimento e a conta Stripe, com saldo inicial, saldo do dia e transferências entre contas |
| 3 | **Fluxo de caixa** | realizado + previsto por dia ou mês, saldo projetado, vencidos puxados para hoje, filtros por conta, categoria e centro de custo |
| 4 | **DRE e relatórios** | DRE gerencial por competência ou por caixa (receita líquida, lucro bruto, resultado operacional, lucro líquido e margens), inadimplência por faixa de atraso, por categoria, por centro de custo, por contato; exportação para a contabilidade |
| 5 | **Conciliação bancária** | importa OFX (1.x e 2.x) e CSV, não duplica (FITID), sugere o lançamento certo (valor, data, nome), cria lançamento a partir do extrato, regras automáticas ("TARIFA" → Tarifas bancárias), ignora o que não é da empresa |
| 6 | **Cobranças** | cobrança de um lançamento a receber pela **Stripe da própria empresa** (Connect): boleto, Pix e cartão num link de pagamento com a marca da empresa; baixa automática pelo webhook com a tarifa lançada; régua de lembretes por e-mail; cobrança recorrente de clientes (cartão ou boleto) |

Tudo da base continua valendo: auth, empresas com RLS, membros, planos (ou a workstation), padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca, contrato de testids.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json` verdes e já na casca de apps (existe `web/src/config/apps.ts`; senão, `/rodsaas:apps` antes).
2. Add-on **`uploads`** (anexos de boleto, nota e comprovante; arquivos de extrato): sem `uploads` em `rodsaas.json → addons`, rode o `/rodsaas:uploads` antes.
3. Add-on **`notificacoes`**: sem ele, rode o fluxo da skill `notificacoes` primeiro. Os avisos deste preset passam pelo catálogo e pelo `notify()` dele (`references/01-escopo-e-papeis.md`, seção "Avisos").
4. Add-on **`email`** (o `backend` já instala): cobranças, lembretes e recibos para os **clientes da empresa** saem pelo Resend com a marca da empresa.
5. Fila de jobs da base (pg-boss): recorrências, régua de cobrança, vencimentos do dia, sincronização da Stripe.
6. A Stripe do projeto (a do `/rodsaas:backend`) é a **plataforma**: cada empresa conecta a **própria** conta Stripe (Connect) para cobrar os clientes dela — o dinheiro cai na conta da empresa, não na do SaaS. Sem chave da Stripe, o app funciona em **modo de teste** (página de pagamento com "simular pagamento").
7. Mesma regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (o SDK `stripe` já existe; nenhum leitor de OFX externo é necessário — o `financeiro-lib` lê).
8. Com a `/rodsaas:workstation`, o app é cobrado por empresa; leia `references/01-escopo-e-papeis.md`, seção "Workstation".

## Como trabalhar (obrigatório)

1. **Leia a referência da fase inteira antes de começar a fase**, do início ao fim, não por amostragem nem resumo. Cada fase aponta o arquivo (→ `references/...`).
2. **Tudo o que está nas referências é escopo da v1**, exceto o que está marcado como fora da v1. Nada de "versão simplificada", "básico por enquanto" ou "dá para melhorar depois": lançamento sem baixa parcial, valores em ponto flutuante, fluxo de caixa sem o previsto, conciliação que duplica ao importar de novo ou cobrança que não dá baixa sozinha **não são** o Financeiro desta skill.
3. **O contrato testável (testids e rotas ★) é o mínimo que o `/rodsaas:verify` consegue conferir, não o escopo.** Passar no verify não significa que a fase acabou.
4. **Conferência ao fim de cada fase**: antes do commit, monte uma tabela com **cada item** da referência da fase (cada linha de tabela e cada marcador) e o status ✅ feito / ❌ faltando, com o arquivo onde está. Só avance com tudo ✅; o que não der para fazer vira pendência explícita no relatório final, com o motivo. Use o "Pronto quando" de cada fase abaixo como mínimo.
5. Se o usuário pedir para pular ou cortar algo, registre como desvio no relatório final.

## Projeto que já tem o Financeiro (revisão)

Se `rodsaas.json → presets` já tem `financeiro` (ou existe `api/src/modules/financeiro`), rode em **modo revisão** em vez de instalar de novo:

1. Leia todas as referências inteiras.
2. Compare item a item com o código (API, telas, testes) e monte a tabela de lacunas: item da referência · ✅/❌ · onde está ou o que falta. Comece pelo "Pronto quando" das fases 9 e 10 se o Financeiro foi instalado antes da versão 0.31 (NFS-e, rateio, orçamento, cartão, mês travado, exportação contábil e perfis não existiam) e depois pelas fases 3, 4 e 6 (é onde mais se simplifica: dinheiro em `Float`/`Decimal` no JS, parcelas que somam um centavo a mais, saldo guardado num campo que desencontra, vencido que não vira "vencido" sozinho, OFX importado duas vezes, cobrança marcada como paga pelo retorno do navegador em vez do webhook).
3. Mostre a tabela ao usuário e complete o que falta **fase por fase**, sem reescrever o que já está certo e sem perder dados (migrations só aditivas).
4. Feche com `references/08-checklist.md` e o `/rodsaas:verify` (`-g "Financeiro"`).

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Nome do app | **Financeiro** (rotas `/financeiro/...`, API `/v1/fin/...`, id do app `financeiro`, preset `financeiro`); página pública de pagamento `/pagar/[token]` |
| Quem usa | papéis do app: `FIN_ADMIN` (tudo, configurações, aprova pagamentos), `FIN` (lança, baixa, concilia, cobra), `VIEWER` (só vê e exporta); o owner é sempre `FIN_ADMIN`; quem não tem papel não vê o app |
| Dinheiro | **centavos inteiros** em tudo (banco `Int`/`BigInt`, API `…Cents`, telas formatam); BRL; sem multimoeda na v1 |
| Datas | vencimento, competência e pagamento como data de calendário (`YYYY-MM-DD`, `@db.Date`); "hoje" no fuso da empresa (padrão `America/Sao_Paulo`) |
| Plano de contas | o padrão do `financeiro-lib` (`defaultCategories`, ligado aos grupos da DRE), editável; categorias usadas não são apagadas (arquivadas) |
| Multa e juros | sugestão na baixa de atrasado: multa 2% (teto do CDC para consumidor) + juros 1% ao mês pro rata; editáveis na baixa e na configuração |
| Aprovação | contas a pagar lançadas por `FIN` acima de **R$ 5.000** esperam aprovação de um `FIN_ADMIN` (configurável; desligada = sem limite) |
| Conciliação | OFX e CSV; janela de 10 dias para sugerir; regras automáticas por texto, sinal e faixa de valor |
| Cobranças | Stripe **Connect** com a conta da própria empresa (cobrança direta: a empresa é quem vende, paga as tarifas e recebe na conta dela); boleto, Pix (avulso) e cartão; régua: 3 dias antes, no dia, 3 e 7 dias depois; sem chave da Stripe → modo de teste |
| Taxa da plataforma | nenhuma por padrão (`FIN_APPLICATION_FEE_CENTS=0`); o SaaS pode cobrar um valor fixo por cobrança paga (aparece para a empresa antes de conectar) |
| Planos (modelo de planos) | Free: 2 contas, lançamentos, parcelas, contatos, fluxo de caixa; Pro: 10 contas, + conciliação, cobranças, DRE e relatórios, recorrências, aprovação, exportação; Business: contas ilimitadas |
| Workstation | app **por empresa** (catálogo: R$ 49/mês + as tarifas da Stripe nas cobranças, pagas pela empresa direto à Stripe) |
| NFS-e | pelo add-on `fiscal` (driver falso até escolher o provedor ou o padrão nacional); retenções baixam o lançamento; emissão na baixa só no perfil prestador |
| Mês travado | nenhum por padrão; o `FIN_ADMIN` trava depois de mandar ao contador (ou o envio com `lock: true`) |
| Perfil | o segmento do onboarding ou a pergunta na primeira abertura; `GENERAL` se pular |

Fora da v1 (registre no README do projeto): NF-e de venda pelo Financeiro (é do ERP), boleto registrado direto no banco (CNAB) e Open Finance, multimoeda, controle de estoque/custo médio, folha de pagamento, leitura automática da agenda de recebíveis da adquirente (a maquininha é cadastrada com as taxas), envio do lote do convênio no padrão TISS (o lote é controlado aqui; o XML sai do sistema da clínica), SPED e escrituração contábil completa (a exportação é para o contador), Pix Automático (indisponível no Brasil pela Stripe).

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(financeiro): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e regras** — registro do preset e do **app Financeiro**, papéis, planos (ou workstation), avisos, porte de `scripts/financeiro-lib.mjs` (com os testes) para `api/src/modules/financeiro/lib/`. → `references/01-escopo-e-papeis.md`
   - *Pronto quando*: app no trilho só para quem tem papel, `FIN_ADMIN`/`FIN`/`VIEWER` checados na API, planos ou workstation, tipos de aviso registrados, `financeiro-lib` portado com os testes passando.
2. **Modelo** — contas, categorias, centros de custo, contatos, lançamentos, baixas, transferências, recorrências, extratos e transações, regras, cobranças, assinaturas de clientes, eventos de webhook; RLS `FORCE`; conteúdo inicial. → `references/02-modelo.md`
   - *Pronto quando*: todos os models com RLS `FORCE` e `rodsaas_assert_same_org`, dinheiro em inteiros, `@@unique([accountId, fitId])`, lookup público da cobrança só por hash, conteúdo inicial (plano de contas, conta "Caixa", centro "Geral") na ativação.
3. **Lançamentos, contas e baixas** — API e telas de lançamentos (parcelas, recorrência, baixa, estorno, cancelamento, aprovação), contas e transferências, contatos. → `references/03-api.md` e `references/04-lancamentos-fluxo-dre.md`
   - *Pronto quando*: parcelas com `splitInstallments`, recorrência com `recurrenceDates`, situação com `entryStatus` (vencido sem job), baixa com `applyPayment` (parcial, juros, multa, desconto, 422 `OVERPAYMENT`), estorno, saldo de conta calculado das baixas e transferências, aprovação acima do limite, CPF/CNPJ validados.
4. **Fluxo de caixa, DRE e relatórios** — fluxo realizado + previsto, DRE por competência/caixa, inadimplência, relatórios e exportação. → `references/04-lancamentos-fluxo-dre.md`
   - *Pronto quando*: `cashFlow` com vencidos em hoje e transferências fora, `dre` com os grupos e margens, `aging`, exportação CSV para a contabilidade com o plano de contas.
5. **Conciliação bancária** — importação OFX/CSV, deduplicação, sugestões, conciliar, criar lançamento do extrato, regras, ignorar. → `references/05-conciliacao.md`
   - *Pronto quando*: `parseOfx`/`parseCsvStatement`, importar de novo não duplica, sugestões pelo `matchCandidates`, conciliar baixa o lançamento na data do extrato, regras pelo `applyRules`, transferência entre contas reconhecida nos dois extratos.
6. **Cobranças pela Stripe** — conectar a conta Stripe da empresa, cobrança de um lançamento, página pública `/pagar/[token]`, webhook do Connect com baixa automática e tarifa, régua de lembretes, cobrança recorrente, modo de teste. → `references/06-cobrancas-stripe.md`
   - *Pronto quando*: onboarding do Connect com status da conta, `validateCharge` antes de criar, Checkout na conta da empresa (boleto, Pix, cartão), baixa **só pelo webhook** (idempotente pelo id do evento), tarifa lançada, régua pelo `reminderDue`, recorrente cria um lançamento por fatura paga, modo de teste com "simular pagamento".
7. **Telas** — Início, lançamentos, detalhe, contas, fluxo, DRE, relatórios, conciliação, cobranças, assinaturas, contatos, configurações, página pública. → `references/07-telas.md`
   - *Pronto quando*: todas as rotas e testids da seção "Contrato testável", celular sem rolagem lateral, totais sempre visíveis nas listas.
8. **Fechamento do núcleo** — `references/08-checklist.md`, testes ponta a ponta, `/rodsaas:verify` (parte do Financeiro: `-g "Financeiro"`; exige os formatos ★ de `03-api.md` e os testids de `07-telas.md`), README do projeto.
9. **Operação avançada** — NFS-e pelo motor fiscal com retenções, rateio, previsto × realizado, fatura de cartão, mês travado, exportação ao contador. → `references/09-operacao-avancada.md`
   - *Pronto quando*: receita com serviço emite a NFS-e com a chave de 50 posições e as retenções baixam o lançamento; rateio com soma exata entra na DRE; orçamento mostra estouro e alerta; compra no cartão cai na fatura certa e parcela nas seguintes; mês travado recusa criar, baixar e estornar; exportação contábil com as partidas e o que falta mapear.
10. **Perfis de segmento** — prestador de serviço (nota na baixa), comércio (maquininha), clínica (convênio e glosa). → `references/10-perfis-de-segmento.md`
   - *Pronto quando*: escolher o perfil liga o que ele pede; venda no cartão vira receita bruta e taxa nas datas de repasse, com baixa e antecipação; lote do convênio vira receita, glosa baixa o esperado e o recurso recupera; receita quitada do prestador emite a nota sozinha. Feche com `/rodsaas:verify -g "Financeiro"` (inclui `31-financeiro-operacao.spec.ts`).

## Princípios

- **Centavo é sagrado.** Inteiros em todo lugar; parcelas somam exatamente o total; nenhuma conta com `float` no caminho (nem no front: `Intl.NumberFormat` só para mostrar).
- **Saldo se calcula, não se guarda.** Saldo de conta = saldo inicial + baixas + transferências; situação do lançamento = valor − pago e a data de hoje. Nada de campo "saldo" que desencontra com o histórico.
- **Pago é quando o dinheiro entrou.** Cobrança só vira paga pelo webhook da Stripe (nunca pelo "voltar" do navegador); baixa manual registra quem, quando, em qual conta e com qual comprovante.
- **Nada some.** Lançamento pago não se apaga (estorna); categoria usada não se apaga (arquiva); importação de extrato não duplica; todo lançamento tem histórico de quem mudou o quê.
- **O dinheiro do cliente da empresa é da empresa.** Cobranças na conta Stripe dela (Connect, cobrança direta), com a marca dela; o SaaS nunca segura o dinheiro.
- **Segurança da base, sem exceção.** RLS `FORCE` em tudo; o lookup da página pública guarda só o hash do token; webhook com assinatura conferida e evento processado uma vez só.
- **Todo estado tem tela e toda ação tem feedback** (`references/07-telas.md`).

## Relatório final

O que foi adicionado (app, telas, página pública de pagamento), papéis, planos ou workstation, como testar em 5 minutos (criar uma conta "Banco" com saldo → lançar um a receber em 3 parcelas → baixar a 1ª com juros → ver o fluxo de caixa e a DRE → importar o OFX de exemplo e conciliar → gerar uma cobrança e pagar pela página pública no modo de teste → ver a baixa automática), como conectar a Stripe de verdade (Connect, webhook com o segredo próprio, `stripe listen --forward-connect-to` em dev), o resultado do `/rodsaas:verify`, o que ficou fora da v1 e desvios por versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-papeis.md` | Fase 1: escopo por área, app na casca, papéis, planos, workstation, integrações, avisos |
| `references/02-modelo.md` | Fase 2: models, RLS, conteúdo inicial |
| `references/03-api.md` | Fases 3–6: rotas, formatos ★, erros, jobs, testes |
| `references/04-lancamentos-fluxo-dre.md` | Fases 3 e 4: parcelas, recorrência, baixa, aprovação, saldos, fluxo, DRE, relatórios |
| `references/05-conciliacao.md` | Fase 5 |
| `references/06-cobrancas-stripe.md` | Fase 6 |
| `references/07-telas.md` | Fase 7: rotas do front, telas, estados, contrato de testids |
| `references/08-checklist.md` | Fase 8 |
| `references/09-operacao-avancada.md` | Fase 9: NFS-e pelo motor, rateio, previsto × realizado, fatura de cartão, mês travado, exportação ao contador |
| `references/10-perfis-de-segmento.md` | Fase 10: prestador de serviço, comércio com maquininha, clínica com convênio |
| `scripts/financeiro-lib.mjs` + `financeiro-lib.test.mjs` | datas com dia âncora, parcelas, recorrência, situação, multa/juros, baixa, saldo, fluxo de caixa, plano de contas e DRE, inadimplência, OFX/CSV, deduplicação, conciliação, regras, CPF/CNPJ, meios da Stripe, régua, CSV, rateio, orçamento, fatura de cartão, mês travado, partidas contábeis, NFS-e (serviço, retenções, chave), maquininha, glosa, perfis: porte para TS com os testes |
