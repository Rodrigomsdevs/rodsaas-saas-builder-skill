// rodsaas · crm — regras puras do CRM (sem banco, sem rede).
// Porte para TypeScript em api/src/modules/crm/lib/ e web/src/features/crm/lib/ (o que cada lado usar),
// junto com os testes de crm-lib.test.mjs. Rode: node --test crm-lib.test.mjs

// ------------------------------------------------------------------ texto
export const stripAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
/** chave de comparação: sem acento, minúscula, só letras/números separados por espaço */
export const normKey = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const onlyDigits = (s) => String(s ?? "").replace(/\D/g, "");

export function normalizeEmail(raw) {
  const e = String(raw ?? "").trim().toLowerCase();
  if (!e) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

// ------------------------------------------------------------------ telefone
/**
 * Normaliza telefone para dígitos com DDI ("5544999991234").
 * Aceita "(44) 99999-1234", "044 99999-1234", "0 15 44 99999-1234" (operadora), "+55 44 9999-1234",
 * "+1 415 555 0100" (internacional mantido). Celular antigo com 8 dígitos (6–9 no início) ganha o 9.
 * Devolve null se não der para ter certeza (sem DDD, tamanho errado, DDD inválido).
 */
export function normalizePhoneBR(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let d = onlyDigits(s);
  if (s.startsWith("+") && !d.startsWith("55")) return d.length >= 8 && d.length <= 15 ? d : null;
  if (s.startsWith("00") && !d.startsWith("0055")) {
    d = d.slice(2);
    return d.length >= 8 && d.length <= 15 ? d : null;
  }
  if (d.startsWith("0055")) d = d.slice(4);
  else if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  else if (d.startsWith("0") && (d.length === 13 || d.length === 14)) d = d.slice(3); // 0 + operadora (2) + DDD + número
  else if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1); // 0 + DDD + número
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  let num = d.slice(2);
  if (num.length === 8 && /^[6-9]/.test(num)) num = "9" + num; // celular sem o nono dígito
  if (num.length === 9 && num[0] !== "9") return null;
  if (num.length === 8 && !/^[2-5]/.test(num)) return null;
  return "55" + ddd + num;
}

/** "5544999991234" → "(44) 99999-1234"; internacional → "+<dígitos>" */
export function formatPhoneBR(digits) {
  const d = onlyDigits(digits);
  if (!d) return "";
  if (!d.startsWith("55") || (d.length !== 12 && d.length !== 13)) return "+" + d;
  const ddd = d.slice(2, 4), n = d.slice(4);
  return n.length === 9 ? `(${ddd}) ${n.slice(0, 5)}-${n.slice(5)}` : `(${ddd}) ${n.slice(0, 4)}-${n.slice(4)}`;
}

export const isMobileBR = (digits) => /^55\d{2}9\d{8}$/.test(onlyDigits(digits));

/** Substitui {variavel} no modelo; variável sem valor vira vazio e espaços duplicados somem. */
export function renderTemplate(template, vars) {
  return String(template ?? "")
    .replace(/\{([a-z_]+)\}/g, (_, k) => (vars?.[k] ?? "").toString())
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

export const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] ?? "";

/** Link do WhatsApp; null se o telefone não puder ser normalizado. */
export function whatsappLink(phone, text) {
  const d = /^\d{8,15}$/.test(String(phone ?? "")) ? String(phone) : normalizePhoneBR(phone);
  if (!d) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// ------------------------------------------------------------------ dinheiro (centavos)
/**
 * Converte o que o usuário digita ou o que vem de planilha em centavos inteiros.
 * "R$ 1.234,56" → 123456 · "1234,5" → 123450 · "1.234" → 123400 · "1,234.56" → 123456 · 1500 (número) → 150000.
 * Negativo, vazio ou lixo → null.
 */
export function parseMoneyBR(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? Math.round(input * 100) : null;
  let s = String(input).trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s || /^-/.test(s) || !/^[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let intPart, decPart = "";
  if (lastDot >= 0 && lastComma >= 0) {
    const decSep = lastDot > lastComma ? "." : ",";
    const [i, dec] = [s.slice(0, s.lastIndexOf(decSep)), s.slice(s.lastIndexOf(decSep) + 1)];
    intPart = i.replace(/[.,]/g, "");
    decPart = dec;
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) [intPart, decPart] = parts;
    else if (parts.slice(1).every((p) => p.length === 3)) intPart = parts.join("");
    else return null;
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      if (!parts.slice(1).every((p) => p.length === 3)) return null;
      intPart = parts.join("");
    } else [intPart, decPart] = parts;
  } else intPart = s;
  if (!/^\d+$/.test(intPart || "0") || !/^\d{0,2}$/.test(decPart)) return null;
  return Number(intPart || "0") * 100 + Number((decPart + "00").slice(0, 2));
}

export const formatMoneyBR = (cents) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);

/** Forma curta para cards e totais: R$ 950 · R$ 12,5 mil · R$ 1,2 mi */
export function formatMoneyShortBR(cents) {
  const v = (cents ?? 0) / 100;
  const fmt = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (v >= 1_000_000) return `R$ ${fmt(Math.floor(v / 100_000) / 10)} mi`;
  if (v >= 1_000) return `R$ ${fmt(Math.floor(v / 100) / 10)} mil`;
  return `R$ ${fmt(Math.round(v))}`;
}

/**
 * Total do item em centavos, com aritmética exata (BigInt) e arredondamento "meio para cima".
 * quantity: até 3 casas; discountPercent: até 2 casas.
 */
/** Teto de valores em centavos (coluna Int do Postgres): R$ 20 milhões por item e por negócio. */
export const MAX_CENTS = 2_000_000_000;

export function itemTotal({ unitPrice, quantity, discountPercent = 0 }) {
  const q = BigInt(Math.round(Number(quantity) * 1000)); // milésimos
  const d = BigInt(Math.round(Number(discountPercent) * 100)); // centésimos de %
  if (unitPrice < 0 || q <= 0n || d < 0n || d > 10000n) throw new RangeError("item inválido");
  const num = BigInt(unitPrice) * q * (10000n - d);
  const den = 1000n * 10000n;
  const total = Number((num * 2n + den) / (den * 2n));
  if (total > MAX_CENTS) throw new RangeError("total acima de R$ 20 milhões");
  return total;
}

export const sumItems = (items) => items.reduce((acc, it) => acc + itemTotal(it), 0);

// ------------------------------------------------------------------ CPF / CNPJ
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

/** CNPJ numérico e alfanumérico (12 primeiras posições podem ter letras; valor = código ASCII − 48). */
export const normalizeCNPJ = (raw) => String(raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
export function isValidCNPJ(raw) {
  const c = normalizeCNPJ(raw);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const val = (ch) => ch.charCodeAt(0) - 48;
  const dv = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += val(c[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
export const isNumericCNPJ = (raw) => /^\d{14}$/.test(normalizeCNPJ(raw));

// ------------------------------------------------------------------ deduplicação
/** Chaves normalizadas para procurar duplicados (nulas quando inválidas). */
export function dedupeKeys({ email, phone, cpf, cnpj } = {}) {
  const c = onlyDigits(cpf), j = normalizeCNPJ(cnpj);
  return {
    email: normalizeEmail(email),
    phone: normalizePhoneBR(phone),
    cpf: c && isValidCPF(c) ? c : null,
    cnpj: j && isValidCNPJ(j) ? j : null,
  };
}

// ------------------------------------------------------------------ datas no fuso da empresa
/** "YYYY-MM-DD" do instante `now` no fuso `timeZone`. */
export function dateInTZ(now, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
/** "HH:mm" do instante `now` no fuso. */
export function timeInTZ(now, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  return `${p.hour}:${p.minute}`;
}
const dayNumber = (ymd) => Math.floor(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86_400_000);
export const daysBetween = (fromYmd, toYmd) => dayNumber(toYmd) - dayNumber(fromYmd);

/** Situação de uma atividade: done | overdue | today | future (no fuso da empresa). */
export function activityState({ dueDate, dueTime, done }, now, timeZone) {
  if (done) return "done";
  const today = dateInTZ(now, timeZone);
  if (dueDate < today) return "overdue";
  if (dueDate > today) return "future";
  if (dueTime && dueTime < timeInTZ(now, timeZone)) return "overdue";
  return "today";
}

/** Ordem da "próxima atividade": data, depois hora (dia inteiro por último no dia), depois criação. */
export function compareActivities(a, b) {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  const at = a.dueTime ?? "99:99", bt = b.dueTime ?? "99:99";
  if (at !== bt) return at < bt ? -1 : 1;
  return String(a.createdAt) < String(b.createdAt) ? -1 : String(a.createdAt) > String(b.createdAt) ? 1 : 0;
}
export const nextActivity = (activities) => activities.filter((a) => !a.done).sort(compareActivities)[0] ?? null;

/** Negócio parado: { days } quando aberto e há pelo menos `rottingDays` dias na etapa; senão null. */
export function rottingInfo({ status = "OPEN", stageChangedAt }, rottingDays, now, timeZone) {
  if (status !== "OPEN" || !rottingDays) return null;
  const days = daysBetween(dateInTZ(new Date(stageChangedAt), timeZone), dateInTZ(now, timeZone));
  return days >= rottingDays ? { days } : null;
}

// ------------------------------------------------------------------ probabilidade e previsão
export function effectiveProbability(deal, stage) {
  if (deal.status === "WON") return 100;
  if (deal.status === "LOST") return 0;
  return deal.probability ?? stage?.probability ?? 0;
}
export const weightedValue = (value, probability) => Math.round((value * probability) / 100);

/** Totais de uma lista de negócios abertos: { count, value, weighted }. */
export function totals(deals, stagesById) {
  return deals.reduce(
    (acc, d) => {
      acc.count++;
      acc.value += d.value;
      acc.weighted += weightedValue(d.value, effectiveProbability(d, stagesById?.[d.stageId]));
      return acc;
    },
    { count: 0, value: 0, weighted: 0 },
  );
}

// ------------------------------------------------------------------ captura: distribuição
/** Escolhe o responsável no rodízio, pulando quem não é mais membro. cursor = valor devolvido pelo UPDATE (1, 2, 3…). */
export function roundRobinPick(assigneeIds, cursor, activeIds) {
  const active = new Set(activeIds);
  const list = assigneeIds.filter((id) => active.has(id));
  if (!list.length) return null;
  return list[(((cursor - 1) % list.length) + list.length) % list.length];
}

// ------------------------------------------------------------------ campos personalizados
export const FIELD_TYPES = ["TEXT", "TEXTAREA", "NUMBER", "MONEY", "DATE", "SELECT", "MULTISELECT", "BOOLEAN", "URL", "EMAIL", "PHONE", "CPF", "CNPJ"];

/** "Nº de funcionários" → "n_de_funcionarios"; colisão → sufixo _2, _3… */
export function slugifyFieldKey(label, existing = []) {
  let base = stripAccents(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "campo";
  if (/^\d/.test(base)) base = "c_" + base;
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().startsWith(v);

/**
 * Valida e normaliza valores de campos personalizados.
 * defs: [{ key, label, type, options: [{ id, label }], required, archivedAt }]
 * partial: true no PATCH (obrigatório só é cobrado se a chave vier vazia).
 * Devolve { value, errors: [{ path: "customFields.<key>", message }] }.
 */
export function validateCustomFields(defs, values, { partial = false } = {}) {
  const out = {}, errors = [];
  const active = defs.filter((d) => !d.archivedAt);
  const byKey = new Map(active.map((d) => [d.key, d]));
  const err = (key, message) => errors.push({ path: `customFields.${key}`, message });
  const input = values ?? {};
  if (typeof input !== "object" || Array.isArray(input)) return { value: {}, errors: [{ path: "customFields", message: "Formato inválido" }] };

  for (const key of Object.keys(input)) if (!byKey.has(key)) err(key, "Campo desconhecido");

  for (const def of active) {
    const has = Object.prototype.hasOwnProperty.call(input, def.key);
    let v = input[def.key];
    const empty = v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (def.required && (!partial || has)) err(def.key, `${def.label} é obrigatório`);
      else if (has) out[def.key] = null;
      continue;
    }
    const optionIds = new Set((def.options ?? []).map((o) => o.id));
    switch (def.type) {
      case "TEXT":
      case "TEXTAREA": {
        const max = def.type === "TEXT" ? 255 : 5000;
        if (typeof v !== "string") { err(def.key, "Texto inválido"); break; }
        v = v.trim();
        if (v.length > max) { err(def.key, `Máximo de ${max} caracteres`); break; }
        out[def.key] = v;
        break;
      }
      case "NUMBER": {
        const n = typeof v === "string" ? Number(v.replace(/\./g, "").replace(",", ".")) : v;
        if (typeof n !== "number" || !Number.isFinite(n)) { err(def.key, "Número inválido"); break; }
        out[def.key] = n;
        break;
      }
      case "MONEY": {
        const c = Number.isInteger(v) && v >= 0 ? v : null; // a API recebe centavos inteiros
        if (c === null) { err(def.key, "Valor inválido"); break; }
        out[def.key] = c;
        break;
      }
      case "DATE":
        if (!isDate(v)) { err(def.key, "Data inválida"); break; }
        out[def.key] = v;
        break;
      case "SELECT":
        if (!optionIds.has(v)) { err(def.key, "Opção inválida"); break; }
        out[def.key] = v;
        break;
      case "MULTISELECT":
        if (!Array.isArray(v) || !v.every((x) => optionIds.has(x))) { err(def.key, "Opção inválida"); break; }
        out[def.key] = [...new Set(v)];
        break;
      case "BOOLEAN":
        if (typeof v !== "boolean") { err(def.key, "Use verdadeiro ou falso"); break; }
        out[def.key] = v;
        break;
      case "URL":
        try {
          const u = new URL(String(v).trim());
          if (!/^https?:$/.test(u.protocol)) throw new Error();
          out[def.key] = u.toString();
        } catch { err(def.key, "Link inválido (use http:// ou https://)"); }
        break;
      case "EMAIL": {
        const e = normalizeEmail(v);
        if (!e) { err(def.key, "E-mail inválido"); break; }
        out[def.key] = e;
        break;
      }
      case "PHONE": {
        const p = normalizePhoneBR(v);
        if (!p) { err(def.key, "Telefone inválido (inclua o DDD)"); break; }
        out[def.key] = p;
        break;
      }
      case "CPF":
        if (!isValidCPF(v)) { err(def.key, "CPF inválido"); break; }
        out[def.key] = onlyDigits(v);
        break;
      case "CNPJ":
        if (!isValidCNPJ(v)) { err(def.key, "CNPJ inválido"); break; }
        out[def.key] = normalizeCNPJ(v);
        break;
      default:
        err(def.key, "Tipo de campo desconhecido");
    }
  }
  return { value: out, errors };
}

// ------------------------------------------------------------------ captura: payload
const LEAD_ALIASES = {
  name: ["name", "nome", "full name", "fullname", "nome completo", "your name", "seu nome"],
  firstName: ["first name", "firstname", "primeiro nome"],
  lastName: ["last name", "lastname", "sobrenome"],
  email: ["email", "e mail", "mail", "email address", "seu email"],
  phone: ["phone", "telefone", "celular", "whatsapp", "phone number", "tel", "fone", "mobile", "seu telefone", "seu whatsapp"],
  company: ["company", "empresa", "company name", "nome da empresa", "organization", "organizacao"],
  cnpj: ["cnpj"],
  title: ["title", "titulo", "assunto", "subject"],
  message: ["message", "mensagem", "msg", "comments", "comentarios", "observacao", "observacoes", "descricao"],
  value: ["value", "valor", "orcamento", "budget"],
  source: ["source", "origem", "lead source"],
};
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "page_url", "referrer"];
const IGNORED = new Set(["_gotcha", "_ts", "_redirect"]);

/**
 * Normaliza o corpo recebido na captura (JSON ou formulário).
 * Devolve { lead: { personName, email, phone, companyName, cnpj, title, message, value, source },
 *           utm, custom (cf_<key> / custom.<key>), extra, spam: boolean, errors }
 * opts: { now (ms), linksLimit }
 */
export function normalizeLeadPayload(payload, opts = {}) {
  const p = payload && typeof payload === "object" ? payload : {};
  const lookup = new Map();
  for (const [field, aliases] of Object.entries(LEAD_ALIASES)) for (const a of aliases) lookup.set(a, field);
  const found = {}, utm = {}, custom = {}, extra = {};
  for (const [rawKey, rawVal] of Object.entries(p)) {
    if (IGNORED.has(rawKey)) continue;
    const val = Array.isArray(rawVal) ? rawVal.join(", ") : rawVal;
    if (val === null || val === undefined || (typeof val === "string" && !val.trim())) continue;
    const lower = rawKey.toLowerCase();
    if (UTM_KEYS.includes(lower)) { utm[lower] = String(val).slice(0, 500); continue; }
    const cf = rawKey.match(/^(?:cf_|custom\.)([a-z0-9_]+)$/i);
    if (cf) { custom[cf[1].toLowerCase()] = val; continue; }
    if (lower === "custom" && typeof val === "object") { for (const [k, v] of Object.entries(val)) custom[k.toLowerCase()] = v; continue; }
    const field = lookup.get(normKey(rawKey));
    if (field && found[field] === undefined) found[field] = typeof val === "string" ? val.trim() : val;
    else if (Object.keys(extra).length < 50) extra[rawKey.slice(0, 100)] = typeof val === "object" ? val : String(val).slice(0, 2000);
  }
  const name = found.name ?? ([found.firstName, found.lastName].filter(Boolean).join(" ") || null);
  const lead = {
    personName: name ? String(name).slice(0, 200) : null,
    email: normalizeEmail(found.email),
    phone: normalizePhoneBR(found.phone),
    companyName: found.company ? String(found.company).slice(0, 200) : null,
    cnpj: found.cnpj && isValidCNPJ(found.cnpj) ? normalizeCNPJ(found.cnpj) : null,
    title: found.title ? String(found.title).slice(0, 200) : null,
    message: found.message ? String(found.message).slice(0, 5000) : null,
    value: found.value !== undefined ? parseMoneyBR(found.value) : null,
    source: found.source ? String(found.source).slice(0, 100) : null,
  };
  if (found.email && !lead.email) extra.email_invalido = String(found.email).slice(0, 200);
  if (found.phone && !lead.phone) extra.telefone_invalido = String(found.phone).slice(0, 50);

  const errors = [];
  if (!lead.email && !lead.phone) errors.push({ path: "email", message: "Informe um e-mail ou telefone válido" });

  let spam = false;
  if (p._gotcha && String(p._gotcha).trim()) spam = true;
  if (p._ts && opts.now) {
    const ts = Number(p._ts);
    if (Number.isFinite(ts) && opts.now - ts < 2000) spam = true;
  }
  const links = (String(lead.message ?? "").match(/https?:\/\//g) ?? []).length;
  if (links > (opts.linksLimit ?? 5)) spam = true;
  return { lead, utm, custom, extra, spam, errors };
}

/** Título padrão do lead: "Ana Souza · Site" */
export function leadTitle({ personName, companyName, email, phone }, sourceName) {
  const who = personName || companyName || email || (phone ? formatPhoneBR(phone) : "Lead");
  return sourceName ? `${who} · ${sourceName}` : who;
}

// ------------------------------------------------------------------ importação
/** Separador mais provável de um CSV: ";" (Excel pt-BR), "," ou tab, olhando as primeiras linhas fora de aspas. */
export function detectDelimiter(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const count = (line, ch) => {
    let n = 0, inQ = false;
    for (const c of line) {
      if (c === '"') inQ = !inQ;
      else if (c === ch && !inQ) n++;
    }
    return n;
  };
  let best = ";", bestScore = -1;
  for (const ch of [";", ",", "\t"]) {
    const counts = lines.map((l) => count(l, ch));
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter((c) => c === counts[0]).length;
    const score = consistent * 100 + counts[0];
    if (score > bestScore) { best = ch; bestScore = score; }
  }
  return best;
}

export const IMPORT_TARGETS = {
  CONTACT: ["name", "firstName", "lastName", "email", "phone", "secondaryPhone", "jobTitle", "cpf", "birthday", "companyName", "companyCnpj", "ownerEmail", "tags"],
  COMPANY: ["name", "legalName", "cnpj", "segment", "website", "phone", "email", "addressZip", "addressStreet", "addressNumber", "addressComplement", "addressDistrict", "addressCity", "addressState", "ownerEmail", "tags"],
  LEAD: ["title", "personName", "email", "phone", "companyName", "cnpj", "value", "message", "source", "ownerEmail", "tags"],
};

const HEADER_ALIASES = {
  name: ["nome", "name", "nome completo", "contato", "cliente", "razao social ou nome"],
  firstName: ["primeiro nome", "first name", "nome proprio"],
  lastName: ["sobrenome", "last name", "ultimo nome"],
  personName: ["nome", "nome do contato", "contato", "pessoa", "name"],
  title: ["titulo", "title", "assunto", "nome do lead", "lead"],
  email: ["email", "e mail", "mail", "endereco de email", "email principal"],
  phone: ["telefone", "celular", "whatsapp", "fone", "tel", "phone", "mobile", "telefone celular", "telefone principal", "whats"],
  secondaryPhone: ["telefone 2", "telefone fixo", "fixo", "telefone secundario", "outro telefone"],
  jobTitle: ["cargo", "funcao", "job title", "posicao"],
  cpf: ["cpf"],
  birthday: ["aniversario", "data de nascimento", "nascimento", "birthday"],
  companyName: ["empresa", "company", "nome da empresa", "organizacao", "cliente empresa"],
  companyCnpj: ["cnpj", "cnpj da empresa"],
  legalName: ["razao social", "nome empresarial", "legal name"],
  cnpj: ["cnpj"],
  segment: ["segmento", "ramo", "setor", "atividade", "industry"],
  website: ["site", "website", "url", "pagina"],
  addressZip: ["cep", "zip", "codigo postal"],
  addressStreet: ["rua", "logradouro", "endereco", "address"],
  addressNumber: ["numero", "nro", "n"],
  addressComplement: ["complemento"],
  addressDistrict: ["bairro"],
  addressCity: ["cidade", "municipio", "city"],
  addressState: ["uf", "estado", "state"],
  value: ["valor", "value", "orcamento", "ticket"],
  message: ["mensagem", "observacao", "observacoes", "obs", "descricao", "comentario", "notas"],
  source: ["origem", "fonte", "source", "canal"],
  ownerEmail: ["responsavel", "vendedor", "dono", "owner", "email do responsavel", "consultor"],
  tags: ["etiquetas", "tags", "marcadores", "categorias"],
};

/**
 * Sugere o mapeamento "cabeçalho → alvo" para a entidade.
 * customFields: [{ key, label }] também são candidatos ("cf.<key>").
 * Cada alvo é usado no máximo uma vez; o resto fica "ignore".
 */
export function suggestMapping(entity, headers, customFields = []) {
  const targets = IMPORT_TARGETS[entity];
  if (!targets) throw new Error(`entidade desconhecida: ${entity}`);
  const used = new Set();
  const mapping = {};
  const cfByLabel = new Map(customFields.map((f) => [normKey(f.label), `cf.${f.key}`]));
  for (const h of headers) {
    const k = normKey(h);
    let target = "ignore";
    for (const t of targets) {
      if (used.has(t)) continue;
      const aliases = HEADER_ALIASES[t] ?? [];
      if (aliases.includes(k) || normKey(t) === k) { target = t; break; }
    }
    if (target === "ignore" && cfByLabel.has(k) && !used.has(cfByLabel.get(k))) target = cfByLabel.get(k);
    if (target === "ignore") {
      // aproximação: cabeçalho que contém um apelido inteiro ("Telefone celular do contato")
      outer: for (const t of targets) {
        if (used.has(t)) continue;
        for (const a of HEADER_ALIASES[t] ?? []) {
          if (a.length >= 4 && (` ${k} `).includes(` ${a} `)) { target = t; break outer; }
        }
      }
    }
    if (target !== "ignore") used.add(target);
    mapping[h] = target;
  }
  // "nome" para contato: se houver primeiro nome e sobrenome e nenhum "name", fica assim mesmo (o importador junta)
  return mapping;
}

/** Converte data de planilha ("31/12/1990", "1990-12-31", número serial do Excel) em "YYYY-MM-DD". */
export function parseDateBR(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && v > 0 && v < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 30 ? "19" : "20") + m[3] : m[3];
    const ymd = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isDate(ymd) ? ymd : null;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m && isDate(m.slice(1).join("-")) ? m.slice(1).join("-") : null;
}

/**
 * Normaliza uma linha da importação conforme o mapeamento.
 * Devolve { data, custom, errors: [{ column, message }] }. Não consulta banco (duplicados e responsável
 * por e-mail são resolvidos pelo importador).
 */
export function normalizeImportRow(entity, mapping, row, customFields = []) {
  const data = {}, custom = {}, errors = [];
  const cfDefs = new Map(customFields.map((f) => [f.key, f]));
  for (const [header, target] of Object.entries(mapping)) {
    if (!target || target === "ignore") continue;
    const raw = row[header];
    const val = typeof raw === "string" ? raw.trim() : raw;
    if (val === undefined || val === null || val === "") continue;
    const bad = (message) => errors.push({ column: header, message });
    if (target.startsWith("cf.")) {
      const key = target.slice(3), def = cfDefs.get(key);
      if (!def) { bad("Campo personalizado não existe mais"); continue; }
      let v = val;
      if (def.type === "MONEY") v = parseMoneyBR(val);
      else if (def.type === "DATE") v = parseDateBR(val);
      else if (def.type === "BOOLEAN") v = /^(sim|s|yes|y|true|1|x)$/i.test(String(val)) ? true : /^(nao|não|n|no|false|0)$/i.test(String(val)) ? false : val;
      else if (def.type === "SELECT") v = (def.options ?? []).find((o) => normKey(o.label) === normKey(val))?.id ?? val;
      else if (def.type === "MULTISELECT") v = String(val).split(/[,;]/).map((x) => x.trim()).filter(Boolean).map((x) => (def.options ?? []).find((o) => normKey(o.label) === normKey(x))?.id ?? x);
      const r = validateCustomFields([def], { [key]: v }, { partial: true });
      if (r.errors.length) bad(r.errors[0].message);
      else custom[key] = r.value[key];
      continue;
    }
    switch (target) {
      case "email":
        data.email = normalizeEmail(val);
        if (!data.email) bad("E-mail inválido");
        break;
      case "ownerEmail":
        data.ownerEmail = normalizeEmail(val);
        if (!data.ownerEmail) bad("E-mail do responsável inválido");
        break;
      case "phone":
      case "secondaryPhone":
        data[target] = normalizePhoneBR(val);
        if (!data[target]) bad("Telefone inválido (inclua o DDD)");
        break;
      case "cpf":
        if (isValidCPF(val)) data.cpf = onlyDigits(val);
        else bad("CPF inválido");
        break;
      case "cnpj":
      case "companyCnpj":
        if (isValidCNPJ(val)) data[target] = normalizeCNPJ(val);
        else bad("CNPJ inválido");
        break;
      case "birthday":
        data.birthday = parseDateBR(val);
        if (!data.birthday) bad("Data inválida (use dd/mm/aaaa)");
        break;
      case "value":
        data.value = parseMoneyBR(val);
        if (data.value === null) bad("Valor inválido");
        break;
      case "addressZip": {
        const z = onlyDigits(val);
        if (z.length === 8) data.addressZip = z;
        else bad("CEP inválido");
        break;
      }
      case "addressState": {
        const uf = String(val).trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(uf)) data.addressState = uf;
        else bad("UF inválida");
        break;
      }
      case "website": {
        const w = /^https?:\/\//i.test(val) ? val : `https://${val}`;
        try { data.website = new URL(w).toString(); } catch { bad("Site inválido"); }
        break;
      }
      case "tags":
        data.tags = [...new Set(String(val).split(/[,;]/).map((t) => t.trim()).filter(Boolean))].slice(0, 20);
        break;
      default:
        data[target] = String(val).slice(0, target === "message" ? 5000 : 255);
    }
  }
  if (entity === "CONTACT") {
    if (!data.name && (data.firstName || data.lastName)) data.name = [data.firstName, data.lastName].filter(Boolean).join(" ");
    delete data.firstName;
    delete data.lastName;
    if (!data.name) errors.push({ column: null, message: "Nome obrigatório" });
  }
  if (entity === "COMPANY" && !data.name) {
    if (data.legalName) data.name = data.legalName;
    else errors.push({ column: null, message: "Nome obrigatório" });
  }
  if (entity === "LEAD" && !data.email && !data.phone) errors.push({ column: null, message: "Informe e-mail ou telefone" });
  return { data, custom, errors };
}

// ------------------------------------------------------------------ exportação
/** Valor seguro para CSV aberto no Excel: aspas quando preciso e apóstrofo antes de =, +, -, @ (fórmula). */
export function csvSafe(value, delimiter = ";") {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (s.includes(delimiter) || /["\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
export const csvMoney = (cents) => ((cents ?? 0) / 100).toFixed(2).replace(".", ",");
export const csvDate = (ymdOrIso) => {
  if (!ymdOrIso) return "";
  const s = String(ymdOrIso);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};

// ================================================================== vendas avançadas (references/08) e perfis (09)

// ------------------------------------------------------------------ dias e períodos
const ymdOf = (n) => new Date(n * 86_400_000).toISOString().slice(0, 10);
export const addDays = (ymd, n) => ymdOf(dayNumber(ymd) + n);
const weekday = (ymd) => new Date(dayNumber(ymd) * 86_400_000).getUTCDay(); // 0 domingo … 6 sábado
export const isBusinessDay = (ymd, holidays = []) => weekday(ymd) !== 0 && weekday(ymd) !== 6 && !holidays.includes(ymd);
/** Soma n dias úteis (pula sábado, domingo e feriados); n = 0 empurra para o próximo dia útil se cair num dia parado. */
export function addBusinessDays(ymd, n, holidays = []) {
  let d = ymd;
  while (!isBusinessDay(d, holidays)) d = addDays(d, 1);
  for (let i = 0; i < n; i++) { d = addDays(d, 1); while (!isBusinessDay(d, holidays)) d = addDays(d, 1); }
  return d;
}
/** Período de meta: "2026-10" (mês) ou "2026-Q4" (trimestre) → { start, end } (inclusive) ou null. */
export function periodBounds(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period));
  const q = /^(\d{4})-Q([1-4])$/.exec(String(period));
  if (!m && !q) return null;
  const y = Number((m ?? q)[1]);
  const first = m ? Number(m[2]) : (Number(q[2]) - 1) * 3 + 1;
  const months = m ? 1 : 3;
  if (first < 1 || first > 12) return null;
  const start = `${y}-${String(first).padStart(2, "0")}-01`;
  const endMonth = first + months; // mês seguinte ao fim
  const next = endMonth > 12 ? `${y + 1}-01-01` : `${y}-${String(endMonth).padStart(2, "0")}-01`;
  return { start, end: addDays(next, -1) };
}

// ------------------------------------------------------------------ metas por vendedor
export const GOAL_METRICS = ["WON_VALUE", "WON_COUNT", "DEALS_CREATED", "ACTIVITIES_DONE"];
/**
 * Quanto a meta já atingiu. data: { deals: [{ ownerId, pipelineId, status, value, wonOn, createdOn }], activities: [{ ownerId, done, doneOn }] }
 * (datas "YYYY-MM-DD" no fuso da empresa). ownerId null = equipe toda.
 */
export function goalAchieved(metric, data, { ownerId = null, pipelineId = null, start, end }) {
  const inRange = (d) => !!d && d >= start && d <= end;
  const mine = (x) => ownerId == null || x.ownerId === ownerId;
  const pipe = (x) => pipelineId == null || x.pipelineId === pipelineId;
  const deals = (data.deals ?? []).filter((d) => mine(d) && pipe(d));
  if (metric === "WON_VALUE") return deals.filter((d) => d.status === "WON" && inRange(d.wonOn)).reduce((a, d) => a + (d.value ?? 0), 0);
  if (metric === "WON_COUNT") return deals.filter((d) => d.status === "WON" && inRange(d.wonOn)).length;
  if (metric === "DEALS_CREATED") return deals.filter((d) => inRange(d.createdOn)).length;
  if (metric === "ACTIVITIES_DONE") return (data.activities ?? []).filter((a) => mine(a) && a.done && inRange(a.doneOn)).length;
  return 0;
}
/**
 * Progresso: pct (atingido/meta), expectedPct (proporcional aos dias corridos), status DONE | AHEAD | ON_TRACK | BEHIND
 * (10 pontos de folga para cada lado), remaining, daysLeft (contando hoje) e perDayNeeded.
 */
export function goalProgress({ target, achieved, start, end, today }) {
  const total = daysBetween(start, end) + 1;
  const elapsed = Math.min(total, Math.max(0, daysBetween(start, today) + 1));
  const expectedPct = Math.round((elapsed / total) * 100);
  const pct = target > 0 ? Math.floor((achieved * 100) / target) : 0;
  const remaining = Math.max(0, target - achieved);
  const left = today > end ? 0 : today < start ? total : daysBetween(today, end) + 1;
  const status = achieved >= target && target > 0 ? "DONE" : pct >= expectedPct + 10 ? "AHEAD" : pct >= expectedPct - 10 ? "ON_TRACK" : "BEHIND";
  return { pct, expectedPct, status, remaining, daysLeft: left, perDayNeeded: remaining === 0 ? 0 : left > 0 ? Math.ceil(remaining / left) : remaining };
}

// ------------------------------------------------------------------ condições (automações e pontuação)
export const CONDITION_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "empty", "notEmpty"];
const fieldValue = (obj, field) => (String(field).startsWith("cf.") ? obj?.customFields?.[field.slice(3)] : obj?.[field]);
const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
/** cond: { field, op, value } contra um objeto (negócio ou lead). `cf.<chave>` lê o campo personalizado. */
export function conditionMatches(cond, obj) {
  const v = fieldValue(obj, cond.field), c = cond.value;
  switch (cond.op) {
    case "eq": return Array.isArray(v) ? false : v === c;
    case "neq": return v !== c;
    case "gt": return typeof v === "number" && typeof c === "number" && v > c;
    case "gte": return typeof v === "number" && typeof c === "number" && v >= c;
    case "lt": return typeof v === "number" && typeof c === "number" && v < c;
    case "lte": return typeof v === "number" && typeof c === "number" && v <= c;
    case "in": return Array.isArray(c) && c.includes(v);
    case "contains": return Array.isArray(v) ? v.includes(c) : typeof v === "string" && typeof c === "string" && normKey(v).includes(normKey(c));
    case "empty": return isEmpty(v);
    case "notEmpty": return !isEmpty(v);
    default: return false;
  }
}

// ------------------------------------------------------------------ automações por etapa
export const AUTOMATION_TRIGGERS = ["DEAL_CREATED", "STAGE_ENTERED", "DEAL_WON", "DEAL_LOST", "DEAL_ROTTING"];
export const AUTOMATION_ACTIONS = ["CREATE_ACTIVITY", "ASSIGN_OWNER", "ADD_TAG", "SEND_EMAIL", "SEND_WHATSAPP", "START_SEQUENCE", "NOTIFY"];
export const ACTIVITY_TYPES = ["CALL", "MEETING", "TASK", "EMAIL", "WHATSAPP", "VISIT", "LUNCH"];
export const MAX_AUTOMATION_DEPTH = 3;
/** Confere a automação antes de salvar. ctx: { stageIds, tagIds, userIds, sequenceIds, templateIds } → [{ path, message }] */
export function validateAutomation(a, ctx = {}) {
  const e = [];
  const has = (list, id) => !list || list.includes(id);
  if (!String(a?.name ?? "").trim()) e.push({ path: "name", message: "Dê um nome" });
  const t = a?.trigger ?? {};
  if (!AUTOMATION_TRIGGERS.includes(t.type)) e.push({ path: "trigger.type", message: "Gatilho inválido" });
  if (["STAGE_ENTERED", "DEAL_ROTTING"].includes(t.type) && !(t.stageId && has(ctx.stageIds, t.stageId))) e.push({ path: "trigger.stageId", message: "Escolha a etapa" });
  (a?.conditions ?? []).forEach((c, i) => {
    if (!String(c?.field ?? "").trim()) e.push({ path: `conditions.${i}.field`, message: "Campo" });
    if (!CONDITION_OPS.includes(c?.op)) e.push({ path: `conditions.${i}.op`, message: "Operador" });
  });
  const acts = a?.actions ?? [];
  if (!acts.length) e.push({ path: "actions", message: "Inclua pelo menos uma ação" });
  if (acts.length > 10) e.push({ path: "actions", message: "Até 10 ações" });
  acts.forEach((x, i) => {
    const p = `actions.${i}`;
    if (!AUTOMATION_ACTIONS.includes(x?.type)) return e.push({ path: `${p}.type`, message: "Ação inválida" });
    if (x.type === "CREATE_ACTIVITY") {
      if (!ACTIVITY_TYPES.includes(x.activityType)) e.push({ path: `${p}.activityType`, message: "Tipo de atividade" });
      if (!String(x.subject ?? "").trim()) e.push({ path: `${p}.subject`, message: "Assunto" });
      if (!(Number.isInteger(x.dueInDays) && x.dueInDays >= 0 && x.dueInDays <= 365)) e.push({ path: `${p}.dueInDays`, message: "Prazo de 0 a 365 dias" });
      if (x.assignTo === "USER" && !(x.userId && has(ctx.userIds, x.userId))) e.push({ path: `${p}.userId`, message: "Escolha a pessoa" });
    }
    if (x.type === "ASSIGN_OWNER" && !(Array.isArray(x.userIds) && x.userIds.length && x.userIds.every((u) => has(ctx.userIds, u)))) e.push({ path: `${p}.userIds`, message: "Escolha quem recebe" });
    if (x.type === "ADD_TAG" && !(x.tagId && has(ctx.tagIds, x.tagId))) e.push({ path: `${p}.tagId`, message: "Etiqueta" });
    if (x.type === "START_SEQUENCE" && !(x.sequenceId && has(ctx.sequenceIds, x.sequenceId))) e.push({ path: `${p}.sequenceId`, message: "Sequência" });
    if (x.type === "SEND_EMAIL" && !(x.templateId && has(ctx.templateIds, x.templateId))) e.push({ path: `${p}.templateId`, message: "Modelo de e-mail" });
    if (x.type === "SEND_WHATSAPP" && !String(x.templateName ?? x.snippetId ?? "").trim()) e.push({ path: `${p}.templateName`, message: "Modelo do WhatsApp" });
    if (x.type === "NOTIFY" && !(Array.isArray(x.userIds) && x.userIds.length)) e.push({ path: `${p}.userIds`, message: "Quem avisar" });
  });
  return e;
}
/** event: { type, stageId?, pipelineId? } · deal: o negócio depois da mudança. */
export function automationMatches(a, event, deal) {
  if (!a?.active || a.trigger?.type !== event.type) return false;
  if (a.pipelineId && a.pipelineId !== (event.pipelineId ?? deal.pipelineId)) return false;
  if (["STAGE_ENTERED", "DEAL_ROTTING"].includes(event.type) && a.trigger.stageId !== event.stageId) return false;
  return (a.conditions ?? []).every((c) => conditionMatches(c, deal));
}
/**
 * Ações resolvidas para executar (sem efeito colateral). opts: { today, businessDays, holidays, rrCursor, activeUserIds }
 * → { actions: [...], rrCursor } — CREATE_ACTIVITY ganha dueDate e ownerId; ASSIGN_OWNER ganha ownerId (rodízio).
 */
export function planActions(a, deal, { today, businessDays = false, holidays = [], rrCursor = 0, activeUserIds = null } = {}) {
  let cursor = rrCursor;
  const out = (a.actions ?? []).map((x) => {
    if (x.type === "CREATE_ACTIVITY") {
      const dueDate = businessDays ? addBusinessDays(today, x.dueInDays, holidays) : addDays(today, x.dueInDays);
      return { ...x, dueDate, ownerId: x.assignTo === "USER" ? x.userId : deal.ownerId };
    }
    if (x.type === "ASSIGN_OWNER") {
      cursor += 1;
      return { ...x, ownerId: roundRobinPick(x.userIds, cursor, activeUserIds ?? x.userIds) };
    }
    return { ...x };
  });
  return { actions: out, rrCursor: cursor };
}

// ------------------------------------------------------------------ sequências de follow-up
export const SEQUENCE_STEP_TYPES = ["CALL", "EMAIL", "WHATSAPP", "TASK", "MEETING"];
export const SEQUENCE_STOP_EVENTS = ["DEAL_WON", "DEAL_LOST", "REPLIED", "OPTED_OUT"];
export function validateSequence(s) {
  const e = [];
  if (!String(s?.name ?? "").trim()) e.push({ path: "name", message: "Dê um nome" });
  const steps = s?.steps ?? [];
  if (!steps.length || steps.length > 20) e.push({ path: "steps", message: "De 1 a 20 passos" });
  steps.forEach((st, i) => {
    if (!SEQUENCE_STEP_TYPES.includes(st?.type)) e.push({ path: `steps.${i}.type`, message: "Tipo do passo" });
    if (!String(st?.subject ?? "").trim()) e.push({ path: `steps.${i}.subject`, message: "Assunto" });
    if (!(Number.isInteger(st?.dayOffset) && st.dayOffset >= 0 && st.dayOffset <= 180)) e.push({ path: `steps.${i}.dayOffset`, message: "Dia de 0 a 180" });
    else if (i > 0 && st.dayOffset < steps[i - 1].dayOffset) e.push({ path: `steps.${i}.dayOffset`, message: "Os dias não podem voltar" });
  });
  for (const x of s?.stopOn ?? []) if (!SEQUENCE_STOP_EVENTS.includes(x)) e.push({ path: "stopOn", message: `Evento desconhecido: ${x}` });
  return e;
}
/** Data do passo `index` contada a partir de `baseYmd` (início, para o 1º; conclusão do anterior, para os outros). */
export function stepDueDate(steps, index, baseYmd, { businessDays = true, holidays = [] } = {}) {
  const gap = steps[index].dayOffset - (index > 0 ? steps[index - 1].dayOffset : 0);
  return businessDays ? addBusinessDays(baseYmd, gap, holidays) : addDays(baseYmd, gap);
}
/** Depois de concluir o passo `index`: o próximo índice ou null (acabou). */
export const nextStepIndex = (steps, index) => (index + 1 < steps.length ? index + 1 : null);
/** O evento encerra a sequência? → motivo ou null. */
export const sequenceStopReason = (sequence, eventType) => ((sequence.stopOn ?? SEQUENCE_STOP_EVENTS).includes(eventType) ? eventType : null);

// ------------------------------------------------------------------ duplicados e mesclagem
/** Grupos de contatos parecidos (2+): por CPF, e-mail, telefone e nome dentro da mesma empresa, nessa ordem de força. */
export function duplicateGroups(records) {
  const keyers = [
    ["cpf", (r) => (isValidCPF(r.cpf) ? onlyDigits(r.cpf) : null)],
    ["email", (r) => normalizeEmail(r.email)],
    ["phone", (r) => normalizePhoneBR(r.phone)],
    ["name", (r) => (normKey(r.name) ? `${normKey(r.name)}|${r.companyId ?? ""}` : null)],
  ];
  const groups = [];
  for (const [by, key] of keyers) {
    const map = new Map();
    for (const r of records) { const k = key(r); if (!k) continue; if (!map.has(k)) map.set(k, []); map.get(k).push(r.id); }
    for (const [k, ids] of map) if (ids.length > 1) groups.push({ by, key: k, ids });
  }
  // o mesmo conjunto de ids aparece só no critério mais forte
  const seen = new Set();
  return groups.filter((g) => { const sig = [...g.ids].sort().join(","); if (seen.has(sig)) return false; seen.add(sig); return true; });
}
/**
 * Junta dois registros: o destino fica, a origem some. Vazio no destino é preenchido pela origem; quando os dois têm valor,
 * vale o destino, a não ser que choices[campo] === "source". Listas (tagIds) somam sem repetir; campos personalizados por chave.
 * → { merged, conflicts: [campos com valores diferentes nos dois] }
 */
export function mergeRecords(target, source, choices = {}, fields = Object.keys({ ...source, ...target })) {
  const merged = { ...target }, conflicts = [];
  for (const f of fields) {
    if (["id", "createdAt", "updatedAt", "deletedAt"].includes(f)) continue;
    const t = target[f], s = source[f];
    if (f === "customFields") {
      const out = { ...(s ?? {}), ...(t ?? {}) };
      for (const k of Object.keys(s ?? {})) {
        if (!isEmpty(t?.[k]) && !isEmpty(s[k]) && JSON.stringify(t[k]) !== JSON.stringify(s[k])) { conflicts.push(`cf.${k}`); if (choices[`cf.${k}`] === "source") out[k] = s[k]; }
        else if (isEmpty(t?.[k])) out[k] = s[k];
      }
      merged.customFields = out; continue;
    }
    if (Array.isArray(t) || Array.isArray(s)) { merged[f] = [...new Set([...(t ?? []), ...(s ?? [])])]; continue; }
    if (isEmpty(t)) merged[f] = s ?? t;
    else if (!isEmpty(s) && t !== s) { conflicts.push(f); if (choices[f] === "source") merged[f] = s; }
  }
  return { merged, conflicts };
}

// ------------------------------------------------------------------ modelos de e-mail e mensagens prontas
export const TEMPLATE_VARS = ["contato.nome", "contato.primeiro_nome", "contato.email", "contato.telefone", "empresa.nome", "negocio.titulo", "negocio.valor", "negocio.etapa", "vendedor.nome", "vendedor.primeiro_nome", "vendedor.email", "hoje"];
export const templateVariables = (text) => [...new Set([...String(text ?? "").matchAll(/\{\{\s*([a-z_.]+)\s*\}\}/g)].map((m) => m[1]))];
/** Variáveis desconhecidas → [{ path, message }] (path = o campo do modelo). */
export function validateTemplateVars(fields) {
  const e = [];
  for (const [path, text] of Object.entries(fields)) for (const v of templateVariables(text)) if (!TEMPLATE_VARS.includes(v)) e.push({ path, message: `Variável desconhecida: {{${v}}}` });
  return e;
}
/**
 * Preenche {{contato.primeiro_nome}} etc. ctx: { contact: { name, email, phone }, company: { name }, deal: { title, value, stageName }, owner: { name, email }, today }
 * → { text, missing: [variáveis usadas sem valor] }
 */
export function renderCrmTemplate(text, ctx = {}) {
  const val = {
    "contato.nome": ctx.contact?.name, "contato.primeiro_nome": firstName(ctx.contact?.name), "contato.email": ctx.contact?.email,
    "contato.telefone": ctx.contact?.phone ? formatPhoneBR(ctx.contact.phone) : "", "empresa.nome": ctx.company?.name,
    "negocio.titulo": ctx.deal?.title, "negocio.valor": ctx.deal?.value != null ? formatMoneyBR(ctx.deal.value) : "", "negocio.etapa": ctx.deal?.stageName,
    "vendedor.nome": ctx.owner?.name, "vendedor.primeiro_nome": firstName(ctx.owner?.name), "vendedor.email": ctx.owner?.email,
    hoje: ctx.today ? `${ctx.today.slice(8, 10)}/${ctx.today.slice(5, 7)}/${ctx.today.slice(0, 4)}` : "",
  };
  const missing = [];
  const out = String(text ?? "").replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (_, k) => { const v = val[k]; if (isEmpty(v)) { if (!missing.includes(k)) missing.push(k); return ""; } return String(v); });
  return { text: out, missing };
}

// ------------------------------------------------------------------ pontuação de lead
export const SCORE_FIELDS = ["sourceId", "via", "hasEmail", "hasPhone", "hasCompany", "hasCnpj", "value", "utmSource", "utmCampaign"];
export function validateScoring({ rules, warmAt = 30, hotAt = 70 }) {
  const e = [];
  if (!(Number.isInteger(warmAt) && Number.isInteger(hotAt) && warmAt > 0 && hotAt > warmAt && hotAt <= 100)) e.push({ path: "hotAt", message: "Morno abaixo de quente, até 100" });
  if ((rules ?? []).length > 50) e.push({ path: "rules", message: "Até 50 regras" });
  (rules ?? []).forEach((r, i) => {
    if (!SCORE_FIELDS.includes(r?.field) && !String(r?.field ?? "").startsWith("cf.")) e.push({ path: `rules.${i}.field`, message: "Campo" });
    if (!CONDITION_OPS.includes(r?.op)) e.push({ path: `rules.${i}.op`, message: "Operador" });
    if (!(Number.isInteger(r?.points) && r.points >= -50 && r.points <= 50 && r.points !== 0)) e.push({ path: `rules.${i}.points`, message: "De -50 a 50 pontos" });
  });
  return e;
}
/** Objeto que as regras enxergam a partir do lead. */
export const leadFacts = (l) => ({ sourceId: l.sourceId ?? null, via: l.via ?? null, hasEmail: !!normalizeEmail(l.email), hasPhone: !!normalizePhoneBR(l.phone), hasCompany: !!(String(l.companyName ?? "").trim() || l.cnpj), hasCnpj: !!(l.cnpj && isValidCNPJ(l.cnpj)), value: l.value ?? null, utmSource: l.utm?.source ?? null, utmCampaign: l.utm?.campaign ?? null, customFields: l.customFields ?? {} });
/** → { score (0 a 100), breakdown: [{ ruleId, points }] } */
export function leadScore(lead, rules) {
  const facts = leadFacts(lead);
  const breakdown = [];
  for (const r of rules ?? []) if (conditionMatches(r, facts)) breakdown.push({ ruleId: r.id, points: r.points });
  const raw = breakdown.reduce((a, b) => a + b.points, 0);
  return { score: Math.max(0, Math.min(100, raw)), breakdown };
}
export const temperatureOf = (score, { warmAt = 30, hotAt = 70 } = {}) => (score >= hotAt ? "HOT" : score >= warmAt ? "WARM" : "COLD");

// ------------------------------------------------------------------ imobiliária: imóveis × interesse
export const PROPERTY_TYPES = ["APARTMENT", "HOUSE", "LAND", "COMMERCIAL", "RURAL"];
/**
 * Imóveis compatíveis com o interesse do cliente. interest: { purpose: SALE|RENT, types?, neighborhoods?, minBedrooms?, maxPriceCents?, minPriceCents? }
 * Filtros duros: disponível, finalidade, tipo (se escolheu), quartos mínimos, faixa de preço. Ordem: bairro desejado primeiro,
 * depois quem passa dos quartos pedidos, depois o mais barato. → [{ property, score, reasons }]
 */
export function matchProperties(interest, properties) {
  const hoods = (interest.neighborhoods ?? []).map(normKey);
  return properties
    .filter((p) => p.status === "AVAILABLE" && p.purpose === interest.purpose)
    .filter((p) => !(interest.types ?? []).length || interest.types.includes(p.type))
    .filter((p) => interest.minBedrooms == null || (p.bedrooms ?? 0) >= interest.minBedrooms)
    .filter((p) => interest.maxPriceCents == null || p.priceCents <= interest.maxPriceCents)
    .filter((p) => interest.minPriceCents == null || p.priceCents >= interest.minPriceCents)
    .map((p) => {
      const reasons = [];
      let score = 0;
      if (hoods.includes(normKey(p.neighborhood))) { score += 2; reasons.push("bairro desejado"); }
      if (interest.minBedrooms != null && (p.bedrooms ?? 0) > interest.minBedrooms) { score += 1; reasons.push("mais quartos que o pedido"); }
      return { property: p, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.property.priceCents - b.property.priceCents);
}

// ------------------------------------------------------------------ perfis de segmento
const W = (s, p) => [s, p];
/**
 * Perfis do CRM (`references/09-perfis-de-segmento.md`): vocabulário, funil, campos, mensagens prontas, sequência e
 * automações sugeridas (criadas desligadas) e o que o menu destaca. Trocar de perfil nunca apaga nada.
 */
export const CRM_SEGMENTS = [
  { id: "GENERAL", label: "Geral", vocabulary: { deal: W("negócio", "negócios"), contact: W("contato", "contatos"), company: W("empresa", "empresas") },
    pipeline: null, customFields: [], snippets: [{ name: "Primeiro contato", body: "Olá {{contato.primeiro_nome}}, aqui é {{vendedor.primeiro_nome}}. Posso te ajudar?" }], sequence: null, automations: [], menu: [] },
  { id: "B2B", label: "Vendas para empresas (B2B)", vocabulary: { deal: W("oportunidade", "oportunidades"), contact: W("contato", "contatos"), company: W("conta", "contas") },
    pipeline: { name: "Vendas B2B", stages: [["Prospecção", 10, 14], ["Qualificação", 20, 10], ["Diagnóstico", 40, 10], ["Proposta", 60, 7], ["Negociação", 80, 7]] },
    customFields: [{ entity: "COMPANY", label: "Funcionários", type: "SELECT", options: ["1-10", "11-50", "51-200", "201-1000", "1000+"] }, { entity: "DEAL", label: "Decisor", type: "TEXT" }, { entity: "DEAL", label: "Concorrente", type: "TEXT" }],
    snippets: [{ name: "Retomar contato", body: "Oi {{contato.primeiro_nome}}, tudo bem? Conseguiu avaliar a proposta para a {{empresa.nome}}?" }],
    sequence: { name: "Prospecção em 5 toques", steps: [{ dayOffset: 0, type: "EMAIL", subject: "E-mail de apresentação" }, { dayOffset: 2, type: "CALL", subject: "Ligação de conexão" }, { dayOffset: 5, type: "WHATSAPP", subject: "Mensagem curta no WhatsApp" }, { dayOffset: 9, type: "EMAIL", subject: "Caso de sucesso" }, { dayOffset: 14, type: "CALL", subject: "Última tentativa" }] },
    automations: [{ name: "Proposta → follow-up em 3 dias", trigger: { type: "STAGE_ENTERED", stage: "Proposta" }, actions: [{ type: "CREATE_ACTIVITY", activityType: "CALL", subject: "Follow-up da proposta", dueInDays: 3, assignTo: "OWNER" }] }],
    menu: ["Metas", "Sequências", "Propostas"] },
  { id: "REAL_ESTATE", label: "Imobiliária", vocabulary: { deal: W("negociação", "negociações"), contact: W("cliente", "clientes"), company: W("empresa", "empresas") },
    pipeline: { name: "Imóveis", stages: [["Novo lead", 10, 2], ["Atendimento", 25, 5], ["Visita agendada", 45, 7], ["Proposta", 70, 7], ["Documentação", 90, 15]] },
    customFields: [{ entity: "DEAL", label: "Finalidade", type: "SELECT", options: ["Comprar", "Alugar"] }, { entity: "DEAL", label: "Forma de pagamento", type: "SELECT", options: ["À vista", "Financiamento", "FGTS", "Permuta"] }, { entity: "CONTACT", label: "Renda familiar", type: "MONEY" }],
    snippets: [{ name: "Imóveis selecionados", body: "Olá {{contato.primeiro_nome}}! Separei alguns imóveis com o seu perfil. Quer agendar uma visita?" }, { name: "Confirmar visita", body: "Oi {{contato.primeiro_nome}}, confirmando nossa visita. Te espero lá!" }],
    sequence: { name: "Lead de portal", steps: [{ dayOffset: 0, type: "WHATSAPP", subject: "Responder o lead do portal" }, { dayOffset: 0, type: "CALL", subject: "Ligar e entender o perfil" }, { dayOffset: 1, type: "WHATSAPP", subject: "Mandar imóveis compatíveis" }, { dayOffset: 3, type: "CALL", subject: "Agendar visita" }] },
    automations: [{ name: "Visita agendada → lembrete", trigger: { type: "STAGE_ENTERED", stage: "Visita agendada" }, actions: [{ type: "CREATE_ACTIVITY", activityType: "VISIT", subject: "Visita ao imóvel", dueInDays: 1, assignTo: "OWNER" }] }],
    menu: ["Imóveis", "Visitas"] },
  { id: "EDUCATION", label: "Escola ou curso", vocabulary: { deal: W("matrícula", "matrículas"), contact: W("responsável", "responsáveis"), company: W("empresa", "empresas") },
    pipeline: { name: "Matrículas", stages: [["Interessado", 10, 3], ["Visita ou aula experimental", 35, 7], ["Matrícula em andamento", 70, 5], ["Documentação", 90, 7]] },
    customFields: [{ entity: "DEAL", label: "Curso ou série", type: "TEXT" }, { entity: "DEAL", label: "Turno", type: "SELECT", options: ["Manhã", "Tarde", "Noite", "Integral"] }, { entity: "DEAL", label: "Nome do aluno", type: "TEXT" }],
    snippets: [{ name: "Convite para visita", body: "Olá {{contato.primeiro_nome}}! Que tal conhecer a escola? Temos horários para visita e aula experimental." }],
    sequence: { name: "Campanha de matrícula", steps: [{ dayOffset: 0, type: "WHATSAPP", subject: "Boas-vindas e convite para visita" }, { dayOffset: 2, type: "CALL", subject: "Ligar para agendar a visita" }, { dayOffset: 7, type: "EMAIL", subject: "Condições da matrícula" }] },
    automations: [], menu: ["Campanhas", "Visitas"] },
  { id: "RETAIL", label: "Varejo", vocabulary: { deal: W("venda", "vendas"), contact: W("cliente", "clientes"), company: W("empresa", "empresas") },
    pipeline: { name: "Vendas da loja", stages: [["Novo", 10, 1], ["Em atendimento", 30, 2], ["Orçamento enviado", 60, 3]] },
    customFields: [{ entity: "CONTACT", label: "Aniversário", type: "DATE" }, { entity: "CONTACT", label: "Preferências", type: "TEXTAREA" }],
    snippets: [{ name: "Orçamento", body: "Oi {{contato.primeiro_nome}}! Segue o orçamento de {{negocio.valor}}. Posso separar para você?" }, { name: "Chegou novidade", body: "Oi {{contato.primeiro_nome}}, chegou novidade que é a sua cara. Quer ver fotos?" }],
    sequence: null,
    automations: [{ name: "Venda ganha → oferecer recompra em 30 dias", trigger: { type: "DEAL_WON" }, actions: [{ type: "CREATE_ACTIVITY", activityType: "WHATSAPP", subject: "Oferecer recompra", dueInDays: 30, assignTo: "OWNER" }] }],
    menu: ["Clientes", "WhatsApp"] },
];
export const crmSegment = (id) => CRM_SEGMENTS.find((s) => s.id === id) ?? CRM_SEGMENTS[0];
