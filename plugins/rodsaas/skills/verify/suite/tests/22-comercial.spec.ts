import { test, expect, type APIRequestContext, type APIResponse, type Browser, type BrowserContext } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, sleep, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { linkFrom, waitForEmail } from "../support/mailpit";
import { newContext } from "../support/ui";

// Parte do preset comercial (app Comercial, /rodsaas:comercial). Roda quando rodsaas.json tem "comercial" em presets
// ou a API tem /v1/com/me. Confere o que mais se simplifica: totais calculados no servidor (desconto por item e geral,
// opcional, recorrente, parcelas), aprovação de desconto que bloqueia o envio, proposta travada depois de enviada,
// aceite que valida nome/documento e guarda o que foi aceito, vencida/substituída sem aceite, modelos com variáveis
// validadas e filtros, vigência/renovação/reajuste, assinatura com ordem, código por e-mail, hash e verificação pública,
// papéis (vendedor só vê o que é dele) e as telas principais.

async function installed(req: APIRequestContext) {
  if (cfg.presets.includes("comercial")) return true;
  return (await call(req, "GET", "/v1/com/me")).status() !== 404;
}

async function expectCode(res: APIResponse, status: number, code: string, label: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  const json = JSON.parse(body || "{}");
  expect(json.code, `${label}: code`).toBe(code);
  return json;
}
const pathsOf = (b: any) => (b?.errors ?? []).map((e: any) => e.path) as string[];

/** Garante a feature no plano (no modo de teste da cobrança assina o plano que tem); senão pula. */
async function ensureFeature(req: APIRequestContext, feature: string) {
  const plan: any = (await me(req)).plan;
  if (plan?.features?.includes(feature)) return;
  const mode = await billingMode(req);
  test.skip(mode !== "fake", `"${feature}" exige plano pago e a cobrança está em modo "${mode}"`);
  const target = (await plansFromApi(req)).paid.find((p) => p.features?.includes(feature));
  test.skip(!target, `nenhum plano com a feature ${feature}`);
  await ok(await call(req, "POST", "/v1/billing/checkout-sessions", { plan: target!.id, interval: "month" }), `assinar plano com ${feature} (modo de teste)`);
}

// ---------------------------------------------------------------- datas (dia em São Paulo)
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); };
/** Soma meses mantendo o dia (31 → último dia do mês), como o comercial-lib. */
const addMonths = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
};
const term = (start: string, months: number, noticeDays = 30) => { const endDate = addDays(addMonths(start, months), -1); return { endDate, noticeDate: addDays(endDate, -noticeDays) }; };

const CPF = "111.444.777-35", CPF2 = "529.982.247-25", CNPJ = "11.222.333/0001-81";
const mail = (tag: string) => `${tag}.${uniq()}@example.com`;
const client = (email = mail("cliente")) => ({ name: "Maria Cliente", companyName: "Cliente Ltda", document: CNPJ.replace(/\D/g, ""), email });

// ---------------------------------------------------------------- pessoas
async function owner(browser: Browser) {
  const ctx = await newContext(browser);
  const user = newUser("com");
  await register(ctx.request, user);
  const cme = await ok<any>(await call(ctx.request, "GET", "/v1/com/me"), "/v1/com/me do owner");
  return { user, ctx, req: ctx.request, cme, userId: (await me(ctx.request)).user.id as string };
}
async function addMember(browser: Browser, mailReq: APIRequestContext, ownerReq: APIRequestContext, tag: string, role: string | null) {
  const u = newUser(tag);
  await ok(await call(ownerReq, "POST", "/v1/invitations", { email: u.email, role: "MEMBER" }), "convite");
  const m1 = await waitForEmail(mailReq, u.email, { contains: "/convite" });
  const token = new URL(linkFrom(m1, "/convite")).searchParams.get("token");
  const ctx: BrowserContext = await newContext(browser);
  await register(ctx.request, u, { invitationToken: token });
  const m = items<any>(await ok(await call(ownerReq, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === u.email);
  expect(m, `membro ${u.email}`).toBeTruthy();
  if (role) await ok(await call(ownerReq, "PUT", `/v1/com/roles/${m.user.id}`, { role }), `papel ${role}`);
  return { user: u, ctx, req: ctx.request, userId: m.user.id as string };
}

// ---------------------------------------------------------------- propostas
async function proposal(req: APIRequestContext, body: Record<string, unknown> = {}, label = "criar proposta") {
  return ok<any>(await call(req, "POST", "/v1/com/proposals", { title: `Proposta ${uniq()}`, client: client(), items: [{ description: "Implantação", qty: 1, unitCents: 100000 }], ...body }), label);
}
async function getProposal(req: APIRequestContext, id: string) { return ok<any>(await call(req, "GET", `/v1/com/proposals/${id}`), "proposta"); }
async function sendP(req: APIRequestContext, id: string, label = "enviar proposta") {
  const p = await ok<any>(await call(req, "POST", `/v1/com/proposals/${id}/send`, { sendEmail: true }), label);
  expect(String(p.publicUrl), "link público /proposta/<token>").toMatch(/\/proposta\/[A-Za-z0-9_-]{20,}$/);
  return { p, token: String(p.publicUrl).split("/proposta/")[1] };
}
const pub = (anon: APIRequestContext, token: string, sub = "") => `/v1/public/com/proposals/${token}${sub}`;

// ---------------------------------------------------------------- contratos e assinatura
async function contract(req: APIRequestContext, body: Record<string, unknown> = {}, label = "criar contrato") {
  return ok<any>(await call(req, "POST", "/v1/com/contracts", {
    title: `Contrato ${uniq()}`, valueCents: 100000, recurrence: "month", startDate: today(), months: 12,
    parties: [{ role: "CONTRACTOR", name: "Maria Cliente", document: CPF, email: mail("parte") }, { role: "CONTRACTED", name: "Fornecedor Ltda", document: CNPJ, email: mail("fornecedor") }],
    ...body,
  }), label);
}
async function envelope(req: APIRequestContext, contractId: string, signers: { name: string; email: string; role: string; order: number }[]) {
  const e = await ok<any>(await call(req, "POST", `/v1/com/contracts/${contractId}/send-for-signature`, { signers }), "enviar para assinatura");
  expect([e.status, e.signers?.length], "envelope em andamento com os signatários").toEqual(["IN_PROGRESS", signers.length]);
  expect(String(e.documentSha256), "SHA-256 do documento enviado").toMatch(/^[0-9a-f]{64}$/);
  const tokenOf = (email: string) => String(e.signers.find((s: any) => s.email === email)?.signUrl ?? "").split("/assinar/")[1];
  return { e, tokenOf };
}
const sign = (anon: APIRequestContext, token: string, sub = "") => `/v1/public/com/sign/${token}${sub}`;

/** Código de 6 dígitos do e-mail mais novo para `to` que não é o convite (não tem /assinar/). */
async function otpFrom(req: APIRequestContext, to: string, notCode?: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const res = await req.get(`${cfg.mailpitURL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`, { failOnStatusCode: false });
    if (res.ok()) {
      for (const m of (await res.json()).messages ?? []) {
        const r = await req.get(`${cfg.mailpitURL}/api/v1/message/${m.ID}`, { failOnStatusCode: false });
        if (!r.ok()) continue;
        const j = await r.json();
        const text = String(j.Text || String(j.HTML ?? "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " "));
        if (text.includes("/assinar/")) continue;
        const code = text.match(/(?<![\d#])(\d{6})(?!\d)/)?.[1];
        if (code && code !== notCode) return code;
      }
    }
    await sleep(1000);
  }
  throw new Error(`nenhum e-mail com código de 6 dígitos para ${to} (o código vai só por e-mail, sem link)`);
}

test.describe("Comercial", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset comercial");
  });

  test("API: totais exatos no servidor, plano de pagamento, validação dos itens e numeração", async ({ browser }) => {
    const o = await owner(browser);
    expect([o.cme.role, o.cme.canApprove], "owner é COM_ADMIN e aprova").toEqual(["COM_ADMIN", true]);
    const firstDue = addDays(today(), 10);
    const p = await proposal(o.req, {
      items: [
        { description: "Consultoria", qty: 2, unitCents: 100000, discountPct: 10 },
        { description: "Treinamento", qty: 1.5, unit: "h", unitCents: 20000, discountCents: 5000 },
        { description: "Módulo extra", qty: 1, unitCents: 50000, optional: true, selected: false },
        { description: "Suporte mensal", qty: 1, unitCents: 30000, recurring: "month" },
      ],
      globalDiscountPct: 5,
      paymentPlan: { kind: "entrada", installments: 3, downPaymentPct: 20, firstDue },
    });
    expect([p.status, p.number, p.version], "rascunho nº 1, versão 1").toEqual(["DRAFT", 1, 1]);
    expect(String(p.code), "código P-0001").toMatch(/^P-0001\b/);
    const t = p.totals;
    expect([t.oneTime.grossCents, t.oneTime.itemDiscountCents, t.oneTime.globalDiscountCents, t.oneTime.totalCents], "avulso: 2.300 − 250 − 5% = 1.947,50 (opcional fora, recorrente separado)").toEqual([230000, 25000, 10250, 194750]);
    expect([t.monthlyCents, t.yearlyCents, t.effectiveDiscountPct], "mensal 300; desconto efetivo 13,6%").toEqual([30000, 0, 13.6]);
    expect(t.lines.map((l: any) => l.netCents), "líquido por item").toEqual([180000, 25000, 50000, 30000]);
    expect(p.paymentPlan?.schedule?.map((s: any) => s.amountCents), "entrada 20% + 3 parcelas com o centavo na 1ª").toEqual([38950, 51934, 51933, 51933]);
    expect(p.paymentPlan.schedule[0].dueDate, "entrada no 1º vencimento").toBe(firstDue);
    expect(p.approval?.required, "admin não precisa de aprovação").toBe(false);

    const p2 = await proposal(o.req);
    expect(p2.number, "numeração seguida por empresa").toBe(2);
    const patched = await ok<any>(await call(o.req, "PATCH", `/v1/com/proposals/${p2.id}`, { title: "Título novo", items: [{ description: "Implantação", qty: 3, unitCents: 100000 }] }), "editar rascunho");
    expect([patched.title, patched.totals.oneTime.totalCents], "rascunho muda e recalcula").toEqual(["Título novo", 300000]);
    const list = items<any>(await ok(await call(o.req, "GET", "/v1/com/proposals"), "lista"));
    expect(list.find((x) => x.id === p.id)?.totals?.oneTimeCents, "lista com o total avulso").toBe(194750);

    const v1 = await expectCode(await call(o.req, "POST", "/v1/com/proposals", { title: "X", client: client(), items: [{ description: "A", qty: 1.2345, unitCents: 100 }] }), 400, "VALIDATION_ERROR", "quantidade com 4 casas");
    expect(pathsOf(v1), "erro em items.0.qty").toContain("items.0.qty");
    const v2 = await expectCode(await call(o.req, "POST", "/v1/com/proposals", { title: "X", client: client(), items: [{ description: "A", qty: 1, unitCents: 100, discountPct: 5, discountCents: 10 }] }), 400, "VALIDATION_ERROR", "desconto em % e R$ juntos");
    expect(pathsOf(v2), "erro em items.0.discountCents").toContain("items.0.discountCents");
    const v3 = await expectCode(await call(o.req, "POST", "/v1/com/proposals", { title: "X", client: { ...client(), document: "11.222.333/0001-82" }, items: [{ description: "A", qty: 1, unitCents: 100 }] }), 400, "VALIDATION_ERROR", "CNPJ inválido do cliente");
    expect(pathsOf(v3), "erro em client.document").toContain("client.document");
    expect((await call(o.req, "POST", "/v1/com/proposals", { title: "X", client: client(), items: [] })).status(), "sem itens").toBe(400);
  });

  test("API: desconto acima do limite espera aprovação do admin antes de enviar", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    await ensureFeature(o.req, "com_approvals");
    const S = await addMember(browser, request, o.req, "vendedor", "SELLER");
    const p = await proposal(S.req, { items: [{ description: "Projeto", qty: 1, unitCents: 1000000, discountPct: 20 }] }, "vendedor cria com 20%");
    expect([p.status, p.approval?.required, p.approval?.status], "aguardando aprovação").toEqual(["PENDING_APPROVAL", true, "PENDING"]);
    expect((p.approval.reasons ?? []).map((r: any) => r.code), "motivo: desconto acima do limite").toContain("DISCOUNT_ABOVE_LIMIT");
    const blocked = await expectCode(await call(S.req, "POST", `/v1/com/proposals/${p.id}/send`, {}), 409, "NEEDS_APPROVAL", "enviar com aprovação pendente");
    expect((blocked.reasons ?? []).map((r: any) => r.code), "409 traz os motivos").toContain("DISCOUNT_ABOVE_LIMIT");
    expect((await call(S.req, "POST", `/v1/com/proposals/${p.id}/approval`, { decision: "approve" })).status(), "vendedor não aprova").toBe(403);
    expect((await ok<any>(await call(o.req, "GET", "/v1/com/me"), "me do admin")).pending.toApprove, "admin vê 1 para aprovar").toBeGreaterThanOrEqual(1);
    await expectCode(await call(o.req, "POST", `/v1/com/proposals/${p.id}/approval`, { decision: "reject", comment: "  " }), 400, "COMMENT_REQUIRED", "recusa sem comentário");
    await ok(await call(o.req, "POST", `/v1/com/proposals/${p.id}/approval`, { decision: "reject", comment: "Máximo 18%" }), "admin recusa");
    const rej = await getProposal(S.req, p.id);
    expect([rej.status, rej.approval?.status], "recusada volta a rascunho").toEqual(["DRAFT", "REJECTED"]);
    const again = await ok<any>(await call(S.req, "PATCH", `/v1/com/proposals/${p.id}`, { items: [{ description: "Projeto", qty: 1, unitCents: 1000000, discountPct: 18 }] }), "vendedor ajusta para 18%");
    expect(again.status, "ainda acima de 15%: aprovação de novo").toBe("PENDING_APPROVAL");
    await expectCode(await call(o.req, "POST", `/v1/com/proposals/${p.id}/approval`, { decision: "maybe" }), 400, "VALIDATION_ERROR", "decisão inválida");
    await ok(await call(o.req, "POST", `/v1/com/proposals/${p.id}/approval`, { decision: "approve", comment: "Ok, cliente estratégico" }), "admin aprova");
    await expectCode(await call(o.req, "POST", `/v1/com/proposals/${p.id}/approval`, { decision: "approve" }), 409, "NOT_AWAITING_APPROVAL", "aprovar de novo");
    const { p: sent } = await sendP(S.req, p.id, "aprovada envia");
    expect(sent.status, "enviada").toBe("SENT");
    const small = await proposal(S.req, { items: [{ description: "Pequeno", qty: 1, unitCents: 10000, discountPct: 10 }] }, "vendedor com 10%");
    expect([small.status, small.approval?.required], "dentro do limite não precisa").toEqual(["DRAFT", false]);
  });

  test("API: enviar, página pública sem login, aceite com o opcional e proposta travada", async ({ browser, playwright, request }) => {
    const o = await owner(browser);
    const cEmail = mail("cliente");
    const p = await proposal(o.req, { client: client(cEmail), items: [{ description: "Site", qty: 1, unitCents: 100000 }, { description: "Blog", qty: 1, unitCents: 20000, optional: true }] });
    const optId = p.items.find((i: any) => i.description === "Blog")?.id;
    expect(optId, "itens com id").toBeTruthy();
    const { token } = await sendP(o.req, p.id);
    const em = await waitForEmail(request, cEmail, { contains: "/proposta/" });
    expect(linkFrom(em, "/proposta/"), "e-mail ao cliente com o link").toContain(token);

    const anon = await playwright.request.newContext({ baseURL: cfg.apiURL });
    await expectCode(await call(anon, "GET", pub(anon, token + "x")), 404, "LINK_INVALID", "token errado");
    const view = await ok<any>(await call(anon, "GET", pub(anon, token, "?session=s-" + uniq())), "página pública sem login");
    expect([view.totals?.oneTime?.totalCents, view.items?.length], "itens e total sem o opcional").toEqual([100000, 2]);
    expect(["SENT", "VIEWED"], "situação aberta para decisão").toContain(view.status);
    expect(view.company?.name, "nome da empresa").toBe(o.user.organizationName);
    expect(JSON.stringify(view), "sem ids internos do vendedor").not.toContain(o.userId);
    expect((await getProposal(o.req, p.id)).status, "visualização registrada").toBe("VIEWED");

    await expectCode(await call(o.req, "PATCH", `/v1/com/proposals/${p.id}`, { title: "Mudou" }), 409, "PROPOSAL_LOCKED", "editar depois de enviada");
    await expectCode(await call(o.req, "POST", `/v1/com/proposals/${p.id}/send`, {}), 409, "PROPOSAL_LOCKED", "enviar de novo");
    const e1 = await expectCode(await call(anon, "POST", pub(anon, token, "/accept"), { name: "Maria", document: "111.444.777-36", agree: false }), 400, "VALIDATION_ERROR", "aceite inválido");
    expect(pathsOf(e1).sort(), "nome completo, documento e concordância").toEqual(["agree", "document", "name"]);
    const acc = await ok<any>(await call(anon, "POST", pub(anon, token, "/accept"), { name: "Maria da Silva", document: CPF, agree: true, selectedOptionalIds: [optId] }), "aceitar com o opcional");
    expect([acc.status, acc.totals?.oneTime?.totalCents], "aceita com o opcional somado").toEqual(["ACCEPTED", 120000]);
    await expectCode(await call(anon, "POST", pub(anon, token, "/accept"), { name: "Maria da Silva", document: CPF, agree: true }), 409, "ALREADY_DECIDED", "aceitar de novo");
    await expectCode(await call(anon, "POST", pub(anon, token, "/reject"), { reason: "Mudei de ideia" }), 409, "ALREADY_DECIDED", "recusar depois de aceita");
    await anon.dispose();

    const d = await getProposal(o.req, p.id);
    expect(d.status, "situação ACCEPTED").toBe("ACCEPTED");
    expect([d.acceptance?.name, d.acceptance?.document], "aceite com nome e documento (só dígitos)").toEqual(["Maria da Silva", CPF.replace(/\D/g, "")]);
    expect(d.acceptance?.ip, "IP gravado").toBeTruthy();
    expect(String(d.acceptance?.documentSha256), "SHA-256 do documento aceito").toMatch(/^[0-9a-f]{64}$/);
    expect(d.acceptance?.selectedOptionalIds, "opcionais aceitos").toEqual([optId]);
    expect(d.acceptance?.totals?.oneTime?.totalCents, "total aceito").toBe(120000);
    await expectCode(await call(o.req, "POST", `/v1/com/proposals/${p.id}/new-version`), 409, "ALREADY_DECIDED", "nova versão de proposta aceita");
  });

  test("API: vencida não aceita, recusa exige motivo e nova versão invalida o link antigo", async ({ browser, playwright }) => {
    const o = await owner(browser);
    const p = await proposal(o.req);
    const { token } = await sendP(o.req, p.id);
    const anon = await playwright.request.newContext({ baseURL: cfg.apiURL });
    await ok(await call(o.req, "POST", `/v1/com/proposals/${p.id}/expire`), "encerrar");
    expect((await getProposal(o.req, p.id)).status, "vencida").toBe("EXPIRED");
    await expectCode(await call(anon, "POST", pub(anon, token, "/accept"), { name: "Maria da Silva", document: CPF, agree: true }), 409, "PROPOSAL_EXPIRED", "aceitar vencida");
    await ok(await call(o.req, "POST", `/v1/com/proposals/${p.id}/validity`, { validUntil: addDays(today(), 5) }), "nova validade");
    expect(["SENT", "VIEWED"], "reaberta").toContain((await getProposal(o.req, p.id)).status);
    expect((await call(anon, "POST", pub(anon, token, "/reject"), { reason: " " })).status(), "recusa sem motivo → 400").toBe(400);

    const v2 = await ok<any>(await call(o.req, "POST", `/v1/com/proposals/${p.id}/new-version`), "nova versão");
    expect([v2.number, v2.version, v2.status, v2.previousId], "mesmo número, versão 2, rascunho").toEqual([p.number, 2, "DRAFT", p.id]);
    const old = await getProposal(o.req, p.id);
    expect([old.status, old.supersededById], "anterior substituída").toEqual(["SUPERSEDED", v2.id]);
    await expectCode(await call(anon, "POST", pub(anon, token, "/accept"), { name: "Maria da Silva", document: CPF, agree: true }), 409, "PROPOSAL_SUPERSEDED", "aceitar pelo link antigo");
    const { token: t2 } = await sendP(o.req, v2.id, "enviar a versão 2");
    expect(t2, "link novo").not.toBe(token);
    expect((await ok<any>(await call(anon, "POST", pub(anon, t2, "/reject"), { reason: "Preço acima do orçamento" }), "recusar a v2")).status, "recusada").toBe("REJECTED");
    const r = await getProposal(o.req, v2.id);
    expect([r.status, r.rejectionReason], "motivo gravado").toEqual(["REJECTED", "Preço acima do orçamento"]);
    await expectCode(await call(anon, "POST", pub(anon, t2, "/accept"), { name: "Maria da Silva", document: CPF, agree: true }), 409, "ALREADY_DECIDED", "aceitar recusada");
    await anon.dispose();

    const c = await proposal(o.req);
    await ok(await call(o.req, "POST", `/v1/com/proposals/${c.id}/cancel`, { reason: "Cliente desistiu" }), "cancelar rascunho");
    expect((await getProposal(o.req, c.id)).status, "cancelada").toBe("CANCELED");
  });

  test("API: modelos — variáveis permitidas, variável desconhecida 400 e prévia com moeda, extenso e documento", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "com_templates");
    const vars = await ok<any>(await call(o.req, "GET", "/v1/com/templates/variables"), "variáveis");
    expect(vars.PROPOSAL, "proposta tem cliente.nome e proposta.avulso").toEqual(expect.arrayContaining(["cliente.nome", "proposta.avulso", "proposta.validade"]));
    expect(vars.CONTRACT, "contrato tem contrato.valor e contratante.documento").toEqual(expect.arrayContaining(["contrato.valor", "contrato.fim", "contratante.documento"]));
    expect(vars.PROPOSAL, "proposta não tem contrato.valor").not.toContain("contrato.valor");
    expect(vars.filters, "filtros").toEqual(expect.arrayContaining(["moeda", "data", "extenso", "documento", "maiusculas"]));
    const sys = items<any>(await ok(await call(o.req, "GET", "/v1/com/templates"), "modelos"));
    expect(["PROPOSAL", "CONTRACT"].every((k) => sys.some((t) => t.kind === k && t.system)), "modelos prontos de proposta e contrato").toBe(true);

    const u = await expectCode(await call(o.req, "POST", "/v1/com/templates", { kind: "CONTRACT", name: "Errado", bodyHtml: "<p>{{cliente.cpf}}</p>" }), 400, "UNKNOWN_VARIABLE", "variável desconhecida");
    expect(pathsOf(u), "erro aponta a variável").toContain("cliente.cpf");
    await expectCode(await call(o.req, "POST", "/v1/com/templates", { kind: "PROPOSAL", name: "Errado", bodyHtml: "<p>{{contrato.valor}}</p>" }), 400, "UNKNOWN_VARIABLE", "variável de contrato num modelo de proposta");
    await expectCode(await call(o.req, "POST", "/v1/com/templates", { kind: "CONTRACT", name: "Errado", bodyHtml: "<p>{{contrato.valor|dinheiro}}</p>" }), 400, "UNKNOWN_FILTER", "filtro desconhecido");
    const tpl = await ok<any>(await call(o.req, "POST", "/v1/com/templates", { kind: "CONTRACT", name: "Contrato curto", bodyHtml: '<p>{{cliente.nome}} pagará {{contrato.valor|moeda}} ({{contrato.valor|extenso}}) · CPF {{cliente.documento|documento}} · índice {{contrato.indice}}</p><script>alert(1)</script>' }), "modelo válido");
    const pv = await ok<any>(await call(o.req, "POST", `/v1/com/templates/${tpl.id}/preview`, { data: { cliente: { nome: "<b>Ana</b>", documento: "11144477735" }, contrato: { valor: 104500 } } }), "prévia");
    const html = String(pv.html);
    expect(html, "moeda").toMatch(/R\$\s1\.045,00/);
    expect(html, "por extenso").toContain("mil e quarenta e cinco reais");
    expect(html, "documento formatado").toContain("111.444.777-35");
    expect(html, "valor escapado").toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(html, "script removido no salvar").not.toContain("<script");
    expect(pv.missing, "variável sem valor listada").toContain("contrato.indice");
  });

  test("API: contratos — vigência, vencendo, editar travado, renovar e reajustar", async ({ browser }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "com_contracts");
    const start = addDays(today(), 20);
    const c = await contract(o.req, { startDate: start, months: 12 });
    expect([c.status, c.endDate, c.noticeDate], "vigência e aviso calculados").toEqual(["DRAFT", term(start, 12).endDate, term(start, 12).noticeDate]);
    expect(String(c.code), "código C-0001").toMatch(/^C-0001\b/);
    await ok(await call(o.req, "PATCH", `/v1/com/contracts/${c.id}`, { title: "Contrato ajustado" }), "editar rascunho");

    const oldStart = addDays(addMonths(today(), -12), 10);
    const ex = await contract(o.req, { startDate: oldStart, months: 12, existing: { signedAt: oldStart } }, "contrato existente");
    expect(ex.endDate, "fim daqui a ~10 dias").toBe(term(oldStart, 12).endDate);
    expect(ex.status, "dentro do aviso prévio, sem renovação automática").toBe("EXPIRING");
    const expiring = items<any>(await ok(await call(o.req, "GET", "/v1/com/contracts?status=EXPIRING"), "vencendo"));
    expect(expiring.some((x) => x.id === ex.id) && !expiring.some((x) => x.id === c.id), "lista Vencendo").toBe(true);
    await expectCode(await call(o.req, "PATCH", `/v1/com/contracts/${ex.id}`, { title: "Mudar assinado" }), 409, "CONTRACT_LOCKED", "editar contrato assinado");

    const rn = await ok<any>(await call(o.req, "POST", `/v1/com/contracts/${ex.id}/renew`), "renovar");
    const next = term(addDays(ex.endDate, 1), 12);
    expect([rn.endDate, rn.status], "renovado por mais 12 meses, vigente").toEqual([next.endDate, "ACTIVE"]);
    const rj = await ok<any>(await call(o.req, "POST", `/v1/com/contracts/${ex.id}/readjust`, { pct: 4.5 }), "reajustar 4,5%");
    expect(rj.valueCents, "1.000,00 × 4,5% = 1.045,00").toBe(104500);
    await expectCode(await call(o.req, "POST", `/v1/com/contracts/${ex.id}/readjust`, { pct: 500 }), 400, "PCT_INVALID", "reajuste absurdo");
    const det = await ok<any>(await call(o.req, "GET", `/v1/com/contracts/${ex.id}`), "detalhe");
    const kinds = (det.events ?? []).map((e: any) => e.kind);
    expect(kinds, "histórico com renovação e reajuste").toEqual(expect.arrayContaining(["RENEWED", "READJUSTED"]));

    const p = await proposal(o.req);
    await expectCode(await call(o.req, "POST", "/v1/com/contracts", { title: "Da proposta", proposalId: p.id, valueCents: 1, recurrence: "once", startDate: today(), months: 1, parties: [{ role: "CONTRACTOR", name: "Maria Cliente", document: CPF, email: mail("p") }] }), 409, "PROPOSAL_NOT_ACCEPTED", "contrato de proposta não aceita");
  });

  test("API: assinatura — ordem, código por e-mail, conclusão com hash e verificação pública", async ({ browser, playwright, request }) => {
    test.slow();
    const o = await owner(browser);
    await ensureFeature(o.req, "com_signatures");
    await ensureFeature(o.req, "com_contracts");
    const c = await contract(o.req);
    const A = { name: "Ana Parte", email: mail("ana"), role: "SIGNER", order: 1 };
    const B = { name: "Bruno Parte", email: mail("bruno"), role: "SIGNER", order: 1 };
    const W = { name: "Carla Testemunha", email: mail("carla"), role: "WITNESS", order: 2 };
    const { e, tokenOf } = await envelope(o.req, c.id, [A, B, W]);
    expect((await ok<any>(await call(o.req, "GET", `/v1/com/contracts/${c.id}`), "contrato")).status, "contrato aguardando assinatura").toBe("AWAITING_SIGNATURE");
    await expectCode(await call(o.req, "PATCH", `/v1/com/contracts/${c.id}`, { title: "x" }), 409, "CONTRACT_LOCKED", "editar com envelope em andamento");
    const invite = await waitForEmail(request, A.email, { contains: "/assinar/" });
    expect(linkFrom(invite, "/assinar/"), "convite com o link do signatário").toContain(tokenOf(A.email));

    const anon = await playwright.request.newContext({ baseURL: cfg.apiURL });
    await expectCode(await call(anon, "GET", sign(anon, "x" + tokenOf(A.email))), 404, "LINK_INVALID", "token errado");
    const wv = await ok<any>(await call(anon, "GET", sign(anon, tokenOf(W.email))), "página da testemunha");
    expect(wv.canSignNow, "testemunha ainda não pode").toBe(false);
    expect(wv.waitingFor, "esperando as partes").toEqual(expect.arrayContaining([A.name, B.name]));
    await expectCode(await call(anon, "POST", sign(anon, tokenOf(W.email), "/sign"), { code: "123456", name: W.name, document: CPF2, agree: true }), 409, "NOT_YOUR_TURN", "testemunha antes das partes");
    await expectCode(await call(anon, "POST", sign(anon, tokenOf(A.email), "/sign"), { code: "123456", name: A.name, document: CPF, agree: true }), 400, "CODE_NOT_SENT", "assinar sem pedir o código");

    const signWithCode = async (s: typeof A, doc: string) => {
      const sent = await ok<any>(await call(anon, "POST", sign(anon, tokenOf(s.email), "/code")), `código para ${s.name}`);
      expect(String(sent.sentTo), "e-mail mascarado").toContain("***");
      expect(String(sent.sentTo), "não mostra o e-mail inteiro").not.toBe(s.email);
      const code = await otpFrom(request, s.email);
      return { code, res: () => call(anon, "POST", sign(anon, tokenOf(s.email), "/sign"), { code, name: s.name, document: doc, agree: true }) };
    };
    const a = await signWithCode(A, CPF);
    const wrong = a.code === "000000" ? "111111" : "000000";
    await expectCode(await call(anon, "POST", sign(anon, tokenOf(A.email), "/sign"), { code: wrong, name: A.name, document: CPF, agree: true }), 400, "INVALID_CODE", "código errado");
    const noAgree = await expectCode(await call(anon, "POST", sign(anon, tokenOf(A.email), "/sign"), { code: a.code, name: "Ana", document: CPF, agree: false }), 400, "VALIDATION_ERROR", "nome incompleto e sem concordância");
    expect(pathsOf(noAgree), "erros no nome e na concordância").toEqual(expect.arrayContaining(["name", "agree"]));
    const sa = await ok<any>(await a.res(), "Ana assina com o código do e-mail");
    expect([sa.status, sa.envelopeStatus], "assinou; envelope continua").toEqual(["SIGNED", "IN_PROGRESS"]);
    await expectCode(await a.res(), 409, "ALREADY_SIGNED", "assinar de novo");
    const b = await signWithCode(B, CNPJ);
    expect((await ok<any>(await b.res(), "Bruno assina")).envelopeStatus, "ainda falta a testemunha").toBe("IN_PROGRESS");
    expect((await ok<any>(await call(anon, "GET", sign(anon, tokenOf(W.email))), "testemunha de novo")).canSignNow, "agora é a vez dela").toBe(true);
    const w = await signWithCode(W, CPF2);
    expect((await ok<any>(await w.res(), "testemunha assina")).envelopeStatus, "concluído").toBe("COMPLETED");

    const env = await ok<any>(await call(o.req, "GET", `/v1/com/envelopes/${e.id}`), "envelope");
    expect(env.status, "COMPLETED").toBe("COMPLETED");
    expect(String(env.finalSha256), "SHA-256 do PDF final").toMatch(/^[0-9a-f]{64}$/);
    expect(env.finalSha256, "PDF final ≠ documento enviado (tem a folha de assinaturas)").not.toBe(env.documentSha256);
    expect(String(env.verificationCode), "código XXXX-XXXX-XXXX").toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(env.signers.every((s: any) => s.status === "SIGNED" && s.signedAt), "todos assinados com horário").toBe(true);
    expect(["ACTIVE", "SCHEDULED"], "contrato assinado e vigente").toContain((await ok<any>(await call(o.req, "GET", `/v1/com/contracts/${c.id}`), "contrato")).status);

    const byCode = await ok<any>(await call(anon, "GET", `/v1/public/com/verify/${String(env.verificationCode).toLowerCase().replace(/-/g, "")}`), "verificar pelo código (minúsculo, sem hífen)");
    expect([byCode.valid, byCode.sha256, byCode.signers?.length], "válido, mesmo hash, 3 signatários").toEqual([true, env.finalSha256, 3]);
    expect(byCode.signers.map((s: any) => s.name).sort(), "nomes de quem assinou").toEqual([A.name, B.name, W.name].sort());
    expect(JSON.stringify(byCode), "verificação não expõe e-mail").not.toContain(A.email);
    const byHash = await ok<any>(await call(anon, "POST", "/v1/public/com/verify", { sha256: env.finalSha256 }), "verificar pelo hash");
    expect(byHash.valid, "válido pelo hash").toBe(true);
    expect((await call(anon, "GET", "/v1/public/com/verify/AAAA-BBBB-CCCC")).status(), "código inexistente → 404").toBe(404);
    await anon.dispose();
  });

  test("API: recusa encerra o envelope e cancelado não assina", async ({ browser, playwright, request }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "com_signatures");
    await ensureFeature(o.req, "com_contracts");
    const c = await contract(o.req);
    const A = { name: "Ana Parte", email: mail("ana"), role: "SIGNER", order: 1 };
    await expectCode(await call(o.req, "POST", `/v1/com/contracts/${c.id}/send-for-signature`, { signers: [A, { ...A, name: "Outra Ana" }] }), 400, "DUPLICATE_SIGNER", "mesmo e-mail duas vezes");
    await expectCode(await call(o.req, "POST", `/v1/com/contracts/${c.id}/send-for-signature`, { signers: [{ ...A, role: "WITNESS" }] }), 400, "NO_SIGNERS", "só testemunha");
    const { e, tokenOf } = await envelope(o.req, c.id, [A]);
    const anon = await playwright.request.newContext({ baseURL: cfg.apiURL });
    expect((await call(anon, "POST", sign(anon, tokenOf(A.email), "/refuse"), { reason: "" })).status(), "recusa sem motivo → 400").toBe(400);
    await ok(await call(anon, "POST", sign(anon, tokenOf(A.email), "/refuse"), { reason: "Cláusula 5 errada" }), "recusar");
    expect((await ok<any>(await call(o.req, "GET", `/v1/com/envelopes/${e.id}`), "envelope")).status, "recusado").toBe("REFUSED");
    expect((await ok<any>(await call(o.req, "GET", `/v1/com/contracts/${c.id}`), "contrato")).status, "contrato volta a rascunho").toBe("DRAFT");
    await expectCode(await call(anon, "POST", sign(anon, tokenOf(A.email), "/code")), 409, "ENVELOPE_REFUSED", "pedir código de envelope recusado");

    const B = { name: "Bruno Parte", email: mail("bruno"), role: "SIGNER", order: 1 };
    const second = await envelope(o.req, c.id, [B]);
    await ok(await call(anon, "POST", sign(anon, second.tokenOf(B.email), "/code")), "código antes do cancelamento");
    const code = await otpFrom(request, B.email);
    await ok(await call(o.req, "POST", `/v1/com/envelopes/${second.e.id}/cancel`, { reason: "Valor errado" }), "cancelar envelope");
    const pv = await ok<any>(await call(anon, "GET", sign(anon, second.tokenOf(B.email))), "página do envelope cancelado");
    expect([pv.envelope?.status, pv.canSignNow], "cancelado, sem assinatura").toEqual(["CANCELED", false]);
    await expectCode(await call(anon, "POST", sign(anon, second.tokenOf(B.email), "/sign"), { code, name: B.name, document: CPF, agree: true }), 409, "ENVELOPE_CANCELED", "assinar cancelado (mesmo com o código certo)");
    expect((await ok<any>(await call(o.req, "GET", `/v1/com/contracts/${c.id}`), "contrato")).status, "contrato volta a rascunho").toBe("DRAFT");
    await anon.dispose();
  });

  test("API: papéis — sem papel 403, vendedor só vê o que é dele, leitor não escreve", async ({ browser, request }) => {
    test.slow();
    const o = await owner(browser);
    const S1 = await addMember(browser, request, o.req, "vend1", "SELLER");
    const S2 = await addMember(browser, request, o.req, "vend2", "SELLER");
    const V = await addMember(browser, request, o.req, "leitor", "VIEWER");
    const N = await addMember(browser, request, o.req, "semacesso", null);

    const denied = await call(N.req, "GET", "/v1/com/proposals");
    expect(denied.status(), "membro sem papel → 403").toBe(403);
    expect(["NOT_COM_MEMBER", "APP_ACCESS_DENIED"], "código: NOT_COM_MEMBER (com a workstation, o guard de app responde APP_ACCESS_DENIED)").toContain((await denied.json()).code);
    expect((await ok<any>(await call(S1.req, "GET", "/v1/com/me"), "me do vendedor")).role, "papel SELLER").toBe("SELLER");

    const p1 = await proposal(S1.req, {}, "vendedor 1 cria");
    expect(p1.owner?.id, "dono = quem criou").toBe(S1.userId);
    expect((await call(S2.req, "GET", `/v1/com/proposals/${p1.id}`)).status(), "vendedor 2 não vê a do vendedor 1").toBe(404);
    expect((await call(S2.req, "PATCH", `/v1/com/proposals/${p1.id}`, { title: "invadir" })).status(), "nem edita").toBe(404);
    expect(items<any>(await ok(await call(S2.req, "GET", "/v1/com/proposals"), "lista do vendedor 2")).some((x) => x.id === p1.id), "nem aparece na lista dele").toBe(false);
    expect(items<any>(await ok(await call(S1.req, "GET", "/v1/com/proposals"), "lista do vendedor 1")).some((x) => x.id === p1.id), "aparece para o dono").toBe(true);
    expect((await call(o.req, "GET", `/v1/com/proposals/${p1.id}`)).status(), "admin vê todas").toBe(200);
    expect((await call(V.req, "GET", `/v1/com/proposals/${p1.id}`)).status(), "leitor vê").toBe(200);
    expect((await call(V.req, "POST", "/v1/com/proposals", { title: "x", client: client(), items: [{ description: "A", qty: 1, unitCents: 1 }] })).status(), "leitor não cria").toBe(403);
    expect((await call(S1.req, "POST", `/v1/com/proposals/${p1.id}/approval`, { decision: "approve" })).status(), "vendedor não aprova").toBe(403);
    expect((await call(S1.req, "PUT", `/v1/com/roles/${S2.userId}`, { role: "COM_ADMIN" })).status(), "vendedor não dá papel").toBe(403);
    expect((await call(S1.req, "PATCH", "/v1/com/settings", { maxDiscountPct: 50 })).status(), "vendedor não muda o limite").toBe(403);
    await expectCode(await call(o.req, "PUT", `/v1/com/roles/${o.userId}`, { role: "VIEWER" }), 409, "OWNER_IS_COM_ADMIN", "owner continua admin");

    const other = await newContext(browser);
    await register(other.request, newUser("outra"));
    expect((await call(other.request, "GET", `/v1/com/proposals/${p1.id}`)).status(), "proposta de outra empresa → 404").toBe(404);
  });

  test("Tela: criar proposta com total ao vivo, enviar e aceitar na página pública", async ({ browser }) => {
    const o = await owner(browser);
    const page = await o.ctx.newPage();
    await page.goto("/comercial");
    await expect(page.getByTestId("com-home"), "Início do Comercial").toBeVisible();
    await page.goto("/comercial/propostas/nova");
    const form = page.getByTestId("com-proposal-form");
    await expect(form).toBeVisible();
    const title = `Proposta tela ${uniq()}`;
    await form.getByTestId("com-proposal-title").fill(title);
    await form.getByTestId("com-client-name").fill("Cliente da Tela");
    await form.getByTestId("com-client-email").fill(mail("tela"));
    const row = form.getByTestId("com-item-row").first();
    await row.getByTestId("com-item-description").fill("Desenvolvimento");
    await row.getByTestId("com-item-qty").fill("2");
    await row.getByTestId("com-item-price").fill("1.500,00");
    await expect(form.getByTestId("com-proposal-total"), "total ao vivo: 2 × 1.500 = 3.000").toHaveAttribute("data-cents", "300000");
    await form.getByTestId("com-proposal-save").click();

    const detail = page.getByTestId("com-proposal-detail");
    await expect(detail, "detalhe depois de salvar").toBeVisible();
    await expect(detail.getByTestId("com-proposal-status")).toHaveAttribute("data-status", "DRAFT");
    await detail.getByTestId("com-proposal-send").click();
    await page.getByTestId("com-send-confirm").click();
    await expect(page.getByTestId("com-proposal-status"), "enviada").toHaveAttribute("data-status", "SENT");
    const url = await page.getByTestId("com-public-link").getAttribute("data-url");
    expect(String(url), "link público").toMatch(/\/proposta\/[A-Za-z0-9_-]{20,}$/);
    const id = await page.getByTestId("com-proposal-detail").getAttribute("data-id");

    const anon = await newContext(browser);
    const pp = await anon.newPage();
    await pp.goto(new URL(String(url), cfg.webURL).pathname);
    await expect(pp.getByTestId("prop-page"), "página pública sem login").toBeVisible();
    await expect(pp.getByTestId("prop-total"), "total na página").toHaveAttribute("data-cents", "300000");
    await pp.getByTestId("prop-accept").click();
    await pp.getByTestId("prop-accept-name").fill("Cliente da Tela");
    await pp.getByTestId("prop-accept-document").fill("123");
    await pp.getByTestId("prop-accept-agree").check();
    await pp.getByTestId("prop-accept-confirm").click();
    await expect(pp.locator('[data-testid="prop-field-error"][data-path="document"]'), "documento inválido no campo").toBeVisible();
    await pp.getByTestId("prop-accept-document").fill(CPF);
    await pp.getByTestId("prop-accept-confirm").click();
    await expect(pp.getByTestId("prop-accepted"), "aceite confirmado").toBeVisible();
    expect((await getProposal(o.req, String(id))).status, "aceita na API").toBe("ACCEPTED");
  });

  test("Tela: assinar pela página com o código do e-mail e verificar pelo código", async ({ browser, request }) => {
    const o = await owner(browser);
    await ensureFeature(o.req, "com_signatures");
    await ensureFeature(o.req, "com_contracts");
    const c = await contract(o.req);
    const A = { name: "Ana Tela Parte", email: mail("anatela"), role: "SIGNER", order: 1 };
    const { e, tokenOf } = await envelope(o.req, c.id, [A]);

    const anon = await newContext(browser);
    const page = await anon.newPage();
    await page.goto(`/assinar/${tokenOf(A.email)}`);
    await expect(page.getByTestId("sign-page"), "página de assinatura sem login").toBeVisible();
    await expect(page.getByTestId("sign-document"), "documento visível").toBeVisible();
    await page.getByTestId("sign-start").click();
    await page.getByTestId("sign-send-code").click();
    const code = await otpFrom(request, A.email);
    await page.getByTestId("sign-code").fill(code === "000000" ? "111111" : "000000");
    await page.getByTestId("sign-name").fill(A.name);
    await page.getByTestId("sign-document-number").fill(CPF);
    await page.getByTestId("sign-agree").check();
    await page.getByTestId("sign-confirm").click();
    await expect(page.locator('[data-testid="sign-error"][data-code="INVALID_CODE"]'), "código errado avisa").toBeVisible();
    await page.getByTestId("sign-code").fill(code);
    await page.getByTestId("sign-confirm").click();
    await expect(page.getByTestId("sign-done"), "assinatura registrada").toBeVisible();

    const env = await ok<any>(await call(o.req, "GET", `/v1/com/envelopes/${e.id}`), "envelope");
    expect(env.status, "concluído").toBe("COMPLETED");
    await page.goto(`/verificar/${env.verificationCode}`);
    await expect(page.getByTestId("verify-result"), "documento válido").toHaveAttribute("data-valid", "true");
    await expect(page.getByTestId("verify-signer"), "1 signatário").toHaveCount(1);
  });
});
