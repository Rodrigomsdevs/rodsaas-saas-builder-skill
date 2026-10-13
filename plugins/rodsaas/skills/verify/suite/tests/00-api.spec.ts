import { test, expect, request as pwRequest } from "@playwright/test";
import { cfg } from "../support/config.mjs";
import {
  billingMode, call, createOrg, createProject, hasProjectsModule, items, me, newUser, ok, plansFromApi, register, sleep, switchOrg, uniq,
} from "../support/api";
import { linkFrom, waitForEmail } from "../support/mailpit";

test.describe("API · formato e segurança", () => {
  test("health responde 200", async ({ request }) => {
    const r = await request.get(`${cfg.apiURL}/health`, { failOnStatusCode: false });
    expect(r.status(), "API fora do ar? Suba com npm run dev em api/").toBe(200);
  });

  test("rota inexistente devolve RFC 9457 com code e requestId", async ({ request }) => {
    const r = await call(request, "GET", "/v1/rota-que-nao-existe-rodsaas");
    expect(r.status()).toBe(404);
    expect(r.headers()["content-type"] ?? "").toContain("application/problem+json");
    const b = await r.json();
    expect(b).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(b.requestId, "requestId no corpo do erro").toBeTruthy();
    expect(r.headers()["x-request-id"], "header x-request-id").toBeTruthy();
  });

  test("sem login, /v1/me responde 401 UNAUTHORIZED", async ({ request }) => {
    const r = await call(request, "GET", "/v1/me");
    expect(r.status()).toBe(401);
    expect((await r.json()).code).toBe("UNAUTHORIZED");
  });

  test("validação devolve VALIDATION_ERROR com errors[]", async ({ request }) => {
    const r = await call(request, "POST", "/v1/auth/register", {
      name: "x", email: "isto-nao-e-email", password: "1", organizationName: "",
    });
    expect(r.status()).toBe(400);
    const b = await r.json();
    expect(b.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(b.errors) && b.errors.length > 0, "errors[] com os campos").toBeTruthy();
  });

  test("mutação vinda de outro site é bloqueada (CSRF)", async () => {
    const ctx = await pwRequest.newContext();
    await register(ctx, newUser("csrf"));
    const r = await call(ctx, "POST", "/v1/organizations", { name: "Invasora" }, { origin: "https://site-malicioso.example" });
    expect(r.status()).toBe(403);
    await ctx.dispose();
  });

  test("cookies de sessão: httpOnly, refresh restrito e session_hint", async () => {
    const ctx = await pwRequest.newContext();
    await register(ctx, newUser("cookie"));
    const cookies = (await ctx.storageState()).cookies;
    const c = (n: string) => cookies.find((x) => x.name === n);
    expect(c("access_token")?.httpOnly, "access_token httpOnly").toBe(true);
    expect(c("refresh_token")?.httpOnly, "refresh_token httpOnly").toBe(true);
    expect(c("refresh_token")?.path, "refresh_token só em /v1/auth").toBe("/v1/auth");
    expect(c("session_hint"), "cookie session_hint").toBeTruthy();
    expect(c("session_hint")?.httpOnly, "session_hint legível pelo front").toBe(false);
    const access = c("access_token");
    if (access && access.expires > 0) {
      const hours = (access.expires * 1000 - Date.now()) / 3_600_000;
      expect(hours, "cookie do access token deve durar como o refresh (não 15 min), senão o front nunca renova").toBeGreaterThan(1);
    }
    await ctx.dispose();
  });
});

test.describe("API · sessão e empresas", () => {
  test("/v1/me traz usuário, empresa ativa, empresas e plano", async () => {
    const ctx = await pwRequest.newContext();
    const u = newUser("me");
    await register(ctx, u);
    const m = await me(ctx);
    expect(m.user.email).toBe(u.email);
    expect(m.organization?.name).toBe(u.organizationName);
    expect(m.organization?.role).toBe("OWNER");
    expect(m.organizations).toHaveLength(1);
    expect(m.plan, "plano efetivo no /v1/me").toBeTruthy();
    await ctx.dispose();
  });

  test("criar empresa a torna ativa e trocar volta para a anterior", async () => {
    const ctx = await pwRequest.newContext();
    const u = newUser("orgs");
    await register(ctx, u);
    const second = `Segunda ${uniq()}`;
    await createOrg(ctx, second);
    let m = await me(ctx);
    expect(m.organization?.name, "empresa recém-criada vira a ativa").toBe(second);
    expect(m.organizations).toHaveLength(2);
    const first = m.organizations.find((o) => o.name === u.organizationName)!;
    await switchOrg(ctx, first.id);
    m = await me(ctx);
    expect(m.organization?.id).toBe(first.id);
    await ctx.dispose();
  });

  test("não troca para empresa da qual não é membro", async () => {
    const a = await pwRequest.newContext();
    const b = await pwRequest.newContext();
    await register(a, newUser("orga"));
    await register(b, newUser("orgb"));
    const orgB = (await me(b)).organization!.id;
    const r = await call(a, "POST", "/v1/auth/switch-organization", { organizationId: orgB });
    expect([403, 404]).toContain(r.status());
    await a.dispose();
    await b.dispose();
  });

  test("isolamento: recurso de outra empresa responde 404", async ({ request }) => {
    test.skip(!(await hasProjectsModule(request)), "projeto sem o módulo de exemplo /v1/projects");
    const a = await pwRequest.newContext();
    const b = await pwRequest.newContext();
    await register(a, newUser("isoa"));
    await register(b, newUser("isob"));
    const p = await createProject(a, `Segredo ${uniq()}`);
    expect((await call(b, "GET", `/v1/projects/${p.id}`)).status()).toBe(404);
    expect((await call(b, "PATCH", `/v1/projects/${p.id}`, { name: "hack" })).status()).toBe(404);
    expect((await call(b, "DELETE", `/v1/projects/${p.id}`)).status()).toBe(404);
    const list = items(await ok(await call(b, "GET", "/v1/projects"), "lista da empresa B"));
    expect(list.find((x: any) => x.id === p.id), "projeto da A na lista da B").toBeUndefined();
    await a.dispose();
    await b.dispose();
  });

  test("último owner não pode se rebaixar nem sair", async () => {
    const ctx = await pwRequest.newContext();
    const u = newUser("lastowner");
    await register(ctx, u);
    const members = items(await ok(await call(ctx, "GET", "/v1/members"), "membros"));
    const self = members.find((m: any) => m.user?.email === u.email);
    expect(self, "o próprio usuário na lista de membros").toBeTruthy();
    expect((await call(ctx, "PATCH", `/v1/members/${self.id}`, { role: "ADMIN" })).status()).toBeGreaterThanOrEqual(400);
    expect((await call(ctx, "POST", "/v1/members/leave")).status()).toBeGreaterThanOrEqual(400);
    await ctx.dispose();
  });

  test("membro não convida (403)", async () => {
    // owner convida, convidado entra via cadastro com convite, e tenta convidar outra pessoa
    const ownerCtx = await pwRequest.newContext();
    await register(ownerCtx, newUser("own2"));
    const member = newUser("mem2");
    await ok(await call(ownerCtx, "POST", "/v1/invitations", { email: member.email, role: "MEMBER" }), "convite");
    const mail = await waitForEmail(ownerCtx, member.email, { contains: "/convite" });
    const token = new URL(linkFrom(mail, "/convite")).searchParams.get("token");
    const memberCtx = await pwRequest.newContext();
    await register(memberCtx, member, { invitationToken: token });
    const m = await me(memberCtx);
    expect(m.organizations, "convidado não ganha empresa própria").toHaveLength(1);
    expect(m.organization?.role).toBe("MEMBER");
    const r = await call(memberCtx, "POST", "/v1/invitations", { email: `x.${uniq()}@example.com`, role: "MEMBER" });
    expect(r.status()).toBe(403);
    const { paid } = await plansFromApi(memberCtx);
    if (paid[0]) {
      const c = await call(memberCtx, "POST", "/v1/billing/checkout-sessions", { plan: paid[0].id, interval: "month" });
      expect(c.status(), "membro não assina plano").toBe(403);
    }
    await ownerCtx.dispose();
    await memberCtx.dispose();
  });

  test("refresh rotaciona e reuso do antigo derruba a sessão inteira", async () => {
    test.slow();
    const ctx = await pwRequest.newContext();
    await register(ctx, newUser("reuse"));
    const old = (await ctx.storageState()).cookies.find((c) => c.name === "refresh_token")!;
    expect(old, "cookie refresh_token").toBeTruthy();
    expect((await call(ctx, "POST", "/v1/auth/refresh")).status(), "refresh normal").toBeLessThan(300);
    const rotated = (await ctx.storageState()).cookies.find((c) => c.name === "refresh_token")!;
    expect(rotated.value, "refresh token deve mudar a cada uso").not.toBe(old.value);

    await sleep(11_000); // passa a janela de tolerância de requisições simultâneas
    const thief = await pwRequest.newContext({ storageState: { cookies: [old], origins: [] } });
    expect((await call(thief, "POST", "/v1/auth/refresh")).status(), "reuso do token antigo").toBe(401);
    expect((await call(ctx, "POST", "/v1/auth/refresh")).status(), "família revogada após reuso").toBe(401);
    await thief.dispose();
    await ctx.dispose();
  });

  test("logout encerra a sessão", async () => {
    const ctx = await pwRequest.newContext();
    await register(ctx, newUser("logout"));
    expect((await call(ctx, "POST", "/v1/auth/logout")).status()).toBeLessThan(300);
    expect((await call(ctx, "GET", "/v1/me")).status()).toBe(401);
    expect((await call(ctx, "POST", "/v1/auth/refresh")).status()).toBe(401);
    await ctx.dispose();
  });
});

test.describe("API · planos e cobrança", () => {
  test("planos com preço, /v1/me com modo de cobrança e free não é comprável", async () => {
    const ctx = await pwRequest.newContext();
    await register(ctx, newUser("plans"));
    const { all, paid } = await plansFromApi(ctx);
    expect(all.length).toBeGreaterThan(0);
    expect(paid.length, "pelo menos um plano pago com prices.month (centavos)").toBeGreaterThan(0);
    const free = all.find((p) => !p.prices);
    const m: any = await me(ctx);
    expect(["stripe", "fake", "disabled"], "me.billing.mode").toContain(m.billing?.mode);
    expect(m.billing?.canManage, "owner pode gerenciar a cobrança").toBe(true);
    if (free) {
      const r = await call(ctx, "POST", "/v1/billing/checkout-sessions", { plan: free.id, interval: "month" });
      expect(r.status()).toBe(400);
      expect((await r.json()).code).toBe("PLAN_NOT_PURCHASABLE");
    }
    await ctx.dispose();
  });

  test("modo de teste: assinar, trocar, cancelar e retomar sem Stripe", async () => {
    const ctx = await pwRequest.newContext();
    await register(ctx, newUser("fakebill"));
    const mode = await billingMode(ctx);
    test.skip(mode !== "fake", `cobrança em modo "${mode}" (este teste roda no modo de teste, sem Stripe)`);
    const { paid } = await plansFromApi(ctx);
    const [p1, p2] = paid;

    const notSub = await call(ctx, "POST", "/v1/billing/change-plan", { plan: p1.id, interval: "month" });
    expect(notSub.status(), "trocar sem assinar").toBe(409);
    expect((await notSub.json()).code).toBe("NOT_SUBSCRIBED");

    const co = await ok(await call(ctx, "POST", "/v1/billing/checkout-sessions", { plan: p1.id, interval: "month" }), "checkout (fake)");
    expect(co.url, "checkout devolve url").toBeTruthy();
    let m: any = await me(ctx);
    expect(m.plan.id, "plano aplicado na hora no modo de teste").toBe(p1.id);
    expect(m.plan.limits, "limites do novo plano").toEqual(p1.limits);

    const again = await call(ctx, "POST", "/v1/billing/checkout-sessions", { plan: p1.id, interval: "month" });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("ALREADY_SUBSCRIBED");
    const same = await call(ctx, "POST", "/v1/billing/change-plan", { plan: p1.id, interval: "month" });
    expect((await same.json()).code).toBe("SAME_PLAN");

    if (p2) {
      const preview = await ok(await call(ctx, "GET", `/v1/billing/change-plan/preview?plan=${p2.id}&interval=month`), "prévia da troca");
      expect(typeof preview.amountDue, "prévia com amountDue").toBe("number");
      await ok(await call(ctx, "POST", "/v1/billing/change-plan", { plan: p2.id, interval: "month" }), "trocar de plano");
      m = await me(ctx);
      expect(m.plan.id).toBe(p2.id);
    }

    await ok(await call(ctx, "POST", "/v1/billing/cancel"), "cancelar");
    m = await me(ctx);
    expect(m.plan.cancelAtPeriodEnd, "cancelamento agendado").toBe(true);
    expect(m.plan.id, "continua no plano até o fim do período").toBe((p2 ?? p1).id);
    await ok(await call(ctx, "POST", "/v1/billing/resume"), "retomar");
    expect(((await me(ctx)) as any).plan.cancelAtPeriodEnd).toBe(false);
    await ctx.dispose();
  });
});
