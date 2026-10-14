import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { createHmac } from "node:crypto";
import { call, items, newUser, ok, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, signUp } from "../support/ui";

// Add-on whatsapp (/rodsaas:whatsapp): o motor com o driver falso. Roda quando rodsaas.json tem "whatsapp" em addons
// ou a API tem /v1/whatsapp/connection. Confere o que mais se simplifica: janela de 24 h, modelos, descadastro,
// webhook assinado com dedupe, status que só anda para frente, número sem WhatsApp e a ligação com a Agenda.

async function installed(req: APIRequestContext) {
  if (cfg.addons.includes("whatsapp")) return true;
  return (await call(req, "GET", "/v1/whatsapp/connection")).status() !== 404;
}
async function expectCode(res: APIResponse, status: number, code: string, label: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  const json = JSON.parse(body || "{}");
  expect(json.code, `${label}: code`).toBe(code);
  return json;
}
const pathsOf = (b: any) => (b?.errors ?? []).map((e: any) => e.path) as string[];
/** Celular válido e único (DDD 44). */
const phone = (end = "") => { const n = String(Math.floor(Math.random() * 1e8)).padStart(8, "0"); return `+55 44 9${(n.slice(0, 8 - end.length) + end)}`; };
const e164 = (p: string) => p.replace(/\D/g, "");

type Conn = { secret: string; token: string };
async function connect(req: APIRequestContext): Promise<Conn> {
  const r = await ok<any>(await call(req, "PUT", "/v1/whatsapp/connection", { driver: "fake", phone: "+55 44 3030-4040" }), "conectar o driver falso");
  expect(r.webhookSecret, "segredo do webhook na resposta da conexão").toBeTruthy();
  const c = await ok<any>(await call(req, "GET", "/v1/whatsapp/connection"), "conexão");
  expect(c.webhookSecret ?? null, "segredo não volta depois").toBeNull();
  return { secret: r.webhookSecret, token: String(c.webhookUrl).split("/").filter(Boolean).pop()! };
}
/** Webhook como o provedor manda: corpo cru assinado (HMAC SHA-256). */
async function webhook(playwright: any, conn: Conn, events: unknown[], secret = conn.secret) {
  const ctx = await playwright.request.newContext();
  const raw = JSON.stringify({ events });
  const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const res = await ctx.fetch(`${cfg.apiURL}/v1/public/whatsapp/webhook/${conn.token}`, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": sig }, data: raw, failOnStatusCode: false });
  const out = { status: res.status(), body: await res.text() };
  await ctx.dispose();
  return out;
}
const inbound = (from: string, text: string, extra: Record<string, unknown> = {}) => ({ type: "message", id: `w_${uniq()}`, from: e164(from), text, ...extra });
async function conversationOf(req: APIRequestContext, p: string) {
  return items<any>(await ok(await call(req, "GET", "/v1/whatsapp/conversations"), "conversas")).find((c) => c.phone === e164(p));
}
const messagesOf = async (req: APIRequestContext, convId: string) => items<any>(await ok(await call(req, "GET", `/v1/whatsapp/conversations/${convId}/messages`), "mensagens"));
const send = (req: APIRequestContext, body: Record<string, unknown>) => call(req, "POST", "/v1/whatsapp/messages", body);
async function template(req: APIRequestContext, name = `aviso_${uniq().toLowerCase()}`) {
  return ok<any>(await call(req, "POST", "/v1/whatsapp/templates", { name, category: "UTILITY", language: "pt_BR", body: "Olá {{1}}, seu pedido {{2}} saiu para entrega." }), "criar modelo");
}

test.describe("WhatsApp", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o add-on whatsapp");
  });

  test("API: conectar o driver de teste — número e provedor validados, segredo do webhook uma vez", async ({ request }) => {
    await register(request, newUser("wacon"));
    await expectCode(await send(request, { to: phone(), text: "oi" }), 409, "NOT_CONNECTED", "mandar sem conexão");
    const before = await ok<any>(await call(request, "GET", "/v1/whatsapp/connection"), "conexão vazia");
    expect([before.driver ?? null, before.status], "começa desconectado").toEqual([null, "DISCONNECTED"]);
    expect(pathsOf(await expectCode(await call(request, "PUT", "/v1/whatsapp/connection", { driver: "xpto", phone: "+55 44 3030-4040" }), 400, "VALIDATION_ERROR", "driver desconhecido"))).toContain("driver");
    expect(pathsOf(await expectCode(await call(request, "PUT", "/v1/whatsapp/connection", { driver: "fake", phone: "123" }), 400, "VALIDATION_ERROR", "número inválido"))).toContain("phone");
    await connect(request);
    const c = await ok<any>(await call(request, "GET", "/v1/whatsapp/connection"), "conexão");
    expect([c.driver, c.status, c.phone], "conectado com o número normalizado").toEqual(["fake", "CONNECTED", "554430304040"]);
    const names = items<any>(await ok(await call(request, "GET", "/v1/whatsapp/templates"), "modelos")).map((t) => t.name);
    expect(names, "modelos do sistema criados na conexão").toEqual(expect.arrayContaining(["agenda_confirmacao", "agenda_lembrete"]));
  });

  test("API: modelos — validação no formato do provedor, aprovado e reprovado, variáveis obrigatórias", async ({ request }) => {
    await register(request, newUser("watpl"));
    await connect(request);
    const bad = await expectCode(await call(request, "POST", "/v1/whatsapp/templates", { name: "Aviso Geral", category: "UTILITY", language: "pt_BR", body: "{{1}} chegou {{3}} ok", buttons: ["um botão grande demais aqui"] }), 400, "VALIDATION_ERROR", "modelo inválido");
    expect(pathsOf(bad), "erros no lugar certo").toEqual(expect.arrayContaining(["name", "body", "buttons.0"]));
    const t = await template(request);
    expect(t.status, "driver de teste aprova").toBe("APPROVED");
    await expectCode(await call(request, "POST", "/v1/whatsapp/templates", { name: t.name, category: "UTILITY", language: "pt_BR", body: "Outro {{1}} texto" }), 409, "TEMPLATE_EXISTS", "nome repetido");
    const rej = await ok<any>(await call(request, "POST", "/v1/whatsapp/templates", { name: `reprovar_${uniq().toLowerCase()}`, category: "MARKETING", language: "pt_BR", body: "Promoção para {{1}} hoje" }), "modelo que o provedor reprova");
    expect(rej.status).toBe("REJECTED");
    const to = phone();
    await expectCode(await send(request, { to, template: { name: rej.name, variables: ["Ana"] } }), 409, "TEMPLATE_NOT_APPROVED", "modelo reprovado");
    expect(pathsOf(await expectCode(await send(request, { to, template: { name: t.name, variables: ["Ana"] } }), 400, "VALIDATION_ERROR", "variável faltando"))).toContain("template.variables.1");
    const m = await ok<any>(await send(request, { to, template: { name: t.name, variables: ["Ana", "#123"] } }), "mandar o modelo");
    expect([m.status, m.mode], "na fila como modelo").toEqual(["QUEUED", "TEMPLATE"]);
    const conv = await conversationOf(request, to);
    await expect.poll(async () => (await messagesOf(request, conv.id)).find((x) => x.id === m.id)?.status, { message: "enviada pelo driver", timeout: 10_000 }).toBe("SENT");
    expect((await messagesOf(request, conv.id)).find((x) => x.id === m.id)?.text, "texto preenchido").toBe("Olá Ana, seu pedido #123 saiu para entrega.");
  });

  test("API: janela de 24 h — texto livre só depois que o cliente fala", async ({ request, playwright }) => {
    await register(request, newUser("wajan"));
    const conn = await connect(request);
    const to = phone();
    await expectCode(await send(request, { to, text: "Oi, tudo bem?" }), 409, "OUTSIDE_WINDOW", "texto livre sem conversa");
    const t = await template(request);
    await ok(await send(request, { to, template: { name: t.name, variables: ["Ana", "#7"] } }), "modelo passa fora da janela");
    await expectCode(await send(request, { to, text: "E aí?" }), 409, "OUTSIDE_WINDOW", "mensagem nossa não abre a janela");
    expect((await webhook(playwright, conn, [inbound(to, "Olá, queria saber do meu pedido")])).status, "cliente manda mensagem").toBe(200);
    const conv = await conversationOf(request, to);
    expect([conv?.window?.open, conv?.unread], "janela aberta e não lida").toEqual([true, 1]);
    const m = await ok<any>(await send(request, { to, text: "Saiu para entrega hoje!" }), "agora texto livre passa");
    expect(m.mode).toBe("FREEFORM");
    const msgs = await messagesOf(request, conv.id);
    expect(msgs.map((x) => x.direction), "entrada e saída na conversa").toEqual(expect.arrayContaining(["IN", "OUT"]));
  });

  test("API: webhook — assinatura conferida, repetido não duplica e status só anda para frente", async ({ request, playwright }) => {
    await register(request, newUser("wahook"));
    const conn = await connect(request);
    const to = phone();
    const ev = inbound(to, "Bom dia");
    expect((await webhook(playwright, conn, [ev], "segredo-errado")).status, "assinatura errada").toBe(401);
    expect(await conversationOf(request, to), "nada gravado com assinatura errada").toBeFalsy();
    expect((await webhook(playwright, conn, [ev])).status).toBe(200);
    expect((await webhook(playwright, conn, [ev])).status, "repetido responde 200").toBe(200);
    const conv = await conversationOf(request, to);
    expect((await messagesOf(request, conv.id)).filter((x) => x.direction === "IN"), "repetido não duplica").toHaveLength(1);
    const m = await ok<any>(await send(request, { to, text: "Resposta" }), "responder");
    await expect.poll(async () => (await messagesOf(request, conv.id)).find((x) => x.id === m.id)?.providerMessageId, { timeout: 10_000 }).toBeTruthy();
    const pid = (await messagesOf(request, conv.id)).find((x) => x.id === m.id).providerMessageId;
    const st = (s: string) => ({ type: "status", messageId: pid, status: s });
    await webhook(playwright, conn, [st("READ")]);
    await webhook(playwright, conn, [st("DELIVERED")]);
    expect((await messagesOf(request, conv.id)).find((x) => x.id === m.id)?.status, "lida não volta para entregue").toBe("READ");
    const ctx = await playwright.request.newContext();
    expect((await ctx.fetch(`${cfg.apiURL}/v1/public/whatsapp/webhook/token-que-nao-existe`, { method: "POST", data: "{}", failOnStatusCode: false })).status(), "token desconhecido").toBe(404);
    await ctx.dispose();
  });

  test("API: descadastro — PARAR bloqueia o envio e VOLTAR libera", async ({ request, playwright }) => {
    await register(request, newUser("waopt"));
    const conn = await connect(request);
    const to = phone();
    const t = await template(request);
    await webhook(playwright, conn, [inbound(to, "PARAR")]);
    const conv = await conversationOf(request, to);
    expect(conv.optedOut, "descadastrado").toBe(true);
    await expectCode(await send(request, { to, template: { name: t.name, variables: ["Ana", "#1"] } }), 409, "OPTED_OUT", "mandar para quem pediu para parar");
    await webhook(playwright, conn, [inbound(to, "voltar")]);
    expect((await conversationOf(request, to)).optedOut, "voltou").toBe(false);
    await ok(await send(request, { to, template: { name: t.name, variables: ["Ana", "#1"] } }), "manda de novo");
  });

  test("API: número sem WhatsApp falha com o motivo e número inválido nem entra", async ({ request }) => {
    await register(request, newUser("wanum"));
    await connect(request);
    const t = await template(request);
    expect(pathsOf(await expectCode(await send(request, { to: "123", template: { name: t.name, variables: ["a", "b"] } }), 400, "VALIDATION_ERROR", "número inválido"))).toContain("to");
    const to = phone("0000");
    const m = await ok<any>(await send(request, { to, template: { name: t.name, variables: ["Ana", "#9"] } }), "número sem WhatsApp entra na fila");
    const conv = await conversationOf(request, to);
    await expect.poll(async () => (await messagesOf(request, conv.id)).find((x) => x.id === m.id)?.status, { message: "falha", timeout: 10_000 }).toBe("FAILED");
    const f = (await messagesOf(request, conv.id)).find((x) => x.id === m.id);
    expect(f.errorCode, "motivo traduzido").toBe("NOT_ON_WHATSAPP");
    expect(String(f.error ?? ""), "motivo em português").toMatch(/não tem WhatsApp/i);
  });

  test("API: Agenda — agendar com telefone manda a confirmação e responder 1 confirma a presença", async ({ request, playwright }) => {
    await register(request, newUser("waagenda"));
    test.skip(!(cfg.presets.includes("agenda") || (await call(request, "GET", "/v1/agenda/settings")).status() !== 404), "projeto sem a Agenda");
    const conn = await connect(request);
    const st = await ok<any>(await call(request, "GET", "/v1/agenda/settings"), "agenda");
    const schedules = items<any>(await ok(await call(request, "GET", "/v1/agenda/schedules"), "agendas"));
    const sc = schedules.find((x) => x.isDefault) ?? schedules[0];
    await ok(await call(request, "PATCH", `/v1/agenda/schedules/${sc.id}`, { timeZone: "America/Sao_Paulo", weekly: Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, [["08:00", "20:00"]]])) }), "agenda aberta");
    const type = await ok<any>(await call(request, "POST", "/v1/agenda/event-types", { name: `Corte ${uniq()}`, durations: [30], minNoticeMin: 0, maxDaysAhead: 30, active: true }), "tipo");
    const pub = await playwright.request.newContext();
    const base = `${cfg.apiURL}/v1/public/agenda/${st.pageSlug}/types/${type.slug}`;
    const from = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), to = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const days = (await ok<any>(await pub.fetch(`${base}/slots?from=${from}&to=${to}&timeZone=America%2FSao_Paulo`), "horários")).days;
    const all = Object.values(days).flat() as any[];
    const slots = [all[0], all[all.length - 1]];
    expect(Date.parse(slots[1].start) - Date.parse(slots[0].start), "dois horários diferentes").toBeGreaterThan(3_600_000);
    const tel = phone();
    for (const [i, slot] of slots.entries()) {
      const b = await pub.fetch(`${base}/bookings`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": uniq() }, data: JSON.stringify({ start: slot.start, name: "Ana Souza", email: `ana.${i}.${uniq()}@example.com`, phone: tel, timeZone: "America/Sao_Paulo" }), failOnStatusCode: false });
      expect(b.status(), `agendado ${i + 1}`).toBe(201);
    }
    await pub.dispose();
    await expect.poll(async () => !!(await conversationOf(request, tel)), { message: "a confirmação saiu pelo WhatsApp", timeout: 10_000 }).toBe(true);
    const conv = await conversationOf(request, tel);
    let outs: any[] = [];
    await expect.poll(async () => { outs = (await messagesOf(request, conv.id)).filter((x) => x.direction === "OUT" && x.ref?.app === "agenda" && x.providerMessageId); return outs.length; }, { message: "as duas confirmações saíram", timeout: 10_000 }).toBe(2);
    outs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    expect(String(outs[0].text), "mensagem com o primeiro nome").toContain("Ana");
    expect(outs[0].ref.id, "uma mensagem por agendamento").not.toBe(outs[1].ref.id);
    // responde à PRIMEIRA confirmação (contexto do provedor), não à última
    await webhook(playwright, conn, [inbound(tel, "1", { replyTo: outs[0].providerMessageId })]);
    const list = items<any>(await ok(await call(request, "GET", "/v1/agenda/appointments?status=upcoming"), "agendamentos"));
    expect(list.find((a) => a.id === outs[0].ref.id)?.clientConfirmed, "respondeu 1 à primeira: presença confirmada nela").toBe(true);
    expect(list.find((a) => a.id === outs[1].ref.id)?.clientConfirmed ?? false, "a segunda continua sem confirmar").toBe(false);
  });

  test("API: outra empresa não vê as conversas", async ({ browser, request, playwright }) => {
    await register(request, newUser("waiso"));
    const conn = await connect(request);
    const to = phone();
    await webhook(playwright, conn, [inbound(to, "Olá")]);
    const conv = await conversationOf(request, to);
    const other = await newContext(browser);
    await register(other.request, newUser("waother"));
    expect((await call(other.request, "GET", `/v1/whatsapp/conversations/${conv.id}/messages`)).status(), "conversa de outra empresa").toBe(404);
    expect(items<any>(await ok(await call(other.request, "GET", "/v1/whatsapp/conversations"), "lista da outra")).some((c) => c.id === conv.id)).toBe(false);
    await other.close();
  });

  test("Tela: conectar o WhatsApp de teste pelas configurações", async ({ page }) => {
    await signUp(page, "watela", "/configuracoes/whatsapp");
    await expect(page.getByTestId("wa-connection")).toHaveAttribute("data-status", "DISCONNECTED");
    await page.getByTestId("wa-driver").selectOption("fake");
    await page.getByTestId("wa-phone").fill("(44) 3030-4040");
    await page.getByTestId("wa-connect").click();
    await expect(page.getByTestId("wa-connection"), "conectado").toHaveAttribute("data-status", "CONNECTED");
    await expect(page.getByTestId("wa-webhook-secret"), "segredo mostrado uma vez").toBeVisible();
    await expect(page.locator('[data-testid="wa-template-row"][data-status="APPROVED"]').first(), "modelos do sistema").toBeVisible();
  });

  test("Tela: caixa — a mensagem do cliente aparece e a resposta sai dentro da janela", async ({ page, playwright }) => {
    await signUp(page, "wacaixa");
    const req = page.context().request;
    const conn = await connect(req);
    const to = phone();
    await webhook(playwright, conn, [inbound(to, "Vocês abrem sábado?")]);
    await page.goto("/whatsapp");
    await page.locator(`[data-testid="wa-conversation-row"][data-phone="${e164(to)}"]`).click();
    const thread = page.getByTestId("wa-thread");
    await expect(thread.locator('[data-testid="wa-message"][data-direction="IN"]'), "mensagem do cliente").toContainText("sábado");
    await expect(page.getByTestId("wa-window"), "janela aberta").toHaveAttribute("data-open", "true");
    await page.getByTestId("wa-reply").fill("Abrimos sim, das 8h às 12h.");
    await page.getByTestId("wa-reply-send").click();
    await expect(thread.locator('[data-testid="wa-message"][data-direction="OUT"]', { hasText: "8h às 12h" }), "resposta na conversa").toBeVisible();
    const conv = await conversationOf(req, to);
    expect((await messagesOf(req, conv.id)).some((x) => x.direction === "OUT" && x.text.includes("8h às 12h")), "gravada").toBe(true);
  });
});
