// node --test comercial-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "./comercial-lib.mjs";

const codes = (errs) => errs.map((e) => e.code);
const T = "2026-10-14";

test("valor por extenso: inteiros com 'e' no lugar certo", () => {
  const cases = [[0, "zero"], [1, "um"], [15, "quinze"], [21, "vinte e um"], [100, "cem"], [101, "cento e um"], [110, "cento e dez"], [999, "novecentos e noventa e nove"],
    [1000, "mil"], [1001, "mil e um"], [1100, "mil e cem"], [1200, "mil e duzentos"], [1250, "mil duzentos e cinquenta"], [2000, "dois mil"], [21000, "vinte e um mil"],
    [100000, "cem mil"], [101000, "cento e um mil"], [1000000, "um milhão"], [1000001, "um milhão e um"], [1200000, "um milhão e duzentos mil"], [1250000, "um milhão duzentos e cinquenta mil"],
    [2000000, "dois milhões"], [3000000000, "três bilhões"]];
  for (const [n, w] of cases) assert.equal(C.integerToWords(n), w, String(n));
  assert.throws(() => C.integerToWords(-1));
  assert.throws(() => C.integerToWords(1.5));
});

test("valor por extenso em reais e centavos", () => {
  assert.equal(C.centsToWords(0), "zero reais");
  assert.equal(C.centsToWords(1), "um centavo");
  assert.equal(C.centsToWords(100), "um real");
  assert.equal(C.centsToWords(250), "dois reais e cinquenta centavos");
  assert.equal(C.centsToWords(150030), "mil e quinhentos reais e trinta centavos");
  assert.equal(C.centsToWords(100000000), "um milhão de reais");
  assert.equal(C.centsToWords(120000000), "um milhão e duzentos mil reais");
  assert.equal(C.centsToWords(100000100), "um milhão e um reais");
});

const ITEMS = [
  { id: "A", description: "Licença", qty: 3, unitCents: 100000, discountPct: 10 },
  { id: "B", description: "Horas de implantação", qty: 1.5, unitCents: 20000 },
  { id: "C", description: "Suporte mensal", qty: 1, unitCents: 20000, discountCents: 2000, recurring: "month" },
  { id: "D", description: "Treinamento extra", qty: 1, unitCents: 50000, optional: true },
  { id: "E", description: "Manual impresso", qty: 1, unitCents: 10000, optional: true, selected: true },
];

test("itens: validação", () => {
  assert.deepEqual(C.validateItems(ITEMS), []);
  assert.deepEqual(codes(C.validateItems([])), ["EMPTY_PROPOSAL"]);
  const bad = C.validateItems([{ id: "x", description: "", qty: 0, unitCents: 10.5, discountPct: 120, recurring: "week" }]);
  assert.deepEqual(codes(bad).sort(), ["DESCRIPTION_REQUIRED", "DISCOUNT_INVALID", "PRICE_INVALID", "QTY_INVALID", "RECURRING_INVALID"]);
  assert.ok(bad.every((e) => e.path.startsWith("items.0.")));
  assert.ok(codes(C.validateItems([{ description: "x", qty: 1.2345, unitCents: 100 }])).includes("QTY_INVALID"), "até 3 casas");
  assert.deepEqual(C.validateItems([{ description: "x", qty: 1.234, unitCents: 100 }]), []);
  assert.ok(codes(C.validateItems([{ description: "x", qty: 1, unitCents: 100, discountPct: 5, discountCents: 1 }])).includes("DISCOUNT_INVALID"), "% e R$ juntos");
  assert.deepEqual(codes(C.validateItems([{ description: "x", qty: 1, unitCents: 100, optional: true }])), ["EMPTY_PROPOSAL"], "só opcional não marcado");
});

test("totais: desconto por item e geral, opcional, recorrente, desconto efetivo", () => {
  const t = C.proposalTotals(ITEMS, { globalDiscountPct: 5 });
  assert.deepEqual(t.lines.find((l) => l.id === "A"), { id: "A", recurring: null, included: true, grossCents: 300000, discountCents: 30000, netCents: 270000 });
  assert.equal(t.lines.find((l) => l.id === "B").grossCents, 30000, "1,5 hora");
  assert.equal(t.lines.find((l) => l.id === "D").included, false);
  assert.deepEqual(t.oneTime, { grossCents: 340000, itemDiscountCents: 30000, globalDiscountCents: 15500, totalCents: 294500 });
  assert.deepEqual([t.monthlyCents, t.yearlyCents], [18000, 0]);
  assert.equal(t.effectiveDiscountPct, 13.2, "47.500 de 360.000");
  assert.equal(C.proposalTotals(ITEMS, { globalDiscountCents: 999999 }).oneTime.totalCents, 0, "desconto geral nunca passa do total");
  const capped = C.proposalTotals([{ id: "x", description: "x", qty: 1, unitCents: 1000, discountCents: 5000 }]);
  assert.deepEqual([capped.lines[0].discountCents, capped.lines[0].netCents, capped.oneTime.totalCents], [1000, 0, 0], "desconto do item nunca passa do bruto");
  assert.equal(C.proposalTotals([{ id: "x", description: "x", qty: 0.333, unitCents: 10000 }]).oneTime.totalCents, 3330);
});

test("aprovação por desconto ou valor", () => {
  assert.equal(C.needsApproval({ effectiveDiscountPct: 13.2, totalCents: 1 }).required, false);
  const r = C.needsApproval({ effectiveDiscountPct: 20, totalCents: 1 });
  assert.deepEqual([r.required, codes(r.reasons)], [true, ["DISCOUNT_ABOVE_LIMIT"]]);
  assert.deepEqual(codes(C.needsApproval({ effectiveDiscountPct: 0, totalCents: 2_000_000 }, { maxTotalCents: 1_000_000 }).reasons), ["TOTAL_ABOVE_LIMIT"]);
  assert.equal(C.needsApproval({ effectiveDiscountPct: 99, totalCents: 1 }, { maxDiscountPct: null }).required, false);
});

test("plano de pagamento: à vista, parcelado com o centavo certo, entrada + parcelas", () => {
  assert.deepEqual(C.paymentPlan(100000, { kind: "avista", firstDue: "2027-01-31" }).schedule, [{ number: 1, amountCents: 100000, dueDate: "2027-01-31", label: "À vista" }]);
  const p = C.paymentPlan(100000, { kind: "parcelado", installments: 3, firstDue: "2027-01-31" }).schedule;
  assert.deepEqual(p.map((x) => [x.amountCents, x.dueDate, x.label]), [[33334, "2027-01-31", "Parcela 1/3"], [33333, "2027-02-28", "Parcela 2/3"], [33333, "2027-03-31", "Parcela 3/3"]]);
  const e = C.paymentPlan(100000, { kind: "entrada", downPaymentPct: 30, installments: 2, firstDue: "2027-01-31" }).schedule;
  assert.deepEqual(e.map((x) => [x.label, x.amountCents, x.dueDate]), [["Entrada", 30000, "2027-01-31"], ["Parcela 1/2", 35000, "2027-02-28"], ["Parcela 2/2", 35000, "2027-03-31"]]);
  assert.equal(e.reduce((a, x) => a + x.amountCents, 0), 100000);
  assert.deepEqual(codes(C.paymentPlan(100000, { kind: "boleto", firstDue: T }).errors), ["PLAN_INVALID"]);
  assert.deepEqual(codes(C.paymentPlan(100000, { kind: "parcelado", installments: 0, firstDue: T }).errors), ["INSTALLMENTS_INVALID"]);
  assert.deepEqual(codes(C.paymentPlan(100000, { kind: "entrada", installments: 2, downPaymentPct: 100, firstDue: T }).errors), ["DOWNPAYMENT_INVALID"]);
  assert.deepEqual(codes(C.paymentPlan(100000, { kind: "avista" }).errors), ["DATE_REQUIRED"]);
  assert.deepEqual(codes(C.paymentPlan(10000, { kind: "parcelado", installments: 10, firstDue: T, minInstallmentCents: 5000 }).errors), ["MIN_INSTALLMENT"]);
});

test("modelos: variáveis, filtros, escape, faltando, validação", () => {
  const tpl = "Contrato com {{cliente.nome}} ({{ cliente.documento | documento }}) no valor de {{proposta.total|moeda}} ({{proposta.total|extenso}}), início {{contrato.inicio|data}}. {{cliente.nome|maiusculas}} <b>{{cliente.cidade}}</b>";
  const r = C.renderTemplate(tpl, { cliente: { nome: "Ana & Cia", documento: "11222333000181" }, proposta: { total: 150030 }, contrato: { inicio: "2027-01-15" } });
  assert.equal(r.html, "Contrato com Ana &amp; Cia (11.222.333/0001-81) no valor de R$ 1.500,30 (mil e quinhentos reais e trinta centavos), início 15/01/2027. ANA &amp; CIA <b></b>");
  assert.deepEqual(r.missing, ["cliente.cidade"]);
  assert.equal(C.renderTemplate("{{x}}", { x: "<script>" }).html, "&lt;script&gt;", "valor escapado");
  assert.deepEqual(C.templateVariables(tpl).map((v) => v.path + (v.filter ? "|" + v.filter : "")), ["cliente.nome", "cliente.documento|documento", "proposta.total|moeda", "proposta.total|extenso", "contrato.inicio|data", "cliente.nome|maiusculas", "cliente.cidade"]);
  assert.equal(C.templateVariables(tpl).length, 7, "mesma variável com filtros diferentes conta separado; repetida igual não");
  const allowed = ["cliente.nome", "cliente.documento", "proposta.total", "contrato.inicio", "cliente.cidade"];
  assert.deepEqual(C.validateTemplate(tpl, allowed), []);
  assert.deepEqual(codes(C.validateTemplate("{{cliente.cpf}} {{proposta.total|dinheiro}} {{abre", allowed)), ["UNKNOWN_VARIABLE", "UNKNOWN_FILTER", "UNCLOSED_VARIABLE"]);
});

test("proposta: situação e quem pode decidir", () => {
  const base = { sentAt: "2026-10-01T10:00:00Z", validUntil: "2026-10-31" };
  assert.equal(C.proposalStatus({}, T), "DRAFT");
  assert.equal(C.proposalStatus({ approvalStatus: "PENDING" }, T), "PENDING_APPROVAL");
  assert.equal(C.proposalStatus(base, T), "SENT");
  assert.equal(C.proposalStatus({ ...base, viewedAt: "x" }, T), "VIEWED");
  assert.equal(C.proposalStatus({ ...base, validUntil: "2026-10-13" }, T), "EXPIRED");
  assert.equal(C.proposalStatus({ ...base, validUntil: T }, T), "SENT", "vale até o fim do dia");
  assert.equal(C.proposalStatus({ ...base, acceptedAt: "x", validUntil: "2026-10-01" }, T), "ACCEPTED", "aceita antes de vencer continua aceita");
  assert.equal(C.proposalStatus({ ...base, supersededById: "v2" }, T), "SUPERSEDED");
  assert.deepEqual(C.canDecide(base, T), { ok: true });
  assert.deepEqual(C.canDecide({}, T), { ok: false, code: "NOT_SENT" });
  assert.deepEqual(C.canDecide({ ...base, rejectedAt: "x" }, T), { ok: false, code: "ALREADY_DECIDED" });
  assert.deepEqual(C.canDecide({ ...base, validUntil: "2026-10-01" }, T), { ok: false, code: "PROPOSAL_EXPIRED" });
  assert.deepEqual(C.canDecide({ ...base, canceledAt: "x" }, T), { ok: false, code: "PROPOSAL_CANCELED" });
  assert.deepEqual(C.canDecide({ ...base, supersededById: "v2" }, T), { ok: false, code: "PROPOSAL_SUPERSEDED" });
});

test("aceite: nome completo, CPF/CNPJ válido e concordância", () => {
  assert.deepEqual(C.validateAcceptance({ name: "Ana Souza", document: "529.982.247-25", agree: true }), []);
  assert.deepEqual(codes(C.validateAcceptance({ name: "Ana", document: "123", agree: false })), ["NAME_REQUIRED", "DOCUMENT_INVALID", "AGREE_REQUIRED"]);
  assert.deepEqual(C.validateAcceptance({ name: "Loja Centro Ltda", document: "11.222.333/0001-81", agree: true }), []);
});

test("visualizações", () => {
  assert.deepEqual(C.viewSummary([{ sessionId: "a", at: "2026-10-14T10:00:00Z", seconds: 30 }, { sessionId: "a", at: "2026-10-14T11:00:00Z", seconds: 15 }, { sessionId: "b", at: "2026-10-13T09:00:00Z" }]), { opens: 3, sessions: 2, totalSeconds: 45, firstViewedAt: "2026-10-13T09:00:00Z", lastViewedAt: "2026-10-14T11:00:00Z" });
  assert.deepEqual(C.viewSummary([]), { opens: 0, sessions: 0, totalSeconds: 0, firstViewedAt: null, lastViewedAt: null });
});

test("contrato: vigência, aviso, situação, renovação e reajuste", () => {
  const term = C.contractTerm({ startDate: "2027-01-15", months: 12, noticeDays: 30 });
  assert.deepEqual(term, { startDate: "2027-01-15", endDate: "2028-01-14", noticeDate: "2027-12-15" });
  assert.equal(C.contractTerm({ startDate: "2027-03-01", months: 1 }).endDate, "2027-03-31");
  assert.throws(() => C.contractTerm({ startDate: "2027-02-30", months: 1 }));
  const c = { status: "SIGNED", ...term, noticeDays: 30, autoRenew: false, months: 12 };
  assert.equal(C.contractStatus(c, "2027-01-01"), "SCHEDULED");
  assert.equal(C.contractStatus(c, "2027-06-01"), "ACTIVE");
  assert.equal(C.contractStatus(c, "2027-12-14"), "ACTIVE");
  assert.equal(C.contractStatus(c, "2027-12-15"), "EXPIRING");
  assert.equal(C.contractStatus({ ...c, autoRenew: true }, "2027-12-20"), "RENEWING");
  assert.equal(C.contractStatus(c, "2028-02-01"), "ENDED");
  assert.equal(C.contractStatus({ ...c, status: "DRAFT" }, "2027-06-01"), "DRAFT");
  assert.deepEqual(C.renewTerm({ ...c, renewalMonths: 12 }), { startDate: "2028-01-15", endDate: "2029-01-14", noticeDate: "2028-12-15" });
  assert.equal(C.readjust(100000, 4.5), 104500);
  assert.equal(C.readjust(99999, 3.33), 103329);
});

test("assinatura: ordem sequencial e paralela, recusa, situação do envelope", () => {
  const S = (a, b, w) => [{ id: "a", order: 1, role: "SIGNER", status: a }, { id: "b", order: 1, role: "SIGNER", status: b }, { id: "w", order: 2, role: "WITNESS", status: w }];
  assert.deepEqual(C.currentTurn(S("PENDING", "PENDING", "PENDING")).sort(), ["a", "b"], "mesma ordem = paralelo");
  assert.deepEqual(C.canSign("w", S("PENDING", "PENDING", "PENDING")), { ok: false, code: "NOT_YOUR_TURN" });
  assert.deepEqual(C.currentTurn(S("SIGNED", "PENDING", "PENDING")), ["b"]);
  assert.deepEqual(C.canSign("w", S("SIGNED", "PENDING", "PENDING")), { ok: false, code: "NOT_YOUR_TURN" }, "a testemunha espera os dois");
  assert.deepEqual(C.currentTurn(S("SIGNED", "SIGNED", "PENDING")), ["w"]);
  assert.deepEqual(C.canSign("a", S("SIGNED", "SIGNED", "PENDING")), { ok: false, code: "ALREADY_SIGNED" });
  assert.deepEqual(C.canSign("w", S("SIGNED", "REFUSED", "PENDING")), { ok: false, code: "ENVELOPE_REFUSED" });
  assert.deepEqual(C.canSign("z", S("PENDING", "PENDING", "PENDING")), { ok: false, code: "NOT_A_SIGNER" });
  assert.deepEqual(C.currentTurn(S("SIGNED", "REFUSED", "PENDING")), []);
  assert.equal(C.envelopeStatus(S("SIGNED", "SIGNED", "SIGNED")), "COMPLETED");
  assert.equal(C.envelopeStatus(S("SIGNED", "REFUSED", "PENDING")), "REFUSED");
  assert.equal(C.envelopeStatus(S("SIGNED", "PENDING", "PENDING")), "IN_PROGRESS");
  assert.equal(C.envelopeStatus(S("SIGNED", "PENDING", "PENDING"), { canceled: true }), "CANCELED");
  assert.equal(C.envelopeStatus(S("PENDING", "PENDING", "PENDING"), { expiresAt: "2026-10-01T00:00:00Z", now: "2026-10-14T00:00:00Z" }), "EXPIRED");
});

test("código por e-mail: validade, tentativas, código errado", () => {
  const base = { expected: "482913", createdAt: "2026-10-14T12:00:00Z", now: "2026-10-14T12:05:00Z" };
  assert.deepEqual(C.checkOtp({ ...base, code: " 482913 " }), { ok: true });
  assert.deepEqual(C.checkOtp({ ...base, code: "000000" }), { ok: false, code: "INVALID_CODE" });
  assert.deepEqual(C.checkOtp({ ...base, code: "482913", now: "2026-10-14T12:10:01Z" }), { ok: false, code: "CODE_EXPIRED" });
  assert.deepEqual(C.checkOtp({ ...base, code: "482913", attempts: 5 }), { ok: false, code: "TOO_MANY_ATTEMPTS" });
  assert.deepEqual(C.checkOtp({ code: "1" }), { ok: false, code: "CODE_NOT_SENT" });
});

test("código de verificação e manifesto em horário de Brasília", () => {
  assert.equal(C.verificationCode("a1b2c3d4e5f6" + "0".repeat(52)), "A1B2-C3D4-E5F6");
  assert.throws(() => C.verificationCode("abc"));
  const lines = C.manifestLines([
    { at: "2026-10-14T12:12:33.000Z", type: "SIGNED", name: "Ana Souza", email: "ana@x.com", role: "SIGNER", ip: "1.2.3.4", document: "52998224725" },
    { at: "2026-10-14T12:00:00.000Z", type: "SENT", name: "Bia", email: "bia@empresa.com" },
    { at: "2026-10-14T12:20:00.000Z", type: "COMPLETED" },
  ]);
  assert.deepEqual(lines, [
    "14/10/2026 09:00:00 · Bia <bia@empresa.com> enviou para assinatura",
    "14/10/2026 09:12:33 · Ana Souza <ana@x.com> (parte) assinou · 529.982.247-25 · IP 1.2.3.4",
    "14/10/2026 09:20:00 · Documento concluído",
  ]);
});

test("documentos e formatos", () => {
  assert.deepEqual(["52998224725", "11222333000181", "10000000000307", "123"].map(C.documentType), ["CPF", "CNPJ", "CNPJ", null]);
  assert.equal(C.formatBRL(150030), "R$ 1.500,30");
  assert.equal(C.formatDate("2027-01-15"), "15/01/2027");
  assert.equal(C.addMonths("2027-01-31", 1), "2027-02-28");
});

test("variáveis e blocos por tipo de modelo", () => {
  assert.ok(C.VARIABLES.PROPOSAL.includes("proposta.avulso") && !C.VARIABLES.PROPOSAL.includes("contrato.valor"));
  assert.ok(C.VARIABLES.CONTRACT.includes("contrato.valor") && C.VARIABLES.CONTRACT.includes("proposta.codigo") && !C.VARIABLES.CONTRACT.includes("aditivo.valor"));
  assert.ok(C.VARIABLES.AMENDMENT.includes("aditivo.valor"));
  assert.deepEqual(codes(C.validateTemplate("{{contrato.valor|moeda}}", C.VARIABLES.PROPOSAL)), ["UNKNOWN_VARIABLE"]);
  assert.deepEqual(C.validateTemplate("{{contrato.valor|extenso}} {{hoje|data}}", C.VARIABLES.CONTRACT), []);
  assert.deepEqual(C.validateBlocks('<div data-block="itens"></div><div data-block="aceite"></div>', "PROPOSAL"), []);
  assert.deepEqual(C.validateBlocks('<div data-block="aceite"></div>', "CONTRACT").map((e) => [e.code, e.path]), [["UNKNOWN_BLOCK", "aceite"]]);
  assert.deepEqual(C.validateBlocks("<div data-block='x'></div>", "AMENDMENT").map((e) => e.path), ["x"]);
});
