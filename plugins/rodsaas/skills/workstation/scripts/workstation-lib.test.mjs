import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as W from "./workstation-lib.mjs";

const catalog = JSON.parse(readFileSync(new URL("../../landing/assets/catalogo.json", import.meta.url), "utf8"));
const AVAIL = ["crm", "forms", "agenda", "helpdesk", "tarefas", "paginas"];
const T0 = Date.parse("2026-10-14T12:00:00Z");

test("suggestApps: landing primeiro, depois o segmento, só disponíveis", () => {
  assert.deepEqual(W.suggestApps({ segment: "saude", available: AVAIL }).selected, ["agenda", "crm", "forms", "helpdesk"]);
  const r = W.suggestApps({ segment: "agencia", available: AVAIL, preselected: ["helpdesk", "pessoas"] });
  assert.equal(r.selected[0], "helpdesk", "veio da landing");
  assert.ok(!r.selected.includes("pessoas"), "em breve fora");
  assert.deepEqual([...r.selected, ...r.others].sort(), [...AVAIL].sort());
  assert.ok(W.suggestApps({ segment: "nada", available: AVAIL }).selected.includes("tarefas"), "segmento desconhecido = outro");
  const many = W.suggestApps({ segment: "saude", available: AVAIL, preselected: ["crm", "forms", "agenda", "helpdesk", "tarefas"] });
  assert.equal(many.selected.length, 5, "tudo o que veio da landing fica marcado");
});

test("validateOnboarding", () => {
  const ok = W.validateOnboarding({ segment: "saude", teamSize: "2-5", apps: ["agenda", "crm", "crm"], invites: [" Ana@X.com ", "ana@x.com"] }, { available: AVAIL });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.value.apps, ["agenda", "crm"]);
  assert.deepEqual(ok.value.invites, ["ana@x.com"]);
  const bad = W.validateOnboarding({ segment: "x", teamSize: "100", apps: ["pessoas"], invites: ["nao-email"] }, { available: AVAIL });
  const paths = bad.errors.map((e) => e.path);
  for (const p of ["segment", "teamSize", "apps", "invites.0"]) assert.ok(paths.includes(p), p);
  assert.ok(W.validateOnboarding({ segment: "saude", apps: [] }, { available: AVAIL }).errors.some((e) => e.path === "apps"));
});

test("trialState", () => {
  const end = T0 + 14 * 86400_000;
  assert.deepEqual(W.trialState({ trialEndsAt: end, now: T0 }), { active: true, ended: false, daysLeft: 14, endingSoon: false });
  assert.equal(W.trialState({ trialEndsAt: end, now: end - 3600_000 }).daysLeft, 1, "falta 1 h = 1 dia");
  assert.equal(W.trialState({ trialEndsAt: end, now: end - 2.5 * 86400_000 }).endingSoon, true);
  assert.equal(W.trialState({ trialEndsAt: end, now: end }).ended, true);
});

test("effectiveModel: teste vence vira grátis; pago ativo; atrasado mantém com aviso; cancelado vira grátis", () => {
  assert.equal(W.effectiveModel({ model: "trial", trialEndsAt: T0 + 1000 }, T0).model, "trial");
  assert.equal(W.effectiveModel({ model: "trial", trialEndsAt: T0 - 1000 }, T0).model, "free");
  assert.deepEqual(W.effectiveModel({ model: "apps", status: "active" }, T0), { model: "apps", paymentIssue: false });
  assert.deepEqual(W.effectiveModel({ model: "completo", status: "past_due" }, T0), { model: "completo", paymentIssue: true });
  assert.equal(W.effectiveModel({ model: "apps", status: "canceled" }, T0).model, "free");
  assert.equal(W.effectiveModel({ model: "apps", status: "active", provider: "FAKE", cancelAtPeriodEnd: true, currentPeriodEnd: T0 - 1 }, T0).model, "free");
  assert.equal(W.effectiveModel(null, T0).model, "free");
});

test("appStates: teste libera tudo menos uso; por app só os pagos; grátis só os do grátis; suíte libera os apps dela", () => {
  const avail = [...AVAIL, "whatsapp", "pessoas", "mural"];
  const trial = W.appStates({ model: "trial", catalog, available: avail });
  assert.equal(trial.crm, "trial");
  assert.equal(trial.whatsapp, "locked", "uso precisa de item próprio");
  assert.equal(trial.mural, "active", "incluído sempre ativo");
  const apps = W.appStates({ model: "apps", items: [{ key: "app:crm", quantity: 2 }, { key: "suite:rh", quantity: 10 }], catalog, available: avail });
  assert.equal(apps.crm, "active");
  assert.equal(apps.helpdesk, "locked");
  assert.equal(apps.tarefas, "free", "app do grátis continua grátis");
  assert.equal(apps.pessoas, "active", "Suíte RH libera o Pessoas");
  assert.equal(W.appStates({ model: "apps", items: [{ key: "app:crm", quantity: 2 }], catalog, available: avail }).pessoas, "locked", "sem a suíte, bloqueado");
  const free = W.appStates({ model: "free", catalog, available: avail });
  assert.equal(free.crm, "locked");
  assert.equal(free.forms, "free");
  const comp = W.appStates({ model: "completo", items: [{ key: "completo", quantity: 5 }], catalog, available: avail });
  assert.equal(comp.helpdesk, "active");
  assert.equal(comp.whatsapp, "locked");
});

const PLANS = {
  free: { limits: { members: 3, projects: 3, crm_pipelines: 1, forms_responses_month: 100, helpdesk_agents: 2 }, features: [] },
  pro: { limits: { members: 10, projects: 50, crm_pipelines: 5, forms_responses_month: 5000, helpdesk_agents: 10 }, features: ["api_access", "crm_capture", "sprints"] },
  business: { limits: { members: 50, projects: Infinity, crm_pipelines: 20, forms_responses_month: 50000, helpdesk_agents: Infinity }, features: ["api_access", "audit_log", "priority_support", "crm_capture", "crm_products", "sprints", "private_projects", "helpdesk_csat", "forms_logic", "public_pages"] },
};

test("buildFeatureMap e classifyFeature: features e limites do plano mais alto vão para o app dono", () => {
  const m = W.buildFeatureMap(PLANS, ["free", "pro", "business"]);
  assert.deepEqual(m.crm.features.sort(), ["crm_capture", "crm_products"]);
  assert.deepEqual(m.crm.limits, { crm_pipelines: 20 });
  assert.deepEqual(m.crm.freeLimits, { crm_pipelines: 1 });
  assert.deepEqual(m.tarefas.features.sort(), ["private_projects", "sprints"]);
  assert.deepEqual(m.helpdesk.limits, { helpdesk_agents: null }, "Infinity vira null (ilimitado)");
  assert.deepEqual(m._paid.sort(), ["api_access", "audit_log"]);
  assert.deepEqual(m._completo, ["priority_support"]);
  assert.equal(W.classifyFeature("projects"), "_paid");
  assert.equal(W.classifyFeature("rh_performance"), "pessoas");
  assert.equal(W.classifyFeature("rhEmployees"), "pessoas", "limite em camelCase do preset");
  assert.equal(W.classifyFeature("fin_charges"), "financeiro");
  assert.equal(W.classifyFeature("finAccounts"), "financeiro");
  assert.equal(W.classifyFeature("finalize"), "_paid", "fin sem _ ou maiúscula não é do Financeiro");
  assert.equal(W.classifyFeature("helpdeskAgents"), "helpdesk");
  assert.equal(W.classifyFeature("rhythm_x"), "_paid", "prefixo exige _ ou maiúscula");
  assert.deepEqual(m._baseLimits, { paid: { projects: null }, free: { projects: 3 } }, "limite do Cadastros fica na base");
});

test("entitlements: formato de plano da base, para os guards continuarem iguais", () => {
  const fm = W.buildFeatureMap(PLANS, ["free", "pro", "business"]);
  const avail = AVAIL;
  const e = W.entitlements({ model: "apps", states: W.appStates({ model: "apps", items: [{ key: "app:crm", quantity: 1 }], catalog, available: avail }), featureMap: fm, catalog });
  assert.equal(e.id, "apps");
  assert.ok(e.features.includes("crm_products") && e.features.includes("api_access"));
  assert.ok(!e.features.includes("helpdesk_csat"), "Suporte bloqueado");
  assert.ok(!e.features.includes("priority_support"), "só no Completo");
  assert.equal(e.limits.crm_pipelines, 20);
  assert.equal(e.limits.helpdesk_agents, 0, "app bloqueado = limite 0");
  assert.equal(e.limits.forms_responses_month, 100, "forms no grátis = limite do grátis");
  assert.equal(e.limits.members, null, "por app: membros sem limite (cada assento é pago)");
  const free = W.entitlements({ model: "free", states: W.appStates({ model: "free", catalog, available: avail }), featureMap: fm, catalog });
  assert.equal(free.limits.members, 2);
  assert.equal(free.limits.projects, 3);
  assert.equal(e.limits.projects, null);
  assert.ok(!free.features.includes("api_access"));
  const trial = W.entitlements({ model: "trial", states: W.appStates({ model: "trial", catalog, available: avail }), featureMap: fm, catalog });
  assert.equal(trial.limits.members, 10);
  assert.ok(trial.features.includes("priority_support") && trial.features.includes("helpdesk_csat"));
});

test("canUseApp, defaultAccess e seatsFromAccess", () => {
  assert.deepEqual(W.canUseApp({ state: "locked", hasAccess: true }), { ok: false, code: "APP_NOT_ACTIVE" });
  assert.deepEqual(W.canUseApp({ state: "active", hasAccess: false }), { ok: false, code: "APP_ACCESS_DENIED" });
  assert.deepEqual(W.canUseApp({ state: "trial", hasAccess: true }), { ok: true });
  assert.deepEqual(W.defaultAccess({ model: "apps", memberIds: ["a", "b"], actorId: "a" }), ["a"]);
  assert.deepEqual(W.defaultAccess({ model: "trial", memberIds: ["a", "b"], actorId: "a" }), ["a", "b"]);
  assert.deepEqual(W.seatsFromAccess({ crm: ["a", "b", "b", "x"], agenda: [] }, ["a", "b"]), { crm: 2, agenda: 0 });
});

test("desiredItems, lookupKey e monthlyOfItems batem com o quote do catálogo", () => {
  const sel = { apps: { crm: { seats: 2 }, agenda: { seats: 1 }, forms: { tier: 1 }, tarefas: { seats: 3 }, pessoas: {} }, users: 4, employees: 12 };
  const avail = [...AVAIL, "pessoas"];
  const items = W.desiredItems({ model: "apps", selection: sel, catalog, available: avail, cycle: "month" });
  assert.deepEqual(items.map((i) => `${i.key}×${i.quantity}${i.tier != null ? `/t${i.tier}` : ""}`), ["app:crm×2", "app:agenda×1", "app:forms×1/t1", "app:tarefas×3", "suite:rh×12"]);
  assert.equal(items[2].lookupKey, "rodsaas_ws_app_forms_t1_month");
  const q = W.quote(catalog, sel, { available: new Set(avail) });
  assert.equal(W.monthlyOfItems(items, catalog), q.monthly, "mesma conta do site");
  const comp = W.desiredItems({ model: "completo", selection: { apps: { crm: {} }, users: 2 }, catalog, available: avail, cycle: "year" });
  assert.deepEqual(comp, [{ key: "completo", quantity: 3, tier: null, lookupKey: "rodsaas_ws_completo_year" }], "mínimo de 3 no Completo");
  assert.equal(W.monthlyOfItems(comp, catalog), 207);
  assert.throws(() => W.lookupKey("completo", "week"));
});

test("diffItems e prorate", () => {
  const cur = [{ id: "si_1", key: "app:crm", quantity: 2, tier: null }, { id: "si_2", key: "app:agenda", quantity: 1, tier: null }];
  const des = [{ key: "app:crm", quantity: 3, tier: null }, { key: "app:helpdesk", quantity: 1, tier: null }];
  const d = W.diffItems(cur, des);
  assert.deepEqual(d.add.map((i) => i.key), ["app:helpdesk"]);
  assert.deepEqual(d.update.map((u) => `${u.key}:${u.from.quantity}->${u.to.quantity}:${u.id}`), ["app:crm:2->3:si_1"]);
  assert.deepEqual(d.remove.map((i) => i.key), ["app:agenda"]);
  assert.equal(W.diffItems(cur, cur).changed, false);
  const start = Date.parse("2026-10-01T00:00:00Z"), end = Date.parse("2026-10-31T00:00:00Z");
  assert.equal(W.prorate({ fromMonthly: 97, toMonthly: 136, periodStart: start, periodEnd: end, now: Date.parse("2026-10-16T00:00:00Z") }), 19.5);
  assert.equal(W.prorate({ fromMonthly: 136, toMonthly: 97, periodStart: start, periodEnd: end, now: Date.parse("2026-10-16T00:00:00Z") }), -19.5, "crédito");
  assert.equal(W.prorate({ fromMonthly: 0, toMonthly: 39, periodStart: start, periodEnd: end, now: end + 1 }), 0);
});

test("seatQuantity e canSetSeats", () => {
  assert.equal(W.seatQuantity({ purchased: 3, used: 2 }), 3, "assento comprado a mais fica");
  assert.equal(W.seatQuantity({ purchased: 1, used: 2 }), 2, "acesso além do comprado aumenta");
  assert.equal(W.seatQuantity({}), 1);
  assert.deepEqual(W.canSetSeats({ quantity: 1, used: 2 }), { ok: false, code: "SEATS_IN_USE", used: 2 });
  assert.deepEqual(W.canSetSeats({ quantity: 2, used: 2 }), { ok: true });
});
