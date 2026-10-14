import { test, expect } from "@playwright/test";
import { billingMode, call, me, newUser, ok, plansFromApi } from "../support/api";
import { ownerWithMember, signUp, submitWithRateLimitRetry } from "../support/ui";
import { cfg } from "../support/config.mjs";

const card = (page: import("@playwright/test").Page, id: string) => page.locator(`[data-testid="plan-card"][data-plan="${id}"]`);
const subscribeBtn = (page: import("@playwright/test").Page, id: string) =>
  page.locator(`[data-testid="plan-subscribe"][data-plan="${id}"]`);

test.describe("Plano e cobrança", () => {
  test.beforeEach(() => {
    test.skip(cfg.billingModel === "apps", "projeto com a workstation: a cobrança é por app (parte Workstation)");
  });

  test("owner vê os planos, o atual, o uso e o botão de assinar", async ({ page, request }) => {
    await signUp(page, "billing", "/configuracoes/plano");
    const { all, paid } = await plansFromApi(request);
    await expect(page.getByTestId("plan-card")).toHaveCount(all.length);
    const m: any = await me(page.context().request);
    await expect(card(page, m.plan.id).getByTestId("plan-current"), "selo de plano atual no card certo").toBeVisible();
    await expect(page.getByTestId("usage-bar").first(), "uso dos limites").toBeVisible();

    for (const p of paid.filter((x) => x.id !== m.plan.id)) {
      const btn = subscribeBtn(page, p.id);
      await expect(btn, `botão de assinar o plano ${p.id} (nunca escondido para o owner)`).toBeVisible();
      if (m.billing?.mode === "disabled") await expect(btn).toBeDisabled();
      else await expect(btn).toBeEnabled();
    }
    if (m.billing?.mode && m.billing.mode !== "stripe") {
      await expect(page.getByTestId("billing-mode-banner"), `aviso do modo "${m.billing.mode}"`).toBeVisible();
    }
  });

  test("assinar, trocar, cancelar e retomar pela tela", async ({ page }) => {
    test.slow();
    await signUp(page, "upgrade", "/configuracoes/plano");
    const req = page.context().request;
    const mode = await billingMode(req);
    const { paid } = await plansFromApi(req);
    const [p1, p2] = paid;
    test.skip(!p1, "nenhum plano pago");

    if (mode === "stripe") {
      // com Stripe de verdade: só confere que o botão leva ao checkout (sem pagar)
      await page.route(/checkout\.stripe\.com/, (r) => r.fulfill({ status: 200, body: "checkout" }));
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/v1/billing/checkout-sessions")),
        subscribeBtn(page, p1.id).click(),
      ]);
      expect(res.status()).toBeLessThan(300);
      expect((await res.json()).url, "URL do checkout da Stripe").toContain("stripe.com");
      return;
    }
    test.skip(mode !== "fake", `cobrança em modo "${mode}"`);

    // assinar
    await subscribeBtn(page, p1.id).click();
    await expect(card(page, p1.id).getByTestId("plan-current"), `plano ${p1.id} ativo após assinar`).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => ((await me(req)) as any).plan.id).toBe(p1.id);
    await expect(page, "?status removido da URL").not.toHaveURL(/status=/, { timeout: 15_000 });

    // trocar
    if (p2) {
      await subscribeBtn(page, p2.id).click();
      await expect(page.getByTestId("plan-change-dialog"), "diálogo de troca com prévia").toBeVisible();
      await page.getByTestId("plan-change-confirm").click();
      await expect(card(page, p2.id).getByTestId("plan-current")).toBeVisible({ timeout: 15_000 });
      expect(((await me(req)) as any).plan.id).toBe(p2.id);
    }

    // cancelar e retomar
    await page.getByTestId("billing-cancel").click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("billing-resume"), "retomar aparece após cancelar").toBeVisible();
    expect(((await me(req)) as any).plan.cancelAtPeriodEnd).toBe(true);
    await page.getByTestId("billing-resume").click();
    await expect(page.getByTestId("billing-cancel")).toBeVisible();
    expect(((await me(req)) as any).plan.cancelAtPeriodEnd).toBe(false);
  });

  test("admin vê os planos sem botões e com o aviso de que só o owner muda", async ({ browser, request }) => {
    const { ownerCtx, member, memberCtx } = await ownerWithMember(browser, request);
    const list = await ok(await call(ownerCtx.request, "GET", "/v1/members"), "membros");
    const row = (list.data ?? list).find((x: any) => x.user?.email === member.email);
    await ok(await call(ownerCtx.request, "PATCH", `/v1/members/${row.id}`, { role: "ADMIN" }), "promover a admin");

    const ap = await memberCtx.newPage();
    await ap.goto("/configuracoes/plano");
    await expect(ap.getByTestId("plan-card").first(), "admin vê os planos").toBeVisible();
    await expect(ap.getByTestId("plan-subscribe"), "admin não tem botão de assinar").toHaveCount(0);
    await expect(ap.getByTestId("billing-cancel")).toHaveCount(0);
    await expect(ap.getByTestId("billing-owner-only"), "aviso de que só o owner muda o plano").toBeVisible();
    await ownerCtx.close();
    await memberCtx.close();
  });

  test("cadastro com plano escolhido já sai assinando", async ({ page }) => {
    const req = page.context().request;
    const { paid } = await plansFromApi(req);
    test.skip(!paid[0], "nenhum plano pago");
    const u = newUser("signupplan");
    await page.goto(`/cadastro?plano=${paid[0].id}&ciclo=month`);
    await page.getByTestId("signup-name").fill(u.name);
    await page.getByTestId("signup-email").fill(u.email);
    await page.getByTestId("signup-password").fill(u.password);
    await page.getByTestId("signup-org-name").fill(u.organizationName);
    const checkout = page
      .waitForRequest((r) => r.url().includes("/v1/billing/checkout-sessions") && r.method() === "POST", { timeout: 25_000 })
      .catch(() => null);
    await page.route(/checkout\.stripe\.com/, (r) => r.fulfill({ status: 200, body: "checkout" }));
    const res = await submitWithRateLimitRetry(page, page.getByTestId("signup-submit"), "/v1/auth/register");
    expect(res.status()).toBeLessThan(300);

    const mode = await billingMode(req);
    if (mode === "fake") {
      await expect.poll(async () => ((await me(req)) as any).plan.id, { message: "plano escolhido aplicado após o cadastro", timeout: 20_000 }).toBe(paid[0].id);
    } else if (mode === "stripe") {
      expect(await checkout, "cadastro com ?plano= segue para o checkout").not.toBeNull();
    } else {
      test.skip(true, `cobrança em modo "${mode}"`);
    }
  });
});
