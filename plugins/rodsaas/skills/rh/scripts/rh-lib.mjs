// rodsaas · rh (app Pessoas) — regras puras de RH (sem banco, sem rede).
// Férias pela CLT (período aquisitivo e concessivo, faltas, fracionamento, venda de 1/3, início antes de descanso,
// aviso, pagamento, férias vencidas, coletivas, regime livre de estágio/PJ), licenças legais, dias úteis com feriados,
// motor de aprovação genérico (gestor, gestor do gestor, papel, pessoa, condição por valor, delegação, "qualquer um"
// ou "todos"), despesas, CPF e casamento de holerites (arquivos ou PDF único por página), vencimento de documentos,
// organograma sem ciclo, checklists de admissão/desligamento, metas/OKR, avaliação ponderada, 9-box, fases do ciclo,
// eNPS e anonimato mínimo nas pesquisas, indicadores (rotatividade, absenteísmo), quem vê o quê (LGPD),
// fechamento do mês para a contabilidade (CSV), tempo de casa e aniversários.
// Datas de calendário são strings "YYYY-MM-DD" (sem fuso: é dia de trabalho, não instante).
// Porte para TypeScript em api/src/modules/rh/lib/ (e o que o front usar), com os testes.
// Referências legais citadas nos comentários: confira se não mudaram antes de portar (CLT arts. 129–145, 473).
// Rode: node --test rh-lib.test.mjs

import { brazilHolidays } from "../../agenda/scripts/agenda-lib.mjs";
export { brazilHolidays };

// ------------------------------------------------------------------ datas

const pad = (n) => String(n).padStart(2, "0");
const parse = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (ms) => { const t = new Date(ms); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
export const addDays = (ymd, n) => fmt(parse(ymd) + n * 86_400_000);
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86_400_000); // b − a
export const weekday = (ymd) => new Date(parse(ymd)).getUTCDay();
/** Soma anos mantendo o dia (29/02 vira 28/02 em ano não bissexto). */
export function addYears(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
  return `${y + n}-${pad(m)}-${pad(Math.min(d, last))}`;
}
export function addMonths(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/** Conjunto de feriados nacionais (YYYY-MM-DD) dos anos pedidos + os extras da empresa (municipais, estaduais). */
export function holidaySet(years, extra = []) {
  const s = new Set(extra.map((h) => (typeof h === "string" ? h : h.date)));
  for (const y of years) for (const h of brazilHolidays(y)) s.add(h.date);
  return s;
}

/** Dias úteis entre duas datas (inclusive), sem sábados, domingos e feriados. */
export function businessDays(start, end, holidays = new Set()) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) { const w = weekday(d); if (w !== 0 && w !== 6 && !holidays.has(d)) n++; }
  return n;
}

// ------------------------------------------------------------------ férias (CLT)

/** Dias de férias pelo número de faltas injustificadas no período aquisitivo (CLT art. 130). */
export function vacationDaysForAbsences(absences = 0) {
  if (absences <= 5) return 30;
  if (absences <= 14) return 24;
  if (absences <= 23) return 18;
  if (absences <= 32) return 12;
  return 0;
}

/**
 * Períodos aquisitivos desde a admissão até hoje.
 * Cada período: 12 meses (art. 130); concessivo = 12 meses seguintes (art. 134); férias fora do concessivo = em dobro (art. 137).
 * absences: { [índice]: faltas injustificadas }; taken: [{ period, days, abono }] (gozadas ou aprovadas); lost: [índices]
 * (perdidos, ex.: afastamento pelo INSS acima de 6 meses — art. 133, decidido pelo RH).
 * status: "em_aquisicao" | "disponivel" | "vencendo" (concessivo acaba em ≤ warnDays) | "vencida" (concessivo acabou com saldo) | "quitado" | "perdido".
 * accrued: dias proporcionais do período em curso (2,5 por mês completo; fração ≥ 15 dias conta como mês — informativo).
 */
export function acquisitionPeriods({ admissionDate, today, absences = {}, taken = [], lost = [], warnDays = 60 }) {
  const out = [];
  for (let i = 0; ; i++) {
    const start = addYears(admissionDate, i);
    if (start > today) break;
    const end = addDays(addYears(admissionDate, i + 1), -1);
    const concessiveEnd = addDays(addYears(admissionDate, i + 2), -1);
    const complete = today > end;
    const entitled = lost.includes(i) ? 0 : vacationDaysForAbsences(absences[i] ?? 0);
    const used = taken.filter((t) => t.period === i).reduce((a, t) => a + (t.days ?? 0), 0);
    const abono = taken.filter((t) => t.period === i).reduce((a, t) => a + (t.abono ?? 0), 0);
    const segments = taken.filter((t) => t.period === i && (t.days ?? 0) > 0).length;
    const balance = Math.max(0, entitled - used - abono);
    let status;
    if (lost.includes(i)) status = "perdido";
    else if (!complete) status = "em_aquisicao";
    else if (balance === 0) status = "quitado";
    else if (today > concessiveEnd) status = "vencida";
    else if (diffDays(today, concessiveEnd) <= warnDays) status = "vencendo";
    else status = "disponivel";
    let accrued = null;
    if (!complete) {
      let months = 0;
      for (let k = 1; k <= 12; k++) { const mEnd = addDays(addMonths(start, k), -1); if (mEnd <= today) months = k; else { if (diffDays(addMonths(start, k - 1), today) + 1 >= 15) months = k; break; } }
      accrued = Math.min(30, months * 2.5);
    }
    out.push({ index: i, start, end, concessiveEnd, complete, entitled, used, abono, segments, balance, status, accrued });
  }
  return out;
}

/**
 * Valida um plano de férias de um período aquisitivo.
 * segments: [{ start, days }] novos; previous: [dias] já gozados/aprovados no período; abonoDays: dias vendidos agora.
 * Regras (CLT art. 134 §1º e §3º, 143, 145): até 3 períodos; cada um com ≥ 5 dias; um deles com ≥ 14 dias
 * (exigido quando não sobra como cumprir depois); não começa nos 2 dias antes de feriado ou do descanso semanal
 * (nem no próprio descanso/feriado); total + venda ≤ saldo; venda ≤ 1/3 do direito e uma vez por período.
 * Avisos (não bloqueiam): menos de 30 dias de antecedência (art. 135), passa do concessivo (paga em dobro, art. 137).
 */
export function validateVacationPlan({ period, segments, previous = [], abonoDays = 0, abonoAlreadySold = false, holidays = new Set(), restDays = [0], today, minNoticeDays = 30, regime = "clt" }) {
  const errors = [], warnings = [];
  const clt = regime === "clt"; // "livre" (estágio — recesso da Lei 11.788 —, PJ pela política da empresa): só saldo, datas e sobreposição
  const segs = [...segments].sort((a, b) => a.start.localeCompare(b.start));
  if (!segs.length && !abonoDays) errors.push({ code: "EMPTY_PLAN", message: "Informe pelo menos um período" });
  if (period.status === "em_aquisicao") errors.push({ code: "PERIOD_NOT_COMPLETE", message: "O período aquisitivo ainda não terminou" });
  if (period.status === "perdido") errors.push({ code: "PERIOD_LOST", message: "Este período não dá direito a férias" });
  if (clt && previous.length + segs.length > 3) errors.push({ code: "TOO_MANY_PERIODS", message: "As férias podem ser divididas em no máximo 3 períodos" });
  if (!clt && abonoDays > 0) errors.push({ code: "ABONO_NOT_ALLOWED", message: "Venda de dias só existe nas férias CLT" });
  const isRest = (d) => restDays.includes(weekday(d)) || holidays.has(d);
  for (const [k, s] of segs.entries()) {
    if (!Number.isInteger(s.days) || s.days < (clt ? 5 : 1)) errors.push({ code: clt ? "SEGMENT_MIN_5" : "INVALID_DAYS", message: clt ? "Cada período precisa ter pelo menos 5 dias" : "Informe a quantidade de dias", segment: k });
    if (clt && (isRest(s.start) || isRest(addDays(s.start, 1)) || isRest(addDays(s.start, 2)))) errors.push({ code: "START_BEFORE_REST", message: "As férias não podem começar nos 2 dias antes de feriado ou do descanso semanal", segment: k });
    if (s.start <= today) errors.push({ code: "START_IN_PAST", message: "A data de início precisa ser futura", segment: k });
    else if (diffDays(today, s.start) < minNoticeDays) warnings.push({ code: "NOTICE_SHORT", message: `Menos de ${minNoticeDays} dias de antecedência`, segment: k });
    if (clt && addDays(s.start, s.days - 1) > period.concessiveEnd) warnings.push({ code: "AFTER_CONCESSIVE", message: "Termina depois do período concessivo: os dias fora dele são pagos em dobro", segment: k });
    if (k > 0) { const prevEnd = addDays(segs[k - 1].start, segs[k - 1].days - 1); if (s.start <= prevEnd) errors.push({ code: "OVERLAP", message: "Períodos sobrepostos", segment: k }); }
  }
  const total = segs.reduce((a, s) => a + (s.days || 0), 0);
  const abonoMax = Math.floor(period.entitled / 3);
  if (abonoDays > 0) {
    if (abonoAlreadySold) errors.push({ code: "ABONO_ALREADY_SOLD", message: "A venda de dias já foi feita neste período" });
    if (abonoDays > abonoMax) errors.push({ code: "ABONO_MAX", message: `Dá para vender no máximo ${abonoMax} dias (1/3)` });
  }
  if (total + abonoDays > period.balance) errors.push({ code: "EXCEEDS_BALANCE", message: `O saldo é de ${period.balance} dias` });
  const all = [...previous, ...segs.map((s) => s.days)];
  const remaining = period.balance - total - abonoDays;
  const has14 = all.some((d) => d >= 14);
  const slotsLeft = 3 - all.length;
  if (clt && !has14 && (slotsLeft === 0 || remaining < 14)) errors.push({ code: "MIN_14_REQUIRED", message: "Um dos períodos precisa ter pelo menos 14 dias" });
  const plan = segs.map((s) => ({ start: s.start, days: s.days, end: addDays(s.start, s.days - 1), returnDate: addDays(s.start, s.days), paymentDue: addDays(s.start, -2) }));
  return { ok: errors.length === 0, errors, warnings, plan, remaining: Math.max(0, remaining), abonoMax };
}

/**
 * Férias coletivas (CLT art. 139 e 140): até 2 períodos no ano, nenhum com menos de 10 dias, comunicação ao
 * Ministério do Trabalho e ao sindicato com 15 dias de antecedência (aviso), não começa antes de descanso/feriado.
 * periodsThisYear: [{ start, days }] já lançados para o mesmo grupo no ano civil.
 */
export function validateCollectiveVacation({ start, days, periodsThisYear = [], today, holidays = new Set(), restDays = [0] }) {
  const errors = [], warnings = [];
  if (!Number.isInteger(days) || days < 10) errors.push({ code: "COLLECTIVE_MIN_10", message: "Férias coletivas precisam ter pelo menos 10 dias" });
  if (periodsThisYear.filter((p) => p.start.slice(0, 4) === start.slice(0, 4)).length >= 2) errors.push({ code: "COLLECTIVE_MAX_2", message: "No máximo 2 períodos de férias coletivas por ano" });
  const isRest = (d) => restDays.includes(weekday(d)) || holidays.has(d);
  if (isRest(start) || isRest(addDays(start, 1)) || isRest(addDays(start, 2))) errors.push({ code: "START_BEFORE_REST", message: "As férias não podem começar nos 2 dias antes de feriado ou do descanso semanal" });
  if (start <= today) errors.push({ code: "START_IN_PAST", message: "A data de início precisa ser futura" });
  else if (diffDays(today, start) < 15) warnings.push({ code: "COLLECTIVE_NOTICE_15", message: "Comunique o Ministério do Trabalho e o sindicato com 15 dias de antecedência" });
  return { ok: errors.length === 0, errors, warnings, end: addDays(start, Math.max(1, days) - 1) };
}
/**
 * Quem entra nas coletivas: com saldo suficiente (full) ou parcial — quem tem menos de 12 meses goza o proporcional
 * e o excedente é licença remunerada; um novo período aquisitivo começa no início das coletivas (art. 140).
 * employees: [{ id, available }] (saldo disponível + proporcional, em dias).
 */
export function collectiveImpact(employees, days) {
  const full = [], partial = [];
  for (const e of employees) (e.available >= days ? full : partial).push(e.available >= days ? { id: e.id } : { id: e.id, available: Math.max(0, Math.floor(e.available)), paidLeave: days - Math.max(0, Math.floor(e.available)) });
  return { full, partial };
}

/** Pessoas (distintas) com ausência que cruza o intervalo — para avisar "3 de 8 da equipe fora". */
export function overlapping(items, start, end, excludeEmployeeId = null) {
  return [...new Set(items.filter((i) => i.employeeId !== excludeEmployeeId && i.start <= end && (i.end ?? i.start) >= start).map((i) => i.employeeId))];
}

// ------------------------------------------------------------------ licenças e ausências

/**
 * Tipos de ausência (CLT art. 473 e leis específicas). legalDays = dias garantidos (null = conforme documento);
 * extendedDays = Empresa Cidadã (opcional da empresa); sensitive = dado de saúde (acesso só RH e a pessoa).
 */
export const LEAVE_TYPES = [
  { id: "ferias", label: "Férias", paid: true, legalDays: null, document: false, approval: true },
  { id: "folga", label: "Folga / banco de horas", paid: true, legalDays: null, document: false, approval: true },
  { id: "atestado", label: "Atestado médico", paid: true, legalDays: null, document: true, approval: false, sensitive: true },
  { id: "acompanhamento", label: "Acompanhamento médico de filho/dependente", paid: true, legalDays: null, document: true, approval: false, sensitive: true },
  { id: "maternidade", label: "Licença-maternidade", paid: true, legalDays: 120, extendedDays: 180, document: true, approval: false, sensitive: true },
  { id: "paternidade", label: "Licença-paternidade", paid: true, legalDays: 5, extendedDays: 20, document: true, approval: false },
  { id: "casamento", label: "Casamento (gala)", paid: true, legalDays: 3, document: true, approval: false },
  { id: "luto", label: "Falecimento de familiar (nojo)", paid: true, legalDays: 2, document: true, approval: false },
  { id: "doacao_sangue", label: "Doação de sangue", paid: true, legalDays: 1, perYear: 1, document: true, approval: false },
  { id: "eleitoral", label: "Alistamento eleitoral", paid: true, legalDays: 2, document: true, approval: false },
  { id: "vestibular", label: "Vestibular / Enem", paid: true, legalDays: null, document: true, approval: false },
  { id: "judicial", label: "Comparecimento em juízo", paid: true, legalDays: null, document: true, approval: false },
  { id: "inss", label: "Afastamento pelo INSS (a partir do 16º dia)", paid: false, legalDays: null, document: true, approval: false, sensitive: true },
  { id: "nao_remunerada", label: "Licença não remunerada", paid: false, legalDays: null, document: false, approval: true },
  { id: "falta", label: "Falta injustificada", paid: false, legalDays: null, document: false, approval: false, countsAsAbsence: true },
];
export const leaveType = (id) => LEAVE_TYPES.find((t) => t.id === id) ?? null;

/** Valida um lançamento de ausência: { type, start, days, hasDocument, companyCitizen, usedThisYear }. */
export function validateLeave({ type, start, days, hasDocument = false, companyCitizen = false, usedThisYear = 0 }) {
  const t = leaveType(type), errors = [], warnings = [];
  if (!t) return { ok: false, errors: [{ code: "INVALID_TYPE", message: "Tipo de ausência inválido" }], warnings };
  if (type === "ferias") errors.push({ code: "USE_VACATION_FLOW", message: "Férias seguem o fluxo de férias" });
  if (!Number.isInteger(days) || days < 1) errors.push({ code: "INVALID_DAYS", message: "Informe a quantidade de dias" });
  const max = companyCitizen && t.extendedDays ? t.extendedDays : t.legalDays;
  if (max != null && days > max) warnings.push({ code: "ABOVE_LEGAL_DAYS", message: `A lei garante ${max} dias; o excedente é decisão da empresa` });
  if (t.perYear && usedThisYear >= t.perYear) warnings.push({ code: "YEARLY_LIMIT", message: "Já usado neste ano" });
  if (t.document && !hasDocument) warnings.push({ code: "DOCUMENT_PENDING", message: "Anexe o comprovante" });
  if (type === "atestado" && days > 15) warnings.push({ code: "INSS_AFTER_15", message: "A partir do 16º dia o afastamento é pelo INSS" });
  return { ok: errors.length === 0, errors, warnings, end: start ? addDays(start, Math.max(1, days) - 1) : null };
}

// ------------------------------------------------------------------ organograma

/** Cadeia de gestores de baixo para cima (para em ciclo). map: { id: managerId|null }. */
export function managerChain(id, map) {
  const out = [], seen = new Set([id]);
  for (let cur = map[id]; cur; cur = map[cur]) { if (seen.has(cur)) break; out.push(cur); seen.add(cur); }
  return out;
}
/** Colocar `managerId` como gestor de `id` criaria ciclo (ou é ela mesma)? */
export const wouldCreateCycle = (id, managerId, map) => !!managerId && (managerId === id || managerChain(managerId, map).includes(id));
/** Subordinados diretos e indiretos de `id`. */
export function allReports(id, map) {
  const children = {}; for (const [e, m] of Object.entries(map)) if (m) (children[m] ??= []).push(e);
  const out = [], stack = [...(children[id] ?? [])], seen = new Set();
  while (stack.length) { const e = stack.pop(); if (seen.has(e)) continue; seen.add(e); out.push(e); stack.push(...(children[e] ?? [])); }
  return out;
}

// ------------------------------------------------------------------ aprovações (motor genérico)

/**
 * Resolve as etapas de um fluxo para um pedido.
 * flow.steps: [{ type: "manager" | "manager_of_manager" | "role" | "user", role?, userId?, mode?: "any" | "all",
 *               when?: { field, op: ">=" | ">" | "<" | "<=" | "=", value } }]
 * request: { requesterEmployeeId, requesterUserId, data: { amount, days… } }
 * people: { employees: { [empId]: { userId, managerId } }, roles: { RH: [userIds] }, delegations: [{ fromUserId, toUserId, start, end }] }
 * Quem pede nunca aprova o próprio pedido; etapa sem aprovador (sem gestor) cai para o papel RH; delegação ativa troca o aprovador.
 */
export function resolveApprovers(flow, request, { employees, roles = {}, delegations = [], today }) {
  const cmp = { ">=": (a, b) => a >= b, ">": (a, b) => a > b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, "=": (a, b) => a === b };
  const userOf = (empId) => employees[empId]?.userId ?? null;
  const mgrOf = (empId) => employees[empId]?.managerId ?? null;
  const delegate = (u) => delegations.find((d) => d.fromUserId === u && d.start <= today && today <= d.end)?.toUserId ?? u;
  const steps = [];
  for (const [i, st] of (flow.steps ?? []).entries()) {
    if (st.when) { const v = request.data?.[st.when.field]; if (v == null || !cmp[st.when.op]?.(Number(v), Number(st.when.value))) continue; }
    let approvers = [];
    if (st.type === "manager") approvers = [userOf(mgrOf(request.requesterEmployeeId))];
    else if (st.type === "manager_of_manager") approvers = [userOf(mgrOf(mgrOf(request.requesterEmployeeId)))];
    else if (st.type === "role") approvers = [...(roles[st.role] ?? [])];
    else if (st.type === "user") approvers = [st.userId];
    approvers = [...new Set(approvers.filter(Boolean).map(delegate))].filter((u) => u !== request.requesterUserId);
    let fallback = false;
    if (!approvers.length) { approvers = (roles.RH ?? []).map(delegate).filter((u) => u !== request.requesterUserId); fallback = true; }
    if (!approvers.length) continue;
    if (steps.length && steps[steps.length - 1].approvers.join() === approvers.join()) continue; // mesma pessoa duas vezes seguidas: uma etapa só
    steps.push({ index: steps.length, flowStep: i, type: st.type, approvers, mode: st.mode ?? "any", fallback, decisions: [] });
  }
  return { steps, status: steps.length ? "PENDING" : "APPROVED", current: steps.length ? 0 : null };
}

/** Aplica uma decisão. Devolve { state } ou { error: { code } }. Recusar exige comentário. */
export function applyDecision(state, { userId, decision, comment = "", at = new Date().toISOString() }) {
  if (state.status !== "PENDING") return { error: { code: "NOT_PENDING" } };
  const step = state.steps[state.current];
  if (!step.approvers.includes(userId)) return { error: { code: "NOT_APPROVER" } };
  if (step.decisions.some((d) => d.userId === userId)) return { error: { code: "ALREADY_DECIDED" } };
  if (!["approve", "reject"].includes(decision)) return { error: { code: "INVALID_DECISION" } };
  if (decision === "reject" && !String(comment).trim()) return { error: { code: "COMMENT_REQUIRED" } };
  const steps = state.steps.map((s, i) => (i === state.current ? { ...s, decisions: [...s.decisions, { userId, decision, comment, at }] } : s));
  const cur = steps[state.current];
  if (decision === "reject") return { state: { ...state, steps, status: "REJECTED", current: null } };
  const done = cur.mode === "all" ? cur.approvers.every((u) => cur.decisions.some((d) => d.userId === u && d.decision === "approve")) : true;
  if (!done) return { state: { ...state, steps } };
  const next = state.current + 1;
  return { state: { ...state, steps, status: next >= steps.length ? "APPROVED" : "PENDING", current: next >= steps.length ? null : next } };
}

/** Quem pode decidir agora (para a caixa "Para aprovar"). */
export const pendingApprovers = (state) => (state.status === "PENDING" ? state.steps[state.current].approvers.filter((u) => !state.steps[state.current].decisions.some((d) => d.userId === u)) : []);

// ------------------------------------------------------------------ despesas

/**
 * Valida uma despesa. category: { id, limit?, receiptAbove?, perKm? } (perKm = reembolso por km, ex.: 1.2)
 * expense: { amount, km?, hasReceipt, justification, date }
 */
export function validateExpense(category, e, { today, maxAgeDays = 90 }) {
  const errors = [], warnings = [];
  const amount = category.perKm ? Math.round((e.km ?? 0) * category.perKm * 100) / 100 : Math.round((e.amount ?? 0) * 100) / 100;
  if (category.perKm && !(e.km > 0)) errors.push({ code: "KM_REQUIRED", message: "Informe a quilometragem" });
  if (!category.perKm && !(amount > 0)) errors.push({ code: "INVALID_AMOUNT", message: "Informe o valor" });
  if (!e.date) errors.push({ code: "DATE_REQUIRED", message: "Informe a data" });
  else if (e.date > today) errors.push({ code: "FUTURE_DATE", message: "Data no futuro" });
  else if (diffDays(e.date, today) > maxAgeDays) errors.push({ code: "TOO_OLD", message: `Despesa com mais de ${maxAgeDays} dias` });
  if (category.receiptAbove != null && amount > category.receiptAbove && !e.hasReceipt) errors.push({ code: "RECEIPT_REQUIRED", message: "Anexe o recibo" });
  if (category.limit != null && amount > category.limit) {
    if (!String(e.justification ?? "").trim()) errors.push({ code: "OVER_LIMIT_JUSTIFY", message: `Acima do limite de R$ ${category.limit}: justifique` });
    else warnings.push({ code: "OVER_LIMIT", message: `Acima do limite de R$ ${category.limit}` });
  }
  return { ok: errors.length === 0, errors, warnings, amount };
}

/** Totais de um relatório por categoria (centavos certos). */
export function reportTotals(items) {
  const by = {}; let total = 0;
  for (const i of items) { const c = Math.round(i.amount * 100); by[i.categoryId] = (by[i.categoryId] ?? 0) + c; total += c; }
  return { total: total / 100, byCategory: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v / 100])) };
}

// ------------------------------------------------------------------ CPF, documentos e holerites

export const onlyDigits = (s) => String(s ?? "").replace(/\D/g, "");
export function isValidCpf(v) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len) => { let s = 0; for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
export const formatCpf = (v) => { const d = onlyDigits(v); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : v; };
/** "123.***.***-09" para quem não é RH nem a própria pessoa. */
export const maskCpf = (v) => { const d = onlyDigits(v); return d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : ""; };
/** CPFs válidos encontrados num texto ou nome de arquivo (com ou sem pontuação), sem repetir. */
export function extractCpfs(text) {
  const found = String(text ?? "").match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) ?? [];
  return [...new Set(found.map(onlyDigits).filter(isValidCpf))];
}

/**
 * Casa holerites com colaboradores pelo CPF (no nome do arquivo ou no texto do PDF).
 * files: [{ name, text }]; employees: [{ id, cpf }]. Arquivo com 2+ CPFs de colaboradores diferentes = ambíguo.
 */
export function matchPayslips(files, employees) {
  const byCpf = new Map(employees.map((e) => [onlyDigits(e.cpf), e.id]));
  const matched = [], unmatched = [], ambiguous = [];
  for (const f of files) {
    const cpfs = [...new Set([...extractCpfs(f.name), ...extractCpfs(f.text)])].filter((c) => byCpf.has(c));
    if (cpfs.length === 1) matched.push({ file: f.name, employeeId: byCpf.get(cpfs[0]) });
    else if (cpfs.length > 1) ambiguous.push({ file: f.name, employeeIds: cpfs.map((c) => byCpf.get(c)) });
    else unmatched.push({ file: f.name });
  }
  return { matched, unmatched, ambiguous };
}

/**
 * PDF único com os holerites de todos (um ou mais por pessoa): separa por página pelo CPF.
 * pages: [texto da página]; página sem CPF continua a pessoa da página anterior (holerite de 2 páginas);
 * página com CPFs de 2+ colaboradores = ambígua. Mesma pessoa em trechos separados junta as páginas.
 * → { groups: [{ employeeId, pages: [índices] }], unmatchedPages, ambiguousPages }
 */
export function groupPagesByCpf(pages, employees) {
  const byCpf = new Map(employees.map((e) => [onlyDigits(e.cpf), e.id]));
  const groups = new Map(), unmatchedPages = [], ambiguousPages = [];
  let current = null;
  pages.forEach((text, i) => {
    const ids = [...new Set(extractCpfs(text).filter((c) => byCpf.has(c)).map((c) => byCpf.get(c)))];
    if (ids.length > 1) { ambiguousPages.push(i); current = null; return; }
    if (ids.length === 1) current = ids[0];
    if (!current) { unmatchedPages.push(i); return; }
    if (!groups.has(current)) groups.set(current, []);
    groups.get(current).push(i);
  });
  return { groups: [...groups].map(([employeeId, pg]) => ({ employeeId, pages: pg })), unmatchedPages, ambiguousPages };
}

/** Situação de um documento com validade: "sem_validade" | "valido" | "vencendo" | "vencido". */
export function expiryState(expiresAt, today, warnDays = 30) {
  if (!expiresAt) return "sem_validade";
  if (expiresAt < today) return "vencido";
  return diffDays(today, expiresAt) <= warnDays ? "vencendo" : "valido";
}

// ------------------------------------------------------------------ desempenho e clima

/** Nota ponderada de uma avaliação (escala 1–5), com 2 casas. answers: [{ score, weight }]; sem nota = ignorado. */
export function reviewScore(answers) {
  const valid = answers.filter((a) => Number.isFinite(a.score));
  const w = valid.reduce((s, a) => s + (a.weight ?? 1), 0);
  if (!w) return null;
  return Math.round((valid.reduce((s, a) => s + a.score * (a.weight ?? 1), 0) / w) * 100) / 100;
}

/**
 * Matriz 9-box: desempenho (nota 1–5 da avaliação) × potencial (1 baixo, 2 médio, 3 alto, definido na calibração).
 * Desempenho: < 2,5 baixo · < 3,75 médio · resto alto. box 1 (baixo/baixo) a 9 (alto/alto).
 */
export const NINE_BOX = {
  1: "Insuficiente", 2: "Eficaz", 3: "Especialista",
  4: "Questionável", 5: "Mantenedor", 6: "Forte desempenho",
  7: "Enigma", 8: "Alto potencial", 9: "Estrela",
};
export function nineBox(performance, potential) {
  if (!Number.isFinite(performance) || ![1, 2, 3].includes(potential)) return null;
  const perf = performance < 2.5 ? 1 : performance < 3.75 ? 2 : 3;
  const box = (potential - 1) * 3 + perf;
  return { box, perf, potential, label: NINE_BOX[box] };
}

/** Fase atual de um ciclo. phases: [{ key, start, end }] em ordem → key, "antes" ou "encerrado". */
export function currentPhase(phases, today) {
  if (!phases.length || today < phases[0].start) return "antes";
  for (const p of phases) if (p.start <= today && today <= p.end) return p.key;
  if (today > phases[phases.length - 1].end) return "encerrado";
  return "entre_fases";
}

/** eNPS de notas 0–10: % promotores (9–10) − % detratores (0–6). */
export function enps(scores) {
  const n = scores.length;
  if (!n) return { n: 0, promoters: 0, passives: 0, detractors: 0, score: null };
  const p = scores.filter((s) => s >= 9).length, d = scores.filter((s) => s <= 6).length;
  return { n, promoters: p, passives: n - p - d, detractors: d, score: Math.round(((p - d) / n) * 100) };
}

/**
 * Resultado agregado por grupo com anonimato mínimo (padrão 5 respostas): grupo abaixo do mínimo não aparece e
 * não pode ser descoberto por subtração (geral − grupos mostrados): enquanto os escondidos somarem menos que o
 * mínimo, o menor grupo mostrado também vai para "outros".
 * responses: [{ groupId, enps, answers: { [perguntaId]: 1–5 } }]
 */
export function groupResults(responses, { min = 5 } = {}) {
  const groups = {};
  for (const r of responses) (groups[r.groupId] ??= []).push(r);
  const shown = [], hiddenIds = [];
  for (const [id, list] of Object.entries(groups)) (list.length >= min ? shown : hiddenIds).push(id);
  const hiddenCount = () => hiddenIds.reduce((s, id) => s + groups[id].length, 0);
  shown.sort((a, b) => groups[a].length - groups[b].length || a.localeCompare(b));
  while (hiddenCount() > 0 && hiddenCount() < min && shown.length) hiddenIds.push(shown.shift());
  shown.sort((a, b) => a.localeCompare(b));
  const summarize = (list) => {
    const qs = {};
    for (const r of list) for (const [q, v] of Object.entries(r.answers ?? {})) (qs[q] ??= []).push(v);
    return { n: list.length, enps: enps(list.map((r) => r.enps).filter((v) => v != null)).score, questions: Object.fromEntries(Object.entries(qs).map(([q, vs]) => [q, Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 100) / 100])) };
  };
  const out = shown.map((id) => ({ groupId: id, ...summarize(groups[id]) }));
  const others = hiddenIds.flatMap((id) => groups[id]);
  if (others.length >= min) out.push({ groupId: "outros", ...summarize(others) });
  return { total: responses.length, overall: responses.length >= min ? summarize(responses) : null, groups: out, hiddenGroups: hiddenIds.length };
}

// ------------------------------------------------------------------ admissão / desligamento (checklists)

/**
 * Gera as tarefas de um checklist a partir do modelo e da data-base (admissão ou último dia).
 * template.items: [{ key, title, offsetDays, assignee: "rh" | "gestor" | "colaborador" | "ti" | "financeiro", required? }]
 * offsetDays negativo = antes da data (ex.: -3 "preparar notebook"); a data nunca cai no fim de semana (vai para a sexta antes).
 */
export function checklistItems(template, baseDate) {
  return (template.items ?? []).map((it, i) => {
    let due = addDays(baseDate, it.offsetDays ?? 0);
    while (weekday(due) === 0 || weekday(due) === 6) due = addDays(due, -1);
    return { key: it.key ?? `item-${i}`, title: it.title, assignee: it.assignee ?? "rh", required: it.required !== false, dueDate: due, doneAt: null };
  });
}
/** Progresso: { done, total, pct, overdue, requiredPending }. */
export function checklistProgress(items, today) {
  const total = items.length, done = items.filter((i) => i.doneAt).length;
  return {
    done, total, pct: total ? Math.round((done / total) * 100) : 100,
    overdue: items.filter((i) => !i.doneAt && i.dueDate < today).length,
    requiredPending: items.filter((i) => i.required && !i.doneAt).length,
  };
}

// ------------------------------------------------------------------ metas (OKR / PDI)

/**
 * Progresso (0–100) de um resultado-chave. kr: { kind: "number" | "percent" | "currency" | "boolean", start, target, current }
 * Funciona para metas de reduzir (target < start). Boolean: 0 ou 100.
 */
export function krProgress(kr) {
  if (kr.kind === "boolean") return kr.current ? 100 : 0;
  const start = Number(kr.start ?? 0), target = Number(kr.target), cur = Number(kr.current ?? start);
  if (!Number.isFinite(target) || target === start) return cur === target ? 100 : 0;
  const p = ((cur - start) / (target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(p)));
}
/** Progresso do objetivo = média ponderada dos resultados-chave (peso padrão 1). */
export function objectiveProgress(krs) {
  const w = krs.reduce((s, k) => s + (k.weight ?? 1), 0);
  if (!w) return 0;
  return Math.round(krs.reduce((s, k) => s + krProgress(k) * (k.weight ?? 1), 0) / w);
}
/**
 * Situação comparando com o esperado linear do ciclo: "no_ritmo" (≥ esperado − 10), "atencao" (≥ esperado − 25), "atrasado".
 * Antes de começar: "nao_iniciado"; depois do fim: "concluido" (≥ 100) ou "nao_atingido".
 */
export function goalStatus(progress, periodStart, periodEnd, today) {
  if (today < periodStart) return "nao_iniciado";
  if (today > periodEnd) return progress >= 100 ? "concluido" : "nao_atingido";
  if (progress >= 100) return "concluido";
  const expected = (diffDays(periodStart, today) / Math.max(1, diffDays(periodStart, periodEnd))) * 100;
  if (progress >= expected - 10) return "no_ritmo";
  if (progress >= expected - 25) return "atencao";
  return "atrasado";
}

// ------------------------------------------------------------------ fechamento do mês (exportar para a contabilidade)

/**
 * Eventos (férias, ausências, admissões, desligamentos) que tocam o mês "YYYY-MM", com os dias dentro do mês.
 * events: [{ employeeId, type, start, end }] → [{ ...evento, from, to, daysInMonth }], ordenado por pessoa e data.
 */
export function eventsForMonth(events, ym) {
  const first = `${ym}-01`, last = addDays(addMonths(first, 1), -1);
  return events
    .filter((e) => e.start <= last && (e.end ?? e.start) >= first)
    .map((e) => { const from = e.start < first ? first : e.start, to = (e.end ?? e.start) > last ? last : (e.end ?? e.start); return { ...e, from, to, daysInMonth: diffDays(from, to) + 1 }; })
    .sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId)) || a.from.localeCompare(b.from));
}
/** CSV (separador ";", BOM para o Excel) com cabeçalho; aspas quando preciso; texto começando com = + - @ ganha ' (injeção de fórmula). */
export function toCsv(rows, columns) {
  const esc = (v) => { let s = v == null ? "" : String(v); if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [columns.map((c) => esc(c.label)).join(";"), ...rows.map((r) => columns.map((c) => esc(typeof c.value === "function" ? c.value(r) : r[c.key])).join(";"))].join("\r\n") + "\r\n";
}

// ------------------------------------------------------------------ indicadores

/** Rotatividade (fórmula usual no Brasil): ((admissões + desligamentos) / 2) / quadro médio × 100; e só desligamentos. */
export function turnover({ admissions = 0, terminations = 0, headcountStart, headcountEnd }) {
  const avg = (headcountStart + headcountEnd) / 2;
  if (!avg) return { rate: null, terminationRate: null, averageHeadcount: 0 };
  const r = (v) => Math.round(v * 10) / 10;
  return { rate: r((((admissions + terminations) / 2) / avg) * 100), terminationRate: r((terminations / avg) * 100), averageHeadcount: avg };
}
/** Absenteísmo: dias de ausência / (pessoas × dias úteis) × 100, 1 casa. */
export function absenteeism({ absentDays, employees, workdays }) {
  if (!employees || !workdays) return null;
  return Math.round((absentDays / (employees * workdays)) * 1000) / 10;
}

// ------------------------------------------------------------------ quem vê o quê (LGPD)

/**
 * Grupos de campos da ficha. public: nome, nome social, foto, cargo, área, gestor, e-mail/telefone de trabalho, local,
 * aniversário (dia/mês), admissão, "fora hoje". job: contrato, jornada, situação, histórico sem salário.
 * personal: CPF, RG, PIS, nascimento, endereço, contatos pessoais e de emergência, dependentes. bank: dados bancários/Pix.
 * compensation: salário e histórico. documents: documentos não sensíveis. health: atestados, ASO, licenças de saúde.
 * absences: férias e ausências (tipos de saúde aparecem como "Ausência médica" para quem não tem health).
 * performance: avaliações liberadas, metas, PDI, 1:1. rh_notes: anotações internas do RH.
 */
export const FIELD_GROUPS = ["public", "job", "personal", "bank", "compensation", "documents", "health", "absences", "performance", "rh_notes"];
/**
 * viewer: { employeeId, rhRole: "RH_ADMIN" | "RH" | "FINANCE" | null }; isManager: gestor direto (ou indireto, se a
 * empresa permitir); settings: { managersSeeCompensation, managersSeeDocuments }.
 */
export function visibleGroups({ viewer, targetId, isManager = false, settings = {} }) {
  if (viewer.rhRole === "RH_ADMIN" || viewer.rhRole === "RH") return [...FIELD_GROUPS];
  const g = new Set(["public"]);
  if (viewer.employeeId && viewer.employeeId === targetId) for (const k of FIELD_GROUPS) if (k !== "rh_notes") g.add(k);
  if (isManager) {
    for (const k of ["job", "absences", "performance"]) g.add(k);
    if (settings.managersSeeCompensation) g.add("compensation");
    if (settings.managersSeeDocuments) g.add("documents");
  }
  if (viewer.rhRole === "FINANCE") g.add("bank");
  return FIELD_GROUPS.filter((k) => g.has(k));
}

// ------------------------------------------------------------------ pessoas

/** "2 anos e 3 meses", "8 meses", "12 dias". */
export function tenureText(admissionDate, today) {
  let months = 0;
  while (addMonths(admissionDate, months + 1) <= today) months++;
  const y = Math.floor(months / 12), m = months % 12;
  if (!y && !m) { const d = diffDays(admissionDate, today); return `${d} ${d === 1 ? "dia" : "dias"}`; }
  const parts = [];
  if (y) parts.push(`${y} ${y === 1 ? "ano" : "anos"}`);
  if (m) parts.push(`${m} ${m === 1 ? "mês" : "meses"}`);
  return parts.join(" e ");
}

/** Aniversários nos próximos `days` dias (29/02 comemora em 28/02 nos anos não bissextos), mais próximos primeiro. */
export function upcomingBirthdays(people, today, days = 30) {
  const year = Number(today.slice(0, 4));
  const out = [];
  for (const p of people) {
    if (!p.birthDate) continue;
    const md = p.birthDate.slice(5);
    for (const y of [year, year + 1]) {
      const [m, d] = md.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const date = `${y}-${pad(m)}-${pad(Math.min(d, last))}`;
      const delta = diffDays(today, date);
      if (delta >= 0 && delta <= days) { out.push({ id: p.id, date, inDays: delta, age: y - Number(p.birthDate.slice(0, 4)) }); break; }
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}
