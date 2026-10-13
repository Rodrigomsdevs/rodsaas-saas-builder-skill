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
