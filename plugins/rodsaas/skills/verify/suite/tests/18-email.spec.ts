import { createHmac, randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { call, newUser, register, sleep } from "../support/api";
import { cfg } from "../support/config.mjs";
import { waitForEmail } from "../support/mailpit";

// Parte do /rodsaas:email (Resend). Roda quando rodsaas.json tem "email" em addons ou a API tem POST /v1/webhooks/resend.
// Os testes com assinatura válida leem RESEND_WEBHOOK_SECRET do api/.env (ou da variável de ambiente) e assinam
// no formato Svix, igual ao Resend. Nada é enviado ao Resend: e-mails continuam no Mailpit.

const HOOK = "/v1/webhooks/resend";

/** Cabeçalhos svix-* (HMAC-SHA256 de "id.timestamp.corpo" com a chave do whsec_ em base64). */
function svix(secret: string, body: string, opts: { id?: string; timestamp?: number } = {}) {
  const id = opts.id ?? `msg_${randomUUID()}`;
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` };
}

const event = (type: string, data: Record<string, unknown>) =>
  JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: randomUUID(), created_at: new Date().toISOString(), from: "Produto <no-reply@example.com>", subject: "teste", ...data } });

async function hook(playwright: any, body: string, headers: Record<string, string> = {}) {
  const ctx = await playwright.request.newContext();
  const res = await ctx.fetch(cfg.apiURL + HOOK, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, data: body, failOnStatusCode: false });
  const out = { status: res.status(), body: await res.text() };
  await ctx.dispose();
  return out;
}

async function installed(req: APIRequestContext) {
  if (cfg.addons.includes("email")) return true;
  const res = await req.fetch(cfg.apiURL + HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, data: "{}", failOnStatusCode: false });
  return res.status() !== 404;
}

/** Algum e-mail para `to` contendo `contains` agora no Mailpit? */
async function hasEmail(req: APIRequestContext, to: string, contains: string) {
  const res = await req.get(`${cfg.mailpitURL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`, { failOnStatusCode: false });
  if (!res.ok()) return false;
  for (const m of (await res.json()).messages ?? []) {
    const r = await req.get(`${cfg.mailpitURL}/api/v1/message/${m.ID}`, { failOnStatusCode: false });
    if (r.ok()) { const j = await r.json(); if (`${j.Text ?? ""}\n${j.HTML ?? ""}`.includes(contains)) return true; }
  }
  return false;
}

const forgot = async (req: APIRequestContext, email: string): Promise<APIResponse> => call(req, "POST", "/v1/auth/forgot-password", { email });

test.describe("E-mail (Resend)", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o /rodsaas:email (rota POST /v1/webhooks/resend)");
  });

  test("Webhook: sem assinatura, outro segredo, corpo alterado ou horário velho → 401; válido → 200 e repetido não quebra", async ({ playwright }) => {
    const body = event("email.delivered", { to: ["ninguem@example.com"] });
    const unsigned = await hook(playwright, body);
    expect([401, 503], `webhook sem assinatura → HTTP ${unsigned.status}: ${unsigned.body.slice(0, 200)}`).toContain(unsigned.status);
    if (unsigned.status === 401) expect(JSON.parse(unsigned.body || "{}").code, "code do erro").toBe("INVALID_WEBHOOK_SIGNATURE");

    const secret = cfg.resendWebhookSecret;
    test.skip(!secret, "RESEND_WEBHOOK_SECRET não encontrado em api/.env: o resto precisa dele para assinar como o Resend");
    expect(unsigned.status, "com RESEND_WEBHOOK_SECRET preenchido, sem assinatura é 401").toBe(401);

    const other = "whsec_" + Buffer.from("segredo-que-nao-e-o-do-projeto!!").toString("base64");
    expect((await hook(playwright, body, svix(other, body))).status, "assinado com outro segredo").toBe(401);
    expect((await hook(playwright, body + " ", svix(secret!, body))).status, "corpo alterado depois de assinar").toBe(401);
    const old = Math.floor(Date.now() / 1000) - 10 * 60;
    expect((await hook(playwright, body, svix(secret!, body, { timestamp: old }))).status, "assinatura de 10 min atrás (reenvio de evento capturado)").toBe(401);

    const h = svix(secret!, body);
    const ok1 = await hook(playwright, body, h);
    expect(ok1.status, `válido para envio desconhecido → HTTP ${ok1.status}: ${ok1.body.slice(0, 200)}`).toBeLessThan(300);
    const ok2 = await hook(playwright, body, h);
    expect(ok2.status, "o mesmo evento de novo (o Resend reenvia) não quebra").toBeLessThan(300);
    const unknown = event("contact.created", {});
    expect((await hook(playwright, unknown, svix(secret!, unknown))).status, "tipo que não tratamos → 200").toBeLessThan(300);
  });

  test("Supressão: devolução definitiva e spam bloqueiam novos e-mails para o endereço; devolução temporária não", async ({ request, playwright }) => {
    test.slow();
    const secret = cfg.resendWebhookSecret;
    test.skip(!secret, "RESEND_WEBHOOK_SECRET não encontrado em api/.env");
    const hard = newUser("bounce"), spam = newUser("spam"), soft = newUser("softbounce");
    for (const u of [hard, spam, soft]) await register(request, u);

    const events = [
      event("email.bounced", { to: [hard.email], bounce: { type: "Permanent", subType: "General", message: "Caixa não existe" } }),
      event("email.complained", { to: [spam.email] }),
      event("email.bounced", { to: [soft.email], bounce: { type: "Temporary", subType: "MailboxFull", message: "Caixa cheia" } }),
    ];
    for (const b of events) {
      const r = await hook(playwright, b, svix(secret!, b));
      expect(r.status, `evento ${JSON.parse(b).type} → HTTP ${r.status}: ${r.body.slice(0, 200)}`).toBeLessThan(300);
    }

    for (const u of [hard, spam, soft]) expect((await forgot(request, u.email)).status(), "esqueci a senha responde igual para todos").toBeLessThan(300);
    await waitForEmail(request, soft.email, { contains: "/redefinir-senha", timeoutMs: 60_000 });
    await sleep(3000);
    expect(await hasEmail(request, hard.email, "/redefinir-senha"), "endereço com devolução definitiva não recebe mais").toBe(false);
    expect(await hasEmail(request, spam.email, "/redefinir-senha"), "endereço que marcou como spam não recebe mais").toBe(false);
  });
});
