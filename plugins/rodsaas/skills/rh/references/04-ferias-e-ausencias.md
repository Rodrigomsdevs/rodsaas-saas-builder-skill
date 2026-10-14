# 04 · Férias e ausências

Tudo aqui sai do `rh-lib` portado (`acquisitionPeriods`, `validateVacationPlan`, `validateCollectiveVacation`, `collectiveImpact`, `validateLeave`, `overlapping`, `holidaySet`, `businessDays`). As referências legais estão nos comentários da lib: **confira na fonte oficial (planalto.gov.br) se algo mudou antes de portar** e registre a data da conferência no README.

## Regras da CLT que o sistema aplica

| Regra | Artigo | Como fica |
|---|---|---|
| Período aquisitivo de 12 meses a partir da admissão | 130 | `periods[i].start/end`; 29/02 vira 28/02 |
| Dias de direito pelas faltas injustificadas: até 5 → 30; 6–14 → 24; 15–23 → 18; 24–32 → 12; mais → 0 | 130 | `vacationDaysForAbsences`; faltas = `Leave` tipo `falta` no período + ajuste do RH |
| Perda do direito (licença remunerada > 30 dias, afastamento INSS > 6 meses, sair e não voltar em 60 dias…) | 133 | decisão do RH no período (`lost`, com motivo); situação `perdido` |
| Período concessivo: 12 meses depois do aquisitivo | 134 | `concessiveEnd`; situação `vencendo` (≤ 60 dias, configurável) e `vencida` |
| Fracionar em até 3 períodos, um com ≥ 14 dias e os outros com ≥ 5 | 134 §1º | `TOO_MANY_PERIODS`, `SEGMENT_MIN_5`, `MIN_14_REQUIRED` (exigido quando não sobra como cumprir depois) |
| Não começar nos 2 dias que antecedem feriado ou o descanso semanal remunerado | 134 §3º | `START_BEFORE_REST` (usa os dias de descanso da jornada da pessoa e os feriados nacionais + do local) |
| Aviso com 30 dias de antecedência | 135 | `NOTICE_SHORT` é **aviso**, não bloqueia (empresa e pessoa podem combinar) |
| Fora do concessivo = pagamento em dobro | 137 | aviso `AFTER_CONCESSIVE`; o painel do RH destaca vencidas |
| Coletivas: até 2 períodos no ano, nenhum < 10 dias, comunicação 15 dias antes | 139 | `validateCollectiveVacation` |
| Quem tem menos de 12 meses nas coletivas: proporcional, novo período começa | 140 | `collectiveImpact` (parcial = licença remunerada no excedente); o RH ajusta a data-base se a empresa adotar o art. 140 |
| Vender até 1/3 (abono pecuniário), pedido pela pessoa | 143 | `ABONO_MAX` (floor(direito/3)), `ABONO_ALREADY_SOLD` (uma vez por período) |
| Pagamento até 2 dias antes do início | 145 | `paymentDue` no plano (aparece para o RH e no fechamento) |
| Adiantamento da 1ª parcela do 13º nas férias | Lei 4.749/65 | só registra o pedido (`advance13th`) para a contabilidade |
| Estágio: recesso de 30 dias por ano (proporcional) | Lei 11.788/08 art. 13 | regime `livre` |
| Licenças do art. 473 e leis específicas | 473, 392, CF/ADCT, Lei 11.770 | `LEAVE_TYPES` |

Sem cálculo de valores: o Pessoas **não calcula** remuneração de férias, 1/3 constitucional, médias de variáveis nem descontos. Isso é da contabilidade/folha; o sistema entrega as datas certas no fechamento do mês.

## Regime por contrato

`RhSettings.vacationRegimes` (padrão): CLT, aprendiz e temporário → `clt`; estágio e PJ → `livre`; autônomo → `none` (sem férias: a aba mostra "Este contrato não tem férias no Pessoas"). O regime `livre` só confere saldo, datas no futuro e sobreposição (nada de fracionamento, 2 dias antes do descanso ou venda). A empresa pode mudar PJ para `none`.

## Saldo e situação (o que a tela mostra)

Para cada período (`acquisitionPeriods`, com `taken` = pedidos aprovados **e pendentes**):

| Situação | Selo | Texto de apoio |
|---|---|---|
| `em_aquisicao` | cinza "Em aquisição" | "Você terá direito a partir de 10/03/2027 · acumulado: 17,5 dias" |
| `disponivel` | verde "Disponível" | "20 dias para marcar até 09/03/2027" |
| `vencendo` | amarelo "Vencendo" | "Marque até 09/03/2027 (faltam 48 dias)" |
| `vencida` | vermelho "Vencida" | "O prazo acabou em 09/03/2026: fale com o RH" (o RH vê "pagamento em dobro") |
| `quitado` | neutro "Quitado" | "30 dias: 20 gozados + 10 vendidos" |
| `perdido` | neutro riscado "Sem direito" | motivo do RH |

`accrued` é informativo (proporcional do período em curso); o pedido sempre usa o período completo mais antigo com saldo (a tela escolhe sozinha e deixa trocar).

## Pedido de férias (fluxo)

1. **Minhas férias** → "Pedir férias": escolhe o período (o mais antigo com saldo já vem), um a três trechos (data de início + dias, com o fim calculado ao vivo), venda de dias (interruptor com o máximo) e adiantamento do 13º.
2. A cada mudança, `POST /v1/rh/vacation-requests/validate` (debounce 300 ms): mostra erros em vermelho no trecho (`segment`), avisos em amarelo e o resumo ("Volta em 06/12 · pagamento até 14/11 · sobram 0 dias"). O calendário destaca feriados e os dias em que **não pode começar**; mostra também quem da equipe já está fora nos dias (`overlapping`): "2 de 8 pessoas da equipe estarão fora".
3. Enviar → `POST /v1/rh/vacation-requests` (o servidor valida de novo; 422 se algo mudou) → aprovação `VACATION` (normalmente o gestor).
4. Pendente reserva o saldo; aprovado: aparece no calendário, gera o **aviso de férias** (PDF simples com a marca da empresa, nome, CPF mascarado para impressão, período aquisitivo, datas de início/fim/retorno, dias vendidos) para a pessoa dar ciência; recusado/cancelado devolve o saldo.
5. Aprovado e antes de começar, o RH pode **cancelar** (com motivo, avisa a pessoa e o gestor); depois de começar, só o RH registra "retorno antecipado" (encurta o trecho e devolve os dias).

O RH pode lançar férias por qualquer pessoa (inclusive quem não tem login) direto como aprovadas (`approved: true`), com as mesmas validações; avisos não bloqueiam, erros bloqueiam (o RH pode marcar "Exceção acordada" só para `NOTICE_SHORT` e `AFTER_CONCESSIVE`, que já são avisos).

## Férias coletivas

Tela do RH: nome, início, dias, áreas/locais (vazio = empresa toda) → **Prévia** (`POST /collective-vacations/preview`): validação (`validateCollectiveVacation`) e a lista por pessoa com o saldo e o impacto (`collectiveImpact`: integral ou parcial com dias de licença remunerada) e quem já tem férias marcadas que conflitam (fica de fora com aviso). Confirmar lança um `VacationRequest` aprovado (`collectiveId`) para cada pessoa no período mais antigo com saldo e avisa todos. Lembrete na tela: "Comunique o Ministério do Trabalho e o sindicato com 15 dias de antecedência (art. 139 §2º e §3º)".

## Ausências e licenças

`LEAVE_TYPES` da lib (rótulos, dias legais, documento, aprovação, sensível). Regras:

- **Lançar a própria**: atestado, acompanhamento, casamento, luto, doação de sangue, eleitoral, vestibular, judicial, licenças de maternidade e paternidade — com o comprovante (aviso `DOCUMENT_PENDING` enquanto faltar, sem bloquear). Folga e licença não remunerada pedem aprovação (`LEAVE`).
- **Só o RH**: falta injustificada (conta no período aquisitivo e já recalcula o direito), afastamento pelo INSS, e lançar por outra pessoa.
- Dias acima do legal (ex.: luto de 5 dias) → aviso `ABOVE_LEGAL_DAYS` ("o excedente é decisão da empresa"); Empresa Cidadã liga maternidade 180 e paternidade 20.
- Atestado com mais de 15 dias → aviso `INSS_AFTER_15` para o RH ("a partir do 16º dia o afastamento é pelo INSS") e a sugestão de lançar `inss` a partir do 16º dia.
- **Sensíveis** (`atestado`, `acompanhamento`, `maternidade`, `inss`): documento e tipo só para o RH e a pessoa; para o gestor, "Ausência médica" com as datas; para colegas, só "fora".
- Meio período (`halfDay`) conta 0,5 no absenteísmo.
- Situação da pessoa: `ON_LEAVE` enquanto houver licença longa (maternidade, INSS) em andamento (job diário).

## Calendário (Ausências)

Visão mês (padrão) e lista, filtros por equipe/área/local/tipo, legenda por cor (férias, ausência médica, licença, folga, feriado), feriados nacionais e do local de cada pessoa, "hoje". Gestor vê a equipe com os tipos (menos os sensíveis); colaborador vê a própria equipe direta com "fora" sem tipo; RH vê tudo. Clicar abre o resumo (e o pedido, para quem pode). Exportar iCal da própria agenda de férias (`.ics`).

## Testes obrigatórios

- Lib portada com todos os testes do `rh-lib.test.mjs` (tabela de faltas, períodos, situações, plano válido e cada código, coletivas, regime livre, licenças).
- API: 6 faltas lançadas → período com 24 dias; plano começando numa sexta (descanso domingo) → 422 com `START_BEFORE_REST`; plano 10+10 com saldo 30 → `MIN_14_REQUIRED`; venda de 11 dias → `ABONO_MAX`; pendente reserva saldo (segundo pedido com o mesmo saldo → `EXCEEDS_BALANCE`); recusa devolve; cancelamento devolve.
- Ausência: colaborador lança atestado (201, gestor vê `medical`); colaborador tenta lançar `falta` → 403; RH lança falta e o direito do período muda.
- Calendário: colega vê `away` sem tipo; gestor vê `vacation`; feriados do local aparecem.
