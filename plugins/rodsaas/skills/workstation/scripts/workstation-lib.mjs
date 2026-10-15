// rodsaas · workstation — regras puras do modelo "cada empresa liga os apps que usa" (sem banco, sem Stripe).
// Segmentos e sugestão de apps no onboarding, estado do teste grátis, modelo efetivo da assinatura, estado de cada
// app (ativo, no teste, grátis, bloqueado), direitos (features e limites no formato que os guards da base já usam),
// acesso por pessoa, assentos, itens da assinatura (chaves de preço da Stripe), diferença entre itens, valor
// proporcional no modo de teste e validação do onboarding.
// O preço e a calculadora vêm do catalog-lib do /rodsaas:landing (mesmo catálogo, mesma conta no site e no painel).
// Porte para TypeScript em api/src/modules/workstation/lib/ (e o que o front usar), com os testes.
// Rode: node --test workstation-lib.test.mjs

import { quote, formatBRL } from "../../landing/scripts/catalog-lib.mjs";
export { quote, formatBRL };

const DAY = 86_400_000;
const toMs = (v) => (v == null ? null : typeof v === "number" ? v : v instanceof Date ? v.getTime() : Date.parse(v));

// ------------------------------------------------------------------ onboarding

/** Segmentos do onboarding e os apps sugeridos para cada um (na ordem de importância). */
export const SEGMENTS = [
  { id: "saude", label: "Clínica ou consultório", icon: "Stethoscope", apps: ["agenda", "crm", "forms", "helpdesk", "tarefas", "financeiro"], agendaProfile: "CLINIC", finProfile: "CLINIC" },
  { id: "odonto", label: "Consultório odontológico", icon: "Smile", apps: ["agenda", "financeiro", "forms", "comercial", "crm"], agendaProfile: "DENTAL", finProfile: "CLINIC" },
  { id: "beleza", label: "Salão, estética ou academia", icon: "Sparkle", apps: ["agenda", "crm", "forms", "tarefas", "financeiro"], agendaProfile: "SALON" },
  { id: "barbearia", label: "Barbearia", icon: "Scissors", apps: ["agenda", "financeiro", "erp", "crm"], agendaProfile: "BARBERSHOP" },
  { id: "pet", label: "Pet shop ou veterinária", icon: "PawPrint", apps: ["agenda", "financeiro", "erp", "crm"], agendaProfile: "PET" },
  { id: "agencia", label: "Agência ou prestação de serviços", icon: "Megaphone", apps: ["tarefas", "crm", "paginas", "forms", "helpdesk", "financeiro", "comercial"], agendaProfile: "CONSULTING", crmProfile: "B2B", finProfile: "SERVICES" },
  { id: "comercio", label: "Loja ou comércio", icon: "Store", apps: ["crm", "helpdesk", "forms", "tarefas", "financeiro", "erp"], crmProfile: "RETAIL", finProfile: "RETAIL" },
  { id: "industria", label: "Distribuidora ou indústria", icon: "Factory", apps: ["crm", "helpdesk", "tarefas", "paginas", "pessoas", "financeiro", "comercial", "erp"], crmProfile: "B2B", erpProfile: "WHOLESALE" },
  { id: "escritorio", label: "Escritório (contábil, advocacia)", icon: "Briefcase", apps: ["tarefas", "crm", "paginas", "agenda", "helpdesk", "pessoas", "financeiro", "comercial"], crmProfile: "B2B", finProfile: "SERVICES" },
  { id: "imobiliaria", label: "Imobiliária ou corretor", icon: "Building", apps: ["crm", "agenda", "comercial", "financeiro", "paginas"], agendaProfile: "CONSULTING", crmProfile: "REAL_ESTATE" },
  { id: "educacao", label: "Escola ou curso", icon: "GraduationCap", apps: ["crm", "agenda", "forms", "financeiro", "comercial", "helpdesk"], crmProfile: "EDUCATION" },
  { id: "tecnologia", label: "Tecnologia e software", icon: "Code", apps: ["tarefas", "helpdesk", "paginas", "crm", "financeiro", "comercial"], crmProfile: "B2B", helpdeskProfile: "SOFTWARE", finProfile: "SERVICES" },
  { id: "outro", label: "Outro", icon: "Sparkles", apps: ["tarefas", "crm", "paginas"] },
];
export const TEAM_SIZES = ["1", "2-5", "6-15", "16-50", "51+"];
/** Perfil da Agenda (`skills/agenda/references/09-perfis-de-segmento.md`) que nasce com o segmento do onboarding. */
export const agendaProfileFor = (segment) => SEGMENTS.find((s) => s.id === segment)?.agendaProfile ?? "GENERAL";
/** Perfil do CRM (`skills/crm/references/09-perfis-de-segmento.md`) que nasce com o segmento do onboarding. */
export const crmProfileFor = (segment) => SEGMENTS.find((s) => s.id === segment)?.crmProfile ?? "GENERAL";
/** Perfil do Suporte (`skills/helpdesk/references/10-perfis-de-segmento.md`); null = perguntar na primeira abertura. */
export const helpdeskProfileFor = (segment) => SEGMENTS.find((s) => s.id === segment)?.helpdeskProfile ?? null;
/** Perfil do ERP (`skills/erp/references/12-perfis-de-segmento.md`); null = perguntar na primeira abertura. */
export const erpProfileFor = (segment) => SEGMENTS.find((s) => s.id === segment)?.erpProfile ?? null;
/** Perfil do Financeiro (`skills/financeiro/references/10-perfis-de-segmento.md`); null = perguntar na primeira abertura. */
export const finProfileFor = (segment) => SEGMENTS.find((s) => s.id === segment)?.finProfile ?? null;

/**
 * Apps sugeridos: os que vieram da landing (?apps=) primeiro, depois os do segmento; só disponíveis.
 * Devolve { selected (pré-marcados, até 4), others (o resto dos disponíveis, na ordem do catálogo) }.
 */
export function suggestApps({ segment, available, preselected = [], max = 4 }) {
  const avail = Array.isArray(available) ? available : [...available];
  const seg = SEGMENTS.find((s) => s.id === segment) ?? SEGMENTS[SEGMENTS.length - 1];
  const order = [...preselected, ...seg.apps].filter((id, i, a) => avail.includes(id) && a.indexOf(id) === i);
  const fromLanding = preselected.filter((id) => avail.includes(id));
  const selected = order.slice(0, Math.max(max, fromLanding.length));
  return { selected, others: avail.filter((id) => !selected.includes(id)) };
}

/** Valida o corpo de POST /v1/workstation/onboarding. */
export function validateOnboarding(body, { available, maxInvites = 20 }) {
  const errors = [];
  const b = body ?? {};
  if (!SEGMENTS.some((s) => s.id === b.segment)) errors.push({ path: "segment", message: "Escolha o tipo de empresa" });
  if (b.teamSize != null && !TEAM_SIZES.includes(b.teamSize)) errors.push({ path: "teamSize", message: "Tamanho da equipe inválido" });
  const apps = Array.isArray(b.apps) ? [...new Set(b.apps)] : [];
  if (!apps.length) errors.push({ path: "apps", message: "Escolha pelo menos um app" });
  for (const id of apps) if (!available.includes(id)) errors.push({ path: "apps", message: `App indisponível: ${id}` });
  const invites = Array.isArray(b.invites) ? [...new Set(b.invites.map((e) => String(e).trim().toLowerCase()).filter(Boolean))] : [];
  if (invites.length > maxInvites) errors.push({ path: "invites", message: `No máximo ${maxInvites} convites de uma vez` });
  invites.forEach((e, i) => { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) errors.push({ path: `invites.${i}`, message: "E-mail inválido" }); });
  return { errors, value: { segment: b.segment, teamSize: b.teamSize ?? null, apps, invites } };
}

// ------------------------------------------------------------------ teste grátis e modelo

/** { active, ended, daysLeft, endingSoon } do teste (dias arredondados para cima: falta 1h = 1 dia). */
export function trialState({ trialEndsAt, now = Date.now() }) {
  const end = toMs(trialEndsAt);
  if (!end) return { active: false, ended: false, daysLeft: 0, endingSoon: false };
  const left = end - toMs(now);
  const daysLeft = left > 0 ? Math.ceil(left / DAY) : 0;
  return { active: left > 0, ended: left <= 0, daysLeft, endingSoon: left > 0 && daysLeft <= 3 };
}

/**
 * Modelo efetivo da empresa agora: "trial" | "free" | "apps" | "completo", com paymentIssue.
 * sub: { model, status, trialEndsAt, cancelAtPeriodEnd, currentPeriodEnd, provider }
 */
export function effectiveModel(sub, now = Date.now()) {
  const s = sub ?? { model: "free" };
  if (s.model === "legacy") return { model: "legacy", paymentIssue: s.status === "past_due" };
  if (s.model === "trial") return { model: trialState({ trialEndsAt: s.trialEndsAt, now }).active ? "trial" : "free", paymentIssue: false };
  if (s.model === "apps" || s.model === "completo") {
    const periodOver = s.currentPeriodEnd && toMs(s.currentPeriodEnd) <= toMs(now);
    if (s.provider === "FAKE" && s.cancelAtPeriodEnd && periodOver) return { model: "free", paymentIssue: false };
    if (["active", "trialing"].includes(s.status)) return { model: s.model, paymentIssue: false };
    if (s.status === "past_due") return { model: s.model, paymentIssue: true };
    return { model: "free", paymentIssue: false };
  }
  return { model: "free", paymentIssue: false };
}

// ------------------------------------------------------------------ estado de cada app

/**
 * Estado de cada app disponível: "active" (pago ou Completo), "trial", "free" (app do grátis, com os limites dele)
 * ou "locked" (precisa assinar). items: [{ key: "app:crm" | "suite:rh" | "completo", quantity, tier }].
 * Apps cobrados por uso (WhatsApp, Cobranças…) só ficam ativos com o item próprio, mesmo no Completo.
 */
export function appStates({ model, items = [], catalog, available }) {
  const P = catalog.pricing;
  const byId = new Map(catalog.apps.map((a) => [a.id, a]));
  const keys = new Set(items.map((i) => i.key));
  const free = new Set(P.free.apps);
  const out = {};
  for (const id of available) {
    const a = byId.get(id);
    if (!a) continue;
    const usage = a.pricing?.unit === "uso";
    const paid = keys.has(`app:${id}`) || (a.pricing?.suite && keys.has(`suite:${a.pricing.suite}`));
    let st = "locked";
    if (paid || a.pricing?.unit === "incluido") st = "active";
    else if (model === "trial" && !usage) st = "trial";
    else if (model === "completo" && !usage) st = "active";
    else if (free.has(id)) st = "free";
    out[id] = st;
  }
  return out;
}

/**
 * Direitos no formato que os guards da base já entendem ({ features, limits }), para os presets continuarem
 * usando config: { feature } e config: { limit } sem mudar nada.
 * featureMap: { <appId>: { features: [...], limits: { chave: valorPago }, freeLimits: { chave: valorGratis } },
 *               _paid: [features de qualquer assinatura paga], _completo: [só no Completo] }
 */
export function entitlements({ model, states, featureMap, catalog, trialMaxUsers = 10 }) {
  const features = new Set();
  const limits = {};
  for (const [id, st] of Object.entries(states)) {
    const m = featureMap[id];
    if (!m) continue;
    const on = st === "active" || st === "trial";
    if (on || st === "free") for (const f of m.features ?? []) features.add(f);
    for (const [k, v] of Object.entries(m.limits ?? {})) limits[k] = on ? v : st === "free" ? (m.freeLimits?.[k] ?? 0) : 0;
  }
  if (model === "apps" || model === "completo" || model === "trial") for (const f of featureMap._paid ?? []) features.add(f);
  if (model === "completo" || model === "trial") for (const f of featureMap._completo ?? []) features.add(f);
  Object.assign(limits, (model === "free" ? featureMap._baseLimits?.free : featureMap._baseLimits?.paid) ?? {});
  limits.members = model === "free" ? catalog.pricing.free.maxUsers : model === "trial" ? trialMaxUsers : null;
  const names = { trial: "Teste grátis", free: catalog.pricing.free.label ?? "Grátis", apps: "Por app", completo: catalog.pricing.completo.label ?? "Completo" };
  return { id: model, name: names[model], features: [...features].sort(), limits };
}

/** A pessoa pode usar o app? Bloqueado → APP_NOT_ACTIVE; sem acesso → APP_ACCESS_DENIED. */
export function canUseApp({ state, hasAccess }) {
  if (!state || state === "locked") return { ok: false, code: "APP_NOT_ACTIVE" };
  if (!hasAccess) return { ok: false, code: "APP_ACCESS_DENIED" };
  return { ok: true };
}

/**
 * Acesso padrão quando o app é ligado: no teste e no Completo, todos os membros; no modo por app, só quem ligou
 * (o owner escolhe depois quem mais usa, e cada pessoa vira um assento).
 */
export const defaultAccess = ({ model, memberIds, actorId }) => (model === "apps" ? [actorId] : [...memberIds]);

/** Assentos de cada app = membros atuais com acesso (quem saiu da empresa não conta). */
export function seatsFromAccess(access, memberIds) {
  const members = new Set(memberIds);
  const out = {};
  for (const [app, users] of Object.entries(access)) out[app] = new Set(users.filter((u) => members.has(u))).size;
  return out;
}

// ------------------------------------------------------------------ itens da assinatura

/** Chave de preço (lookup_key) na Stripe: rodsaas_ws_app_crm_month, rodsaas_ws_app_forms_t1_year, rodsaas_ws_completo_month. */
export function lookupKey(key, interval, tier = null) {
  if (!["month", "year"].includes(interval)) throw new Error("interval deve ser month ou year");
  return `rodsaas_ws_${key.replace(":", "_")}${tier != null ? `_t${tier}` : ""}_${interval}`;
}

/**
 * Itens desejados a partir da escolha (mesma entrada do quote do catálogo).
 * model "completo" → um item "completo" com max(mínimo, users); "apps" → um item por app pago, a suíte uma vez só,
 * forms com a faixa. Apps do grátis e incluídos não viram item; apps por uso viram item com quantidade 1.
 */
export function desiredItems({ model, selection, catalog, available, cycle = "month" }) {
  const P = catalog.pricing;
  const avail = new Set(available);
  const byId = new Map(catalog.apps.map((a) => [a.id, a]));
  const items = [];
  if (model === "completo") {
    const q = Math.max(P.completo.minUsers, Math.floor(selection.users ?? 1));
    items.push({ key: "completo", quantity: q, tier: null, lookupKey: lookupKey("completo", cycle) });
    for (const [id] of Object.entries(selection.apps ?? {})) { const a = byId.get(id); if (a?.pricing?.unit === "uso" && avail.has(id)) items.push({ key: `app:${id}`, quantity: 1, tier: null, lookupKey: lookupKey(`app:${id}`, cycle) }); }
    return items;
  }
  const suites = new Set();
  for (const [id, opt] of Object.entries(selection.apps ?? {})) {
    const a = byId.get(id);
    if (!a || !avail.has(id)) continue;
    const p = a.pricing ?? {};
    if (p.suite) { suites.add(p.suite); continue; }
    if (p.unit === "incluido") continue;
    if (Array.isArray(p.tiers)) { const t = Math.min(Math.max(0, opt?.tier ?? 0), p.tiers.length - 1); items.push({ key: `app:${id}`, quantity: 1, tier: t, lookupKey: lookupKey(`app:${id}`, cycle, t) }); continue; }
    const perSeat = !["empresa", "uso"].includes(p.unit);
    items.push({ key: `app:${id}`, quantity: perSeat ? Math.max(1, Math.floor(opt?.seats ?? 1)) : 1, tier: null, lookupKey: lookupKey(`app:${id}`, cycle) });
  }
  for (const s of suites) items.push({ key: `suite:${s}`, quantity: Math.max(1, Math.floor(selection.employees ?? 1)), tier: null, lookupKey: lookupKey(`suite:${s}`, cycle) });
  return items;
}

/** O que mudar na assinatura: { add, update (quantidade ou faixa), remove } comparando por key. */
export function diffItems(current, desired) {
  const cur = new Map(current.map((i) => [i.key, i]));
  const des = new Map(desired.map((i) => [i.key, i]));
  const add = [], update = [], remove = [];
  for (const [k, d] of des) {
    const c = cur.get(k);
    if (!c) add.push(d);
    else if (c.quantity !== d.quantity || (c.tier ?? null) !== (d.tier ?? null)) update.push({ key: k, from: { quantity: c.quantity, tier: c.tier ?? null }, to: { quantity: d.quantity, tier: d.tier ?? null }, id: c.id ?? null, lookupKey: d.lookupKey });
  }
  for (const [k, c] of cur) if (!des.has(k)) remove.push(c);
  return { add, update, remove, changed: add.length + update.length + remove.length > 0 };
}

/** Valor mensal (R$) de uma lista de itens com o catálogo (para resumo e modo de teste). */
export function monthlyOfItems(items, catalog) {
  const P = catalog.pricing;
  const byId = new Map(catalog.apps.map((a) => [a.id, a]));
  let total = 0;
  for (const i of items) {
    if (i.key === "completo") { total += i.quantity * P.completo.pricePerUser; continue; }
    if (i.key.startsWith("suite:")) { const s = P.suites[i.key.slice(6)]; total += Math.max(s.minimum ?? 0, i.quantity * s.price); continue; }
    const a = byId.get(i.key.slice(4)), p = a?.pricing ?? {};
    if (Array.isArray(p.tiers)) total += p.tiers[i.tier ?? 0].price;
    else if (p.price > 0) total += i.quantity * p.price;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Valor proporcional cobrado agora ao mudar a assinatura no meio do período (modo de teste; na Stripe vale a
 * prévia da fatura). Positivo = cobra a diferença; negativo = crédito na próxima fatura. Em reais com centavos.
 */
export function prorate({ fromMonthly, toMonthly, periodStart, periodEnd, now = Date.now(), months = 1 }) {
  const start = toMs(periodStart), end = toMs(periodEnd), t = toMs(now);
  if (!(end > start)) return 0;
  const remaining = Math.min(1, Math.max(0, (end - t) / (end - start)));
  return Math.round((toMonthly - fromMonthly) * months * remaining * 100) / 100;
}

// ------------------------------------------------------------------ features dos presets → apps

/** Prefixos que dizem de qual app é cada feature/limite do config/plans.ts (o resto vai para _paid). */
export const FEATURE_PREFIXES = [
  [/^crm(_|[A-Z])/, "crm"], [/^forms(_|[A-Z])/, "forms"], [/^agenda(_|[A-Z])/, "agenda"], [/^helpdesk(_|[A-Z])/, "helpdesk"],
  [/^rh(_|[A-Z])/, "pessoas"], // rh_performance (feature) e rhEmployees (limite)
  [/^fin(_|[A-Z])/, "financeiro"], // fin_charges (feature) e finAccounts (limite)
  [/^com(_|[A-Z])/, "comercial"], // com_signatures (feature) e comEnvelopesMonthly (limite)
  [/^erp(_|[A-Z])/, "erp"], // erp_pdv (feature) e erpProducts (limite)
  [/^(tasks?_|private_projects$|sprints$|time_tracking$)/, "tarefas"], [/^(pages_|public_pages$|databases?_)/, "paginas"],
  [/^priority_support$/, "_completo"],
];
export function classifyFeature(key) {
  for (const [re, app] of FEATURE_PREFIXES) if (re.test(key)) return app;
  return "_paid";
}

/**
 * Monta o featureMap a partir do config/plans.ts atual: features e limites do plano mais alto (pago) vão para o
 * app dono; os limites do plano free viram os do grátis. Membros saem daqui (a workstation decide).
 */
export function buildFeatureMap(plans, order) {
  const top = plans[order[order.length - 1]], free = plans[order[0]];
  const map = { _paid: [], _completo: [], _baseLimits: { paid: {}, free: {} } };
  const slot = (id) => (map[id] ??= { features: [], limits: {}, freeLimits: {} });
  for (const f of top.features ?? []) { const app = classifyFeature(f); if (app.startsWith("_")) map[app].push(f); else slot(app).features.push(f); }
  for (const [k, v] of Object.entries(top.limits ?? {})) {
    if (k === "members") continue;
    const app = classifyFeature(k);
    if (app.startsWith("_")) { // limites da base (ex.: projects do Cadastros): do plano mais alto nos pagos/teste, do free no grátis
      map._baseLimits.paid[k] = v === Infinity ? null : v;
      map._baseLimits.free[k] = free.limits?.[k] === Infinity ? null : (free.limits?.[k] ?? 0);
      continue;
    }
    slot(app).limits[k] = v === Infinity ? null : v;
    slot(app).freeLimits[k] = free.limits?.[k] === Infinity ? null : (free.limits?.[k] ?? 0);
  }
  return map;
}

/** Quantidade do item por pessoa: nunca abaixo de quem tem acesso (assentos comprados a mais ficam livres). */
export const seatQuantity = ({ purchased = 0, used = 0 }) => Math.max(1, purchased, used);

/** Reduzir assentos: { ok } ou { ok: false, code: "SEATS_IN_USE", used }. */
export const canSetSeats = ({ quantity, used }) => (quantity >= Math.max(1, used) ? { ok: true } : { ok: false, code: "SEATS_IN_USE", used });
