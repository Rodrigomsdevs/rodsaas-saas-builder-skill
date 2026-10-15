// node --test erp-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./erp-lib.mjs";

const codes = (errs) => errs.map((e) => e.code);

test("código de barras: EAN-8/13/GTIN-14 com o dígito certo e código interno", () => {
  assert.equal(E.isValidGtin("7891000315507"), true);
  assert.equal(E.isValidGtin("7891000315508"), false, "dígito errado");
  assert.equal(E.isValidGtin("96385074"), true, "EAN-8");
  assert.equal(E.isValidGtin("17891000315504"), true, "GTIN-14");
  assert.equal(E.isValidGtin("789100031550"), false, "12 dígitos");
  assert.equal(E.isValidGtin("789100031550a"), false);
  assert.equal(E.gtinCheckDigit("789100031550"), 7);
  assert.equal(E.internalBarcode(15), "2000000000152");
  assert.equal(E.isValidGtin(E.internalBarcode(987654)), true);
  assert.throws(() => E.internalBarcode(0));
});

test("quantidade: até 3 casas, inteira para unidade inteira, sem erro de ponto flutuante", () => {
  assert.equal(E.isQty(1.5), true);
  assert.equal(E.isQty(1.2345), false);
  assert.equal(E.isQty(0), false);
  assert.equal(E.isQty(2, { fractional: false }), true);
  assert.equal(E.isQty(1.5, { fractional: false }), false);
  assert.equal(E.roundQty(0.1 + 0.2), 0.3);
});

test("produto: validação por tipo (simples, grade, kit) com os caminhos", () => {
  const ok = { type: "SIMPLE", name: "Caneta", unit: "UN", priceCents: 250, costCents: 100, sku: "CAN-01", barcode: "7891000315507" };
  assert.deepEqual(E.validateProduct(ok), []);
  assert.deepEqual(codes(E.validateProduct({ ...ok, sku: "can 01", barcode: "123", priceCents: 2.5, unit: "XX", name: " " })).sort(), ["BARCODE_INVALID", "NAME_REQUIRED", "PRICE_INVALID", "SKU_INVALID", "UNIT_INVALID"]);
  assert.deepEqual(codes(E.validateProduct({ ...ok, minStock: 10, maxStock: 5 })), ["MAX_BELOW_MIN"]);
  const v = { type: "VARIANT", name: "Camiseta", unit: "UN", priceCents: 4990, attributes: [{ name: "Cor", values: ["Azul", "Preto"] }, { name: "Tamanho", values: ["P", "M", "G"] }] };
  assert.deepEqual(E.validateProduct(v), []);
  assert.deepEqual(codes(E.validateProduct({ ...v, attributes: [{ name: "Cor", values: ["Azul", "azul"] }] })), ["ATTRIBUTE_DUPLICATE"]);
  assert.deepEqual(codes(E.validateProduct({ ...v, attributes: [] })), ["ATTRIBUTES_INVALID"]);
  assert.deepEqual(codes(E.validateProduct({ ...v, attributes: [{ name: "", values: [] }] })).sort(), ["ATTRIBUTE_NAME", "ATTRIBUTE_VALUES"]);
  const big = Array.from({ length: 15 }, (_, i) => `V${i}`);
  assert.deepEqual(codes(E.validateProduct({ ...v, attributes: [{ name: "A", values: big }, { name: "B", values: big }] })), ["TOO_MANY_VARIANTS"], "15 × 15 = 225");
  assert.deepEqual(E.validateProduct({ ...v, attributes: [{ name: "A", values: big.slice(0, 10) }, { name: "B", values: big.slice(0, 10) }, { name: "C", values: ["x", "y"] }] }), [], "10 × 10 × 2 = 200 ainda pode");
  const kit = { type: "KIT", name: "Kit escritório", unit: "UN", priceCents: 1990, components: [{ productId: "a", qty: 2 }, { productId: "b", qty: 0.5 }] };
  assert.deepEqual(E.validateProduct(kit, { selfId: "k" }), []);
  const bad = E.validateProduct({ ...kit, components: [{ productId: "k", qty: 1 }, { productId: "a", qty: 1 }, { productId: "a", qty: 0 }] }, { selfId: "k" });
  assert.deepEqual(bad.map((x) => [x.code, x.path]), [["KIT_SELF", "components.0.productId"], ["COMPONENT_DUPLICATE", "components.2.productId"], ["QTY_INVALID", "components.2.qty"]]);
  assert.deepEqual(codes(E.validateProduct({ ...kit, components: [] })), ["KIT_EMPTY"]);
});

test("grade: combinações, SKU das variações e mudança da grade sem perder histórico", () => {
  const at = [{ name: "Cor", values: ["Azul", "Preto"] }, { name: "Tamanho", values: ["P", "M"] }];
  const c = E.variantCombinations(at);
  assert.deepEqual(c.map((x) => x.label), ["Azul / P", "Azul / M", "Preto / P", "Preto / M"]);
  assert.deepEqual(c[0], { key: "azul|p", values: { Cor: "Azul", Tamanho: "P" }, label: "Azul / P", skuSuffix: "AZUL-P" });
  assert.equal(E.variantSku("CAMISETA", E.variantCombinations([{ name: "Cor", values: ["Verde-água"] }])[0]), "CAMISETA-VERDEA");
  const d = E.diffVariants(["azul|p", "azul|m", "preto|p", "preto|m"], [{ name: "Cor", values: ["Azul", "Branco"] }, { name: "Tamanho", values: ["P", "M"] }]);
  assert.deepEqual(d.create.map((x) => x.key), ["branco|p", "branco|m"]);
  assert.deepEqual(d.keep, ["azul|p", "azul|m"]);
  assert.deepEqual(d.archive, ["preto|p", "preto|m"]);
});

test("preços: tabela (% ou fixo), faixas por quantidade e o menor dos dois", () => {
  assert.deepEqual(E.validateTiers([{ minQty: 10, priceCents: 900 }, { minQty: 50, priceCents: 800 }]), []);
  assert.deepEqual(E.validateTiers([{ minQty: 1, priceCents: 900 }, { minQty: 50, priceCents: 0 }, { minQty: 50, priceCents: 700 }]).map((x) => [x.code, x.path]),
    [["TIER_QTY_INVALID", "tiers.0.minQty"], ["TIER_PRICE_INVALID", "tiers.1.priceCents"], ["TIER_ORDER", "tiers.2.minQty"]]);
  assert.equal(E.tablePrice(1000, { kind: "PERCENT", pct: -10 }), 900);
  assert.equal(E.tablePrice(999, { kind: "PERCENT", pct: -15 }), 849, "arredonda");
  assert.equal(E.tablePrice(999, { kind: "PERCENT", pct: 5 }), 1049, "1048,95 arredonda para cima");
  assert.equal(E.tablePrice(1000, { kind: "PERCENT", pct: -10 }, 850), 850, "preço fixo do produto na tabela vence");
  assert.equal(E.tablePrice(1000, null), 1000);
  const tiers = [{ minQty: 10, priceCents: 900 }, { minQty: 50, priceCents: 800 }];
  assert.deepEqual(E.unitPrice({ basePriceCents: 1000, tiers, qty: 9 }), { unitCents: 1000, source: "table", tier: null });
  assert.deepEqual(E.unitPrice({ basePriceCents: 1000, tiers, qty: 10 }).unitCents, 900);
  assert.deepEqual(E.unitPrice({ basePriceCents: 1000, tiers, qty: 49.5 }).unitCents, 900);
  assert.deepEqual(E.unitPrice({ basePriceCents: 1000, tiers, qty: 50 }), { unitCents: 800, source: "tier", tier: { minQty: 50, priceCents: 800 } });
  assert.equal(E.unitPrice({ basePriceCents: 1000, table: { kind: "PERCENT", pct: -15 }, tiers, qty: 10 }).unitCents, 850, "atacado mais barato que a faixa: vale o atacado");
  assert.equal(E.unitPrice({ basePriceCents: 1000, table: { kind: "PERCENT", pct: -15 }, tiers, qty: 60 }).unitCents, 800, "faixa mais barata que o atacado");
});

test("margem e markup", () => {
  assert.deepEqual(E.margin({ priceCents: 1500, costCents: 1000 }), { marginPct: 33.3, markupPct: 50, profitCents: 500 });
  assert.deepEqual(E.margin({ priceCents: 1500, costCents: null }), { marginPct: null, markupPct: null, profitCents: null });
  assert.equal(E.priceFromMarkup(1000, 50), 1500);
  assert.equal(E.priceFromMarkup(333, 33.3), 444);
});

test("estoque: saldos, disponível, saída sem negativo, custo médio ponderado", () => {
  const b = E.balances([{ productId: "a", warehouseId: "w1", qty: 10 }, { productId: "a", warehouseId: "w1", qty: -2.5 }, { productId: "a", warehouseId: "w2", qty: 4 }, { productId: "b", warehouseId: "w1", qty: 0.1 }, { productId: "b", warehouseId: "w1", qty: 0.2 }]);
  assert.deepEqual(b, { "a|w1": 7.5, "a|w2": 4, "b|w1": 0.3 });
  assert.equal(E.available({ onHand: 7.5, reserved: 3 }), 4.5);
  assert.deepEqual(E.canTakeOut({ availableQty: 4.5, qty: 5 }), { ok: false, code: "INSUFFICIENT_STOCK", missing: 0.5 });
  assert.deepEqual(E.canTakeOut({ availableQty: 4.5, qty: 4.5 }), { ok: true });
  assert.deepEqual(E.canTakeOut({ availableQty: 0, qty: 5, allowNegative: true }), { ok: true });
  assert.deepEqual(E.canTakeOut({ availableQty: 10, qty: -1 }), { ok: false, code: "QTY_INVALID" });
  assert.equal(E.averageCost({ qty: 10, avgCostCents: 1000 }, { inQty: 30, unitCostCents: 1200 }), 1150);
  assert.equal(E.averageCost({ qty: 3, avgCostCents: 1000 }, { inQty: 1, unitCostCents: 1001 }), 1000, "arredonda (1000,25)");
  assert.equal(E.averageCost({ qty: 0, avgCostCents: 1000 }, { inQty: 5, unitCostCents: 700 }), 700, "sem saldo: custo da entrada");
  assert.equal(E.averageCost({ qty: -2, avgCostCents: 1000 }, { inQty: 5, unitCostCents: 700 }), 700, "saldo negativo: custo da entrada");
});

test("kit: disponível pelo componente mais escasso, baixa por componente e custo", () => {
  const comps = [{ productId: "caneta", qty: 2 }, { productId: "caderno", qty: 1 }, { productId: "fita", qty: 0.5 }];
  const av = { caneta: 9, caderno: 10, fita: 3 };
  assert.equal(E.kitAvailable(comps, (id) => av[id]), 4, "9 canetas / 2 = 4");
  assert.equal(E.kitAvailable(comps, (id) => ({ ...av, fita: 1.5 })[id]), 3, "1,5 m / 0,5 = 3 (sem erro de ponto flutuante)");
  assert.equal(E.kitAvailable(comps, (id) => ({ ...av, caderno: -2 })[id]), 0, "nunca negativo");
  assert.equal(E.kitAvailable([], () => 5), 0);
  assert.equal(E.kitAvailable([{ productId: "x", qty: 0.1 }], () => 0.3), 3, "0,3 / 0,1 = 3, não 2,999…");
  assert.deepEqual(E.explodeKit(3, comps), [{ productId: "caneta", qty: 6 }, { productId: "caderno", qty: 3 }, { productId: "fita", qty: 1.5 }]);
  assert.equal(E.kitCost(comps, (id) => ({ caneta: 150, caderno: 800, fita: 333 })[id]), 1267, "300 + 800 + 166,5 → 1267");
});

test("inventário e sugestão de compra", () => {
  const bal = { "a|w": 10, "b|w": 5, "c|w": 0 };
  const adj = E.inventoryAdjustments([{ productId: "a", warehouseId: "w", counted: 10 }, { productId: "b", warehouseId: "w", counted: 3 }, { productId: "c", warehouseId: "w", counted: 2.5 }], (p, w) => bal[`${p}|${w}`] ?? 0);
  assert.deepEqual(adj.map((x) => [x.productId, x.expected, x.diff]), [["b", 5, -2], ["c", 0, 2.5]]);
  assert.equal(E.reorderSuggestion({ min: 10, max: 50, onHand: 8, reserved: 2, incoming: 0 }), 44);
  assert.equal(E.reorderSuggestion({ min: 10, max: 50, onHand: 8, reserved: 2, incoming: 1 }), 43, "conta o que já está pedido");
  assert.equal(E.reorderSuggestion({ min: 10, max: 50, onHand: 8, reserved: 2, incoming: 5 }), 0, "com o pedido chegando passa do mínimo");
  assert.equal(E.reorderSuggestion({ min: 10, onHand: 8 }), 2, "sem máximo: até o mínimo");
  assert.equal(E.reorderSuggestion({ min: 10, max: 50, onHand: 10 }), 0, "no mínimo não sugere");
  assert.equal(E.reorderSuggestion({ min: null, onHand: 0 }), 0);
});

test("pedido: totais com desconto por item e geral rateado, frete e validação", () => {
  const t = E.orderTotals([{ qty: 3, unitCents: 1000, discountPct: 10 }, { qty: 1.5, unitCents: 333, discountCents: 100 }, { qty: 1, unitCents: 1 }], { discountCents: 101, freightCents: 1500 });
  assert.deepEqual(t.lines.map((l) => [l.grossCents, l.discountCents]), [[3000, 300], [500, 100], [1, 0]]);
  assert.equal(t.globalDiscountCents, 101);
  assert.equal(t.lines.reduce((a, l) => a + l.globalDiscountCents, 0), 101, "rateio soma exato");
  assert.deepEqual(t.lines.map((l) => l.globalDiscountCents), [88, 13, 0]);
  assert.deepEqual([t.subtotalCents, t.itemDiscountCents, t.totalCents], [3501, 400, 3000 + 1500]);
  assert.equal(E.orderTotals([{ qty: 1, unitCents: 1000 }], { discountPct: 5 }).totalCents, 950);
  const capped = E.orderTotals([{ qty: 1, unitCents: 100, discountCents: 500 }]);
  assert.deepEqual([capped.lines[0].discountCents, capped.totalCents], [100, 0], "desconto nunca passa do bruto");
  assert.equal(E.orderTotals([{ qty: 1, unitCents: 100 }], { discountCents: 999 }).totalCents, 0);
  assert.deepEqual(E.allocate(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(E.allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(E.allocate(10, [1, 2]), [3, 7], "o centavo vai para o maior resto");
  assert.deepEqual(codes(E.validateLines([])), ["EMPTY_ORDER"]);
  assert.deepEqual(E.validateLines([{ productId: "a", qty: 1.5, fractional: false }, { productId: "", qty: 1, discountPct: 5, discountCents: 1 }, { productId: "b", qty: 1, unitCents: -1 }]).map((x) => [x.code, x.path]),
    [["QTY_INVALID", "items.0.qty"], ["PRODUCT_REQUIRED", "items.1.productId"], ["DISCOUNT_INVALID", "items.1.discountCents"], ["PRICE_INVALID", "items.2.unitCents"]]);
});

test("pedido: fluxo, orçamento vencido, limite de crédito, parcelas e devolução", () => {
  assert.equal(E.canTransition("QUOTE", "CONFIRMED"), true);
  assert.equal(E.canTransition("QUOTE", "DELIVERED"), false, "orçamento não entrega sem confirmar");
  assert.equal(E.canTransition("DELIVERED", "CANCELED"), false, "entregue não cancela (devolução)");
  assert.equal(E.canTransition("CANCELED", "CONFIRMED"), false);
  assert.equal(E.canTransition("PICKING", "CONFIRMED"), true);
  assert.equal(E.quoteStatus({ status: "QUOTE", validUntil: "2026-10-13" }, "2026-10-14"), "EXPIRED");
  assert.equal(E.quoteStatus({ status: "QUOTE", validUntil: "2026-10-14" }, "2026-10-14"), "QUOTE", "vence no fim do dia");
  assert.equal(E.quoteStatus({ status: "CONFIRMED", validUntil: "2026-01-01" }, "2026-10-14"), "CONFIRMED");
  assert.deepEqual(E.creditCheck({ limitCents: 100000, openCents: 70000, orderCents: 30001 }), { ok: false, availableCents: 30000 });
  assert.deepEqual(E.creditCheck({ limitCents: 100000, openCents: 70000, orderCents: 30000 }), { ok: true, availableCents: 30000 });
  assert.deepEqual(E.creditCheck({ limitCents: null, openCents: 1, orderCents: 1 }), { ok: true, availableCents: null });
  assert.deepEqual(E.installments(10000, 3, "2026-11-10").map((p) => [p.amountCents, p.dueDate]), [[3334, "2026-11-10"], [3333, "2026-12-10"], [3333, "2027-01-09"]]);
  assert.throws(() => E.installments(100, 0, "2026-11-10"));
  const lines = [{ id: "l1", qty: 3, netCents: 2700 }, { id: "l2", qty: 1.5, netCents: 400 }];
  assert.deepEqual(E.returnPlan(lines, { l1: 1 }, [{ lineId: "l1", qty: 2 }, { lineId: "l2", qty: 0.5 }]), { ok: true, errors: [], refundCents: 1800 + 133 });
  const bad = E.returnPlan(lines, { l1: 2 }, [{ lineId: "l1", qty: 2 }, { lineId: "x", qty: 1 }, { lineId: "l2", qty: 0 }]);
  assert.deepEqual(bad.errors.map((x) => [x.code, x.path]), [["RETURN_QTY_EXCEEDED", "items.0.qty"], ["LINE_NOT_FOUND", "items.1.lineId"], ["QTY_INVALID", "items.2.qty"]]);
});

test("PDV: leitura com quantidade, troco só em dinheiro, caixa e fechamento", () => {
  assert.deepEqual(E.parseScan("7891000315507"), { qty: 1, code: "7891000315507" });
  assert.deepEqual(E.parseScan("3*7891000315507"), { qty: 3, code: "7891000315507" });
  assert.deepEqual(E.parseScan("1,5 x CAM-AZ"), { qty: 1.5, code: "CAM-AZ" });
  assert.deepEqual(E.parseScan("0*123"), null);
  assert.deepEqual(E.parseScan("   "), null);
  assert.deepEqual(E.settlePayments(4750, [{ method: "CASH", amountCents: 5000 }]), { paidCents: 5000, changeCents: 250, remainingCents: 0, complete: true, errors: [] });
  assert.deepEqual(E.settlePayments(4750, [{ method: "PIX", amountCents: 2000 }, { method: "CASH", amountCents: 3000 }]).changeCents, 250);
  const over = E.settlePayments(4750, [{ method: "CREDIT", amountCents: 5000 }]);
  assert.deepEqual([over.complete, over.changeCents, codes(over.errors)], [false, 0, ["OVERPAY_NON_CASH"]]);
  const part = E.settlePayments(4750, [{ method: "DEBIT", amountCents: 4000 }]);
  assert.deepEqual([part.complete, part.remainingCents], [false, 750]);
  assert.deepEqual(codes(E.settlePayments(100, [{ method: "CHEQUE", amountCents: 100 }, { method: "CASH", amountCents: 0 }]).errors), ["METHOD_INVALID", "AMOUNT_INVALID"]);
  const exp = E.cashExpected(10000, [{ type: "SALE_CASH", amountCents: 4750 }, { type: "WITHDRAWAL", amountCents: 5000 }, { type: "SUPPLY", amountCents: 2000 }, { type: "REFUND_CASH", amountCents: 750 }, { type: "SALE_PIX", amountCents: 9999 }]);
  assert.equal(exp, 11000);
  assert.deepEqual(E.closeCash(11000, 10950), { diffCents: -50, status: "SHORT" });
  assert.deepEqual(E.closeCash(11000, 11000), { diffCents: 0, status: "OK" });
  assert.deepEqual(E.closeCash(11000, 11020).status, "OVER");
});

test("compras: recebimento parcial, sem receber a mais, frete rateado no custo", () => {
  assert.equal(E.purchaseStatus([{ qty: 10, receivedQty: 0 }, { qty: 5 }]), "OPEN");
  assert.equal(E.purchaseStatus([{ qty: 10, receivedQty: 10 }, { qty: 5, receivedQty: 2 }]), "PARTIAL");
  assert.equal(E.purchaseStatus([{ qty: 10, receivedQty: 10 }, { qty: 5, receivedQty: 6 }]), "RECEIVED");
  const lines = [{ id: "a", qty: 10, receivedQty: 4 }, { id: "b", qty: 5, receivedQty: 0 }];
  assert.deepEqual(E.validateReceipt(lines, [{ lineId: "a", qty: 6 }, { lineId: "b", qty: 5 }]), { ok: true, errors: [] });
  assert.deepEqual(E.validateReceipt(lines, [{ lineId: "a", qty: 7 }]).errors.map((x) => x.code), ["OVER_RECEIPT"]);
  assert.equal(E.validateReceipt(lines, [{ lineId: "a", qty: 7 }], { tolerancePct: 10 }).ok, true, "tolerância de 10%");
  assert.deepEqual(E.validateReceipt(lines, [{ lineId: "z", qty: 1 }, { lineId: "b", qty: -1 }]).errors.map((x) => x.code), ["LINE_NOT_FOUND", "QTY_INVALID"]);
  assert.deepEqual(E.landedUnitCosts([{ qty: 10, unitCostCents: 1000 }, { qty: 2, unitCostCents: 5000 }], 2000), [1100, 5500]);
  assert.deepEqual(E.landedUnitCosts([{ qty: 3, unitCostCents: 100 }], 100), [133]);
});

test("relatórios: curva ABC e dias de estoque", () => {
  const abc = E.abcCurve([{ id: "a", valueCents: 7000 }, { id: "b", valueCents: 2000 }, { id: "c", valueCents: 600 }, { id: "d", valueCents: 400 }, { id: "z", valueCents: 0 }]);
  assert.deepEqual(abc.map((r) => [r.id, r.class, r.cumulativePct]), [["a", "A", 70], ["b", "A", 90], ["c", "B", 96], ["d", "C", 100]]);
  assert.equal(E.abcCurve([]).length, 0);
  assert.equal(E.daysOfStock({ onHand: 30, soldQty: 60, days: 30 }), 15);
  assert.equal(E.daysOfStock({ onHand: 30, soldQty: 0, days: 30 }), null, "sem venda: parado");
});

test("documentos", () => {
  assert.equal(E.documentType("111.444.777-35"), "CPF");
  assert.equal(E.documentType("11.222.333/0001-81"), "CNPJ");
  assert.equal(E.documentType("11.222.333/0001-82"), null);
  assert.equal(E.isDate("2027-02-29"), false);
});

// ================================================================== operação avançada e perfis
test("comissão de vendedor: regra mais específica, base líquida, fixo por unidade, devolução estorna", () => {
  const rules = [
    { kind: "PRODUCT", pct: 5 },
    { kind: "SERVICE", pct: 20 },
    { kind: "PRODUCT", sellerId: "ana", pct: 6 },
    { kind: "PRODUCT", categoryId: "cal", pct: 8 },
    { kind: "PRODUCT", productId: "tenis", pct: 10 },
    { kind: "PRODUCT", productId: "tenis", sellerId: "ana", pct: 12 },
    { kind: "PRODUCT", productId: "meia", fixedCents: 100 },
  ];
  const r = (l) => E.sellerCommissionRule(l, rules);
  assert.equal(r({ sellerId: "ana", productId: "tenis", categoryId: "cal" }).pct, 12);
  assert.equal(r({ sellerId: "bia", productId: "tenis", categoryId: "cal" }).pct, 10, "produto > categoria");
  assert.equal(r({ sellerId: "ana", productId: "bota", categoryId: "cal" }).pct, 8, "categoria > vendedor");
  assert.equal(r({ sellerId: "ana", productId: "bota" }).pct, 6);
  assert.equal(r({ sellerId: "bia", productId: "bota" }).pct, 5);
  assert.equal(r({ sellerId: "bia", kind: "SERVICE" }).pct, 20);
  assert.equal(E.sellerCommissionRule({ sellerId: "x" }, []), null);
  assert.equal(E.sellerCommission({ sellerId: "ana", productId: "tenis", netCents: 10005 }, rules), 1201, "12% do líquido, arredondado");
  assert.equal(E.sellerCommission({ sellerId: "bia", productId: "meia", qty: 3, netCents: 3000 }, rules), 300, "fixo por unidade");
  assert.equal(E.sellerCommission({ sellerId: "bia", productId: "tenis", qty: -1, netCents: -20000 }, rules), -2000, "devolução estorna");
  assert.equal(E.sellerCommission({ productId: "x", netCents: 100 }, []), 0);
  const st = E.commissionStatementErp([{ sellerId: "ana", productId: "tenis", netCents: 20000 }, { sellerId: "ana", productId: "bota", netCents: 10000 }, { sellerId: "bia", productId: "tenis", netCents: 20000 }, { sellerId: "bia", productId: "tenis", qty: -1, netCents: -20000 }, { productId: "tenis", netCents: 99999 }], rules);
  assert.deepEqual(st, { bySeller: { ana: { salesCents: 30000, commissionCents: 3000, lines: 2 }, bia: { salesCents: 0, commissionCents: 0, lines: 2 } }, totalCommissionCents: 3000 });
});

test("lote e validade: validação, FEFO e vencendo", () => {
  assert.deepEqual(E.validateLot({ code: "L1", expiresOn: "2026-12-01" }, "2026-10-14"), []);
  assert.deepEqual(E.validateLot({ code: " " }).map((x) => x.path), ["lot.code"]);
  assert.deepEqual(E.validateLot({ code: "L", expiresOn: "2026-13-01" }).map((x) => x.code), ["DATE_INVALID"]);
  assert.deepEqual(E.validateLot({ code: "L", expiresOn: "2026-10-13" }, "2026-10-14").map((x) => x.code), ["LOT_EXPIRED"]);
  assert.deepEqual(E.validateLot({ code: "L", expiresOn: "2026-10-14" }, "2026-10-14"), [], "vence hoje ainda entra");
  const lots = [{ id: "b", expiresOn: "2026-12-01", available: 5 }, { id: "a", expiresOn: "2026-11-01", available: 5 }, { id: "z", expiresOn: null, available: 10 }, { id: "x", expiresOn: "2026-10-10", available: 3 }, { id: "e", expiresOn: "2026-11-01", available: 0 }];
  assert.deepEqual(E.fefoPick(lots, 7, { today: "2026-10-14" }), { ok: true, picks: [{ lotId: "a", qty: 5 }, { lotId: "b", qty: 2 }], shortQty: 0 });
  assert.deepEqual(E.fefoPick(lots, 12, { today: "2026-10-14" }).picks.map((p) => p.lotId), ["a", "b", "z"], "sem validade por último");
  assert.deepEqual(E.fefoPick(lots, 21, { today: "2026-10-14" }), { ok: false, picks: [{ lotId: "a", qty: 5 }, { lotId: "b", qty: 5 }, { lotId: "z", qty: 10 }], shortQty: 1 }, "vencido não sai");
  assert.deepEqual(E.fefoPick(lots, 2, { today: "2026-10-14", allowExpired: true }).picks, [{ lotId: "x", qty: 2 }]);
  assert.deepEqual(E.fefoPick([{ id: "a", expiresOn: "2026-10-14", available: 1.5 }], 1.25, { today: "2026-10-14" }).picks, [{ lotId: "a", qty: 1.25 }], "vence hoje ainda sai; fracionado");
  assert.deepEqual(E.fefoPick([{ id: "b", expiresOn: "2026-11-01", available: 1 }, { id: "a", expiresOn: "2026-11-01", available: 1 }], 1, { today: "2026-10-14" }).picks[0].lotId, "a", "empate pelo id");
  const ex = E.expiringLots(lots, "2026-10-14", 20);
  assert.deepEqual(ex.map((l) => [l.id, l.expired, l.daysLeft]), [["x", true, -4], ["a", false, 18]]);
  assert.deepEqual(E.expiringLots(lots, "2026-10-14", 17).map((l) => l.id), ["x"]);
  assert.deepEqual(E.expiringLots(lots, "2026-10-14", 18).map((l) => l.id), ["x", "a"], "vence exatamente no limite entra");
  assert.deepEqual(E.expiringLots([{ id: "t", expiresOn: "2026-10-14", available: 1 }], "2026-10-14", 0).map((l) => [l.expired, l.daysLeft]), [[false, 0]], "vence hoje ainda não venceu");
});

test("promoções: validação, quando valem, desconto e a melhor por linha", () => {
  const ok = { name: "Leve 3 pague 2", type: "TAKE_PAY", take: 3, pay: 2, productIds: ["p1"] };
  assert.deepEqual(E.validatePromotion(ok), []);
  const codes = (p) => E.validatePromotion(p).map((x) => x.code);
  assert.deepEqual(codes({ ...ok, name: "", take: 2, pay: 2 }), ["NAME_REQUIRED", "TAKE_PAY_INVALID"]);
  assert.deepEqual(codes({ ...ok, take: 3, pay: 0 }), ["TAKE_PAY_INVALID"]);
  assert.deepEqual(codes({ name: "x", type: "PERCENT_OFF", pct: 100, categoryIds: ["c"] }), ["PCT_INVALID"]);
  assert.deepEqual(codes({ name: "x", type: "PERCENT_OFF", pct: 0, categoryIds: ["c"] }), ["PCT_INVALID"]);
  assert.deepEqual(codes({ name: "x", type: "FIXED_PRICE", priceCents: 0, productIds: [] }), ["PRICE_INVALID", "TARGET_REQUIRED"]);
  assert.deepEqual(codes({ name: "x", type: "BOGO", productIds: ["p"] }), ["TYPE_INVALID"]);
  assert.deepEqual(codes({ ...ok, from: "2026-10-20", to: "2026-10-10" }), ["RANGE_INVALID"]);
  assert.deepEqual(codes({ ...ok, from: "20/10", weekdays: [7] }), ["DATE_INVALID", "WEEKDAY_INVALID"]);
  const ctx = { today: "2026-10-13", channel: "PDV" }; // terça
  const line = { productId: "p1", categoryId: "c1", qty: 7, unitCents: 1000 };
  const ap = (p, l = line, c = ctx) => E.promoApplies(p, l, c);
  assert.equal(ap(ok), true);
  assert.equal(ap({ ...ok, active: false }), false);
  assert.equal(ap({ ...ok, from: "2026-10-14" }), false); assert.equal(ap({ ...ok, to: "2026-10-12" }), false);
  assert.equal(ap({ ...ok, from: "2026-10-13", to: "2026-10-13" }), true, "período inclusivo");
  assert.equal(ap({ ...ok, weekdays: [2] }), true, "terça"); assert.equal(ap({ ...ok, weekdays: [3] }), false);
  assert.equal(ap({ ...ok, channels: ["ORDER"] }), false); assert.equal(ap({ ...ok, channels: ["PDV"] }), true);
  assert.equal(ap({ ...ok, productIds: [], categoryIds: ["c1"] }), true); assert.equal(ap({ ...ok, productIds: ["p2"] }), false);
  assert.equal(ap({ ...ok, minQty: 8 }), false); assert.equal(ap({ ...ok, minQty: 7 }), true);
  assert.equal(E.promoDiscount(ok, line), 2000, "7 un: 2 grátis");
  assert.equal(E.promoDiscount(ok, { qty: 2, unitCents: 1000 }), 0);
  assert.equal(E.promoDiscount({ type: "TAKE_PAY", take: 4, pay: 2 }, { qty: 9, unitCents: 1000 }), 4000, "leve 4 pague 2: 9 un = 2 grupos × 2 grátis");
  assert.equal(E.promoDiscount({ type: "PERCENT_OFF", pct: 15 }, { qty: 3, unitCents: 999 }), 450);
  assert.equal(E.promoDiscount({ type: "FIXED_PRICE", priceCents: 800 }, { qty: 2, unitCents: 1000 }), 400);
  assert.equal(E.promoDiscount({ type: "FIXED_PRICE", priceCents: 1200 }, { qty: 2, unitCents: 1000 }), 0, "preço promocional maior não aumenta");
  assert.equal(E.promoDiscount({ type: "X" }, line), 0);
  const promos = [{ id: "a", ...ok }, { id: "b", name: "20%", type: "PERCENT_OFF", pct: 20, categoryIds: ["c1"] }, { id: "c", name: "fora", type: "PERCENT_OFF", pct: 90, productIds: ["p1"], to: "2026-01-01" }];
  assert.deepEqual(E.applyPromotions([line, { productId: "p1", categoryId: "c9", qty: 3, unitCents: 1000 }, { productId: "p9", qty: 1, unitCents: 100 }], promos, ctx), [{ promoId: "a", discountCents: 2000 }, { promoId: "a", discountCents: 1000 }, null], "a maior ganha; sem promoção = null");
  assert.deepEqual(E.applyPromotions([{ productId: "p1", categoryId: "c1", qty: 2, unitCents: 1000 }], promos, ctx), [{ promoId: "b", discountCents: 400 }]);
  assert.deepEqual(E.applyPromotions([line], [promos[1], promos[0]], ctx), [{ promoId: "a", discountCents: 2000 }], "a maior ganha mesmo vindo depois");
});

test("vale-troca: código com dígito, uso e troca", () => {
  let i = 0; const seq = [0.01, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99];
  const code = E.newVoucherCode(() => seq[i++ % seq.length]);
  assert.match(code, /^[A-HJ-NP-Z2-9]{11}$/);
  assert.equal(E.isVoucherCode(code), true);
  assert.equal(E.isVoucherCode(code.toLowerCase().slice(0, 5) + "-" + code.slice(5)), true, "sem caixa e com traço");
  const wrong = code.slice(0, 10) + (code[10] === "A" ? "B" : "A");
  assert.equal(E.isVoucherCode(wrong), false, "dígito errado");
  assert.equal(E.isVoucherCode(code.slice(0, 9) + (code[9] === "A" ? "B" : "A") + code[10]), false, "troca de um caractere");
  assert.equal(E.isVoucherCode("0000000000A"), false);
  const sw = code[0] !== code[1] ? code[1] + code[0] + code.slice(2) : code[2] !== code[3] ? code.slice(0, 2) + code[3] + code[2] + code.slice(4) : null;
  if (sw) assert.equal(E.isVoucherCode(sw), false, "troca de dois vizinhos de lugar");
  const v = { balanceCents: 5000, expiresOn: "2026-12-31", status: "ACTIVE" };
  assert.deepEqual(E.voucherUse(v, 3000, "2026-10-14"), { ok: true, balanceAfterCents: 2000 });
  assert.deepEqual(E.voucherUse(v, 5000, "2026-12-31"), { ok: true, balanceAfterCents: 0 }, "último dia vale");
  assert.equal(E.voucherUse(v, 5001, "2026-10-14").code, "VOUCHER_INSUFFICIENT");
  assert.equal(E.voucherUse(v, 0, "2026-10-14").code, "VOUCHER_INSUFFICIENT");
  assert.equal(E.voucherUse(v, 100, "2027-01-01").code, "VOUCHER_EXPIRED");
  assert.equal(E.voucherUse({ ...v, status: "CANCELED" }, 100, "2026-10-14").code, "VOUCHER_CANCELED");
  assert.equal(E.voucherUse(null, 100, "2026-10-14").code, "VOUCHER_INVALID");
  assert.equal(E.voucherUse({ ...v, expiresOn: null }, 100, "2030-01-01").ok, true, "sem validade");
  assert.deepEqual(E.exchangeBalance(8000, 10000), { toPayCents: 2000, voucherCents: 0 });
  assert.deepEqual(E.exchangeBalance(10000, 8000), { toPayCents: 0, voucherCents: 2000 });
  assert.deepEqual(E.exchangeBalance(5000, 5000), { toPayCents: 0, voucherCents: 0 });
});

test("carnê do fiado: multa, juros pro rata e pagamento das parcelas mais antigas", () => {
  assert.deepEqual(E.lateCharges(10000, "2026-10-10", "2026-10-10"), { daysLate: 0, fineCents: 0, interestCents: 0, totalCents: 10000 });
  assert.deepEqual(E.lateCharges(10000, "2026-10-10", "2026-10-05"), { daysLate: 0, fineCents: 0, interestCents: 0, totalCents: 10000 }, "antes do vencimento");
  assert.deepEqual(E.lateCharges(10000, "2026-09-10", "2026-10-10"), { daysLate: 30, fineCents: 200, interestCents: 100, totalCents: 10300 });
  assert.deepEqual(E.lateCharges(10000, "2026-10-01", "2026-10-16", { finePct: 0, monthlyInterestPct: 2 }), { daysLate: 15, fineCents: 0, interestCents: 100, totalCents: 10100 });
  const open = [{ id: "p2", dueDate: "2026-11-10", openCents: 10000 }, { id: "p1", dueDate: "2026-09-10", openCents: 10000 }, { id: "p3", dueDate: "2026-12-10", openCents: 10000 }];
  const r = E.allocateCarnePayment(open, 15000, "2026-10-10");
  assert.deepEqual(r, { applied: [{ id: "p1", paidCents: 10300, chargesCents: 300, settled: true }, { id: "p2", paidCents: 4700, chargesCents: 0, settled: false }], leftoverCents: 0 });
  assert.deepEqual(E.allocateCarnePayment(open, 40000, "2026-10-10").leftoverCents, 9700, "sobra (troco ou crédito)");
  assert.deepEqual(E.allocateCarnePayment(open, 0, "2026-10-10").applied, []);
  assert.deepEqual(E.allocateCarnePayment([{ id: "b", dueDate: "2026-11-10", openCents: 100 }, { id: "a", dueDate: "2026-11-10", openCents: 100 }], 100, "2026-10-10").applied.map((x) => x.id), ["a"], "mesmo vencimento: pelo id");
});

test("ordem de produção: receita, insumos, custo e fluxo", () => {
  const recipe = { productId: "pao", yieldQty: 10, components: [{ productId: "farinha", qty: 0.5 }, { productId: "fermento", qty: 0.01 }] };
  assert.deepEqual(E.validateRecipe(recipe), []);
  assert.deepEqual(E.validateRecipe({ productId: "pao", yieldQty: 0, components: [] }).map((x) => x.path), ["yieldQty", "components"]);
  assert.deepEqual(E.validateRecipe({ productId: "pao", yieldQty: 1, components: [{ qty: 0 }, { productId: "pao", qty: 1 }] }).map((x) => x.code), ["PRODUCT_REQUIRED", "QTY_INVALID", "SELF_COMPONENT"]);
  assert.deepEqual(E.productionNeeds(recipe, 25), [{ productId: "farinha", qty: 1.25 }, { productId: "fermento", qty: 0.025 }]);
  assert.deepEqual(E.productionNeeds(recipe, 3), [{ productId: "farinha", qty: 0.15 }, { productId: "fermento", qty: 0.003 }]);
  const cost = { farinha: 500, fermento: 4000 };
  assert.equal(E.productionUnitCost(E.productionNeeds(recipe, 20), (id) => cost[id], 20), 29, "(1 × 500 + 0,02 × 4000) / 20 = 29");
  assert.equal(E.canMoveProduction("PLANNED", "DONE"), true); assert.equal(E.canMoveProduction("PLANNED", "IN_PROGRESS"), true);
  assert.equal(E.canMoveProduction("DONE", "CANCELED"), false); assert.equal(E.canMoveProduction("CANCELED", "DONE"), false);
  assert.equal(E.canMoveProduction("IN_PROGRESS", "PLANNED"), false);
});

test("perfis: balança, unidade de venda, múltiplo, pedido mínimo", () => {
  const body = "200123401250";
  const code = body + E.gtinCheckDigit(body);
  assert.deepEqual(E.parseScaleBarcode(code), { productCode: "001234", priceCents: 1250 });
  assert.deepEqual(E.parseScaleBarcode(code, { mode: "WEIGHT" }), { productCode: "001234", weightKg: 1.25 });
  assert.equal(E.parseScaleBarcode(body + ((Number(code[12]) + 1) % 10)), null, "dígito errado");
  const notScale = "789123401250"; assert.equal(E.parseScaleBarcode(notScale + E.gtinCheckDigit(notScale)), null, "não começa com 2");
  assert.equal(E.parseScaleBarcode("2001234"), null);
  assert.equal(E.toStockQty(3, 2.5), 7.5); assert.equal(E.toStockQty(2), 2); assert.equal(E.toStockQty(1, 1 / 3), 0.333);
  assert.equal(E.isMultipleOf(24, 12), true); assert.equal(E.isMultipleOf(0.3, 0.1), true, "sem erro de ponto flutuante"); assert.equal(E.isMultipleOf(10, 12), false); assert.equal(E.isMultipleOf(1.5, 0.5), true); assert.equal(E.isMultipleOf(7, null), true);
  assert.equal(E.meetsMinimumOrder(49999, 50000), false); assert.equal(E.meetsMinimumOrder(50000, 50000), true); assert.equal(E.meetsMinimumOrder(1, 0), true);
  assert.equal(E.erpSegment("WHOLESALE").words.sale, "pedido");
  assert.deepEqual(E.erpSegment("MARKET").on.includes("scale"), true);
  assert.equal(E.erpSegment("nope").id, "GENERAL");
  assert.deepEqual(Object.keys(E.ERP_SEGMENTS), ["GENERAL", "MARKET", "APPAREL", "BUILDING", "WHOLESALE"]);
});
