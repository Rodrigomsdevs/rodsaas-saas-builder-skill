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
| **Integrações** | feed `.ics` por pessoa; CRM (contato + atividade "Reunião"); Forms (perguntas e pesquisa depois); webhooks assinados; Google Agenda e Outlook (ocupados + criar evento + Meet), opcional |

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

**Menu do app** (`AgendaSidebar`): Agenda (hoje em destaque) · Agendamentos (com contador de "aguardando aprovação") · Tipos de agendamento · Disponibilidade · Clientes · Relatórios · seção **Minha página** com o link público (copiar, abrir) · Configurações (owner/admin).

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

Agendamento que a pessoa não pode ver responde **404**.

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
| e-mails, lembretes, `.ics`, feed, Jitsi, relatórios, perguntas | ✅ | ✅ | ✅ |

Regras:
- Limite mensal atingido: a página pública mostra "Agenda indisponível no momento" (sem detalhar), o owner recebe aviso em 80% e 100%, e a equipe ainda consegue criar encaixe interno (com aviso de que passou do plano). Nenhum agendamento é descartado em silêncio.
- Rebaixar de plano: tipos e pessoas acima do limite ficam inativos na página pública (os agendamentos marcados continuam); recursos de equipe deixam de aparecer para novos agendamentos.
