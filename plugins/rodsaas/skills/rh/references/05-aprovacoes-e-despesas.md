# 05 · Aprovações, solicitações e despesas

## O motor de aprovações

Um só motor para tudo que precisa de "sim" de alguém: férias, ausências com aprovação, relatórios de despesa, alteração de dados pessoais e solicitações personalizadas. Outros apps podem usar o mesmo motor depois (Contratos, Compras) pelo serviço `approvals.create(kind, subject, data)` — deixe-o genérico, sem `if (kind === ...)` dentro.

### Fluxo (`ApprovalFlow.steps`)

| Campo | Valores | Exemplo |
|---|---|---|
| `type` | `manager` (gestor direto de quem pede) · `manager_of_manager` · `role` (papel do app: `RH` = RH_ADMIN + RH, `RH_ADMIN`, `FINANCE`) · `user` (pessoa específica) | `{ type: "manager" }` |
| `mode` | `any` (o primeiro que decidir) · `all` (todos da etapa) | diretoria `all` |
| `when` | `{ field, op, value }` — a etapa só existe se a condição bater; campos por tipo: `days` (férias, ausência), `amount` (despesa, em centavos), `abonoDays` (férias) | `{ field: "amount", op: ">", value: 100000 }` |

### Resolver (`resolveApprovers`, na criação)

1. Para cada etapa: condição; aprovadores pelo tipo; troca cada aprovador pelo **delegado ativo** (delegação com período que inclui hoje); tira **quem pediu**.
2. Etapa sem ninguém (sem gestor, gestor desligado, papel vazio) → **fallback para o papel RH** (marcado `fallback: true`, a tela mostra "Sem gestor: foi para o RH"). Se nem o RH tiver alguém (o próprio RH pedindo sem outro RH), a etapa some.
3. Duas etapas seguidas com as mesmas pessoas viram uma (gestor que também é o financeiro não aprova duas vezes).
4. Nenhuma etapa → aprovado na hora (status `APPROVED`, evento "aprovado automaticamente: nenhum aprovador").
5. O resultado vira o **snapshot** do pedido (`steps`): mudar o fluxo, o gestor ou o papel depois **não** muda pedidos em andamento (o RH pode "Reatribuir etapa" com motivo — evento `OVERRIDDEN`).

### Decidir (`applyDecision`)

- Só quem está na etapa atual e ainda não decidiu (`NOT_APPROVER`, `ALREADY_DECIDED`); pedido fora de pendente → `NOT_PENDING`.
- **Recusar exige comentário** (`COMMENT_REQUIRED`); aprovar aceita comentário opcional.
- `any`: a primeira aprovação fecha a etapa; `all`: fecha quando todos aprovarem; qualquer recusa recusa o pedido inteiro.
- Última etapa aprovada → `APPROVED` e o **efeito** do tipo roda na mesma transação: férias e ausência confirmadas (saldo passa de reservado a usado), relatório vira `APPROVED` (entra na fila do financeiro), alteração de dados é aplicada na ficha (com evento), solicitação vai para o RH resolver.
- Recusa → o efeito de recusa (devolve saldo, relatório volta a `REJECTED` com o motivo e pode ser corrigido e reenviado como pedido novo).
- RH pode decidir por qualquer etapa com `override: true` e comentário obrigatório (fica "Decidido pelo RH em nome de…").
- Cada decisão: `ApprovalEvent`, aviso para quem pediu (`rh.approval.decided`) e, se avançou, para os próximos aprovadores (`rh.approval.requested`).
- **Corrida**: decisão com `SELECT … FOR UPDATE` no pedido; duas aprovações ao mesmo tempo → uma vence, a outra recebe `ALREADY_DECIDED` ou `NOT_PENDING`.

### Delegação e lembretes

- **Delegar** (Minhas aprovações → "Ausente? Delegue"): para quem (membro com acesso ao Pessoas, não quem pede), de/até. Durante o período, pedidos novos já resolvem para o delegado; os pendentes na etapa passam para ele quando a delegação começa (job 0 h) e voltam ao fim se ainda pendentes. Sem delegação em cadeia (A→B→C resolve só A→B).
- Ao marcar férias aprovadas, a tela sugere "Delegar as aprovações durante as férias?".
- **Lembrete**: etapa parada há `approvalReminderDays` dias úteis (feriados contam como não úteis) → `rh.approval.reminder` para quem não decidiu, uma vez por dia. Depois de 2 lembretes sem decisão, o RH vê o pedido em "Parados" no painel.

### Caixa "Aprovações"

Abas **Para aprovar** (contador no menu e no ícone do app), **Meus pedidos**, **Todas** (RH). Cada linha: tipo com ícone, título, quem pediu (avatar), quando, etapa ("2 de 3 · Financeiro"), e os dados que importam para decidir sem abrir: férias → saldo depois do pedido e quem da equipe estará fora; despesa → total, itens acima do limite; alteração de dados → antes/depois. Aprovar/recusar direto na linha (recusar abre o campo de comentário), seleção em massa para aprovar. Detalhe: linha do tempo das etapas com cada decisão, comentário e horário.

## Solicitações personalizadas

O `RH_ADMIN` cria tipos (nome, descrição, campos: texto, texto longo, número, dinheiro, data, lista, arquivo) e o fluxo de cada tipo (`REQUEST:<id>`, padrão: só o RH). O colaborador abre em "Meus pedidos → Nova solicitação"; aprovado, o RH **resolve** com uma nota e, se preciso, um arquivo (a declaração assinada), e a pessoa recebe o aviso. Exemplos prontos: Declaração de vínculo, Adiantamento salarial (campo valor), Equipamento ou material.

## Despesas e reembolso

### Regras (`validateExpense`, em centavos no servidor)

| Regra | Código |
|---|---|
| valor > 0 (ou km > 0 na categoria de quilometragem: valor = km × valor por km, calculado no servidor) | `INVALID_AMOUNT` / `KM_REQUIRED` |
| data obrigatória, não no futuro, até `expenseMaxAgeDays` (90) atrás | `DATE_REQUIRED` / `FUTURE_DATE` / `TOO_OLD` |
| recibo obrigatório acima de `receiptAboveCents` (e sempre em Hospedagem) | `RECEIPT_REQUIRED` |
| acima do limite da categoria: exige justificativa; com justificativa passa com aviso (o aprovador vê destacado) | `OVER_LIMIT_JUSTIFY` / aviso `OVER_LIMIT` |
| despesa duplicada (mesma pessoa, data, valor e categoria) | aviso `POSSIBLE_DUPLICATE` |

### Fluxo

1. **Despesa** (botão "+ Despesa", pensado para o celular: foto do recibo pela câmera — `capture="environment"` —, valor, data hoje por padrão, categoria, descrição). Fica **solta** até entrar num relatório.
2. **Relatório**: título + despesas soltas escolhidas (total somado em centavos, `reportTotals`) → **Enviar**: revalida tudo; com tudo válido, aprovação `EXPENSE_REPORT` com `data.amount = totalCents` (padrão: gestor; acima de R$ 1.000, também o financeiro).
3. Aprovado → **fila do financeiro** ("Reembolsos a pagar"): pessoa, Pix (grupo `bank`), total, data de aprovação; **Marcar pago** com data e comprovante opcional → aviso `rh.expense.paid`; exportar CSV para o banco/contabilidade.
4. Recusado → volta com o motivo; a pessoa corrige e cria outro relatório (as despesas voltam a ficar soltas).

Fora da v1: OCR do recibo, cartão corporativo, adiantamento de viagem com prestação de contas, moeda estrangeira (registre o valor convertido em reais).

## Testes obrigatórios

- Motor: gestor direto; condição por valor cria a etapa do financeiro; quem pede não aprova (mesmo sendo do papel); sem gestor → RH com `fallback`; delegação ativa troca o aprovador e a vencida não; etapas repetidas viram uma; `all` precisa de todos; recusa sem comentário 400; decidir duas vezes 409; snapshot não muda quando o gestor muda.
- Efeitos: aprovar férias desconta o saldo; recusar devolve; aprovar alteração de dados aplica na ficha.
- Despesas: os códigos acima; relatório com despesa inválida não envia (422); fila do financeiro só com aprovados; marcar pago avisa; colaborador comum não vê a fila (403).
