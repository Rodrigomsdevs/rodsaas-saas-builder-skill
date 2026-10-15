import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, ownerWithMember, signUp } from "../support/ui";

// ERP · operação avançada e perfis (skills/erp/references/11 e 12). Roda com o preset erp. Confere o que mais se
// simplifica: comissão pela regra mais específica com estorno na devolução, lote obrigatório e FEFO sem vender vencido,
// promoção aplicada no servidor (a melhor por linha), vale-troca emitido na devolução e aceito no PDV, troca com
// diferença, carnê com multa e juros pagando as mais antigas, produção que baixa insumos e entra com custo, NFC-e do PDV
// pelo motor fiscal, balança, unidade de venda, múltiplo e pedido mínimo.

async function installed(req: APIRequestContext) {
  if (cfg.presets.includes("erp")) return true;
  return (await call(req, "GET", "/v1/erp/me")).status() !== 404;
}
async function expectCode(res: APIResponse, status: number, code: string, label: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  const json = JSON.parse(body || "{}");
  expect(json.code, `${label}: code`).toBe(code);
  return json;
}
const pathsOf = (b: any) => (b?.errors ?? []).map((e: any) => e.path) as string[];
const violationsOf = (b: any) => (b?.violations ?? []).map((v: any) => v.code) as string[];
async function ensureFeature(req: APIRequestContext, feature: string) {
  const plan: any = (await me(req)).plan;
  if (plan?.features?.includes(feature)) return;
  const mode = await billingMode(req);
  test.skip(mode !== "fake", `"${feature}" exige plano pago e a cobrança está em modo "${mode}"`);
  const target = (await plansFromApi(req)).paid.find((p) => p.features?.includes(feature));
  test.skip(!target, `nenhum plano com a feature ${feature}`);
  await ok(await call(req, "POST", "/v1/billing/checkout-sessions", { plan: target!.id, interval: "month" }), `assinar plano com ${feature} (modo de teste)`);
}
const callKey = (req: APIRequestContext, path: string, data: unknown, key = `k-${uniq()}`) =>
  req.fetch(cfg.apiURL + path, { method: "POST", headers: { Origin: cfg.webURL, "Content-Type": "application/json", "Idempotency-Key": key }, data: JSON.stringify(data), failOnStatusCode: false });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); };
const ean13 = (body12: string) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(body12[11 - i]) * (i % 2 === 0 ? 3 : 1); return body12 + ((10 - (s % 10)) % 10); };

async function wh(req: APIRequestContext) { return items<any>(await ok(await call(req, "GET", "/v1/erp/warehouses"), "depósitos")).find((w) => w.isDefault).id as string; }
const product = async (req: APIRequestContext, body: Record<string, unknown> = {}) => ok<any>(await call(req, "POST", "/v1/erp/products", { type: "SIMPLE", name: `Produto ${uniq()}`, unit: "UN", priceCents: 1000, ...body }), "produto");
const stockIn = async (req: APIRequestContext, productId: string, qty: number, extra: Record<string, unknown> = {}) => ok<any>(await call(req, "POST", "/v1/erp/stock/movements", { type: "IN", productId, warehouseId: await wh(req), qty, unitCostCents: 500, ...extra }), "entrada");
const getProduct = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/erp/products/${id}`), "produto");
async function delivered(req: APIRequestContext, body: Record<string, unknown>) {
  const o = await ok<any>(await call(req, "POST", "/v1/erp/orders", { status: "CONFIRMED", ...body }), "pedido confirmado");
  return ok<any>(await call(req, "POST", `/v1/erp/orders/${o.id}/deliver`), "entregar");
}
async function session(req: APIRequestContext) {
  await ensureFeature(req, "erp_pdv");
  let regs = items<any>(await ok(await call(req, "GET", "/v1/erp/registers"), "caixas"));
  if (!regs.length) regs = [await ok<any>(await call(req, "POST", "/v1/erp/registers", { name: "Caixa 1", warehouseId: await wh(req) }), "caixa")];
  return ok<any>(await call(req, "POST", "/v1/erp/pdv/sessions", { registerId: regs[0].id, openingCents: 10000 }), "abrir caixa");
}

test.describe("ERP · operação", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset erp");
  });

  test("API: comissão — regra mais específica sobre o líquido, por vendedor, com estorno na devolução", async ({ browser, request }) => {
    const { owner, member, ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request;
    await ensureFeature(o, "erp_commissions");
    const ids = items<any>(await ok(await call(o, "GET", "/v1/members"), "membros"));
    const ownerId = ids.find((x) => x.user?.email === owner.email).user.id, memberId = ids.find((x) => x.user?.email === member.email).user.id;
    await ok(await call(o, "PUT", `/v1/erp/roles/${memberId}`, { roles: ["SELLER"] }), "vendedor");
    const tenis = await product(o, { name: `Tênis ${uniq()}`, priceCents: 20000 }), bota = await product(o, { name: `Bota ${uniq()}`, priceCents: 10000 });
    await stockIn(o, tenis.id, 10); await stockIn(o, bota.id, 10);
    expect(pathsOf(await expectCode(await call(o, "POST", "/v1/erp/commission-rules", { kind: "PRODUCT", pct: 150 }), 400, "VALIDATION_ERROR", "porcentagem inválida"))).toContain("pct");
    for (const r of [{ kind: "PRODUCT", pct: 5 }, { kind: "PRODUCT", productId: tenis.id, pct: 10 }, { kind: "PRODUCT", productId: tenis.id, sellerId: memberId, pct: 12 }]) expect((await call(o, "POST", "/v1/erp/commission-rules", r)).status()).toBe(201);
    const a = await delivered(o, { sellerId: ownerId, items: [{ productId: tenis.id, qty: 1 }, { productId: bota.id, qty: 1 }], discountCents: 3000 });
    await delivered(o, { sellerId: memberId, items: [{ productId: tenis.id, qty: 2 }] });
    const ret = await call(o, "POST", `/v1/erp/orders/${a.id}/returns`, { items: [{ lineId: a.items.find((l: any) => l.productId === bota.id).id, qty: 1 }], refundMethod: "CASH" });
    expect(ret.status(), await ret.text()).toBe(201);
    const c = await ok<any>(await call(o, "GET", `/v1/erp/commissions?from=${today()}&to=${today()}`), "comissões");
    const by = (id: string) => c.sellers.find((x: any) => x.sellerId === id);
    // owner: tênis líquido 18000 (10%) + bota líquida 9000 (5%) − bota devolvida 9000 (5%) = 1800
    expect(by(ownerId)).toMatchObject({ salesCents: 18000, commissionCents: 1800 });
    expect(by(memberId), "12% da regra vendedor + produto").toMatchObject({ salesCents: 40000, commissionCents: 4800 });
    expect(c.totalCommissionCents).toBe(6600);
    const mine = await ok<any>(await call(memberCtx.request, "GET", `/v1/erp/commissions?from=${today()}&to=${today()}`), "comissões do vendedor");
    expect(mine.sellers.map((x: any) => x.sellerId), "vendedor só vê a dele").toEqual([memberId]);
    const tomorrow = await ok<any>(await call(o, "GET", `/v1/erp/commissions?from=${addDays(today(), 1)}&to=${addDays(today(), 1)}`), "outro dia");
    expect(tomorrow.totalCommissionCents).toBe(0);
    await ownerCtx.close(); await memberCtx.close();
  });

  test("API: lote e validade — lote obrigatório na entrada, saída FEFO e vencido nunca sai", async ({ request }) => {
    await register(request, newUser("erplot"));
    const p = await product(request, { name: `Iogurte ${uniq()}`, tracksLots: true, priceCents: 500 });
    const w = await wh(request);
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/erp/stock/movements", { type: "IN", productId: p.id, warehouseId: w, qty: 5, unitCostCents: 200 }), 400, "VALIDATION_ERROR", "entrada sem lote"))).toContain("lot.code");
    await expectCode(await call(request, "POST", "/v1/erp/stock/movements", { type: "IN", productId: p.id, warehouseId: w, qty: 5, unitCostCents: 200, lot: { code: "VENC", expiresOn: addDays(today(), -1) } }), 400, "VALIDATION_ERROR", "lote já vencido");
    await stockIn(request, p.id, 5, { lot: { code: "L2", expiresOn: addDays(today(), 60) } });
    await stockIn(request, p.id, 5, { lot: { code: "L1", expiresOn: addDays(today(), 20) } });
    await delivered(request, { items: [{ productId: p.id, qty: 7 }] });
    const lots = items<any>(await ok(await call(request, "GET", `/v1/erp/products/${p.id}/lots`), "lotes"));
    const q = (code: string) => lots.find((l) => l.code === code)?.onHand ?? 0;  // lote zerado sai da lista
    expect([q("L1"), q("L2")], "o que vence primeiro sai primeiro").toEqual([0, 3]);
    const exp = items<any>(await ok(await call(request, "GET", "/v1/erp/lots/expiring?days=90"), "vencendo"));
    expect(exp.find((x) => x.productId === p.id && x.code === "L2")).toMatchObject({ expired: false, onHand: 3 });
    expect(exp.some((x) => x.code === "L1"), "lote zerado não aparece").toBe(false);
    const o = await ok<any>(await call(request, "POST", "/v1/erp/orders", { items: [{ productId: p.id, qty: 4 }] }), "orçamento de 4");
    await expectCode(await call(request, "POST", `/v1/erp/orders/${o.id}/confirm`), 409, "INSUFFICIENT_STOCK", "só 3 dentro da validade");
  });

  test("API: promoções — leve 3 pague 2, porcentagem por categoria, fora do período não vale, a melhor por linha", async ({ request }) => {
    await register(request, newUser("erppromo"));
    await ensureFeature(request, "erp_promotions");
    const cat = await ok<any>(await call(request, "POST", "/v1/erp/categories", { name: `Bebidas ${uniq()}` }), "categoria").catch(() => null);
    const suco = await product(request, { name: `Suco ${uniq()}`, priceCents: 1000, ...(cat ? { categoryId: cat.id } : {}) });
    const agua = await product(request, { name: `Água ${uniq()}`, priceCents: 300 });
    await stockIn(request, suco.id, 50); await stockIn(request, agua.id, 50);
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/erp/promotions", { name: "Ruim", type: "TAKE_PAY", take: 2, pay: 2, productIds: [suco.id] }), 400, "VALIDATION_ERROR", "leve igual ao pague"))).toContain("take");
    // a de 20% vem antes: a ordem de cadastro não decide, a maior desconto ganha
    await ok(await call(request, "POST", "/v1/erp/promotions", { name: "Suco 20%", type: "PERCENT_OFF", pct: 20, productIds: [suco.id] }), "20%");
    await ok(await call(request, "POST", "/v1/erp/promotions", { name: "Leve 3 pague 2", type: "TAKE_PAY", take: 3, pay: 2, productIds: [suco.id] }), "leve 3 pague 2");
    await ok(await call(request, "POST", "/v1/erp/promotions", { name: "Água antiga", type: "PERCENT_OFF", pct: 50, productIds: [agua.id], from: addDays(today(), -30), to: addDays(today(), -1) }), "promoção vencida");
    const o = await ok<any>(await call(request, "POST", "/v1/erp/orders", { items: [{ productId: suco.id, qty: 7 }, { productId: suco.id, qty: 2 }, { productId: agua.id, qty: 4 }] }), "orçamento");
    const [l7, l2, la] = o.items;
    expect(l7.promotion, "7 sucos: leve 3 pague 2 (2 grátis = 2000) vence 20% (1400)").toMatchObject({ name: "Leve 3 pague 2", discountCents: 2000 });
    expect(l2.promotion, "2 sucos: só os 20%").toMatchObject({ name: "Suco 20%", discountCents: 400 });
    expect(la.promotion ?? null, "fora do período não vale").toBeNull();
    expect(o.totals.totalCents, "5000 + 1600 + 1200").toBe(7800);
    const pr = await ok<any>(await call(request, "GET", `/v1/erp/price?productId=${suco.id}&qty=3`), "preço");
    expect(pr.promotion?.name).toBe("Leve 3 pague 2");
  });

  test("API: vale-troca — devolução emite o vale, o PDV aceita, saldo baixa; troca com diferença e com crédito", async ({ request }) => {
    await register(request, newUser("erpvale"));
    const camisa = await product(request, { name: `Camisa ${uniq()}`, priceCents: 8000 }), calca = await product(request, { name: `Calça ${uniq()}`, priceCents: 12000 });
    await stockIn(request, camisa.id, 10); await stockIn(request, calca.id, 10);
    const o = await delivered(request, { items: [{ productId: camisa.id, qty: 2 }] });
    const r = await call(request, "POST", `/v1/erp/orders/${o.id}/returns`, { items: [{ lineId: o.items[0].id, qty: 1 }], refundMethod: "VOUCHER" });
    expect(r.status(), await r.text()).toBe(201);
    const v = (await r.json()).voucher;
    expect(v).toMatchObject({ balanceCents: 8000 });
    expect(v.code).toMatch(/^[A-HJ-NP-Z2-9]{11}$/);
    expect(v.expiresOn, "validade padrão de 90 dias").toBe(addDays(today(), 90));
    expect((await ok<any>(await call(request, "GET", `/v1/erp/vouchers/${v.code}`), "consultar vale")).balanceCents).toBe(8000);
    expect((await call(request, "GET", "/v1/erp/vouchers/AAAAAAAAAAA")).status(), "vale inexistente").toBe(404);
    const ses = await session(request);
    const sale = (payments: unknown[]) => callKey(request, "/v1/erp/pdv/sales", { sessionId: ses.id, items: [{ productId: camisa.id, qty: 1 }], payments });
    expect(violationsOf(await expectCode(await sale([{ method: "VOUCHER", amountCents: 8000, voucherCode: "ZZZZZZZZZZZ" }]), 422, "PAYMENT_RULES", "código errado"))).toContain("VOUCHER_INVALID");
    const ok1 = await sale([{ method: "VOUCHER", amountCents: 5000, voucherCode: v.code }, { method: "PIX", amountCents: 3000 }]);
    expect(ok1.status(), await ok1.text()).toBe(201);
    expect((await ok<any>(await call(request, "GET", `/v1/erp/vouchers/${v.code}`), "saldo")).balanceCents, "baixou 5000").toBe(3000);
    expect(violationsOf(await expectCode(await sale([{ method: "VOUCHER", amountCents: 8000, voucherCode: v.code }]), 422, "PAYMENT_RULES", "saldo menor"))).toContain("VOUCHER_INSUFFICIENT");
    const o2 = await delivered(request, { items: [{ productId: camisa.id, qty: 1 }] });
    const exUp = await callKey(request, "/v1/erp/exchanges", { orderId: o2.id, returns: [{ lineId: o2.items[0].id, qty: 1 }], items: [{ productId: calca.id, qty: 1 }], payments: [{ method: "PIX", amountCents: 4000 }] });
    expect(exUp.status(), await exUp.text()).toBe(201);
    expect(await exUp.json()).toMatchObject({ toPayCents: 4000, voucher: null });
    const o3 = await delivered(request, { items: [{ productId: calca.id, qty: 1 }] });
    await expectCode(await callKey(request, "/v1/erp/exchanges", { orderId: o3.id, returns: [{ lineId: o3.items[0].id, qty: 1 }], items: [{ productId: calca.id, qty: 2 }] }), 422, "PAYMENT_RULES", "troca com diferença sem pagar");
    const exDown = await ok<any>(await callKey(request, "/v1/erp/exchanges", { orderId: o3.id, returns: [{ lineId: o3.items[0].id, qty: 1 }], items: [{ productId: camisa.id, qty: 1 }] }), "troca por mais barato");
    expect(exDown).toMatchObject({ toPayCents: 0 });
    expect(exDown.voucher?.balanceCents, "crédito vira vale").toBe(4000);
  });

  test("API: carnê do fiado — parcelas, multa e juros no atraso e pagamento das mais antigas", async ({ request }) => {
    await register(request, newUser("erpcarne"));
    const cli = await ok<any>(await call(request, "POST", "/v1/erp/parties", { kinds: ["CUSTOMER"], name: "Dona Maria", creditLimitCents: 1000000 }), "cliente");
    const p = await product(request, { priceCents: 10000 });
    await stockIn(request, p.id, 10);
    const first = addDays(today(), -45);
    await delivered(request, { customerId: cli.id, items: [{ productId: p.id, qty: 3 }], payment: { method: "ON_ACCOUNT", installments: 3, firstDue: first } });
    const r = await ok<any>(await call(request, "GET", `/v1/erp/parties/${cli.id}/receivables`), "carnê");
    expect(r.data.map((x: any) => [x.number, x.dueDate, x.amountCents])).toEqual([[1, first, 10000], [2, addDays(first, 30), 10000], [3, addDays(first, 60), 10000]]);
    expect(r.data[0].charges, "45 dias: 2% de multa + 1% ao mês pro rata (1,5%)").toMatchObject({ daysLate: 45, fineCents: 200, interestCents: 150, totalCents: 10350 });
    expect(r.data[1].charges, "15 dias: multa cheia + 0,5% de juros").toMatchObject({ daysLate: 15, fineCents: 200, interestCents: 50, totalCents: 10250 });
    expect(r.data[2].charges.daysLate, "vence daqui a 15 dias: sem atraso").toBe(0);
    expect(r.totalOpenCents).toBe(30000);
    const pay = await call(request, "POST", `/v1/erp/parties/${cli.id}/receivables/pay`, { amountCents: 15000, method: "CASH" });
    expect(pay.status(), await pay.text()).toBe(201);
    const pj = await pay.json();
    expect(pj.applied.map((x: any) => [x.paidCents, x.chargesCents, x.settled]), "a mais antiga quita com os encargos; a sobra paga primeiro os encargos da segunda").toEqual([[10350, 350, true], [4650, 250, false]]);
    const after = await ok<any>(await call(request, "GET", `/v1/erp/parties/${cli.id}/receivables`), "carnê depois");
    expect(after.data.map((x: any) => x.openCents), "4650 − 250 de encargos = 4400 do principal").toEqual([0, 5600, 10000]);
    expect(after.totalOpenCents).toBe(15600);
  });

  test("API: ordem de produção — receita, insumos proporcionais, falta de insumo e custo do produzido", async ({ request }) => {
    await register(request, newUser("erpprod"));
    await ensureFeature(request, "erp_production");
    const farinha = await product(request, { name: `Farinha ${uniq()}`, unit: "KG", priceCents: 600 }), fermento = await product(request, { name: `Fermento ${uniq()}`, unit: "KG", priceCents: 5000 });
    const pao = await product(request, { name: `Pão francês ${uniq()}`, priceCents: 100 });
    await stockIn(request, farinha.id, 3, { unitCostCents: 500 });
    await stockIn(request, fermento.id, 1, { unitCostCents: 4000 });
    expect(pathsOf(await expectCode(await call(request, "PUT", `/v1/erp/products/${pao.id}/recipe`, { yieldQty: 10, components: [{ productId: pao.id, qty: 1 }] }), 400, "VALIDATION_ERROR", "insumo dele mesmo"))).toContain("components.0.productId");
    await ok(await call(request, "PUT", `/v1/erp/products/${pao.id}/recipe`, { yieldQty: 10, components: [{ productId: farinha.id, qty: 0.5 }, { productId: fermento.id, qty: 0.01 }] }), "receita");
    const op = await ok<any>(await call(request, "POST", "/v1/erp/production-orders", { productId: pao.id, qty: 40 }), "ordem de 40");
    expect(op.status).toBe("PLANNED");
    expect(op.needs.map((n: any) => n.qty)).toEqual([2, 0.04]);
    const done = await ok<any>(await call(request, "POST", `/v1/erp/production-orders/${op.id}/complete`), "produzir");
    expect(done.status).toBe("DONE");
    expect(done.unitCostCents, "(2 × 500 + 0,04 × 4000) / 40 = 29").toBe(29);
    expect((await getProduct(request, pao.id)).stock.onHand).toBe(40);
    expect((await getProduct(request, farinha.id)).stock.onHand).toBe(1);
    const big = await ok<any>(await call(request, "POST", "/v1/erp/production-orders", { productId: pao.id, qty: 40 }), "ordem sem insumo");
    await expectCode(await call(request, "POST", `/v1/erp/production-orders/${big.id}/complete`), 409, "INSUFFICIENT_STOCK", "falta farinha");
    expect((await ok<any>(await call(request, "GET", `/v1/erp/production-orders/${big.id}`), "ordem")).status, "a ordem continua planejada").toBe("PLANNED");
    expect((await getProduct(request, pao.id)).stock.onHand, "nada mudou").toBe(40);
  });

  test("API: PDV emite a NFC-e pelo motor fiscal quando ligado, com o CPF na nota", async ({ request }) => {
    await register(request, newUser("erpnfce"));
    test.skip(!(cfg.addons.includes("fiscal") || (await call(request, "GET", "/v1/fiscal/issuer")).status() !== 404), "projeto sem o add-on fiscal");
    await ensureFeature(request, "fiscal");
    await ok(await call(request, "PUT", "/v1/fiscal/issuer", { cnpj: "11.222.333/0001-81", legalName: "Loja", ie: "123", uf: "PR", cityCode: "4115200", regime: "SIMPLES", driver: "fake" }), "emitente");
    await ok(await call(request, "PATCH", "/v1/erp/settings", { pdvIssueNfce: true }), "NFC-e no PDV");
    const p = await product(request, { priceCents: 1500, fiscal: { ncm: "22021000" } });
    await stockIn(request, p.id, 5);
    const ses = await session(request);
    const r = await callKey(request, "/v1/erp/pdv/sales", { sessionId: ses.id, items: [{ productId: p.id, qty: 2 }], payments: [{ method: "CASH", amountCents: 3000 }], cpf: "529.982.247-25" });
    expect(r.status(), await r.text()).toBe(201);
    const sale = await r.json();
    expect(sale.nfce?.status, "NFC-e autorizada").toBe("AUTHORIZED");
    expect(String(sale.nfce?.key)).toMatch(/^\d{20}65/);
    const doc = await ok<any>(await call(request, "GET", `/v1/fiscal/documents/${sale.nfce.id}`), "nota");
    expect(doc.recipient?.document?.replace(/\D/g, "")).toBe("52998224725");
    expect(doc.ref).toMatchObject({ app: "erp", entity: "order", id: sale.order.id });
    expect(doc.totals.totalCents).toBe(3000);
  });

  test("API: perfil mercado — etiqueta de balança vira a quantidade no PDV", async ({ request }) => {
    await register(request, newUser("erpbalanca"));
    const s = await ok<any>(await call(request, "PATCH", "/v1/erp/settings", { segment: "MARKET" }), "perfil mercado");
    expect(s.segment).toBe("MARKET");
    expect(s.on).toEqual(expect.arrayContaining(["scale", "lots", "promotions"]));
    const code6 = String(100000 + Math.floor(Math.random() * 899999));
    const queijo = await product(request, { name: `Queijo ${uniq()}`, unit: "KG", priceCents: 5000, scaleCode: code6 });
    await stockIn(request, queijo.id, 10);
    await session(request);
    const label = ean13("2" + code6 + "01250");
    const lk = await ok<any>(await call(request, "GET", `/v1/erp/pdv/lookup?code=${label}`), "etiqueta");
    expect(lk.product.id).toBe(queijo.id);
    expect(lk.scale).toMatchObject({ priceCents: 1250, qty: 0.25 });
    const badLabel = label.slice(0, 12) + ((Number(label[12]) + 1) % 10);
    await expectCode(await call(request, "GET", `/v1/erp/pdv/lookup?code=${badLabel}`), 404, "PRODUCT_NOT_FOUND", "dígito errado");
  });

  test("API: perfis material de construção e distribuidora — unidade de venda, múltiplo e pedido mínimo", async ({ request }) => {
    await register(request, newUser("erpperfis"));
    await ok(await call(request, "PATCH", "/v1/erp/settings", { segment: "BUILDING" }), "material de construção");
    const piso = await product(request, { name: `Piso ${uniq()}`, unit: "M2", priceCents: 5000, saleUnit: { unit: "CX", factor: 2.5 } });
    await stockIn(request, piso.id, 100);
    const o = await ok<any>(await call(request, "POST", "/v1/erp/orders", { items: [{ productId: piso.id, qty: 2, unit: "CX" }] }), "2 caixas");
    expect(o.items[0].qty, "2 caixas = 5 m²").toBe(5);
    expect(o.totals.totalCents).toBe(25000);
    const w = await ok<any>(await call(request, "PATCH", "/v1/erp/settings", { segment: "WHOLESALE", minimumOrderCents: 50000 }), "distribuidora");
    expect(w.words?.sale).toBe("pedido");
    expect(w.on, "o que o material de construção ligou continua").toEqual(expect.arrayContaining(["sale_units", "sale_multiple", "minimum_order"]));
    const refri = await product(request, { name: `Refri ${uniq()}`, priceCents: 500, saleMultiple: 12 });
    await stockIn(request, refri.id, 500);
    const m = await expectCode(await call(request, "POST", "/v1/erp/orders", { items: [{ productId: refri.id, qty: 10 }] }), 400, "VALIDATION_ERROR", "fora do múltiplo");
    expect(m.errors?.[0]).toMatchObject({ path: "items.0.qty", code: "QTY_MULTIPLE" });
    await expectCode(await call(request, "POST", "/v1/erp/orders", { items: [{ productId: refri.id, qty: 24 }] }), 422, "MIN_ORDER_VALUE", "abaixo do mínimo");
    expect((await call(request, "POST", "/v1/erp/orders", { items: [{ productId: refri.id, qty: 120 }] })).status(), "120 × 5 = R$ 600").toBe(201);
  });

  test("Tela: comissões do período por vendedor", async ({ page }) => {
    await signUp(page, "erpcomtela");
    const req = page.context().request;
    await ensureFeature(req, "erp_commissions");
    const meId = (await me(req)).user.id;
    await ok(await call(req, "POST", "/v1/erp/commission-rules", { kind: "PRODUCT", pct: 10 }), "regra");
    const p = await product(req, { priceCents: 10000 });
    await stockIn(req, p.id, 5);
    await delivered(req, { sellerId: meId, items: [{ productId: p.id, qty: 1 }] });
    await page.goto("/erp/comissoes");
    const row = page.locator(`[data-testid="erp-commission-row"][data-seller="${meId}"]`);
    await expect(row, "linha do vendedor").toBeVisible();
    await expect(row, "10% de R$ 100,00").toContainText("10,00");
  });

  test("Tela: lotes do produto, o que vence primeiro em cima", async ({ page }) => {
    await signUp(page, "erplottela");
    const req = page.context().request;
    const p = await product(req, { name: `Leite ${uniq()}`, tracksLots: true });
    await stockIn(req, p.id, 4, { lot: { code: "A1", expiresOn: addDays(today(), 3) } });
    await stockIn(req, p.id, 2, { lot: { code: "B2", expiresOn: addDays(today(), 40) } });
    await page.goto(`/erp/produtos/${p.id}`);
    await expect(page.getByTestId("erp-lot-row")).toHaveCount(2);
    await expect(page.locator('[data-testid="erp-lot-row"]').first()).toContainText("A1");
  });

  test("Tela: escolher o perfil do ERP nas configurações", async ({ page }) => {
    await signUp(page, "erpperfiltela");
    await page.goto("/erp/configuracoes");
    await page.getByTestId("erp-segment").selectOption("APPAREL");
    await expect.poll(async () => (await ok<any>(await call(page.context().request, "GET", "/v1/erp/settings"), "configurações")).segment, { timeout: 10_000 }).toBe("APPAREL");
  });
});
