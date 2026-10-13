import { test, expect } from "@playwright/test";
import { hasProjectsModule } from "../support/api";
import { expectNoHorizontalScroll, setTheme, signUp } from "../support/ui";

test.describe("Celular", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("menu lateral vira gaveta", async ({ page }) => {
    await signUp(page, "mobile");
    await expect(page.getByTestId("sidebar"), "menu escondido no celular").toBeHidden();
    await page.getByTestId("sidebar-toggle").click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.getByTestId("org-switcher")).toBeVisible();
  });

  test("telas principais sem rolagem horizontal", async ({ page }) => {
    await signUp(page, "noscroll");
    const paths = ["/inicio", "/configuracoes/membros", "/configuracoes/plano", "/configuracoes/empresa", "/perfil"];
    if (await hasProjectsModule(page.context().request)) paths.push("/projetos");
    for (const p of paths) {
      await page.goto(p);
      await expect(page.getByTestId("app-shell")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page, p);
    }
    for (const p of ["/entrar", "/cadastro"]) {
      await page.context().clearCookies();
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page, p);
    }
  });
});

test.describe("Tema", () => {
  test("alternar entre claro e escuro", async ({ page }) => {
    await signUp(page, "theme");
    const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
    await setTheme(page, "dark");
    await expect.poll(isDark, { message: "tema escuro aplicado (classe dark no html)" }).toBe(true);
    await setTheme(page, "light");
    await expect.poll(isDark, { message: "tema claro aplicado" }).toBe(false);
  });
});
