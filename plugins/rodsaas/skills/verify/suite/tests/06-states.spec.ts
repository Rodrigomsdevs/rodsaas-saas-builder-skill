import { test, expect } from "@playwright/test";
import { signUp } from "../support/ui";

const MEMBERS = /\/v1\/members(\?.*)?$/;

test.describe("Estados de tela", () => {
  test("rota inexistente dentro do app mostra 404 mantendo a casca", async ({ page }) => {
    await signUp(page, "notfound");
    await page.goto("/rota-que-nao-existe-rodsaas");
    await expect(page.getByTestId("page-not-found")).toBeVisible();
  });

  test("erro da API mostra estado de erro com código e tentar de novo", async ({ page }) => {
    await signUp(page, "apierror");
    let fail = true;
    await page.route(MEMBERS, async (route) => {
      if (fail && route.request().method() === "GET") {
        return route.fulfill({
          status: 500,
          contentType: "application/problem+json",
          body: JSON.stringify({ type: "about:blank", title: "Erro interno", status: 500, code: "INTERNAL_ERROR", requestId: "req-teste-rodsaas" }),
        });
      }
      return route.continue();
    });
    await page.goto("/configuracoes/membros");
    await expect(page.getByTestId("error-state")).toBeVisible();
    await expect(page.getByTestId("error-request-id"), "código do erro para o suporte").toContainText("req-teste-rodsaas");
    await expect(page.getByTestId("app-shell"), "o resto da tela continua de pé").toBeVisible();

    fail = false;
    await page.getByTestId("error-retry").click();
    await expect(page.getByTestId("members-table")).toBeVisible();
    await expect(page.getByTestId("error-state")).toHaveCount(0);
  });

  test("API lenta mostra skeleton e depois o conteúdo", async ({ page }) => {
    await signUp(page, "slow");
    await page.route(MEMBERS, async (route) => {
      if (route.request().method() === "GET") await new Promise((r) => setTimeout(r, 2500));
      return route.continue();
    });
    await page.goto("/configuracoes/membros");
    await expect(page.getByTestId("skeleton").first(), "skeleton enquanto carrega").toBeVisible();
    await expect(page.getByTestId("members-table")).toBeVisible({ timeout: 15_000 });
  });

  test("API inacessível mostra erro amigável (sem tela branca nem stack)", async ({ page }) => {
    await signUp(page, "offline");
    await page.route(MEMBERS, (route) => route.abort("connectionrefused"));
    await page.goto("/configuracoes/membros");
    const err = page.getByTestId("error-state");
    await expect(err).toBeVisible();
    await expect(err).not.toContainText(/TypeError|Failed to fetch|at \w+ \(/);
  });
});
