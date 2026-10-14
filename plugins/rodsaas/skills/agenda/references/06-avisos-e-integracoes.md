# Avisos e integrações

## E-mails

Pela fila (pg-boss) e pelo SMTP da base, na marca do produto (ou da empresa), em português, com data e hora **no fuso do destinatário** escritas por extenso (`formatAppointment`).

| Para | Quando | Conteúdo |
|---|---|---|
| cliente | confirmado | resumo, local/link, `.ics` anexo (`buildIcs`, `METHOD:REQUEST`), botões "Adicionar ao Google Agenda", "Remarcar ou cancelar" |
| cliente | aguardando aprovação | "Recebemos seu pedido"; sem link de videochamada |
| cliente | aprovado / recusado | como confirmado / com o motivo e o link para escolher outro horário |
| cliente | lembretes (padrão 24 h e 1 h antes) | resumo, link, "Remarcar ou cancelar" (se a política ainda permite); o lembrete de `confirmationHoursBefore` (padrão 24 h) leva **Confirmo presença** (link de gerenciar com `?confirmar=1`) |
| cliente | sinal pendente | valor, prazo e o botão **Pagar sinal** (página do Financeiro); 10 min antes de vencer, um lembrete |
| cliente | vaga da lista de espera | o horário, o prazo para aceitar e **Quero esse horário** (`/espera/<token>`) |
| cliente | retorno vencendo (clínica) | "Já está na hora do seu retorno" com o `booking-link` do procedimento (uma vez; a recepção pode reenviar) |
| cliente | anamnese / termo (primeira vez) | link do formulário do Forms / do envelope do Comercial, junto da confirmação |
| cliente | remarcado | novo horário; `.ics` com o mesmo `UID` e `SEQUENCE` maior (o calendário do cliente atualiza o evento) |
| cliente | cancelado (por qualquer lado) | `.ics` com `METHOD:CANCEL`; link para agendar de novo |
| cliente | depois do atendimento (compareceu) | pesquisa do Forms (se configurada) |
| equipe | novo agendamento, pendente de aprovação, remarcado/cancelado pelo cliente | pelo `notify()` do add-on `notificacoes` (sino + e-mail conforme a preferência; ator nulo quando foi o cliente), tipos `agenda.booked`, `agenda.pending`, `agenda.rescheduled`, `agenda.canceled` |
| equipe | resumo do dia (7 h no fuso da empresa) | agenda do dia de cada pessoa |
| equipe | sinal pago · sinal vencido · vaga preenchida pela lista · retornos da semana · clube em atraso | `agenda.deposit_paid`, `agenda.deposit_expired`, `agenda.waitlist_booked`, `agenda.recalls_due`, `agenda.club_past_due` |

**Lembretes**: ao confirmar (ou remarcar), agende os jobs com `reminderTimes(start, offsets, { createdAt, now })` (chave única por agendamento + offset, para remarcar/cancelar apagar ou trocar). No disparo, confira de novo se o agendamento continua confirmado e no mesmo horário (evita lembrete de horário velho). Grave `AgendaEvent` "reminder_sent".

Falha de envio: 3 novas tentativas; depois, `AgendaEvent` "email_failed" visível no painel com "Reenviar".

## WhatsApp

Barbearia e clínica confirmam no WhatsApp, não no e-mail. A v1 trabalha em dois níveis:

1. **Sem integração (sempre)**: cada aviso ao cliente tem a **mensagem pronta** (`clientMessage`, texto curto com o link de gerenciar/pagar/aceitar) e o link `wa.me` (`waLink`, telefone normalizado com `normalizePhoneBR`). O painel, a recepção, os retornos e a lista de espera têm o botão **WhatsApp** que abre o app com o texto preenchido — a recepção manda com um toque, do número da empresa. A API devolve os links no detalhe do agendamento (`whatsapp.links`).
2. **Com o add-on `whatsapp`** (`/rodsaas:whatsapp`, motor com drivers: falso, Meta, Zenvia, RodTicket): `notifyClient(appointment, kind)` manda e-mail **e** a mensagem automática com o mesmo texto (modelos aprovados), e as respostas "1 = confirmo" voltam como confirmação. Sem o add-on conectado, `notifyClient` só manda e-mail e os botões `wa.me` continuam. Modelos usados: `agenda_confirmacao`, `agenda_lembrete`, `agenda_sinal`, `espera_vaga` (`skills/whatsapp/references/03-telas-e-integracoes.md`).

Cliente que pediu para não receber (`whatsappOptOut`) não aparece nos botões nem nas mensagens automáticas.

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

## Financeiro, ERP, Comercial e Forms (operação)

- **Sinal**: cobrança do Financeiro (Pix e cartão, a do próprio Stripe da empresa) ligada ao agendamento; o webhook de pago chama `onDepositPaid(appointmentId)` (idempotente). Devolução do sinal → estorno pela cobrança; retido → fica como receita (categoria `servicos`).
- **Concluir**: receita recebida por forma de pagamento (serviços em `servicos`, produtos em `vendas`), com o cliente como contato; convênio entra como **a receber** do convênio (contato = convênio) com o valor do convênio.
- **Clube**: recorrência mensal no Financeiro por assinatura; não paga → `PAST_DUE` (aviso `agenda.club_past_due`); paga de novo → `ACTIVE`.
- **Comissões**: fechamento gera as contas a pagar por pessoa.
- **ERP**: produto vendido na conclusão baixa o estoque como venda de balcão (canal `AGENDA`); sem ERP, a linha de produto é só nome e valor.
- **Comercial**: termo de consentimento do tipo vira um envelope de assinatura para o cliente (link junto da confirmação); o status aparece no painel.
- **Forms**: anamnese = formulário com os ocultos `agendamento` e `cliente`; a resposta fica ligada ao agendamento e à ficha.

Sem o app integrado, a tela do recurso explica o que falta ("Para cobrar sinal, instale o Financeiro") e a opção fica desligada; nada quebra.

## Webhooks (`agenda_integrations`)

Eventos `appointment.booked`, `appointment.confirmed`, `appointment.declined`, `appointment.rescheduled`, `appointment.canceled`, `appointment.attendance`, `appointment.checked_in`, `appointment.completed` (com as linhas), `appointment.deposit_paid`, `waitlist.offered`. Mesmo formato, assinatura (`signWebhook` do `forms-lib`), novas tentativas, proteção SSRF e histórico do Forms (`skills/forms/references/06-respostas-e-integracoes.md`). Corpo com o agendamento (tipo, início, fim, status, profissionais, participantes com nome/e-mail/telefone e respostas, link de gerenciar **não** incluído).
