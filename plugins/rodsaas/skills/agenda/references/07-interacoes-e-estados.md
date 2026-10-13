# Interações e estados

Parte do escopo, não acabamento.

## Otimismo e desfazer

| Ação | Comportamento |
|---|---|
| arrastar/redimensionar na agenda | move na hora; diálogo "Avisar o cliente?"; API em segundo plano; 409 → volta ao lugar com "Esse horário conflita com Consulta · Bia" |
| aprovar / recusar | otimista; toast com **Desfazer** por 8 s (antes de mandar o e-mail; o e-mail sai depois do prazo) |
| cancelar | confirmação com motivo → toast "Cancelado" (sem desfazer depois que o cliente foi avisado; enquanto o e-mail não saiu, **Desfazer**) |
| compareceu / faltou | otimista, alternável |
| bloquear horário | aparece na hora; erro desfaz |
| ligar/desligar tipo | otimista; desligar com agendamentos futuros avisa que eles continuam |
| salvar disponibilidade | botão com loading; a prévia atualiza; erros nos intervalos |

Toda mutação invalida agenda, lista, contadores do trilho e widgets do Início. A agenda recarrega ao focar a janela e a cada 30 s (mantendo a posição e o que está sendo arrastado); agendamento novo vindo da página pública aparece com um destaque breve.

## Atalhos (agenda, fora de campos de texto)

`T` hoje · `←/→` período anterior/seguinte · `D`/`S`/`M` dia, semana, mês · `N` novo agendamento · `B` bloquear · `Esc` fecha o painel · `?` atalhos.

## Estados

### Carregando (skeleton com o formato real)
Agenda (grade com 3 blocos por coluna), lista (8 linhas), painel (blocos de resumo/cliente/ações), tipos (cartões), disponibilidade (7 linhas de dias), relatórios (cartões e retângulos), página pública (resumo + calendário cinza + 6 botões de horário).

### Vazio, sempre com a próxima ação
| Onde | Mensagem | Ação |
|---|---|---|
| agenda sem compromissos no período | "Nenhum agendamento nesta semana" | **Compartilhar meu link** · **+ Agendamento** |
| nenhum tipo ativo | "Crie o que seus clientes podem agendar" | **+ Tipo de agendamento** (e ativar o exemplo) |
| sem disponibilidade (todos os dias fechados) | "Sua agenda está fechada. Abra pelo menos um dia." | foco na semana |
| aguardando aprovação | "Nada esperando aprovação" | — |
| clientes | "Seus clientes aparecem aqui depois do primeiro agendamento" | **Compartilhar meu link** |
| relatórios | "Os números aparecem com os primeiros agendamentos" | — |
| página pública sem horários | "Sem horários disponíveis nos próximos dias" | WhatsApp da empresa |

### Erro
- Bloco com mensagem e **Tentar de novo**; agenda continua navegável.
- Agendamento não encontrado/sem acesso → `not-found` com a casca.
- Sem permissão → ações ocultas ou desabilitadas com tooltip ("Só owner e admin mexem na agenda de outras pessoas").
- Feature fora do plano → selo Pro e `UpgradeDialog`; limite (tipos, pessoas, mensal) → aviso antes e `UpgradeDialog`.
- Conexão Google/Outlook com problema → aviso no topo da agenda da pessoa "Reconecte seu Google Agenda para não receber agendamentos em horários ocupados" com **Reconectar**.

### Botões com loading (mantendo a largura)
Confirmar agendamento (público) · Remarcar/Cancelar (público e interno) · Aprovar/Recusar · Salvar tipo · Salvar disponibilidade · Criar encaixe/bloqueio · Conectar agenda · Regenerar feed · Exportar.

## Detalhes que fazem diferença
- Horários sempre com o fuso visível quando difere do da pessoa que está vendo ("09:00 (10:00 em Lisboa)").
- Durações e antecedências escritas em português natural ("1 h 30 min", "até 2 dias antes").
- Status com cor **e** texto: Confirmado (sucesso), Aguardando (aviso), Cancelado (neutro riscado), Recusado (destrutivo), Faltou (destrutivo), Compareceu (sucesso).
- Título da aba: "Agenda · qui, 15 out · {Produto}"; com pendentes, "(2) Agenda…".
- Copiar link mostra "Link copiado" no botão.
- Página pública pensada primeiro para o celular: alvos de 44 px, calendário que cabe em 360 px, teclado numérico no WhatsApp.
- Acessibilidade da agenda: cada evento é um botão com rótulo completo ("Consulta com Ana Souza, quinta 15 de outubro, 09:00 às 09:30, confirmado"); arrastar tem alternativa ("Remarcar" no painel).
