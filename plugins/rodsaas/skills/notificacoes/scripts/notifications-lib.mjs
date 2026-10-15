// rodsaas · notificacoes — regras puras das notificações (sem banco, sem rede).
// Catálogo de tipos, preferências por tipo e canal, filtro de destinatários, agrupamento, prazo do
// e-mail imediato, resumo diário no fuso da empresa, frase com destaques (sem HTML), dia/hora relativos,
// contador do sino e token de descadastro do e-mail.
// Porte para TypeScript em api/src/modules/notifications/lib/ (e o que o front usar: frase, dia, hora
// relativa, contador), junto com os testes de notifications-lib.test.mjs. Rode: node --test notifications-lib.test.mjs

import { createHmac, timingSafeEqual } from "node:crypto";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const toMs = (v) => (v == null ? null : typeof v === "number" ? v : v instanceof Date ? v.getTime() : Date.parse(v));
const pad = (n) => String(n).padStart(2, "0");

// ------------------------------------------------------------------ catálogo

export const EMAIL_MODES = ["IMMEDIATE", "DAILY", "OFF"];
const EMAIL_RANK = { OFF: 0, DAILY: 1, IMMEDIATE: 2 };
export const TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** Rótulo dos grupos de apps na tela de preferências e no resumo. */
export const APP_LABELS = {
  geral: "Geral", tarefas: "Tarefas", crm: "CRM", forms: "Forms", agenda: "Agenda", helpdesk: "Suporte", paginas: "Páginas",
};

/**
 * Normaliza a definição de um tipo.
 * group.by: "none" (cada evento é uma notificação), "entity" (mesmo tipo + mesmo registro) ou "key" (chave do evento).
 * windowMinutes: janela deslizante para juntar eventos; maxMinutes: idade máxima de um grupo aberto.
 * defaultEmail: e-mail padrão do tipo (a preferência geral da pessoa nunca é superada para cima).
 * critical: não dá para desligar (no app sempre; e-mail sempre imediato). Use só para segurança e cobrança.
 */
export function defineType(d) {
  const g = d.group ?? { by: "entity" };
  return {
    type: d.type,
    appId: d.appId,
    label: d.label,
    description: d.description ?? "",
    template: d.template,
    group: { by: g.by ?? "entity", windowMinutes: g.windowMinutes ?? 2, maxMinutes: g.maxMinutes ?? 60 },
    defaultEmail: d.defaultEmail ?? "IMMEDIATE",
    critical: !!d.critical,
    requires: d.requires ?? null,
    roles: d.roles ?? null, // papéis que podem receber (null = todos); some das preferências de quem não pode
  };
}

const PLACEHOLDER_RE = /\{([^{}]+)\}/g;
const KNOWN_VARS = new Set(["actor", "actors", "title", "count", "org"]);

/** Erros de um catálogo: tipo inválido/repetido, app faltando, modelo vazio, chaves desconhecidas. */
export function validateCatalog(list) {
  const errors = [], seen = new Set();
  for (const raw of list) {
    const t = defineType(raw);
    const where = t.type ?? "(sem tipo)";
    if (!TYPE_RE.test(String(t.type ?? ""))) errors.push(`${where}: tipo deve ser "area.evento" em minúsculas`);
    if (seen.has(t.type)) errors.push(`${where}: tipo repetido`);
    seen.add(t.type);
    if (!t.appId) errors.push(`${where}: appId obrigatório`);
    if (!t.label) errors.push(`${where}: label obrigatório`);
    if (!["none", "entity", "key"].includes(t.group.by)) errors.push(`${where}: group.by inválido`);
    if (!EMAIL_MODES.includes(t.defaultEmail)) errors.push(`${where}: defaultEmail inválido`);
    const forms = typeof t.template === "string" ? [t.template] : t.template && typeof t.template === "object" ? [t.template.one, t.template.many] : [];
    if (!forms.length || forms.some((f) => !f || typeof f !== "string")) { errors.push(`${where}: template obrigatório (texto ou { one, many })`); continue; }
    for (const f of forms) for (const [, inner] of f.matchAll(PLACEHOLDER_RE)) {
      if (inner.includes("|")) continue;
      if (!KNOWN_VARS.has(inner) && !/^data\.[a-zA-Z0-9_]+$/.test(inner)) errors.push(`${where}: chave desconhecida {${inner}} (use actor, actors, title, count, org ou data.<campo>)`);
    }
  }
  return errors;
}

/** Tipos do próprio add-on (sempre instalados). */
export const BASE_TYPES = [
  { type: "org.member_joined", appId: "geral", label: "Alguém entrou na empresa", description: "Quando um convite é aceito (owners e admins)", roles: ["OWNER", "ADMIN"],
    template: "{actors} {entrou|entraram} na {org}", group: { by: "entity", windowMinutes: 60, maxMinutes: 24 * 60 }, defaultEmail: "DAILY" },
  { type: "org.role_changed", appId: "geral", label: "Seu papel mudou", description: "Quando alguém muda o seu papel na empresa",
    template: "{actor} mudou o seu papel para {data.roleLabel}", group: { by: "none" } },
  { type: "org.access_requested", appId: "geral", label: "Pedido de acesso", description: "Alguém precisa de acesso a um app (pedido da pessoa ou do convite)", roles: ["OWNER", "ADMIN"],
    template: { one: "{data.person} precisa de acesso ao {data.app}{data.why}", many: "{count} pedidos de acesso para aprovar" }, group: { by: "key", windowMinutes: 10 }, defaultEmail: "IMMEDIATE" },
  { type: "org.access_decided", appId: "geral", label: "Seu pedido de acesso", description: "Quando um pedido de acesso seu é aprovado ou recusado",
    template: "{actor} {data.verb} o seu acesso ao {data.app}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "org.access_issue", appId: "geral", label: "Acesso não aplicado", description: "Parte dos acessos de um convite não pôde ser aplicada", roles: ["OWNER", "ADMIN"],
    template: "Não deu para liberar o {data.app} para {data.person}: {data.reason}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "whatsapp.connection_error", appId: "geral", label: "WhatsApp desconectado", description: "A conexão do WhatsApp da empresa expirou ou deu erro (owners e admins)", roles: ["OWNER", "ADMIN"],
    template: "O WhatsApp da empresa desconectou: {data.reason}. Reconecte para as mensagens voltarem a sair", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "fiscal.rejected", appId: "geral", label: "Nota fiscal rejeitada", description: "A SEFAZ rejeitou uma nota (quem emitiu, owners e admins)", roles: ["OWNER", "ADMIN"],
    template: "A {data.doc} foi rejeitada: {data.reason}. Corrija e reenvie com o mesmo número", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "fiscal.contingency", appId: "geral", label: "Notas em contingência", description: "NFC-e emitidas com a SEFAZ fora há mais de 12 h (owners e admins)", roles: ["OWNER", "ADMIN"],
    template: "{data.count} NFC-e em contingência há mais de 12 h: transmita até 24 h", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "billing.payment_failed", appId: "geral", label: "Pagamento recusado", description: "Cobrança da assinatura que falhou (owners)", roles: ["OWNER"],
    template: "O pagamento da assinatura do plano {data.planName} falhou", group: { by: "none" }, critical: true },
  { type: "billing.trial_ending", appId: "geral", label: "Fim do período de teste", description: "3 dias antes do fim do teste (owners)", roles: ["OWNER"],
    template: "O teste do plano {data.planName} termina em {data.days} dias", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "files.quota_warning", appId: "geral", label: "Armazenamento quase cheio", description: "80% e 100% do armazenamento do plano (owners e admins)", roles: ["OWNER", "ADMIN"],
    template: "O armazenamento da empresa chegou a {data.percent}%", group: { by: "none" }, requires: "uploads" },
].map(defineType);

/**
 * Tipos de cada preset (o preset registra os dele no boot com registerNotificationTypes).
 * Ficam aqui para todos usarem as mesmas frases e os mesmos agrupamentos.
 */
export const PRESET_TYPES = [
  // tarefas
  { type: "task.assigned", appId: "tarefas", label: "Tarefa atribuída a você", template: { one: "{actor} atribuiu {title} a você", many: "{actors} {atribuiu|atribuíram} {count} tarefas a você" }, group: { by: "key" } },
  { type: "task.mentioned", appId: "tarefas", label: "Menção em tarefa", template: "{actors} {mencionou|mencionaram} você em {title}" },
  { type: "task.commented", appId: "tarefas", label: "Comentário em tarefa que você segue", template: { one: "{actor} comentou em {title}", many: "{actors} {comentou|comentaram} {count} vezes em {title}" } },
  { type: "task.status", appId: "tarefas", label: "Mudança de status", template: "{actor} moveu {title} para {data.to}" },
  { type: "task.due_soon", appId: "tarefas", label: "Prazo amanhã", template: { one: "{title} vence amanhã", many: "{count} tarefas vencem amanhã" }, group: { by: "key", windowMinutes: 60 } },
  { type: "task.overdue", appId: "tarefas", label: "Tarefa atrasada", template: { one: "{title} está atrasada", many: "{count} tarefas atrasadas" }, group: { by: "key", windowMinutes: 60 } },
  { type: "sprint.started", appId: "tarefas", label: "Sprint iniciada", template: "{actor} iniciou a {title}", group: { by: "none" } },
  { type: "sprint.completed", appId: "tarefas", label: "Sprint concluída", template: "{actor} concluiu a {title}", group: { by: "none" } },
  // crm
  { type: "crm.deal.assigned", appId: "crm", label: "Negócio atribuído a você", template: { one: "{actor} passou o negócio {title} para você", many: "{actors} {passou|passaram} {count} negócios para você" }, group: { by: "key" } },
  { type: "crm.lead.assigned", appId: "crm", label: "Lead atribuído a você", template: { one: "Novo lead para você: {title}", many: "{count} novos leads para você" }, group: { by: "key", windowMinutes: 10 } },
  { type: "crm.lead.unassigned", appId: "crm", label: "Lead sem responsável", template: { one: "Lead sem responsável: {title}", many: "{count} leads sem responsável" }, group: { by: "key", windowMinutes: 10 } },
  { type: "crm.mentioned", appId: "crm", label: "Menção em anotação", template: "{actors} {mencionou|mencionaram} você em {title}" },
  { type: "crm.activity.assigned", appId: "crm", label: "Atividade atribuída a você", template: "{actor} atribuiu a atividade {title} a você" },
  { type: "crm.activity.digest", appId: "crm", label: "Atividades do dia", template: "Você tem {data.today} atividades hoje e {data.overdue} atrasadas", group: { by: "none" } },
  { type: "crm.deal.won", appId: "crm", label: "Negócio ganho", template: "{actor} ganhou o negócio {title} ({data.value})", group: { by: "none" } },
  { type: "crm.import.done", appId: "crm", label: "Importação concluída", template: "Importação concluída: {data.created} criados, {data.failed} com erro", group: { by: "none" } },
  { type: "crm.goal.reached", appId: "crm", label: "Meta batida", template: "Meta batida: {data.goal} de {data.owner} ({data.pct}%)", group: { by: "none" } },
  { type: "crm.lead.hot", appId: "crm", label: "Lead quente", template: "Lead quente: {title} chegou a {data.score} pontos", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "crm.automation.notice", appId: "crm", label: "Aviso de automação", template: "Automação {data.automation}: {title}", group: { by: "none" } },
  { type: "crm.automation.failed", appId: "crm", label: "Automação com falha", template: "{count} execuções da automação {data.automation} falharam", group: { by: "entity", windowMinutes: 1440 } },
  // forms
  { type: "forms.response.new", appId: "forms", label: "Resposta nova", template: { one: "Nova resposta em {title}", many: "{count} novas respostas em {title}" }, group: { by: "entity", windowMinutes: 2, maxMinutes: 60 } },
  { type: "forms.response.digest", appId: "forms", label: "Resumo diário de respostas", template: "{data.total} respostas ontem em {data.forms} formulários", group: { by: "none" } },
  { type: "forms.limit", appId: "forms", label: "Limite de respostas", template: "A empresa usou {data.percent}% das respostas do mês", group: { by: "none" } },
  { type: "forms.closed", appId: "forms", label: "Formulário encerrado", template: "{title} foi encerrado ({data.reason})", group: { by: "none" } },
  { type: "forms.webhook_disabled", appId: "forms", label: "Webhook desativado", template: "O webhook de {title} foi desativado depois de várias falhas", group: { by: "none" } },
  { type: "forms.payment.received", appId: "forms", label: "Pagamento de resposta", template: { one: "{data.respondent} pagou {data.amount} em {title}", many: "{count} respostas pagas em {title}" }, group: { by: "key", windowMinutes: 30 } },
  { type: "forms.intake.alert", appId: "forms", label: "Alerta na ficha", template: "Ficha de {data.respondent} em {title}: {data.alert}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  // agenda
  { type: "agenda.booked", appId: "agenda", label: "Novo agendamento", template: { one: "{data.client} agendou {title}", many: "{count} novos agendamentos" }, group: { by: "key", windowMinutes: 10 } },
  { type: "agenda.pending", appId: "agenda", label: "Agendamento aguardando aprovação", template: "{data.client} pediu {title}: aprove ou recuse", group: { by: "none" } },
  { type: "agenda.rescheduled", appId: "agenda", label: "Agendamento remarcado", template: "{data.client} remarcou {title} para {data.when}", group: { by: "none" } },
  { type: "agenda.canceled", appId: "agenda", label: "Agendamento cancelado", template: "{data.client} cancelou {title}", group: { by: "none" } },
  { type: "agenda.daily", appId: "agenda", label: "Agenda do dia", template: "Você tem {data.count} atendimentos hoje", group: { by: "none" } },
  { type: "agenda.deposit_paid", appId: "agenda", label: "Sinal pago", template: { one: "{data.client} pagou o sinal de {title}", many: "{count} sinais pagos" }, group: { by: "key", windowMinutes: 30 } },
  { type: "agenda.deposit_expired", appId: "agenda", label: "Sinal não pago (horário liberado)", template: "{data.client} não pagou o sinal de {title}: o horário foi liberado", group: { by: "none" } },
  { type: "agenda.waitlist_booked", appId: "agenda", label: "Vaga preenchida pela lista de espera", template: "{data.client} pegou a vaga de {title} pela lista de espera", group: { by: "none" } },
  { type: "agenda.recalls_due", appId: "agenda", label: "Retornos vencendo", template: "{data.count} retornos vencem esta semana", group: { by: "none" } },
  { type: "agenda.club_past_due", appId: "agenda", label: "Assinatura do clube em atraso", template: "A assinatura de {data.client} ({title}) está em atraso", group: { by: "none" } },
  // helpdesk
  { type: "helpdesk.ticket_created", appId: "helpdesk", label: "Chamado novo na fila", template: { one: "Chamado novo: {title}", many: "{count} chamados novos em {data.queue}" }, group: { by: "key", windowMinutes: 5 } },
  { type: "helpdesk.assigned", appId: "helpdesk", label: "Chamado atribuído a você", template: { one: "{actor} atribuiu {title} a você", many: "{count} chamados atribuídos a você" }, group: { by: "key" } },
  { type: "helpdesk.customer_replied", appId: "helpdesk", label: "Cliente respondeu", template: { one: "{data.customer} respondeu {title}", many: "{data.customer} respondeu {count} vezes em {title}" } },
  { type: "helpdesk.mentioned", appId: "helpdesk", label: "Menção em nota interna", template: "{actors} {mencionou|mencionaram} você em {title}" },
  { type: "helpdesk.sla_warning", appId: "helpdesk", label: "Prazo vencendo", template: "O prazo de {title} vence {data.when}", group: { by: "none" } },
  { type: "helpdesk.sla_breached", appId: "helpdesk", label: "Prazo estourado", template: "O prazo de {title} estourou", group: { by: "none" } },
  { type: "helpdesk.daily", appId: "helpdesk", label: "Resumo diário do Suporte", template: "{data.open} chamados abertos, {data.breached} com prazo estourado", group: { by: "none" } },
  { type: "helpdesk.approval.requested", appId: "helpdesk", label: "Aprovação pedida", template: "{actor} pediu a sua aprovação em {title}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "helpdesk.approval.decided", appId: "helpdesk", label: "Aprovação respondida", template: "{actor} respondeu a aprovação de {title}: {data.decision}", group: { by: "none" } },
  { type: "helpdesk.contract.warning", appId: "helpdesk", label: "Contrato perto do limite", template: "O contrato de {data.account} já usou {data.pct}% das horas do mês", group: { by: "none" } },
  { type: "helpdesk.contract.exceeded", appId: "helpdesk", label: "Contrato excedido", template: "O contrato de {data.account} passou das horas do mês: {data.over} a mais", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "helpdesk.chat.waiting", appId: "helpdesk", label: "Chat esperando", template: "Chat novo esperando atendimento: {title}", group: { by: "none" } },
  // pessoas (rh)
  { type: "rh.approval.requested", appId: "pessoas", label: "Pedido para você aprovar", template: { one: "{actor} pediu {title}: aprove ou recuse", many: "{count} pedidos aguardando a sua aprovação" }, group: { by: "key", windowMinutes: 10 } },
  { type: "rh.approval.reminder", appId: "pessoas", label: "Lembrete de aprovação", template: { one: "{title} aguarda a sua aprovação há {data.days} dias", many: "{count} pedidos aguardam a sua aprovação" }, group: { by: "key", windowMinutes: 60 } },
  { type: "rh.approval.decided", appId: "pessoas", label: "Seu pedido foi respondido", template: "{actor} {data.verb} {title}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "rh.vacation.expiring", appId: "pessoas", label: "Férias vencendo", template: "{title}: {data.days} dias de férias precisam ser marcados até {data.until}", group: { by: "none" } },
  { type: "rh.vacation.starting", appId: "pessoas", label: "Férias da equipe começando", template: { one: "{title} sai de férias em {data.when}", many: "{count} pessoas da sua equipe saem de férias esta semana" }, group: { by: "key", windowMinutes: 60 }, defaultEmail: "DAILY" },
  { type: "rh.document.expiring", appId: "pessoas", label: "Documento vencendo", template: { one: "{title} vence em {data.when}", many: "{count} documentos vencem nos próximos dias" }, group: { by: "key", windowMinutes: 60 } },
  { type: "rh.document.ack_requested", appId: "pessoas", label: "Documento para ler e dar ciência", template: "{actor} pediu a sua ciência em {title}", group: { by: "none" } },
  { type: "rh.payslip.published", appId: "pessoas", label: "Holerite disponível", template: "Seu {title} está disponível", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "rh.admission.submitted", appId: "pessoas", label: "Pré-admissão enviada", template: "{title} enviou os dados e documentos da admissão", group: { by: "none" } },
  { type: "rh.checklist.assigned", appId: "pessoas", label: "Tarefa de admissão ou desligamento", template: { one: "{data.task} ({title}) até {data.when}", many: "{count} tarefas de {title} para você" }, group: { by: "entity", windowMinutes: 10 } },
  { type: "rh.review.assigned", appId: "pessoas", label: "Avaliação para fazer", template: { one: "Você tem a avaliação de {title} para fazer até {data.when}", many: "Você tem {count} avaliações para fazer em {data.cycle}" }, group: { by: "key", windowMinutes: 10 } },
  { type: "rh.review.released", appId: "pessoas", label: "Resultado da avaliação", template: "O resultado da sua avaliação em {title} foi liberado", group: { by: "none" } },
  { type: "rh.feedback.received", appId: "pessoas", label: "Feedback recebido", template: "{actor} deixou um feedback para você", group: { by: "none" } },
  { type: "rh.feedback.requested", appId: "pessoas", label: "Pedido de feedback", template: "{actor} pediu o seu feedback sobre {title}", group: { by: "none" } },
  { type: "rh.one_on_one.soon", appId: "pessoas", label: "1:1 amanhã", template: "Sua 1:1 com {data.with} é amanhã: adicione os assuntos", group: { by: "none" }, defaultEmail: "DAILY" },
  { type: "rh.goal.checkin_due", appId: "pessoas", label: "Atualizar metas", template: { one: "Atualize o progresso de {title}", many: "Atualize o progresso de {count} metas" }, group: { by: "key", windowMinutes: 60 }, defaultEmail: "DAILY" },
  { type: "rh.survey.open", appId: "pessoas", label: "Pesquisa para responder", template: "Responda {title} até {data.when} (anônima)", group: { by: "none" } },
  { type: "rh.expense.paid", appId: "pessoas", label: "Reembolso pago", template: "O reembolso de {title} ({data.amount}) foi pago", group: { by: "none" } },
  { type: "rh.birthday", appId: "pessoas", label: "Aniversários e tempo de casa", template: { one: "Hoje é aniversário de {title}", many: "{count} aniversários hoje" }, group: { by: "key", windowMinutes: 60 }, defaultEmail: "OFF" },
  // financeiro
  { type: "fin.due_today", appId: "financeiro", label: "Vencimentos do dia", template: "Hoje vencem {data.payableCount} contas a pagar ({data.payable}); {data.overdueCount} a receber venceram ontem", group: { by: "none" }, defaultEmail: "DAILY" },
  { type: "fin.charge.paid", appId: "financeiro", label: "Cobrança recebida", template: { one: "{data.customer} pagou {title} ({data.amount}) por {data.method}", many: "{count} cobranças recebidas" }, group: { by: "key", windowMinutes: 30 } },
  { type: "fin.charge.failed", appId: "financeiro", label: "Cobrança não paga", template: "A cobrança {title} de {data.customer} {data.reason}", group: { by: "none" } },
  { type: "fin.approval.requested", appId: "financeiro", label: "Pagamento para aprovar", template: { one: "{actor} lançou {title} ({data.amount}): aprove ou recuse", many: "{count} pagamentos aguardando a sua aprovação" }, group: { by: "key", windowMinutes: 10 }, defaultEmail: "IMMEDIATE" },
  { type: "fin.approval.decided", appId: "financeiro", label: "Pagamento aprovado ou recusado", template: "{actor} {data.verb} o pagamento {title}", group: { by: "none" } },
  { type: "fin.import.done", appId: "financeiro", label: "Extrato importado", template: "Extrato de {title} importado: {data.fresh} novas transações, {data.pending} para conciliar", group: { by: "none" } },
  { type: "fin.stripe.account", appId: "financeiro", label: "Conta Stripe", template: "A conta Stripe da empresa {data.status}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "fin.subscription.past_due", appId: "financeiro", label: "Assinatura de cliente atrasada", template: "A assinatura {title} de {data.customer} não foi paga", group: { by: "none" } },
  { type: "fin.budget.over", appId: "financeiro", label: "Orçamento estourado", template: { one: "{title} passou do orçado em {data.month} ({data.used}% do orçamento)", many: "{count} categorias passaram do orçado" }, group: { by: "key", windowMinutes: 60 }, defaultEmail: "DAILY" },
  { type: "fin.nfse.failed", appId: "financeiro", label: "NFS-e não emitida", template: "A nota de serviço de {title} não foi emitida: {data.reason}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "fin.card.invoice_closed", appId: "financeiro", label: "Fatura do cartão fechou", template: "A fatura de {title} fechou em {data.total}, vence em {data.dueOn}", group: { by: "none" } },
  // comercial
  { type: "com.approval.requested", appId: "comercial", label: "Desconto para aprovar", template: { one: "{actor} pediu aprovação de {data.discount} de desconto em {title} ({data.amount})", many: "{count} propostas aguardando a sua aprovação" }, group: { by: "key", windowMinutes: 10 }, defaultEmail: "IMMEDIATE" },
  { type: "com.approval.decided", appId: "comercial", label: "Desconto aprovado ou recusado", template: "{actor} {data.verb} o desconto de {title}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "com.proposal.viewed", appId: "comercial", label: "Cliente abriu a proposta", template: "{data.client} abriu a proposta {title}", group: { by: "none" } },
  { type: "com.proposal.commented", appId: "comercial", label: "Dúvida do cliente", template: { one: "{data.client} perguntou na proposta {title}", many: "{count} mensagens do cliente em {title}" }, group: { by: "entity", windowMinutes: 10 }, defaultEmail: "IMMEDIATE" },
  { type: "com.proposal.accepted", appId: "comercial", label: "Proposta aceita", template: "{data.client} aceitou a proposta {title} ({data.amount})", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "com.proposal.rejected", appId: "comercial", label: "Proposta recusada", template: "{data.client} recusou a proposta {title}: {data.reason}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "com.proposal.expiring", appId: "comercial", label: "Proposta vencendo", template: { one: "A proposta {title} vence {data.when} sem resposta", many: "{count} propostas vencendo sem resposta" }, group: { by: "key", windowMinutes: 60 }, defaultEmail: "DAILY" },
  { type: "com.envelope.completed", appId: "comercial", label: "Documento assinado por todos", template: "{title} foi assinado por todos", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "com.envelope.refused", appId: "comercial", label: "Assinatura recusada", template: "{data.signer} recusou assinar {title}: {data.reason}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "com.envelope.expired", appId: "comercial", label: "Prazo de assinatura terminou", template: "O prazo para assinar {title} terminou sem todas as assinaturas", group: { by: "none" } },
  { type: "com.contract.expiring", appId: "comercial", label: "Contrato vencendo", template: { one: "O contrato {title} {data.what} em {data.when}", many: "{count} contratos entrando no aviso prévio" }, group: { by: "key", windowMinutes: 60 }, defaultEmail: "DAILY" },
  { type: "com.contract.renewed", appId: "comercial", label: "Contrato renovado", template: "O contrato {title} foi renovado até {data.until}", group: { by: "none" } },
  { type: "com.integration.failed", appId: "comercial", label: "Integração com problema", template: "Não deu para {data.action} da proposta {title}: tente de novo", group: { by: "none" } },
  { type: "com.deposit.paid", appId: "comercial", label: "Sinal pago", template: "{data.client} pagou o sinal de {data.amount} da proposta {title}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "com.contract.readjusted", appId: "comercial", label: "Contrato reajustado", template: "O contrato {title} foi reajustado em {data.pct} ({data.index})", group: { by: "none" } },
  // erp
  { type: "erp.stock.low", appId: "erp", label: "Estoque baixo", template: { one: "{title} chegou ao estoque mínimo ({data.available} disponível)", many: "{count} produtos chegaram ao estoque mínimo" }, group: { by: "key", windowMinutes: 60 }, defaultEmail: "DAILY" },
  { type: "erp.order.to_pick", appId: "erp", label: "Pedido para separar", template: { one: "Pedido {title} confirmado: separar {data.items} itens", many: "{count} pedidos para separar" }, group: { by: "key", windowMinutes: 15 } },
  { type: "erp.quote.expiring", appId: "erp", label: "Orçamento vencendo", template: { one: "O orçamento {title} de {data.customer} vence amanhã", many: "{count} orçamentos vencem amanhã" }, group: { by: "key", windowMinutes: 60 }, defaultEmail: "DAILY" },
  { type: "erp.cash.difference", appId: "erp", label: "Diferença no caixa", template: "{actor} fechou o {title} com diferença de {data.diff}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "erp.session.stale", appId: "erp", label: "Caixa esquecido aberto", template: "O {title} está aberto desde {data.since}", group: { by: "none" }, defaultEmail: "IMMEDIATE" },
  { type: "erp.purchase.received", appId: "erp", label: "Compra recebida", template: "{actor} recebeu a compra {title} de {data.supplier}", group: { by: "none" } },
  { type: "erp.lots.expiring", appId: "erp", label: "Lote vencendo", template: { one: "O lote {data.code} de {title} vence em {data.daysLeft} dias ({data.onHand} em estoque)", many: "{count} lotes vencem nos próximos dias" }, group: { by: "key", windowMinutes: 60 }, defaultEmail: "DAILY" },
  { type: "erp.receivables.overdue", appId: "erp", label: "Fiado em atraso", template: { one: "{title} está com {data.amount} do fiado em atraso", many: "{count} clientes com fiado em atraso" }, group: { by: "key", windowMinutes: 60 }, defaultEmail: "DAILY" },
].map(defineType);

/** Catálogo ativo: tipos base + os dos apps instalados (+ add-ons exigidos). */
export function catalogFor({ apps = [], addons = [] } = {}) {
  const ok = (t) => !t.requires || addons.includes(t.requires);
  return [...BASE_TYPES.filter(ok), ...PRESET_TYPES.filter((t) => apps.includes(t.appId) && ok(t))];
}

export const typeMap = (catalog) => new Map(catalog.map((t) => [t.type, t]));

// ------------------------------------------------------------------ preferências

export const defaultPrefs = () => ({ emailMode: "IMMEDIATE", digestHour: 8, types: {} });

/**
 * Valida e normaliza o corpo do PUT /v1/notification-preferences.
 * Aceita { emailMode, digestHour, types: { [type]: { inApp?, email? } } } e o formato antigo do tarefas
 * ({ emailMode, disabledTypes: [] } = tipos desligados no app e no e-mail).
 * email por tipo: "DEFAULT" (segue a geral), "IMMEDIATE", "DAILY" ou "OFF". Tipos críticos não mudam.
 */
export function normalizePrefs(input, catalog, current = defaultPrefs()) {
  const errors = [], tm = typeMap(catalog);
  const out = { emailMode: current.emailMode, digestHour: current.digestHour, types: structuredClone(current.types ?? {}) };
  const body = input ?? {};
  if (body.emailMode !== undefined) { if (EMAIL_MODES.includes(body.emailMode)) out.emailMode = body.emailMode; else errors.push({ path: "emailMode", message: "Use IMMEDIATE, DAILY ou OFF" }); }
  if (body.digestHour !== undefined) { if (Number.isInteger(body.digestHour) && body.digestHour >= 0 && body.digestHour <= 23) out.digestHour = body.digestHour; else errors.push({ path: "digestHour", message: "Hora entre 0 e 23" }); }
  const setType = (type, patch, path) => {
    const def = tm.get(type);
    if (!def) { errors.push({ path, message: `Tipo desconhecido: ${type}` }); return; }
    if (def.critical) { errors.push({ path, message: "Este aviso é obrigatório e não pode ser desligado" }); return; }
    const cur = { inApp: true, email: "DEFAULT", ...(out.types[type] ?? {}) };
    if (patch.inApp !== undefined) { if (typeof patch.inApp === "boolean") cur.inApp = patch.inApp; else errors.push({ path: `${path}.inApp`, message: "Use true ou false" }); }
    if (patch.email !== undefined) { if (["DEFAULT", ...EMAIL_MODES].includes(patch.email)) cur.email = patch.email; else errors.push({ path: `${path}.email`, message: "Use DEFAULT, IMMEDIATE, DAILY ou OFF" }); }
    if (cur.inApp && cur.email === "DEFAULT") delete out.types[type]; else out.types[type] = cur;
  };
  if (body.types !== undefined) {
    if (!body.types || typeof body.types !== "object" || Array.isArray(body.types)) errors.push({ path: "types", message: "Objeto { tipo: { inApp, email } }" });
    else for (const [type, patch] of Object.entries(body.types)) setType(type, patch ?? {}, `types.${type}`);
  }
  if (body.disabledTypes !== undefined) {
    if (!Array.isArray(body.disabledTypes)) errors.push({ path: "disabledTypes", message: "Lista de tipos" });
    else {
      // formato antigo: a lista é a verdade (o que não está nela volta a ligar)
      for (const [type, v] of Object.entries(out.types)) if (!body.disabledTypes.includes(type) && v.inApp === false && v.email === "OFF") delete out.types[type];
      for (const type of body.disabledTypes) setType(type, { inApp: false, email: "OFF" }, `disabledTypes`);
    }
  }
  return { prefs: out, errors };
}

/** Canais efetivos de um tipo para uma pessoa: { inApp, email: IMMEDIATE|DAILY|OFF }. */
export function channelsFor(def, prefs = defaultPrefs()) {
  if (def.critical) return { inApp: true, email: "IMMEDIATE" };
  const o = prefs.types?.[def.type] ?? {};
  const inApp = o.inApp !== false;
  let email;
  if (o.email && o.email !== "DEFAULT") email = o.email;
  else email = EMAIL_RANK[def.defaultEmail] < EMAIL_RANK[prefs.emailMode] ? def.defaultEmail : prefs.emailMode;
  return { inApp, email };
}

/** Tipos desligados nos dois canais (campo do formato antigo, devolvido pelo GET). */
export const disabledTypesOf = (prefs) => Object.entries(prefs.types ?? {}).filter(([, v]) => v.inApp === false && v.email === "OFF").map(([k]) => k);

/** Linhas da tela de preferências, agrupadas por app na ordem do catálogo (só os tipos que o papel pode receber). */
export function prefsView(prefs, catalog, { role = null } = {}) {
  const groups = [];
  for (const def of catalog) {
    if (role && def.roles && !def.roles.includes(role)) continue;
    let g = groups.find((x) => x.appId === def.appId);
    if (!g) groups.push((g = { appId: def.appId, label: APP_LABELS[def.appId] ?? def.appId, types: [] }));
    const o = prefs.types?.[def.type] ?? {};
    g.types.push({
      type: def.type, label: def.label, description: def.description, critical: def.critical,
      inApp: def.critical ? true : o.inApp !== false,
      email: def.critical ? "IMMEDIATE" : (o.email ?? "DEFAULT"),
      effectiveEmail: channelsFor(def, prefs).email,
    });
  }
  return { emailMode: prefs.emailMode, digestHour: prefs.digestHour, disabledTypes: disabledTypesOf(prefs), groups };
}

/** Descadastro pelo e-mail: um tipo (email OFF) ou tudo ("*": emailMode OFF). O sino não muda. */
export function applyUnsubscribe(prefs, type) {
  const p = { ...prefs, types: { ...(prefs.types ?? {}) } };
  if (type === "*") { p.emailMode = "OFF"; return p; }
  p.types[type] = { inApp: true, ...(p.types[type] ?? {}), email: "OFF" };
  return p;
}

/** Desfaz o descadastro (volta ao que estava antes; `previous` vem do token). */
export function undoUnsubscribe(prefs, type, previous) {
  const p = { ...prefs, types: { ...(prefs.types ?? {}) } };
  if (type === "*") { p.emailMode = previous ?? "IMMEDIATE"; return p; }
  const cur = { ...(p.types[type] ?? { inApp: true }) , email: previous ?? "DEFAULT" };
  if (cur.inApp !== false && cur.email === "DEFAULT") delete p.types[type]; else p.types[type] = cur;
  return p;
}

// ------------------------------------------------------------------ destinatários

/**
 * Quem recebe de fato. Tira repetidos, vazios, quem fez a ação, quem não é membro ativo da empresa
 * e quem não pode ver o registro (canSee: função ou Set de ids). Devolve também os pulados com o motivo
 * (vai para o log de depuração, nunca para o usuário).
 */
export function resolveRecipients({ candidates = [], actorId = null, activeMemberIds, canSee } = {}) {
  const to = [], skipped = [], seen = new Set();
  const members = activeMemberIds instanceof Set ? activeMemberIds : activeMemberIds ? new Set(activeMemberIds) : null;
  const sees = canSee instanceof Set ? (id) => canSee.has(id) : typeof canSee === "function" ? canSee : () => true;
  for (const id of candidates) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (id === actorId) { skipped.push({ userId: id, reason: "actor" }); continue; }
    if (members && !members.has(id)) { skipped.push({ userId: id, reason: "not_member" }); continue; }
    if (!sees(id)) { skipped.push({ userId: id, reason: "no_access" }); continue; }
    to.push(id);
  }
  return { to, skipped };
}

// ------------------------------------------------------------------ agrupamento

/** Chave de agrupamento (null = não agrupa). */
export function groupKeyFor(def, ev) {
  if (def.group.by === "none") return null;
  if (def.group.by === "key") return `${def.type}:${ev.groupKey ?? "all"}`;
  return `${def.type}:${ev.entityType}:${ev.entityId}`;
}

/** Dá para juntar o evento a esta notificação? Só enquanto não lida, sem e-mail enviado e com o grupo aberto. */
export function canGroup(existing, now = Date.now()) {
  if (!existing || !existing.groupKey) return false;
  if (existing.readAt) return false;
  if (!["NONE", "PENDING"].includes(existing.emailStatus)) return false;
  return toMs(existing.groupOpenUntil) > toMs(now);
}

const groupUntil = (def, createdAt, now) => Math.min(toMs(now) + def.group.windowMinutes * MIN, toMs(createdAt) + def.group.maxMinutes * MIN);

/** Linha nova de notificação para um destinatário. `channels` vem de channelsFor. */
export function newNotification(def, ev, userId, channels, now = Date.now()) {
  const t = toMs(now), key = groupKeyFor(def, ev);
  return {
    userId,
    type: def.type,
    appId: def.appId,
    actorId: ev.actorId ?? null,
    actorIds: ev.actorId ? [ev.actorId] : [],
    count: 1,
    entityType: ev.entityType,
    entityId: ev.entityId,
    groupKey: key,
    groupOpenUntil: key ? new Date(groupUntil(def, t, t)).toISOString() : null,
    data: ev.data ?? {},
    url: ev.url,
    inApp: channels.inApp,
    emailMode: channels.email === "OFF" ? null : channels.email,
    emailStatus: channels.email === "OFF" ? "NONE" : "PENDING",
    createdAt: new Date(t).toISOString(),
    updatedAt: new Date(t).toISOString(),
  };
}

/** Patch para juntar um evento a uma notificação aberta (o ator mais recente vai para a frente). */
export function mergeInto(existing, def, ev, now = Date.now()) {
  const t = toMs(now);
  const actorIds = ev.actorId ? [ev.actorId, ...(existing.actorIds ?? []).filter((a) => a !== ev.actorId)].slice(0, 50) : existing.actorIds ?? [];
  return {
    count: (existing.count ?? 1) + 1,
    actorId: ev.actorId ?? existing.actorId ?? null,
    actorIds,
    data: { ...(existing.data ?? {}), ...(ev.data ?? {}) },
    // agrupado por chave, a notificação passa a falar de vários registros: o link vai para a lista (groupUrl)
    url: def.group.by === "entity" ? existing.url : ev.groupUrl ?? ev.url ?? existing.url,
    entityId: def.group.by === "entity" ? existing.entityId : ev.entityId ?? existing.entityId,
    groupOpenUntil: new Date(groupUntil(def, existing.createdAt, t)).toISOString(),
    updatedAt: new Date(t).toISOString(),
  };
}

// ------------------------------------------------------------------ e-mail imediato

/**
 * Quando o e-mail imediato pode sair. Sem agrupamento: na hora. Com agrupamento: depois de `quietSeconds`
 * sem evento novo, mas nunca depois de `maxDelaySeconds` da criação (o e-mail já vai agrupado).
 */
export function emailDueAt(n, def, { quietSeconds = 60, maxDelaySeconds = 180 } = {}) {
  if (n.emailMode !== "IMMEDIATE") return null;
  if (!n.groupKey || def.group.by === "none") return toMs(n.createdAt);
  return Math.min(toMs(n.updatedAt) + quietSeconds * 1000, toMs(n.createdAt) + maxDelaySeconds * 1000);
}

/** O que fazer com o e-mail de uma notificação agora: "send", "wait" (com `at`) ou "skip" (com o motivo). */
export function emailAction(n, def, now = Date.now(), opts) {
  if (n.emailStatus !== "PENDING") return { action: "skip", reason: "not_pending" };
  if (n.readAt) return { action: "skip", reason: "read" };
  if (n.emailMode === "DAILY") return { action: "wait", at: null, reason: "digest" };
  const at = emailDueAt(n, def, opts);
  if (at == null) return { action: "skip", reason: "no_email" };
  return at <= toMs(now) ? { action: "send" } : { action: "wait", at };
}

/**
 * Junta os imediatos prontos de cada pessoa num e-mail só (vários eventos no mesmo minuto não viram vários e-mails).
 * Devolve [{ userId, items, subject }] com o assunto já montado.
 */
export function bundleImmediate(items, { orgName = "", textOf = (n) => n.text ?? n.type } = {}) {
  const by = new Map();
  for (const n of items) { if (!by.has(n.userId)) by.set(n.userId, []); by.get(n.userId).push(n); }
  return [...by.entries()].map(([userId, list]) => {
    list.sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt));
    const subject = list.length === 1 ? textOf(list[0]) : `${list.length} novidades${orgName ? ` em ${orgName}` : ""}`;
    return { userId, items: list, subject };
  });
}

// ------------------------------------------------------------------ fuso e resumo diário

const fmtCache = new Map();
function partsFmt(tz) {
  if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  return fmtCache.get(tz);
}
/** { ymd, hour, minute } locais de um instante. */
export function localOf(instant, timeZone) {
  const p = Object.fromEntries(partsFmt(timeZone).formatToParts(new Date(toMs(instant))).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute };
}
function offsetMinutes(instant, timeZone) {
  const ms = Math.floor(toMs(instant) / 1000) * 1000;
  const p = Object.fromEntries(partsFmt(timeZone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms) / MIN);
}
/** Instante UTC de uma data e hora locais (hora que não existe por horário de verão anda para frente). */
export function zonedToUtc(ymd, hour, timeZone) {
  const [y, m, d] = ymd.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, hour, 0);
  for (const probe of [naive, naive - 14 * HOUR, naive + 14 * HOUR]) {
    const u = naive - offsetMinutes(probe, timeZone) * MIN, l = localOf(u, timeZone);
    if (l.ymd === ymd && l.hour === hour && l.minute === 0) return u;
  }
  return naive - offsetMinutes(naive - 14 * HOUR, timeZone) * MIN;
}
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Próximo horário do resumo (ms): hoje às `hour` no fuso, ou amanhã se já passou. */
export function nextDigestAt({ timeZone, hour = 8, now = Date.now() }) {
  const today = localOf(now, timeZone).ymd;
  const at = zonedToUtc(today, hour, timeZone);
  return at > toMs(now) ? at : zonedToUtc(addDays(today, 1), hour, timeZone);
}

/** O resumo desta pessoa deve sair agora? (já passou da hora local de hoje e ainda não saiu hoje). */
export function digestDue({ lastDigestAt = null, timeZone, hour = 8, now = Date.now() }) {
  const l = localOf(now, timeZone);
  if (l.hour < hour) return false;
  if (!lastDigestAt) return true;
  return localOf(lastDigestAt, timeZone).ymd < l.ymd;
}

/**
 * Conteúdo do resumo: só as não lidas que esperavam o resumo, por app, as mais recentes primeiro.
 * Devolve null se não há nada (resumo vazio não é enviado).
 */
export function buildDigest(items, catalog, { perApp = 5, orgName = "" } = {}) {
  const tm = typeMap(catalog);
  const pending = items.filter((n) => !n.readAt && n.emailStatus === "PENDING" && n.emailMode === "DAILY");
  if (!pending.length) return null;
  const apps = new Map();
  for (const n of pending.sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt))) {
    const appId = tm.get(n.type)?.appId ?? n.appId ?? "geral";
    if (!apps.has(appId)) apps.set(appId, { appId, label: APP_LABELS[appId] ?? appId, count: 0, items: [] });
    const g = apps.get(appId);
    g.count += n.count ?? 1;
    if (g.items.length < perApp) g.items.push(n);
  }
  const groups = [...apps.values()].map((g) => ({ ...g, more: Math.max(0, pending.filter((n) => (tm.get(n.type)?.appId ?? n.appId ?? "geral") === g.appId).length - g.items.length) }));
  const total = pending.reduce((a, n) => a + (n.count ?? 1), 0);
  return { total, ids: pending.map((n) => n.id), apps: groups, subject: `Seu resumo${orgName ? ` de ${orgName}` : ""}: ${total} ${total === 1 ? "novidade" : "novidades"}` };
}

// ------------------------------------------------------------------ frase (sem HTML)

/** "Ana", "Ana e Bia", "Ana e mais 2". `names` na ordem (mais recente primeiro); `total` = atores distintos. */
export function actorsPhrase(names, total = names.length) {
  const list = names.filter(Boolean);
  if (!list.length) return "Alguém";
  if (total <= 1) return list[0];
  if (total === 2 && list.length >= 2) return `${list[0]} e ${list[1]}`;
  return `${list[0]} e mais ${total - 1}`;
}

/**
 * Frase da notificação em pedaços: [{ text, bold }]. O front monta com <strong> (nunca innerHTML) e o e-mail
 * escapa cada pedaço. `n` traz count, actorIds, data e title; `names` mapeia id → nome.
 * {a|b}: singular/plural pelo número de atores distintos. "many" do modelo vale quando count > 1.
 */
export function renderSegments(def, n, { names = {}, orgName = "" } = {}) {
  const tpl = typeof def.template === "string" ? def.template : (n.count ?? 1) > 1 ? def.template.many : def.template.one;
  const actorIds = n.actorIds?.length ? n.actorIds : n.actorId ? [n.actorId] : [];
  const nActors = actorIds.length;
  const vars = {
    actor: actorIds[0] ? names[actorIds[0]] ?? "Alguém" : "Alguém",
    actors: actorsPhrase(actorIds.map((id) => names[id] ?? "Alguém"), nActors),
    title: n.data?.title ?? "",
    count: String(n.count ?? 1),
    org: orgName || n.data?.orgName || "empresa",
  };
  const segs = [];
  const push = (text, bold = false) => {
    if (!text) return;
    const last = segs[segs.length - 1];
    if (last && last.bold === bold) last.text += text; else segs.push({ text, bold });
  };
  let i = 0;
  for (const m of tpl.matchAll(PLACEHOLDER_RE)) {
    push(tpl.slice(i, m.index));
    const inner = m[1];
    if (inner.includes("|")) { const [one, many] = inner.split("|"); push(nActors > 1 ? many : one); }
    else if (inner === "actor" || inner === "actors" || inner === "title" || inner === "org") push(vars[inner], true);
    else if (inner === "count") push(vars.count);
    else if (inner.startsWith("data.")) push(String(n.data?.[inner.slice(5)] ?? ""));
    i = m.index + m[0].length;
  }
  push(tpl.slice(i));
  return segs;
}
export const segmentsText = (segs) => segs.map((s) => s.text).join("");

/** Escapa um pedaço para HTML de e-mail. */
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const segmentsHtml = (segs) => segs.map((s) => (s.bold ? `<strong>${escapeHtml(s.text)}</strong>` : escapeHtml(s.text))).join("");

/** Trecho de comentário/mensagem para mostrar na notificação (texto puro, uma linha, até `max`). */
export function snippet(text, max = 140) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

// ------------------------------------------------------------------ tela

/** "today" | "yesterday" | "older" no fuso de quem vê (grupos Hoje / Ontem / Anteriores). */
export function dayBucket(instant, timeZone, now = Date.now()) {
  const d = localOf(instant, timeZone).ymd, today = localOf(now, timeZone).ymd;
  if (d === today) return "today";
  if (d === addDays(today, -1)) return "yesterday";
  return "older";
}

const MONTHS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", "12 de out." (outro ano: "12 de out. de 2025"). */
export function relativeTime(instant, now = Date.now(), timeZone = "America/Sao_Paulo") {
  const diff = toMs(now) - toMs(instant);
  if (diff < MIN) return "agora";
  if (diff < HOUR) return `há ${Math.floor(diff / MIN)} min`;
  const bucket = dayBucket(instant, timeZone, now);
  if (bucket === "today") return `há ${Math.floor(diff / HOUR)} h`;
  if (bucket === "yesterday") return "ontem";
  if (diff < 7 * DAY) return `há ${Math.max(2, Math.round(diff / DAY))} dias`;
  const l = localOf(instant, timeZone), nl = localOf(now, timeZone);
  const [y, m, d] = l.ymd.split("-").map(Number);
  return `${d} de ${MONTHS[m - 1]}${l.ymd.slice(0, 4) !== nl.ymd.slice(0, 4) ? ` de ${y}` : ""}`;
}

/** Texto do contador do sino: "" (nada), "1".."99", "99+". */
export const badgeText = (count) => (!count || count < 0 ? "" : count > 99 ? "99+" : String(count));

/** Título da aba com o contador: "(3) Tarefas · Acme". */
export const documentTitle = (base, count) => (count > 0 ? `(${badgeText(count)}) ${base}` : base);

// ------------------------------------------------------------------ cursor

/** Lista ordenada por updatedAt desc, id desc (notificação agrupada sobe ao receber evento novo). */
export const encodeCursor = (n) => Buffer.from(JSON.stringify([n.updatedAt, n.id])).toString("base64url");
export function decodeCursor(c) {
  try { const [updatedAt, id] = JSON.parse(Buffer.from(String(c), "base64url").toString()); if (!updatedAt || !id || Number.isNaN(Date.parse(updatedAt))) return null; return { updatedAt, id }; } catch { return null; }
}

// ------------------------------------------------------------------ descadastro do e-mail

const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (payload, secret) => createHmac("sha256", secret).update(payload).digest("base64url");

/**
 * Token do link "parar de receber" (sem login): payload assinado com HMAC, sem tabela.
 * type: tipo da notificação ou "*" (todos os e-mails de notificação). `prev`: e-mail antes (para desfazer).
 */
export function signUnsubscribe({ userId, orgId, type, prev = null }, secret, { now = Date.now(), ttlDays = 180 } = {}) {
  if (!secret || secret.length < 32) throw new Error("segredo de descadastro com pelo menos 32 caracteres");
  const payload = b64(JSON.stringify({ u: userId, o: orgId, t: type, p: prev, e: toMs(now) + ttlDays * DAY }));
  return `${payload}.${sign(payload, secret)}`;
}

/** Payload { userId, orgId, type, prev } se o token é válido e não venceu; senão null. */
export function verifyUnsubscribe(token, secret, now = Date.now()) {
  const [payload, sig, extra] = String(token ?? "").split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const want = Buffer.from(sign(payload, secret)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!j.u || !j.o || !j.t || !(j.e > toMs(now))) return null;
    return { userId: j.u, orgId: j.o, type: j.t, prev: j.p ?? null };
  } catch { return null; }
}

/** Cabeçalhos de descadastro com um clique (RFC 8058), exigidos por Gmail e Yahoo para envio em volume. */
export const listUnsubscribeHeaders = (oneClickUrl) => ({
  "List-Unsubscribe": `<${oneClickUrl}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

// ------------------------------------------------------------------ limpeza

/** Notificações mais velhas que isso são apagadas pelo job diário (lidas: 90 dias; não lidas: 180). */
export function retentionCutoffs(now = Date.now(), { readDays = 90, unreadDays = 180 } = {}) {
  return { read: new Date(toMs(now) - readDays * DAY).toISOString(), unread: new Date(toMs(now) - unreadDays * DAY).toISOString() };
}
