// rodsaas · agenda — regras puras do agendamento (sem banco, sem rede).
// O coração é computeSlots: horários livres a partir da disponibilidade semanal, exceções, feriados,
// compromissos existentes (com intervalos), antecedência, janela, limite por dia, equipe e turmas,
// tudo com fuso horário correto (inclusive horário de verão de outros países).
// Porte para TypeScript em api/src/modules/agenda/lib/ (e o que o front usar), junto com os testes de
// agenda-lib.test.mjs. Rode: node --test agenda-lib.test.mjs

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

// ------------------------------------------------------------------ disponibilidade
/**
 * Disponibilidade semanal: { "1": [["09:00","12:00"],["14:00","18:00"]], ..., "6": [] } (0 = domingo).
 * Exceções por data: { "2026-12-24": [["09:00","12:00"]], "2026-12-25": [] } ([] = folga).
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

/** Janelas locais (minutos) de uma pessoa numa data local: exceção > feriado > semana. */
export function windowsFor(host, ymd, holidays) {
  const ov = host.overrides?.[ymd];
  const list = ov !== undefined ? ov : holidays?.has?.(ymd) ? [] : host.weekly?.[String(dowOf(ymd))] ?? [];
  return list.map(([a, b]) => [hmToMin(a), b === "24:00" ? 1440 : hmToMin(b)]).sort((x, y) => x[0] - y[0]);
}

// ------------------------------------------------------------------ motor de horários
/**
 * Horários livres.
 * opts:
 *  now, from, to ("YYYY-MM-DD" no fuso de exibição), displayTimeZone
 *  durationMin, slotIntervalMin (padrão = duração), bufferBeforeMin, bufferAfterMin,
 *  minNoticeMin, maxDaysAhead (dias corridos a partir de hoje no fuso da pessoa), maxPerDay (por pessoa, por dia local)
 *  capacity (1 = individual; >1 = turma), eventTypeId
 *  mode: 'one' | 'any' (qualquer um da equipe) | 'all' (todos juntos)
 *  hosts: [{ id, timeZone, weekly, overrides, busy: [{ start, end, eventTypeId?, seats? }], dayCounts: { ymd: n } }]
 *     busy já vem com os intervalos (buffers) dos compromissos existentes e os ocupados das agendas externas
 *  holidays: Set/array de "YYYY-MM-DD" (datas locais de cada pessoa)
 * Devolve { slots: [{ start, end, hostIds, seatsLeft }], byDay: { ymdExibição: slots[] } } com start/end em ISO UTC.
 */
export function computeSlots(opts) {
  const now = toMs(opts.now ?? Date.now());
  const dur = opts.durationMin * MIN;
  const step = (opts.slotIntervalMin ?? opts.durationMin);
  const bb = (opts.bufferBeforeMin ?? 0) * MIN, ba = (opts.bufferAfterMin ?? 0) * MIN;
  const capacity = opts.capacity ?? 1;
  const holidays = opts.holidays instanceof Set ? opts.holidays : new Set(opts.holidays ?? []);
  const tzView = opts.displayTimeZone;
  const rangeStart = zonedToUtc(opts.from, "00:00", tzView);
  const rangeEnd = zonedToUtc(addDays(opts.to, 1), "00:00", tzView);
  const earliest = now + (opts.minNoticeMin ?? 0) * MIN;
  const mode = opts.mode ?? "one";
  const perHost = new Map();

  for (const host of opts.hosts) {
    const tz = host.timeZone;
    const lastDay = addDays(localOf(now, tz).ymd, opts.maxDaysAhead ?? 60);
    const busy = (host.busy ?? []).map((b) => ({ ...b, s: toMs(b.start), e: toMs(b.end) }));
    const found = new Map();
    let ymd = localOf(rangeStart - DAY, tz).ymd;
    const endYmd = localOf(rangeEnd + DAY, tz).ymd;
    for (; ymd <= endYmd; ymd = addDays(ymd, 1)) {
      if (ymd > lastDay) break;
      if (opts.maxPerDay && (host.dayCounts?.[ymd] ?? 0) >= opts.maxPerDay) continue;   // dia já lotado para esta pessoa
      for (const [ws, we] of windowsFor(host, ymd, holidays)) {
        const weUtc = we >= 1440 ? zonedToUtc(addDays(ymd, 1), "00:00", tz) : zonedToUtc(ymd, minToHm(we), tz);
        for (let m = Math.ceil(ws / step) * step; m < we; m += step) {
          const start = zonedToUtc(ymd, minToHm(m), tz);
          if (localOf(start, tz).hm !== minToHm(m)) continue;          // horário pulado pelo horário de verão
          const end = start + dur;
          if (end > weUtc || start < earliest || start < rangeStart || start >= rangeEnd) continue;
          const bs = start - bb, be = end + ba;
          let conflict = false, taken = 0;
          for (const b of busy) {
            if (!(bs < b.e && be > b.s)) continue;
            if (capacity > 1 && b.eventTypeId === opts.eventTypeId && b.s === start && b.e === end) { taken += b.seats ?? 1; continue; }
            conflict = true;
            break;
          }
          if (conflict || taken >= capacity) continue;
          found.set(start, { end, seatsLeft: capacity - taken });
        }
      }
    }
    perHost.set(host.id, found);
  }

  const merged = new Map();
  const hostIds = opts.hosts.map((h) => h.id);
  if (mode === "all") {
    const [first, ...rest] = hostIds.map((id) => perHost.get(id));
    for (const [start, v] of first ?? []) {
      if (rest.every((m) => m.has(start))) merged.set(start, { end: v.end, hostIds: [...hostIds], seatsLeft: Math.min(v.seatsLeft, ...rest.map((m) => m.get(start).seatsLeft)) });
    }
  } else {
    for (const id of mode === "one" ? hostIds.slice(0, 1) : hostIds) {
      for (const [start, v] of perHost.get(id)) {
        const cur = merged.get(start);
        if (cur) { cur.hostIds.push(id); cur.seatsLeft = Math.max(cur.seatsLeft, v.seatsLeft); }
        else merged.set(start, { end: v.end, hostIds: [id], seatsLeft: v.seatsLeft });
      }
    }
  }
  const slots = [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([s, v]) => ({ start: new Date(s).toISOString(), end: new Date(v.end).toISOString(), hostIds: v.hostIds, seatsLeft: v.seatsLeft }));
  const byDay = {};
  for (const sl of slots) (byDay[localOf(sl.start, tzView).ymd] ??= []).push(sl);
  return { slots, byDay };
}

/** Confere se um horário escolhido ainda é válido (antes de gravar) usando o mesmo motor. */
export function isSlotAvailable(opts, startIso, hostId) {
  const tz = opts.displayTimeZone;
  const day = localOf(startIso, tz).ymd;
  const { slots } = computeSlots({ ...opts, from: addDays(day, -1), to: addDays(day, 1) });
  const s = slots.find((x) => x.start === new Date(toMs(startIso)).toISOString());
  return !!s && (!hostId || s.hostIds.includes(hostId));
}

/**
 * Rodízio ("qualquer um da equipe"): quem tem menos agendamentos no período; empate → o que recebeu há mais
 * tempo; empate → ordem da lista (prioridade).
 * stats: { [hostId]: { count, lastAt } }
 */
export function pickHost(candidateIds, stats = {}, order = candidateIds) {
  return [...candidateIds].sort((a, b) => {
    const sa = stats[a] ?? { count: 0, lastAt: null }, sb = stats[b] ?? { count: 0, lastAt: null };
    if (sa.count !== sb.count) return sa.count - sb.count;
    const la = sa.lastAt ? toMs(sa.lastAt) : -Infinity, lb = sb.lastAt ? toMs(sb.lastAt) : -Infinity;
    if (la !== lb) return la - lb;
    return order.indexOf(a) - order.indexOf(b);
  })[0] ?? null;
}

/** Intervalo bloqueado de um compromisso (o que vai na trava do banco): início − intervalo antes até fim + intervalo depois. */
export const blockRange = (start, end, bufferBeforeMin = 0, bufferAfterMin = 0) => ({
  blockStart: new Date(toMs(start) - bufferBeforeMin * MIN).toISOString(),
  blockEnd: new Date(toMs(end) + bufferAfterMin * MIN).toISOString(),
});

// ------------------------------------------------------------------ configuração do tipo
export function validateEventTypeConfig(c) {
  const errors = [];
  const chk = (ok, path, message) => { if (!ok) errors.push({ path, message }); };
  const int = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  chk(Array.isArray(c.durations) && c.durations.length >= 1 && c.durations.length <= 6 && c.durations.every((d) => int(d, 5, 720)), "durations", "Durações de 5 min a 12 h (até 6 opções)");
  chk(c.slotIntervalMin === undefined || int(c.slotIntervalMin, 5, 240), "slotIntervalMin", "Intervalo entre horários de 5 a 240 min");
  chk(int(c.bufferBeforeMin ?? 0, 0, 240), "bufferBeforeMin", "Intervalo antes de 0 a 240 min");
  chk(int(c.bufferAfterMin ?? 0, 0, 240), "bufferAfterMin", "Intervalo depois de 0 a 240 min");
  chk(int(c.minNoticeMin ?? 0, 0, 43200), "minNoticeMin", "Antecedência mínima de até 30 dias");
  chk(int(c.maxDaysAhead ?? 60, 1, 730), "maxDaysAhead", "Janela de 1 a 730 dias");
  chk(c.maxPerDay == null || int(c.maxPerDay, 1, 100), "maxPerDay", "Máximo por dia de 1 a 100");
  chk(int(c.capacity ?? 1, 1, 500), "capacity", "Vagas de 1 a 500");
  chk(["one", "any", "all", "client"].includes(c.assignment ?? "one"), "assignment", "Forma de atendimento inválida");
  if ((c.capacity ?? 1) > 1) chk((c.assignment ?? "one") !== "any", "capacity", "Turma não usa rodízio (escolha uma pessoa ou todos juntos)");
  return errors;
}

// ------------------------------------------------------------------ cancelamento, remarcação, lembretes
/** Pode cancelar/remarcar pelo link do cliente? { ok, reason } */
export function canChange({ start, status }, now, minHoursBefore = 0) {
  if (!["CONFIRMED", "PENDING"].includes(status)) return { ok: false, reason: "Este agendamento não pode mais ser alterado" };
  if (toMs(start) <= toMs(now)) return { ok: false, reason: "Este horário já passou" };
  if (toMs(start) - toMs(now) < minHoursBefore * HOUR) return { ok: false, reason: `Alterações só até ${minHoursBefore} h antes` };
  return { ok: true };
}

/** Lembretes que ainda fazem sentido: [{ offsetMin, at }] (não manda lembrete de 24 h para quem marcou 2 h antes). */
export function reminderTimes(start, offsetsMin = [1440, 60], { createdAt, now } = {}) {
  const s = toMs(start), floor = Math.max(toMs(now ?? Date.now()), createdAt ? toMs(createdAt) : 0) + MIN;
  return [...new Set(offsetsMin)].sort((a, b) => b - a).map((o) => ({ offsetMin: o, at: new Date(s - o * MIN).toISOString() })).filter((r) => toMs(r.at) > floor);
}

// ------------------------------------------------------------------ links e tokens
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t) => createHash("sha256").update(String(t)).digest("hex");

/** Sala do Jitsi Meet difícil de adivinhar: https://meet.jit.si/acme-consulta-k3x9ab2mq7pz */
export function jitsiUrl(prefix = "reuniao", rand = () => randomBytes(1)[0] / 256) {
  const base = String(prefix).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "reuniao";
  const id = Array.from({ length: 12 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(rand() * 32)]).join("");
  return `https://meet.jit.si/${base}-${id}`;
}

export function slugify(s, max = 40) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "agenda";
}
export const isValidSlug = (s) => /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(String(s ?? ""));

// ------------------------------------------------------------------ .ics (convite e feed)
const icsDate = (v) => new Date(toMs(v)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Dobra linhas em 75 bytes (RFC 5545), sem quebrar caractere acentuado no meio. */
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "", limit = 75;
  for (const ch of line) {
    if (enc.encode(cur + ch).length > limit) { out.push(cur); cur = ch; limit = 74; }
    else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}
/**
 * events: [{ uid, start, end, summary, description?, location?, url?, status?: 'CONFIRMED'|'CANCELLED'|'TENTATIVE',
 *            sequence?, organizer?: { name, email }, attendees?: [{ name, email }] }]
 * method: 'REQUEST' (convite), 'CANCEL' (cancelamento), 'PUBLISH' (feed)
 */
export function buildIcs(events, { method = "REQUEST", now = Date.now(), calName } = {}) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//rodsaas//agenda//PT-BR", "CALSCALE:GREGORIAN", `METHOD:${method}`];
  if (calName) L.push(`X-WR-CALNAME:${icsText(calName)}`);
  for (const e of events) {
    L.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${icsDate(now)}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.end)}`,
      `SEQUENCE:${e.sequence ?? 0}`, `STATUS:${e.status ?? (method === "CANCEL" ? "CANCELLED" : "CONFIRMED")}`, `SUMMARY:${icsText(e.summary)}`);
    if (e.description) L.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) L.push(`LOCATION:${icsText(e.location)}`);
    if (e.url) L.push(`URL:${e.url}`);
    if (e.organizer) L.push(`ORGANIZER;CN=${icsText(e.organizer.name)}:mailto:${e.organizer.email}`);
    for (const a of e.attendees ?? []) L.push(`ATTENDEE;CN=${icsText(a.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a.email}`);
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(foldLine).join("\r\n") + "\r\n";
}

/** Link "adicionar ao Google Agenda" (sem integração, só abre o Google com o evento preenchido). */
export function googleCalendarLink({ start, end, summary, description, location }) {
  const q = new URLSearchParams({ action: "TEMPLATE", text: summary, dates: `${icsDate(start)}/${icsDate(end)}` });
  if (description) q.set("details", description);
  if (location) q.set("location", location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// ------------------------------------------------------------------ exibição
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "quinta, 15 de outubro" */
export function formatDayLong(ymd) {
  const [, m, d] = ymd.split("-").map(Number);
  return `${DIAS[dowOf(ymd)]}, ${d} de ${MESES[m - 1]}`;
}
/** "quinta, 15 de outubro, 09:30 – 10:00 (horário de Brasília)" */
export function formatAppointment(start, end, timeZone) {
  const a = localOf(start, timeZone), b = localOf(end, timeZone);
  const tzName = timeZone === "America/Sao_Paulo" ? "horário de Brasília" : timeZone.replace(/_/g, " ");
  return `${formatDayLong(a.ymd)}, ${a.hm} – ${b.hm} (${tzName})`;
}
