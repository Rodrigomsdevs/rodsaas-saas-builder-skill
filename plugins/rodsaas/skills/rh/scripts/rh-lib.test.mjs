// node --test rh-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "./rh-lib.mjs";

const codes = (r) => r.errors.map((e) => e.code);
const wcodes = (r) => r.warnings.map((e) => e.code);
const HOL = L.holidaySet([2026, 2027]);

// ------------------------------------------------------------------ datas

test("datas: soma, diferença, dia da semana, anos e meses", () => {
  assert.equal(L.addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(L.diffDays("2026-10-14", "2026-11-16"), 33);
  assert.equal(L.weekday("2026-10-14"), 3); // quarta
  assert.equal(L.addYears("2024-02-29", 1), "2025-02-28");
  assert.equal(L.addYears("2024-02-29", 4), "2028-02-29");
  assert.equal(L.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(L.addMonths("2026-11-15", 3), "2027-02-15");
});

test("feriados nacionais + extras da empresa e dias úteis", () => {
  assert.ok(HOL.has("2026-11-20")); // Consciência Negra (nacional)
  assert.ok(HOL.has("2026-04-03")); // Sexta-feira Santa
  const s = L.holidaySet([2026], ["2026-01-25", { date: "2026-07-09" }]);
  assert.ok(s.has("2026-01-25") && s.has("2026-07-09"));
  // semana de 16 a 20/11/2026: sexta é feriado → 4 dias úteis
  assert.equal(L.businessDays("2026-11-16", "2026-11-20", HOL), 4);
  assert.equal(L.businessDays("2026-11-16", "2026-11-22"), 5);
});

// ------------------------------------------------------------------ férias

test("tabela de faltas do art. 130", () => {
  assert.deepEqual([0, 5, 6, 14, 15, 23, 24, 32, 33].map(L.vacationDaysForAbsences), [30, 30, 24, 24, 18, 18, 12, 12, 0]);
});

const ADM = "2024-03-10";
test("períodos aquisitivos: datas, situação, saldo e proporcional", () => {
  const ps = L.acquisitionPeriods({ admissionDate: ADM, today: "2026-10-14", taken: [{ period: 0, days: 30 }], absences: { 1: 10 } });
  assert.equal(ps.length, 3);
  assert.deepEqual([ps[0].start, ps[0].end, ps[0].concessiveEnd], ["2024-03-10", "2025-03-09", "2026-03-09"]);
  assert.equal(ps[0].status, "quitado");
  assert.equal(ps[1].entitled, 24);
  assert.equal(ps[1].balance, 24);
  assert.equal(ps[1].status, "disponivel");
  assert.equal(ps[2].status, "em_aquisicao");
  assert.equal(ps[2].complete, false);
  assert.equal(ps[2].accrued, 17.5); // 7 meses completos (10/10 a 14/10 = 5 dias, não conta)
  assert.equal(ps[1].accrued, null);
});

test("proporcional conta fração ≥ 15 dias como mês", () => {
  const [p] = L.acquisitionPeriods({ admissionDate: "2026-09-01", today: "2026-10-16" });
  assert.equal(p.accrued, 5); // set completo + 16 dias de outubro
  const [q] = L.acquisitionPeriods({ admissionDate: "2026-09-01", today: "2026-10-13" });
  assert.equal(q.accrued, 2.5);
});

test("férias vencidas, vencendo, perdido e venda conta no saldo", () => {
  const venc = L.acquisitionPeriods({ admissionDate: ADM, today: "2026-10-14", taken: [{ period: 0, days: 20 }] });
  assert.equal(venc[0].status, "vencida");
  assert.equal(venc[0].balance, 10);
  const vendo = L.acquisitionPeriods({ admissionDate: ADM, today: "2027-01-20", taken: [{ period: 0, days: 30 }] });
  assert.equal(vendo[1].status, "vencendo"); // concessivo termina em 09/03/2027 (48 dias)
  const lost = L.acquisitionPeriods({ admissionDate: ADM, today: "2026-10-14", lost: [0] });
  assert.equal(lost[0].status, "perdido");
  assert.equal(lost[0].entitled, 0);
  const abono = L.acquisitionPeriods({ admissionDate: ADM, today: "2026-10-14", taken: [{ period: 1, days: 20, abono: 10 }] });
  assert.equal(abono[1].balance, 0);
  assert.equal(abono[1].status, "quitado");
  assert.equal(abono[1].segments, 1);
});

const P1 = () => L.acquisitionPeriods({ admissionDate: ADM, today: "2026-10-14" })[1]; // 30 dias, concessivo até 09/03/2027
const plan = (o) => L.validateVacationPlan({ period: P1(), holidays: HOL, today: "2026-10-14", ...o });

test("plano válido em 2 períodos: datas de fim, retorno e pagamento", () => {
  const r = plan({ segments: [{ start: "2027-01-04", days: 10 }, { start: "2026-11-16", days: 20 }] });
  assert.deepEqual(codes(r), []);
  assert.deepEqual(wcodes(r), []);
  assert.equal(r.remaining, 0);
  assert.deepEqual(r.plan[0], { start: "2026-11-16", days: 20, end: "2026-12-05", returnDate: "2026-12-06", paymentDue: "2026-11-14" });
});

test("início nos 2 dias antes do descanso ou de feriado", () => {
  assert.ok(codes(plan({ segments: [{ start: "2026-11-13", days: 30 }] })).includes("START_BEFORE_REST")); // sexta, domingo em 2 dias
  assert.ok(codes(plan({ segments: [{ start: "2026-11-18", days: 30 }] })).includes("START_BEFORE_REST")); // quarta, feriado 20/11
  assert.ok(codes(plan({ segments: [{ start: "2026-11-15", days: 30 }] })).includes("START_BEFORE_REST")); // no próprio domingo
  // empresa de segunda a sexta: descanso sábado e domingo → quinta não pode, quarta pode
  assert.ok(codes(plan({ restDays: [0, 6], segments: [{ start: "2026-12-03", days: 30 }] })).includes("START_BEFORE_REST"));
  assert.ok(!codes(plan({ restDays: [0, 6], segments: [{ start: "2026-12-02", days: 30 }] })).includes("START_BEFORE_REST"));
});

test("fracionamento: até 3 períodos, mínimo 5 dias, um com 14", () => {
  assert.ok(codes(plan({ previous: [14, 6], segments: [{ start: "2026-11-16", days: 5 }, { start: "2026-12-07", days: 5 }] })).includes("TOO_MANY_PERIODS"));
  assert.ok(codes(plan({ segments: [{ start: "2026-11-16", days: 4 }] })).includes("SEGMENT_MIN_5"));
  // 10 + 10 deixa 10 dias para o último: impossível ter 14
  assert.ok(codes(plan({ segments: [{ start: "2026-11-16", days: 10 }, { start: "2027-01-04", days: 10 }] })).includes("MIN_14_REQUIRED"));
  // só 10 agora: ainda sobram 20 dias e 2 períodos → ok
  assert.ok(!codes(plan({ segments: [{ start: "2026-11-16", days: 10 }] })).includes("MIN_14_REQUIRED"));
  // terceiro período sem nenhum de 14 → erro
  assert.ok(codes(plan({ previous: [10, 10], segments: [{ start: "2026-11-16", days: 10 }] })).includes("MIN_14_REQUIRED"));
  assert.ok(codes(plan({ segments: [{ start: "2026-11-16", days: 10 }, { start: "2026-11-23", days: 10 }] })).includes("OVERLAP"));
});

test("venda de 1/3 (abono) e saldo", () => {
  assert.deepEqual(codes(plan({ abonoDays: 10, segments: [{ start: "2026-11-16", days: 20 }] })), []);
  assert.ok(codes(plan({ abonoDays: 11, segments: [{ start: "2026-11-16", days: 19 }] })).includes("ABONO_MAX"));
  assert.ok(codes(plan({ abonoDays: 5, abonoAlreadySold: true, segments: [{ start: "2026-11-16", days: 20 }] })).includes("ABONO_ALREADY_SOLD"));
  assert.ok(codes(plan({ segments: [{ start: "2026-11-16", days: 31 }] })).includes("EXCEEDS_BALANCE"));
  const p24 = L.acquisitionPeriods({ admissionDate: ADM, today: "2026-10-14", absences: { 1: 7 } })[1];
  const r = L.validateVacationPlan({ period: p24, holidays: HOL, today: "2026-10-14", segments: [{ start: "2026-11-16", days: 25 }] });
  assert.ok(codes(r).includes("EXCEEDS_BALANCE"));
  assert.equal(r.abonoMax, 8);
});

test("datas: passado, aviso curto, depois do concessivo, período não completo, vazio", () => {
  assert.ok(codes(plan({ segments: [{ start: "2026-10-05", days: 30 }] })).includes("START_IN_PAST"));
  const curto = plan({ segments: [{ start: "2026-10-26", days: 30 }] });
  assert.deepEqual(codes(curto), []);
  assert.deepEqual(wcodes(curto), ["NOTICE_SHORT"]);
  assert.ok(wcodes(plan({ segments: [{ start: "2027-03-01", days: 14 }] })).includes("AFTER_CONCESSIVE"));
  const p2 = L.acquisitionPeriods({ admissionDate: ADM, today: "2026-10-14" })[2];
  assert.ok(codes(L.validateVacationPlan({ period: p2, today: "2026-10-14", segments: [{ start: "2026-11-16", days: 30 }] })).includes("PERIOD_NOT_COMPLETE"));
  assert.ok(codes(plan({ segments: [] })).includes("EMPTY_PLAN"));
});

// ------------------------------------------------------------------ licenças

test("licenças: tipos, dias legais, Empresa Cidadã, limite anual, comprovante", () => {
  assert.equal(L.leaveType("luto").legalDays, 2);
  assert.equal(L.leaveType("nada"), null);
  assert.deepEqual(codes(L.validateLeave({ type: "nada", days: 1 })), ["INVALID_TYPE"]);
  assert.deepEqual(codes(L.validateLeave({ type: "ferias", start: "2026-11-16", days: 10 })), ["USE_VACATION_FLOW"]);
  assert.deepEqual(codes(L.validateLeave({ type: "luto", days: 0 })), ["INVALID_DAYS"]);
  const pat = L.validateLeave({ type: "paternidade", start: "2026-11-16", days: 20, hasDocument: true });
  assert.ok(pat.ok);
  assert.deepEqual(wcodes(pat), ["ABOVE_LEGAL_DAYS"]);
  assert.deepEqual(wcodes(L.validateLeave({ type: "paternidade", start: "2026-11-16", days: 20, hasDocument: true, companyCitizen: true })), []);
  assert.ok(wcodes(L.validateLeave({ type: "doacao_sangue", days: 1, hasDocument: true, usedThisYear: 1 })).includes("YEARLY_LIMIT"));
  assert.ok(wcodes(L.validateLeave({ type: "casamento", days: 3 })).includes("DOCUMENT_PENDING"));
  assert.ok(wcodes(L.validateLeave({ type: "atestado", days: 20, hasDocument: true })).includes("INSS_AFTER_15"));
  assert.equal(L.validateLeave({ type: "casamento", start: "2026-11-16", days: 3, hasDocument: true }).end, "2026-11-18");
  assert.equal(L.leaveType("atestado").sensitive, true);
  assert.equal(L.leaveType("falta").countsAsAbsence, true);
});

// ------------------------------------------------------------------ organograma

test("organograma: cadeia, ciclo e subordinados", () => {
  const map = { ana: null, bia: "ana", caio: "bia", duda: "bia", edu: "caio" };
  assert.deepEqual(L.managerChain("edu", map), ["caio", "bia", "ana"]);
  assert.equal(L.wouldCreateCycle("ana", "edu", map), true);
  assert.equal(L.wouldCreateCycle("ana", "ana", map), true);
  assert.equal(L.wouldCreateCycle("duda", "caio", map), false);
  assert.equal(L.wouldCreateCycle("duda", null, map), false);
  assert.deepEqual(L.allReports("bia", map).sort(), ["caio", "duda", "edu"]);
  assert.deepEqual(L.managerChain("x", { x: "y", y: "x" }), ["y"]); // ciclo já gravado não trava
});

// ------------------------------------------------------------------ aprovações

const PEOPLE = {
  employees: { e1: { userId: "u1", managerId: "e2" }, e2: { userId: "u2", managerId: "e3" }, e3: { userId: "u3", managerId: null } },
  roles: { RH: ["uRH"], Financeiro: ["uF"] },
  today: "2026-10-14",
};
const FLOW = { steps: [{ type: "manager" }, { type: "role", role: "Financeiro", when: { field: "amount", op: ">", value: 1000 } }] };

test("aprovação: gestor direto e etapa condicional por valor", () => {
  const a = L.resolveApprovers(FLOW, { requesterEmployeeId: "e1", requesterUserId: "u1", data: { amount: 500 } }, PEOPLE);
  assert.deepEqual(a.steps.map((s) => s.approvers), [["u2"]]);
  assert.equal(a.status, "PENDING");
  const b = L.resolveApprovers(FLOW, { requesterEmployeeId: "e1", requesterUserId: "u1", data: { amount: 2000 } }, PEOPLE);
  assert.deepEqual(b.steps.map((s) => s.approvers), [["u2"], ["uF"]]);
  const c = L.resolveApprovers({ steps: [{ type: "manager_of_manager" }] }, { requesterEmployeeId: "e1", requesterUserId: "u1" }, PEOPLE);
  assert.deepEqual(c.steps[0].approvers, ["u3"]);
});

test("aprovação: sem gestor cai no RH, quem pede não aprova, delegação, etapas repetidas", () => {
  const top = L.resolveApprovers(FLOW, { requesterEmployeeId: "e3", requesterUserId: "u3", data: {} }, PEOPLE);
  assert.deepEqual(top.steps[0].approvers, ["uRH"]);
  assert.equal(top.steps[0].fallback, true);
  const rhSelf = L.resolveApprovers({ steps: [{ type: "role", role: "RH" }] }, { requesterEmployeeId: "e3", requesterUserId: "u3" }, { ...PEOPLE, roles: { RH: ["u3", "uRH"] } });
  assert.deepEqual(rhSelf.steps[0].approvers, ["uRH"]);
  const del = { ...PEOPLE, delegations: [{ fromUserId: "u2", toUserId: "u9", start: "2026-10-01", end: "2026-10-20" }] };
  assert.deepEqual(L.resolveApprovers(FLOW, { requesterEmployeeId: "e1", requesterUserId: "u1", data: {} }, del).steps[0].approvers, ["u9"]);
  assert.deepEqual(L.resolveApprovers(FLOW, { requesterEmployeeId: "e1", requesterUserId: "u1", data: {} }, { ...del, today: "2026-10-21" }).steps[0].approvers, ["u2"]);
  const dup = L.resolveApprovers({ steps: [{ type: "manager" }, { type: "user", userId: "u2" }] }, { requesterEmployeeId: "e1", requesterUserId: "u1" }, PEOPLE);
  assert.equal(dup.steps.length, 1);
  const none = L.resolveApprovers({ steps: [] }, { requesterEmployeeId: "e1", requesterUserId: "u1" }, PEOPLE);
  assert.deepEqual([none.status, none.current], ["APPROVED", null]);
});

test("decisões: erros, recusa com comentário, modo todos, avanço de etapa", () => {
  let st = L.resolveApprovers(FLOW, { requesterEmployeeId: "e1", requesterUserId: "u1", data: { amount: 2000 } }, PEOPLE);
  assert.equal(L.applyDecision(st, { userId: "u1", decision: "approve" }).error.code, "NOT_APPROVER");
  assert.equal(L.applyDecision(st, { userId: "u2", decision: "talvez" }).error.code, "INVALID_DECISION");
  assert.equal(L.applyDecision(st, { userId: "u2", decision: "reject", comment: "  " }).error.code, "COMMENT_REQUIRED");
  st = L.applyDecision(st, { userId: "u2", decision: "approve" }).state;
  assert.deepEqual([st.status, st.current], ["PENDING", 1]);
  assert.deepEqual(L.pendingApprovers(st), ["uF"]);
  const rej = L.applyDecision(st, { userId: "uF", decision: "reject", comment: "Sem orçamento" }).state;
  assert.deepEqual([rej.status, rej.current], ["REJECTED", null]);
  assert.equal(L.applyDecision(rej, { userId: "uF", decision: "approve" }).error.code, "NOT_PENDING");
  assert.deepEqual(L.pendingApprovers(rej), []);

  let all = L.resolveApprovers({ steps: [{ type: "role", role: "Diretoria", mode: "all" }] }, { requesterEmployeeId: "e1", requesterUserId: "u1" }, { ...PEOPLE, roles: { ...PEOPLE.roles, Diretoria: ["uA", "uB"] } });
  all = L.applyDecision(all, { userId: "uA", decision: "approve" }).state;
  assert.equal(all.status, "PENDING");
  assert.equal(L.applyDecision(all, { userId: "uA", decision: "approve" }).error.code, "ALREADY_DECIDED");
  assert.deepEqual(L.pendingApprovers(all), ["uB"]);
  all = L.applyDecision(all, { userId: "uB", decision: "approve" }).state;
  assert.equal(all.status, "APPROVED");
});

// ------------------------------------------------------------------ despesas

test("despesas: limite, recibo, km, datas e totais em centavos", () => {
  const cat = { id: "refeicao", limit: 100, receiptAbove: 50 };
  const T = { today: "2026-10-14" };
  assert.deepEqual(codes(L.validateExpense(cat, { amount: 120, date: "2026-10-10" }, T)).sort(), ["OVER_LIMIT_JUSTIFY", "RECEIPT_REQUIRED"]);
  const ok = L.validateExpense(cat, { amount: 120, date: "2026-10-10", hasReceipt: true, justification: "Jantar com cliente" }, T);
  assert.ok(ok.ok);
  assert.deepEqual(wcodes(ok), ["OVER_LIMIT"]);
  assert.ok(L.validateExpense(cat, { amount: 30, date: "2026-10-10" }, T).ok);
  assert.deepEqual(codes(L.validateExpense(cat, { amount: 0, date: "2026-10-10" }, T)), ["INVALID_AMOUNT"]);
  assert.deepEqual(codes(L.validateExpense(cat, { amount: 10 }, T)), ["DATE_REQUIRED"]);
  assert.deepEqual(codes(L.validateExpense(cat, { amount: 10, date: "2026-10-15" }, T)), ["FUTURE_DATE"]);
  assert.deepEqual(codes(L.validateExpense(cat, { amount: 10, date: "2026-07-01" }, T)), ["TOO_OLD"]);
  const km = L.validateExpense({ id: "km", perKm: 1.2 }, { km: 35, date: "2026-10-10" }, T);
  assert.equal(km.amount, 42);
  assert.deepEqual(codes(L.validateExpense({ id: "km", perKm: 1.2 }, { date: "2026-10-10" }, T)), ["KM_REQUIRED"]);
  assert.deepEqual(L.reportTotals([{ categoryId: "a", amount: 0.1 }, { categoryId: "a", amount: 0.2 }, { categoryId: "b", amount: 10 }]), { total: 10.3, byCategory: { a: 0.3, b: 10 } });
});

// ------------------------------------------------------------------ CPF, holerites, documentos

test("CPF: validação, formato, máscara, extração", () => {
  assert.ok(L.isValidCpf("529.982.247-25"));
  assert.ok(L.isValidCpf("12345678909"));
  assert.ok(!L.isValidCpf("111.111.111-11"));
  assert.ok(!L.isValidCpf("529.982.247-24"));
  assert.ok(!L.isValidCpf("123"));
  assert.equal(L.formatCpf("52998224725"), "529.982.247-25");
  assert.equal(L.maskCpf("52998224725"), "529.***.***-25");
  assert.equal(L.maskCpf(""), "");
  assert.deepEqual(L.extractCpfs("CPF 529.982.247-25 e 52998224725 e 111.111.111-11 e 123.456.789-09"), ["52998224725", "12345678909"]);
});

test("holerites em lote casados pelo CPF", () => {
  const emps = [{ id: "e1", cpf: "529.982.247-25" }, { id: "e2", cpf: "123.456.789-09" }];
  const r = L.matchPayslips([
    { name: "holerite_52998224725_2026-09.pdf", text: "" },
    { name: "set.pdf", text: "Funcionário: Bia CPF: 123.456.789-09" },
    { name: "junto.pdf", text: "529.982.247-25 / 123.456.789-09" },
    { name: "outro.pdf", text: "CPF 111.444.777-35" }, // válido, mas não é colaborador
    { name: "vazio.pdf", text: "" },
  ], emps);
  assert.deepEqual(r.matched, [{ file: "holerite_52998224725_2026-09.pdf", employeeId: "e1" }, { file: "set.pdf", employeeId: "e2" }]);
  assert.deepEqual(r.ambiguous, [{ file: "junto.pdf", employeeIds: ["e1", "e2"] }]);
  assert.deepEqual(r.unmatched.map((u) => u.file), ["outro.pdf", "vazio.pdf"]);
});

test("validade de documentos", () => {
  assert.equal(L.expiryState(null, "2026-10-14"), "sem_validade");
  assert.equal(L.expiryState("2026-10-13", "2026-10-14"), "vencido");
  assert.equal(L.expiryState("2026-10-14", "2026-10-14"), "vencendo");
  assert.equal(L.expiryState("2026-11-13", "2026-10-14"), "vencendo");
  assert.equal(L.expiryState("2026-11-14", "2026-10-14"), "valido");
});

// ------------------------------------------------------------------ checklists e metas

test("checklist de admissão: datas a partir da admissão, fim de semana volta para sexta, progresso", () => {
  const tpl = { items: [
    { key: "notebook", title: "Preparar notebook", offsetDays: -3, assignee: "ti" },
    { key: "docs", title: "Enviar documentos", offsetDays: -7, assignee: "colaborador" },
    { key: "boas", title: "Boas-vindas", offsetDays: 0, assignee: "gestor" },
    { key: "1on1", title: "1:1 de 30 dias", offsetDays: 30, assignee: "gestor", required: false },
  ] };
  const items = L.checklistItems(tpl, "2026-11-16"); // segunda
  assert.deepEqual(items.map((i) => i.dueDate), ["2026-11-13", "2026-11-09", "2026-11-16", "2026-12-16"]);
  // −3 de segunda = sexta (13); −7 = segunda anterior (9)
  items[0].doneAt = "2026-11-12";
  assert.deepEqual(L.checklistProgress(items, "2026-11-14"), { done: 1, total: 4, pct: 25, overdue: 1, requiredPending: 2 });
  assert.equal(L.checklistItems({ items: [{ title: "x", offsetDays: 5 }] }, "2026-11-16")[0].dueDate, "2026-11-20"); // sábado 21 não; 16+5=21 sáb → sexta 20
  assert.equal(L.checklistProgress([], "2026-11-14").pct, 100);
});

test("metas: progresso do KR (inclusive de reduzir), do objetivo e situação no ciclo", () => {
  assert.equal(L.krProgress({ kind: "number", start: 0, target: 200, current: 50 }), 25);
  assert.equal(L.krProgress({ kind: "number", start: 10, target: 2, current: 6 }), 50); // reduzir de 10 para 2
  assert.equal(L.krProgress({ kind: "number", start: 0, target: 10, current: 15 }), 100);
  assert.equal(L.krProgress({ kind: "number", start: 0, target: 10, current: -3 }), 0);
  assert.equal(L.krProgress({ kind: "boolean", current: true }), 100);
  assert.equal(L.objectiveProgress([{ kind: "number", start: 0, target: 100, current: 100, weight: 3 }, { kind: "boolean", current: false }]), 75);
  assert.equal(L.objectiveProgress([]), 0);
  const S = "2026-10-01", E = "2026-12-31"; // 91 dias
  assert.equal(L.goalStatus(10, S, E, "2026-09-30"), "nao_iniciado");
  assert.equal(L.goalStatus(50, S, E, "2026-11-15"), "no_ritmo"); // esperado ≈ 49
  assert.equal(L.goalStatus(30, S, E, "2026-11-15"), "atencao");
  assert.equal(L.goalStatus(10, S, E, "2026-11-15"), "atrasado");
  assert.equal(L.goalStatus(100, S, E, "2026-11-15"), "concluido");
  assert.equal(L.goalStatus(80, S, E, "2027-01-02"), "nao_atingido");
});

// ------------------------------------------------------------------ desempenho e clima

test("nota ponderada da avaliação", () => {
  assert.equal(L.reviewScore([{ score: 5, weight: 2 }, { score: 2, weight: 1 }]), 4);
  assert.equal(L.reviewScore([{ score: 4 }, { score: null }, { score: 3 }]), 3.5);
  assert.equal(L.reviewScore([]), null);
});

test("eNPS", () => {
  assert.deepEqual(L.enps([10, 9, 8, 7, 6, 0]), { n: 6, promoters: 2, passives: 2, detractors: 2, score: 0 });
  assert.equal(L.enps([10, 10, 9, 3]).score, 50);
  assert.equal(L.enps([]).score, null);
});

const resp = (g, n, e = 9, a = 4) => Array.from({ length: n }, () => ({ groupId: g, enps: e, answers: { q1: a } }));
test("clima: anonimato mínimo, sem descoberta por subtração", () => {
  // A(6) B(5) C(2): C escondido; sozinho daria para descobrir → B (menor mostrado) junta em "outros" (7)
  const r = L.groupResults([...resp("A", 6), ...resp("B", 5, 6, 2), ...resp("C", 2, 0, 1)]);
  assert.deepEqual(r.groups.map((g) => g.groupId), ["A", "outros"]);
  assert.equal(r.groups[1].n, 7);
  assert.equal(r.hiddenGroups, 2);
  assert.equal(r.overall.n, 13);
  assert.equal(r.groups[0].questions.q1, 4);
  // A(6) C(2) D(2): escondidos somam 4 < 5 → A também vai para "outros"
  const r2 = L.groupResults([...resp("A", 6), ...resp("C", 2), ...resp("D", 2)]);
  assert.deepEqual(r2.groups.map((g) => [g.groupId, g.n]), [["outros", 10]]);
  // menos que o mínimo no total: nada
  const r3 = L.groupResults(resp("A", 4));
  assert.equal(r3.overall, null);
  assert.deepEqual(r3.groups, []);
  // todos acima do mínimo: tudo aparece, sem "outros"
  const r4 = L.groupResults([...resp("B", 5), ...resp("A", 7)]);
  assert.deepEqual(r4.groups.map((g) => g.groupId), ["A", "B"]);
  assert.equal(r4.hiddenGroups, 0);
  // mínimo configurável
  assert.deepEqual(L.groupResults(resp("A", 3), { min: 3 }).groups.map((g) => g.groupId), ["A"]);
  // nenhum resultado traz respostas individuais
  assert.ok(!JSON.stringify(r).includes("answers"));
});

// ------------------------------------------------------------------ fechamento do mês

test("eventos do mês e CSV para a contabilidade", () => {
  const ev = L.eventsForMonth([
    { employeeId: "e2", type: "ferias", start: "2026-10-20", end: "2026-11-08" },
    { employeeId: "e1", type: "atestado", start: "2026-11-03", end: "2026-11-04" },
    { employeeId: "e1", type: "admissao", start: "2026-11-16" },
    { employeeId: "e3", type: "luto", start: "2026-12-01", end: "2026-12-02" },
  ], "2026-11");
  assert.deepEqual(ev.map((e) => [e.employeeId, e.type, e.from, e.to, e.daysInMonth]), [
    ["e1", "atestado", "2026-11-03", "2026-11-04", 2],
    ["e1", "admissao", "2026-11-16", "2026-11-16", 1],
    ["e2", "ferias", "2026-11-01", "2026-11-08", 8],
  ]);
  const csv = L.toCsv([{ nome: "Ana; Souza", obs: 'disse "oi"', f: "=SOMA(A1)", n: -3 }], [
    { key: "nome", label: "Nome" }, { key: "obs", label: "Obs" }, { key: "f", label: "F" }, { label: "N", value: (r) => r.n },
  ]);
  assert.equal(csv, '﻿Nome;Obs;F;N\r\n"Ana; Souza";"disse ""oi""";\'=SOMA(A1);-3\r\n');
});

// ------------------------------------------------------------------ pessoas

test("tempo de casa e aniversários", () => {
  assert.equal(L.tenureText("2024-07-14", "2026-10-14"), "2 anos e 3 meses");
  assert.equal(L.tenureText("2026-02-14", "2026-10-14"), "8 meses");
  assert.equal(L.tenureText("2025-10-14", "2026-10-14"), "1 ano");
  assert.equal(L.tenureText("2026-10-13", "2026-10-14"), "1 dia");
  assert.equal(L.tenureText("2026-10-02", "2026-10-14"), "12 dias");
  const b = L.upcomingBirthdays([
    { id: "a", birthDate: "1990-10-20" },
    { id: "b", birthDate: "1985-10-14" },
    { id: "c", birthDate: "2000-01-05" },
    { id: "d", birthDate: "1992-02-29" },
    { id: "e" },
  ], "2026-12-20", 75);
  assert.deepEqual(b.map((x) => [x.id, x.date, x.inDays, x.age]), [["c", "2027-01-05", 16, 27], ["d", "2027-02-28", 70, 35]]);
  assert.deepEqual(L.upcomingBirthdays([{ id: "b", birthDate: "1985-10-14" }], "2026-10-14").map((x) => x.inDays), [0]);
});

// ------------------------------------------------------------------ extras

test("regime livre (estágio/PJ): sem regras de fracionamento da CLT, sem venda", () => {
  const livre = (o) => plan({ regime: "livre", ...o });
  const r = livre({ segments: [{ start: "2026-11-13", days: 2 }, { start: "2026-11-20", days: 3 }, { start: "2026-12-01", days: 3 }, { start: "2027-01-04", days: 3 }] });
  assert.deepEqual(codes(r), []); // sexta, feriado, 4 períodos, menos de 5 dias: tudo ok no livre
  assert.ok(codes(livre({ abonoDays: 5, segments: [{ start: "2026-11-16", days: 10 }] })).includes("ABONO_NOT_ALLOWED"));
  assert.ok(codes(livre({ segments: [{ start: "2026-11-16", days: 0 }] })).includes("INVALID_DAYS"));
  assert.ok(codes(livre({ segments: [{ start: "2026-11-16", days: 31 }] })).includes("EXCEEDS_BALANCE"));
  assert.deepEqual(wcodes(livre({ segments: [{ start: "2027-03-01", days: 14 }] })), []);
});

test("férias coletivas: mínimo 10, máximo 2 no ano, aviso de 15 dias, impacto", () => {
  const base = { today: "2026-10-14", holidays: HOL };
  assert.deepEqual(codes(L.validateCollectiveVacation({ ...base, start: "2026-12-21", days: 10 })), []);
  assert.ok(codes(L.validateCollectiveVacation({ ...base, start: "2026-12-21", days: 9 })).includes("COLLECTIVE_MIN_10"));
  assert.ok(codes(L.validateCollectiveVacation({ ...base, start: "2026-12-21", days: 10, periodsThisYear: [{ start: "2026-01-05", days: 10 }, { start: "2026-07-06", days: 10 }] })).includes("COLLECTIVE_MAX_2"));
  assert.ok(!codes(L.validateCollectiveVacation({ ...base, start: "2026-12-21", days: 10, periodsThisYear: [{ start: "2025-12-22", days: 10 }, { start: "2026-07-06", days: 10 }] })).includes("COLLECTIVE_MAX_2"));
  assert.deepEqual(wcodes(L.validateCollectiveVacation({ ...base, start: "2026-10-26", days: 10 })), ["COLLECTIVE_NOTICE_15"]);
  assert.ok(codes(L.validateCollectiveVacation({ ...base, start: "2026-12-24", days: 10 })).includes("START_BEFORE_REST")); // 25/12
  assert.deepEqual(L.collectiveImpact([{ id: "a", available: 30 }, { id: "b", available: 7.5 }], 10), { full: [{ id: "a" }], partial: [{ id: "b", available: 7, paidLeave: 3 }] });
});

test("quem está fora no mesmo período", () => {
  const items = [{ employeeId: "a", start: "2026-11-10", end: "2026-11-20" }, { employeeId: "b", start: "2026-11-21", end: "2026-11-30" }, { employeeId: "a", start: "2026-12-01", end: "2026-12-02" }, { employeeId: "c", start: "2026-11-18" }];
  assert.deepEqual(L.overlapping(items, "2026-11-18", "2026-11-22").sort(), ["a", "b", "c"]);
  assert.deepEqual(L.overlapping(items, "2026-11-18", "2026-11-22", "a").sort(), ["b", "c"]);
  assert.deepEqual(L.overlapping(items, "2026-12-03", "2026-12-04"), []);
});

test("PDF único de holerites separado por página pelo CPF", () => {
  const emps = [{ id: "e1", cpf: "529.982.247-25" }, { id: "e2", cpf: "123.456.789-09" }];
  const r = L.groupPagesByCpf([
    "capa do lote",                         // 0: sem pessoa antes → sem dono
    "Ana CPF 529.982.247-25 página 1",      // 1: e1
    "continuação (sem CPF)",                // 2: e1 (continua)
    "Bia 123.456.789-09",                   // 3: e2
    "529.982.247-25 e 123.456.789-09",      // 4: ambígua
    "sem CPF depois da ambígua",            // 5: sem dono
    "Ana de novo 52998224725",              // 6: e1 (junta)
  ], emps);
  assert.deepEqual(r.groups, [{ employeeId: "e1", pages: [1, 2, 6] }, { employeeId: "e2", pages: [3] }]);
  assert.deepEqual(r.unmatchedPages, [0, 5]);
  assert.deepEqual(r.ambiguousPages, [4]);
});

test("9-box e fases do ciclo", () => {
  assert.deepEqual(L.nineBox(4.2, 3), { box: 9, perf: 3, potential: 3, label: "Estrela" });
  assert.equal(L.nineBox(2.4, 1).label, "Insuficiente");
  assert.equal(L.nineBox(3.0, 2).label, "Mantenedor");
  assert.equal(L.nineBox(2.0, 3).label, "Enigma");
  assert.equal(L.nineBox(3.75, 1).label, "Especialista");
  assert.equal(L.nineBox(3, 4), null);
  const phases = [{ key: "autoavaliacao", start: "2026-11-01", end: "2026-11-10" }, { key: "gestor", start: "2026-11-11", end: "2026-11-20" }, { key: "calibracao", start: "2026-11-23", end: "2026-11-27" }];
  assert.equal(L.currentPhase(phases, "2026-10-31"), "antes");
  assert.equal(L.currentPhase(phases, "2026-11-10"), "autoavaliacao");
  assert.equal(L.currentPhase(phases, "2026-11-15"), "gestor");
  assert.equal(L.currentPhase(phases, "2026-11-21"), "entre_fases");
  assert.equal(L.currentPhase(phases, "2026-11-28"), "encerrado");
  assert.equal(L.currentPhase([], "2026-11-28"), "antes");
});

test("indicadores: rotatividade e absenteísmo", () => {
  assert.deepEqual(L.turnover({ admissions: 4, terminations: 2, headcountStart: 48, headcountEnd: 52 }), { rate: 6, terminationRate: 4, averageHeadcount: 50 });
  assert.equal(L.turnover({ headcountStart: 0, headcountEnd: 0 }).rate, null);
  assert.equal(L.absenteeism({ absentDays: 11, employees: 25, workdays: 22 }), 2);
  assert.equal(L.absenteeism({ absentDays: 3, employees: 0, workdays: 22 }), null);
});

test("quem vê o quê na ficha (LGPD)", () => {
  const S = { managersSeeCompensation: false, managersSeeDocuments: false };
  assert.deepEqual(L.visibleGroups({ viewer: { employeeId: "x", rhRole: null }, targetId: "y", settings: S }), ["public"]);
  const self = L.visibleGroups({ viewer: { employeeId: "y", rhRole: null }, targetId: "y", settings: S });
  assert.ok(self.includes("compensation") && self.includes("health") && self.includes("bank"));
  assert.ok(!self.includes("rh_notes"));
  const mgr = L.visibleGroups({ viewer: { employeeId: "m", rhRole: null }, targetId: "y", isManager: true, settings: S });
  assert.deepEqual(mgr, ["public", "job", "absences", "performance"]);
  assert.ok(L.visibleGroups({ viewer: { employeeId: "m" }, targetId: "y", isManager: true, settings: { managersSeeCompensation: true } }).includes("compensation"));
  assert.deepEqual(L.visibleGroups({ viewer: { employeeId: "f", rhRole: "FINANCE" }, targetId: "y" }), ["public", "bank"]);
  assert.deepEqual(L.visibleGroups({ viewer: { rhRole: "RH" }, targetId: "y" }), L.FIELD_GROUPS);
});
