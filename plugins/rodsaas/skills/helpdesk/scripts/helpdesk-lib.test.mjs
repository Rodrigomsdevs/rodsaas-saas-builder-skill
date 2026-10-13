// node --test helpdesk-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as H from "./helpdesk-lib.mjs";

const SP = "America/Sao_Paulo";
const weekdays = (iv) => Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, d === "0" || d === "6" ? [] : iv]));
const CAL = { timeZone: SP, weekly: weekdays([["08:00", "12:00"], ["13:00", "18:00"]]), holidays: H.brazilHolidays(2026).map((h) => h.date) };
const sp = (ymd, hm) => new Date(H.zonedToUtc(ymd, hm, SP)).toISOString();

test("horário comercial: soma minutos pulando almoço, noite, fim de semana e feriado", () => {
  assert.equal(H.addBusinessMinutes(sp("2026-10-16", "17:30"), 60, CAL), sp("2026-10-19", "08:30"), "sexta 17:30 + 1 h → segunda 08:30");
  assert.equal(H.addBusinessMinutes(sp("2026-10-17", "10:00"), 30, CAL), sp("2026-10-19", "08:30"), "sábado conta a partir de segunda");
  assert.equal(H.addBusinessMinutes(sp("2026-10-19", "11:50"), 20, CAL), sp("2026-10-19", "13:10"), "pula o almoço");
  assert.equal(H.addBusinessMinutes(sp("2026-11-19", "17:00"), 120, CAL), sp("2026-11-23", "09:00"), "20/11 é feriado nacional");
  assert.equal(H.addBusinessMinutes(sp("2026-10-19", "07:00"), 0, CAL), sp("2026-10-19", "07:00"));
  assert.equal(H.addBusinessMinutes("2026-10-17T12:00:00.000Z", 90, { alwaysOpen: true }), "2026-10-17T13:30:00.000Z");
  assert.throws(() => H.addBusinessMinutes(sp("2026-10-19", "09:00"), 10, { timeZone: SP, weekly: {} }), /sem nenhum horário/);
  const override = { ...CAL, overrides: { "2026-10-19": [] } };
  assert.equal(H.addBusinessMinutes(sp("2026-10-16", "17:30"), 60, override), sp("2026-10-20", "08:30"), "exceção fecha a segunda");
});

test("horário comercial: horário de verão de outro país", () => {
  const ny = { timeZone: "America/New_York", weekly: weekdays([["09:00", "17:00"]]) };
  // sexta 30/10 16:00 EDT (UTC−4) + 2 h → segunda 02/11 10:00 EST (UTC−5)
  assert.equal(H.addBusinessMinutes("2026-10-30T20:00:00.000Z", 120, ny), "2026-11-02T15:00:00.000Z");
});

test("minutos de atendimento entre dois instantes e aberto agora", () => {
  assert.equal(H.businessMinutesBetween(sp("2026-10-16", "17:00"), sp("2026-10-19", "09:00"), CAL), 120);
  assert.equal(H.businessMinutesBetween(sp("2026-10-19", "09:00"), sp("2026-10-16", "17:00"), CAL), 0);
  assert.equal(H.businessMinutesBetween(sp("2026-10-19", "11:00"), sp("2026-10-19", "14:00"), CAL), 120, "sem o almoço");
  assert.equal(H.isOpenAt(sp("2026-10-19", "12:30"), CAL), false);
  assert.equal(H.isOpenAt(sp("2026-10-19", "13:00"), CAL), true);
  assert.equal(H.isOpenAt(sp("2026-10-18", "10:00"), CAL), false, "domingo");
});

test("SLA: prazos, situação, pausa e retomada", () => {
  const u = H.slaDueDates({ createdAt: "2026-10-17T12:00:00.000Z", priority: "URGENT", cal: CAL });
  assert.equal(u.firstResponseDueAt, "2026-10-17T12:30:00.000Z", "urgente conta 24 h");
  const n = H.slaDueDates({ createdAt: sp("2026-10-16", "17:00"), priority: "NORMAL", cal: CAL });
  assert.equal(n.firstResponseDueAt, sp("2026-10-19", "11:00"), "4 h úteis");
  assert.deepEqual(H.slaDueDates({ createdAt: sp("2026-10-16", "17:00"), priority: "LOW", policy: { LOW: { resolution: 60 } }, cal: CAL }), { firstResponseDueAt: null, resolutionDueAt: sp("2026-10-16", "18:00") });

  const due = "2026-10-19T14:00:00.000Z";
  assert.equal(H.slaState({ dueAt: null }), "none");
  assert.equal(H.slaState({ dueAt: due, now: "2026-10-19T10:00:00.000Z" }), "ok");
  assert.equal(H.slaState({ dueAt: due, now: "2026-10-19T13:40:00.000Z" }), "warning");
  assert.equal(H.slaState({ dueAt: due, now: "2026-10-19T14:00:01.000Z" }), "breached");
  assert.equal(H.slaState({ dueAt: due, doneAt: "2026-10-19T13:00:00.000Z" }), "achieved");
  assert.equal(H.slaState({ dueAt: due, doneAt: "2026-10-19T15:00:00.000Z" }), "missed");
  assert.equal(H.slaState({ dueAt: due, pausedAt: "2026-10-19T12:00:00.000Z", now: "2026-10-20T12:00:00.000Z" }), "paused");
  assert.equal(H.slaState({ dueAt: due, now: "2026-10-19T12:00:00.000Z", startedAt: "2026-10-19T00:00:00.000Z", warnMinutes: 0 }), "warning", "menos de 20% do prazo");

  const remaining = H.slaPause(sp("2026-10-19", "11:00"), sp("2026-10-19", "09:00"), CAL);
  assert.equal(remaining, 120);
  assert.equal(H.slaResume({ remainingMinutes: remaining, now: sp("2026-10-20", "17:00"), cal: CAL }), sp("2026-10-21", "09:00"));
  assert.equal(H.slaPause(due, "2026-10-19T15:00:00.000Z", CAL), null, "pausado depois de estourar");
  assert.equal(H.slaResume({ remainingMinutes: null, originalDueAt: due, cal: CAL }), due, "estourado continua estourado");

  assert.deepEqual(H.validateSlaPolicy(H.DEFAULT_SLA), []);
  assert.deepEqual(H.validateSlaPolicy({ HIGH: { firstResponse: 120, resolution: 60 }, LOW: { firstResponse: 0, calendar: "x" } }).map((e) => e.path), ["LOW.firstResponse", "LOW.calendar", "HIGH.resolution"]);
});

test("estados do chamado", () => {
  assert.equal(H.canSetStatus("OPEN", "PENDING"), true);
  assert.equal(H.canSetStatus("SOLVED", "OPEN"), true);
  assert.equal(H.canSetStatus("OPEN", "CLOSED"), false, "equipe não fecha direto");
  assert.equal(H.canSetStatus("SOLVED", "CLOSED", { system: true }), true);
  assert.equal(H.canSetStatus("CLOSED", "OPEN"), false, "fechado é definitivo");
  assert.equal(H.canSetStatus("OPEN", "XYZ"), false);
  assert.deepEqual(H.onCustomerReply("PENDING"), { status: "OPEN", followUp: false, reopened: false });
  assert.deepEqual(H.onCustomerReply("SOLVED"), { status: "OPEN", followUp: false, reopened: true });
  assert.deepEqual(H.onCustomerReply("CLOSED"), { status: "CLOSED", followUp: true, reopened: false });
  assert.equal(H.onAgentReply("OPEN"), "PENDING");
  assert.equal(H.onAgentReply("ON_HOLD"), "ON_HOLD");
  assert.equal(H.onAgentReply("OPEN", "SOLVED"), "SOLVED");
  assert.equal(H.autoCloseAt("2026-10-13T12:00:00.000Z", 4), "2026-10-17T12:00:00.000Z");
});

test("e-mail: endereços", () => {
  assert.deepEqual(H.parseAddress("Ana Souza <Ana@Exemplo.com.br>"), { name: "Ana Souza", email: "ana@exemplo.com.br" });
  assert.deepEqual(H.parseAddress('"Souza, Ana" <ana@x.com>'), { name: "Souza, Ana", email: "ana@x.com" });
  assert.deepEqual(H.parseAddress("bia@x.com"), { name: "", email: "bia@x.com" });
  assert.equal(H.parseAddress("não é e-mail"), null);
  assert.deepEqual(H.parseAddressList('"Souza, Ana" <ana@x.com>; bia@x.com, ANA@x.com, lixo').map((a) => a.email), ["ana@x.com", "bia@x.com"]);
});

test("e-mail: assunto, número e referências", () => {
  assert.equal(H.normalizeSubject("RES: Re: ENC: Problema no boleto [#12]"), "Problema no boleto");
  assert.equal(H.normalizeSubject("Re[2]:  Fwd: Acesso"), "Acesso");
  assert.equal(H.extractTicketNumber("Re: Boleto [#12] e outro [#345]"), 345);
  assert.equal(H.extractTicketNumber("Pedido #12"), null);
  assert.equal(H.ticketSubject("Re: Boleto [#12]", 12), "Boleto [#12]");
  assert.equal(H.ticketSubject("", 7), "(sem assunto) [#7]");
  assert.deepEqual(H.parseReferences("<a@b.com> <c@d.com>\r\n <e@f>"), ["<a@b.com>", "<c@d.com>", "<e@f>"]);
  assert.equal(H.messageIdFor({ ticketId: "t1", messageId: "m1", domain: "suporte.app" }), "<hd.t1.m1@suporte.app>");
});

test("e-mail: encadeamento das respostas", () => {
  const index = { messageIds: new Map([["<hd.t1.m1@app>", "t1"]]), byNumber: new Map([[12, { id: "t12", participants: ["ana@x.com", "cc@x.com"] }]]) };
  assert.deepEqual(H.matchThread({ inReplyTo: "<hd.t1.m1@app>", subject: "Re: x" }, index), { ticketId: "t1", by: "header" });
  assert.deepEqual(H.matchThread({ references: "<outro@x> <hd.t1.m1@app>", subject: "x" }, index), { ticketId: "t1", by: "header" });
  assert.deepEqual(H.matchThread({ subject: "Re: Boleto [#12]", from: "Cc <CC@x.com>" }, index), { ticketId: "t12", by: "subject" });
  assert.equal(H.matchThread({ subject: "Re: Boleto [#12]", from: "intruso@y.com" }, index), null, "número sem ser participante não basta");
  assert.equal(H.matchThread({ subject: "Novo assunto", from: "ana@x.com" }, index), null);
});

test("e-mail: tira a mensagem citada", () => {
  const gmail = "Funcionou, obrigada!\n\nEm ter., 13 de out. de 2026 às 10:00, Suporte <\nsuporte@acme.com> escreveu:\n> Tente de novo\n> Abraço";
  assert.equal(H.stripQuotedReply(gmail), "Funcionou, obrigada!");
  const outlook = "Segue o print.\r\n\r\n________________________________\r\nDe: Suporte <suporte@acme.com>\r\nEnviado: terça-feira\r\nAssunto: Boleto";
  assert.equal(H.stripQuotedReply(outlook), "Segue o print.");
  const outlook2 = "Ok.\nDe: Suporte <s@a.com>\nEnviado: 13/10\nPara: ana@x.com";
  assert.equal(H.stripQuotedReply(outlook2), "Ok.");
  assert.equal(H.stripQuotedReply("Valeu\n\nOn Tue, Oct 13, 2026 at 10:00 AM Support <s@a.com> wrote:\n> hi"), "Valeu");
  assert.equal(H.stripQuotedReply("Resolvido\n\nEnviado do meu iPhone"), "Resolvido");
  assert.equal(H.stripQuotedReply("Linha 1\n> citação no meio\nLinha 2"), "Linha 1\n> citação no meio\nLinha 2", "citação no meio fica");
  assert.equal(H.stripQuotedReply("> só citação"), "> só citação", "nunca devolve vazio");
});

test("e-mail: resposta automática e confirmação", () => {
  assert.equal(H.isAutoReply({ headers: { "Auto-Submitted": "auto-replied" } }).auto, true);
  assert.equal(H.isAutoReply({ headers: { "Auto-Submitted": "no" }, subject: "Dúvida" }).auto, false);
  assert.equal(H.isAutoReply({ headers: { Precedence: "bulk" } }).auto, true);
  assert.equal(H.isAutoReply({ headers: { "List-Id": "<news.x.com>" } }).reason, "lista");
  assert.equal(H.isAutoReply({ subject: "Resposta automática: Boleto [#12]" }).auto, true);
  assert.equal(H.isAutoReply({ subject: "RES: Ausente até segunda" }).auto, true);
  assert.deepEqual(H.isAutoReply({ from: "MAILER-DAEMON@x.com", subject: "Undeliverable: x" }), { auto: true, bounce: true, reason: "devolução" });
  assert.equal(H.isAutoReply({ subject: "Não consigo acessar" }).auto, false);
  assert.equal(H.shouldAutoAck({ auto: false, fromEmail: "ana@x.com", ownAddresses: ["suporte@acme.com"] }), true);
  assert.equal(H.shouldAutoAck({ auto: false, fromEmail: "Suporte@acme.com", ownAddresses: ["suporte@acme.com"] }), false, "nosso próprio endereço");
  assert.equal(H.shouldAutoAck({ auto: false, fromEmail: "ana@x.com", acksLastHour: 3 }), false, "limite por hora");
  assert.equal(H.shouldAutoAck({ auto: true, fromEmail: "ana@x.com" }), false);
});

test("distribuição: rodízio e por carga", () => {
  const c = [
    { id: "ana", available: true, openCount: 5, lastAssignedAt: "2026-10-13T10:00:00Z" },
    { id: "bia", available: true, openCount: 2, lastAssignedAt: "2026-10-13T11:00:00Z" },
    { id: "caio", available: false, openCount: 0 },
    { id: "davi", available: true, openCount: 9, maxOpen: 9 },
  ];
  assert.equal(H.pickAgent(c), "ana", "rodízio: quem recebeu há mais tempo (indisponível e lotado ficam fora)");
  assert.equal(H.pickAgent(c, { method: "load" }), "bia");
  assert.equal(H.pickAgent([{ id: "x", available: true }, { id: "y", available: true }]), "x", "empate: ordem da lista");
  assert.equal(H.pickAgent([{ id: "x", available: false }]), null);
});

test("gatilhos: validação, condições sem acento e rodadas", () => {
  assert.deepEqual(H.validateRule({ name: "", on: [], conditions: { all: [{ field: "subject", op: "in" }, { field: "x", op: "is" }] }, actions: [{ type: "set_status", value: "CLOSED" }] }).map((e) => e.path),
    ["name", "on", "conditions.all.0.op", "conditions.all.1.field", "actions.0.value"]);
  const rules = [
    { id: "r2", name: "Financeiro é alta", active: true, on: ["created"], conditions: { all: [{ field: "queueId", op: "is", value: "fin" }] }, actions: [{ type: "set_priority", value: "HIGH" }] },
    { id: "r1", name: "Boleto vai pro financeiro", active: true, on: ["created"], conditions: { any: [{ field: "subject", op: "contains", value: ["boleto", "nota fiscal"] }] }, actions: [{ type: "set_queue", value: "fin" }, { type: "add_tags", value: ["Cobrança"] }, { type: "assign", value: "round_robin" }] },
    { id: "r3", name: "Inativa", active: false, on: ["created"], conditions: {}, actions: [{ type: "set_status", value: "SOLVED" }] },
  ];
  const t = { subject: "2ª via do BOLÉTO", priority: "NORMAL", queueId: "geral", status: "OPEN", tags: [], requesterEmail: "ana@cliente.com.br" };
  const out = H.runRules(rules, { event: "created", ticket: t });
  assert.equal(out.ticket.queueId, "fin");
  assert.equal(out.ticket.priority, "HIGH", "regra anterior dispara na segunda rodada");
  assert.deepEqual(out.ticket.tags, ["cobranca"]);
  assert.deepEqual(out.fired.sort(), ["r1", "r2"]);
  assert.deepEqual(out.effects.map((e) => e.type), ["auto_assign"]);
  assert.equal(H.runRules(rules, { event: "updated", ticket: t }).fired.length, 0, "só no evento configurado");
  assert.equal(H.evalCondition({ field: "status", op: "changed_to", value: "SOLVED" }, { status: "SOLVED" }, { status: "OPEN" }), true);
  assert.equal(H.evalCondition({ field: "status", op: "changed_to", value: "SOLVED" }, { status: "SOLVED" }, { status: "SOLVED" }), false);
  assert.equal(H.evalCondition({ field: "requesterDomain", op: "is", value: "CLIENTE.com.br" }, t), true);
  assert.equal(H.evalCondition({ field: "tags", op: "includes", value: "vip" }, { tags: ["VIP"] }), true);
});

test("macros e textos", () => {
  const ctx = H.templateContext({ ticket: { number: 42, subject: "Boleto", status: "PENDING" }, requester: { name: "Ana Souza", email: "ana@x.com" }, agent: { name: "Bia Lima" }, organization: { name: "Acme" }, ticketUrl: "https://app/chamado/t" });
  assert.equal(H.renderTemplate("Olá {{cliente.primeiro_nome}}, aqui é {{ agente.primeiro_nome }} da {{empresa.nome}} sobre o {{chamado.numero}} ({{chamado.status}}){{nada.aqui}}.", ctx), "Olá Ana, aqui é Bia da Acme sobre o #42 (Aguardando cliente).");
  assert.equal(H.renderTemplate("<b>{{cliente.nome}}</b>", H.templateContext({ requester: { name: "<script>" } }), { html: true }), "<b>&lt;script&gt;</b>");
  assert.equal(H.templateContext({ requester: { email: "z@x.com" } }).cliente.nome, "z@x.com");
});

test("números, relatórios e CSAT", () => {
  assert.equal(H.formatTicketNumber(1024), "#1024");
  assert.deepEqual(H.csatSummary([{ rating: "GOOD" }, { rating: "GOOD" }, { rating: "BAD" }, "GOOD"]), { good: 3, bad: 1, total: 4, score: 75 });
  assert.equal(H.csatSummary([]).score, null);
  assert.equal(H.median([5, 1, 3]), 3);
  assert.equal(H.median([1, 2, 3, 4]), 2.5);
  assert.equal(H.percentile([10, 20, 30, 40, 50], 0.9), 46);
  assert.equal(H.median([]), null);
  assert.deepEqual([45, 60, 135, 1440, 3000].map(H.formatDuration), ["45 min", "1 h", "2 h 15 min", "1 d", "2 d 2 h"]);
});

test("base de conhecimento e chaves", () => {
  assert.equal(H.slugify("Como emitir a 2ª via do boleto?"), "como-emitir-a-2a-via-do-boleto");
  assert.equal(H.isValidSlug("como-emitir"), true);
  assert.equal(H.isValidSlug("-x"), false);
  const long = "Para emitir a segunda via acesse o menu Financeiro. ".repeat(3) + "Depois clique em Boletos e escolha o mês desejado para baixar o PDF atualizado com juros. " + "Texto final. ".repeat(10);
  const ex = H.excerpt(long, "boletos mes", 80);
  assert.ok(ex.startsWith("…") && ex.endsWith("…") && H.fold(ex).includes("boletos"), ex);
  assert.equal(H.excerpt("curto", "x"), "curto");
  assert.equal(H.readingMinutes("palavra ".repeat(450)), 3);
  assert.equal(H.hashToken("abc"), H.hashToken("abc"));
  assert.notEqual(H.newToken(), H.newToken());
  const key = H.newApiKey();
  assert.match(key, /^hd_[A-Za-z0-9_-]{32}$/);
  assert.equal(H.apiKeyPrefix(key), key.slice(0, 10));
});
