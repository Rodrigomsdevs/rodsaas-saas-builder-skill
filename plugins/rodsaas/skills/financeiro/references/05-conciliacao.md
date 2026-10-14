# 05 · Conciliação bancária

Objetivo: o saldo do sistema bater com o do banco, sem digitar o que já está no extrato. Tudo pelo `financeiro-lib`: `parseOfx`, `parseCsvStatement`, `dedupeTransactions`, `matchCandidates`, `applyRules`, `normalizeText`.

## Importar

1. Conciliação → escolhe a conta → **Importar extrato** (arrastar o arquivo; `.ofx`, `.qfx` ou `.csv`). Pela tela, o arquivo vai pelo `uploads` (`purpose: "fin_statement"`); a API também aceita o texto (`content`).
2. OFX: `parseOfx` lê 1.x (SGML, sem tags de fechamento, comum nos bancos brasileiros) e 2.x (XML); valores com ponto ou vírgula; datas `YYYYMMDD[HHMMSS[-3:BRT]]` viram dia. Codificação: tente UTF-8; se aparecer `�`, leia como Latin-1 (`windows-1252`), que é o mais comum em OFX de banco brasileiro.
3. CSV: `parseCsvStatement` com o separador detectado, datas `dd/mm/aaaa` ou ISO, coluna de valor com sinal **ou** crédito/débito; na primeira importação de CSV de uma conta, a tela mostra as colunas e pede o mapeamento (data, descrição, valor ou crédito/débito), que fica salvo na conta. Linhas inválidas são listadas ("Linha 14: sem data ou valor"), não derrubam a importação.
4. **Conta certa**: OFX traz BANKID/ACCTID; na 1ª importação eles são gravados na conta; depois, arquivo de outra conta → 409 `STATEMENT_ACCOUNT_MISMATCH` ("Este extrato parece ser da conta 12345-6 do banco 341") com "Importar mesmo assim".
5. **Sem duplicar**: `dedupeTransactions` contra os FITIDs da conta (+ `@@unique([accountId, fitId])` no banco). CSV sem id usa `stableHash(data|valor|descrição|linha)`. Resultado: "38 transações novas, 12 já importadas".
6. Saldo do extrato (LEDGERBAL do OFX) gravado na importação: a tela compara com o saldo do sistema naquela data ("Banco: R$ 10.464,10 · Sistema: R$ 10.428,20 · diferença R$ 35,90").

## Conciliar

Tela em duas colunas: **extrato** (pendentes, mais antigas primeiro) × **sistema**. Para cada transação:

| Situação | O que a tela oferece |
|---|---|
| Há lançamento em aberto com o **mesmo valor**, do tipo do sinal (crédito → a receber; débito → a pagar), vencimento até 10 dias antes ou depois | **Sugestões** (`matchCandidates`, até 5, maior pontuação primeiro: data mais perto + palavras em comum com descrição e contato) com "Conciliar" de um clique |
| Vários lançamentos somam o valor (ex.: um Pix que pagou 3 boletos) | "Buscar lançamentos" com seleção múltipla e a soma ao vivo; conciliar exige soma exata (409 `AMOUNT_MISMATCH`) |
| Nada no sistema (tarifa, rendimento, IOF, compra não lançada) | **Criar lançamento** já baixado, com categoria/contato sugeridos pela regra (`applyRules`) ou escolhidos; "Criar regra a partir desta" |
| Movimento entre contas da empresa | **Transferência**: escolhe a outra conta; se o outro lado já foi importado, casa os dois |
| Não é da empresa / duplicado no banco | **Ignorar** com motivo (desfazer depois) |

Conciliar = criar a baixa (`FinPayment`) na **data e conta da transação**, pelo valor em aberto, `method: TRANSFER`, ligada à transação; o lançamento vira pago (ou parcial, se o extrato pagou menos — então a tela pergunta: baixa parcial ou diferença como desconto/juros). **Desfazer** estorna as baixas criadas pela conciliação e devolve a transação a pendente.

Atalhos: `Enter` concilia a 1ª sugestão, `I` ignora, `C` cria lançamento, setas navegam. Contador "Faltam 12 para conciliar" no menu e no Início.

## Regras automáticas

`FinRule { priority, match: { contains[], sign, minCents, maxCents }, set: { categoryId, contactId, costCenterId } }`, primeira que casar (menor prioridade primeiro). Texto comparado sem acento e sem maiúscula, "contém qualquer um dos termos". Regra sem nenhum critério é recusada (não pode casar tudo). A regra **sugere** (pré-preenche "Criar lançamento" e mostra o selo "Regra: Tarifas"); com "Aplicar automaticamente" ligado na regra, transações que casam e não têm sugestão de lançamento são criadas e conciliadas na importação (relatório da importação lista o que foi automático, com desfazer).

Regras prontas (inativas): Tarifas, Juros/IOF, Rendimentos (`02-modelo.md`).

## Testes obrigatórios

- OFX SGML e XML lidos (valores, datas, FITID, saldo); CSV com mapeamento; linhas ruins listadas.
- Importar o mesmo arquivo duas vezes → `imported: 0, duplicates: N`.
- Sugestão: o lançamento com o mesmo valor e data aparece primeiro; o de outro tipo não aparece.
- Conciliar: lançamento pago com a data do extrato e a conta da transação; transação `RECONCILED`; soma diferente → 409; conciliar de novo → 409 `TRANSACTION_NOT_PENDING`.
- Criar lançamento da tarifa com a categoria da regra, já pago; ignorar; desfazer estorna a baixa.
- Arquivo de outra conta → 409 `STATEMENT_ACCOUNT_MISMATCH`.
