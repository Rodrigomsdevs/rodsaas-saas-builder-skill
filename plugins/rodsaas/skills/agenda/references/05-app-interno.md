# App interno (telas)

Dentro do app **Agenda** da casca de apps. Componentes, estados e formulários da skill `frontend`. Código em `web/src/features/agenda/`.

## Rotas

| Rota | Tela |
|---|---|
| `/agenda/recepcao` | **Recepção do dia** (`?data=`): colunas por profissional, chegada, conclusão, fila |
| `/agenda` | agenda (calendário) — `?visao=dia\|semana\|mes&data=YYYY-MM-DD&pessoas=ana,bia` |
| `/agenda/fila` · `/agenda/fila/tv` | fila do dia · tela para TV (só nome abreviado e posição, atualiza sozinha) |
| `/agenda/retornos` | retornos vencendo (clínica) |
| `/agenda/clube` | planos e assinantes |
| `/agenda/comissoes` | extrato e fechamento de comissões, regras |
| `/agenda/agendamentos` | lista (`?aba=proximos\|pendentes\|passados\|cancelados`); `?a=<id>` abre o painel |
| `/agenda/tipos` · `/agenda/tipos/[id]` | tipos de agendamento · editar tipo |
| `/agenda/disponibilidade` | minhas agendas (owner/admin escolhem a pessoa) |
| `/agenda/clientes` · `/agenda/clientes/[id]` | clientes |
| `/agenda/relatorios` | relatórios |
| `/agenda/compartilhar` | link da página, QR code, incorporar |
| `/agenda/configuracoes` | perfil do segmento, página pública, feriados, lembretes padrão, confirmação, sinal, lista de espera, fidelidade, **recursos**, **convênios**, integrações, webhooks (owner/admin; "Minhas integrações" para todos) |

## Recepção do dia (`/agenda/recepcao`, `agenda-reception`)

A tela de quem fica no balcão. Abre no dia de hoje; ← → e "Hoje".
- **Uma coluna por profissional** (`agenda-day-column` com `data-host`), com foto, nome, "livre agora"/"atendendo até 10:30" e, no topo, a contagem do dia. Uma coluna extra para cada recurso quando o filtro "por sala" está ligado.
- Cada compromisso é um cartão (`agenda-reception-card`, `data-appointment-id`, `data-state`: `scheduled` · `late` (15 min sem chegar) · `arrived` · `done` · `no_show` · `canceled`) com hora, cliente, serviços (combo por extenso), selos (confirmado pelo cliente ✓, sinal pago, clube, convênio, primeira vez, aniversário) e as ações do momento:
  - **Chegou** (`agenda-checkin`) → `arrived` com a hora;
  - **Concluir** (`agenda-complete`) → diálogo `agenda-complete-dialog`: serviços do agendamento já listados (trocar profissional ou valor), **+ Produto** (`agenda-complete-product-add`; busca no ERP se instalado, senão nome e valor), desconto, forma de pagamento (`agenda-complete-method`, `<select>`: Pix, dinheiro, crédito, débito; clube/convênio já marcados), total (`agenda-complete-total`, `data-cents`), resgatar fidelidade (quando há prêmio) e **Concluir** (`agenda-complete-confirm`) → `done`, com o toast "Concluído · comissão de Ana: R$ 16,00";
  - **Faltou** depois do início; **WhatsApp** (abre o `wa.me` com a mensagem pronta).
- Lateral: **fila do dia** (mesmos componentes da `/agenda/fila`) e "Próximos a chegar".
- Atualiza sozinha a cada 30 s e ao focar; mudanças vindas da página pública aparecem com destaque.

## Fila do dia (`/agenda/fila`, `agenda-queue`)

**+ Na fila** (`agenda-queue-add`) abre o formulário curto: nome (`agenda-queue-name`), WhatsApp, serviço (`agenda-queue-service`, `<select>`), profissional (opcional), **Adicionar** (`agenda-queue-submit`). Lista (`agenda-queue-row` com `data-id` e `data-position`) com posição, nome, serviço, **espera prevista** (`agenda-queue-eta`, "~20 min com a Bia"), há quanto tempo chegou, **Chamar** (`agenda-queue-call`, escolhe quem atende se houver mais de um livre) e **Desistiu**. Chamar cria o atendimento e tira da fila.

## Agenda (`/agenda`, `agenda-calendar`)

- Cabeçalho: **Hoje**, ← →, data por extenso (clicar abre um mini calendário), visão Dia · Semana · Mês, seletor de **pessoas** (owner/admin: várias; MEMBER: a própria e as visíveis), filtro de tipo, **+ Agendamento**.
- **Dia com várias pessoas**: uma **coluna por profissional** (foto e nome no topo), como em salão e clínica. Semana: uma pessoa por vez ou todas sobrepostas com cor por pessoa.
- Grade de 15 em 15 min com a hora atual marcada (linha); horário fora da disponibilidade em cinza listrado; feriado com faixa no topo do dia.
- **Eventos** (`agenda-event` com `data-appointment-id`): cor do tipo (ou status), título, cliente, horário; pendente com borda tracejada e ícone de relógio; turma com "3/8"; bloqueio cinza com o título ("Almoço"); videochamada com ícone; compareceu ✓ / faltou ✗ depois do horário.
- **Arrastar** para remarcar (outra hora, outro dia, outra coluna = outra pessoa) e **puxar a borda** para mudar a duração; ao soltar, diálogo "Avisar o cliente sobre a mudança?" (sim por padrão). Otimista, com desfazer; conflito (409) volta e explica.
- **Clicar num horário vazio**: menu "Novo agendamento (encaixe)" ou "Bloquear horário". Encaixe abre o formulário já com a pessoa, o dia e a hora.
- Mês: pontos/contagem por dia; clicar no dia abre o dia.
- Celular: visão dia com uma pessoa por vez (abas de pessoas) e lista; arrastar substituído por "Remarcar".

## Painel do agendamento (`agenda-appointment-panel`)

Lateral (desktop) ou tela cheia (celular):
- Status (selo), tipo, data e hora (fuso da empresa e, se diferente, o do cliente), duração, profissional(is), local/link (copiar, abrir).
- **Cliente**: nome, e-mail, WhatsApp (botões WhatsApp e ligar), histórico curto ("4º agendamento · 1 falta"), link para o cliente e, com CRM, para o contato.
- Respostas das perguntas (com `displayAnswer` do `forms-lib`).
- **Ações**: Aprovar / Recusar (pendente; `agenda-confirm`, `agenda-decline`), Remarcar (abre o seletor de horários com a disponibilidade, como a página pública, mais "ignorar disponibilidade" para owner/admin), Cancelar (`agenda-cancel`, abre o `confirm-dialog` da base com motivo e "avisar o cliente"; confirma em `confirm-dialog-confirm`), **Compareceu** (`agenda-mark-attended`) / **Faltou** (`agenda-mark-noshow`) depois do início, Reenviar confirmação, Copiar link do cliente.
- Anotações internas (autosave).
- Histórico (`AgendaEvent`) em texto discreto ("Remarcado pelo cliente de 14/10 09:00 para 15/10 10:00 · há 2 h").
- Turma: lista de participantes com presença individual e vagas.
- Selos e campos novos: **confirmado pelo cliente** (`agenda-client-confirmed`), sinal (valor, status, prazo, "reenviar link de pagamento"), forma (clube/convênio/particular), recurso (sala/cadeira, trocável entre os livres), série ("3ª de 8 · Remarcar/cancelar esta, esta e as próximas, todas"), anamnese (respondida/pendente), termo (assinado/pendente).
- **WhatsApp** (`agenda-whatsapp`): menu com as mensagens prontas (confirmação, lembrete, remarcado, cancelado, sinal) que abrem o `wa.me` com o texto e o link de gerenciar; sem telefone válido, explica.
- **Chegou** (`agenda-checkin`) e **Concluir** (`agenda-complete`) também aqui, com o mesmo diálogo da recepção; concluído mostra as linhas, a comissão e o pagamento.

## Agendamentos (`/agenda/agendamentos`)

Abas Próximos · Aguardando aprovação (contador) · Passados · Cancelados; tabela (cards no celular) com data/hora, cliente, tipo, profissional, status, presença (`agenda-appointment-row`); filtros (pessoa, tipo, período), busca por cliente; ações rápidas na linha (aprovar, cancelar, presença); passados sem presença marcada destacados ("marcar presença").

## Tipos de agendamento (`/agenda/tipos`)

- Lista de cartões (`agenda-type-row`): cor, nome, duração, preço, pessoas (avatares), local, ativo (interruptor), link público (`agenda-type-link`, copiar), ⋯ (duplicar, ocultar, excluir). **+ Tipo de agendamento** (`agenda-type-new`) abre o `FormSheet` com o essencial (nome, duração, local, quem atende) e cria; o resto na tela de edição.
- **Editar tipo** (`/agenda/tipos/[id]`), em abas com prévia da página pública ao lado:
  - **Geral**: nome, endereço (slug, com checagem), descrição, cor, durações (chips), preço.
  - **Local**: tipo de local e o valor (endereço com busca por CEP; link; telefone).
  - **Quem atende**: forma (uma pessoa / qualquer um / todos juntos / o cliente escolhe) com explicação de cada uma, pessoas, agenda usada por cada pessoa, prioridade (arrastar).
  - **Horários**: intervalo entre horários, intervalos antes/depois, antecedência mínima, janela, máximo por dia, vagas (turma) — cada um com uma frase de exemplo ("O cliente vê horários de 30 em 30 min, com no mínimo 2 h de antecedência, até 60 dias à frente").
  - **Perguntas**: editor de perguntas reaproveitado do construtor do Forms (lista + propriedades), nome/e-mail/WhatsApp fixos no topo.
  - **Confirmação e avisos**: aprovação manual, lembretes (24 h, 1 h, outros), política de cancelamento/remarcação, mensagem de confirmação, pesquisa depois (formulário do Forms, se instalado).
- Feature fora do plano: opções com selo Pro e `UpgradeDialog`.

## Disponibilidade (`/agenda/disponibilidade`)

- Seletor de pessoa (owner/admin) e de agenda (padrão + outras, "+ Nova agenda").
- **Semana**: uma linha por dia (`agenda-schedule-day` com `data-dow`) com interruptor de dia aberto/fechado e intervalos (início–fim, "+ intervalo", remover); "copiar para todos os dias úteis"; fuso da agenda.
- **Exceções**: calendário do mês com as datas especiais marcadas; clicar num dia: folga ou horário especial, com nota.
- **Feriados**: lista do ano com os nacionais (bloqueia/não bloqueia conforme a configuração da empresa) e os da empresa.
- Prévia à direita: "Assim fica sua semana" com os horários livres resultantes (`/availability/preview`).
- Salvar com loading; erro no intervalo certo (sobreposição, fim antes do início).

## Clientes (`/agenda/clientes`)

Tabela com nome, contato, agendamentos, faltas, último agendamento; detalhe (**ficha**, `agenda-client-summary`) com visitas, faltas, cancelamentos, gasto, último atendimento e com quem, profissional preferido, "volta em média a cada 21 dias", próximo agendamento, cartão fidelidade (`agenda-client-loyalty`, "7 de 10"), clube (usos do mês), convênio e carteirinha, retornos, aniversário, etiquetas, **anotações** (autosave: "prefere máquina 2 dos lados", "alérgica a dipirona" — a ficha avisa que é visível à equipe), histórico, botão "Agendar" (abre o encaixe) e "Enviar link de agendamento" (WhatsApp/e-mail com `booking-link`).

## Retornos (`/agenda/retornos`)

Lista dos retornos vencendo e vencidos (`agenda-recall-row`): paciente, procedimento, data sugerida, último atendimento, **Enviar link** (WhatsApp com a mensagem `RECALL` e o `booking-link`), **Agendar** (encaixe), **Não vai voltar**. Filtro por mês e procedimento.

## Clube (`/agenda/clube`)

Planos (`agenda-club-plan-row`: nome, preço, serviços, usos, assinantes; **+ Plano** `agenda-club-plan-new`), assinantes (`agenda-club-subscriber-row`: cliente, plano, desde, usos do mês, status com cor e texto — em dia, em atraso, cancelado), receita recorrente do mês, **Assinar para um cliente** e o link público do clube.

## Comissões (`/agenda/comissoes`)

Período (padrão: mês atual) e pessoa; tabela por profissional (`agenda-commission-row` com `data-host`): atendimentos, serviços, produtos, comissão; abrir mostra as linhas. **Fechar período** (`agenda-commission-close`, owner/admin, confirma dizendo o total e que trava as conclusões) → selo "Fechado em 05/11 por Ana". Aba **Regras**: padrão de serviços e produtos, exceções por pessoa e por serviço, com a frase do efeito ("Bia ganha 50% em Coloração"). MEMBER vê só a própria linha.

## Relatórios (`/agenda/relatorios`)

Filtros (período, pessoa, tipo). Cartões: agendados, realizados, taxa de comparecimento, faltas, cancelamentos, receita estimada. Gráficos (padrão do projeto, cores do tema): agendamentos por dia, por tipo, ocupação por profissional, mapa de calor dia × hora, cancelamentos por antecedência. Exportar CSV.

## Configurações (`/agenda/configuracoes`)

- **Perfil do negócio**: segmento (cartões com as palavras de cada um e o que liga), com a prévia de como as telas falam.
- **Página pública**: título, descrição, endereço (`pageSlug`), tema (`agenda_branding`), WhatsApp, rodapé.
- **Confirmação e faltas**: pedir confirmação no lembrete (e quantas horas antes), sinal para quem faltou N vezes, prazo para pagar o sinal, devolução até X h antes.
- **Lista de espera**: prazo para aceitar a vaga oferecida.
- **Fidelidade**: a cada N visitas, quais serviços contam e qual é o prêmio.
- **Recursos** (`agenda-resource-new`, `agenda-resource-row`): cadeiras, salas, macas e equipamentos; ligar/desligar; em quais tipos são usados.
- **Convênios** (clínica): nome, ativo, valor por procedimento.
- **Feriados**: bloquear nacionais, facultativos, feriados da empresa.
- **Lembretes padrão** para tipos novos.
- **Minhas integrações** (todos): conectar Google Agenda / Outlook (se a empresa tiver as credenciais), escolher quais agendas contam como ocupado e onde criar os eventos; **feed da minha agenda** (link `.ics` para assinar, regenerar).
- **Webhooks** (owner/admin, `agenda_integrations`): mesmo componente do Forms.

## Início e trilho

Widgets: **Agenda de hoje** (próximos com hora, cliente e botão de link/WhatsApp), **Aguardando aprovação** (aprovar/recusar direto), **Próximos 7 dias** (contagem por dia). Contador no trilho: aguardando aprovação.

## Contrato testável (data-testid)

A bateria do `/rodsaas:verify` (`suite/tests/12-agenda.spec.ts`) roda quando `rodsaas.json` tem `agenda` em `presets`. Lista canônica em `skills/verify/contract.json` (`presets.agenda`):

| testid | Elemento |
|---|---|
| `agenda-calendar`, `agenda-event` (`data-appointment-id`) | agenda e cada compromisso |
| `agenda-appointment-panel` | painel do agendamento |
| `agenda-confirm`, `agenda-decline`, `agenda-cancel`, `agenda-mark-attended`, `agenda-mark-noshow` | ações do painel |
| `agenda-appointment-row` | linha da lista de agendamentos |
| `agenda-type-new`, `agenda-type-row`, `agenda-type-link` | tipos: novo (abre `form-sheet` com `field-name` e `form-submit`), cartão e link público |
| `agenda-schedule-day` (`data-dow`) | linha do dia na disponibilidade |
| `agenda-public-page`, `agenda-public-type` (`data-type`), `agenda-public-host` (`data-host`), `agenda-public-calendar`, `agenda-public-day` (`data-date`), `agenda-public-slot` (`data-start`), `agenda-public-form`, `agenda-public-confirm`, `agenda-public-confirmed`, `agenda-public-unavailable` | página pública (`04-pagina-publica.md`) |
| `agenda-manage`, `agenda-manage-reschedule`, `agenda-manage-cancel`, `agenda-manage-cancel-confirm`, `agenda-manage-canceled`, `agenda-manage-confirm`, `agenda-manage-confirmed`, `agenda-manage-payment` | gerenciar pelo link |
| `agenda-public-addon` (`data-slug`), `agenda-public-total` (`data-cents`), `agenda-public-insurance`, `agenda-public-payment`, `agenda-public-pay-link`, `agenda-public-intake`, `agenda-public-waitlist`, `agenda-public-waitlist-form`, `agenda-public-waitlist-done`, `agenda-offer`, `agenda-offer-accept`, `agenda-offer-expired` | combo, convênio, sinal, anamnese e lista de espera na página pública |
| `agenda-reception`, `agenda-day-column` (`data-host`), `agenda-reception-card` (`data-appointment-id`, `data-state`), `agenda-checkin`, `agenda-complete`, `agenda-complete-dialog`, `agenda-complete-product-add`, `agenda-complete-method`, `agenda-complete-total` (`data-cents`), `agenda-complete-confirm`, `agenda-whatsapp`, `agenda-client-confirmed` | recepção do dia e painel |
| `agenda-queue`, `agenda-queue-add`, `agenda-queue-name`, `agenda-queue-service`, `agenda-queue-submit`, `agenda-queue-row` (`data-id`, `data-position`), `agenda-queue-eta`, `agenda-queue-call` | fila do dia |
| `agenda-client-summary`, `agenda-client-loyalty`, `agenda-recall-row`, `agenda-club-plan-new`, `agenda-club-plan-row`, `agenda-club-subscriber-row`, `agenda-commission-row` (`data-host`), `agenda-commission-close`, `agenda-resource-new`, `agenda-resource-row` | ficha, retornos, clube, comissões e recursos |
