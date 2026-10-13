import { test, expect } from "@playwright/test";
import { cfg } from "../support/config.mjs";
import { call, me, newUser, register } from "../support/api";
import { linkFrom, pathOf, waitForEmail } from "../support/mailpit";
import { currentOrg, fillLogin, logoutUI, submitWithRateLimitRetry } from "../support/ui";

test.describe("Autenticação na interface", () => {
  test("cadastro leva ao início com a empresa criada", async ({ page }) => {
    const u = newUser("signup");
    await page.goto("/cadastro");
    await page.getByTestId("signup-name").fill(u.name);
    await page.getByTestId("signup-email").fill(u.email);
    await page.getByTestId("signup-password").fill(u.password);
    await page.getByTestId("signup-org-name").fill(u.organizationName);
    const res = await submitWithRateLimitRetry(page, page.getByTestId("signup-submit"), "/v1/auth/register");
    expect(res.status(), "resposta do cadastro").toBeLessThan(300);
    await expect(page).toHaveURL(/\/inicio/);
    await expect(currentOrg(page)).toContainText(u.organizationName);
  });

  test("sair, rota protegida pede login e volta para onde estava", async ({ page }) => {
    const u = newUser("next");
    await register(page.context().request, u);
    await page.goto("/inicio");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    await logoutUI(page);

    await page.goto("/configuracoes/membros");
    await expect(page).toHaveURL(/\/entrar\?.*next=/);
    const res = await fillLogin(page, u);
    expect(res.status()).toBeLessThan(300);
    await expect(page).toHaveURL(/\/configuracoes\/membros/);
    await expect(page.getByTestId("members-table")).toBeVisible();
  });

  test("senha errada mostra erro e não entra", async ({ page }) => {
    const u = newUser("wrongpw");
    await register(page.context().request, u);
    await page.context().clearCookies();
    await page.goto("/entrar");
    const res = await fillLogin(page, { email: u.email, password: "senha-totalmente-errada" });
    expect(res.status()).toBe(401);
    await expect(page.getByTestId("login-error")).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("next apontando para outro site é ignorado (sem open redirect)", async ({ page }) => {
    const u = newUser("openredirect");
    await register(page.context().request, u);
    await page.context().clearCookies();
    await page.goto(`/entrar?next=${encodeURIComponent("https://site-malicioso.example/roubo")}`);
    await fillLogin(page, u);
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).host, "continuou no painel").toBe(new URL(cfg.webURL).host);
  });

  test("esqueci a senha: resposta genérica, e-mail e redefinição", async ({ page, request }) => {
    test.slow();
    const u = newUser("reset");
    await register(request, u);

    await page.goto("/esqueci-senha");
    await page.getByTestId("forgot-email").fill("ninguem.cadastrado.rodsaas@example.com");
    await page.getByTestId("forgot-submit").click();
    await expect(page.getByTestId("forgot-success"), "mesma tela para e-mail inexistente").toBeVisible();

    await page.goto("/esqueci-senha");
    await page.getByTestId("forgot-email").fill(u.email);
    await page.getByTestId("forgot-submit").click();
    await expect(page.getByTestId("forgot-success")).toBeVisible();

    const mail = await waitForEmail(request, u.email, { contains: "/redefinir-senha" });
    await page.goto(pathOf(linkFrom(mail, "/redefinir-senha")));
    const newPassword = `${u.password}-nova`;
    await page.getByTestId("reset-password").fill(newPassword);
    const confirm = page.getByTestId("reset-password-confirm");
    if (await confirm.count()) await confirm.fill(newPassword);
    await page.getByTestId("reset-submit").click();
    await expect(page.getByTestId("reset-success").or(page.getByTestId("login-email"))).toBeVisible();

    expect((await call(request, "POST", "/v1/auth/login", { email: u.email, password: u.password })).status(), "senha antiga").toBe(401);
    expect((await call(request, "POST", "/v1/auth/login", { email: u.email, password: newPassword })).status(), "senha nova").toBeLessThan(300);
  });

  test("verificação de e-mail pelo link", async ({ page }) => {
    const u = newUser("verify");
    await register(page.context().request, u);
    const mail = await waitForEmail(page.context().request, u.email, { contains: "/verificar-email" });
    await page.goto(pathOf(linkFrom(mail, "/verificar-email")));
    await expect(page.getByTestId("verify-email-success")).toBeVisible();
    expect((await me(page.context().request)).user.emailVerified).toBe(true);
  });

  test("tokens não ficam acessíveis ao JavaScript da página", async ({ page }) => {
    const u = newUser("storage");
    await register(page.context().request, u);
    await page.goto("/inicio");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    const exposed = await page.evaluate(() => {
      const dump = (s: Storage) => Object.keys(s).map((k) => `${k}=${s.getItem(k)}`).join("\n");
      return { storage: `${dump(localStorage)}\n${dump(sessionStorage)}`, cookie: document.cookie };
    });
    expect(exposed.storage, "JWT guardado em localStorage/sessionStorage").not.toMatch(/eyJ[\w-]+\.[\w-]+\./);
    expect(exposed.cookie).not.toContain("access_token");
    expect(exposed.cookie).not.toContain("refresh_token");
  });
});
