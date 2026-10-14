// node --test fiscal-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as F from "./fiscal-lib.mjs";

const CNPJ = "11222333000181", CPF = "52998224725";

test("CPF e CNPJ: dígitos verificadores, máscara e repetidos", () => {
  assert.equal(F.isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(F.isValidCnpj("11222333000182"), false, "2º DV errado");
  assert.equal(F.isValidCnpj("11222333000191"), false, "1º DV errado");
  assert.equal(F.isValidCnpj("11111111111111"), false, "repetido");
  assert.equal(F.isValidCnpj("00000000000000"), false, "zeros (DV bate, mas é repetido)");
  assert.equal(F.isValidCnpj("11222333010900"), true, "resto 1 → DV 0");
  assert.equal(F.isValidCnpj("1122233300018"), false, "13 dígitos");
  assert.equal(F.isValidCnpj("06990590000123"), true, "outro válido");
  assert.equal(F.isValidCpf("529.982.247-25"), true);
  assert.equal(F.isValidCpf("52998224726"), false);
  assert.equal(F.isValidCpf("52998224715"), false, "1º DV errado");
  assert.equal(F.isValidCpf("00000000000"), false);
  assert.equal(F.isValidCpf("5299822472"), false);
  assert.equal(F.isValidCpf("11144477735"), true, "outro válido");
  assert.equal(F.isValidCpf("10004751400"), true, "resto 10 → DV 0");
  assert.equal(F.onlyDigits(" 12.a-3 "), "123");
  assert.equal(F.onlyDigits(null), "");
});

test("chave de acesso: exemplo do manual, montagem e leitura", () => {
  // exemplo do Manual de Orientação do Contribuinte: DV 5
  assert.equal(F.mod11("5206043300991100250655012000000780026730161"), 5);
  assert.equal(F.mod11("00000000000000000000000000000000000000000000".slice(0, 43)), 0, "resto 0 → 0");
  assert.equal(F.mod11("1"), 9, "1×2=2 → 11−2");
  const k = F.accessKey({ uf: "PR", yearMonth: "2026-10", cnpj: "11.222.333/0001-81", model: 55, series: 1, number: 123, code: "12345678" });
  assert.equal(k, "41261011222333000181550010000001231123456780");
  const p = F.parseAccessKey(k);
  assert.deepEqual({ ...p }, { valid: true, uf: "PR", yearMonth: "2026-10", cnpj: CNPJ, model: 55, series: 1, number: 123, emissionType: 1, code: "12345678" });
  const c = F.accessKey({ uf: "SP", yearMonth: "2026-01", cnpj: CNPJ, model: 65, series: 2, number: 7, emissionType: 9, code: 42 });
  assert.equal(c.slice(0, 2), "35"); assert.equal(c.slice(20, 22), "65"); assert.equal(c[34], "9"); assert.equal(c.slice(35, 43), "00000042");
  assert.equal(F.parseAccessKey(c).emissionType, 9);
  const wrong = k.slice(0, 43) + ((Number(k[43]) + 1) % 10);
  assert.equal(F.parseAccessKey(wrong).valid, false, "DV errado");
  assert.deepEqual(F.parseAccessKey(k.slice(1)), { valid: false }, "43 dígitos");
  const badUf = "99" + k.slice(2, 43); assert.equal(F.parseAccessKey(badUf + F.mod11(badUf)).valid, false, "UF inexistente");
  assert.throws(() => F.accessKey({ uf: "XX", yearMonth: "2026-10", cnpj: CNPJ, model: 55, series: 1, number: 1, code: 1 }), /UF inválida/);
  assert.throws(() => F.accessKey({ uf: "PR", yearMonth: "2026-10", cnpj: CNPJ, model: 55, series: 1, number: 1234567890, code: 1 }), "número com 10 dígitos");
});

test("código numérico: 8 dígitos e nunca igual ao número da nota", () => {
  let i = 0; const seq = [0.00000123, 0.00000123, 0.5];
  assert.equal(F.numericCode(123, () => seq[i++]), "50000000", "pula o igual ao número");
  assert.equal(F.numericCode(1, () => 0.00000005), "00000005");
  assert.match(F.numericCode(99), /^\d{8}$/);
});

test("regras de imposto: a mais específica vence e o NCM conta pelo tamanho", () => {
  const rules = [
    { id: "geral", when: { operation: "SALE" }, set: { cfop: "5102" } },
    { id: "interna", when: { operation: "SALE", destination: "INTERNAL" }, set: { cfop: "5102" } },
    { id: "bebida", when: { operation: "SALE", destination: "INTERNAL", ncmPrefix: "2202" }, set: { cfop: "5405" } },
    { id: "agua", when: { operation: "SALE", destination: "INTERNAL", ncmPrefix: "220210" }, set: { cfop: "5405" } },
    { id: "consumidor", when: { operation: "SALE", destination: "INTERNAL", consumerFinal: true, regime: "SIMPLES" }, set: { cfop: "5102" } },
  ];
  const ctx = { operation: "SALE", destination: "INTERNAL", consumerFinal: false, regime: "SIMPLES", ncm: "22021000" };
  assert.equal(F.pickTaxRule(ctx, rules).id, "agua");
  assert.equal(F.pickTaxRule(ctx), null, "sem regras");
  assert.equal(F.pickTaxRule({ ...ctx, ncm: "22029900" }, rules).id, "bebida");
  assert.equal(F.pickTaxRule({ ...ctx, ncm: "61091000" }, rules).id, "interna");
  assert.equal(F.pickTaxRule({ ...ctx, ncm: "61091000", consumerFinal: true }, rules).id, "consumidor", "duas condições a mais (2) > interna");
  assert.equal(F.pickTaxRule({ ...ctx, destination: "INTERSTATE" }, rules).id, "geral");
  assert.equal(F.pickTaxRule({ ...ctx, operation: "RETURN" }, rules), null);
  assert.equal(F.pickTaxRule(ctx, [{ id: "a", when: {} }, { id: "b", when: {} }]).id, "a", "empate: a primeira");
  assert.equal(F.pickTaxRule(ctx, [{ id: "a" }]).id, "a", "sem when vale para tudo");
});

test("regras padrão do Simples e CFOP × destino", () => {
  const R = F.defaultSimplesRules();
  const pick = (destination, operation = "SALE") => F.pickTaxRule({ operation, destination }, R)?.set;
  assert.equal(pick("INTERNAL").cfop, "5102"); assert.equal(pick("INTERNAL").csosn, "102");
  assert.equal(pick("INTERSTATE").cfop, "6102");
  assert.equal(pick("EXPORT").cfop, "7102"); assert.equal(pick("EXPORT").csosn, "300");
  assert.equal(pick("INTERNAL", "RETURN").cfop, "1202");
  assert.equal(pick("INTERNAL").pisCst, "49"); assert.equal(pick("INTERNAL").cofinsRate, 0);
  assert.equal(F.destinationOf("PR", "PR"), "INTERNAL");
  assert.equal(F.destinationOf("PR", undefined), "INTERNAL", "consumidor sem UF");
  assert.equal(F.destinationOf("PR", "SP"), "INTERSTATE");
  assert.equal(F.destinationOf("PR", "PR", true), "EXPORT");
  assert.equal(F.cfopMatches("5102", "INTERNAL"), true);
  assert.equal(F.cfopMatches("6102", "INTERNAL"), false);
  assert.equal(F.cfopMatches("6102", "INTERSTATE"), true);
  assert.equal(F.cfopMatches("7102", "EXPORT"), true);
  assert.equal(F.cfopMatches("1202", "INTERNAL", "IN"), true);
  assert.equal(F.cfopMatches("2202", "INTERNAL", "IN"), false);
  assert.equal(F.cfopMatches("510", "INTERNAL"), false, "3 dígitos");
  assert.equal(F.cfopMatches("51022", "INTERNAL"), false);
});

test("impostos do item: Simples, normal com redução, IPI, PIS/COFINS", () => {
  const it = { qty: 3, unitCents: 1000, discountCents: 500, freightCents: 200, otherCents: 100 };
  const sn = F.itemTaxes(it, { csosn: "102" });
  assert.deepEqual(sn, { grossCents: 3000, baseCents: 2800, icmsBaseCents: 0, icmsCents: 0, icmsCreditCents: 0, ipiCents: 0, pisCents: 0, cofinsCents: 0, ibsCbsBaseCents: 0, cbsCents: 0, ibsUfCents: 0, ibsMunCents: 0 });
  assert.equal(F.itemTaxes(it, { csosn: "101", icmsCreditRate: 2.5 }).icmsCreditCents, 70);
  assert.equal(F.itemTaxes(it, { csosn: "201", icmsCreditRate: 2.5 }).icmsCreditCents, 70);
  assert.equal(F.itemTaxes(it, { csosn: "102", icmsCreditRate: 2.5 }).icmsCreditCents, 0, "102 sem crédito");
  const n = F.itemTaxes(it, { cst: "00", icmsRate: 18, ipiRate: 10, pisRate: 1.65, cofinsRate: 7.6 });
  assert.equal(n.icmsBaseCents, 2800); assert.equal(n.icmsCents, 504);
  assert.equal(n.ipiCents, 300, "IPI sobre o bruto");
  assert.equal(n.pisCents, 46); assert.equal(n.cofinsCents, 213);
  const r = F.itemTaxes(it, { cst: "20", icmsRate: 18, icmsReductionPct: 33.33 });
  assert.equal(r.icmsBaseCents, 1867); assert.equal(r.icmsCents, 336);
  assert.equal(F.itemTaxes(it, { cst: "00", icmsRate: 18, icmsReductionPct: 50 }).icmsBaseCents, 2800, "redução só no 20");
  assert.equal(F.itemTaxes(it, { cst: "40", icmsRate: 18 }).icmsCents, 0, "isenta");
  assert.equal(F.itemTaxes({ qty: 0.333, unitCents: 1000 }, { csosn: "102" }).grossCents, 333);
  assert.equal(F.itemTaxes({ qty: 1.5, unitCents: 1 }, { csosn: "102" }).grossCents, 2, "meio centavo arredonda para cima");
});

test("IBS/CBS (reforma tributária): cronograma, cálculo e totais à parte do vNF", () => {
  assert.equal(F.ibsCbsRequired("NORMAL", "2026-08-02"), false);
  assert.equal(F.ibsCbsRequired("NORMAL", "2026-08-03T10:00:00-03:00"), true);
  assert.equal(F.ibsCbsRequired("SIMPLES", "2026-12-31"), false);
  assert.equal(F.ibsCbsRequired("SIMPLES", "2027-01-01"), true);
  assert.equal(F.ibsCbsRequired("SIMPLES_EXCESSO", "2027-01-01"), true);
  assert.equal(F.ibsCbsRequired("MEI?", "2030-01-01"), false, "regime desconhecido");
  assert.deepEqual(F.IBS_CBS_2026, { cst: "000", cClassTrib: "000001", cbsRate: 0.9, ibsUfRate: 0.1, ibsMunRate: 0 });
  const tx = F.itemTaxes({ qty: 1, unitCents: 10000, discountCents: 1000, freightCents: 500 }, { cst: "00", icmsRate: 18, ibsCbs: { ...F.IBS_CBS_2026, ibsMunRate: 0.05 } });
  assert.equal(tx.ibsCbsBaseCents, 9500); assert.equal(tx.cbsCents, 86); assert.equal(tx.ibsUfCents, 10); assert.equal(tx.ibsMunCents, 5);
  const ln = { ...tx, discountCents: 1000, freightCents: 500 };
  const t = F.documentTotals([ln, ln]);
  assert.equal(t.cbsCents, 172); assert.equal(t.ibsUfCents, 20); assert.equal(t.ibsMunCents, 10); assert.equal(t.ibsCbsBaseCents, 19000);
  assert.equal(t.totalCents, 19000, "não soma no vNF");
  assert.equal(F.documentTotals([{ ...F.itemTaxes({ qty: 1, unitCents: 100 }, { csosn: "102" }), cbsCents: undefined }]).cbsCents, 0);
});

test("rateio e totais da nota", () => {
  assert.deepEqual(F.allocate(100, [1, 1, 1]), [33, 33, 34]);
  assert.deepEqual(F.allocate(1000, [3000, 1000]), [750, 250]);
  assert.deepEqual(F.allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(F.allocate(10, [0, 0]), [0, 0]);
  assert.equal(F.allocate(997, [7, 13, 29]).reduce((a, b) => a + b, 0), 997);
  const l1 = { ...F.itemTaxes({ qty: 2, unitCents: 1500, discountCents: 300, freightCents: 100 }, { cst: "00", icmsRate: 12, ipiRate: 5 }), discountCents: 300, freightCents: 100 };
  const l2 = { ...F.itemTaxes({ qty: 1, unitCents: 1000, otherCents: 50 }, { cst: "00", icmsRate: 12 }), otherCents: 50 };
  const t = F.documentTotals([l1, l2]);
  assert.equal(t.productsCents, 4000); assert.equal(t.discountCents, 300); assert.equal(t.freightCents, 100); assert.equal(t.otherCents, 50);
  assert.equal(t.ipiCents, 150);
  assert.equal(t.icmsBaseCents, 2800 + 1050); assert.equal(t.icmsCents, 336 + 126);
  assert.equal(t.totalCents, 4000 - 300 + 100 + 50 + 150);
  assert.equal(F.documentTotals([]).totalCents, 0);
  const p = F.documentTotals([{ ...F.itemTaxes({ qty: 1, unitCents: 1000 }, { cst: "00", pisRate: 1, cofinsRate: 3 }) }]);
  assert.equal(p.pisCents, 10); assert.equal(p.cofinsCents, 30);
});

const nfe = (over = {}) => ({
  model: 55, issuer: { cnpj: CNPJ, ie: "1234567890", uf: "PR", regime: "SIMPLES" },
  recipient: { document: CPF, name: "Ana", uf: "PR" },
  items: [{ description: "Camiseta", ncm: "61091000", cfop: "5102", unit: "UN", qty: 1, unitCents: 5000 }],
  payments: [{ method: "PIX", amountCents: 5000 }], totalCents: 5000, ...over,
});
const codes = (d, o) => F.validateDocument(d, o).map((e) => e.code);

test("validação: emitente, destinatário e itens da NF-e", () => {
  assert.deepEqual(codes(nfe()), []);
  assert.deepEqual(codes(nfe({ model: 59 })), ["MODEL_INVALID"]);
  assert.ok(codes(nfe({ issuer: { ...nfe().issuer, cnpj: "11222333000182" } })).includes("CNPJ_INVALID"));
  assert.ok(codes(nfe({ issuer: { ...nfe().issuer, uf: "XX" } })).includes("UF_INVALID"));
  assert.deepEqual(codes(nfe({ issuer: { ...nfe().issuer, ie: " " } })), ["IE_REQUIRED"]);
  assert.deepEqual(codes(nfe({ recipient: { name: "Ana", uf: "PR" } })), ["RECIPIENT_REQUIRED"]);
  assert.deepEqual(codes(nfe({ recipient: { document: "123", name: "Ana", uf: "PR" } })), ["RECIPIENT_REQUIRED"]);
  assert.deepEqual(codes(nfe({ recipient: { document: CNPJ, name: "", uf: "PR" } })), ["RECIPIENT_REQUIRED"]);
  assert.deepEqual(codes(nfe({ recipient: { document: CNPJ, name: "Empresa" } })), ["RECIPIENT_UF_REQUIRED"], "NF-e precisa do endereço do destinatário");
  assert.deepEqual(codes(nfe({ recipient: { document: CNPJ, name: "Empresa", uf: "ZZ" } })), ["RECIPIENT_UF_REQUIRED", "CFOP_MISMATCH"]);
  assert.deepEqual(codes(nfe({ recipient: { foreign: true, name: "John" }, items: [{ ...nfe().items[0], cfop: "7102" }] })), [], "estrangeiro sem documento, exportação");
  assert.deepEqual(codes(nfe({ recipient: { document: CPF, name: "Ana", uf: "SP" } })), ["CFOP_MISMATCH"], "5102 para outro estado");
  assert.deepEqual(codes(nfe({ recipient: { document: CPF, name: "Ana", uf: "SP" }, items: [{ ...nfe().items[0], cfop: "6102" }] })), []);
  assert.deepEqual(codes(nfe({ items: [] })), ["ITEMS_REQUIRED"]);
  assert.deepEqual(codes(nfe({ items: undefined })), ["ITEMS_REQUIRED"]);
  const it = (o) => codes(nfe({ items: [{ ...nfe().items[0], ...o }] }));
  assert.deepEqual(it({ description: " " }), ["DESCRIPTION_REQUIRED"]);
  assert.deepEqual(it({ ncm: "6109100" }), ["NCM_INVALID"]);
  assert.deepEqual(it({ ncm: "6109100a" }), ["NCM_INVALID"]);
  assert.deepEqual(it({ ncm: "610910001" }), ["NCM_INVALID"], "9 dígitos");
  assert.deepEqual(it({ qty: 0 }), ["QTY_INVALID"]);
  assert.deepEqual(it({ qty: 1.23456 }), ["QTY_INVALID"]);
  assert.deepEqual(it({ qty: 1.00001 }), ["QTY_INVALID"], "5 casas");
  assert.deepEqual(it({ qty: 1.2345 }), []);
  assert.deepEqual(it({ unitCents: 10.5 }), ["PRICE_INVALID"]);
  assert.deepEqual(it({ unitCents: -1 }), ["PRICE_INVALID"]);
  assert.deepEqual(it({ unitCents: 0 }), [], "brinde");
  assert.deepEqual(it({ unit: "" }), ["UNIT_REQUIRED"]);
  assert.deepEqual(it({ cfop: "1202", direction: "IN" }), [], "entrada interna");
  assert.deepEqual(codes(nfe({ payments: [] })), [], "NF-e não exige pagamento somado");
  assert.equal(F.validateDocument(nfe({ items: [nfe().items[0], { ...nfe().items[0], ncm: "1" }] }))[0].path, "items.1.ncm");
  const req = { requireIbsCbs: true };
  assert.deepEqual(codes(nfe(), req), ["IBSCBS_REQUIRED"]);
  assert.deepEqual(codes(nfe({ items: [{ ...nfe().items[0], ibsCbs: F.IBS_CBS_2026 }] }), req), []);
  assert.deepEqual(codes(nfe({ items: [{ ...nfe().items[0], ibsCbs: { cst: "00", cClassTrib: "000001" } }] }), req), ["IBSCBS_REQUIRED"], "CST com 3 dígitos");
  assert.deepEqual(codes(nfe({ items: [{ ...nfe().items[0], ibsCbs: { cst: "000", cClassTrib: "00001" } }] }), req), ["IBSCBS_REQUIRED"], "cClassTrib com 6 dígitos");
  assert.equal(F.validateDocument(nfe(), req)[0].path, "items.0.ibsCbs");
});

test("validação: NFC-e — presencial no estado, CFOP 5xxx, identificação acima do limite e pagamento", () => {
  const nfce = (o = {}) => nfe({ model: 65, recipient: undefined, ...o });
  assert.deepEqual(codes(nfce()), []);
  assert.deepEqual(codes(nfce({ totalCents: 1_000_000, payments: [{ method: "CASH", amountCents: 1_000_000 }] })), [], "no limite não exige");
  assert.deepEqual(codes(nfce({ totalCents: 1_000_001, payments: [{ method: "CASH", amountCents: 1_000_001 }] })), ["RECIPIENT_REQUIRED"]);
  assert.deepEqual(codes(nfce({ totalCents: 30_000, payments: [{ method: "CASH", amountCents: 30_000 }] }), { nfceIdentifyAboveCents: 20_000 }), ["RECIPIENT_REQUIRED"], "limite da UF configurável");
  assert.deepEqual(codes(nfce({ recipient: { document: "123" } })), ["DOCUMENT_INVALID"]);
  assert.deepEqual(codes(nfce({ recipient: { document: CPF } })), [], "CPF na nota");
  assert.deepEqual(codes(nfce({ recipient: { document: CPF, uf: "SP" } })), ["NFCE_INTERSTATE", "CFOP_MISMATCH", ], "outro estado");
  assert.deepEqual(codes(nfce({ items: [{ ...nfe().items[0], cfop: "6102" }] })), ["CFOP_MISMATCH", "NFCE_CFOP"]);
  assert.deepEqual(codes(nfce({ payments: [{ method: "CASH", amountCents: 4999 }] })), ["UNDERPAID"]);
  assert.deepEqual(codes(nfce({ payments: [{ method: "CASH", amountCents: 3000 }, { method: "PIX", amountCents: 2000 }] })), []);
  assert.deepEqual(codes(nfce({ payments: [{ method: "CASH", amountCents: 10000 }] })), [], "troco");
});

test("status: fluxo e cancelamento com prazo e justificativa", () => {
  assert.equal(F.canTransition("DRAFT", "PROCESSING"), true);
  assert.equal(F.canTransition("DRAFT", "AUTHORIZED"), false);
  assert.equal(F.canTransition("REJECTED", "PROCESSING"), true);
  assert.equal(F.canTransition("CONTINGENCY", "PROCESSING"), true);
  assert.equal(F.canTransition("AUTHORIZED", "CANCELED"), true);
  assert.equal(F.canTransition("CANCELED", "AUTHORIZED"), false);
  assert.equal(F.canTransition("DENIED", "PROCESSING"), false);
  assert.equal(F.canTransition("AUTHORIZED", "PROCESSING"), false);
  assert.equal(F.canTransition("NOPE", "PROCESSING"), false);
  const now = Date.parse("2026-10-14T12:00:00Z"), J = "Cliente desistiu da compra";
  const c = (o) => F.cancelCheck({ status: "AUTHORIZED", model: 55, authorizedAt: "2026-10-14T00:00:00Z", justification: J, now, ...o });
  assert.deepEqual(c({}), { ok: true });
  assert.equal(c({ status: "REJECTED" }).code, "INVALID_STATUS");
  assert.equal(c({ justification: "curta demais" }).code, "JUSTIFICATION_INVALID");
  assert.equal(c({ justification: "  " + "x".repeat(14) + "  " }).code, "JUSTIFICATION_INVALID", "espaços não contam");
  assert.equal(c({ justification: "x".repeat(15) }).ok, true);
  assert.equal(c({ justification: "x".repeat(255) }).ok, true);
  assert.equal(c({ justification: "x".repeat(256) }).code, "JUSTIFICATION_INVALID");
  assert.equal(c({ authorizedAt: "2026-10-13T12:00:00Z" }).ok, true, "exatamente 24 h");
  assert.equal(c({ authorizedAt: "2026-10-13T11:59:59Z" }).code, "CANCEL_WINDOW_EXPIRED");
  assert.equal(c({ model: 65, authorizedAt: "2026-10-14T11:30:00Z" }).ok, true, "NFC-e 30 min");
  assert.equal(c({ model: 65, authorizedAt: "2026-10-14T11:29:00Z" }).code, "CANCEL_WINDOW_EXPIRED");
  assert.equal(c({ model: 65, authorizedAt: "2026-10-14T11:00:00Z", windowMinutes: 60 }).ok, true, "prazo da UF");
  assert.equal(c({ windowMinutes: 0, authorizedAt: "2026-10-14T11:59:00Z" }).code, "CANCEL_WINDOW_EXPIRED");
});

test("carta de correção, inutilização e próximo número", () => {
  const cc = (o) => F.correctionCheck({ status: "AUTHORIZED", model: 55, text: "Corrige o endereço de entrega", ...o });
  assert.deepEqual(cc({}), { ok: true, sequence: 1 });
  assert.deepEqual(cc({ previousCount: 3 }), { ok: true, sequence: 4 });
  assert.equal(cc({ previousCount: 19 }).sequence, 20);
  assert.equal(cc({ previousCount: 20 }).code, "TOO_MANY_CORRECTIONS");
  assert.equal(cc({ model: 65 }).code, "NFE_ONLY");
  assert.equal(cc({ status: "CANCELED" }).code, "INVALID_STATUS");
  assert.equal(cc({ text: "x".repeat(14) }).code, "TEXT_INVALID");
  assert.equal(cc({ text: "x".repeat(1000) }).ok, true);
  assert.equal(cc({ text: "x".repeat(1001) }).code, "TEXT_INVALID");
  const J = "Números pulados por falha no sistema";
  assert.deepEqual(F.voidCheck({ from: 10, to: 12, used: [9, 13], justification: J }), { ok: true });
  assert.deepEqual(F.voidCheck({ from: 10, to: 12, used: [9, 11, 12], justification: J }), { ok: false, code: "NUMBERS_IN_USE", numbers: [11, 12] });
  assert.equal(F.voidCheck({ from: 10, to: 10, used: [10], justification: J }).code, "NUMBERS_IN_USE");
  assert.equal(F.voidCheck({ from: 12, to: 10, justification: J }).code, "RANGE_INVALID");
  assert.equal(F.voidCheck({ from: 0, to: 10, justification: J }).code, "RANGE_INVALID");
  assert.equal(F.voidCheck({ from: 1.5, to: 10, justification: J }).code, "RANGE_INVALID");
  assert.equal(F.voidCheck({ from: 1, to: 1_000_000_000, justification: J }).code, "RANGE_INVALID");
  assert.equal(F.voidCheck({ from: 1, to: 999_999_999, justification: J }).ok, true);
  assert.equal(F.voidCheck({ from: 10, to: 10, justification: J }).ok, true, "um número só");
  assert.equal(F.voidCheck({ from: 10, to: 12, justification: "curta" }).code, "JUSTIFICATION_INVALID");
  assert.equal(F.nextNumber(5), 5);
  assert.equal(F.nextNumber(5, [{ from: 5, to: 7 }]), 8);
  assert.equal(F.nextNumber(5, [{ from: 8, to: 9 }, { from: 5, to: 7 }]), 10, "faixas encadeadas fora de ordem");
  assert.equal(F.nextNumber(4, [{ from: 5, to: 7 }]), 4);
  assert.equal(F.nextNumber(7, [{ from: 5, to: 7 }]), 8, "fim da faixa");
});

test("retorno da SEFAZ e QR Code da NFC-e", () => {
  assert.equal(F.sefazResult(100).status, "AUTHORIZED");
  assert.equal(F.sefazResult(150).status, "AUTHORIZED");
  assert.equal(F.sefazResult(110).status, "DENIED");
  assert.equal(F.sefazResult(301).status, "DENIED");
  assert.equal(F.sefazResult(778).status, "REJECTED"); assert.match(F.sefazResult(778).message, /NCM/);
  assert.equal(F.sefazResult(108).status, "UNAVAILABLE");
  assert.equal(F.sefazResult(999).status, "REJECTED"); assert.match(F.sefazResult(999).message, /999/);
  const key = "41261011222333000181650010000001231123456785";
  const url = F.nfceQrCodeUrl({ baseUrl: "https://www.fazenda.pr.gov.br/nfce/qrcode", key, environment: 2, cscId: "000001", csc: "SEGREDO" });
  const hash = createHash("sha1").update(`${key}|2|2|1SEGREDO`).digest("hex").toUpperCase();
  assert.equal(url, `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${key}|2|2|1|${hash}`);
  assert.match(url, /\|[0-9A-F]{40}$/);
  assert.notEqual(F.nfceQrCodeUrl({ baseUrl: "u", key, environment: 2, cscId: "1", csc: "OUTRO" }), F.nfceQrCodeUrl({ baseUrl: "u", key, environment: 2, cscId: "1", csc: "SEGREDO" }), "o CSC entra no hash");
});

test("XML: grupos principais, escape, destinatário, troco e totais", () => {
  const key = F.accessKey({ uf: "PR", yearMonth: "2026-10", cnpj: CNPJ, model: 55, series: 1, number: 9, code: "87654321" });
  const line = { ...F.itemTaxes({ qty: 2, unitCents: 1250, discountCents: 100 }, { csosn: "102" }), discountCents: 100, description: "Café & Leite <1kg>", ncm: "09012100", cfop: "5102", unit: "UN", qty: 2, unitCents: 1250, csosn: "102", code: "CAF1" };
  const totals = F.documentTotals([line]);
  const doc = { key, model: 55, series: 1, number: 9, issuedAt: "2026-10-14T10:00:00-03:00", environment: 2, issuer: { cnpj: CNPJ, name: "Loja", ie: "123", uf: "PR", regime: "SIMPLES", cityCode: "4115200" }, recipient: { document: CPF, name: "Ana", uf: "SP" }, lines: [line], totals, payments: [{ method: "PIX", amountCents: 3000 }], additionalInfo: "Obrigado" };
  const xml = F.buildXml(doc);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?><NFe xmlns="http:\/\/www.portalfiscal.inf.br\/nfe"><infNFe versao="4.00" Id="NFe\d{44}">/);
  assert.ok(xml.includes(`Id="NFe${key}"`));
  for (const t of ["<cUF>41</cUF>", "<cNF>87654321</cNF>", "<mod>55</mod>", "<serie>1</serie>", "<nNF>9</nNF>", `<cDV>${key.slice(-1)}</cDV>`, "<tpAmb>2</tpAmb>", "<idDest>2</idDest>", "<tpImp>1</tpImp>", "<indFinal>0</indFinal>", "<CRT>1</CRT>", `<CPF>${CPF}</CPF>`, "<xProd>Café &amp; Leite &lt;1kg&gt;</xProd>", "<qCom>2.0000</qCom>", "<vUnCom>12.50</vUnCom>", "<vProd>25.00</vProd>", "<vDesc>1.00</vDesc>", "<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>", "<vNF>24.00</vNF>", "<tPag>17</tPag>", "<vTroco>6.00</vTroco>", "<infCpl>Obrigado</infCpl>", "<cProd>CAF1</cProd>", "<cEAN>SEM GTIN</cEAN>"]) assert.ok(xml.includes(t), t);
  assert.ok(!xml.slice(xml.indexOf("<prod>"), xml.indexOf("</prod>")).includes("vFrete"), "sem frete no item");
  const noDisc = F.buildXml({ ...doc, lines: [{ ...line, discountCents: 0 }] });
  assert.ok(!noDisc.slice(noDisc.indexOf("<prod>"), noDisc.indexOf("</prod>")).includes("vDesc"), "sem desconto no item");
  const withFreight = F.buildXml({ ...doc, lines: [{ ...line, freightCents: 500 }] });
  assert.ok(withFreight.slice(withFreight.indexOf("<prod>"), withFreight.indexOf("</prod>")).includes("<vFrete>5.00</vFrete>"), "frete no item");
  const cnpjDest = F.buildXml({ ...doc, recipient: { document: "06990590000123", name: "Empresa", uf: "PR" } });
  assert.ok(cnpjDest.includes("<CNPJ>06990590000123</CNPJ>")); assert.ok(cnpjDest.includes("<idDest>1</idDest>"));
  const nfce = F.buildXml({ ...doc, model: 65, recipient: undefined, payments: [{ method: "CASH", amountCents: 2400 }], additionalInfo: undefined });
  assert.ok(!nfce.includes("<dest>")); assert.ok(nfce.includes("<tpImp>4</tpImp>")); assert.ok(nfce.includes("<indPres>1</indPres>")); assert.ok(nfce.includes("<indFinal>1</indFinal>"));
  assert.ok(!nfce.includes("vTroco"), "pago exato"); assert.ok(!nfce.includes("infAdic")); assert.ok(nfce.includes("<tPag>01</tPag>"));
  const normal = F.buildXml({ ...doc, issuer: { ...doc.issuer, regime: "NORMAL" }, lines: [{ ...line, csosn: undefined, cst: "00", icmsRate: 18, icmsBaseCents: 2400, icmsCents: 432 }] });
  assert.ok(normal.includes("<ICMS00><orig>0</orig><CST>00</CST><vBC>24.00</vBC><pICMS>18.00</pICMS><vICMS>4.32</vICMS></ICMS00>"));
  assert.ok(normal.includes("<CRT>3</CRT>"));
  assert.ok(F.buildXml({ ...doc, emissionType: 9 }).includes("<tpEmis>9</tpEmis>"));
  assert.ok(!xml.includes("IBSCBS"), "sem IBS/CBS quando a regra não tem");
  assert.ok(!xml.includes("enderDest") && !xml.includes("enderEmit"), "sem endereço quando não veio");
  const addr = F.buildXml({ ...doc, issuer: { ...doc.issuer, address: { street: "Rua A", number: "10", district: "Centro", cityCode: "4115200", city: "Maringá", uf: "PR", zip: "87000-000" } }, recipient: { ...doc.recipient, address: { street: "Rua B", district: "Sé", cityCode: "3550308", city: "São Paulo", uf: "SP", zip: "01001-000", complement: "ap 1" } } });
  assert.ok(addr.includes("<xNome>Loja</xNome><enderEmit><xLgr>Rua A</xLgr><nro>10</nro><xBairro>Centro</xBairro><cMun>4115200</cMun><xMun>Maringá</xMun><UF>PR</UF><CEP>87000000</CEP></enderEmit><IE>123</IE>"), addr);
  assert.ok(addr.includes("<enderDest><xLgr>Rua B</xLgr><nro>S/N</nro><xCpl>ap 1</xCpl><xBairro>Sé</xBairro>"));
  const ibLine = { ...line, ...F.itemTaxes({ qty: 2, unitCents: 1250, discountCents: 100 }, { csosn: "102", ibsCbs: F.IBS_CBS_2026 }), ibsCbs: F.IBS_CBS_2026 };
  const ibx = F.buildXml({ ...doc, lines: [ibLine], totals: F.documentTotals([ibLine]) });
  assert.ok(ibx.includes("</COFINS><IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>24.00</vBC><gIBSUF><pIBSUF>0.1000</pIBSUF><vIBSUF>0.02</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.0000</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>0.02</vIBS><gCBS><pCBS>0.9000</pCBS><vCBS>0.22</vCBS></gCBS></gIBSCBS></IBSCBS></imposto>"), ibx);
  const mun = { ...F.IBS_CBS_2026, ibsMunRate: 1 };
  const munLine = { ...line, ...F.itemTaxes({ qty: 2, unitCents: 1250, discountCents: 100 }, { csosn: "102", ibsCbs: mun }), ibsCbs: mun };
  const mx = F.buildXml({ ...doc, lines: [munLine], totals: F.documentTotals([munLine]) });
  assert.ok(mx.slice(mx.indexOf("<det "), mx.indexOf("</det>")).includes("<vIBSMun>0.24</vIBSMun></gIBSMun><vIBS>0.26</vIBS>"), "vIBS do item = estadual + municipal");
  assert.ok(ibx.includes("</ICMSTot><IBSCBSTot><vBCIBSCBS>24.00</vBCIBSCBS><gIBS><gIBSUF><vIBSUF>0.02</vIBSUF></gIBSUF><gIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>0.02</vIBS></gIBS><gCBS><vCBS>0.22</vCBS></gCBS></IBSCBSTot></total>"));
});

test("contrato do driver", () => {
  const fn = () => {};
  assert.deepEqual(F.validateDriver({ id: "fake", authorize: fn, status: fn, cancel: fn, capabilities: { nfe: true, nfce: true } }), []);
  assert.ok(F.validateDriver({ id: "Fake", authorize: fn, status: fn, cancel: fn }).includes("id inválido"));
  assert.ok(F.validateDriver({ id: "f", authorize: fn, status: fn, cancel: fn }).includes("id inválido"), "1 caractere");
  assert.deepEqual(F.validateDriver({ id: "focus", status: fn, cancel: fn }), ["falta o método authorize"]);
  assert.deepEqual(F.validateDriver({ id: "focus", authorize: fn, cancel: fn }), ["falta o método status"]);
  assert.deepEqual(F.validateDriver({ id: "focus", authorize: fn, status: fn }), ["falta o método cancel"]);
  assert.deepEqual(F.validateDriver({ id: "focus", authorize: fn, status: fn, cancel: fn, capabilities: { boleto: true } }), ["capacidade desconhecida: boleto"]);
  assert.deepEqual(F.validateDriver({ id: "focus", authorize: fn, status: fn, cancel: fn, capabilities: { correction: true } }), ["declara correction sem o método correct"]);
  assert.deepEqual(F.validateDriver({ id: "focus", authorize: fn, status: fn, cancel: fn, capabilities: { void: true } }), ["declara void sem o método voidRange"]);
  assert.deepEqual(F.validateDriver({ id: "sefaz-pr", authorize: fn, status: fn, cancel: fn, correct: fn, voidRange: fn, capabilities: { correction: true, void: true, contingency: true } }), []);
  assert.ok(F.validateDriver(null).length >= 4);
});
