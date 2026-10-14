import { test, expect, type APIRequestContext, type APIResponse, type Browser, type BrowserContext } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register } from "../support/api";
import { cfg } from "../support/config.mjs";
import { linkFrom, waitForEmail } from "../support/mailpit";
import { newContext } from "../support/ui";

// Parte do preset rh (app Pessoas, /rodsaas:rh). Roda quando rodsaas.json tem "rh" em presets ou a API tem /v1/rh/me.
// Confere as regras que mais se simplificam: CLT no servidor, ficha projetada por permissão (LGPD), motor de aprovação,
// despesas, documentos, holerites por CPF, anonimato da pesquisa, pré-admissão e as telas de autoatendimento.

async function installed(req: APIRequestContext) {
  if (cfg.presets.includes("rh")) return true;
  return (await call(req, "GET", "/v1/rh/me")).status() !== 404;
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

// ---------------------------------------------------------------- datas (dia de trabalho em São Paulo)
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); };
const weekday = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const nextWeekday = (from: string, wd: number) => { let d = from; while (weekday(d) !== wd) d = addDays(d, 1); return d; };

// ---------------------------------------------------------------- CPF de teste (válido, aleatório)
function genCpf() {
  for (;;) {
    const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
    if (n.every((x) => x === n[0])) continue;
    const dv = (arr: number[]) => { const len = arr.length; let s = 0; for (let i = 0; i < len; i++) s += arr[i] * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    const d1 = dv(n), d2 = dv([...n, d1]);
    return [...n, d1, d2].join("");
  }
}

// ---------------------------------------------------------------- pessoas
type Person = { user: ReturnType<typeof newUser>; ctx: BrowserContext; userId: string };

async function owner(browser: Browser) {
  const ctx = await newContext(browser);
  const user = newUser("rh");
  await register(ctx.request, user);
  const rme = await ok<any>(await call(ctx.request, "GET", "/v1/rh/me"), "/v1/rh/me do owner");
  return { user, ctx, req: ctx.request, employeeId: rme.employeeId as string, rme };
}

/** Convida e cadastra mais um membro na empresa do owner. */
async function addMember(browser: Browser, mailReq: APIRequestContext, ownerReq: APIRequestContext, tag = "colab"): Promise<Person> {
  const u = newUser(tag);
  await ok(await call(ownerReq, "POST", "/v1/invitations", { email: u.email, role: "MEMBER" }), "convite");
  const mail = await waitForEmail(mailReq, u.email, { contains: "/convite" });
  const token = new URL(linkFrom(mail, "/convite")).searchParams.get("token");
  const ctx = await newContext(browser);
  await register(ctx.request, u, { invitationToken: token });
  const m = items<any>(await ok(await call(ownerReq, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === u.email);
  expect(m, `membro ${u.email} na lista`).toBeTruthy();
  return { user: u, ctx, userId: m.user.id };
}

async function newEmployee(ownerReq: APIRequestContext, extra: Record<string, unknown> = {}) {
  const body = { fullName: `Pessoa ${Math.random().toString(36).slice(2, 7)}`, cpf: genCpf(), contractType: "CLT", admissionDate: addDays(today(), -400), ...extra };
  const e = await ok<any>(await call(ownerReq, "POST", "/v1/rh/employees", body), `cadastrar ${body.fullName}`);
  expect(e.id, "colaborador criado com id").toBeTruthy();
  return { ...e, cpf: body.cpf } as any;
}

async function getFicha(req: APIRequestContext, id: string, label: string) { return ok<any>(await call(req, "GET", `/v1/rh/employees/${id}`), label); }
async function vacation(req: APIRequestContext, id: string) { return ok<any>(await call(req, "GET", `/v1/rh/employees/${id}/vacation`), "saldo de férias"); }

/** Primeira segunda-feira (a partir de `from`) que o servidor aceita como início (sem feriado nos 2 dias seguintes). */
async function okMonday(req: APIRequestContext, employeeId: string, periodIndex: number, from: string, days = 10) {
  let d = nextWeekday(from, 1);
  for (let i = 0; i < 4; i++, d = addDays(d, 7)) {
    const v = await ok<any>(await call(req, "POST", "/v1/rh/vacation-requests/validate", { employeeId, periodIndex, segments: [{ start: d, days }] }), "validar");
    if (!codesOf(v).includes("START_BEFORE_REST")) return d;
  }
  throw new Error("nenhuma segunda-feira aceita em 4 semanas: START_BEFORE_REST em tudo?");
}

const PDF = (text: string) => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% ${text}\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
async function uploadPdf(req: APIRequestContext, fileName: string, text: string, purpose: string) {
  const bytes = PDF(text);
  const start = await ok<any>(await call(req, "POST", "/v1/uploads", { fileName, size: bytes.length, mimeType: "application/pdf", purpose }), `iniciar envio de ${fileName}`);
  const put = await req.fetch(start.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf", ...(start.headers ?? {}) }, data: bytes, failOnStatusCode: false });
  expect(put.status(), `enviar ${fileName}`).toBeLessThan(300);
  await ok(await call(req, "POST", `/v1/uploads/${start.fileId}/complete`), `concluir ${fileName}`);
  return start.fileId as string;
}
const hasUploads = async (req: APIRequestContext) => cfg.addons.includes("uploads") || (await call(req, "GET", "/v1/files/usage")).status() !== 404;

test.describe("RH", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset rh");
  });

  test("API: colaborador com CPF válido e único, gestor sem ciclo e ficha projetada por permissão", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    expect(o.rme.rhRole, "owner é RH_ADMIN").toBe("RH_ADMIN");
    expect(o.employeeId, "owner nasce com ficha").toBeTruthy();
    const B = await addMember(browser, request, o.req, "gestor");
    const C = await addMember(browser, request, o.req, "colab");

    const bad = await expectCode(await call(o.req, "POST", "/v1/rh/employees", { fullName: "CPF ruim", cpf: "123.456.789-00", contractType: "CLT", admissionDate: today() }), 400, "VALIDATION_ERROR", "CPF inválido");
    expect((bad.errors ?? []).some((e: any) => e.path === "cpf"), "erro aponta o campo cpf").toBe(true);

    const mgr = await newEmployee(o.req, { userId: B.userId, salaryCents: 900000 });
    const emp = await newEmployee(o.req, { userId: C.userId, managerId: mgr.id, salaryCents: 500000 });
    await expectCode(await call(o.req, "POST", "/v1/rh/employees", { fullName: "Repetido", cpf: emp.cpf, contractType: "CLT", admissionDate: today() }), 409, "CPF_TAKEN", "CPF repetido na empresa");
    await expectCode(await call(o.req, "PATCH", `/v1/rh/employees/${mgr.id}`, { managerId: emp.id }), 400, "INVALID_MANAGER", "gestor em ciclo");
    await expectCode(await call(o.req, "PATCH", `/v1/rh/employees/${mgr.id}`, { managerId: mgr.id }), 400, "INVALID_MANAGER", "gestor de si mesmo");

    const bme = await ok<any>(await call(B.ctx.request, "GET", "/v1/rh/me"), "/v1/rh/me do gestor");
    expect([bme.employeeId, bme.isManager, bme.reportsCount, bme.rhRole ?? null], "gestor: ficha, isManager, 1 liderado, sem papel de RH").toEqual([mgr.id, true, 1, null]);

    const colleagueView = await getFicha(C.ctx.request, mgr.id, "colaborador vê a ficha do gestor");
    expect(colleagueView.visibleGroups, "colaborador vê só o público de outra pessoa").toEqual(["public"]);
    for (const k of ["compensation", "personal", "bank", "job", "rhNotes"]) expect(colleagueView[k], `ficha de outro sem "${k}"`).toBeUndefined();
    expect(JSON.stringify(colleagueView), "CPF do gestor não aparece").not.toContain(mgr.cpf);

    const selfView = await getFicha(C.ctx.request, emp.id, "colaborador vê a própria ficha");
    expect(selfView.compensation?.currentCents, "a pessoa vê o próprio salário").toBe(500000);
    expect(selfView.personal?.cpf, "a pessoa vê o próprio CPF").toBe(emp.cpf);
    expect("rhNotes" in selfView, "anotações do RH não vêm para a pessoa").toBe(false);

    const managerView = await getFicha(B.ctx.request, emp.id, "gestor vê o liderado");
    expect(managerView.visibleGroups, "gestor: público, contrato, ausências e desempenho").toEqual(expect.arrayContaining(["public", "job", "absences", "performance"]));
    for (const k of ["compensation", "personal", "bank", "rhNotes"]) expect(managerView[k], `gestor não recebe "${k}"`).toBeUndefined();

    const rhView = await getFicha(o.req, emp.id, "RH vê tudo");
    expect(rhView.compensation?.currentCents, "RH vê o salário").toBe(500000);
    expect(rhView.personal?.cpf, "RH vê o CPF").toBe(emp.cpf);

    const list = items<any>(await ok(await call(C.ctx.request, "GET", "/v1/rh/employees"), "diretório como colaborador"));
    expect(list.some((x) => x.id === mgr.id) && list.some((x) => x.id === emp.id), "diretório lista as pessoas").toBe(true);
    const flat = JSON.stringify(list);
    expect(flat.includes(mgr.cpf) || flat.includes(emp.cpf) || flat.includes("900000") || flat.includes("500000"), "diretório sem CPF nem salário").toBe(false);

    const chart = await ok<any>(await call(C.ctx.request, "GET", "/v1/rh/org-chart"), "organograma");
    const node = (id: string) => chart.nodes.find((n: any) => n.id === id);
    expect(node(emp.id)?.managerId, "organograma liga liderado ao gestor").toBe(mgr.id);
    expect(node(mgr.id)?.reportsCount, "gestor com 1 liderado no organograma").toBe(1);

    const other = await newContext(browser);
    await register(other.request, newUser("outra"));
    expect((await call(other.request, "GET", `/v1/rh/employees/${emp.id}`)).status(), "ficha de outra empresa → 404").toBe(404);
  });

  test("API: saldo de férias pela CLT (faltas, situações) e cada regra do pedido", async ({ browser }) => {
    const o = await owner(browser);
    const adm = addDays(today(), -(365 * 2 + 31));
    const x = await newEmployee(o.req, { admissionDate: adm });
    const p1start = addDays(adm, 366);
    await ok(await call(o.req, "POST", "/v1/rh/leaves", { employeeId: x.id, type: "falta", start: addDays(p1start, 10), days: 6 }), "RH lança 6 faltas no 2º período");

    const v = await vacation(o.req, x.id);
    expect(v.regime, "CLT usa o regime clt").toBe("clt");
    const [p0, p1, p2] = v.periods;
    expect(p0.status, "1º período: concessivo acabou com saldo → vencida").toBe("vencida");
    expect([p1.entitled, p1.status], "2º período: 6 faltas → 24 dias, disponível").toEqual([24, "disponivel"]);
    expect(p2.status, "período em curso → em aquisição").toBe("em_aquisicao");

    const validate = async (b: Record<string, unknown>) => ok<any>(await call(o.req, "POST", "/v1/rh/vacation-requests/validate", { employeeId: x.id, periodIndex: 1, ...b }), "validar plano");
    const friday = nextWeekday(addDays(today(), 40), 5);
    expect(codesOf(await validate({ segments: [{ start: friday, days: 10 }] })), "começar numa sexta (descanso no domingo)").toContain("START_BEFORE_REST");
    const monday = await okMonday(o.req, x.id, 1, addDays(today(), 40));
    expect(codesOf(await validate({ segments: [{ start: monday, days: 4 }] })), "trecho com menos de 5 dias").toContain("SEGMENT_MIN_5");
    expect(codesOf(await validate({ segments: [{ start: monday, days: 10 }, { start: addDays(monday, 21), days: 10 }] })), "10 + 10 com saldo 24: não sobra como ter 14").toContain("MIN_14_REQUIRED");
    expect(codesOf(await validate({ segments: [{ start: monday, days: 14 }], abonoDays: 9 })), "vender mais que 1/3 de 24").toContain("ABONO_MAX");
    expect(codesOf(await validate({ segments: [{ start: monday, days: 25 }] })), "acima do saldo").toContain("EXCEEDS_BALANCE");
    expect(codesOf(await validate({ periodIndex: 2, segments: [{ start: monday, days: 10 }] })), "período ainda em aquisição").toContain("PERIOD_NOT_COMPLETE");
    const good = await validate({ segments: [{ start: monday, days: 14 }], abonoDays: 8 });
    expect([good.ok, codesOf(good)], "14 dias + venda de 8 é válido").toEqual([true, []]);
    expect(good.plan?.[0]?.returnDate, "volta no dia seguinte ao último dia").toBe(addDays(monday, 14));
    expect(good.abonoMax, "máximo de venda = 1/3 de 24").toBe(8);
  });

  test("API: pedido de férias vai ao gestor; quem pede não aprova; recusa exige comentário; saldo reservado, descontado e devolvido", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const B = await addMember(browser, request, o.req, "gestor");
    const C = await addMember(browser, request, o.req, "colab");
    const mgr = await newEmployee(o.req, { userId: B.userId });
    const emp = await newEmployee(o.req, { userId: C.userId, managerId: mgr.id });
    const monday = await okMonday(o.req, emp.id, 0, addDays(today(), 40));

    const created = await ok<any>(await call(C.ctx.request, "POST", "/v1/rh/vacation-requests", { periodIndex: 0, segments: [{ start: monday, days: 10 }] }), "colaborador pede férias");
    const ap = created.approval;
    expect([created.request?.status, ap?.status], "pedido e aprovação pendentes").toEqual(["PENDING", "PENDING"]);
    expect(ap.steps?.[0]?.approvers?.map((a: any) => a.userId), "primeira etapa: o gestor direto").toEqual([B.userId]);
    expect((await vacation(C.ctx.request, emp.id)).periods[0].balance, "pendente reserva o saldo").toBe(20);
    const over = await expectCode(await call(C.ctx.request, "POST", "/v1/rh/vacation-requests", { periodIndex: 0, segments: [{ start: addDays(monday, 28), days: 21 }] }), 422, "VACATION_RULES", "segundo pedido acima do saldo");
    expect(codesOf(over), "violação de saldo").toContain("EXCEEDS_BALANCE");

    await expectCode(await call(C.ctx.request, "POST", `/v1/rh/approvals/${ap.id}/decision`, { decision: "approve" }), 403, "NOT_APPROVER", "quem pede não aprova");
    const box = items<any>(await ok(await call(B.ctx.request, "GET", "/v1/rh/approvals?box=to_me"), "caixa do gestor"));
    expect(box.some((x) => x.id === ap.id && x.kind === "VACATION"), "pedido na caixa Para aprovar do gestor").toBe(true);
    await expectCode(await call(B.ctx.request, "POST", `/v1/rh/approvals/${ap.id}/decision`, { decision: "reject", comment: "  " }), 400, "COMMENT_REQUIRED", "recusa sem comentário");
    const done = await ok<any>(await call(B.ctx.request, "POST", `/v1/rh/approvals/${ap.id}/decision`, { decision: "approve" }), "gestor aprova");
    expect(done.status, "aprovado").toBe("APPROVED");
    expect([409], "decidir de novo").toContain((await call(B.ctx.request, "POST", `/v1/rh/approvals/${ap.id}/decision`, { decision: "approve" })).status());
    const after = await vacation(C.ctx.request, emp.id);
    expect([after.periods[0].balance, after.requests.find((r: any) => r.id === created.request.id)?.status], "aprovado desconta").toEqual([20, "APPROVED"]);

    // gestor sem gestor → vai para o RH; recusa devolve o saldo
    const mine = await ok<any>(await call(B.ctx.request, "POST", "/v1/rh/vacation-requests", { periodIndex: 0, segments: [{ start: monday, days: 30 }] }), "gestor (sem gestor) pede férias");
    expect(mine.approval.steps[0].approvers.map((a: any) => a.userId), "sem gestor: cai no RH (owner)").toEqual([(await me(o.req)).user.id]);
    expect(mine.approval.steps[0].fallback, "marcado como fallback").toBe(true);
    expect((await vacation(B.ctx.request, mgr.id)).periods[0].balance, "reservado").toBe(0);
    await ok(await call(o.req, "POST", `/v1/rh/approvals/${mine.approval.id}/decision`, { decision: "reject", comment: "Período de fechamento" }), "RH recusa com comentário");
    expect((await vacation(B.ctx.request, mgr.id)).periods[0].balance, "recusa devolve o saldo").toBe(30);

    // ausências: atestado pela pessoa (sensível para o gestor), falta só pelo RH
    await ok(await call(C.ctx.request, "POST", "/v1/rh/leaves", { type: "atestado", start: today(), days: 1 }), "colaborador lança atestado");
    expect((await call(C.ctx.request, "POST", "/v1/rh/leaves", { type: "falta", start: today(), days: 1 })).status(), "colaborador não lança falta").toBe(403);
    const cal = await ok<any>(await call(B.ctx.request, "GET", `/v1/rh/absences?scope=team&from=${addDays(today(), -1)}&to=${addDays(today(), 1)}`), "calendário do gestor");
    const it = (cal.items ?? []).find((i: any) => i.employeeId === emp.id && i.kind === "leave");
    expect(it?.type, "gestor vê o atestado como ausência médica").toBe("medical");
  });

  test("API: despesa acima do limite exige justificativa; relatório acima de R$ 1.000 passa pelo financeiro", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    await ensureFeature(o.req, "rh_expenses");
    const C = await addMember(browser, request, o.req, "colab");
    const F = await addMember(browser, request, o.req, "financeiro");
    await newEmployee(o.req, { userId: C.userId, managerId: o.employeeId });
    await newEmployee(o.req, { userId: F.userId, managerId: o.employeeId });
    await ok(await call(o.req, "PUT", `/v1/rh/roles/${F.userId}`, { role: "FINANCE" }), "papel FINANCE");
    const cats = items<any>(await ok(await call(o.req, "GET", "/v1/rh/expense-categories"), "categorias"));
    expect(cats.some((c) => c.perKmCents > 0), "categoria de quilometragem pronta").toBe(true);
    const cat = await ok<any>(await call(o.req, "POST", "/v1/rh/expense-categories", { name: `Treinamento ${Date.now()}`, limitCents: 10000 }), "categoria com limite R$ 100");

    const day = addDays(today(), -2);
    const noJust = await expectCode(await call(C.ctx.request, "POST", "/v1/rh/expenses", { categoryId: cat.id, date: day, amountCents: 15000, description: "Curso" }), 422, "EXPENSE_RULES", "acima do limite sem justificativa");
    expect(codesOf(noJust), "código de justificativa").toContain("OVER_LIMIT_JUSTIFY");
    expect(codesOf(await expectCode(await call(C.ctx.request, "POST", "/v1/rh/expenses", { categoryId: cat.id, date: addDays(today(), 1), amountCents: 1000, description: "Futuro" }), 422, "EXPENSE_RULES", "data no futuro")), "data futura").toContain("FUTURE_DATE");
    const e1 = await ok<any>(await call(C.ctx.request, "POST", "/v1/rh/expenses", { categoryId: cat.id, date: day, amountCents: 15000, description: "Curso", justification: "Curso pedido pelo gestor" }), "com justificativa");
    expect((e1.warnings ?? []).map((w: any) => w.code), "passa com aviso").toContain("OVER_LIMIT");
    const e2 = await ok<any>(await call(C.ctx.request, "POST", "/v1/rh/expenses", { categoryId: cat.id, date: day, amountCents: 9500, description: "Material" }), "despesa pequena");

    const small = await ok<any>(await call(C.ctx.request, "POST", "/v1/rh/expense-reports", { title: "Pequeno", expenseIds: [e2.expense.id] }), "relatório pequeno");
    const smallSent = await ok<any>(await call(C.ctx.request, "POST", `/v1/rh/expense-reports/${small.id}/submit`), "enviar pequeno");
    expect(smallSent.approval.steps.length, "até R$ 1.000: só o gestor").toBe(1);
    const big = await ok<any>(await call(C.ctx.request, "POST", "/v1/rh/expense-reports", { title: "Grande", expenseIds: [e1.expense.id] }), "relatório");
    expect(big.totalCents, "total em centavos").toBe(15000);
    // relatório acima de R$ 1.000 (9.900 + 95.000 centavos)
    const e3 = await ok<any>(await call(C.ctx.request, "POST", "/v1/rh/expenses", { categoryId: cat.id, date: day, amountCents: 9900, description: "Livros" }), "despesa 3");
    const e4 = await ok<any>(await call(C.ctx.request, "POST", "/v1/rh/expenses", { categoryId: cat.id, date: day, amountCents: 95000, description: "Inscrição", justification: "Congresso anual" }), "despesa 4");
    const big2 = await ok<any>(await call(C.ctx.request, "POST", "/v1/rh/expense-reports", { title: "Congresso", expenseIds: [e3.expense.id, e4.expense.id] }), "relatório acima de R$ 1.000");
    const sent = await ok<any>(await call(C.ctx.request, "POST", `/v1/rh/expense-reports/${big2.id}/submit`), "enviar");
    expect(sent.report.status, "enviado").toBe("SUBMITTED");
    const approvers = sent.approval.steps.map((s: any) => s.approvers.map((a: any) => a.userId));
    expect(approvers.length, "duas etapas: gestor e financeiro").toBe(2);
    expect(approvers[1], "segunda etapa: quem tem o papel FINANCE").toEqual([F.userId]);
    expect((await call(C.ctx.request, "GET", "/v1/rh/expense-reports?box=to_pay")).status(), "colaborador não vê a fila do financeiro").toBe(403);
  });

  test("API: documentos com validade; só o RH e a pessoa veem", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    test.skip(!(await hasUploads(o.req)), "projeto sem o add-on uploads");
    const C = await addMember(browser, request, o.req, "colab");
    const D = await addMember(browser, request, o.req, "colega");
    const emp = await newEmployee(o.req, { userId: C.userId });
    await newEmployee(o.req, { userId: D.userId });
    const cats = await ok<any>(await call(o.req, "GET", "/v1/rh/document-categories"), "categorias de documento");
    const cert = items<any>(cats).find((c) => c.hasExpiry) ?? items<any>(cats)[0];
    const add = async (name: string, expiresAt: string | null) => ok<any>(await call(o.req, "POST", `/v1/rh/employees/${emp.id}/documents`, { categoryId: cert.id, name, fileId: await uploadPdf(o.req, `${name}.pdf`, name, "rh_document"), expiresAt }), `enviar ${name}`);
    expect((await add("NR-35", addDays(today(), 10))).expiry, "vence em 10 dias").toBe("vencendo");
    expect((await add("CNH", addDays(today(), 90))).expiry, "vence em 90 dias").toBe("valido");
    expect((await add("ASO antigo", addDays(today(), -1))).expiry, "venceu ontem").toBe("vencido");
    expect((await add("Diploma", null)).expiry, "sem validade").toBe("sem_validade");

    const exp = items<any>(await ok(await call(o.req, "GET", "/v1/rh/documents/expiring?days=30"), "vencendo (RH)"));
    expect(exp.some((d) => d.name === "NR-35") && !exp.some((d) => d.name === "CNH"), "lista de vencendo tem NR-35 e não a CNH").toBe(true);
    expect(items<any>(await ok(await call(C.ctx.request, "GET", `/v1/rh/employees/${emp.id}/documents`), "a pessoa vê os seus")).length, "4 documentos").toBe(4);
    expect((await call(D.ctx.request, "GET", `/v1/rh/employees/${emp.id}/documents`)).status(), "colega não vê documentos de outro").toBe(404);
    expect((await call(D.ctx.request, "GET", "/v1/rh/documents/expiring")).status(), "colega não vê o painel de vencendo").toBe(403);
  });

  test("API: holerites em lote casados pelo CPF; cada um vê só os seus", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    test.skip(!(await hasUploads(o.req)), "projeto sem o add-on uploads");
    const C = await addMember(browser, request, o.req, "colab");
    const D = await addMember(browser, request, o.req, "colega");
    const ec = await newEmployee(o.req, { userId: C.userId });
    const ed = await newEmployee(o.req, { userId: D.userId });
    const files = [
      { name: `holerite_${ec.cpf}.pdf`, fileId: await uploadPdf(o.req, `holerite_${ec.cpf}.pdf`, "Holerite", "rh_payslip") },
      { name: "setembro-bia.pdf", fileId: await uploadPdf(o.req, "setembro-bia.pdf", `Funcionario CPF ${ed.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`, "rh_payslip") },
      { name: "sem-cpf.pdf", fileId: await uploadPdf(o.req, "sem-cpf.pdf", "capa do lote", "rh_payslip") },
    ];
    const batch = await ok<any>(await call(o.req, "POST", "/v1/rh/payslip-batches", { kind: "PAYSLIP", reference: "2026-09", label: "Holerite de setembro/2026", files }), "lote");
    expect(batch.status, "lote em rascunho").toBe("DRAFT");
    expect(batch.preview.matched.map((m: any) => m.employeeId).sort(), "casou pelo CPF no nome e no texto").toEqual([ec.id, ed.id].sort());
    expect(batch.preview.unmatched.map((u: any) => u.file), "sem CPF fica sem dono").toEqual(["sem-cpf.pdf"]);
    expect((await ok<any>(await call(o.req, "POST", `/v1/rh/payslip-batches/${batch.id}/publish`), "publicar")).published, "2 publicados").toBe(2);
    await expectCode(await call(o.req, "POST", `/v1/rh/payslip-batches/${batch.id}/publish`), 409, "BATCH_PUBLISHED", "publicar de novo");

    const mineC = items<any>(await ok(await call(C.ctx.request, "GET", "/v1/rh/me/payslips"), "holerites de C"));
    const mineD = items<any>(await ok(await call(D.ctx.request, "GET", "/v1/rh/me/payslips"), "holerites de D"));
    expect([mineC.length, mineD.length], "um para cada").toEqual([1, 1]);
    expect(mineC[0].id === mineD[0].id, "holerites diferentes").toBe(false);
    expect((await call(C.ctx.request, "POST", `/v1/rh/payslips/${mineD[0].id}/ack`)).status(), "holerite de outra pessoa → 404").toBe(404);
    await ok(await call(C.ctx.request, "POST", `/v1/rh/payslips/${mineC[0].id}/ack`), "confirmar recebimento");
    expect(items<any>(await ok(await call(C.ctx.request, "GET", "/v1/rh/me/payslips"), "de novo"))[0].ackAt, "ciência registrada").toBeTruthy();
  });

  test("API: pesquisa anônima só mostra resultado com 5 respostas e nunca quem respondeu", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    await ensureFeature(o.req, "rh_surveys");
    const depA = await ok<any>(await call(o.req, "POST", "/v1/rh/departments", { name: `Vendas ${Date.now()}` }), "área A");
    const depB = await ok<any>(await call(o.req, "POST", "/v1/rh/departments", { name: `Suporte ${Date.now()}` }), "área B");
    await ok(await call(o.req, "PATCH", `/v1/rh/employees/${o.employeeId}`, { departmentId: depA.id }), "owner na área A");
    const people: Person[] = [];
    for (const [i, dep] of [depA, depA, depB, depB].entries()) {
      const p = await addMember(browser, request, o.req, `clima${i}`);
      await newEmployee(o.req, { userId: p.userId, departmentId: dep.id });
      people.push(p);
    }
    const s = await ok<any>(await call(o.req, "POST", "/v1/rh/surveys", { kind: "ENPS", title: "eNPS do trimestre", questions: [{ id: "q1", kind: "SCALE", text: "Recomendo minha área" }], closesAt: new Date(Date.now() + 7 * 864e5).toISOString() }), "criar pesquisa");
    expect((await ok<any>(await call(o.req, "POST", `/v1/rh/surveys/${s.id}/launch`), "lançar")).invitedCount, "5 convidados").toBe(5);

    const answer = (req: APIRequestContext, enps: number) => call(req, "POST", `/v1/rh/surveys/${s.id}/responses`, { enps, answers: { q1: 4 } });
    for (const [i, p] of people.entries()) await ok(await answer(p.ctx.request, [10, 9, 6, 8][i]), `resposta ${i + 1}`);
    await expectCode(await answer(people[0].ctx.request, 0), 409, "ALREADY_RESPONDED", "responder duas vezes");
    const r4 = await ok<any>(await call(o.req, "GET", `/v1/rh/surveys/${s.id}/results`), "resultado com 4");
    expect([r4.total, r4.overall ?? null, (r4.groups ?? []).length], "4 respostas: nada aparece").toEqual([4, null, 0]);

    await ok(await answer(o.req, 10), "5ª resposta");
    const r5 = await ok<any>(await call(o.req, "GET", `/v1/rh/surveys/${s.id}/results`), "resultado com 5");
    expect(r5.overall?.n, "5 respostas: geral aparece").toBe(5);
    expect(r5.overall?.enps, "eNPS = (3 promotores − 1 detrator) / 5").toBe(40);
    expect((r5.groups ?? []).map((g: any) => [g.groupId, g.n]), "áreas com 3 e 2 respostas não aparecem; juntas viram 'outros'").toEqual([["outros", 5]]);
    const flat = JSON.stringify(r5);
    for (const p of people) {
      expect(flat.includes(p.userId) || flat.includes(p.user.email), "resultado sem id nem e-mail de quem respondeu").toBe(false);
    }
    expect(/"(userId|employeeId|respondent)"/.test(flat), "resultado sem campo de pessoa").toBe(false);
    expect((await call(people[0].ctx.request, "GET", `/v1/rh/surveys/${s.id}/results`)).status(), "colaborador não vê o resultado").toBe(403);
  });

  test("API: pré-admissão pelo link público, conferência e efetivação com checklist", async ({ browser, playwright }) => {
    test.slow();
    const o = await owner(browser);
    await ensureFeature(o.req, "rh_preadmission");
    const cpf = genCpf();
    const created = await ok<any>(await call(o.req, "POST", "/v1/rh/admissions", { fullName: "Nova Pessoa", cpf, personalEmail: `nova.${Date.now()}@example.com`, contractType: "CLT", admissionDate: addDays(today(), 7) }), "nova admissão");
    expect(created.employee?.status, "nasce em pré-admissão").toBe("PRE_ADMISSION");
    const token = String(created.link ?? "").split("/pre-admissao/")[1];
    expect(token, "link /pre-admissao/<token>").toBeTruthy();

    const anon = await playwright.request.newContext({ baseURL: cfg.apiURL });
    await expectCode(await call(anon, "GET", `/v1/public/rh/admissions/${token}x`), 404, "ADMISSION_LINK_INVALID", "token errado");
    const pub = await ok<any>(await call(anon, "GET", `/v1/public/rh/admissions/${token}`), "página pública sem login");
    expect(pub.person?.fullName, "mostra o nome").toBe("Nova Pessoa");
    expect(JSON.stringify(pub), "não devolve o CPF inteiro nem dados internos").not.toContain("salary");
    const required = (pub.requiredDocs ?? []).filter((d: any) => d.required);
    expect(required.length, "lista de documentos obrigatórios").toBeGreaterThan(0);
    await ok(await call(anon, "PUT", `/v1/public/rh/admissions/${token}`, { data: { personalPhone: "11999999999", address: { cep: "01001000", street: "Praça da Sé", number: "1", city: "São Paulo", state: "SP" } } }), "salvar rascunho");
    expect((await call(anon, "POST", `/v1/public/rh/admissions/${token}/submit`)).status(), "enviar sem documentos → 400").toBe(400);

    for (const d of required) {
      const bytes = PDF(d.key);
      const st = await ok<any>(await call(anon, "POST", `/v1/public/rh/admissions/${token}/uploads`, { key: d.key, fileName: `${d.key}.pdf`, size: bytes.length, mimeType: "application/pdf" }), `iniciar ${d.key}`);
      const put = await anon.fetch(st.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf", ...(st.headers ?? {}) }, data: bytes, failOnStatusCode: false });
      expect(put.status(), `enviar ${d.key}`).toBeLessThan(300);
      await ok(await call(anon, "POST", `/v1/public/rh/admissions/${token}/uploads/${st.fileId}/complete`), `concluir ${d.key}`);
    }
    expect((await ok<any>(await call(anon, "POST", `/v1/public/rh/admissions/${token}/submit`), "enviar para o RH")).status, "enviado").toBe("SUBMITTED");

    const inc = await expectCode(await call(o.req, "POST", `/v1/rh/admissions/${created.admission.id}/complete`), 409, "ADMISSION_INCOMPLETE", "efetivar sem conferir os documentos");
    expect((inc.missing ?? []).length, "lista o que falta").toBeGreaterThan(0);
    for (const d of required) await ok(await call(o.req, "POST", `/v1/rh/admissions/${created.admission.id}/documents/${d.key}/review`, { status: "APPROVED" }), `aprovar ${d.key}`);
    const done = await ok<any>(await call(o.req, "POST", `/v1/rh/admissions/${created.admission.id}/complete`), "efetivar");
    expect(done.employee?.status, "ativo").toBe("ACTIVE");
    expect((done.checklist?.items ?? []).length > 0 && done.checklist.items.every((i: any) => /^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)), "checklist de admissão com prazos").toBe(true);
    expect((await call(anon, "GET", `/v1/public/rh/admissions/${token}`)).status(), "link não vale mais depois de efetivar").toBe(404);
    await anon.dispose();
  });

  test("Tela: colaborador pede férias (erro ao começar numa sexta) e o gestor aprova na caixa", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const B = await addMember(browser, request, o.req, "gestor");
    const C = await addMember(browser, request, o.req, "colab");
    const mgr = await newEmployee(o.req, { userId: B.userId });
    const emp = await newEmployee(o.req, { userId: C.userId, managerId: mgr.id });
    const friday = nextWeekday(addDays(today(), 40), 5);
    const monday = await okMonday(o.req, emp.id, 0, addDays(today(), 40));

    const page = await C.ctx.newPage();
    await page.goto("/pessoas");
    await expect(page.getByTestId("rh-home"), "Início do colaborador").toHaveAttribute("data-role", "colaborador");
    await page.goto("/pessoas/ferias");
    await expect(page.locator('[data-testid="vacation-balance"][data-period="0"]'), "período 0 disponível").toHaveAttribute("data-status", "disponivel");
    await page.getByTestId("vacation-request-new").click();
    const form = page.getByTestId("vacation-request-form");
    await expect(form).toBeVisible();
    await form.locator('[data-testid="vacation-segment-start"][data-index="0"]').fill(friday);
    await form.locator('[data-testid="vacation-segment-days"][data-index="0"]').fill("10");
    await expect(form.locator('[data-testid="vacation-violation"][data-code="START_BEFORE_REST"]'), "erro ao começar na sexta").toBeVisible();
    await expect(form.getByTestId("vacation-request-submit"), "enviar bloqueado com erro").toBeDisabled();
    await form.locator('[data-testid="vacation-segment-start"][data-index="0"]').fill(monday);
    await expect(form.locator('[data-testid="vacation-violation"]'), "sem erro na segunda").toHaveCount(0);
    await expect(form.getByTestId("vacation-summary"), "resumo com retorno e saldo").toBeVisible();
    await form.getByTestId("vacation-request-submit").click();
    await expect(page.locator('[data-testid="vacation-request-item"][data-status="PENDING"]'), "pedido pendente na lista").toBeVisible();

    const mp = await B.ctx.newPage();
    await mp.goto("/pessoas/aprovacoes");
    await expect(mp.getByTestId("approvals-count"), "contador de aprovações").toHaveText(/1/);
    const row = mp.locator('[data-testid="approval-item"][data-kind="VACATION"]');
    await expect(row, "pedido na caixa do gestor").toHaveCount(1);
    await row.getByTestId("approval-approve").click();
    await expect(mp.locator('[data-testid="approval-item"][data-kind="VACATION"][data-status="PENDING"]'), "sai da caixa depois de aprovar").toHaveCount(0);
    const v = await vacation(o.req, emp.id);
    expect(v.requests[0]?.status, "aprovado na API").toBe("APPROVED");
  });

  test("Tela: ficha com abas conforme a permissão, organograma e Início por papel", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const C = await addMember(browser, request, o.req, "colab");
    const emp = await newEmployee(o.req, { userId: C.userId, managerId: o.employeeId, salaryCents: 450000 });

    const op = await o.ctx.newPage();
    await op.goto("/pessoas");
    await expect(op.getByTestId("rh-home"), "Início do RH").toHaveAttribute("data-role", "rh");

    const page = await C.ctx.newPage();
    await page.goto("/pessoas/colaboradores");
    await expect(page.locator(`[data-testid="employee-row"][data-id="${emp.id}"]`), "a própria linha no diretório").toBeVisible();
    await expect(page.locator(`[data-testid="employee-row"][data-id="${o.employeeId}"]`), "o gestor no diretório").toBeVisible();
    await expect(page.getByTestId("employee-new"), "colaborador não cadastra").toHaveCount(0);

    await page.goto(`/pessoas/colaboradores/${emp.id}`);
    await expect(page.getByTestId("employee-profile")).toHaveAttribute("data-id", emp.id);
    await page.locator('[data-testid="employee-tab"][data-tab="remuneracao"]').click();
    await expect(page.getByTestId("employee-salary"), "a pessoa vê o próprio salário").toBeVisible();

    await page.goto(`/pessoas/colaboradores/${o.employeeId}`);
    await expect(page.getByTestId("employee-profile")).toHaveAttribute("data-id", o.employeeId);
    await expect(page.locator('[data-testid="employee-tab"][data-tab="resumo"]'), "aba resumo").toBeVisible();
    for (const tab of ["remuneracao", "pessoal", "documentos"]) await expect(page.locator(`[data-testid="employee-tab"][data-tab="${tab}"]`), `sem a aba ${tab} na ficha de outra pessoa`).toHaveCount(0);
    await expect(page.getByTestId("employee-salary"), "sem salário de outra pessoa").toHaveCount(0);

    await page.goto("/pessoas/organograma");
    await expect(page.locator(`[data-testid="org-node"][data-id="${o.employeeId}"]`), "owner no organograma").toBeVisible();
    await expect(page.locator(`[data-testid="org-node"][data-id="${emp.id}"]`), "colaborador no organograma").toBeVisible();
  });
});
