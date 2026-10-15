import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { ownerWithMember, signUp } from "../support/ui";

// Páginas · operação avançada e perfis (skills/notion/references/06 e 07). Roda com o preset notion. Confere o que mais
// se simplifica: comentário no bloco com menção e conversa órfã, histórico que junta a edição contínua e restaura
// como versão nova, arquivo de outra empresa recusado, modelo com variáveis e sub-páginas, permissão por página que
// some para quem não pode (inclusive da árvore e da busca) e herda para as filhas, calendário e galeria com filtro no
// servidor, relação de mão dupla com rollup, exportação escapada, verificação com ciência, base pública com voto e
// ata que vira tarefas (e marca o to-do quando a tarefa termina).

async function installed(req: APIRequestContext) {
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
const pathsOf = (b: any) => (b?.errors ?? []).map((e: any) => e.path) as string[];
async function ensureFeature(req: APIRequestContext, feature: string) {
  const plan: any = (await me(req)).plan;
  if (plan?.features?.includes(feature)) return;
  const mode = await billingMode(req);
  test.skip(mode !== "fake", `"${feature}" exige plano pago e a cobrança está em modo "${mode}"`);
  const target = (await plansFromApi(req)).paid.find((p) => p.features?.includes(feature));
  test.skip(!target, `nenhum plano com a feature ${feature}`);
  await ok(await call(req, "POST", "/v1/billing/checkout-sessions", { plan: target!.id, interval: "month" }), `assinar plano com ${feature} (modo de teste)`);
}
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const txt = (text: string) => ({ type: "text", text, styles: {} });
const blk = (type: string, content: any[] = [], props: Record<string, unknown> = {}, id = "b" + uniq()) => ({ id, type, props, content, children: [] });
const para = (text: string, id?: string) => blk("paragraph", [txt(text)], {}, id);
const getPage = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/pages/${id}`), "página");
const newPage = async (req: APIRequestContext, body: Record<string, unknown> = {}) => ok<any>(await call(req, "POST", "/v1/pages", { title: `Página ${uniq()}`, ...body }), "criar página");
async function save(req: APIRequestContext, id: string, patch: Record<string, unknown>) {
  const p = await getPage(req, id);
  return call(req, "PATCH", `/v1/pages/${id}`, { version: p.version, ...patch });
}
const tree = async (req: APIRequestContext) => items<any>(await ok(await call(req, "GET", "/v1/pages/tree"), "árvore"));
async function database(req: APIRequestContext, title: string) {
  const d = await newPage(req, { type: "DATABASE", title });
  return d.id as string;
}
const prop = async (req: APIRequestContext, dbId: string, body: Record<string, unknown>) => ok<any>(await call(req, "POST", `/v1/databases/${dbId}/properties`, body), `propriedade ${body.name}`);
const row = async (req: APIRequestContext, dbId: string, title: string, properties: Record<string, unknown> = {}) => ok<any>(await call(req, "POST", `/v1/databases/${dbId}/rows`, { title, properties }), `linha ${title}`);
const rows = async (req: APIRequestContext, dbId: string, q = "") => ok<any>(await call(req, "GET", `/v1/databases/${dbId}/rows${q}`), "linhas");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
async function upload(req: APIRequestContext, complete = true) {
  const start = await ok<any>(await call(req, "POST", "/v1/uploads", { fileName: "planta.png", size: PNG.length, mimeType: "image/png", purpose: "page_file" }), "iniciar envio");
  const put = await req.fetch(start.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png", ...(start.headers ?? {}) }, data: PNG, failOnStatusCode: false });
  expect(put.status(), "enviar os bytes").toBeLessThan(300);
  if (complete) await ok(await call(req, "POST", `/v1/uploads/${start.fileId}/complete`), "concluir envio");
  return start.fileId as string;
}
const pub = (req: APIRequestContext, path: string, init: { method?: string; data?: unknown } = {}) => req.fetch(`${cfg.apiURL}${path}`, { method: init.method ?? "GET", headers: { Origin: cfg.webURL, ...(init.data ? { "Content-Type": "application/json" } : {}) }, data: init.data ? JSON.stringify(init.data) : undefined, failOnStatusCode: false });

test.describe("Páginas · operação", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset notion");
  });

  test("API: comentários — no bloco com menção, validados, resolver e reabrir, conversa órfã quando o bloco sai", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request, memberId = (await me(m)).user.id;
    const pg = await newPage(o);
    const b1 = "b1" + uniq(), b2 = "b2" + uniq();
    await ok(await save(o, pg.id, { content: [para("Primeiro parágrafo", b1), para("Segundo", b2)] }), "conteúdo");
    expect(pathsOf(await expectCode(await call(o, "POST", `/v1/pages/${pg.id}/comments`, { body: "  " }), 400, "VALIDATION_ERROR", "vazio"))).toContain("body");
    expect(pathsOf(await expectCode(await call(o, "POST", `/v1/pages/${pg.id}/comments`, { body: "oi", blockId: "naoexiste" }), 400, "VALIDATION_ERROR", "bloco inexistente"))).toContain("blockId");
    expect(pathsOf(await expectCode(await call(o, "POST", `/v1/pages/${pg.id}/comments`, { body: "oi", quote: "solto" }), 400, "VALIDATION_ERROR", "trecho sem bloco"))).toContain("quote");
    const c = await ok<any>(await call(o, "POST", `/v1/pages/${pg.id}/comments`, { body: `@[Membro](${memberId}) confere este número?`, blockId: b2, quote: "Segundo" }), "comentar no bloco");
    expect([c.blockId, c.quote, c.author?.id]).toEqual([b2, "Segundo", (await me(o)).user.id]);
    await expect.poll(async () => items<any>(await ok(await call(m, "GET", "/v1/notifications"), "notificações do membro")).some((n) => n.type === "page.mentioned"), { message: "mencionado avisado", timeout: 15_000 }).toBe(true);
    await ok(await call(m, "POST", `/v1/pages/${pg.id}/comments`, { body: "Confere sim", parentId: c.id }), "responder");
    await ok(await call(o, "POST", `/v1/pages/${pg.id}/comments`, { body: "Comentário geral da página" }), "na página");
    let th = items<any>(await ok(await call(o, "GET", `/v1/pages/${pg.id}/comments`), "conversas"));
    expect(th.find((t) => t.id === c.id).comments.map((x: any) => x.body), "resposta na mesma conversa").toEqual([c.body, "Confere sim"]);
    await ok(await call(m, "POST", `/v1/page-comments/${c.id}/resolve`), "resolver");
    expect(items<any>(await ok(await call(o, "GET", `/v1/pages/${pg.id}/comments?status=open`), "abertas")).map((t) => t.id), "resolvida sai das abertas").not.toContain(c.id);
    expect(items<any>(await ok(await call(o, "GET", `/v1/pages/${pg.id}/comments?status=resolved`), "resolvidas")).map((t) => t.id)).toEqual([c.id]);
    await ok(await call(o, "POST", `/v1/page-comments/${c.id}/reopen`), "reabrir");
    expect(items<any>(await ok(await call(o, "GET", `/v1/pages/${pg.id}/comments?status=open`), "abertas de novo")).map((t) => t.id), "reaberta volta").toContain(c.id);
    await expectCode(await call(m, "PATCH", `/v1/page-comments/${c.id}`, { body: "editando o dos outros" }), 403, "FORBIDDEN", "editar comentário dos outros");
    await ok(await save(o, pg.id, { content: [para("Primeiro parágrafo", b1)] }), "tirar o bloco comentado");
    th = items<any>(await ok(await call(o, "GET", `/v1/pages/${pg.id}/comments`), "conversas depois"));
    expect(th.find((t) => t.id === c.id).orphaned, "conversa órfã").toBe(true);
    await Promise.all([ownerCtx.close(), memberCtx.close()]);
  });

  test("API: histórico — edição contínua vira uma versão, outra pessoa abre outra, restaurar volta como versão nova e versão velha 409", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request;
    const pg = await newPage(o, { title: "Política de reembolso" });
    await ok(await save(o, pg.id, { content: [para("Reembolso em 7 dias")] }), "primeira edição");
    await ok(await save(o, pg.id, { content: [para("Reembolso em 7 dias úteis")] }), "continua editando");
    await ok(await save(m, pg.id, { content: [para("Reembolso em 30 dias")] }), "outra pessoa edita");
    const vs = items<any>(await ok(await call(o, "GET", `/v1/pages/${pg.id}/versions`), "versões"));
    expect(vs.length, "duas versões (a contínua junta)").toBe(2);
    expect(vs[0].author.id, "mais recente primeiro").toBe((await me(m)).user.id);
    expect(vs[0].diff, "trocou um bloco").toEqual({ added: 1, removed: 1, changed: 0 });
    const old = await ok<any>(await call(o, "GET", `/v1/pages/${pg.id}/versions/${vs[1].id}`), "prévia");
    expect(JSON.stringify(old.content)).toContain("7 dias úteis");
    const cur = await getPage(o, pg.id);
    await expectCode(await call(o, "POST", `/v1/pages/${pg.id}/versions/${vs[1].id}/restore`, { version: cur.version - 1 }), 409, "VERSION_CONFLICT", "restaurar com versão velha");
    await ok(await call(o, "POST", `/v1/pages/${pg.id}/versions/${vs[1].id}/restore`, { version: cur.version }), "restaurar");
    expect(JSON.stringify((await getPage(o, pg.id)).content)).toContain("7 dias úteis");
    const after = items<any>(await ok(await call(o, "GET", `/v1/pages/${pg.id}/versions`), "versões depois"));
    expect(after.length, "restaurar cria versão nova (dá para desfazer)").toBe(3);
    expect(after[0].restoredFromId).toBe(vs[1].id);
    await Promise.all([ownerCtx.close(), memberCtx.close()]);
  });

  test("API: arquivos — bloco com arquivo da empresa concluído, não concluído recusado e lista com URL", async ({ request }) => {
    await register(request, newUser("pgfile"));
    test.skip(!cfg.addons.includes("uploads") && (await call(request, "GET", "/v1/files/usage")).status() === 404, "projeto sem o add-on uploads");
    const pg = await newPage(request);
    const pend = await upload(request, false);
    expect(pathsOf(await expectCode(await save(request, pg.id, { content: [blk("image", [], { fileId: pend })] }), 400, "VALIDATION_ERROR", "arquivo não concluído"))).toContain("content");
    expect(pathsOf(await expectCode(await save(request, pg.id, { content: [blk("file", [], { fileId: "00000000-0000-0000-0000-000000000000" })] }), 400, "VALIDATION_ERROR", "arquivo que não existe"))).toContain("content");
    const f = await upload(request);
    await ok(await save(request, pg.id, { content: [para("Planta baixa:"), blk("image", [], { fileId: f, caption: "Térreo" })] }), "salvar com imagem");
    const files = items<any>(await ok(await call(request, "GET", `/v1/pages/${pg.id}/files`), "arquivos da página"));
    expect(files.map((x) => [x.fileId, x.mimeType])).toEqual([[f, "image/png"]]);
    expect(files[0].url, "URL para abrir").toBeTruthy();
  });

  test("API: modelos — salvar a página com sub-páginas e aplicar com as variáveis trocadas", async ({ request }) => {
    const u = newUser("pgmodelo");
    await register(request, u);
    const src = await newPage(request, { title: "Reunião {{data}}" });
    await ok(await save(request, src.id, { title: "Reunião {{data}}", content: [para("Pauta de {{autor}} no {{workspace}}")] }), "conteúdo do modelo");
    await newPage(request, { parentId: src.id, title: "Anexos" });
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/page-templates", { name: " ", pageId: src.id }), 400, "VALIDATION_ERROR", "sem nome"))).toContain("name");
    const t = await ok<any>(await call(request, "POST", "/v1/page-templates", { name: "Reunião semanal", pageId: src.id }), "salvar como modelo");
    expect(items<any>(await ok(await call(request, "GET", "/v1/page-templates"), "modelos")).map((x) => x.id)).toContain(t.id);
    const parent = await newPage(request, { title: "Reuniões" });
    const made = await ok<any>(await call(request, "POST", `/v1/page-templates/${t.id}/apply`, { parentId: parent.id }), "aplicar");
    const d = today();
    expect(made.title, "{{data}} trocado").toBe(`Reunião ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`);
    expect(made.parentId).toBe(parent.id);
    const full = await getPage(request, made.id);
    expect(JSON.stringify(full.content)).toContain(`Pauta de ${u.name} no ${u.organizationName}`);
    expect((await tree(request)).filter((x) => x.parentId === made.id).map((x) => x.title), "sub-página veio junto").toEqual(["Anexos"]);
  });

  test("API: permissão por página — restrita some para quem não está (até da árvore e da busca), ver não edita, filha herda e owner sempre vê", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request, memberId = (await me(m)).user.id;
    const plan: any = (await me(o)).plan;
    const word = "salarios" + uniq();
    const pg = await newPage(o, { title: `Folha ${word}` });
    if (!plan?.features?.includes("page_permissions")) await expectCode(await call(o, "PUT", `/v1/pages/${pg.id}/access`, { restricted: true, grants: [] }), 403, "FEATURE_NOT_IN_PLAN", "sem a feature");
    await ensureFeature(o, "page_permissions");
    await ok(await save(o, pg.id, { content: [para(`Tabela de ${word}`)] }), "conteúdo");
    const child = await newPage(o, { parentId: pg.id, title: "Detalhe" });
    expect(pathsOf(await expectCode(await call(o, "PUT", `/v1/pages/${pg.id}/access`, { restricted: true, grants: [{ type: "user", id: "00000000-0000-0000-0000-000000000000", level: "view" }] }), 400, "VALIDATION_ERROR", "pessoa de fora"))).toContain("grants.0.id");
    await ok(await call(o, "PUT", `/v1/pages/${pg.id}/access`, { restricted: true, grants: [] }), "restringir");
    await expectCode(await call(m, "GET", `/v1/pages/${pg.id}`), 404, "NOT_FOUND", "restrita some");
    await expectCode(await call(m, "GET", `/v1/pages/${child.id}`), 404, "NOT_FOUND", "filha herda");
    expect((await tree(m)).map((x) => x.id), "fora da árvore").not.toContain(pg.id);
    expect(items<any>(await ok(await call(m, "GET", `/v1/search?q=${word}`), "busca")).map((x) => x.id), "fora da busca").not.toContain(pg.id);
    await ok(await call(o, "PUT", `/v1/pages/${pg.id}/access`, { restricted: true, grants: [{ type: "user", id: memberId, level: "view" }] }), "dar ver");
    expect((await getPage(m, pg.id)).id, "agora vê").toBe(pg.id);
    expect((await ok<any>(await call(m, "GET", `/v1/pages/${child.id}/access`), "acesso da filha"))).toMatchObject({ level: "view", inheritedFrom: { id: pg.id } });
    await expectCode(await save(m, pg.id, { content: [para("mudei")] }), 403, "FORBIDDEN", "ver não edita");
    await expectCode(await call(m, "POST", `/v1/pages/${pg.id}/comments`, { body: "posso?" }), 403, "FORBIDDEN", "ver não comenta");
    await ok(await call(o, "PUT", `/v1/pages/${pg.id}/access`, { restricted: true, grants: [{ type: "user", id: memberId, level: "comment" }] }), "dar comentar");
    await ok(await call(m, "POST", `/v1/pages/${pg.id}/comments`, { body: "agora posso" }), "comenta");
    await expectCode(await call(m, "DELETE", `/v1/pages/${pg.id}`), 403, "FORBIDDEN", "comentar não exclui");
    await ok(await call(o, "PUT", `/v1/pages/${pg.id}/access`, { restricted: true, grants: [{ type: "user", id: memberId, level: "edit" }] }), "dar editar");
    await ok(await save(m, pg.id, { content: [para("editado pelo membro")] }), "editar edita");
    await expectCode(await call(m, "DELETE", `/v1/pages/${pg.id}`), 403, "FORBIDDEN", "editar não exclui (exige total)");
    expect((await getPage(o, pg.id)).id, "owner sempre vê").toBe(pg.id);
    await ok(await call(o, "DELETE", `/v1/pages/${pg.id}/access`), "voltar a herdar");
    await ok(await save(m, pg.id, { content: [para("liberada")] }), "sem regra, membro edita");
    await Promise.all([ownerCtx.close(), memberCtx.close()]);
  });

  test("API: databases — calendário exige data, mês com período, galeria com capa e filtro e ordenação no servidor", async ({ request }) => {
    await register(request, newUser("pgcal"));
    await ensureFeature(request, "page_databases_plus");
    const dbId = await database(request, "Eventos");
    const quando = await prop(request, dbId, { name: "Quando", type: "DATE" });
    const capa = await prop(request, dbId, { name: "Capa", type: "URL" });
    const vagas = await prop(request, dbId, { name: "Vagas", type: "NUMBER" });
    expect(pathsOf(await expectCode(await call(request, "POST", `/v1/databases/${dbId}/views`, { name: "Calendário", type: "CALENDAR", config: {} }), 400, "VALIDATION_ERROR", "calendário sem data"))).toContain("config.dateProperty");
    const cal = await ok<any>(await call(request, "POST", `/v1/databases/${dbId}/views`, { name: "Calendário", type: "CALENDAR", config: { dateProperty: quando.id } }), "visão calendário");
    const a = await row(request, dbId, "Feira", { [quando.id]: { start: "2027-03-30", end: "2027-04-02" }, [vagas.id]: 50 });
    const b = await row(request, dbId, "Palestra", { [quando.id]: { start: "2027-03-10" }, [vagas.id]: 10, [capa.id]: "https://img.example.com/palestra.png" });
    const c = await row(request, dbId, "A definir", { [vagas.id]: 5 });
    const r = await rows(request, dbId, `?viewId=${cal.id}&month=2027-03`);
    expect(r.calendar.days, "período ocupa cada dia do mês").toEqual({ "2027-03-10": [b.id], "2027-03-30": [a.id], "2027-03-31": [a.id] });
    expect(r.calendar.undated).toEqual([c.id]);
    expect((await rows(request, dbId, `?viewId=${cal.id}&month=2027-04`)).calendar.days["2027-04-02"]).toEqual([a.id]);
    const gal = await ok<any>(await call(request, "POST", `/v1/databases/${dbId}/views`, { name: "Galeria", type: "GALLERY", config: { coverProperty: capa.id } }), "galeria");
    const g = await rows(request, dbId, `?viewId=${gal.id}`);
    expect(g.data.find((x: any) => x.id === b.id).cover).toBe("https://img.example.com/palestra.png");
    expect(g.data.find((x: any) => x.id === a.id).cover ?? null).toBeNull();
    const list = await ok<any>(await call(request, "POST", `/v1/databases/${dbId}/views`, { name: "Grandes", type: "LIST", config: { filters: [{ propertyId: vagas.id, op: "gt", value: 5 }], sorts: [{ propertyId: vagas.id, direction: "asc" }] } }), "lista filtrada");
    expect((await rows(request, dbId, `?viewId=${list.id}`)).data.map((x: any) => x.title), "filtro (maior que 5, sem o 5) e ordenação no servidor").toEqual(["Palestra", "Feira"]);
    const desc = await ok<any>(await call(request, "POST", `/v1/databases/${dbId}/views`, { name: "Maiores primeiro", type: "LIST", config: { sorts: [{ propertyId: vagas.id, direction: "desc" }] } }), "lista decrescente");
    expect((await rows(request, dbId, `?viewId=${desc.id}`)).data.map((x: any) => x.title), "ordem decrescente").toEqual(["Feira", "Palestra", "A definir"]);
  });

  test("API: relação de mão dupla e rollup — outra database recusada, o outro lado acompanha e o rollup soma", async ({ request }) => {
    await register(request, newUser("pgrel"));
    await ensureFeature(request, "page_databases_plus");
    const clientes = await database(request, "Clientes"), projetos = await database(request, "Projetos"), outra = await database(request, "Outra");
    const valor = await prop(request, projetos, { name: "Valor", type: "NUMBER" });
    expect(pathsOf(await expectCode(await call(request, "POST", `/v1/databases/${projetos}/properties`, { name: "Cliente", type: "RELATION", config: { databaseId: "00000000-0000-0000-0000-000000000000" } }), 400, "VALIDATION_ERROR", "database inexistente"))).toContain("config.databaseId");
    const doc = await newPage(request, { title: "Não é database" });
    expect(pathsOf(await expectCode(await call(request, "POST", `/v1/databases/${projetos}/properties`, { name: "Cliente", type: "RELATION", config: { databaseId: doc.id } }), 400, "VALIDATION_ERROR", "página que não é database"))).toContain("config.databaseId");
    const rel = await prop(request, projetos, { name: "Cliente", type: "RELATION", config: { databaseId: clientes, twoWay: true } });
    const back = (await ok<any>(await call(request, "GET", `/v1/databases/${clientes}`), "clientes")).properties.find((x: any) => x.type === "RELATION");
    expect(back?.config?.reversePropertyId ?? back?.id, "a outra database ganha a de volta").toBeTruthy();
    const roll = await prop(request, clientes, { name: "Total", type: "ROLLUP", config: { relationPropertyId: back.id, propertyId: valor.id, fn: "sum" } });
    const acme = await row(request, clientes, "Acme"), beta = await row(request, clientes, "Beta");
    const x = await row(request, outra, "Intrusa");
    const p1 = await row(request, projetos, "Site", { [valor.id]: 3000 }), p2 = await row(request, projetos, "App", { [valor.id]: 7000 });
    expect(pathsOf(await expectCode(await call(request, "PATCH", `/v1/pages/${p1.id}/properties`, { [rel.id]: [x.id] }), 400, "VALIDATION_ERROR", "linha de outra database"))).toContain(`properties.${rel.id}`);
    expect(pathsOf(await expectCode(await call(request, "PATCH", `/v1/pages/${acme.id}/properties`, { [roll.id]: 1 }), 400, "VALIDATION_ERROR", "rollup não se grava"))).toContain(`properties.${roll.id}`);
    await ok(await call(request, "PATCH", `/v1/pages/${p1.id}/properties`, { [rel.id]: [acme.id] }), "Site → Acme");
    await ok(await call(request, "PATCH", `/v1/pages/${p2.id}/properties`, { [rel.id]: [acme.id] }), "App → Acme");
    const get = async () => Object.fromEntries((await rows(request, clientes)).data.map((r: any) => [r.title, r.properties]));
    let cs = await get();
    expect([...cs.Acme[back.id]].sort(), "o outro lado acompanha").toEqual([p1.id, p2.id].sort());
    expect(cs.Acme[roll.id], "rollup soma").toBe(10000);
    await ok(await call(request, "PATCH", `/v1/pages/${p2.id}/properties`, { [rel.id]: [beta.id] }), "App muda para Beta");
    cs = await get();
    expect([cs.Acme[back.id], cs.Acme[roll.id], cs.Beta[roll.id]], "tirar também atualiza").toEqual([[p1.id], 3000, 7000]);
  });

  test("API: exportar — Markdown com títulos e listas, HTML escapado, PDF e sem acesso 404", async ({ request }) => {
    await register(request, newUser("pgexp"));
    const pg = await newPage(request, { title: "Guia" });
    await ok(await save(request, pg.id, { title: "Guia", content: [blk("heading", [txt("Instalação")], { level: 2 }), blk("bulletListItem", [txt("Baixe")]), blk("checkListItem", [txt("Teste")], { checked: true }), para("<script>alert(1)</script>")] }), "conteúdo");
    const md = await call(request, "GET", `/v1/pages/${pg.id}/export?format=md`);
    expect(md.status()).toBe(200);
    const mdText = await md.text();
    expect(mdText).toContain("## Instalação");
    expect(mdText).toContain("- Baixe");
    expect(mdText).toContain("- [x] Teste");
    const html = await (await call(request, "GET", `/v1/pages/${pg.id}/export?format=html`)).text();
    expect(html, "nada de script vivo").not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    const pdf = await call(request, "GET", `/v1/pages/${pg.id}/export?format=pdf`);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.headers()["content-disposition"] ?? "").toContain("attachment");
    await register(request, newUser("pgexpout"));
    expect((await call(request, "GET", `/v1/pages/${pg.id}/export?format=md`)).status(), "outra empresa").toBe(404);
  });

  test("API: perfil manual de processos — verificação com prazo, painel e ciência que vale só depois da verificação", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request, memberId = (await me(m)).user.id;
    await expectCode(await call(o, "PATCH", "/v1/pages/settings", { segment: "PADARIA" }), 400, "VALIDATION_ERROR", "perfil inválido");
    const s1 = await ok<any>(await call(o, "PATCH", "/v1/pages/settings", { segment: "PROCESSES" }), "perfil processos");
    expect(s1.on).toEqual(expect.arrayContaining(["verification", "read_receipts"]));
    expect(s1.words.page).toBe("procedimento");
    expect((await ok<any>(await call(o, "PATCH", "/v1/pages/settings", { segment: "GENERAL" }), "geral")).on, "não desliga nada").toContain("verification");
    const pg = await newPage(o, { title: "POP · Abertura do caixa" });
    expect(pathsOf(await expectCode(await call(o, "POST", `/v1/pages/${pg.id}/verify`, { reviewEveryDays: 1 }), 400, "VALIDATION_ERROR", "prazo curto demais"))).toContain("reviewEveryDays");
    await ok(await call(m, "POST", `/v1/pages/${pg.id}/ack`), "ciência antes da verificação");
    const v = await ok<any>(await call(o, "POST", `/v1/pages/${pg.id}/verify`, { reviewEveryDays: 30 }), "verificar");
    expect(v.verification.status).toBe("verified");
    const exp = new Date(Date.parse(v.verification.verifiedAt) + 30 * 864e5).toISOString().slice(0, 10);
    expect(v.verification.expiresOn).toBe(exp);
    expect((await getPage(o, pg.id)).verification?.status, "selo na página").toBe("verified");
    const panel = items<any>(await ok(await call(o, "GET", "/v1/pages/verification?status=verified"), "painel"));
    expect(panel.map((x) => x.id)).toContain(pg.id);
    let acks = await ok<any>(await call(o, "GET", `/v1/pages/${pg.id}/acks`), "ciências");
    expect(acks.pending.map((x: any) => x.id), "ciência de antes da verificação não vale").toContain(memberId);
    await ok(await call(m, "POST", `/v1/pages/${pg.id}/ack`), "li e entendi");
    acks = await ok<any>(await call(o, "GET", `/v1/pages/${pg.id}/acks`), "ciências depois");
    expect(acks.data.map((x: any) => x.user.id)).toContain(memberId);
    expect(acks.pending.map((x: any) => x.id)).not.toContain(memberId);
    await Promise.all([ownerCtx.close(), memberCtx.close()]);
  });

  test("API: perfil base pública — publica com endereço único, filhas juntas, não publicada 404, busca e voto", async ({ request }) => {
    await register(request, newUser("pgkb"));
    await ensureFeature(request, "public_pages");
    await ok(await call(request, "PATCH", "/v1/pages/settings", { segment: "KNOWLEDGE_BASE" }), "perfil base pública");
    const word = "boleto" + uniq().slice(0, 4);
    const a = await newPage(request, { title: "Como emitir a 2ª via" });
    await ok(await save(request, a.id, { title: "Como emitir a 2ª via", content: [para(`Abra o menu e clique em ${word}`)] }), "conteúdo");
    const child = await newPage(request, { parentId: a.id, title: "Erros comuns" });
    const hidden = await newPage(request, { title: "Interna" });
    expect(pathsOf(await expectCode(await call(request, "PUT", `/v1/pages/${a.id}/site`, { enabled: true, slug: "Com Espaço" }), 400, "VALIDATION_ERROR", "slug inválido"))).toContain("slug");
    const s1 = await ok<any>(await call(request, "PUT", `/v1/pages/${a.id}/site`, { enabled: true }), "publicar");
    expect(s1.slug).toBe("como-emitir-a-2-via");
    const key = new URL(s1.url).pathname.split("/")[2];
    const twin = await newPage(request, { title: "Como emitir a 2ª via" });
    expect((await ok<any>(await call(request, "PUT", `/v1/pages/${twin.id}/site`, { enabled: true }), "mesmo título")).slug, "endereço único").toBe("como-emitir-a-2-via-2");
    const nav = await (await pub(request, `/v1/public/site/${key}`)).json();
    expect(nav.pages.map((x: any) => x.title)).toEqual(expect.arrayContaining(["Como emitir a 2ª via", "Erros comuns"]));
    expect(nav.pages.find((x: any) => x.title === "Erros comuns").parentSlug, "filha publicada junto").toBe("como-emitir-a-2-via");
    expect(nav.pages.map((x: any) => x.title)).not.toContain("Interna");
    void child; void hidden;
    const page = await (await pub(request, `/v1/public/site/${key}/como-emitir-a-2-via`)).json();
    expect(JSON.stringify(page.content)).toContain(word);
    expect(page.id, "sem campos internos").toBeUndefined();
    expect((await pub(request, `/v1/public/site/${key}/interna`)).status(), "não publicada").toBe(404);
    const found = await (await pub(request, `/v1/public/site/${key}/search?q=${word}`)).json();
    expect(found.data.map((x: any) => x.slug)).toEqual(["como-emitir-a-2-via"]);
    expect((await pub(request, `/v1/public/site/${key}/como-emitir-a-2-via/feedback`, { method: "POST", data: { helpful: "talvez" } })).status()).toBe(400);
    await pub(request, `/v1/public/site/${key}/como-emitir-a-2-via/feedback`, { method: "POST", data: { helpful: true } });
    await pub(request, `/v1/public/site/${key}/como-emitir-a-2-via/feedback`, { method: "POST", data: { helpful: false } });
    const h = (await (await pub(request, `/v1/public/site/${key}/como-emitir-a-2-via`)).json()).helpful;
    expect(h, "um voto por visitante (o último vale)").toEqual({ yes: 0, no: 1, total: 1, pct: 0 });
    await ok(await call(request, "PUT", `/v1/pages/${a.id}/site`, { enabled: false }), "despublicar");
    expect((await pub(request, `/v1/public/site/${key}/erros-comuns`)).status(), "filha sai junto").toBe(404);
  });

  test("API: perfil atas — to-dos viram tarefas com responsável e prazo, sem repetir, e concluir a tarefa marca o to-do", async ({ request }) => {
    await register(request, newUser("pgata"));
    test.skip(!cfg.presets.includes("tarefas") && (await call(request, "GET", "/v1/task-projects")).status() === 404, "projeto sem o Tarefas");
    const myId = (await me(request)).user.id;
    await ok(await call(request, "PATCH", "/v1/pages/settings", { segment: "MEETINGS" }), "perfil atas");
    const tpl = items<any>(await ok(await call(request, "GET", "/v1/page-templates"), "modelos")).find((x) => x.builtin);
    expect(tpl, "modelo de ata do perfil").toBeTruthy();
    const pr = await ok<any>(await call(request, "POST", "/v1/task-projects", { name: `Reuniões ${uniq()}`, key: "R" + uniq().replace(/[^a-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X") }), "projeto");
    const pg = await newPage(request, { title: "Ata 15/10" });
    const a1 = "a1" + uniq(), a2 = "a2" + uniq();
    await ok(await save(request, pg.id, { content: [
      blk("checkListItem", [txt("Enviar proposta "), { type: "mention", props: { userId: myId, name: "Eu" } }, txt(" até 20/11/2027")], {}, a1),
      blk("checkListItem", [txt("Revisar contrato amanhã")], {}, a2),
      blk("checkListItem", [txt("Já resolvido")], { checked: true }),
    ] }), "ata");
    expect(pathsOf(await expectCode(await call(request, "POST", `/v1/pages/${pg.id}/action-items`, { projectId: "00000000-0000-0000-0000-000000000000" }), 400, "VALIDATION_ERROR", "projeto inválido"))).toContain("projectId");
    const r1 = await ok<any>(await call(request, "POST", `/v1/pages/${pg.id}/action-items`, { projectId: pr.id }), "criar tarefas");
    const by = Object.fromEntries(r1.created.map((x: any) => [x.blockId, x]));
    expect([by[a1].title, by[a1].assigneeId, String(by[a1].dueDate).slice(0, 10)]).toEqual(["Enviar proposta", myId, "2027-11-20"]);
    const tomorrow = new Date(Date.parse(today() + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
    expect([by[a2].title, String(by[a2].dueDate).slice(0, 10)]).toEqual(["Revisar contrato", tomorrow]);
    expect(r1.created.length, "o marcado não vira tarefa").toBe(2);
    expect((await ok<any>(await call(request, "POST", `/v1/pages/${pg.id}/action-items`, { projectId: pr.id }), "de novo")).created, "sem repetir").toEqual([]);
    const t = await ok<any>(await call(request, "GET", `/v1/tasks/by-key/${by[a1].taskKey}`), "tarefa");
    const done = (await ok<any>(await call(request, "GET", `/v1/task-projects/${pr.id}`), "projeto")).statuses.find((x: any) => x.category === "DONE");
    await ok(await call(request, "POST", `/v1/tasks/${t.id}/move`, { statusId: done.id }), "concluir a tarefa");
    const content = (await getPage(request, pg.id)).content;
    expect(content.find((b: any) => b.id === a1).props.checked, "to-do marcado").toBe(true);
    const list = items<any>(await ok(await call(request, "GET", `/v1/pages/${pg.id}/action-items`), "itens"));
    expect(list.find((x) => x.blockId === a1).status.category).toBe("DONE");
  });

  test("Tela: escolher o perfil do Páginas nas configurações", async ({ page }) => {
    await signUp(page, "pgperfiltela");
    await page.goto("/paginas/configuracoes");
    await page.getByTestId("pages-segment").selectOption("MEETINGS");
    await expect.poll(async () => (await ok<any>(await call(page.context().request, "GET", "/v1/pages/settings"), "configurações")).segment, { timeout: 10_000 }).toBe("MEETINGS");
  });

  test("Tela: comentar na página e resolver a conversa", async ({ page }) => {
    await signUp(page, "pgcomtela");
    const req = page.context().request;
    const pg = await newPage(req, { title: "Proposta" });
    await page.goto(`/paginas/${pg.id}`);
    await page.getByTestId("page-comment-input").fill("Falta o prazo de entrega");
    await page.getByTestId("page-comment-submit").click();
    const th = page.getByTestId("page-comments").locator("[data-thread-id]").first();
    await expect(th).toContainText("Falta o prazo de entrega");
    await th.getByTestId("page-comment-resolve").click();
    await expect.poll(async () => items<any>(await ok(await call(req, "GET", `/v1/pages/${pg.id}/comments?status=resolved`), "resolvidas")).length, { timeout: 10_000 }).toBe(1);
  });

  test("Tela: histórico restaura a versão anterior", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request;
    const pg = await newPage(o, { title: "Regras" });
    await ok(await save(o, pg.id, { content: [para("Versão boa")] }), "versão boa");
    await ok(await save(memberCtx.request, pg.id, { content: [para("Versão ruim")] }), "versão ruim");
    const page = await ownerCtx.newPage();
    await page.goto(`/paginas/${pg.id}`);
    await page.getByTestId("page-history").click();
    await page.getByTestId("page-history-restore").last().click();
    await expect.poll(async () => JSON.stringify((await getPage(o, pg.id)).content), { timeout: 10_000 }).toContain("Versão boa");
    await Promise.all([ownerCtx.close(), memberCtx.close()]);
  });

  test("Tela: calendário da database mostra a linha no dia", async ({ page }) => {
    await signUp(page, "pgcaltela");
    const req = page.context().request;
    await ensureFeature(req, "page_databases_plus");
    const dbId = await database(req, "Agenda de eventos");
    const quando = await prop(req, dbId, { name: "Quando", type: "DATE" });
    await ok(await call(req, "POST", `/v1/databases/${dbId}/views`, { name: "Calendário", type: "CALENDAR", config: { dateProperty: quando.id } }), "visão");
    const r = await row(req, dbId, "Workshop", { [quando.id]: { start: "2027-03-10" } });
    await page.goto(`/paginas/${dbId}?mes=2027-03`);
    await page.locator('[data-testid="db-view-tab"][data-view-type="CALENDAR"]').click();
    await expect(page.locator('[data-testid="db-calendar-day"][data-date="2027-03-10"]').locator(`[data-testid="db-calendar-item"][data-page-id="${r.id}"]`)).toBeVisible();
  });

  test("Tela: base pública abre sem login e registra o voto", async ({ page, browser }) => {
    await signUp(page, "pgkbtela");
    const req = page.context().request;
    await ensureFeature(req, "public_pages");
    const pg = await newPage(req, { title: "Primeiros passos" });
    await ok(await save(req, pg.id, { title: "Primeiros passos", content: [para("Bem-vindo à central")] }), "conteúdo");
    const s = await ok<any>(await call(req, "PUT", `/v1/pages/${pg.id}/site`, { enabled: true }), "publicar");
    const ctx = await browser.newContext();
    const anon = await ctx.newPage();
    await anon.goto(s.url);
    await expect(anon.getByTestId("kb-page")).toContainText("Bem-vindo à central");
    await anon.getByTestId("kb-helpful-yes").click();
    const key = new URL(s.url).pathname.split("/")[2];
    await expect.poll(async () => (await (await pub(req, `/v1/public/site/${key}/${s.slug}`)).json()).helpful.yes, { timeout: 10_000 }).toBe(1);
    await ctx.close();
  });
});
