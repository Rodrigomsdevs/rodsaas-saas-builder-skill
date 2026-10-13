import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "./agenda-lib.mjs";

const SP = "America/Sao_Paulo";
const weekdays = (a, b) => Object.fromEntries([1, 2, 3, 4, 5].map((d) => [String(d), [[a, b]]]));
const host = (extra = {}) => ({ id: "ana", timeZone: SP, weekly: weekdays("09:00", "12:00"), overrides: {}, busy: [], dayCounts: {}, ...extra });
const hol2026 = new Set(L.brazilHolidays(2026).map((h) => h.date));
const base = (extra = {}) => ({
  now: "2026-10-11T15:00:00Z", // domingo, 12:00 em São Paulo
  from: "2026-10-12", to: "2026-10-18", displayTimeZone: SP,
  durationMin: 30, hosts: [host()], holidays: hol2026, maxDaysAhead: 60, ...extra,
});
const hms = (slots, tz = SP) => slots.map((s) => L.localOf(s.start, tz).hm);

test("fuso: conversões, horário de verão (pulo e volta) e dia da semana", () => {
  assert.equal(new Date(L.zonedToUtc("2026-10-15", "09:00", SP)).toISOString(), "2026-10-15T12:00:00.000Z");
  assert.equal(L.offsetMinutes("2026-10-15T12:00:00Z", SP), -180);
  assert.deepEqual(L.localOf("2026-10-15T12:00:00Z", SP), { ymd: "2026-10-15", hm: "09:00", dow: 4 });
  const NY = "America/New_York";
  assert.equal(new Date(L.zonedToUtc("2026-03-08", "02:30", NY)).toISOString(), "2026-03-08T07:30:00.000Z", "horário que não existe anda para frente (03:30 EDT)");
  assert.equal(new Date(L.zonedToUtc("2026-11-01", "01:30", NY)).toISOString(), "2026-11-01T05:30:00.000Z", "horário repetido usa o primeiro (EDT)");
  assert.equal(new Date(L.zonedToUtc("2026-07-01", "00:00", "Asia/Kolkata")).toISOString(), "2026-06-30T18:30:00.000Z", "fuso com meia hora");
  assert.equal(L.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(L.dowOf("2026-10-12"), 1);
  assert.ok(L.isValidTimeZone(SP) && !L.isValidTimeZone("Marte/Base"));
});

test("feriados nacionais calculados (Páscoa e móveis)", () => {
  assert.equal(L.easter(2026), "2026-04-05");
  assert.equal(L.easter(2027), "2027-03-28");
  const h = L.brazilHolidays(2026, { optional: true });
  const by = Object.fromEntries(h.map((x) => [x.date, x]));
  assert.equal(by["2026-04-03"].name, "Sexta-feira Santa");
  assert.equal(by["2026-10-12"].optional, false);
  assert.equal(by["2026-11-20"].name, "Dia Nacional de Zumbi e da Consciência Negra");
  assert.ok(by["2026-02-16"].optional && by["2026-02-17"].optional, "Carnaval é ponto facultativo");
  assert.equal(by["2026-06-04"].name, "Corpus Christi");
  assert.equal(L.brazilHolidays(2026).length, 10);
  assert.ok(!L.brazilHolidays(2023).some((x) => x.date === "2023-11-20"), "Consciência Negra nacional só a partir de 2024");
});

test("validação da disponibilidade e do tipo de agendamento", () => {
  assert.deepEqual(L.validateWeekly(weekdays("09:00", "18:00")), []);
  const errs = L.validateWeekly({ 1: [["09:00", "12:00"], ["11:00", "13:00"]], 2: [["10:00", "09:00"]], 3: [["9h", "10h"]], 8: [] });
  assert.deepEqual(errs.map((e) => e.path).sort(), ["weekly.1.1", "weekly.2.0", "weekly.3.0", "weekly.8"].sort());
  assert.deepEqual(L.validateEventTypeConfig({ durations: [30, 60], slotIntervalMin: 15, capacity: 1, assignment: "any" }), []);
  const bad = L.validateEventTypeConfig({ durations: [2], bufferAfterMin: 999, capacity: 5, assignment: "any", maxPerDay: 0 }).map((e) => e.path);
  assert.deepEqual(bad.sort(), ["bufferAfterMin", "capacity", "durations", "maxPerDay"].sort());
});

test("slots básicos: dias úteis, sem o feriado de 12/10, alinhados ao relógio", () => {
  const { slots, byDay } = L.computeSlots(base());
  assert.deepEqual(Object.keys(byDay), ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"], "segunda 12/10 é feriado; fim de semana fechado");
  assert.deepEqual(hms(byDay["2026-10-13"]), ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
  assert.equal(slots.length, 24);
  assert.ok(slots.every((s) => Date.parse(s.end) - Date.parse(s.start) === 30 * 60_000));
  const step15 = L.computeSlots(base({ slotIntervalMin: 15, durationMin: 60 })).byDay["2026-10-13"];
  assert.deepEqual(hms(step15), ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00"], "reunião de 1 h de 15 em 15 min");
  const noHol = L.computeSlots(base({ holidays: [] }));
  assert.ok(noHol.byDay["2026-10-12"], "sem feriados, segunda aparece");
});

test("compromissos e intervalos antes/depois", () => {
  const busy = [{ start: "2026-10-13T13:00:00Z", end: "2026-10-13T13:30:00Z" }]; // 10:00–10:30 em SP
  const day = (extra) => L.computeSlots(base({ hosts: [host({ busy })], ...extra })).byDay["2026-10-13"];
  assert.deepEqual(hms(day()), ["09:00", "09:30", "10:30", "11:00", "11:30"]);
  assert.deepEqual(hms(day({ bufferAfterMin: 15 })), ["09:00", "10:30", "11:00", "11:30"], "15 min depois: 09:30 encostaria às 10:00");
  assert.deepEqual(hms(day({ bufferBeforeMin: 15 })), ["09:00", "09:30", "11:00", "11:30"], "15 min antes: 10:30 começaria colado");
  const r = L.blockRange("2026-10-13T13:00:00Z", "2026-10-13T13:30:00Z", 10, 5);
  assert.deepEqual(r, { blockStart: "2026-10-13T12:50:00.000Z", blockEnd: "2026-10-13T13:35:00.000Z" });
});

test("antecedência mínima, janela máxima e limite por dia", () => {
  const notice = L.computeSlots(base({ now: "2026-10-13T13:00:00Z", minNoticeMin: 120 })); // terça 10:00 SP
  assert.equal(L.localOf(notice.slots[0].start, SP).ymd, "2026-10-14", "terça não tem mais horário com 2 h de antecedência");
  assert.equal(L.localOf(notice.slots[0].start, SP).hm, "09:00");
  const later = L.computeSlots(base({ now: "2026-10-13T13:10:00Z" }));
  assert.deepEqual(hms(later.byDay["2026-10-13"]), ["10:30", "11:00", "11:30"], "horário que já passou não aparece");
  const window = L.computeSlots(base({ maxDaysAhead: 3 }));
  assert.deepEqual(Object.keys(window.byDay), ["2026-10-13", "2026-10-14"], "só até 3 dias à frente (14/10)");
  const perDay = L.computeSlots(base({ maxPerDay: 2, hosts: [host({ dayCounts: { "2026-10-13": 2 } })] }));
  assert.ok(!perDay.byDay["2026-10-13"], "dia lotado");
  assert.equal(perDay.byDay["2026-10-14"].length, 6, "outro dia continua com todos os horários");
});

test("exceções: folga em dia útil e expediente especial no feriado", () => {
  const { byDay } = L.computeSlots(base({ hosts: [host({ overrides: { "2026-10-14": [], "2026-10-12": [["14:00", "15:00"]] } })] }));
  assert.ok(!byDay["2026-10-14"], "folga");
  assert.deepEqual(hms(byDay["2026-10-12"]), ["14:00", "14:30"], "exceção vale mais que o feriado");
  const overnight = L.computeSlots(base({ hosts: [host({ weekly: { 2: [["22:00", "24:00"]] } })], durationMin: 60 }));
  assert.deepEqual(hms(overnight.byDay["2026-10-13"]), ["22:00", "23:00"], "janela até 24:00");
});

test("equipe: qualquer um (união), todos juntos (interseção) e rodízio", () => {
  const ana = host({ id: "ana", weekly: { 2: [["09:00", "12:00"]] } });
  const bia = host({ id: "bia", weekly: { 2: [["10:00", "14:00"]] } });
  const any = L.computeSlots(base({ mode: "any", hosts: [ana, bia], durationMin: 60 })).byDay["2026-10-13"];
  assert.deepEqual(any.map((s) => [L.localOf(s.start, SP).hm, s.hostIds.join("+")]), [["09:00", "ana"], ["10:00", "ana+bia"], ["11:00", "ana+bia"], ["12:00", "bia"], ["13:00", "bia"]]);
  const all = L.computeSlots(base({ mode: "all", hosts: [ana, bia], durationMin: 60 })).byDay["2026-10-13"];
  assert.deepEqual(all.map((s) => [L.localOf(s.start, SP).hm, s.hostIds.join("+")]), [["10:00", "ana+bia"], ["11:00", "ana+bia"]]);
  const one = L.computeSlots(base({ mode: "one", hosts: [bia, ana], durationMin: 60 })).byDay["2026-10-13"];
  assert.deepEqual(hms(one), ["10:00", "11:00", "12:00", "13:00"], "uma pessoa: só a primeira da lista");
  assert.equal(L.pickHost(["ana", "bia", "caio"], { ana: { count: 3 }, bia: { count: 1, lastAt: "2026-10-10" }, caio: { count: 1, lastAt: "2026-10-01" } }), "caio");
  assert.equal(L.pickHost(["ana", "bia"], {}), "ana", "empate total: ordem de prioridade");
  assert.equal(L.pickHost([], {}), null);
});

test("turmas: vagas por horário", () => {
  const seat = (n, eventTypeId = "aula") => ({ start: "2026-10-13T12:00:00Z", end: "2026-10-13T13:00:00Z", eventTypeId, seats: n });
  const run = (busy) => L.computeSlots(base({ capacity: 3, eventTypeId: "aula", durationMin: 60, hosts: [host({ weekly: { 2: [["09:00", "11:00"]] }, busy })] })).byDay["2026-10-13"] ?? [];
  assert.deepEqual(run([seat(2)]).map((s) => [L.localOf(s.start, SP).hm, s.seatsLeft]), [["09:00", 1], ["10:00", 3]]);
  assert.deepEqual(hms(run([seat(3)])), ["10:00"], "turma cheia some");
  assert.deepEqual(hms(run([seat(1, "outro-tipo")])), ["10:00"], "compromisso de outro tipo ocupa o horário");
});

test("exibição em outro fuso: horários e dias do ponto de vista do cliente", () => {
  const h = host({ weekly: { 2: [["09:00", "10:00"]] } });
  const lis = L.computeSlots(base({ hosts: [h], displayTimeZone: "Europe/Lisbon" }));
  assert.deepEqual(hms(lis.slots, "Europe/Lisbon"), ["13:00", "13:30"]);
  const akl = L.computeSlots(base({ hosts: [h], displayTimeZone: "Pacific/Auckland", from: "2026-10-12", to: "2026-10-20" }));
  assert.deepEqual(Object.keys(akl.byDay), ["2026-10-14"], "09:00 de terça em SP já é quarta 01:00 na Nova Zelândia");
});

test("pessoa em fuso com horário de verão (pulo de 02:00 para 03:00)", () => {
  const ny = { id: "joe", timeZone: "America/New_York", weekly: { 0: [["01:00", "04:00"]] } };
  const { slots } = L.computeSlots({ now: "2026-03-01T00:00:00Z", from: "2026-03-08", to: "2026-03-08", displayTimeZone: "America/New_York", durationMin: 60, hosts: [ny] });
  assert.deepEqual(slots.map((s) => s.start), ["2026-03-08T06:00:00.000Z", "2026-03-08T07:00:00.000Z"], "01:00 EST e 03:00 EDT; 02:00 não existe");
});

test("isSlotAvailable confere o horário escolhido com o mesmo motor", () => {
  const opts = base({ hosts: [host({ busy: [{ start: "2026-10-13T13:00:00Z", end: "2026-10-13T13:30:00Z" }] })] });
  assert.ok(L.isSlotAvailable(opts, "2026-10-13T12:00:00Z"));
  assert.ok(!L.isSlotAvailable(opts, "2026-10-13T13:00:00Z"), "ocupado");
  assert.ok(!L.isSlotAvailable(opts, "2026-10-13T12:10:00Z"), "fora da grade de horários");
  assert.ok(!L.isSlotAvailable(opts, "2026-10-13T12:00:00Z", "outra-pessoa"));
});

test("cancelar/remarcar e lembretes", () => {
  const start = "2026-10-15T12:00:00Z";
  assert.deepEqual(L.canChange({ start, status: "CONFIRMED" }, "2026-10-14T12:00:00Z", 12), { ok: true });
  assert.equal(L.canChange({ start, status: "CONFIRMED" }, "2026-10-15T06:00:00Z", 12).ok, false);
  assert.equal(L.canChange({ start, status: "CANCELED" }, "2026-10-14T12:00:00Z").ok, false);
  assert.equal(L.canChange({ start, status: "CONFIRMED" }, "2026-10-15T12:30:00Z").ok, false);
  assert.deepEqual(L.reminderTimes(start, [60, 1440], { now: "2026-10-13T12:00:00Z" }).map((r) => r.offsetMin), [1440, 60]);
  assert.deepEqual(L.reminderTimes(start, [60, 1440], { now: "2026-10-15T08:00:00Z", createdAt: "2026-10-15T08:00:00Z" }).map((r) => r.at), ["2026-10-15T11:00:00.000Z"], "marcou 4 h antes: só o de 1 h");
});

test(".ics: escapa, dobra em 75 bytes sem quebrar acento e usa CRLF", () => {
  const ics = L.buildIcs([{
    uid: "abc@rodsaas", start: "2026-10-15T12:00:00Z", end: "2026-10-15T12:30:00Z",
    summary: "Consulta, avaliação; retorno", description: "Linha 1\nAção com acentuação ".repeat(4),
    location: "Av. Brasil, 100 – Maringá/PR", url: "https://app.exemplo.com/agendamento/xyz",
    organizer: { name: "Clínica Vida", email: "contato@vida.com.br" }, attendees: [{ name: "Ana Souza", email: "ana@x.com" }],
  }], { now: "2026-10-13T00:00:00Z" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.includes("DTSTART:20261015T120000Z\r\nDTEND:20261015T123000Z"));
  assert.ok(ics.includes("SUMMARY:Consulta\\, avaliação\\; retorno"));
  assert.ok(ics.includes("METHOD:REQUEST") && ics.includes("STATUS:CONFIRMED"));
  const enc = new TextEncoder();
  for (const line of ics.split("\r\n")) assert.ok(enc.encode(line).length <= 75, `linha longa: ${line}`);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("DESCRIPTION:Linha 1\\nAção com acentuação Linha 1"), "desdobrado volta ao texto original");
  const cancel = L.buildIcs([{ uid: "abc@rodsaas", start: "2026-10-15T12:00:00Z", end: "2026-10-15T12:30:00Z", summary: "x", sequence: 2 }], { method: "CANCEL" });
  assert.ok(cancel.includes("METHOD:CANCEL") && cancel.includes("STATUS:CANCELLED") && cancel.includes("SEQUENCE:2"));
  assert.match(L.googleCalendarLink({ start: "2026-10-15T12:00:00Z", end: "2026-10-15T12:30:00Z", summary: "Consulta" }), /dates=20261015T120000Z%2F20261015T123000Z/);
});

test("tokens, Jitsi, slug e textos", () => {
  const t = L.newToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(L.hashToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.match(L.jitsiUrl("Clínica Vida · Consulta"), /^https:\/\/meet\.jit\.si\/clinica-vida-consulta-[a-z2-9]{12}$/);
  assert.equal(L.slugify("Dra. Ana Souza"), "dra-ana-souza");
  assert.ok(L.isValidSlug("acme") && L.isValidSlug("a") && !L.isValidSlug("-x") && !L.isValidSlug("Acme"));
  assert.equal(L.formatDayLong("2026-10-15"), "quinta, 15 de outubro");
  assert.equal(L.formatAppointment("2026-10-15T12:00:00Z", "2026-10-15T12:30:00Z", SP), "quinta, 15 de outubro, 09:00 – 09:30 (horário de Brasília)");
});
