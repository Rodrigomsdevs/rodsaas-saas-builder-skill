import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, signUp } from "../support/ui";

// Add-on fiscal (/rodsaas:fiscal): o motor de NF-e/NFC-e com o driver falso em homologação. Roda quando rodsaas.json
// tem "fiscal" em addons ou a API tem /v1/fiscal/issuer. Confere o que mais se simplifica: validar antes de numerar,
// numeração sem buraco nem repetição, chave com DV, CFOP pelo destino, rateio, rejeição corrigível com o mesmo número,
// prazos e eventos, inutilização, contingência da NFC-e e a ligação com o ERP.

async function installed(req: APIRequestContext) {
  if (cfg.addons.includes("fiscal")) return true;
  return (await call(req, "GET", "/v1/fiscal/issuer")).status() !== 404;
}
async function expectCode(res: APIResponse, status: number, code: string, label: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  const json = JSON.parse(body || "{}");
  expect(json.code, `${label}: code`).toBe(code);
  return json;
}
const pathsOf = (b: any) => (b?.errors ?? []).map((e: any) => e.path) as string[];
async function ensureFeature(req: APIRequestContext, feature: string) {
  const plan: any = (await me(req)).plan;
  if (plan?.features?.includes(feature)) return;
  const mode = await billingMode(req);
  test.skip(mode !== "fake", `"${feature}" exige plano pago e a cobrança está em modo "${mode}"`);
  const target = (await plansFromApi(req)).paid.find((p) => p.features?.includes(feature));
  test.skip(!target, `nenhum plano com a feature ${feature}`);
  await ok(await call(req, "POST", "/v1/billing/checkout-sessions", { plan: target!.id, interval: "month" }), `assinar plano com ${feature} (modo de teste)`);
}
/** POST com Idempotency-Key (clique duplo em Emitir não pode gastar dois números). */
const callKey = (req: APIRequestContext, path: string, data: unknown, key = uniq()) =>
  req.fetch(cfg.apiURL + path, { method: "POST", headers: { Origin: cfg.webURL, "Content-Type": "application/json", "Idempotency-Key": key }, data: JSON.stringify(data), failOnStatusCode: false });

/** Chave de acesso: 44 dígitos e DV módulo 11 (pesos 2..9 da direita para a esquerda). */
function parseKey(key: string) {
  expect(key, "chave de acesso com 44 dígitos").toMatch(/^\d{44}$/);
  let s = 0, w = 2;
  for (let i = 42; i >= 0; i--) { s += Number(key[i]) * w; w = w === 9 ? 2 : w + 1; }
  const r = s % 11;
  expect(Number(key[43]), "dígito verificador da chave").toBe(r < 2 ? 0 : 11 - r);
  return { uf: key.slice(0, 2), cnpj: key.slice(6, 20), model: Number(key.slice(20, 22)), series: Number(key.slice(22, 25)), number: Number(key.slice(25, 34)), emissionType: Number(key[34]) };
}
const CNPJ = "11222333000181";
const ISSUER = { cnpj: "11.222.333/0001-81", legalName: "Loja Teste Ltda", tradeName: "Loja Teste", ie: "9012345678", uf: "PR", cityCode: "4115200", address: { street: "Av. Brasil", number: "100", district: "Centro", city: "Maringá", cityCode: "4115200", uf: "PR", zip: "87013-000" }, regime: "SIMPLES", driver: "fake" };
const ANA = { document: "529.982.247-25", name: "Ana Souza", uf: "PR" };
const BETO = { document: "111.444.777-35", name: "Beto Lima", uf: "SP" };
const item = (o: Record<string, unknown> = {}) => ({ description: "Camiseta básica", ncm: "61091000", unit: "UN", qty: 1, unitCents: 5000, ...o });

async function setup(req: APIRequestContext, extra: Record<string, unknown> = {}) {
  await ensureFeature(req, "fiscal");
  return ok<any>(await call(req, "PUT", "/v1/fiscal/issuer", { ...ISSUER, ...extra }), "configurar o emitente");
}
const emitRaw = (req: APIRequestContext, body: Record<string, unknown>, key?: string) => callKey(req, "/v1/fiscal/documents", body, key);
async function emit(req: APIRequestContext, body: Record<string, unknown>, label = "emitir") {
  const r = await emitRaw(req, body);
  const txt = await r.text();
  expect(r.status(), `${label} → HTTP ${r.status()}: ${txt.slice(0, 400)}`).toBe(201);
  return JSON.parse(txt);
}
const nfe = (req: APIRequestContext, o: Record<string, unknown> = {}, label = "NF-e") => emit(req, { model: 55, recipient: ANA, items: [item()], payments: [{ method: "PIX", amountCents: 5000 }], ...o }, label);
const nfce = (req: APIRequestContext, o: Record<string, unknown> = {}, label = "NFC-e") => emit(req, { model: 65, items: [item()], payments: [{ method: "CASH", amountCents: 5000 }], ...o }, label);
const getDoc = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/fiscal/documents/${id}`), "nota");
const J = "Cliente desistiu da compra no balcão";

test.describe("Fiscal", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o add-on fiscal");
  });

  test("API: emitente — campos validados, regras do Simples criadas uma vez e credenciais nunca voltam", async ({ request }) => {
    await register(request, newUser("fiscemit"));
    await ensureFeature(request, "fiscal");
    const empty = await ok<any>(await call(request, "GET", "/v1/fiscal/issuer"), "emitente vazio");
    expect(empty.configured, "nasce sem emitente").toBe(false);
    await expectCode(await emitRaw(request, { model: 55, recipient: ANA, items: [item()] }), 409, "ISSUER_NOT_CONFIGURED", "emitir sem emitente");
    const bad = await expectCode(await call(request, "PUT", "/v1/fiscal/issuer", { ...ISSUER, cnpj: "11.222.333/0001-82", uf: "XX", cityCode: "123" }), 400, "VALIDATION_ERROR", "emitente inválido");
    expect(pathsOf(bad)).toEqual(expect.arrayContaining(["cnpj", "uf", "cityCode"]));
    expect(pathsOf(await expectCode(await call(request, "PUT", "/v1/fiscal/issuer", { ...ISSUER, ie: " " }), 400, "VALIDATION_ERROR", "sem IE"))).toContain("ie");
    expect(pathsOf(await expectCode(await call(request, "PUT", "/v1/fiscal/issuer", { ...ISSUER, driver: "nao-existe" }), 400, "VALIDATION_ERROR", "driver desconhecido"))).toContain("driver");
    const res = await call(request, "PUT", "/v1/fiscal/issuer", { ...ISSUER, credentials: { token: "segredo-que-nao-volta-123" }, nfceCsc: { id: "1", csc: "CSC-SECRETO-999" } });
    const raw = await res.text();
    expect(res.status(), raw.slice(0, 300)).toBe(200);
    expect(raw, "credencial não volta").not.toContain("segredo-que-nao-volta-123");
    expect(raw, "CSC não volta").not.toContain("CSC-SECRETO-999");
    const iss = JSON.parse(raw);
    expect(iss).toMatchObject({ configured: true, cnpj: CNPJ, uf: "PR", regime: "SIMPLES", environment: 2, driver: "fake", hasCredentials: true, hasCsc: true });
    expect(iss.nextNumbers, "numeração começa em 1").toMatchObject({ "55": 1, "65": 1 });
    const again = await ok<any>(await call(request, "GET", "/v1/fiscal/issuer"), "emitente");
    expect(JSON.stringify(again)).not.toContain("segredo-que-nao-volta-123");
    await expectCode(await call(request, "PUT", "/v1/fiscal/issuer", { ...ISSUER, environment: 1, confirmCnpj: CNPJ }), 422, "FAKE_IS_TEST_ONLY", "produção com o driver de teste");
    const rules = items<any>(await ok(await call(request, "GET", "/v1/fiscal/rules"), "regras"));
    const of = (dest: string) => rules.find((r) => r.when?.operation === "SALE" && r.when?.destination === dest && !r.when?.ncmPrefix);
    expect(of("INTERNAL")?.set?.cfop, "venda dentro do estado").toBe("5102");
    expect(of("INTERSTATE")?.set?.cfop, "venda para outro estado").toBe("6102");
    expect(of("INTERNAL")?.set?.csosn, "Simples sem crédito").toBe("102");
    await setup(request);
    expect(items<any>(await ok(await call(request, "GET", "/v1/fiscal/rules"), "regras")).length, "salvar de novo não duplica as regras").toBe(rules.length);
  });

  test("API: NF-e autorizada — chave com DV, números seguidos, CFOP pelo destino e desconto/frete rateados", async ({ request }) => {
    await register(request, newUser("fiscnfe"));
    await setup(request);
    const a = await nfe(request, { items: [item({ qty: 2, unitCents: 5000 }), item({ description: "Boné", ncm: "65050090", unitCents: 3000 })], discountCents: 1000, freightCents: 600, payments: [{ method: "PIX", amountCents: 12600 }] }, "NF-e dentro do estado");
    expect(a.status, JSON.stringify(a.rejection)).toBe("AUTHORIZED");
    expect(a.protocol, "protocolo de autorização").toBeTruthy();
    expect(a.number, "primeira nota da série").toBe(1);
    const k = parseKey(a.key);
    expect(k).toMatchObject({ uf: "41", cnpj: CNPJ, model: 55, series: 1, number: 1, emissionType: 1 });
    expect(a.items.map((i: any) => i.cfop), "CFOP de venda dentro do estado").toEqual(["5102", "5102"]);
    expect(a.items[0].csosn).toBe("102");
    expect(a.totals).toMatchObject({ productsCents: 13000, discountCents: 1000, freightCents: 600, totalCents: 12600 });
    expect(a.items.map((i: any) => i.discountCents), "desconto rateado pelo bruto, sobra no último").toEqual([769, 231]);
    expect(a.items.map((i: any) => i.freightCents), "frete rateado").toEqual([461, 139]);
    const key = uniq();
    const r1 = await emitRaw(request, { model: 55, recipient: BETO, items: [item()] }, key);
    expect(r1.status()).toBe(201);
    const b = await r1.json();
    expect(b.number, "número seguinte").toBe(2);
    expect(b.items[0].cfop, "venda para outro estado").toBe("6102");
    const r2 = await emitRaw(request, { model: 55, recipient: BETO, items: [item()] }, key);
    expect([200, 201], "repetir com a mesma Idempotency-Key").toContain(r2.status());
    expect((await r2.json()).id, "clique duplo devolve a mesma nota").toBe(b.id);
    const c = await nfe(request);
    expect(c.number, "clique duplo não gastou número").toBe(3);
    const x = await call(request, "GET", `/v1/fiscal/documents/${a.id}/xml`);
    expect(x.status()).toBe(200);
    expect(x.headers()["content-type"]).toContain("xml");
    const xml = await x.text();
    for (const t of [`Id="NFe${a.key}"`, "<CFOP>5102</CFOP>", "<vNF>126.00</vNF>", "<vDesc>10.00</vDesc>", "<vFrete>6.00</vFrete>", `<CNPJ>${CNPJ}</CNPJ>`]) expect(xml, t).toContain(t);
    const list = items<any>(await ok(await call(request, "GET", "/v1/fiscal/documents?model=55"), "notas"));
    expect(list.map((d) => d.number).sort()).toEqual([1, 2, 3]);
    expect((await ok<any>(await call(request, "GET", "/v1/fiscal/issuer"), "emitente")).nextNumbers["55"]).toBe(4);
  });

  test("API: valida antes de numerar; rejeição volta com o motivo e reenviar corrigido autoriza com o mesmo número", async ({ request }) => {
    await register(request, newUser("fiscrej"));
    await setup(request);
    const v = await expectCode(await emitRaw(request, { model: 55, recipient: { name: "Sem documento", uf: "PR" }, items: [item({ ncm: "6109", qty: 0 })] }), 400, "VALIDATION_ERROR", "nota inválida");
    expect(pathsOf(v)).toEqual(expect.arrayContaining(["recipient.document", "items.0.ncm", "items.0.qty"]));
    expect(pathsOf(await expectCode(await emitRaw(request, { model: 55, recipient: BETO, items: [item({ cfop: "5102" })] }), 400, "VALIDATION_ERROR", "CFOP 5102 para outro estado"))).toContain("items.0.cfop");
    const r = await nfe(request, { items: [item({ ncm: "00000000" })] }, "NCM inexistente");
    expect(r.status).toBe("REJECTED");
    expect(r.number, "validação não gastou número").toBe(1);
    expect(r.rejection?.code).toBe(778);
    expect(String(r.rejection?.message)).toMatch(/NCM/);
    expect((await ok<any>(await call(request, "POST", `/v1/fiscal/documents/${r.id}/transmit`), "reenviar sem corrigir")).status).toBe("REJECTED");
    const p = await ok<any>(await call(request, "PATCH", `/v1/fiscal/documents/${r.id}`, { recipient: ANA, items: [item({ ncm: "61091000" })] }), "corrigir o NCM");
    expect(p.status, "continua rejeitada até reenviar").toBe("REJECTED");
    expect(p.number, "corrigir mantém o número").toBe(1);
    const t = await ok<any>(await call(request, "POST", `/v1/fiscal/documents/${r.id}/transmit`), "reenviar");
    expect(t.status).toBe("AUTHORIZED");
    expect(t.number, "autorizada com o mesmo número").toBe(1);
    expect(parseKey(t.key).number).toBe(1);
    await expectCode(await call(request, "PATCH", `/v1/fiscal/documents/${r.id}`, { items: [item()] }), 409, "INVALID_STATUS", "editar autorizada");
    await expectCode(await call(request, "POST", `/v1/fiscal/documents/${r.id}/transmit`), 409, "INVALID_STATUS", "reenviar autorizada");
    expect((await nfe(request)).number, "a próxima segue a sequência").toBe(2);
    const d = await nfe(request, { recipient: { ...ANA, name: "DENEGAR Fulano" } }, "destinatário irregular");
    expect(d.status, "uso denegado").toBe("DENIED");
    await expectCode(await call(request, "POST", `/v1/fiscal/documents/${d.id}/transmit`), 409, "INVALID_STATUS", "reenviar denegada");
  });

  test("API: NFC-e — QR Code, só dentro do estado, identificação acima do limite e pagamento conferido", async ({ request }) => {
    await register(request, newUser("fiscnfce"));
    await setup(request, { nfceCsc: { id: "000001", csc: "TESTE-CSC-RODSAAS" } });
    const a = await nfce(request, { items: [item({ unitCents: 4990, qty: 2 })], payments: [{ method: "CASH", amountCents: 10000 }] });
    expect(a.status).toBe("AUTHORIZED");
    expect(parseKey(a.key)).toMatchObject({ model: 65, number: 1, emissionType: 1 });
    expect(a.items[0].cfop).toBe("5102");
    expect(a.totals.totalCents).toBe(9980);
    expect(String(a.qrCodeUrl), "QR Code v2: chave|2|ambiente|idCSC|hash").toContain(`p=${a.key}|2|2|1|`);
    expect(String(a.qrCodeUrl)).toMatch(/\|[0-9A-F]{40}$/);
    expect((await nfe(request)).number, "NF-e tem a própria série").toBe(1);
    expect(pathsOf(await expectCode(await emitRaw(request, { model: 65, recipient: { document: BETO.document, uf: "SP" }, items: [item()], payments: [{ method: "CASH", amountCents: 5000 }] }), 400, "VALIDATION_ERROR", "NFC-e para outro estado"))).toContain("recipient.uf");
    const big = { items: [item({ unitCents: 1_200_000 })], payments: [{ method: "PIX", amountCents: 1_200_000 }] };
    expect(pathsOf(await expectCode(await emitRaw(request, { model: 65, ...big }), 400, "VALIDATION_ERROR", "acima do limite sem CPF"))).toContain("recipient.document");
    const id = await nfce(request, { ...big, recipient: { document: ANA.document } }, "acima do limite com CPF");
    expect(id.status).toBe("AUTHORIZED");
    expect(pathsOf(await expectCode(await emitRaw(request, { model: 65, items: [item()], payments: [{ method: "CASH", amountCents: 4999 }] }), 400, "VALIDATION_ERROR", "pagamento menor que o total"))).toContain("payments");
    expect((await nfce(request)).number, "erros não gastaram número").toBe(3);
  });

  test("API: cancelamento — justificativa, prazo, repetido e só autorizada", async ({ request }) => {
    await register(request, newUser("fisccanc"));
    await setup(request);
    const a = await nfe(request);
    expect(pathsOf(await expectCode(await call(request, "POST", `/v1/fiscal/documents/${a.id}/cancel`, { justification: "curta" }), 400, "VALIDATION_ERROR", "justificativa curta"))).toContain("justification");
    const c = await ok<any>(await call(request, "POST", `/v1/fiscal/documents/${a.id}/cancel`, { justification: J }), "cancelar");
    expect(c.status).toBe("CANCELED");
    expect(c.canceledAt).toBeTruthy();
    expect(c.cancelJustification).toBe(J);
    await expectCode(await call(request, "POST", `/v1/fiscal/documents/${a.id}/cancel`, { justification: J }), 409, "INVALID_STATUS", "cancelar de novo");
    const r = await nfe(request, { items: [item({ ncm: "00000000" })] }, "rejeitada");
    await expectCode(await call(request, "POST", `/v1/fiscal/documents/${r.id}/cancel`, { justification: J }), 409, "INVALID_STATUS", "cancelar rejeitada");
    await setup(request, { cancelWindowMin: { "55": 0, "65": 30 } });
    const b = await nfe(request);
    await new Promise((ok) => setTimeout(ok, 20));
    await expectCode(await call(request, "POST", `/v1/fiscal/documents/${b.id}/cancel`, { justification: J }), 409, "CANCEL_WINDOW_EXPIRED", "fora do prazo");
    expect((await getDoc(request, b.id)).status, "fora do prazo continua autorizada").toBe("AUTHORIZED");
    const n = await nfce(request);
    expect((await ok<any>(await call(request, "POST", `/v1/fiscal/documents/${n.id}/cancel`, { justification: J }), "NFC-e no prazo dela")).status).toBe("CANCELED");
  });

  test("API: carta de correção — só NF-e autorizada, com sequência", async ({ request }) => {
    await register(request, newUser("fisccce"));
    await setup(request);
    const a = await nfe(request);
    expect(pathsOf(await expectCode(await call(request, "POST", `/v1/fiscal/documents/${a.id}/corrections`, { text: "curto" }), 400, "VALIDATION_ERROR", "texto curto"))).toContain("text");
    const c1 = await call(request, "POST", `/v1/fiscal/documents/${a.id}/corrections`, { text: "Corrige o complemento do endereço de entrega" });
    expect(c1.status()).toBe(201);
    expect((await c1.json()).sequence).toBe(1);
    const c2 = await ok<any>(await call(request, "POST", `/v1/fiscal/documents/${a.id}/corrections`, { text: "Corrige o telefone de contato do destinatário" }), "segunda carta");
    expect(c2.sequence).toBe(2);
    expect((await getDoc(request, a.id)).corrections.map((x: any) => x.sequence)).toEqual([1, 2]);
    const n = await nfce(request);
    await expectCode(await call(request, "POST", `/v1/fiscal/documents/${n.id}/corrections`, { text: "Corrige a descrição do produto vendido" }), 409, "NFE_ONLY", "carta na NFC-e");
    const r = await nfe(request, { items: [item({ ncm: "00000000" })] }, "rejeitada");
    await expectCode(await call(request, "POST", `/v1/fiscal/documents/${r.id}/corrections`, { text: "Corrige a descrição do produto vendido" }), 409, "INVALID_STATUS", "carta na rejeitada");
  });

  test("API: inutilização — faixa com número usado é recusada e a numeração pula a faixa", async ({ request }) => {
    await register(request, newUser("fiscinut"));
    await setup(request);
    expect((await nfe(request)).number).toBe(1);
    const used = await expectCode(await callKey(request, "/v1/fiscal/voids", { model: 55, from: 1, to: 3, justification: "Números pulados por falha no sistema" }), 409, "NUMBERS_IN_USE", "faixa com a nota 1");
    expect(used.numbers).toEqual([1]);
    expect(pathsOf(await expectCode(await callKey(request, "/v1/fiscal/voids", { model: 55, from: 4, to: 2, justification: "Números pulados por falha no sistema" }), 400, "VALIDATION_ERROR", "faixa invertida"))).toEqual(expect.arrayContaining(["from"]));
    expect(pathsOf(await expectCode(await callKey(request, "/v1/fiscal/voids", { model: 55, from: 2, to: 4, justification: "curta" }), 400, "VALIDATION_ERROR", "justificativa curta"))).toContain("justification");
    const v = await callKey(request, "/v1/fiscal/voids", { model: 55, from: 2, to: 4, justification: "Números pulados por falha no sistema" });
    expect(v.status(), await v.text()).toBe(201);
    expect(await v.json()).toMatchObject({ model: 55, series: 1, from: 2, to: 4 });
    expect((await nfe(request)).number, "pula a faixa inutilizada").toBe(5);
    expect((await nfce(request)).number, "NFC-e não é afetada").toBe(1);
  });

  test("API: SEFAZ fora — NFC-e sai em contingência e é autorizada quando volta; NF-e espera", async ({ request }) => {
    await register(request, newUser("fisccont"));
    await setup(request);
    expect((await ok<any>(await call(request, "POST", "/v1/fiscal/fake/outage", { on: true }), "derrubar a SEFAZ")).on).toBe(true);
    const n = await nfce(request);
    expect(n.status, "venda não para").toBe("CONTINGENCY");
    expect(n.emissionType).toBe(9);
    const k = parseKey(n.key);
    expect(k.emissionType, "tpEmis 9 na chave").toBe(9);
    expect(n.qrCodeUrl, "QR Code também na contingência").toBeTruthy();
    const e = await nfe(request);
    expect(e.status, "NF-e espera a SEFAZ").toBe("PROCESSING");
    expect(e.lastError, "motivo da espera").toBeTruthy();
    await expectCode(await call(request, "POST", `/v1/fiscal/documents/${n.id}/cancel`, { justification: J }), 409, "INVALID_STATUS", "cancelar em contingência");
    expect((await ok<any>(await call(request, "POST", `/v1/fiscal/documents/${n.id}/transmit`), "tentar com a SEFAZ fora")).status).toBe("CONTINGENCY");
    await ok(await call(request, "POST", "/v1/fiscal/fake/outage", { on: false }), "SEFAZ voltou");
    const t = await ok<any>(await call(request, "POST", `/v1/fiscal/documents/${n.id}/transmit`), "transmitir a contingência");
    expect(t.status).toBe("AUTHORIZED");
    expect(t.number, "mesmo número").toBe(n.number);
    expect(t.key, "a chave da contingência é a que vale").toBe(n.key);
    expect((await ok<any>(await call(request, "POST", `/v1/fiscal/documents/${e.id}/transmit`), "transmitir a NF-e")).status).toBe("AUTHORIZED");
  });

  test("API: ERP — pedido vira NF-e com o NCM do produto e o cliente, uma vez só", async ({ request }) => {
    await register(request, newUser("fiscerp"));
    test.skip(!(cfg.presets.includes("erp") || (await call(request, "GET", "/v1/erp/me")).status() !== 404), "projeto sem o ERP");
    await setup(request);
    const wh = items<any>(await ok(await call(request, "GET", "/v1/erp/warehouses"), "depósitos")).find((w) => w.isDefault);
    const mk = async (body: Record<string, unknown>) => {
      const p = await ok<any>(await call(request, "POST", "/v1/erp/products", { type: "SIMPLE", unit: "UN", priceCents: 5000, ...body }), "produto");
      await ok(await call(request, "POST", "/v1/erp/stock/movements", { type: "IN", productId: p.id, warehouseId: wh.id, qty: 10, unitCostCents: 2000 }), "estoque");
      return p;
    };
    const shirt = await mk({ name: `Camiseta ${uniq()}`, fiscal: { ncm: "61091000", origin: 0 } });
    const noNcm = await mk({ name: `Sem NCM ${uniq()}` });
    const cli = await ok<any>(await call(request, "POST", "/v1/erp/parties", { kinds: ["CUSTOMER"], name: "Mercado Bom Preço", document: "06.990.590/0001-23", address: { street: "Rua B", number: "20", district: "Sé", city: "São Paulo", cityCode: "3550308", uf: "SP", zip: "01001-000" } }), "cliente");
    const ord = async (productId: string, status = "CONFIRMED") => ok<any>(await call(request, "POST", "/v1/erp/orders", { status, customerId: cli.id, items: [{ productId, qty: 2 }], payment: { method: "PIX" } }), "pedido");
    const bad = await ord(noNcm.id);
    const e = await expectCode(await callKey(request, `/v1/erp/orders/${bad.id}/invoice`, { model: 55 }), 400, "VALIDATION_ERROR", "produto sem NCM");
    expect(pathsOf(e)).toContain("items.0.ncm");
    expect(String(e.errors.find((x: any) => x.path === "items.0.ncm")?.message), "a mensagem diz qual produto cadastrar").toContain(noNcm.name);
    const quote = await ord(shirt.id, "QUOTE");
    await expectCode(await callKey(request, `/v1/erp/orders/${quote.id}/invoice`, { model: 55 }), 409, "INVALID_TRANSITION", "faturar orçamento");
    const o = await ord(shirt.id);
    const r = await callKey(request, `/v1/erp/orders/${o.id}/invoice`, { model: 55 });
    expect(r.status(), await r.text()).toBe(201);
    const doc = await r.json();
    expect(doc.status).toBe("AUTHORIZED");
    expect(doc.ref).toMatchObject({ app: "erp", entity: "order", id: o.id });
    expect(doc.recipient).toMatchObject({ name: "Mercado Bom Preço", uf: "SP" });
    expect(doc.items[0]).toMatchObject({ ncm: "61091000", cfop: "6102", qty: 2, unitCents: 5000 });
    expect(doc.totals.totalCents).toBe(o.totals.totalCents);
    const back = await ok<any>(await call(request, "GET", `/v1/erp/orders/${o.id}`), "pedido");
    expect(back.invoice).toMatchObject({ id: doc.id, model: 55, number: doc.number, status: "AUTHORIZED" });
    await expectCode(await callKey(request, `/v1/erp/orders/${o.id}/invoice`, { model: 55 }), 409, "ALREADY_INVOICED", "faturar de novo");
    const list = items<any>(await ok(await call(request, "GET", `/v1/fiscal/documents?refApp=erp&refId=${o.id}`), "notas do pedido"));
    expect(list.map((d) => d.id)).toEqual([doc.id]);
  });

  test("API: outra empresa não vê a nota", async ({ browser, request }) => {
    await register(request, newUser("fisciso"));
    await setup(request);
    const a = await nfe(request);
    const other = await newContext(browser);
    await register(other.request, newUser("fiscother"));
    await setup(other.request);
    expect((await call(other.request, "GET", `/v1/fiscal/documents/${a.id}`)).status(), "nota de outra empresa").toBe(404);
    expect((await call(other.request, "POST", `/v1/fiscal/documents/${a.id}/cancel`, { justification: J })).status(), "cancelar nota de outra empresa").toBe(404);
    expect(items<any>(await ok(await call(other.request, "GET", "/v1/fiscal/documents"), "notas da outra")).some((d) => d.id === a.id)).toBe(false);
    expect((await nfe(other.request)).number, "numeração separada por empresa").toBe(1);
    await other.close();
  });

  test("Tela: configurar o emitente pelas configurações", async ({ page }) => {
    await signUp(page, "fisctela");
    await ensureFeature(page.context().request, "fiscal");
    await page.goto("/configuracoes/fiscal");
    await expect(page.getByTestId("fiscal-issuer-status")).toHaveAttribute("data-status", "PENDING");
    await page.getByTestId("fiscal-cnpj").fill("11.222.333/0001-82");
    await page.getByTestId("fiscal-legal-name").fill("Loja Teste Ltda");
    await page.getByTestId("fiscal-ie").fill("9012345678");
    await page.getByTestId("fiscal-uf").selectOption("PR");
    await page.getByTestId("fiscal-city-code").fill("4115200");
    await page.getByTestId("fiscal-regime").selectOption("SIMPLES");
    await page.getByTestId("fiscal-driver").selectOption("fake");
    await page.getByTestId("fiscal-save").click();
    await expect(page.getByTestId("field-error-cnpj"), "CNPJ inválido mostrado no campo").toBeVisible();
    await expect(page.getByTestId("fiscal-issuer-status")).toHaveAttribute("data-status", "PENDING");
    await page.getByTestId("fiscal-cnpj").fill("11.222.333/0001-81");
    await page.getByTestId("fiscal-save").click();
    await expect(page.getByTestId("fiscal-issuer-status"), "emitente configurado").toHaveAttribute("data-status", "CONFIGURED");
    await expect(page.getByTestId("fiscal-rule-row").first(), "regras padrão").toBeVisible();
  });

  test("Tela: emitir NF-e pela tela, ver autorizada e cancelar", async ({ page }) => {
    await signUp(page, "fiscnota");
    await setup(page.context().request);
    await page.goto("/fiscal");
    await expect(page.getByTestId("fiscal-test-banner"), "faixa de homologação").toBeVisible();
    await page.getByTestId("fiscal-new").click();
    const f = page.getByTestId("fiscal-doc-form");
    await f.getByTestId("fiscal-model").selectOption("55");
    await f.getByTestId("fiscal-recipient-doc").fill(ANA.document);
    await f.getByTestId("fiscal-recipient-name").fill(ANA.name);
    await f.getByTestId("fiscal-recipient-uf").selectOption("PR");
    await f.getByTestId("fiscal-item-description").fill("Camiseta básica");
    await f.getByTestId("fiscal-item-ncm").fill("61091000");
    await f.getByTestId("fiscal-item-unit").fill("UN");
    await f.getByTestId("fiscal-item-qty").fill("2");
    await f.getByTestId("fiscal-item-price").fill("49,90");
    await f.getByTestId("fiscal-emit").click();
    await expect(page.getByTestId("fiscal-doc-status"), "autorizada").toHaveAttribute("data-status", "AUTHORIZED");
    const key = ((await page.getByTestId("fiscal-doc-key").textContent()) ?? "").replace(/\D/g, "");
    parseKey(key);
    await expect(page.getByTestId("fiscal-doc-xml")).toBeVisible();
    await expect(page.getByTestId("fiscal-doc-danfe")).toBeVisible();
    await page.getByTestId("fiscal-cancel").click();
    await page.getByTestId("fiscal-cancel-reason").fill(J);
    await page.getByTestId("fiscal-cancel-confirm").click();
    await expect(page.getByTestId("fiscal-doc-status"), "cancelada").toHaveAttribute("data-status", "CANCELED");
    await page.goto("/fiscal");
    await expect(page.locator('[data-testid="fiscal-doc-row"][data-number="1"]')).toHaveAttribute("data-status", "CANCELED");
  });
});
