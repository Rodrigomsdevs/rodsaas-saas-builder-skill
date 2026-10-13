import { test, expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, sleep, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, ownerWithMember, signUp } from "../support/ui";
import { waitForEmail } from "../support/mailpit";

// Parte do Suporte (preset /rodsaas:helpdesk). Roda quando rodsaas.json tem "helpdesk" em presets ou a API tem /v1/helpdesk/settings.

const MIN = 60_000;

async function helpdeskInstalled(req: APIRequestContext) {
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

const portalOf = async (req: APIRequestContext) => {
  const s = await ok<any>(await call(req, "GET", "/v1/helpdesk/settings"), "configurações do Suporte");
  expect(s.portalSlug, "empresa nasce com o endereço da central").toBeTruthy();
  return s.portalSlug as string;
};
const customer = (tag: string) => ({ name: `Cliente ${tag} ${uniq()}`, email: `cliente.${tag}.${uniq()}@example.com` });
const tokenOf = (ticketUrl: string) => new URL(ticketUrl, cfg.webURL).pathname.split("/").filter(Boolean).pop()!;

/** Chamadas públicas: contexto novo, sem cookie e sem Origin (como o celular de um cliente ou um servidor de e-mail). */
async function anon(playwright: any, portal: string) {
  const ctx = await playwright.request.newContext();
  const base = `${cfg.apiURL}/v1/public/helpdesk`;
  const get = (path: string) => ctx.fetch(base + path, { failOnStatusCode: false });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    ctx.fetch(path.startsWith("http") ? path : base + path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `verify-${uniq()}`, ...headers }, data: JSON.stringify(body), failOnStatusCode: false });
  const open = (body: Record<string, unknown>) => post(`/${portal}/tickets`, body);
  const view = (token: string) => get(`/tickets/${token}`);
  return {
    ctx, get, post, open, view,
    reply: (token: string, body: string) => post(`/tickets/${token}/replies`, { body }),
    solve: (token: string) => post(`/tickets/${token}/solve`, {}),
    csat: (token: string, rating: string, comment?: string) => post(`/tickets/${token}/csat`, { rating, comment }),
    search: async (q: string) => items<any>(await ok(await get(`/${portal}/articles?q=${encodeURIComponent(q)}`), `busca "${q}"`)),
  };
}

/** Abre um chamado pelo portal e devolve { number, token, ticketUrl, who }. */
async function openTicket(pub: Awaited<ReturnType<typeof anon>>, extra: Record<string, unknown> = {}) {
  const who = customer("hd");
  const body = { ...who, subject: `Não consigo acessar ${uniq()}`, description: "Aparece erro ao entrar no sistema.", ...extra };
  const res = await pub.open(body);
  const text = await res.text();
  expect(res.status(), `abrir chamado pelo portal → HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(201);
  const json = JSON.parse(text);
  expect(Number.isInteger(json.number), "número do chamado").toBe(true);
  expect(String(json.ticketUrl ?? ""), "link para acompanhar").toContain("/chamado/");
  return { number: json.number as number, token: tokenOf(json.ticketUrl), ticketUrl: json.ticketUrl as string, who: { ...who, ...(extra as any) }, subject: (body as any).subject as string };
}

async function findTicket(req: APIRequestContext, number: number) {
  for (let i = 0; i < 10; i++) {
    const list = items<any>(await ok(await call(req, "GET", `/v1/helpdesk/tickets?view=all&q=${encodeURIComponent("#" + number)}`), "busca de chamado"));
    const t = list.find((x) => x.number === number);
    if (t) return t;
    await sleep(300);
  }
  throw new Error(`chamado #${number} não aparece em GET /v1/helpdesk/tickets?view=all&q=#${number}`);
}
const detail = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/helpdesk/tickets/${id}`), "detalhe do chamado");
const say = (req: APIRequestContext, id: string, kind: "PUBLIC" | "NOTE", body: string, status?: string) =>
  call(req, "POST", `/v1/helpdesk/tickets/${id}/messages`, { kind, body: `<p>${body}</p>`, ...(status ? { status } : {}) });

/** Todos os e-mails que chegaram para `to` (texto + assunto), para conferir o que NÃO pode ter saído. */
async function allEmailsTo(req: APIRequestContext, to: string) {
  const res = await req.get(`${cfg.mailpitURL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`, { failOnStatusCode: false });
  if (!res.ok()) return [] as string[];
  const out: string[] = [];
  for (const m of (await res.json()).messages ?? []) {
    const r = await req.get(`${cfg.mailpitURL}/api/v1/message/${m.ID}`, { failOnStatusCode: false });
    if (r.ok()) { const j = await r.json(); out.push(`${j.Subject}\n${j.Text}\n${j.HTML}`); }
  }
  return out;
}

const near = (a: string, b: number, label: string) => expect(Math.abs(Date.parse(a) - b), label).toBeLessThanOrEqual(2 * MIN);
/** Envio feito rápido demais é tratado como robô (`_ts`); a tela espera o mesmo que uma pessoa levaria. */
const humanPause = (page: Page) => page.waitForTimeout(2_500);

/** Escolhe o status no chamado: <select> nativo ou menu com opções. */
async function chooseStatus(page: Page, value: string, label: string) {
  const ctl = page.getByTestId("helpdesk-ticket-status");
  const isSelect = await ctl.evaluate((el) => el.tagName === "SELECT");
  if (isSelect) await ctl.selectOption(value);
  else { await ctl.click(); await page.getByRole("option", { name: label }).or(page.getByRole("menuitemradio", { name: label })).or(page.getByRole("menuitem", { name: label })).first().click(); }
}

test.describe("Helpdesk", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await helpdeskInstalled(request)), "projeto sem o preset helpdesk");
  });

  // ------------------------------------------------------------------ API
  test("API: chamado pelo portal sem login e sem Origin, com erro em cada campo e número sequencial", async ({ request, playwright, browser }) => {
    const owner = newUser("hdportal");
    await register(request, owner);
    const portal = await portalOf(request);
    const pub = await anon(playwright, portal);

    const empty = await expectCode(await pub.open({}), 400, "VALIDATION_ERROR", "chamado vazio");
    expect((empty.errors ?? []).map((e: any) => e.path), "erro em cada campo obrigatório").toEqual(expect.arrayContaining(["name", "email", "subject", "description"]));
    const bad = await expectCode(await pub.open({ ...customer("x"), email: "ana@", subject: "Oi", description: "Teste" }), 400, "VALIDATION_ERROR", "e-mail inválido");
    expect((bad.errors ?? []).map((e: any) => e.path)).toEqual(["email"]);

    const first = await openTicket(pub, { email: `Ana.${uniq()}@Example.com` });
    const t = await findTicket(request, first.number);
    expect(t.status, "nasce aberto").toBe("OPEN");
    expect(t.channel, "canal portal").toBe("PORTAL");
    expect(t.requester?.email, "e-mail do solicitante normalizado").toBe(String(first.who.email).toLowerCase());
    expect(t.assignee ?? null, "sem responsável (distribuição manual)").toBeNull();

    const burst = await Promise.all(Array.from({ length: 5 }, () => pub.open({ ...customer("burst"), subject: `Simultâneo ${uniq()}`, description: "Teste de número" })));
    const numbers = await Promise.all(burst.map(async (r) => { expect(r.status(), "chamados simultâneos criados").toBe(201); return (await r.json()).number as number; }));
    expect([...numbers].sort((a, b) => a - b), "5 simultâneos → números distintos e seguidos").toEqual([1, 2, 3, 4, 5].map((i) => first.number + i));

    const other = await newContext(browser);
    await register(other.request, newUser("hdportal2"));
    const pub2 = await anon(playwright, await portalOf(other.request));
    expect((await openTicket(pub2)).number, "outra empresa tem a própria numeração").toBe(first.number);
    await Promise.all([pub.ctx.dispose(), pub2.ctx.dispose(), other.close()]);
  });

  test("API: resposta pública chega ao cliente por e-mail e nota interna nunca vaza", async ({ request, playwright }) => {
    test.slow();
    await register(request, newUser("hdreply"));
    const pub = await anon(playwright, await portalOf(request));
    const tk = await openTicket(pub);
    const ack = await waitForEmail(request, tk.who.email, { contains: "/chamado/" });
    expect(ack.subject, "confirmação com o número no assunto").toContain(`[#${tk.number}]`);

    const t = await findTicket(request, tk.number);
    const secret = `nota-secreta-${uniq()}`, answer = `resposta-equipe-${uniq()}`;
    await ok(await say(request, t.id, "NOTE", secret), "nota interna");
    const sent = await ok<any>(await say(request, t.id, "PUBLIC", answer), "resposta pública");
    expect(sent.ticket?.status, "resposta sem escolher status → aguardando cliente").toBe("PENDING");

    const mail = await waitForEmail(request, tk.who.email, { contains: answer });
    expect(mail.subject, "resposta com o número no assunto").toContain(`[#${tk.number}]`);
    const view = await ok<any>(await pub.view(tk.token), "cliente abre pelo link");
    expect(JSON.stringify(view), "link do cliente mostra a resposta").toContain(answer);
    expect(JSON.stringify(view), "link do cliente nunca mostra nota interna").not.toContain(secret);
    expect((view.messages ?? []).map((m: any) => m.authorKind), "conversa do cliente").toEqual(["CUSTOMER", "AGENT"]);
    await sleep(1500);
    for (const m of await allEmailsTo(request, tk.who.email)) expect(m, "nenhum e-mail com a nota interna").not.toContain(secret);
    await pub.ctx.dispose();
  });

  test("API: o cliente responde pelo link, resolve e reabre; a equipe não fecha à mão", async ({ request, playwright }) => {
    await register(request, newUser("hdflow"));
    const pub = await anon(playwright, await portalOf(request));
    const tk = await openTicket(pub);
    const t = await findTicket(request, tk.number);
    const status = async () => (await detail(request, t.id)).status;

    await ok(await say(request, t.id, "PUBLIC", "Pode tentar de novo?"), "responder");
    expect(await status()).toBe("PENDING");
    expect((await pub.reply(tk.token, "Tentei e continua")).status(), "cliente responde pelo link").toBe(201);
    expect(await status(), "resposta do cliente volta para aberto").toBe("OPEN");

    await ok(await call(request, "PATCH", `/v1/helpdesk/tickets/${t.id}`, { status: "SOLVED" }), "resolver");
    expect((await ok<any>(await pub.view(tk.token), "cliente vê")).status).toBe("SOLVED");
    await pub.reply(tk.token, "Voltou o erro");
    expect(await status(), "cliente respondeu um resolvido → reabre").toBe("OPEN");

    await expectCode(await call(request, "PATCH", `/v1/helpdesk/tickets/${t.id}`, { status: "CLOSED" }), 409, "INVALID_STATUS_TRANSITION", "fechar à mão");
    await ok(await pub.solve(tk.token), "cliente diz que resolveu");
    expect(await status()).toBe("SOLVED");
    expect((await pub.view(`x${tk.token.slice(1)}nao-existe`)).status(), "token inválido").toBe(404);
    await pub.ctx.dispose();
  });

  test("API: e-mail recebido vira chamado e a resposta do cliente entra no mesmo chamado", async ({ request, playwright }) => {
    test.slow();
    await register(request, newUser("hdmail"));
    const pub = await anon(playwright, await portalOf(request));
    const address = `suporte.${uniq()}@example.com`;
    const inbox = await ok<any>(await call(request, "POST", "/v1/helpdesk/inboxes", { name: "Suporte", address, mode: "WEBHOOK" }), "criar caixa por webhook");
    expect(String(inbox.inboundUrl ?? ""), "endereço de recebimento").toContain("/v1/public/helpdesk/inbound/");
    const inbound = (mail: Record<string, unknown>) => pub.post(inbox.inboundUrl, { to: address, ...mail });

    const ana = `ana.${uniq()}@example.com`, subject = `Não consigo emitir boleto ${uniq()}`;
    const m1 = { from: `Ana Souza <${ana}>`, subject, text: "Dá erro na tela de boletos.", messageId: `<m1.${uniq()}@cliente.com>` };
    const r1 = await ok<any>(await inbound(m1), "e-mail novo");
    expect(r1.created, "e-mail novo cria chamado").toBe(true);
    const t = await findTicket(request, r1.ticketNumber);
    expect(t.channel).toBe("EMAIL");
    expect(t.requester?.email).toBe(ana);
    const again = await ok<any>(await inbound(m1), "mesmo e-mail de novo");
    expect(again.created ?? false, "mesmo Message-ID não duplica").toBe(false);
    expect(items(await ok(await call(request, "GET", `/v1/helpdesk/tickets?view=all&q=${encodeURIComponent(ana)}`), "chamados da Ana")), "um chamado só").toHaveLength(1);

    await ok(await say(request, t.id, "PUBLIC", "Qual o número do boleto?"), "responder");
    const r2 = await ok<any>(await inbound({ from: ana, subject: `RES: ${subject} [#${t.number}]`, text: "É o de outubro.\n\nEm ter., 13 de out. de 2026 às 10:00, Suporte <\nsuporte@acme.com> escreveu:\n> Qual o número do boleto?", messageId: `<m2.${uniq()}@cliente.com>` }), "resposta por e-mail");
    expect(r2.created ?? false, "resposta não cria chamado novo").toBe(false);
    expect(r2.ticketNumber, "entra no mesmo chamado").toBe(t.number);
    const d = await detail(request, t.id);
    const last = d.messages[d.messages.length - 1];
    expect(last.authorKind, "mensagem do cliente").toBe("CUSTOMER");
    expect(last.bodyText, "sem a mensagem citada").toContain("É o de outubro.");
    expect(last.bodyText, "sem a mensagem citada").not.toContain("escreveu");
    expect(d.status, "cliente respondeu → aberto").toBe("OPEN");

    const r3 = await ok<any>(await inbound({ from: `intruso.${uniq()}@example.com`, subject: `Re: ${subject} [#${t.number}]`, text: "Quero ver esse chamado", messageId: `<m3.${uniq()}@x.com>` }), "número de outro chamado");
    expect(r3.created, "quem não participa vira chamado novo").toBe(true);
    expect(r3.ticketNumber).not.toBe(t.number);

    const robot = `ferias.${uniq()}@example.com`;
    const r4 = await ok<any>(await inbound({ from: robot, subject: "Resposta automática: estou de férias", text: "Volto dia 20.", messageId: `<m4.${uniq()}@x.com>`, headers: { "Auto-Submitted": "auto-replied" } }), "resposta automática");
    expect(r4.ignored, "resposta automática solta é ignorada").toBe("loop");
    await sleep(1500);
    expect(await allEmailsTo(request, robot), "nenhuma confirmação para resposta automática").toHaveLength(0);

    expect((await pub.post(`${cfg.apiURL}/v1/public/helpdesk/inbound/chave-errada-${uniq()}`, m1)).status(), "chave errada").toBe(404);
    await pub.ctx.dispose();
  });

  test("API: SLA — prazo pela prioridade, nota não conta, resposta pública cumpre e aguardando pausa", async ({ request, playwright }) => {
    await register(request, newUser("hdsla"));
    await ensureFeature(request, "helpdesk_sla");
    await ok(await call(request, "PUT", "/v1/helpdesk/sla", { policy: { URGENT: { firstResponse: 60, resolution: 240, calendar: "24x7" }, NORMAL: { firstResponse: 120, resolution: 600, calendar: "24x7" } } }), "política de SLA");
    const pub = await anon(playwright, await portalOf(request));
    const tk = await openTicket(pub);
    let t = await findTicket(request, tk.number);
    const created = Date.parse(t.createdAt);
    near(t.sla?.firstResponse?.dueAt, created + 120 * MIN, "normal: primeira resposta em 2 h");
    expect(t.sla.firstResponse.state).toBe("ok");

    await ok(await call(request, "PATCH", `/v1/helpdesk/tickets/${t.id}`, { priority: "URGENT" }), "virar urgente");
    t = await findTicket(request, tk.number);
    near(t.sla.firstResponse.dueAt, created + 60 * MIN, "urgente: prazo recalculado a partir da abertura");

    await ok(await say(request, t.id, "NOTE", "Vendo com o time"), "nota");
    expect((await findTicket(request, tk.number)).sla.firstResponse.state, "nota não conta como resposta").toBe("ok");
    await ok(await say(request, t.id, "PUBLIC", "Estamos verificando", "PENDING"), "resposta pública");
    t = await findTicket(request, tk.number);
    expect(t.sla.firstResponse.state, "primeira resposta cumprida").toBe("achieved");
    expect(t.sla.resolution.state, "aguardando cliente pausa a solução").toBe("paused");
    await pub.reply(tk.token, "Mais detalhes aqui");
    expect((await findTicket(request, tk.number)).sla.resolution.state, "cliente respondeu → prazo volta a correr").toBe("ok");
    await pub.ctx.dispose();
  });

  test("API: distribuição automática por rodízio só entre atendentes disponíveis", async ({ browser, request, playwright }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request;
    await ensureFeature(o, "helpdesk_automation");
    const meM = await me(m), meO = await me(o);
    await ok(await call(o, "PUT", `/v1/helpdesk/agents/${meM.user.id}`, { active: true }), "membro vira atendente");
    const queues = items<any>(await ok(await call(o, "GET", "/v1/helpdesk/queues"), "filas"));
    const q = queues.find((x) => x.isDefault) ?? queues[0];
    await ok(await call(o, "PATCH", `/v1/helpdesk/queues/${q.id}`, { assignment: "ROUND_ROBIN", agentIds: [meO.user.id, meM.user.id] }), "fila com rodízio");

    const pub = await anon(playwright, await portalOf(o));
    const owners = async (n: number) => { const out: string[] = []; for (let i = 0; i < n; i++) { const tk = await openTicket(pub); out.push((await findTicket(o, tk.number)).assignee?.id ?? "ninguém"); } return out; };
    const first = await owners(4);
    expect(first.filter((x) => x === meO.user.id), `rodízio: 2 para o owner (${first.join(", ")})`).toHaveLength(2);
    expect(first.filter((x) => x === meM.user.id), "rodízio: 2 para o membro").toHaveLength(2);

    await ok(await call(m, "PUT", "/v1/helpdesk/me/availability", { available: false }), "membro indisponível");
    expect(await owners(2), "indisponível não recebe").toEqual([meO.user.id, meO.user.id]);
    await Promise.all([pub.ctx.dispose(), ownerCtx.close(), memberCtx.close()]);
  });

  test("API: gatilho — assunto com 'boleto' vai para o Financeiro com prioridade alta", async ({ request, playwright }) => {
    await register(request, newUser("hdrule"));
    await ensureFeature(request, "helpdesk_automation");
    const fin = await ok<any>(await call(request, "POST", "/v1/helpdesk/queues", { name: `Financeiro ${uniq()}` }), "fila Financeiro");
    await ok(await call(request, "POST", "/v1/helpdesk/rules", {
      name: "Boleto vai pro financeiro", active: true, on: ["created"],
      conditions: { all: [{ field: "subject", op: "contains", value: ["boleto"] }] },
      actions: [{ type: "set_queue", value: fin.id }, { type: "set_priority", value: "HIGH" }, { type: "add_tags", value: ["cobranca"] }],
    }), "criar gatilho");
    const pub = await anon(playwright, await portalOf(request));
    const a = await findTicket(request, (await openTicket(pub, { subject: `2ª via do BOLÉTO ${uniq()}` })).number);
    expect(a.queue?.id, "fila do gatilho (sem diferenciar acento e maiúscula)").toBe(fin.id);
    expect(a.priority).toBe("HIGH");
    expect(a.tags).toContain("cobranca");
    const b = await findTicket(request, (await openTicket(pub, { subject: `Acesso ao sistema ${uniq()}` })).number);
    expect(b.queue?.id, "outro assunto fica na fila padrão").not.toBe(fin.id);
    expect(b.priority).toBe("NORMAL");
    await pub.ctx.dispose();
  });

  test("API: pesquisa de satisfação só depois de resolver", async ({ request, playwright }) => {
    await register(request, newUser("hdcsat"));
    await ensureFeature(request, "helpdesk_csat");
    const pub = await anon(playwright, await portalOf(request));
    const tk = await openTicket(pub);
    const t = await findTicket(request, tk.number);
    await expectCode(await pub.csat(tk.token, "GOOD"), 409, "CSAT_NOT_AVAILABLE", "avaliar chamado aberto");
    await ok(await call(request, "PATCH", `/v1/helpdesk/tickets/${t.id}`, { status: "SOLVED" }), "resolver");
    expect((await ok<any>(await pub.view(tk.token), "cliente vê")).csat?.available, "pesquisa disponível").toBe(true);
    await ok(await pub.csat(tk.token, "GOOD", "Atendimento ótimo"), "avaliar");
    const d = await detail(request, t.id);
    expect(d.csat?.rating).toBe("GOOD");
    expect(d.csat?.comment).toBe("Atendimento ótimo");
    await pub.ctx.dispose();
  });

  test("API: base de conhecimento — só artigo publicado e público aparece no portal, busca sem acento", async ({ request, playwright }) => {
    await register(request, newUser("hdkb"));
    const portal = await portalOf(request);
    const pub = await anon(playwright, portal);
    const tag = uniq();
    const pubA = await ok<any>(await call(request, "POST", "/v1/helpdesk/kb/articles", { title: `Configuração de notificações ${tag}`, bodyHtml: `<p>Acesse Configurações e escolha os avisos. ${tag}</p>`, status: "PUBLISHED" }), "artigo publicado");
    const draft = await ok<any>(await call(request, "POST", "/v1/helpdesk/kb/articles", { title: `Rascunho secreto ${tag}`, bodyHtml: `<p>Ainda não ${tag}</p>`, status: "DRAFT" }), "rascunho");
    const internal = await ok<any>(await call(request, "POST", "/v1/helpdesk/kb/articles", { title: `Procedimento interno ${tag}`, bodyHtml: `<p>Só equipe ${tag}</p>`, status: "PUBLISHED", internal: true }), "interno");
    expect(String(pubA.publicUrl ?? ""), "link público do artigo").toContain("/ajuda/");

    const found = await pub.search("configuracao notificacoes");
    expect(found.map((x) => x.slug), "busca sem acento acha o publicado").toContain(pubA.slug);
    const all = await pub.search(tag);
    expect(all.map((x) => x.slug), "rascunho e interno nunca aparecem").toEqual([pubA.slug]);
    expect((await pub.get(`/${portal}/articles/${pubA.slug}`)).status()).toBe(200);
    expect((await pub.get(`/${portal}/articles/${draft.slug}`)).status(), "rascunho pelo link").toBe(404);
    expect((await pub.get(`/${portal}/articles/${internal.slug}`)).status(), "interno pelo link").toBe(404);
    await pub.ctx.dispose();
  });

  test("API: chave da API abre chamado pelo sistema do cliente", async ({ request, playwright }) => {
    await register(request, newUser("hdapi"));
    await ensureFeature(request, "helpdesk_integrations");
    const key = await ok<any>(await call(request, "POST", "/v1/helpdesk/api-keys", { name: "Meu sistema" }), "criar chave");
    expect(String(key.key ?? ""), "chave mostrada na criação").toMatch(/^hd_/);
    const pub = await anon(playwright, await portalOf(request));
    const url = `${cfg.apiURL}/v1/public/helpdesk/api/tickets`;
    const body = { subject: `Erro no checkout ${uniq()}`, description: "Cliente relatou erro 500", requester: customer("api"), externalId: `ext-${uniq()}` };
    const res = await ok<any>(await pub.post(url, body, { Authorization: `Bearer ${key.key}` }), "abrir chamado pela API");
    expect((await findTicket(request, res.number)).channel).toBe("API");
    const again = await ok<any>(await pub.post(url, body, { Authorization: `Bearer ${key.key}` }), "mesmo externalId");
    expect(again.number, "externalId repetido devolve o mesmo chamado").toBe(res.number);
    await expectCode(await pub.post(url, body, { Authorization: "Bearer hd_errada" }), 401, "API_KEY_INVALID", "chave errada");
    await pub.ctx.dispose();
  });

  test("API: campo isca não grava nada", async ({ request, playwright }) => {
    await register(request, newUser("hdspam"));
    const pub = await anon(playwright, await portalOf(request));
    const res = await pub.open({ ...customer("robo"), subject: "Promoção", description: "Clique aqui", _gotcha: "http://spam.example" });
    expect(res.status(), "robô recebe sucesso (não aprende)").toBeLessThan(300);
    expect(items(await ok(await call(request, "GET", "/v1/helpdesk/tickets?view=all"), "lista")), "nada gravado").toHaveLength(0);
    await pub.ctx.dispose();
  });

  test("API: membro que não é atendente e outra empresa não veem os chamados", async ({ browser, request, playwright }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const pub = await anon(playwright, await portalOf(ownerCtx.request));
    const tk = await openTicket(pub);
    const t = await findTicket(ownerCtx.request, tk.number);
    await expectCode(await call(memberCtx.request, "GET", "/v1/helpdesk/tickets"), 403, "NOT_AN_AGENT", "membro que não é atendente");
    expect([403, 404], "membro não abre o chamado").toContain((await call(memberCtx.request, "GET", `/v1/helpdesk/tickets/${t.id}`)).status());

    const other = await newContext(browser);
    await register(other.request, newUser("hdother"));
    const r = other.request;
    expect((await call(r, "GET", `/v1/helpdesk/tickets/${t.id}`)).status(), "chamado de outra empresa").toBe(404);
    expect((await call(r, "PATCH", `/v1/helpdesk/tickets/${t.id}`, { status: "SOLVED" })).status(), "mudar chamado de outra empresa").toBe(404);
    expect((await say(r, t.id, "PUBLIC", "invasão")).status(), "responder chamado de outra empresa").toBe(404);
    expect(items<any>(await ok(await call(r, "GET", "/v1/helpdesk/tickets?view=all"), "lista da outra empresa")).find((x) => x.id === t.id), "não aparece na lista").toBeUndefined();
    await Promise.all([pub.ctx.dispose(), ownerCtx.close(), memberCtx.close(), other.close()]);
  });

  test("API: macro preenche as variáveis e devolve as ações, sem gravar nada", async ({ request, playwright }) => {
    await register(request, newUser("hdmacro"));
    const pub = await anon(playwright, await portalOf(request));
    const tk = await openTicket(pub, { name: "Ana Souza" });
    const t = await findTicket(request, tk.number);
    const macro = await ok<any>(await call(request, "POST", "/v1/helpdesk/macros", { name: "Pedir detalhes", bodyHtml: "<p>Olá {{cliente.primeiro_nome}}, sobre o chamado {{chamado.numero}}: pode mandar um print?</p>", actions: [{ type: "set_status", value: "PENDING" }, { type: "add_tags", value: ["aguardando-print"] }], shared: true }), "criar macro");
    const applied = await ok<any>(await call(request, "POST", `/v1/helpdesk/macros/${macro.id}/apply`, { ticketId: t.id }), "aplicar macro");
    expect(applied.bodyHtml, "variáveis preenchidas").toContain(`Olá Ana, sobre o chamado #${tk.number}`);
    expect(applied.patch?.status, "ação de status").toBe("PENDING");
    expect(applied.patch?.tags ?? [], "ação de etiqueta").toContain("aguardando-print");
    const d = await detail(request, t.id);
    expect(d.status, "aplicar não grava nada até enviar").toBe("OPEN");
    expect(d.messages.filter((x: any) => x.authorKind === "AGENT"), "nenhuma mensagem enviada").toHaveLength(0);
    await pub.ctx.dispose();
  });

  test("API: mesclar chamados junta a conversa e o link antigo do cliente abre o que ficou", async ({ request, playwright }) => {
    await register(request, newUser("hdmerge"));
    const pub = await anon(playwright, await portalOf(request));
    const a = await openTicket(pub, { description: `Primeira mensagem ${uniq()}` });
    const b = await openTicket(pub, { description: `Segunda mensagem ${uniq()}` });
    const ta = await findTicket(request, a.number), tb = await findTicket(request, b.number);
    await expectCode(await call(request, "POST", `/v1/helpdesk/tickets/${ta.id}/merge`, { intoId: ta.id }), 409, "MERGE_INVALID", "mesclar consigo mesmo");
    await ok(await call(request, "POST", `/v1/helpdesk/tickets/${ta.id}/merge`, { intoId: tb.id }), "mesclar A em B");
    const da = await detail(request, ta.id);
    expect(da.status, "origem fechada").toBe("CLOSED");
    expect(da.mergedInto?.id ?? da.mergedInto, "origem aponta para o destino").toBe(tb.id);
    const db = await detail(request, tb.id);
    const texts = db.messages.map((x: any) => x.bodyText).join("\n");
    expect(texts, "destino com a conversa dos dois").toContain("Primeira mensagem");
    expect(texts).toContain("Segunda mensagem");
    expect((await ok<any>(await pub.view(a.token), "link antigo do cliente")).number, "link antigo abre o chamado que ficou").toBe(b.number);
    await pub.ctx.dispose();
  });

  // ------------------------------------------------------------------ telas
  test("portal: erro no campo, abrir chamado e a equipe vê na caixa de entrada", async ({ page, browser }) => {
    await signUp(page, "hdui");
    const portal = await portalOf(page.context().request);
    const visitor = await newContext(browser);
    const vp = await visitor.newPage();
    await vp.goto(`/ajuda/${portal}`);
    await expect(vp.getByTestId("helpdesk-portal")).toBeVisible();
    await vp.getByTestId("helpdesk-portal-new").click();
    const form = vp.getByTestId("helpdesk-portal-form");
    await expect(form).toBeVisible();
    await vp.getByTestId("helpdesk-portal-submit").click();
    await expect(form.locator('[data-testid="helpdesk-portal-field-error"][data-field="email"]'), "erro no e-mail").toBeVisible();

    const subject = `Erro ao gerar relatório ${uniq()}`;
    await vp.getByLabel("Nome", { exact: true }).fill(`Gabi ${uniq()}`);
    await vp.getByLabel("E-mail", { exact: true }).fill(`gabi.${uniq()}@example.com`);
    await vp.getByLabel("Assunto", { exact: true }).fill(subject);
    await vp.getByLabel("Descrição", { exact: true }).fill("O relatório mensal não abre.");
    await humanPause(vp);
    await vp.getByTestId("helpdesk-portal-submit").click();
    const created = vp.getByTestId("helpdesk-portal-created");
    await expect(created, "confirmação com o número").toContainText(/#\d+/);
    const number = Number((await created.textContent())!.match(/#(\d+)/)![1]);
    await visitor.close();

    const t = await findTicket(page.context().request, number);
    expect(t.subject, "chamado com o assunto digitado").toBe(subject);
    await page.goto("/suporte?visao=open");
    await expect(page.getByTestId("helpdesk-ticket-list")).toBeVisible();
    await expect(page.locator(`[data-testid="helpdesk-ticket-row"][data-ticket-id="${t.id}"]`), "linha na caixa de entrada").toBeVisible();
  });

  test("chamado: nota interna, resposta pública e atribuir pela tela; o cliente vê só a resposta e responde", async ({ page, browser, playwright }) => {
    test.slow();
    await signUp(page, "hdticket");
    const req = page.context().request;
    const pub = await anon(playwright, await portalOf(req));
    const tk = await openTicket(pub);
    const t = await findTicket(req, tk.number);
    const meO = await me(req);

    await page.goto(`/suporte/chamados/${t.id}`);
    await expect(page.getByTestId("helpdesk-ticket")).toBeVisible();
    await expect(page.getByTestId("helpdesk-ticket-number")).toContainText(String(tk.number));
    const editor = page.getByTestId("helpdesk-reply-editor");
    const note = `Nota interna ${uniq()}`, answer = `Tente limpar o cache ${uniq()}`;
    await page.getByTestId("helpdesk-reply-mode-note").click();
    await editor.click();
    await editor.fill(note);
    await page.getByTestId("helpdesk-reply-submit").click();
    await expect(page.locator('[data-testid="helpdesk-message"][data-kind="NOTE"]').filter({ hasText: note }), "nota na conversa").toBeVisible();

    await page.getByTestId("helpdesk-reply-mode-public").click();
    await editor.click();
    await editor.fill(answer);
    await page.getByTestId("helpdesk-reply-submit").click();
    await expect(page.locator('[data-testid="helpdesk-message"][data-kind="PUBLIC"]').filter({ hasText: answer }), "resposta na conversa").toBeVisible();
    await expect.poll(async () => (await detail(req, t.id)).status, { message: "resposta → aguardando cliente" }).toBe("PENDING");

    await page.getByTestId("helpdesk-assign-me").click();
    await expect.poll(async () => (await detail(req, t.id)).assignee?.id, { message: "atribuído pela tela" }).toBe(meO.user.id);

    const visitor = await newContext(browser);
    const vp = await visitor.newPage();
    await vp.goto(`/chamado/${tk.token}`);
    await expect(vp.getByTestId("helpdesk-customer-ticket")).toBeVisible();
    await expect(vp.locator('[data-testid="helpdesk-customer-message"][data-author="AGENT"]').filter({ hasText: answer }), "cliente vê a resposta").toBeVisible();
    await expect(vp.getByText(note), "cliente nunca vê a nota").toHaveCount(0);
    const reply = `Ainda não funcionou ${uniq()}`;
    await vp.getByLabel("Sua resposta").fill(reply);
    await vp.getByTestId("helpdesk-customer-reply-submit").click();
    await expect(vp.locator('[data-testid="helpdesk-customer-message"][data-author="CUSTOMER"]').filter({ hasText: reply })).toBeVisible();
    await visitor.close();
    await expect.poll(async () => (await detail(req, t.id)).status, { message: "cliente respondeu → aberto" }).toBe("OPEN");

    await page.reload();
    await expect(page.getByTestId("helpdesk-message").filter({ hasText: reply }), "resposta do cliente aparece para a equipe").toBeVisible();
    await chooseStatus(page, "SOLVED", "Resolvido");
    await expect.poll(async () => (await detail(req, t.id)).status, { message: "resolvido pela tela" }).toBe("SOLVED");
    await pub.ctx.dispose();
  });

  test("chamado do cliente: isso resolveu e avaliação", async ({ page, browser, playwright }) => {
    await signUp(page, "hdcsatui");
    const req = page.context().request;
    await ensureFeature(req, "helpdesk_csat");
    const pub = await anon(playwright, await portalOf(req));
    const tk = await openTicket(pub);
    const t = await findTicket(req, tk.number);
    const visitor = await newContext(browser);
    const vp = await visitor.newPage();
    await vp.goto(`/chamado/${tk.token}`);
    await vp.getByTestId("helpdesk-customer-solve").click();
    await vp.getByTestId("helpdesk-csat-good").click();
    await vp.getByTestId("helpdesk-csat-submit").click();
    await expect(vp.getByTestId("helpdesk-csat-thanks")).toBeVisible();
    await visitor.close();
    const d = await detail(req, t.id);
    expect(d.status).toBe("SOLVED");
    expect(d.csat?.rating).toBe("GOOD");
    await pub.ctx.dispose();
  });

  test("central de ajuda: busca, artigo, 'isso ajudou?' e sugestão ao abrir chamado", async ({ page, browser }) => {
    await signUp(page, "hdkbui");
    const req = page.context().request;
    const portal = await portalOf(req);
    const title = `Como emitir a segunda via do boleto ${uniq()}`;
    const art = await ok<any>(await call(req, "POST", "/v1/helpdesk/kb/articles", { title, bodyHtml: "<p>Acesse Financeiro, depois Boletos, e clique em Segunda via.</p>", status: "PUBLISHED" }), "artigo");

    const visitor = await newContext(browser);
    const vp = await visitor.newPage();
    await vp.goto(`/ajuda/${portal}`);
    const search = vp.getByTestId("helpdesk-portal-search");
    await search.fill("segunda via boleto");
    await search.press("Enter");
    const result = vp.locator(`[data-testid="helpdesk-portal-article"][data-slug="${art.slug}"]`);
    await expect(result, "artigo nos resultados").toBeVisible();
    await result.click();
    await expect(vp.getByTestId("helpdesk-article-view")).toContainText(title);
    await vp.getByTestId("helpdesk-article-helpful").getByRole("button", { name: /sim/i }).click();
    await expect.poll(async () => (await ok<any>(await call(req, "GET", `/v1/helpdesk/kb/articles/${art.id}`), "artigo")).helpfulYes, { message: "voto 'ajudou' gravado" }).toBe(1);

    await vp.goto(`/ajuda/${portal}/novo`);
    await vp.getByLabel("Assunto", { exact: true }).fill("boleto segunda via");
    await expect(vp.getByTestId("helpdesk-portal-suggestions"), "sugestão de artigo enquanto digita").toContainText(title);
    await visitor.close();
  });

  test("caixa de entrada: visões com contadores", async ({ page, playwright }) => {
    await signUp(page, "hdviews");
    const req = page.context().request;
    const pub = await anon(playwright, await portalOf(req));
    const a = await findTicket(req, (await openTicket(pub)).number);
    const b = await findTicket(req, (await openTicket(pub)).number);
    await ok(await call(req, "PATCH", `/v1/helpdesk/tickets/${a.id}`, { assigneeId: (await me(req)).user.id }), "atribuir um");
    await page.goto("/suporte");
    const count = (v: string) => page.locator(`[data-testid="helpdesk-view"][data-view="${v}"]`).getByTestId("helpdesk-view-count");
    await expect(count("mine"), "meus abertos").toHaveText("1");
    await expect(count("unassigned"), "sem responsável").toHaveText("1");
    await page.locator('[data-testid="helpdesk-view"][data-view="unassigned"]').click();
    await expect(page.locator(`[data-testid="helpdesk-ticket-row"][data-ticket-id="${b.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="helpdesk-ticket-row"][data-ticket-id="${a.id}"]`), "atribuído não aparece em sem responsável").toHaveCount(0);
    await pub.ctx.dispose();
  });
});
