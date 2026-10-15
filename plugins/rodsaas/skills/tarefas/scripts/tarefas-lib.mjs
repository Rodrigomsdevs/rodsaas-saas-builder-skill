// rodsaas · tarefas — regras puras da operação avançada (sem banco, sem rede): recorrência, modelos, campos
// personalizados, Gantt com dependências e caminho crítico, automações, carga por pessoa, convidado que aprova e os
// perfis (obrigações com prazo legal, horas faturáveis, checklist com foto). Datas de calendário "YYYY-MM-DD".
// Porte para TypeScript em api/src/modules/tasks/lib/ (e o que o front usar), com os testes.
// Rode: node --test tarefas-lib.test.mjs

const pad = (n) => String(n).padStart(2, "0");
const parse = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (ms) => { const t = new Date(ms); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
export const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;
export const addDays = (ymd, n) => fmt(parse(ymd) + n * 86_400_000);
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86_400_000);
export const weekday = (ymd) => new Date(parse(ymd)).getUTCDay();
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function addMonths(ymd, n, anchorDay) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1)), yy = t.getUTCFullYear(), mm = t.getUTCMonth() + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(anchorDay ?? d, lastDay(yy, mm)))}`;
}
const err = (list, code, message, path) => list.push({ code, message, path });

// ------------------------------------------------------------------ dia útil
export const isBusinessDay = (ymd, holidays = []) => { const w = weekday(ymd); return w !== 0 && w !== 6 && !holidays.includes(ymd); };
/** Ajusta para dia útil: "before" (antecipa), "after" (prorroga) ou "keep". */
export function adjustBusinessDay(ymd, mode = "keep", holidays = []) {
  if (mode === "keep") return ymd;
  let d = ymd; const step = mode === "before" ? -1 : 1;
  while (!isBusinessDay(d, holidays)) d = addDays(d, step);
  return d;
}
export function addBusinessDays(ymd, n, holidays = []) {
  let d = ymd, left = Math.abs(n); const step = n < 0 ? -1 : 1;
  while (left > 0) { d = addDays(d, step); if (isBusinessDay(d, holidays)) left--; }
  return d;
}
export const businessDaysBetween = (a, b, holidays = []) => { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (isBusinessDay(d, holidays)) n++; return n; };

// ------------------------------------------------------------------ recorrência
/**
 * rule: { freq: "daily" | "weekly" | "monthly" | "yearly", interval?: 1, weekdays?: [0..6] (semanal), monthDay?: 1..31 (mensal; 31 = último),
 *         nth?: { n: 1..4 | -1, weekday } (mensal: "2ª terça", "última sexta"), mode?: "schedule" | "after_done",
 *         onNonBusiness?: "keep" | "before" | "after", until?, count? }
 */
export function validateRecurrence(r) {
  const e = [];
  if (!["daily", "weekly", "monthly", "yearly"].includes(r?.freq)) err(e, "FREQ_INVALID", "Frequência: diária, semanal, mensal ou anual", "freq");
  if (r?.interval != null && !(Number.isInteger(r.interval) && r.interval >= 1 && r.interval <= 99)) err(e, "INTERVAL_INVALID", "A cada 1 a 99", "interval");
  if (r?.weekdays != null && (r.freq !== "weekly" || !Array.isArray(r.weekdays) || !r.weekdays.length || r.weekdays.some((w) => !(Number.isInteger(w) && w >= 0 && w <= 6)))) err(e, "WEEKDAYS_INVALID", "Dias da semana (0 a 6) só na semanal", "weekdays");
  if (r?.monthDay != null && (r.freq !== "monthly" || !(Number.isInteger(r.monthDay) && r.monthDay >= 1 && r.monthDay <= 31))) err(e, "MONTHDAY_INVALID", "Dia do mês (1 a 31) só na mensal", "monthDay");
  if (r?.nth != null && (r.freq !== "monthly" || ![1, 2, 3, 4, -1].includes(r.nth.n) || !(Number.isInteger(r.nth.weekday) && r.nth.weekday >= 0 && r.nth.weekday <= 6))) err(e, "NTH_INVALID", "N-ésimo dia da semana (1ª a 4ª ou última) só na mensal", "nth");
  if (r?.monthDay != null && r?.nth != null) err(e, "MONTHLY_AMBIGUOUS", "Use dia do mês ou n-ésimo dia da semana", "nth");
  if (r?.mode != null && !["schedule", "after_done"].includes(r.mode)) err(e, "MODE_INVALID", "Pela agenda ou depois de concluir", "mode");
  if (r?.onNonBusiness != null && !["keep", "before", "after"].includes(r.onNonBusiness)) err(e, "ADJUST_INVALID", "Fim de semana: manter, antecipar ou prorrogar", "onNonBusiness");
  if (r?.until != null && !isDate(r.until)) err(e, "DATE_INVALID", "Data final", "until");
  if (r?.count != null && !(Number.isInteger(r.count) && r.count >= 1 && r.count <= 1000)) err(e, "COUNT_INVALID", "Repetições de 1 a 1000", "count");
  return e;
}
const nthWeekdayOf = (y, m, n, wd) => {
  if (n === -1) { let d = `${y}-${pad(m)}-${pad(lastDay(y, m))}`; while (weekday(d) !== wd) d = addDays(d, -1); return d; }
  let d = `${y}-${pad(m)}-01`; while (weekday(d) !== wd) d = addDays(d, 1); return addDays(d, 7 * (n - 1));
};
/** Próxima data "bruta" depois de `from` (sem ajuste de dia útil), a partir da âncora `start`. */
function rawNext(r, from, start) {
  const iv = r.interval ?? 1;
  if (r.freq === "daily") return addDays(from, iv);
  if (r.freq === "weekly") {
    const days = (r.weekdays?.length ? [...r.weekdays] : [weekday(start)]).sort((x, y) => x - y);
    const wFrom = weekday(from);
    const later = days.find((d) => d > wFrom);
    if (later != null) return addDays(from, later - wFrom);
    return addDays(from, 7 * iv - wFrom + days[0]);
  }
  if (r.freq === "monthly") {
    const [y, m] = from.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + iv, 1)), yy = t.getUTCFullYear(), mm = t.getUTCMonth() + 1;
    if (r.nth) return nthWeekdayOf(yy, mm, r.nth.n, r.nth.weekday);
    return `${yy}-${pad(mm)}-${pad(Math.min(r.monthDay ?? Number(start.slice(8)), lastDay(yy, mm)))}`;
  }
  return addMonths(from, 12 * iv, Number(start.slice(8)));
}
/**
 * Próximo vencimento. mode "schedule": depois do vencimento atual (`currentDue`), pela regra; "after_done": a partir do dia
 * em que concluiu (`doneOn`). Ajuste de dia útil no fim. → "YYYY-MM-DD" | null (passou do until/count)
 */
export function nextDue(r, { currentDue, doneOn, start = currentDue, occurrence = 1, holidays = [] }) {
  const base = r.mode === "after_done" ? doneOn ?? currentDue : currentDue;
  if (r.count != null && occurrence >= r.count) return null;
  const raw = rawNext(r, base, start);
  const d = adjustBusinessDay(raw, r.onNonBusiness ?? "keep", holidays);
  if (r.until && d > r.until) return null;
  return d;
}

// ------------------------------------------------------------------ modelos
/**
 * Modelo: { tasks: [{ key, title, offsetDays, businessDays?, durationDays?, assigneeRole?, checklist?, subtasks?: [{ title, offsetDays }], dependsOn?: [key] }] }
 * → tarefas com datas a partir do início, dependências pelas chaves.
 */
export function validateTemplate(t) {
  const e = [];
  const tasks = Array.isArray(t?.tasks) ? t.tasks : [];
  if (!tasks.length) err(e, "TASKS_REQUIRED", "Inclua as tarefas do modelo", "tasks");
  const keys = new Set();
  tasks.forEach((x, i) => {
    if (!/^[a-z0-9_]{1,40}$/.test(x?.key ?? "") || keys.has(x.key)) err(e, "KEY_INVALID", "Chave da tarefa inválida ou repetida", `tasks.${i}.key`);
    keys.add(x?.key);
    if (!String(x?.title ?? "").trim()) err(e, "TITLE_REQUIRED", "Título", `tasks.${i}.title`);
    if (!Number.isInteger(x?.offsetDays) || x.offsetDays < 0 || x.offsetDays > 3650) err(e, "OFFSET_INVALID", "Dias depois do início (0 ou mais)", `tasks.${i}.offsetDays`);
  });
  tasks.forEach((x, i) => (x?.dependsOn ?? []).forEach((k) => { if (!keys.has(k) || k === x.key) err(e, "DEPENDENCY_INVALID", "Depende de tarefa do modelo", `tasks.${i}.dependsOn`); }));
  return e;
}
export function instantiateTemplate(t, { startDate, holidays = [] }) {
  return t.tasks.map((x) => {
    const due = x.businessDays ? addBusinessDays(adjustBusinessDay(startDate, "after", holidays), x.offsetDays, holidays) : addDays(startDate, x.offsetDays);
    const start = x.durationDays ? addDays(due, -(x.durationDays - 1)) : null;
    return { key: x.key, title: x.title, startDate: start, dueDate: due, assigneeRole: x.assigneeRole ?? null, checklist: (x.checklist ?? []).map((c) => (typeof c === "string" ? { text: c, requirePhoto: false } : c)), subtasks: (x.subtasks ?? []).map((s) => ({ title: s.title, dueDate: addDays(startDate, s.offsetDays ?? x.offsetDays) })), dependsOn: x.dependsOn ?? [] };
  });
}

// ------------------------------------------------------------------ campos personalizados
export const CUSTOM_FIELD_TYPES = ["text", "number", "money", "date", "select", "multiselect", "checkbox", "user", "url"];
export function validateFieldDefs(defs) {
  const e = [];
  const keys = new Set();
  (Array.isArray(defs) ? defs : []).forEach((d, i) => {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(d?.key ?? "") || keys.has(d.key)) err(e, "KEY_INVALID", "Chave do campo inválida ou repetida", `fields.${i}.key`);
    keys.add(d?.key);
    if (!String(d?.label ?? "").trim()) err(e, "LABEL_REQUIRED", "Nome do campo", `fields.${i}.label`);
    if (!CUSTOM_FIELD_TYPES.includes(d?.type)) err(e, "TYPE_INVALID", "Tipo de campo", `fields.${i}.type`);
    if (["select", "multiselect"].includes(d?.type) && !((d.options ?? []).length && new Set(d.options).size === d.options.length)) err(e, "OPTIONS_INVALID", "Opções sem repetir", `fields.${i}.options`);
  });
  if (keys.size > 50) err(e, "TOO_MANY", "Até 50 campos por projeto", "fields");
  return e;
}
/** Valores: { [key]: valor } → { value, errors } (chave desconhecida ignorada; obrigatório sem valor = erro). */
export function validateCustomValues(defs, values, { memberIds = [] } = {}) {
  const out = {}, errors = [];
  for (const d of defs) {
    const v = values?.[d.key];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
    if (empty) { if (d.required) err(errors, "REQUIRED", "Campo obrigatório", `customFields.${d.key}`); continue; }
    const bad = (m) => err(errors, "VALUE_INVALID", m, `customFields.${d.key}`);
    switch (d.type) {
      case "text": typeof v === "string" && v.length <= 1000 ? (out[d.key] = v.trim()) : bad("Texto até 1000 caracteres"); break;
      case "number": typeof v === "number" && Number.isFinite(v) ? (out[d.key] = v) : bad("Número"); break;
      case "money": Number.isInteger(v) ? (out[d.key] = v) : bad("Valor em centavos"); break;
      case "date": isDate(v) ? (out[d.key] = v) : bad("Data AAAA-MM-DD"); break;
      case "select": d.options.includes(v) ? (out[d.key] = v) : bad("Opção da lista"); break;
      case "multiselect": Array.isArray(v) && v.every((x) => d.options.includes(x)) ? (out[d.key] = [...new Set(v)]) : bad("Opções da lista"); break;
      case "checkbox": typeof v === "boolean" ? (out[d.key] = v) : bad("Sim ou não"); break;
      case "user": memberIds.includes(v) ? (out[d.key] = v) : bad("Membro do projeto"); break;
      case "url": /^https?:\/\/[^\s]+$/i.test(String(v)) ? (out[d.key] = v) : bad("Link http(s)"); break;
    }
  }
  return { value: out, errors };
}

// ------------------------------------------------------------------ Gantt: dependências, cascata e caminho crítico
/** Criar a dependência from → to (fim → início) fecha um ciclo? links: [{ fromId, toId }] */
export function wouldCreateCycle(links, fromId, toId) {
  const next = new Map();
  for (const l of links) { if (!next.has(l.fromId)) next.set(l.fromId, []); next.get(l.fromId).push(l.toId); }
  const seen = new Set([toId]), stack = [toId];
  while (stack.length) { const n = stack.pop(); if (n === fromId) return true; for (const m of next.get(n) ?? []) if (!seen.has(m)) { seen.add(m); stack.push(m); } }
  return false;
}
/**
 * Cascata: quando uma tarefa muda de data, as sucessoras (fim → início, com `lagDays`) que começariam antes do fim dela
 * + lag + 1 andam para frente mantendo a duração. Nunca puxa para trás. tasks: [{ id, startDate, dueDate }]
 * → { tasks (novas datas), moved: [ids] }
 */
export function cascade(tasks, links, changedId) {
  const by = new Map(tasks.map((t) => [t.id, { ...t }])), moved = [];
  const queue = [changedId];
  while (queue.length) {
    const id = queue.shift(), t = by.get(id);
    for (const l of links.filter((x) => x.fromId === id)) {
      const s = by.get(l.toId); if (!s || !t.dueDate) continue;
      const earliest = addDays(t.dueDate, 1 + (l.lagDays ?? 0));
      const sStart = s.startDate ?? s.dueDate;
      if (sStart && sStart < earliest) {
        const dur = s.startDate && s.dueDate ? diffDays(s.startDate, s.dueDate) : 0;
        s.startDate = s.startDate ? earliest : null; s.dueDate = addDays(earliest, dur);
        if (!moved.includes(s.id)) moved.push(s.id);
        queue.push(s.id);
      }
    }
  }
  return { tasks: [...by.values()], moved };
}
/** Caminho crítico (maior soma de durações em dias pelas dependências). → { ids, days } */
export function criticalPath(tasks, links) {
  const dur = new Map(tasks.map((t) => [t.id, t.startDate && t.dueDate ? diffDays(t.startDate, t.dueDate) + 1 : 1]));
  const preds = new Map(tasks.map((t) => [t.id, []]));
  for (const l of links) if (preds.has(l.toId) && dur.has(l.fromId)) preds.get(l.toId).push(l);
  const memo = new Map();
  const best = (id, stack = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) throw new Error("ciclo nas dependências");
    stack.add(id);
    let r = { days: dur.get(id), ids: [id] };
    for (const l of preds.get(id)) { const p = best(l.fromId, stack); const d = p.days + (l.lagDays ?? 0) + dur.get(id); if (d > r.days) r = { days: d, ids: [...p.ids, id] }; }
    stack.delete(id); memo.set(id, r); return r;
  };
  let out = { days: 0, ids: [] };
  for (const t of tasks) { const r = best(t.id); if (r.days > out.days || (r.days === out.days && r.ids.length > out.ids.length)) out = r; }
  return out;
}

// ------------------------------------------------------------------ automações
export const AUTOMATION_TRIGGERS = ["task_created", "status_changed", "assignee_changed", "due_passed", "field_changed", "all_subtasks_done"];
export const AUTOMATION_ACTIONS = ["set_assignee", "set_priority", "add_label", "move_status", "create_subtask", "set_due_in_days", "notify", "comment"];
export function validateAutomation(a) {
  const e = [];
  if (!String(a?.name ?? "").trim()) err(e, "NAME_REQUIRED", "Nome da automação", "name");
  if (!AUTOMATION_TRIGGERS.includes(a?.trigger?.type)) err(e, "TRIGGER_INVALID", "Gatilho", "trigger.type");
  if (a?.trigger?.type === "field_changed" && !a.trigger.field) err(e, "FIELD_REQUIRED", "Qual campo", "trigger.field");
  const acts = Array.isArray(a?.actions) ? a.actions : [];
  if (!acts.length) err(e, "ACTIONS_REQUIRED", "Inclua uma ação", "actions");
  acts.forEach((x, i) => {
    if (!AUTOMATION_ACTIONS.includes(x?.type)) err(e, "ACTION_INVALID", "Ação", `actions.${i}.type`);
    if (x?.type === "set_due_in_days" && !(Number.isInteger(x.days) && x.days >= 0 && x.days <= 365)) err(e, "DAYS_INVALID", "Dias de 0 a 365", `actions.${i}.days`);
    if (x?.type === "move_status" && a?.trigger?.type === "status_changed" && x.statusId === a.trigger.toStatusId) err(e, "LOOP", "A ação desfaz o próprio gatilho", `actions.${i}.statusId`);
  });
  (a?.conditions ?? []).forEach((c, i) => { if (!["priority", "assigneeId", "labelId", "statusId", "field"].includes(c?.on)) err(e, "CONDITION_INVALID", "Condição", `conditions.${i}.on`); });
  return e;
}
const condOk = (c, task) => {
  if (c.on === "priority") return task.priority === c.value;
  if (c.on === "assigneeId") return (task.assigneeId ?? null) === (c.value ?? null);
  if (c.on === "labelId") return (task.labelIds ?? []).includes(c.value);
  if (c.on === "statusId") return task.statusId === c.value;
  if (c.on === "field") return (task.customFields ?? {})[c.key] === c.value;
  return false;
};
/** A automação dispara para o evento? event: { type, toStatusId?, fromStatusId?, field?, depth? } */
export function automationMatches(a, event, task) {
  if (a.active === false || a.trigger.type !== event.type) return false;
  if ((event.depth ?? 0) >= 3) return false;
  if (a.trigger.type === "status_changed" && a.trigger.toStatusId && a.trigger.toStatusId !== event.toStatusId) return false;
  if (a.trigger.type === "field_changed" && a.trigger.field !== event.field) return false;
  return (a.conditions ?? []).every((c) => condOk(c, task));
}

// ------------------------------------------------------------------ carga por pessoa
/**
 * Horas estimadas espalhadas pelos dias úteis entre início (ou hoje) e prazo; capacidade por pessoa (horas/dia).
 * tasks: [{ id, assigneeId, startDate?, dueDate, estimateHours }] → { [assigneeId]: { weeks: { "AAAA-MM-DD"(segunda): horas }, capacity: { semana: horas }, overloadedWeeks } }
 * (capacidade da semana = horas/dia × dias úteis dela dentro do período)
 */
export function workload(tasks, { from, to, capacityPerDay = {}, defaultCapacity = 8, holidays = [] }) {
  const out = {};
  const monday = (d) => addDays(d, -((weekday(d) + 6) % 7));
  for (const t of tasks) {
    if (!t.assigneeId || !t.dueDate || !(t.estimateHours > 0)) continue;
    const start = t.startDate && t.startDate > from ? t.startDate : from;
    const days = []; for (let d = start; d <= t.dueDate; d = addDays(d, 1)) if (isBusinessDay(d, holidays)) days.push(d);
    if (!days.length) days.push(t.dueDate);
    const per = t.estimateHours / days.length;
    const p = (out[t.assigneeId] ??= { weeks: {} });
    for (const d of days) { if (d < from || d > to) continue; const w = monday(d); p.weeks[w] = (p.weeks[w] ?? 0) + per; }
  }
  for (const [id, p] of Object.entries(out)) {
    for (const w of Object.keys(p.weeks)) p.weeks[w] = Math.round(p.weeks[w] * 100) / 100;
    const cap = (capacityPerDay[id] ?? defaultCapacity);
    p.capacity = Object.fromEntries(Object.keys(p.weeks).map((w) => [w, cap * businessDaysBetween(w < from ? from : w, addDays(w, 4) > to ? to : addDays(w, 4), holidays)]));
    p.overloadedWeeks = Object.entries(p.weeks).filter(([w, h]) => h > p.capacity[w]).map(([w]) => w).sort();
  }
  return out;
}

// ------------------------------------------------------------------ convidado que aprova
export const APPROVAL_FLOW = { NONE: ["PENDING"], PENDING: ["APPROVED", "CHANGES_REQUESTED"], CHANGES_REQUESTED: ["PENDING"], APPROVED: ["PENDING"] };
export const canMoveApproval = (from, to) => (APPROVAL_FLOW[from ?? "NONE"] ?? []).includes(to);
/** Convidado vê só as tarefas marcadas como visíveis ao cliente do projeto em que foi convidado. */
export const guestCanSee = (guest, task) => guest.projectId === task.projectId && !!task.clientVisible && !guest.revokedAt;
export function validateDecision({ decision, comment }) {
  const e = [];
  if (!["approve", "request_changes"].includes(decision)) err(e, "DECISION_INVALID", "Aprovar ou pedir ajustes", "decision");
  if (decision === "request_changes" && !String(comment ?? "").trim()) err(e, "COMMENT_REQUIRED", "Diga o que ajustar", "comment");
  return e;
}

// ------------------------------------------------------------------ perfil contábil: obrigações com prazo legal
/**
 * Obrigação: { code, name, day (do mês seguinte à competência, 31 = último), monthsAfter?: 1, onNonBusiness: "before" | "after", leadDays? }
 * Exemplos (confira a regra vigente antes de portar): DAS dia 20 prorroga para o próximo dia útil; FGTS Digital dia 20
 * antecipa; eSocial (fechamento) e EFD-Reinf dia 15 antecipam.
 */
export const OBLIGATIONS_BR = [
  { code: "DAS", name: "DAS (Simples Nacional)", day: 20, onNonBusiness: "after" },
  { code: "FGTS", name: "FGTS Digital", day: 20, onNonBusiness: "before" },
  { code: "ESOCIAL", name: "eSocial — fechamento da folha", day: 15, onNonBusiness: "before" },
  { code: "REINF", name: "EFD-Reinf", day: 15, onNonBusiness: "before" },
];
/** Vencimento legal da obrigação para a competência ("AAAA-MM"), já no dia útil certo. */
export function obligationDue(ob, competence, holidays = []) {
  const [y, m] = competence.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + (ob.monthsAfter ?? 1), 1)), yy = t.getUTCFullYear(), mm = t.getUTCMonth() + 1;
  return adjustBusinessDay(`${yy}-${pad(mm)}-${pad(Math.min(ob.day, lastDay(yy, mm)))}`, ob.onNonBusiness ?? "before", holidays);
}
/** Tarefas do mês para cada cliente × obrigação; a tarefa vence `leadDays` úteis antes do prazo legal (folga do escritório). */
export function monthlyObligations(clients, obligations, competence, holidays = []) {
  const out = [];
  for (const c of clients) for (const code of c.obligations) {
    const ob = obligations.find((o) => o.code === code); if (!ob) continue;
    const legal = obligationDue(ob, competence, holidays);
    out.push({ clientId: c.id, code, title: `${ob.name} · ${c.name} · ${competence.slice(5)}/${competence.slice(0, 4)}`, legalDue: legal, dueDate: ob.leadDays ? addBusinessDays(legal, -ob.leadDays, holidays) : legal, key: `${c.id}:${code}:${competence}` });
  }
  return out;
}

// ------------------------------------------------------------------ perfil agência: horas faturáveis
/** Arredonda minutos para blocos (15 = quarto de hora), sempre para cima. */
export const roundMinutes = (min, block = 0) => (block > 0 ? Math.ceil(min / block) * block : min);
/**
 * Faturamento das horas: entries [{ userId, clientId, minutes, billable }], rates: { [userId]: centavos/hora } (ou `defaultRateCents`)
 * → { byClient: { [clientId]: { minutes, amountCents, lines: [{ userId, minutes, rateCents, amountCents }] } }, totalCents }
 */
export function billableHours(entries, { rates = {}, defaultRateCents = 0, roundTo = 0 } = {}) {
  const byClient = {};
  for (const e of entries) {
    if (!e.billable || !e.clientId) continue;
    const c = (byClient[e.clientId] ??= { minutes: 0, amountCents: 0, users: {} });
    c.users[e.userId] = (c.users[e.userId] ?? 0) + e.minutes;
  }
  let total = 0;
  for (const c of Object.values(byClient)) {
    c.lines = Object.entries(c.users).map(([userId, raw]) => { const minutes = roundMinutes(raw, roundTo), rateCents = rates[userId] ?? defaultRateCents; return { userId, minutes, rateCents, amountCents: Math.round((minutes * rateCents) / 60) }; });
    c.minutes = c.lines.reduce((s, l) => s + l.minutes, 0); c.amountCents = c.lines.reduce((s, l) => s + l.amountCents, 0); delete c.users; total += c.amountCents;
  }
  return { byClient, totalCents: total };
}

// ------------------------------------------------------------------ perfil obras: checklist com foto
/** Itens: [{ id, text, requirePhoto?, done?, photoIds? }] → { done, total, missingPhotos: [ids], complete } */
export function checklistStatus(items) {
  const missing = items.filter((i) => i.done && i.requirePhoto && !(i.photoIds ?? []).length).map((i) => i.id);
  const done = items.filter((i) => i.done && !missing.includes(i.id)).length;
  return { done, total: items.length, missingPhotos: missing, complete: done === items.length };
}
/** Marcar item que pede foto sem foto → erro. */
export const canCheckItem = (item, photoIds = item.photoIds ?? []) => (!item.requirePhoto || photoIds.length > 0 ? { ok: true } : { ok: false, code: "PHOTO_REQUIRED" });
/** Concluir a tarefa (categoria DONE) exige checklist completo quando o projeto pede. */
export const canCompleteTask = (items, { requireChecklist = false } = {}) => (!requireChecklist || checklistStatus(items).complete ? { ok: true } : { ok: false, code: "CHECKLIST_INCOMPLETE" });

// ------------------------------------------------------------------ perfis
export const TASK_SEGMENTS = {
  GENERAL: { label: "Equipe em geral", words: { task: "tarefa", tasks: "tarefas", project: "projeto", client: "cliente" }, on: [] },
  ACCOUNTING: { label: "Escritório contábil", words: { task: "obrigação", tasks: "obrigações", project: "carteira", client: "cliente" }, on: ["recurrence", "obligations", "templates", "workload"] },
  AGENCY: { label: "Agência e serviços", words: { task: "job", tasks: "jobs", project: "conta", client: "cliente" }, on: ["timesheet_billing", "guest_approval", "custom_fields", "templates"] },
  CONSTRUCTION: { label: "Obras e manutenção", words: { task: "serviço", tasks: "serviços", project: "obra", client: "cliente" }, on: ["photo_checklist", "gantt", "templates", "guest_approval"] },
};
export const taskSegment = (id) => (TASK_SEGMENTS[id] ? { id, ...TASK_SEGMENTS[id] } : { id: "GENERAL", ...TASK_SEGMENTS.GENERAL });
