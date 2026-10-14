# 07 · Telas

Tudo em `web/src/features/financeiro/` (rotas em `app/(app)/financeiro/...`), com os componentes da base (tabelas, diálogos, `LoadingButton`, estados vazios, skeletons, toasts) e o menu do app (`01-escopo-e-papeis.md`). Valores sempre com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` a partir dos centavos; a entrada de valor é um **campo de moeda em centavos** (digitar só números preenche da direita: "150000" → R$ 1.500,00; colar "1.500,00" também funciona; nunca `parseFloat`). Receita em verde, despesa em vermelho, **sempre com o sinal ou o rótulo** (cor nunca sozinha). `VIEWER` vê tudo sem botões de escrita.

## Rotas

| Rota | Tela |
|---|---|
| ★ `/financeiro` | **Início**: saldo total e por conta, a receber e a pagar hoje e nos próximos 7 dias, vencidos (a receber e a pagar) com "Cobrar"/"Pagar", fluxo dos próximos 30 dias (gráfico de linha do saldo projetado), pendências (a conciliar, a aprovar, cobranças com falha) |
| ★ `/financeiro/lancamentos` | lista com abas A receber · A pagar · Todos, filtros (período de vencimento — padrão: mês atual —, situação, categoria, centro de custo, conta, contato, busca), totais do filtro sempre visíveis (valor, pago, em aberto), seleção e ações em massa, "+ Lançamento" |
| ★ `/financeiro/lancamentos/[id]` | detalhe: dados, parcelas irmãs, baixas (com estornar), cobrança (link, situação, lembretes), anexos, histórico, origem |
| ★ `/financeiro/contas` | contas com saldo de hoje e projetado, transferências, "+ Conta" (`FIN_ADMIN`) |
| ★ `/financeiro/fluxo-de-caixa` | fluxo por mês/dia (`cashFlow`), gráfico de barras (entradas × saídas) + linha do saldo, tabela, filtros, clique abre os lançamentos |
| ★ `/financeiro/dre` | DRE gerencial mês a mês + acumulado, competência/caixa, linhas expansíveis até o lançamento |
| ★ `/financeiro/relatorios` | inadimplência (`aging`), por categoria, por centro de custo, por contato, exportar/enviar ao contador |
| ★ `/financeiro/conciliacao` | conta, importar extrato, pendentes × sistema, sugestões, criar, transferência, ignorar, regras |
| ★ `/financeiro/cobrancas` | cobranças com situação (pendente, processando, paga, expirada, cancelada, falhou), link, reenviar, cancelar, 2ª via |
| `/financeiro/assinaturas` | cobranças recorrentes de clientes |
| `/financeiro/contatos` · `/financeiro/contatos/[id]` | clientes e fornecedores, histórico, a receber em aberto |
| ★ `/financeiro/configuracoes` | geral (fuso, multa e juros, aprovação, e-mail financeiro, contador), plano de contas, centros de custo, regras, cobranças (Stripe, meios padrão, régua), papéis |
| ★ `/pagar/[token]` | página pública de pagamento (fora do `(app)`) |

## Lançamento (formulário)

Diálogo (tela cheia no celular), aberto por "+ Lançamento", pelo atalho `N` ou pelo botão do app. Campos na ordem: tipo (A receber / A pagar, `fin-entry-type`), descrição, valor (`fin-entry-amount`), vencimento (`fin-entry-due`), categoria (do tipo, com busca, `fin-entry-category`), contato (busca + "Novo contato" inline, `fin-entry-contact`), conta prevista (`fin-entry-account`), "Mais opções": competência, centro de custo, documento, observação, anexos, etiquetas, **parcelar** (`fin-entry-installments`, com a prévia das parcelas e valores) ou **repetir** (recorrência com prévia das próximas datas). "Salvar" (`fin-entry-save`) e "Salvar e baixar" (já pago). Erros do servidor no campo; `AWAITING_APPROVAL` → toast "Enviado para aprovação de um administrador".

## Lista de lançamentos

Linha (`fin-entry-row`, `data-id`, `data-type`, `data-status`): vencimento, descrição (+ parcela "2/3"), contato, categoria, valor, em aberto, selo da situação (Aberto, Vence hoje, Vencido há N dias, Parcial, Pago, Cancelado, Aguardando aprovação), ações: **Baixar** (`fin-entry-pay`), Cobrar (a receber), ⋯ (editar, duplicar, cancelar). Totais (`fin-entries-totals`) no rodapé fixo. Vazio: "Nenhum lançamento neste período" com "+ Lançamento" e "Importar extrato".

**Baixar** (`fin-pay-form`): conta (`fin-pay-account`), data (`fin-pay-date`, padrão hoje), valor (`fin-pay-amount`, padrão o que falta), juros (`fin-pay-interest`), multa (`fin-pay-fine`) e desconto (`fin-pay-discount`) — vencido vem com a sugestão (`suggestedLate`) e o texto "Atrasado 12 dias: multa 2% + juros 1% a.m." —, forma, comprovante; total que entra no caixa ao vivo; "Confirmar baixa" (`fin-pay-confirm`). Violações (`fin-pay-violation`, `data-code`) no formulário.

## Conciliação

Seletor da conta (`fin-recon-account`), **Importar extrato** (`fin-import-file`, aceita `.ofx`, `.qfx`, `.csv`; arrastar e soltar), resultado da importação (`fin-import-result`: novas, já importadas, linhas com problema, saldo do extrato × sistema). Lista de pendentes (`fin-tx-row`, `data-id`, `data-status`) com data, descrição, valor e, ao lado, as sugestões (`fin-tx-suggestion`, `data-entry`) com **Conciliar** (`fin-tx-reconcile`), **Criar lançamento** (`fin-tx-create`, com a categoria da regra), Transferência, **Ignorar** (`fin-tx-ignore`). Abas Pendentes · Conciliadas · Ignoradas. No celular, um cartão por transação.

## Cobranças e página pública

- Lista (`fin-charge-row`, `data-status`), "+ Cobrança" (`fin-charge-new`, escolhe um a receber), copiar link (`fin-charge-copy-link`). Configurações → Cobranças: **Conectar Stripe** (`fin-stripe-connect`) e o status (`fin-stripe-status`, `data-status`).
- `/pagar/[token]` (`pay-page`): logo e nome da empresa, descrição, valor (`pay-amount`), vencimento, situação (`pay-status`, `data-status`), meios (`pay-method`, `data-method`); modo de teste: faixa "Ambiente de teste" (`pay-test-mode`) e botões "Simular" (`pay-simulate`, `data-method`); paga: "Pagamento confirmado" (`pay-done`). Mobile primeiro; sem casca; sem login.

## Estados e interações

- Carregando: skeleton com o formato; erro: `error-state` com tentar de novo; vazio que ensina ("Cadastre sua primeira conta para ver o saldo").
- Toda ação com `LoadingButton` e toast com o que aconteceu e, quando dá, "Desfazer" (baixa → estornar; cancelar → reabrir).
- Plano: recurso Pro com selo e "Conheça" (owner) ou "Fale com o responsável".
- Atalhos: `N` novo lançamento, `B` baixar o selecionado, `/` busca.
- Celular sem rolagem lateral em todas as rotas; tabelas viram cartões abaixo de 640 px; totais continuam visíveis.

## Contrato testável (testids)

| Testid | Onde |
|---|---|
| `fin-home`, `fin-balance-total`, `fin-due-today`, `fin-overdue` | Início |
| `fin-entries-tab` (`data-tab="receber\|pagar\|todos"`), `fin-entry-new`, `fin-entry-row` (`data-id`, `data-type`, `data-status`), `fin-entry-pay`, `fin-entries-totals` | Lançamentos |
| `fin-entry-form`, `fin-entry-type`, `fin-entry-description`, `fin-entry-amount`, `fin-entry-due`, `fin-entry-category`, `fin-entry-contact`, `fin-entry-account`, `fin-entry-installments`, `fin-entry-save` | Formulário de lançamento |
| `fin-pay-form`, `fin-pay-account`, `fin-pay-date`, `fin-pay-amount`, `fin-pay-interest`, `fin-pay-fine`, `fin-pay-discount`, `fin-pay-confirm`, `fin-pay-violation` (`data-code`) | Baixa |
| `fin-entry-detail`, `fin-payment-row`, `fin-payment-reverse` | Detalhe |
| `fin-account-row` (`data-id`), `fin-account-balance`, `fin-account-new` | Contas |
| `fin-cashflow`, `fin-cashflow-period` (`data-key`), `fin-dre`, `fin-dre-line` (`data-line`), `fin-aging` | Fluxo, DRE, relatórios |
| `fin-recon-account`, `fin-import-file`, `fin-import-result`, `fin-tx-row` (`data-id`, `data-status`), `fin-tx-suggestion` (`data-entry`), `fin-tx-reconcile`, `fin-tx-create`, `fin-tx-ignore` | Conciliação |
| `fin-charge-row` (`data-status`), `fin-charge-new`, `fin-charge-copy-link`, `fin-stripe-connect`, `fin-stripe-status` | Cobranças |
| `pay-page`, `pay-amount`, `pay-status` (`data-status`), `pay-method` (`data-method`), `pay-test-mode`, `pay-simulate` (`data-method`), `pay-done` | Página pública |

Os rótulos visíveis são livres (português claro); os testids e as rotas ★ não mudam.
