# Página pública de agendamento

Fora do grupo `(app)`: sem casca, sem guard. Renderização no servidor do Next para o título e o compartilhamento (metadata com o nome da empresa e do tipo; `robots` indexável só para a página da empresa, se a empresa quiser), interação no navegador. Bundle separado do app logado (carrega rápido no celular).

## Rotas

| Rota | Tela |
|---|---|
| `/agendar/[pagina]` | página da empresa: logo, nome, descrição, botão WhatsApp, lista dos tipos (cartões `agenda-public-type` com `data-type`: nome, duração, preço, local, "Turma · N vagas") e, se houver mais de uma pessoa, a equipe |
| `/agendar/[pagina]/[tipo]` | agendar um tipo (passo a passo abaixo) |
| `/agendar/[pagina]/p/[pessoa]` | página da pessoa: foto, nome, bio e os tipos em que ela atende (agendar a partir dela já fixa a pessoa) |
| `/agendamento/[token]` | o cliente vê, remarca ou cancela |

## Passo a passo (`/agendar/[pagina]/[tipo]`)

Desktop em duas colunas (resumo à esquerda, passos à direita); celular em uma coluna com o resumo recolhível no topo. Container `data-testid="agenda-public-page"`.

1. **Resumo**: empresa, tipo, duração (seletor se houver várias), preço ("pagamento no local"), local (ícone + texto; "o link da videochamada chega por e-mail"), descrição.
2. **Profissional** (só `CLIENT`): cartões com foto e nome (`agenda-public-host` com `data-host`) + "Qualquer um disponível". Escolher recarrega os horários.
3. **Dia**: calendário do mês (`agenda-public-calendar`) com navegação de mês; cada dia é `agenda-public-day` com `data-date`; dias sem horário ficam desabilitados (`disabled` + `aria-disabled`), dias com horário em destaque. Abre já no primeiro dia com horário. Carrega os horários do mês visível + o próximo (`/slots`), com skeleton na grade.
4. **Horário**: lista de botões (`agenda-public-slot` com `data-start` em ISO) agrupados em Manhã / Tarde / Noite; turma mostra "2 vagas". Acima: **fuso** detectado do navegador ("Horários em Horário de Brasília · trocar"), com seletor de fuso (os mais comuns primeiro). Escolher um horário cria a **reserva de 5 min** (`/holds`) e mostra o contador discreto "Horário reservado por 4:59".
5. **Dados** (`agenda-public-form`): campos com os rótulos exatos **Nome**, **E-mail** e **WhatsApp** (máscara BR; obrigatório quando `phoneRequired`) e as perguntas do tipo, renderizadas com o mesmo componente do Forms (`PublicField`), cada campo com `<label>` ligado e erro no campo; texto de privacidade. Botão **Confirmar agendamento** (`agenda-public-confirm`, com loading e `Idempotency-Key`).
6. **Confirmado** (`agenda-public-confirmed`): "Agendamento confirmado!" (ou "Pedido enviado: aguarde a confirmação" quando exige aprovação), data e hora por extenso no fuso do cliente (`formatAppointment`), local/link, botões **Adicionar ao Google Agenda** (`googleCalendarLink`), **Outlook/Apple (.ics)**, e "Remarcar ou cancelar" (link do token). Aviso "Enviamos tudo para ana@exemplo.com".

Erros:
- Horário pego enquanto preenchia (409 `SLOT_TAKEN`/`HOLD_EXPIRED`): volta para o passo 4 com aviso "Esse horário acabou de ser reservado. Escolha outro." e os horários recarregados; os dados digitados ficam.
- Reserva venceu (contador zerou): aviso e tenta reservar de novo ao confirmar.
- 400: erros nos campos.
- Página indisponível (410): tela `agenda-public-unavailable` "Agenda indisponível no momento" com o WhatsApp da empresa, se houver.
- Sem nenhum horário na janela: "Sem horários disponíveis nos próximos dias" + WhatsApp.

Detalhes:
- URL guarda o estado (`?data=2026-10-15&hora=2026-10-15T12:00:00Z&duracao=60&pessoa=ana`): voltar do navegador funciona e o link pode ser enviado com o horário sugerido.
- Pré-preenchimento por URL (`?nome=&email=&telefone=`), usado pelo link do CRM.
- Acessível por teclado: setas no calendário, Enter escolhe, foco vai para o próximo passo; anúncio "Horário 09:30 selecionado".
- Campo isca invisível e `_ts` (mesma técnica do Forms).
- Tema: marca do produto ou da empresa (`agenda_branding`); rodapé "Feito com {produto}" no Free.

## Gerenciar (`/agendamento/[token]`, `agenda-manage`)

- Resumo: status (confirmado, aguardando aprovação, cancelado, realizado), data e hora no fuso do cliente (com seletor de fuso), tipo, profissional, local/link (só confirmado), botão "Adicionar à agenda".
- **Remarcar** (`agenda-manage-reschedule`): abre o mesmo calendário/horários do tipo (mesma pessoa, ou equipe conforme o tipo); confirmar troca o horário e mostra o novo resumo.
- **Cancelar** (`agenda-manage-cancel`): pede o motivo (opcional) e confirmação (`agenda-manage-cancel-confirm`) → tela `agenda-manage-canceled` "Agendamento cancelado" com "Agendar outro horário".
- Fora da política: botões desabilitados com a explicação ("Alterações só até 2 h antes. Fale com a empresa pelo WhatsApp.").
- Token inválido: "Agendamento não encontrado".

## Incorporar

- **Iframe** de `/agendar/[pagina]/[tipo]?embed=1` (sem fundo e sem rodapé de navegação) com altura automática por `postMessage` (`rodsaas-agenda:height`) e evento `rodsaas-agenda:booked` ao confirmar.
- **Botão flutuante**: script de poucas linhas que abre a página num modal sobre o site do cliente.
- `frame-ancestors *` **só** nas rotas públicas de agendamento; o resto do app segue `'self'`.
- Tela de compartilhar no app: link, QR code (PNG/SVG), código do iframe e do botão, e "Enviar pelo WhatsApp".
