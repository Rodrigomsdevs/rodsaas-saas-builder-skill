import { test, expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, register } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, ownerWithMember, submitWithRateLimitRetry } from "../support/ui";

// Parte do /rodsaas:workstation (cobrança por app). Roda quando rodsaas.json tem "workstation" em addons.
// Usa o modo de teste da cobrança para assinar sem Stripe; com Stripe de verdade, os testes de assinatura são pulados.

async function expectCode(res: APIResponse, status: number, code: string, label: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  expect(JSON.parse(body || "{}").code, `${label}: code`).toBe(code);
  return JSON.parse(body || "{}");
}
const ws = async (req: APIRequestContext) => ((await me(req)) as any).workstation;
const sub = async (req: APIRequestContext) => ok<any>(await call(req, "GET", "/v1/workstation/subscription"), "assinatura");
const catalog = async (req: APIRequestContext) => ok<any>(await req.fetch(`${cfg.apiURL}/v1/workstation/catalog`, { failOnStatusCode: false }), "catálogo público");
async function available(req: APIRequestContext) {
  const c = await catalog(req);
  return (c.apps as any[]).filter((a) => a.status === "disponivel").map((a) => a.id as string);
}
async function requireFake(req: APIRequestContext) {
  test.skip((await billingMode(req)) !== "fake", "assinar exige o modo de teste da cobrança (sem Stripe)");
}
const itemOf = (s: any, key: string) => (s.items as any[]).find((i) => i.key === key);
async function endTrial(req: APIRequestContext) {
  await ok(await call(req, "POST", "/v1/billing/fake/simulate", { event: "trial_end" }), "simular fim do teste");
  await expect.poll(async () => (await ws(req)).model, { message: "fim do teste vira grátis" }).toBe("free");
}
const createDeal = (req: APIRequestContext, title: string) => call(req, "POST", "/v1/crm/deals", { title, value: 100000 });

test.describe("Workstation", () => {
  test.beforeEach(async () => {
    test.skip(!cfg.addons.includes("workstation"), "projeto sem a workstation");
  });

  test("API: cadastro nasce em teste de 14 dias e o catálogo público mostra os apps com preço", async ({ request }) => {
    await register(request, newUser("wstrial"));
    const w = await ws(request);
    expect(w?.model, "me.workstation.model").toBe("trial");
    expect(w.trialDaysLeft, "14 dias de teste").toBeGreaterThanOrEqual(13);
    expect(w.trialDaysLeft).toBeLessThanOrEqual(14);
    expect(w.onboardingCompleted, "onboarding ainda não feito").toBe(false);
    const s = await sub(request);
    expect(s.model).toBe("trial");
    const c = await catalog(request);
    const apps = c.apps as any[];
    const avail = apps.filter((a) => a.status === "disponivel");
    expect(avail.length, "apps disponíveis no catálogo").toBeGreaterThanOrEqual(2);
    for (const a of avail) expect(a.pricing, `preço do ${a.id}`).toBeTruthy();
    for (const a of cfg.apps ?? []) if (a.id !== "cadastros") expect(avail.some((x) => x.id === a.id), `app instalado ${a.id} disponível no catálogo`).toBe(true);
    expect(apps.some((a) => a.status === "em-breve"), "apps futuros como em breve").toBe(true);
    for (const id of Object.keys(w.apps ?? {})) expect(w.apps[id].state, `no teste, ${id} liberado`).toMatch(/trial|active/);
  });

  test("API: onboarding liga só os apps escolhidos, convida e não duplica o conteúdo inicial", async ({ request }) => {
    await register(request, newUser("wsonb"));
    const avail = await available(request);
    const chosen = ["crm", "tarefas"].filter((a) => avail.includes(a));
    test.skip(chosen.length < 2, "precisa de CRM e Tarefas instalados");
    const other = avail.find((a) => !chosen.includes(a))!;
    await expectCode(await call(request, "POST", "/v1/workstation/onboarding", { segment: "nada", apps: chosen }), 400, "VALIDATION_ERROR", "segmento inválido");
    const guest = `rodsaas.wsguest.${Date.now()}@example.com`;
    const r = await ok<any>(await call(request, "POST", "/v1/workstation/onboarding", { segment: "agencia", teamSize: "2-5", apps: chosen, invites: [guest] }), "onboarding");
    expect(String(r.redirectTo ?? ""), "redirectTo para o primeiro app").toMatch(/^\//);
    const m: any = await me(request);
    expect(m.workstation.onboardingCompleted).toBe(true);
    const off: string[] = m.organization.disabledApps ?? [];
    for (const a of chosen) expect(off, `${a} ligado`).not.toContain(a);
    expect(off, `${other} (não escolhido) desligado`).toContain(other);
    const inv = items<any>(await ok(await call(request, "GET", "/v1/invitations"), "convites"));
    expect(inv.some((i) => i.email === guest), "convite criado").toBe(true);
    const countStarter = async () => items<any>(await ok(await call(request, "GET", "/v1/task-projects"), "projetos")).filter((p) => p.name === "Primeiros passos").length;
    const before = await countStarter();
    await ok(await call(request, "POST", "/v1/workstation/onboarding", { segment: "agencia", apps: chosen }), "refazer a escolha");
    expect(await countStarter(), "conteúdo inicial não duplica").toBe(before);
  });

  test("API: assinar por app soma os itens igual à calculadora; Completo cobra por usuário com mínimo de 3", async ({ request, browser }) => {
    await register(request, newUser("wsbuy"));
    await requireFake(request);
    const avail = await available(request);
    test.skip(!avail.includes("crm") || !avail.includes("agenda"), "precisa de CRM e Agenda");
    const sel = { apps: { crm: { seats: 2 }, agenda: { seats: 1 } }, users: 2, cycle: "month" };
    const q = await ok<any>(await call(request, "POST", "/v1/workstation/quote", sel), "calculadora");
    expect(q.monthly, "2 × CRM + 1 × Agenda").toBe(2 * 39 + 19);
    await ok(await call(request, "POST", "/v1/workstation/checkout", { model: "apps", ...sel }), "assinar por app (modo de teste)");
    const s = await sub(request);
    expect(s.model).toBe("apps");
    expect(itemOf(s, "app:crm")?.quantity, "CRM com 2 assentos").toBe(2);
    expect(itemOf(s, "app:agenda")?.quantity).toBe(1);
    expect(s.monthly, "valor da assinatura = calculadora").toBe(q.monthly);
    await expectCode(await call(request, "POST", "/v1/workstation/checkout", { model: "apps", ...sel }), 409, "ALREADY_SUBSCRIBED", "assinar de novo");
    const w = await ws(request);
    expect(w.apps.crm.state).toBe("active");
    expect(w.apps.helpdesk?.state ?? "locked", "app não assinado bloqueado").toBe("locked");

    const other = await newContext(browser);
    await register(other.request, newUser("wscomp"));
    await ok(await call(other.request, "POST", "/v1/workstation/checkout", { model: "completo", apps: {}, users: 1, cycle: "month" }), "assinar o Completo");
    const sc = await sub(other.request);
    expect(sc.model).toBe("completo");
    expect(itemOf(sc, "completo")?.quantity, "mínimo de 3 usuários").toBe(3);
    expect(sc.monthly).toBe(3 * 69);
    const wc = await ws(other.request);
    for (const id of avail) expect(wc.apps[id]?.state, `Completo libera ${id}`).toBe("active");
    await other.close();
  });

  test("API: acesso por pessoa — sem acesso é 403; dar acesso além dos assentos pede confirmação e aumenta a quantidade", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, member, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request;
    await requireFake(o);
    test.skip(!(await available(o)).includes("crm"), "precisa do CRM");
    const ownerId = (await me(o)).user.id, memberId = (await me(m)).user.id;
    await ok(await call(o, "PUT", "/v1/workstation/apps/crm/access", { userIds: [ownerId] }), "só o owner no CRM");
    await ok(await call(o, "POST", "/v1/workstation/checkout", { model: "apps", apps: { crm: { seats: 1 } }, users: 2, cycle: "month" }), "assinar CRM com 1 assento");
    const denied = await expectCode(await call(m, "GET", "/v1/crm/deals"), 403, "APP_ACCESS_DENIED", "membro sem acesso lendo o CRM");
    expect(denied.appId ?? "crm").toBe("crm");
    await expectCode(await call(m, "POST", "/v1/crm/deals", { title: "x" }), 403, "APP_ACCESS_DENIED", "membro sem acesso criando no CRM");
    const conf = await expectCode(await call(o, "PUT", "/v1/workstation/apps/crm/access", { userIds: [ownerId, memberId] }), 409, "CONFIRM_REQUIRED", "dar acesso além dos assentos sem confirmar");
    expect(conf.newMonthly, "prévia do novo valor").toBe(78);
    expect(itemOf(await sub(o), "app:crm").quantity, "nada muda sem confirmar").toBe(1);
    await ok(await call(o, "PUT", "/v1/workstation/apps/crm/access", { userIds: [ownerId, memberId], confirm: true }), "confirmar");
    expect(itemOf(await sub(o), "app:crm").quantity, "quantidade subiu para 2").toBe(2);
    await ok(await call(m, "GET", "/v1/crm/deals"), "membro com acesso lê o CRM");
    await ok(await call(o, "PUT", "/v1/workstation/apps/crm/access", { userIds: [ownerId] }), "tirar o acesso libera o assento sem cobrar");
    expect(itemOf(await sub(o), "app:crm").quantity, "assento comprado continua").toBe(2);
    await expectCode(await call(m, "GET", "/v1/workstation/subscription"), 403, "FORBIDDEN", "membro não vê a assinatura");
    void member;
    await ownerCtx.close(); await memberCtx.close();
  });

  test("API: fim do teste sem assinar vira grátis — app pago só leitura, app do grátis segue, dados ficam", async ({ request }) => {
    await register(request, newUser("wsend"));
    await requireFake(request);
    const avail = await available(request);
    test.skip(!avail.includes("crm"), "precisa do CRM");
    const deal = await ok<any>(await createDeal(request, "Negócio do teste"), "criar negócio no teste");
    await endTrial(request);
    const w = await ws(request);
    expect(w.apps.crm.state, "CRM bloqueado").toBe("locked");
    const list = items<any>(await ok(await call(request, "GET", "/v1/crm/deals"), "ler o CRM bloqueado (só leitura)"));
    expect(list.some((d) => d.id === deal.id), "dados continuam lá").toBe(true);
    const err = await expectCode(await createDeal(request, "Depois do teste"), 403, "APP_NOT_ACTIVE", "criar em app bloqueado");
    expect(err.appId ?? "crm").toBe("crm");
    if (avail.includes("tarefas")) {
      expect(w.apps.tarefas.state, "Tarefas segue no grátis").toBe("free");
      await ok(await call(request, "GET", "/v1/task-projects"), "Tarefas funciona no grátis");
    }
    await ok(await call(request, "POST", "/v1/invitations", { email: `rodsaas.f1.${Date.now()}@example.com`, role: "MEMBER" }), "grátis aceita até 2 pessoas");
    await expectCode(await call(request, "POST", "/v1/invitations", { email: `rodsaas.f2.${Date.now()}@example.com`, role: "MEMBER" }), 403, "PLAN_LIMIT_REACHED", "3ª pessoa no grátis");
    await ok(await call(request, "POST", "/v1/workstation/checkout", { model: "apps", apps: { crm: { seats: 1 } }, users: 1, cycle: "month" }), "assinar o CRM");
    await ok(await createDeal(request, "Voltou"), "assinou: volta a criar na hora");
  });

  test("Tela: cadastro vindo da landing abre o onboarding com os apps marcados e termina no primeiro app", async ({ page, request }) => {
    test.slow();
    const avail = await available(request);
    test.skip(!avail.includes("crm") || !avail.includes("agenda"), "precisa de CRM e Agenda");
    const u = newUser("wsui");
    await page.goto("/cadastro?apps=crm,agenda&plano=completo&ciclo=anual");
    await page.getByTestId("signup-name").fill(u.name);
    await page.getByTestId("signup-email").fill(u.email);
    await page.getByTestId("signup-password").fill(u.password);
    await page.getByTestId("signup-org-name").fill(u.organizationName);
    const res = await submitWithRateLimitRetry(page, page.getByTestId("signup-submit"), "/v1/auth/register");
    expect(res.status()).toBeLessThan(300);
    await expect(page.getByTestId("onboarding-wizard"), "cadastro termina no onboarding").toBeVisible();
    // agência não sugere a Agenda: ela só vem marcada porque veio da landing (?apps=)
    await page.locator('[data-testid="onboarding-segment"][data-segment="agencia"]').click();
    await page.getByTestId("onboarding-next").click();
    for (const id of ["crm", "agenda"]) await expect(page.locator(`[data-testid="onboarding-app"][data-app="${id}"]`), `${id} já marcado (veio da landing)`).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("onboarding-next").click();
    await page.getByTestId("onboarding-finish").click();
    await expect(page, "abre o primeiro app escolhido").toHaveURL(/\/(crm|agenda)(\/|$)/);
    await expect(page.getByTestId("trial-banner"), "banner do teste").toBeVisible();
    await expect(page.getByTestId("trial-days")).toContainText(/1[34]/);
    const w = await ws(page.context().request);
    expect(w.onboardingCompleted).toBe(true);
  });

  test("Tela: assinatura calcula igual ao site, assina, e mostra a prévia antes de mudar; app bloqueado avisa", async ({ page, browser }) => {
    test.slow();
    const u = newUser("wsassin");
    await register(page.context().request, u);
    await requireFake(page.context().request);
    const avail = await available(page.context().request);
    test.skip(!avail.includes("crm") || !avail.includes("agenda"), "precisa de CRM e Agenda");
    await page.goto("/configuracoes/assinatura");
    await page.getByTestId("ws-model-apps").click();
    const toggle = (id: string) => page.locator(`[data-testid="ws-app-toggle"][data-app="${id}"]`);
    const seats = (id: string) => page.locator(`[data-testid="ws-seats"][data-app="${id}"]`);
    for (const id of avail) if ((await toggle(id).getAttribute("aria-checked")) === "true") await toggle(id).click();
    await toggle("crm").click();
    await seats("crm").fill("2");
    await seats("crm").dispatchEvent("change");
    await expect(page.getByTestId("ws-total"), "total = 2 × R$ 39").toContainText(/R\$\s?78/);
    await page.getByTestId("ws-checkout").click();
    await expect(page.locator('[data-testid="ws-item"][data-app="crm"]'), "CRM na assinatura").toBeVisible();
    await toggle("agenda").click();
    await page.getByTestId("ws-checkout").click();
    const dlg = page.getByTestId("ws-preview-dialog");
    await expect(dlg, "prévia antes de mudar").toBeVisible();
    await expect(dlg).toContainText(/R\$/);
    await page.getByTestId("ws-preview-confirm").click();
    await expect(page.locator('[data-testid="ws-item"][data-app="agenda"]'), "Agenda entrou").toBeVisible();

    const other = await newContext(browser);
    await register(other.request, newUser("wslock"));
    await endTrial(other.request);
    const op = await other.newPage();
    await op.goto(cfg.apps?.find((a) => a.id === "crm")?.home ?? "/crm/negocios");
    await expect(op.getByTestId("app-locked"), "faixa de só leitura no app bloqueado").toBeVisible();
    await expect(op.getByTestId("app-locked-cta"), "owner vê o botão de assinar").toBeVisible();
    await other.close();
  });
});
