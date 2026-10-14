import { test, expect, type APIRequestContext, type APIResponse, type Browser, type BrowserContext } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { linkFrom, waitForEmail } from "../support/mailpit";
import { newContext } from "../support/ui";

// Parte do preset erp (app ERP, /rodsaas:erp). Roda quando rodsaas.json tem "erp" em presets ou a API tem /v1/erp/me.
// Confere o que mais se simplifica: código de barras e SKU, grade que arquiva sem apagar, preço por tabela e faixa no
// servidor, estoque como livro (custo médio, reserva, sem negativo, transferência, inventário), kit sem estoque próprio,
// pedido com rateio, crédito e desconto do vendedor, devolução, PDV (troco só em dinheiro, venda sem duplicar, caixa com
// fechamento cego), compras com frete no custo, curva ABC, papéis (custo escondido) e as telas de produto e do PDV.

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
/** POST com Idempotency-Key (clique duplo no PDV não pode vender duas vezes). */
const callKey = (req: APIRequestContext, path: string, data: unknown, key: string) =>
  req.fetch(cfg.apiURL + path, { method: "POST", headers: { Origin: cfg.webURL, "Content-Type": "application/json", "Idempotency-Key": key }, data: JSON.stringify(data), failOnStatusCode: false });

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); };
/** EAN-13 válido a partir de 12 dígitos. */
const ean13 = (body12: string) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(body12[11 - i]) * (i % 2 === 0 ? 3 : 1); return body12 + ((10 - (s % 10)) % 10); };
const isGtin = (c: string) => /^\d{13}$/.test(c) && ean13(c.slice(0, 12)) === c;
const randomEan = () => ean13("789" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0"));

// ---------------------------------------------------------------- pessoas
async function owner(browser: Browser) {
  const ctx = await newContext(browser);
  const user = newUser("erp");
  await register(ctx.request, user);
  const em = await ok<any>(await call(ctx.request, "GET", "/v1/erp/me"), "/v1/erp/me do owner");
  return { user, ctx, req: ctx.request, em };
}
async function addMember(browser: Browser, mailReq: APIRequestContext, ownerReq: APIRequestContext, tag: string, roles: string[] | null) {
  const u = newUser(tag);
  await ok(await call(ownerReq, "POST", "/v1/invitations", { email: u.email, role: "MEMBER" }), "convite");
  const mail = await waitForEmail(mailReq, u.email, { contains: "/convite" });
  const token = new URL(linkFrom(mail, "/convite")).searchParams.get("token");
  const ctx: BrowserContext = await newContext(browser);
  await register(ctx.request, u, { invitationToken: token });
  const m = items<any>(await ok(await call(ownerReq, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === u.email);
  if (roles) await ok(await call(ownerReq, "PUT", `/v1/erp/roles/${m.user.id}`, { roles }), `papéis ${roles.join(",")}`);
  return { user: u, ctx, req: ctx.request, userId: m.user.id as string };
}

// ---------------------------------------------------------------- dados
async function product(req: APIRequestContext, body: Record<string, unknown> = {}, label = "criar produto") {
  return ok<any>(await call(req, "POST", "/v1/erp/products", { type: "SIMPLE", name: `Produto ${uniq()}`, unit: "UN", priceCents: 1000, ...body }), label);
}
const getProduct = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/erp/products/${id}`), "produto");
async function mainWarehouse(req: APIRequestContext) {
  const list = items<any>(await ok(await call(req, "GET", "/v1/erp/warehouses"), "depósitos"));
  const w = list.find((x) => x.isDefault) ?? list[0];
  expect(w, "depósito padrão criado na ativação").toBeTruthy();
  return w.id as string;
}
const move = (req: APIRequestContext, body: Record<string, unknown>) => call(req, "POST", "/v1/erp/stock/movements", body);
async function stockIn(req: APIRequestContext, productId: string, qty: number, unitCostCents = 1000) {
  return ok<any>(await move(req, { type: "IN", productId, warehouseId: await mainWarehouse(req), qty, unitCostCents, reason: "Saldo inicial" }), "entrada de estoque");
}
const stockOf = async (req: APIRequestContext, id: string) => (await getProduct(req, id)).stock;
const order = (req: APIRequestContext, body: Record<string, unknown>) => call(req, "POST", "/v1/erp/orders", body);
async function delivered(req: APIRequestContext, body: Record<string, unknown>) {
  const o = await ok<any>(await order(req, { status: "CONFIRMED", ...body }), "pedido confirmado");
  return ok<any>(await call(req, "POST", `/v1/erp/orders/${o.id}/deliver`), "entregar");
}

test.describe("ERP", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset erp");
  });

  test("API: produto simples — código de barras validado, SKU único, código interno e margem", async ({ browser }) => {
    const o = await owner(browser);
    expect([o.em.roles, o.em.canSeeCost], "owner é ERP_ADMIN e vê custo").toEqual([expect.arrayContaining(["ERP_ADMIN"]), true]);
    const sku = `CANETA-${uniq().toUpperCase()}`;
    const ean = randomEan();
    const p = await product(o.req, { name: "Caneta azul", sku, barcode: ean, priceCents: 2590, costCents: 1000 });
    expect([p.type, p.sku, p.barcode, p.priceCents, p.costCents, p.marginPct], "produto como enviado, margem 61,4%").toEqual(["SIMPLE", sku, ean, 2590, 1000, 61.4]);
    expect([p.stock?.onHand, p.stock?.available], "sem saldo ainda").toEqual([0, 0]);
    const bad = await expectCode(await call(o.req, "POST", "/v1/erp/products", { type: "SIMPLE", name: "X", unit: "UN", priceCents: 100, barcode: ean.slice(0, 12) + ((Number(ean[12]) + 1) % 10) }), 400, "VALIDATION_ERROR", "EAN com dígito errado");
    expect(pathsOf(bad), "erro no campo barcode").toContain("barcode");
    const bad2 = await expectCode(await call(o.req, "POST", "/v1/erp/products", { type: "SIMPLE", name: "X", unit: "UN", priceCents: 2.5 }), 400, "VALIDATION_ERROR", "preço quebrado");
    expect(pathsOf(bad2)).toContain("priceCents");
    await expectCode(await call(o.req, "POST", "/v1/erp/products", { type: "SIMPLE", name: "Outra", unit: "UN", priceCents: 100, sku }), 409, "SKU_TAKEN", "SKU repetido");
    await expectCode(await call(o.req, "POST", "/v1/erp/products", { type: "SIMPLE", name: "Outra", unit: "UN", priceCents: 100, barcode: ean }), 409, "BARCODE_TAKEN", "código de barras repetido");
    const semCodigo = await product(o.req, { name: "Sem código" });
    const gen = await ok<any>(await call(o.req, "POST", `/v1/erp/products/${semCodigo.id}/barcode`), "gerar código interno");
    expect(String(gen.barcode), "código interno começa com 2").toMatch(/^2\d{12}$/);
    expect(isGtin(gen.barcode), "código interno com dígito verificador certo").toBe(true);
    const list = items<any>(await ok(await call(o.req, "GET", `/v1/erp/products?q=${ean}`), "busca pelo código de barras"));
    expect(list.map((x) => x.id), "acha pelo código de barras").toEqual([p.id]);
  });

  test("API: grade cor × tamanho cria as variações e mudar a grade arquiva sem apagar", async ({ browser }) => {
    const o = await owner(browser);
    const base = `CAM${uniq().toUpperCase().slice(0, 5)}`;
    const p = await product(o.req, { type: "VARIANT", name: "Camiseta básica", sku: base, priceCents: 4990, attributes: [{ name: "Cor", values: ["Azul", "Preto"] }, { name: "Tamanho", values: ["P", "M", "G"] }] }, "produto com grade");
    expect(p.variations?.length, "2 cores × 3 tamanhos").toBe(6);
    expect(p.variations.map((v: any) => v.sku), "SKU de cada variação").toEqual(expect.arrayContaining([`${base}-AZUL-P`, `${base}-PRETO-G`]));
    const azulP = p.variations.find((v: any) => v.sku === `${base}-AZUL-P`);
    expect([azulP.variantLabel, azulP.priceCents], "label e preço herdado").toEqual(["Azul / P", 4990]);
    await stockIn(o.req, azulP.id, 3, 2000);
    await expectCode(await order(o.req, { items: [{ productId: p.id, qty: 1 }] }), 400, "NOT_SELLABLE", "vender o pai da grade");
    const ch = await ok<any>(await call(o.req, "PATCH", `/v1/erp/products/${p.id}`, { attributes: [{ name: "Cor", values: ["Azul", "Branco"] }, { name: "Tamanho", values: ["P", "M", "G"] }] }), "trocar Preto por Branco");
    expect([ch.variantsChange?.created?.length, ch.variantsChange?.archived?.length], "3 novas e 3 arquivadas").toEqual([3, 3]);
    const after = await getProduct(o.req, p.id);
    const byLabel = (l: string) => after.variations.find((v: any) => v.variantLabel === l);
    expect(byLabel("Azul / P")?.id, "Azul / P continua com o mesmo id").toBe(azulP.id);
    expect(byLabel("Azul / P")?.stock?.onHand, "e com o saldo").toBe(3);
    expect(byLabel("Preto / M")?.status, "Preto sai da grade arquivado, não apagado").toBe("ARCHIVED");
    expect(byLabel("Branco / G")?.status, "Branco entra").toBe("ACTIVE");
    await expectCode(await call(o.req, "POST", "/v1/erp/products", { type: "VARIANT", name: "Errada", unit: "UN", priceCents: 100, attributes: [{ name: "Cor", values: ["Azul", "azul"] }] }), 400, "VALIDATION_ERROR", "valor repetido na grade");
  });

  test("API: preços — tabela de atacado, faixas por quantidade e vale o menor", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "erp_pricing");
    const atacado = await ok<any>(await call(o.req, "POST", "/v1/erp/price-tables", { name: "Atacado", kind: "PERCENT", pct: -15 }), "tabela atacado −15%");
    const bad = await expectCode(await call(o.req, "POST", "/v1/erp/products", { type: "SIMPLE", name: "X", unit: "UN", priceCents: 1000, tiers: [{ minQty: 50, priceCents: 800 }, { minQty: 10, priceCents: 900 }] }), 400, "VALIDATION_ERROR", "faixas fora de ordem");
    expect(pathsOf(bad)).toContain("tiers.1.minQty");
    const p = await product(o.req, { priceCents: 1000, tiers: [{ minQty: 10, priceCents: 900 }, { minQty: 50, priceCents: 800 }] });
    const price = async (qty: number, tableId?: string) => ok<any>(await call(o.req, "GET", `/v1/erp/price?productId=${p.id}&qty=${qty}${tableId ? `&tableId=${tableId}` : ""}`), `preço de ${qty}`);
    expect([(await price(9)).unitCents, (await price(9)).source], "9 un: tabela").toEqual([1000, "table"]);
    expect([(await price(10)).unitCents, (await price(10)).source], "10 un: faixa").toEqual([900, "tier"]);
    expect((await price(50)).unitCents, "50 un").toBe(800);
    expect([(await price(10, atacado.id)).unitCents, (await price(10, atacado.id)).source], "atacado 850 vence a faixa de 900").toEqual([850, "table"]);
    expect((await price(60, atacado.id)).unitCents, "faixa de 800 vence o atacado").toBe(800);
    const q = await ok<any>(await order(o.req, { items: [{ productId: p.id, qty: 10 }] }), "orçamento de 10");
    expect([q.items[0].unitCents, q.items[0].priceSource], "pedido usa a faixa").toEqual([900, "tier"]);
  });

  test("API: estoque — custo médio, sem negativo, transferência, inventário e extrato", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "erp_pricing");
    const main = await mainWarehouse(o.req);
    const p = await product(o.req, { costCents: 1000 });
    await stockIn(o.req, p.id, 10, 1000);
    const r = await ok<any>(await move(o.req, { type: "IN", productId: p.id, warehouseId: main, qty: 30, unitCostCents: 1200 }), "entrada 30 a R$ 12");
    expect([r.balance.onHand, r.balance.avgCostCents], "40 un a custo médio R$ 11,50").toEqual([40, 1150]);
    const neg = await expectCode(await move(o.req, { type: "OUT", productId: p.id, warehouseId: main, qty: 41, reason: "perda" }), 409, "INSUFFICIENT_STOCK", "saída acima do saldo");
    expect(neg.items?.[0]?.missing, "falta 1").toBe(1);
    await expectCode(await move(o.req, { type: "IN", productId: p.id, warehouseId: main, qty: 1.5 }), 400, "VALIDATION_ERROR", "fração em unidade inteira (UN)");
    const loja = await ok<any>(await call(o.req, "POST", "/v1/erp/warehouses", { name: "Loja", code: `L${uniq().slice(0, 4).toUpperCase()}` }), "depósito Loja");
    await ok(await call(o.req, "POST", "/v1/erp/stock/transfers", { fromWarehouseId: main, toWarehouseId: loja.id, items: [{ productId: p.id, qty: 5 }] }), "transferir 5");
    const byW = (await stockOf(o.req, p.id)).byWarehouse as any[];
    expect([byW.find((w) => w.warehouseId === main)?.onHand, byW.find((w) => w.warehouseId === loja.id)?.onHand], "35 no Principal e 5 na Loja").toEqual([35, 5]);
    await expectCode(await call(o.req, "POST", "/v1/erp/stock/transfers", { fromWarehouseId: loja.id, toWarehouseId: main, items: [{ productId: p.id, qty: 6 }] }), 409, "INSUFFICIENT_STOCK", "transferir mais que o disponível");
    const inv = await ok<any>(await call(o.req, "POST", "/v1/erp/inventories", { warehouseId: main }), "abrir inventário");
    await ok(await call(o.req, "PUT", `/v1/erp/inventories/${inv.id}/counts`, { counts: [{ productId: p.id, counted: 33 }] }), "contagem");
    const ap = await ok<any>(await call(o.req, "POST", `/v1/erp/inventories/${inv.id}/apply`), "aplicar");
    expect(ap.adjustments.map((a: any) => [a.expected, a.counted, a.diff]), "ajuste de −2").toEqual([[35, 33, -2]]);
    expect((await call(o.req, "POST", `/v1/erp/inventories/${inv.id}/apply`)).status(), "aplicar de novo → 409").toBe(409);
    expect((await stockOf(o.req, p.id)).onHand, "33 + 5 = 38 no total").toBe(38);
    const ext = await ok<any>(await call(o.req, "GET", `/v1/erp/products/${p.id}/movements`), "extrato");
    expect(items<any>(ext).map((m) => m.type), "extrato com cada movimentação").toEqual(expect.arrayContaining(["IN", "TRANSFER_OUT", "TRANSFER_IN", "INVENTORY"]));
    const serv = await product(o.req, { type: "SERVICE", name: "Instalação", unit: "H" });
    await expectCode(await move(o.req, { type: "IN", productId: serv.id, warehouseId: main, qty: 1 }), 400, "NOT_STOCKABLE", "serviço não tem estoque");
  });

  test("API: kit — disponível pelo componente mais escasso e a venda baixa os componentes", async ({ browser }) => {
    const o = await owner(browser);
    const caneta = await product(o.req, { name: "Caneta" }), caderno = await product(o.req, { name: "Caderno" });
    await stockIn(o.req, caneta.id, 9); await stockIn(o.req, caderno.id, 10);
    await expectCode(await call(o.req, "POST", "/v1/erp/products", { type: "KIT", name: "Kit", unit: "UN", priceCents: 100, components: [{ productId: caneta.id, qty: 1 }, { productId: caneta.id, qty: 2 }] }), 400, "VALIDATION_ERROR", "componente repetido");
    const kit = await product(o.req, { type: "KIT", name: "Kit escritório", priceCents: 2990, components: [{ productId: caneta.id, qty: 2 }, { productId: caderno.id, qty: 1 }] });
    expect(kit.stock?.available, "9 canetas / 2 = 4 kits").toBe(4);
    await expectCode(await move(o.req, { type: "IN", productId: kit.id, warehouseId: await mainWarehouse(o.req), qty: 1 }), 400, "NOT_STOCKABLE", "kit não tem estoque próprio");
    await delivered(o.req, { items: [{ productId: kit.id, qty: 2 }] });
    expect([(await stockOf(o.req, caneta.id)).onHand, (await stockOf(o.req, caderno.id)).onHand], "baixou 4 canetas e 2 cadernos").toEqual([5, 8]);
    expect((await stockOf(o.req, kit.id)).available, "agora 2 kits").toBe(2);
  });

  test("API: orçamento vira pedido — totais com rateio, reserva, entrega, cancelamento e vencido", async ({ browser }) => {
    const o = await owner(browser);
    const a = await product(o.req, { name: "Item A", priceCents: 1000 }), b = await product(o.req, { name: "Café (kg)", unit: "KG", priceCents: 333 });
    await stockIn(o.req, a.id, 20); await stockIn(o.req, b.id, 10);
    const q = await ok<any>(await order(o.req, { items: [{ productId: a.id, qty: 3, discountPct: 10 }, { productId: b.id, qty: 1.5, discountCents: 100 }], discountCents: 101, freightCents: 1500 }), "orçamento");
    expect(String(q.code), "código V-0001").toMatch(/^V-0001\b/);
    expect([q.status, q.totals.subtotalCents, q.totals.itemDiscountCents, q.totals.globalDiscountCents, q.totals.freightCents, q.totals.totalCents], "totais").toEqual(["QUOTE", 3500, 400, 101, 1500, 4499]);
    expect(q.items.reduce((s: number, l: any) => s + l.netCents, 0), "rateio do desconto geral soma exato").toBe(2999);
    await expectCode(await order(o.req, { items: [{ productId: a.id, qty: 1.5 }] }), 400, "VALIDATION_ERROR", "fração em UN");
    expect((await stockOf(o.req, a.id)).available, "orçamento não reserva").toBe(20);
    const c = await ok<any>(await call(o.req, "POST", `/v1/erp/orders/${q.id}/confirm`), "confirmar");
    expect(c.status).toBe("CONFIRMED");
    expect([(await stockOf(o.req, a.id)).onHand, (await stockOf(o.req, a.id)).reserved, (await stockOf(o.req, a.id)).available], "reservou 3").toEqual([20, 3, 17]);
    await expectCode(await call(o.req, "PATCH", `/v1/erp/orders/${q.id}`, { freightCents: 0 }), 409, "INVALID_TRANSITION", "editar pedido confirmado");
    const big = await ok<any>(await order(o.req, { items: [{ productId: a.id, qty: 18 }] }), "orçamento de 18");
    const ins = await expectCode(await call(o.req, "POST", `/v1/erp/orders/${big.id}/confirm`), 409, "INSUFFICIENT_STOCK", "18 com 17 disponíveis");
    expect(ins.items?.[0]?.missing, "falta 1").toBe(1);
    const d = await ok<any>(await call(o.req, "POST", `/v1/erp/orders/${q.id}/deliver`), "entregar");
    expect(d.status).toBe("DELIVERED");
    expect([(await stockOf(o.req, a.id)).onHand, (await stockOf(o.req, a.id)).reserved], "baixou e tirou a reserva").toEqual([17, 0]);
    expect((await stockOf(o.req, b.id)).onHand, "1,5 kg baixado").toBe(8.5);
    await expectCode(await call(o.req, "POST", `/v1/erp/orders/${q.id}/cancel`, { reason: "x" }), 409, "INVALID_TRANSITION", "cancelar entregue");
    const two = await ok<any>(await order(o.req, { status: "CONFIRMED", items: [{ productId: a.id, qty: 2 }] }), "pedido de 2");
    expect((await stockOf(o.req, a.id)).available, "reservou 2").toBe(15);
    await ok(await call(o.req, "POST", `/v1/erp/orders/${two.id}/cancel`, { reason: "Cliente desistiu" }), "cancelar");
    expect((await stockOf(o.req, a.id)).available, "cancelar libera").toBe(17);
    const old = await ok<any>(await order(o.req, { items: [{ productId: a.id, qty: 1 }], validUntil: addDays(today(), -1) }), "orçamento vencido");
    expect(old.status, "vencido sem job").toBe("EXPIRED");
    await expectCode(await call(o.req, "POST", `/v1/erp/orders/${old.id}/confirm`), 409, "QUOTE_EXPIRED", "confirmar vencido");
  });

  test("API: limite de crédito do cliente e desconto do vendedor", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const p = await product(o.req, { priceCents: 10000, costCents: 6000 });
    await stockIn(o.req, p.id, 100, 6000);
    await expectCode(await call(o.req, "POST", "/v1/erp/parties", { kinds: ["CUSTOMER"], name: "Doc ruim", document: "11.222.333/0001-82" }), 400, "VALIDATION_ERROR", "CNPJ inválido");
    const cli = await ok<any>(await call(o.req, "POST", "/v1/erp/parties", { kinds: ["CUSTOMER"], name: "Mercado Bom Preço", document: "11.222.333/0001-81", creditLimitCents: 100000 }), "cliente com limite R$ 1.000");
    await expectCode(await call(o.req, "POST", "/v1/erp/parties", { kinds: ["SUPPLIER"], name: "Repetido", document: "11222333000181" }), 409, "DOCUMENT_TAKEN", "documento repetido");
    await delivered(o.req, { customerId: cli.id, items: [{ productId: p.id, qty: 7 }], payment: { method: "ON_ACCOUNT" } });
    const party = items<any>(await ok(await call(o.req, "GET", "/v1/erp/parties?q=Bom"), "clientes")).find((x) => x.id === cli.id);
    expect(party?.openCents, "R$ 700 em aberto no fiado").toBe(70000);
    const over = await ok<any>(await order(o.req, { customerId: cli.id, items: [{ productId: p.id, qty: 3 }], freightCents: 1, payment: { method: "ON_ACCOUNT" } }), "fiado de R$ 300,01");
    const lim = await expectCode(await call(o.req, "POST", `/v1/erp/orders/${over.id}/confirm`), 422, "CREDIT_LIMIT", "passa do limite");
    expect(lim.availableCents, "disponível R$ 300").toBe(30000);
    const cash = await ok<any>(await order(o.req, { customerId: cli.id, items: [{ productId: p.id, qty: 3 }], freightCents: 1, payment: { method: "PIX" } }), "à vista");
    await ok(await call(o.req, "POST", `/v1/erp/orders/${cash.id}/confirm`), "à vista não usa o limite");

    const S = await addMember(browser, request, o.req, "vendedor", ["SELLER"]);
    await expectCode(await order(S.req, { items: [{ productId: p.id, qty: 1, discountPct: 15 }] }), 422, "DISCOUNT_ABOVE_LIMIT", "vendedor com 15%");
    await ok(await order(S.req, { items: [{ productId: p.id, qty: 1, discountPct: 10 }] }), "vendedor com 10%");
    await ok(await order(o.req, { items: [{ productId: p.id, qty: 1, discountPct: 15 }] }), "admin com 15%");
    expect((await getProduct(S.req, p.id)).costCents, "vendedor não vê custo").toBeNull();
  });

  test("API: devolução parcial volta ao estoque com o valor proporcional", async ({ browser }) => {
    const o = await owner(browser);
    const p = await product(o.req, { priceCents: 1000 });
    await stockIn(o.req, p.id, 10);
    const quote = await ok<any>(await order(o.req, { items: [{ productId: p.id, qty: 3 }] }), "orçamento");
    await expectCode(await call(o.req, "POST", `/v1/erp/orders/${quote.id}/returns`, { items: [{ lineId: quote.items[0].id, qty: 1 }], refundMethod: "CASH" }), 409, "INVALID_TRANSITION", "devolver o que não foi entregue");
    const d = await delivered(o.req, { items: [{ productId: p.id, qty: 3, discountPct: 10 }] });
    const line = d.items[0];
    const r = await ok<any>(await call(o.req, "POST", `/v1/erp/orders/${d.id}/returns`, { items: [{ lineId: line.id, qty: 2 }], refundMethod: "CASH", reason: "Defeito" }), "devolver 2");
    expect(r.refundCents, "2 de 3 do líquido de R$ 27,00").toBe(1800);
    expect((await stockOf(o.req, p.id)).onHand, "7 + 2").toBe(9);
    const bad = await expectCode(await call(o.req, "POST", `/v1/erp/orders/${d.id}/returns`, { items: [{ lineId: line.id, qty: 2 }], refundMethod: "CASH" }), 422, "RETURN_RULES", "devolver mais que o vendido");
    expect(violationsOf(bad)).toContain("RETURN_QTY_EXCEEDED");
  });

  test("API: PDV — caixa, leitura, troco só em dinheiro, venda sem duplicar e fechamento cego", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "erp_pdv");
    let regs = items<any>(await ok(await call(o.req, "GET", "/v1/erp/registers"), "caixas"));
    if (!regs.length) regs = [await ok<any>(await call(o.req, "POST", "/v1/erp/registers", { name: "Caixa 1", warehouseId: await mainWarehouse(o.req) }), "criar caixa")];
    const ses = await ok<any>(await call(o.req, "POST", "/v1/erp/pdv/sessions", { registerId: regs[0].id, openingCents: 10000 }), "abrir caixa com R$ 100");
    await expectCode(await call(o.req, "POST", "/v1/erp/pdv/sessions", { registerId: regs[0].id, openingCents: 0 }), 409, "SESSION_OPEN", "abrir de novo");
    const ean = randomEan();
    const p = await product(o.req, { name: "Refrigerante 2L", priceCents: 2375, barcode: ean });
    await stockIn(o.req, p.id, 10);
    const lk = await ok<any>(await call(o.req, "GET", `/v1/erp/pdv/lookup?code=${ean}`), "leitura pelo código");
    expect([lk.product?.id, lk.product?.priceCents], "achou pelo código de barras").toEqual([p.id, 2375]);
    await expectCode(await call(o.req, "GET", "/v1/erp/pdv/lookup?code=0000000000000"), 404, "PRODUCT_NOT_FOUND", "código inexistente");
    const sale = (payments: unknown[], key = `k-${uniq()}`) => callKey(o.req, "/v1/erp/pdv/sales", { sessionId: ses.id, items: [{ productId: p.id, qty: 2 }], payments }, key);
    expect(violationsOf(await expectCode(await sale([{ method: "CREDIT", amountCents: 5000 }]), 422, "PAYMENT_RULES", "cartão acima do total")), "troco só em dinheiro").toContain("OVERPAY_NON_CASH");
    expect(violationsOf(await expectCode(await sale([{ method: "CASH", amountCents: 4000 }]), 422, "PAYMENT_RULES", "falta pagar")), "pago a menos").toContain("UNDERPAID");
    const key = `k-${uniq()}`;
    const v1 = await ok<any>(await sale([{ method: "PIX", amountCents: 2000 }, { method: "CASH", amountCents: 3000 }], key), "vender com Pix + dinheiro");
    expect([v1.changeCents, v1.order?.status, v1.order?.channel, v1.order?.totals?.totalCents], "troco R$ 2,50, entregue pelo PDV").toEqual([250, "DELIVERED", "PDV", 4750]);
    const v2 = await ok<any>(await sale([{ method: "PIX", amountCents: 2000 }, { method: "CASH", amountCents: 3000 }], key), "clique duplo (mesma chave)");
    expect(v2.order?.id, "mesma venda").toBe(v1.order.id);
    expect((await stockOf(o.req, p.id)).onHand, "baixou 2, não 4").toBe(8);
    await ok(await call(o.req, "POST", `/v1/erp/pdv/sessions/${ses.id}/movements`, { type: "WITHDRAWAL", amountCents: 5000, reason: "Sangria" }), "sangria R$ 50");
    await ok(await call(o.req, "POST", `/v1/erp/pdv/sessions/${ses.id}/movements`, { type: "SUPPLY", amountCents: 2000, reason: "Troco" }), "suprimento R$ 20");
    const cl = await ok<any>(await call(o.req, "POST", `/v1/erp/pdv/sessions/${ses.id}/close`, { countedCents: 9700 }), "fechar contando R$ 97,00");
    expect([cl.expectedCents, cl.diffCents, cl.status], "esperado 100 + 27,50 − 50 + 20 = 97,50").toEqual([9750, -50, "SHORT"]);
    expect(cl.summary?.PIX?.salesCents, "Pix no resumo").toBe(2000);
    const after = await sale([{ method: "CASH", amountCents: 5000 }]);
    expect(after.status(), "caixa fechado não vende").toBe(409);
    expect(["NO_OPEN_SESSION", "SESSION_CLOSED"]).toContain((await after.json()).code);
  });

  test("API: compras — recebimento parcial, frete rateado no custo e custo médio", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "erp_purchases");
    const sup = await ok<any>(await call(o.req, "POST", "/v1/erp/parties", { kinds: ["SUPPLIER"], name: "Distribuidora Sul", document: "11.444.777/0001-61" }), "fornecedor");
    const a = await product(o.req, { name: "Item A" }), b = await product(o.req, { name: "Item B" });
    await stockIn(o.req, a.id, 10, 1200);
    const pc = await ok<any>(await call(o.req, "POST", "/v1/erp/purchases", { supplierId: sup.id, items: [{ productId: a.id, qty: 10, unitCostCents: 1000 }, { productId: b.id, qty: 2, unitCostCents: 5000 }], freightCents: 2000 }), "pedido de compra");
    expect([String(pc.code), pc.status], "C-0001 aberto").toEqual([expect.stringMatching(/^C-0001\b/), expect.stringMatching(/^(DRAFT|SENT|OPEN)$/)]);
    const la = pc.items.find((l: any) => l.productId === a.id), lb = pc.items.find((l: any) => l.productId === b.id);
    const r1 = await ok<any>(await call(o.req, "POST", `/v1/erp/purchases/${pc.id}/receive`, { items: [{ lineId: la.id, qty: 6 }], extraCents: 0 }), "receber 6 de A");
    expect(r1.status, "parcial").toBe("PARTIAL");
    expect((await getProduct(o.req, a.id)).avgCostCents, "médio (10 × 12 + 6 × 10) / 16 = R$ 11,25").toBe(1125);
    const over = await expectCode(await call(o.req, "POST", `/v1/erp/purchases/${pc.id}/receive`, { items: [{ lineId: la.id, qty: 5 }] }), 422, "RECEIPT_RULES", "receber 5 dos 4 que faltam");
    expect(violationsOf(over)).toContain("OVER_RECEIPT");
    const r2 = await ok<any>(await call(o.req, "POST", `/v1/erp/purchases/${pc.id}/receive`, { items: [{ lineId: la.id, qty: 4 }, { lineId: lb.id, qty: 2 }], extraCents: 2000 }), "receber o resto com R$ 20 de frete");
    expect(r2.status, "recebido").toBe("RECEIVED");
    expect((await getProduct(o.req, b.id)).avgCostCents, "B: (10.000 + 1.429) / 2 = R$ 57,15").toBe(5715);
    expect((await getProduct(o.req, a.id)).avgCostCents, "A: (16 × 11,25 + 4 × 11,43) / 20 = R$ 11,29").toBe(1129);
    expect((await stockOf(o.req, a.id)).onHand, "10 + 6 + 4").toBe(20);
  });

  test("API: papéis — sem papel 403, custo escondido, caixa não cadastra, vendedor só vê o dele", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const S1 = await addMember(browser, request, o.req, "vend1", ["SELLER"]);
    const S2 = await addMember(browser, request, o.req, "vend2", ["SELLER"]);
    const C = await addMember(browser, request, o.req, "caixa", ["CASHIER"]);
    const N = await addMember(browser, request, o.req, "nada", null);
    const denied = await call(N.req, "GET", "/v1/erp/products");
    expect(denied.status(), "sem papel → 403").toBe(403);
    expect(["NOT_ERP_MEMBER", "APP_ACCESS_DENIED"]).toContain((await denied.json()).code);
    const p = await product(o.req, { priceCents: 2000, costCents: 800 });
    await stockIn(o.req, p.id, 10, 800);
    expect((await getProduct(C.req, p.id)).costCents, "caixa não vê custo").toBeNull();
    expect(items<any>(await ok(await call(S1.req, "GET", "/v1/erp/products"), "lista do vendedor")).find((x) => x.id === p.id)?.costCents, "nem na lista").toBeNull();
    expect((await call(C.req, "POST", "/v1/erp/products", { type: "SIMPLE", name: "x", unit: "UN", priceCents: 1 })).status(), "caixa não cadastra produto").toBe(403);
    expect((await move(S1.req, { type: "IN", productId: p.id, warehouseId: await mainWarehouse(o.req), qty: 1 })).status(), "vendedor não movimenta estoque").toBe(403);
    const mine = await ok<any>(await order(S1.req, { items: [{ productId: p.id, qty: 1 }] }), "vendedor 1 orça");
    expect((await call(S2.req, "GET", `/v1/erp/orders/${mine.id}`)).status(), "vendedor 2 não vê").toBe(404);
    expect(items<any>(await ok(await call(S2.req, "GET", "/v1/erp/orders"), "lista do vendedor 2")).some((x) => x.id === mine.id), "nem na lista").toBe(false);
    expect((await call(o.req, "GET", `/v1/erp/orders/${mine.id}`)).status(), "admin vê").toBe(200);
    const em = await ok<any>(await call(o.req, "GET", "/v1/me"), "me");
    await expectCode(await call(o.req, "PUT", `/v1/erp/roles/${em.user.id}`, { roles: ["SELLER"] }), 409, "OWNER_IS_ERP_ADMIN", "owner continua ERP_ADMIN");
    const other = await newContext(browser);
    await register(other.request, newUser("outra"));
    expect((await call(other.request, "GET", `/v1/erp/products/${p.id}`)).status(), "produto de outra empresa").toBe(404);
  });

  test("API: integração — venda entregue a prazo vira contas a receber no Financeiro", async ({ browser }) => {
    const o = await owner(browser);
    test.skip((await call(o.req, "GET", "/v1/fin/me")).status() === 404, "projeto sem o Financeiro");
    const p = await product(o.req, { priceCents: 10000 });
    await stockIn(o.req, p.id, 5);
    const first = addDays(today(), 30);
    const d = await delivered(o.req, { items: [{ productId: p.id, qty: 1 }], payment: { method: "BOLETO", installments: 3, firstDue: first } });
    expect(d.payment?.schedule?.map((x: any) => x.amountCents), "parcelas com o centavo na 1ª").toEqual([3334, 3333, 3333]);
    const code = String(d.code);
    await expect.poll(async () => items<any>(await ok(await call(o.req, "GET", "/v1/fin/entries?type=INCOME"), "contas a receber")).filter((e) => String(e.description).includes(code)).map((e) => e.amountCents).sort((a, b) => b - a), { message: "uma conta a receber por parcela" }).toEqual([3334, 3333, 3333]);
  });

  test("API: relatório — curva ABC das vendas", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "erp_reports");
    const ids: Record<string, string> = {};
    // b com 20% de desconto (vale o líquido, R$ 20,00); d vende 2 e volta 1 (vale R$ 4,00 e 1 unidade)
    for (const [k, price, qty, discountPct] of [["a", 7000, 1, 0], ["b", 2500, 1, 20], ["c", 600, 1, 0], ["d", 400, 2, 0]] as const) {
      const p = await product(o.req, { name: `ABC ${k}`, priceCents: price });
      ids[k] = p.id;
      await stockIn(o.req, p.id, qty);
      const d = await delivered(o.req, { items: [{ productId: p.id, qty, ...(discountPct ? { discountPct } : {}) }] });
      if (k === "d") await ok(await call(o.req, "POST", `/v1/erp/orders/${d.id}/returns`, { items: [{ lineId: d.items[0].id, qty: 1 }], refundMethod: "CASH" }), "devolver 1 de d");
    }
    const r = await ok<any>(await call(o.req, "GET", `/v1/erp/reports/abc?from=${today()}&to=${today()}`), "curva ABC");
    const row = (k: string) => r.rows.find((x: any) => x.productId === ids[k]);
    expect([row("b")?.valueCents, row("d")?.valueCents, row("d")?.qty], "líquido do desconto e menos a devolução").toEqual([2000, 400, 1]);
    expect(["a", "b", "c", "d"].map((k) => row(k)?.class), "70% A, 20% A (cruza 80%), 6% B, 4% C").toEqual(["A", "A", "B", "C"]);
  });

  test("Tela: cadastrar produto pelo formulário com margem ao vivo e saldo inicial", async ({ browser }) => {
    const o = await owner(browser);
    const page = await o.ctx.newPage();
    await page.goto("/erp");
    await expect(page.getByTestId("erp-home"), "Início do ERP").toBeVisible();
    await page.goto("/erp/produtos");
    await page.getByTestId("erp-product-new").click();
    const f = page.getByTestId("erp-product-form");
    await expect(f).toBeVisible();
    const name = `Garrafa térmica ${uniq()}`;
    await f.getByTestId("erp-product-type").selectOption("SIMPLE");
    await f.getByTestId("erp-product-name").fill(name);
    await f.getByTestId("erp-product-unit").selectOption("UN");
    await f.getByTestId("erp-product-price").fill("25,90");
    await f.getByTestId("erp-product-cost").fill("10,00");
    await expect(f.getByTestId("erp-product-margin"), "margem ao vivo").toContainText("61,4");
    await f.getByTestId("erp-product-initial-stock").fill("12");
    await f.getByTestId("erp-product-save").click();
    const row = page.locator('[data-testid="erp-product-row"][data-type="SIMPLE"]', { hasText: name });
    await expect(row, "produto na lista").toBeVisible();
    await expect(row.getByTestId("erp-product-stock"), "saldo inicial").toContainText("12");
    const id = await row.getAttribute("data-id");
    const p = await getProduct(o.req, String(id));
    expect([p.priceCents, p.costCents, p.stock.onHand], "centavos certos e saldo como movimentação").toEqual([2590, 1000, 12]);
  });

  test("Tela: PDV — abrir caixa, ler o código, pagar em dinheiro com troco e ver o comprovante", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "erp_pdv");
    const regs = items<any>(await ok(await call(o.req, "GET", "/v1/erp/registers"), "caixas"));
    if (!regs.length) await ok(await call(o.req, "POST", "/v1/erp/registers", { name: "Caixa 1", warehouseId: await mainWarehouse(o.req) }), "criar caixa");
    const ean = randomEan();
    const p = await product(o.req, { name: "Biscoito", priceCents: 2375, barcode: ean });
    await stockIn(o.req, p.id, 10);
    const page = await o.ctx.newPage();
    await page.goto("/erp/pdv");
    const open = page.getByTestId("pdv-open-form");
    await expect(open, "pede para abrir o caixa").toBeVisible();
    await page.getByTestId("pdv-opening").fill("100,00");
    await page.getByTestId("pdv-open-submit").click();
    const scan = page.getByTestId("pdv-scan");
    await expect(scan, "campo de leitura").toBeVisible();
    await scan.fill(`2*${ean}`);
    await scan.press("Enter");
    await expect(page.locator(`[data-testid="pdv-line"][data-product="${p.id}"]`), "item lido").toBeVisible();
    await expect(page.getByTestId("pdv-total"), "2 × R$ 23,75").toHaveAttribute("data-cents", "4750");
    await scan.fill("0000000000000");
    await scan.press("Enter");
    await expect(page.locator('[data-testid="pdv-error"][data-code="PRODUCT_NOT_FOUND"]'), "código inexistente avisa").toBeVisible();
    await page.getByTestId("pdv-pay").click();
    await page.locator('[data-testid="pdv-payment-method"][data-method="CASH"]').click();
    await page.getByTestId("pdv-payment-amount").fill("50,00");
    await page.getByTestId("pdv-payment-add").click();
    await expect(page.getByTestId("pdv-change"), "troco R$ 2,50").toHaveAttribute("data-cents", "250");
    await page.getByTestId("pdv-finish").click();
    await expect(page.getByTestId("pdv-receipt"), "comprovante").toBeVisible();
    await expect(page.getByTestId("pdv-receipt"), "sem valor fiscal").toContainText(/sem valor fiscal/i);
    expect((await stockOf(o.req, p.id)).onHand, "baixou 2").toBe(8);
  });
});
