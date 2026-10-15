// node --test financeiro-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "./financeiro-lib.mjs";

const codes = (r) => r.errors.map((e) => e.code);
const wcodes = (r) => r.warnings.map((e) => e.code);
const T = "2026-10-14";

test("datas: validação, soma de dias e de meses com dia âncora", () => {
  assert.ok(F.isDate("2026-02-28"));
  assert.ok(!F.isDate("2026-02-30"));
  assert.ok(!F.isDate("14/10/2026"));
  assert.equal(F.addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(F.diffDays("2026-10-01", "2026-10-31"), 30);
  assert.equal(F.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(F.addMonths("2026-02-28", 1, 31), "2026-03-31", "âncora 31 volta ao fim do mês");
  assert.equal(F.addMonths("2024-01-31", 1), "2024-02-29", "bissexto");
});

test("parcelas: centavo certo na 1ª e vencimentos com dia âncora", () => {
  const p = F.splitInstallments(10000, 3, "2026-01-31");
  assert.deepEqual(p.map((x) => x.amountCents), [3334, 3333, 3333]);
  assert.deepEqual(p.map((x) => x.dueDate), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  assert.equal(p.reduce((a, x) => a + x.amountCents, 0), 10000);
  assert.deepEqual(p.map((x) => `${x.number}/${x.total}`), ["1/3", "2/3", "3/3"]);
  assert.deepEqual(F.splitInstallments(1000, 2, "2026-10-14", { interval: "week" }).map((x) => x.dueDate), ["2026-10-14", "2026-10-21"]);
  assert.deepEqual(F.splitInstallments(1, 1, T).map((x) => x.amountCents), [1]);
  assert.throws(() => F.splitInstallments(0, 2, T));
  assert.throws(() => F.splitInstallments(100, 0, T));
  assert.throws(() => F.splitInstallments(100, 2, T, { interval: "dia" }));
});

test("recorrência: mensal no dia 31, contagem, até, a cada 2, anual em 29/02", () => {
  const r = { start: "2026-01-31", interval: "month" };
  const win = { from: "2026-01-01", to: "2026-05-31" };
  assert.deepEqual(F.recurrenceDates(r, win), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  assert.equal(F.recurrenceDates({ ...r, count: 3 }, win).length, 3);
  assert.deepEqual(F.recurrenceDates({ ...r, until: "2026-03-15" }, win), ["2026-01-31", "2026-02-28"]);
  assert.deepEqual(F.recurrenceDates({ ...r, every: 2 }, win), ["2026-01-31", "2026-03-31", "2026-05-31"]);
  assert.deepEqual(F.recurrenceDates(r, { from: "2026-03-01", to: "2026-04-30" }), ["2026-03-31", "2026-04-30"]);
  assert.deepEqual(F.recurrenceDates({ start: "2024-02-29", interval: "year" }, { from: "2024-01-01", to: "2028-12-31" }), ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
});

test("situação do lançamento", () => {
  const e = { amountCents: 10000, paidCents: 0, dueDate: "2026-10-10" };
  assert.deepEqual(F.entryStatus(e, T), { status: "OVERDUE", overdue: true, daysLate: 4, remainingCents: 10000 });
  const part = F.entryStatus({ ...e, paidCents: 4000 }, T);
  assert.deepEqual([part.status, part.overdue, part.remainingCents], ["PARTIAL", true, 6000]);
  assert.equal(F.entryStatus({ ...e, paidCents: 10000 }, T).status, "PAID");
  assert.equal(F.entryStatus({ ...e, canceled: true }, T).status, "CANCELED");
  assert.equal(F.entryStatus({ ...e, dueDate: "2026-10-20" }, T).status, "OPEN");
  assert.equal(F.entryStatus({ ...e, dueDate: T }, T).status, "OPEN", "vence hoje ainda não está vencido");
  assert.equal(F.entryStatus({ ...e, awaitingApproval: true }, T).status, "AWAITING_APPROVAL");
});

test("multa e juros de atraso (2% + 1% ao mês pro rata)", () => {
  assert.deepEqual(F.lateCharges({ amountCents: 100000, dueDate: "2026-10-01", payDate: "2026-10-31" }), { daysLate: 30, fineCents: 2000, interestCents: 1000, totalCents: 103000 });
  assert.equal(F.lateCharges({ amountCents: 100000, dueDate: "2026-10-01", payDate: "2026-10-16" }).interestCents, 500);
  assert.deepEqual(F.lateCharges({ amountCents: 100000, dueDate: "2026-10-01", payDate: "2026-09-30" }), { daysLate: 0, fineCents: 0, interestCents: 0, totalCents: 100000 });
  assert.equal(F.lateCharges({ amountCents: 100000, dueDate: "2026-10-01", payDate: "2026-10-02", finePct: 0, monthlyInterestPct: 3 }).interestCents, 100);
});

test("baixa: parcial, total com desconto, juros no caixa, erros", () => {
  const e = { amountCents: 10000, paidCents: 0, dueDate: "2026-10-20" };
  const r1 = F.applyPayment(e, { amountCents: 4000, date: T }, { today: T });
  assert.deepEqual([r1.ok, r1.newPaidCents, r1.status, r1.cashCents], [true, 4000, "PARTIAL", 4000]);
  const r2 = F.applyPayment({ ...e, paidCents: 4000 }, { amountCents: 5500, discountCents: 500, date: T }, { today: T });
  assert.deepEqual([r2.ok, r2.newPaidCents, r2.status, r2.cashCents, r2.principalCents], [true, 10000, "PAID", 5500, 6000]);
  const r3 = F.applyPayment(e, { amountCents: 10000, interestCents: 300, fineCents: 200, date: T }, { today: T });
  assert.deepEqual([r3.status, r3.cashCents], ["PAID", 10500]);
  assert.deepEqual(codes(F.applyPayment(e, { amountCents: 10001, date: T }, { today: T })), ["OVERPAYMENT"]);
  assert.deepEqual(codes(F.applyPayment({ ...e, paidCents: 4000 }, { amountCents: 6000, discountCents: 1, date: T }, { today: T })), ["OVERPAYMENT"]);
  assert.deepEqual(codes(F.applyPayment(e, { amountCents: 100, date: "2026-10-15" }, { today: T })), ["FUTURE_DATE"]);
  assert.deepEqual(codes(F.applyPayment(e, { amountCents: 100 }, { today: T })), ["DATE_REQUIRED"]);
  assert.deepEqual(codes(F.applyPayment(e, { amountCents: 0, date: T }, { today: T })), ["INVALID_AMOUNT"]);
  assert.ok(codes(F.applyPayment(e, { amountCents: -5, date: T }, { today: T })).includes("INVALID_AMOUNT"));
  assert.ok(codes(F.applyPayment(e, { amountCents: 10.5, date: T }, { today: T })).includes("INVALID_AMOUNT"), "centavos inteiros");
  assert.ok(codes(F.applyPayment({ ...e, canceled: true }, { amountCents: 100, date: T }, { today: T })).includes("ENTRY_CANCELED"));
  assert.ok(codes(F.applyPayment({ ...e, awaitingApproval: true }, { amountCents: 100, date: T }, { today: T })).includes("AWAITING_APPROVAL"));
  assert.equal(F.applyPayment(e, { amountCents: 10001, date: T }, { today: T }).newPaidCents, 0, "erro não muda o pago");
});

test("saldo de conta até a data", () => {
  const mv = [{ date: "2026-10-01", amountCents: 5000 }, { date: "2026-10-20", amountCents: -2000 }];
  assert.equal(F.accountBalance(100000, mv, T), 105000);
  assert.equal(F.accountBalance(100000, mv, "2026-10-31"), 103000);
  assert.equal(F.accountBalance(0, [], T), 0);
});

test("fluxo de caixa: realizado, previsto, vencido no período de hoje, transferências fora", () => {
  const args = {
    openingBalanceCents: 100000,
    movements: [{ date: "2026-09-20", amountCents: 10000 }, { date: "2026-10-05", amountCents: 50000 }, { date: "2026-10-10", amountCents: -20000 }, { date: "2026-10-11", amountCents: -5000, transfer: true }],
    open: [{ dueDate: "2026-10-01", remainingCents: 30000 }, { dueDate: "2026-11-10", remainingCents: -15000 }],
    from: "2026-10-01", to: "2026-11-30", today: T,
  };
  const r = F.cashFlow(args);
  assert.equal(r.openingCents, 110000, "saldo inicial + o que entrou antes do período");
  assert.deepEqual(r.periods.map((p) => p.key), ["2026-10", "2026-11"]);
  assert.deepEqual([r.periods[0].inCents, r.periods[0].outCents, r.periods[0].forecastInCents, r.periods[0].balanceCents], [50000, 20000, 30000, 170000]);
  assert.deepEqual([r.periods[1].forecastOutCents, r.periods[1].netCents, r.periods[1].balanceCents], [15000, -15000, 155000]);
  assert.equal(r.closingCents, 155000);
  const d = F.cashFlow({ ...args, from: "2026-10-13", to: "2026-10-15", groupBy: "day" });
  assert.deepEqual(d.periods.map((p) => p.key), ["2026-10-13", "2026-10-14", "2026-10-15"]);
  assert.equal(d.periods[1].forecastInCents, 30000, "vencido aparece hoje");
});

test("plano de contas padrão: chaves únicas, pais existentes, grupos válidos", () => {
  const c = F.defaultCategories();
  const keys = new Set(c.map((x) => x.key));
  assert.equal(keys.size, c.length);
  for (const x of c) {
    if (x.parent) assert.ok(keys.has(x.parent), x.key);
    const g = F.dreGroup(x.dreGroup);
    assert.ok(g, x.key);
    if (g.type) assert.equal(g.type, x.type, `${x.key}: tipo bate com o grupo`);
  }
  assert.ok(c.some((x) => x.key === "tarifas" && x.dreGroup === "DESPESAS_FINANCEIRAS"));
});

test("DRE por competência e por caixa", () => {
  const categories = [["r", "RECEITA_BRUTA"], ["imp", "DEDUCOES"], ["cus", "CUSTOS"], ["desp", "DESPESAS_OPERACIONAIS"], ["fin", "DESPESAS_FINANCEIRAS"], ["ap", "NAO_OPERACIONAL"]].map(([id, dreGroup]) => ({ id, dreGroup }));
  const e = (categoryId, amountCents, competenceDate = "2026-10-05", extra = {}) => ({ categoryId, amountCents, competenceDate, ...extra });
  const r = F.dre({ categories, from: "2026-10-01", to: "2026-10-31", entries: [e("r", 100000), e("imp", 10000), e("cus", 30000), e("desp", 20000), e("fin", 1000), e("ap", 50000), e("r", 99999, "2026-10-06", { canceled: true }), e("r", 7777, "2026-11-01")] });
  assert.deepEqual([r.groups.RECEITA_BRUTA, r.receitaLiquida, r.lucroBruto, r.resultadoOperacional, r.resultadoFinanceiro, r.resultadoAntesIR, r.lucroLiquido], [100000, 90000, 60000, 40000, -1000, 39000, 39000]);
  assert.deepEqual([r.margemBruta, r.margemLiquida], [66.7, 43.3]);
  assert.equal(r.groups.NAO_OPERACIONAL, 50000, "aporte separado, fora do resultado");
  const c = F.dre({ categories, from: "2026-10-01", to: "2026-10-31", basis: "cash", payments: [{ categoryId: "r", cashCents: 40000, date: "2026-10-10" }, { categoryId: "desp", cashCents: 5000, date: "2026-10-11" }, { categoryId: "r", cashCents: 1, date: "2026-09-30" }] });
  assert.deepEqual([c.receitaLiquida, c.lucroLiquido], [40000, 35000]);
  assert.equal(F.dre({ categories, from: "2026-10-01", to: "2026-10-31" }).margemLiquida, null, "sem receita, sem margem");
});

test("inadimplência por faixa", () => {
  const a = F.aging([{ dueDate: "2026-10-20", remainingCents: 100 }, { dueDate: "2026-10-01", remainingCents: 200 }, { dueDate: "2026-08-20", remainingCents: 300 }, { dueDate: "2026-07-01", remainingCents: 400 }, { dueDate: "2026-07-01", remainingCents: 0 }], T);
  const edge = F.aging([{ dueDate: F.addDays(T, -30), remainingCents: 1 }, { dueDate: F.addDays(T, -31), remainingCents: 2 }, { dueDate: F.addDays(T, -90), remainingCents: 3 }, { dueDate: F.addDays(T, -91), remainingCents: 4 }], T);
  assert.deepEqual([edge.d1_30.cents, edge.d31_60.cents, edge.d61_90.cents, edge.d90_mais.cents], [1, 2, 3, 4], "limites das faixas");
  assert.deepEqual(a, { a_vencer: { cents: 100, count: 1 }, d1_30: { cents: 200, count: 1 }, d31_60: { cents: 300, count: 1 }, d61_90: { cents: 0, count: 0 }, d90_mais: { cents: 400, count: 1 } });
});

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261014120000[-3:BRT]<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>0341<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261014
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005100000[-3:BRT]<TRNAMT>1500.00<FITID>A1<MEMO>PIX RECEBIDO JOAO SILVA
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-35,90<FITID>A2<MEMO>TARIFA PACOTE SERVICOS
</BANKTRANLIST><LEDGERBAL><BALAMT>10464.10<DTASOF>20261014</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const OFX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
  <CURDEF>BRL</CURDEF>
  <BANKACCTFROM><BANKID>260</BANKID><ACCTID>998877</ACCTID></BANKACCTFROM>
  <BANKTRANLIST>
    <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261007</DTPOSTED><TRNAMT>-1200.00</TRNAMT><FITID>X-9</FITID><NAME>Aluguel</NAME><MEMO>Boleto pago</MEMO></STMTTRN>
    <STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261008</DTPOSTED><TRNAMT>250.5</TRNAMT><FITID>X-10</FITID><MEMO>Transferência recebida</MEMO></STMTTRN>
  </BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("OFX 1.x (SGML) e 2.x (XML)", () => {
  const a = F.parseOfx(OFX_SGML);
  assert.deepEqual([a.bankId, a.accountId, a.currency], ["0341", "12345-6", "BRL"]);
  assert.deepEqual(a.transactions.map((t) => [t.fitId, t.date, t.amountCents, t.memo]), [["A1", "2026-10-05", 150000, "PIX RECEBIDO JOAO SILVA"], ["A2", "2026-10-06", -3590, "TARIFA PACOTE SERVICOS"]]);
  assert.deepEqual(a.balance, { amountCents: 1046410, date: "2026-10-14" });
  const b = F.parseOfx(OFX_XML);
  assert.deepEqual(b.transactions.map((t) => [t.fitId, t.amountCents, t.name]), [["X-9", -120000, "Aluguel"], ["X-10", 25050, ""]]);
  assert.equal(b.balance, null);
  assert.throws(() => F.parseOfx("data;valor"), /OFX/);
});

test("valores do extrato: ponto, vírgula e milhar", () => {
  assert.deepEqual(["1.500,00", "1,500.00", "-35,90", "250.5", "10", "abc", ""].map(F.toCents), [150000, 150000, -3590, 25050, 1000, NaN, NaN]);
});

test("CSV de extrato: separador, datas, crédito/débito, linhas ruins, id estável", () => {
  const csv = "﻿Data;Descrição;Valor\n05/10/2026;PIX RECEBIDO;1.500,00\n06/10/2026;\"TARIFA; PACOTE\";-35,90\nlixo;;\n";
  const r = F.parseCsvStatement(csv);
  assert.deepEqual(r.transactions.map((t) => [t.date, t.amountCents, t.memo]), [["2026-10-05", 150000, "PIX RECEBIDO"], ["2026-10-06", -3590, "TARIFA; PACOTE"]]);
  assert.deepEqual(r.errors.map((e) => e.line), [4]);
  assert.deepEqual(F.parseCsvStatement(csv).transactions.map((t) => t.fitId), r.transactions.map((t) => t.fitId), "id estável entre importações");
  const cd = F.parseCsvStatement("data,historico,credito,debito\n2026-10-05,Venda,100.00,\n2026-10-06,Compra,,50.00\n", { date: "data", description: "historico", credit: "credito", debit: "debito" });
  assert.deepEqual(cd.transactions.map((t) => t.amountCents), [10000, -5000]);
  assert.equal(F.stableHash("a"), F.stableHash("a"));
  assert.notEqual(F.stableHash("a"), F.stableHash("b"));
});

test("importar de novo não duplica (FITID)", () => {
  const r = F.dedupeTransactions(["A1"], [{ fitId: "A1" }, { fitId: "A2" }, { fitId: "A2" }]);
  assert.deepEqual([r.fresh.map((t) => t.fitId), r.duplicates.length], [["A2"], 2]);
});

test("sugestões de conciliação: valor exato, tipo pelo sinal, data e palavras", () => {
  const tx = { amountCents: 150000, date: "2026-10-05", memo: "PIX RECEBIDO JOAO SILVA", name: "" };
  const entries = [
    { id: "e2", type: "INCOME", remainingCents: 150000, dueDate: "2026-10-01", description: "Consultoria", contactName: "Maria" },
    { id: "e1", type: "INCOME", remainingCents: 150000, dueDate: "2026-10-05", description: "Mensalidade", contactName: "João Silva" },
    { id: "e3", type: "EXPENSE", remainingCents: 150000, dueDate: "2026-10-05", description: "Fornecedor" },
    { id: "e4", type: "INCOME", remainingCents: 149999, dueDate: "2026-10-05", description: "Quase" },
    { id: "e5", type: "INCOME", remainingCents: 150000, dueDate: "2026-11-30", description: "Longe" },
  ];
  const m = F.matchCandidates(tx, entries);
  assert.deepEqual(m.map((x) => [x.entryId, x.score]), [["e1", 100], ["e2", 50]]);
  assert.deepEqual(F.matchCandidates({ ...tx, amountCents: -150000 }, entries).map((x) => x.entryId), ["e3"]);
});

test("regras automáticas: prioridade, sinal, valor, regra vazia não casa tudo", () => {
  const rules = [
    { id: "r1", priority: 2, match: { contains: ["tarifa"], sign: "out" }, set: { categoryId: "tarifas" } },
    { id: "r2", priority: 1, match: { contains: ["pix recebido"], sign: "in" }, set: { categoryId: "servicos" } },
    { id: "r3", priority: 0, match: {}, set: { categoryId: "tudo" } },
    { id: "r4", priority: 3, match: { sign: "out", minCents: 100000 }, set: { categoryId: "grandes" } },
  ];
  assert.deepEqual(F.applyRules({ amountCents: -3590, memo: "TARIFA PACOTE" }, rules), { ruleId: "r1", categoryId: "tarifas" });
  assert.equal(F.applyRules({ amountCents: 150000, memo: "Pix Recebido João" }, rules).categoryId, "servicos");
  assert.equal(F.applyRules({ amountCents: 3590, memo: "estorno tarifa" }, rules), null);
  assert.equal(F.applyRules({ amountCents: -200000, memo: "TED" }, rules).categoryId, "grandes");
  assert.equal(F.applyRules({ amountCents: -100, memo: "x" }, []), null);
});

test("CPF e CNPJ", () => {
  assert.ok(F.isValidCpf("529.982.247-25"));
  assert.ok(!F.isValidCpf("111.111.111-11"));
  assert.ok(F.isValidCnpj("11.222.333/0001-81"));
  assert.ok(!F.isValidCnpj("11.222.333/0001-82"));
  assert.ok(F.isValidCnpj("10.000.000/0003-07"), "dígito verificador 0 (resto < 2)");
  assert.ok(!F.isValidCnpj("00000000000000"));
  assert.deepEqual(["52998224725", "11222333000181", "123", ""].map(F.documentType), ["CPF", "CNPJ", null, null]);
  assert.equal(F.formatDocument("11222333000181"), "11.222.333/0001-81");
  assert.equal(F.formatDocument("52998224725"), "529.982.247-25");
});

test("cobrança: meios da Stripe no Brasil", () => {
  const due = F.addDays(T, 10), customer = { name: "Ana", document: "529.982.247-25", email: "ana@x.com" };
  const ok = F.validateCharge({ methods: ["boleto", "pix", "card", "pix"], amountCents: 15000, dueDate: due, today: T, customer });
  assert.deepEqual([ok.ok, ok.methods, ok.boletoExpiresAfterDays, wcodes(ok)], [true, ["boleto", "pix", "card"], 10, []]);
  const c = (o) => codes(F.validateCharge({ methods: ["boleto"], amountCents: 15000, dueDate: due, today: T, customer, ...o }));
  assert.ok(c({ amountCents: 400 }).includes("BOLETO_MIN"));
  assert.ok(c({ amountCents: 5_000_000 }).includes("BOLETO_MAX"));
  assert.ok(c({ customer: { name: "Ana", email: "a@x" } }).includes("BOLETO_NEEDS_DOCUMENT"));
  assert.ok(c({ customer: { document: "11222333000181", email: "a@x" } }).includes("BOLETO_NEEDS_NAME"));
  assert.ok(c({ dueDate: F.addDays(T, 61) }).includes("BOLETO_DUE_TOO_FAR"));
  assert.deepEqual(c({ dueDate: F.addDays(T, 60) }), []);
  assert.ok(c({ dueDate: F.addDays(T, -1) }).includes("DUE_IN_PAST"));
  assert.ok(c({ methods: [] }).includes("METHOD_REQUIRED"));
  assert.ok(c({ methods: ["cheque"] }).includes("INVALID_METHOD"));
  assert.ok(c({ methods: ["pix"], recurring: true }).includes("PIX_NOT_RECURRING"));
  assert.ok(c({ methods: ["pix"], amountCents: 49 }).includes("PIX_MIN"));
  assert.deepEqual(wcodes(F.validateCharge({ methods: ["pix"], amountCents: 2_000_000, dueDate: due, today: T, customer })), ["PIX_MAX"]);
  assert.deepEqual(wcodes(F.validateCharge({ methods: ["card"], amountCents: 100, dueDate: due, today: T, customer: { name: "x" } })), ["NO_CONTACT"]);
  assert.deepEqual(c({ methods: ["card"], customer: {} }), [], "cartão não exige documento");
});

test("régua de cobrança: só o lembrete mais recente não enviado", () => {
  const b = { dueDate: "2026-10-20" };
  assert.equal(F.reminderDue({ ...b, today: "2026-10-10" }), null);
  assert.equal(F.reminderDue({ ...b, today: "2026-10-17" }), -3);
  assert.equal(F.reminderDue({ ...b, today: "2026-10-18", sent: [-3] }), null);
  assert.equal(F.reminderDue({ ...b, today: "2026-10-20", sent: [-3] }), 0);
  assert.equal(F.reminderDue({ ...b, today: "2026-10-30" }), 7, "atrasado: manda só o último, não a fila");
  assert.equal(F.reminderDue({ ...b, today: "2026-10-30", paid: true }), null);
  assert.equal(F.reminderDue({ ...b, today: "2026-10-30", canceled: true }), null);
});

test("formatos: R$, decimal da contabilidade, CSV seguro", () => {
  assert.equal(F.formatBRL(123456), "R$ 1.234,56");
  assert.equal(F.formatBRL(-5), "-R$ 0,05");
  assert.equal(F.centsToDecimal(123456), "1234,56");
  assert.equal(F.centsToDecimal(-5), "-0,05");
  assert.equal(F.toCsv([{ a: "=1+1", b: "x;y" }], [{ key: "a", label: "A" }, { key: "b", label: "B" }]), "﻿A;B\r\n'=1+1;\"x;y\"\r\n");
});

// ================================================================== operação avançada e perfis
test("rateio: validação, maior resto com soma exata, por valor e explosão para a DRE", () => {
  assert.deepEqual(F.validateAllocations([{ categoryId: "a", pct: 100 }], 1000).map((e) => e.code), ["ALLOCATION_MIN"]);
  assert.deepEqual(F.validateAllocations([{ categoryId: "a", pct: 50 }, { categoryId: "b", amountCents: 500 }], 1000).map((e) => e.code), ["ALLOCATION_MIXED"]);
  assert.deepEqual(F.validateAllocations([{ categoryId: "a", pct: 50 }, { categoryId: "b", pct: 40 }], 1000).map((e) => e.code), ["ALLOCATION_SUM"]);
  assert.deepEqual(F.validateAllocations([{ categoryId: "a", pct: 50.005 }, { categoryId: "", pct: 49.995 }], 1000).map((e) => e.path), ["allocations.0.pct", "allocations.1.categoryId", "allocations.1.pct"]);
  assert.deepEqual(F.validateAllocations([{ categoryId: "a", amountCents: 600 }, { categoryId: "b", amountCents: 300 }], 1000).map((e) => e.code), ["ALLOCATION_SUM"]);
  assert.deepEqual(F.validateAllocations([{ categoryId: "a", amountCents: 600 }, { categoryId: "b", amountCents: 400 }], 1000), []);
  assert.deepEqual(F.validateAllocations([{ categoryId: "a", pct: 0 }, { categoryId: "b", pct: 100 }], 1000).map((e) => e.code), ["PCT_INVALID"], "parte de 0%");
  assert.deepEqual(F.validateAllocations([{ categoryId: "a", amountCents: 0 }, { categoryId: "b", amountCents: 1000 }], 1000).map((e) => e.code), ["AMOUNT_INVALID"]);
  assert.deepEqual(F.validateAllocations([{ categoryId: "", pct: 50 }, { categoryId: "b", pct: 40 }], 1000).map((e) => e.code), ["CATEGORY_REQUIRED"], "erro de parte primeiro, soma depois");
  assert.deepEqual(F.validateAllocations([{ categoryId: "a", pct: 33.33 }, { categoryId: "b", pct: 33.33 }, { categoryId: "c", pct: 33.34 }], 1000), []);
  assert.deepEqual(F.allocateAmount(10000, [{ pct: 33.33 }, { pct: 33.33 }, { pct: 33.34 }]).map((p) => p.amountCents), [3333, 3333, 3334]);
  assert.deepEqual(F.allocateAmount(100, [{ pct: 33.33 }, { pct: 33.33 }, { pct: 33.34 }]).map((p) => p.amountCents), [33, 33, 34], "o maior resto leva o centavo");
  assert.deepEqual(F.allocateAmount(101, [{ pct: 50 }, { pct: 50 }]).map((p) => p.amountCents), [51, 50], "empate: a primeira");
  assert.deepEqual(F.allocateAmount(1000, [{ amountCents: 700 }, { amountCents: 300 }]).map((p) => p.amountCents), [700, 300]);
  assert.deepEqual(F.splitByShares(1001, [1, 1, 1]), [334, 334, 333]);
  assert.deepEqual(F.splitByShares(500, [700, 300]), [350, 150]);
  assert.deepEqual(F.splitByShares(500, [0, 0]), [0, 0]);
  const ex = F.explodeAllocations([{ id: "e", categoryId: "x", costCenterId: "cc0", amountCents: 1000, allocations: [{ categoryId: "a", costCenterId: "cc1", pct: 70 }, { categoryId: "b", pct: 30 }] }, { id: "f", categoryId: "y", amountCents: 50 }]);
  assert.deepEqual(ex.map((e) => [e.categoryId, e.costCenterId ?? null, e.amountCents]), [["a", "cc1", 700], ["b", "cc0", 300], ["y", null, 50]]);
});

test("previsto × realizado: despesa estoura, alerta, receita bate a meta, sem orçamento", () => {
  assert.deepEqual(F.validateBudget({ categoryId: "a", month: "2026-13", amountCents: 1.5 }).map((e) => e.path), ["month", "amountCents"]);
  assert.deepEqual(F.validateBudget({ categoryId: "a", month: "2026-10", amountCents: 0 }), []);
  const typeOf = (id) => (id === "rec" ? "INCOME" : "EXPENSE");
  const rows = F.budgetVsActual(
    [{ categoryId: "alug", month: "2026-10", amountCents: 1000 }, { categoryId: "mkt", month: "2026-10", amountCents: 1000 }, { categoryId: "luz", month: "2026-10", amountCents: 1000 }, { categoryId: "rec", month: "2026-10", amountCents: 1000 }, { categoryId: "rec", month: "2026-11", amountCents: 1000 }],
    [{ categoryId: "alug", month: "2026-10", amountCents: 1001 }, { categoryId: "mkt", month: "2026-10", amountCents: 900 }, { categoryId: "luz", month: "2026-10", amountCents: 899 }, { categoryId: "rec", month: "2026-10", amountCents: 1000 }, { categoryId: "rec", month: "2026-11", amountCents: 950 }, { categoryId: "x", month: "2026-10", amountCents: 50 }, { categoryId: "x", month: "2026-10", amountCents: 25 }],
    { typeOf },
  );
  const by = (c, m = "2026-10") => rows.find((r) => r.categoryId === c && r.month === m);
  assert.deepEqual(by("alug"), { categoryId: "alug", month: "2026-10", budgetCents: 1000, actualCents: 1001, diffCents: -1, usedPct: 100.1, status: "OVER" });
  assert.equal(by("mkt").status, "WARN", "90% exatos alertam");
  assert.equal(by("luz").status, "OK", "89,9% ainda ok");
  assert.equal(by("rec").status, "OK", "receita igual à meta");
  assert.equal(by("rec", "2026-11").status, "WARN");
  assert.deepEqual(by("x"), { categoryId: "x", month: "2026-10", budgetCents: 0, actualCents: 75, diffCents: -75, usedPct: null, status: "NO_BUDGET" });
  assert.equal(F.budgetVsActual([{ categoryId: "rec", month: "2026-10", amountCents: 1000 }], [{ categoryId: "rec", month: "2026-10", amountCents: 899 }], { typeOf })[0].status, "UNDER");
  assert.equal(F.budgetVsActual([{ categoryId: "a", month: "2026-10", amountCents: 1000 }], [{ categoryId: "a", month: "2026-10", amountCents: 1000 }])[0].status, "WARN", "gastar exatamente o orçado não estoura");
  assert.equal(F.budgetVsActual([{ categoryId: "a", month: "2026-10", amountCents: 600 }, { categoryId: "a", month: "2026-10", amountCents: 400 }], [])[0].budgetCents, 1000, "orçamentos do mesmo mês somam");
  assert.equal(F.budgetVsActual([{ categoryId: "a", month: "2026-10", amountCents: 0 }], [{ categoryId: "a", month: "2026-10", amountCents: 1 }])[0].status, "OVER", "orçamento zero com gasto");
  assert.deepEqual(rows.map((r) => r.month + r.categoryId), [...rows.map((r) => r.month + r.categoryId)].sort(), "mês e categoria em ordem");
});

test("fatura de cartão: melhor dia, vencimento no mês certo, parcelas em faturas seguidas", () => {
  assert.deepEqual(F.validateCard({ closingDay: 5, dueDay: 5 }).map((e) => e.code), ["DUE_EQUALS_CLOSING"]);
  assert.deepEqual(F.validateCard({ closingDay: 0, dueDay: 32, limitCents: -1 }).map((e) => e.path), ["closingDay", "dueDay", "limitCents"]);
  assert.deepEqual(F.validateCard({ closingDay: 25, dueDay: 3 }), []);
  assert.deepEqual(F.validateCard({ closingDay: 30, dueDay: 31 }), [], "dias 29 a 31 valem");
  const c = { closingDay: 5, dueDay: 12 };
  assert.deepEqual(F.cardInvoiceFor("2026-10-04", c), { refMonth: "2026-10", closesOn: "2026-10-05", dueOn: "2026-10-12" });
  assert.deepEqual(F.cardInvoiceFor("2026-10-05", c), { refMonth: "2026-11", closesOn: "2026-11-05", dueOn: "2026-11-12" }, "no dia do fechamento já vai para a próxima");
  assert.deepEqual(F.cardInvoiceFor("2026-10-20", { closingDay: 25, dueDay: 3 }), { refMonth: "2026-11", closesOn: "2026-10-25", dueOn: "2026-11-03" }, "vence no mês seguinte ao fechamento");
  assert.deepEqual(F.cardInvoiceFor("2026-12-28", { closingDay: 25, dueDay: 3 }), { refMonth: "2027-02", closesOn: "2027-01-25", dueOn: "2027-02-03" }, "virada de ano");
  assert.deepEqual(F.cardInvoiceFor("2027-02-10", { closingDay: 31, dueDay: 8 }), { refMonth: "2027-03", closesOn: "2027-02-28", dueOn: "2027-03-08" }, "dia 31 vira o último do mês");
  assert.equal(F.cardInvoiceFor("2027-02-28", { closingDay: 31, dueDay: 8 }).closesOn, "2027-03-31");
  const plan = F.cardPurchasePlan(10000, 3, "2026-10-10", c);
  assert.deepEqual(plan.map((p) => [p.number, p.amountCents, p.refMonth, p.dueOn]), [[1, 3334, "2026-11", "2026-11-12"], [2, 3333, "2026-12", "2026-12-12"], [3, 3333, "2027-01", "2027-01-12"]]);
  assert.deepEqual(F.cardPurchasePlan(500, 1, "2026-10-01", c).map((p) => p.refMonth), ["2026-10"]);
  assert.throws(() => F.cardPurchasePlan(500, 0, "2026-10-01", c));
  assert.throws(() => F.cardPurchasePlan(500, 25, "2026-10-01", c));
  assert.equal(F.bestPurchaseDay(c), 5);
});

test("competência travada", () => {
  assert.equal(F.isLocked("2026-09-30", "2026-09"), true);
  assert.equal(F.isLocked("2026-10-01", "2026-09"), false);
  assert.equal(F.isLocked("2025-12-31", "2026-09"), true);
  assert.equal(F.isLocked("2026-09-01", null), false);
  assert.equal(F.isLocked(null, "2026-09"), false);
  assert.deepEqual(F.validateLock("2026-10", "2026-10-15", null).map((e) => e.code), ["MONTH_NOT_CLOSED"]);
  assert.deepEqual(F.validateLock("2026-11", "2026-10-15", null).map((e) => e.code), ["MONTH_NOT_CLOSED"]);
  assert.deepEqual(F.validateLock("2026-9", "2026-10-15", null).map((e) => e.code), ["MONTH_INVALID"]);
  assert.deepEqual(F.validateLock("2026-08", "2026-10-15", "2026-09").map((e) => e.code), ["LOCK_BACKWARDS"]);
  assert.deepEqual(F.validateLock("2026-09", "2026-10-15", "2026-09"), []);
  assert.deepEqual(F.validateLock("2026-09", "2026-10-01", "2026-08"), []);
});

test("exportação ao contador: partidas dobradas, rateio na baixa, transferência e códigos faltando", () => {
  const accountCode = (id) => ({ itau: "1.1.1.02", caixa: "1.1.1.01" })[id], categoryCode = (id) => ({ vendas: "3.1.1", aluguel: "4.2.1", mkt: "4.3.1" })[id];
  const r = F.accountingEntries({
    payments: [
      { id: "p1", date: "2026-10-05", type: "INCOME", cashCents: 10000, accountId: "itau", categoryId: "vendas", description: "Venda", document: "NF 12" },
      { id: "p2", date: "2026-10-03", type: "EXPENSE", cashCents: 3000, accountId: "itau", categoryId: "aluguel", description: "Aluguel" },
      { id: "p3", date: "2026-10-07", type: "EXPENSE", cashCents: 500, entryAmountCents: 1000, accountId: "caixa", categoryId: "x", allocations: [{ categoryId: "aluguel", pct: 70 }, { categoryId: "mkt", pct: 30 }], description: "Rateado" },
      { id: "p4", date: "2026-10-08", type: "EXPENSE", cashCents: 100, accountId: "nubank", categoryId: "softw", description: "Sem código" },
    ],
    transfers: [{ id: "t", date: "2026-10-04", fromAccountId: "itau", toAccountId: "caixa", amountCents: 2000 }],
  }, { accountCode, categoryCode });
  assert.deepEqual(r.rows.map((x) => [x.date, x.debit, x.credit, x.amountCents]), [
    ["2026-10-03", "4.2.1", "1.1.1.02", 3000],
    ["2026-10-04", "1.1.1.01", "1.1.1.02", 2000],
    ["2026-10-05", "1.1.1.02", "3.1.1", 10000],
    ["2026-10-07", "4.2.1", "1.1.1.01", 350],
    ["2026-10-07", "4.3.1", "1.1.1.01", 150],
    ["2026-10-08", null, null, 100],
  ]);
  assert.deepEqual(r.missing, [{ kind: "account", id: "nubank" }, { kind: "category", id: "softw" }]);
  assert.equal(r.totalCents, 15600);
  const tiny = F.accountingEntries({ payments: [{ id: "p", date: "2026-10-01", type: "EXPENSE", cashCents: 1, entryAmountCents: 2, accountId: "itau", categoryId: "x", allocations: [{ categoryId: "aluguel", pct: 50 }, { categoryId: "mkt", pct: 50 }], description: "1 centavo" }] }, { accountCode, categoryCode });
  assert.deepEqual(tiny.rows.map((x) => [x.debit, x.amountCents]), [["4.2.1", 1]], "parte de zero centavo não vira linha");
  assert.equal(r.rows.find((x) => x.amountCents === 10000).document, "NF 12");
  assert.equal(r.rows.find((x) => x.amountCents === 2000).history, "Transferência entre contas");
  const csv = F.accountingCsv([r.rows[2]]);
  assert.match(csv, /^\uFEFFdata;debito;credito;valor;historico;documento/);
  assert.match(csv, /05\/10\/2026;1\.1\.1\.02;3\.1\.1;100,00;Venda;NF 12/);
});

test("NFS-e: serviço, impostos e retenções com o mínimo de R$ 10, Simples e chave de acesso", () => {
  assert.deepEqual(F.validateService({ code: "1.01", description: "", issPct: 1.5, cityCode: "41152" }).map((e) => e.path), ["service.code", "service.description", "service.issPct", "service.cityCode"]);
  assert.deepEqual(F.validateService({ code: "010101", description: "Análise de sistemas", issPct: 2 }), []);
  assert.deepEqual(F.validateService({ code: "010101", description: "x", issPct: 5 }), []);
  assert.deepEqual(F.validateService({ code: "0101", description: "x", issPct: 5 }).map((e) => e.code), ["SERVICE_CODE_INVALID"]);
  assert.deepEqual(F.validateService({ code: "010101", description: "x", issPct: 5.01 }).map((e) => e.code), ["ISS_RATE_INVALID"]);
  const t = F.serviceTaxes(1_000_000, { issPct: 5, issWithheld: true, irrfPct: 1.5, pcc: true });
  assert.deepEqual(t, { issCents: 50000, issWithheldCents: 50000, irrfCents: 15000, pisCents: 6500, cofinsCents: 30000, csllCents: 10000, inssCents: 0, retainedCents: 111500, netCents: 888500 });
  assert.deepEqual(F.serviceTaxes(100_000, { issPct: 2, irrfPct: 1.5, pcc: true }), { issCents: 2000, issWithheldCents: 0, irrfCents: 1500, pisCents: 650, cofinsCents: 3000, csllCents: 1000, inssCents: 0, retainedCents: 6150, netCents: 93850 }, "ISS do prestador não é retido");
  const small = F.serviceTaxes(60_000, { issPct: 2, irrfPct: 1.5, pcc: true });
  assert.deepEqual([small.irrfCents, small.pisCents + small.cofinsCents + small.csllCents], [0, 2790], "IRRF de R$ 9,00 não é retido; PCC de R$ 27,90 é");
  const mid = F.serviceTaxes(25_000, { issPct: 2, pcc: true });
  assert.deepEqual([mid.pisCents, mid.cofinsCents, mid.csllCents], [163, 750, 250], "o mínimo vale para a soma dos três (R$ 11,63), não para cada um");
  const tiny = F.serviceTaxes(20_000, { issPct: 2, pcc: true });
  assert.equal(tiny.pisCents + tiny.cofinsCents + tiny.csllCents, 0, "PCC de R$ 9,30 não é retido");
  assert.equal(F.serviceTaxes(66_667, { issPct: 2, irrfPct: 1.5 }).irrfCents, 1000, "R$ 10,00 exatos são retidos");
  assert.deepEqual(F.serviceTaxes(1_000_000, { issPct: 3, irrfPct: 1.5, pcc: true, simples: true }).retainedCents, 0, "Simples sem IRRF e PCC");
  assert.equal(F.serviceTaxes(1_000_000, { issPct: 3, inssPct: 11 }).inssCents, 110000);
  assert.equal(F.serviceTaxes(1_000_000, { issPct: 3, inssPct: 11, simples: true }).inssCents, 110000, "INSS da cessão vale no Simples");
  const k = F.nfseAccessKey({ cityCode: "4115200", environment: 2, document: "11.222.333/0001-81", number: 1, issuedOn: "2026-10-15", code: 123 });
  assert.equal(k.length, 50);
  assert.equal(k.slice(0, 7), "4115200"); assert.equal(k[7], "2"); assert.equal(k[8], "2"); assert.equal(k.slice(9, 23), "11222333000181");
  assert.equal(k.slice(23, 36), "0000000000001"); assert.equal(k.slice(36, 40), "2610"); assert.equal(k.slice(40, 49), "000000123");
  assert.equal(F.isNfseKey(k), true);
  assert.equal(F.isNfseKey(k.slice(0, 49) + ((Number(k[49]) + 1) % 10)), false);
  assert.equal(F.isNfseKey(k.slice(0, 48) + "9" + k[49]) && k[48] !== "9", false, "dígito trocado");
  const cpf = F.nfseAccessKey({ cityCode: "3550308", environment: 1, document: "529.982.247-25", number: 42, issuedOn: "2027-01-02", code: 9 });
  assert.equal(cpf[8], "1"); assert.equal(cpf.slice(9, 23), "00052998224725"); assert.equal(cpf[7], "1");
  assert.throws(() => F.nfseAccessKey({ cityCode: "41", document: "x", number: "abc", issuedOn: "2026-10-15", code: 1 }));
  // DV pelo módulo 11: resto 0 ou 1 dá zero
  const keys = Array.from({ length: 40 }, (_, i) => F.nfseAccessKey({ cityCode: "4115200", document: "11222333000181", number: i + 1, issuedOn: "2026-10-15", code: 1 }));
  assert.ok(keys.every(F.isNfseKey));
  assert.ok(keys.some((x) => x[49] === "0"));
});

test("maquininha: débito D+1, crédito D+30, parcelado mês a mês, taxa por parcela e antecipação", () => {
  assert.deepEqual(F.validateCardMachine({ name: "", debitPct: -1, creditPct: 20, installmentPct: 3, debitDays: 61, anticipationMonthlyPct: 15 }).map((e) => e.path), ["name", "debitPct", "creditPct", "debitDays", "anticipationMonthlyPct"]);
  const m = { name: "Stone", debitPct: 1.5, creditPct: 3, installmentPct: 4 };
  assert.deepEqual(F.validateCardMachine(m), []);
  assert.deepEqual(F.cardSaleSchedule({ amountCents: 10000, kind: "DEBIT", saleDate: "2026-10-01" }, m), [{ number: 1, total: 1, dueDate: "2026-10-02", grossCents: 10000, feeCents: 150, netCents: 9850 }]);
  assert.deepEqual(F.cardSaleSchedule({ amountCents: 10000, kind: "CREDIT", saleDate: "2026-10-01" }, m), [{ number: 1, total: 1, dueDate: "2026-10-31", grossCents: 10000, feeCents: 300, netCents: 9700 }]);
  const p = F.cardSaleSchedule({ amountCents: 10000, kind: "CREDIT", installments: 3, saleDate: "2026-10-01" }, m);
  assert.deepEqual(p.map((x) => [x.dueDate, x.grossCents, x.feeCents, x.netCents]), [["2026-10-31", 3334, 133, 3201], ["2026-11-30", 3333, 133, 3200], ["2026-12-30", 3333, 133, 3200]]);
  assert.equal(p.reduce((s, x) => s + x.grossCents, 0), 10000);
  assert.equal(F.cardSaleSchedule({ amountCents: 10050, kind: "CREDIT", saleDate: "2026-10-01" }, m)[0].feeCents, 302, "taxa arredonda (301,5 → 302)");
  assert.deepEqual(F.cardSaleSchedule({ amountCents: 10000, kind: "DEBIT", saleDate: "2026-10-01" }, { ...m, debitDays: 0 })[0].dueDate, "2026-10-01");
  assert.deepEqual(F.cardSaleSchedule({ amountCents: 10000, kind: "CREDIT", installments: 2, saleDate: "2026-10-01" }, { ...m, creditDays: 2 }).map((x) => x.dueDate), ["2026-10-03", "2026-10-05"]);
  const a = F.anticipation([{ dueDate: "2026-10-31", netCents: 9700 }, { dueDate: "2026-10-01", netCents: 1000 }, { dueDate: "2026-09-30", netCents: 500 }], "2026-10-01", 2);
  assert.deepEqual(a.items.map((x) => [x.days, x.discountCents, x.receiveCents]), [[30, 194, 9506], [0, 0, 1000], [0, 0, 500]]);
  assert.deepEqual([a.netCents, a.discountCents, a.receiveCents], [11200, 194, 11006]);
  assert.equal(F.anticipation([{ dueDate: "2026-10-16", netCents: 10000 }], "2026-10-01", 3).items[0].discountCents, 150, "15 dias = meio mês");
});

test("convênio: fluxo da guia, glosa, recurso e índice", () => {
  assert.equal(F.canMoveClaim("OPEN", "SENT"), true);
  assert.equal(F.canMoveClaim("SENT", "OPEN"), false);
  assert.equal(F.canMoveClaim("PAID", "CANCELED"), false);
  assert.equal(F.canMoveClaim("X", "SENT"), false);
  const c = { amountCents: 20000, glosas: [{ amountCents: 5000 }], recoveries: [{ amountCents: 2000 }] };
  assert.deepEqual(F.claimBalance(c), { billedCents: 20000, glosaCents: 5000, recoveredCents: 2000, expectedCents: 17000, openGlosaCents: 3000 });
  assert.deepEqual(F.claimBalance({ amountCents: 100 }), { billedCents: 100, glosaCents: 0, recoveredCents: 0, expectedCents: 100, openGlosaCents: 0 });
  assert.deepEqual(F.validateGlosa(c, { amountCents: 15001, reason: "x" }).map((e) => e.code), ["GLOSA_ABOVE_BILLED"]);
  assert.deepEqual(F.validateGlosa(c, { amountCents: 15000, reason: "x" }), []);
  assert.deepEqual(F.validateGlosa(c, { amountCents: 0, reason: " " }).map((e) => e.code), ["AMOUNT_INVALID", "REASON_REQUIRED"]);
  assert.deepEqual(F.validateRecovery(c, 3001).map((e) => e.code), ["RECOVERY_ABOVE_GLOSA"]);
  assert.deepEqual(F.validateRecovery(c, 3000), []);
  assert.deepEqual(F.validateRecovery(c, 0), [], "recurso negado recupera zero");
  assert.deepEqual(F.validateRecovery(c, -1).map((e) => e.code), ["AMOUNT_INVALID"]);
  assert.deepEqual(F.glosaRate([c, { amountCents: 30000, glosas: [{ amountCents: 1000 }] }]), { billedCents: 50000, glosaCents: 6000, recoveredCents: 2000, netGlosaCents: 4000, ratePct: 8 });
  assert.equal(F.glosaRate([]).ratePct, 0);
  assert.equal(F.glosaRate([{ amountCents: 3000, glosas: [{ amountCents: 1000 }] }]).ratePct, 33.3);
});

test("perfis do Financeiro", () => {
  assert.deepEqual(Object.keys(F.FIN_SEGMENTS), ["GENERAL", "SERVICES", "RETAIL", "CLINIC"]);
  assert.equal(F.finSegment("CLINIC").words.customer, "paciente");
  assert.ok(F.finSegment("SERVICES").on.includes("nfse_on_payment"));
  assert.ok(F.finSegment("RETAIL").on.includes("card_machines"));
  assert.equal(F.finSegment("NADA").id, "GENERAL");
  assert.deepEqual(F.finSegment("GENERAL").on, []);
});
