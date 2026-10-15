import { test, expect, type APIRequestContext, type APIResponse, type Browser, type BrowserContext } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register } from "../support/api";
import { cfg } from "../support/config.mjs";
import { linkFrom, waitForEmail } from "../support/mailpit";
import { newContext } from "../support/ui";

// Pessoas · operação avançada e perfis (skills/rh/references/10 e 11). Roda com o preset rh. Confere o que mais se
// simplifica: escala que não deixa escalar em férias nem cruzar turnos e avisa a interjornada, vaga pública com
// consentimento e sem candidatura repetida, funil por etapa, comunicado só para quem recebe com ciência e pendentes,
// treinamentos vencidos na matriz, celebrações do dia, EPI com CA vencido recusado, registro no conselho que impede
// atender e rodízio de folgas com domingo e folguista.

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
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); };
function genCpf() {
  for (;;) {
    const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
    if (n.every((x) => x === n[0])) continue;
    const dv = (arr: number[]) => { const len = arr.length; let s = 0; for (let i = 0; i < len; i++) s += arr[i] * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    const d1 = dv(n), d2 = dv([...n, d1]);
    return [...n, d1, d2].join("");
  }
}
async function owner(browser: Browser) {
  const ctx = await newContext(browser);
  const user = newUser("rhx");
  await register(ctx.request, user);
  const rme = await ok<any>(await call(ctx.request, "GET", "/v1/rh/me"), "/v1/rh/me do owner");
  return { user, ctx, req: ctx.request, employeeId: rme.employeeId as string };
}
async function addMember(browser: Browser, mailReq: APIRequestContext, ownerReq: APIRequestContext, tag = "colab"): Promise<{ ctx: BrowserContext; userId: string }> {
  const u = newUser(tag);
  await ok(await call(ownerReq, "POST", "/v1/invitations", { email: u.email, role: "MEMBER" }), "convite");
  const mail = await waitForEmail(mailReq, u.email, { contains: "/convite" });
  const token = new URL(linkFrom(mail, "/convite")).searchParams.get("token");
  const ctx = await newContext(browser);
  await register(ctx.request, u, { invitationToken: token });
  const m = items<any>(await ok(await call(ownerReq, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === u.email);
  return { ctx, userId: m.user.id };
}
async function emp(ownerReq: APIRequestContext, extra: Record<string, unknown> = {}) {
  const body = { fullName: `Pessoa ${Math.random().toString(36).slice(2, 7)} Silva`, cpf: genCpf(), contractType: "CLT", admissionDate: "2024-03-01", ...extra };
  return ok<any>(await call(ownerReq, "POST", "/v1/rh/employees", body), `cadastrar ${body.fullName}`);
}
const pub = (req: APIRequestContext, path: string, data?: unknown) => req.fetch(`${cfg.apiURL}${path}`, { method: data ? "POST" : "GET", headers: { Origin: cfg.webURL, ...(data ? { "Content-Type": "application/json" } : {}) }, data: data ? JSON.stringify(data) : undefined, failOnStatusCode: false });

test.describe("Pessoas · operação", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset rh");
  });

  test("API: escala — turno inválido, turnos cruzados e escala em ausência bloqueiam, interjornada avisa, cobertura e a pessoa vê a dela", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    await ensureFeature(o.req, "rh_schedules");
    expect(pathsOf(await expectCode(await call(o.req, "POST", "/v1/rh/shifts", { name: "Errado", start: "8:00", end: "26:00", breakMinutes: 300 }), 400, "VALIDATION_ERROR", "turno inválido"))).toEqual(expect.arrayContaining(["start", "end", "breakMinutes"]));
    const dia = await ok<any>(await call(o.req, "POST", "/v1/rh/shifts", { name: "Dia", start: "08:00", end: "17:00", breakMinutes: 60 }), "turno dia");
    const tarde = await ok<any>(await call(o.req, "POST", "/v1/rh/shifts", { name: "Tarde", start: "14:00", end: "22:00", breakMinutes: 0 }), "turno tarde");
    const m = await addMember(browser, request, o.req, "escala");
    const e1 = await emp(o.req, { userId: m.userId });
    const put = (assignments: unknown[], extra: Record<string, unknown> = {}) => call(o.req, "PUT", "/v1/rh/schedule", { assignments, ...extra });
    const cross = await expectCode(await put([{ employeeId: e1.id, date: "2027-03-01", shiftId: dia.id }, { employeeId: e1.id, date: "2027-03-01", shiftId: tarde.id }]), 409, "SCHEDULE_CONFLICT", "turnos que se cruzam");
    expect(cross.conflicts.map((c: any) => c.code)).toContain("OVERLAP");
    const w = await ok<any>(await put([{ employeeId: e1.id, date: "2027-03-01", shiftId: tarde.id }, { employeeId: e1.id, date: "2027-03-02", shiftId: dia.id }], { publish: true }), "tarde e depois dia");
    expect(w.warnings.map((c: any) => [c.code, c.date]), "22h → 8h fura a interjornada de 11 h").toEqual([["REST_BETWEEN", "2027-03-02"]]);
    await ok(await call(o.req, "POST", "/v1/rh/leaves", { employeeId: e1.id, type: "falta", start: "2027-03-04", days: 1 }), "falta lançada");
    const lv = await expectCode(await put([{ employeeId: e1.id, date: "2027-03-04", shiftId: dia.id }]), 409, "SCHEDULE_CONFLICT", "escalar na ausência");
    expect(lv.conflicts.map((c: any) => c.code)).toEqual(["ON_LEAVE"]);
    await ok(await call(o.req, "PUT", "/v1/rh/shift-needs", { needs: [{ weekday: 1, shiftId: dia.id, min: 2 }] }), "precisa de 2 no dia de segunda");
    const g = await ok<any>(await call(o.req, "GET", "/v1/rh/schedule?from=2027-03-01&to=2027-03-07"), "escala da semana");
    expect(g.assignments.map((a: any) => [a.date, a.shift.name]).sort()).toEqual([["2027-03-01", "Tarde"], ["2027-03-02", "Dia"]]);
    expect(g.gaps, "falta gente na segunda de dia").toEqual([{ date: "2027-03-01", shiftId: dia.id, min: 2, have: 0 }]);
    await ok(await put([{ employeeId: o.employeeId, date: "2027-03-03", shiftId: dia.id }]), "escala de outra pessoa");
    const mine = await ok<any>(await call(m.ctx.request, "GET", "/v1/rh/me/schedule?from=2027-03-01&to=2027-03-07"), "minha escala");
    expect(mine.assignments.map((a: any) => a.date).sort()).toEqual(["2027-03-01", "2027-03-02"]);
    await expectCode(await call(m.ctx.request, "PUT", "/v1/rh/schedule", { assignments: [{ employeeId: e1.id, date: "2027-03-03", shiftId: dia.id }] }), 403, "FORBIDDEN", "colaborador não monta escala");
    await Promise.all([o.ctx.close(), m.ctx.close()]);
  });

  test("API: vagas — página pública, consentimento e sobrenome exigidos, sem candidatura repetida, etapa pulada 409, contratado vira admissão e funil", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "rh_recruiting");
    const job = await ok<any>(await call(o.req, "POST", "/v1/rh/jobs", { title: "Vendedor(a) de loja", description: "Atendimento e vendas", questions: [{ id: "sabado", label: "Pode trabalhar aos sábados?", required: true }] }), "abrir vaga");
    expect(job.slug).toBe("vendedor-a-de-loja");
    const key = new URL(job.url).pathname.split("/")[2];
    const list = await (await pub(o.req, `/v1/public/jobs/${key}`)).json();
    expect(list.jobs.map((j: any) => j.slug)).toEqual(["vendedor-a-de-loja"]);
    const apply = (b: Record<string, unknown>) => pub(o.req, `/v1/public/jobs/${key}/${job.slug}/apply`, b);
    expect(pathsOf(await expectCode(await apply({ name: "Ana", email: "ana@example.com", answers: {}, consent: false }), 400, "VALIDATION_ERROR", "sem consentimento"))).toEqual(expect.arrayContaining(["name", "answers.sabado", "consent"]));
    const ok1 = await apply({ name: "Ana Souza", email: "ana.vaga@example.com", phone: "(11) 98888-7777", answers: { sabado: "Sim" }, consent: true });
    expect(ok1.status()).toBe(201);
    await expectCode(await apply({ name: "Ana S. Souza", email: "ANA.VAGA@example.com", answers: { sabado: "Sim" }, consent: true }), 409, "ALREADY_APPLIED", "mesmo e-mail");
    expect((await apply({ name: "Bruno Lima", email: "bruno.vaga@example.com", answers: { sabado: "Não" }, consent: true })).status()).toBe(201);
    const cands = await ok<any>(await call(o.req, "GET", `/v1/rh/jobs/${job.id}/candidates`), "candidatos");
    const ana = cands.data.find((c: any) => c.email === "ana.vaga@example.com"), bruno = cands.data.find((c: any) => c.email === "bruno.vaga@example.com");
    expect(ana.stage).toBe("APPLIED");
    await expectCode(await call(o.req, "POST", `/v1/rh/candidates/${ana.id}/move`, { stage: "HIRED" }), 409, "INVALID_STAGE", "pular etapas");
    for (const st of ["SCREENING", "INTERVIEW", "OFFER"]) await ok(await call(o.req, "POST", `/v1/rh/candidates/${ana.id}/move`, { stage: st }), st);
    const hired = await ok<any>(await call(o.req, "POST", `/v1/rh/candidates/${ana.id}/move`, { stage: "HIRED" }), "contratar");
    expect(hired.admission, "dados para a pré-admissão").toMatchObject({ fullName: "Ana Souza", personalEmail: "ana.vaga@example.com" });
    await ok(await call(o.req, "POST", `/v1/rh/candidates/${bruno.id}/move`, { stage: "REJECTED", notify: true }), "reprovar");
    const f = (await ok<any>(await call(o.req, "GET", `/v1/rh/jobs/${job.id}/candidates`), "funil")).funnel;
    expect(f.reached).toEqual({ APPLIED: 2, SCREENING: 1, INTERVIEW: 1, OFFER: 1, HIRED: 1 });
    expect(f.timeToHireDays).toBe(0);
    await ok(await call(o.req, "PATCH", `/v1/rh/jobs/${job.id}`, { status: "CLOSED" }), "fechar a vaga");
    await expectCode(await apply({ name: "Carla Dias", email: "carla@example.com", answers: { sabado: "Sim" }, consent: true }), 410, "JOB_CLOSED", "vaga fechada");
    expect((await (await pub(o.req, `/v1/public/jobs/${key}`)).json()).jobs, "fechada sai da página de vagas").toEqual([]);
    await o.ctx.close();
  });

  test("API: comunicados — só para a área escolhida, quem não recebeu não dá ciência, pendentes e ciência idempotente", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const loja = await ok<any>(await call(o.req, "POST", "/v1/rh/departments", { name: "Loja" }), "área loja");
    const adm = await ok<any>(await call(o.req, "POST", "/v1/rh/departments", { name: "Administrativo" }), "área adm");
    const m1 = await addMember(browser, request, o.req, "loja1"), m2 = await addMember(browser, request, o.req, "adm1");
    const e1 = await emp(o.req, { userId: m1.userId, departmentId: loja.id }), e2 = await emp(o.req, { departmentId: loja.id }), e3 = await emp(o.req, { userId: m2.userId, departmentId: adm.id });
    void e3;
    expect(pathsOf(await expectCode(await call(o.req, "POST", "/v1/rh/announcements", { title: " ", body: "", audience: {}, ackDueDate: "2020-01-01" }), 400, "VALIDATION_ERROR", "comunicado inválido"))).toEqual(expect.arrayContaining(["title", "body", "audience", "ackDueDate"]));
    expect(pathsOf(await expectCode(await call(o.req, "POST", "/v1/rh/announcements", { title: "T", body: "B", audience: { all: true }, requireAck: true, ackDueDate: addDays(today(), -1) }), 400, "VALIDATION_ERROR", "prazo de ciência no passado"))).toEqual(["ackDueDate"]);
    const a = await ok<any>(await call(o.req, "POST", "/v1/rh/announcements", { title: "Novo uniforme", body: "Use a partir de segunda", audience: { departmentIds: [loja.id] }, requireAck: true, ackDueDate: addDays(today(), 7) }), "comunicado para a loja");
    expect(a.recipients, "só a loja").toBe(2);
    const seen = items<any>(await ok(await call(m1.ctx.request, "GET", "/v1/rh/announcements"), "comunicados da loja"));
    expect(seen.map((x) => [x.id, x.ackedAt])).toEqual([[a.id, null]]);
    expect(items<any>(await ok(await call(m2.ctx.request, "GET", "/v1/rh/announcements"), "comunicados do adm"))).toEqual([]);
    await expectCode(await call(m2.ctx.request, "POST", `/v1/rh/announcements/${a.id}/ack`), 404, "NOT_FOUND", "quem não recebeu");
    const k1 = await ok<any>(await call(m1.ctx.request, "POST", `/v1/rh/announcements/${a.id}/ack`), "ciência");
    const k2 = await ok<any>(await call(m1.ctx.request, "POST", `/v1/rh/announcements/${a.id}/ack`), "ciência de novo");
    expect(k2.ackedAt, "idempotente").toBe(k1.ackedAt);
    const st = await ok<any>(await call(o.req, "GET", `/v1/rh/announcements/${a.id}/acks`), "situação");
    expect([st.total, st.acked, st.pct, st.overdue]).toEqual([2, 1, 50, false]);
    expect(st.pending.map((p: any) => p.id)).toEqual([e2.id]);
    expect(e1.id).toBeTruthy();
    await Promise.all([o.ctx.close(), m1.ctx.close(), m2.ctx.close()]);
  });

  test("API: treinamentos — matriz com vencido, vencendo, faltando e válido; vale o mais recente; conclusão no futuro 400", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "rh_trainings");
    const manut = await ok<any>(await call(o.req, "POST", "/v1/rh/departments", { name: "Manutenção" }), "área");
    const nr10 = await ok<any>(await call(o.req, "POST", "/v1/rh/trainings", { name: "NR-10 Eletricidade", code: "NR-10", validityMonths: 24 }), "NR-10");
    const integ = await ok<any>(await call(o.req, "POST", "/v1/rh/trainings", { name: "Integração", validityMonths: null }), "integração");
    expect(pathsOf(await expectCode(await call(o.req, "POST", "/v1/rh/trainings", { name: "X", validityMonths: 0 }), 400, "VALIDATION_ERROR", "validade zero"))).toContain("validityMonths");
    await ok(await call(o.req, "PUT", "/v1/rh/training-rules", { rules: [{ trainingId: integ.id, all: true }, { trainingId: nr10.id, departmentIds: [manut.id] }] }), "regras");
    const a = await emp(o.req, { departmentId: manut.id }), b = await emp(o.req, { departmentId: manut.id }), c = await emp(o.req, { departmentId: manut.id });
    const rec = (t: string, e: string, d: string) => call(o.req, "POST", `/v1/rh/trainings/${t}/records`, { employeeId: e, completedOn: d });
    expect(pathsOf(await expectCode(await rec(nr10.id, a.id, addDays(today(), 1)), 400, "VALIDATION_ERROR", "conclusão no futuro"))).toContain("completedOn");
    await ok(await rec(nr10.id, a.id, addDays(today(), -800)), "NR-10 antiga de A");
    await ok(await rec(nr10.id, a.id, addDays(today(), -100)), "NR-10 nova de A");
    await ok(await rec(nr10.id, b.id, addDays(today(), -800)), "NR-10 vencida de B");
    await ok(await rec(nr10.id, c.id, addDays(today(), -715)), "NR-10 vencendo de C");
    for (const x of [a, b, c]) await ok(await rec(integ.id, x.id, "2024-03-01"), "integração");
    const m = await ok<any>(await call(o.req, "GET", `/v1/rh/trainings/compliance?departmentId=${manut.id}`), "matriz");
    const st = (e: any) => m.data.find((r: any) => r.employee.id === e.id).items.find((i: any) => i.trainingId === nr10.id).status;
    expect([st(a), st(b), st(c)], "vale o registro mais recente").toEqual(["valid", "expired", "expiring"]);
    expect(m.data.find((r: any) => r.employee.id === b.id).ok).toBe(false);
    expect(m.data.find((r: any) => r.employee.id === c.id).ok, "vencendo ainda está em dia").toBe(true);
    const owner0 = (await ok<any>(await call(o.req, "GET", "/v1/rh/trainings/compliance"), "matriz geral")).data.find((r: any) => r.employee.id === o.employeeId);
    expect(owner0.items.map((i: any) => [i.trainingId, i.status]), "integração faltando para o dono").toEqual([[integ.id, "missing"]]);
    await o.ctx.close();
  });

  test("API: celebrações do dia — aniversário e tempo de casa redondo", async ({ browser }) => {
    const o = await owner(browser);
    const a = await emp(o.req, { birthDate: "1990-03-01", admissionDate: "2024-03-01" });
    const b = await emp(o.req, { birthDate: "1992-07-10", admissionDate: "2027-03-01" });
    const c = await ok<any>(await call(o.req, "GET", "/v1/rh/celebrations?date=2027-03-01"), "celebrações");
    const mineA = c.data.filter((x: any) => x.employee.id === a.id).map((x: any) => [x.type, x.years ?? null]);
    expect(mineA).toEqual([["birthday", null], ["anniversary", 3]]);
    expect(c.data.some((x: any) => x.employee.id === b.id), "admitido no dia não faz aniversário de casa").toBe(false);
    await o.ctx.close();
  });

  test("API: perfil indústria — NRs criadas sem duplicar, EPI com CA vencido e sem assinatura recusados e troca vencida no painel", async ({ browser }) => {
    const o = await owner(browser);
    await expectCode(await call(o.req, "PATCH", "/v1/rh/segment", { segment: "PADARIA" }), 400, "VALIDATION_ERROR", "perfil inválido");
    const s1 = await ok<any>(await call(o.req, "PATCH", "/v1/rh/segment", { segment: "INDUSTRY" }), "perfil indústria");
    expect(s1.on).toEqual(expect.arrayContaining(["epi", "nr_trainings"]));
    await ok(await call(o.req, "PATCH", "/v1/rh/segment", { segment: "INDUSTRY" }), "aplicar de novo");
    const tr = items<any>(await ok(await call(o.req, "GET", "/v1/rh/trainings"), "treinamentos"));
    expect(tr.filter((t) => t.code === "NR-35").map((t) => t.validityMonths), "NR-35 uma vez, 24 meses").toEqual([24]);
    expect((await ok<any>(await call(o.req, "PATCH", "/v1/rh/segment", { segment: "GENERAL" }), "geral")).on, "não desliga nada").toContain("epi");
    expect(pathsOf(await expectCode(await call(o.req, "POST", "/v1/rh/epis", { name: "Bota", ca: "12", caExpiresOn: "x" }), 400, "VALIDATION_ERROR", "CA inválido"))).toEqual(expect.arrayContaining(["ca", "caExpiresOn"]));
    const bota = await ok<any>(await call(o.req, "POST", "/v1/rh/epis", { name: "Bota de segurança", ca: "12345", caExpiresOn: "2030-12-31", lifeDays: 180 }), "bota");
    const luva = await ok<any>(await call(o.req, "POST", "/v1/rh/epis", { name: "Luva", ca: "4321", caExpiresOn: addDays(today(), -10), lifeDays: 30 }), "luva com CA vencido");
    const e = await emp(o.req);
    const bad = await expectCode(await call(o.req, "POST", `/v1/rh/employees/${e.id}/epi-deliveries`, { deliveredOn: today(), items: [{ epiId: luva.id, qty: 1 }] }), 400, "VALIDATION_ERROR", "CA vencido e sem assinatura");
    expect(pathsOf(bad)).toEqual(expect.arrayContaining(["items.0.epiId", "signature"]));
    await ok(await call(o.req, "POST", `/v1/rh/employees/${e.id}/epi-deliveries`, { deliveredOn: addDays(today(), -200), items: [{ epiId: bota.id, qty: 1 }], signature: true }), "entrega antiga da bota");
    const due = items<any>(await ok(await call(o.req, "GET", "/v1/rh/epi-replacements"), "trocas"));
    expect(due.map((x) => [x.employee.id, x.epi.id, x.overdue])).toEqual([[e.id, bota.id, true]]);
    await o.ctx.close();
  });

  test("API: perfil saúde — registro inválido recusado e vencido não pode atender", async ({ browser }) => {
    const o = await owner(browser);
    await ok(await call(o.req, "PATCH", "/v1/rh/segment", { segment: "HEALTH" }), "perfil saúde");
    const enf = await emp(o.req), med = await emp(o.req), adm = await emp(o.req);
    expect(pathsOf(await expectCode(await call(o.req, "PUT", `/v1/rh/employees/${enf.id}/council`, { council: "OAB", number: "", uf: "XX" }), 400, "VALIDATION_ERROR", "registro inválido"))).toEqual(expect.arrayContaining(["council", "number", "uf"]));
    expect((await ok<any>(await call(o.req, "PUT", `/v1/rh/employees/${enf.id}/council`, { council: "COREN", number: "123456", uf: "SP", expiresOn: addDays(today(), -1), required: true }), "COREN vencido")).status).toBe("expired");
    expect((await ok<any>(await call(o.req, "PUT", `/v1/rh/employees/${med.id}/council`, { council: "CRM", number: "54321", uf: "RJ", expiresOn: addDays(today(), 10), required: true }), "CRM vencendo")).status).toBe("expiring");
    const all = items<any>(await ok(await call(o.req, "GET", "/v1/rh/councils"), "registros"));
    const by = Object.fromEntries(all.map((r) => [r.employee.id, [r.status, r.canAttend]]));
    expect(by[enf.id], "vencido não atende").toEqual(["expired", false]);
    expect(by[med.id], "vencendo ainda atende").toEqual(["expiring", true]);
    expect(by[adm.id], "quem não precisa não aparece").toBeUndefined();
    expect(items<any>(await ok(await call(o.req, "GET", "/v1/rh/councils?status=expired"), "vencidos")).map((r) => r.employee.id)).toEqual([enf.id]);
    await o.ctx.close();
  });

  test("API: perfil varejo — rodízio com domingo a cada 3 semanas, folguista cobre sem cobrir a própria folga e folga aplicada bloqueia a escala", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "rh_schedules");
    await ok(await call(o.req, "PATCH", "/v1/rh/segment", { segment: "RETAIL" }), "perfil varejo");
    const [a, b, c, f] = [await emp(o.req), await emp(o.req), await emp(o.req), await emp(o.req)];
    expect(pathsOf(await expectCode(await call(o.req, "POST", "/v1/rh/day-off-rotation", { employeeIds: [a.id], start: "2027-03-02", weeks: 3 }), 400, "VALIDATION_ERROR", "começa numa terça"))).toContain("start");
    const r = await ok<any>(await call(o.req, "POST", "/v1/rh/day-off-rotation", { employeeIds: [a.id, b.id, c.id], folguistaIds: [f.id], start: "2027-03-01", weeks: 3, apply: true }), "gerar e aplicar");
    for (const id of [a.id, b.id, c.id, f.id]) {
      expect(r.daysOff[id].length, "uma folga por semana").toBe(3);
      expect(r.daysOff[id].some((d: string) => new Date(d + "T12:00:00Z").getUTCDay() === 0), "domingo de folga nas 3 semanas").toBe(true);
    }
    expect(r.sundayGaps).toEqual([]);
    for (const [date, list] of Object.entries<any>(r.coverage)) for (const x of list) {
      if (x.coveredBy) expect(r.daysOff[f.id], `folguista não cobre na própria folga (${date})`).not.toContain(date);
      expect(x.employeeId, "folga do folguista não precisa de cobertura").not.toBe(f.id);
    }
    const sh = await ok<any>(await call(o.req, "POST", "/v1/rh/shifts", { name: "Loja", start: "10:00", end: "18:00", breakMinutes: 60 }), "turno");
    const off = r.daysOff[a.id][0];
    const cf = await expectCode(await call(o.req, "PUT", "/v1/rh/schedule", { assignments: [{ employeeId: a.id, date: off, shiftId: sh.id }] }), 409, "SCHEDULE_CONFLICT", "escalar na folga");
    expect(cf.conflicts.map((x: any) => x.code)).toEqual(["ON_LEAVE"]);
    const g = await ok<any>(await call(o.req, "GET", "/v1/rh/schedule?from=2027-03-01&to=2027-03-21"), "escala");
    expect(g.daysOff.filter((d: any) => d.employeeId === a.id).map((d: any) => d.date)).toEqual(r.daysOff[a.id]);
    await o.ctx.close();
  });

  test("Tela: escolher o perfil do Pessoas nas configurações", async ({ browser }) => {
    const o = await owner(browser);
    const page = await o.ctx.newPage();
    await page.goto("/pessoas/configuracoes");
    await page.getByTestId("rh-segment").selectOption("RETAIL");
    await expect.poll(async () => (await ok<any>(await call(o.req, "GET", "/v1/rh/segment"), "perfil")).segment, { timeout: 10_000 }).toBe("RETAIL");
    await o.ctx.close();
  });

  test("Tela: colaborador dá ciência no comunicado", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const m = await addMember(browser, request, o.req, "ciencia");
    await emp(o.req, { userId: m.userId });
    const a = await ok<any>(await call(o.req, "POST", "/v1/rh/announcements", { title: "Horário de fim de ano", body: "Fecharemos às 14h", audience: { all: true }, requireAck: true }), "comunicado");
    const page = await m.ctx.newPage();
    await page.goto("/pessoas/comunicados");
    const card = page.locator(`[data-testid="rh-announcement"][data-id="${a.id}"]`);
    await expect(card).toHaveAttribute("data-acked", "false");
    await card.getByTestId("rh-announcement-ack").click();
    await expect(card).toHaveAttribute("data-acked", "true");
    await expect.poll(async () => (await ok<any>(await call(o.req, "GET", `/v1/rh/announcements/${a.id}/acks`), "situação")).acked, { timeout: 10_000 }).toBe(1);
    await Promise.all([o.ctx.close(), m.ctx.close()]);
  });

  test("Tela: escala da semana marca a interjornada curta", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "rh_schedules");
    const dia = await ok<any>(await call(o.req, "POST", "/v1/rh/shifts", { name: "Dia", start: "08:00", end: "17:00", breakMinutes: 60 }), "dia");
    const noite = await ok<any>(await call(o.req, "POST", "/v1/rh/shifts", { name: "Noite", start: "18:00", end: "23:00", breakMinutes: 0 }), "noite");
    const e = await emp(o.req);
    await ok(await call(o.req, "PUT", "/v1/rh/schedule", { assignments: [{ employeeId: e.id, date: "2027-03-01", shiftId: noite.id }, { employeeId: e.id, date: "2027-03-02", shiftId: dia.id }] }), "escala");
    const page = await o.ctx.newPage();
    await page.goto("/pessoas/escala?de=2027-03-01");
    await expect(page.getByTestId("rh-schedule")).toBeVisible();
    await expect(page.locator(`[data-testid="rh-schedule-cell"][data-employee="${e.id}"][data-date="2027-03-02"]`)).toHaveAttribute("data-conflict", "true");
    await expect(page.locator(`[data-testid="rh-schedule-cell"][data-employee="${e.id}"][data-date="2027-03-01"]`)).toContainText("Noite");
    await o.ctx.close();
  });

  test("Tela: candidatura pela página pública da vaga", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "rh_recruiting");
    const job = await ok<any>(await call(o.req, "POST", "/v1/rh/jobs", { title: "Auxiliar de estoque", description: "Recebimento e conferência" }), "vaga");
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto(new URL(job.url).pathname);
    const f = page.getByTestId("job-apply-form");
    await f.locator("[name=name]").fill("Davi");
    await f.locator("[name=email]").fill("davi.vaga@example.com");
    await f.locator("[name=consent]").check();
    await page.getByTestId("job-apply-submit").click();
    await expect(f).toContainText("sobrenome");
    await f.locator("[name=name]").fill("Davi Rocha");
    await page.getByTestId("job-apply-submit").click();
    await expect(page.getByTestId("job-apply-done")).toBeVisible();
    expect((await ok<any>(await call(o.req, "GET", `/v1/rh/jobs/${job.id}/candidates`), "candidatos")).data.map((c: any) => c.name)).toEqual(["Davi Rocha"]);
    await Promise.all([o.ctx.close(), ctx.close()]);
  });
});
