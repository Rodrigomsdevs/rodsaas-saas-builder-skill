import { test, expect } from "@playwright/test";
import { call, newUser, register } from "../support/api";
import { logoutUI } from "../support/ui";

test.describe("Sessão no navegador", () => {
  test("access token sumiu: renova sozinho, uma vez só, e continua na tela", async ({ page }) => {
    const u = newUser("refresh");
    await register(page.context().request, u);
    await page.goto("/inicio");
    await expect(page.getByTestId("app-shell")).toBeVisible();

    await page.context().clearCookies({ name: "access_token" });
    const refreshes: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/v1/auth/refresh") && r.method() === "POST") refreshes.push(r.url());
    });

    // tela com várias chamadas simultâneas à API
    await page.goto("/configuracoes/membros");
    await expect(page.getByTestId("members-table")).toBeVisible();
    await expect(page).toHaveURL(/\/configuracoes\/membros/);
    expect(refreshes.length, "várias requests expiradas devem gerar UM refresh").toBe(1);
    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names, "novo access token gravado").toContain("access_token");
  });

  test("sessão inválida volta para o login sem ficar em loop", async ({ page }) => {
    const u = newUser("deadsession");
    await register(page.context().request, u);
    await page.goto("/inicio");
    await expect(page.getByTestId("app-shell")).toBeVisible();

    await page.context().clearCookies({ name: "access_token" });
    await page.context().clearCookies({ name: "refresh_token" });
    let refreshes = 0;
    page.on("request", (r) => {
      if (r.url().includes("/v1/auth/refresh")) refreshes++;
    });
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/entrar/, { timeout: 15_000 });
    await page.waitForTimeout(2000);
    expect(refreshes, "tentativas de refresh (loop?)").toBeLessThanOrEqual(1);
  });

  test("sair limpa a sessão e o botão voltar não reabre a área logada", async ({ page }) => {
    const u = newUser("back");
    await register(page.context().request, u);
    // duas páginas da área logada no histórico: funciona se o app sair com push ou com replace
    await page.goto("/inicio");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    await page.goto("/configuracoes/membros");
    await expect(page.getByTestId("members-table")).toBeVisible();
    await logoutUI(page);
    expect((await call(page.context().request, "GET", "/v1/me")).status(), "API após sair").toBe(401);
    await page.goBack();
    await expect(page, "voltar após sair deve cair no login").toHaveURL(/\/entrar/, { timeout: 15_000 });
    await expect(page.getByTestId("members-table"), "dados da área logada não podem reaparecer").toHaveCount(0);
  });
});
