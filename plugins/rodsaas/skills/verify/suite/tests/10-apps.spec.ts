import { test, expect, type Locator, type Page } from "@playwright/test";
import { call, me, ok } from "../support/api";
import { cfg } from "../support/config.mjs";
import { signUp } from "../support/ui";

// Casca de apps (skills/frontend/references/12-casca-e-apps.md): trilho, menu do app, "Todos os apps",
// fixados, apps desligados e celular. A lista de apps vem de rodsaas.json → apps.

type AppInfo = { id: string; name: string; home: string };
const apps = (cfg.apps ?? null) as AppInfo[] | null;
const multi = (apps?.length ?? 0) >= 2;

const railItem = (page: Page, id: string) => page.locator(`[data-testid="app-rail-item"][data-app="${id}"]`);
const launcherItem = (page: Page, id: string) => page.locator(`[data-testid="app-launcher-item"][data-app="${id}"]`);
const sidebarOf = (page: Page, id: string) => page.locator(`[data-testid="sidebar"][data-app="${id}"]`);
const pathOf = (home: string) => new URL(home, "http://x").pathname;

async function openLauncher(page: Page) {
  await page.getByTestId("app-launcher-open").first().click();
  await expect(page.getByTestId("app-launcher"), "grade \"Todos os apps\"").toBeVisible();
}

/** Abre o app pelo trilho (se estiver fixado) ou pela grade. */
async function openApp(page: Page, app: AppInfo) {
  const item = railItem(page, app.id);
  if (await item.isVisible().catch(() => false)) await item.click();
  else {
    await openLauncher(page);
    await launcherItem(page, app.id).click();
  }
  await expect(page, `URL do app ${app.id}`).toHaveURL(new RegExp(`^[^?#]*${pathOf(app.home).split("/").slice(0, 2).join("/")}`));
}

async function pinState(pin: Locator) {
  return (await pin.getAttribute("aria-pressed")) === "true";
}

test.describe("Casca de apps", () => {
  test.beforeEach(() => {
    test.skip(!apps, "rodsaas.json sem \"apps\": projeto anterior ao modelo de apps (rode /rodsaas:apps)");
  });

  test("modo certo: menu clássico com 1 app, trilho com 2 ou mais", async ({ page }) => {
    await signUp(page, "apps");
    if (!multi) {
      await expect(page.getByTestId("app-rail"), "com um app só não existe trilho").toHaveCount(0);
      await expect(page.getByTestId("sidebar"), "menu clássico visível").toBeVisible();
      await expect(page.getByTestId("org-switcher")).toBeVisible();
      return;
    }
    await expect(page.getByTestId("app-rail"), `trilho com ${apps!.length} apps`).toBeVisible();
    await expect(railItem(page, "inicio"), "Início no trilho").toBeVisible();
    await expect(railItem(page, "inicio")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("app-launcher-open"), "botão Todos os apps").toBeVisible();
    await expect(page.getByTestId("org-switcher")).toHaveCount(1);
    await expect(page.getByTestId("sidebar"), "um menu só por vez").toHaveCount(1);
  });

  test("cada app abre o próprio menu, fica ativo no trilho e sobrevive ao recarregar", async ({ page }) => {
    test.skip(!multi, "projeto com um app só");
    await signUp(page, "appsnav");
    for (const app of apps!) {
      await openApp(page, app);
      await expect(sidebarOf(page, app.id), `menu do app ${app.id}`).toBeVisible();
      await expect(page.getByTestId("sidebar"), "só o menu do app atual").toHaveCount(1);
      await expect(railItem(page, app.id), `app ${app.id} marcado como ativo no trilho`).toHaveAttribute("aria-current", "page");
      await page.reload();
      await expect(sidebarOf(page, app.id), `menu do app ${app.id} depois de recarregar`).toBeVisible();
    }
  });

  test("recolher o menu, menu flutuante com o mouse por cima e escolha salva", async ({ page }) => {
    test.skip(!multi, "projeto com um app só");
    await signUp(page, "appsfold");
    await openApp(page, apps![0]);
    await page.getByTestId("sidebar-collapse").click();
    await expect(page.getByTestId("sidebar"), "menu recolhido").toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("app-rail")).toBeVisible();
    await expect(page.getByTestId("sidebar"), "continua recolhido depois de recarregar").toHaveCount(0);

    const other = page.locator('[data-testid="app-rail-item"]:not([data-app="inicio"])').first();
    const otherId = await other.getAttribute("data-app");
    await other.hover();
    const fly = page.locator(`[data-testid="app-flyout"][data-app="${otherId}"]`);
    await expect(fly, "menu flutuante do app sob o mouse").toBeVisible({ timeout: 3_000 });
    await page.mouse.move(900, 400);
    await expect(fly, "menu flutuante fecha ao sair").toHaveCount(0, { timeout: 3_000 });

    await page.getByTestId("app-rail").getByTestId("sidebar-expand").click();
    await expect(page.getByTestId("sidebar"), "menu aberto de novo").toBeVisible();
  });

  test("Todos os apps: lista, busca e fixar no trilho (salvo no servidor)", async ({ page }) => {
    test.skip(!multi, "projeto com um app só");
    await signUp(page, "appspin");
    const req = page.context().request;
    await openLauncher(page);
    await expect(page.getByTestId("app-launcher-item"), "todos os apps na grade").toHaveCount(apps!.length);

    const target = apps![apps!.length - 1];
    await page.getByTestId("app-launcher-search").fill(target.name);
    await expect(launcherItem(page, target.id), "busca encontra o app").toBeVisible();
    const others = apps!.filter((a) => !a.name.toLowerCase().includes(target.name.toLowerCase()));
    for (const o of others) await expect(launcherItem(page, o.id), `busca esconde ${o.id}`).toHaveCount(0);
    await page.getByTestId("app-launcher-search").fill("");

    const pin = launcherItem(page, target.id).getByTestId("app-pin");
    const before = await pinState(pin);
    await pin.click();
    await expect.poll(() => pinState(pin), { message: "estrela muda de estado" }).toBe(!before);
    await expect
      .poll(async () => ((await me(req)) as any).preferences?.pinnedApps?.includes(target.id) ?? null, { message: "fixados gravados no servidor" })
      .toBe(!before);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app-launcher"), "Esc fecha a grade").toHaveCount(0);
    await page.waitForLoadState("load");
    await page.goto("/inicio");
    if (!before) await expect(railItem(page, target.id), "app fixado aparece no trilho").toBeVisible();
    else await expect(railItem(page, target.id), "app desafixado sai do trilho").toHaveCount(0);

    await ok(await call(req, "PUT", "/v1/me/preferences", { pinnedApps: null }), "restaurar fixados padrão");
  });

  test("app desligado pela empresa some e a rota dele dá não encontrado", async ({ page }) => {
    test.skip(!multi, "projeto com um app só");
    await signUp(page, "appsoff");
    const req = page.context().request;
    const target = apps![apps!.length - 1];
    await openApp(page, target);
    const url = new URL(page.url()).pathname;

    await page.goto("/configuracoes/apps");
    const toggle = page.locator(`[data-testid="app-toggle"][data-app="${target.id}"]`);
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    const confirm = page.getByTestId("confirm-dialog-confirm");
    if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) await confirm.click();
    await expect(page.locator(`[data-testid="app-toggle"][data-app="${target.id}"]`), "interruptor desligado").toHaveAttribute("aria-checked", "false");
    await expect.poll(async () => ((await me(req)) as any).organization?.disabledApps ?? [], { message: "disabledApps no /v1/me" }).toContain(target.id);

    await page.goto("/inicio");
    await expect(railItem(page, target.id), "app desligado fora do trilho").toHaveCount(0);
    if (apps!.length === 2) {
      await expect(page.getByTestId("app-rail"), "sobrou um app: volta ao menu clássico").toHaveCount(0);
    } else {
      await openLauncher(page);
      await expect(launcherItem(page, target.id), "app desligado fora da grade").toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("app-launcher")).toHaveCount(0);
      await page.waitForLoadState("load");
    }
    await page.goto(url);
    await expect(page.getByTestId("page-not-found"), "rota de app desligado → não encontrado").toBeVisible();
    await expect(page.getByTestId("app-shell")).toBeVisible();

    await page.goto("/configuracoes/apps");
    await page.locator(`[data-testid="app-toggle"][data-app="${target.id}"]`).click();
    await expect(page.locator(`[data-testid="app-toggle"][data-app="${target.id}"]`), "ligado de novo").toHaveAttribute("aria-checked", "true");
  });

  test.describe("celular", () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test("barra de apps embaixo e gaveta com o menu do app atual", async ({ page }) => {
      test.skip(!multi, "projeto com um app só");
      await signUp(page, "appsmobile");
      await expect(page.getByTestId("app-rail"), "sem trilho no celular (nem escondido no DOM)").toHaveCount(0);
      await expect(page.getByTestId("app-tabbar"), "barra de apps").toBeVisible();
      await expect(page.locator('[data-testid="app-tabbar-item"][data-app="inicio"]')).toBeVisible();

      const tab = page.locator('[data-testid="app-tabbar-item"]:not([data-app="inicio"])').first();
      const id = await tab.getAttribute("data-app");
      await tab.click();
      const app = apps!.find((a) => a.id === id)!;
      await expect(page).toHaveURL(new RegExp(pathOf(app.home).split("/").slice(0, 2).join("/")));
      await page.getByTestId("sidebar-toggle").click();
      await expect(sidebarOf(page, id!), "gaveta com o menu do app atual").toBeVisible();
      await expect(page.getByTestId("org-switcher"), "um seletor de empresa só").toHaveCount(1);
    });
  });
});
