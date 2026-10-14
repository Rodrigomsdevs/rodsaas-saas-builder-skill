# Escopo e integração

## Escopo da v1

| Área | Inclui |
|---|---|
| **Tipos de agendamento** | nome, endereço (slug), descrição, cor, durações (uma ou várias opções), preço opcional, local (presencial com endereço, Jitsi automático, Google Meet, link fixo, telefone do cliente, telefone da empresa, WhatsApp, a combinar), quem atende, intervalo entre horários, intervalos antes/depois, antecedência mínima, janela máxima, máximo por dia por pessoa, vagas (turma), aprovação manual, perguntas (esquema do `forms-lib`), política de cancelamento/remarcação, lembretes, ativo/oculto, pesquisa depois do atendimento (formulário do Forms) |
| **Quem atende** | uma pessoa · qualquer um da equipe (rodízio equilibrado, com prioridade) · todos juntos (só horários em que todos estão livres) · o cliente escolhe (com "qualquer um" como opção) |
| **Disponibilidade** | horário semanal por pessoa com vários intervalos no dia e fuso próprio; várias agendas por pessoa (ex.: "Consultas" e "Retornos") com uma padrão; exceções por data (folga ou horário especial); feriados nacionais automáticos e da empresa; bloqueios na agenda |
| **Página pública** | página da empresa, do tipo e da pessoa; passo a passo serviço → profissional → dia → horário → dados → confirmação; fuso do cliente; reserva temporária de 5 min; perguntas; confirmação com "adicionar à agenda"; remarcar e cancelar pelo link; incorporar (iframe e botão flutuante); QR code; marca |
| **Agenda interna** | dia/semana/mês, **colunas por profissional**, arrastar para remarcar, redimensionar, encaixe clicando num horário vazio, bloqueios, cores por tipo ou status, ir para hoje/data, filtros |
| **Agendamentos** | lista por situação (próximos, aguardando aprovação, passados, cancelados), painel com cliente, respostas, local/link, anotações internas, histórico, aprovar/recusar, remarcar, cancelar com motivo, compareceu/faltou por participante, reenviar confirmação |
| **Clientes** | quem agendou (sem duplicar por e-mail/telefone), histórico, faltas, ligação com contato do CRM |
| **Relatórios** | agendamentos por período e por tipo, comparecimento × faltas, cancelamentos e remarcações (e com quanta antecedência), horários e dias mais procurados, ocupação por profissional, receita estimada |
| **Avisos** | e-mails para o cliente (confirmação com `.ics`, aguardando aprovação, aprovado/recusado, lembretes, remarcado, cancelado, pesquisa depois) e para a equipe (novo, pendente de aprovação, cancelado, resumo do dia) |
| **Integrações** | feed `.ics` por pessoa; CRM (contato + atividade "Reunião"); Forms (perguntas, anamnese e pesquisa depois); Comercial (termo de consentimento); Financeiro (sinal, receita do atendimento, clube, comissões); ERP (produto vendido no atendimento); webhooks assinados; Google Agenda e Outlook (ocupados + criar evento + Meet), opcional |
| **Recursos** | cadeiras, salas, macas e equipamentos (`AgendaResource`); o tipo diz de qual grupo precisa e basta **um** livre; trava no banco também por recurso (`09`, `02`) |
| **Combos** | serviços somados num atendimento só (corte + barba): duração e preço somados, mesma pessoa, desconto opcional do combo (`combo`) |
| **Bloqueios e encaixes** | bloquear horário (almoço, folga, consulta externa) e encaixe por cima da disponibilidade com confirmação; encaixe no passado (até 30 dias) para lançar o atendimento que já aconteceu |
| **Recorrência** | série semanal, quinzenal ou mensal (`recurrenceStarts`), com o que conflita listado; editar ou cancelar só esta, esta e as próximas, ou todas |
| **Lista de espera** | o cliente entra na fila de um tipo (período e dias que servem); vagou → o primeiro recebe o horário segurado com prazo para confirmar; não confirmou → o próximo (`waitlistCandidates`) |
| **Sinal** | pagamento antecipado por Pix/cartão pelo Financeiro (valor fixo ou %, `depositAmount`), exigido pelo tipo ou para quem já faltou N vezes; horário segurado até pagar; devolução pela antecedência (`depositRefund`) |
| **Confirmação** | o lembrete pede "confirmo / remarcar / cancelar"; status "confirmado pelo cliente" na agenda; mensagens prontas de **WhatsApp** (link `wa.me` com o texto) em cada aviso |
| **Recepção** | visão do dia com colunas por profissional, chegada (check-in), atrasados, concluir o atendimento com serviços, produtos e forma de pagamento (`10`) |
| **Comissões** | regras por pessoa e serviço, extrato do período e fechamento (`10`) |
| **Clube e fidelidade** | assinatura mensal com usos e cobrança recorrente; cartão "a cada N, um grátis" (`10`) |
| **Fila do dia** | quem chega sem hora marcada, com posição e previsão de espera; chamar vira atendimento (`10`) |
| **Clínica** | convênios aceitos por procedimento e valor do convênio, anamnese antes da primeira consulta, termo de consentimento, retorno sugerido com lista de retornos vencendo (`09`) |
| **Perfis de segmento** | barbearia, salão, clínica, odonto, pet, consultoria: vocabulário, o que vem ligado e tipos de exemplo (`09`) |

## App na casca

`web/src/features/agenda/app.tsx` e `config/apps.ts` (`skills/frontend/references/12-casca-e-apps.md`):

```ts
export const agendaApp: AppDef = {
  id: 'agenda', name: 'Agenda', description: 'Agendamento online e agenda da equipe',
  icon: CalendarDays, category: 'vendas', order: 45, defaultPinned: true,
  match: ['/agenda'], home: '/agenda',
  Sidebar: AgendaSidebar,
  action: { label: 'Agendamento', onSelect: openNewAppointment },
  useBadge: usePendingApprovalCount,         // aguardando aprovação (das agendas que a pessoa vê)
  widgets: [todayAgendaWidget, pendingApprovalWidget, nextAppointmentsWidget],
  search: agendaSearchProvider,              // clientes e agendamentos (nome, e-mail, telefone)
  settings: { label: 'Agenda', href: '/agenda/configuracoes' },
}
```

Acrescente `{ id: 'agenda', name: 'Agenda', home: '/agenda' }` em `rodsaas.json → apps` e `"agenda"` em `presets`.

**Menu do app** (`AgendaSidebar`): **Recepção do dia** (quando o perfil destaca) · Agenda (hoje em destaque) · Agendamentos (com contador de "aguardando aprovação") · Fila (com contador) · Tipos de agendamento (rótulo do perfil: "Serviços", "Procedimentos") · Disponibilidade · Clientes ("Pacientes", "Tutores") · Retornos (clínica) · Clube · Comissões · Relatórios · seção **Minha página** com o link público (copiar, abrir) · Configurações (owner/admin). Itens de recurso desligado ou fora do plano não aparecem (fora do plano: aparecem com selo para o owner). Os rótulos vêm do perfil (`09-perfis-de-segmento.md`).

As páginas públicas (`/agendar/...`, `/agendamento/[token]`) ficam fora do grupo `(app)`: sem casca e sem login.

## Papéis

| Ação | OWNER / ADMIN | MEMBER |
|---|---|---|
| ver a agenda | de todos | a própria e a de quem compartilhou (equipe do mesmo tipo de agendamento) |
| editar a própria disponibilidade | ✅ | ✅ |
| editar a disponibilidade dos outros | ✅ | — |
| criar e editar tipos de agendamento | todos | os que criou (como única pessoa que atende) |
| criar encaixe, remarcar, cancelar, presença | qualquer agenda | os agendamentos em que atende |
| aprovar/recusar | qualquer agenda | os seus |
| clientes e relatórios | todos | os seus clientes e números |
| configurações da página, feriados da empresa, integrações da empresa, webhooks | ✅ | — |
| conectar a própria agenda Google/Outlook | ✅ | ✅ |
| check-in, concluir, fila do dia | qualquer agenda | os em que atende (e a fila toda) |
| recursos, convênios, clube (planos), fidelidade, regras de comissão, fechar comissões | ✅ | — |
| ver comissões | de todos | só as próprias |
| ficha do cliente (anotações) | ✅ | dos seus clientes |

Agendamento que a pessoa não pode ver responde **404**.

## Acessos no convite (`registerMemberAccess('agenda', …)`)

O registro é da base (`skills/backend/references/10-acessos-por-pessoa.md`): a tela de convite e a de "Acessos da pessoa" desenham estes campos sem conhecer o app; `read` lê da fonte da verdade do app (nunca de uma cópia) e `apply` é idempotente.

| Campo | Tipo | Padrão | Aplica |
|---|---|---|---|
| `isHost` | boolean "Atende clientes" | não | cria a disponibilidade da pessoa (`AgendaSchedule` com o horário padrão da empresa) |
| `eventTypeIds` | multiselect "Tipos de atendimento" (`source`: tipos ativos; só com `isHost`) | vazio | entra como anfitrião (`AgendaEventTypeHost`) nos tipos escolhidos |

- `canGrant`: OWNER e ADMIN. `validate`: limite `agendaHosts` (pessoas que atendem em algum tipo ativo).
- `countsSeat`: sim. Quem só vê a agenda da equipe usa o app sem `isHost`.

## Planos

Acrescente em **todos** os planos de `config/plans.ts` (preservando o que existe):

| | Free | Pro | Business |
|---|---|---|---|
| limite `agendaEventTypes` (tipos ativos) | 2 | ilimitado | ilimitado |
| limite `agendaHosts` (pessoas que atendem em algum tipo ativo) | 1 | 10 | ilimitado |
| limite `agendaBookingsMonthly` (agendamentos criados no mês, públicos e internos) | 50 | 2.000 | 20.000 |
| feature `agenda_team` (rodízio, todos juntos, cliente escolhe, aprovação manual, turmas) | — | ✅ | ✅ |
| feature `agenda_integrations` (Google/Outlook, webhooks, CRM) | — | ✅ | ✅ |
| feature `agenda_branding` (sem o rodapé "Feito com {produto}", capa e cores próprias) | — | ✅ | ✅ |
| feature `agenda_resources` (cadeiras, salas, equipamentos) | — | ✅ | ✅ |
| feature `agenda_recurring` (séries) | — | ✅ | ✅ |
| feature `agenda_waitlist` (lista de espera) | — | ✅ | ✅ |
| feature `agenda_deposits` (sinal pelo Financeiro) | — | ✅ | ✅ |
| feature `agenda_commissions` (regras, extrato, fechamento) | — | ✅ | ✅ |
| feature `agenda_club` (clube de assinatura) | — | ✅ | ✅ |
| feature `agenda_loyalty` (fidelidade) | — | ✅ | ✅ |
| feature `agenda_clinic` (convênios, anamnese, termo, retornos) | — | ✅ | ✅ |
| e-mails, lembretes, `.ics`, feed, Jitsi, relatórios, perguntas, perfis de segmento, combos, bloqueios, confirmação, mensagens de WhatsApp, recepção (check-in e concluir), ficha do cliente, fila do dia | ✅ | ✅ | ✅ |

Regras:
- Limite mensal atingido: a página pública mostra "Agenda indisponível no momento" (sem detalhar), o owner recebe aviso em 80% e 100%, e a equipe ainda consegue criar encaixe interno (com aviso de que passou do plano). Nenhum agendamento é descartado em silêncio.
- Rebaixar de plano: tipos e pessoas acima do limite ficam inativos na página pública (os agendamentos marcados continuam); recursos de equipe deixam de aparecer para novos agendamentos.
