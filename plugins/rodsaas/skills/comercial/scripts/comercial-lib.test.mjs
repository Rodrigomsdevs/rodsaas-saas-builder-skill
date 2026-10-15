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

// ================================================================== operação avançada e perfis
const T1 = (items) => C.proposalTotals(items);
test("sinal no aceite: validação, base no avulso ou na mensalidade, teto e plano do restante", () => {
  const once = T1([{ id: "a", description: "Projeto", qty: 1, unitCents: 100000 }]);
  const monthly = T1([{ id: "m", description: "Suporte", qty: 1, unitCents: 30000, recurring: "month" }]);
  assert.deepEqual(C.validateDeposit({ pct: 30, amountCents: 100 }, once).map((e) => e.code), ["DEPOSIT_INVALID"]);
  assert.deepEqual(C.validateDeposit({}, once).map((e) => e.code), ["DEPOSIT_INVALID"]);
  assert.deepEqual(C.validateDeposit({ pct: 0 }, once).map((e) => e.path), ["deposit.pct"]);
  assert.deepEqual(C.validateDeposit({ pct: 100.5 }, once).map((e) => e.path), ["deposit.pct"]);
  assert.deepEqual(C.validateDeposit({ amountCents: 10.5 }, once).map((e) => e.path), ["deposit.amountCents"]);
  assert.deepEqual(C.validateDeposit({ pct: 30, dueDays: 31 }, once).map((e) => e.path), ["deposit.dueDays"]);
  assert.deepEqual(C.validateDeposit({ amountCents: 100001 }, once).map((e) => e.code), ["DEPOSIT_ABOVE_TOTAL"]);
  assert.deepEqual(C.validateDeposit({ amountCents: 100000 }, once), []);
  assert.deepEqual(C.validateDeposit({ pct: 100, dueDays: 0 }, once), []);
  assert.deepEqual(C.validateDeposit(null, once), []);
  assert.equal(C.depositAmount({ pct: 30 }, once), 30000);
  assert.equal(C.depositAmount({ pct: 33.333 }, once), 33333);
  assert.equal(C.depositAmount({ amountCents: 5000 }, once), 5000);
  assert.equal(C.depositAmount({ pct: 50 }, monthly), 15000, "sem avulso: sobre a 1ª mensalidade");
  assert.equal(C.depositAmount({ amountCents: 999999 }, monthly), 30000, "nunca mais que a base");
  assert.equal(C.depositAmount(null, once), 0);
  assert.equal(C.depositAmount({ pct: 0.5 }, T1([{ id: "c", description: "x", qty: 1, unitCents: 101 }])), 1, "0,505 centavo arredonda para 1");
  assert.equal(C.depositAmount({ pct: 50 }, T1([{ id: "c", description: "x", qty: 1, unitCents: 101 }])), 51, "50,5 arredonda para cima");
  assert.equal(C.depositBase(T1([{ id: "y", description: "Licença", qty: 1, unitCents: 120000, recurring: "year" }])), 120000);
  const p = C.planAfterDeposit(100000, 30000, { kind: "parcelado", installments: 2, firstDue: "2027-01-31" });
  assert.deepEqual(p.schedule.map((x) => [x.amountCents, x.dueDate]), [[35000, "2027-01-31"], [35000, "2027-02-28"]]);
  assert.deepEqual(C.planAfterDeposit(100000, 100000, { kind: "avista", firstDue: "2027-01-31" }), { ok: true, errors: [], schedule: [] }, "sinal de 100%: nada mais a pagar");
});

test("WhatsApp: telefone em E.164 e texto do envio", () => {
  assert.equal(C.toE164Br("(44) 99988-7766"), "+5544999887766");
  assert.equal(C.toE164Br("+55 44 99988-7766"), "+5544999887766");
  assert.equal(C.toE164Br("0055 44 99988-7766"), "+5544999887766");
  assert.equal(C.toE164Br("44 3322-1100"), "+554433221100", "fixo com WhatsApp Business");
  assert.equal(C.toE164Br("44 8888-77766"), null, "celular sem o 9");
  assert.equal(C.toE164Br("1 9998-776"), null, "9 dígitos");
  assert.equal(C.toE164Br("09 99988-7766"), null, "DDD não começa com 0");
  assert.equal(C.toE164Br("10 99988-7766"), null, "DDD 10 não existe");
  assert.equal(C.toE164Br("11999887766"), "+5511999887766");
  assert.equal(C.toE164Br("4499988776"), "+554499988776");
  assert.equal(C.toE164Br("1199988776655"), null, "13 dígitos sem 55");
  assert.equal(C.toE164Br("123"), null);
  assert.equal(C.whatsappProposalText({ company: "Acme", customerName: "Ana Souza", code: "P-0007", url: "https://x/p/abc", totalCents: 150000, monthlyCents: 9900, validUntil: "2026-11-30" }), "Ana, aqui é da Acme. Segue a proposta P-0007 (R$ 1.500,00 + R$ 99,00/mês), válida até 30/11/2026: https://x/p/abc");
  assert.equal(C.whatsappProposalText({ company: "Acme", customerName: "", code: "P-1", url: "u", totalCents: 0, monthlyCents: 0, validUntil: "2026-11-30" }), "Olá, aqui é da Acme. Segue a proposta P-1, válida até 30/11/2026: u");
});

test("reajuste: SGS, acumulado encadeado de 12 meses antes do aniversário, mês faltando e deflação", () => {
  assert.deepEqual(C.INDEX_SERIES, { IPCA: 433, "IGP-M": 189, INPC: 188, "IGP-DI": 190 });
  assert.equal(C.sgsUrl(433, "2025-01-01", "2025-12-31"), "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2025&dataFinal=31/12/2025");
  assert.deepEqual(C.parseSgs([{ data: "01/01/2025", valor: "0.16" }, { data: "01/02/2025", valor: "1,31" }, { data: "x", valor: "1" }, { data: "01/03/2025", valor: "abc" }]), [{ month: "2025-01", pct: 0.16 }, { month: "2025-02", pct: 1.31 }]);
  const s = []; for (let i = 1; i <= 12; i++) s.push({ month: "2025-" + String(i).padStart(2, "0"), pct: 0.5 }); s.push({ month: "2026-01", pct: 1 });
  assert.deepEqual(C.accumulatedIndex(s, "2026-01"), { ok: true, pct: 6.1678, rawPct: 6.1678, from: "2025-01", to: "2025-12", floored: false }, "12 × 0,5% encadeado ≠ 6%");
  assert.equal(C.accumulatedIndex(s, "2026-02").pct, 6.696, "janela anda um mês");
  assert.deepEqual(C.accumulatedIndex(s, "2026-03"), { ok: false, missing: ["2026-02"], from: "2025-03", to: "2026-02" });
  const def = s.map((x) => ({ ...x, pct: -0.2 }));
  assert.deepEqual(C.accumulatedIndex(def, "2026-01", { floorZero: true }), { ok: true, pct: 0, rawPct: -2.3738, from: "2025-01", to: "2025-12", floored: true });
  assert.equal(C.accumulatedIndex(def, "2026-01").pct, -2.3738, "sem a cláusula, reduz");
  assert.equal(C.accumulatedIndex(s, "2026-01", { months: 3 }).from, "2025-10");
  assert.equal(C.readjust(100000, 6.1678), 106168);
  assert.equal(C.anniversaryMonth("2025-03-10", "2026-10-15"), "2027-03");
  assert.equal(C.anniversaryMonth("2025-11-10", "2026-10-15"), "2026-11");
  assert.equal(C.anniversaryMonth("2025-10-20", "2026-10-15"), "2026-10", "aniversário ainda neste mês");
  assert.equal(C.anniversaryMonth("2025-10-10", "2026-10-15"), "2027-10", "aniversário deste mês já passou");
  assert.equal(C.anniversaryMonth("2026-09-01", "2026-10-15"), "2027-09", "primeiro aniversário é 12 meses depois do início");
  assert.equal(C.anniversaryMonth("2026-12-01", "2026-10-15"), "2027-12");
});

test("conversão: funil, taxa sobre as decididas, tempo até o aceite, ticket e por vendedor", () => {
  const T = "2026-10-31";
  const ps = [
    { sentAt: "2026-10-01T10:00:00Z", viewedAt: "2026-10-01T11:00:00Z", acceptedAt: "2026-10-05T10:00:00Z", validUntil: "2026-10-30", sellerId: "a", totalCents: 100000, monthlyCents: 0, effectiveDiscountPct: 10 },
    { sentAt: "2026-10-02T10:00:00Z", acceptedAt: "2026-10-04T10:00:00Z", validUntil: "2026-10-30", sellerId: "b", totalCents: 0, monthlyCents: 10000, effectiveDiscountPct: 0 },
    { sentAt: "2026-10-03T10:00:00Z", viewedAt: "2026-10-03T12:00:00Z", rejectedAt: "2026-10-06T10:00:00Z", validUntil: "2026-10-30", sellerId: "a", totalCents: 50000 },
    { sentAt: "2026-10-04T10:00:00Z", validUntil: "2026-10-20", sellerId: "a", totalCents: 70000 },
    { sentAt: "2026-10-10T10:00:00Z", viewedAt: "2026-10-11T10:00:00Z", validUntil: "2026-11-20", sellerId: "b", totalCents: 20000 },
    { sentAt: "2026-09-30T10:00:00Z", acceptedAt: "2026-10-01T10:00:00Z", validUntil: "2026-10-30", sellerId: "a", totalCents: 999999 },
    { validUntil: "2026-11-30", sellerId: "a", totalCents: 5 },
    { sentAt: "2026-10-20T10:00:00Z", validUntil: "2026-10-31", sellerId: "b", totalCents: 1 },
  ];
  const r = C.conversionReport(ps, { from: "2026-10-01", to: "2026-10-31", today: T });
  assert.deepEqual([r.sent, r.viewed, r.accepted, r.rejected, r.expired, r.open], [6, 4, 2, 1, 1, 2], "validade hoje ainda está aberta");
  assert.equal(r.conversionPct, 50, "2 aceitas de 4 decididas");
  assert.equal(r.viewRatePct, 66.7);
  assert.equal(r.avgDaysToAccept, 3, "(4 + 2) / 2");
  assert.equal(r.acceptedCents, 220000, "mensalidade conta 12 meses");
  assert.equal(r.avgTicketCents, 110000);
  assert.equal(r.avgDiscountAcceptedPct, 5);
  assert.deepEqual(r.bySeller.map((x) => [x.sellerId, x.sent, x.accepted, x.conversionPct]), [["b", 3, 1, 100], ["a", 3, 1, 33.3]]);
  const empty = C.conversionReport([], { from: "2026-10-01", to: "2026-10-31", today: T });
  assert.deepEqual([empty.sent, empty.conversionPct, empty.viewRatePct, empty.avgDaysToAccept, empty.avgTicketCents, empty.avgDiscountAcceptedPct], [0, null, null, null, null, null]);
});

test("locação: diárias, tarifa mais barata, disponibilidade no período e atraso", () => {
  assert.equal(C.rentalDays("2026-10-01", "2026-10-01"), 1);
  assert.equal(C.rentalDays("2026-10-01", "2026-10-02"), 1);
  assert.equal(C.rentalDays("2026-10-01", "2026-10-11"), 10);
  const r = { dayCents: 5000, weekCents: 25000, monthCents: 80000 };
  assert.equal(C.rentalPrice(3, r), 15000);
  assert.equal(C.rentalPrice(5, r), 25000, "5 diárias = 1 semana");
  assert.equal(C.rentalPrice(6, r), 25000, "6 dias sai mais barato pagar a semana");
  assert.equal(C.rentalPrice(10, r), 40000, "semana + 3 diárias");
  assert.equal(C.rentalPrice(26, r), 80000, "3 semanas + 5 diárias = 100.000 > mês");
  assert.equal(C.rentalPrice(40, r), 120000);
  assert.equal(C.rentalPrice(10, { dayCents: 5000 }), 50000);
  assert.equal(C.rentalPrice(1, { dayCents: 5000, weekCents: 4000 }), 4000, "semana mais barata que a diária");
  const b = [{ qty: 2, start: "2026-10-01", end: "2026-10-05" }, { qty: 1, start: "2026-10-05", end: "2026-10-08" }, { qty: 5, start: "2026-10-01", end: "2026-10-30", status: "CANCELED" }, { qty: 5, start: "2026-10-01", end: "2026-10-30", status: "RETURNED" }];
  assert.equal(C.rentalAvailable(4, b, { start: "2026-10-03", end: "2026-10-06" }), 1);
  assert.equal(C.rentalAvailable(4, b, { start: "2026-10-05", end: "2026-10-06" }), 3, "devolve no dia 5, aluga de novo no dia 5");
  assert.equal(C.rentalAvailable(4, b, { start: "2026-10-08", end: "2026-10-10" }), 4);
  assert.equal(C.rentalAvailable(1, b, { start: "2026-10-01", end: "2026-10-10" }), 0);
  assert.deepEqual(C.lateReturn({ end: "2026-10-05", returnedAt: "2026-10-06T01:00:00-03:00", dayCents: 5000 }), { lateDays: 0, chargeCents: 0 }, "dentro da tolerância");
  assert.deepEqual(C.lateReturn({ end: "2026-10-05", returnedAt: "2026-10-06T10:00:00-03:00", dayCents: 5000 }), { lateDays: 1, chargeCents: 5000 });
  assert.deepEqual(C.lateReturn({ end: "2026-10-05", returnedAt: "2026-10-08T10:00:00-03:00", dayCents: 5000, graceHours: 0 }), { lateDays: 3, chargeCents: 15000 });
});

test("obra: etapas somando 100%, valor por etapa e medição com retenção", () => {
  assert.deepEqual(C.validateStages([]).map((e) => e.code), ["STAGES_REQUIRED"]);
  assert.deepEqual(C.validateStages([{ name: "", pct: 0 }]).map((e) => e.path), ["stages.0.name", "stages.0.pct"]);
  assert.deepEqual(C.validateStages([{ name: "A", pct: 50 }, { name: "B", pct: 40 }]).map((e) => e.code), ["STAGES_SUM"]);
  assert.deepEqual(C.validateStages([{ name: "A", pct: 33.33 }, { name: "B", pct: 33.33 }, { name: "C", pct: 33.34 }]), []);
  assert.deepEqual(C.stageValues(100, [{ pct: 33.33 }, { pct: 33.33 }, { pct: 33.34 }]), [33, 33, 34]);
  assert.deepEqual(C.stageValues(101, [{ pct: 50 }, { pct: 50 }]), [51, 50]);
  const st = [{ name: "Demolição", pct: 30 }, { name: "Alvenaria", pct: 70 }];
  const m1 = C.measurement(100000, st, [0, 0], [100, 50], { retentionPct: 5 });
  assert.deepEqual([m1.grossCents, m1.retentionCents, m1.netCents], [65000, 3250, 61750]);
  const m2 = C.measurement(100000, st, [100, 50], [100, 100], { retentionPct: 5 });
  assert.deepEqual(m2.lines.map((l) => l.amountCents), [0, 35000], "só a diferença do progresso");
  assert.deepEqual(C.measurement(100000, st, [100, 50], [100, 40]).errors.map((e) => [e.code, e.path]), [["PROGRESS_BACKWARDS", "progress.1"]]);
  assert.deepEqual(C.measurement(100000, st, [0, 0], [101, 0]).errors.map((e) => e.code), ["PROGRESS_INVALID"]);
  assert.equal(C.measurement(100000, st, null, [10]).lines[1].amountCents, 0, "etapa sem progresso fica onde estava");
  assert.deepEqual(C.measurement(100000, st, [50, 20], [60]).lines.map((l) => [l.now, l.amountCents]), [[60, 3000], [20, 0]], "etapa sem medição nova fica no progresso anterior");
  assert.equal(C.measurement(99999, [{ name: "A", pct: 100 }], [33.3], [66.6]).grossCents, 33299, "arredonda o acumulado (66.599 − 33.300), não a diferença");
  assert.equal(C.measurement(1000, st, [0, 0], [50, 50]).retentionCents, 0);
  assert.equal(C.measurement(1010, [{ name: "A", pct: 100 }], [0], [100], { retentionPct: 5 }).retentionCents, 51, "retenção arredonda (50,5 → 51)");
});

test("escola: anuidade com irmão e bolsa, material na 1ª, pontualidade até o vencimento", () => {
  assert.throws(() => C.tuitionPlan({ annualCents: 1, installments: 13, firstDue: "2027-01-10" }));
  assert.throws(() => C.tuitionPlan({ annualCents: 1, installments: 0, firstDue: "2027-01-10" }));
  const p = C.tuitionPlan({ annualCents: 1200000, installments: 12, firstDue: "2027-01-31", siblingPct: 10, punctualityPct: 5, materialCents: 30000, enrollmentFeeCents: 50000 });
  assert.equal(p.schedule.length, 12);
  assert.deepEqual(p.schedule[0], { number: 1, dueDate: "2027-01-31", grossCents: 130000, discountCents: 10000, amountCents: 120000, onTimeCents: 115500 }, "pontualidade não vale sobre o material");
  assert.deepEqual(p.schedule[1], { number: 2, dueDate: "2027-02-28", grossCents: 100000, discountCents: 10000, amountCents: 90000, onTimeCents: 85500 });
  assert.equal(p.schedule[11].dueDate, "2027-12-31");
  assert.equal(p.totalCents, 50000 + 1080000 + 30000);
  assert.equal(p.enrollmentCents, 50000);
  const q = C.tuitionPlan({ annualCents: 1000001, installments: 3, firstDue: "2027-02-10", siblingPct: 60, scholarshipPct: 50 });
  assert.deepEqual(q.schedule.map((x) => x.amountCents), [0, 0, 0], "descontos somados com teto de 100%");
  const r = C.tuitionPlan({ annualCents: 1000, installments: 3, firstDue: "2027-02-10" });
  assert.deepEqual(r.schedule.map((x) => [x.grossCents, x.amountCents]), [[334, 334], [333, 333], [333, 333]]);
  const s = C.tuitionPlan({ annualCents: 1000, installments: 3, firstDue: "2027-02-10", scholarshipPct: 50 });
  assert.deepEqual(s.schedule.map((x) => x.amountCents), [168, 166, 166]);
  assert.equal(C.tuitionDue(p.schedule[1], "2027-02-28"), 85500, "no dia ainda vale");
  assert.equal(C.tuitionDue(p.schedule[1], "2027-03-01"), 90000);
});

test("perfis do Comercial", () => {
  assert.deepEqual(Object.keys(C.COM_SEGMENTS), ["GENERAL", "RENTAL", "CONSTRUCTION", "SCHOOL"]);
  assert.equal(C.comSegment("SCHOOL").words.customer, "responsável");
  assert.ok(C.comSegment("CONSTRUCTION").on.includes("measurements"));
  assert.ok(C.comSegment("RENTAL").on.includes("rentals"));
  assert.equal(C.comSegment("X").id, "GENERAL");
});
