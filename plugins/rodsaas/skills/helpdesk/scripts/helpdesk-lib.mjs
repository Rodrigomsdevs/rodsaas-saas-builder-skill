// rodsaas · helpdesk — regras puras do atendimento (sem banco, sem rede).
// Horário comercial e SLA (com fuso, feriados e pausa), estados do chamado, e-mail (endereços, assunto,
// encadeamento de respostas, citação, resposta automática), distribuição, gatilhos, macros, números e CSAT.
// Porte para TypeScript em api/src/modules/helpdesk/lib/ (e o que o front usar), junto com os testes de
// helpdesk-lib.test.mjs. Rode: node --test helpdesk-lib.test.mjs
// (As funções de data/fuso/feriado são as mesmas do agenda-lib; num projeto com os dois presets, use um módulo só.)

import { createHash, randomBytes } from "node:crypto";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

// ------------------------------------------------------------------ datas e fusos
const fmtCache = new Map();
function partsFmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    }));
  }
  return fmtCache.get(tz);
}
const toMs = (v) => (typeof v === "number" ? v : v instanceof Date ? v.getTime() : Date.parse(v));
const pad = (n) => String(n).padStart(2, "0");
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Data, hora e dia da semana locais de um instante: { ymd: "2026-10-15", hm: "09:30", dow: 4 }. */
export function localOf(instant, timeZone) {
  const p = Object.fromEntries(partsFmt(timeZone).formatToParts(new Date(toMs(instant))).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, dow: WD[p.weekday] };
}

/** Diferença local − UTC em minutos naquele instante (São Paulo: −180). */
export function offsetMinutes(instant, timeZone) {
  const ms = Math.floor(toMs(instant) / 1000) * 1000;
  const p = Object.fromEntries(partsFmt(timeZone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms) / MIN);
}

/**
 * Instante UTC (ms) de uma data e hora locais num fuso.
 * Horário que não existe (pulo do horário de verão) anda para frente; horário repetido (volta) usa o primeiro.
 */
export function zonedToUtc(ymd, hm, timeZone) {
  const [y, m, d] = ymd.split("-").map(Number);
  const [H, M] = hm.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, H, M);
  const offsets = new Set([offsetMinutes(naive - 14 * HOUR, timeZone), offsetMinutes(naive, timeZone), offsetMinutes(naive + 14 * HOUR, timeZone)]);
  const want = `${ymd} ${pad(H)}:${pad(M)}`;
  const valid = [...offsets].map((o) => naive - o * MIN).filter((u) => { const l = localOf(u, timeZone); return `${l.ymd} ${l.hm}` === want; }).sort((a, b) => a - b);
  if (valid.length) return valid[0];
  return naive - offsetMinutes(naive - 14 * HOUR, timeZone) * MIN;
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export const dowOf = (ymd) => new Date(ymd + "T12:00:00Z").getUTCDay();
const hmToMin = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const minToHm = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
export const isValidTimeZone = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };

// ------------------------------------------------------------------ feriados
/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Feriados nacionais do Brasil calculados aqui (sem rede), usados como reserva e nos testes.
 * Em produção, a fonte principal é a BrasilAPI (feriados nacionais), com cache por ano; confira se a lista mudou.
 * optional: pontos facultativos nacionais (Carnaval, Quarta de Cinzas até 14 h fica de fora, Corpus Christi).
 */
export function brazilHolidays(year, { optional = false } = {}) {
  const e = easter(year);
  const list = [
    [`${year}-01-01`, "Confraternização Universal"],
    [addDays(e, -2), "Sexta-feira Santa"],
    [`${year}-04-21`, "Tiradentes"],
    [`${year}-05-01`, "Dia do Trabalho"],
    [`${year}-09-07`, "Independência do Brasil"],
    [`${year}-10-12`, "Nossa Senhora Aparecida"],
    [`${year}-11-02`, "Finados"],
    [`${year}-11-15`, "Proclamação da República"],
    ...(year >= 2024 ? [[`${year}-11-20`, "Dia Nacional de Zumbi e da Consciência Negra"]] : []),
    [`${year}-12-25`, "Natal"],
  ].map(([date, name]) => ({ date, name, optional: false }));
  if (optional) list.push(
    { date: addDays(e, -48), name: "Carnaval (segunda)", optional: true },
    { date: addDays(e, -47), name: "Carnaval (terça)", optional: true },
    { date: addDays(e, 60), name: "Corpus Christi", optional: true },
  );
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

// ------------------------------------------------------------------ horário comercial
/**
 * Horário de atendimento semanal: { "1": [["08:00","12:00"],["13:00","18:00"]], ..., "6": [] } (0 = domingo).
 * Exceções por data: { "2026-12-24": [["08:00","12:00"]], "2026-12-31": [] } ([] = fechado).
 */
export function validateIntervals(list, path = "") {
  const errors = [];
  if (!Array.isArray(list)) return [{ path, message: "Lista de horários inválida" }];
  const parsed = [];
  list.forEach((iv, i) => {
    const ok = Array.isArray(iv) && iv.length === 2 && iv.every((x) => /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(x));
    if (!ok) return errors.push({ path: `${path}.${i}`, message: "Use HH:mm" });
    const [a, b] = iv.map(hmToMin);
    if (a >= b) return errors.push({ path: `${path}.${i}`, message: "O fim precisa ser depois do início" });
    parsed.push([a, b, i]);
  });
  parsed.sort((x, y) => x[0] - y[0]).forEach((iv, k, arr) => {
    if (k && iv[0] < arr[k - 1][1]) errors.push({ path: `${path}.${iv[2]}`, message: "Horários se sobrepõem" });
  });
  return errors;
}
export function validateWeekly(weekly) {
  if (!weekly || typeof weekly !== "object") return [{ path: "weekly", message: "Disponibilidade inválida" }];
  return Object.entries(weekly).flatMap(([k, v]) => (/^[0-6]$/.test(k) ? validateIntervals(v, `weekly.${k}`) : [{ path: `weekly.${k}`, message: "Dia inválido" }]));
}


/**
 * Calendário: { timeZone, weekly, overrides?: { ymd: intervals }, holidays?: Set|array de "YYYY-MM-DD", alwaysOpen?: boolean }
 * Janelas de atendimento de uma data local, em ms UTC: exceção > feriado > semana.
 */
function windowsOf(cal, ymd) {
  const ov = cal.overrides?.[ymd];
  const hol = cal.holidays instanceof Set ? cal.holidays : new Set(cal.holidays ?? []);
  const list = ov !== undefined ? ov : hol.has(ymd) ? [] : cal.weekly?.[String(dowOf(ymd))] ?? [];
  return list
    .map(([a, b]) => [zonedToUtc(ymd, a, cal.timeZone), b === "24:00" ? zonedToUtc(addDays(ymd, 1), "00:00", cal.timeZone) : zonedToUtc(ymd, b, cal.timeZone)])
    .sort((x, y) => x[0] - y[0]);
}
const hasAnyHours = (cal) => Object.values(cal.weekly ?? {}).some((l) => l?.length) || Object.values(cal.overrides ?? {}).some((l) => l?.length);

/** Instante (ISO) depois de `minutes` minutos de atendimento a partir de `start`. Fora do horário, a contagem começa na próxima abertura. */
export function addBusinessMinutes(start, minutes, cal) {
  const s = toMs(start);
  if (cal.alwaysOpen) return new Date(s + minutes * MIN).toISOString();
  if (minutes <= 0) return new Date(s).toISOString();
  if (!hasAnyHours(cal)) throw new Error("Calendário sem nenhum horário de atendimento");
  let remaining = minutes * MIN;
  let ymd = localOf(s - DAY, cal.timeZone).ymd;
  for (let i = 0; i < 1100; i++, ymd = addDays(ymd, 1)) {
    for (const [ws, we] of windowsOf(cal, ymd)) {
      if (we <= s) continue;
      const from = Math.max(ws, s), avail = we - from;
      if (remaining <= avail) return new Date(from + remaining).toISOString();
      remaining -= avail;
    }
  }
  throw new Error("Prazo além de 3 anos: confira o calendário");
}

/** Minutos de atendimento entre dois instantes (0 se b <= a). */
export function businessMinutesBetween(a, b, cal) {
  const s = toMs(a), e = toMs(b);
  if (e <= s) return 0;
  if (cal.alwaysOpen) return Math.round((e - s) / MIN);
  let total = 0;
  for (let ymd = localOf(s - DAY, cal.timeZone).ymd, end = localOf(e + DAY, cal.timeZone).ymd; ymd <= end; ymd = addDays(ymd, 1)) {
    for (const [ws, we] of windowsOf(cal, ymd)) total += Math.max(0, Math.min(we, e) - Math.max(ws, s));
  }
  return Math.round(total / MIN);
}

/** Está dentro do horário de atendimento agora? */
export function isOpenAt(instant, cal) {
  if (cal.alwaysOpen) return true;
  const t = toMs(instant), ymd = localOf(t, cal.timeZone).ymd;
  return [addDays(ymd, -1), ymd].some((d) => windowsOf(cal, d).some(([ws, we]) => t >= ws && t < we));
}

// ------------------------------------------------------------------ SLA
export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
/** Metas padrão em minutos de atendimento (URGENT conta 24 h por dia). */
export const DEFAULT_SLA = {
  URGENT: { firstResponse: 30, resolution: 240, calendar: "24x7" },
  HIGH: { firstResponse: 60, resolution: 600, calendar: "business" },
  NORMAL: { firstResponse: 240, resolution: 1800, calendar: "business" },
  LOW: { firstResponse: 600, resolution: 3000, calendar: "business" },
};

export function validateSlaPolicy(policy) {
  const errors = [];
  for (const p of PRIORITIES) {
    const t = policy?.[p];
    if (t == null) continue;
    for (const k of ["firstResponse", "resolution"]) {
      if (t[k] != null && !(Number.isInteger(t[k]) && t[k] >= 1 && t[k] <= 60 * 24 * 90)) errors.push({ path: `${p}.${k}`, message: "De 1 minuto a 90 dias" });
    }
    if (t.firstResponse && t.resolution && t.resolution < t.firstResponse) errors.push({ path: `${p}.resolution`, message: "A solução não pode vencer antes da primeira resposta" });
    if (t.calendar && !["business", "24x7"].includes(t.calendar)) errors.push({ path: `${p}.calendar`, message: "Use horário comercial ou 24 h" });
  }
  return errors;
}

const calFor = (target, cal) => (target?.calendar === "24x7" ? { alwaysOpen: true } : cal);

/** Prazos de um chamado novo: { firstResponseDueAt, resolutionDueAt } (null quando a política não tem a meta). */
export function slaDueDates({ createdAt, priority, policy = DEFAULT_SLA, cal }) {
  const t = policy?.[priority];
  const due = (min) => (min ? addBusinessMinutes(createdAt, min, calFor(t, cal)) : null);
  return { firstResponseDueAt: due(t?.firstResponse), resolutionDueAt: due(t?.resolution) };
}

/**
 * Situação de uma meta: none | ok | warning | breached | achieved | missed | paused.
 * warning quando faltam até `warnMinutes` (padrão 30) ou menos de 20% do prazo total (com `startedAt`).
 */
export function slaState({ dueAt, doneAt, now = Date.now(), pausedAt, startedAt, warnMinutes = 30 }) {
  if (!dueAt) return "none";
  const due = toMs(dueAt);
  if (doneAt) return toMs(doneAt) <= due ? "achieved" : "missed";
  if (pausedAt) return toMs(pausedAt) > due ? "breached" : "paused";
  const n = toMs(now);
  if (n > due) return "breached";
  const left = due - n;
  const fifth = startedAt ? (due - toMs(startedAt)) * 0.2 : 0;
  return left <= warnMinutes * MIN || left <= fifth ? "warning" : "ok";
}

/** Ao pausar (chamado "aguardando cliente"): minutos de atendimento que restavam, ou null se já tinha estourado. */
export function slaPause(dueAt, pausedAt, cal) {
  if (!dueAt || toMs(pausedAt) > toMs(dueAt)) return null;
  return businessMinutesBetween(pausedAt, dueAt, cal);
}
/** Ao retomar: novo prazo a partir de agora com o que restava; estourado continua com o prazo original. */
export function slaResume({ remainingMinutes, originalDueAt, now = Date.now(), cal }) {
  if (remainingMinutes == null) return originalDueAt ?? null;
  return addBusinessMinutes(now, remainingMinutes, cal);
}

// ------------------------------------------------------------------ estados do chamado
export const STATUSES = ["OPEN", "PENDING", "ON_HOLD", "SOLVED", "CLOSED"];
export const STATUS_LABEL = { OPEN: "Aberto", PENDING: "Aguardando cliente", ON_HOLD: "Em espera", SOLVED: "Resolvido", CLOSED: "Fechado" };
export const PRIORITY_LABEL = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente" };
export const CHANNELS = ["EMAIL", "PORTAL", "WIDGET", "API", "INTERNAL", "PHONE", "WHATSAPP"];
/** Situações em que o prazo de solução fica pausado (a bola está com o cliente). */
export const SLA_PAUSED_STATUSES = ["PENDING"];

/** A equipe pode mudar de `from` para `to`? Fechado é definitivo e só o sistema fecha (a partir de Resolvido). */
export function canSetStatus(from, to, { system = false } = {}) {
  if (!STATUSES.includes(to) || from === to) return from === to;
  if (from === "CLOSED") return false;
  if (to === "CLOSED") return system && from === "SOLVED";
  return true;
}

/** Cliente respondeu: volta para Aberto; em chamado fechado, abre um chamado novo ligado ao antigo. */
export function onCustomerReply(status) {
  if (status === "CLOSED") return { status: "CLOSED", followUp: true, reopened: false };
  return { status: "OPEN", followUp: false, reopened: status === "SOLVED" };
}

/** Resposta pública da equipe: usa o status escolhido no botão; padrão "Aguardando cliente" (exceto Em espera). */
export function onAgentReply(status, chosen) {
  if (chosen) return chosen;
  return status === "ON_HOLD" ? "ON_HOLD" : "PENDING";
}

export const autoCloseAt = (solvedAt, days = 4) => new Date(toMs(solvedAt) + days * DAY).toISOString();

// ------------------------------------------------------------------ e-mail
export const normalizeEmail = (e) => String(e ?? "").trim().toLowerCase();
export const isValidEmail = (e) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z0-9-]{2,}$/i.test(String(e ?? "").trim());

/** "Ana Souza <Ana@X.com>" → { name: "Ana Souza", email: "ana@x.com" } (null se inválido). */
export function parseAddress(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*<([^<>]+)>\s*$/);
  const email = normalizeEmail(m ? m[2] : s.replace(/^mailto:/i, ""));
  if (!isValidEmail(email)) return null;
  let name = m ? m[1].trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim() : "";
  if (name === email) name = "";
  return { name, email };
}

/** Lista de endereços separados por vírgula ou ponto e vírgula, respeitando aspas e <...>; sem repetidos. */
export function parseAddressList(raw) {
  const out = [], seen = new Set();
  let cur = "", q = false, angle = false;
  const flush = () => { const a = parseAddress(cur); if (a && !seen.has(a.email)) { seen.add(a.email); out.push(a); } cur = ""; };
  for (const ch of String(raw ?? "")) {
    if (ch === '"') q = !q;
    else if (ch === "<") angle = true;
    else if (ch === ">") angle = false;
    if ((ch === "," || ch === ";") && !q && !angle) { flush(); continue; }
    cur += ch;
  }
  flush();
  return out;
}

const SUBJECT_PREFIX = /^\s*(re|res|resp|fw|fwd|enc|rv|tr|aw|wg|sv)\s*(\[\d+\]|\(\d+\))?\s*:\s*/i;
/** Assunto sem "Re:", "RES:", "Fwd:", "ENC:"… e sem a marca [#123]. */
export function normalizeSubject(subject) {
  let s = String(subject ?? "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 10 && SUBJECT_PREFIX.test(s); i++) s = s.replace(SUBJECT_PREFIX, "");
  return s.replace(/\s*\[#\d{1,9}\]\s*/g, " ").replace(/\s+/g, " ").trim();
}
/** Número do chamado na marca [#123] do assunto (a última, se houver mais de uma). */
export function extractTicketNumber(subject) {
  const all = [...String(subject ?? "").matchAll(/\[#(\d{1,9})\]/g)];
  return all.length ? Number(all[all.length - 1][1]) : null;
}
/** Assunto dos e-mails que saem: "Problema no boleto [#123]". */
export const ticketSubject = (subject, number) => `${normalizeSubject(subject) || "(sem assunto)"} [#${number}]`;

/** Ids de um cabeçalho References/In-Reply-To: ["<a@b>", "<c@d>"]. */
export function parseReferences(header) {
  return [...String(header ?? "").matchAll(/<[^<>\s]+>/g)].map((m) => m[0]);
}
/** Message-ID dos e-mails que saem (guardado na mensagem para casar as respostas). */
export const messageIdFor = ({ ticketId, messageId, domain }) => `<hd.${ticketId}.${messageId}@${domain}>`;

/**
 * A que chamado pertence um e-mail recebido?
 * 1) In-Reply-To / References que batem com um Message-ID guardado (da mesma caixa/empresa);
 * 2) marca [#123] no assunto **e** remetente entre os participantes do chamado.
 * Senão, null (vira chamado novo). Nunca casa só pelo número: qualquer um poderia escrever num chamado alheio.
 * index: { messageIds: Map<messageId, ticketId>, byNumber: Map<number, { id, participants: string[] }> }
 */
export function matchThread({ inReplyTo, references, subject, from }, index) {
  const ids = [...parseReferences(inReplyTo), ...parseReferences(references).reverse()];
  for (const id of ids) {
    const t = index.messageIds?.get(id);
    if (t) return { ticketId: t, by: "header" };
  }
  const n = extractTicketNumber(subject);
  const sender = normalizeEmail(parseAddress(from)?.email ?? from);
  const t = n != null ? index.byNumber?.get(n) : null;
  if (t && t.participants.map(normalizeEmail).includes(sender)) return { ticketId: t.id, by: "subject" };
  return null;
}

const QUOTE_HEADERS = [
  /^(em|no dia)\s.{4,240}\s(escreveu|escribió)\s*:\s*$/i,
  /^on\s.{4,240}\swrote\s*:\s*$/i,
  /^-{2,}\s*(mensagem original|original message|mensaje original)\s*-{2,}\s*$/i,
  /^_{10,}\s*$/,
  /^(enviado do meu|sent from my|enviado de meu)\s.{0,40}$/i,
];
/** Texto novo de uma resposta por e-mail, sem a mensagem citada (Gmail, Outlook, Apple Mail, em português e inglês). */
export function stripQuotedReply(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim(), two = `${l} ${(lines[i + 1] ?? "").trim()}`.trim();
    if (QUOTE_HEADERS.some((r) => r.test(l))) { cut = i; break; }
    if (QUOTE_HEADERS.slice(0, 2).some((r) => r.test(two))) { cut = i; break; }
    if (/^(de|from)\s*:\s*\S/i.test(l) && lines.slice(i + 1, i + 5).some((x) => /^(enviado|sent|data|date|para|to|assunto|subject)\s*:/i.test(x.trim()))) { cut = i; break; }
    if (/^>/.test(l) && lines.slice(i).every((x) => !x.trim() || /^>/.test(x.trim()))) { cut = i; break; }
  }
  const out = lines.slice(0, cut).join("\n").trim();
  return out || String(text ?? "").trim();
}

/** Resposta automática, lista ou devolução? Nesses casos não mandamos confirmação (evita loop de e-mails). */
export function isAutoReply({ headers = {}, subject = "", from = "" } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v ?? "").toLowerCase()]));
  const sender = normalizeEmail(parseAddress(from)?.email ?? from);
  const bounce = /^(mailer-daemon|postmaster)@/.test(sender) || /^(undeliverable|undelivered|delivery status notification|mail delivery (failed|subsystem)|n[aã]o foi poss[ií]vel entregar|falha na entrega)/i.test(subject) || h["return-path"] === "<>";
  if (bounce) return { auto: true, bounce: true, reason: "devolução" };
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return { auto: true, bounce: false, reason: "auto-submitted" };
  if (["x-autoreply", "x-autorespond", "x-autoresponder"].some((k) => k in h)) return { auto: true, bounce: false, reason: "x-autoreply" };
  if (/^(bulk|junk|list|auto_reply)$/.test(h.precedence ?? "")) return { auto: true, bounce: false, reason: "precedence" };
  if (/\b(all|oof|autoreply)\b/.test(h["x-auto-response-suppress"] ?? "")) return { auto: true, bounce: false, reason: "x-auto-response-suppress" };
  if ("list-id" in h || "list-unsubscribe" in h) return { auto: true, bounce: false, reason: "lista" };
  if (/^(resposta autom[aá]tica|automatic reply|auto(-|\s)?reply|out of office|ausente|fora do escrit[oó]rio|estou de f[eé]rias)/i.test(String(subject).replace(SUBJECT_PREFIX, ""))) return { auto: true, bounce: false, reason: "assunto" };
  return { auto: false, bounce: false, reason: null };
}

/** Mandar a confirmação "recebemos seu chamado"? Não para respostas automáticas, nossos próprios endereços nem mais de 3 por hora ao mesmo remetente. */
export function shouldAutoAck({ auto, fromEmail, ownAddresses = [], acksLastHour = 0 }) {
  const f = normalizeEmail(fromEmail);
  return !auto && !!f && !ownAddresses.map(normalizeEmail).includes(f) && acksLastHour < 3;
}

// ------------------------------------------------------------------ distribuição
/**
 * Escolhe quem recebe o chamado entre os atendentes da fila.
 * candidates: [{ id, available, openCount, maxOpen?, lastAssignedAt? }] na ordem de prioridade
 * method: "round_robin" (quem recebeu há mais tempo) | "load" (quem tem menos abertos)
 */
export function pickAgent(candidates, { method = "round_robin" } = {}) {
  const ok = candidates.map((c, i) => ({ ...c, i })).filter((c) => c.available && (c.maxOpen == null || (c.openCount ?? 0) < c.maxOpen));
  const last = (c) => (c.lastAssignedAt ? toMs(c.lastAssignedAt) : -Infinity);
  ok.sort((a, b) => method === "load"
    ? (a.openCount ?? 0) - (b.openCount ?? 0) || last(a) - last(b) || a.i - b.i
    : last(a) - last(b) || a.i - b.i);
  return ok[0]?.id ?? null;
}

// ------------------------------------------------------------------ gatilhos (regras automáticas)
export const fold = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const RULE_FIELDS = {
  status: "enum", priority: "enum", channel: "enum", queueId: "id", assigneeId: "id",
  subject: "text", description: "text", requesterEmail: "text", requesterDomain: "text", tags: "tags", businessHours: "bool",
};
const RULE_OPS = {
  enum: ["is", "is_not", "in", "not_in", "changed", "changed_to"], id: ["is", "is_not", "is_empty", "is_set", "changed", "changed_to"],
  text: ["is", "contains", "not_contains", "starts_with", "ends_with"], tags: ["includes", "not_includes"], bool: ["is"],
};
const RULE_ACTIONS = ["set_status", "set_priority", "set_queue", "assign", "add_tags", "remove_tags", "notify", "add_note"];

/** Regra: { name, active, on: ["created"|"updated"], conditions: { all: [...], any: [...] }, actions: [{ type, value }] } */
export function validateRule(rule) {
  const errors = [];
  if (!String(rule?.name ?? "").trim()) errors.push({ path: "name", message: "Dê um nome à regra" });
  if (!Array.isArray(rule?.on) || !rule.on.length || rule.on.some((e) => !["created", "updated"].includes(e))) errors.push({ path: "on", message: "Escolha quando a regra roda" });
  for (const group of ["all", "any"]) {
    (rule?.conditions?.[group] ?? []).forEach((c, i) => {
      const kind = RULE_FIELDS[c?.field];
      if (!kind) errors.push({ path: `conditions.${group}.${i}.field`, message: "Campo inválido" });
      else if (!RULE_OPS[kind].includes(c.op)) errors.push({ path: `conditions.${group}.${i}.op`, message: "Comparação inválida para o campo" });
    });
  }
  if (!Array.isArray(rule?.actions) || !rule.actions.length) errors.push({ path: "actions", message: "Inclua pelo menos uma ação" });
  (rule?.actions ?? []).forEach((a, i) => {
    if (!RULE_ACTIONS.includes(a?.type)) errors.push({ path: `actions.${i}.type`, message: "Ação inválida" });
    if (a?.type === "set_status" && !STATUSES.slice(0, 4).includes(a.value)) errors.push({ path: `actions.${i}.value`, message: "Status inválido" });
    if (a?.type === "set_priority" && !PRIORITIES.includes(a.value)) errors.push({ path: `actions.${i}.value`, message: "Prioridade inválida" });
  });
  return errors;
}

function fieldValue(t, field) {
  if (field === "requesterDomain") return normalizeEmail(t.requesterEmail).split("@")[1] ?? "";
  return t[field];
}
export function evalCondition(c, ticket, previous) {
  const v = fieldValue(ticket, c.field), pv = previous ? fieldValue(previous, c.field) : undefined;
  const list = Array.isArray(c.value) ? c.value : [c.value];
  switch (c.op) {
    case "is": return RULE_FIELDS[c.field] === "text" ? fold(v) === fold(c.value) : v === c.value;
    case "is_not": return v !== c.value;
    case "in": return list.includes(v);
    case "not_in": return !list.includes(v);
    case "is_empty": return v == null || v === "";
    case "is_set": return !(v == null || v === "");
    case "changed": return !!previous && v !== pv;
    case "changed_to": return !!previous && v !== pv && v === c.value;
    case "contains": return list.some((x) => fold(v).includes(fold(x)));
    case "not_contains": return !list.some((x) => fold(v).includes(fold(x)));
    case "starts_with": return fold(v).startsWith(fold(c.value));
    case "ends_with": return fold(v).endsWith(fold(c.value));
    case "includes": return list.some((x) => (v ?? []).map(fold).includes(fold(x)));
    case "not_includes": return !list.some((x) => (v ?? []).map(fold).includes(fold(x)));
    default: return false;
  }
}
export function matchRule(rule, { event, ticket, previous }) {
  if (!rule.active || !rule.on.includes(event)) return false;
  const all = rule.conditions?.all ?? [], any = rule.conditions?.any ?? [];
  return all.every((c) => evalCondition(c, ticket, previous)) && (!any.length || any.some((c) => evalCondition(c, ticket, previous)));
}
/** Aplica as ações: devolve o chamado novo e os efeitos (avisos, notas, distribuição) para o service executar. */
export function applyActions(ticket, actions) {
  const t = { ...ticket, tags: [...(ticket.tags ?? [])] }, effects = [];
  for (const a of actions) {
    if (a.type === "set_status") t.status = a.value;
    else if (a.type === "set_priority") t.priority = a.value;
    else if (a.type === "set_queue") t.queueId = a.value;
    else if (a.type === "assign") { if (a.value === "round_robin" || a.value === "load") effects.push({ type: "auto_assign", method: a.value }); else t.assigneeId = a.value; }
    else if (a.type === "add_tags") for (const x of [].concat(a.value)) { const tag = slugify(x, 40); if (tag && !t.tags.includes(tag)) t.tags.push(tag); }
    else if (a.type === "remove_tags") { const rm = new Set([].concat(a.value).map((x) => slugify(x, 40))); t.tags = t.tags.filter((x) => !rm.has(x)); }
    else if (a.type === "notify" || a.type === "add_note") effects.push({ type: a.type, ...a });
  }
  return { ticket: t, effects };
}
/**
 * Roda os gatilhos em ordem; cada regra dispara no máximo uma vez por evento. Depois de uma rodada com
 * mudança, as regras que ainda não dispararam são avaliadas de novo (até 3 rodadas), como no Zendesk.
 */
export function runRules(rules, { event, ticket, previous }, { maxPasses = 3 } = {}) {
  let cur = ticket; const fired = new Set(), effects = [];
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const r of rules) {
      if (fired.has(r.id) || !matchRule(r, { event, ticket: cur, previous })) continue;
      const out = applyActions(cur, r.actions);
      fired.add(r.id); effects.push(...out.effects.map((e) => ({ ...e, ruleId: r.id })));
      if (JSON.stringify(out.ticket) !== JSON.stringify(cur)) changed = true;
      cur = out.ticket;
    }
    if (!changed) break;
  }
  return { ticket: cur, effects, fired: [...fired] };
}

// ------------------------------------------------------------------ macros e textos
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const firstName = (n) => String(n ?? "").trim().split(/\s+/)[0] ?? "";
/** Variáveis disponíveis no editor de macros e e-mails. */
export const TEMPLATE_VARS = ["chamado.numero", "chamado.assunto", "chamado.status", "chamado.link", "cliente.nome", "cliente.primeiro_nome", "cliente.email", "agente.nome", "agente.primeiro_nome", "empresa.nome"];
export function templateContext({ ticket = {}, requester = {}, agent = {}, organization = {}, ticketUrl = "" }) {
  return {
    chamado: { numero: ticket.number != null ? formatTicketNumber(ticket.number) : "", assunto: ticket.subject ?? "", status: STATUS_LABEL[ticket.status] ?? "", link: ticketUrl },
    cliente: { nome: requester.name || requester.email || "", primeiro_nome: firstName(requester.name) || "", email: requester.email ?? "" },
    agente: { nome: agent.name ?? "", primeiro_nome: firstName(agent.name) },
    empresa: { nome: organization.name ?? "" },
  };
}
/** "Olá {{cliente.primeiro_nome}}" → "Olá Ana". Variável desconhecida vira vazio; em HTML, valores escapados. */
export function renderTemplate(tpl, ctx, { html = false } = {}) {
  return String(tpl ?? "").replace(/\{\{\s*([a-z_]+(?:\.[a-z_]+)*)\s*\}\}/gi, (_, path) => {
    const v = path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx);
    return v == null ? "" : html ? esc(v) : String(v);
  });
}

// ------------------------------------------------------------------ números, relatórios e CSAT
export const formatTicketNumber = (n) => `#${n}`;
export function csatSummary(ratings) {
  const good = ratings.filter((r) => (r.rating ?? r) === "GOOD").length, bad = ratings.filter((r) => (r.rating ?? r) === "BAD").length;
  const total = good + bad;
  return { good, bad, total, score: total ? Math.round((good / total) * 100) : null };
}
export function percentile(values, p) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = (v.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
  return Math.round((v[lo] + (v[hi] - v[lo]) * (idx - lo)) * 100) / 100;
}
export const median = (values) => percentile(values, 0.5);
/** 45 → "45 min"; 135 → "2 h 15 min"; 3000 → "2 d 2 h". */
export function formatDuration(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; }
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

// ------------------------------------------------------------------ base de conhecimento
export function slugify(s, max = 60) {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
}
export const isValidSlug = (s) => /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(String(s ?? ""));
/** Trecho do texto em volta do primeiro termo da busca (sem diferenciar acento), com reticências. */
export function excerpt(text, query, max = 180) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const ft = fold(t), terms = fold(query).split(/\s+/).filter((x) => x.length >= 2);
  const pos = terms.map((x) => ft.indexOf(x)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  let start = Math.max(0, pos - Math.floor(max / 3));
  if (start > 0) { const sp = t.indexOf(" ", start); start = sp >= 0 && sp < pos ? sp + 1 : start; }
  let end = Math.min(t.length, start + max);
  if (end < t.length) { const sp = t.lastIndexOf(" ", end); end = sp > start ? sp : end; }
  return `${start > 0 ? "…" : ""}${t.slice(start, end)}${end < t.length ? "…" : ""}`;
}
export const readingMinutes = (text) => Math.max(1, Math.ceil(String(text ?? "").trim().split(/\s+/).filter(Boolean).length / 200));

// ------------------------------------------------------------------ tokens e chaves
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t) => createHash("sha256").update(String(t)).digest("hex");
/** Chave da API pública de chamados: mostrada uma vez; o banco guarda o hash e o prefixo. */
export const newApiKey = () => `hd_${randomBytes(24).toString("base64url")}`;
export const apiKeyPrefix = (k) => String(k).slice(0, 10);
