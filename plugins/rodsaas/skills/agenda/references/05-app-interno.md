# App interno (telas)

Dentro do app **Agenda** da casca de apps. Componentes, estados e formulários da skill `frontend`. Código em `web/src/features/agenda/`.

## Rotas

| Rota | Tela |
|---|---|
| `/agenda` | agenda (calendário) — `?visao=dia\|semana\|mes&data=YYYY-MM-DD&pessoas=ana,bia` |
| `/agenda/agendamentos` | lista (`?aba=proximos\|pendentes\|passados\|cancelados`); `?a=<id>` abre o painel |
| `/agenda/tipos` · `/agenda/tipos/[id]` | tipos de agendamento · editar tipo |
| `/agenda/disponibilidade` | minhas agendas (owner/admin escolhem a pessoa) |
| `/agenda/clientes` · `/agenda/clientes/[id]` | clientes |
| `/agenda/relatorios` | relatórios |
| `/agenda/compartilhar` | link da página, QR code, incorporar |
| `/agenda/configuracoes` | página pública, feriados, lembretes padrão, integrações, webhooks (owner/admin; "Minhas integrações" para todos) |

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

Tabela com nome, contato, agendamentos, faltas, último agendamento; detalhe com histórico, próximos, botão "Agendar" (abre o encaixe) e "Enviar link de agendamento" (WhatsApp/e-mail com `booking-link`).

## Relatórios (`/agenda/relatorios`)

Filtros (período, pessoa, tipo). Cartões: agendados, realizados, taxa de comparecimento, faltas, cancelamentos, receita estimada. Gráficos (padrão do projeto, cores do tema): agendamentos por dia, por tipo, ocupação por profissional, mapa de calor dia × hora, cancelamentos por antecedência. Exportar CSV.

## Configurações (`/agenda/configuracoes`)

- **Página pública**: título, descrição, endereço (`pageSlug`), tema (`agenda_branding`), WhatsApp, rodapé.
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
| `agenda-manage`, `agenda-manage-reschedule`, `agenda-manage-cancel`, `agenda-manage-cancel-confirm`, `agenda-manage-canceled` | gerenciar pelo link |
