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
 *  resources (opcional): grupo de recursos de que o tipo precisa — basta UM livre (cadeira, sala, equipamento):
 *     [{ id, busy: [{ start, end, eventTypeId?, seats? }] }]; lista vazia = nenhum horário (o tipo exige recurso e não há)
 * Devolve { slots: [{ start, end, hostIds, seatsLeft, resourceIds? }], byDay: { ymdExibição: slots[] } } com start/end em ISO UTC.
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
  const pool = opts.resources ? opts.resources.map((r) => ({ id: r.id, busy: (r.busy ?? []).map((b) => ({ ...b, s: toMs(b.start), e: toMs(b.end) })) })) : null;
  /** Recursos livres no intervalo [bs, be) — sessão da mesma turma não conta como ocupado. */
  const freeIn = (bs, be, start, end) => pool.filter((r) => !r.busy.some((b) => bs < b.e && be > b.s && !(capacity > 1 && b.eventTypeId === opts.eventTypeId && b.s === start && b.e === end))).map((r) => r.id);

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
          let resourceIds;
          if (pool) { resourceIds = freeIn(bs, be, start, end); if (!resourceIds.length) continue; }
          found.set(start, { end, seatsLeft: capacity - taken, resourceIds });
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
      if (rest.every((m) => m.has(start))) merged.set(start, { end: v.end, hostIds: [...hostIds], seatsLeft: Math.min(v.seatsLeft, ...rest.map((m) => m.get(start).seatsLeft)), resourceIds: v.resourceIds });
    }
  } else {
    for (const id of mode === "one" ? hostIds.slice(0, 1) : hostIds) {
      for (const [start, v] of perHost.get(id)) {
        const cur = merged.get(start);
        if (cur) { cur.hostIds.push(id); cur.seatsLeft = Math.max(cur.seatsLeft, v.seatsLeft); }
        else merged.set(start, { end: v.end, hostIds: [id], seatsLeft: v.seatsLeft, resourceIds: v.resourceIds });
      }
    }
  }
  const slots = [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([s, v]) => ({ start: new Date(s).toISOString(), end: new Date(v.end).toISOString(), hostIds: v.hostIds, seatsLeft: v.seatsLeft, ...(v.resourceIds ? { resourceIds: v.resourceIds } : {}) }));
  const byDay = {};
  for (const sl of slots) (byDay[localOf(sl.start, tzView).ymd] ??= []).push(sl);
  return { slots, byDay };
}

/** Confere se um horário escolhido ainda é válido (antes de gravar) usando o mesmo motor. */
export function isSlotAvailable(opts, startIso, hostId, resourceId) {
  const tz = opts.displayTimeZone;
  const day = localOf(startIso, tz).ymd;
  const { slots } = computeSlots({ ...opts, from: addDays(day, -1), to: addDays(day, 1) });
  const s = slots.find((x) => x.start === new Date(toMs(startIso)).toISOString());
  return !!s && (!hostId || s.hostIds.includes(hostId)) && (!resourceId || !s.resourceIds || s.resourceIds.includes(resourceId));
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

// ================================================================== operação (salão, barbearia, clínica)
// Regras puras do balcão: combos, recorrência, lista de espera, sinal, confirmação, WhatsApp, ficha do cliente,
// comissão, clube de assinatura, fidelidade, fila do dia, convênio, retorno e perfis de segmento.

const roundHalfUp = (x) => Math.floor(x + 0.5);

// ------------------------------------------------------------------ combos
/**
 * Vários serviços num atendimento só (corte + barba), em sequência com a mesma pessoa.
 * services: [{ id, name, durationMin, priceCents?, bufferBeforeMin?, bufferAfterMin?, combinable? }] (o primeiro é o principal)
 * → { ok, errors, durationMin, priceCents, bufferBeforeMin, bufferAfterMin, label, serviceIds }
 * Duração = soma; intervalo antes = do primeiro; intervalo depois = do último; preço = soma − desconto do combo (%).
 */
export function combo(services, { discountPct = 0 } = {}) {
  const errors = [];
  if (!Array.isArray(services) || services.length < 1 || services.length > 5) errors.push({ path: "addOns", code: "COMBO_SIZE", message: "De 1 a 5 serviços por atendimento" });
  const list = Array.isArray(services) ? services : [];
  const ids = list.map((s) => s.id);
  if (new Set(ids).size !== ids.length) errors.push({ path: "addOns", code: "COMBO_DUPLICATE", message: "Serviço repetido no combo" });
  list.slice(1).forEach((s, i) => { if (s.combinable === false) errors.push({ path: `addOns.${i}`, code: "NOT_COMBINABLE", message: `${s.name} não pode ser somado a outro serviço` }); });
  const durationMin = list.reduce((a, s) => a + (s.durationMin ?? 0), 0);
  if (durationMin > 720) errors.push({ path: "addOns", code: "COMBO_TOO_LONG", message: "O atendimento passaria de 12 h" });
  if (!(discountPct >= 0 && discountPct <= 100)) errors.push({ path: "discountPct", code: "DISCOUNT_INVALID", message: "Desconto de 0 a 100%" });
  const gross = list.reduce((a, s) => a + (s.priceCents ?? 0), 0);
  const priceCents = list.some((s) => s.priceCents != null) ? gross - roundHalfUp((gross * discountPct) / 100) : null;
  return {
    ok: !errors.length, errors, durationMin, priceCents, serviceIds: ids,
    bufferBeforeMin: list[0]?.bufferBeforeMin ?? 0, bufferAfterMin: list[list.length - 1]?.bufferAfterMin ?? 0,
    label: list.map((s) => s.name).join(" + "),
  };
}

// ------------------------------------------------------------------ recorrência
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 1..12
/**
 * Inícios de uma série (retorno semanal, sessão quinzenal, manutenção mensal), mantendo a HORA LOCAL no fuso
 * (atravessa horário de verão sem andar uma hora). Mensal no dia 31 cai no último dia dos meses curtos.
 * rule: { freq: "WEEKLY" | "MONTHLY", interval = 1, count?, until? ("YYYY-MM-DD", local) } — count de 2 a 52; sem count, até `until` (máx. 1 ano)
 * → [ISO UTC] (inclui o primeiro)
 */
export function recurrenceStarts(startIso, rule, timeZone) {
  const { freq, interval = 1, count, until } = rule ?? {};
  if (!["WEEKLY", "MONTHLY"].includes(freq) || !(Number.isInteger(interval) && interval >= 1 && interval <= 12)) return [];
  if (count != null && !(Number.isInteger(count) && count >= 2 && count <= 52)) return [];
  if (count == null && !until) return [];
  const l = localOf(startIso, timeZone);
  const limit = until ?? addDays(l.ymd, 366);
  const maxN = count ?? 52;
  const out = [];
  for (let i = 0; out.length < maxN && i < 400; i++) {
    let ymd;
    if (freq === "WEEKLY") ymd = addDays(l.ymd, i * 7 * interval);
    else ymd = addMonthsClamp(l.ymd, i * interval);
    if (ymd > limit || ymd > addDays(l.ymd, 366)) break;
    out.push(new Date(zonedToUtc(ymd, l.hm, timeZone)).toISOString());
  }
  return out;
}

// ------------------------------------------------------------------ lista de espera
/** Período do dia de um horário local: MORNING (< 12:00), AFTERNOON (12:00–17:59), EVENING (≥ 18:00). */
export const dayPeriod = (hm) => (hm < "12:00" ? "MORNING" : hm < "18:00" ? "AFTERNOON" : "EVENING");
/**
 * Quem da lista de espera serve para um horário que vagou, na ordem de chegada.
 * entries: [{ id, eventTypeId, hostId?, dateFrom, dateTo, periods?: ["MORNING"|"AFTERNOON"|"EVENING"], status, createdAt }]
 * freed: { eventTypeId, hostId, start }
 */
export function waitlistCandidates(entries, freed, timeZone) {
  const l = localOf(freed.start, timeZone), per = dayPeriod(l.hm);
  return (entries ?? [])
    .filter((e) => e.status === "WAITING" && e.eventTypeId === freed.eventTypeId && (!e.hostId || e.hostId === freed.hostId)
      && l.ymd >= e.dateFrom && l.ymd <= e.dateTo && (!e.periods?.length || e.periods.includes(per)))
    .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
}

// ------------------------------------------------------------------ sinal (pagamento antecipado)
/** Valor do sinal: { kind: "PERCENT", value: 50 } ou { kind: "FIXED", value: 2000 } sobre o preço; nunca passa do preço. */
export function depositAmount(priceCents, deposit) {
  if (!deposit || priceCents == null || priceCents <= 0) return 0;
  if (deposit.kind === "FIXED") return Math.max(0, Math.min(priceCents, deposit.value));
  if (deposit.kind === "PERCENT") return Math.max(0, Math.min(priceCents, roundHalfUp((priceCents * deposit.value) / 100)));
  return 0;
}
/**
 * Precisa de sinal? Do tipo (`deposit` configurado) ou porque o cliente falta demais (settings.depositAfterNoShows).
 * → { required, reason: "TYPE" | "NO_SHOWS" | null, deposit }
 */
export function depositRequired({ typeDeposit, noShowCount = 0, depositAfterNoShows = null, defaultDeposit = { kind: "PERCENT", value: 50 } }) {
  if (typeDeposit) return { required: true, reason: "TYPE", deposit: typeDeposit };
  if (depositAfterNoShows != null && noShowCount >= depositAfterNoShows) return { required: true, reason: "NO_SHOWS", deposit: defaultDeposit };
  return { required: false, reason: null, deposit: null };
}
/**
 * Devolução do sinal ao cancelar: a empresa cancelou → tudo; o cliente cancelou com pelo menos `refundIfHoursBefore`
 * horas de antecedência → tudo; depois disso (ou faltou) → fica retido.
 */
export function depositRefund({ paidCents, start, canceledAt, by, refundIfHoursBefore = 24 }) {
  if (!paidCents) return { refundCents: 0, retainedCents: 0 };
  const full = by === "TEAM" || (by === "CLIENT" && toMs(start) - toMs(canceledAt) >= refundIfHoursBefore * HOUR);
  return full ? { refundCents: paidCents, retainedCents: 0 } : { refundCents: 0, retainedCents: paidCents };
}

// ------------------------------------------------------------------ WhatsApp (link manual; o add-on manda sozinho)
/** Telefone brasileiro em E.164 sem "+": "(44) 99999-1234" → "5544999991234"; inválido → null. */
export function normalizePhoneBR(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!/^55[1-9][0-9]\d{8,9}$/.test(d)) return null;
  if (d.length === 13 && d[4] !== "9") return null; // celular com 9 dígitos começa com 9
  return d;
}
/** Link que abre o WhatsApp com a mensagem pronta (funciona sem integração). */
export const waLink = (phone, text) => { const p = normalizePhoneBR(phone); return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null; };
/**
 * Texto curto das mensagens ao cliente (o mesmo para WhatsApp e para o resumo do e-mail).
 * kind: CONFIRMED | REMINDER | RESCHEDULED | CANCELED | WAITLIST_OFFER | PAYMENT | RECALL
 * ctx: { company, clientName, service, when (texto), url?, amount? }
 */
export function clientMessage(kind, ctx) {
  const first = String(ctx.clientName ?? "").trim().split(/\s+/)[0] || "Olá";
  const T = {
    CONFIRMED: `${first}, seu horário na ${ctx.company} está confirmado: ${ctx.service}, ${ctx.when}.`,
    REMINDER: `${first}, lembrete: ${ctx.service} na ${ctx.company}, ${ctx.when}. Confirme ou remarque:`,
    RESCHEDULED: `${first}, seu horário na ${ctx.company} mudou para ${ctx.when} (${ctx.service}).`,
    CANCELED: `${first}, seu horário na ${ctx.company} (${ctx.service}, ${ctx.when}) foi cancelado. Para marcar outro:`,
    WAITLIST_OFFER: `${first}, abriu um horário na ${ctx.company}: ${ctx.service}, ${ctx.when}. Quem confirmar primeiro fica com ele:`,
    PAYMENT: `${first}, para garantir ${ctx.service} na ${ctx.company} (${ctx.when}), pague o sinal de ${ctx.amount}:`,
    RECALL: `${first}, já está na hora do seu retorno na ${ctx.company} (${ctx.service}). Escolha o melhor horário:`,
  };
  const t = T[kind];
  if (!t) throw new Error(`mensagem desconhecida: ${kind}`);
  return ctx.url ? `${t} ${ctx.url}` : t;
}

// ------------------------------------------------------------------ ficha do cliente
/**
 * Resumo da ficha a partir do histórico: visitas, faltas, cancelamentos, gasto, último atendimento, profissional
 * preferido e intervalo médio entre visitas (dias).
 * appts: [{ start, status, attendance, serviceName, hostId, hostName, amountCents? }]
 */
export function clientSummary(appts, now = Date.now()) {
  const list = [...(appts ?? [])].sort((a, b) => toMs(a.start) - toMs(b.start));
  const done = list.filter((a) => a.attendance === "ATTENDED");
  const byHost = new Map();
  for (const a of done) byHost.set(a.hostId, (byHost.get(a.hostId) ?? 0) + 1);
  const fav = [...byHost.entries()].sort((a, b) => b[1] - a[1])[0];
  const gaps = done.slice(1).map((a, i) => (toMs(a.start) - toMs(done[i].start)) / DAY);
  const last = done[done.length - 1];
  const next = list.find((a) => ["CONFIRMED", "PENDING", "AWAITING_PAYMENT"].includes(a.status) && toMs(a.start) > toMs(now));
  return {
    visits: done.length,
    noShows: list.filter((a) => a.attendance === "NO_SHOW").length,
    cancellations: list.filter((a) => a.status === "CANCELED").length,
    spentCents: done.reduce((s, a) => s + (a.amountCents ?? 0), 0),
    lastVisit: last ? { start: last.start, serviceName: last.serviceName, hostId: last.hostId, hostName: last.hostName } : null,
    favoriteHostId: fav?.[0] ?? null,
    avgIntervalDays: gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null,
    nextAppointment: next ? { start: next.start, serviceName: next.serviceName } : null,
  };
}

// ------------------------------------------------------------------ comissão
/**
 * Regra que vale para uma linha (a mais específica ganha): pessoa + serviço > serviço > pessoa > padrão do tipo de linha.
 * rules: [{ hostId?, serviceId?, kind: "SERVICE" | "PRODUCT", pct?, fixedCents? }]
 */
export function commissionRule(line, rules) {
  const m = (rules ?? []).filter((r) => r.kind === line.kind && (!r.hostId || r.hostId === line.hostId) && (!r.serviceId || r.serviceId === line.serviceId));
  const score = (r) => (r.hostId ? 1 : 0) + (r.serviceId ? 2 : 0);
  return m.sort((a, b) => score(b) - score(a))[0] ?? null;
}
/**
 * Comissão de uma linha do atendimento concluído. line: { hostId, kind, serviceId?, amountCents, baseCents?, qty? }
 * baseCents (quando existe) é a base da comissão — ex.: serviço do clube sai por R$ 0 mas comissiona pelo preço de tabela.
 * Percentual arredonda ao centavo; valor fixo é por unidade.
 */
export function commissionFor(line, rules) {
  const r = commissionRule(line, rules);
  if (!r) return 0;
  if (r.fixedCents != null) return r.fixedCents * (line.qty ?? 1);
  return roundHalfUp(((line.baseCents ?? line.amountCents) * (r.pct ?? 0)) / 100);
}
/** Extrato do período: { byHost: { [hostId]: { servicesCents, productsCents, commissionCents, lines } }, totalCommissionCents } */
export function commissionStatement(lines, rules) {
  const byHost = {};
  let total = 0;
  for (const l of lines ?? []) {
    const h = (byHost[l.hostId] ??= { servicesCents: 0, productsCents: 0, commissionCents: 0, lines: 0 });
    const c = commissionFor(l, rules);
    if (l.kind === "SERVICE") h.servicesCents += l.amountCents; else h.productsCents += l.amountCents;
    h.commissionCents += c; h.lines += 1; total += c;
  }
  return { byHost, totalCommissionCents: total };
}

// ------------------------------------------------------------------ clube de assinatura
/**
 * O que a assinatura cobre nesta visita. Uma visita consome UM uso (não importa quantos serviços do plano).
 * sub: { status: "ACTIVE" | ..., periodStart, periodEnd ("YYYY-MM-DD", fim inclusive), usesPerPeriod (null = ilimitado), serviceIds }
 * → { covered: [ids], charged: [ids], usesLeft (depois desta visita), reason? }
 */
export function clubCoverage(sub, serviceIds, { usedInPeriod = 0, date }) {
  const none = (reason) => ({ covered: [], charged: [...serviceIds], usesLeft: null, reason });
  if (!sub) return none("NO_SUBSCRIPTION");
  if (sub.status !== "ACTIVE") return none("SUBSCRIPTION_INACTIVE");
  if (date < sub.periodStart || date > sub.periodEnd) return none("OUT_OF_PERIOD");
  const covered = serviceIds.filter((id) => sub.serviceIds.includes(id));
  const charged = serviceIds.filter((id) => !sub.serviceIds.includes(id));
  if (!covered.length) return { covered: [], charged, usesLeft: sub.usesPerPeriod == null ? null : Math.max(0, sub.usesPerPeriod - usedInPeriod), reason: "NOT_IN_PLAN" };
  if (sub.usesPerPeriod != null && usedInPeriod >= sub.usesPerPeriod) return { covered: [], charged: [...serviceIds], usesLeft: 0, reason: "USES_EXHAUSTED" };
  return { covered, charged, usesLeft: sub.usesPerPeriod == null ? null : sub.usesPerPeriod - usedInPeriod - 1 };
}
/** Soma meses a uma data mantendo o dia (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonthsClamp(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const total = (m - 1) + n, ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12 + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}
/**
 * Período mensal da assinatura que contém a data, contado a partir do dia em que ela começou (âncora; sem "escorregar"
 * de 31 para 28 nos meses seguintes). → { periodStart, periodEnd } (fim inclusive) ou null se a data é antes do início.
 */
export function clubPeriodOf(anchorYmd, dateYmd) {
  if (dateYmd < anchorYmd) return null;
  for (let i = 0; i < 1200; i++) {
    const start = addMonthsClamp(anchorYmd, i), end = addDays(addMonthsClamp(anchorYmd, i + 1), -1);
    if (dateYmd >= start && dateYmd <= end) return { periodStart: start, periodEnd: end };
  }
  return null;
}

// ------------------------------------------------------------------ fidelidade
/** Cartão fidelidade "a cada N, um grátis": visitas que contam (não inclui as resgatadas) → { stamps, rewardsAvailable, nextIn } */
export function loyaltyStatus({ completedCount, redeemedCount = 0, everyN }) {
  if (!(Number.isInteger(everyN) && everyN >= 2)) return { stamps: 0, rewardsAvailable: 0, nextIn: null };
  const earned = Math.floor(completedCount / everyN);
  const stamps = completedCount % everyN;
  return { stamps, rewardsAvailable: Math.max(0, earned - redeemedCount), nextIn: everyN - stamps };
}

// ------------------------------------------------------------------ fila do dia (sem hora marcada)
/**
 * Previsão de espera de quem chegou sem horário, na ordem de chegada.
 * queue: [{ id, durationMin, hostId? }] · hosts: [{ id, freeAt }] (quando cada um fica livre; ms ou ISO) · now
 * Cada um vai para o profissional escolhido ou para quem fica livre primeiro; → [{ id, position, hostId, etaMin, startsAt }]
 */
export function queueEstimate(queue, hosts, now = Date.now()) {
  const n = toMs(now);
  const free = new Map((hosts ?? []).map((h) => [h.id, Math.max(n, toMs(h.freeAt ?? n))]));
  return (queue ?? []).map((q, i) => {
    let hostId = q.hostId && free.has(q.hostId) ? q.hostId : null;
    if (!hostId) hostId = [...free.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? null; // empate: ordem da lista
    if (!hostId) return { id: q.id, position: i + 1, hostId: null, etaMin: null, startsAt: null };
    const at = free.get(hostId);
    free.set(hostId, at + q.durationMin * MIN);
    return { id: q.id, position: i + 1, hostId, etaMin: Math.round((at - n) / MIN), startsAt: new Date(at).toISOString() };
  });
}

// ------------------------------------------------------------------ clínica: convênio e retorno
/** Data sugerida do retorno: dias depois do atendimento (data local). */
export const recallDate = (doneYmd, days) => addDays(doneYmd, days);
/**
 * Preço do atendimento conforme a forma: particular (preço do tipo) ou convênio aceito no tipo
 * (valor do convênio, se houver tabela; senão o paciente não paga nada na hora).
 * → { ok, paymentKind, priceCents, error? }
 */
export function insurancePrice(type, insuranceId, insurances) {
  if (!insuranceId) return { ok: true, paymentKind: "PRIVATE", priceCents: type.priceCents ?? null };
  const ins = (insurances ?? []).find((x) => x.id === insuranceId && x.active !== false);
  if (!ins) return { ok: false, error: { path: "insuranceId", code: "INSURANCE_UNKNOWN", message: "Convênio não encontrado" } };
  if (!(type.insuranceIds ?? []).includes(insuranceId)) return { ok: false, error: { path: "insuranceId", code: "INSURANCE_NOT_ACCEPTED", message: `${ins.name} não atende ${type.name}` } };
  return { ok: true, paymentKind: "INSURANCE", priceCents: ins.prices?.[type.id] ?? 0 };
}

// ------------------------------------------------------------------ perfis de segmento
/** Vocabulário e o que vem ligado em cada segmento (a empresa pode mudar tudo depois). */
export const SEGMENTS = {
  GENERAL:    { label: "Serviços em geral",          words: { client: "cliente",  clients: "clientes",  pro: "profissional", pros: "profissionais", service: "serviço",       services: "serviços" },       on: [] },
  BARBERSHOP: { label: "Barbearia",                  words: { client: "cliente",  clients: "clientes",  pro: "barbeiro",     pros: "barbeiros",     service: "serviço",       services: "serviços" },       on: ["combos", "queue", "commissions", "club", "loyalty", "confirmation"] },
  SALON:      { label: "Salão de beleza e estética", words: { client: "cliente",  clients: "clientes",  pro: "profissional", pros: "profissionais", service: "serviço",       services: "serviços" },       on: ["combos", "resources", "commissions", "loyalty", "deposits", "confirmation"] },
  CLINIC:     { label: "Clínica e consultório",      words: { client: "paciente", clients: "pacientes", pro: "profissional", pros: "profissionais", service: "procedimento",  services: "procedimentos" }, on: ["resources", "recurring", "intake", "insurance", "recall", "confirmation", "waitlist"] },
  DENTAL:     { label: "Odontologia",                words: { client: "paciente", clients: "pacientes", pro: "dentista",     pros: "dentistas",     service: "procedimento",  services: "procedimentos" }, on: ["resources", "recurring", "intake", "insurance", "recall", "confirmation", "waitlist", "consent"] },
  PET:        { label: "Pet shop e veterinária",     words: { client: "tutor",    clients: "tutores",   pro: "profissional", pros: "profissionais", service: "serviço",       services: "serviços" },       on: ["combos", "resources", "recall", "confirmation"] },
  CONSULTING: { label: "Consultoria e reuniões",     words: { client: "cliente",  clients: "clientes",  pro: "consultor",    pros: "consultores",   service: "reunião",       services: "reuniões" },       on: ["deposits"] },
};
export const vocabulary = (segment) => (SEGMENTS[segment] ?? SEGMENTS.GENERAL).words;
