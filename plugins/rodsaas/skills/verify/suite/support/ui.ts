import { expect, type Browser, type BrowserContext, type Locator, type Page, type APIRequestContext } from "@playwright/test";
import { cfg } from "./config.mjs";
import { call, login, newUser, ok, register, sleep, type TestUser } from "./api";
import { linkFrom, waitForEmail } from "./mailpit";

/** Entra pela API (mesmos cookies do navegador) e abre a página. */
export async function signIn(page: Page, u: TestUser, path = "/inicio") {
  await login(page.context().request, u);
  await page.goto(path);
  await expect(page.getByTestId("app-shell")).toBeVisible();
}

/** Cria a conta pela API e abre a página já logado. */
export async function signUp(page: Page, tag: string, path = "/inicio") {
  const u = newUser(tag);
  await register(page.context().request, u);
  await page.goto(path);
  await expect(page.getByTestId("app-shell")).toBeVisible();
  return u;
}

/**
 * Clica num botão de envio e, se a resposta da rota for 429 (rate limit),
 * espera o tempo pedido e tenta de novo.
 */
export async function submitWithRateLimitRetry(page: Page, button: Locator, urlPart: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(urlPart) && r.request().method() !== "OPTIONS"),
      button.click(),
    ]);
    if (res.status() !== 429) return res;
    const wait = Number(res.headers()["retry-after"] ?? "20");
    await sleep(Math.min(Math.max(Number.isFinite(wait) ? wait : 20, 1), 65) * 1000);
  }
  throw new Error(`rate limit persistente em ${urlPart}`);
}

export async function fillLogin(page: Page, u: Pick<TestUser, "email" | "password">) {
  await page.getByTestId("login-email").fill(u.email);
  await page.getByTestId("login-password").fill(u.password);
  return submitWithRateLimitRetry(page, page.getByTestId("login-submit"), "/v1/auth/login");
}

export const currentOrg = (page: Page) => page.getByTestId("org-switcher-current");

export async function switchOrgUI(page: Page, name: string) {
  await page.getByTestId("org-switcher").click();
  await page.getByTestId("org-switcher-item").filter({ hasText: name }).first().click();
  await expect(currentOrg(page)).toContainText(name);
}

export async function logoutUI(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByTestId("user-menu-logout").click();
  await expect(page).toHaveURL(/\/entrar/);
}

/** Escolhe o tema pelo botão (direto ou por menu com opções). */
export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.getByTestId("theme-toggle").click();
  const option = page.getByTestId(`theme-option-${theme}`);
  if (await option.isVisible().catch(() => false)) await option.click();
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: cfg.webURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
}

/** Owner com uma empresa + membro convidado (aceito via cadastro com convite). */
export async function ownerWithMember(browser: Browser, mailReq: APIRequestContext) {
  const ownerCtx = await newContext(browser);
  const owner = newUser("owner");
  await register(ownerCtx.request, owner);
  const member = newUser("member");
  await ok(await call(ownerCtx.request, "POST", "/v1/invitations", { email: member.email, role: "MEMBER" }), "convite");
  const mail = await waitForEmail(mailReq, member.email, { contains: "/convite" });
  const token = new URL(linkFrom(mail, "/convite")).searchParams.get("token");
  expect(token, "token no link do convite").toBeTruthy();
  const memberCtx = await newContext(browser);
  await register(memberCtx.request, member, { invitationToken: token });
  return { owner, ownerCtx, member, memberCtx };
}

/** Nenhuma rolagem horizontal na página atual. */
export async function expectNoHorizontalScroll(page: Page, label: string) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll, `${label}: largura do conteúdo (${scroll}px) maior que a tela (${width}px)`).toBeLessThanOrEqual(width + 1);
}
