import { test, expect } from "@playwright/test";
import { call, items, me, ok } from "../support/api";
import { signUp } from "../support/ui";

test.describe("Plano e cobrança", () => {
  test("owner vê os planos da API, o plano atual e o uso", async ({ page, request }) => {
    await signUp(page, "billing", "/configuracoes/plano");
    const plans = items(await ok(await call(request, "GET", "/v1/billing/plans"), "planos"));
    expect(plans.length, "a API lista planos").toBeGreaterThan(0);

    await expect(page.getByTestId("plan-card")).toHaveCount(plans.length);
    for (const p of plans) {
      await expect(page.locator(`[data-testid="plan-card"][data-plan="${p.id}"]`), `card do plano ${p.id}`).toBeVisible();
    }
    const current = (await me(page.context().request)).plan?.id;
    expect(current, "plano atual no /v1/me").toBeTruthy();
    await expect(
      page.locator(`[data-testid="plan-card"][data-plan="${current}"]`).getByTestId("plan-current"),
      "selo de plano atual no card certo",
    ).toBeVisible();
    await expect(page.getByTestId("usage-bar").first(), "uso dos limites").toBeVisible();
  });
});
