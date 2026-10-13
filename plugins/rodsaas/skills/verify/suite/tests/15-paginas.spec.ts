import { test, expect, type APIRequestContext, type APIResponse, type Locator, type Page } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, signUp } from "../support/ui";

// Parte do Páginas (preset /rodsaas:notion). Roda quando rodsaas.json tem "notion" em presets ou a API tem /v1/pages/tree.

async function pagesInstalled(req: APIRequestContext) {
  if (cfg.presets.includes("notion")) return true;
  return (await call(req, "GET", "/v1/pages/tree")).status() !== 404;
}

async function expectCode(res: APIResponse, status: number, code: string, label: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  const json = JSON.parse(body || "{}");
  expect(json.code, `${label}: code`).toBe(code);
  return json;
}

/** Garante a feature no plano da empresa (no modo de teste da cobrança assina o plano que tem); senão pula o teste. */
async function ensureFeature(req: APIRequestContext, feature: string) {
  const plan: any = (await me(req)).plan;
  if (plan?.features?.includes(feature)) return;
  const mode = await billingMode(req);
  test.skip(mode !== "fake", `"${feature}" exige plano pago e a cobrança está em modo "${mode}"`);
  const target = (await plansFromApi(req)).paid.find((p) => p.features?.includes(feature));
  test.skip(!target, `nenhum plano com a feature ${feature}`);
  await ok(await call(req, "POST", "/v1/billing/checkout-sessions", { plan: target!.id, interval: "month" }), `assinar plano com ${feature} (modo de teste)`);
}

/** Bloco de parágrafo no formato de blocos (BlockNote; o servidor extrai qualquer campo `text`). */
const para = (text: string, extra: any[] = []) => ({ id: uniq(), type: "paragraph", props: {}, content: [{ type: "text", text, styles: {} }, ...extra], children: [] });
const tree = async (req: APIRequestContext) => items<any>(await ok(await call(req, "GET", "/v1/pages/tree"), "árvore"));
const getPage = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/pages/${id}`), "página");
const newPage = async (req: APIRequestContext, body: Record<string, unknown> = {}) => ok<any>(await call(req, "POST", "/v1/pages", { title: `Página ${uniq()}`, ...body }), "criar página");
async function save(req: APIRequestContext, id: string, patch: Record<string, unknown>) {
  const p = await getPage(req, id);
  return ok<any>(await call(req, "PATCH", `/v1/pages/${id}`, { version: p.version, ...patch }), "salvar página");
}
const search = async (req: APIRequestContext, q: string) => items<any>(await ok(await call(req, "GET", `/v1/search?q=${encodeURIComponent(q)}`), `busca "${q}"`));

async function seedDatabase(req: APIRequestContext) {
  const db = (await tree(req)).find((x) => x.type === "DATABASE" && x.title === "Tarefas");
  expect(db, "workspace nasce com o database 'Tarefas'").toBeTruthy();
  const d = await ok<any>(await call(req, "GET", `/v1/databases/${db.id}`), "database Tarefas");
  const status = d.properties.find((p: any) => p.type === "SELECT" && p.name === "Status");
  expect(status, "propriedade Status (seleção)").toBeTruthy();
  return { id: db.id as string, db: d, status };
}

/** Arrasta com o mouse (funciona com dnd-kit e com arrastar nativo). */
async function dragTo(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const a = (await source.boundingBox())!, b = (await target.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 80), { steps: 20 });
  await page.mouse.up();
}

test.describe("Páginas", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await pagesInstalled(request)), "projeto sem o preset notion");
  });

  // ------------------------------------------------------------------ API
  test("API: workspace novo com 'Comece aqui' e o database de exemplo com quadro", async ({ request }) => {
    await register(request, newUser("pages"));
    const t = await tree(request);
    expect(t.some((x) => x.title === "Comece aqui" && x.type === "DOCUMENT"), "página 'Comece aqui'").toBe(true);
    const { id, db, status } = await seedDatabase(request);
    expect(status.options.map((o: any) => o.name), "opções do Status").toEqual(["A fazer", "Fazendo", "Feito"]);
    expect(db.views.map((v: any) => v.type).sort(), "visões Quadro e Tabela").toEqual(["BOARD", "TABLE"]);
    expect(items(await ok(await call(request, "GET", `/v1/databases/${id}/rows`), "linhas")), "três linhas de exemplo").toHaveLength(3);
    expect(t.some((x) => x.parentId === id), "linhas do database não aparecem na árvore").toBe(false);
  });

  test("API: árvore — sub-página, mover sem criar ciclo e reordenar", async ({ request }) => {
    await register(request, newUser("pagestree"));
    const a = await newPage(request);
    const b = await newPage(request, { parentId: a.id });
    const c = await newPage(request, { parentId: b.id });
    expect((await getPage(request, c.id)).breadcrumbs.map((x: any) => x.id), "breadcrumbs com os ancestrais").toEqual([a.id, b.id]);
    await expectCode(await call(request, "POST", `/v1/pages/${a.id}/move`, { parentId: c.id }), 400, "INVALID_MOVE", "mover para dentro de um descendente");
    await expectCode(await call(request, "POST", `/v1/pages/${a.id}/move`, { parentId: a.id }), 400, "INVALID_MOVE", "mover para dentro de si mesma");
    await ok(await call(request, "POST", `/v1/pages/${c.id}/move`, { parentId: null, beforeId: a.id }), "mover para a raiz, antes de A");
    const roots = (await tree(request)).filter((x) => x.parentId === null).sort((x, y) => (x.position < y.position ? -1 : x.position > y.position ? 1 : 0)).map((x) => x.id);
    expect(roots.indexOf(c.id), "C na raiz").toBeGreaterThanOrEqual(0);
    expect(roots.indexOf(c.id), "C antes de A").toBeLessThan(roots.indexOf(a.id));
    expect((await tree(request)).find((x) => x.id === a.id)?.hasChildren, "A continua com filhos").toBe(true);
  });

  test("API: autosave com versão — salvar com a versão velha recebe 409 e não sobrescreve", async ({ request }) => {
    await register(request, newUser("pagesver"));
    const p = await newPage(request);
    const v = (await getPage(request, p.id)).version;
    await ok(await call(request, "PATCH", `/v1/pages/${p.id}`, { version: v, title: "Versão A", content: [para("texto A")] }), "primeiro save");
    const conflict = await expectCode(await call(request, "PATCH", `/v1/pages/${p.id}`, { version: v, title: "Versão B", content: [para("texto B")] }), 409, "VERSION_CONFLICT", "save com versão velha");
    expect(conflict.currentVersion, "conflito informa a versão atual").toBe(v + 1);
    const now = await getPage(request, p.id);
    expect(now.title, "nada sobrescrito em silêncio").toBe("Versão A");
    expect(JSON.stringify(now.content)).toContain("texto A");
  });

  test("API: busca em português e lixeira — excluir o pai leva os filhos e restaurar volta o lote", async ({ request }) => {
    await register(request, newUser("pagestrash"));
    const word = `zeta${uniq().replace(/[^a-z]/g, "")}`;
    const parent = await newPage(request, { title: `Pai ${uniq()}` });
    const child = await newPage(request, { parentId: parent.id, title: `Filha ${uniq()}` });
    await save(request, child.id, { content: [para(`Os relatórios de ${word} ficam aqui`)] });
    expect((await search(request, `relatório ${word}`)).map((x) => x.id), "busca acha pelo conteúdo, com variação (relatório → relatórios)").toContain(child.id);

    await ok(await call(request, "DELETE", `/v1/pages/${parent.id}`), "excluir o pai");
    const t = await tree(request);
    expect(t.map((x) => x.id), "pai e filha somem da árvore").not.toContain(parent.id);
    expect(t.map((x) => x.id)).not.toContain(child.id);
    expect((await search(request, word)).map((x) => x.id), "lixeira some da busca").not.toContain(child.id);
    expect(items<any>(await ok(await call(request, "GET", "/v1/trash"), "lixeira")).map((x) => x.id), "pai na lixeira").toContain(parent.id);

    await ok(await call(request, "POST", `/v1/trash/${parent.id}/restore`), "restaurar");
    const back = (await tree(request)).map((x) => x.id);
    expect(back, "restaurar volta o pai").toContain(parent.id);
    expect(back, "e a filha junto").toContain(child.id);
  });

  test("API: database — valor validado por tipo e filtro da visão aplicado no servidor", async ({ request }) => {
    await register(request, newUser("pagesdb"));
    const db = await newPage(request, { type: "DATABASE", title: `Clientes ${uniq()}` });
    const st = await ok<any>(await call(request, "POST", `/v1/databases/${db.id}/properties`, { name: "Fase", type: "SELECT", options: [{ name: "Lead" }, { name: "Cliente" }] }), "propriedade de seleção");
    const num = await ok<any>(await call(request, "POST", `/v1/databases/${db.id}/properties`, { name: "Valor", type: "NUMBER" }), "propriedade número");
    const person = await ok<any>(await call(request, "POST", `/v1/databases/${db.id}/properties`, { name: "Dono", type: "PERSON" }), "propriedade pessoa");
    const [lead, cliente] = st.options;
    const row = (title: string, properties: Record<string, unknown>) => call(request, "POST", `/v1/databases/${db.id}/rows`, { title, properties });

    await ok(await row("Acme", { [st.id]: lead.id, [num.id]: 1500 }), "linha válida");
    await ok(await row("Beta", { [st.id]: cliente.id, [num.id]: 900, [person.id]: [(await me(request)).user.id] }), "linha com pessoa do workspace");
    const badOpt = await expectCode(await row("X", { [st.id]: "opcao-que-nao-existe" }), 400, "VALIDATION_ERROR", "opção inexistente");
    expect((badOpt.errors ?? []).map((e: any) => e.path)).toContain(`properties.${st.id}`);
    await expectCode(await row("Y", { [num.id]: "abc" }), 400, "VALIDATION_ERROR", "número inválido");
    await expectCode(await row("Z", { [person.id]: ["00000000-0000-7000-8000-000000000000"] }), 400, "VALIDATION_ERROR", "pessoa que não é do workspace");

    const view = await ok<any>(await call(request, "POST", `/v1/databases/${db.id}/views`, { name: "Só clientes", type: "TABLE", config: { filters: [{ propertyId: st.id, op: "is", value: cliente.id }], sorts: [] } }), "visão filtrada");
    const rows = items<any>(await ok(await call(request, "GET", `/v1/databases/${db.id}/rows?viewId=${view.id}`), "linhas da visão"));
    expect(rows.map((r) => r.title), "filtro no servidor").toEqual(["Beta"]);
    expect(rows[0].properties?.[num.id]).toBe(900);
    expect((await tree(request)).some((x) => x.parentId === db.id), "linhas não entram na árvore").toBe(false);
  });

  test("API: link público — sem a feature é 403; liga, abre sem login só com o conteúdo e desliga na hora", async ({ request, playwright }) => {
    const owner = newUser("pagespub");
    await register(request, owner);
    const p = await newPage(request, { title: `Pública ${uniq()}` });
    await save(request, p.id, { content: [para("conteúdo público")] });
    const plan: any = (await me(request)).plan;
    if (!plan?.features?.includes("public_pages")) await expectCode(await call(request, "PUT", `/v1/pages/${p.id}/share`), 403, "FEATURE_NOT_IN_PLAN", "publicar sem a feature");
    await ensureFeature(request, "public_pages");
    const share = await ok<any>(await call(request, "PUT", `/v1/pages/${p.id}/share`), "publicar");
    expect(share.enabled).toBe(true);
    expect(String(share.url), "link /publico/<token>").toContain("/publico/");
    const token = new URL(share.url, cfg.webURL).pathname.split("/").pop();

    const anon = await playwright.request.newContext();
    const res = await anon.fetch(`${cfg.apiURL}/v1/public/pages/${token}`, { failOnStatusCode: false });
    const text = await res.text();
    expect(res.status(), `página pública sem login → ${text.slice(0, 200)}`).toBe(200);
    const body = JSON.parse(text);
    expect(body.title).toBe(p.title);
    expect(JSON.stringify(body.content)).toContain("conteúdo público");
    expect(Object.keys(body), "só os campos públicos").not.toEqual(expect.arrayContaining(["organizationId"]));
    expect(text, "não expõe dados da equipe").not.toContain(owner.email);

    await ok(await call(request, "DELETE", `/v1/pages/${p.id}/share`), "despublicar");
    expect((await anon.fetch(`${cfg.apiURL}/v1/public/pages/${token}`, { failOnStatusCode: false })).status(), "link antigo para na hora").toBe(404);
    await anon.dispose();
  });

  test("API: links perigosos saem do conteúdo salvo e outra empresa não vê nada (404)", async ({ request, browser }) => {
    await register(request, newUser("pagessafe"));
    const p = await newPage(request);
    await save(request, p.id, { content: [para("veja ", [{ type: "link", href: "javascript:alert(1)", content: [{ type: "text", text: "aqui", styles: {} }] }])] });
    expect(JSON.stringify((await getPage(request, p.id)).content), "javascript: removido").not.toContain("javascript:");

    const other = await newContext(browser);
    await register(other.request, newUser("pagesother"));
    expect((await call(other.request, "GET", `/v1/pages/${p.id}`)).status(), "página de outra empresa").toBe(404);
    expect((await call(other.request, "PATCH", `/v1/pages/${p.id}`, { version: 1, title: "x" })).status(), "editar página de outra empresa").toBe(404);
    expect((await call(other.request, "POST", `/v1/pages/${p.id}/move`, { parentId: null })).status(), "mover página de outra empresa").toBe(404);
    expect((await tree(other.request)).map((x) => x.id), "fora da árvore da outra empresa").not.toContain(p.id);
    await other.close();
  });

  // ------------------------------------------------------------------ telas
  test("página: criar pelo app, digitar no editor de blocos e o autosave grava", async ({ page }) => {
    await signUp(page, "pagesui", "/paginas");
    const req = page.context().request;
    await expect(page.getByTestId("pages-home")).toBeVisible();
    await page.getByTestId("pages-new").click();
    await expect(page, "abre a página nova").toHaveURL(/\/paginas\/[^/?#]+/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    const title = `Ata da reunião ${uniq()}`, text = `Decidimos lançar em março ${uniq()}`;
    await page.getByTestId("page-title").fill(title);
    const editor = page.getByTestId("page-editor");
    await editor.locator('[contenteditable="true"]').first().click();
    await page.keyboard.type(text);
    await expect.poll(async () => { const p = await getPage(req, id); return p.title === title && JSON.stringify(p.content).includes(text); }, { message: "título e texto salvos sozinhos (autosave)", timeout: 20_000 }).toBe(true);
    await expect(page.getByTestId("page-save-status")).toContainText(/salvo/i);
    await expect(page.locator(`[data-testid="pages-tree-item"][data-page-id="${id}"]`), "página na árvore com o título").toContainText(title);
    await page.reload();
    await expect(page.getByTestId("page-editor"), "texto continua depois de recarregar").toContainText(text);
  });

  test("árvore: + cria sub-página dentro da página", async ({ page }) => {
    await signUp(page, "pagessub");
    const req = page.context().request;
    const parent = await newPage(req, { title: `Projeto ${uniq()}` });
    await page.goto(`/paginas/${parent.id}`);
    const item = page.locator(`[data-testid="pages-tree-item"][data-page-id="${parent.id}"]`);
    await item.hover();
    await item.getByTestId("pages-tree-add").click();
    await expect(page, "abre a sub-página").not.toHaveURL(new RegExp(`/paginas/${parent.id}$`));
    await expect.poll(async () => (await tree(req)).filter((x) => x.parentId === parent.id).length, { message: "sub-página criada dentro do pai" }).toBe(1);
    await expect(page.getByTestId("page-breadcrumbs"), "breadcrumbs com o pai").toContainText(parent.title);
  });

  test("conflito: duas abas editando — a desatualizada avisa em vez de sobrescrever", async ({ page }) => {
    await signUp(page, "pagesconf");
    const req = page.context().request;
    const p = await newPage(req, { title: "Original" });
    const other = await page.context().newPage();
    await page.goto(`/paginas/${p.id}`);
    await other.goto(`/paginas/${p.id}`);
    await expect(other.getByTestId("page-title")).toBeVisible();

    await page.getByTestId("page-title").fill("Versão da primeira aba");
    await expect.poll(async () => (await getPage(req, p.id)).title, { message: "primeira aba salvou", timeout: 15_000 }).toBe("Versão da primeira aba");
    await other.getByTestId("page-title").fill("Versão da segunda aba");
    await expect(other.getByTestId("page-conflict"), "segunda aba mostra o aviso de conflito").toBeVisible({ timeout: 15_000 });
    expect((await getPage(req, p.id)).title, "nada sobrescrito sem a pessoa escolher").toBe("Versão da primeira aba");
    await other.close();
  });

  test("lixeira: excluir pelo menu da página e restaurar pela lixeira", async ({ page }) => {
    await signUp(page, "pagestrashui");
    const req = page.context().request;
    const p = await newPage(req, { title: `Rascunho ${uniq()}` });
    await page.goto(`/paginas/${p.id}`);
    await page.getByTestId("page-menu").click();
    await page.getByTestId("page-delete").click();
    const confirm = page.getByTestId("confirm-dialog-confirm");
    if (await confirm.isVisible({ timeout: 1_500 }).catch(() => false)) await confirm.click();
    await expect.poll(async () => (await tree(req)).some((x) => x.id === p.id), { message: "foi para a lixeira" }).toBe(false);

    await page.getByTestId("pages-trash-open").click();
    const trash = page.getByTestId("pages-trash");
    await expect(trash).toBeVisible();
    await trash.getByTestId("pages-trash-item").filter({ hasText: p.title }).getByTestId("pages-trash-restore").click();
    await expect.poll(async () => (await tree(req)).some((x) => x.id === p.id), { message: "restaurada pela lixeira" }).toBe(true);
  });

  test("database: quadro com arrastar entre colunas muda o Status; tabela cria linha e abre o side peek", async ({ page }) => {
    await signUp(page, "pagesboard");
    const req = page.context().request;
    const { id, status } = await seedDatabase(req);
    const [todo, doing] = status.options;
    await page.goto(`/paginas/${id}`);
    await page.locator('[data-testid="db-view-tab"][data-view-type="BOARD"]').click();
    await expect(page.getByTestId("db-board")).toBeVisible();
    const colTodo = page.locator(`[data-testid="db-board-column"][data-option-id="${todo.id}"]`);
    const colDoing = page.locator(`[data-testid="db-board-column"][data-option-id="${doing.id}"]`);
    const card = colTodo.getByTestId("db-card").first();
    await expect(card, "linha de exemplo em 'A fazer'").toBeVisible();
    const rowId = (await card.getAttribute("data-page-id"))!;
    await dragTo(page, card, colDoing);
    await expect(colDoing.locator(`[data-testid="db-card"][data-page-id="${rowId}"]`), "card na coluna nova").toBeVisible();
    await expect.poll(async () => items<any>(await ok(await call(req, "GET", `/v1/databases/${id}/rows`), "linhas")).find((r) => r.id === rowId)?.properties?.[status.id], { message: "Status gravado ao arrastar" }).toBe(doing.id);

    await page.locator('[data-testid="db-view-tab"][data-view-type="TABLE"]').click();
    await expect(page.getByTestId("db-table")).toBeVisible();
    const before = await page.getByTestId("db-row").count();
    await page.getByTestId("db-new-row").click();
    await expect(page.getByTestId("db-row"), "linha nova na tabela").toHaveCount(before + 1);
    await expect.poll(async () => items(await ok(await call(req, "GET", `/v1/databases/${id}/rows`), "linhas")).length, { message: "linha gravada" }).toBe(before + 1);
    await page.getByTestId("db-row").first().click();
    await expect(page.getByTestId("db-peek"), "side peek da linha").toBeVisible();
  });

  test("compartilhar: publicar pela tela e abrir o link sem login", async ({ page, browser }) => {
    await signUp(page, "pagesshare");
    const req = page.context().request;
    await ensureFeature(req, "public_pages");
    const p = await newPage(req, { title: `Manual ${uniq()}` });
    await page.goto(`/paginas/${p.id}`);
    await page.getByTestId("page-share").click();
    await page.getByTestId("page-share-toggle").click();
    const link = page.getByTestId("page-share-link");
    await expect(link).toContainText("/publico/");
    const url = (await link.textContent())!.trim().match(/https?:\/\/\S+/)?.[0] ?? (await link.getAttribute("href"))!;
    const visitor = await newContext(browser);
    const vp = await visitor.newPage();
    await vp.goto(url);
    await expect(vp.getByTestId("public-page")).toContainText(p.title);
    await visitor.close();
  });
});
