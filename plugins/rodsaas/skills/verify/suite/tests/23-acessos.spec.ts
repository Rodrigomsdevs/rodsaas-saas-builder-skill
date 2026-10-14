import { test, expect, type APIRequestContext, type APIResponse, type Browser } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { linkFrom, waitForEmail } from "../support/mailpit";
import { newContext } from "../support/ui";

// Acessos da pessoa (base: skills/backend/references/10-acessos-por-pessoa.md). Quem convida escolhe no convite os apps
// e, em cada app, o papel; a pessoa entra usando. O que quem convida não pode dar (papel que ele não dá, assento pago que
// só o owner aprova) vira pedido de acesso criado no aceite. Ajuste por pessoa e pedidos de acesso.
// Os testes usam os apps instalados que têm papel (Suporte, Comercial, Financeiro) e pulam o que não existir.

async function expectCode(res: APIResponse, status: number, code: string, label: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  const json = JSON.parse(body || "{}");
  expect(json.code, `${label}: code`).toBe(code);
  return json;
}
const pathsOf = (b: any) => (b?.errors ?? []).map((e: any) => e.path) as string[];
const denied = async (res: APIResponse, label: string) => {
  expect(res.status(), `${label} → 403`).toBe(403);
  expect(["NOT_COM_MEMBER", "NOT_FIN_MEMBER", "NOT_AN_AGENT", "APP_ACCESS_DENIED"], `${label}: código`).toContain((await res.json()).code);
};

type Opt = { appId: string; name: string; usesAppAccess?: boolean; included?: boolean; fields: { key: string; type: string; options?: { value: string }[] }[] };
async function options(req: APIRequestContext) {
  const res = await call(req, "GET", "/v1/access/options");
  expect(res.status(), "GET /v1/access/options existe (acessos da pessoa, skills/backend/references/10-acessos-por-pessoa.md)").toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.apps), "{ apps: [...] }").toBe(true);
  return body.apps as Opt[];
}
const has = (apps: Opt[], id: string) => apps.some((a) => a.appId === id);

async function owner(browser: Browser) {
  const ctx = await newContext(browser);
  const user = newUser("acc");
  await register(ctx.request, user);
  return { user, ctx, req: ctx.request };
}
/** Convida (pela API, com acessos) e aceita com conta nova. */
async function inviteAndJoin(browser: Browser, mailReq: APIRequestContext, inviterReq: APIRequestContext, ownerReq: APIRequestContext, body: Record<string, unknown>, tag = "conv") {
  const u = newUser(tag);
  const inv = await ok<any>(await call(inviterReq, "POST", "/v1/invitations", { email: u.email, role: "MEMBER", ...body }), "convite com acessos");
  const mail = await waitForEmail(mailReq, u.email, { contains: "/convite" });
  const token = new URL(linkFrom(mail, "/convite")).searchParams.get("token");
  const ctx = await newContext(browser);
  await register(ctx.request, u, { invitationToken: token });
  const m = items<any>(await ok(await call(ownerReq, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === u.email);
  expect(m, `membro ${u.email}`).toBeTruthy();
  return { user: u, ctx, req: ctx.request, memberId: m.id as string, userId: m.user.id as string, inv };
}
async function adminOf(browser: Browser, mailReq: APIRequestContext, ownerReq: APIRequestContext) {
  const a = await inviteAndJoin(browser, mailReq, ownerReq, ownerReq, {}, "admin");
  await ok(await call(ownerReq, "PATCH", `/v1/members/${a.memberId}`, { role: "ADMIN" }), "promover a ADMIN");
  return a;
}
const accessOf = async (req: APIRequestContext, memberId: string) => ok<any>(await call(req, "GET", `/v1/members/${memberId}/access`), "acessos da pessoa");
const requestsOf = async (req: APIRequestContext) => items<any>(await ok(await call(req, "GET", "/v1/access/requests?status=PENDING"), "pedidos de acesso"));

test.describe("Acessos da pessoa", () => {
  test("API: opções de cada app e validação do convite com acessos", async ({ browser }) => {
    const o = await owner(browser);
    const apps = await options(o.req);
    for (const a of apps) for (const f of a.fields) expect(["boolean", "select", "multiselect"], `${a.appId}.${f.key}: tipo`).toContain(f.type);
    if (has(apps, "helpdesk")) expect(apps.find((a) => a.appId === "helpdesk")!.fields.map((f) => f.key), "Suporte: é atendente").toContain("isAgent");
    if (has(apps, "comercial")) expect(apps.find((a) => a.appId === "comercial")!.fields.find((f) => f.key === "role")?.options?.map((x) => x.value), "Comercial: papéis").toEqual(expect.arrayContaining(["COM_ADMIN", "SELLER", "VIEWER"]));
    if (has(apps, "financeiro")) expect(apps.find((a) => a.appId === "financeiro")!.fields.find((f) => f.key === "role")?.options?.map((x) => x.value), "Financeiro: papéis").toEqual(expect.arrayContaining(["FIN_ADMIN", "FIN", "VIEWER"]));

    const e1 = await expectCode(await call(o.req, "POST", "/v1/invitations", { email: `x.${uniq()}@example.com`, role: "MEMBER", access: { appQueNaoExiste: {} } }), 400, "VALIDATION_ERROR", "app desconhecido");
    expect(pathsOf(e1), "erro no caminho access.<app>").toContain("access.appQueNaoExiste");
    if (has(apps, "comercial")) {
      const e2 = await expectCode(await call(o.req, "POST", "/v1/invitations", { email: `x.${uniq()}@example.com`, role: "MEMBER", access: { comercial: { options: { role: "DONO" } } } }), 400, "VALIDATION_ERROR", "papel que não existe");
      expect(pathsOf(e2), "erro no campo").toContain("access.comercial.role");
      const chk = await ok<any>(await call(o.req, "POST", "/v1/invitations/check", { role: "MEMBER", access: { comercial: { options: { role: "SELLER" } } } }), "prévia do convite");
      expect(chk.grant, "owner dá o papel de vendedor").toContain("comercial");
      expect(chk.request ?? [], "nada vira pedido").toEqual([]);
    }
  });

  test("API: convite do owner com acessos — a pessoa entra usando, sem pedir nada", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const apps = await options(o.req);
    const access: Record<string, unknown> = {};
    if (has(apps, "helpdesk")) access.helpdesk = { options: { isAgent: true } };
    if (has(apps, "comercial")) access.comercial = { options: { role: "SELLER" } };
    if (has(apps, "financeiro")) access.financeiro = { options: { role: "FIN" } };
    test.skip(!Object.keys(access).length, "nenhum app com papel instalado (Suporte, Comercial ou Financeiro)");
    const m = await inviteAndJoin(browser, request, o.req, o.req, { access });
    expect([...(m.inv.access?.grant ?? [])].sort(), "tudo vale no aceite").toEqual(Object.keys(access).sort());
    if (access.helpdesk) await ok(await call(m.req, "GET", "/v1/helpdesk/views/counts"), "já é atendente do Suporte");
    if (access.comercial) expect((await ok<any>(await call(m.req, "GET", "/v1/com/me"), "Comercial")).role, "vendedora no Comercial").toBe("SELLER");
    if (access.financeiro) expect((await ok<any>(await call(m.req, "GET", "/v1/fin/me"), "Financeiro")).role, "papel no Financeiro").toBe("FIN");
    const acc = await accessOf(o.req, m.memberId);
    if (access.comercial) expect(acc.apps?.comercial?.role, "tela da pessoa lê do app").toBe("SELLER");
    if (access.helpdesk) expect(acc.apps?.helpdesk?.isAgent, "atendente na tela da pessoa").toBe(true);
    expect((await requestsOf(o.req)).filter((r) => r.user?.id === m.userId), "nenhum pedido pendente").toEqual([]);
    expect((await call(m.req, "GET", `/v1/members/${m.memberId}/access`)).status(), "a pessoa vê os próprios acessos").toBe(200);
  });

  test("API: ajuste por pessoa — tirar e dar papéis num lugar só", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const apps = await options(o.req);
    test.skip(!has(apps, "comercial") || !has(apps, "financeiro"), "precisa do Comercial e do Financeiro");
    const m = await inviteAndJoin(browser, request, o.req, o.req, { access: { comercial: { options: { role: "SELLER" } } } });
    await denied(await call(m.req, "GET", "/v1/fin/entries"), "sem papel no Financeiro");
    const r = await ok<any>(await call(o.req, "PUT", `/v1/members/${m.memberId}/access`, { access: { comercial: null, financeiro: { options: { role: "VIEWER" } } } }), "ajustar");
    expect([r.removed, r.applied], "tirou o Comercial e deu o Financeiro").toEqual([["comercial"], ["financeiro"]]);
    await denied(await call(m.req, "GET", "/v1/com/proposals"), "sem o Comercial");
    expect((await ok<any>(await call(m.req, "GET", "/v1/fin/me"), "Financeiro")).role, "leitor no Financeiro").toBe("VIEWER");
    const acc = await accessOf(o.req, m.memberId);
    expect([acc.apps?.comercial ?? null, acc.apps?.financeiro?.role], "tela da pessoa").toEqual([null, "VIEWER"]);
    expect((await call(m.req, "PUT", `/v1/members/${m.memberId}/access`, { access: { financeiro: { options: { role: "FIN_ADMIN" } } } })).status(), "membro não ajusta os próprios acessos").toBe(403);
  });

  test("API: o que o admin não pode dar vira pedido no aceite e o owner aprova", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const apps = await options(o.req);
    test.skip(!has(apps, "financeiro"), "precisa do Financeiro");
    const A = await adminOf(browser, request, o.req);
    const x = await inviteAndJoin(browser, request, A.req, o.req, { access: { financeiro: { options: { role: "FIN_ADMIN" } } } }, "pedido");
    expect(x.inv.access?.request?.map((r: any) => [r.appId, r.reason]), "convite criado, o Financeiro vai como pedido").toEqual([["financeiro", "NOT_GRANTABLE"]]);
    await denied(await call(x.req, "GET", "/v1/fin/entries"), "entrou sem o Financeiro");
    const req = (await requestsOf(o.req)).find((r) => r.user?.id === x.userId && r.appId === "financeiro");
    expect(req, "pedido criado sozinho no aceite").toBeTruthy();
    expect([req.sources, req.reason, req.options?.role], "veio do convite, com o papel escolhido").toEqual([expect.arrayContaining(["INVITE"]), "NOT_GRANTABLE", "FIN_ADMIN"]);
    expect(req.requestedBy?.id, "quem convidou").toBe(A.userId);
    expect((await call(A.req, "POST", `/v1/access/requests/${req.id}/approve`, {})).status(), "o admin não aprova o que não pode dar").toBe(403);
    await ok(await call(o.req, "POST", `/v1/access/requests/${req.id}/approve`, {}), "owner aprova");
    expect((await ok<any>(await call(x.req, "GET", "/v1/fin/me"), "Financeiro")).role, "papel aplicado").toBe("FIN_ADMIN");
    expect((await requestsOf(o.req)).some((r) => r.id === req.id), "sai dos pendentes").toBe(false);
    await expectCode(await call(o.req, "POST", `/v1/access/requests/${req.id}/approve`, {}), 409, "NOT_PENDING", "aprovar de novo");
  });

  test("API: pedido de acesso pela pessoa — sem duplicar, recusa e aprovação", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const apps = await options(o.req);
    test.skip(!has(apps, "comercial"), "precisa do Comercial");
    const m = await inviteAndJoin(browser, request, o.req, o.req, {});
    await expectCode(await call(m.req, "POST", "/v1/access/requests", { appId: "appQueNaoExiste" }), 400, "VALIDATION_ERROR", "app desconhecido");
    const r1 = await call(m.req, "POST", "/v1/access/requests", { appId: "comercial", options: { role: "SELLER" }, message: "Vou vender a linha nova" });
    expect(r1.status(), "pedido criado").toBe(201);
    const id = (await r1.json()).id;
    const r2 = await call(m.req, "POST", "/v1/access/requests", { appId: "comercial", options: { role: "SELLER" } });
    expect([r2.status(), (await r2.json()).id], "pedir de novo junta no mesmo").toEqual([200, id]);
    expect((await requestsOf(o.req)).filter((r) => r.user?.id === m.userId).length, "um pedido só").toBe(1);
    expect((await call(m.req, "GET", "/v1/access/requests?status=PENDING")).status(), "membro não lista os pedidos de todos").toBe(403);
    await ok(await call(o.req, "POST", `/v1/access/requests/${id}/decline`, { reason: "Ainda não" }), "recusar");
    await denied(await call(m.req, "GET", "/v1/com/proposals"), "recusado continua sem acesso");
    const r3 = await ok<any>(await call(m.req, "POST", "/v1/access/requests", { appId: "comercial", options: { role: "SELLER" } }), "pedir de novo depois da recusa");
    expect(r3.id, "pedido novo").not.toBe(id);
    await ok(await call(o.req, "POST", `/v1/access/requests/${r3.id}/approve`, {}), "aprovar");
    expect((await ok<any>(await call(m.req, "GET", "/v1/com/me"), "Comercial")).role, "vendedora").toBe("SELLER");
    await expectCode(await call(m.req, "POST", "/v1/access/requests", { appId: "comercial", options: { role: "SELLER" } }), 409, "ALREADY_HAS_ACCESS", "pedir o que já tem");
  });

  test("API (workstation): sem assento livre o owner confirma o valor e o convite do admin vira pedido", async ({ browser, request }) => {
    test.slow();
    test.skip(!cfg.addons.includes("workstation"), "projeto sem a workstation");
    const o = await owner(browser);
    test.skip((await billingMode(o.req)) !== "fake", "assinar exige o modo de teste da cobrança");
    const apps = await options(o.req);
    test.skip(!has(apps, "crm"), "precisa do CRM");
    const A = await adminOf(browser, request, o.req);
    const ownerId = (await me(o.req)).user.id;
    await ok(await call(o.req, "PUT", "/v1/workstation/apps/crm/access", { userIds: [ownerId] }), "só o owner no CRM");
    await ok(await call(o.req, "POST", "/v1/workstation/checkout", { model: "apps", apps: { crm: { seats: 1 } }, users: 3, cycle: "month" }), "assinar o CRM com 1 assento");
    const qty = async () => ((await ok<any>(await call(o.req, "GET", "/v1/workstation/subscription"), "assinatura")).items as any[]).find((i) => i.key === "app:crm")?.quantity;

    const chk = await ok<any>(await call(o.req, "POST", "/v1/invitations/check", { role: "MEMBER", access: { crm: {} } }), "prévia do owner");
    expect(chk.confirm?.apps, "owner sem assento: pede confirmação do valor").toContain("crm");
    expect(chk.confirm?.newMonthly, "novo valor na prévia").toBeGreaterThan(0);
    const email = `ws.${uniq()}@example.com`;
    await expectCode(await call(o.req, "POST", "/v1/invitations", { email, role: "MEMBER", access: { crm: {} } }), 409, "CONFIRM_REQUIRED", "convidar sem confirmar o valor");
    expect(await qty(), "convite não cobra").toBe(1);
    const X = await inviteAndJoin(browser, request, o.req, o.req, { access: { crm: {} }, confirm: true }, "wsx");
    await ok(await call(X.req, "GET", "/v1/crm/deals"), "convidado pelo owner usa o CRM");
    expect(await qty(), "assento sobe no aceite").toBe(2);

    const chkA = await ok<any>(await call(A.req, "POST", "/v1/invitations/check", { role: "MEMBER", access: { crm: {} } }), "prévia do admin");
    expect((chkA.request ?? []).map((r: any) => [r.appId, r.reason]), "admin sem assento: vira pedido").toEqual([["crm", "NO_SEAT"]]);
    const Y = await inviteAndJoin(browser, request, A.req, o.req, { access: { crm: {} } }, "wsy");
    await expectCode(await call(Y.req, "GET", "/v1/crm/deals"), 403, "APP_ACCESS_DENIED", "entrou sem o CRM");
    const req = (await requestsOf(o.req)).find((r) => r.user?.id === Y.userId && r.appId === "crm");
    expect([req?.reason, req?.sources], "pedido NO_SEAT do convite").toEqual(["NO_SEAT", expect.arrayContaining(["INVITE"])]);
    await expectCode(await call(A.req, "POST", `/v1/access/requests/${req.id}/approve`, {}), 403, "OWNER_APPROVAL_REQUIRED", "admin não aprova o que muda o valor");
    await expectCode(await call(o.req, "POST", `/v1/access/requests/${req.id}/approve`, {}), 409, "CONFIRM_REQUIRED", "owner aprova sem confirmar");
    await ok(await call(o.req, "POST", `/v1/access/requests/${req.id}/approve`, { confirm: true }), "owner aprova com o valor");
    await ok(await call(Y.req, "GET", "/v1/crm/deals"), "agora usa o CRM");
    expect(await qty(), "3 assentos").toBe(3);

    await ok(await call(o.req, "PUT", "/v1/workstation/apps/crm/access", { userIds: [ownerId, Y.userId] }), "tirar o X libera um assento");
    const wEmail = `wsw.${uniq()}@example.com`;
    const W = await ok<any>(await call(A.req, "POST", "/v1/invitations", { email: wEmail, role: "MEMBER", access: { crm: {} } }), "admin convida com o assento livre");
    expect(W.access?.grant, "com assento livre vale").toContain("crm");
    await ok(await call(o.req, "PUT", "/v1/workstation/apps/crm/access", { userIds: [ownerId, Y.userId, X.userId] }), "owner ocupa o assento pela loja antes do aceite");
    const wMail = await waitForEmail(request, wEmail, { contains: "/convite" });
    const wCtx = await newContext(browser);
    await register(wCtx.request, { ...newUser("wsw"), email: wEmail }, { invitationToken: new URL(linkFrom(wMail, "/convite")).searchParams.get("token") });
    await expectCode(await call(wCtx.request, "GET", "/v1/crm/deals"), 403, "APP_ACCESS_DENIED", "no aceite a política roda de novo: sem assento, vira pedido");
    const wId = (await me(wCtx.request)).user.id;
    expect((await requestsOf(o.req)).some((r) => r.appId === "crm" && r.reason === "NO_SEAT" && r.user?.id === wId), "pedido NO_SEAT no aceite").toBe(true);
    expect(await qty(), "não cobrou sem o owner").toBe(3);
    await ok(await call(o.req, "PUT", "/v1/workstation/apps/crm/access", { userIds: [ownerId, Y.userId] }), "libera de novo");
    const Z = await inviteAndJoin(browser, request, A.req, o.req, { access: { crm: {} } }, "wsz");
    expect(Z.inv.access?.grant, "com assento livre o admin dá o acesso").toContain("crm");
    await ok(await call(Z.req, "GET", "/v1/crm/deals"), "Z usa o CRM");
    expect(await qty(), "não cobra de novo").toBe(3);
  });

  test("Tela: convidar escolhendo o que a pessoa vai usar e ajustar depois na tela da pessoa", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const apps = await options(o.req);
    const pick = ["comercial", "financeiro"].find((id) => has(apps, id));
    test.skip(!pick, "precisa do Comercial ou do Financeiro (papel por select)");
    const role = pick === "comercial" ? "SELLER" : "FIN";
    const page = await o.ctx.newPage();
    await page.goto("/configuracoes/membros");
    await page.getByTestId("invite-button").click();
    const email = `tela.${uniq()}@example.com`;
    await page.getByTestId("invite-email").fill(email);
    await expect(page.getByTestId("invite-access"), "seção O que essa pessoa vai usar").toBeVisible();
    await page.locator(`[data-testid="invite-access-app"][data-app="${pick}"]`).check();
    await page.locator(`[data-testid="invite-access-field"][data-app="${pick}"][data-key="role"]`).selectOption(role);
    await page.getByTestId("invite-submit").click();
    await expect(page.getByTestId("invitation-row").filter({ hasText: email }), "convite pendente").toBeVisible();

    const mail = await waitForEmail(request, email, { contains: "/convite" });
    const token = new URL(linkFrom(mail, "/convite")).searchParams.get("token");
    const u = { ...newUser("tela"), email };
    const ctx = await newContext(browser);
    await register(ctx.request, u, { invitationToken: token });
    const path = pick === "comercial" ? "/v1/com/me" : "/v1/fin/me";
    expect((await ok<any>(await call(ctx.request, "GET", path), "app do convite")).role, "entrou com o papel escolhido na tela").toBe(role);

    await page.goto("/configuracoes/membros");
    await page.getByTestId("member-row").filter({ hasText: email }).getByTestId("member-access-open").click();
    const box = page.locator(`[data-testid="invite-access-app"][data-app="${pick}"]`);
    await expect(box, "tela da pessoa mostra o app marcado").toBeChecked();
    await box.uncheck();
    await page.getByTestId("member-access-save").click();
    await expect.poll(async () => (await call(ctx.request, "GET", path)).status(), { message: "tirado pela tela da pessoa" }).toBe(403);
  });
});
