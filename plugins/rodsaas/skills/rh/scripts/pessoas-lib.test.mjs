// Rode: node --test pessoas-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "./pessoas-lib.mjs";

const codes = (e) => e.map((x) => x.code).sort();
const day = { id: "d", name: "Dia", start: "08:00", end: "17:00", breakMinutes: 60 };
const night = { id: "n", name: "Noite", start: "22:00", end: "06:00", breakMinutes: 60 };
const late = { id: "l", name: "Tarde", start: "14:00", end: "22:00", breakMinutes: 0 };

test("datas", () => {
  assert.equal(L.isDate("2027-02-29"), false);
  assert.equal(L.isDate("2028-02-29"), true);
  assert.equal(L.addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(L.addMonths("2027-12-10", 2), "2028-02-10");
  assert.equal(L.weekday("2027-03-07"), 0);
});

test("escala: turnos", () => {
  assert.deepEqual(L.validateShift(day), []);
  assert.deepEqual(L.validateShift(night), []);
  assert.equal(L.shiftMinutes(day), 480);
  assert.equal(L.shiftMinutes(night), 420, "vira a noite");
  assert.equal(L.shiftMinutes({ start: "08:00", end: "12:00" }), 240);
  assert.deepEqual(codes(L.validateShift({ name: " ", start: "8:00", end: "25:00", breakMinutes: 300 })), ["BREAK_INVALID", "NAME_REQUIRED", "TIME_INVALID", "TIME_INVALID"]);
  assert.deepEqual(codes(L.validateShift({ name: "Longo", start: "06:00", end: "19:00", breakMinutes: 0 })), ["DURATION_INVALID"]);
  assert.deepEqual(L.validateShift({ name: "12h", start: "06:00", end: "18:00", breakMinutes: 0 }), []);
  assert.deepEqual(codes(L.validateShift({ name: "Zero", start: "08:00", end: "09:00", breakMinutes: 60 })), ["DURATION_INVALID"]);
  assert.deepEqual(L.validateShift({ name: "Sem intervalo", start: "08:00", end: "12:00" }), []);
  assert.deepEqual(L.validateShift({ name: "Máx", start: "08:00", end: "12:00", breakMinutes: 240 }).map((e) => e.code), ["DURATION_INVALID"]);
  assert.deepEqual(L.validateShift({ name: "Limite", start: "08:00", end: "13:00", breakMinutes: 240 }), []);
});

test("escala: conflitos", () => {
  const A = (date, shift, employeeId = "e1") => ({ employeeId, date, shift });
  assert.deepEqual(L.scheduleConflicts([A("2027-03-01", day), A("2027-03-02", day)]), []);
  assert.deepEqual(L.scheduleConflicts([A("2027-03-01", day), A("2027-03-01", late)]), [{ code: "OVERLAP", employeeId: "e1", date: "2027-03-01" }]);
  assert.deepEqual(L.scheduleConflicts([A("2027-03-01", late), A("2027-03-02", day)]), [{ code: "REST_BETWEEN", employeeId: "e1", date: "2027-03-02" }], "22h → 8h = 10 h");
  assert.deepEqual(L.scheduleConflicts([A("2027-03-01", late), A("2027-03-02", day)], { minRestHours: 10 }), []);
  assert.deepEqual(L.scheduleConflicts([A("2027-03-01", night), A("2027-03-02", day)]), [{ code: "REST_BETWEEN", employeeId: "e1", date: "2027-03-02" }], "noite até 6h e dia às 8h: descanso curto");
  assert.deepEqual(L.scheduleConflicts([A("2027-03-01", night), A("2027-03-02", { ...late, start: "17:00", end: "23:00" })]), []);
  assert.deepEqual(L.scheduleConflicts([A("2027-03-01", day), A("2027-03-01", late, "e2")]), [], "pessoas diferentes");
  assert.deepEqual(L.scheduleConflicts([A("2027-03-01", day), A("2027-03-01", { id: "x", start: "16:30", end: "20:00" })]).map((c) => c.code), ["OVERLAP"], "meia hora já cruza");
  assert.deepEqual(L.scheduleConflicts([A("2027-03-01", day), A("2027-03-01", late)], { maxWeeklyMinutes: 600 }), [{ code: "OVERLAP", employeeId: "e1", date: "2027-03-01" }, { code: "WEEKLY_LIMIT", employeeId: "e1", date: "2027-03-01" }], "um aviso por dia");
  assert.deepEqual(L.scheduleConflicts([A("2027-03-05", day)], { leaves: [{ employeeId: "e1", start: "2027-03-02", end: "2027-03-03" }, { employeeId: "e2", start: "2027-03-01", end: "2027-03-09" }] }), [], "ausência de outra pessoa");
  assert.deepEqual(L.scheduleConflicts([A("2027-03-03", day)], { leaves: [{ employeeId: "e1", start: "2027-03-02", end: "2027-03-03" }, { employeeId: "e2", start: "2027-03-01", end: "2027-03-09" }] }), [{ code: "ON_LEAVE", employeeId: "e1", date: "2027-03-03" }]);
  assert.deepEqual(L.scheduleConflicts([A("2027-03-04", day)], { leaves: [{ employeeId: "e1", start: "2027-03-02", end: "2027-03-03" }] }), []);
  const six = ["01", "02", "03", "04", "05", "06"].map((d) => A("2027-03-" + d, day));
  assert.deepEqual(L.scheduleConflicts(six), [{ code: "WEEKLY_LIMIT", employeeId: "e1", date: "2027-03-01" }, { code: "WEEKLY_LIMIT", employeeId: "e1", date: "2027-03-02" }, { code: "WEEKLY_LIMIT", employeeId: "e1", date: "2027-03-03" }, { code: "WEEKLY_LIMIT", employeeId: "e1", date: "2027-03-04" }, { code: "WEEKLY_LIMIT", employeeId: "e1", date: "2027-03-05" }, { code: "WEEKLY_LIMIT", employeeId: "e1", date: "2027-03-06" }], "6 × 8 h = 48 h");
  assert.deepEqual(L.scheduleConflicts(six, { maxWeeklyMinutes: 48 * 60 }), []);
  const short = { ...day, end: "13:00", breakMinutes: 0 };
  const seven = ["01", "02", "03", "04", "05", "06", "07"].map((d) => A("2027-03-" + d, short));
  assert.deepEqual(L.scheduleConflicts(seven), [{ code: "NO_WEEKLY_REST", employeeId: "e1", date: "2027-03-07" }]);
  assert.deepEqual(L.scheduleConflicts(seven.filter((a) => a.date !== "2027-03-04")), [], "folga no meio zera a sequência");
  assert.deepEqual(L.scheduleConflicts(["01", "02", "03", "05", "06", "07", "08", "09"].map((d) => A("2027-03-" + d, short))), [], "8 dias com uma folga no meio");
  const eight = [...seven, A("2027-03-08", short)];
  assert.deepEqual(L.scheduleConflicts(eight).map((c) => c.date), ["2027-03-07", "2027-03-08"]);
  assert.deepEqual(L.scheduleConflicts([A("2027-03-07", day), A("2027-03-08", day)]), [], "semanas diferentes");
  const needs = [{ date: "2027-03-01", shiftId: "d", min: 2 }, { date: "2027-03-01", shiftId: "n", min: 1 }];
  assert.deepEqual(L.coverageGaps([A("2027-03-01", day), A("2027-03-01", night, "e2"), A("2027-03-02", day, "e3")], needs), [{ date: "2027-03-01", shiftId: "d", min: 2, have: 1 }]);
  assert.deepEqual(L.coverageGaps([A("2027-03-01", day), A("2027-03-01", day, "e2"), A("2027-03-01", night, "e3")], needs), []);
});

test("recrutamento", () => {
  assert.equal(L.canMoveCandidate("APPLIED", "SCREENING"), true);
  assert.equal(L.canMoveCandidate("APPLIED", "HIRED"), false);
  assert.equal(L.canMoveCandidate("OFFER", "HIRED"), true);
  assert.equal(L.canMoveCandidate("HIRED", "REJECTED"), false);
  assert.equal(L.canMoveCandidate("REJECTED", "APPLIED"), true);
  assert.equal(L.canMoveCandidate("INTERVIEW", "REJECTED"), true);
  assert.equal(L.canMoveCandidate("X", "APPLIED"), false);
  const job = { questions: [{ id: "q1", label: "Disponibilidade aos sábados?", required: true }, { id: "q2", label: "Portfólio", required: false }] };
  assert.deepEqual(L.validateApplication({ name: "Ana Souza", email: "ana@x.com", phone: "(11) 98888-7777", answers: { q1: "Sim" }, consent: true }, job), []);
  assert.deepEqual(codes(L.validateApplication({ name: "Ana", email: "x", phone: "123", answers: { q1: " " }, consent: false }, job)), ["ANSWER_REQUIRED", "CONSENT_REQUIRED", "EMAIL_INVALID", "NAME_REQUIRED", "PHONE_INVALID"]);
  assert.deepEqual(L.validateApplication({ name: "Ana Souza", email: "ana@x.com", consent: true }, {}), []);
  const list = [{ email: "Ana@X.com", phone: "11988887777" }, { email: "b@x.com", phone: null }];
  assert.equal(L.findDuplicate(list, { email: "ana@x.com" }), list[0]);
  assert.equal(L.findDuplicate(list, { email: "outra@x.com", phone: "(11) 98888-7777" }), list[0]);
  assert.equal(L.findDuplicate(list, { email: "c@x.com", phone: "11977776666" }), null);
  assert.equal(L.findDuplicate([{ email: "b@x.com", phone: null }], { email: "c@x.com", phone: null }), null);
  const f = L.recruitingFunnel([
    { stage: "HIRED", history: ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED"], appliedAt: "2027-03-01T10:00:00Z", hiredAt: "2027-03-21T10:00:00Z" },
    { stage: "HIRED", history: ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED"], appliedAt: "2027-03-01T10:00:00Z", hiredAt: "2027-03-11T10:00:00Z" },
    { stage: "HIRED", history: ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED"], appliedAt: "2027-03-01T10:00:00Z", hiredAt: "2027-03-31T10:00:00Z" },
    { stage: "REJECTED", history: ["APPLIED", "SCREENING", "INTERVIEW", "REJECTED"] },
    { stage: "APPLIED" },
  ]);
  assert.deepEqual(f, { reached: { APPLIED: 5, SCREENING: 4, INTERVIEW: 4, OFFER: 3, HIRED: 3 }, timeToHireDays: 20 });
  assert.equal(L.recruitingFunnel([{ stage: "HIRED", history: ["APPLIED", "HIRED"], appliedAt: "2027-03-01T00:00:00Z", hiredAt: "2027-03-05T00:00:00Z" }, { stage: "HIRED", history: ["APPLIED", "HIRED"], appliedAt: "2027-03-01T00:00:00Z", hiredAt: "2027-03-11T00:00:00Z" }]).timeToHireDays, 7);
  assert.deepEqual(L.recruitingFunnel([]), { reached: { APPLIED: 0, SCREENING: 0, INTERVIEW: 0, OFFER: 0, HIRED: 0 }, timeToHireDays: null });
});

test("comunicados com ciência", () => {
  assert.deepEqual(L.validateAnnouncement({ title: "Nova política", body: "Leia", audience: { all: true }, requireAck: true, ackDueDate: "2027-03-10" }, { today: "2027-03-01" }), []);
  assert.deepEqual(codes(L.validateAnnouncement({ title: " ", body: "", audience: {}, ackDueDate: "2027-02-01" }, { today: "2027-03-01" })), ["ACK_DUE_WITHOUT_ACK", "AUDIENCE_REQUIRED", "BODY_REQUIRED", "DATE_INVALID", "TITLE_REQUIRED"]);
  assert.deepEqual(L.validateAnnouncement({ title: "T", body: "B", audience: { areaIds: ["a1"] }, requireAck: true, ackDueDate: "2027-03-01" }, { today: "2027-03-01" }), [], "hoje vale");
  assert.deepEqual(codes(L.validateAnnouncement({ title: "T", body: "B", audience: { areaIds: [] } })), ["AUDIENCE_REQUIRED"]);
  assert.deepEqual(codes(L.validateAnnouncement({ title: "T", body: "B", audience: { all: true }, requireAck: true, ackDueDate: "01/03/2027" })), ["DATE_INVALID"]);
  const emps = [{ id: "e1", areaId: "a1", locationId: "l1" }, { id: "e2", areaId: "a2", locationId: "l1" }, { id: "e3", areaId: "a2", locationId: "l2" }, { id: "e4", areaId: "a1", locationId: "l2", status: "TERMINATED" }];
  assert.deepEqual(L.audienceOf({ audience: { all: true } }, emps), ["e1", "e2", "e3"]);
  assert.deepEqual(L.audienceOf({ audience: { areaIds: ["a1"] } }, emps), ["e1"]);
  assert.deepEqual(L.audienceOf({ audience: { locationIds: ["l2"], employeeIds: ["e1"] } }, emps), ["e1", "e3"]);
  const a = { audience: { all: true }, ackDueDate: "2027-03-10" };
  assert.deepEqual(L.ackStatus(a, [{ employeeId: "e1" }, { employeeId: "e4" }], emps, "2027-03-05"), { total: 3, acked: 1, pending: ["e2", "e3"], overdue: false, pct: 33 });
  assert.equal(L.ackStatus(a, [{ employeeId: "e1" }], emps, "2027-03-11").overdue, true);
  assert.equal(L.ackStatus(a, [{ employeeId: "e1" }], emps, "2027-03-10").overdue, false, "no dia do prazo ainda não");
  assert.equal(L.ackStatus(a, ["e1", "e2", "e3"].map((employeeId) => ({ employeeId })), emps, "2027-03-11").overdue, false);
  assert.equal(L.ackStatus({ audience: { all: true } }, [], emps, "2027-03-11").overdue, false, "sem prazo");
  assert.equal(L.ackStatus({ audience: { employeeIds: [] , areaIds: ["zz"] } }, [], emps, "2027-03-11").pct, null);
});

test("treinamentos com validade", () => {
  assert.equal(L.expiresOn("2025-03-15", 24), "2027-03-14");
  assert.equal(L.expiresOn("2024-01-31", 1), "2024-02-28");
  assert.equal(L.expiresOn("2025-03-15", null), null);
  const nr35 = { id: "t1", validityMonths: 24 }, integ = { id: "t2", validityMonths: null };
  assert.deepEqual(L.trainingStatus(null, nr35, "2027-03-01"), { status: "missing", expiresOn: null });
  assert.deepEqual(L.trainingStatus({ completedOn: "2025-03-15" }, nr35, "2027-03-01"), { status: "expiring", expiresOn: "2027-03-14" });
  assert.deepEqual(L.trainingStatus({ completedOn: "2025-03-15" }, nr35, "2027-02-11"), { status: "valid", expiresOn: "2027-03-14" });
  assert.deepEqual(L.trainingStatus({ completedOn: "2025-03-15" }, nr35, "2027-02-12"), { status: "expiring", expiresOn: "2027-03-14" }, "faltando 30 dias");
  assert.deepEqual(L.trainingStatus({ completedOn: "2025-03-15" }, nr35, "2027-03-14"), { status: "expiring", expiresOn: "2027-03-14" }, "vale até o último dia");
  assert.deepEqual(L.trainingStatus({ completedOn: "2025-03-15" }, nr35, "2027-03-15"), { status: "expired", expiresOn: "2027-03-14" });
  assert.deepEqual(L.trainingStatus({ completedOn: "2020-01-01" }, integ, "2027-03-15"), { status: "valid", expiresOn: null });
  assert.equal(L.trainingStatus({ completedOn: "2025-03-15" }, nr35, "2027-02-20", 7).status, "valid");
  const rules = [{ trainingId: "t2", all: true }, { trainingId: "t1", positionIds: ["eletricista"] }, { trainingId: "t1", areaIds: ["manut"] }];
  assert.deepEqual(L.requiredFor({ positionId: "eletricista", areaId: "x" }, rules), ["t2", "t1"]);
  assert.deepEqual(L.requiredFor({ positionId: "aux", areaId: "manut" }, rules), ["t2", "t1"]);
  assert.deepEqual(L.requiredFor({ positionId: "aux", areaId: "adm" }, rules), ["t2"]);
  const emps = [{ id: "e1", positionId: "eletricista" }, { id: "e2", positionId: "aux" }, { id: "e3", positionId: "eletricista", status: "TERMINATED" }];
  const recs = [{ employeeId: "e1", trainingId: "t1", completedOn: "2023-01-10" }, { employeeId: "e1", trainingId: "t1", completedOn: "2026-01-10" }, { employeeId: "e1", trainingId: "t2", completedOn: "2020-01-01" }];
  const m = L.complianceMatrix(emps, [nr35, integ], recs, rules, "2027-03-01");
  assert.deepEqual(m, [
    { employeeId: "e1", items: [{ trainingId: "t2", status: "valid", expiresOn: null }, { trainingId: "t1", status: "valid", expiresOn: "2028-01-09" }], ok: true },
    { employeeId: "e2", items: [{ trainingId: "t2", status: "missing", expiresOn: null }], ok: false },
  ]);
  assert.equal(L.complianceMatrix([emps[0]], [nr35, integ], recs.slice(0, 1).concat(recs[2]), rules, "2027-03-01")[0].ok, false, "vencido não está ok");
  assert.equal(L.complianceMatrix([emps[0]], [nr35, integ], [{ employeeId: "e1", trainingId: "t1", completedOn: "2025-03-15" }, recs[2]], rules, "2027-03-01")[0].ok, true, "vencendo ainda está ok");
});

test("mural de celebrações", () => {
  const people = [
    { id: "a", birthDate: "1990-03-01", admissionDate: "2020-03-01" },
    { id: "b", birthDate: "1985-03-01", hideBirthday: true, admissionDate: "2027-03-01" },
    { id: "c", birthDate: "1992-02-29", admissionDate: "2024-02-29" },
    { id: "d", birthDate: "1990-03-01", status: "TERMINATED" },
    { id: "e", birthDate: "1990-03-02" },
  ];
  assert.deepEqual(L.celebrationsOn(people, "2027-03-01"), [{ type: "birthday", employeeId: "a" }, { type: "anniversary", employeeId: "a", years: 7 }]);
  assert.deepEqual(L.celebrationsOn(people, "2027-02-28"), [{ type: "birthday", employeeId: "c" }, { type: "anniversary", employeeId: "c", years: 3 }], "29/02 comemora em 28/02");
  assert.deepEqual(L.celebrationsOn(people, "2028-02-28"), [], "no bissexto, só no dia 29");
  assert.deepEqual(L.celebrationsOn(people, "2028-02-29"), [{ type: "birthday", employeeId: "c" }, { type: "anniversary", employeeId: "c", years: 4 }]);
  assert.deepEqual(L.celebrationsOn([{ id: "x", admissionDate: "2027-03-01" }], "2027-03-01"), [], "admitido hoje não faz aniversário de casa");
});

test("perfil indústria: EPI e NR", () => {
  assert.ok(L.NR_TRAININGS.some((n) => n.code === "NR-35" && n.validityMonths === 24));
  const cat = [{ id: "bota", ca: "12345", caExpiresOn: "2027-12-31", lifeDays: 180 }, { id: "luva", ca: "4321", caExpiresOn: "2027-02-01", lifeDays: 30 }, { id: "sem", ca: null, caExpiresOn: null }, { id: "oculos", ca: "5555", caExpiresOn: "2027-12-31" }];
  assert.deepEqual(L.validateEpiDelivery({ deliveredOn: "2027-03-01", items: [{ epiId: "bota", qty: 1 }], signature: true }, cat, { today: "2027-03-01" }), []);
  assert.deepEqual(L.validateEpiDelivery({ deliveredOn: "2027-03-01", items: [{ epiId: "bota", qty: 1 }], signatureFileId: "f" }, cat), []);
  assert.deepEqual(codes(L.validateEpiDelivery({ deliveredOn: "2027-03-02", items: [{ epiId: "luva", qty: 0 }, { epiId: "sem", qty: 1 }, { epiId: "x", qty: 1 }] }, cat, { today: "2027-03-01" })), ["CA_EXPIRED", "CA_REQUIRED", "DATE_INVALID", "EPI_INVALID", "QTY_INVALID", "SIGNATURE_REQUIRED"]);
  assert.deepEqual(codes(L.validateEpiDelivery({ deliveredOn: "2027-02-01", items: [{ epiId: "luva", qty: 2 }], signature: true }, cat)), [], "CA vale no último dia");
  assert.deepEqual(codes(L.validateEpiDelivery({ deliveredOn: "2027-03-01", items: [], signature: true }, cat)), ["ITEMS_REQUIRED"]);
  assert.deepEqual(codes(L.validateEpiDelivery({ deliveredOn: "2027-03-01", items: [{ epiId: "bota", qty: 101 }], signature: true }, cat)), ["QTY_INVALID"]);
  const dels = [
    { employeeId: "e1", deliveredOn: "2026-09-01", items: [{ epiId: "bota", qty: 1 }] },
    { employeeId: "e1", deliveredOn: "2027-02-10", items: [{ epiId: "luva", qty: 1 }, { epiId: "oculos", qty: 1 }] },
    { employeeId: "e2", deliveredOn: "2026-06-01", items: [{ epiId: "bota", qty: 1 }] },
    { employeeId: "e2", deliveredOn: "2027-02-25", items: [{ epiId: "bota", qty: 1 }] },
  ];
  assert.deepEqual(L.epiReplacements(dels, cat, "2027-03-01"), [{ employeeId: "e1", epiId: "bota", dueOn: "2027-02-28", overdue: true }, { employeeId: "e1", epiId: "luva", dueOn: "2027-03-12", overdue: false }]);
  assert.deepEqual(L.epiReplacements(dels, cat, "2027-03-01", 5).map((x) => x.epiId), ["bota"]);
  assert.deepEqual(L.epiReplacements([...dels].reverse(), cat, "2027-03-01"), L.epiReplacements(dels, cat, "2027-03-01"), "vale a última entrega, em ordem de vencimento");
  assert.deepEqual(L.epiReplacements(dels, cat, "2027-02-28").find((x) => x.epiId === "bota").overdue, false, "no dia ainda não venceu");
});

test("perfil saúde: registro no conselho", () => {
  assert.deepEqual(L.validateCouncil({ council: "COREN", number: "123456", uf: "SP", expiresOn: "2027-12-31" }), []);
  assert.deepEqual(L.validateCouncil({ council: "CRM", number: "52-12345", uf: "RJ" }).map((e) => e.code), ["NUMBER_INVALID"]);
  assert.deepEqual(L.validateCouncil({ council: "CRO", number: "12345-ab", uf: "MG" }), []);
  assert.deepEqual(codes(L.validateCouncil({ council: "OAB", number: "", uf: "XX", expiresOn: "31/12/2027" })), ["COUNCIL_INVALID", "DATE_INVALID", "NUMBER_INVALID", "UF_INVALID"]);
  assert.equal(L.councilStatus(null, "2027-03-01"), "missing");
  assert.equal(L.councilStatus({ expiresOn: null }, "2027-03-01"), "active");
  assert.equal(L.councilStatus({ expiresOn: "2027-03-01" }, "2027-03-01"), "expiring");
  assert.equal(L.councilStatus({ expiresOn: "2027-03-31" }, "2027-03-01"), "expiring");
  assert.equal(L.councilStatus({ expiresOn: "2027-04-01" }, "2027-03-01"), "active");
  assert.equal(L.councilStatus({ expiresOn: "2027-02-28" }, "2027-03-01"), "expired");
  assert.equal(L.councilStatus({ expiresOn: "2027-03-10" }, "2027-03-01", 5), "active");
  assert.equal(L.canAttend({ requiresCouncil: false }, "2027-03-01"), true);
  assert.equal(L.canAttend({ requiresCouncil: true, council: null }, "2027-03-01"), false);
  assert.equal(L.canAttend({ requiresCouncil: true, council: { expiresOn: "2027-02-28" } }, "2027-03-01"), false);
  assert.equal(L.canAttend({ requiresCouncil: true, council: { expiresOn: "2027-03-05" } }, "2027-03-01"), true);
});

test("perfil varejo: rodízio de folgas e folguista", () => {
  const r = L.rotateDaysOff(["a", "b", "c", "d"], { start: "2027-03-01", weeks: 3 });
  assert.deepEqual(r, { a: ["2027-03-07", "2027-03-09", "2027-03-17"], b: ["2027-03-02", "2027-03-14", "2027-03-18"], c: ["2027-03-03", "2027-03-11", "2027-03-21"], d: ["2027-03-07", "2027-03-12", "2027-03-20"] });
  for (const dates of Object.values(r)) assert.ok(dates.some((d) => L.weekday(d) === 0), "domingo a cada 3 semanas");
  assert.deepEqual(L.rotateDaysOff(["a", "b"], { start: "2027-03-01", weeks: 2, sundayEvery: 2 }), { a: ["2027-03-07", "2027-03-09"], b: ["2027-03-02", "2027-03-14"] });
  assert.deepEqual(L.rotateDaysOff(["a"], { start: "2027-03-01", weeks: 2, sundayEvery: 2, workDays: [3, 4] }), { a: ["2027-03-07", "2027-03-11"] });
  const plan = L.folguistaPlan(r, ["d"]);
  assert.deepEqual(plan["2027-03-02"], [{ employeeId: "b", coveredBy: "d" }]);
  assert.deepEqual(plan["2027-03-07"], [{ employeeId: "a", coveredBy: null }], "folguista de folga não cobre");
  assert.deepEqual(plan["2027-03-12"], [], "folga do próprio folguista não precisa de cobertura");
  assert.deepEqual(L.folguistaPlan({ a: ["2027-03-02"], b: ["2027-03-02"], c: ["2027-03-02"] }, ["f1", "f2"])["2027-03-02"], [{ employeeId: "a", coveredBy: "f1" }, { employeeId: "b", coveredBy: "f2" }, { employeeId: "c", coveredBy: null }]);
  assert.deepEqual(L.sundayGaps(r), []);
  assert.deepEqual(L.sundayGaps({ x: ["2027-03-02", "2027-03-09", "2027-03-16", "2027-03-23"], y: ["2027-03-02", "2027-03-14", "2027-03-16", "2027-03-23"], z: [] }), ["x"]);
  assert.deepEqual(L.sundayGaps({ x: ["2027-03-02", "2027-03-09", "2027-03-16"] }), [], "3 semanas ainda cabem");
  assert.deepEqual(L.sundayGaps({ x: ["2027-03-02", "2027-03-09", "2027-03-16", "2027-03-23"] }, { sundayEvery: 4 }), []);
});

test("perfis de segmento", () => {
  assert.deepEqual(Object.keys(L.PEOPLE_SEGMENTS), ["GENERAL", "INDUSTRY", "HEALTH", "RETAIL"]);
  assert.ok(L.peopleSegment("INDUSTRY").on.includes("epi"));
  assert.ok(L.peopleSegment("HEALTH").on.includes("council_registration"));
  assert.ok(L.peopleSegment("RETAIL").on.includes("folguista"));
  assert.equal(L.peopleSegment("RETAIL").words.location, "loja");
  assert.equal(L.peopleSegment("x").id, "GENERAL");
  assert.deepEqual(L.peopleSegment().on, []);
  assert.equal(L.peopleSegment("HEALTH").id, "HEALTH");
});
