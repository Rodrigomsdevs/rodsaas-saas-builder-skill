// Rode: node --test tarefas-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as T from "./tarefas-lib.mjs";

const codes = (e) => e.map((x) => x.code).sort();

test("datas e dia útil", () => {
  assert.equal(T.isDate("2026-02-29"), false);
  assert.equal(T.isDate("2028-02-29"), true);
  assert.equal(T.isDate("2026-1-05"), false);
  assert.equal(T.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(T.addMonths("2026-02-28", 1, 31), "2026-03-31");
  assert.equal(T.addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(T.weekday("2026-10-15"), 4);
  assert.equal(T.diffDays("2026-10-15", "2026-10-20"), 5);
  assert.equal(T.adjustBusinessDay("2026-10-17", "after"), "2026-10-19");
  assert.equal(T.adjustBusinessDay("2026-10-17", "before"), "2026-10-16");
  assert.equal(T.adjustBusinessDay("2026-10-17", "keep"), "2026-10-17");
  assert.equal(T.adjustBusinessDay("2026-10-17", "after", ["2026-10-19"]), "2026-10-20");
  assert.equal(T.adjustBusinessDay("2026-10-19", "before", ["2026-10-19"]), "2026-10-16");
  assert.equal(T.addBusinessDays("2026-10-16", 1), "2026-10-19");
  assert.equal(T.addBusinessDays("2026-10-19", -1), "2026-10-16");
  assert.equal(T.addBusinessDays("2026-10-15", 3, ["2026-10-16"]), "2026-10-21");
  assert.equal(T.addBusinessDays("2026-10-15", 0), "2026-10-15");
  assert.equal(T.businessDaysBetween("2026-10-12", "2026-10-18"), 5);
  assert.equal(T.businessDaysBetween("2026-10-12", "2026-10-18", ["2026-10-12"]), 4);
});

test("recorrência: validação", () => {
  assert.deepEqual(T.validateRecurrence({ freq: "weekly", weekdays: [1, 3], interval: 2 }), []);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "hourly" })), ["FREQ_INVALID"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "daily", interval: 0 })), ["INTERVAL_INVALID"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "daily", interval: 100 })), ["INTERVAL_INVALID"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "monthly", weekdays: [1] })), ["WEEKDAYS_INVALID"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "weekly", weekdays: [7] })), ["WEEKDAYS_INVALID"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "weekly", weekdays: [] })), ["WEEKDAYS_INVALID"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "monthly", monthDay: 32 })), ["MONTHDAY_INVALID"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "weekly", monthDay: 5 })), ["MONTHDAY_INVALID"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "monthly", nth: { n: 5, weekday: 2 } })), ["NTH_INVALID"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "monthly", nth: { n: -1, weekday: 7 } })), ["NTH_INVALID"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "monthly", monthDay: 5, nth: { n: 1, weekday: 1 } })), ["MONTHLY_AMBIGUOUS"]);
  assert.deepEqual(codes(T.validateRecurrence({ freq: "daily", mode: "x", onNonBusiness: "y", until: "2026-02-30", count: 0 })), ["ADJUST_INVALID", "COUNT_INVALID", "DATE_INVALID", "MODE_INVALID"]);
  assert.deepEqual(T.validateRecurrence({ freq: "monthly", nth: { n: -1, weekday: 5 }, mode: "after_done", onNonBusiness: "before", until: "2027-01-01", count: 1000 }), []);
});

test("recorrência: próximo vencimento", () => {
  const nd = T.nextDue;
  assert.equal(nd({ freq: "daily", interval: 2 }, { currentDue: "2026-10-15" }), "2026-10-17");
  assert.equal(nd({ freq: "daily", interval: 2, onNonBusiness: "after" }, { currentDue: "2026-10-15" }), "2026-10-19");
  assert.equal(nd({ freq: "daily", interval: 2, onNonBusiness: "before" }, { currentDue: "2026-10-15" }), "2026-10-16");
  // semanal seg/qua/sex
  const w = { freq: "weekly", weekdays: [5, 1, 3] };
  assert.equal(nd(w, { currentDue: "2026-10-15" }), "2026-10-16");
  assert.equal(nd(w, { currentDue: "2026-10-16" }), "2026-10-19");
  assert.equal(nd(w, { currentDue: "2026-10-19" }), "2026-10-21");
  assert.equal(nd({ ...w, interval: 2 }, { currentDue: "2026-10-16" }), "2026-10-26");
  assert.equal(nd({ ...w, interval: 2 }, { currentDue: "2026-10-14" }), "2026-10-16");
  assert.equal(nd({ freq: "weekly" }, { currentDue: "2026-10-15" }), "2026-10-22");
  assert.equal(nd({ freq: "weekly", interval: 3 }, { currentDue: "2026-10-15" }), "2026-11-05");
  // mensal
  assert.equal(nd({ freq: "monthly", monthDay: 31 }, { currentDue: "2026-01-31" }), "2026-02-28");
  assert.equal(nd({ freq: "monthly", monthDay: 31 }, { currentDue: "2026-02-28" }), "2026-03-31");
  assert.equal(nd({ freq: "monthly" }, { currentDue: "2026-02-28", start: "2026-01-30" }), "2026-03-30");
  assert.equal(nd({ freq: "monthly", interval: 3 }, { currentDue: "2026-11-10" }), "2027-02-10");
  assert.equal(nd({ freq: "monthly", nth: { n: 2, weekday: 2 } }, { currentDue: "2026-10-13" }), "2026-11-10");
  assert.equal(nd({ freq: "monthly", nth: { n: 1, weekday: 0 } }, { currentDue: "2026-10-04" }), "2026-11-01");
  assert.equal(nd({ freq: "monthly", nth: { n: -1, weekday: 5 } }, { currentDue: "2026-10-30" }), "2026-11-27");
  assert.equal(nd({ freq: "monthly", nth: { n: -1, weekday: 1 } }, { currentDue: "2026-10-26" }), "2026-11-30");
  assert.equal(nd({ freq: "monthly", monthDay: 20, onNonBusiness: "after" }, { currentDue: "2026-10-20", holidays: ["2026-11-20"] }), "2026-11-23");
  assert.equal(nd({ freq: "monthly", monthDay: 20, onNonBusiness: "after" }, { currentDue: "2026-11-23" }), "2026-12-21");
  // anual
  assert.equal(nd({ freq: "yearly" }, { currentDue: "2028-02-29" }), "2029-02-28");
  assert.equal(nd({ freq: "yearly" }, { currentDue: "2029-02-28", start: "2028-02-29" }), "2030-02-28");
  assert.equal(nd({ freq: "yearly" }, { currentDue: "2031-02-28", start: "2028-02-29" }), "2032-02-29");
  assert.equal(nd({ freq: "yearly", interval: 4 }, { currentDue: "2029-02-28", start: "2028-02-29" }), "2033-02-28");
  // depois de concluir
  assert.equal(nd({ freq: "daily", interval: 7, mode: "after_done" }, { currentDue: "2026-10-15", doneOn: "2026-10-20" }), "2026-10-27");
  assert.equal(nd({ freq: "daily", interval: 7 }, { currentDue: "2026-10-15", doneOn: "2026-10-20" }), "2026-10-22");
  assert.equal(nd({ freq: "daily", interval: 7, mode: "after_done" }, { currentDue: "2026-10-15" }), "2026-10-22");
  // fim
  assert.equal(nd({ freq: "daily", count: 3 }, { currentDue: "2026-10-15", occurrence: 3 }), null);
  assert.equal(nd({ freq: "daily", count: 3 }, { currentDue: "2026-10-15", occurrence: 2 }), "2026-10-16");
  assert.equal(nd({ freq: "daily", until: "2026-10-16" }, { currentDue: "2026-10-15" }), "2026-10-16");
  assert.equal(nd({ freq: "daily", until: "2026-10-16" }, { currentDue: "2026-10-16" }), null);
  assert.equal(nd({ freq: "daily", until: "2026-10-17", onNonBusiness: "after" }, { currentDue: "2026-10-16" }), null);
});

test("modelos", () => {
  const t = { tasks: [
    { key: "kickoff", title: "Reunião inicial", offsetDays: 0, checklist: ["Pauta", { text: "Foto do local", requirePhoto: true }] },
    { key: "briefing", title: "Briefing", offsetDays: 2, businessDays: true, durationDays: 3, assigneeRole: "ADMIN", dependsOn: ["kickoff"], subtasks: [{ title: "Coletar logos", offsetDays: 1 }, { title: "Sem prazo próprio" }] },
    { key: "entrega", title: "Entrega", offsetDays: 2, dependsOn: ["briefing"] },
  ] };
  assert.deepEqual(T.validateTemplate(t), []);
  assert.deepEqual(codes(T.validateTemplate({ tasks: [] })), ["TASKS_REQUIRED"]);
  assert.deepEqual(codes(T.validateTemplate({})), ["TASKS_REQUIRED"]);
  assert.deepEqual(codes(T.validateTemplate({ tasks: [{ key: "a", title: "A", offsetDays: 0 }, { key: "a", title: " ", offsetDays: -1 }] })), ["KEY_INVALID", "OFFSET_INVALID", "TITLE_REQUIRED"]);
  assert.deepEqual(codes(T.validateTemplate({ tasks: [{ key: "A-1", title: "A", offsetDays: 3651 }] })), ["KEY_INVALID", "OFFSET_INVALID"]);
  assert.deepEqual(codes(T.validateTemplate({ tasks: [{ key: "a", title: "A", offsetDays: 1.5, dependsOn: ["a"] }, { key: "b", title: "B", offsetDays: 0, dependsOn: ["zz"] }] })), ["DEPENDENCY_INVALID", "DEPENDENCY_INVALID", "OFFSET_INVALID"]);
  const out = T.instantiateTemplate(t, { startDate: "2026-10-16" });
  assert.deepEqual(out.map((x) => [x.key, x.startDate, x.dueDate]), [["kickoff", null, "2026-10-16"], ["briefing", "2026-10-18", "2026-10-20"], ["entrega", null, "2026-10-18"]]);
  assert.deepEqual(out[0].checklist, [{ text: "Pauta", requirePhoto: false }, { text: "Foto do local", requirePhoto: true }]);
  assert.deepEqual(out[1].subtasks, [{ title: "Coletar logos", dueDate: "2026-10-17" }, { title: "Sem prazo próprio", dueDate: "2026-10-18" }]);
  assert.equal(out[1].assigneeRole, "ADMIN");
  assert.equal(out[0].assigneeRole, null);
  assert.deepEqual(out[2].dependsOn, ["briefing"]);
  assert.deepEqual(out[0].dependsOn, []);
  // início no sábado: dias úteis contam a partir de segunda
  const sat = T.instantiateTemplate({ tasks: [{ key: "a", title: "A", offsetDays: 0, businessDays: true }, { key: "b", title: "B", offsetDays: 1, businessDays: true }] }, { startDate: "2026-10-17", holidays: ["2026-10-20"] });
  assert.deepEqual(sat.map((x) => x.dueDate), ["2026-10-19", "2026-10-21"]);
});

test("campos personalizados", () => {
  const defs = [
    { key: "cnpj", label: "CNPJ", type: "text", required: true },
    { key: "horas", label: "Horas", type: "number" },
    { key: "valor", label: "Valor", type: "money" },
    { key: "entrega", label: "Entrega", type: "date" },
    { key: "fase", label: "Fase", type: "select", options: ["Briefing", "Arte"] },
    { key: "canais", label: "Canais", type: "multiselect", options: ["IG", "TT", "YT"] },
    { key: "urgente", label: "Urgente", type: "checkbox" },
    { key: "revisor", label: "Revisor", type: "user" },
    { key: "link", label: "Link", type: "url" },
  ];
  assert.deepEqual(T.validateFieldDefs(defs), []);
  assert.deepEqual(codes(T.validateFieldDefs([{ key: "1a", label: "", type: "x" }, { key: "ok", label: "Ok", type: "select", options: [] }, { key: "ok", label: "Ok", type: "multiselect", options: ["a", "a"] }])), ["KEY_INVALID", "KEY_INVALID", "LABEL_REQUIRED", "OPTIONS_INVALID", "OPTIONS_INVALID", "TYPE_INVALID"]);
  assert.deepEqual(codes(T.validateFieldDefs(Array.from({ length: 51 }, (_, i) => ({ key: "f" + i, label: "F", type: "text" })))), ["TOO_MANY"]);
  assert.deepEqual(T.validateFieldDefs(Array.from({ length: 50 }, (_, i) => ({ key: "f" + i, label: "F", type: "text" }))), []);
  const ok = T.validateCustomValues(defs, { cnpj: " 12 ", horas: 1.5, valor: 1000, entrega: "2026-10-20", fase: "Arte", canais: ["IG", "IG", "YT"], urgente: false, revisor: "u2", link: "https://x.com/a", lixo: 1 }, { memberIds: ["u1", "u2"] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.value, { cnpj: "12", horas: 1.5, valor: 1000, entrega: "2026-10-20", fase: "Arte", canais: ["IG", "YT"], urgente: false, revisor: "u2", link: "https://x.com/a" });
  const bad = T.validateCustomValues(defs, { horas: "2", valor: 10.5, entrega: "20/10/2026", fase: "Outra", canais: ["IG", "FB"], urgente: "sim", revisor: "u9", link: "ftp://x" }, { memberIds: ["u1"] });
  assert.deepEqual(bad.errors.map((e) => e.path), ["customFields.cnpj", "customFields.horas", "customFields.valor", "customFields.entrega", "customFields.fase", "customFields.canais", "customFields.urgente", "customFields.revisor", "customFields.link"]);
  assert.equal(bad.errors[0].code, "REQUIRED");
  assert.equal(bad.errors[1].code, "VALUE_INVALID");
  assert.deepEqual(bad.value, {});
  const emp = T.validateCustomValues(defs, { cnpj: "", canais: [], horas: null });
  assert.deepEqual(emp.errors.map((e) => e.code), ["REQUIRED"]);
  assert.deepEqual(emp.value, {});
  assert.deepEqual(T.validateCustomValues([{ key: "canais", label: "C", type: "multiselect", options: ["IG"], required: true }], { canais: [] }).errors.map((e) => e.code), ["REQUIRED"]);
  assert.deepEqual(T.validateCustomValues(defs, { cnpj: "x".repeat(1001), horas: Infinity }).errors.length, 2);
  assert.deepEqual(T.validateCustomValues(defs, { cnpj: "x".repeat(1000) }).errors, []);
});

test("Gantt: ciclo, cascata e caminho crítico", () => {
  const links = [{ fromId: "A", toId: "B" }, { fromId: "B", toId: "C" }];
  assert.equal(T.wouldCreateCycle(links, "C", "A"), true);
  assert.equal(T.wouldCreateCycle(links, "A", "C"), false);
  assert.equal(T.wouldCreateCycle(links, "A", "A"), true);
  assert.equal(T.wouldCreateCycle(links, "C", "D"), false);
  assert.equal(T.wouldCreateCycle([...links, { fromId: "C", toId: "D" }], "D", "B"), true);
  const tasks = [{ id: "A", startDate: "2026-10-01", dueDate: "2026-10-07" }, { id: "B", startDate: "2026-10-06", dueDate: "2026-10-08" }, { id: "C", startDate: null, dueDate: "2026-10-09" }, { id: "X", startDate: "2026-10-01", dueDate: "2026-10-02" }];
  const r = T.cascade(tasks, links, "A");
  const by = Object.fromEntries(r.tasks.map((t) => [t.id, [t.startDate, t.dueDate]]));
  assert.deepEqual(by, { A: ["2026-10-01", "2026-10-07"], B: ["2026-10-08", "2026-10-10"], C: [null, "2026-10-11"], X: ["2026-10-01", "2026-10-02"] });
  assert.deepEqual(r.moved, ["B", "C"]);
  assert.equal(tasks[1].startDate, "2026-10-06");
  const lag = T.cascade(tasks, [{ fromId: "A", toId: "B", lagDays: 2 }, { fromId: "B", toId: "C", lagDays: 0 }], "A");
  assert.deepEqual(lag.tasks.find((t) => t.id === "B"), { id: "B", startDate: "2026-10-10", dueDate: "2026-10-12" });
  // nunca puxa para trás
  const back = T.cascade([{ id: "A", startDate: "2026-10-01", dueDate: "2026-10-03" }, { id: "B", startDate: "2026-10-10", dueDate: "2026-10-12" }], links, "A");
  assert.deepEqual(back.moved, []);
  assert.equal(back.tasks[1].startDate, "2026-10-10");
  // exatamente no dia seguinte não move
  assert.deepEqual(T.cascade([{ id: "A", startDate: "2026-10-01", dueDate: "2026-10-03" }, { id: "B", startDate: "2026-10-04", dueDate: "2026-10-04" }], links, "A").moved, []);
  // sem prazo na anterior: nada a fazer
  assert.deepEqual(T.cascade([{ id: "A", startDate: null, dueDate: null }, { id: "B", startDate: "2026-10-01", dueDate: "2026-10-01" }], links, "A").moved, []);
  // caminho crítico
  const ct = [{ id: "A", startDate: "2026-10-01", dueDate: "2026-10-05" }, { id: "B", startDate: "2026-10-06", dueDate: "2026-10-08" }, { id: "D", startDate: "2026-10-06", dueDate: "2026-10-15" }, { id: "C", dueDate: "2026-10-20" }];
  const cl = [{ fromId: "A", toId: "B" }, { fromId: "A", toId: "D" }, { fromId: "B", toId: "C" }, { fromId: "D", toId: "C" }];
  assert.deepEqual(T.criticalPath(ct, cl), { ids: ["A", "D", "C"], days: 16 });
  assert.deepEqual(T.criticalPath(ct, [{ fromId: "A", toId: "B", lagDays: 9 }, { fromId: "B", toId: "C" }, { fromId: "A", toId: "D" }, { fromId: "D", toId: "C" }]), { ids: ["A", "B", "C"], days: 18 });
  assert.deepEqual(T.criticalPath([{ id: "S" }], []), { ids: ["S"], days: 1 });
  assert.deepEqual(T.criticalPath([{ id: "P", startDate: "2026-10-01", dueDate: "2026-10-02" }, { id: "Q" }, { id: "R" }], [{ fromId: "Q", toId: "R" }]), { ids: ["Q", "R"], days: 2 });
  assert.throws(() => T.criticalPath([{ id: "A" }, { id: "B" }], [{ fromId: "A", toId: "B" }, { fromId: "B", toId: "A" }]), /ciclo/);
});

test("automações", () => {
  const a = { name: "Revisão", trigger: { type: "status_changed", toStatusId: "s-review" }, conditions: [{ on: "priority", value: "HIGH" }], actions: [{ type: "set_assignee", userId: "u2" }, { type: "set_due_in_days", days: 2 }] };
  assert.deepEqual(T.validateAutomation(a), []);
  assert.deepEqual(codes(T.validateAutomation({ name: " ", trigger: { type: "x" }, actions: [] })), ["ACTIONS_REQUIRED", "NAME_REQUIRED", "TRIGGER_INVALID"]);
  assert.deepEqual(codes(T.validateAutomation({ name: "a", trigger: { type: "field_changed" }, actions: [{ type: "nope" }, { type: "set_due_in_days", days: 366 }, { type: "set_due_in_days", days: -1 }] })), ["ACTION_INVALID", "DAYS_INVALID", "DAYS_INVALID", "FIELD_REQUIRED"]);
  assert.deepEqual(codes(T.validateAutomation({ ...a, actions: [{ type: "move_status", statusId: "s-review" }] })), ["LOOP"]);
  assert.deepEqual(T.validateAutomation({ ...a, actions: [{ type: "move_status", statusId: "s-done" }] }), []);
  assert.deepEqual(codes(T.validateAutomation({ ...a, conditions: [{ on: "cor" }] })), ["CONDITION_INVALID"]);
  assert.deepEqual(T.validateAutomation({ ...a, actions: [{ type: "set_due_in_days", days: 0 }, { type: "set_due_in_days", days: 365 }] }), []);
  const task = { priority: "HIGH", assigneeId: null, labelIds: ["l1"], statusId: "s-review", customFields: { fase: "Arte" } };
  assert.equal(T.automationMatches(a, { type: "status_changed", toStatusId: "s-review" }, task), true);
  assert.equal(T.automationMatches(a, { type: "status_changed", toStatusId: "s-done" }, task), false);
  assert.equal(T.automationMatches(a, { type: "task_created" }, task), false);
  assert.equal(T.automationMatches(a, { type: "status_changed", toStatusId: "s-review" }, { ...task, priority: "LOW" }), false);
  assert.equal(T.automationMatches({ ...a, active: false }, { type: "status_changed", toStatusId: "s-review" }, task), false);
  assert.equal(T.automationMatches(a, { type: "status_changed", toStatusId: "s-review", depth: 3 }, task), false);
  assert.equal(T.automationMatches(a, { type: "status_changed", toStatusId: "s-review", depth: 2 }, task), true);
  assert.equal(T.automationMatches({ ...a, trigger: { type: "status_changed" } }, { type: "status_changed", toStatusId: "qualquer" }, task), true);
  const f = { name: "f", trigger: { type: "field_changed", field: "fase" }, actions: [{ type: "notify" }] };
  assert.equal(T.automationMatches(f, { type: "field_changed", field: "fase" }, task), true);
  assert.equal(T.automationMatches(f, { type: "field_changed", field: "outro" }, task), false);
  const conds = (c) => T.automationMatches({ ...f, conditions: [c] }, { type: "field_changed", field: "fase" }, task);
  assert.equal(conds({ on: "assigneeId", value: null }), true);
  assert.equal(conds({ on: "assigneeId", value: "u1" }), false);
  assert.equal(T.automationMatches({ ...f, conditions: [{ on: "assigneeId", value: null }] }, { type: "field_changed", field: "fase" }, { statusId: "s" }), true);
  assert.equal(T.automationMatches({ ...f, conditions: [{ on: "statusId", value: "s-review" }, { on: "priority", value: "LOW" }] }, { type: "field_changed", field: "fase" }, task), false);
  assert.equal(conds({ on: "labelId", value: "l1" }), true);
  assert.equal(conds({ on: "labelId", value: "l2" }), false);
  assert.equal(conds({ on: "statusId", value: "s-review" }), true);
  assert.equal(conds({ on: "statusId", value: "s-x" }), false);
  assert.equal(conds({ on: "field", key: "fase", value: "Arte" }), true);
  assert.equal(conds({ on: "field", key: "fase", value: "Briefing" }), false);
  assert.equal(conds({ on: "cor", value: 1 }), false);
  assert.equal(T.automationMatches(f, { type: "field_changed", field: "fase" }, { statusId: "s" }), true);
});

test("carga por pessoa", () => {
  const w = T.workload([{ id: "t1", assigneeId: "u1", startDate: "2026-10-19", dueDate: "2026-10-23", estimateHours: 50 }], { from: "2026-10-19", to: "2026-10-31" });
  assert.deepEqual(w, { u1: { weeks: { "2026-10-19": 50 }, capacity: { "2026-10-19": 40 }, overloadedWeeks: ["2026-10-19"] } });
  assert.deepEqual(T.workload([{ id: "t1", assigneeId: "u1", startDate: "2026-10-19", dueDate: "2026-10-23", estimateHours: 50 }], { from: "2026-10-19", to: "2026-10-31", capacityPerDay: { u1: 10 } }).u1.overloadedWeeks, []);
  assert.deepEqual(T.workload([{ id: "t1", assigneeId: "u1", startDate: "2026-10-19", dueDate: "2026-10-23", estimateHours: 41 }], { from: "2026-10-19", to: "2026-10-31", defaultCapacity: 8 }).u1.overloadedWeeks, ["2026-10-19"]);
  assert.deepEqual(T.workload([{ id: "t1", assigneeId: "u1", startDate: "2026-10-19", dueDate: "2026-10-23", estimateHours: 40 }], { from: "2026-10-19", to: "2026-10-31" }).u1.overloadedWeeks, []);
  // atravessa semanas e fins de semana
  const two = T.workload([{ id: "t", assigneeId: "u1", startDate: "2026-10-22", dueDate: "2026-10-27", estimateHours: 16 }, { id: "t2", assigneeId: "u2", startDate: "2026-10-26", dueDate: "2026-10-26", estimateHours: 3 }], { from: "2026-10-19", to: "2026-10-31" });
  assert.deepEqual(two.u1.weeks, { "2026-10-19": 8, "2026-10-26": 8 });
  assert.deepEqual(two.u2.weeks, { "2026-10-26": 3 });
  // começa antes do período: o que passou não conta e a capacidade da semana parcial é menor
  const part = T.workload([{ id: "t", assigneeId: "u1", startDate: "2026-10-19", dueDate: "2026-10-23", estimateHours: 25 }], { from: "2026-10-21", to: "2026-10-31" });
  assert.deepEqual(part.u1, { weeks: { "2026-10-19": 25 }, capacity: { "2026-10-19": 24 }, overloadedWeeks: ["2026-10-19"] });
  // feriado tira capacidade e espalha nos outros dias
  const hol = T.workload([{ id: "t", assigneeId: "u1", startDate: "2026-10-19", dueDate: "2026-10-23", estimateHours: 36 }], { from: "2026-10-19", to: "2026-10-23", holidays: ["2026-10-20"] });
  assert.deepEqual(hol.u1, { weeks: { "2026-10-19": 36 }, capacity: { "2026-10-19": 32 }, overloadedWeeks: ["2026-10-19"] });
  assert.deepEqual(T.workload([{ id: "t", assigneeId: "u1", startDate: "2026-10-19", dueDate: "2026-10-23", estimateHours: 32 }], { from: "2026-10-19", to: "2026-10-23", holidays: ["2026-10-20"] }).u1.overloadedWeeks, []);
  // fim do período no meio da semana
  const cut = T.workload([{ id: "t", assigneeId: "u1", startDate: "2026-10-19", dueDate: "2026-10-23", estimateHours: 20 }], { from: "2026-10-19", to: "2026-10-20" });
  assert.deepEqual(cut.u1, { weeks: { "2026-10-19": 8 }, capacity: { "2026-10-19": 16 }, overloadedWeeks: [] });
  assert.deepEqual(T.workload([{ id: "t", assigneeId: "u1", startDate: "2026-10-19", dueDate: "2026-10-20", estimateHours: 20 }], { from: "2026-10-19", to: "2026-10-20" }).u1.overloadedWeeks, ["2026-10-19"]);
  // prazo no fim de semana, sem início, sem dono, sem estimativa
  const odd = T.workload([{ id: "a", assigneeId: "u1", dueDate: "2026-10-24", estimateHours: 6 }, { id: "b", dueDate: "2026-10-23", estimateHours: 9 }, { id: "c", assigneeId: "u2", dueDate: "2026-10-23", estimateHours: 0 }, { id: "d", assigneeId: "u2", estimateHours: 4 }], { from: "2026-10-24", to: "2026-10-31" });
  // prazo no sábado sem dia útil antes: cai no próprio prazo e acusa sobrecarga (não há capacidade ali)
  assert.deepEqual(odd, { u1: { weeks: { "2026-10-19": 6 }, capacity: { "2026-10-19": 0 }, overloadedWeeks: ["2026-10-19"] } });
  // atrasada (prazo antes do período) fica fora
  assert.deepEqual(T.workload([{ id: "a", assigneeId: "u1", dueDate: "2026-10-16", estimateHours: 6 }], { from: "2026-10-19", to: "2026-10-31" }), { u1: { weeks: {}, capacity: {}, overloadedWeeks: [] } });
});

test("convidado que aprova", () => {
  assert.equal(T.canMoveApproval(null, "PENDING"), true);
  assert.equal(T.canMoveApproval(undefined, "APPROVED"), false);
  assert.equal(T.canMoveApproval("PENDING", "APPROVED"), true);
  assert.equal(T.canMoveApproval("PENDING", "CHANGES_REQUESTED"), true);
  assert.equal(T.canMoveApproval("CHANGES_REQUESTED", "APPROVED"), false);
  assert.equal(T.canMoveApproval("CHANGES_REQUESTED", "PENDING"), true);
  assert.equal(T.canMoveApproval("APPROVED", "PENDING"), true);
  assert.equal(T.canMoveApproval("APPROVED", "CHANGES_REQUESTED"), false);
  assert.equal(T.canMoveApproval("X", "PENDING"), false);
  const g = { projectId: "p1", revokedAt: null };
  assert.equal(T.guestCanSee(g, { projectId: "p1", clientVisible: true }), true);
  assert.equal(T.guestCanSee(g, { projectId: "p1", clientVisible: false }), false);
  assert.equal(T.guestCanSee(g, { projectId: "p2", clientVisible: true }), false);
  assert.equal(T.guestCanSee({ ...g, revokedAt: "2026-10-01" }, { projectId: "p1", clientVisible: true }), false);
  assert.deepEqual(T.validateDecision({ decision: "approve" }), []);
  assert.deepEqual(codes(T.validateDecision({ decision: "request_changes", comment: "  " })), ["COMMENT_REQUIRED"]);
  assert.deepEqual(T.validateDecision({ decision: "request_changes", comment: "Trocar a cor" }), []);
  assert.deepEqual(codes(T.validateDecision({ decision: "talvez" })), ["DECISION_INVALID"]);
});

test("perfil contábil: obrigações com prazo legal", () => {
  const ob = (c) => T.OBLIGATIONS_BR.find((o) => o.code === c);
  assert.equal(T.obligationDue(ob("DAS"), "2026-10"), "2026-11-20");
  assert.equal(T.obligationDue(ob("DAS"), "2026-10", ["2026-11-20"]), "2026-11-23");
  assert.equal(T.obligationDue(ob("FGTS"), "2026-10", ["2026-11-20"]), "2026-11-19");
  assert.equal(T.obligationDue(ob("ESOCIAL"), "2026-10"), "2026-11-13");
  assert.equal(T.obligationDue(ob("REINF"), "2026-12"), "2027-01-15");
  assert.equal(T.obligationDue({ code: "X", day: 31, monthsAfter: 2, onNonBusiness: "after" }, "2026-12"), "2027-03-01");
  assert.equal(T.obligationDue({ code: "Y", day: 31 }, "2027-01"), "2027-02-26");
  assert.equal(T.obligationDue({ code: "Z", day: 10, monthsAfter: 0 }, "2026-10"), "2026-10-09");
  const out = T.monthlyObligations([{ id: "c1", name: "Padaria", obligations: ["DAS", "FGTS", "NOPE"] }, { id: "c2", name: "Oficina", obligations: ["DAS"] }], T.OBLIGATIONS_BR.map((o) => (o.code === "DAS" ? { ...o, leadDays: 2 } : o)), "2026-10", ["2026-11-20"]);
  assert.deepEqual(out.map((x) => [x.key, x.legalDue, x.dueDate]), [["c1:DAS:2026-10", "2026-11-23", "2026-11-18"], ["c1:FGTS:2026-10", "2026-11-19", "2026-11-19"], ["c2:DAS:2026-10", "2026-11-23", "2026-11-18"]]);
  assert.equal(out[0].title, "DAS (Simples Nacional) · Padaria · 10/2026");
  assert.equal(out[0].clientId, "c1");
  assert.equal(out[1].code, "FGTS");
});

test("perfil agência: horas faturáveis", () => {
  assert.equal(T.roundMinutes(70, 15), 75);
  assert.equal(T.roundMinutes(75, 15), 75);
  assert.equal(T.roundMinutes(70), 70);
  assert.equal(T.roundMinutes(1, 30), 30);
  const r = T.billableHours([
    { userId: "u1", clientId: "c1", minutes: 50, billable: true },
    { userId: "u1", clientId: "c1", minutes: 20, billable: true },
    { userId: "u2", clientId: "c1", minutes: 30, billable: true },
    { userId: "u2", clientId: "c1", minutes: 600, billable: false },
    { userId: "u1", clientId: null, minutes: 600, billable: true },
    { userId: "u1", clientId: "c2", minutes: 10, billable: true },
  ], { rates: { u1: 6000 }, defaultRateCents: 3000, roundTo: 15 });
  assert.deepEqual(r.byClient.c1, { minutes: 105, amountCents: 9000, lines: [{ userId: "u1", minutes: 75, rateCents: 6000, amountCents: 7500 }, { userId: "u2", minutes: 30, rateCents: 3000, amountCents: 1500 }] });
  assert.deepEqual(r.byClient.c2, { minutes: 15, amountCents: 1500, lines: [{ userId: "u1", minutes: 15, rateCents: 6000, amountCents: 1500 }] });
  assert.equal(r.totalCents, 10500);
  const raw = T.billableHours([{ userId: "u1", clientId: "c1", minutes: 7, billable: true }], { rates: { u1: 10000 } });
  assert.deepEqual(raw, { byClient: { c1: { minutes: 7, amountCents: 1167, lines: [{ userId: "u1", minutes: 7, rateCents: 10000, amountCents: 1167 }] } }, totalCents: 1167 });
  assert.deepEqual(T.billableHours([]), { byClient: {}, totalCents: 0 });
});

test("perfil obras: checklist com foto", () => {
  const items = [{ id: "a", text: "Quadro", done: true }, { id: "b", text: "Laje", requirePhoto: true, done: true, photoIds: ["f1"] }, { id: "c", text: "Reboco", requirePhoto: true, done: true }, { id: "d", text: "Pintura", done: false }];
  assert.deepEqual(T.checklistStatus(items), { done: 2, total: 4, missingPhotos: ["c"], complete: false });
  assert.deepEqual(T.checklistStatus(items.slice(0, 2)), { done: 2, total: 2, missingPhotos: [], complete: true });
  assert.deepEqual(T.checklistStatus([]), { done: 0, total: 0, missingPhotos: [], complete: true });
  assert.deepEqual(T.canCheckItem({ requirePhoto: true }), { ok: false, code: "PHOTO_REQUIRED" });
  assert.deepEqual(T.canCheckItem({ requirePhoto: true }, ["f"]), { ok: true });
  assert.deepEqual(T.canCheckItem({ requirePhoto: true, photoIds: ["f"] }), { ok: true });
  assert.deepEqual(T.canCheckItem({ requirePhoto: false }), { ok: true });
  assert.deepEqual(T.canCompleteTask(items, { requireChecklist: true }), { ok: false, code: "CHECKLIST_INCOMPLETE" });
  assert.deepEqual(T.canCompleteTask(items), { ok: true });
  assert.deepEqual(T.canCompleteTask(items.slice(0, 2), { requireChecklist: true }), { ok: true });
});

test("perfis de segmento", () => {
  assert.deepEqual(Object.keys(T.TASK_SEGMENTS), ["GENERAL", "ACCOUNTING", "AGENCY", "CONSTRUCTION"]);
  assert.equal(T.taskSegment("ACCOUNTING").words.tasks, "obrigações");
  assert.ok(T.taskSegment("ACCOUNTING").on.includes("obligations"));
  assert.ok(T.taskSegment("AGENCY").on.includes("timesheet_billing"));
  assert.ok(T.taskSegment("CONSTRUCTION").on.includes("photo_checklist"));
  assert.equal(T.taskSegment("CONSTRUCTION").words.project, "obra");
  assert.equal(T.taskSegment("NOPE").id, "GENERAL");
  assert.deepEqual(T.taskSegment(undefined).on, []);
  assert.equal(T.taskSegment("AGENCY").id, "AGENCY");
});
