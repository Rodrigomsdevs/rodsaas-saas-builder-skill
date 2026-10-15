import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register } from "../support/api";
import { cfg } from "../support/config.mjs";
import { signUp } from "../support/ui";

// Financeiro · operação avançada e perfis (skills/financeiro/references/09 e 10). Roda com o preset financeiro. Confere o
// que mais se simplifica: NFS-e pelo motor com as retenções baixando o lançamento, rateio com o centavo certo na DRE,
// previsto × realizado com os estados certos, fatura de cartão (fechamento, parcelas nas faturas seguintes, rateio pela
// categoria da compra), mês travado, partidas para o contador, maquininha (bruto + taxa, repasse, antecipação),
// convênio (lote, glosa, recurso, índice) e a nota emitida sozinha na baixa do prestador.

async function installed(req: APIRequestContext) {
  if (cfg.presets.includes("financeiro")) return true;
  return (await call(req, "GET", "/v1/fin/me")).status() !== 404;
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
async function needFiscal(req: APIRequestContext, regime = "SIMPLES") {
  test.skip(!(cfg.addons.includes("fiscal") || (await call(req, "GET", "/v1/fiscal/issuer")).status() !== 404), "projeto sem o add-on fiscal");
  await ensureFeature(req, "fiscal");
  await ok(await call(req, "PUT", "/v1/fiscal/issuer", { cnpj: "11.222.333/0001-81", legalName: "Consultoria Teste Ltda", ie: "123", im: "123456", uf: "PR", cityCode: "4115200", regime, driver: "fake" }), "emitente com inscrição municipal");
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); };
const monthOf = (ymd: string, plus = 0) => { const [y, m] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + plus, 1)).toISOString().slice(0, 7); };
const lastOfMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

async function categories(req: APIRequestContext) {
  const list = items<any>(await ok(await call(req, "GET", "/v1/fin/categories"), "plano de contas"));
  return (k: string) => { const c = list.find((x) => x.key === k); expect(c, `categoria padrão "${k}"`).toBeTruthy(); return c.id as string; };
}
const account = async (req: APIRequestContext, name: string, extra: Record<string, unknown> = {}) => ok<any>(await call(req, "POST", "/v1/fin/accounts", { name, type: "CHECKING", openingBalanceCents: 0, openingDate: addDays(today(), -60), ...extra }), `conta ${name}`);
const accounts = async (req: APIRequestContext) => items<any>(await ok(await call(req, "GET", "/v1/fin/accounts"), "contas"));
const balanceOf = async (req: APIRequestContext, id: string) => (await accounts(req)).find((a) => a.id === id)?.balanceCents;
async function entry(req: APIRequestContext, body: Record<string, unknown>) {
  const r = await ok<any>(await call(req, "POST", "/v1/fin/entries", { description: `Lançamento ${Math.random().toString(36).slice(2, 6)}`, dueDate: today(), ...body }), "lançar");
  return r.entries[0] as any;
}
const getEntry = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/fin/entries/${id}`), "lançamento");
const pay = (req: APIRequestContext, id: string, body: Record<string, unknown>) => call(req, "POST", `/v1/fin/entries/${id}/payments`, body);
const contact = async (req: APIRequestContext, body: Record<string, unknown>) => ok<any>(await call(req, "POST", "/v1/fin/contacts", { kind: "CUSTOMER", ...body }), "contato");

test.describe("Financeiro · operação", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset financeiro");
  });

  test("API: NFS-e pelo motor — serviço validado, tomador com documento, chave de 50 posições e retenções baixando o lançamento", async ({ request }) => {
    await register(request, newUser("finnfse"));
    await needFiscal(request, "NORMAL");
    const cat = await categories(request);
    const bank = await account(request, "Banco");
    const cli = await contact(request, { name: "Indústria Cliente", document: "04.252.011/0001-10" });
    const semDoc = await contact(request, { name: "Sem documento" });
    const service = { code: "010101", description: "Análise e desenvolvimento de sistemas", issPct: 5, issWithheld: true, irrfPct: 1.5, pcc: true };
    const e = await entry(request, { type: "INCOME", categoryId: cat("servicos"), amountCents: 1_000_000, contactId: cli.id, service });
    expect(pathsOf(await expectCode(await call(request, "POST", `/v1/fin/entries/${e.id}/nfse`, { service: { ...service, issPct: 6 } }), 400, "VALIDATION_ERROR", "ISS acima de 5%"))).toContain("service.issPct");
    const e2 = await entry(request, { type: "INCOME", categoryId: cat("servicos"), amountCents: 50000, contactId: semDoc.id, service });
    const sd = await expectCode(await call(request, "POST", `/v1/fin/entries/${e2.id}/nfse`, {}), 400, "VALIDATION_ERROR", "tomador sem CPF/CNPJ");
    expect(sd.errors?.[0]).toMatchObject({ path: "contactId", code: "DOCUMENT_REQUIRED" });
    const exp = await entry(request, { type: "EXPENSE", categoryId: cat("aluguel"), amountCents: 1000 });
    await expectCode(await call(request, "POST", `/v1/fin/entries/${exp.id}/nfse`, {}), 409, "ENTRY_NOT_RECEIVABLE", "despesa não tem nota de serviço");
    const r = await call(request, "POST", `/v1/fin/entries/${e.id}/nfse`, {});
    expect(r.status(), await r.text()).toBe(201);
    const { nfse, entry: after } = await r.json();
    expect(nfse.status).toBe("AUTHORIZED");
    expect(nfse.key, "chave de acesso nacional: 50 dígitos começando pelo município").toMatch(/^4115200\d{43}$/);
    expect(nfse.taxes, "ISS 5% retido + IRRF 1,5% + PIS/COFINS/CSLL 4,65%").toMatchObject({ issCents: 50000, issWithheldCents: 50000, irrfCents: 15000, pisCents: 6500, cofinsCents: 30000, csllCents: 10000, retainedCents: 111500, netCents: 888500 });
    expect([after.status, after.remainingCents], "o que falta receber é o líquido").toEqual(["PARTIAL", 888500]);
    expect((await accounts(request)).map((a) => a.balanceCents), "retenção não entra no saldo de nenhuma conta").toEqual((await accounts(request)).map(() => 0));
    const doc = await ok<any>(await call(request, "GET", `/v1/fiscal/documents/${nfse.id}`), "nota no motor");
    expect(doc.kind).toBe("NFSE");
    expect(doc.ref).toMatchObject({ app: "financeiro", entity: "entry", id: e.id });
    await expectCode(await call(request, "POST", `/v1/fin/entries/${e.id}/nfse`, {}), 409, "ALREADY_INVOICED", "segunda nota do mesmo lançamento");
    const paid = await call(request, "POST", `/v1/fin/entries/${e.id}/payments`, { accountId: bank.id, date: today(), amountCents: 888500 });
    expect(paid.status(), await paid.text()).toBe(201);
    expect((await paid.json()).entry.status, "líquido recebido quita").toBe("PAID");
    expect(await balanceOf(request, bank.id)).toBe(888500);
  });

  test("API: rateio — soma errada recusada, 33,33% × 3 com o centavo certo, DRE pelas partes e baixa parcial proporcional", async ({ request }) => {
    await register(request, newUser("finrateio"));
    await ensureFeature(request, "fin_reports");
    const cat = await categories(request);
    const bank = await account(request, "Banco");
    const base = { type: "EXPENSE", categoryId: cat("aluguel"), amountCents: 10000, competenceDate: today() };
    const bad = await expectCode(await call(request, "POST", "/v1/fin/entries", { ...base, description: "Ruim", allocations: [{ categoryId: cat("aluguel"), pct: 50 }, { categoryId: cat("marketing"), pct: 40 }] }), 400, "VALIDATION_ERROR", "rateio somando 90%");
    expect(errCodes(bad)).toContain("ALLOCATION_SUM");
    const mm = await expectCode(await call(request, "POST", "/v1/fin/entries", { ...base, description: "Tipo", allocations: [{ categoryId: cat("aluguel"), pct: 50 }, { categoryId: cat("servicos"), pct: 50 }] }), 400, "CATEGORY_TYPE_MISMATCH", "parte de receita numa despesa");
    expect(pathsOf(mm)).toContain("allocations.1.categoryId");
    const e = await entry(request, { ...base, description: "Escritório compartilhado", allocations: [{ categoryId: cat("aluguel"), pct: 33.33 }, { categoryId: cat("marketing"), pct: 33.33 }, { categoryId: cat("tarifas"), pct: 33.34 }] });
    const d = await getEntry(request, e.id);
    expect(d.allocations.map((a: any) => a.amountCents), "33,33 + 33,33 + 33,34").toEqual([3333, 3333, 3334]);
    expect(d.category.id, "categoria principal é a maior parte").toBe(cat("tarifas"));
    const from = monthOf(today()) + "-01", to = lastOfMonth(monthOf(today()));
    const dre = await ok<any>(await call(request, "GET", `/v1/fin/reports/dre?from=${from}&to=${to}&basis=competence`), "DRE por competência");
    expect([dre.groups.DESPESAS_OPERACIONAIS, dre.groups.DESPESAS_FINANCEIRAS], "aluguel + marketing operacionais; tarifa financeira").toEqual([6666, 3334]);
    expect((await pay(request, e.id, { accountId: bank.id, date: today(), amountCents: 5000 })).status()).toBe(201);
    const cash = await ok<any>(await call(request, "GET", `/v1/fin/reports/dre?from=${from}&to=${to}&basis=cash`), "DRE por caixa");
    expect([cash.groups.DESPESAS_OPERACIONAIS, cash.groups.DESPESAS_FINANCEIRAS], "baixa de 50,00 dividida na proporção (16,67 + 16,66 + 16,67)").toEqual([3333, 1667]);
  });

  test("API: previsto × realizado — estouro, alerta, meta de receita, sem orçamento, cancelado fora e cópia do mês", async ({ request }) => {
    await register(request, newUser("finorc"));
    await ensureFeature(request, "fin_budget");
    const cat = await categories(request);
    const m = monthOf(today()), next = monthOf(today(), 1);
    expect(pathsOf(await expectCode(await call(request, "PUT", "/v1/fin/budgets", { month: "2026-13", items: [{ categoryId: cat("aluguel"), amountCents: 1.5 }] }), 400, "VALIDATION_ERROR", "mês e valor inválidos"))).toEqual(expect.arrayContaining(["month", "items.0.amountCents"]));
    await ok(await call(request, "PUT", "/v1/fin/budgets", { month: m, items: [{ categoryId: cat("aluguel"), amountCents: 100000 }, { categoryId: cat("marketing"), amountCents: 50000 }, { categoryId: cat("softwares"), amountCents: 20000 }, { categoryId: cat("servicos"), amountCents: 300000 }] }), "orçamento do mês");
    const comp = { competenceDate: today() };
    await entry(request, { type: "EXPENSE", categoryId: cat("aluguel"), amountCents: 100100, ...comp });
    await entry(request, { type: "EXPENSE", categoryId: cat("marketing"), amountCents: 45000, ...comp });
    const canceled = await entry(request, { type: "EXPENSE", categoryId: cat("marketing"), amountCents: 99999, ...comp });
    await ok(await call(request, "POST", `/v1/fin/entries/${canceled.id}/cancel`, { reason: "lançado errado" }), "cancelar");
    await entry(request, { type: "INCOME", categoryId: cat("servicos"), amountCents: 300000, ...comp });
    await entry(request, { type: "EXPENSE", categoryId: cat("contas_consumo"), amountCents: 5000, ...comp });
    await entry(request, { type: "EXPENSE", categoryId: cat("softwares"), amountCents: 10000, ...comp, allocations: [{ categoryId: cat("softwares"), pct: 50 }, { categoryId: cat("contas_consumo"), pct: 50 }] });
    const rep = await ok<any>(await call(request, "GET", `/v1/fin/budgets/report?from=${m}&to=${m}`), "relatório");
    const row = (k: string) => rep.rows.find((r: any) => r.categoryId === cat(k) && r.month === m);
    expect(row("aluguel"), "passou R$ 1,00").toMatchObject({ budgetCents: 100000, actualCents: 100100, diffCents: -100, status: "OVER" });
    expect(row("marketing"), "90% alerta; o cancelado não conta").toMatchObject({ actualCents: 45000, usedPct: 90, status: "WARN" });
    expect(row("softwares"), "metade do rateio").toMatchObject({ actualCents: 5000, usedPct: 25, status: "OK" });
    expect(row("servicos"), "receita bateu a meta").toMatchObject({ actualCents: 300000, status: "OK" });
    expect(row("contas_consumo"), "gasto sem orçamento (5000 + metade do rateio)").toMatchObject({ budgetCents: 0, actualCents: 10000, status: "NO_BUDGET" });
    expect(rep.totals.budgetCents).toBe(470000);
    await ok(await call(request, "PUT", "/v1/fin/budgets", { month: next, copyFrom: m }), "copiar para o mês seguinte");
    const rn = await ok<any>(await call(request, "GET", `/v1/fin/budgets/report?from=${next}&to=${next}`), "relatório do mês seguinte");
    expect(rn.rows.find((r: any) => r.categoryId === cat("aluguel"))).toMatchObject({ budgetCents: 100000, actualCents: 0, status: "OK" });
  });

  test("API: fatura de cartão — melhor dia, parcelas nas faturas seguintes, rateio pela categoria da compra, limite e fatura paga", async ({ request }) => {
    await register(request, newUser("fincartao"));
    await ensureFeature(request, "fin_reports");
    const cat = await categories(request);
    const bank = await account(request, "Banco");
    await expectCode(await call(request, "POST", "/v1/fin/accounts", { name: "Cartão ruim", type: "CREDIT_CARD", openingBalanceCents: 0, openingDate: today(), closingDay: 10, dueDay: 10 }), 400, "VALIDATION_ERROR", "vence no dia do fechamento");
    const card = await account(request, "Cartão Empresa", { type: "CREDIT_CARD", closingDay: 10, dueDay: 20, limitCents: 100000, paidFromAccountId: bank.id });
    const m1 = monthOf(today(), 1), m2 = monthOf(today(), 2), m3 = monthOf(today(), 3), m4 = monthOf(today(), 4);
    const buy = (b: Record<string, unknown>) => call(request, "POST", `/v1/fin/cards/${card.id}/purchases`, { description: `Compra ${Math.random().toString(36).slice(2, 6)}`, ...b });
    const p1 = await ok<any>(await buy({ categoryId: cat("softwares"), amountCents: 5000, date: `${m1}-05` }), "antes do fechamento");
    expect(p1.installments.map((x: any) => [x.refMonth, x.dueOn])).toEqual([[m1, `${m1}-20`]]);
    const p2 = await ok<any>(await buy({ categoryId: cat("marketing"), amountCents: 9001, date: `${m1}-10`, installments: 3 }), "no dia do fechamento, em 3x");
    expect(p2.installments.map((x: any) => [x.refMonth, x.amountCents]), "vai para a próxima; centavo na 1ª").toEqual([[m2, 3001], [m3, 3000], [m4, 3000]]);
    await ok(await buy({ categoryId: cat("contas_consumo"), amountCents: 2000, date: `${m1}-15` }), "depois do fechamento");
    const inv = await ok<any>(await call(request, "GET", `/v1/fin/cards/${card.id}/invoices`), "faturas");
    expect(inv.data.map((x: any) => [x.refMonth, x.totalCents]), "uma fatura por mês").toEqual([[m1, 5000], [m2, 5001], [m3, 3000], [m4, 3000]]);
    expect(inv.limit, "limite usado = o que não foi pago").toMatchObject({ limitCents: 100000, usedCents: 16001, availableCents: 83999 });
    const fm2 = await getEntry(request, inv.data[1].entryId);
    expect([fm2.type, fm2.amountCents, fm2.dueDate]).toEqual(["EXPENSE", 5001, `${m2}-20`]);
    expect(fm2.allocations.map((a: any) => [a.categoryId, a.amountCents]).sort(), "fatura rateada pelas categorias das compras").toEqual([[cat("contas_consumo"), 2000], [cat("marketing"), 3001]].sort());
    const fm1 = inv.data[0];
    expect((await pay(request, fm1.entryId, { accountId: bank.id, date: today(), amountCents: 5000 })).status(), "pagar a fatura").toBe(201);
    const inv2 = await ok<any>(await call(request, "GET", `/v1/fin/cards/${card.id}/invoices`), "faturas depois");
    expect(inv2.data[0].status).toBe("PAID");
    expect(inv2.limit.usedCents, "pagar libera o limite").toBe(11001);
    await expectCode(await buy({ categoryId: cat("softwares"), amountCents: 1000, date: `${m1}-06` }), 409, "INVOICE_PAID", "compra numa fatura já paga");
  });

  test("API: mês travado — só mês terminado, nada muda no período e destravar exige motivo", async ({ request }) => {
    await register(request, newUser("fintrava"));
    const cat = await categories(request);
    const caixa = (await accounts(request)).find((a) => a.type === "CASH");
    const prev = monthOf(today(), -1), prevDay = lastOfMonth(prev);
    const a = await entry(request, { type: "INCOME", categoryId: cat("servicos"), amountCents: 10000, dueDate: prevDay, competenceDate: prevDay });
    const pa = await ok<any>(await pay(request, a.id, { accountId: caixa.id, date: prevDay, amountCents: 4000 }), "baixa no mês passado (antes de travar)");
    const c = await entry(request, { type: "EXPENSE", categoryId: cat("aluguel"), amountCents: 700, dueDate: prevDay, competenceDate: prevDay });
    expect(errCodes(await expectCode(await call(request, "POST", "/v1/fin/period-lock", { month: monthOf(today()) }), 400, "VALIDATION_ERROR", "mês corrente"))).toContain("MONTH_NOT_CLOSED");
    expect((await ok<any>(await call(request, "POST", "/v1/fin/period-lock", { month: prev }), "travar o mês passado")).lockedThrough).toBe(prev);
    expect((await ok<any>(await call(request, "GET", "/v1/fin/settings"), "configurações")).lockedThrough).toBe(prev);
    expect(errCodes(await expectCode(await call(request, "POST", "/v1/fin/period-lock", { month: monthOf(today(), -2) }), 400, "VALIDATION_ERROR", "travar para trás"))).toContain("LOCK_BACKWARDS");
    await expectCode(await call(request, "POST", "/v1/fin/entries", { type: "EXPENSE", description: "Atrasado", categoryId: cat("aluguel"), amountCents: 500, dueDate: today(), competenceDate: prevDay }), 409, "PERIOD_LOCKED", "competência travada");
    const b = await entry(request, { type: "EXPENSE", categoryId: cat("aluguel"), amountCents: 500 });
    await expectCode(await pay(request, b.id, { accountId: caixa.id, date: prevDay, amountCents: 500 }), 409, "PERIOD_LOCKED", "baixa com data travada");
    expect((await pay(request, a.id, { accountId: caixa.id, date: today(), amountCents: 1000 })).status(), "receber hoje um lançamento antigo é caixa de hoje: pode").toBe(201);
    await expectCode(await call(request, "POST", `/v1/fin/payments/${pa.payment.id}/reverse`), 409, "PERIOD_LOCKED", "estornar baixa do período");
    await expectCode(await call(request, "POST", `/v1/fin/entries/${c.id}/cancel`, { reason: "x" }), 409, "PERIOD_LOCKED", "cancelar com competência travada");
    await expectCode(await call(request, "PATCH", `/v1/fin/entries/${c.id}`, { amountCents: 800 }), 409, "PERIOD_LOCKED", "mudar lançamento com competência travada");
    expect((await pay(request, b.id, { accountId: caixa.id, date: today(), amountCents: 500 })).status(), "hoje continua normal").toBe(201);
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/fin/period-lock/unlock", { month: prev }), 400, "VALIDATION_ERROR", "destravar sem motivo"))).toContain("reason");
    expect((await ok<any>(await call(request, "POST", "/v1/fin/period-lock/unlock", { month: prev, reason: "contador pediu ajuste" }), "destravar")).lockedThrough, "volta para o mês anterior").toBe(monthOf(today(), -2));
    expect((await call(request, "POST", `/v1/fin/payments/${pa.payment.id}/reverse`)).status(), "destravado, estorna").toBe(200);
  });

  test("API: exportação ao contador — partidas de receita, despesa e transferência, códigos que faltam e CSV", async ({ request }) => {
    await register(request, newUser("fincontador"));
    await ensureFeature(request, "fin_reports");
    const cat = await categories(request);
    const bank = await account(request, "Itaú");
    const caixa = (await accounts(request)).find((a) => a.type === "CASH");
    await ok(await call(request, "PATCH", `/v1/fin/accounts/${bank.id}`, { ledgerCode: "1.1.1.02" }), "código da conta");
    await ok(await call(request, "PATCH", `/v1/fin/categories/${cat("servicos")}`, { ledgerCode: "3.1.1" }), "código da receita");
    await ok(await call(request, "PATCH", `/v1/fin/categories/${cat("aluguel")}`, { ledgerCode: "4.2.1" }), "código do aluguel");
    const rec = await entry(request, { type: "INCOME", categoryId: cat("servicos"), amountCents: 10000, documentNumber: "NFS 12" });
    await ok(await pay(request, rec.id, { accountId: bank.id, date: today(), amountCents: 10000 }), "recebido");
    const alu = await entry(request, { type: "EXPENSE", categoryId: cat("aluguel"), amountCents: 3000 });
    await ok(await pay(request, alu.id, { accountId: bank.id, date: today(), amountCents: 3000 }), "pago");
    await ok(await call(request, "POST", "/v1/fin/transfers", { fromAccountId: bank.id, toAccountId: caixa.id, date: today(), amountCents: 2000 }), "transferência");
    await entry(request, { type: "EXPENSE", categoryId: cat("marketing"), amountCents: 999 });
    const old = await entry(request, { type: "EXPENSE", categoryId: cat("aluguel"), amountCents: 777, dueDate: addDays(today(), -3) });
    await ok(await pay(request, old.id, { accountId: bank.id, date: addDays(today(), -3), amountCents: 777 }), "pago antes do período");
    const x = await ok<any>(await call(request, "GET", `/v1/fin/export/accounting?from=${today()}&to=${today()}`), "exportação contábil");
    const by = (c: number) => x.rows.find((r: any) => r.amountCents === c);
    expect(by(10000), "receita: D banco / C receita").toMatchObject({ debit: "1.1.1.02", credit: "3.1.1", document: "NFS 12" });
    expect(by(3000), "despesa: D despesa / C banco").toMatchObject({ debit: "4.2.1", credit: "1.1.1.02" });
    expect(by(2000), "transferência: D destino / C origem").toMatchObject({ debit: null, credit: "1.1.1.02" });
    expect(x.rows.length, "o que não foi pago e o que foi pago fora do período não entram").toBe(3);
    expect(x.missing.map((m: any) => [m.kind, m.id])).toEqual([["account", caixa.id]]);
    expect(x.totalCents).toBe(15000);
    const csv = await call(request, "GET", `/v1/fin/export/accounting?from=${today()}&to=${today()}&format=csv`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const text = await csv.text();
    expect(text).toContain("data;debito;credito;valor;historico;documento");
    expect(text).toContain(today().split("-").reverse().join("/") + ";1.1.1.02;3.1.1;100,00;");
  });

  test("API: perfil comércio — maquininha com bruto e taxa por parcela, repasse e antecipação", async ({ request }) => {
    await register(request, newUser("finmaq"));
    await ensureFeature(request, "fin_card_machines");
    const s = await ok<any>(await call(request, "PATCH", "/v1/fin/settings", { segment: "RETAIL" }), "perfil comércio");
    expect(s.on).toEqual(expect.arrayContaining(["card_machines", "anticipation"]));
    const stone = await account(request, "Conta Stone");
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/fin/card-machines", { name: "Ruim", accountId: stone.id, debitPct: 25, creditPct: 3, installmentPct: 4 }), 400, "VALIDATION_ERROR", "taxa de 25%"))).toContain("debitPct");
    const mq = await ok<any>(await call(request, "POST", "/v1/fin/card-machines", { name: "Stone", accountId: stone.id, debitPct: 1.5, creditPct: 3, installmentPct: 4, debitDays: 1, creditDays: 30, anticipationMonthlyPct: 2 }), "maquininha");
    const T = today();
    const deb = await ok<any>(await call(request, "POST", "/v1/fin/card-sales", { machineId: mq.id, kind: "DEBIT", amountCents: 10000, saleDate: addDays(T, -2) }), "débito");
    expect(deb.sale.schedule).toEqual([{ number: 1, total: 1, dueDate: addDays(T, -1), grossCents: 10000, feeCents: 150, netCents: 9850 }]);
    expect(deb.entries.map((e: any) => [e.type, e.amountCents]).sort(), "receita bruta e despesa da taxa").toEqual([["EXPENSE", 150], ["INCOME", 10000]]);
    const cre = await ok<any>(await call(request, "POST", "/v1/fin/card-sales", { machineId: mq.id, kind: "CREDIT", installments: 3, amountCents: 30000, saleDate: T }), "crédito em 3x");
    expect(cre.sale.schedule.map((x: any) => [x.dueDate, x.feeCents, x.netCents]), "taxa de parcelado em cada parcela, D+30/60/90").toEqual([[addDays(T, 30), 400, 9600], [addDays(T, 60), 400, 9600], [addDays(T, 90), 400, 9600]]);
    const rc = await ok<any>(await call(request, "GET", `/v1/fin/card-receivables?machineId=${mq.id}`), "a receber");
    expect(rc.totals).toEqual({ grossCents: 40000, feeCents: 1350, netCents: 38650 });
    const st = await ok<any>(await call(request, "POST", "/v1/fin/card-receivables/settle", { machineId: mq.id, date: T }), "repasse de hoje");
    expect([st.settled, st.netCents], "só o débito já caiu").toEqual([1, 9850]);
    expect(await balanceOf(request, stone.id)).toBe(9850);
    const an = await ok<any>(await call(request, "POST", "/v1/fin/card-receivables/anticipate", { machineId: mq.id, date: T }), "antecipar");
    expect([an.netCents, an.discountCents, an.receiveCents], "2% ao mês pro rata: 192 + 384 + 576").toEqual([28800, 1152, 27648]);
    expect(await balanceOf(request, stone.id)).toBe(9850 + 27648);
    expect((await ok<any>(await call(request, "GET", `/v1/fin/card-receivables?machineId=${mq.id}`), "a receber depois")).data).toEqual([]);
  });

  test("API: perfil clínica — lote do convênio vira receita, glosa baixa o esperado, recurso recupera e índice de glosa", async ({ request }) => {
    await register(request, newUser("finconv"));
    await ensureFeature(request, "fin_claims");
    const s = await ok<any>(await call(request, "PATCH", "/v1/fin/settings", { segment: "CLINIC" }), "perfil clínica");
    expect([s.words?.customer, s.on.includes("claims")]).toEqual(["paciente", true]);
    const uni = await contact(request, { name: `Unimed ${Math.random().toString(36).slice(2, 5)}`, document: "04.252.011/0001-10" });
    await ok(await call(request, "PATCH", `/v1/fin/contacts/${uni.id}`, { insurer: { paymentDays: 30 } }), "convênio com prazo de 30 dias");
    const T = today();
    const claim = (n: string, cents: number) => call(request, "POST", "/v1/fin/claims", { insurerId: uni.id, patientName: "Paciente " + n, guideNumber: n, serviceDate: T, amountCents: cents });
    const c1 = await ok<any>(await claim("G-1", 20000), "guia 1"), c2 = await ok<any>(await claim("G-2", 30000), "guia 2");
    await expectCode(await claim("G-1", 100), 409, "GUIDE_TAKEN", "guia repetida");
    const b = await ok<any>(await call(request, "POST", "/v1/fin/claim-batches", { insurerId: uni.id, claimIds: [c1.id, c2.id], sentOn: T }), "enviar o lote");
    expect(b.batch).toMatchObject({ totalCents: 50000, dueDate: addDays(T, 30) });
    expect((await getEntry(request, b.batch.entryId)).amountCents, "receita do convênio").toBe(50000);
    await expectCode(await call(request, "POST", "/v1/fin/claim-batches", { insurerId: uni.id, claimIds: [c1.id] }), 409, "CLAIM_RULES", "guia já enviada");
    const g = await ok<any>(await call(request, "POST", `/v1/fin/claims/${c1.id}/glosa`, { amountCents: 5000, reason: "1801 · Procedimento sem autorização" }), "glosa");
    expect(g.claim).toMatchObject({ billedCents: 20000, glosaCents: 5000, expectedCents: 15000 });
    expect((await getEntry(request, b.batch.entryId)).amountCents, "o lote espera 450,00").toBe(45000);
    expect(errCodes(await expectCode(await call(request, "POST", `/v1/fin/claims/${c1.id}/glosa`, { amountCents: 15001, reason: "x" }), 400, "VALIDATION_ERROR", "glosa acima da guia"))).toContain("GLOSA_ABOVE_BILLED");
    await ok(await call(request, "POST", `/v1/fin/claims/${c1.id}/appeal`, { text: "Autorização anexa" }), "recurso");
    expect(errCodes(await expectCode(await call(request, "POST", `/v1/fin/claims/${c1.id}/appeal-result`, { recoveredCents: 5001 }), 400, "VALIDATION_ERROR", "recupera mais que o glosado"))).toContain("RECOVERY_ABOVE_GLOSA");
    const rr = await ok<any>(await call(request, "POST", `/v1/fin/claims/${c1.id}/appeal-result`, { recoveredCents: 4000 }), "recurso aceito em parte");
    expect(rr.claim).toMatchObject({ glosaCents: 5000, recoveredCents: 4000, expectedCents: 19000 });
    const rec = await getEntry(request, rr.entryId);
    expect([rec.type, rec.amountCents, rec.dueDate], "o recuperado vira nova receita do convênio").toEqual(["INCOME", 4000, addDays(T, 30)]);
    const rep = await ok<any>(await call(request, "GET", `/v1/fin/reports/glosas?from=${T}&to=${T}`), "índice de glosa");
    expect(rep.data.find((x: any) => x.insurer.id === uni.id)).toMatchObject({ billedCents: 50000, glosaCents: 5000, recoveredCents: 4000, netGlosaCents: 1000, ratePct: 2 });
  });

  test("API: perfil prestador — receita com serviço quitada emite a NFS-e sozinha", async ({ request }) => {
    await register(request, newUser("finprest"));
    await needFiscal(request, "SIMPLES");
    const s = await ok<any>(await call(request, "PATCH", "/v1/fin/settings", { segment: "SERVICES", defaultService: { code: "171901", description: "Consultoria", issPct: 2, irrfPct: 1.5, pcc: true } }), "perfil prestador");
    expect(s.on).toEqual(expect.arrayContaining(["nfse", "nfse_on_payment"]));
    const cat = await categories(request);
    const caixa = (await accounts(request)).find((a) => a.type === "CASH");
    const cli = await contact(request, { name: "Cliente PJ", document: "04.252.011/0001-10" });
    const e = await entry(request, { type: "INCOME", categoryId: cat("servicos"), amountCents: 100000, contactId: cli.id });
    expect((await pay(request, e.id, { accountId: caixa.id, date: today(), amountCents: 40000 })).status()).toBe(201);
    expect((await getEntry(request, e.id)).nfse ?? null, "parcial ainda não emite").toBeNull();
    expect((await pay(request, e.id, { accountId: caixa.id, date: today(), amountCents: 60000 })).status()).toBe(201);
    const d = await getEntry(request, e.id);
    expect(d.nfse?.status, "quitou, emitiu").toBe("AUTHORIZED");
    expect(d.nfse.key).toMatch(/^\d{50}$/);
    expect(d.nfse.taxes.retainedCents, "Simples sem IRRF nem PIS/COFINS/CSLL; ISS do prestador").toBe(0);
  });

  test("Tela: orçamento do mês com a categoria estourada marcada", async ({ page }) => {
    await signUp(page, "finorctela");
    const req = page.context().request;
    await ensureFeature(req, "fin_budget");
    const cat = await categories(req);
    await ok(await call(req, "PUT", "/v1/fin/budgets", { month: monthOf(today()), items: [{ categoryId: cat("aluguel"), amountCents: 1000 }] }), "orçamento");
    await entry(req, { type: "EXPENSE", categoryId: cat("aluguel"), amountCents: 1500, competenceDate: today() });
    await page.goto("/financeiro/orcamento");
    const row = page.locator(`[data-testid="fin-budget-row"][data-category="${cat("aluguel")}"]`);
    await expect(row).toHaveAttribute("data-status", "OVER");
    await expect(row).toContainText("15,00");
  });

  test("Tela: faturas do cartão na conta", async ({ page }) => {
    await signUp(page, "fincartela");
    const req = page.context().request;
    await ensureFeature(req, "fin_reports");
    const cat = await categories(req);
    const card = await account(req, "Cartão", { type: "CREDIT_CARD", closingDay: 10, dueDay: 20 });
    const m1 = monthOf(today(), 1);
    await ok(await call(req, "POST", `/v1/fin/cards/${card.id}/purchases`, { description: "Software", categoryId: cat("softwares"), amountCents: 9000, date: `${m1}-05`, installments: 2 }), "compra");
    await page.goto(`/financeiro/contas/${card.id}`);
    await expect(page.getByTestId("fin-card-invoice")).toHaveCount(2);
    await expect(page.locator(`[data-testid="fin-card-invoice"][data-ref="${m1}"]`)).toContainText("45,00");
  });

  test("Tela: escolher o perfil do Financeiro nas configurações", async ({ page }) => {
    await signUp(page, "finperfiltela");
    await page.goto("/financeiro/configuracoes");
    await page.getByTestId("fin-segment").selectOption("CLINIC");
    await expect.poll(async () => (await ok<any>(await call(page.context().request, "GET", "/v1/fin/settings"), "configurações")).segment, { timeout: 10_000 }).toBe("CLINIC");
  });

  test("Tela: guias do convênio com a situação", async ({ page }) => {
    await signUp(page, "finconvtela");
    const req = page.context().request;
    await ensureFeature(req, "fin_claims");
    const uni = await contact(req, { name: "Convênio Tela", document: "04.252.011/0001-10" });
    await ok(await call(req, "PATCH", `/v1/fin/contacts/${uni.id}`, { insurer: { paymentDays: 45 } }), "convênio");
    const c = await ok<any>(await call(req, "POST", "/v1/fin/claims", { insurerId: uni.id, patientName: "Maria", guideNumber: "T-1", serviceDate: today(), amountCents: 12000 }), "guia");
    await page.goto("/financeiro/convenios");
    await expect(page.locator(`[data-testid="fin-claim-row"][data-id="${c.id}"]`)).toHaveAttribute("data-status", "OPEN");
  });
});
