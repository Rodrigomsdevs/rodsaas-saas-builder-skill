import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, ownerWithMember, signUp } from "../support/ui";

// Parte do CRM (preset /rodsaas:crm). Roda quando rodsaas.json tem "crm" em presets ou a API tem /v1/crm.

type Stage = { id: string; name: string; probability: number };
type Pipeline = { id: string; name: string; isDefault?: boolean; stages: Stage[] };

async function crmInstalled(req: APIRequestContext) {
  if (cfg.presets.includes("crm")) return true;
  return (await call(req, "GET", "/v1/crm/pipelines")).status() !== 404;
}

async function defaultPipeline(req: APIRequestContext): Promise<Pipeline> {
  const list = items<Pipeline>(await ok(await call(req, "GET", "/v1/crm/pipelines"), "GET /v1/crm/pipelines"));
  const p = list.find((x) => x.isDefault) ?? list[0];
  expect(p, "a empresa nova já nasce com um funil").toBeTruthy();
  expect(p.stages?.length ?? 0, "etapas do funil padrão").toBeGreaterThanOrEqual(3);
  return p;
}

const createDeal = async (req: APIRequestContext, body: Record<string, unknown>) =>
  ok<any>(await call(req, "POST", "/v1/crm/deals", body), `criar negócio "${body.title}"`);
const getDeal = (req: APIRequestContext, id: string) => call(req, "GET", `/v1/crm/deals/${id}`);
const board = async (req: APIRequestContext, pipelineId: string) =>
  ok<any>(await call(req, "GET", `/v1/crm/pipelines/${pipelineId}/board`), "quadro do funil");
const boardDealIds = (b: any): string[] => (b.stages ?? []).flatMap((s: any) => (s.deals ?? []).map((d: any) => d.id));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function expectCode(res: import("@playwright/test").APIResponse, status: number, code: string, label: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  expect(JSON.parse(body || "{}").code, `${label}: code`).toBe(code);
  return JSON.parse(body || "{}");
}

const stageColumn = (page: Page, stageId: string) => page.locator(`[data-testid="crm-stage-column"][data-stage-id="${stageId}"]`);
const dealCard = (page: Page, dealId: string) => page.locator(`[data-testid="crm-deal-card"][data-deal-id="${dealId}"]`);

test.describe("CRM", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await crmInstalled(request)), "projeto sem o preset crm");
  });

  // ------------------------------------------------------------------ API
  test("API: funil padrão, criar negócio, mover de etapa e totais do quadro", async ({ request }) => {
    await register(request, newUser("crm"));
    const p = await defaultPipeline(request);
    const deal = await createDeal(request, { title: `Negócio ${uniq()}`, value: 150000 });
    expect(deal.status, "negócio nasce aberto").toBe("OPEN");
    expect(deal.pipelineId, "sem funil informado → funil padrão").toBe(p.id);
    expect(deal.stageId, "sem etapa informada → primeira etapa").toBe(p.stages[0].id);
    expect(deal.value, "valor em centavos").toBe(150000);

    await ok(await call(request, "POST", `/v1/crm/deals/${deal.id}/move`, { stageId: p.stages[1].id }), "mover de etapa");
    expect((await ok<any>(await getDeal(request, deal.id), "ler negócio")).stageId, "etapa depois de mover").toBe(p.stages[1].id);

    const b = await board(request, p.id);
    const col = b.stages.find((s: any) => s.id === p.stages[1].id);
    expect(col.deals.map((d: any) => d.id), "negócio na coluna da etapa nova").toContain(deal.id);
    expect(col.value, "total da coluna (empresa nova, só este negócio)").toBe(150000);
    expect(b.stages.find((s: any) => s.id === p.stages[0].id).value, "coluna anterior sem o valor").toBe(0);
    expect(b.totals?.value, "total do funil").toBe(150000);
  });

  test("API: ganhar, reabrir e perder com motivo obrigatório", async ({ request }) => {
    await register(request, newUser("crmwon"));
    const p = await defaultPipeline(request);
    const deal = await createDeal(request, { title: `Ganho ${uniq()}`, value: 50000 });

    await ok(await call(request, "POST", `/v1/crm/deals/${deal.id}/won`), "ganhar");
    expect((await ok<any>(await getDeal(request, deal.id), "ler")).status).toBe("WON");
    await expectCode(await call(request, "POST", `/v1/crm/deals/${deal.id}/move`, { stageId: p.stages[2].id }), 409, "DEAL_NOT_OPEN", "mover negócio ganho");
    expect(boardDealIds(await board(request, p.id)), "ganho sai do quadro").not.toContain(deal.id);

    await ok(await call(request, "POST", `/v1/crm/deals/${deal.id}/reopen`), "reabrir");
    expect((await ok<any>(await getDeal(request, deal.id), "ler")).status).toBe("OPEN");

    const settings = await ok<any>(await call(request, "GET", "/v1/crm/settings"), "configurações do CRM");
    if (settings.requireLostReason) {
      await expectCode(await call(request, "POST", `/v1/crm/deals/${deal.id}/lost`, {}), 400, "LOST_REASON_REQUIRED", "perder sem motivo");
    }
    const reasons = items<any>(await ok(await call(request, "GET", "/v1/crm/lost-reasons"), "motivos de perda"));
    expect(reasons.length, "motivos de perda iniciais").toBeGreaterThan(0);
    await ok(await call(request, "POST", `/v1/crm/deals/${deal.id}/lost`, { lostReasonId: reasons[0].id, lostNote: "teste" }), "perder com motivo");
    const lost = await ok<any>(await getDeal(request, deal.id), "ler");
    expect(lost.status).toBe("LOST");
    expect(lost.lostReason?.id ?? lost.lostReasonId, "motivo gravado").toBe(reasons[0].id);
  });

  test("API: outra empresa não vê nem usa nada do CRM (404)", async ({ browser }) => {
    const a = await newContext(browser);
    const b = await newContext(browser);
    await register(a.request, newUser("crmA"));
    await register(b.request, newUser("crmB"));
    const pa = await defaultPipeline(a.request);
    const deal = await createDeal(a.request, { title: `Isolado ${uniq()}`, value: 1000 });

    expect((await getDeal(b.request, deal.id)).status(), "negócio de outra empresa").toBe(404);
    expect((await call(b.request, "POST", `/v1/crm/deals/${deal.id}/won`)).status(), "ganhar negócio de outra empresa").toBe(404);
    expect((await call(b.request, "GET", `/v1/crm/pipelines/${pa.id}/board`)).status(), "quadro do funil de outra empresa").toBe(404);
    const res = await call(b.request, "POST", "/v1/crm/deals", { title: "Invasor", pipelineId: pa.id, stageId: pa.stages[0].id });
    expect(res.status(), "criar negócio no funil de outra empresa é recusado").toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    await a.close();
    await b.close();
  });

  test("API: modo 'cada vendedor vê os seus' esconde negócios de outros (404)", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const memberId = (await me(memberCtx.request)).user.id;
    await ok(await call(ownerCtx.request, "PATCH", "/v1/crm/settings", { visibility: "OWN" }), "ligar visibilidade restrita");

    const p = await defaultPipeline(ownerCtx.request);
    const ownerDeal = await createDeal(ownerCtx.request, { title: `Do owner ${uniq()}`, value: 7000 });
    expect((await getDeal(memberCtx.request, ownerDeal.id)).status(), "membro abrindo negócio do owner").toBe(404);
    expect(boardDealIds(await board(memberCtx.request, p.id)), "negócio do owner no quadro do membro").not.toContain(ownerDeal.id);
    const listed = items<any>(await ok(await call(memberCtx.request, "GET", "/v1/crm/deals"), "lista do membro"));
    expect(listed.map((d) => d.id), "negócio do owner na lista do membro").not.toContain(ownerDeal.id);
    expect((await call(memberCtx.request, "PATCH", `/v1/crm/deals/${ownerDeal.id}`, { title: "x" })).status(), "membro editando negócio do owner").toBe(404);

    const memberDeal = await createDeal(memberCtx.request, { title: `Do membro ${uniq()}`, value: 3000 });
    expect((await getDeal(ownerCtx.request, memberDeal.id)).status(), "owner vê o negócio do membro").toBe(200);

    await ok(
      await call(ownerCtx.request, "POST", "/v1/crm/activities", { type: "CALL", subject: "Ligar", dueDate: today(), ownerId: memberId, dealId: ownerDeal.id }),
      "atividade do negócio do owner atribuída ao membro",
    );
    expect((await getDeal(memberCtx.request, ownerDeal.id)).status(), "com uma atividade atribuída, o membro passa a ver o negócio").toBe(200);

    const other = await createDeal(ownerCtx.request, { title: `Outro ${uniq()}`, value: 100 });
    expect((await getDeal(memberCtx.request, other.id)).status()).toBe(404);
    await ok(await call(ownerCtx.request, "PATCH", "/v1/crm/settings", { visibility: "ALL" }), "voltar para todos veem tudo");
    expect((await getDeal(memberCtx.request, other.id)).status(), "modo aberto libera na hora").toBe(200);
    await ownerCtx.close();
    await memberCtx.close();
  });

  test("API: contato com e-mail repetido é recusado com o existente (409)", async ({ request }) => {
    await register(request, newUser("crmdup"));
    const email = `cliente.${uniq()}@example.com`;
    const c = await ok<any>(await call(request, "POST", "/v1/crm/contacts", { name: "Ana Souza", email }), "criar contato");
    const body = await expectCode(
      await call(request, "POST", "/v1/crm/contacts", { name: "Ana S.", email: email.toUpperCase() }),
      409,
      "CONTACT_DUPLICATE",
      "mesmo e-mail com maiúsculas",
    );
    expect(body.existing?.id, "resposta aponta o contato existente").toBe(c.id);
  });

  test("API: captura de lead por chave e conversão reaproveitando o contato", async ({ request, playwright }) => {
    await register(request, newUser("crmcap"));
    let plan: any = (await me(request)).plan;
    if (!plan?.features?.includes("crm_capture")) {
      const mode = await billingMode(request);
      test.skip(mode !== "fake", `captura exige plano pago e a cobrança está em modo "${mode}"`);
      const target = (await plansFromApi(request)).paid.find((x) => x.features?.includes("crm_capture"));
      test.skip(!target, "nenhum plano com a feature crm_capture");
      await ok(await call(request, "POST", "/v1/billing/checkout-sessions", { plan: target!.id, interval: "month" }), "assinar plano com captura (modo de teste)");
      plan = (await me(request)).plan;
      expect(plan.features, "plano com a feature crm_capture").toContain("crm_capture");
    }

    const email = `lead.${uniq()}@example.com`;
    const contact = await ok<any>(await call(request, "POST", "/v1/crm/contacts", { name: "Bruno Lima", email }), "contato existente");
    const created = await ok<any>(await call(request, "POST", "/v1/crm/capture-keys", { name: "Teste verify", kind: "API" }), "criar chave de API");
    expect(created.key, "chave devolvida uma vez na criação").toBeTruthy();

    // servidor para servidor: contexto novo, sem Origin e sem cookie
    const anon = await playwright.request.newContext();
    const capture = (key: string) =>
      anon.fetch(`${cfg.apiURL}/v1/public/crm/leads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        data: JSON.stringify({ nome: "Bruno Lima", email, telefone: "(44) 99999-1234", mensagem: "Quero orçamento", utm_source: "verify" }),
        failOnStatusCode: false,
      });
    const res = await capture(created.key);
    const resBody = await res.text();
    expect(res.status(), `captura com a chave certa (sem Origin) → ${resBody.slice(0, 300)}`).toBeLessThan(300);
    const leadId = JSON.parse(resBody).id;
    expect(leadId, "id do lead na resposta").toBeTruthy();
    expect(resBody, "resposta da captura não devolve os dados do lead").not.toContain(email);
    await expectCode(await capture("rsk_chave_errada"), 401, "CAPTURE_KEY_INVALID", "captura com chave errada");

    const leads = items<any>(await ok(await call(request, "GET", "/v1/crm/leads"), "caixa de leads"));
    expect(leads.map((l) => l.id), "lead capturado na caixa").toContain(leadId);

    const conv = await ok<any>(await call(request, "POST", `/v1/crm/leads/${leadId}/convert`, {}), "converter lead");
    expect(conv.contact?.id, "conversão reaproveita o contato com o mesmo e-mail").toBe(contact.id);
    const deal = await ok<any>(await getDeal(request, conv.deal.id), "negócio criado na conversão");
    expect(deal.contact?.id, "negócio ligado ao contato").toBe(contact.id);
    await expectCode(await call(request, "POST", `/v1/crm/leads/${leadId}/convert`, {}), 409, "LEAD_ALREADY_CONVERTED", "converter de novo");

    await ok(await call(request, "DELETE", `/v1/crm/capture-keys/${created.id}`), "revogar chave");
    await expectCode(await capture(created.key), 401, "CAPTURE_KEY_INVALID", "captura com chave revogada");
    await anon.dispose();
  });

  // ------------------------------------------------------------------ telas
  test("quadro: criar negócio pela tela, com erro no campo e total da coluna", async ({ page }) => {
    await signUp(page, "crmui", "/crm/negocios");
    const req = page.context().request;
    const p = await defaultPipeline(req);
    await expect(page.getByTestId("crm-board")).toBeVisible();
    await expect(page.getByTestId("crm-stage-column"), "uma coluna por etapa").toHaveCount(p.stages.length);

    await page.getByTestId("crm-deal-new").click();
    await expect(page.getByTestId("form-sheet")).toBeVisible();
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("field-error-title"), "título obrigatório mostrado no campo").toBeVisible();

    const title = `Acme ${uniq()}`;
    await page.getByTestId("field-title").fill(title);
    await page.getByTestId("field-value").fill("1.500,00");
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("form-sheet")).toBeHidden();

    const first = stageColumn(page, p.stages[0].id);
    await expect(first.getByTestId("crm-deal-card").filter({ hasText: title }), "card na primeira etapa").toBeVisible();
    await expect(first.getByTestId("crm-stage-total"), "total da coluna em R$").toContainText("1.500");
    const created = items<any>(await ok(await call(req, "GET", `/v1/crm/deals?q=${encodeURIComponent(title)}`), "lista")).find((d) => d.title === title);
    expect(created?.value, "\"1.500,00\" gravado como 150000 centavos").toBe(150000);
    await expect(dealCard(page, created.id).getByTestId("crm-next-activity"), "selo de 'sem atividade' no card novo").toHaveAttribute("data-state", "none");
  });

  test("negócio: mover pela barra de etapas, ganhar, reabrir e perder com motivo", async ({ page }) => {
    await signUp(page, "crmdeal");
    const req = page.context().request;
    const p = await defaultPipeline(req);
    const title = `Contrato ${uniq()}`;
    const deal = await createDeal(req, { title, value: 990000 });
    await page.goto(`/crm/negocios/${deal.id}`);
    await expect(page.getByTestId("crm-deal-title")).toContainText(title);
    await expect(page.getByTestId("crm-deal-status")).toHaveAttribute("data-status", "OPEN");

    const target = page.locator(`[data-testid="crm-stage-step"][data-stage-id="${p.stages[2].id}"]`);
    await target.click();
    await expect(target, "etapa clicada vira a atual").toHaveAttribute("aria-current", "step");
    await expect.poll(async () => (await ok<any>(await getDeal(req, deal.id), "ler")).stageId, { message: "etapa gravada na API" }).toBe(p.stages[2].id);

    await page.getByTestId("crm-deal-won").click();
    await expect(page.getByTestId("crm-deal-status")).toHaveAttribute("data-status", "WON");
    await expect.poll(async () => (await ok<any>(await getDeal(req, deal.id), "ler")).status).toBe("WON");

    await page.getByTestId("crm-deal-reopen").click();
    await expect(page.getByTestId("crm-deal-status")).toHaveAttribute("data-status", "OPEN");

    await page.getByTestId("crm-deal-lost").click();
    await expect(page.getByTestId("crm-lost-dialog")).toBeVisible();
    await page.getByTestId("crm-lost-reason").click();
    await page.getByTestId("crm-lost-reason-option").first().click();
    await page.getByTestId("crm-lost-confirm").click();
    await expect(page.getByTestId("crm-deal-status")).toHaveAttribute("data-status", "LOST");
    const lost = await ok<any>(await getDeal(req, deal.id), "ler");
    expect(lost.status).toBe("LOST");
    expect(lost.lostReason?.id ?? lost.lostReasonId, "motivo escolhido gravado").toBeTruthy();
  });

  test("atividade: agendar no negócio, aparecer em Hoje e concluir pela agenda", async ({ page }) => {
    await signUp(page, "crmact");
    const req = page.context().request;
    const p = await defaultPipeline(req);
    const deal = await createDeal(req, { title: `Follow-up ${uniq()}`, value: 1000 });
    await page.goto(`/crm/negocios/${deal.id}`);

    const subject = `Ligar para o cliente ${uniq()}`;
    await page.getByTestId("crm-activity-new").click();
    await page.getByTestId("field-subject").fill(subject);
    await page.getByTestId("form-submit").click();
    await expect.poll(async () => (await ok<any>(await getDeal(req, deal.id), "ler")).nextActivity?.subject, { message: "próxima atividade do negócio" }).toBe(subject);

    await page.goto("/crm/negocios");
    await expect(dealCard(page, deal.id).getByTestId("crm-next-activity"), "selo 'hoje' no card").toHaveAttribute("data-state", "today");

    await page.goto("/crm/atividades");
    await page.getByTestId("crm-activities-tab-today").click();
    const row = page.getByTestId("crm-activity-row").filter({ hasText: subject });
    await expect(row, "atividade de hoje na agenda").toBeVisible();
    await row.getByTestId("crm-activity-done").click();
    await expect(page.getByTestId("crm-activity-row").filter({ hasText: subject }), "concluída sai das pendentes de hoje").toHaveCount(0, { timeout: 15_000 });
    await expect.poll(async () => (await ok<any>(await getDeal(req, deal.id), "ler")).nextActivity ?? null, { message: "negócio sem próxima atividade" }).toBeNull();

    await page.goto("/crm/negocios");
    await expect(stageColumn(page, p.stages[0].id)).toBeVisible();
    await expect(dealCard(page, deal.id).getByTestId("crm-next-activity"), "card volta para 'sem atividade'").toHaveAttribute("data-state", "none");
  });

  test("contato: aviso de duplicado com link para o existente", async ({ page }) => {
    await signUp(page, "crmcontact");
    const req = page.context().request;
    const email = `ana.${uniq()}@example.com`;
    const existing = await ok<any>(await call(req, "POST", "/v1/crm/contacts", { name: "Ana Souza", email }), "contato existente");

    await page.goto("/crm/contatos");
    await page.getByTestId("crm-contact-new").click();
    await expect(page.getByTestId("form-sheet")).toBeVisible();
    await page.getByTestId("field-name").fill("Ana Souza Lima");
    await page.getByTestId("field-email").fill(email);
    const warning = page.getByTestId("crm-duplicate-warning");
    if (!(await warning.isVisible({ timeout: 3_000 }).catch(() => false))) await page.getByTestId("form-submit").click();
    await expect(warning, "aviso de contato já cadastrado").toBeVisible();
    await expect(page.getByTestId("form-sheet"), "formulário continua aberto").toBeVisible();
    await page.getByTestId("crm-duplicate-open").click();
    await expect(page, "link abre o contato existente").toHaveURL(new RegExp(`/crm/contatos/${existing.id}`));

    const list = items<any>(await ok(await call(req, "GET", `/v1/crm/contacts?q=${encodeURIComponent(email)}`), "busca"));
    expect(list.filter((c) => c.email === email), "nenhum contato duplicado criado").toHaveLength(1);
  });

  test("lead: converter pela tela e abrir o negócio", async ({ page }) => {
    await signUp(page, "crmlead");
    const req = page.context().request;
    const name = `Carla ${uniq()}`;
    const lead = await ok<any>(await call(req, "POST", "/v1/crm/leads", { personName: name, email: `${uniq()}@example.com` }), "criar lead");

    await page.goto("/crm/leads");
    const row = page.getByTestId("crm-lead-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    const inRow = row.getByTestId("crm-lead-convert");
    if (await inRow.isVisible().catch(() => false)) await inRow.click();
    else {
      await row.click();
      await page.getByTestId("crm-lead-convert").click();
    }
    await expect(page.getByTestId("crm-convert-dialog")).toBeVisible();
    await page.getByTestId("crm-convert-confirm").click();
    await expect(page, "vai para o negócio criado").toHaveURL(/\/crm\/negocios\/[^/?#]+/, { timeout: 15_000 });
    await expect(page.getByTestId("crm-deal-title")).toBeVisible();
    const after = await ok<any>(await call(req, "GET", `/v1/crm/leads/${lead.id}`), "lead depois");
    expect(after.status, "lead marcado como convertido").toBe("CONVERTED");
  });

  test("modo restrito na tela: membro não vê o negócio do owner (quadro e link direto)", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    await ok(await call(ownerCtx.request, "PATCH", "/v1/crm/settings", { visibility: "OWN" }), "ligar visibilidade restrita");
    const title = `Sigiloso ${uniq()}`;
    const deal = await createDeal(ownerCtx.request, { title, value: 123400 });

    const page = await memberCtx.newPage();
    await page.goto("/crm/negocios");
    await expect(page.getByTestId("crm-board")).toBeVisible();
    await expect(page.getByTestId("crm-deal-card").filter({ hasText: title }), "card do owner no quadro do membro").toHaveCount(0);
    await page.goto(`/crm/negocios/${deal.id}`);
    await expect(page.getByTestId("page-not-found"), "link direto → não encontrado").toBeVisible();
    await expect(page.getByTestId("app-shell"), "com a casca do app").toBeVisible();
    await ownerCtx.close();
    await memberCtx.close();
  });
});
