// rodsaas · forms — regras puras dos formulários (sem banco, sem rede).
// O MESMO código roda no backend (validar esquema e respostas) e no front (construtor, formulário público,
// lógica condicional). Porte para TypeScript em api/src/modules/forms/lib/ e web/src/features/forms/lib/
// junto com os testes de forms-lib.test.mjs. Rode: node --test forms-lib.test.mjs

import { createHmac, timingSafeEqual } from "node:crypto";

// ------------------------------------------------------------------ utilidades BR
export const onlyDigits = (s) => String(s ?? "").replace(/\D/g, "");
export const stripAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");

export function normalizeEmail(raw) {
  const e = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

/** "(44) 99999-1234" → "5544999991234" (mesma regra do crm-lib, resumida). */
export function normalizePhoneBR(raw) {
  const s = String(raw ?? "").trim();
  let d = onlyDigits(s);
  if (!d) return null;
  if (s.startsWith("+") && !d.startsWith("55")) return d.length >= 8 && d.length <= 15 ? d : null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  else if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  if (!/^[1-9][1-9]$/.test(d.slice(0, 2))) return null;
  let n = d.slice(2);
  if (n.length === 8 && /^[6-9]/.test(n)) n = "9" + n;
  if (n.length === 9 && n[0] !== "9") return null;
  if (n.length === 8 && !/^[2-5]/.test(n)) return null;
  return "55" + d.slice(0, 2) + n;
}

export function isValidCPF(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
export const normalizeCNPJ = (raw) => String(raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
export function isValidCNPJ(raw) {
  const c = normalizeCNPJ(raw);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const v = (ch) => ch.charCodeAt(0) - 48;
  const dv = (len) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += v(c[i]) * w[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

const isYmd = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + "T00:00:00Z").toISOString().startsWith(v);
const isHm = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export function dateInTZ(now, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// ------------------------------------------------------------------ tipos de campo
/**
 * answerable: guarda resposta · choice: tem opções · numeric: aceita gt/lt na lógica
 */
export const FIELD_TYPES = {
  short_text: { label: "Texto curto", group: "Texto", answerable: true },
  long_text: { label: "Texto longo", group: "Texto", answerable: true },
  email: { label: "E-mail", group: "Contato", answerable: true },
  phone: { label: "Telefone / WhatsApp", group: "Contato", answerable: true },
  cpf: { label: "CPF", group: "Contato", answerable: true },
  cnpj: { label: "CNPJ", group: "Contato", answerable: true },
  address: { label: "Endereço (CEP)", group: "Contato", answerable: true },
  number: { label: "Número", group: "Números e avaliação", answerable: true, numeric: true },
  money: { label: "Valor (R$)", group: "Números e avaliação", answerable: true, numeric: true },
  rating: { label: "Avaliação (estrelas)", group: "Números e avaliação", answerable: true, numeric: true },
  nps: { label: "NPS (0 a 10)", group: "Números e avaliação", answerable: true, numeric: true },
  scale: { label: "Escala", group: "Números e avaliação", answerable: true, numeric: true },
  single_choice: { label: "Escolha única", group: "Escolha", answerable: true, choice: true },
  multiple_choice: { label: "Múltipla escolha", group: "Escolha", answerable: true, choice: true },
  dropdown: { label: "Lista suspensa", group: "Escolha", answerable: true, choice: true },
  yes_no: { label: "Sim ou não", group: "Escolha", answerable: true },
  date: { label: "Data", group: "Data e hora", answerable: true, numeric: true },
  time: { label: "Horário", group: "Data e hora", answerable: true },
  file: { label: "Arquivo", group: "Avançado", answerable: true },
  consent: { label: "Consentimento (LGPD)", group: "Avançado", answerable: true },
  statement: { label: "Texto informativo", group: "Estrutura", answerable: false },
  page: { label: "Nova página", group: "Estrutura", answerable: false },
};
export const OPS = ["eq", "neq", "contains", "gt", "gte", "lt", "lte", "answered", "not_answered"];
const FIELD_ID = /^[a-z][a-z0-9_]{1,40}$/;
const OPTION_ID = /^[a-z0-9_]{1,40}$/;

/** Id novo para campo/opção: prefixo + 6 caracteres; nunca repete os existentes. */
export function newId(prefix, existing = [], rand = Math.random) {
  const taken = new Set(existing);
  for (;;) {
    const id = prefix + Array.from({ length: 6 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(rand() * 32)]).join("");
    if (!taken.has(id)) return id;
  }
}

/** "Orçamento do site!" → "orcamento-do-site-k3x9ab" (slug público, único no sistema todo). */
export function formSlug(title, rand = Math.random) {
  const base = stripAccents(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "formulario";
  return `${base}-${newId("", [], rand)}`;
}
export const isValidSlug = (s) => /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/.test(String(s ?? ""));

// ------------------------------------------------------------------ esquema
/**
 * Esquema do formulário (guardado em Form.draft e Form.published):
 * { version: 1, fields: Field[], hidden: [{ key, label? }] }
 * Field: { id, type, label, description?, placeholder?, required?, options?: [{ id, label }], allowOther?, randomize?,
 *          validation?: {...}, settings?: {...}, visibleIf?: { match: 'all'|'any', rules: [{ field, op, value? }] } }
 * `page` começa uma página nova (título = label); `statement` é só texto.
 */
export function validateSchema(schema, { maxFields = 200 } = {}) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  if (!schema || typeof schema !== "object") return [{ path: "schema", message: "Esquema inválido" }];
  if (schema.version !== 1) err("version", "Versão do esquema não suportada");
  const fields = Array.isArray(schema.fields) ? schema.fields : (err("fields", "Lista de campos ausente"), []);
  if (fields.length > maxFields) err("fields", `Máximo de ${maxFields} campos`);
  const seen = new Map();
  fields.forEach((f, i) => {
    const p = `fields.${i}`;
    if (!f || typeof f !== "object") return err(p, "Campo inválido");
    if (!FIELD_ID.test(f.id ?? "")) err(`${p}.id`, "Id do campo inválido");
    else if (seen.has(f.id)) err(`${p}.id`, `Id repetido: ${f.id}`);
    const t = FIELD_TYPES[f.type];
    if (!t) err(`${p}.type`, `Tipo desconhecido: ${f.type}`);
    if (f.type !== "page" && f.type !== "statement" && !String(f.label ?? "").trim()) err(`${p}.label`, "Pergunta sem texto");
    if (String(f.label ?? "").length > 500) err(`${p}.label`, "Máximo de 500 caracteres");
    if (t?.choice) {
      const opts = Array.isArray(f.options) ? f.options : [];
      if (opts.length < 1) err(`${p}.options`, "Inclua pelo menos uma opção");
      if (opts.length > 200) err(`${p}.options`, "Máximo de 200 opções");
      const ids = new Set();
      opts.forEach((o, j) => {
        if (!OPTION_ID.test(o?.id ?? "")) err(`${p}.options.${j}.id`, "Id de opção inválido");
        else if (ids.has(o.id)) err(`${p}.options.${j}.id`, `Opção repetida: ${o.id}`);
        ids.add(o?.id);
        if (!String(o?.label ?? "").trim()) err(`${p}.options.${j}.label`, "Opção sem texto");
      });
    }
    if (f.type === "rating" && f.settings?.max !== undefined && ![3, 4, 5, 6, 7, 8, 9, 10].includes(f.settings.max)) err(`${p}.settings.max`, "Estrelas: de 3 a 10");
    if (f.type === "scale") {
      const { min = 1, max = 5 } = f.settings ?? {};
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 10 || max - min < 1) err(`${p}.settings`, "Escala inválida (0 a 10)");
    }
    if (f.type === "file") {
      const mf = f.settings?.maxFiles ?? 1;
      if (!Number.isInteger(mf) || mf < 1 || mf > 10) err(`${p}.settings.maxFiles`, "De 1 a 10 arquivos");
    }
    if (f.visibleIf) {
      const vi = f.visibleIf;
      if (!["all", "any"].includes(vi.match) || !Array.isArray(vi.rules) || !vi.rules.length) err(`${p}.visibleIf`, "Condição inválida");
      else vi.rules.forEach((r, j) => {
        const rp = `${p}.visibleIf.rules.${j}`;
        const target = seen.get(r.field);
        if (!target) return err(rp, "A condição só pode usar perguntas que vêm antes");
        if (!FIELD_TYPES[target.type]?.answerable) return err(rp, "A condição precisa usar uma pergunta com resposta");
        if (!OPS.includes(r.op)) return err(rp, "Operador inválido");
        if (["gt", "gte", "lt", "lte"].includes(r.op) && !FIELD_TYPES[target.type].numeric) err(rp, "Maior/menor só em número, avaliação, NPS, escala, valor ou data");
        if (FIELD_TYPES[target.type].choice && ["eq", "neq", "contains"].includes(r.op) && !(target.options ?? []).some((o) => o.id === r.value)) err(rp, "Opção da condição não existe");
      });
    }
    if (f.id && FIELD_ID.test(f.id)) seen.set(f.id, f);
  });
  const hidden = Array.isArray(schema.hidden) ? schema.hidden : [];
  const hk = new Set();
  hidden.forEach((h, i) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(h?.key ?? "")) err(`hidden.${i}.key`, "Nome de campo oculto inválido");
    else if (hk.has(h.key) || seen.has(h.key)) err(`hidden.${i}.key`, `Nome repetido: ${h.key}`);
    hk.add(h?.key);
  });
  return errors;
}

/** Páginas do formulário: [{ id, title, description, visibleIf, fields: Field[] }] (a primeira pode não ter marcador). */
export function pagesOf(schema) {
  const pages = [];
  let cur = { id: "__first", title: null, description: null, visibleIf: null, fields: [] };
  for (const f of schema.fields) {
    if (f.type === "page") {
      if (cur.fields.length || cur.id !== "__first") pages.push(cur);
      cur = { id: f.id, title: f.label || null, description: f.description ?? null, visibleIf: f.visibleIf ?? null, fields: [] };
    } else cur.fields.push(f);
  }
  pages.push(cur);
  return pages.filter((p, i) => p.fields.length || i === 0);
}

// ------------------------------------------------------------------ lógica condicional
export function isAnswered(v) {
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") {
    if ("selected" in v) return (v.selected?.length ?? 0) > 0 || !!String(v.other ?? "").trim();
    if ("other" in v) return !!String(v.other ?? "").trim();
    if ("cep" in v) return !!v.cep;
  }
  return true;
}

function ruleTrue(rule, answers, byId) {
  const v = answers[rule.field];
  const target = byId.get(rule.field);
  switch (rule.op) {
    case "answered": return isAnswered(v);
    case "not_answered": return !isAnswered(v);
  }
  if (!isAnswered(v)) return rule.op === "neq";
  const t = target?.type;
  const selected = t === "multiple_choice" ? (v.selected ?? []) : t && FIELD_TYPES[t]?.choice ? [typeof v === "string" ? v : "__other"] : null;
  switch (rule.op) {
    case "eq": return selected ? selected.length === 1 && selected[0] === rule.value : String(v).toLowerCase() === String(rule.value).toLowerCase();
    case "neq": return selected ? !selected.includes(rule.value) : String(v).toLowerCase() !== String(rule.value).toLowerCase();
    case "contains": return selected ? selected.includes(rule.value) : String(v).toLowerCase().includes(String(rule.value ?? "").toLowerCase());
  }
  const a = t === "date" ? v : Number(v), b = t === "date" ? rule.value : Number(rule.value);
  switch (rule.op) {
    case "gt": return a > b;
    case "gte": return a >= b;
    case "lt": return a < b;
    case "lte": return a <= b;
  }
  return false;
}

/**
 * Ids de campos visíveis com as respostas atuais. Campo dentro de página escondida fica escondido;
 * resposta de campo escondido não conta para as condições seguintes (cadeia de lógica).
 */
export function visibleFieldIds(schema, answers = {}) {
  const byId = new Map(schema.fields.map((f) => [f.id, f]));
  const effective = {};
  const visible = new Set();
  let pageVisible = true;
  const test = (cond) => !cond || (cond.match === "any" ? cond.rules.some((r) => ruleTrue(r, effective, byId)) : cond.rules.every((r) => ruleTrue(r, effective, byId)));
  for (const f of schema.fields) {
    if (f.type === "page") { pageVisible = test(f.visibleIf); continue; }
    if (pageVisible && test(f.visibleIf)) {
      visible.add(f.id);
      if (answers[f.id] !== undefined) effective[f.id] = answers[f.id];
    }
  }
  return visible;
}

/** Páginas que aparecem para essas respostas (para progresso e "próxima"). */
export function visiblePages(schema, answers = {}) {
  const vis = visibleFieldIds(schema, answers);
  return pagesOf(schema).map((p) => ({ ...p, fields: p.fields.filter((f) => vis.has(f.id)) })).filter((p) => p.fields.length);
}

/** Passos do modo "uma pergunta por vez": cada campo visível é um passo (informativos inclusive). */
export const stepsOf = (schema, answers = {}) => visiblePages(schema, answers).flatMap((p) => p.fields);

// ------------------------------------------------------------------ validação das respostas
/**
 * Valida e normaliza as respostas contra o esquema PUBLICADO.
 * - campos escondidos pela lógica: ignorados (nem exigidos, nem gravados);
 * - chaves desconhecidas: ignoradas (o formulário pode ter mudado entre abrir e enviar);
 * Devolve { value, errors: [{ path: "answers.<id>", message }] }.
 * opts: { now: Date, timeZone, fileCheck?: (ids, field) => string|null }
 */
export function validateAnswers(schema, answers, opts = {}) {
  const out = {}, errors = [];
  const input = answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {};
  const vis = visibleFieldIds(schema, input);
  const err = (id, message) => errors.push({ path: `answers.${id}`, message });
  const today = opts.now ? dateInTZ(opts.now, opts.timeZone ?? "America/Sao_Paulo") : null;
  for (const f of schema.fields) {
    const type = FIELD_TYPES[f.type];
    if (!type?.answerable || !vis.has(f.id)) continue;
    let v = input[f.id];
    if (typeof v === "string") v = v.trim();
    if (!isAnswered(v)) {
      if (f.required) err(f.id, f.type === "consent" ? "É preciso concordar para continuar" : "Resposta obrigatória");
      continue;
    }
    const val = f.validation ?? {}, st = f.settings ?? {};
    const optIds = new Set((f.options ?? []).map((o) => o.id));
    switch (f.type) {
      case "short_text":
      case "long_text": {
        if (typeof v !== "string") { err(f.id, "Texto inválido"); break; }
        const max = Math.min(val.maxLength ?? (f.type === "short_text" ? 255 : 5000), f.type === "short_text" ? 1000 : 20000);
        if (v.length > max) { err(f.id, `Máximo de ${max} caracteres`); break; }
        if (val.minLength && v.length < val.minLength) { err(f.id, `Mínimo de ${val.minLength} caracteres`); break; }
        out[f.id] = v;
        break;
      }
      case "email": { const e = normalizeEmail(v); e ? (out[f.id] = e) : err(f.id, "E-mail inválido"); break; }
      case "phone": { const p = normalizePhoneBR(v); p ? (out[f.id] = p) : err(f.id, "Telefone inválido (inclua o DDD)"); break; }
      case "cpf": isValidCPF(v) ? (out[f.id] = onlyDigits(v)) : err(f.id, "CPF inválido"); break;
      case "cnpj": isValidCNPJ(v) ? (out[f.id] = normalizeCNPJ(v)) : err(f.id, "CNPJ inválido"); break;
      case "address": {
        if (typeof v !== "object") { err(f.id, "Endereço inválido"); break; }
        const cep = onlyDigits(v.cep);
        if (cep.length !== 8) { err(f.id, "CEP inválido"); break; }
        const uf = String(v.state ?? "").toUpperCase();
        if (uf && !/^[A-Z]{2}$/.test(uf)) { err(f.id, "UF inválida"); break; }
        const s = (x, n) => (x === undefined || x === null ? null : String(x).trim().slice(0, n) || null);
        out[f.id] = { cep, street: s(v.street, 200), number: s(v.number, 20), complement: s(v.complement, 100), district: s(v.district, 100), city: s(v.city, 100), state: uf || null };
        break;
      }
      case "number": {
        const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
        if (!Number.isFinite(n)) { err(f.id, "Número inválido"); break; }
        if (val.integer && !Number.isInteger(n)) { err(f.id, "Use um número inteiro"); break; }
        if (val.min !== undefined && n < val.min) { err(f.id, `Mínimo ${val.min}`); break; }
        if (val.max !== undefined && n > val.max) { err(f.id, `Máximo ${val.max}`); break; }
        out[f.id] = n;
        break;
      }
      case "money": {
        if (!Number.isInteger(v) || v < 0 || v > 2_000_000_000) { err(f.id, "Valor inválido"); break; }
        if (val.min !== undefined && v < val.min) { err(f.id, "Valor abaixo do mínimo"); break; }
        if (val.max !== undefined && v > val.max) { err(f.id, "Valor acima do máximo"); break; }
        out[f.id] = v;
        break;
      }
      case "rating": { const max = st.max ?? 5; Number.isInteger(v) && v >= 1 && v <= max ? (out[f.id] = v) : err(f.id, `Escolha de 1 a ${max}`); break; }
      case "nps": Number.isInteger(v) && v >= 0 && v <= 10 ? (out[f.id] = v) : err(f.id, "Escolha de 0 a 10"); break;
      case "scale": { const { min = 1, max = 5 } = st; Number.isInteger(v) && v >= min && v <= max ? (out[f.id] = v) : err(f.id, `Escolha de ${min} a ${max}`); break; }
      case "single_choice":
      case "dropdown": {
        if (typeof v === "string" && optIds.has(v)) { out[f.id] = v; break; }
        if (f.allowOther && typeof v === "object" && String(v.other ?? "").trim()) { out[f.id] = { other: String(v.other).trim().slice(0, 255) }; break; }
        err(f.id, "Opção inválida");
        break;
      }
      case "multiple_choice": {
        const sel = Array.isArray(v) ? v : v?.selected;
        if (!Array.isArray(sel) || !sel.every((x) => optIds.has(x))) { err(f.id, "Opção inválida"); break; }
        const other = !Array.isArray(v) && f.allowOther && String(v.other ?? "").trim() ? String(v.other).trim().slice(0, 255) : undefined;
        const unique = [...new Set(sel)];
        const count = unique.length + (other ? 1 : 0);
        if (val.minSelected && count < val.minSelected) { err(f.id, `Escolha pelo menos ${val.minSelected}`); break; }
        if (val.maxSelected && count > val.maxSelected) { err(f.id, `Escolha no máximo ${val.maxSelected}`); break; }
        if (!count) { if (f.required) err(f.id, "Resposta obrigatória"); break; }
        out[f.id] = other ? { selected: unique, other } : { selected: unique };
        break;
      }
      case "yes_no": typeof v === "boolean" ? (out[f.id] = v) : err(f.id, "Responda sim ou não"); break;
      case "date": {
        if (!isYmd(v)) { err(f.id, "Data inválida"); break; }
        const min = val.min === "today" ? today : val.min, max = val.max === "today" ? today : val.max;
        if (min && v < min) { err(f.id, "Data antes do permitido"); break; }
        if (max && v > max) { err(f.id, "Data depois do permitido"); break; }
        out[f.id] = v;
        break;
      }
      case "time": isHm(v) ? (out[f.id] = v) : err(f.id, "Horário inválido"); break;
      case "file": {
        const ids = Array.isArray(v) ? v : [v];
        const max = st.maxFiles ?? 1;
        if (!ids.every((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x))) { err(f.id, "Arquivo inválido"); break; }
        if (ids.length > max) { err(f.id, `Máximo de ${max} arquivo(s)`); break; }
        const problem = opts.fileCheck?.(ids, f);
        if (problem) { err(f.id, problem); break; }
        out[f.id] = ids;
        break;
      }
      case "consent": v === true ? (out[f.id] = true) : err(f.id, "É preciso concordar para continuar"); break;
    }
  }
  return { value: out, errors };
}

/** Campos ocultos da URL (?utm_source=x&origem=y) que o formulário declarou. */
export function pickHidden(schema, params) {
  const out = {};
  const get = (k) => (params instanceof URLSearchParams ? params.get(k) : params?.[k]);
  for (const h of schema.hidden ?? []) {
    const v = get(h.key);
    if (v !== null && v !== undefined && String(v).length) out[h.key] = String(v).slice(0, 500);
  }
  return out;
}

/** E-mail do respondente (primeiro campo email respondido) — para "uma resposta por e-mail" e resposta automática. */
export function respondentEmail(schema, value) {
  const f = schema.fields.find((x) => x.type === "email" && value[x.id]);
  return f ? value[f.id] : null;
}

/** Texto plano das respostas para busca (sem arquivos e sem consentimento). */
export function answersText(schema, value) {
  return schema.fields
    .filter((f) => value[f.id] !== undefined && !["file", "consent"].includes(f.type))
    .map((f) => displayAnswer(f, value[f.id]))
    .join(" \n ")
    .slice(0, 20000);
}

// ------------------------------------------------------------------ exibição, resumo e exportação
const optLabel = (f, id) => (f.options ?? []).find((o) => o.id === id)?.label ?? "(opção removida)";
export function displayAnswer(f, v) {
  if (!isAnswered(v)) return "";
  switch (f.type) {
    case "single_choice":
    case "dropdown": return typeof v === "string" ? optLabel(f, v) : `Outro: ${v.other}`;
    case "multiple_choice": return [...(v.selected ?? []).map((id) => optLabel(f, id)), ...(v.other ? [`Outro: ${v.other}`] : [])].join(", ");
    case "yes_no": return v ? "Sim" : "Não";
    case "consent": return v ? "Concordou" : "";
    case "money": return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);
    case "date": return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
    case "phone": {
      const n = String(v).slice(4);
      return v.length === 13 ? `(${v.slice(2, 4)}) ${n.slice(0, 5)}-${n.slice(5)}` : v.length === 12 ? `(${v.slice(2, 4)}) ${n.slice(0, 4)}-${n.slice(4)}` : `+${v}`;
    }
    case "cpf": return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    case "cnpj": return v.replace(/(.{2})(.{3})(.{3})(.{4})(\d{2})/, "$1.$2.$3/$4-$5");
    case "address": return [v.street, v.number, v.complement, v.district, v.city && v.state ? `${v.city}/${v.state}` : v.city, v.cep?.replace(/(\d{5})(\d{3})/, "$1-$2")].filter(Boolean).join(", ");
    case "file": return `${v.length} arquivo(s)`;
    default: return String(v);
  }
}

/** NPS: promotores (9–10), neutros (7–8), detratores (0–6); nota = %promotores − %detratores. */
export function npsScore(values) {
  const v = values.filter((x) => Number.isInteger(x) && x >= 0 && x <= 10);
  if (!v.length) return { count: 0, promoters: 0, passives: 0, detractors: 0, score: null };
  const promoters = v.filter((x) => x >= 9).length, detractors = v.filter((x) => x <= 6).length;
  return { count: v.length, promoters, passives: v.length - promoters - detractors, detractors, score: Math.round(((promoters - detractors) / v.length) * 100) };
}

/** Resumo por pergunta para a aba "Resumo". responses: [{ answers }] (já normalizadas). */
export function summarize(schema, responses) {
  const res = [];
  for (const f of schema.fields) {
    if (!FIELD_TYPES[f.type]?.answerable) continue;
    const vals = responses.map((r) => r.answers?.[f.id]).filter(isAnswered);
    const base = { fieldId: f.id, label: f.label, type: f.type, answered: vals.length, skipped: responses.length - vals.length };
    if (FIELD_TYPES[f.type].choice) {
      const counts = Object.fromEntries((f.options ?? []).map((o) => [o.id, 0]));
      let other = 0;
      for (const v of vals) {
        const ids = f.type === "multiple_choice" ? v.selected ?? [] : typeof v === "string" ? [v] : [];
        ids.forEach((id) => { if (id in counts) counts[id]++; });
        if ((f.type === "multiple_choice" && v.other) || (typeof v === "object" && v.other && f.type !== "multiple_choice")) other++;
      }
      const options = (f.options ?? []).map((o) => ({ id: o.id, label: o.label, count: counts[o.id], pct: vals.length ? Math.round((counts[o.id] / vals.length) * 1000) / 10 : 0 }));
      res.push({ ...base, options, other });
    } else if (f.type === "nps") res.push({ ...base, nps: npsScore(vals), distribution: Array.from({ length: 11 }, (_, i) => vals.filter((x) => x === i).length) });
    else if (["rating", "scale", "number", "money"].includes(f.type)) {
      const nums = vals.map(Number);
      const avg = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null;
      const extra = f.type === "rating" || f.type === "scale"
        ? { distribution: Object.fromEntries(Array.from({ length: (f.settings?.max ?? 5) - (f.type === "scale" ? (f.settings?.min ?? 1) : 1) + 1 }, (_, i) => { const k = i + (f.type === "scale" ? (f.settings?.min ?? 1) : 1); return [k, nums.filter((x) => x === k).length]; })) }
        : {};
      res.push({ ...base, average: avg, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null, ...extra });
    } else if (f.type === "yes_no") res.push({ ...base, yes: vals.filter((x) => x === true).length, no: vals.filter((x) => x === false).length });
    else res.push({ ...base, latest: vals.slice(-5).reverse().map((v) => displayAnswer(f, v)) });
  }
  return res;
}

/** Valor seguro para CSV aberto no Excel (aspas e proteção contra fórmula). */
export function csvSafe(value, delimiter = ";") {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (s.includes(delimiter) || /["\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Linhas do CSV de respostas: cabeçalho (Enviado em + uma coluna por pergunta, inclusive as que saíram do
 * formulário mas têm resposta, + campos ocultos) e uma linha por resposta. `;`, pronto para o Excel pt-BR.
 * removedFields: [{ id, label, type }] de versões antigas, para não perder colunas.
 */
export function responsesToCsv(schema, responses, { removedFields = [], timeZone = "America/Sao_Paulo" } = {}) {
  const fields = [...schema.fields.filter((f) => FIELD_TYPES[f.type]?.answerable), ...removedFields];
  const hidden = (schema.hidden ?? []).map((h) => h.key);
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" });
  const head = ["Enviado em", ...fields.map((f) => f.label), ...hidden];
  const rows = responses.map((r) => [
    fmt.format(new Date(r.submittedAt)),
    ...fields.map((f) => displayAnswer(f, r.answers?.[f.id])),
    ...hidden.map((k) => r.hidden?.[k] ?? ""),
  ]);
  return "﻿" + [head, ...rows].map((row) => row.map((c) => csvSafe(c)).join(";")).join("\r\n");
}

// ------------------------------------------------------------------ webhooks
/** Assinatura do webhook: header X-Rodsaas-Signature: t=<unix>,v1=<hex hmac sha256 de "t.corpo">. */
export function signWebhook(body, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}
/** Para documentar e testar o lado de quem recebe: confere assinatura e janela de 5 minutos. */
export function verifyWebhook(body, header, secret, now = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(header ?? ""));
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(now - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  const got = Buffer.from(m[2]);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
/** Espera entre tentativas de entrega: 1 min, 5 min, 30 min, 2 h, 6 h (5 tentativas depois da primeira). */
export const webhookBackoff = (attempt) => [60, 300, 1800, 7200, 21600][attempt - 1] ?? null;

// ------------------------------------------------------------------ integração com o CRM
/**
 * Monta o payload de lead (mesmo formato aceito pelo captureLead do CRM) a partir de uma resposta.
 * mapping: { personName?: fieldId, email?: fieldId, phone?: fieldId, companyName?: fieldId, cnpj?: fieldId,
 *            message?: fieldId | fieldId[], value?: fieldId }
 * Perguntas não mapeadas vão para `extra` com o texto da pergunta como chave.
 */
export function leadFromResponse(schema, value, mapping, { formTitle, hidden = {} } = {}) {
  const byId = new Map(schema.fields.map((f) => [f.id, f]));
  const used = new Set();
  const pick = (key) => {
    const id = mapping?.[key];
    if (!id || value[id] === undefined) return null;
    used.add(id);
    return value[id];
  };
  const msgIds = Array.isArray(mapping?.message) ? mapping.message : mapping?.message ? [mapping.message] : [];
  const message = msgIds.filter((id) => value[id] !== undefined).map((id) => { used.add(id); return `${byId.get(id)?.label}: ${displayAnswer(byId.get(id), value[id])}`; }).join("\n") || null;
  const lead = {
    personName: pick("personName"),
    email: pick("email"),
    phone: pick("phone"),
    companyName: pick("companyName"),
    cnpj: pick("cnpj"),
    value: pick("value"),
    message,
  };
  const extra = {};
  for (const f of schema.fields) {
    if (used.has(f.id) || value[f.id] === undefined || !FIELD_TYPES[f.type]?.answerable || f.type === "consent") continue;
    extra[f.label.slice(0, 100)] = displayAnswer(f, value[f.id]);
  }
  const utm = Object.fromEntries(Object.entries(hidden).filter(([k]) => /^utm_|^gclid$|^fbclid$/.test(k)));
  return { lead, extra, utm, title: formTitle ? `${lead.personName || lead.email || "Resposta"} · ${formTitle}` : null };
}
