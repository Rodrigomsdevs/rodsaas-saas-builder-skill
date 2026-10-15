import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { createHmac } from "node:crypto";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { waitForEmail } from "../support/mailpit";
import { newContext, ownerWithMember, signUp } from "../support/ui";

// CRM · vendas avançadas e perfis (skills/crm/references/08 e 09). Roda com o preset crm. Confere o que mais se
// simplifica: meta contada pela data do ganho e com o ritmo do mês, automação que roda na etapa certa e uma vez só,
// sequência que anda em dias úteis e para no ganho ou quando o cliente responde, mesclagem que leva tudo para o destino,
// e-mail com variáveis, pontuação de lead, WhatsApp pelo motor (ou o link) e perfis que montam tudo sem duplicar.

async function crmInstalled(req: APIRequestContext) {
  if (cfg.presets.includes("crm")) return true;
  return (await call(req, "GET", "/v1/crm/pipelines")).status() !== 404;
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
const dayN = (ymd: string) => Math.floor(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 864e5);
const ymdOf = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOf(dayN(ymd) + n);
const isBiz = (ymd: string) => ![0, 6].includes(new Date(dayN(ymd) * 864e5).getUTCDay());
const addBizDays = (ymd: string, n: number) => { let d = ymd; while (!isBiz(d)) d = addDays(d, 1); for (let i = 0; i < n; i++) { d = addDays(d, 1); while (!isBiz(d)) d = addDays(d, 1); } return d; };

async function pipeline(req: APIRequestContext) {
  const list = items<any>(await ok(await call(req, "GET", "/v1/crm/pipelines"), "funis"));
  return list.find((x) => x.isDefault) ?? list[0];
}
const deal = async (req: APIRequestContext, body: Record<string, unknown>) => ok<any>(await call(req, "POST", "/v1/crm/deals", { title: `Negócio ${uniq()}`, ...body }), "criar negócio");
const contact = async (req: APIRequestContext, body: Record<string, unknown> = {}) => ok<any>(await call(req, "POST", "/v1/crm/contacts", { name: `Ana ${uniq()}`, ...body }), "criar contato");
const activitiesOf = async (req: APIRequestContext, dealId: string) => items<any>(await ok(await call(req, "GET", `/v1/crm/activities?dealId=${dealId}&ownerId=all&bucket=all`), "atividades do negócio"));
const pending = async (req: APIRequestContext, dealId: string) => (await activitiesOf(req, dealId)).filter((a) => !a.done);
async function lostReason(req: APIRequestContext) { return items<any>(await ok(await call(req, "GET", "/v1/crm/lost-reasons"), "motivos"))[0]?.id; }
async function memberIdOf(req: APIRequestContext, email: string) {
  return items<any>(await ok(await call(req, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === email)?.user?.id as string;
}
/** Webhook do driver falso do WhatsApp (corpo cru assinado). */
async function waInbound(playwright: any, conn: { secret: string; token: string }, from: string, text: string) {
  const ctx = await playwright.request.newContext();
  const raw = JSON.stringify({ events: [{ type: "message", id: "w" + uniq(), from, text }] });
  const sig = "sha256=" + createHmac("sha256", conn.secret).update(raw).digest("hex");
  const r = await ctx.fetch(`${cfg.apiURL}/v1/public/whatsapp/webhook/${conn.token}`, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": sig }, data: raw, failOnStatusCode: false });
  expect(r.status(), "webhook do WhatsApp").toBe(200);
  await ctx.dispose();
}

test.describe("CRM · vendas", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await crmInstalled(request)), "projeto sem o preset crm");
  });

  test("API: metas — ganho do mês conta pela data do ganho, por vendedor e da equipe, com o ritmo", async ({ browser, request }) => {
    const { owner, ownerCtx, member, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request;
    await ensureFeature(o, "crm_goals");
    const ownerId = await memberIdOf(o, owner.email), memberId = await memberIdOf(o, member.email);
    const lr = await lostReason(o);
    const won = async (req: APIRequestContext, value: number) => { const d = await deal(req, { value }); await ok(await call(req, "POST", `/v1/crm/deals/${d.id}/won`), "ganhar"); return d; };
    await won(o, 100000);
    const lost = await deal(o, { value: 50000 });
    await ok(await call(o, "POST", `/v1/crm/deals/${lost.id}/lost`, { lostReasonId: lr }), "perder");
    const reopened = await won(o, 20000);
    await ok(await call(o, "POST", `/v1/crm/deals/${reopened.id}/reopen`), "reabrir");
    await won(m, 30000);
    const period = today().slice(0, 7);
    const mk = (body: Record<string, unknown>) => call(o, "POST", "/v1/crm/goals", { period, ...body });
    expect((await mk({ metric: "WON_VALUE", ownerId, target: 200000 })).status()).toBe(201);
    expect((await mk({ metric: "WON_VALUE", ownerId: null, target: 500000 })).status()).toBe(201);
    expect((await mk({ metric: "WON_COUNT", ownerId: memberId, target: 2 })).status()).toBe(201);
    await expectCode(await mk({ metric: "WON_VALUE", ownerId, target: 1 }), 409, "GOAL_EXISTS", "meta repetida");
    expect(pathsOf(await expectCode(await mk({ metric: "WON_VALUE", ownerId, target: 1, period: "2026-13" }), 400, "VALIDATION_ERROR", "período inválido"))).toContain("period");
    expect(pathsOf(await expectCode(await mk({ metric: "WON_COUNT", ownerId, target: 0 }), 400, "VALIDATION_ERROR", "meta zero"))).toContain("target");
    expect(pathsOf(await expectCode(await mk({ metric: "LIKES", ownerId, target: 3 }), 400, "VALIDATION_ERROR", "métrica"))).toContain("metric");
    expect((await call(m, "POST", "/v1/crm/goals", { period, metric: "WON_COUNT", ownerId: memberId, target: 9 })).status(), "membro não cria meta").toBe(403);
    const goals = items<any>(await ok(await call(o, "GET", `/v1/crm/goals?period=${period}`), "metas"));
    const g = (metric: string, oid: string | null) => goals.find((x) => x.metric === metric && (x.ownerId ?? null) === oid);
    expect(g("WON_VALUE", ownerId)?.achieved, "ganho do owner (perdido e reaberto não contam)").toBe(100000);
    expect(g("WON_VALUE", ownerId)?.pct).toBe(50);
    expect(g("WON_VALUE", null)?.achieved, "equipe soma todos").toBe(130000);
    expect(g("WON_COUNT", memberId)?.achieved, "ganhos do membro").toBe(1);
    expect(g("WON_COUNT", memberId)?.remaining).toBe(1);
    const t = today(), start = `${period}-01`, end = addDays(ymdOf(dayN(`${period}-01`) + 32).slice(0, 8) + "01", -1);
    const total = dayN(end) - dayN(start) + 1, elapsed = dayN(t) - dayN(start) + 1, expectedPct = Math.round((elapsed / total) * 100);
    const x = g("WON_VALUE", ownerId);
    expect(x.expectedPct, "ritmo esperado para hoje").toBe(expectedPct);
    expect(x.status).toBe(50 >= expectedPct + 10 ? "AHEAD" : 50 >= expectedPct - 10 ? "ON_TRACK" : "BEHIND");
    expect(x.daysLeft).toBe(dayN(end) - dayN(t) + 1);
    expect(x.perDayNeeded).toBe(Math.ceil(100000 / x.daysLeft));
    const mine = items<any>(await ok(await call(m, "GET", `/v1/crm/goals?period=${period}`), "metas do membro"));
    expect(mine.map((y) => y.ownerId ?? null).sort(), "membro vê a da equipe e a dele").toEqual([memberId, null].sort());
    await ownerCtx.close(); await memberCtx.close();
  });

  test("API: automação — entrar na etapa cria a atividade com prazo e dono, respeita a condição e mostra o histórico", async ({ request }) => {
    await register(request, newUser("crmauto"));
    await ensureFeature(request, "crm_automations");
    const p = await pipeline(request), stage = p.stages[2], before = p.stages[1];
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/crm/automations", { name: "Sem etapa", trigger: { type: "STAGE_ENTERED" }, actions: [{ type: "CREATE_ACTIVITY", activityType: "CALL", subject: "x", dueInDays: 1, assignTo: "OWNER" }] }), 400, "VALIDATION_ERROR", "sem etapa"))).toContain("trigger.stageId");
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/crm/automations", { name: "Sem ação", trigger: { type: "DEAL_WON" }, actions: [] }), 400, "VALIDATION_ERROR", "sem ação"))).toContain("actions");
    const a = await ok<any>(await call(request, "POST", "/v1/crm/automations", { name: "Proposta → follow-up", pipelineId: p.id, trigger: { type: "STAGE_ENTERED", stageId: stage.id }, conditions: [{ field: "value", op: "gte", value: 10000 }], actions: [{ type: "CREATE_ACTIVITY", activityType: "CALL", subject: "Follow-up da proposta", dueInDays: 3, assignTo: "OWNER" }] }), "criar automação");
    expect(a.active).toBe(true);
    const tag = await ok<any>(await call(request, "POST", "/v1/crm/tags", { name: `Cliente ${uniq()}`, color: "green" }), "etiqueta");
    await ok(await call(request, "POST", "/v1/crm/automations", { name: "Ganho → etiqueta", trigger: { type: "DEAL_WON" }, actions: [{ type: "ADD_TAG", tagId: tag.id }] }), "automação de ganho");
    const big = await deal(request, { value: 15000, stageId: before.id }), small = await deal(request, { value: 5000, stageId: before.id });
    await ok(await call(request, "POST", `/v1/crm/deals/${big.id}/move`, { stageId: stage.id }), "mover o grande");
    await ok(await call(request, "POST", `/v1/crm/deals/${small.id}/move`, { stageId: stage.id }), "mover o pequeno");
    await expect.poll(async () => (await pending(request, big.id)).map((x) => x.subject), { message: "a automação criou a atividade", timeout: 10_000 }).toEqual(["Follow-up da proposta"]);
    const act = (await pending(request, big.id))[0];
    expect(act.type).toBe("CALL");
    expect(act.dueDate, "prazo de 3 dias").toBe(addDays(today(), 3));
    expect(act.owner?.id ?? act.ownerId, "dono do negócio").toBe(big.owner?.id ?? big.ownerId);
    expect((await pending(request, small.id)).length, "condição de valor barrou").toBe(0);
    await ok(await call(request, "PATCH", `/v1/crm/automations/${a.id}`, { active: false }), "desligar");
    const third = await deal(request, { value: 99000, stageId: before.id });
    await ok(await call(request, "POST", `/v1/crm/deals/${third.id}/move`, { stageId: stage.id }), "mover com a automação desligada");
    await ok(await call(request, "POST", `/v1/crm/deals/${big.id}/won`), "ganhar o grande");
    await expect.poll(async () => (await ok<any>(await call(request, "GET", `/v1/crm/deals/${big.id}`), "negócio")).tagIds ?? [], { message: "ganho pôs a etiqueta", timeout: 10_000 }).toContain(tag.id);
    expect((await pending(request, third.id)).length, "desligada não roda").toBe(0);
    const runs = items<any>(await ok(await call(request, "GET", `/v1/crm/automations/${a.id}/runs`), "execuções"));
    expect(runs.map((r) => [r.dealId ?? r.deal?.id, r.status]), "uma execução, do negócio que bateu").toEqual([[big.id, "DONE"]]);
  });

  test("API: sequência — passos em dias úteis, para no ganho, encerra no último e não inscreve duas vezes", async ({ request }) => {
    await register(request, newUser("crmseq"));
    await ensureFeature(request, "crm_sequences");
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/crm/sequences", { name: "Ruim", steps: [{ dayOffset: 3, type: "CALL", subject: "a" }, { dayOffset: 1, type: "CALL", subject: "b" }] }), 400, "VALIDATION_ERROR", "dias voltando"))).toContain("steps.1.dayOffset");
    const seq = await ok<any>(await call(request, "POST", "/v1/crm/sequences", { name: `Prospecção ${uniq()}`, businessDays: true, steps: [{ dayOffset: 0, type: "CALL", subject: "Ligar" }, { dayOffset: 5, type: "EMAIL", subject: "Mandar caso" }, { dayOffset: 7, type: "WHATSAPP", subject: "Última tentativa" }] }), "sequência");
    const d1 = await deal(request, { value: 1000 });
    const enr = await call(request, "POST", `/v1/crm/sequences/${seq.id}/enroll`, { dealId: d1.id });
    expect(enr.status(), await enr.text()).toBe(201);
    const e1 = await enr.json();
    expect(e1).toMatchObject({ status: "ACTIVE", currentStep: 0 });
    const first = await pending(request, d1.id);
    expect(first.map((a) => a.subject)).toEqual(["Ligar"]);
    expect(first[0].dueDate, "passo 1 hoje (ou no próximo dia útil)").toBe(addBizDays(today(), 0));
    expect(first[0].sequence).toMatchObject({ enrollmentId: e1.id, step: 1, total: 3 });
    await expectCode(await call(request, "POST", `/v1/crm/sequences/${seq.id}/enroll`, { dealId: d1.id }), 409, "ALREADY_ENROLLED", "inscrever de novo");
    await ok(await call(request, "POST", `/v1/crm/activities/${first[0].id}/complete`), "concluir o passo 1");
    await expect.poll(async () => (await pending(request, d1.id)).map((a) => a.subject), { message: "o passo 2 nasceu", timeout: 10_000 }).toEqual(["Mandar caso"]);
    const second = (await pending(request, d1.id))[0];
    expect(second.dueDate, "5 dias úteis depois da conclusão (uma semana, nunca 5 corridos)").toBe(addBizDays(today(), 5));
    expect(second.sequence.step).toBe(2);
    await ok(await call(request, "POST", `/v1/crm/deals/${d1.id}/won`), "ganhar");
    await expect.poll(async () => items<any>(await ok(await call(request, "GET", `/v1/crm/enrollments?dealId=${d1.id}`), "inscrições"))[0]?.status, { message: "ganho parou a sequência", timeout: 10_000 }).toBe("STOPPED");
    const stopped = items<any>(await ok(await call(request, "GET", `/v1/crm/enrollments?dealId=${d1.id}`), "inscrições"))[0];
    expect(stopped.stoppedReason).toBe("DEAL_WON");
    expect((await pending(request, d1.id)).length, "a pendente saiu da agenda").toBe(0);
    await expectCode(await call(request, "POST", `/v1/crm/sequences/${seq.id}/enroll`, { dealId: d1.id }), 409, "DEAL_NOT_OPEN", "inscrever negócio ganho");
    const d2 = await deal(request, { value: 1000 });
    await ok(await call(request, "POST", `/v1/crm/sequences/${seq.id}/enroll`, { dealId: d2.id }), "inscrever o segundo");
    for (let i = 0; i < 3; i++) {
      let p: any[] = [];
      await expect.poll(async () => (p = await pending(request, d2.id)).length, { message: `passo ${i + 1} pendente`, timeout: 10_000 }).toBe(1);
      await ok(await call(request, "POST", `/v1/crm/activities/${p[0].id}/complete`), `concluir o passo ${i + 1}`);
    }
    await expect.poll(async () => items<any>(await ok(await call(request, "GET", `/v1/crm/enrollments?dealId=${d2.id}`), "inscrições"))[0]?.status, { message: "terminou", timeout: 10_000 }).toBe("COMPLETED");
    expect((await pending(request, d2.id)).length).toBe(0);
    const d3 = await deal(request, { value: 1000 });
    const e3 = await ok<any>(await call(request, "POST", `/v1/crm/sequences/${seq.id}/enroll`, { dealId: d3.id }), "inscrever o terceiro");
    const st = await ok<any>(await call(request, "POST", `/v1/crm/enrollments/${e3.id}/stop`), "parar");
    expect(st).toMatchObject({ status: "STOPPED", stoppedReason: "MANUAL" });
    expect((await pending(request, d3.id)).length, "parar tira a pendente").toBe(0);
  });

  test("API: mesclar contatos — tudo vai para o destino, vazio preenchido, escolha respeitada e a origem some", async ({ browser, request }) => {
    await register(request, newUser("crmmerge"));
    const email = `ana.souza.${uniq()}@example.com`;
    const target = await contact(request, { name: "Ana", phone: "(44) 99999-1234" });
    const source = await contact(request, { name: "Ana Souza", email, phone: "(44) 98888-7777" });
    const twin = await contact(request, { name: "Outra Ana", phone: "44999991234" });
    const groups = items<any>(await ok(await call(request, "GET", "/v1/crm/duplicates/groups?entity=contacts"), "grupos de duplicados"));
    const byPhone = groups.find((g) => g.by === "phone");
    expect(byPhone?.records.map((r: any) => r.id).sort(), "mesmo telefone em formatos diferentes").toEqual([target.id, twin.id].sort());
    const d = await deal(request, { contactId: source.id, value: 1000 });
    await ok(await call(request, "POST", "/v1/crm/activities", { type: "CALL", subject: "Ligar para a Ana", dealId: d.id, contactId: source.id, dueDate: today() }), "atividade da origem");
    await expectCode(await call(request, "POST", `/v1/crm/contacts/${target.id}/merge`, { sourceId: target.id }), 400, "MERGE_SAME", "mesclar consigo");
    const other = await newContext(browser);
    await register(other.request, newUser("crmmerge2"));
    const foreign = await contact(other.request, { name: "De fora" });
    expect((await call(request, "POST", `/v1/crm/contacts/${target.id}/merge`, { sourceId: foreign.id })).status(), "contato de outra empresa").toBe(404);
    await other.close();
    const r = await ok<any>(await call(request, "POST", `/v1/crm/contacts/${target.id}/merge`, { sourceId: source.id, choices: { phone: "source" } }), "mesclar");
    expect(r.contact.id).toBe(target.id);
    expect(r.contact.name, "conflito: fica o destino").toBe("Ana");
    expect(r.contact.email, "vazio preenchido pela origem").toBe(email);
    expect(r.contact.phone, "escolha da origem respeitada").toBe("5544988887777");
    expect(r.moved).toMatchObject({ deals: 1, activities: 1 });
    expect((await ok<any>(await call(request, "GET", `/v1/crm/deals/${d.id}`), "negócio")).contact?.id, "o negócio foi para o destino").toBe(target.id);
    const gone = await call(request, "GET", `/v1/crm/contacts/${source.id}`);
    expect(gone.status(), "a origem some").toBe(404);
    expect((await gone.json()).mergedIntoId).toBe(target.id);
    const found = items<any>(await ok(await call(request, "GET", `/v1/crm/contacts?q=${encodeURIComponent(email)}`), "busca"));
    expect(found.map((c) => c.id), "a busca pelo e-mail acha o destino").toEqual([target.id]);
  });

  test("API: modelos de e-mail — variável desconhecida barrada, envio preenchido chega e vira atividade", async ({ request }) => {
    await register(request, newUser("crmmail"));
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/crm/email-templates", { name: "Ruim", subject: "Oi", body: "Olá {{contato.apelido}}" }), 400, "VALIDATION_ERROR", "variável desconhecida"))).toContain("body");
    const tpl = await ok<any>(await call(request, "POST", "/v1/crm/email-templates", { name: "Proposta", subject: "Proposta: {{negocio.titulo}}", body: "Olá {{contato.primeiro_nome}}, segue a proposta. Abraço, {{vendedor.primeiro_nome}}" }), "modelo");
    const to = `cliente.${uniq()}@example.com`;
    const c = await contact(request, { name: "Ana Souza", email: to });
    const d = await deal(request, { title: "Plano anual", contactId: c.id, value: 150000 });
    const res = await call(request, "POST", "/v1/crm/emails", { dealId: d.id, templateId: tpl.id });
    if (!cfg.addons.includes("email") && res.status() === 409) { expect((await res.json()).code).toBe("EMAIL_NOT_CONFIGURED"); return; }
    expect(res.status(), await res.text()).toBe(201);
    const sent = await res.json();
    expect(sent).toMatchObject({ to, subject: "Proposta: Plano anual" });
    const mail = await waitForEmail(request, to, { contains: "Olá Ana," });
    expect(mail.subject).toBe("Proposta: Plano anual");
    const acts = await activitiesOf(request, d.id);
    expect(acts.some((a) => a.id === sent.activityId && a.type === "EMAIL" && a.done), "envio registrado como atividade").toBe(true);
    const noMail = await contact(request, { name: "Sem e-mail" });
    const d2 = await deal(request, { contactId: noMail.id });
    await expectCode(await call(request, "POST", "/v1/crm/emails", { dealId: d2.id, templateId: tpl.id }), 409, "CONTACT_NO_EMAIL", "contato sem e-mail");
    const tpl2 = await ok<any>(await call(request, "POST", "/v1/crm/email-templates", { name: "Empresa", subject: "Para a {{empresa.nome}}", body: "Oi {{contato.primeiro_nome}}" }), "modelo com empresa");
    const miss = await expectCode(await call(request, "POST", "/v1/crm/emails", { dealId: d.id, templateId: tpl2.id }), 422, "TEMPLATE_MISSING_DATA", "negócio sem empresa");
    expect(miss.missing).toEqual(["empresa.nome"]);
  });

  test("API: pontuação de lead — regras somam, temperatura, ordem e recálculo ao editar", async ({ request }) => {
    await register(request, newUser("crmscore"));
    await ensureFeature(request, "crm_scoring");
    const rules = [{ field: "hasPhone", op: "eq", value: true, points: 20 }, { field: "hasEmail", op: "eq", value: true, points: 10 }, { field: "value", op: "gte", value: 100000, points: 30 }, { field: "hasCompany", op: "eq", value: true, points: 15 }];
    expect(pathsOf(await expectCode(await call(request, "PUT", "/v1/crm/scoring", { rules: [{ ...rules[0], points: 0 }], warmAt: 25, hotAt: 55 }), 400, "VALIDATION_ERROR", "pontos zero"))).toContain("rules.0.points");
    await ok(await call(request, "PUT", "/v1/crm/scoring", { rules, warmAt: 25, hotAt: 55 }), "regras (limites da empresa: morno 25, quente 55)");
    const lead = async (b: Record<string, unknown>) => ok<any>(await call(request, "POST", "/v1/crm/leads", { personName: `Lead ${uniq()}`, ...b }), "lead");
    const cold = await lead({ email: `c.${uniq()}@example.com` });
    const warm = await lead({ email: `b.${uniq()}@example.com`, phone: "(44) 99999-4321", value: 200000 });
    const hot = await lead({ email: `a.${uniq()}@example.com`, phone: "(44) 99999-1234", value: 150000, companyName: "Mercado Bom" });
    const list = async (q = "") => items<any>(await ok(await call(request, "GET", `/v1/crm/leads?sort=-score${q}`), "leads"));
    const all = await list();
    const by = (id: string) => all.find((l) => l.id === id);
    expect([by(hot.id)?.score, by(warm.id)?.score, by(cold.id)?.score]).toEqual([75, 60, 10]);
    expect([by(hot.id)?.temperature, by(warm.id)?.temperature, by(cold.id)?.temperature], "limites da empresa, não os padrões").toEqual(["HOT", "HOT", "COLD"]);
    expect(all.map((l) => l.id).slice(0, 3), "mais quente primeiro (criados ao contrário)").toEqual([hot.id, warm.id, cold.id]);
    expect((await list("&temperature=HOT")).map((l) => l.id)).toEqual([hot.id, warm.id]);
    await ok(await call(request, "PATCH", `/v1/crm/leads/${cold.id}`, { phone: "(44) 98888-1111" }), "editar o frio");
    expect((await list()).find((l) => l.id === cold.id)).toMatchObject({ score: 30, temperature: "WARM" });
  });

  test("API: WhatsApp do negócio — mensagem pronta preenchida; link sem o motor; pelo motor com a janela e a sequência parando na resposta", async ({ request, playwright }) => {
    await register(request, newUser("crmwa"));
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/crm/whatsapp-snippets", { name: "Ruim", body: "Oi {{contato.apelido}}" }), 400, "VALIDATION_ERROR", "variável desconhecida"))).toContain("body");
    const sn = await ok<any>(await call(request, "POST", "/v1/crm/whatsapp-snippets", { name: "Retomar", body: "Oi {{contato.primeiro_nome}}, sobre {{negocio.titulo}}" }), "mensagem pronta");
    const phone = "+55 44 9" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const digits = phone.replace(/\D/g, "");
    const c = await contact(request, { name: "Ana Souza", phone });
    const d = await deal(request, { title: "Plano anual", contactId: c.id });
    const r = await ok<any>(await call(request, "POST", `/v1/crm/deals/${d.id}/whatsapp`, { snippetId: sn.id }), "WhatsApp sem o motor");
    expect(r.channel).toBe("LINK");
    expect(r.link).toContain(`wa.me/${digits}`);
    expect(decodeURIComponent(r.link)).toContain("Oi Ana, sobre Plano anual");
    expect((await activitiesOf(request, d.id)).some((a) => a.id === r.activityId && a.type === "WHATSAPP" && a.done), "atividade registrada").toBe(true);
    const noPhone = await contact(request, { name: "Sem telefone" });
    await expectCode(await call(request, "POST", `/v1/crm/deals/${(await deal(request, { contactId: noPhone.id })).id}/whatsapp`, { snippetId: sn.id }), 409, "CONTACT_NO_PHONE", "sem telefone");
    const waOn = cfg.addons.includes("whatsapp") || (await call(request, "GET", "/v1/whatsapp/connection")).status() !== 404;
    test.skip(!waOn, "projeto sem o motor de WhatsApp: só o link");
    const conn = await ok<any>(await call(request, "PUT", "/v1/whatsapp/connection", { driver: "fake", phone: "+55 44 3030-4040" }), "conectar o WhatsApp");
    const token = String((await ok<any>(await call(request, "GET", "/v1/whatsapp/connection"), "conexão")).webhookUrl).split("/").filter(Boolean).pop()!;
    await expectCode(await call(request, "POST", `/v1/crm/deals/${d.id}/whatsapp`, { snippetId: sn.id }), 409, "OUTSIDE_WINDOW", "janela fechada sem modelo");
    const plan: any = (await me(request)).plan;
    let enrollment: any = null;
    if (plan?.features?.includes("crm_sequences") || (await billingMode(request)) === "fake") {
      await ensureFeature(request, "crm_sequences");
      const seq = await ok<any>(await call(request, "POST", "/v1/crm/sequences", { name: `Follow ${uniq()}`, steps: [{ dayOffset: 0, type: "CALL", subject: "Ligar" }, { dayOffset: 2, type: "CALL", subject: "Ligar de novo" }] }), "sequência");
      enrollment = await ok<any>(await call(request, "POST", `/v1/crm/sequences/${seq.id}/enroll`, { dealId: d.id }), "inscrever");
    }
    await waInbound(playwright, { secret: conn.webhookSecret, token }, digits, "Oi, tenho interesse");
    if (enrollment) await expect.poll(async () => items<any>(await ok(await call(request, "GET", `/v1/crm/enrollments?dealId=${d.id}`), "inscrições")).find((e) => e.id === enrollment.id)?.stoppedReason, { message: "o cliente respondeu: a sequência para", timeout: 10_000 }).toBe("REPLIED");
    const sent = await ok<any>(await call(request, "POST", `/v1/crm/deals/${d.id}/whatsapp`, { snippetId: sn.id }), "WhatsApp pelo motor");
    expect(sent.channel).toBe("WHATSAPP_API");
    expect(sent.messageId).toBeTruthy();
    const conv = items<any>(await ok(await call(request, "GET", "/v1/whatsapp/conversations"), "conversas")).find((x) => x.phone === digits);
    const msgs = items<any>(await ok(await call(request, "GET", `/v1/whatsapp/conversations/${conv.id}/messages`), "mensagens"));
    const out = msgs.find((x) => x.id === sent.messageId);
    expect(out?.ref, "mensagem ligada ao negócio").toMatchObject({ app: "crm", entity: "deal", id: d.id });
    expect(out?.text).toBe("Oi Ana, sobre Plano anual");
  });

  test("API: perfil imobiliária — monta funil, campos e mensagens uma vez; imóveis compatíveis", async ({ request }) => {
    await register(request, newUser("crmimob"));
    await ensureFeature(request, "crm_automations");
    const s = await ok<any>(await call(request, "PATCH", "/v1/crm/settings", { segment: "REAL_ESTATE" }), "perfil imobiliária");
    expect(s.segment).toBe("REAL_ESTATE");
    expect(s.vocabulary?.deal).toEqual(["negociação", "negociações"]);
    expect(s.vocabulary?.contact).toEqual(["cliente", "clientes"]);
    const pls = items<any>(await ok(await call(request, "GET", "/v1/crm/pipelines"), "funis"));
    const im = pls.find((p) => p.name === "Imóveis");
    expect(im?.stages.map((x: any) => x.name)).toEqual(["Novo lead", "Atendimento", "Visita agendada", "Proposta", "Documentação"]);
    expect(s.defaultPipelineId, "funil novo vira o padrão (o antigo estava vazio)").toBe(im.id);
    const snippets = items<any>(await ok(await call(request, "GET", "/v1/crm/whatsapp-snippets"), "mensagens"));
    expect(snippets.map((x) => x.name)).toEqual(expect.arrayContaining(["Imóveis selecionados", "Confirmar visita"]));
    const autos = items<any>(await ok(await call(request, "GET", "/v1/crm/automations"), "automações"));
    const visit = autos.find((a) => a.name === "Visita agendada → lembrete");
    expect(visit?.active, "automação do perfil nasce desligada").toBe(false);
    expect(visit?.trigger?.stageId, "etapa resolvida no funil do perfil").toBe(im.stages[2].id);
    await ok(await call(request, "PATCH", "/v1/crm/settings", { segment: "REAL_ESTATE" }), "aplicar de novo");
    expect(items<any>(await ok(await call(request, "GET", "/v1/crm/pipelines"), "funis")).filter((p) => p.name === "Imóveis").length, "não duplica o funil").toBe(1);
    expect(items<any>(await ok(await call(request, "GET", "/v1/crm/whatsapp-snippets"), "mensagens")).length, "não duplica as mensagens").toBe(snippets.length);
    const prop = (b: Record<string, unknown>) => call(request, "POST", "/v1/crm/properties", { code: `IM-${uniq()}`, title: "Imóvel", purpose: "SALE", type: "APARTMENT", neighborhood: "Zona 7", city: "Maringá", bedrooms: 2, priceCents: 40000000, ...b });
    const mk = async (b: Record<string, unknown>) => { const r = await prop(b); expect(r.status(), await r.text()).toBe(201); return r.json(); };
    const a = await mk({ title: "Apto Zona 7", priceCents: 40000000 });
    const b = await mk({ title: "Apto Centro 3q", neighborhood: "Centro", bedrooms: 3, priceCents: 38000000 });
    await mk({ title: "Casa Zona 7", type: "HOUSE", bedrooms: 3, priceCents: 45000000 });
    await mk({ title: "Vendido", priceCents: 30000000, status: "SOLD" });
    await mk({ title: "Caro", priceCents: 60000000 });
    const c = await mk({ title: "Apto Novo Centro", neighborhood: "Novo Centro", priceCents: 35000000 });
    await expectCode(await prop({ code: a.code }), 409, "PROPERTY_CODE_TAKEN", "código repetido");
    expect(pathsOf(await expectCode(await prop({ priceCents: 0 }), 400, "VALIDATION_ERROR", "preço zero"))).toContain("priceCents");
    const d = await deal(request, { value: 0 });
    await ok(await call(request, "PATCH", `/v1/crm/deals/${d.id}`, { interest: { purpose: "SALE", types: ["APARTMENT"], neighborhoods: ["Zona 7"], minBedrooms: 2, maxPriceCents: 50000000 } }), "perfil de busca");
    const m = items<any>(await ok(await call(request, "GET", `/v1/crm/deals/${d.id}/property-matches`), "compatíveis"));
    expect(m.map((x) => x.property.id), "bairro desejado primeiro; vendido, caro e casa fora").toEqual([a.id, b.id, c.id]);
  });

  test("API: perfis escola, varejo e B2B — palavras e funil; trocar não apaga nada", async ({ request }) => {
    await register(request, newUser("crmperfis"));
    const p0 = await pipeline(request);
    const d = await deal(request, { value: 1000 });
    const edu = await ok<any>(await call(request, "PATCH", "/v1/crm/settings", { segment: "EDUCATION" }), "escola");
    expect(edu.vocabulary?.deal).toEqual(["matrícula", "matrículas"]);
    expect(edu.defaultPipelineId, "padrão com negócio não muda").toBe(p0.id);
    const ret = await ok<any>(await call(request, "PATCH", "/v1/crm/settings", { segment: "RETAIL" }), "varejo");
    expect(ret.vocabulary?.deal).toEqual(["venda", "vendas"]);
    const b2b = await ok<any>(await call(request, "PATCH", "/v1/crm/settings", { segment: "B2B" }), "B2B");
    expect(b2b.vocabulary?.company).toEqual(["conta", "contas"]);
    const names = items<any>(await ok(await call(request, "GET", "/v1/crm/pipelines"), "funis")).map((p) => p.name);
    expect(names, "funis dos perfis ficam todos").toEqual(expect.arrayContaining(["Matrículas", "Vendas da loja", "Vendas B2B", p0.name]));
    expect((await call(request, "GET", `/v1/crm/deals/${d.id}`)).status(), "o negócio continua").toBe(200);
    expect((await ok<any>(await call(request, "GET", "/v1/crm/settings"), "configurações")).segment).toBe("B2B");
  });

  test("Tela: metas — criar pela tela e ver o progresso", async ({ page }) => {
    await signUp(page, "crmmetatela");
    const req = page.context().request;
    await ensureFeature(req, "crm_goals");
    const d = await deal(req, { value: 50000 });
    await ok(await call(req, "POST", `/v1/crm/deals/${d.id}/won`), "ganhar");
    await page.goto("/crm/metas");
    await page.getByTestId("crm-goal-new").click();
    await page.getByTestId("crm-goal-metric").selectOption("WON_VALUE");
    await page.getByTestId("crm-goal-target").fill("1.000,00");
    await page.getByTestId("crm-goal-save").click();
    const row = page.getByTestId("crm-goal-row").first();
    await expect(row, "meta na lista").toBeVisible();
    await expect(row).toContainText("50%");
    await expect(row).toHaveAttribute("data-status", /^(AHEAD|ON_TRACK|BEHIND)$/);
  });

  test("Tela: inscrever o negócio numa sequência pela página dele", async ({ page }) => {
    await signUp(page, "crmseqtela");
    const req = page.context().request;
    await ensureFeature(req, "crm_sequences");
    const seq = await ok<any>(await call(req, "POST", "/v1/crm/sequences", { name: `Seq ${uniq()}`, steps: [{ dayOffset: 0, type: "CALL", subject: "Ligar agora" }, { dayOffset: 1, type: "EMAIL", subject: "Mandar e-mail" }] }), "sequência");
    const d = await deal(req, { value: 1000 });
    await page.goto(`/crm/negocios/${d.id}`);
    await page.getByTestId("crm-deal-sequence-enroll").click();
    await page.locator(`[data-testid="crm-sequence-option"][data-id="${seq.id}"]`).click();
    await expect(page.getByTestId("crm-deal-sequence-status"), "inscrito").toHaveAttribute("data-status", "ACTIVE");
    expect((await pending(req, d.id)).map((a) => a.subject)).toEqual(["Ligar agora"]);
    await page.getByTestId("crm-deal-sequence-stop").click();
    await expect(page.getByTestId("crm-deal-sequence-status")).toHaveAttribute("data-status", "STOPPED");
  });

  test("Tela: mesclar dois contatos pela tela", async ({ page }) => {
    await signUp(page, "crmmergetela");
    const req = page.context().request;
    const email = `bia.${uniq()}@example.com`;
    const t = await contact(req, { name: "Bia" });
    const s = await contact(req, { name: "Bia Lima", email });
    await deal(req, { contactId: s.id, title: "Negócio da Bia" });
    await page.goto(`/crm/contatos/${t.id}`);
    await page.getByTestId("crm-contact-merge").click();
    const dlg = page.getByTestId("crm-merge-dialog");
    await dlg.getByTestId("crm-merge-search").fill("Bia Lima");
    await dlg.locator(`[data-testid="crm-merge-option"][data-id="${s.id}"]`).click();
    await dlg.getByTestId("crm-merge-confirm").click();
    await expect(page.getByText("Negócio da Bia"), "o negócio da origem aparece no destino").toBeVisible();
    expect((await call(req, "GET", `/v1/crm/contacts/${s.id}`)).status()).toBe(404);
    expect((await ok<any>(await call(req, "GET", `/v1/crm/contacts/${t.id}`), "destino")).email).toBe(email);
  });
});
