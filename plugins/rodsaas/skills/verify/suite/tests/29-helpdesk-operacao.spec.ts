import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { createHmac } from "node:crypto";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, sleep, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, ownerWithMember, signUp } from "../support/ui";

// Suporte · operação avançada e perfis (skills/helpdesk/references/09 e 10). Roda com o preset helpdesk. Confere o que
// mais se simplifica: cliente casado pelo domínio (nunca gratuito) com SLA próprio, contrato de horas com aviso e
// excedente, dividir chamado movendo as mensagens, aprovação que pausa e volta, campos por categoria no portal,
// sugestão de artigos, WhatsApp e chat que viram chamado e respondem pelo mesmo canal, a OS da assistência técnica
// (orçamento com peça do ERP, aprovação do cliente, baixa e garantia) e o bug que vira tarefa.

async function installed(req: APIRequestContext) {
  if (cfg.presets.includes("helpdesk")) return true;
  return (await call(req, "GET", "/v1/helpdesk/settings")).status() !== 404;
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
const ALL_DAY = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, [["00:00", "23:59"]]]));
const portalOf = async (req: APIRequestContext) => (await ok<any>(await call(req, "GET", "/v1/helpdesk/settings"), "configurações")).portalSlug as string;
async function pub(playwright: any) {
  const ctx = await playwright.request.newContext();
  const base = `${cfg.apiURL}/v1/public/helpdesk`;
  return {
    ctx,
    get: (path: string) => ctx.fetch(base + path, { failOnStatusCode: false }),
    post: (path: string, body: unknown) => ctx.fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `v-${uniq()}` }, data: JSON.stringify(body), failOnStatusCode: false }),
  };
}
async function portalTicket(playwright: any, req: APIRequestContext, body: Record<string, unknown>) {
  const p = await pub(playwright);
  const slug = await portalOf(req);
  const r = await p.post(`/${slug}/tickets`, { name: "Cliente Teste", subject: `Assunto ${uniq()}`, description: "Preciso de ajuda com o sistema.", ...body });
  const txt = await r.text();
  expect(r.status(), `abrir pelo portal → ${txt.slice(0, 300)}`).toBe(201);
  await p.ctx.dispose();
  const number = JSON.parse(txt).number as number;
  let t: any;
  for (let i = 0; i < 10 && !t; i++) { t = items<any>(await ok(await call(req, "GET", `/v1/helpdesk/tickets?view=all&q=${encodeURIComponent("#" + number)}`), "busca")).find((x) => x.number === number); if (!t) await sleep(300); }
  expect(t, `chamado #${number} na caixa`).toBeTruthy();
  return { ...t, ticketUrl: JSON.parse(txt).ticketUrl as string };
}
const detail = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/helpdesk/tickets/${id}`), "detalhe");
const say = (req: APIRequestContext, id: string, kind: "PUBLIC" | "NOTE", body: string) => call(req, "POST", `/v1/helpdesk/tickets/${id}/messages`, { kind, body: `<p>${body}</p>` });
const agentTicket = async (req: APIRequestContext, body: Record<string, unknown> = {}) =>
  ok<any>(await call(req, "POST", "/v1/helpdesk/tickets", { subject: `Chamado ${uniq()}`, requester: { name: "Ana", email: `ana.${uniq()}@example.com` }, body: "<p>Pedido</p>", ...body }), "chamado pela equipe");

test.describe("Helpdesk · operação", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset helpdesk");
  });

  test("API: clientes — conta pelo domínio (nunca gratuito), SLA do cliente encurta o prazo e piso de prioridade", async ({ request, playwright }) => {
    await register(request, newUser("hdacct"));
    await ensureFeature(request, "helpdesk_sla");
    await ok(await call(request, "PUT", "/v1/helpdesk/sla", { policy: { NORMAL: { firstResponse: 240, resolution: 1800 }, HIGH: { firstResponse: 120, resolution: 900 } }, businessHours: ALL_DAY }), "SLA da empresa");
    const dom = `acme${uniq().toLowerCase().replace(/[^a-z0-9]/g, "")}.com.br`;
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/helpdesk/accounts", { name: "Gratuito", domains: ["gmail.com"] }), 400, "VALIDATION_ERROR", "domínio gratuito"))).toContain("domains.0");
    const acct = await ok<any>(await call(request, "POST", "/v1/helpdesk/accounts", { name: "Acme", domains: [dom], slaPolicy: { HIGH: { firstResponse: 15, resolution: 60 } }, priorityFloor: "HIGH" }), "cliente");
    await expectCode(await call(request, "POST", "/v1/helpdesk/accounts", { name: "Outro", domains: [dom] }), 409, "DOMAIN_TAKEN", "domínio de outro cliente");
    const vip = await portalTicket(playwright, request, { email: `joao@${dom}` });
    const common = await portalTicket(playwright, request, { email: `maria.${uniq()}@example.com` });
    const free = await portalTicket(playwright, request, { email: `dono.${uniq()}@gmail.com` });
    const sub = await portalTicket(playwright, request, { email: `ana@filial.${dom}` });
    const v = await detail(request, vip.id), c = await detail(request, common.id), f = await detail(request, free.id);
    expect(v.account?.id, "casou pelo domínio").toBe(acct.id);
    expect(f.account ?? null, "gmail não casa").toBeNull();
    expect((await detail(request, sub.id)).account ?? null, "subdomínio não é o mesmo domínio").toBeNull();
    expect(v.priority, "piso de prioridade do cliente").toBe("HIGH");
    expect(c.priority).toBe("NORMAL");
    expect(Date.parse(v.sla.firstResponse.dueAt) - Date.parse(v.createdAt), "15 min do cliente").toBeLessThanOrEqual(16 * 60_000);
    expect(Date.parse(c.sla.firstResponse.dueAt), "o prazo do cliente vence antes").toBeGreaterThan(Date.parse(v.sla.firstResponse.dueAt));
    const list = items<any>(await ok(await call(request, "GET", "/v1/helpdesk/accounts"), "clientes"));
    expect(list.find((x) => x.id === acct.id)?.openTickets).toBe(1);
  });

  test("API: contrato de horas — consumo no ciclo, não cobrável fora, aviso aos 80% e excedente com valor", async ({ request, playwright }) => {
    await register(request, newUser("hdcontract"));
    await ensureFeature(request, "helpdesk_contracts");
    const dom = `beta${uniq().toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
    const acct = await ok<any>(await call(request, "POST", "/v1/helpdesk/accounts", { name: "Beta", domains: [dom] }), "cliente");
    const ct = await call(request, "POST", `/v1/helpdesk/accounts/${acct.id}/contracts`, { name: "Suporte 2h", hoursMonthly: 2, extraHourCents: 12000, startsOn: today() });
    expect(ct.status(), await ct.text()).toBe(201);
    const contract = await ct.json();
    await expectCode(await call(request, "POST", `/v1/helpdesk/accounts/${acct.id}/contracts`, { name: "Outro", hoursMonthly: 1, startsOn: today() }), 409, "CONTRACT_EXISTS", "segundo contrato ativo");
    const t = await portalTicket(playwright, request, { email: `ana@${dom}` });
    const time = (b: Record<string, unknown>) => call(request, "POST", `/v1/helpdesk/tickets/${t.id}/time`, b);
    expect(pathsOf(await expectCode(await time({ minutes: 0 }), 400, "VALIDATION_ERROR", "zero minutos"))).toContain("minutes");
    const r1 = await ok<any>(await time({ minutes: 60, note: "Diagnóstico" }), "1 h");
    expect(r1.usage).toMatchObject({ includedMinutes: 120, usedMinutes: 60, remainingMinutes: 60, status: "OK" });
    expect((await ok<any>(await time({ minutes: 300, billable: false }), "não cobrável")).usage.usedMinutes, "não cobrável não conta").toBe(60);
    expect((await ok<any>(await time({ minutes: 40 }), "40 min")).usage).toMatchObject({ usedMinutes: 100, pct: 83, status: "WARNING" });
    expect((await ok<any>(await time({ minutes: 30 }), "30 min")).usage).toMatchObject({ usedMinutes: 130, overMinutes: 10, overAmountCents: 2000, status: "EXCEEDED", remainingMinutes: 0 });
    const g = await ok<any>(await call(request, "GET", `/v1/helpdesk/contracts/${contract.id}`), "contrato");
    expect(g.usage).toMatchObject({ usedMinutes: 130, overAmountCents: 2000 });
    const other = await portalTicket(playwright, request, { email: `x.${uniq()}@example.com` });
    expect((await ok<any>(await call(request, "POST", `/v1/helpdesk/tickets/${other.id}/time`, { minutes: 15 }), "chamado sem contrato")).usage ?? null, "sem contrato: só registra").toBeNull();
    const notes = (await detail(request, t.id)).messages.filter((m: any) => m.kind === "NOTE").map((m: any) => m.bodyText ?? "");
    expect(notes.some((x: string) => /80%|excedeu|passou/i.test(x)), "nota no chamado ao passar do limite").toBe(true);
  });

  test("API: dividir chamado — mensagens escolhidas vão para o novo, com a ligação, e as regras de divisão", async ({ request, playwright }) => {
    await register(request, newUser("hdsplit"));
    const t = await portalTicket(playwright, request, { email: `split.${uniq()}@example.com`, description: "Primeiro assunto: não acesso o sistema." });
    expect((await say(request, t.id, "PUBLIC", "Vamos verificar o acesso.")).status()).toBe(201);
    const p = await pub(playwright);
    const tok = new URL(t.ticketUrl, cfg.webURL).pathname.split("/").filter(Boolean).pop();
    expect((await p.post(`/tickets/${tok}/replies`, { body: "Outra coisa: a nota fiscal saiu errada." })).status()).toBe(201);
    await p.ctx.dispose();
    expect((await say(request, t.id, "NOTE", "Nota interna")).status()).toBe(201);
    const d = await detail(request, t.id);
    const second = d.messages.find((m: any) => String(m.bodyText ?? m.bodyHtml).includes("nota fiscal"));
    const note = d.messages.find((m: any) => m.kind === "NOTE");
    await expectCode(await call(request, "POST", `/v1/helpdesk/tickets/${t.id}/split`, { messageIds: [], subject: "x" }), 400, "SPLIT_EMPTY", "nenhuma");
    await expectCode(await call(request, "POST", `/v1/helpdesk/tickets/${t.id}/split`, { messageIds: d.messages.map((m: any) => m.id), subject: "x" }), 400, "SPLIT_ALL", "todas");
    await expectCode(await call(request, "POST", `/v1/helpdesk/tickets/${t.id}/split`, { messageIds: [note.id], subject: "x" }), 400, "SPLIT_NOTES_ONLY", "só nota");
    const r = await call(request, "POST", `/v1/helpdesk/tickets/${t.id}/split`, { messageIds: [second.id], subject: "Nota fiscal errada" });
    expect(r.status(), await r.text()).toBe(201);
    const out = await r.json();
    expect(out.from).toMatchObject({ id: t.id, number: t.number });
    expect(out.ticket.subject).toBe("Nota fiscal errada");
    expect(out.ticket.number).not.toBe(t.number);
    const nt = await detail(request, out.ticket.id);
    expect(nt.messages.filter((m: any) => m.kind === "PUBLIC").map((m: any) => m.id), "a mensagem foi movida").toEqual([second.id]);
    expect(nt.messages.some((m: any) => m.kind === "NOTE" && String(m.bodyText ?? "").includes(`#${t.number}`)), "nota com a origem").toBe(true);
    expect(nt.requester.email).toBe(d.requester.email);
    expect(nt.splitFromId).toBe(t.id);
    expect((await detail(request, t.id)).messages.some((m: any) => m.id === second.id), "saiu do original").toBe(false);
  });

  test("API: aprovação — pede e pausa, uma pendente por vez, só o aprovador decide, reprovar pede comentário", async ({ browser, request }) => {
    const { member, ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request;
    const memberId = items<any>(await ok(await call(o, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === member.email)?.user?.id;
    const t = await agentTicket(o);
    const a = await call(o, "POST", `/v1/helpdesk/tickets/${t.id}/approvals`, { approverUserId: memberId, note: "Trocar o notebook (R$ 4.500)" });
    expect(a.status(), await a.text()).toBe(201);
    const ap = await a.json();
    const d1 = await detail(o, t.id);
    expect(d1.status, "espera a aprovação").toBe("ON_HOLD");
    expect(d1.approvalStatus).toBe("PENDING");
    await expectCode(await call(o, "POST", `/v1/helpdesk/tickets/${t.id}/approvals`, { approverUserId: memberId }), 409, "APPROVAL_PENDING", "segunda pendente");
    expect((await call(o, "POST", `/v1/helpdesk/approvals/${ap.id}/decide`, { decision: "APPROVED" })).status(), "quem não é o aprovador").toBe(404);
    await expectCode(await call(m, "POST", `/v1/helpdesk/approvals/${ap.id}/decide`, { decision: "REJECTED" }), 400, "COMMENT_REQUIRED", "reprovar sem comentário");
    const dec = await ok<any>(await call(m, "POST", `/v1/helpdesk/approvals/${ap.id}/decide`, { decision: "APPROVED", comment: "Pode comprar" }), "aprovar");
    expect(dec.status).toBe("APPROVED");
    await expectCode(await call(m, "POST", `/v1/helpdesk/approvals/${ap.id}/decide`, { decision: "REJECTED", comment: "mudei" }), 409, "APPROVAL_DECIDED", "decidir de novo");
    const d2 = await detail(o, t.id);
    expect([d2.status, d2.approvalStatus], "volta para aberto, aprovado").toEqual(["OPEN", "APPROVED"]);
    expect(d2.messages.some((x: any) => x.kind === "NOTE" && /aprovad/i.test(x.bodyText ?? "")), "nota com a decisão").toBe(true);
    await ownerCtx.close(); await memberCtx.close();
  });

  test("API: categorias — campos da categoria no portal e na equipe, obrigatórios e tipos conferidos", async ({ request, playwright }) => {
    await register(request, newUser("hdcat"));
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/helpdesk/categories", { name: "Ruim", fields: [{ key: "Versão", label: "", type: "X" }] }), 400, "VALIDATION_ERROR", "campos ruins"))).toEqual(expect.arrayContaining(["fields.0.key", "fields.0.label", "fields.0.type"]));
    const cat = await ok<any>(await call(request, "POST", "/v1/helpdesk/categories", { name: "Bug", fields: [{ key: "versao", label: "Versão", type: "TEXT", required: true }, { key: "ambiente", label: "Ambiente", type: "SELECT", options: ["Produção", "Homologação"], required: true }] }), "categoria");
    const slug = await portalOf(request);
    const p = await pub(playwright);
    const portal = await ok<any>(await p.get(`/${slug}`), "portal");
    expect(portal.ticketCategories?.find((x: any) => x.id === cat.id)?.fields?.map((f: any) => f.key)).toEqual(["versao", "ambiente"]);
    const bad = await p.post(`/${slug}/tickets`, { name: "Cli", email: `c.${uniq()}@example.com`, subject: "Erro", description: "Quebrou", categoryId: cat.id, fields: { ambiente: "Teste" } });
    expect(bad.status()).toBe(400);
    expect(pathsOf(await bad.json()).sort()).toEqual(["fields.ambiente", "fields.versao"]);
    await p.ctx.dispose();
    const t = await portalTicket(playwright, request, { email: `c.${uniq()}@example.com`, categoryId: cat.id, fields: { versao: "2.3.1", ambiente: "Produção" } });
    const d = await detail(request, t.id);
    expect(d.category?.id).toBe(cat.id);
    expect(d.fields).toMatchObject({ versao: "2.3.1", ambiente: "Produção" });
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/helpdesk/tickets", { subject: "x", requester: { email: `e.${uniq()}@example.com` }, body: "<p>x</p>", categoryId: cat.id, fields: { versao: "1", ambiente: "Produção", extra: 1 } }), 400, "VALIDATION_ERROR", "campo desconhecido"))).toContain("fields.extra");
  });

  test("API: sugestão de artigos — publicados que combinam com o chamado; internos só para a equipe", async ({ request, playwright }) => {
    await register(request, newUser("hdsug"));
    const art = async (b: Record<string, unknown>) => ok<any>(await call(request, "POST", "/v1/helpdesk/kb/articles", { status: "PUBLISHED", ...b }), "artigo");
    const a1 = await art({ title: "Como emitir nota fiscal", bodyHtml: "<p>Passo a passo para emitir a nota fiscal.</p>" });
    const a2 = await art({ title: "Nota fiscal rejeitada por NCM", bodyHtml: "<p>Confira o NCM.</p>", internal: true });
    await art({ title: "Trocar a senha", bodyHtml: "<p>Abra o perfil.</p>" });
    const t = await portalTicket(playwright, request, { email: `s.${uniq()}@example.com`, subject: "Erro ao emitir nota fiscal", description: "A nota fiscal não sai." });
    const s = items<any>(await ok(await call(request, "GET", `/v1/helpdesk/tickets/${t.id}/suggested-articles`), "sugestões"));
    expect(s[0]?.id, "o mais parecido primeiro").toBe(a1.id);
    expect(s.map((x) => x.id)).toContain(a2.id);
    expect(s.find((x) => x.id === a2.id)?.internal, "interno marcado").toBe(true);
    expect(s.some((x) => /senha/i.test(x.title)), "o que não combina fica fora").toBe(false);
    const p = await pub(playwright);
    const found = items<any>(await ok(await p.get(`/${await portalOf(request)}/articles?q=${encodeURIComponent("nota fiscal")}`), "busca do portal"));
    expect(found.some((x) => /NCM/.test(x.title)), "interno nunca no portal").toBe(false);
    await p.ctx.dispose();
  });

  test("API: WhatsApp — mensagem do cliente abre chamado, a seguinte entra no mesmo, a resposta sai pelo WhatsApp e a nota não", async ({ request, playwright }) => {
    await register(request, newUser("hdwa"));
    test.skip(!(cfg.addons.includes("whatsapp") || (await call(request, "GET", "/v1/whatsapp/connection")).status() !== 404), "projeto sem o motor de WhatsApp");
    const conn = await ok<any>(await call(request, "PUT", "/v1/whatsapp/connection", { driver: "fake", phone: "+55 44 3030-4040", defaultApp: "helpdesk" }), "conectar com o Suporte como padrão");
    const token = String((await ok<any>(await call(request, "GET", "/v1/whatsapp/connection"), "conexão")).webhookUrl).split("/").filter(Boolean).pop()!;
    const from = "55449" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const inbound = async (text: string) => {
      const ctx = await playwright.request.newContext();
      const raw = JSON.stringify({ events: [{ type: "message", id: "w" + uniq(), from, text }] });
      const sig = "sha256=" + createHmac("sha256", conn.webhookSecret).update(raw).digest("hex");
      expect((await ctx.fetch(`${cfg.apiURL}/v1/public/whatsapp/webhook/${token}`, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": sig }, data: raw, failOnStatusCode: false })).status()).toBe(200);
      await ctx.dispose();
    };
    await inbound("Meu pedido não chegou");
    let t: any;
    await expect.poll(async () => { t = items<any>(await ok(await call(request, "GET", "/v1/helpdesk/tickets?view=all"), "chamados")).find((x) => x.channel === "WHATSAPP"); return !!t; }, { message: "a mensagem abriu um chamado", timeout: 10_000 }).toBe(true);
    await inbound("É o pedido 123");
    await expect.poll(async () => (await detail(request, t.id)).messages.filter((m: any) => m.authorKind === "CUSTOMER").length, { message: "a segunda entrou no mesmo chamado", timeout: 10_000 }).toBe(2);
    expect(items<any>(await ok(await call(request, "GET", "/v1/helpdesk/tickets?view=all"), "chamados")).filter((x) => x.channel === "WHATSAPP").length).toBe(1);
    expect((await say(request, t.id, "PUBLIC", "Já estamos vendo o pedido.")).status()).toBe(201);
    expect((await say(request, t.id, "NOTE", "Segredo interno")).status()).toBe(201);
    const conv = items<any>(await ok(await call(request, "GET", "/v1/whatsapp/conversations"), "conversas")).find((x) => x.phone === from);
    let outs: any[] = [];
    await expect.poll(async () => { outs = items<any>(await ok(await call(request, "GET", `/v1/whatsapp/conversations/${conv.id}/messages`), "mensagens")).filter((x) => x.direction === "OUT" && x.ref?.app === "helpdesk"); return outs.length; }, { message: "a resposta saiu pelo WhatsApp", timeout: 10_000 }).toBe(1);
    expect(outs[0].ref).toMatchObject({ app: "helpdesk", entity: "ticket", id: t.id });
    expect(outs[0].text).toContain("Já estamos vendo o pedido.");
    expect(outs.some((x) => String(x.text).includes("Segredo")), "nota nunca sai").toBe(false);
  });

  test("API: chat no widget — online/offline, a conversa vira chamado e a resposta do atendente aparece para o cliente", async ({ request, playwright }) => {
    await register(request, newUser("hdchat"));
    await ensureFeature(request, "helpdesk_chat");
    await ok(await call(request, "PATCH", "/v1/helpdesk/settings", { businessHours: ALL_DAY }), "atende o dia todo");
    const slug = await portalOf(request);
    const p = await pub(playwright);
    expect((await ok<any>(await p.get(`/${slug}/chat`), "disponibilidade")).online, "dono disponível").toBe(true);
    await ok(await call(request, "PUT", "/v1/helpdesk/me/availability", { available: false }), "indisponível");
    expect((await ok<any>(await p.get(`/${slug}/chat`), "disponibilidade")).online, "ninguém disponível").toBe(false);
    await ok(await call(request, "PUT", "/v1/helpdesk/me/availability", { available: true }), "disponível");
    const st = await p.post(`/${slug}/chat`, { name: "Bia", email: `bia.${uniq()}@example.com`, message: "Oi, preciso de ajuda com o boleto" });
    expect(st.status(), await st.text()).toBe(201);
    const chat = await st.json();
    expect(chat.online).toBe(true);
    const t = items<any>(await ok(await call(request, "GET", `/v1/helpdesk/tickets?view=all&q=${encodeURIComponent("#" + chat.ticketNumber)}`), "busca")).find((x) => x.number === chat.ticketNumber);
    expect(t?.channel, "o chat virou chamado").toBe("CHAT");
    expect((await say(request, t.id, "PUBLIC", "Oi Bia, me passa o número do boleto?")).status()).toBe(201);
    expect((await say(request, t.id, "NOTE", "cliente antiga")).status()).toBe(201);
    const msgs = await ok<any>(await p.get(`/chat/${chat.token}/messages`), "mensagens do chat");
    expect(msgs.messages.map((x: any) => x.authorKind)).toEqual(["CUSTOMER", "AGENT"]);
    expect(msgs.messages.some((x: any) => String(x.body).includes("cliente antiga")), "nota nunca no chat").toBe(false);
    expect((await p.post(`/chat/${chat.token}/messages`, { body: "É o 123" })).status()).toBe(201);
    expect((await detail(request, t.id)).messages.filter((m: any) => m.authorKind === "CUSTOMER").length).toBe(2);
    expect((await p.get(`/chat/token-que-nao-existe/messages`)).status()).toBe(404);
    await p.ctx.dispose();
  });

  test("API: perfil assistência técnica — OS com equipamento, orçamento com peça do ERP, aprovação do cliente, baixa e garantia", async ({ request, playwright }) => {
    await register(request, newUser("hdos"));
    const s = await ok<any>(await call(request, "PATCH", "/v1/helpdesk/settings", { segment: "TECH_REPAIR" }), "perfil");
    expect(s.vocabulary?.ticket).toEqual(["ordem de serviço", "ordens de serviço"]);
    const cats = items<any>(await ok(await call(request, "GET", "/v1/helpdesk/categories"), "categorias"));
    const conserto = cats.find((c) => c.name === "Conserto");
    expect(conserto?.fields.find((f: any) => f.key === "defeito")?.required).toBe(true);
    await ok(await call(request, "PATCH", "/v1/helpdesk/settings", { segment: "TECH_REPAIR" }), "aplicar de novo");
    expect(items<any>(await ok(await call(request, "GET", "/v1/helpdesk/categories"), "categorias")).filter((c) => c.name === "Conserto").length, "sem duplicar").toBe(1);
    const serial = "SN-" + uniq();
    const os = (eq: Record<string, unknown>) => call(request, "POST", "/v1/helpdesk/tickets", { subject: "Celular sem ligar", requester: { name: "Rui", email: `rui.${uniq()}@example.com` }, body: "<p>Não liga</p>", categoryId: conserto.id, fields: { defeito: "Não liga" }, equipment: eq });
    expect(pathsOf(await expectCode(await os({ brand: "Moto" }), 400, "VALIDATION_ERROR", "equipamento sem tipo"))).toEqual(expect.arrayContaining(["equipment.type", "equipment.serial"]));
    const r = await os({ type: "Celular", brand: "Moto", model: "G9", serial });
    expect(r.status(), await r.text()).toBe(201);
    const t = await r.json();
    expect((await detail(request, t.id)).osStatus).toBe("RECEIVED");
    await expectCode(await call(request, "PUT", `/v1/helpdesk/tickets/${t.id}/os-status`, { status: "REPAIR" }), 409, "INVALID_OS_TRANSITION", "pular o diagnóstico");
    await ok(await call(request, "PUT", `/v1/helpdesk/tickets/${t.id}/os-status`, { status: "DIAGNOSIS" }), "diagnóstico");
    const hasErp = cfg.presets.includes("erp") || (await call(request, "GET", "/v1/erp/me")).status() !== 404;
    let part: any = null, wh: any = null;
    const items0: any[] = [{ kind: "LABOR", description: "Troca do conector", qty: 1, unitCents: 8000 }];
    if (hasErp) {
      part = await ok<any>(await call(request, "POST", "/v1/erp/products", { type: "SIMPLE", name: `Conector ${uniq()}`, unit: "UN", priceCents: 4500 }), "peça");
      wh = items<any>(await ok(await call(request, "GET", "/v1/erp/warehouses"), "depósitos")).find((w) => w.isDefault);
      await ok(await call(request, "POST", "/v1/erp/stock/movements", { type: "IN", productId: part.id, warehouseId: wh.id, qty: 3, unitCostCents: 2000 }), "estoque da peça");
      items0.unshift({ kind: "PART", productId: part.id, qty: 1 });
    }
    const q = await ok<any>(await call(request, "PUT", `/v1/helpdesk/tickets/${t.id}/quote`, { items: items0 }), "orçamento");
    expect(q.quote.totals.totalCents, "peça pelo preço do cadastro + mão de obra").toBe(hasErp ? 12500 : 8000);
    const sent = await ok<any>(await call(request, "POST", `/v1/helpdesk/tickets/${t.id}/quote/send`), "mandar o orçamento");
    expect((await detail(request, t.id)).osStatus).toBe("AWAITING_APPROVAL");
    const p = await pub(playwright);
    const qtok = new URL(sent.approvalUrl, cfg.webURL).pathname.split("/").filter(Boolean).pop();
    expect((await p.post(`/quotes/${qtok}`, { decision: "APPROVED" })).status(), "cliente aprova pelo link").toBe(200);
    await p.ctx.dispose();
    expect((await detail(request, t.id)).osStatus, "aprovado vai para o reparo").toBe("REPAIR");
    await ok(await call(request, "PUT", `/v1/helpdesk/tickets/${t.id}/os-status`, { status: "READY" }), "pronto");
    await ok(await call(request, "PUT", `/v1/helpdesk/tickets/${t.id}/os-status`, { status: "DELIVERED" }), "entregue");
    if (hasErp) expect((await ok<any>(await call(request, "GET", `/v1/erp/products/${part.id}`), "peça")).stock.onHand, "a entrega deu baixa na peça").toBe(2);
    const again = await os({ type: "Celular", serial: serial.toLowerCase() });
    expect(again.status()).toBe(201);
    const w = await detail(request, (await again.json()).id);
    expect(w.warranty, "mesmo número de série, dentro do prazo").toMatchObject({ inWarranty: true, orderId: t.id });
  });

  test("API: perfil software — bug com os campos certos vira tarefa e a conclusão volta para o chamado", async ({ request }) => {
    await register(request, newUser("hdsoft"));
    await ok(await call(request, "PATCH", "/v1/helpdesk/settings", { segment: "SOFTWARE" }), "perfil software");
    const bug = items<any>(await ok(await call(request, "GET", "/v1/helpdesk/categories"), "categorias")).find((c) => c.name === "Bug");
    expect(bug?.fields.filter((f: any) => f.required).map((f: any) => f.key)).toEqual(["versao", "ambiente", "passos"]);
    const t = await agentTicket(request, { categoryId: bug.id, fields: { versao: "3.2.0", ambiente: "Produção", passos: "1. Abrir 2. Clicar" } });
    const hasTasks = cfg.presets.includes("tarefas") || (await call(request, "GET", "/v1/task-projects")).status() !== 404;
    test.skip(!hasTasks, "projeto sem o Tarefas");
    const proj = items<any>(await ok(await call(request, "GET", "/v1/task-projects"), "projetos"))[0];
    const r = await call(request, "POST", `/v1/helpdesk/tickets/${t.id}/task`, { projectId: proj.id });
    expect(r.status(), await r.text()).toBe(201);
    const task = (await r.json()).task;
    expect(task.id).toBeTruthy();
    await expectCode(await call(request, "POST", `/v1/helpdesk/tickets/${t.id}/task`, { projectId: proj.id }), 409, "TASK_EXISTS", "segunda tarefa");
    expect((await detail(request, t.id)).task?.id).toBe(task.id);
    const pr = await ok<any>(await call(request, "GET", `/v1/task-projects/${proj.id}`), "projeto");
    const done = pr.statuses.find((x: any) => x.category === "DONE");
    await ok(await call(request, "POST", `/v1/tasks/${task.id}/move`, { statusId: done.id }), "concluir a tarefa");
    await expect.poll(async () => (await detail(request, t.id)).messages.some((m: any) => m.kind === "NOTE" && /conclu/i.test(m.bodyText ?? "")), { message: "nota no chamado", timeout: 10_000 }).toBe(true);
  });

  test("API: perfis TI interno e condomínio — palavras e categorias; trocar não apaga", async ({ request }) => {
    await register(request, newUser("hdperfis"));
    const ti = await ok<any>(await call(request, "PATCH", "/v1/helpdesk/settings", { segment: "IT_INTERNAL" }), "TI");
    expect(ti.vocabulary?.requester).toEqual(["colaborador", "colaboradores"]);
    const condo = await ok<any>(await call(request, "PATCH", "/v1/helpdesk/settings", { segment: "CONDO" }), "condomínio");
    expect(condo.vocabulary?.ticket).toEqual(["ocorrência", "ocorrências"]);
    const names = items<any>(await ok(await call(request, "GET", "/v1/helpdesk/categories"), "categorias")).map((c) => c.name);
    expect(names, "as do TI ficam e as do condomínio entram").toEqual(expect.arrayContaining(["Acesso", "Equipamento", "Compra", "Manutenção", "Encomenda"]));
    await expectCode(await call(request, "PATCH", "/v1/helpdesk/settings", { segment: "NAVE" }), 400, "VALIDATION_ERROR", "perfil desconhecido");
    expect((await ok<any>(await call(request, "GET", "/v1/helpdesk/settings"), "configurações")).segment).toBe("CONDO");
  });

  test("Tela: dividir o chamado escolhendo a mensagem", async ({ page, playwright }) => {
    await signUp(page, "hdsplittela");
    const req = page.context().request;
    const t = await portalTicket(playwright, req, { email: `st.${uniq()}@example.com`, description: "Primeiro problema." });
    const p = await pub(playwright);
    const tok = new URL(t.ticketUrl, cfg.webURL).pathname.split("/").filter(Boolean).pop();
    await p.post(`/tickets/${tok}/replies`, { body: "Segundo problema diferente." });
    await p.ctx.dispose();
    const msg = (await detail(req, t.id)).messages.find((m: any) => String(m.bodyText ?? "").includes("Segundo"));
    await page.goto(`/suporte/chamados/${t.id}`);
    await page.getByTestId("hd-split").click();
    await page.locator(`[data-testid="hd-split-select"][data-message="${msg.id}"]`).check();
    await page.getByTestId("hd-split-subject").fill("Segundo problema");
    await page.getByTestId("hd-split-confirm").click();
    await expect.poll(async () => items<any>(await ok(await call(req, "GET", "/v1/helpdesk/tickets?view=all"), "chamados")).some((x) => x.subject === "Segundo problema"), { message: "chamado novo criado", timeout: 10_000 }).toBe(true);
  });

  test("Tela: lançar tempo no chamado e ver o saldo do contrato", async ({ page, playwright }) => {
    await signUp(page, "hdtimetela");
    const req = page.context().request;
    await ensureFeature(req, "helpdesk_contracts");
    const dom = `gama${uniq().toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
    const acct = await ok<any>(await call(req, "POST", "/v1/helpdesk/accounts", { name: "Gama", domains: [dom] }), "cliente");
    await ok(await call(req, "POST", `/v1/helpdesk/accounts/${acct.id}/contracts`, { name: "1 h", hoursMonthly: 1, startsOn: today() }), "contrato");
    const t = await portalTicket(playwright, req, { email: `x@${dom}` });
    await page.goto(`/suporte/chamados/${t.id}`);
    await page.getByTestId("hd-time-add").click();
    await page.getByTestId("hd-time-minutes").fill("50");
    await page.getByTestId("hd-time-save").click();
    await expect(page.getByTestId("hd-time-row").first(), "lançamento na lista").toBeVisible();
    await expect(page.getByTestId("hd-contract-usage"), "saldo com o aviso").toHaveAttribute("data-status", "WARNING");
  });

  test("Tela: chat no portal — o cliente conversa e vê a resposta do atendente", async ({ page, browser, playwright }) => {
    const agent = await newContext(browser);
    const u = newUser("hdchattela");
    await register(agent.request, u);
    await ensureFeature(agent.request, "helpdesk_chat");
    await ok(await call(agent.request, "PATCH", "/v1/helpdesk/settings", { businessHours: ALL_DAY }), "dia todo");
    const slug = await portalOf(agent.request);
    await page.goto(`/ajuda/${slug}`);
    await page.getByTestId("portal-chat-open").click();
    await page.getByTestId("portal-chat-name").fill("Caio");
    await page.getByTestId("portal-chat-email").fill(`caio.${uniq()}@example.com`);
    await page.getByTestId("portal-chat-message").fill("Oi, o app não abre");
    await page.getByTestId("portal-chat-send").click();
    await expect(page.locator('[data-testid="portal-chat-row"][data-author="CUSTOMER"]').first()).toBeVisible();
    let t: any;
    await expect.poll(async () => { t = items<any>(await ok(await call(agent.request, "GET", "/v1/helpdesk/tickets?view=all"), "chamados")).find((x) => x.channel === "CHAT"); return !!t; }, { timeout: 10_000 }).toBe(true);
    expect((await say(agent.request, t.id, "PUBLIC", "Oi Caio, qual aparelho?")).status()).toBe(201);
    await expect(page.locator('[data-testid="portal-chat-row"][data-author="AGENT"]'), "resposta chega no chat").toContainText("qual aparelho", { timeout: 15_000 });
    await page.getByTestId("portal-chat-input").fill("Android");
    await page.getByTestId("portal-chat-reply").click();
    await expect.poll(async () => (await detail(agent.request, t.id)).messages.filter((m: any) => m.authorKind === "CUSTOMER").length, { timeout: 10_000 }).toBe(2);
    await agent.close();
  });
});
