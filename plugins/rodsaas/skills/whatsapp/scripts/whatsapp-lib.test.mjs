import { test } from "node:test";
import assert from "node:assert/strict";
import * as W from "./whatsapp-lib.mjs";

test("telefone: Brasil com e sem DDI, fixo, celular sem o 9, internacional e inválidos", () => {
  assert.equal(W.normalizePhone("(44) 99999-1234"), "5544999991234");
  assert.equal(W.normalizePhone("+55 44 3222-1234"), "554432221234");
  assert.equal(W.normalizePhone("0055 11 98888-7777"), "5511988887777");
  assert.equal(W.normalizePhone("44 89999-1234"), null, "celular de 9 dígitos começa com 9");
  assert.equal(W.normalizePhone("(04) 99999-1234"), null, "DDD inválido");
  assert.equal(W.normalizePhone("(40) 99999-1234"), null, "DDD não termina em 0");
  assert.equal(W.normalizePhone("+351 912 345 678"), "351912345678", "Portugal");
  assert.equal(W.normalizePhone("912345678"), null, "sem DDI e sem formato brasileiro");
  assert.equal(W.normalizePhone("+1 234"), null, "curto demais");
  assert.equal(W.normalizePhone(""), null);
  assert.equal(W.formatPhone("5544999991234"), "+55 44 99999-1234");
  assert.equal(W.formatPhone("554432221234"), "+55 44 3222-1234");
  assert.equal(W.formatPhone("351912345678"), "+351912345678");
});

test("janela de 24 h e como mandar", () => {
  assert.deepEqual(W.windowState(null), { open: false, closesAt: null });
  assert.deepEqual(W.windowState("2026-10-14T10:00:00Z", Date.parse("2026-10-15T09:59:59Z")), { open: true, closesAt: "2026-10-15T10:00:00.000Z" });
  assert.equal(W.windowState("2026-10-14T10:00:00Z", Date.parse("2026-10-15T10:00:00Z")).open, false, "24 h exatas: fechou");
  assert.deepEqual(W.chooseSendMode({ kind: "text", windowOpen: false, capabilities: { templates: true } }), { ok: false, error: { code: "OUTSIDE_WINDOW" } });
  assert.deepEqual(W.chooseSendMode({ kind: "text", windowOpen: true }), { ok: true, mode: "FREEFORM" });
  assert.deepEqual(W.chooseSendMode({ kind: "text", windowOpen: false, capabilities: { freeformAnytime: true } }), { ok: true, mode: "FREEFORM" }, "driver sem a regra da janela");
  assert.deepEqual(W.chooseSendMode({ kind: "template", windowOpen: false, capabilities: { templates: true } }), { ok: true, mode: "TEMPLATE" });
  assert.equal(W.chooseSendMode({ kind: "template", capabilities: { templates: false } }).error.code, "TEMPLATES_NOT_SUPPORTED");
});

test("modelos: validação no formato mais restrito e preenchimento", () => {
  const ok = { name: "agenda_lembrete", category: "UTILITY", language: "pt_BR", body: "Olá {{1}}, lembrete do seu horário {{2}}. Confirme:", buttons: ["Confirmo", "Remarcar"] };
  assert.deepEqual(W.validateTemplate(ok), []);
  const codes = (t) => W.validateTemplate({ ...ok, ...t }).map((e) => e.code);
  assert.deepEqual(codes({ name: "Agenda Lembrete" }), ["NAME_INVALID"]);
  assert.deepEqual(codes({ category: "PROMO" }), ["CATEGORY_INVALID"]);
  assert.deepEqual(codes({ language: "portugues" }), ["LANGUAGE_INVALID"]);
  assert.deepEqual(codes({ body: "Oi {{1}} e {{3}} ok" }), ["VARIABLES_OUT_OF_ORDER"]);
  assert.deepEqual(codes({ body: "{{1}}, seu horário" }), ["VARIABLE_AT_EDGE"]);
  assert.deepEqual(codes({ body: "Seu horário é {{1}}." }), ["VARIABLE_AT_EDGE"], "termina com variável e ponto");
  assert.deepEqual(codes({ body: "Oi {{1}} {{2}} ok" }), ["VARIABLES_ADJACENT"]);
  assert.deepEqual(codes({ body: "x".repeat(1025) }), ["BODY_TOO_LONG"]);
  assert.deepEqual(codes({ body: "   " }), ["BODY_REQUIRED"]);
  assert.deepEqual(codes({ buttons: ["a", "b", "c", "d"] }), ["TOO_MANY_BUTTONS"]);
  assert.deepEqual(W.validateTemplate({ ...ok, buttons: ["Quero muito remarcar sim"] }).map((e) => e.path), ["buttons.0"]);
  assert.equal(W.templateVariableCount(ok.body), 2);
  assert.equal(W.templateVariableCount("sem variável"), 0);
  assert.deepEqual(W.renderTemplate(ok.body, ["Ana", "quinta 09:00"]), { ok: true, text: "Olá Ana, lembrete do seu horário quinta 09:00. Confirme:" });
  assert.deepEqual(W.renderTemplate(ok.body, ["Ana"]).errors.map((e) => e.path), ["template.variables.1"]);
  assert.deepEqual(W.renderTemplate(ok.body, ["Ana", "  "]).errors.map((e) => e.code), ["VARIABLE_MISSING"]);
  assert.deepEqual(W.renderTemplate(ok.body, ["a", "b", "c"]).errors.map((e) => e.code), ["TOO_MANY_VARIABLES"]);
  assert.equal(W.renderTemplate("Oi {{1}} e {{1}} de novo", ["Ana"]).text, "Oi Ana e Ana de novo", "variável repetida");
});

test("status só anda para frente e falha só antes de entregar", () => {
  assert.equal(W.nextStatus("QUEUED", "SENT"), "SENT");
  assert.equal(W.nextStatus("SENT", "READ"), "READ", "pula entregue");
  assert.equal(W.nextStatus("READ", "DELIVERED"), "READ", "chegou fora de ordem");
  assert.equal(W.nextStatus("DELIVERED", "DELIVERED"), "DELIVERED");
  assert.equal(W.nextStatus("SENT", "FAILED"), "FAILED");
  assert.equal(W.nextStatus("QUEUED", "FAILED"), "FAILED");
  assert.equal(W.nextStatus("DELIVERED", "FAILED"), "DELIVERED", "entregue não volta a falhar");
  assert.equal(W.nextStatus("FAILED", "SENT"), "FAILED");
  assert.equal(W.nextStatus("SENT", "XPTO"), "SENT");
});

test("descadastro, volta e respostas rápidas", () => {
  assert.ok(W.isOptOut("parar") && W.isOptOut(" PARAR. ") && W.isOptOut("Não quero receber") && W.isOptOut("stop"));
  assert.ok(!W.isOptOut("não vou parar de ir aí") && !W.isOptOut("sair mais cedo?"), "frase com a palavra não conta");
  assert.ok(W.isOptIn("voltar") && W.isOptIn("Quero receber") && !W.isOptIn("parar"));
  const opts = [{ key: "CONFIRM", labels: ["1", "Confirmo"] }, { key: "RESCHEDULE", labels: ["2", "Remarcar"] }];
  assert.equal(W.parseQuickReply("1", opts), "CONFIRM");
  assert.equal(W.parseQuickReply("confirmo!", opts), "CONFIRM");
  assert.equal(W.parseQuickReply({ payload: "RESCHEDULE" }, opts), "RESCHEDULE", "payload do botão");
  assert.equal(W.parseQuickReply("  2 ", opts), "RESCHEDULE");
  assert.equal(W.parseQuickReply("talvez", opts), null);
  assert.equal(W.parseQuickReply("", opts), null);
});

test("texto longo quebra em partes respeitando linha e espaço", () => {
  const t = "linha um\n" + "a".repeat(30) + "\nfim";
  const parts = W.splitText(t, 25);
  assert.ok(parts.every((p) => p.length <= 25), parts.join("|"));
  assert.equal(parts[0], "linha um", "quebra na linha");
  assert.equal(parts.join("").replace(/\s/g, ""), t.replace(/\s/g, ""), "nada se perde");
  assert.deepEqual(W.splitText("curto"), ["curto"]);
  assert.deepEqual(W.splitText(""), [""]);
  assert.deepEqual(W.splitText("aaaa bbbb cccc", 9), ["aaaa bbbb", "cccc"], "quebra no espaço");
  assert.deepEqual(W.splitText("x".repeat(10), 4), ["xxxx", "xxxx", "xx"], "sem espaço corta no limite");
});

test("erros de cada driver viram os internos e nova tentativa só no que repete", () => {
  assert.deepEqual(W.normalizeError("meta", 131047), { code: "OUTSIDE_WINDOW", ...W.ERRORS.OUTSIDE_WINDOW });
  assert.equal(W.normalizeError("meta", 190).code, "AUTH");
  assert.equal(W.normalizeError("fake", "FAKE_RATE").code, "RATE_LIMIT");
  assert.equal(W.normalizeError("zenvia", "qualquer").code, "UNKNOWN", "driver sem tabela");
  assert.equal(W.retryDelay("RATE_LIMIT", 1), 30_000);
  assert.equal(W.retryDelay("TEMPORARY", 5), 7_200_000);
  assert.equal(W.retryDelay("TEMPORARY", 6), null, "desiste depois da 5ª");
  assert.equal(W.retryDelay("NOT_ON_WHATSAPP", 1), null, "não adianta repetir");
  assert.equal(W.retryDelay("XPTO", 1), null);
});

test("webhook: assinatura HMAC no corpo cru, comparação segura", () => {
  const body = JSON.stringify({ events: [{ type: "message", id: "m1" }] });
  const sig = W.signWebhook("segredo", body);
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
  assert.ok(W.verifyWebhook("segredo", body, sig));
  assert.ok(!W.verifyWebhook("outro", body, sig), "outro segredo");
  assert.ok(!W.verifyWebhook("segredo", body + " ", sig), "corpo alterado");
  assert.ok(!W.verifyWebhook("segredo", body, undefined), "sem assinatura");
  assert.ok(!W.verifyWebhook("", body, W.signWebhook("", body)), "sem segredo configurado nunca passa");
  assert.ok(!W.verifyWebhook("segredo", body, sig.slice(0, -1)), "tamanho diferente");
});

test("roteamento do que chega: resposta, recente, chamado aberto, padrão e caixa", () => {
  const base = { enabledApps: ["agenda", "crm", "helpdesk"], defaultApp: "crm", now: "2026-10-14T12:00:00Z" };
  assert.deepEqual(W.routeInbound({ ...base, replyToRef: { app: "agenda", id: "a1" } }), { app: "agenda", ref: { app: "agenda", id: "a1" }, reason: "REPLY" });
  assert.equal(W.routeInbound({ ...base, lastOutbound: { app: "agenda", at: "2026-10-11T12:00:00Z" } }).reason, "RECENT", "72 h exatas ainda vale");
  assert.equal(W.routeInbound({ ...base, lastOutbound: { app: "agenda", at: "2026-10-11T11:59:00Z" }, hasOpenTicket: true }).app, "helpdesk", "passou de 72 h: chamado aberto");
  assert.equal(W.routeInbound({ ...base }).app, "crm", "padrão");
  assert.equal(W.routeInbound({ ...base, replyToRef: { app: "erp" } }).app, "crm", "app desligado não recebe");
  assert.deepEqual(W.routeInbound({ enabledApps: [], defaultApp: "crm" }), { app: "inbox", ref: null, reason: "UNROUTED" });
});

test("contrato do driver", () => {
  const ok = { id: "zenvia", capabilities: { templates: true, inbound: true }, connect() {}, send() {}, parseWebhook() {}, verifyWebhook() {} };
  assert.deepEqual(W.validateDriver(ok), []);
  assert.deepEqual(W.validateDriver({ ...ok, id: "Zen Via" }), ["id inválido"]);
  assert.deepEqual(W.validateDriver({ ...ok, send: undefined }), ["falta o método send"]);
  assert.deepEqual(W.validateDriver({ ...ok, capabilities: { voz: true } }), ["capacidade desconhecida: voz"]);
});
