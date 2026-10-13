import { test, expect } from "@playwright/test";
import { createOrg, createProject, hasProjectsModule, me, switchOrg, uniq } from "../support/api";
import { currentOrg, signUp, switchOrgUI } from "../support/ui";

test.describe("Empresas: criar, trocar e isolar", () => {
  test("criar empresa pelo seletor: vira a ativa e aparece na lista", async ({ page }) => {
    const u = await signUp(page, "createorg");
    const name = `Nova ${uniq()}`;
    await page.getByTestId("org-switcher").click();
    await page.getByTestId("org-switcher-create").click();
    await page.getByTestId("create-org-name").fill(name);
    await page.getByTestId("create-org-submit").click();

    await expect(currentOrg(page), "seletor mostra a empresa nova").toContainText(name);
    const m = await me(page.context().request);
    expect(m.organization?.name, "empresa ativa na sessão").toBe(name);
    expect(m.organizations).toHaveLength(2);

    await page.getByTestId("org-switcher").click();
    await expect(page.getByTestId("org-switcher-item").filter({ hasText: u.organizationName })).toBeVisible();
    await expect(page.getByTestId("org-switcher-item").filter({ hasText: name })).toBeVisible();
  });

  test("trocar de empresa atualiza a tela e persiste ao recarregar", async ({ page }) => {
    const u = await signUp(page, "switch");
    const second = `Segunda ${uniq()}`;
    await createOrg(page.context().request, second); // vira a ativa
    await page.reload();
    await expect(currentOrg(page)).toContainText(second);

    await switchOrgUI(page, u.organizationName);
    expect((await me(page.context().request)).organization?.name).toBe(u.organizationName);
    await page.reload();
    await expect(currentOrg(page), "após recarregar").toContainText(u.organizationName);

    await switchOrgUI(page, second);
    expect((await me(page.context().request)).organization?.name).toBe(second);
  });

  test("dados de uma empresa não aparecem na outra (lista e link direto)", async ({ page }) => {
    test.skip(!(await hasProjectsModule(page.context().request)), "projeto sem o módulo de exemplo /v1/projects");
    const u = await signUp(page, "leak");
    const req = page.context().request;
    const orgA = (await me(req)).organization!;
    const project = await createProject(req, `Projeto da A ${uniq()}`);
    const orgB = `Empresa B ${uniq()}`;
    await createOrg(req, orgB);
    await switchOrg(req, orgA.id);

    await page.goto("/projetos");
    await expect(page.getByTestId("data-table-row").filter({ hasText: project.name })).toBeVisible();

    await switchOrgUI(page, orgB);
    await page.goto("/projetos");
    await expect(page.getByTestId("empty-state").or(page.getByTestId("data-table-row").first())).toBeVisible();
    await expect(page.getByTestId("data-table-row").filter({ hasText: project.name })).toHaveCount(0);

    await page.goto(`/projetos/${project.id}`);
    await expect(page.getByTestId("page-not-found"), "link direto para recurso da outra empresa").toBeVisible();
    await expect(page.getByTestId("app-shell")).toBeVisible();
    void u;
  });

  test("ao trocar, nada da empresa anterior aparece nem por um instante (cache)", async ({ page }) => {
    test.skip(!(await hasProjectsModule(page.context().request)), "projeto sem o módulo de exemplo /v1/projects");
    await signUp(page, "stale");
    const req = page.context().request;
    const orgA = (await me(req)).organization!;
    const project = await createProject(req, `Cache A ${uniq()}`);
    const orgB = `Cache B ${uniq()}`;
    await createOrg(req, orgB);
    await switchOrg(req, orgA.id);

    await page.goto("/projetos");
    await expect(page.getByTestId("data-table-row").filter({ hasText: project.name })).toBeVisible();

    await switchOrgUI(page, orgB);
    // A partir daqui, o nome do projeto da A não pode aparecer em lugar nenhum. O vigia é
    // reinstalado em cada documento (o app pode navegar no cliente ou recarregar a página)
    // e anota no sessionStorage, que sobrevive à navegação na mesma aba.
    const watch = (needle: string) => {
      const flag = () => {
        if (document.body && document.body.innerText.includes(needle)) sessionStorage.setItem("rodsaasLeak", "1");
      };
      const start = () => {
        new MutationObserver(flag).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        flag();
      };
      if (document.documentElement) start();
      else document.addEventListener("DOMContentLoaded", start);
    };
    await page.context().addInitScript(watch, project.name);
    await page.evaluate(watch, project.name);
    await page.locator('a[href="/projetos"]').first().click();
    await expect(page).toHaveURL(/\/projetos/);
    await page.waitForTimeout(3000);
    const leaked = await page.evaluate(() => sessionStorage.getItem("rodsaasLeak"));
    expect(leaked, "projeto da empresa anterior apareceu (cache não foi limpo na troca)").toBeNull();
  });

  test("renomear a empresa atualiza o seletor sem recarregar", async ({ page }) => {
    await signUp(page, "rename", "/configuracoes/empresa");
    const newName = `Renomeada ${uniq()}`;
    await page.getByTestId("org-settings-name").fill(newName);
    await page.getByTestId("org-settings-save").click();
    await expect(currentOrg(page)).toContainText(newName);
    expect((await me(page.context().request)).organization?.name).toBe(newName);
  });
});
