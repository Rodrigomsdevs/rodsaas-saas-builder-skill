---
name: agenda
description: Preset que soma ao projeto rodsaas o app Agenda, de agendamento online no estilo Calendly que também serve para serviços (salão, clínica, estética, consultoria) — tipos de agendamento com duração, preço e local (presencial, Jitsi, Google Meet, link, telefone, WhatsApp), atendimento por uma pessoa, qualquer um da equipe (rodízio), todos juntos ou o cliente escolhe o profissional, turmas com vagas, disponibilidade semanal com exceções e feriados nacionais automáticos, intervalos, antecedência e limite por dia, página pública com calendário no fuso do cliente, reserva temporária, sem marcar duas vezes (trava no banco), aprovação manual, remarcar e cancelar pelo link, agenda interna por profissional com arrastar e encaixe, compareceu/faltou, clientes, relatórios, e-mails com .ics e lembretes, feed de agenda, Google Agenda e Outlook (ocupados e criação do evento), CRM, Forms e webhooks. Use depois do /rodsaas:backend e /rodsaas:frontend quando o usuário pedir agendamento, agenda online, marcação de horário, reservas de atendimento, clone do Calendly/Cal.com/Agendor, ou chamar /rodsaas:agenda.
---

# rodsaas · agenda

Acrescenta ao projeto o app **Agenda**: a empresa define o que pode ser marcado e quando, compartilha um link, e o cliente escolhe o horário sozinho, sem troca de mensagens. A equipe vê tudo numa agenda por profissional, marca encaixes, confirma presença e recebe lembretes. O preset **soma**: entra como um app na casca de apps (`skills/frontend/references/12-casca-e-apps.md`), sem mexer nos outros apps.

Tudo da base continua valendo: auth, empresas com RLS, membros, planos, padrão REST, erros RFC 9457, cursor, OpenAPI → tipos do front, estados de tela, marca, contrato de testids.

## Pré-requisitos

1. `api/`, `web/` e `rodsaas.json` verdes e já na casca de apps (existe `web/src/config/apps.ts`; senão, `/rodsaas:apps` antes).
2. Extensão **`btree_gist`** no Postgres (trava contra dois agendamentos no mesmo horário). É uma extensão confiável: o dono do banco criado pelo `/rodsaas:db` consegue criar na migration. Se o banco recusar, rode como superusuário (`CREATE EXTENSION btree_gist;`) e siga.
3. Mesma regra de versões das outras skills: `npm view` + doc atual para cada pacote novo (calendário da agenda interna, dnd-kit, `googleapis`/Microsoft Graph se a fase de integrações for feita).
4. Se o preset `forms` existir, reaproveite o `forms-lib` dele para as perguntas do agendamento; se não existir, copie `skills/forms/scripts/forms-lib.mjs` (com os testes) para o projeto.

## Decisões padrão (confirme numa rodada só)

| Decisão | Padrão |
|---|---|
| Para quê | **reuniões e serviços num modelo só**: "tipo de agendamento" com duração, preço opcional e quem atende |
| Quem atende | uma pessoa · qualquer um da equipe (rodízio) · todos juntos · o cliente escolhe o profissional |
| Turmas | sim: tipo com **vagas** por horário (aula, workshop, avaliação em grupo) |
| Videochamada | **sala Jitsi automática** (grátis, sem conta), link fixo por tipo, ou **Google Meet** quando a pessoa conectou o Google |
| Google Agenda e Outlook | fase **opcional**: só liga quando houver credenciais OAuth no `.env`; sem elas, tudo funciona com convite `.ics` e feed de agenda |
| Feriados | nacionais bloqueados automaticamente; pontos facultativos (Carnaval, Corpus Christi) desligados por padrão; feriados municipais e da empresa à mão |
| Endereços públicos | `/agendar/<empresa>`, `/agendar/<empresa>/<tipo>`, `/agendar/<empresa>/p/<pessoa>` no domínio do painel; o cliente gerencia em `/agendamento/<token>` |
| Pagamento | mostra o preço e "pagamento no local"; pagamento antecipado/sinal fica para o add-on `pagamento-br` |
| Nome do app | **Agenda** |
| Planos | Free: 2 tipos, 1 pessoa com agenda, 50 agendamentos/mês; Pro: tipos ilimitados, 10 pessoas, 2.000/mês, equipe, aprovação, turmas, integrações, sem rodapé; Business: pessoas ilimitadas, 20.000/mês |

Fora da v1 (registre no README do projeto): pagamento antecipado/sinal (Pix), pacotes de sessões e agendamento recorrente, lista de espera, recursos (salas, cadeiras, equipamentos), Zoom/Teams, SMS, app de check-in, sincronização completa de mão dupla (a v1 lê os ocupados e cria o evento).

## Fases

Cada fase termina com typecheck, lint, build, testes da fase e commit (`feat(agenda): ...`). Não avance com fase quebrada. Use a lista de tarefas.

1. **Integração e regras** — registro do preset e do **app Agenda**, planos, porte de `scripts/agenda-lib.mjs` (com os testes) para o back: o motor de horários é o coração. → `references/01-escopo-e-integracao.md`
2. **Modelo** — models com RLS, **trava no banco** contra sobreposição, reservas temporárias, tabelas de busca pública sem RLS, conteúdo inicial. → `references/02-modelo.md`
3. **API interna** — configurações, disponibilidades, tipos, agendamentos (encaixe, remarcar, aprovar, cancelar, presença), bloqueios, clientes, relatórios. → `references/03-api.md`
4. **API pública** — página, horários livres, reserva, agendar, gerenciar pelo token, `.ics`, feed. → `references/03-api.md`
5. **Página pública** — passo a passo, calendário, fuso do cliente, formulário, confirmação, remarcar e cancelar, incorporação. → `references/04-pagina-publica.md`
6. **App interno** — agenda por profissional, lista, painel do agendamento, tipos, disponibilidade, clientes, relatórios, configurações. → `references/05-app-interno.md`
7. **Avisos e integrações** — e-mails com `.ics`, lembretes, resumo do dia, CRM, Forms, webhooks, feed; e, se houver credenciais, Google Agenda e Outlook. → `references/06-avisos-e-integracoes.md`
8. **Interações e estados** — arrastar, otimismo, atalhos e todos os estados. → `references/07-interacoes-e-estados.md`
9. **Fechamento** — `references/08-checklist.md`, testes ponta a ponta, `/rodsaas:verify` (tem uma parte só da Agenda: `-g "Agenda"`; ela exige os testids de `05-app-interno.md`, os rótulos **Nome**/**E-mail** da página pública e os formatos ★ de `03-api.md`), README do projeto.

## Princípios

- **Nunca marcar duas vezes.** O motor esconde horário ocupado, o service confere de novo dentro da transação e o banco recusa sobreposição (restrição `EXCLUDE`). Mesmo dois clientes clicando no mesmo segundo, só um consegue.
- **Fuso certo em todo lugar.** Banco em UTC; disponibilidade no fuso de cada pessoa; página no fuso do cliente; e-mails com o fuso escrito por extenso. Todo cálculo de horário passa pelo `agenda-lib` (testado com horário de verão).
- **O cliente não precisa de conta.** Agendar, remarcar e cancelar funcionam pelo link com token secreto; nada de senha.
- **A agenda da equipe é a fonte da verdade.** Encaixe e bloqueio feitos por dentro valem na hora para a página pública.
- **Segurança da base, sem exceção.** RLS `FORCE` em tudo (as tabelas de busca pública sem RLS guardam só slug/hash → ids, com justificativa no README); dados do cliente visíveis só para a equipe da empresa; tokens só como hash; credenciais de agenda externa criptografadas.
- **Todo estado tem tela e toda ação tem feedback** (`references/07-interacoes-e-estados.md`).

## Relatório final

O que foi adicionado (app, telas, endereços públicos), planos e limites novos, como testar em 5 minutos (ajustar o horário semanal → criar o tipo "Consulta 30 min" → abrir o link numa aba anônima → agendar → ver na agenda → remarcar pelo link do e-mail no Mailpit → marcar compareceu), se a integração Google/Outlook foi ligada (e quais variáveis faltam), o resultado do `/rodsaas:verify`, o que ficou fora da v1 e desvios por versão de pacote.

## Mapa das referências

| Arquivo | Quando ler |
|---|---|
| `references/01-escopo-e-integracao.md` | Fase 1: escopo, app na casca, papéis, planos |
| `references/02-modelo.md` | Fase 2: models, trava contra sobreposição, reservas, tokens |
| `references/03-api.md` | Fases 3 e 4: rotas internas e públicas, erros, testes |
| `references/04-pagina-publica.md` | Fase 5 |
| `references/05-app-interno.md` | Fase 6 |
| `references/06-avisos-e-integracoes.md` | Fase 7 |
| `references/07-interacoes-e-estados.md` | Fase 8 |
| `references/08-checklist.md` | Fase 9 |
| `scripts/agenda-lib.mjs` + `agenda-lib.test.mjs` | motor de horários (`computeSlots`), fusos, feriados, rodízio, `.ics`, lembretes, política de cancelamento, tokens, Jitsi: porte para TS com os testes |
