import { test, expect } from "@playwright/test";
import { call, createProject, hasProjectsModule, items, me, ok, uniq } from "../support/api";
import { signUp } from "../support/ui";

test.describe("Módulo de exemplo (projetos)", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await hasProjectsModule(request)), "projeto sem o módulo de exemplo /v1/projects (ex.: removido pelo preset notion)");
  });

  test("lista vazia mostra estado vazio com ação", async ({ page }) => {
    await signUp(page, "empty", "/projetos");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("empty-state-action")).toBeVisible();
  });

  test("criar (com erro no campo), editar e excluir", async ({ page }) => {
    await signUp(page, "crud", "/projetos");
    await page.getByTestId("page-header-action").click();
    await expect(page.getByTestId("form-sheet")).toBeVisible();
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("field-error-name"), "erro de validação no campo").toBeVisible();

    const name = `Projeto ${uniq()}`;
    await page.getByTestId("field-name").fill(name);
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("form-sheet")).toBeHidden();
    const row = page.getByTestId("data-table-row").filter({ hasText: name });
    await expect(row).toBeVisible();

    await row.getByTestId("row-actions").click();
    await page.getByTestId("row-action-edit").click();
    await expect(page.getByTestId("form-sheet")).toBeVisible();
    const edited = `${name} editado`;
    await page.getByTestId("field-name").fill(edited);
    await page.getByTestId("form-submit").click();
    const editedRow = page.getByTestId("data-table-row").filter({ hasText: edited });
    await expect(editedRow).toBeVisible();

    await editedRow.getByTestId("row-actions").click();
    await page.getByTestId("row-action-delete").click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("data-table-row").filter({ hasText: edited })).toHaveCount(0);
  });

  test("clique duplo não cria duas vezes e o botão fica carregando", async ({ page }) => {
    await signUp(page, "double", "/projetos");
    await page.getByTestId("page-header-action").click();
    const name = `Duplo ${uniq()}`;
    await page.getByTestId("field-name").fill(name);

    let posts = 0;
    await page.route(/\/v1\/projects(\?.*)?$/, async (route) => {
      if (route.request().method() === "POST") {
        posts++;
        await new Promise((r) => setTimeout(r, 1500));
      }
      await route.continue();
    });
    const submit = page.getByTestId("form-submit");
    await submit.click();
    await expect(submit, "botão desabilitado durante o envio").toBeDisabled();
    await submit.click({ force: true, timeout: 2000 }).catch(() => {});
    await submit.dblclick({ force: true, timeout: 2000 }).catch(() => {});
    await expect(page.getByTestId("form-sheet")).toBeHidden({ timeout: 15_000 });
    expect(posts, "requests de criação enviadas").toBe(1);

    const list = items(await ok(await call(page.context().request, "GET", `/v1/projects?q=${encodeURIComponent(name)}`), "lista"));
    expect(list.filter((p: any) => p.name === name), "registros criados").toHaveLength(1);
  });

  test("busca filtra e fica na URL", async ({ page }) => {
    await signUp(page, "search");
    const req = page.context().request;
    const tag = uniq();
    await createProject(req, `Alfa ${tag}`);
    await createProject(req, `Beta ${tag}`);
    await page.goto("/projetos");
    await page.getByTestId("search-input").fill(`Alfa ${tag}`);
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(page.getByTestId("data-table-row").filter({ hasText: `Alfa ${tag}` })).toBeVisible();
    await expect(page.getByTestId("data-table-row").filter({ hasText: `Beta ${tag}` })).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("data-table-row").filter({ hasText: `Beta ${tag}` }), "filtro sobrevive ao recarregar").toHaveCount(0);
  });

  test("limite do plano abre o diálogo de upgrade", async ({ page }) => {
    await signUp(page, "limit");
    const req = page.context().request;
    const limit = (await me(req)).plan?.limits?.projects;
    test.skip(limit === null || limit === undefined, "plano atual sem limite de projetos");
    test.skip((limit as number) > 30, `limite alto demais para testar (${limit})`);
    for (let i = 0; i < (limit as number); i++) await createProject(req, `Limite ${i} ${uniq()}`);

    await page.goto("/projetos");
    await page.getByTestId("page-header-action").click();
    const sheet = page.getByTestId("form-sheet");
    if (await sheet.isVisible().catch(() => false)) {
      await page.getByTestId("field-name").fill(`Acima do limite ${uniq()}`);
      await page.getByTestId("form-submit").click();
    }
    await expect(page.getByTestId("upgrade-dialog")).toBeVisible();
  });
});
