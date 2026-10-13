import { test, expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, ownerWithMember, signUp } from "../support/ui";

// Parte do Forms (preset /rodsaas:forms). Roda quando rodsaas.json tem "forms" em presets ou a API tem /v1/forms.

const SIMPLE = {
  version: 1,
  fields: [
    { id: "f_nome", type: "short_text", label: "Seu nome", required: true },
    { id: "f_email", type: "email", label: "Seu e-mail", required: true },
  ],
  hidden: [{ key: "utm_source" }],
};
const LOGIC = {
  version: 1,
  fields: [
    ...SIMPLE.fields,
    { id: "f_tipo", type: "single_choice", label: "Você é", required: true, options: [{ id: "o_pf", label: "Pessoa física" }, { id: "o_pj", label: "Empresa" }] },
    { id: "f_empresa", type: "short_text", label: "Nome da empresa", required: true, visibleIf: { match: "all", rules: [{ field: "f_tipo", op: "eq", value: "o_pj" }] } },
  ],
  hidden: [],
};

async function formsInstalled(req: APIRequestContext) {
  if (cfg.presets.includes("forms")) return true;
  return (await call(req, "GET", "/v1/forms")).status() !== 404;
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

async function saveDraft(req: APIRequestContext, id: string, schema: unknown) {
  const form = await ok<any>(await call(req, "GET", `/v1/forms/${id}`), "ler formulário");
  return ok<any>(await call(req, "PUT", `/v1/forms/${id}/draft`, { version: form.draftVersion, schema }), "salvar rascunho");
}

async function createPublished(req: APIRequestContext, schema: unknown, settings?: Record<string, unknown>) {
  const title = `Form ${uniq()}`;
  const form = await ok<any>(await call(req, "POST", "/v1/forms", { title }), "criar formulário");
  expect(form.status, "nasce como rascunho").toBe("DRAFT");
  await saveDraft(req, form.id, schema);
  if (settings) await ok(await call(req, "PATCH", `/v1/forms/${form.id}`, { settings }), "configurações");
  const pub = await ok<any>(await call(req, "POST", `/v1/forms/${form.id}/publish`), "publicar");
  return { id: form.id as string, slug: (pub.slug ?? form.slug) as string, title };
}

/** Chamadas públicas: contexto novo, sem cookie e sem Origin (como um site ou o celular de um cliente). */
async function anon(playwright: any) {
  const ctx = await playwright.request.newContext();
  const get = (slug: string) => ctx.fetch(`${cfg.apiURL}/v1/public/forms/${slug}`, { failOnStatusCode: false });
  const submit = (slug: string, body: unknown) =>
    ctx.fetch(`${cfg.apiURL}/v1/public/forms/${slug}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `verify-${uniq()}` },
      data: JSON.stringify(body),
      failOnStatusCode: false,
    });
  return { ctx, get, submit };
}
const ALL_TYPES = ["short_text", "long_text", "email", "phone", "cpf", "cnpj", "address", "number", "money", "rating", "nps", "scale", "single_choice", "multiple_choice", "dropdown", "yes_no", "date", "time", "file", "consent", "statement", "page"];
const CHOICE = ["single_choice", "multiple_choice", "dropdown"];
const labels = async (res: APIResponse) => ((await res.json()).schema?.fields ?? []).map((f: any) => f.label);
/** Envio feito rápido demais é tratado como robô (`_ts`); a tela espera o mesmo que uma pessoa levaria. */
const humanPause = (page: Page) => page.waitForTimeout(2_500);
const responsesOf = async (req: APIRequestContext, id: string) => items<any>(await ok(await call(req, "GET", `/v1/forms/${id}/responses`), "respostas"));

test.describe("Forms", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await formsInstalled(request)), "projeto sem o preset forms");
  });

  // ------------------------------------------------------------------ API
  test("API: o link público só mostra a versão publicada", async ({ request, playwright }) => {
    await register(request, newUser("forms"));
    const { ctx, get } = await anon(playwright);
    const form = await ok<any>(await call(request, "POST", "/v1/forms", { title: `Rascunho ${uniq()}` }), "criar");
    await saveDraft(request, form.id, SIMPLE);
    expect((await get(form.slug)).status(), "rascunho nunca publicado não tem link").toBe(404);

    const pub = await ok<any>(await call(request, "POST", `/v1/forms/${form.id}/publish`), "publicar");
    const slug = pub.slug ?? form.slug;
    const r1 = await get(slug);
    expect(r1.status(), "publicado abre").toBe(200);
    expect(await labels(r1)).toEqual(["Seu nome", "Seu e-mail"]);

    await saveDraft(request, form.id, { ...SIMPLE, fields: [{ ...SIMPLE.fields[0], label: "Nome completo" }, SIMPLE.fields[1]] });
    expect(await labels(await get(slug)), "rascunho editado não muda o link").toEqual(["Seu nome", "Seu e-mail"]);
    await ok(await call(request, "POST", `/v1/forms/${form.id}/publish`), "publicar alterações");
    expect(await labels(await get(slug)), "depois de publicar de novo").toEqual(["Nome completo", "Seu e-mail"]);
    await ctx.dispose();
  });

  test("API: resposta pública sem Origin, com erro em cada campo", async ({ request, playwright }) => {
    await register(request, newUser("formsub"));
    const { id, slug } = await createPublished(request, SIMPLE);
    const { ctx, submit } = await anon(playwright);

    const empty = await expectCode(await submit(slug, { answers: {} }), 400, "VALIDATION_ERROR", "sem respostas");
    const paths = (empty.errors ?? []).map((e: any) => e.path);
    expect(paths, "erro em cada pergunta obrigatória").toEqual(expect.arrayContaining(["answers.f_nome", "answers.f_email"]));
    const bad = await expectCode(await submit(slug, { answers: { f_nome: "Ana", f_email: "ana@" } }), 400, "VALIDATION_ERROR", "e-mail inválido");
    expect((bad.errors ?? []).map((e: any) => e.path)).toEqual(["answers.f_email"]);

    const email = `Ana.${uniq()}@Example.com`;
    const res = await submit(slug, { answers: { f_nome: "Ana", f_email: email }, hidden: { utm_source: "verify", outro: "x" } });
    const body = await res.text();
    expect(res.status(), `envio válido (sem Origin, sem cookie) → ${body.slice(0, 300)}`).toBe(201);
    expect(body, "resposta do envio não devolve os dados").not.toContain(email.toLowerCase());
    const rid = JSON.parse(body).id;

    const list = await responsesOf(request, id);
    const saved = list.find((r) => r.id === rid);
    expect(saved, "resposta aparece para o dono").toBeTruthy();
    expect(saved.answers.f_email, "e-mail normalizado").toBe(email.toLowerCase());
    expect(saved.hidden?.utm_source, "campo oculto declarado gravado").toBe("verify");
    expect(saved.hidden?.outro, "campo oculto não declarado ignorado").toBeUndefined();
    await ctx.dispose();
  });

  test("API: lógica condicional — pergunta escondida não é exigida nem gravada", async ({ request, playwright }) => {
    await register(request, newUser("formlogic"));
    await ensureFeature(request, "forms_logic");
    const { id, slug } = await createPublished(request, LOGIC);
    const { ctx, submit } = await anon(playwright);
    const base = { f_nome: "Bia", f_email: `bia.${uniq()}@example.com` };

    const pf = await submit(slug, { answers: { ...base, f_tipo: "o_pf", f_empresa: "Não deve gravar" } });
    expect(pf.status(), "pessoa física sem a pergunta da empresa").toBe(201);
    const pj = await expectCode(await submit(slug, { answers: { ...base, f_tipo: "o_pj" } }), 400, "VALIDATION_ERROR", "empresa sem o nome da empresa");
    expect((pj.errors ?? []).map((e: any) => e.path)).toEqual(["answers.f_empresa"]);
    expect((await submit(slug, { answers: { ...base, f_tipo: "o_pj", f_empresa: "Acme" } })).status(), "empresa completa").toBe(201);

    const pfId = JSON.parse(await pf.text()).id;
    const pfSaved = (await responsesOf(request, id)).find((r) => r.id === pfId);
    expect(pfSaved?.answers?.f_empresa, "resposta de pergunta escondida descartada").toBeUndefined();
    await ctx.dispose();
  });

  test("API: limite de respostas, encerrar e reabrir", async ({ request, playwright }) => {
    await register(request, newUser("formclose"));
    const { ctx, get, submit } = await anon(playwright);
    const a = await createPublished(request, SIMPLE, { limits: { maxResponses: 1, onePer: "none" } });
    const ans = () => ({ answers: { f_nome: "Caio", f_email: `caio.${uniq()}@example.com` } });
    expect((await submit(a.slug, ans())).status(), "primeira resposta").toBe(201);
    await expectCode(await submit(a.slug, ans()), 410, "FORM_CLOSED", "passou do limite");
    await expectCode(await get(a.slug), 410, "FORM_CLOSED", "link encerrado");

    const b = await createPublished(request, SIMPLE);
    await ok(await call(request, "POST", `/v1/forms/${b.id}/close`), "encerrar");
    await expectCode(await submit(b.slug, ans()), 410, "FORM_CLOSED", "encerrado manualmente");
    await ok(await call(request, "POST", `/v1/forms/${b.id}/reopen`), "reabrir");
    expect((await submit(b.slug, ans())).status(), "reaberto aceita").toBe(201);
    await ctx.dispose();
  });

  test("API: campo isca não grava nada", async ({ request, playwright }) => {
    await register(request, newUser("formspam"));
    const { id, slug } = await createPublished(request, SIMPLE);
    const { ctx, submit } = await anon(playwright);
    const res = await submit(slug, { answers: { f_nome: "Robô", f_email: "robo@example.com" }, _gotcha: "http://spam.example" });
    expect(res.status(), "robô recebe sucesso (não aprende)").toBeLessThan(300);
    expect(await responsesOf(request, id), "nenhuma resposta gravada").toHaveLength(0);
    await ctx.dispose();
  });

  test("API: respostas só para quem pode ver (membro e outra empresa → 404)", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const { id } = await createPublished(ownerCtx.request, SIMPLE);
    expect((await call(memberCtx.request, "GET", `/v1/forms/${id}`)).status(), "membro vê o formulário").toBe(200);
    expect((await call(memberCtx.request, "GET", `/v1/forms/${id}/responses`)).status(), "membro que não é dono nem colaborador não vê respostas").toBe(404);
    const other = await newContext(browser);
    await register(other.request, newUser("formother"));
    expect((await call(other.request, "GET", `/v1/forms/${id}`)).status(), "outra empresa").toBe(404);
    expect((await call(other.request, "GET", `/v1/forms/${id}/responses`)).status(), "respostas de outra empresa").toBe(404);
    await Promise.all([ownerCtx.close(), memberCtx.close(), other.close()]);
  });

  test("API: todos os tipos de pergunta são aceitos, publicados e chegam ao link público; o resumo conta as respostas", async ({ request, playwright }) => {
    await register(request, newUser("formtypes"));
    await ensureFeature(request, "forms_files");
    const fields = ALL_TYPES.map((t) => ({ id: `f_${t}`, type: t, label: `Pergunta ${t}`, ...(CHOICE.includes(t) ? { options: [{ id: "o_a", label: "A" }, { id: "o_b", label: "B" }] } : {}) }));
    const { id, slug } = await createPublished(request, { version: 1, fields, hidden: [] });
    const { ctx, get, submit } = await anon(playwright);
    const pub = await (await get(slug)).json();
    expect((pub.schema?.fields ?? []).map((f: any) => f.type), "os 22 tipos (20 de pergunta + texto informativo e página) chegam ao público").toEqual(ALL_TYPES);

    const answers = { f_short_text: "Ana", f_long_text: "Texto longo", f_email: "ana@example.com", f_phone: "(44) 99999-1234", f_cpf: "529.982.247-25", f_cnpj: "11.222.333/0001-81", f_number: 7, f_money: 15000, f_rating: 4, f_nps: 9, f_scale: 3, f_single_choice: "o_a", f_multiple_choice: { selected: ["o_a", "o_b"] }, f_dropdown: "o_b", f_yes_no: true, f_date: "2026-10-20", f_time: "14:30", f_consent: true };
    const res = await submit(slug, { answers });
    expect(res.status(), `resposta com todos os tipos → ${(await res.text()).slice(0, 300)}`).toBe(201);
    const bad = await submit(slug, { answers: { f_cpf: "111.111.111-11", f_cnpj: "11.111.111/1111-11", f_email: "x@" } });
    expect(bad.status(), "CPF, CNPJ e e-mail inválidos recusados").toBe(400);
    expect(((await bad.json()).errors ?? []).map((e: any) => e.path).sort(), "erro em cada campo").toEqual(["answers.f_cnpj", "answers.f_cpf", "answers.f_email"]);
    const saved = (await responsesOf(request, id))[0];
    expect(saved.answers.f_phone, "telefone normalizado").toBe("5544999991234");
    expect(saved.answers.f_cpf, "CPF só com dígitos").toBe("52998224725");

    const summary = await ok<any>(await call(request, "GET", `/v1/forms/${id}/summary`), "resumo");
    const byId = Object.fromEntries((summary.fields ?? []).map((f: any) => [f.fieldId, f]));
    expect(byId.f_single_choice?.options?.find((o: any) => o.id === "o_a")?.count, "escolha única contada").toBe(1);
    expect(byId.f_nps?.nps?.score, "NPS calculado").toBe(100);
    expect(byId.f_yes_no?.yes, "sim/não contado").toBe(1);
    expect(byId.f_rating?.average, "média das estrelas").toBe(4);
    expect(summary.totals?.responses, "total de respostas").toBe(1);
    await ctx.dispose();
  });

  test("API: exportar respostas em CSV que abre no Excel", async ({ request, playwright }) => {
    await register(request, newUser("formcsv"));
    const { id, slug } = await createPublished(request, SIMPLE);
    const { ctx, submit } = await anon(playwright);
    await submit(slug, { answers: { f_nome: "=SOMA(1;2)", f_email: `csv.${uniq()}@example.com` } });
    const res = await call(request, "GET", `/v1/forms/${id}/responses/export?format=csv`);
    expect(res.status(), "exportar").toBe(200);
    expect(res.headers()["content-type"] ?? "", "tipo CSV").toContain("text/csv");
    const buf = await res.body();
    expect([...buf.subarray(0, 3)], "UTF-8 com BOM (acentos no Excel)").toEqual([0xef, 0xbb, 0xbf]);
    const text = buf.toString("utf8").slice(1);
    const [header, line] = text.split(/\r?\n/);
    expect(header, "cabeçalho com as perguntas, separado por ;").toContain("Seu nome;Seu e-mail");
    expect(line, "fórmula neutralizada (não executa no Excel)").toContain("'=SOMA");
    await ctx.dispose();
  });

  // ------------------------------------------------------------------ telas
  test("construtor: montar pela tela e publicar", async ({ page }) => {
    await signUp(page, "formui", "/forms");
    const req = page.context().request;
    await page.getByTestId("forms-new").click();
    await page.getByTestId("forms-template-blank").click();
    await expect(page, "abre o construtor").toHaveURL(/\/forms\/f\/[^/]+\/editar/);
    await expect(page.getByTestId("forms-status")).toHaveAttribute("data-status", "DRAFT");

    const title = `Contato ${uniq()}`;
    await page.getByTestId("forms-title-input").fill(title);
    await page.getByTestId("forms-field").first().click();
    await page.getByTestId("forms-field-label").fill("Seu nome");
    const required = page.getByTestId("forms-field-required");
    if ((await required.getAttribute("aria-checked")) !== "true" && !(await required.isChecked().catch(() => false))) await required.click();

    await page.getByTestId("forms-add-field").click();
    await page.getByTestId("forms-field-type-email").click();
    await expect(page.getByTestId("forms-field"), "duas perguntas").toHaveCount(2);
    await page.getByTestId("forms-field-label").fill("Seu e-mail");
    await expect(page.getByTestId("forms-save-status"), "salvamento automático").toContainText(/salvo/i, { timeout: 10_000 });
    await page.reload();
    await expect(page.getByTestId("forms-field"), "perguntas continuam depois de recarregar (rascunho salvo no servidor)").toHaveCount(2);
    await expect(page.getByTestId("forms-field").nth(1)).toContainText("Seu e-mail");
    await expect(page.getByTestId("forms-title-input")).toHaveValue(title);

    await page.getByTestId("forms-publish").click();
    await expect(page.getByTestId("forms-public-link"), "link público depois de publicar").toContainText("/f/");
    await expect(page.getByTestId("forms-status")).toHaveAttribute("data-status", "PUBLISHED");

    const list = items<any>(await ok(await call(req, "GET", `/v1/forms?q=${encodeURIComponent(title)}`), "lista"));
    const saved = list.find((f) => f.title === title);
    expect(saved, "formulário com o título digitado").toBeTruthy();
    const detail = await ok<any>(await call(req, "GET", `/v1/forms/${saved.id}`), "detalhe");
    const fields = detail.published?.fields ?? [];
    expect(fields.map((f: any) => [f.type, f.label]), "perguntas publicadas").toEqual([["short_text", "Seu nome"], ["email", "Seu e-mail"]]);
    expect(fields[0].required, "primeira pergunta obrigatória").toBe(true);
  });

  test("construtor: a paleta oferece todos os tipos de pergunta", async ({ page }) => {
    await signUp(page, "formpalette", "/forms");
    await page.getByTestId("forms-new").click();
    await page.getByTestId("forms-template-blank").click();
    await expect(page).toHaveURL(/\/forms\/f\/[^/]+\/editar/);
    await page.getByTestId("forms-add-field").click();
    for (const t of ALL_TYPES.filter((x) => x !== "page" && x !== "statement")) await expect(page.getByTestId(`forms-field-type-${t}`), `tipo ${t} na paleta`).toBeVisible();
  });

  test("formulário público: erro no campo, enviar e a resposta aparece para o dono", async ({ page, browser }) => {
    await signUp(page, "formpub");
    const { id, slug } = await createPublished(page.context().request, SIMPLE);
    const visitor = await browser.newContext({ baseURL: cfg.webURL, locale: "pt-BR" });
    const pub = await visitor.newPage();
    await pub.goto(`/f/${slug}`);
    await expect(pub.getByTestId("public-form")).toBeVisible();
    await pub.getByTestId("public-form-submit").click();
    await expect(pub.locator('[data-testid="public-field"][data-field-id="f_nome"]').getByTestId("public-field-error"), "erro na pergunta obrigatória").toBeVisible();

    const name = `Davi ${uniq()}`;
    await pub.getByLabel("Seu nome").fill(name);
    await pub.getByLabel("Seu e-mail").fill(`davi.${uniq()}@example.com`);
    await humanPause(pub);
    await pub.getByTestId("public-form-submit").click();
    await expect(pub.getByTestId("public-form-thanks"), "tela de agradecimento").toBeVisible();
    await visitor.close();

    await page.goto(`/forms/f/${id}/respostas`);
    await expect(page.getByTestId("forms-responses-table")).toBeVisible();
    await expect(page.getByTestId("forms-response-row").filter({ hasText: name }), "resposta na tabela").toBeVisible();
  });

  test("formulário público: uma pergunta por vez", async ({ page, browser }) => {
    await signUp(page, "formone");
    const { slug } = await createPublished(page.context().request, SIMPLE, { layout: "one_by_one" });
    const visitor = await browser.newContext({ baseURL: cfg.webURL, locale: "pt-BR" });
    const pub = await visitor.newPage();
    await pub.goto(`/f/${slug}`);
    await expect(pub.getByLabel("Seu nome")).toBeVisible();
    await expect(pub.getByLabel("Seu e-mail"), "só uma pergunta na tela").toHaveCount(0);
    await pub.getByLabel("Seu nome").fill("Eva");
    await pub.getByLabel("Seu nome").press("Enter");
    await expect(pub.getByLabel("Seu e-mail"), "Enter avança").toBeVisible();
    await pub.getByLabel("Seu e-mail").fill(`eva.${uniq()}@example.com`);
    await humanPause(pub);
    await pub.getByTestId("public-form-submit").click();
    await expect(pub.getByTestId("public-form-thanks")).toBeVisible();
    await visitor.close();
  });

  test("formulário público: lógica ao vivo mostra a pergunta da empresa", async ({ page, browser }) => {
    await signUp(page, "formlive");
    await ensureFeature(page.context().request, "forms_logic");
    const { slug } = await createPublished(page.context().request, LOGIC);
    const visitor = await browser.newContext({ baseURL: cfg.webURL, locale: "pt-BR" });
    const pub = await visitor.newPage();
    await pub.goto(`/f/${slug}`);
    await expect(pub.getByLabel("Nome da empresa"), "escondida no começo").toHaveCount(0);
    await pub.getByRole("radio", { name: "Empresa" }).check();
    await expect(pub.getByLabel("Nome da empresa"), "aparece ao escolher Empresa").toBeVisible();
    await pub.getByRole("radio", { name: "Pessoa física" }).check();
    await expect(pub.getByLabel("Nome da empresa"), "some de novo").toHaveCount(0);
    await visitor.close();
  });

  test("formulário público: encerrado mostra o aviso", async ({ page, browser }) => {
    await signUp(page, "formclosedui");
    const { id, slug } = await createPublished(page.context().request, SIMPLE);
    await ok(await call(page.context().request, "POST", `/v1/forms/${id}/close`), "encerrar");
    const visitor = await browser.newContext({ baseURL: cfg.webURL, locale: "pt-BR" });
    const pub = await visitor.newPage();
    await pub.goto(`/f/${slug}`);
    await expect(pub.getByTestId("public-form-closed")).toBeVisible();
    await expect(pub.getByTestId("public-form-submit"), "sem botão de enviar").toHaveCount(0);
    await visitor.close();
  });
});
