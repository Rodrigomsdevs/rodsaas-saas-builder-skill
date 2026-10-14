// rodsaas · acessos por pessoa — regras puras (sem dependências).
//
// Porte para TypeScript em api/src/modules/access/lib/ mantendo o comportamento e copie os testes
// de member-access-lib.test.mjs. Rode aqui com: node --test member-access-lib.test.mjs
//
// Cada app registra (registerMemberAccess) os campos que dá para escolher para uma pessoa: o convite, a tela
// "Acessos da pessoa" e o pedido de acesso usam as mesmas funções daqui para validar, decidir o que vale na hora
// e o que vira pedido, e comparar o antes e o depois.

export const FIELD_TYPES = ["boolean", "select", "multiselect"];

/**
 * Confere a definição dos campos de um app (no boot, para pegar erro de registro cedo).
 * field: { key, type, label, required?, default?, options?: [{ value, label }], source?: string, showIf?: key }
 */
export function validateFieldDefs(fields) {
  const errors = [], keys = new Set();
  for (const f of fields ?? []) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(f.key ?? "")) errors.push(`campo sem key válida: ${JSON.stringify(f.key)}`);
    if (keys.has(f.key)) errors.push(`key repetida: ${f.key}`);
    keys.add(f.key);
    if (!FIELD_TYPES.includes(f.type)) errors.push(`${f.key}: tipo ${f.type} não existe`);
    if (!String(f.label ?? "").trim()) errors.push(`${f.key}: sem rótulo`);
    if (f.type !== "boolean" && !f.options && !f.source) errors.push(`${f.key}: select precisa de options ou source`);
    if (f.showIf && !(fields ?? []).some((x) => x.key === f.showIf && x.type === "boolean")) errors.push(`${f.key}: showIf aponta para um campo booleano que não existe`);
  }
  return errors;
}

/** Opções de um campo: as fixas ou as da fonte (`sources[field.source]`, montada pelo app para a empresa). */
const optionsOf = (f, sources) => (f.options ?? sources?.[f.source] ?? []).map((o) => String(o.value));

/**
 * Valida e normaliza o valor de um app. Campos escondidos (showIf falso) saem; campos ausentes ganham o padrão.
 * → { value, errors: [{ path: key, code, message }] }
 * Códigos: UNKNOWN_FIELD, VALUE_INVALID, OPTION_INVALID, REQUIRED.
 */
export function validateAccessValue(fields, input, { sources = {} } = {}) {
  const errors = [], value = {}, src = input ?? {};
  if (typeof src !== "object" || Array.isArray(src)) return { value: {}, errors: [{ path: "", code: "VALUE_INVALID", message: "Opções inválidas" }] };
  for (const k of Object.keys(src)) if (!fields.some((f) => f.key === k)) errors.push({ path: k, code: "UNKNOWN_FIELD", message: `Opção desconhecida: ${k}` });
  const raw = (f) => (f.key in src ? src[f.key] : f.default);
  for (const f of fields) {
    if (f.showIf && raw(fields.find((x) => x.key === f.showIf)) !== true) continue;
    const v = raw(f);
    if (v === undefined || v === null || (Array.isArray(v) && !v.length && f.required)) {
      if (f.required) errors.push({ path: f.key, code: "REQUIRED", message: `${f.label}: obrigatório` });
      else if (f.type === "multiselect") value[f.key] = [];
      else if (f.type === "boolean") value[f.key] = false;
      continue;
    }
    if (f.type === "boolean") { if (typeof v !== "boolean") errors.push({ path: f.key, code: "VALUE_INVALID", message: `${f.label}: sim ou não` }); else value[f.key] = v; continue; }
    const allowed = optionsOf(f, sources);
    if (f.type === "select") {
      if (typeof v !== "string") errors.push({ path: f.key, code: "VALUE_INVALID", message: `${f.label}: escolha uma opção` });
      else if (!allowed.includes(v)) errors.push({ path: f.key, code: "OPTION_INVALID", message: `${f.label}: opção que não existe` });
      else value[f.key] = v;
      continue;
    }
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) { errors.push({ path: f.key, code: "VALUE_INVALID", message: `${f.label}: lista de opções` }); continue; }
    const bad = v.filter((x) => !allowed.includes(x));
    if (bad.length) errors.push({ path: f.key, code: "OPTION_INVALID", message: `${f.label}: ${bad.length} opção(ões) que não existem` });
    else value[f.key] = [...new Set(v)];
  }
  return { value, errors };
}

/**
 * Valida o mapa inteiro de acessos ({ [appId]: { options } | null }) contra os apps registrados.
 * apps: { [appId]: { fields, sources?, enabled } }. null = tirar (só no ajuste da pessoa; no convite é ignorado).
 * → { access: { [appId]: options | null }, errors: [{ path: "access.<app>[.<campo>]", code, message }] }
 */
export function normalizeAccess(input, apps, { allowRemove = false } = {}) {
  const access = {}, errors = [];
  if (input == null) return { access, errors };
  if (typeof input !== "object" || Array.isArray(input)) return { access, errors: [{ path: "access", code: "VALUE_INVALID", message: "Acessos inválidos" }] };
  for (const [appId, entry] of Object.entries(input)) {
    const app = apps[appId];
    if (!app) { errors.push({ path: `access.${appId}`, code: "UNKNOWN_APP", message: `App desconhecido: ${appId}` }); continue; }
    if (entry === null) { if (allowRemove) access[appId] = null; continue; }
    if (app.enabled === false) { errors.push({ path: `access.${appId}`, code: "APP_DISABLED", message: `${app.label ?? appId} está desligado na empresa` }); continue; }
    const { value, errors: e } = validateAccessValue(app.fields ?? [], entry?.options ?? {}, { sources: app.sources });
    for (const x of e) errors.push({ ...x, path: `access.${appId}${x.path ? "." + x.path : ""}` });
    if (!e.length) access[appId] = value;
  }
  return { access, errors };
}

/**
 * Decide, por app, o que vale na hora e o que vira pedido de acesso.
 * checks: { [appId]: { grantable: boolean, reason?: "NOT_GRANTABLE" | "NO_SEAT", needsConfirm?: boolean, delta? } }
 *  - grantable false  → vira pedido (o convite segue; o pedido nasce quando a pessoa aceitar)
 *  - needsConfirm true → quem convida pode mudar o valor (owner), mas precisa confirmar: sem `confirm` entra em `confirm`
 * → { grant: { app: options }, request: { app: { options, reason } }, confirm: [{ appId, delta }] }
 */
export function planGrant(access, checks, { confirm = false } = {}) {
  const grant = {}, request = {}, toConfirm = [];
  for (const [appId, options] of Object.entries(access)) {
    if (options === null) continue;
    const c = checks[appId] ?? { grantable: true };
    if (!c.grantable) { request[appId] = { options, reason: c.reason ?? "NOT_GRANTABLE" }; continue; }
    if (c.needsConfirm && !confirm) toConfirm.push({ appId, delta: c.delta ?? null });
    grant[appId] = options;
  }
  return { grant, request, confirm: toConfirm };
}

/** Assentos livres de um app contando os convites pendentes que já reservaram assento. */
export const freeSeats = ({ purchased, used, reserved = 0 }) => (purchased == null ? Infinity : Math.max(0, purchased - used - reserved));

const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return [...v].map(sortKeys).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
/**
 * Compara o atual com o pedido (PUT parcial: app ausente = não mexe; null = tirar).
 * → { add: [app], change: [app], remove: [app], same: [app] }
 */
export function diffAccess(current, desired) {
  const out = { add: [], change: [], remove: [], same: [] };
  for (const [appId, want] of Object.entries(desired ?? {})) {
    const has = current?.[appId];
    if (want === null) { if (has != null) out.remove.push(appId); continue; }
    if (has == null) out.add.push(appId);
    else if (same(has, want)) out.same.push(appId);
    else out.change.push(appId);
  }
  return out;
}

/**
 * Junta um pedido novo com os pendentes da mesma pessoa e app (nunca dois pedidos abertos iguais).
 * pending: [{ id, appId, userId, options, sources: [...] }] → { action: "create" | "update", request }
 */
export function mergeRequest(pending, incoming) {
  const found = pending.find((r) => r.appId === incoming.appId && r.userId === incoming.userId);
  if (!found) return { action: "create", request: { ...incoming, sources: [incoming.source] } };
  const merged = { ...found, options: { ...found.options, ...incoming.options }, sources: [...new Set([...(found.sources ?? []), incoming.source])] };
  return { action: "update", request: merged };
}
