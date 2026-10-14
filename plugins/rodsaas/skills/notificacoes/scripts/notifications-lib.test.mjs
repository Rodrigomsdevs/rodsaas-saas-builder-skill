import { test } from "node:test";
import assert from "node:assert/strict";
import * as N from "./notifications-lib.mjs";

const T0 = Date.parse("2026-10-13T12:00:00Z"); // 09:00 em São Paulo
const SP = "America/Sao_Paulo";
const ALL_APPS = ["tarefas", "crm", "forms", "agenda", "helpdesk"];
const catalog = N.catalogFor({ apps: ALL_APPS, addons: ["uploads"] });
const tm = N.typeMap(catalog);
const def = (t) => tm.get(t);

test("catálogo inteiro (base + presets) é válido e sem tipos repetidos", () => {
  assert.deepEqual(N.validateCatalog([...N.BASE_TYPES, ...N.PRESET_TYPES]), []);
  assert.ok(catalog.length > 30);
});

test("validateCatalog acusa tipo inválido, repetido, sem app e chave desconhecida", () => {
  const errs = N.validateCatalog([
    { type: "Tarefa", appId: "x", label: "a", template: "a" },
    { type: "a.b", appId: "x", label: "a", template: "{actor} fez" },
    { type: "a.b", appId: "x", label: "a", template: "ok" },
    { type: "a.c", label: "a", template: "ok" },
    { type: "a.d", appId: "x", label: "a", template: "{nome} fez" },
    { type: "a.e", appId: "x", label: "a", template: { one: "ok" } },
  ]);
  assert.ok(errs.some((e) => e.startsWith("Tarefa:")));
  assert.ok(errs.some((e) => e.includes("repetido")));
  assert.ok(errs.some((e) => e.startsWith("a.c") && e.includes("appId")));
  assert.ok(errs.some((e) => e.includes("{nome}")));
  assert.ok(errs.some((e) => e.startsWith("a.e")));
});

test("catalogFor: só tipos dos apps instalados e dos add-ons exigidos", () => {
  const c = N.catalogFor({ apps: ["crm"] });
  assert.ok(c.some((t) => t.type === "crm.deal.assigned"));
  assert.ok(!c.some((t) => t.type === "task.assigned"));
  assert.ok(c.some((t) => t.type === "org.member_joined"));
  assert.ok(!c.some((t) => t.type === "files.quota_warning"), "sem uploads, sem aviso de armazenamento");
});

test("channelsFor: padrão geral, padrão do tipo nunca sobe, sobrescrita por tipo e críticos", () => {
  const p = N.defaultPrefs();
  assert.deepEqual(N.channelsFor(def("task.assigned"), p), { inApp: true, email: "IMMEDIATE" });
  assert.deepEqual(N.channelsFor(def("org.member_joined"), p), { inApp: true, email: "DAILY" }, "tipo com padrão DAILY");
  assert.equal(N.channelsFor(def("task.assigned"), { ...p, emailMode: "DAILY" }).email, "DAILY");
  assert.equal(N.channelsFor(def("org.member_joined"), { ...p, emailMode: "OFF" }).email, "OFF", "geral desligada vence o padrão do tipo");
  const o = { ...p, emailMode: "OFF", types: { "task.assigned": { inApp: false, email: "IMMEDIATE" } } };
  assert.deepEqual(N.channelsFor(def("task.assigned"), o), { inApp: false, email: "IMMEDIATE" }, "sobrescrita por tipo vale mesmo com a geral desligada");
  assert.deepEqual(N.channelsFor(def("billing.payment_failed"), { ...p, emailMode: "OFF", types: { "billing.payment_failed": { inApp: false, email: "OFF" } } }), { inApp: true, email: "IMMEDIATE" });
});

test("normalizePrefs: formato novo, formato antigo (disabledTypes), erros e críticos", () => {
  let r = N.normalizePrefs({ emailMode: "DAILY", digestHour: 7, types: { "task.commented": { inApp: false }, "task.assigned": { email: "OFF" } } }, catalog);
  assert.deepEqual(r.errors, []);
  assert.equal(r.prefs.emailMode, "DAILY");
  assert.equal(r.prefs.digestHour, 7);
  assert.deepEqual(r.prefs.types["task.commented"], { inApp: false, email: "DEFAULT" });
  assert.deepEqual(r.prefs.types["task.assigned"], { inApp: true, email: "OFF" });
  r = N.normalizePrefs({ types: { "task.assigned": { email: "DEFAULT" } } }, catalog, r.prefs);
  assert.equal(r.prefs.types["task.assigned"], undefined, "voltar ao padrão limpa a sobrescrita");

  r = N.normalizePrefs({ disabledTypes: ["task.status", "task.commented"] }, catalog);
  assert.deepEqual(N.disabledTypesOf(r.prefs).sort(), ["task.commented", "task.status"]);
  r = N.normalizePrefs({ disabledTypes: ["task.status"] }, catalog, r.prefs);
  assert.deepEqual(N.disabledTypesOf(r.prefs), ["task.status"], "lista antiga é a verdade");

  r = N.normalizePrefs({ emailMode: "SEMPRE", digestHour: 24, types: { "x.y": { inApp: false }, "task.status": { inApp: "não" }, "billing.payment_failed": { inApp: false } } }, catalog);
  const paths = r.errors.map((e) => e.path);
  for (const p of ["emailMode", "digestHour", "types.x.y", "types.task.status.inApp", "types.billing.payment_failed"]) assert.ok(paths.includes(p), p);
});

test("prefsView agrupa por app com o e-mail efetivo", () => {
  const { prefs } = N.normalizePrefs({ emailMode: "DAILY", types: { "task.assigned": { email: "IMMEDIATE" } } }, catalog);
  const v = N.prefsView(prefs, catalog);
  assert.equal(v.groups[0].appId, "geral");
  const t = v.groups.find((g) => g.appId === "tarefas");
  assert.equal(t.label, "Tarefas");
  const a = t.types.find((x) => x.type === "task.assigned");
  assert.equal(a.email, "IMMEDIATE");
  assert.equal(t.types.find((x) => x.type === "task.status").effectiveEmail, "DAILY");
  assert.equal(v.groups[0].types.find((x) => x.type === "billing.payment_failed").critical, true);
  const asMember = N.prefsView(prefs, catalog, { role: "MEMBER" });
  const geral = asMember.groups.find((g) => g.appId === "geral").types.map((x) => x.type);
  assert.ok(!geral.includes("billing.payment_failed") && !geral.includes("org.member_joined"), "membro não vê avisos que só owners/admins recebem");
  assert.ok(geral.includes("org.role_changed"));
});

test("descadastro de um tipo e de tudo, e desfazer", () => {
  let p = N.applyUnsubscribe(N.defaultPrefs(), "task.commented");
  assert.equal(N.channelsFor(def("task.commented"), p).email, "OFF");
  assert.equal(N.channelsFor(def("task.commented"), p).inApp, true, "o sino continua");
  p = N.undoUnsubscribe(p, "task.commented", "DEFAULT");
  assert.deepEqual(p.types, {});
  p = N.applyUnsubscribe(N.defaultPrefs(), "*");
  assert.equal(p.emailMode, "OFF");
  assert.equal(N.undoUnsubscribe(p, "*", "DAILY").emailMode, "DAILY");
});

test("resolveRecipients: tira ator, repetidos, não membros e quem não vê", () => {
  const r = N.resolveRecipients({ candidates: ["a", "b", "a", null, "c", "d", "e"], actorId: "b", activeMemberIds: ["a", "b", "c", "e"], canSee: (id) => id !== "e" });
  assert.deepEqual(r.to, ["a", "c"]);
  assert.deepEqual(r.skipped.map((s) => `${s.userId}:${s.reason}`), ["b:actor", "d:not_member", "e:no_access"]);
  assert.deepEqual(N.resolveRecipients({ candidates: ["x", "y"], canSee: new Set(["y"]) }).to, ["y"]);
});

test("agrupamento: chave por registro, por chave e sem agrupar", () => {
  assert.equal(N.groupKeyFor(def("task.commented"), { entityType: "task", entityId: "t1" }), "task.commented:task:t1");
  assert.equal(N.groupKeyFor(def("task.assigned"), { entityType: "task", entityId: "t1", groupKey: "p1" }), "task.assigned:p1");
  assert.equal(N.groupKeyFor(def("org.role_changed"), { entityType: "member", entityId: "m" }), null);
});

test("newNotification + mergeInto + canGroup: janela deslizante, limite e ator mais recente", () => {
  const d = def("task.commented");
  const ch = N.channelsFor(d, N.defaultPrefs());
  const n = N.newNotification(d, { actorId: "ana", entityType: "task", entityId: "t1", url: "/tarefas/t/MKT-1", data: { title: "MKT-1 · Contrato" } }, "u1", ch, T0);
  assert.equal(n.emailStatus, "PENDING");
  assert.equal(n.emailMode, "IMMEDIATE");
  assert.equal(Date.parse(n.groupOpenUntil), T0 + 2 * 60_000);
  assert.ok(N.canGroup(n, T0 + 60_000));
  assert.ok(!N.canGroup(n, T0 + 2 * 60_000 + 1), "fechou depois de 2 min sem evento");
  const m1 = { ...n, ...N.mergeInto(n, d, { actorId: "bia", data: { snippet: "ok" } }, T0 + 90_000) };
  assert.equal(m1.count, 2);
  assert.deepEqual(m1.actorIds, ["bia", "ana"]);
  assert.equal(m1.data.title, "MKT-1 · Contrato");
  assert.equal(Date.parse(m1.groupOpenUntil), T0 + 90_000 + 120_000, "janela desliza");
  const m2 = { ...m1, ...N.mergeInto(m1, d, { actorId: "ana" }, T0 + 200_000) };
  assert.deepEqual(m2.actorIds, ["ana", "bia"], "sem repetir ator");
  assert.ok(!N.canGroup({ ...m2, readAt: new Date(T0).toISOString() }, T0 + 210_000), "lida não agrupa");
  assert.ok(!N.canGroup({ ...m2, emailStatus: "SENT" }, T0 + 210_000), "e-mail já enviado não agrupa");
  const long = def("org.member_joined");
  const j = N.newNotification(long, { actorId: "x", entityType: "organization", entityId: "o" }, "u", { inApp: true, email: "OFF" }, T0);
  assert.equal(j.emailStatus, "NONE");
  const late = N.mergeInto(j, long, { actorId: "y" }, T0 + 23.5 * 3600_000);
  assert.equal(Date.parse(late.groupOpenUntil), T0 + 24 * 3600_000, "nunca passa da idade máxima");
  const k = def("task.assigned");
  const a = N.newNotification(k, { actorId: "x", entityType: "task", entityId: "t1", groupKey: "p", url: "/tarefas/t/A-1" }, "u", ch, T0);
  assert.equal(N.mergeInto(a, k, { actorId: "x", entityId: "t2", url: "/tarefas/t/A-2", groupUrl: "/tarefas/minhas" }, T0 + 1000).url, "/tarefas/minhas");
});

test("emailAction: imediato sem grupo sai na hora; com grupo espera silêncio, com teto; lida e resumo", () => {
  const ch = { inApp: true, email: "IMMEDIATE" };
  const r = N.newNotification(def("org.role_changed"), { actorId: "a", entityType: "member", entityId: "m" }, "u", ch, T0);
  assert.deepEqual(N.emailAction(r, def("org.role_changed"), T0), { action: "send" });
  const d = def("task.commented");
  const n = N.newNotification(d, { actorId: "a", entityType: "task", entityId: "t" }, "u", ch, T0);
  assert.equal(N.emailAction(n, d, T0 + 30_000).action, "wait");
  assert.equal(N.emailAction(n, d, T0 + 30_000).at, T0 + 60_000);
  assert.equal(N.emailAction(n, d, T0 + 60_000).action, "send");
  const busy = { ...n, updatedAt: new Date(T0 + 170_000).toISOString() };
  assert.equal(N.emailAction(busy, d, T0 + 180_000).action, "send", "teto de 3 min mesmo com eventos chegando");
  assert.deepEqual(N.emailAction({ ...n, readAt: new Date().toISOString() }, d, T0 + 999_999), { action: "skip", reason: "read" });
  const daily = N.newNotification(d, { actorId: "a", entityType: "task", entityId: "t" }, "u", { inApp: true, email: "DAILY" }, T0);
  assert.equal(N.emailAction(daily, d, T0 + 999_999).reason, "digest");
  assert.equal(N.emailAction({ ...n, emailStatus: "SENT" }, d, T0 + 999_999).action, "skip");
});

test("bundleImmediate: vários prontos da mesma pessoa viram um e-mail", () => {
  const b = N.bundleImmediate([
    { userId: "u1", text: "Ana comentou", updatedAt: "2026-10-13T12:00:00Z" },
    { userId: "u1", text: "Bia comentou", updatedAt: "2026-10-13T12:01:00Z" },
    { userId: "u2", text: "Caio mencionou você", updatedAt: "2026-10-13T12:00:00Z" },
  ], { orgName: "Acme" });
  assert.equal(b.length, 2);
  assert.equal(b.find((x) => x.userId === "u1").subject, "2 novidades em Acme");
  assert.equal(b.find((x) => x.userId === "u1").items[0].text, "Bia comentou", "mais recente primeiro");
  assert.equal(b.find((x) => x.userId === "u2").subject, "Caio mencionou você");
});

test("resumo diário no fuso: devido depois da hora local, uma vez por dia; próximo horário", () => {
  assert.equal(N.digestDue({ timeZone: SP, hour: 8, now: Date.parse("2026-10-13T10:59:00Z") }), false, "07:59 em SP");
  assert.equal(N.digestDue({ timeZone: SP, hour: 8, now: Date.parse("2026-10-13T11:00:00Z") }), true, "08:00 em SP");
  assert.equal(N.digestDue({ timeZone: SP, hour: 8, lastDigestAt: "2026-10-13T11:00:30Z", now: Date.parse("2026-10-13T20:00:00Z") }), false, "já saiu hoje");
  assert.equal(N.digestDue({ timeZone: SP, hour: 8, lastDigestAt: "2026-10-12T11:00:30Z", now: Date.parse("2026-10-13T11:05:00Z") }), true);
  assert.equal(N.digestDue({ timeZone: SP, hour: 8, lastDigestAt: "2026-10-13T02:30:00Z", now: Date.parse("2026-10-13T11:05:00Z") }), true, "23:30 de ontem em SP ainda é ontem");
  assert.equal(N.nextDigestAt({ timeZone: SP, hour: 8, now: Date.parse("2026-10-13T10:00:00Z") }), Date.parse("2026-10-13T11:00:00Z"));
  assert.equal(N.nextDigestAt({ timeZone: SP, hour: 8, now: Date.parse("2026-10-13T11:00:00Z") }), Date.parse("2026-10-14T11:00:00Z"));
  // horário de verão (Nova York: 2026-11-01 volta uma hora)
  assert.equal(N.nextDigestAt({ timeZone: "America/New_York", hour: 8, now: Date.parse("2026-10-31T14:00:00Z") }), Date.parse("2026-11-01T13:00:00Z"));
  assert.equal(N.zonedToUtc("2026-03-08", 2, "America/New_York"), Date.parse("2026-03-08T07:00:00Z"), "02:00 que não existe anda para frente");
});

test("buildDigest: só não lidas que esperavam o resumo, por app, com contagem agrupada", () => {
  const base = { emailStatus: "PENDING", emailMode: "DAILY", readAt: null };
  const items = [
    { ...base, id: "1", type: "task.commented", count: 3, updatedAt: "2026-10-12T15:00:00Z" },
    { ...base, id: "2", type: "task.assigned", count: 1, updatedAt: "2026-10-12T16:00:00Z" },
    { ...base, id: "3", type: "crm.deal.won", count: 1, updatedAt: "2026-10-12T10:00:00Z" },
    { ...base, id: "4", type: "task.status", readAt: "2026-10-12T17:00:00Z", updatedAt: "2026-10-12T17:00:00Z" },
    { ...base, id: "5", type: "task.status", emailMode: "IMMEDIATE", updatedAt: "2026-10-12T17:00:00Z" },
    { ...base, id: "6", type: "task.status", emailStatus: "SENT", updatedAt: "2026-10-12T17:00:00Z" },
  ];
  const d = N.buildDigest(items, catalog, { orgName: "Acme" });
  assert.equal(d.total, 5);
  assert.deepEqual(d.ids.sort(), ["1", "2", "3"]);
  assert.equal(d.subject, "Seu resumo de Acme: 5 novidades");
  assert.deepEqual(d.apps.map((a) => [a.appId, a.count]), [["tarefas", 4], ["crm", 1]]);
  assert.equal(d.apps[0].items[0].id, "2", "mais recente primeiro");
  assert.equal(N.buildDigest(items.slice(3), catalog), null, "nada pendente = sem e-mail");
  const many = Array.from({ length: 8 }, (_, i) => ({ ...base, id: `m${i}`, type: "task.status", updatedAt: `2026-10-12T1${i}:00:00Z` }));
  const dm = N.buildDigest(many, catalog, { perApp: 5 });
  assert.equal(dm.apps[0].items.length, 5);
  assert.equal(dm.apps[0].more, 3);
});

test("renderSegments: atores, plural, modelo many, data e destaques", () => {
  const names = { ana: "Ana", bia: "Bia", caio: "Caio" };
  const d = def("task.commented");
  let s = N.renderSegments(d, { count: 1, actorIds: ["ana"], data: { title: "MKT-12 · Contrato" } }, { names });
  assert.deepEqual(s, [{ text: "Ana", bold: true }, { text: " comentou em ", bold: false }, { text: "MKT-12 · Contrato", bold: true }]);
  s = N.renderSegments(d, { count: 3, actorIds: ["bia", "ana"], data: { title: "MKT-12" } }, { names });
  assert.equal(N.segmentsText(s), "Bia e Ana comentaram 3 vezes em MKT-12");
  s = N.renderSegments(def("task.mentioned"), { count: 4, actorIds: ["caio", "bia", "ana"], data: { title: "MKT-1" } }, { names });
  assert.equal(N.segmentsText(s), "Caio e mais 2 mencionaram você em MKT-1");
  s = N.renderSegments(def("org.member_joined"), { count: 1, actorIds: ["ana"] }, { names, orgName: "Acme" });
  assert.equal(N.segmentsText(s), "Ana entrou na Acme");
  s = N.renderSegments(def("org.role_changed"), { count: 1, actorId: "ana", data: { roleLabel: "Admin" } }, { names });
  assert.equal(N.segmentsText(s), "Ana mudou o seu papel para Admin");
  s = N.renderSegments(def("forms.response.new"), { count: 5, data: { title: "Orçamento" } }, {});
  assert.equal(N.segmentsText(s), "5 novas respostas em Orçamento");
  s = N.renderSegments(def("crm.deal.assigned"), { count: 1, actorIds: ["x"], data: { title: "<b>X</b>" } }, {});
  assert.equal(N.segmentsText(s), "Alguém passou o negócio <b>X</b> para você");
  assert.equal(N.segmentsHtml(s), "<strong>Alguém</strong> passou o negócio <strong>&lt;b&gt;X&lt;/b&gt;</strong> para você", "HTML do e-mail escapado");
});

test("todos os modelos do catálogo renderizam sem chave sobrando", () => {
  for (const d of catalog) for (const count of [1, 3]) {
    const text = N.segmentsText(N.renderSegments(d, { count, actorIds: ["a", "b"], data: { title: "T", to: "Feito", value: "R$ 1", client: "Cliente", queue: "Suporte", customer: "Cli", when: "amanhã", today: 1, overdue: 0, total: 2, forms: 1, percent: 80, reason: "data", created: 1, failed: 0, open: 1, breached: 0, count: 2, roleLabel: "Admin", planName: "Pro", days: 3 } }, { names: { a: "Ana", b: "Bia" } }));
    assert.ok(!/[{}|]/.test(text), `${d.type}: ${text}`);
    assert.ok(text.length > 5, d.type);
  }
});

test("snippet: uma linha, corta na palavra", () => {
  assert.equal(N.snippet("  olá\n\n mundo  "), "olá mundo");
  assert.equal(N.snippet("palavra ".repeat(40), 30), "palavra palavra palavra…");
});

test("dayBucket e relativeTime no fuso de quem vê", () => {
  const now = Date.parse("2026-10-13T15:00:00Z"); // 12:00 SP
  assert.equal(N.dayBucket("2026-10-13T03:30:00Z", SP, now), "today", "00:30 SP");
  assert.equal(N.dayBucket("2026-10-13T02:30:00Z", SP, now), "yesterday", "23:30 de ontem em SP");
  assert.equal(N.dayBucket("2026-10-11T12:00:00Z", SP, now), "older");
  assert.equal(N.relativeTime(now - 20_000, now), "agora");
  assert.equal(N.relativeTime(now - 5 * 60_000, now), "há 5 min");
  assert.equal(N.relativeTime(now - 3 * 3600_000, now), "há 3 h");
  assert.equal(N.relativeTime("2026-10-12T20:00:00Z", now), "ontem");
  assert.equal(N.relativeTime("2026-10-09T12:00:00Z", now), "há 4 dias");
  assert.equal(N.relativeTime("2026-09-02T12:00:00Z", now), "2 de set.");
  assert.equal(N.relativeTime("2025-12-24T12:00:00Z", now), "24 de dez. de 2025");
});

test("badgeText e documentTitle", () => {
  assert.equal(N.badgeText(0), "");
  assert.equal(N.badgeText(7), "7");
  assert.equal(N.badgeText(100), "99+");
  assert.equal(N.documentTitle("Tarefas · Acme", 3), "(3) Tarefas · Acme");
  assert.equal(N.documentTitle("Tarefas · Acme", 0), "Tarefas · Acme");
});

test("cursor ida e volta; cursor estragado = null", () => {
  const c = N.encodeCursor({ updatedAt: "2026-10-13T12:00:00.000Z", id: "abc" });
  assert.deepEqual(N.decodeCursor(c), { updatedAt: "2026-10-13T12:00:00.000Z", id: "abc" });
  assert.equal(N.decodeCursor("lixo"), null);
  assert.equal(N.decodeCursor(Buffer.from('["x","y"]').toString("base64url")), null);
});

test("token de descadastro: assina, confere, vence e recusa adulterado", () => {
  const secret = "s".repeat(40);
  const tok = N.signUnsubscribe({ userId: "u1", orgId: "o1", type: "task.commented", prev: "DEFAULT" }, secret, { now: T0 });
  assert.deepEqual(N.verifyUnsubscribe(tok, secret, T0 + 1000), { userId: "u1", orgId: "o1", type: "task.commented", prev: "DEFAULT" });
  assert.equal(N.verifyUnsubscribe(tok, secret, T0 + 181 * 86400_000), null, "venceu");
  assert.equal(N.verifyUnsubscribe(tok, "x".repeat(40), T0), null, "outro segredo");
  const [p, s] = tok.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "u2", o: "o1", t: "*", e: T0 + 1e9 })).toString("base64url");
  assert.equal(N.verifyUnsubscribe(`${forged}.${s}`, secret, T0), null, "payload trocado");
  assert.equal(N.verifyUnsubscribe(`${p}.${s}.x`, secret, T0), null);
  assert.equal(N.verifyUnsubscribe("", secret, T0), null);
  assert.throws(() => N.signUnsubscribe({ userId: "u", orgId: "o", type: "*" }, "curto"));
  assert.deepEqual(N.listUnsubscribeHeaders("https://api.x/v1/public/notifications/unsubscribe?token=t"), {
    "List-Unsubscribe": "<https://api.x/v1/public/notifications/unsubscribe?token=t>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
});

test("retentionCutoffs", () => {
  const c = N.retentionCutoffs(T0);
  assert.equal(Date.parse(c.read), T0 - 90 * 86400_000);
  assert.equal(Date.parse(c.unread), T0 - 180 * 86400_000);
});
