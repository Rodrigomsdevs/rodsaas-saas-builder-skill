# Avisos e integrações

## E-mails

Pela fila (pg-boss) e pelo SMTP da base, na marca do produto (ou da empresa), em português, com data e hora **no fuso do destinatário** escritas por extenso (`formatAppointment`).

| Para | Quando | Conteúdo |
|---|---|---|
| cliente | confirmado | resumo, local/link, `.ics` anexo (`buildIcs`, `METHOD:REQUEST`), botões "Adicionar ao Google Agenda", "Remarcar ou cancelar" |
| cliente | aguardando aprovação | "Recebemos seu pedido"; sem link de videochamada |
| cliente | aprovado / recusado | como confirmado / com o motivo e o link para escolher outro horário |
| cliente | lembretes (padrão 24 h e 1 h antes) | resumo, link, "Remarcar ou cancelar" (se a política ainda permite) |
| cliente | remarcado | novo horário; `.ics` com o mesmo `UID` e `SEQUENCE` maior (o calendário do cliente atualiza o evento) |
| cliente | cancelado (por qualquer lado) | `.ics` com `METHOD:CANCEL`; link para agendar de novo |
| cliente | depois do atendimento (compareceu) | pesquisa do Forms (se configurada) |
| equipe | novo agendamento, pendente de aprovação, remarcado/cancelado pelo cliente | pelo módulo `notifications` (sino + e-mail conforme a preferência), tipos `agenda.booked`, `agenda.pending`, `agenda.rescheduled`, `agenda.canceled` |
| equipe | resumo do dia (7 h no fuso da empresa) | agenda do dia de cada pessoa |

**Lembretes**: ao confirmar (ou remarcar), agende os jobs com `reminderTimes(start, offsets, { createdAt, now })` (chave única por agendamento + offset, para remarcar/cancelar apagar ou trocar). No disparo, confira de novo se o agendamento continua confirmado e no mesmo horário (evita lembrete de horário velho). Grave `AgendaEvent` "reminder_sent".

Falha de envio: 3 novas tentativas; depois, `AgendaEvent` "email_failed" visível no painel com "Reenviar".

O ponto de extensão para **WhatsApp** fica pronto: cada aviso ao cliente passa por `notifyClient(appointment, kind)`, que hoje manda e-mail e, quando o add-on `whatsapp` existir, também a mensagem (com o mesmo texto curto).

## Feed `.ics` por pessoa

`/v1/public/agenda/feed/<token>.ics`: compromissos da pessoa (próximos 90 dias, últimos 30), título "Consulta · Ana S." e local, **sem** respostas das perguntas nem contatos completos (o feed pode ser assinado em apps de terceiros). Token regenerável na tela (o antigo para na hora). Cache 5 min.

## Google Agenda e Outlook (opcional)

Só ligue esta parte se houver credenciais. Sem elas, a tela de integrações mostra "Disponível quando o administrador configurar" e o resto funciona com `.ics` e feed.

Variáveis em `api/.env`:

```
AGENDA_ENCRYPTION_KEY=          # 32 bytes em base64 (openssl rand -base64 32); criptografa os tokens
GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID= / MICROSOFT_CLIENT_SECRET= / MICROSOFT_TENANT=common
```

- **OAuth** com `state` assinado (contra CSRF) e PKCE; escopos mínimos:
  - Google: `https://www.googleapis.com/auth/calendar.freebusy` (ocupados), `https://www.googleapis.com/auth/calendar.events` (criar eventos e Meet) e `openid email`;
  - Microsoft (Graph): `Calendars.ReadWrite`, `offline_access`, `User.Read`.
  Confira na documentação atual de cada provedor se os escopos mudaram.
- **Verificação do Google**: escopos de agenda são "sensíveis"; para clientes fora da sua organização, o app precisa passar pela verificação do Google (leva semanas). Até lá, funciona em modo de teste com até 100 usuários cadastrados como testadores. Diga isso no relatório final.
- **Ocupados**: ao calcular horários para a página, busque os ocupados das pessoas envolvidas no intervalo pedido (Google `freebusy.query`, Microsoft `getSchedule`) com cache de 2 min por pessoa e intervalo; eles entram no `busy` do `computeSlots`. No agendar, consulte de novo (sem cache). Provedor fora do ar ou token inválido: segue sem os ocupados externos, marca a conexão `NEEDS_REAUTH`/erro e avisa a pessoa (não derruba a página).
- **Criar o evento** na agenda escolhida da pessoa (fila), com o cliente como convidado (o provedor manda o convite dele; desligue o nosso `.ics` nesse caso para não duplicar) e, se o local for Google Meet, `conferenceData` para gerar o link; guarde os ids em `Appointment.externalEvents`. Remarcar/cancelar atualiza ou apaga o evento.
- Tokens criptografados (AES-256-GCM, IV aleatório, chave do `.env`); renovação automática com o refresh token; "Desconectar" revoga no provedor e apaga.

## CRM (preset `crm` + `agenda_integrations`)

- Cliente do agendamento casa com um **contato do CRM** por e-mail/telefone (ou cria, se a configuração "criar contato no CRM" estiver ligada); `AgendaClient.crmContactId`.
- Cada agendamento vira **atividade "Reunião"** (concluída ao marcar compareceu) no contato e, se houver negócio aberto do contato com o mesmo responsável, no negócio.
- No negócio e no contato do CRM: botão **"Enviar link de agendamento"** (escolhe o tipo, gera o link pré-preenchido com `booking-link` e abre WhatsApp/e-mail) e a lista dos próximos agendamentos.

## Forms

- Perguntas do tipo usam o esquema e os componentes do Forms.
- Pesquisa depois: com `followUpFormId`, o e-mail pós-atendimento leva o link do formulário com campos ocultos `agendamento=<id>&tipo=<slug>` (o formulário precisa declarar esses ocultos; a tela avisa).

## Webhooks (`agenda_integrations`)

Eventos `appointment.booked`, `appointment.confirmed`, `appointment.declined`, `appointment.rescheduled`, `appointment.canceled`, `appointment.attendance`. Mesmo formato, assinatura (`signWebhook` do `forms-lib`), novas tentativas, proteção SSRF e histórico do Forms (`skills/forms/references/06-respostas-e-integracoes.md`). Corpo com o agendamento (tipo, início, fim, status, profissionais, participantes com nome/e-mail/telefone e respostas, link de gerenciar **não** incluído).
