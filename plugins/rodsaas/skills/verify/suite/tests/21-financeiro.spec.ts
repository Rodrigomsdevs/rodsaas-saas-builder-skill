import { test, expect, type APIRequestContext, type APIResponse, type Browser, type BrowserContext } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register } from "../support/api";
import { cfg } from "../support/config.mjs";
import { linkFrom, waitForEmail } from "../support/mailpit";
import { newContext } from "../support/ui";

// Parte do preset financeiro (app Financeiro, /rodsaas:financeiro). Roda quando rodsaas.json tem "financeiro" em presets
// ou a API tem /v1/fin/me. Confere o que mais se simplifica: centavos certos (parcelas, baixa parcial, juros), saldo
// calculado, situação vencida sem job, fluxo de caixa e DRE com números exatos, conciliação sem duplicar, cobrança que
// só baixa pelo pagamento confirmado (modo de teste), papéis e aprovação, e as telas principais.

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
const codesOf = (b: any) => (b?.violations ?? []).map((v: any) => v.code) as string[];

/** Garante a feature no plano (no modo de teste da cobrança assina o plano que tem); senão pula. */
async function ensureFeature(req: APIRequestContext, feature: string) {
  const plan: any = (await me(req)).plan;
  if (plan?.features?.includes(feature)) return;
  const mode = await billingMode(req);
  test.skip(mode !== "fake", `"${feature}" exige plano pago e a cobrança está em modo "${mode}"`);
  const target = (await plansFromApi(req)).paid.find((p) => p.features?.includes(feature));
  test.skip(!target, `nenhum plano com a feature ${feature}`);
  await ok(await call(req, "POST", "/v1/billing/checkout-sessions", { plan: target!.id, interval: "month" }), `assinar plano com ${feature} (modo de teste)`);
}

// ---------------------------------------------------------------- datas (dia em São Paulo)
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); };
const firstOfMonth = (ymd: string, plus = 0) => { const [y, m] = ymd.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + plus, 1)); return t.toISOString().slice(0, 10); };
const lastOfMonth = (ymd: string, plus = 0) => addDays(firstOfMonth(ymd, plus + 1), -1);
const ofxDate = (ymd: string) => ymd.replace(/-/g, "");

/** Extrato OFX 1.x (SGML, como os bancos brasileiros exportam). */
function ofx(txs: { fitId: string; date: string; amount: string; memo: string }[], acctId = "12345-6") {
  const rows = txs.map((t) => `<STMTTRN><TRNTYPE>${t.amount.startsWith("-") ? "DEBIT" : "CREDIT"}<DTPOSTED>${ofxDate(t.date)}120000[-3:BRT]<TRNAMT>${t.amount}<FITID>${t.fitId}<MEMO>${t.memo}`).join("\n");
  return `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n<OFX>\n<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>0341<ACCTID>${acctId}<ACCTTYPE>CHECKING</BANKACCTFROM>\n<BANKTRANLIST><DTSTART>${ofxDate(addDays(today(), -30))}<DTEND>${ofxDate(today())}\n${rows}\n</BANKTRANLIST><LEDGERBAL><BALAMT>0.00<DTASOF>${ofxDate(today())}</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n`;
}

// ---------------------------------------------------------------- pessoas e estrutura
async function owner(browser: Browser) {
  const ctx = await newContext(browser);
  const user = newUser("fin");
  await register(ctx.request, user);
  const fme = await ok<any>(await call(ctx.request, "GET", "/v1/fin/me"), "/v1/fin/me do owner");
  return { user, ctx, req: ctx.request, fme };
}
async function addMember(browser: Browser, mailReq: APIRequestContext, ownerReq: APIRequestContext, tag: string) {
  const u = newUser(tag);
  await ok(await call(ownerReq, "POST", "/v1/invitations", { email: u.email, role: "MEMBER" }), "convite");
  const mail = await waitForEmail(mailReq, u.email, { contains: "/convite" });
  const token = new URL(linkFrom(mail, "/convite")).searchParams.get("token");
  const ctx: BrowserContext = await newContext(browser);
  await register(ctx.request, u, { invitationToken: token });
  const m = items<any>(await ok(await call(ownerReq, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === u.email);
  expect(m, `membro ${u.email}`).toBeTruthy();
  return { user: u, ctx, req: ctx.request, userId: m.user.id as string };
}
async function categories(req: APIRequestContext) {
  const list = items<any>(await ok(await call(req, "GET", "/v1/fin/categories"), "plano de contas"));
  const byKey = (k: string) => { const c = list.find((x) => x.key === k); expect(c, `categoria padrão "${k}"`).toBeTruthy(); return c.id as string; };
  return { list, byKey };
}
async function account(req: APIRequestContext, name: string, openingBalanceCents: number, openingDate = addDays(today(), -30)) {
  return ok<any>(await call(req, "POST", "/v1/fin/accounts", { name, type: "CHECKING", openingBalanceCents, openingDate }), `conta ${name}`);
}
const accounts = async (req: APIRequestContext) => items<any>(await ok(await call(req, "GET", "/v1/fin/accounts"), "contas"));
const balanceOf = async (req: APIRequestContext, id: string) => (await accounts(req)).find((a) => a.id === id)?.balanceCents;
async function entry(req: APIRequestContext, body: Record<string, unknown>) {
  const r = await ok<any>(await call(req, "POST", "/v1/fin/entries", { description: `Lançamento ${Math.random().toString(36).slice(2, 6)}`, ...body }), "lançar");
  expect(Array.isArray(r.entries) && r.entries.length >= 1, "POST devolve { entries: [...] }").toBe(true);
  return r.entries[0] as any;
}
const getEntry = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/fin/entries/${id}`), "lançamento");
const pay = (req: APIRequestContext, id: string, body: Record<string, unknown>) => call(req, "POST", `/v1/fin/entries/${id}/payments`, body);

test.describe("Financeiro", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset financeiro");
  });

  test("API: plano de contas padrão, contas com saldo calculado, transferência e validação do lançamento", async ({ browser }) => {
    const o = await owner(browser);
    expect(o.fme.role, "owner é FIN_ADMIN").toBe("FIN_ADMIN");
    const cats = await categories(o.req);
    const tarifas = cats.list.find((c) => c.key === "tarifas");
    expect([tarifas?.type, tarifas?.dreGroup], "tarifas: despesa financeira").toEqual(["EXPENSE", "DESPESAS_FINANCEIRAS"]);
    expect(cats.list.some((c) => c.type === "INCOME" && c.dreGroup === "RECEITA_BRUTA"), "há categoria de receita bruta").toBe(true);

    const bank = await account(o.req, "Banco", 100000);
    const caixa = (await accounts(o.req)).find((a) => a.type === "CASH");
    expect(caixa, "conta Caixa criada na ativação").toBeTruthy();
    expect(await balanceOf(o.req, bank.id), "saldo = saldo inicial").toBe(100000);
    const lim = (await me(o.req)).plan?.limits?.finAccounts;
    if (lim === 2) await expectCode(await call(o.req, "POST", "/v1/fin/accounts", { name: "Terceira", type: "SAVINGS", openingBalanceCents: 0, openingDate: today() }), 403, "PLAN_LIMIT_REACHED", "3ª conta no plano grátis (Caixa + Banco já são 2)");
    await ok(await call(o.req, "POST", "/v1/fin/transfers", { fromAccountId: bank.id, toAccountId: caixa.id, date: today(), amountCents: 30000 }), "transferência");
    expect([await balanceOf(o.req, bank.id), await balanceOf(o.req, caixa.id)], "transferência muda os dois saldos").toEqual([70000, 30000]);

    const base = { type: "INCOME", categoryId: cats.byKey("servicos"), dueDate: addDays(today(), 10) };
    expect((await call(o.req, "POST", "/v1/fin/entries", { ...base, description: "Zero", amountCents: 0 })).status(), "valor zero").toBe(400);
    expect((await call(o.req, "POST", "/v1/fin/entries", { ...base, description: "Quebrado", amountCents: 10.5 })).status(), "centavos não inteiros").toBe(400);
    expect((await call(o.req, "POST", "/v1/fin/entries", { ...base, description: "Data", amountCents: 100, dueDate: "2027-02-30" })).status(), "data inexistente").toBe(400);
    const mm = await expectCode(await call(o.req, "POST", "/v1/fin/entries", { ...base, description: "Tipo", amountCents: 100, categoryId: cats.byKey("aluguel") }), 400, "CATEGORY_TYPE_MISMATCH", "receita em categoria de despesa");
    expect((mm.errors ?? []).some((e: any) => e.path === "categoryId") || mm.code === "CATEGORY_TYPE_MISMATCH", "erro aponta a categoria").toBe(true);

    const bad = await expectCode(await call(o.req, "POST", "/v1/fin/contacts", { kind: "CUSTOMER", name: "Doc ruim", document: "11.222.333/0001-82" }), 400, "VALIDATION_ERROR", "CNPJ inválido");
    expect((bad.errors ?? []).some((e: any) => e.path === "document"), "erro no campo document").toBe(true);
    await ok(await call(o.req, "POST", "/v1/fin/contacts", { kind: "CUSTOMER", name: "Loja Centro", document: "11.222.333/0001-81" }), "CNPJ válido");
    await expectCode(await call(o.req, "POST", "/v1/fin/contacts", { kind: "SUPPLIER", name: "Repetido", document: "11222333000181" }), 409, "DOCUMENT_TAKEN", "documento repetido");
  });

  test("API: parcelas com o centavo certo e recorrência mensal no dia 31", async ({ browser }) => {
    const o = await owner(browser);
    const cats = await categories(o.req);
    const r = await ok<any>(await call(o.req, "POST", "/v1/fin/entries", { type: "EXPENSE", description: "Notebook", categoryId: cats.byKey("softwares"), amountCents: 10000, dueDate: "2027-01-31", installments: { count: 3 } }), "parcelar");
    expect(r.entries.map((e: any) => e.amountCents), "100,00 em 3 = 33,34 + 33,33 + 33,33").toEqual([3334, 3333, 3333]);
    expect(r.entries.map((e: any) => e.dueDate), "dia 31 vira o último dia do mês").toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(r.entries.map((e: any) => `${e.installment?.number}/${e.installment?.total}`), "número da parcela").toEqual(["1/3", "2/3", "3/3"]);

    await ensureFeature(o.req, "fin_recurring");
    const rec = await ok<any>(await call(o.req, "POST", "/v1/fin/recurrences", { template: { type: "INCOME", description: "Mensalidade", categoryId: cats.byKey("servicos"), amountCents: 50000 }, start: "2027-01-31", interval: "month", count: 4 }), "recorrência");
    expect(rec.entries.map((e: any) => e.dueDate), "recorrência mensal no dia 31").toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
    expect(rec.entries.every((e: any) => e.amountCents === 50000 && e.recurrenceId), "mesmo valor e ligados à recorrência").toBe(true);
  });

  test("API: baixa parcial, juros no caixa, excesso recusado, estorno e vencido com multa sugerida", async ({ browser }) => {
    const o = await owner(browser);
    const cats = await categories(o.req);
    const bank = await account(o.req, "Banco", 0);
    const e = await entry(o.req, { type: "INCOME", categoryId: cats.byKey("servicos"), amountCents: 10000, dueDate: addDays(today(), 5) });
    expect(e.status, "novo, a vencer").toBe("OPEN");

    const p1 = await ok<any>(await pay(o.req, e.id, { accountId: bank.id, date: today(), amountCents: 4000 }), "baixa parcial");
    expect([p1.entry.status, p1.entry.paidCents, p1.entry.remainingCents], "parcial").toEqual(["PARTIAL", 4000, 6000]);
    expect(await balanceOf(o.req, bank.id), "saldo com a baixa").toBe(4000);
    const over = await expectCode(await pay(o.req, e.id, { accountId: bank.id, date: today(), amountCents: 6001 }), 422, "PAYMENT_RULES", "acima do que falta");
    expect(codesOf(over), "OVERPAYMENT").toContain("OVERPAYMENT");
    expect(codesOf(await expectCode(await pay(o.req, e.id, { accountId: bank.id, date: addDays(today(), 1), amountCents: 100 }), 422, "PAYMENT_RULES", "data futura")), "FUTURE_DATE").toContain("FUTURE_DATE");
    const p2 = await ok<any>(await pay(o.req, e.id, { accountId: bank.id, date: today(), amountCents: 6000, interestCents: 300 }), "quita com juros");
    expect([p2.entry.status, p2.entry.paidCents], "pago; juros não abatem a dívida").toEqual(["PAID", 10000]);
    expect(await balanceOf(o.req, bank.id), "juros entram no caixa").toBe(10300);

    await ok(await call(o.req, "POST", `/v1/fin/payments/${p1.payment.id}/reverse`), "estornar a 1ª baixa");
    const after = await getEntry(o.req, e.id);
    expect([after.status, after.remainingCents], "estorno reabre").toEqual(["PARTIAL", 4000]);
    expect(after.payments.filter((x: any) => !x.reversed).length, "estorno não apaga a baixa").toBe(1);
    expect(await balanceOf(o.req, bank.id), "saldo sem a baixa estornada").toBe(6300);
    await expectCode(await call(o.req, "POST", `/v1/fin/payments/${p1.payment.id}/reverse`), 409, "ALREADY_REVERSED", "estornar duas vezes");

    const late = await entry(o.req, { type: "INCOME", categoryId: cats.byKey("servicos"), amountCents: 100000, dueDate: addDays(today(), -15) });
    expect([late.status, late.overdue, late.daysLate], "vencido sem job nenhum").toEqual(["OVERDUE", true, 15]);
    const d = await getEntry(o.req, late.id);
    expect(d.suggestedLate, "multa 2% + juros 1% a.m. pro rata (15 dias)").toEqual(expect.objectContaining({ daysLate: 15, fineCents: 2000, interestCents: 500 }));
  });

  test("API: fluxo de caixa com realizado, previsto, vencido em hoje e transferência fora", async ({ browser }) => {
    const o = await owner(browser);
    const cats = await categories(o.req);
    const from = firstOfMonth(today()), to = lastOfMonth(today(), 1);
    const bank = await account(o.req, "Banco", 100000, addDays(from, -1));
    const caixa = (await accounts(o.req)).find((a) => a.type === "CASH");
    const inc = await entry(o.req, { type: "INCOME", categoryId: cats.byKey("servicos"), amountCents: 50000, dueDate: today() });
    await ok(await pay(o.req, inc.id, { accountId: bank.id, date: today(), amountCents: 50000 }), "recebido hoje");
    const exp = await entry(o.req, { type: "EXPENSE", categoryId: cats.byKey("aluguel"), amountCents: 20000, dueDate: today() });
    await ok(await pay(o.req, exp.id, { accountId: bank.id, date: today(), amountCents: 20000 }), "pago hoje");
    await entry(o.req, { type: "INCOME", categoryId: cats.byKey("servicos"), amountCents: 30000, dueDate: addDays(today(), -1) });
    await entry(o.req, { type: "EXPENSE", categoryId: cats.byKey("aluguel"), amountCents: 15000, dueDate: addDays(firstOfMonth(today(), 1), 14) });
    await ok(await call(o.req, "POST", "/v1/fin/transfers", { fromAccountId: bank.id, toAccountId: caixa.id, date: today(), amountCents: 5000 }), "transferência");

    const cf = await ok<any>(await call(o.req, "GET", `/v1/fin/cashflow?from=${from}&to=${to}&groupBy=month`), "fluxo de caixa");
    expect(cf.openingCents, "saldo inicial das contas").toBe(100000);
    expect(cf.periods.map((p: any) => p.key), "um período por mês").toEqual([from.slice(0, 7), firstOfMonth(today(), 1).slice(0, 7)]);
    const [m0, m1] = cf.periods;
    expect([m0.inCents, m0.outCents, m0.forecastInCents, m0.balanceCents], "mês atual: realizado + vencido em hoje; transferência fora").toEqual([50000, 20000, 30000, 160000]);
    expect([m1.forecastOutCents, m1.balanceCents], "próximo mês: previsto").toEqual([15000, 145000]);
    expect(cf.closingCents, "saldo projetado").toBe(145000);
  });

  test("API: DRE por competência e inadimplência por faixa", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "fin_reports");
    const cats = await categories(o.req);
    const add = (key: string, type: string, amountCents: number, competenceDate: string, dueDate = competenceDate) => entry(o.req, { type, categoryId: cats.byKey(key), amountCents, competenceDate, dueDate });
    await add("servicos", "INCOME", 100000, "2026-03-15");
    await add("impostos_vendas", "EXPENSE", 10000, "2026-03-20");
    await add("terceiros", "EXPENSE", 30000, "2026-03-10");
    await add("aluguel", "EXPENSE", 20000, "2026-03-05", "2026-04-05"); // competência março, vence em abril
    await add("tarifas", "EXPENSE", 1000, "2026-03-31");
    await add("aportes", "INCOME", 50000, "2026-03-02");
    await add("servicos", "INCOME", 7777, "2026-04-01");
    const canceled = await add("servicos", "INCOME", 99999, "2026-03-16");
    await ok(await call(o.req, "POST", `/v1/fin/entries/${canceled.id}/cancel`, { reason: "Lançado errado" }), "cancelar");

    const d = await ok<any>(await call(o.req, "GET", "/v1/fin/reports/dre?from=2026-03-01&to=2026-03-31&basis=competence"), "DRE");
    expect([d.groups.RECEITA_BRUTA, d.receitaLiquida, d.lucroBruto, d.resultadoOperacional, d.resultadoFinanceiro, d.lucroLiquido], "DRE de março (cancelado e abril fora)").toEqual([100000, 90000, 60000, 40000, -1000, 39000]);
    expect(d.groups.NAO_OPERACIONAL, "aporte fora do resultado").toBe(50000);
    expect(d.margemLiquida, "margem líquida = 39.000 / 90.000").toBe(43.3);

    await add("servicos", "INCOME", 1000, addDays(today(), 5));
    await add("servicos", "INCOME", 2000, addDays(today(), -10));
    await add("servicos", "INCOME", 3000, addDays(today(), -45));
    const a = await ok<any>(await call(o.req, "GET", "/v1/fin/reports/aging?type=INCOME"), "inadimplência");
    const b = a.buckets;
    expect([b.a_vencer.cents, b.d1_30.cents, b.d31_60.cents, b.d61_90.cents], "faixas de atraso").toEqual([1000, 2000, 3000, 0]);
    expect([b.d90_mais.cents, b.d90_mais.count], "mais de 90 dias (março e abril), sem o cancelado").toEqual([157777, 3]);
  });

  test("API: conciliação por OFX sem duplicar, sugestão certa, conciliar, regra da tarifa e ignorar", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "fin_reconciliation");
    const cats = await categories(o.req);
    const bank = await account(o.req, "Itaú", 0);
    const joao = await ok<any>(await call(o.req, "POST", "/v1/fin/contacts", { kind: "CUSTOMER", name: "João Silva" }), "contato");
    const d1 = addDays(today(), -9), d2 = addDays(today(), -8);
    const rec = await entry(o.req, { type: "INCOME", categoryId: cats.byKey("servicos"), amountCents: 150000, dueDate: d1, description: "Mensalidade", contactId: joao.id });
    await entry(o.req, { type: "INCOME", categoryId: cats.byKey("servicos"), amountCents: 150000, dueDate: addDays(today(), 20), description: "Outra mensalidade" });
    const sameValueExpense = await entry(o.req, { type: "EXPENSE", categoryId: cats.byKey("terceiros"), amountCents: 150000, dueDate: d1, description: "Fornecedor" });
    const file = ofx([
      { fitId: "A1", date: d1, amount: "1500.00", memo: "PIX RECEBIDO JOAO SILVA" },
      { fitId: "A2", date: d2, amount: "-35,90", memo: "TARIFA PACOTE SERVICOS" },
      { fitId: "A3", date: d2, amount: "1.00", memo: "CREDITO TESTE DO BANCO" },
    ]);
    const imp = await ok<any>(await call(o.req, "POST", `/v1/fin/accounts/${bank.id}/statements`, { fileName: "extrato.ofx", content: file }), "importar OFX");
    expect([imp.import.imported, imp.import.duplicates], "3 novas").toEqual([3, 0]);
    const again = await ok<any>(await call(o.req, "POST", `/v1/fin/accounts/${bank.id}/statements`, { fileName: "extrato.ofx", content: file }), "importar de novo");
    expect([again.import.imported, again.import.duplicates], "não duplica").toEqual([0, 3]);
    await expectCode(await call(o.req, "POST", `/v1/fin/accounts/${bank.id}/statements`, { fileName: "x.ofx", content: "isto não é um extrato" }), 400, "INVALID_STATEMENT", "arquivo ilegível");

    await ok(await call(o.req, "POST", "/v1/fin/rules", { name: "Tarifas", match: { contains: ["tarifa"], sign: "out" }, set: { categoryId: cats.byKey("tarifas") } }), "regra");
    const pend = items<any>(await ok(await call(o.req, "GET", `/v1/fin/accounts/${bank.id}/transactions?status=PENDING`), "pendentes"));
    const tx = (memo: string) => pend.find((t) => t.memo.includes(memo));
    expect(pend.length, "3 pendentes").toBe(3);
    expect(tx("JOAO")?.suggestions?.[0]?.entryId, "1ª sugestão: o lançamento do mesmo valor e data, com o nome").toBe(rec.id);
    expect((tx("JOAO")?.suggestions ?? []).some((sg: any) => sg.entryId === sameValueExpense.id), "crédito não sugere conta a pagar do mesmo valor").toBe(false);
    expect(tx("TARIFA")?.rule?.categoryId, "regra sugere Tarifas").toBe(cats.byKey("tarifas"));

    await ok(await call(o.req, "POST", `/v1/fin/transactions/${tx("JOAO").id}/reconcile`, { entryIds: [rec.id] }), "conciliar");
    const paid = await getEntry(o.req, rec.id);
    expect([paid.status, paid.payments[0]?.date, paid.payments[0]?.accountId], "baixado na data e na conta do extrato").toEqual(["PAID", d1, bank.id]);
    await expectCode(await call(o.req, "POST", `/v1/fin/transactions/${tx("JOAO").id}/reconcile`, { entryIds: [rec.id] }), 409, "TRANSACTION_NOT_PENDING", "conciliar de novo");
    const created = await ok<any>(await call(o.req, "POST", `/v1/fin/transactions/${tx("TARIFA").id}/create-entry`, {}), "criar lançamento da tarifa");
    expect([created.entry.type, created.entry.category?.id, created.entry.status, created.entry.amountCents], "despesa em Tarifas, já paga").toEqual(["EXPENSE", cats.byKey("tarifas"), "PAID", 3590]);
    await ok(await call(o.req, "POST", `/v1/fin/transactions/${tx("CREDITO").id}/ignore`, { reason: "Crédito de teste do banco" }), "ignorar");
    expect(items<any>(await ok(await call(o.req, "GET", `/v1/fin/accounts/${bank.id}/transactions?status=PENDING`), "pendentes depois")).length, "nada pendente").toBe(0);
    expect(await balanceOf(o.req, bank.id), "saldo = recebido − tarifa").toBe(146410);
  });

  test("API: cobrança no modo de teste — validação, página pública e baixa só pelo pagamento", async ({ browser, playwright }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "fin_charges");
    const st = await ok<any>(await call(o.req, "GET", "/v1/fin/settings"), "configurações");
    test.skip(st.charges?.mode !== "fake", `cobranças em modo "${st.charges?.mode}" (este teste usa o modo de teste)`);
    const cats = await categories(o.req);
    const cli = await ok<any>(await call(o.req, "POST", "/v1/fin/contacts", { kind: "CUSTOMER", name: "Cliente Sem Documento", email: `cli.${Date.now()}@example.com` }), "contato sem CPF");
    const e = await entry(o.req, { type: "INCOME", categoryId: cats.byKey("servicos"), amountCents: 25000, dueDate: addDays(today(), 10), contactId: cli.id, description: "Consultoria outubro" });

    const rules = await expectCode(await call(o.req, "POST", "/v1/fin/charges", { entryId: e.id, methods: ["boleto"] }), 422, "CHARGE_RULES", "boleto sem documento");
    expect(codesOf(rules), "BOLETO_NEEDS_DOCUMENT").toContain("BOLETO_NEEDS_DOCUMENT");
    const ch = (await ok<any>(await call(o.req, "POST", "/v1/fin/charges", { entryId: e.id, methods: ["pix", "card"] }), "cobrar por Pix e cartão")).charge;
    expect([ch.status, ch.provider, ch.amountCents], "pendente, modo de teste, valor do lançamento").toEqual(["PENDING", "FAKE", 25000]);
    expect(String(ch.url), "link /pagar/<token>").toMatch(/\/pagar\/[A-Za-z0-9_-]{20,}$/);
    await expectCode(await call(o.req, "POST", "/v1/fin/charges", { entryId: e.id, methods: ["pix"] }), 409, "CHARGE_EXISTS", "segunda cobrança pendente");
    const exp = await entry(o.req, { type: "EXPENSE", categoryId: cats.byKey("aluguel"), amountCents: 1000, dueDate: addDays(today(), 3) });
    await expectCode(await call(o.req, "POST", "/v1/fin/charges", { entryId: exp.id, methods: ["pix"] }), 409, "ENTRY_NOT_RECEIVABLE", "cobrar uma despesa");

    const token = String(ch.url).split("/pagar/")[1];
    const anon = await playwright.request.newContext({ baseURL: cfg.apiURL });
    await expectCode(await call(anon, "GET", `/v1/public/fin/charges/${token}x`), 404, "CHARGE_NOT_FOUND", "token errado");
    const pub = await ok<any>(await call(anon, "GET", `/v1/public/fin/charges/${token}`), "página pública sem login");
    expect([pub.amountCents, pub.status, pub.mode], "valor, situação e modo").toEqual([25000, "PENDING", "fake"]);
    expect(pub.company?.name, "nome da empresa").toBe(o.user.organizationName);
    expect(JSON.stringify(pub), "sem ids internos").not.toContain(e.id);
    expect((await getEntry(o.req, e.id)).status, "criar a cobrança não baixa nada").toBe("OPEN");
    expect((await ok<any>(await call(anon, "POST", `/v1/public/fin/charges/${token}/fake-pay`, { method: "pix" }), "pagar no modo de teste")).status, "pago").toBe("PAID");
    await expectCode(await call(anon, "POST", `/v1/public/fin/charges/${token}/fake-pay`, { method: "pix" }), 409, "CHARGE_NOT_PENDING", "pagar de novo");
    await anon.dispose();

    const after = await getEntry(o.req, e.id);
    const stripeAcc = (await accounts(o.req)).find((a) => a.type === "STRIPE");
    expect([after.status, after.payments[0]?.method, after.payments[0]?.accountId], "baixa automática por Pix na conta Stripe").toEqual(["PAID", "PIX", stripeAcc?.id]);
    const list = items<any>(await ok(await call(o.req, "GET", "/v1/fin/charges"), "cobranças"));
    expect(list.find((c) => c.id === ch.id)?.status, "cobrança paga").toBe("PAID");
  });

  test("API: papéis do app e aprovação de pagamentos acima do limite", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    await ensureFeature(o.req, "fin_approvals");
    const F = await addMember(browser, request, o.req, "financeiro");
    const V = await addMember(browser, request, o.req, "leitor");
    const N = await addMember(browser, request, o.req, "semacesso");
    await ok(await call(o.req, "PUT", `/v1/fin/roles/${F.userId}`, { role: "FIN" }), "papel FIN");
    await ok(await call(o.req, "PUT", `/v1/fin/roles/${V.userId}`, { role: "VIEWER" }), "papel VIEWER");
    const cats = await categories(o.req);

    const denied = await call(N.req, "GET", "/v1/fin/entries");
    expect(denied.status(), "membro sem papel → 403").toBe(403);
    expect(["NOT_FIN_MEMBER", "APP_ACCESS_DENIED"], "código: NOT_FIN_MEMBER (com a workstation, o guard de app responde APP_ACCESS_DENIED)").toContain((await denied.json()).code);
    expect((await call(V.req, "GET", "/v1/fin/entries")).status(), "VIEWER lê").toBe(200);
    expect((await call(V.req, "POST", "/v1/fin/entries", { type: "EXPENSE", description: "x", categoryId: cats.byKey("aluguel"), amountCents: 100, dueDate: today() })).status(), "VIEWER não escreve").toBe(403);

    await ok(await call(o.req, "PATCH", "/v1/fin/settings", { paymentApprovalAboveCents: 100000 }), "limite de aprovação R$ 1.000");
    const big = await entry(F.req, { type: "EXPENSE", categoryId: cats.byKey("aluguel"), amountCents: 150000, dueDate: addDays(today(), 5), description: "Equipamento" });
    const small = await entry(F.req, { type: "EXPENSE", categoryId: cats.byKey("aluguel"), amountCents: 50000, dueDate: addDays(today(), 5) });
    expect([big.status, small.status], "acima do limite aguarda aprovação").toEqual(["AWAITING_APPROVAL", "OPEN"]);
    const caixa = (await accounts(o.req)).find((a) => a.type === "CASH");
    expect(codesOf(await expectCode(await pay(F.req, big.id, { accountId: caixa.id, date: today(), amountCents: 150000 }), 422, "PAYMENT_RULES", "baixar antes de aprovar")), "AWAITING_APPROVAL").toContain("AWAITING_APPROVAL");
    expect((await call(F.req, "POST", `/v1/fin/entries/${big.id}/approval`, { decision: "approve" })).status(), "FIN não aprova").toBe(403);
    await expectCode(await call(o.req, "POST", `/v1/fin/entries/${big.id}/approval`, { decision: "reject", comment: " " }), 400, "COMMENT_REQUIRED", "recusa sem motivo");
    await ok(await call(o.req, "POST", `/v1/fin/entries/${big.id}/approval`, { decision: "approve" }), "FIN_ADMIN aprova");
    expect((await getEntry(F.req, big.id)).status, "aprovado fica em aberto").toBe("OPEN");
    const ownerBig = await entry(o.req, { type: "EXPENSE", categoryId: cats.byKey("aluguel"), amountCents: 150000, dueDate: addDays(today(), 5) });
    expect(ownerBig.status, "FIN_ADMIN não precisa de aprovação").toBe("OPEN");

    const other = await newContext(browser);
    await register(other.request, newUser("outra"));
    expect((await call(other.request, "GET", `/v1/fin/entries/${big.id}`)).status(), "lançamento de outra empresa → 404").toBe(404);
  });

  test("Tela: lançar conta a pagar pelo formulário, baixar na lista e ver o saldo da conta", async ({ browser }) => {
    const o = await owner(browser);
    const cats = await categories(o.req);
    const bank = await account(o.req, "Banco do Brasil", 500000);
    const page = await o.ctx.newPage();
    await page.goto("/financeiro");
    await expect(page.getByTestId("fin-home"), "Início do Financeiro").toBeVisible();
    await page.goto("/financeiro/lancamentos");
    await page.getByTestId("fin-entry-new").click();
    const form = page.getByTestId("fin-entry-form");
    await expect(form).toBeVisible();
    await form.getByTestId("fin-entry-type").selectOption("EXPENSE");
    const desc = `Aluguel tela ${Date.now()}`;
    await form.getByTestId("fin-entry-description").fill(desc);
    await form.getByTestId("fin-entry-amount").fill("1.500,00");
    await form.getByTestId("fin-entry-due").fill(today());
    await form.getByTestId("fin-entry-category").selectOption(cats.byKey("aluguel"));
    await form.getByTestId("fin-entry-account").selectOption(bank.id);
    await form.getByTestId("fin-entry-save").click();

    const row = page.locator('[data-testid="fin-entry-row"][data-type="EXPENSE"]', { hasText: desc });
    await expect(row, "conta a pagar na lista, em aberto").toHaveAttribute("data-status", "OPEN");
    const id = await row.getAttribute("data-id");
    expect((await getEntry(o.req, id!)).amountCents, "valor em centavos certo (R$ 1.500,00)").toBe(150000);
    await row.getByTestId("fin-entry-pay").click();
    const pf = page.getByTestId("fin-pay-form");
    await expect(pf).toBeVisible();
    await expect(pf.getByTestId("fin-pay-amount"), "valor em aberto já preenchido").not.toHaveValue("");
    await pf.getByTestId("fin-pay-account").selectOption(bank.id);
    await pf.getByTestId("fin-pay-confirm").click();
    await expect(page.locator(`[data-testid="fin-entry-row"][data-id="${id}"]`), "pago na lista").toHaveAttribute("data-status", "PAID");

    await page.goto("/financeiro/contas");
    await expect(page.locator(`[data-testid="fin-account-row"][data-id="${bank.id}"]`).getByTestId("fin-account-balance"), "saldo 5.000 − 1.500").toContainText("3.500,00");
  });

  test("Tela: importar o OFX e conciliar pela sugestão", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "fin_reconciliation");
    const cats = await categories(o.req);
    const bank = await account(o.req, "Nubank PJ", 0);
    const d1 = addDays(today(), -3);
    const rec = await entry(o.req, { type: "INCOME", categoryId: cats.byKey("servicos"), amountCents: 89900, dueDate: d1, description: "Projeto site" });
    const page = await o.ctx.newPage();
    await page.goto("/financeiro/conciliacao");
    await page.getByTestId("fin-recon-account").selectOption(bank.id);
    await page.getByTestId("fin-import-file").setInputFiles({ name: "extrato.ofx", mimeType: "application/x-ofx", buffer: Buffer.from(ofx([{ fitId: "UI1", date: d1, amount: "899.00", memo: "PIX RECEBIDO PROJETO SITE" }, { fitId: "UI2", date: d1, amount: "-12.00", memo: "TARIFA" }])) });
    await expect(page.getByTestId("fin-import-result"), "resultado da importação").toBeVisible();
    const row = page.locator('[data-testid="fin-tx-row"]', { hasText: "PROJETO SITE" });
    await expect(row.locator(`[data-testid="fin-tx-suggestion"][data-entry="${rec.id}"]`), "sugestão com o lançamento certo").toBeVisible();
    await row.getByTestId("fin-tx-reconcile").click();
    await expect(page.locator('[data-testid="fin-tx-row"][data-status="PENDING"]', { hasText: "PROJETO SITE" }), "sai dos pendentes").toHaveCount(0);
    expect((await getEntry(o.req, rec.id)).status, "conciliado = pago").toBe("PAID");
  });

  test("Tela: página pública de pagamento no modo de teste", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "fin_charges");
    const st = await ok<any>(await call(o.req, "GET", "/v1/fin/settings"), "configurações");
    test.skip(st.charges?.mode !== "fake", `cobranças em modo "${st.charges?.mode}"`);
    const cats = await categories(o.req);
    const e = await entry(o.req, { type: "INCOME", categoryId: cats.byKey("servicos"), amountCents: 25000, dueDate: addDays(today(), 7), description: "Manutenção mensal" });
    const ch = (await ok<any>(await call(o.req, "POST", "/v1/fin/charges", { entryId: e.id, methods: ["pix", "card"] }), "cobrança")).charge;

    const anon = await newContext(browser);
    const page = await anon.newPage();
    await page.goto(new URL(ch.url, cfg.webURL).pathname);
    await expect(page.getByTestId("pay-page"), "página pública sem login").toBeVisible();
    await expect(page.getByTestId("pay-amount"), "valor").toContainText("250,00");
    await expect(page.getByTestId("pay-test-mode"), "aviso de ambiente de teste").toBeVisible();
    await expect(page.locator('[data-testid="pay-method"][data-method="pix"]'), "Pix entre os meios").toBeVisible();
    await page.locator('[data-testid="pay-simulate"][data-method="pix"]').click();
    await expect(page.getByTestId("pay-done"), "pagamento confirmado").toBeVisible();
    expect((await getEntry(o.req, e.id)).status, "baixado").toBe("PAID");
  });
});
