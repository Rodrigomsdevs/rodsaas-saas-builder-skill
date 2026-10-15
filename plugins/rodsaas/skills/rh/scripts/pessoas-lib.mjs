// rodsaas · pessoas — regras puras da operação avançada (sem banco, sem rede): escala de trabalho (conflitos,
// interjornada, descanso semanal, limite semanal, cobertura), recrutamento simples, comunicados com ciência,
// treinamentos com validade, mural de celebrações e os perfis (indústria: EPI e NR; saúde: registro no conselho;
// varejo: rodízio de folgas e folguista). Não é ponto eletrônico: a escala é o planejado, não a marcação.
// Datas "YYYY-MM-DD", horas "HH:MM". Porte para TypeScript em api/src/modules/rh/lib/ com os testes.
// Rode: node --test pessoas-lib.test.mjs

const pad = (n) => String(n).padStart(2, "0");
const parse = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (ms) => { const t = new Date(ms); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
export const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;
export const addDays = (ymd, n) => fmt(parse(ymd) + n * 86_400_000);
export const weekday = (ymd) => new Date(parse(ymd)).getUTCDay();
const monday = (ymd) => addDays(ymd, -((weekday(ymd) + 6) % 7));
export function addMonths(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1)), yy = t.getUTCFullYear(), mm = t.getUTCMonth() + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(d, new Date(Date.UTC(yy, mm, 0)).getUTCDate()))}`;
}
const err = (list, code, message, path) => list.push({ code, message, path });
const isHm = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const hm = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

// ------------------------------------------------------------------ escala
/** Turno: { name, start: "HH:MM", end: "HH:MM", breakMinutes } — fim menor que o início = vira a noite. */
export function validateShift(s) {
  const e = [];
  if (!String(s?.name ?? "").trim()) err(e, "NAME_REQUIRED", "Nome do turno", "name");
  if (!isHm(s?.start)) err(e, "TIME_INVALID", "Início HH:MM", "start");
  if (!isHm(s?.end)) err(e, "TIME_INVALID", "Fim HH:MM", "end");
  if (s?.breakMinutes != null && !(Number.isInteger(s.breakMinutes) && s.breakMinutes >= 0 && s.breakMinutes <= 240)) err(e, "BREAK_INVALID", "Intervalo de 0 a 240 minutos", "breakMinutes");
  if (!e.length) { const m = shiftMinutes(s); if (m <= 0 || m > 12 * 60) err(e, "DURATION_INVALID", "Turno de até 12 horas trabalhadas", "end"); }
  return e;
}
/** Minutos trabalhados (sem o intervalo). */
export function shiftMinutes(s) { let d = hm(s.end) - hm(s.start); if (d <= 0) d += 24 * 60; return d - (s.breakMinutes ?? 0); }
/** Início e fim absolutos (minutos desde a época) da atribuição { date, shift }. */
function span(a) { const st = parse(a.date) / 60_000 + hm(a.shift.start); let en = parse(a.date) / 60_000 + hm(a.shift.end); if (en <= st) en += 24 * 60; return [st, en]; }
/**
 * Conflitos da escala de uma pessoa. assignments: [{ employeeId, date, shift }], leaves: [{ employeeId, start, end }]
 * Regras: dois turnos que se cruzam (OVERLAP); menos de `minRestHours` entre o fim de um e o início do outro
 * (REST_BETWEEN, interjornada de 11 h); escalado em férias/ausência (ON_LEAVE); semana acima de `maxWeeklyMinutes`
 * (WEEKLY_LIMIT, 44 h); sétimo dia seguido sem folga (NO_WEEKLY_REST). → [{ code, employeeId, date }]
 */
export function scheduleConflicts(assignments, { leaves = [], minRestHours = 11, maxWeeklyMinutes = 44 * 60 } = {}) {
  const out = [], add = (code, a) => { if (!out.some((x) => x.code === code && x.employeeId === a.employeeId && x.date === a.date)) out.push({ code, employeeId: a.employeeId, date: a.date }); };
  const byEmp = new Map();
  for (const a of assignments) { if (!byEmp.has(a.employeeId)) byEmp.set(a.employeeId, []); byEmp.get(a.employeeId).push(a); }
  for (const [emp, list] of byEmp) {
    const sorted = [...list].sort((x, y) => span(x)[0] - span(y)[0]);
    for (let i = 1; i < sorted.length; i++) {
      const [, prevEnd] = span(sorted[i - 1]), [st] = span(sorted[i]);
      if (st < prevEnd) add("OVERLAP", sorted[i]);
      else if (st - prevEnd < minRestHours * 60) add("REST_BETWEEN", sorted[i]);
    }
    for (const a of sorted) if (leaves.some((l) => l.employeeId === emp && a.date >= l.start && a.date <= l.end)) add("ON_LEAVE", a);
    const weeks = new Map();
    for (const a of sorted) { const w = monday(a.date); weeks.set(w, (weeks.get(w) ?? 0) + shiftMinutes(a.shift)); }
    for (const a of sorted) if (weeks.get(monday(a.date)) > maxWeeklyMinutes) add("WEEKLY_LIMIT", a);
    const days = [...new Set(sorted.map((a) => a.date))].sort();
    let run = 1;
    for (let i = 1; i < days.length; i++) { run = days[i] === addDays(days[i - 1], 1) ? run + 1 : 1; if (run >= 7) add("NO_WEEKLY_REST", sorted.find((a) => a.date === days[i])); }
  }
  return out;
}
/** Cobertura: needs [{ date, shiftId, min }] × assignments → buracos [{ date, shiftId, min, have }] */
export const coverageGaps = (assignments, needs) => needs.map((n) => ({ ...n, have: assignments.filter((a) => a.date === n.date && a.shift.id === n.shiftId).length })).filter((n) => n.have < n.min);

// ------------------------------------------------------------------ recrutamento simples
export const CANDIDATE_STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];
const STAGE_FLOW = { APPLIED: ["SCREENING", "REJECTED"], SCREENING: ["INTERVIEW", "REJECTED"], INTERVIEW: ["OFFER", "REJECTED"], OFFER: ["HIRED", "REJECTED"], HIRED: [], REJECTED: ["APPLIED"] };
export const canMoveCandidate = (from, to) => (STAGE_FLOW[from] ?? []).includes(to);
/** Vaga: { title, questions?: [{ id, label, required }] } · candidatura: { name, email, phone?, answers?, consent } */
export function validateApplication(app, job) {
  const e = [];
  if (String(app?.name ?? "").trim().split(/\s+/).length < 2) err(e, "NAME_REQUIRED", "Nome e sobrenome", "name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(app?.email ?? ""))) err(e, "EMAIL_INVALID", "E-mail", "email");
  if (app?.phone != null && !/^\d{10,11}$/.test(String(app.phone).replace(/\D/g, ""))) err(e, "PHONE_INVALID", "Telefone com DDD", "phone");
  for (const q of job?.questions ?? []) if (q.required && !String(app?.answers?.[q.id] ?? "").trim()) err(e, "ANSWER_REQUIRED", q.label, `answers.${q.id}`);
  if (app?.consent !== true) err(e, "CONSENT_REQUIRED", "Aceite o uso dos dados para o processo seletivo (LGPD)", "consent");
  return e;
}
/** Mesmo candidato (e-mail sem caixa ou telefone) já inscrito na vaga? */
export const findDuplicate = (list, app) => list.find((c) => c.email.toLowerCase() === String(app.email).toLowerCase() || (app.phone && c.phone && String(c.phone).replace(/\D/g, "") === String(app.phone).replace(/\D/g, ""))) ?? null;
/** Funil por etapa (contagem de quem chegou a cada etapa) e dias até contratar (mediana). */
export function recruitingFunnel(candidates) {
  const order = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED"];
  const reached = Object.fromEntries(order.map((s) => [s, 0]));
  for (const c of candidates) { const max = Math.max(...(c.history ?? [c.stage]).map((s) => order.indexOf(s))); for (let i = 0; i <= max; i++) reached[order[i]]++; }
  const days = candidates.filter((c) => c.stage === "HIRED" && c.hiredAt && c.appliedAt).map((c) => Math.round((Date.parse(c.hiredAt) - Date.parse(c.appliedAt)) / 86_400_000)).sort((a, b) => a - b);
  const median = days.length ? (days.length % 2 ? days[(days.length - 1) / 2] : (days[days.length / 2 - 1] + days[days.length / 2]) / 2) : null;
  return { reached, timeToHireDays: median };
}

// ------------------------------------------------------------------ comunicados com ciência
/** audience: { all: true } | { areaIds?, locationIds?, employeeIds? } (soma os grupos) */
export function validateAnnouncement(a, { today } = {}) {
  const e = [];
  if (!String(a?.title ?? "").trim()) err(e, "TITLE_REQUIRED", "Título", "title");
  if (!String(a?.body ?? "").trim()) err(e, "BODY_REQUIRED", "Texto do comunicado", "body");
  const au = a?.audience ?? {};
  if (!au.all && !(au.areaIds?.length || au.locationIds?.length || au.employeeIds?.length)) err(e, "AUDIENCE_REQUIRED", "Para quem", "audience");
  if (a?.ackDueDate != null && (!isDate(a.ackDueDate) || (today && a.ackDueDate < today))) err(e, "DATE_INVALID", "Prazo da ciência (hoje ou depois)", "ackDueDate");
  if (a?.ackDueDate != null && !a.requireAck) err(e, "ACK_DUE_WITHOUT_ACK", "Prazo só quando pede ciência", "ackDueDate");
  return e;
}
/** Quem recebe (ativos): todos, ou quem está numa das áreas, locais ou na lista. */
export const audienceOf = (a, employees) => employees.filter((p) => p.status !== "TERMINATED" && (a.audience.all || (a.audience.areaIds ?? []).includes(p.areaId) || (a.audience.locationIds ?? []).includes(p.locationId) || (a.audience.employeeIds ?? []).includes(p.id))).map((p) => p.id);
/** Situação da ciência: { total, acked, pending: [ids], overdue (passou do prazo), pct } */
export function ackStatus(a, acks, employees, today) {
  const ids = audienceOf(a, employees), done = new Set(acks.map((x) => x.employeeId));
  const pending = ids.filter((id) => !done.has(id));
  const acked = ids.length - pending.length;
  return { total: ids.length, acked, pending, overdue: !!a.ackDueDate && today > a.ackDueDate && pending.length > 0, pct: ids.length ? Math.round((acked / ids.length) * 100) : null };
}

// ------------------------------------------------------------------ treinamentos com validade
export const expiresOn = (completedOn, validityMonths) => (validityMonths ? addDays(addMonths(completedOn, validityMonths), -1) : null);
/** Situação de um treinamento: missing | valid | expiring (dentro de warnDays) | expired. */
export function trainingStatus(record, training, today, warnDays = 30) {
  if (!record) return { status: "missing", expiresOn: null };
  const exp = expiresOn(record.completedOn, training.validityMonths);
  if (!exp) return { status: "valid", expiresOn: null };
  if (today > exp) return { status: "expired", expiresOn: exp };
  return { status: addDays(today, warnDays) >= exp ? "expiring" : "valid", expiresOn: exp };
}
/** Obrigatórios da pessoa: regra { trainingId, all? , positionIds?, areaIds? } */
export const requiredFor = (emp, rules) => [...new Set(rules.filter((r) => r.all || (r.positionIds ?? []).includes(emp.positionId) || (r.areaIds ?? []).includes(emp.areaId)).map((r) => r.trainingId))];
/** Matriz de conformidade: [{ employeeId, items: [{ trainingId, status, expiresOn }], ok }] — vale o registro mais recente. */
export function complianceMatrix(employees, trainings, records, rules, today, warnDays = 30) {
  return employees.filter((e) => e.status !== "TERMINATED").map((emp) => {
    const items = requiredFor(emp, rules).map((tid) => {
      const tr = trainings.find((t) => t.id === tid);
      const last = records.filter((r) => r.employeeId === emp.id && r.trainingId === tid).sort((a, b) => (a.completedOn < b.completedOn ? 1 : -1))[0];
      return { trainingId: tid, ...trainingStatus(last, tr, today, warnDays) };
    });
    return { employeeId: emp.id, items, ok: items.every((i) => i.status === "valid" || i.status === "expiring") };
  });
}

// ------------------------------------------------------------------ mural de celebrações
/** Celebrações do dia: aniversário (quem não escondeu) e tempo de casa redondo (1+ anos). 29/02 comemora em 28/02 fora do bissexto. */
export function celebrationsOn(people, date) {
  const out = [], [y, m, d] = date.split("-").map(Number), leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const same = (ymd) => { const mm = Number(ymd.slice(5, 7)), dd = Number(ymd.slice(8, 10)); return (mm === m && dd === d) || (!leap && mm === 2 && dd === 29 && m === 2 && d === 28); };
  for (const p of people) {
    if (p.status === "TERMINATED") continue;
    if (p.birthDate && !p.hideBirthday && same(p.birthDate)) out.push({ type: "birthday", employeeId: p.id });
    if (p.admissionDate && same(p.admissionDate)) { const years = y - Number(p.admissionDate.slice(0, 4)); if (years >= 1) out.push({ type: "anniversary", employeeId: p.id, years }); }
  }
  return out;
}

// ------------------------------------------------------------------ perfil indústria: EPI e NR
/**
 * Catálogo de NRs com validade da reciclagem em meses (confira a norma vigente antes de portar; é dado, não código).
 */
export const NR_TRAININGS = [
  { code: "NR-05", name: "CIPA", validityMonths: 12 },
  { code: "NR-10", name: "Segurança em eletricidade", validityMonths: 24 },
  { code: "NR-11", name: "Operador de empilhadeira", validityMonths: 12 },
  { code: "NR-12", name: "Máquinas e equipamentos", validityMonths: 24 },
  { code: "NR-33", name: "Espaço confinado", validityMonths: 12 },
  { code: "NR-35", name: "Trabalho em altura", validityMonths: 24 },
];
/** Entrega de EPI: itens com CA (Certificado de Aprovação) válido na data, quantidade e a assinatura da ficha. */
export function validateEpiDelivery(d, catalog, { today } = {}) {
  const e = [];
  if (!isDate(d?.deliveredOn) || (today && d.deliveredOn > today)) err(e, "DATE_INVALID", "Data da entrega (até hoje)", "deliveredOn");
  const items = Array.isArray(d?.items) ? d.items : [];
  if (!items.length) err(e, "ITEMS_REQUIRED", "Inclua os EPIs entregues", "items");
  items.forEach((it, i) => {
    const epi = catalog.find((c) => c.id === it?.epiId);
    if (!epi) { err(e, "EPI_INVALID", "EPI do catálogo", `items.${i}.epiId`); return; }
    if (!/^\d{3,6}$/.test(String(epi.ca ?? ""))) err(e, "CA_REQUIRED", "EPI sem CA cadastrado", `items.${i}.epiId`);
    else if (!epi.caExpiresOn || (isDate(d?.deliveredOn) && epi.caExpiresOn < d.deliveredOn)) err(e, "CA_EXPIRED", `CA ${epi.ca} vencido na data da entrega`, `items.${i}.epiId`);
    if (!(Number.isInteger(it.qty) && it.qty >= 1 && it.qty <= 100)) err(e, "QTY_INVALID", "Quantidade de 1 a 100", `items.${i}.qty`);
  });
  if (d?.signature !== true && !d?.signatureFileId) err(e, "SIGNATURE_REQUIRED", "A ficha de EPI precisa da assinatura (ou do arquivo assinado)", "signature");
  return e;
}
/** Trocas vencidas/próximas: a última entrega de cada EPI por pessoa + vida útil (dias). → [{ employeeId, epiId, dueOn, overdue }] */
export function epiReplacements(deliveries, catalog, today, warnDays = 15) {
  const last = new Map();
  for (const d of deliveries) for (const it of d.items) { const k = d.employeeId + "|" + it.epiId; if (!last.has(k) || last.get(k) < d.deliveredOn) last.set(k, d.deliveredOn); }
  const out = [];
  for (const [k, on] of last) {
    const [employeeId, epiId] = k.split("|"), epi = catalog.find((c) => c.id === epiId);
    if (!epi?.lifeDays) continue;
    const dueOn = addDays(on, epi.lifeDays);
    if (addDays(today, warnDays) >= dueOn) out.push({ employeeId, epiId, dueOn, overdue: today > dueOn });
  }
  return out.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
}

// ------------------------------------------------------------------ perfil saúde: registro no conselho
export const COUNCILS = ["CRM", "COREN", "CRO", "CRF", "CREFITO", "CRP", "CRN", "CRBM", "CRMV", "CREF"];
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
export function validateCouncil(c) {
  const e = [];
  if (!COUNCILS.includes(c?.council)) err(e, "COUNCIL_INVALID", "Conselho", "council");
  if (!/^\d{1,8}(-?[A-Z0-9]{0,3})?$/.test(String(c?.number ?? "").toUpperCase())) err(e, "NUMBER_INVALID", "Número do registro", "number");
  if (!UFS.includes(c?.uf)) err(e, "UF_INVALID", "UF do registro", "uf");
  if (c?.expiresOn != null && !isDate(c.expiresOn)) err(e, "DATE_INVALID", "Validade", "expiresOn");
  return e;
}
/** Situação do registro: active | expiring | expired | missing (sem registro para quem precisa). */
export function councilStatus(reg, today, warnDays = 30) {
  if (!reg) return "missing";
  if (!reg.expiresOn) return "active";
  if (today > reg.expiresOn) return "expired";
  return addDays(today, warnDays) >= reg.expiresOn ? "expiring" : "active";
}
/** Pode atender (Agenda)? Cargo que exige registro precisa dele ativo (ou vencendo). */
export const canAttend = (emp, today) => !emp.requiresCouncil || ["active", "expiring"].includes(councilStatus(emp.council, today));

// ------------------------------------------------------------------ perfil varejo: rodízio de folgas e folguista
/**
 * Rodízio de folgas: uma folga por semana para cada pessoa, girando o dia; domingo de folga pelo menos a cada
 * `sundayEvery` semanas (comércio: confira a convenção coletiva). people: [ids], start = segunda-feira.
 * → { [employeeId]: ["AAAA-MM-DD", ...] } (uma data por semana)
 */
export function rotateDaysOff(people, { start, weeks, sundayEvery = 3, workDays = [1, 2, 3, 4, 5, 6, 0] }) {
  const out = Object.fromEntries(people.map((p) => [p, []]));
  const sundaySlot = new Map(people.map((p, i) => [p, i % sundayEvery]));
  for (let w = 0; w < weeks; w++) {
    const wk = addDays(start, 7 * w);
    people.forEach((p, i) => {
      if (w % sundayEvery === sundaySlot.get(p)) { out[p].push(addDays(wk, 6)); return; }
      const weekdayOffsets = workDays.filter((d) => d !== 0).map((d) => d - 1);
      out[p].push(addDays(wk, weekdayOffsets[(i + w) % weekdayOffsets.length]));
    });
  }
  return out;
}
/** Folguista cobre o posto de quem folga: { [date]: [{ employeeId (quem folga), coveredBy | null }] }, um posto por folguista por dia. */
export function folguistaPlan(daysOff, folguistas) {
  const byDate = {};
  for (const [emp, dates] of Object.entries(daysOff)) for (const d of dates) (byDate[d] ??= []).push(emp);
  const out = {};
  for (const d of Object.keys(byDate).sort()) {
    const free = folguistas.filter((f) => !(daysOff[f] ?? []).includes(d));
    out[d] = byDate[d].filter((e) => !folguistas.includes(e)).sort().map((e, i) => ({ employeeId: e, coveredBy: free[i] ?? null }));
  }
  return out;
}
/** Domingos de folga de cada um no período e quem passou de `sundayEvery` semanas sem domingo. */
export function sundayGaps(daysOff, { sundayEvery = 3 } = {}) {
  const out = [];
  for (const [emp, dates] of Object.entries(daysOff)) {
    const sundays = dates.filter((d) => weekday(d) === 0).sort();
    const all = [...dates].sort();
    if (!all.length) continue;
    const marks = [addDays(monday(all[0]), -1), ...sundays, addDays(monday(all[all.length - 1]), 6)];
    for (let i = 1; i < marks.length; i++) if ((parse(marks[i]) - parse(marks[i - 1])) / (7 * 86_400_000) > sundayEvery) { out.push(emp); break; }
  }
  return out;
}

// ------------------------------------------------------------------ perfis
export const PEOPLE_SEGMENTS = {
  GENERAL: { label: "Empresa em geral", words: { employee: "colaborador", employees: "colaboradores", location: "unidade" }, on: [] },
  INDUSTRY: { label: "Indústria", words: { employee: "colaborador", employees: "colaboradores", location: "planta" }, on: ["schedules", "trainings", "epi", "nr_trainings", "announcements"] },
  HEALTH: { label: "Saúde", words: { employee: "profissional", employees: "profissionais", location: "unidade" }, on: ["schedules", "trainings", "council_registration", "announcements"] },
  RETAIL: { label: "Varejo", words: { employee: "colaborador", employees: "equipe", location: "loja" }, on: ["schedules", "day_off_rotation", "folguista", "recruiting", "announcements"] },
};
export const peopleSegment = (id) => (PEOPLE_SEGMENTS[id] ? { id, ...PEOPLE_SEGMENTS[id] } : { id: "GENERAL", ...PEOPLE_SEGMENTS.GENERAL });
