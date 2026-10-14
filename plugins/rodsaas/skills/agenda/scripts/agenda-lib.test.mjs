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

// ================================================================== operação (salão, barbearia, clínica)
test("recursos: precisa de UM livre do grupo (cadeira/sala); dois profissionais disputam a mesma sala", () => {
  const ana = host({ id: "ana", weekly: { 2: [["09:00", "11:00"]] } });
  const bia = host({ id: "bia", weekly: { 2: [["09:00", "11:00"]] } });
  const salaOcupada = { id: "sala1", busy: [{ start: "2026-10-13T12:00:00Z", end: "2026-10-13T13:00:00Z" }] }; // 09:00–10:00 SP
  const day = (resources, extra = {}) => L.computeSlots(base({ mode: "any", hosts: [ana, bia], durationMin: 60, resources, ...extra })).byDay["2026-10-13"] ?? [];
  assert.deepEqual(hms(day([salaOcupada])), ["10:00"], "uma sala ocupada às 09:00: só sobra 10:00, mesmo com duas pessoas livres");
  assert.deepEqual(day([salaOcupada, { id: "sala2", busy: [] }]).map((s) => [L.localOf(s.start, SP).hm, s.resourceIds.join("+")]), [["09:00", "sala2"], ["10:00", "sala1+sala2"]]);
  assert.deepEqual(day([]), [], "tipo exige recurso e não há nenhum: sem horários");
  assert.equal(day(undefined).length, 2, "sem recursos no tipo, o motor ignora");
  assert.deepEqual(hms(day([{ id: "s", busy: [{ start: "2026-10-13T13:30:00Z", end: "2026-10-13T14:30:00Z" }] }])), ["09:00"], "sala ocupada a partir de 10:30 derruba o horário das 10:00");
  const opts = base({ hosts: [ana], durationMin: 60, resources: [salaOcupada, { id: "sala2", busy: [] }] });
  assert.ok(L.isSlotAvailable(opts, "2026-10-13T12:00:00Z", "ana", "sala2"));
  assert.ok(!L.isSlotAvailable(opts, "2026-10-13T12:00:00Z", "ana", "sala1"), "sala escolhida ocupada");
  const turma = L.computeSlots(base({ hosts: [ana], durationMin: 60, capacity: 4, eventTypeId: "aula", resources: [{ id: "estudio", busy: [{ start: "2026-10-13T12:00:00Z", end: "2026-10-13T13:00:00Z", eventTypeId: "aula" }] }] })).byDay["2026-10-13"];
  assert.deepEqual(hms(turma), ["09:00", "10:00"], "a sessão da própria turma não ocupa a sala dela");
});

test("combos: soma duração e preço, intervalo antes do primeiro e depois do último, desconto e erros", () => {
  const corte = { id: "c", name: "Corte", durationMin: 30, priceCents: 4000, bufferBeforeMin: 5, bufferAfterMin: 10 };
  const barba = { id: "b", name: "Barba", durationMin: 20, priceCents: 3000, bufferAfterMin: 15 };
  const r = L.combo([corte, barba]);
  assert.deepEqual([r.ok, r.durationMin, r.priceCents, r.bufferBeforeMin, r.bufferAfterMin, r.label], [true, 50, 7000, 5, 15, "Corte + Barba"]);
  assert.equal(L.combo([corte, barba], { discountPct: 10 }).priceCents, 6300);
  assert.equal(L.combo([{ ...corte, priceCents: 3333 }, { ...barba, priceCents: 3333 }], { discountPct: 15 }).priceCents, 5666, "15% de 6666 = 999,9 → 1000 (meio para cima)");
  assert.equal(L.combo([{ ...corte, priceCents: null }, { ...barba, priceCents: null }]).priceCents, null, "sem preço continua sem preço");
  assert.deepEqual(L.combo([corte, corte]).errors.map((e) => e.code), ["COMBO_DUPLICATE"]);
  assert.deepEqual(L.combo([corte, { ...barba, combinable: false }]).errors.map((e) => e.path), ["addOns.0"]);
  assert.deepEqual(L.combo([]).errors.map((e) => e.code), ["COMBO_SIZE"]);
  assert.deepEqual(L.combo([corte, { ...barba, durationMin: 700 }]).errors.map((e) => e.code), ["COMBO_TOO_LONG"]);
  assert.ok(L.combo([corte]).ok, "um serviço só também vale");
});

test("recorrência: mantém a hora local, quinzenal, mensal no dia 31 e limites", () => {
  const w = L.recurrenceStarts("2026-10-13T12:00:00Z", { freq: "WEEKLY", count: 4 }, SP);
  assert.deepEqual(w.map((x) => L.localOf(x, SP).ymd), ["2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03"]);
  assert.ok(w.every((x) => L.localOf(x, SP).hm === "09:00"));
  const ny = L.recurrenceStarts("2026-10-27T13:00:00Z", { freq: "WEEKLY", count: 2 }, "America/New_York"); // 09:00 EDT
  assert.deepEqual(ny.map((x) => L.localOf(x, "America/New_York").hm), ["09:00", "09:00"], "atravessa o fim do horário de verão sem mudar a hora");
  assert.deepEqual(ny, ["2026-10-27T13:00:00.000Z", "2026-11-03T14:00:00.000Z"]);
  assert.deepEqual(L.recurrenceStarts("2026-10-13T12:00:00Z", { freq: "WEEKLY", interval: 2, count: 3 }, SP).map((x) => L.localOf(x, SP).ymd), ["2026-10-13", "2026-10-27", "2026-11-10"]);
  assert.deepEqual(L.recurrenceStarts("2027-01-31T12:00:00Z", { freq: "MONTHLY", count: 4 }, SP).map((x) => L.localOf(x, SP).ymd), ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"], "dia 31 cai no último dia dos meses curtos e volta ao 31");
  assert.deepEqual(L.recurrenceStarts("2026-10-13T12:00:00Z", { freq: "WEEKLY", until: "2026-10-27" }, SP).length, 3, "até a data (inclusive)");
  assert.deepEqual(L.recurrenceStarts("2026-10-13T12:00:00Z", { freq: "WEEKLY", count: 1 }, SP), [], "série tem pelo menos 2");
  assert.deepEqual(L.recurrenceStarts("2026-10-13T12:00:00Z", { freq: "WEEKLY", count: 53 }, SP), [], "no máximo 52");
  assert.deepEqual(L.recurrenceStarts("2026-10-13T12:00:00Z", { freq: "DAILY", count: 3 }, SP), []);
  assert.equal(L.recurrenceStarts("2026-10-13T12:00:00Z", { freq: "MONTHLY", until: "2030-01-01" }, SP).length, 13, "sem count: no máximo 1 ano");
});

test("lista de espera: tipo, profissional, janela de datas, período do dia e ordem de chegada", () => {
  const e = (id, extra) => ({ id, eventTypeId: "corte", hostId: null, dateFrom: "2026-10-13", dateTo: "2026-10-16", periods: [], status: "WAITING", createdAt: "2026-10-10T10:00:00Z", ...extra });
  const entries = [
    e("tarde", { periods: ["AFTERNOON"], createdAt: "2026-10-09T10:00:00Z" }),
    e("bia", { hostId: "bia", createdAt: "2026-10-08T10:00:00Z" }),
    e("segundo", { createdAt: "2026-10-10T11:00:00Z" }),
    e("primeiro", { createdAt: "2026-10-10T09:00:00Z" }),
    e("outro-tipo", { eventTypeId: "barba" }),
    e("fora", { dateFrom: "2026-10-20", dateTo: "2026-10-30" }),
    e("passou", { dateFrom: "2026-10-01", dateTo: "2026-10-10" }),
    e("atendido", { status: "BOOKED" }),
  ];
  const freed = { eventTypeId: "corte", hostId: "ana", start: "2026-10-14T13:00:00Z" }; // 10:00 SP
  assert.deepEqual(L.waitlistCandidates(entries, freed, SP).map((x) => x.id), ["primeiro", "segundo"]);
  assert.deepEqual(L.waitlistCandidates(entries, { ...freed, hostId: "bia", start: "2026-10-14T17:00:00Z" }, SP).map((x) => x.id), ["bia", "tarde", "primeiro", "segundo"], "14:00 com a Bia");
  assert.equal(L.dayPeriod("11:59"), "MORNING");
  assert.equal(L.dayPeriod("12:00"), "AFTERNOON");
  assert.equal(L.dayPeriod("18:00"), "EVENING");
});

test("sinal: valor, quando é exigido (tipo ou faltas) e devolução pela antecedência", () => {
  assert.equal(L.depositAmount(8000, { kind: "PERCENT", value: 50 }), 4000);
  assert.equal(L.depositAmount(3333, { kind: "PERCENT", value: 50 }), 1667, "meio para cima");
  assert.equal(L.depositAmount(3000, { kind: "FIXED", value: 5000 }), 3000, "nunca passa do preço");
  assert.equal(L.depositAmount(null, { kind: "FIXED", value: 1000 }), 0, "sem preço, sem sinal");
  assert.equal(L.depositAmount(8000, null), 0);
  assert.deepEqual(L.depositRequired({ typeDeposit: { kind: "FIXED", value: 2000 } }).reason, "TYPE");
  assert.deepEqual(L.depositRequired({ noShowCount: 2, depositAfterNoShows: 2 }), { required: true, reason: "NO_SHOWS", deposit: { kind: "PERCENT", value: 50 } });
  assert.equal(L.depositRequired({ noShowCount: 1, depositAfterNoShows: 2 }).required, false);
  assert.equal(L.depositRequired({ noShowCount: 9, depositAfterNoShows: null }).required, false, "regra desligada");
  const start = "2026-10-15T12:00:00Z";
  assert.deepEqual(L.depositRefund({ paidCents: 4000, start, canceledAt: "2026-10-14T12:00:00Z", by: "CLIENT", refundIfHoursBefore: 24 }), { refundCents: 4000, retainedCents: 0 }, "24 h antes exatas: devolve");
  assert.deepEqual(L.depositRefund({ paidCents: 4000, start, canceledAt: "2026-10-14T12:01:00Z", by: "CLIENT", refundIfHoursBefore: 24 }), { refundCents: 0, retainedCents: 4000 });
  assert.deepEqual(L.depositRefund({ paidCents: 4000, start, canceledAt: "2026-10-15T11:00:00Z", by: "TEAM" }), { refundCents: 4000, retainedCents: 0 }, "a empresa cancelou: devolve sempre");
  assert.deepEqual(L.depositRefund({ paidCents: 0, start, canceledAt: start, by: "CLIENT" }), { refundCents: 0, retainedCents: 0 });
});

test("WhatsApp: telefone BR, link com a mensagem e textos curtos", () => {
  assert.equal(L.normalizePhoneBR("(44) 99999-1234"), "5544999991234");
  assert.equal(L.normalizePhoneBR("+55 44 3222-1234"), "554432221234", "fixo");
  assert.equal(L.normalizePhoneBR("005544999991234"), "5544999991234");
  assert.equal(L.normalizePhoneBR("44 89999-1234"), null, "celular com 9 dígitos começa com 9");
  assert.equal(L.normalizePhoneBR("123"), null);
  assert.equal(L.normalizePhoneBR("(04) 99999-1234"), null, "DDD inválido");
  const txt = L.clientMessage("REMINDER", { company: "Barbearia do Zé", clientName: "Ana Souza", service: "Corte", when: "quinta, 15 de outubro, 09:00", url: "https://x.app/agendamento/t" });
  assert.equal(txt, "Ana, lembrete: Corte na Barbearia do Zé, quinta, 15 de outubro, 09:00. Confirme ou remarque: https://x.app/agendamento/t");
  assert.equal(L.waLink("44999991234", "Olá & tchau"), "https://wa.me/5544999991234?text=Ol%C3%A1%20%26%20tchau");
  assert.equal(L.waLink("abc", "x"), null);
  assert.match(L.clientMessage("PAYMENT", { company: "C", clientName: "", service: "S", when: "w", amount: "R$ 40,00" }), /^Olá, para garantir S na C \(w\), pague o sinal de R\$ 40,00:$/);
  assert.throws(() => L.clientMessage("XPTO", {}));
});

test("ficha do cliente: visitas, faltas, gasto, último atendimento, preferido, intervalo e próximo", () => {
  const a = (start, extra) => ({ start, status: "CONFIRMED", attendance: "ATTENDED", serviceName: "Corte", hostId: "ana", hostName: "Ana", amountCents: 4000, ...extra });
  const s = L.clientSummary([
    a("2026-09-01T12:00:00Z"), a("2026-09-29T12:00:00Z", { hostId: "bia", hostName: "Bia" }), a("2026-09-15T12:00:00Z"),
    a("2026-10-05T12:00:00Z", { attendance: "NO_SHOW", amountCents: 0 }), a("2026-10-06T12:00:00Z", { status: "CANCELED", attendance: null }),
    a("2026-11-01T12:00:00Z", { attendance: null, serviceName: "Barba" }),
  ], "2026-10-13T00:00:00Z");
  assert.deepEqual([s.visits, s.noShows, s.cancellations, s.spentCents, s.favoriteHostId, s.avgIntervalDays], [3, 1, 1, 12000, "ana", 14]);
  assert.deepEqual(s.lastVisit, { start: "2026-09-29T12:00:00Z", serviceName: "Corte", hostId: "bia", hostName: "Bia" }, "último é o mais recente, não o último da lista");
  assert.deepEqual(s.nextAppointment, { start: "2026-11-01T12:00:00Z", serviceName: "Barba" });
  assert.deepEqual(L.clientSummary([]), { visits: 0, noShows: 0, cancellations: 0, spentCents: 0, lastVisit: null, favoriteHostId: null, avgIntervalDays: null, nextAppointment: null });
});

test("comissão: regra mais específica, % arredondado, fixo por unidade, base do clube e extrato", () => {
  const rules = [
    { kind: "SERVICE", pct: 40 },
    { kind: "SERVICE", hostId: "bia", pct: 50 },
    { kind: "SERVICE", serviceId: "barba", fixedCents: 1000 },
    { kind: "SERVICE", hostId: "bia", serviceId: "barba", pct: 60 },
    { kind: "PRODUCT", pct: 10 },
  ];
  assert.equal(L.commissionFor({ hostId: "ana", kind: "SERVICE", serviceId: "corte", amountCents: 4000 }, rules), 1600);
  assert.equal(L.commissionFor({ hostId: "bia", kind: "SERVICE", serviceId: "corte", amountCents: 4000 }, rules), 2000, "pessoa vale mais que o padrão");
  assert.equal(L.commissionFor({ hostId: "ana", kind: "SERVICE", serviceId: "barba", amountCents: 3000 }, rules), 1000, "serviço vale mais que a pessoa");
  assert.equal(L.commissionFor({ hostId: "bia", kind: "SERVICE", serviceId: "barba", amountCents: 3000 }, rules), 1800, "pessoa + serviço vale mais que tudo");
  assert.equal(L.commissionFor({ hostId: "bia", kind: "SERVICE", serviceId: "barba", amountCents: 3000 }, rules.slice(0, 3)), 1000, "sem a regra combinada: serviço vale mais que a pessoa");
  assert.equal(L.commissionFor({ hostId: "ana", kind: "PRODUCT", amountCents: 2999 }, rules), 300, "10% de 29,99 = 2,999 → 3,00");
  assert.equal(L.commissionFor({ hostId: "ana", kind: "SERVICE", serviceId: "corte", amountCents: 0, baseCents: 4000 }, rules), 1600, "clube comissiona pela base");
  assert.equal(L.commissionFor({ hostId: "ana", kind: "SERVICE", serviceId: "barba", amountCents: 3000, qty: 2 }, rules), 2000, "fixo por unidade");
  assert.equal(L.commissionFor({ hostId: "ana", kind: "PRODUCT", amountCents: 1000 }, [{ kind: "SERVICE", pct: 40 }]), 0, "sem regra de produto");
  const st = L.commissionStatement([
    { hostId: "ana", kind: "SERVICE", serviceId: "corte", amountCents: 4000 },
    { hostId: "ana", kind: "PRODUCT", amountCents: 2000 },
    { hostId: "bia", kind: "SERVICE", serviceId: "corte", amountCents: 4000 },
  ], rules);
  assert.deepEqual(st.byHost.ana, { servicesCents: 4000, productsCents: 2000, commissionCents: 1800, lines: 2 });
  assert.equal(st.totalCommissionCents, 3800);
});

test("clube: cobre os serviços do plano, um uso por visita, esgotado, fora do período e período ancorado", () => {
  const sub = { status: "ACTIVE", periodStart: "2026-10-05", periodEnd: "2026-11-04", usesPerPeriod: 4, serviceIds: ["corte", "barba"] };
  assert.deepEqual(L.clubCoverage(sub, ["corte", "barba"], { usedInPeriod: 1, date: "2026-10-13" }), { covered: ["corte", "barba"], charged: [], usesLeft: 2 }, "corte + barba = um uso");
  assert.deepEqual(L.clubCoverage(sub, ["corte", "sobrancelha"], { usedInPeriod: 0, date: "2026-10-13" }), { covered: ["corte"], charged: ["sobrancelha"], usesLeft: 3 });
  assert.deepEqual(L.clubCoverage(sub, ["corte"], { usedInPeriod: 4, date: "2026-10-13" }), { covered: [], charged: ["corte"], usesLeft: 0, reason: "USES_EXHAUSTED" });
  assert.equal(L.clubCoverage(sub, ["corte"], { usedInPeriod: 0, date: "2026-11-05" }).reason, "OUT_OF_PERIOD");
  assert.equal(L.clubCoverage({ ...sub, status: "PAST_DUE" }, ["corte"], { date: "2026-10-13" }).reason, "SUBSCRIPTION_INACTIVE", "assinatura em atraso não cobre");
  assert.equal(L.clubCoverage(sub, ["sobrancelha"], { usedInPeriod: 0, date: "2026-10-13" }).reason, "NOT_IN_PLAN");
  assert.equal(L.clubCoverage({ ...sub, usesPerPeriod: null }, ["corte"], { usedInPeriod: 99, date: "2026-10-13" }).usesLeft, null, "ilimitado");
  assert.equal(L.clubCoverage(null, ["corte"], { date: "2026-10-13" }).reason, "NO_SUBSCRIPTION");
  assert.deepEqual(L.clubPeriodOf("2026-01-31", "2026-02-15"), { periodStart: "2026-01-31", periodEnd: "2026-02-27" });
  assert.deepEqual(L.clubPeriodOf("2026-01-31", "2026-02-28"), { periodStart: "2026-02-28", periodEnd: "2026-03-30" });
  assert.deepEqual(L.clubPeriodOf("2026-01-31", "2026-04-01"), { periodStart: "2026-03-31", periodEnd: "2026-04-29" }, "volta ao dia 31 (não escorrega para 28)");
  assert.equal(L.clubPeriodOf("2026-01-31", "2026-01-30"), null);
  assert.equal(L.addMonthsClamp("2028-01-31", 1), "2028-02-29", "ano bissexto");
  assert.equal(L.addMonthsClamp("2026-12-15", 1), "2027-01-15");
});

test("fidelidade: a cada N um grátis", () => {
  assert.deepEqual(L.loyaltyStatus({ completedCount: 4, everyN: 5 }), { stamps: 4, rewardsAvailable: 0, nextIn: 1 });
  assert.deepEqual(L.loyaltyStatus({ completedCount: 5, everyN: 5 }), { stamps: 0, rewardsAvailable: 1, nextIn: 5 });
  assert.deepEqual(L.loyaltyStatus({ completedCount: 11, redeemedCount: 1, everyN: 5 }), { stamps: 1, rewardsAvailable: 1, nextIn: 4 });
  assert.equal(L.loyaltyStatus({ completedCount: 5, redeemedCount: 3, everyN: 5 }).rewardsAvailable, 0, "nunca negativo");
  assert.equal(L.loyaltyStatus({ completedCount: 5, everyN: 1 }).nextIn, null, "regra inválida desliga");
});

test("fila do dia: previsão por ordem de chegada, profissional escolhido e quem fica livre primeiro", () => {
  const now = "2026-10-13T13:00:00Z";
  const hosts = [{ id: "ana", freeAt: "2026-10-13T13:40:00Z" }, { id: "bia", freeAt: "2026-10-13T12:00:00Z" }];
  const q = L.queueEstimate([{ id: "1", durationMin: 30 }, { id: "2", durationMin: 30, hostId: "ana" }, { id: "3", durationMin: 20 }, { id: "4", durationMin: 30 }], hosts, now);
  assert.deepEqual(q.map((x) => [x.id, x.position, x.hostId, x.etaMin]), [["1", 1, "bia", 0], ["2", 2, "ana", 40], ["3", 3, "bia", 30], ["4", 4, "bia", 50]], "o 2 espera a Ana (escolhida) mesmo com a Bia livre antes");
  assert.equal(L.queueEstimate([{ id: "x", durationMin: 30 }], [{ id: "ana", freeAt: now }, { id: "bia", freeAt: now }], now)[0].hostId, "ana", "empate: ordem da lista");
  assert.equal(q[0].startsAt, "2026-10-13T13:00:00.000Z", "livre no passado conta a partir de agora");
  assert.deepEqual(L.queueEstimate([{ id: "x", durationMin: 30 }], [], now)[0], { id: "x", position: 1, hostId: null, etaMin: null, startsAt: null });
  assert.equal(L.queueEstimate([{ id: "x", durationMin: 30, hostId: "zé" }], hosts, now)[0].hostId, "bia", "profissional que não está na lista: quem estiver livre");
});

test("clínica: convênio aceito, preço do convênio, particular e data de retorno", () => {
  const type = { id: "limpeza", name: "Limpeza", priceCents: 20000, insuranceIds: ["uni"] };
  const ins = [{ id: "uni", name: "Uniodonto", prices: { limpeza: 0 } }, { id: "amil", name: "Amil Dental" }, { id: "velho", name: "X", active: false }];
  assert.deepEqual(L.insurancePrice(type, null, ins), { ok: true, paymentKind: "PRIVATE", priceCents: 20000 });
  assert.deepEqual(L.insurancePrice(type, "uni", ins), { ok: true, paymentKind: "INSURANCE", priceCents: 0 });
  assert.equal(L.insurancePrice(type, "amil", ins).error.code, "INSURANCE_NOT_ACCEPTED");
  assert.equal(L.insurancePrice(type, "velho", ins).error.code, "INSURANCE_UNKNOWN", "convênio desligado");
  assert.equal(L.insurancePrice({ ...type, insuranceIds: ["uni"] }, "uni", [{ id: "uni", name: "U", prices: { limpeza: 5000 } }]).priceCents, 5000, "coparticipação");
  assert.equal(L.recallDate("2026-10-13", 180), "2027-04-11");
});

test("segmentos: vocabulário e o que vem ligado", () => {
  assert.equal(L.vocabulary("DENTAL").client, "paciente");
  assert.equal(L.vocabulary("BARBERSHOP").pro, "barbeiro");
  assert.equal(L.vocabulary("XPTO").service, "serviço", "desconhecido cai no geral");
  assert.ok(L.SEGMENTS.BARBERSHOP.on.includes("club") && !L.SEGMENTS.DENTAL.on.includes("club"));
  assert.ok(L.SEGMENTS.DENTAL.on.includes("insurance") && L.SEGMENTS.DENTAL.on.includes("recall"));
  for (const [k, v] of Object.entries(L.SEGMENTS)) assert.deepEqual(Object.keys(v.words).sort(), ["client", "clients", "pro", "pros", "service", "services"], k);
});
