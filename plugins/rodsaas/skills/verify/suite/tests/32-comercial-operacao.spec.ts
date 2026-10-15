import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { ownerWithMember, signUp } from "../support/ui";

// Comercial · operação avançada e perfis (skills/comercial/references/10 e 11). Roda com o preset comercial. Confere o
// que mais se simplifica: sinal cobrado no aceite (pago marca a proposta; contrato espera o sinal), envio pelo motor de
// WhatsApp, reajuste com o acumulado encadeado de 12 meses do índice (mês faltando, deflação, repetido), catálogo do ERP
// (preço e pedido no aceite), funil de conversão, locação (tarifa mais barata, disponibilidade, devolução), medição de
// obra com retenção e matrícula com irmão automático.

async function installed(req: APIRequestContext) {
  if (cfg.presets.includes("comercial")) return true;
  return (await call(req, "GET", "/v1/com/me")).status() !== 404;
}
async function expectCode(res: APIResponse, status: number, code: string, label: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  const json = JSON.parse(body || "{}");
  expect(json.code, `${label}: code`).toBe(code);
  return json;
}
const pathsOf = (b: any) => (b?.errors ?? []).map((e: any) => e.path) as string[];
const errCodes = (b: any) => (b?.errors ?? []).map((e: any) => e.code) as string[];
async function ensureFeature(req: APIRequestContext, feature: string) {
  const plan: any = (await me(req)).plan;
  if (plan?.features?.includes(feature)) return;
  const mode = await billingMode(req);
  test.skip(mode !== "fake", `"${feature}" exige plano pago e a cobrança está em modo "${mode}"`);
  const target = (await plansFromApi(req)).paid.find((p) => p.features?.includes(feature));
  test.skip(!target, `nenhum plano com a feature ${feature}`);
  await ok(await call(req, "POST", "/v1/billing/checkout-sessions", { plan: target!.id, interval: "month" }), `assinar plano com ${feature} (modo de teste)`);
}
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); };
const monthOf = (ymd: string, plus = 0) => { const [y, m] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + plus, 1)).toISOString().slice(0, 7); };
const CNPJ = "11.222.333/0001-81", CPF = "529.982.247-25";
const client = (extra: Record<string, unknown> = {}) => ({ name: "Maria Cliente", companyName: "Cliente Ltda", document: CNPJ.replace(/\D/g, ""), email: `cliente.${uniq()}@example.com`, ...extra });
const item = (o: Record<string, unknown> = {}) => ({ description: "Serviço", qty: 1, unitCents: 100000, ...o });
const tokenOf = (url: string) => String(url).split("/").filter(Boolean).pop()!;

async function proposal(req: APIRequestContext, body: Record<string, unknown>) {
  return ok<any>(await call(req, "POST", "/v1/com/proposals", { title: `Proposta ${uniq()}`, client: client(), items: [item()], ...body }), "proposta");
}
async function sent(req: APIRequestContext, body: Record<string, unknown>) {
  const p = await proposal(req, body);
  return ok<any>(await call(req, "POST", `/v1/com/proposals/${p.id}/send`, { sendEmail: false }), "enviar");
}
const accept = (req: APIRequestContext, p: any, extra: Record<string, unknown> = {}) => call(req, "POST", `/v1/public/com/proposals/${tokenOf(p.publicUrl)}/accept`, { name: "Maria Cliente", document: CPF, agree: true, ...extra });
const getP = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/com/proposals/${id}`), "proposta");
async function signedContract(req: APIRequestContext, body: Record<string, unknown> = {}) {
  return ok<any>(await call(req, "POST", "/v1/com/contracts", { title: `Contrato ${uniq()}`, parties: [{ role: "CONTRACTOR", name: "Cliente SA", document: CNPJ, email: `c.${uniq()}@example.com` }, { role: "CONTRACTED", name: "Nós Ltda", document: CPF, email: `n.${uniq()}@example.com` }], valueCents: 100000, recurrence: "month", startDate: addDays(today(), -400), months: 24, existing: { signedAt: addDays(today(), -400) }, ...body }), "contrato existente");
}

test.describe("Comercial · operação", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset comercial");
  });

  test("API: sinal no aceite — validação, 30% com o opcional marcado, cobrança paga marca a proposta e o contrato espera o sinal", async ({ request }) => {
    await register(request, newUser("comsinal"));
    await ensureFeature(request, "com_contracts");
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/com/proposals", { title: "Ruim", client: client(), items: [item()], deposit: { pct: 0 } }), 400, "VALIDATION_ERROR", "sinal de 0%"))).toContain("deposit.pct");
    expect(errCodes(await expectCode(await call(request, "POST", "/v1/com/proposals", { title: "Ruim", client: client(), items: [item()], deposit: { amountCents: 100001 } }), 400, "VALIDATION_ERROR", "sinal maior que o total"))).toContain("DEPOSIT_ABOVE_TOTAL");
    const p = await sent(request, { items: [item(), item({ description: "Opcional", unitCents: 50000, optional: true })], deposit: { pct: 30 }, paymentPlan: { kind: "parcelado", installments: 2, firstDue: addDays(today(), 30) } });
    const before = await getP(request, p.id);
    expect(before.paymentPlan.schedule.map((x: any) => x.amountCents), "o plano é do restante (100.000 − 30.000)").toEqual([35000, 35000]);
    const optId = before.items.find((i: any) => i.optional).id;
    const r = await accept(request, p, { selectedOptionalIds: [optId] });
    expect(r.status(), await r.text()).toBe(200);
    const acc = await r.json();
    expect(acc.deposit, "30% de 1.500,00 com o opcional").toMatchObject({ amountCents: 45000 });
    const fin = cfg.presets.includes("financeiro") || (await call(request, "GET", "/v1/fin/me")).status() !== 404;
    if (fin && (await me(request)).plan?.features?.includes("fin_charges")) {
      expect(acc.deposit.status).toBe("PENDING");
      expect(acc.deposit.payUrl, "página de pagamento do Financeiro").toMatch(/\/pagar\/[^/]+$/);
      await ok(await call(request, "POST", `/v1/public/fin/charges/${tokenOf(acc.deposit.payUrl)}/fake-pay`, { method: "pix" }), "pagar o sinal (modo de teste)");
      expect((await getP(request, p.id)).deposit, "sinal pago").toMatchObject({ amountCents: 45000, status: "PAID" });
    }
    await ok(await call(request, "PATCH", "/v1/com/settings", { contractAfterDeposit: true }), "contrato só depois do sinal");
    const p2 = await sent(request, { deposit: { amountCents: 20000 } });
    expect((await accept(request, p2)).status()).toBe(200);
    if ((await getP(request, p2.id)).deposit.status !== "PAID") {
      await expectCode(await call(request, "POST", "/v1/com/contracts", { title: "Do aceite", proposalId: p2.id, parties: [{ role: "CONTRACTOR", name: "Maria Cliente", document: CPF, email: "m@example.com" }], valueCents: 100000, recurrence: "once", startDate: today(), months: 12 }), 409, "DEPOSIT_PENDING", "contrato antes do sinal");
    }
  });

  test("API: envio por WhatsApp — telefone inválido, sem conexão nada sai, com conexão vai pelo motor com o link", async ({ request }) => {
    await register(request, newUser("comwa"));
    test.skip(!(cfg.addons.includes("whatsapp") || (await call(request, "GET", "/v1/whatsapp/connection")).status() !== 404), "projeto sem o add-on whatsapp");
    const p = await proposal(request, { client: client({ name: "Ana Souza", phone: "(44) 99988-7766" }), items: [item({ unitCents: 150000 })] });
    expect(errCodes(await expectCode(await call(request, "POST", `/v1/com/proposals/${p.id}/send`, { channel: "whatsapp", phone: "44 8888-77766" }), 400, "VALIDATION_ERROR", "celular sem o 9"))).toContain("PHONE_INVALID");
    await expectCode(await call(request, "POST", `/v1/com/proposals/${p.id}/send`, { channel: "whatsapp" }), 409, "WHATSAPP_NOT_CONNECTED", "sem conexão");
    expect((await getP(request, p.id)).status, "nada enviado: continua rascunho").toBe("DRAFT");
    await ok(await call(request, "PUT", "/v1/whatsapp/connection", { driver: "fake", phone: "+55 44 3030-4040" }), "conectar o WhatsApp");
    const s = await ok<any>(await call(request, "POST", `/v1/com/proposals/${p.id}/send`, { channel: "whatsapp" }), "enviar pelo WhatsApp");
    expect(s.status).toBe("SENT");
    expect(s.messages?.[0]).toMatchObject({ channel: "whatsapp", to: "+5544999887766" });
    const conv = items<any>(await ok(await call(request, "GET", "/v1/whatsapp/conversations"), "conversas")).find((c) => c.phone.replace(/\D/g, "") === "5544999887766");
    expect(conv, "conversa aberta no motor").toBeTruthy();
    const msgs = items<any>(await ok(await call(request, "GET", `/v1/whatsapp/conversations/${conv.id}/messages`), "mensagens"));
    expect(msgs.at(-1).text, "mensagem com o primeiro nome e o link").toContain("Ana");
    expect(msgs.at(-1).text).toContain(tokenOf(s.publicUrl));
  });

  test("API: reajuste pelo índice — série manual, 12 meses encadeados, mês faltando, repetido e deflação que não reduz", async ({ request }) => {
    await register(request, newUser("comidx"));
    await ensureFeature(request, "com_contracts");
    const M = monthOf(today());
    const months = Array.from({ length: 12 }, (_, i) => monthOf(today(), i - 12));
    expect(pathsOf(await expectCode(await call(request, "PUT", "/v1/com/indexes/IPCA", { series: [{ month: months[0], pct: "x" }] }), 400, "VALIDATION_ERROR", "valor não numérico"))).toContain("series.0.pct");
    await expectCode(await call(request, "PUT", "/v1/com/indexes/SELIC", { series: [] }), 400, "VALIDATION_ERROR", "índice desconhecido");
    await ok(await call(request, "PUT", "/v1/com/indexes/IPCA", { series: months.map((m) => ({ month: m, pct: 0.5 })) }), "IPCA lançado à mão");
    const got = await ok<any>(await call(request, "GET", `/v1/com/indexes/IPCA?from=${months[0]}&to=${months[11]}`), "série");
    expect(got.series.length).toBe(12);
    expect(got.series[0]).toMatchObject({ month: months[0], pct: 0.5, source: "manual" });
    const c = await signedContract(request, { readjustIndex: "IPCA" });
    const r = await ok<any>(await call(request, "POST", `/v1/com/contracts/${c.id}/readjust`, { month: M }), "reajustar pelo IPCA do contrato");
    expect(r.valueCents, "12 × 0,5% encadeado = 6,1678% (não 6%)").toBe(106168);
    expect(r.events.at(-1)).toMatchObject({ kind: "READJUSTED", data: { index: "IPCA", pct: 6.1678, from: months[0], to: months[11], valueBefore: 100000, valueAfter: 106168 } });
    await expectCode(await call(request, "POST", `/v1/com/contracts/${c.id}/readjust`, { month: M }), 409, "ALREADY_READJUSTED", "mesmo mês duas vezes");
    const c2 = await signedContract(request, { readjustIndex: "IGP-M" });
    const miss = await expectCode(await call(request, "POST", `/v1/com/contracts/${c2.id}/readjust`, { month: M }), 409, "INDEX_UNAVAILABLE", "IGP-M sem série");
    expect(miss.missing?.length).toBe(12);
    await ok(await call(request, "PUT", "/v1/com/indexes/IGP-M", { series: months.map((m) => ({ month: m, pct: -0.2 })) }), "IGP-M com deflação");
    const d = await ok<any>(await call(request, "POST", `/v1/com/contracts/${c2.id}/readjust`, { month: M }), "reajuste com deflação");
    expect(d.valueCents, "deflação não reduz o valor").toBe(100000);
    expect(d.events.at(-1).data).toMatchObject({ pct: 0, rawPct: -2.3738 });
    const r3 = await ok<any>(await call(request, "POST", `/v1/com/contracts/${(await signedContract(request, { readjustIndex: "IGP-M" })).id}/readjust`, { index: "IPCA", month: M }), "índice informado vence o do contrato");
    expect(r3.valueCents).toBe(106168);
    expect((await ok<any>(await call(request, "POST", `/v1/com/contracts/${(await signedContract(request)).id}/readjust`, { pct: 4.5 }), "percentual digitado continua")).valueCents).toBe(104500);
  });

  test("API: catálogo do ERP — produto com o preço da tabela, item sem preço usa o do ERP e o aceite vira pedido com reserva", async ({ request }) => {
    await register(request, newUser("comerp"));
    test.skip(!(cfg.presets.includes("erp") || (await call(request, "GET", "/v1/erp/me")).status() !== 404), "projeto sem o preset erp");
    const name = `Cadeira ${uniq()}`;
    const pr = await ok<any>(await call(request, "POST", "/v1/erp/products", { type: "SIMPLE", name, unit: "UN", priceCents: 4990 }), "produto no ERP");
    const wh = items<any>(await ok(await call(request, "GET", "/v1/erp/warehouses"), "depósitos")).find((w) => w.isDefault).id;
    await ok(await call(request, "POST", "/v1/erp/stock/movements", { type: "IN", productId: pr.id, warehouseId: wh, qty: 10, unitCostCents: 2000 }), "estoque");
    await ok(await call(request, "POST", "/v1/erp/orders", { status: "CONFIRMED", items: [{ productId: pr.id, qty: 3 }] }), "pedido que reserva 3");
    const cat = await ok<any>(await call(request, "GET", `/v1/com/catalog?q=${encodeURIComponent(name)}`), "catálogo");
    expect(cat.data.find((x: any) => x.productId === pr.id), "disponível = 10 − 3 reservados").toMatchObject({ source: "erp", name, unit: "UN", unitCents: 4990, available: 7 });
    await expectCode(await call(request, "POST", "/v1/com/proposals", { title: "X", client: client(), items: [{ source: "erp", productId: "00000000-0000-0000-0000-000000000000", qty: 1 }] }), 400, "VALIDATION_ERROR", "produto inexistente");
    await ok(await call(request, "PATCH", "/v1/com/settings", { erpOrderOnAccept: true }), "pedido no aceite");
    const p = await sent(request, { items: [{ source: "erp", productId: pr.id, qty: 2 }] });
    const d = await getP(request, p.id);
    expect([d.items[0].unitCents, d.items[0].description, d.totals.oneTime.totalCents], "preço e nome vêm do ERP").toEqual([4990, name, 9980]);
    expect((await accept(request, p)).status()).toBe(200);
    const after = await getP(request, p.id);
    expect(after.erpOrder?.status, "pedido confirmado no ERP").toBe("CONFIRMED");
    expect((await ok<any>(await call(request, "GET", `/v1/erp/products/${pr.id}`), "produto")).stock.reserved, "estoque reservado (3 + 2)").toBe(5);
  });

  test("API: relatório de conversão — funil do período, taxa sobre as decididas e vendedor só vê a dele", async ({ browser, request }) => {
    const { owner, member, ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request;
    await ensureFeature(o, "com_reports");
    const memberId = items<any>(await ok(await call(o, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === member.email).user.id;
    await ok(await call(o, "PUT", `/v1/com/roles/${memberId}`, { role: "SELLER" }), "vendedor");
    const a = await sent(o, { items: [item({ unitCents: 100000 })] });
    expect((await accept(o, a)).status()).toBe(200);
    const b = await sent(o, { items: [item({ unitCents: 30000 }), item({ description: "Suporte", unitCents: 10000, recurring: "month" })] });
    expect((await accept(o, b)).status()).toBe(200);
    const c = await sent(o, {});
    expect((await call(o, "POST", `/v1/public/com/proposals/${tokenOf(c.publicUrl)}/reject`, { reason: "caro" })).status()).toBe(200);
    await sent(o, {});
    await proposal(o, {});
    const m = await sent(memberCtx.request, { items: [item({ unitCents: 20000 })] });
    expect((await accept(memberCtx.request, m)).status()).toBe(200);
    const r = await ok<any>(await call(o, "GET", `/v1/com/reports/conversion?from=${today()}&to=${today()}`), "conversão");
    expect([r.sent, r.accepted, r.rejected, r.open], "rascunho não conta").toEqual([5, 3, 1, 1]);
    expect(r.conversionPct, "3 aceitas de 4 decididas").toBe(75);
    expect(r.acceptedCents, "mensalidade conta 12 meses: 100.000 + 30.000 + 120.000 + 20.000").toBe(270000);
    expect(r.bySeller.find((x: any) => x.sellerId === memberId)).toMatchObject({ sent: 1, accepted: 1 });
    const mine = await ok<any>(await call(memberCtx.request, "GET", `/v1/com/reports/conversion?from=${today()}&to=${today()}`), "conversão do vendedor");
    expect([mine.sent, mine.bySeller.map((x: any) => x.sellerId)], "vendedor só vê a dele").toEqual([1, [memberId]]);
    expect(owner).toBeTruthy();
    await ownerCtx.close(); await memberCtx.close();
  });

  test("API: perfil locação — tarifa mais barata, disponibilidade no período, indisponível recusado e devolução atrasada com avaria", async ({ request }) => {
    await register(request, newUser("comloc"));
    await ensureFeature(request, "com_rentals");
    const s = await ok<any>(await call(request, "PATCH", "/v1/com/settings", { segment: "RENTAL" }), "perfil locação");
    expect([s.words?.customer, s.on.includes("rentals")]).toEqual(["locatário", true]);
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/com/rental-items", { name: "Andaime", stockQty: 0, dayCents: 5000 }), 400, "VALIDATION_ERROR", "estoque zero"))).toContain("stockQty");
    const it = await ok<any>(await call(request, "POST", "/v1/com/rental-items", { name: `Andaime ${uniq()}`, stockQty: 2, dayCents: 5000, weekCents: 25000, monthCents: 80000 }), "item de locação");
    const start = addDays(today(), 5), end = addDays(today(), 15);
    const p = await sent(request, { items: [{ description: "Andaime", qty: 1, rental: { itemId: it.id, start, end } }] });
    const d = await getP(request, p.id);
    expect(d.items[0].unitCents, "10 diárias: semana + 3 diárias (40.000), não 10 × 5.000").toBe(40000);
    expect((await ok<any>(await call(request, "GET", `/v1/com/rental-items/${it.id}/availability?start=${start}&end=${end}`), "disponível")).available).toBe(2);
    expect((await accept(request, p)).status()).toBe(200);
    expect((await ok<any>(await call(request, "GET", `/v1/com/rental-items/${it.id}/availability?start=${start}&end=${end}`), "depois do aceite")).available, "reservado").toBe(1);
    expect((await ok<any>(await call(request, "GET", `/v1/com/rental-items/${it.id}/availability?start=${addDays(end, 0)}&end=${addDays(end, 3)}`), "depois da devolução")).available, "volta no dia da devolução").toBe(2);
    const p2 = await proposal(request, { items: [{ description: "Andaime", qty: 2, rental: { itemId: it.id, start: addDays(start, 2), end: addDays(start, 4) } }] });
    const un = await expectCode(await call(request, "POST", `/v1/com/proposals/${p2.id}/send`, { sendEmail: false }), 409, "RENTAL_UNAVAILABLE", "só 1 livre no período");
    expect(un.available).toBe(1);
    const rt = items<any>(await ok(await call(request, "GET", "/v1/com/rentals"), "locações")).find((x) => x.proposalId === p.id);
    expect(rt?.status).toBe("RESERVED");
    expect((await ok<any>(await call(request, "POST", `/v1/com/rentals/${rt.id}/checkout`), "saída")).status).toBe("OUT");
    const ret = await ok<any>(await call(request, "POST", `/v1/com/rentals/${rt.id}/return`, { returnedAt: `${addDays(end, 1)}T10:00:00-03:00`, damagesCents: 3000 }), "devolução atrasada");
    expect(ret.rental).toMatchObject({ status: "RETURNED", lateDays: 1, lateChargeCents: 5000, damagesCents: 3000 });
  });

  test("API: perfil obra — etapas somando 100%, medição com retenção, progresso não volta e retenção liberada no fim", async ({ request }) => {
    await register(request, newUser("comobra"));
    await ensureFeature(request, "com_measurements");
    const s = await ok<any>(await call(request, "PATCH", "/v1/com/settings", { segment: "CONSTRUCTION" }), "perfil obra");
    expect(s.on).toEqual(expect.arrayContaining(["stages", "measurements"]));
    expect(errCodes(await expectCode(await call(request, "POST", "/v1/com/contracts", { title: "Obra ruim", parties: [{ role: "CONTRACTOR", name: "Cliente", document: CNPJ, email: "c@example.com" }], valueCents: 100000, recurrence: "once", startDate: today(), months: 6, stages: [{ name: "A", pct: 50 }, { name: "B", pct: 40 }] }), 400, "VALIDATION_ERROR", "etapas somando 90%"))).toContain("STAGES_SUM");
    const c = await signedContract(request, { recurrence: "once", stages: [{ name: "Demolição", pct: 30 }, { name: "Alvenaria", pct: 70 }], retentionPct: 5 });
    const m1 = await ok<any>(await call(request, "POST", `/v1/com/contracts/${c.id}/measurements`, { progress: [100, 50] }), "1ª medição");
    expect(m1.measurement).toMatchObject({ number: 1, grossCents: 65000, retentionCents: 3250, netCents: 61750 });
    expect(m1.measurement.lines.map((l: any) => l.amountCents)).toEqual([30000, 35000]);
    expect(errCodes(await expectCode(await call(request, "POST", `/v1/com/contracts/${c.id}/measurements`, { progress: [100, 40] }), 400, "VALIDATION_ERROR", "progresso voltou"))).toContain("PROGRESS_BACKWARDS");
    await expectCode(await call(request, "POST", `/v1/com/contracts/${c.id}/release-retention`), 409, "STAGES_NOT_DONE", "retenção antes do fim");
    const m2 = await ok<any>(await call(request, "POST", `/v1/com/contracts/${c.id}/measurements`, { progress: [100, 100] }), "2ª medição");
    expect(m2.measurement).toMatchObject({ number: 2, grossCents: 35000, retentionCents: 1750, netCents: 33250 });
    const all = await ok<any>(await call(request, "GET", `/v1/com/contracts/${c.id}/measurements`), "medições");
    expect([all.progress, all.measuredCents, all.retainedCents]).toEqual([[100, 100], 100000, 5000]);
    const rel = await ok<any>(await call(request, "POST", `/v1/com/contracts/${c.id}/release-retention`), "liberar a retenção");
    expect(rel.releasedCents).toBe(5000);
    await expectCode(await call(request, "POST", `/v1/com/contracts/${c.id}/release-retention`), 409, "ALREADY_RELEASED", "liberar duas vezes");
  });

  test("API: perfil escola — matrícula com anuidade, material e pontualidade; irmão automático do mesmo responsável no ano", async ({ request }) => {
    await register(request, newUser("comescola"));
    await ensureFeature(request, "com_enrollments");
    const s = await ok<any>(await call(request, "PATCH", "/v1/com/settings", { segment: "SCHOOL" }), "perfil escola");
    expect(s.words?.customer).toBe("responsável");
    const guardian = { name: "João Responsável", document: CPF, email: `resp.${uniq()}@example.com` };
    const first = `${Number(today().slice(0, 4)) + 1}-02-10`;
    const base = { guardian, schoolYear: Number(first.slice(0, 4)), annualCents: 1200000, installments: 12, firstDue: first, punctualityPct: 5, materialCents: 30000, enrollmentFeeCents: 50000 };
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/com/enrollments", { ...base, student: { name: "", grade: "1º ano" }, installments: 13 }), 400, "VALIDATION_ERROR", "aluno sem nome e 13 parcelas"))).toEqual(expect.arrayContaining(["student.name", "installments"]));
    const e1 = await ok<any>(await call(request, "POST", "/v1/com/enrollments", { ...base, student: { name: "Pedro", grade: "3º ano" } }), "primeira matrícula");
    expect(e1.siblingApplied).toBe(false);
    expect(e1.plan.schedule[0], "material na 1ª; pontualidade só sobre a mensalidade").toMatchObject({ dueDate: first, amountCents: 130000, onTimeCents: 125000 });
    expect(e1.plan.schedule[1]).toMatchObject({ amountCents: 100000, onTimeCents: 95000 });
    expect(e1.plan.totalCents).toBe(50000 + 1200000 + 30000);
    expect((await accept(request, e1.proposal)).status(), "aceite da matrícula").toBe(200);
    const e2 = await ok<any>(await call(request, "POST", "/v1/com/enrollments", { ...base, student: { name: "Lia", grade: "1º ano" } }), "segunda matrícula");
    expect(e2.siblingApplied, "irmão do mesmo responsável no mesmo ano").toBe(true);
    expect(e2.plan.schedule[1]).toMatchObject({ grossCents: 100000, discountCents: 10000, amountCents: 90000 });
    const e3 = await ok<any>(await call(request, "POST", "/v1/com/enrollments", { ...base, schoolYear: base.schoolYear + 1, student: { name: "Lia", grade: "2º ano" } }), "outro ano");
    expect(e3.siblingApplied, "outro ano não conta").toBe(false);
    const e4 = await ok<any>(await call(request, "POST", "/v1/com/enrollments", { ...base, schoolYear: base.schoolYear + 1, student: { name: "Pedro", grade: "4º ano" } }), "irmão de matrícula ainda não aceita");
    expect(e4.siblingApplied, "matrícula do irmão sem aceite não conta").toBe(false);
    const list = items<any>(await ok(await call(request, "GET", `/v1/com/enrollments?schoolYear=${base.schoolYear}`), "matrículas"));
    expect(list.map((x) => x.student.name).sort()).toEqual(["Lia", "Pedro"]);
  });

  test("Tela: funil de conversão por vendedor", async ({ page }) => {
    await signUp(page, "comconvtela");
    const req = page.context().request;
    await ensureFeature(req, "com_reports");
    const meId = (await me(req)).user.id;
    const a = await sent(req, {});
    await accept(req, a);
    await page.goto("/comercial/relatorios");
    await expect(page.getByTestId("com-conversion")).toContainText("100");
    await expect(page.locator(`[data-testid="com-conversion-seller"][data-seller="${meId}"]`)).toBeVisible();
  });

  test("Tela: escolher o perfil do Comercial nas configurações", async ({ page }) => {
    await signUp(page, "comperfiltela");
    await page.goto("/comercial/configuracoes");
    await page.getByTestId("com-segment").selectOption("SCHOOL");
    await expect.poll(async () => (await ok<any>(await call(page.context().request, "GET", "/v1/com/settings"), "configurações")).segment, { timeout: 10_000 }).toBe("SCHOOL");
  });

  test("Tela: locações com a situação", async ({ page }) => {
    await signUp(page, "comloctela");
    const req = page.context().request;
    await ensureFeature(req, "com_rentals");
    const it = await ok<any>(await call(req, "POST", "/v1/com/rental-items", { name: "Betoneira", stockQty: 1, dayCents: 8000 }), "item");
    const p = await sent(req, { items: [{ description: "Betoneira", qty: 1, rental: { itemId: it.id, start: addDays(today(), 1), end: addDays(today(), 3) } }] });
    await accept(req, p);
    await page.goto("/comercial/locacoes");
    await expect(page.getByTestId("com-rental-row").first()).toHaveAttribute("data-status", "RESERVED");
  });
});
