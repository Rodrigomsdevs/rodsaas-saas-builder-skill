import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { ownerWithMember, signUp } from "../support/ui";

// Forms · operação avançada e perfis (skills/forms/references/09 e 10). Roda com o preset forms. Confere o que mais se
// simplifica: parcial que se retoma e mostra onde as pessoas param, cálculo e quiz feitos no servidor (o valor do
// navegador não vale), resposta com pagamento que só vira paga pelo webhook, assinatura validada, agendamento com o
// contato da resposta, chamado aberto pela resposta, NPS por mês com retorno ao detrator, vagas com lista de espera,
// ingresso e check-in único, e respostas sensíveis mascaradas para quem não pode ver.

async function installed(req: APIRequestContext) {
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
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); };
const PNG = "data:image/png;base64," + "iVBORw0KGgo".padEnd(400, "A");

async function form(req: APIRequestContext, fields: unknown[], extra: Record<string, unknown> = {}, settings: Record<string, unknown> | null = null) {
  const f = await ok<any>(await call(req, "POST", "/v1/forms", { title: `Form ${uniq()}` }), "criar formulário");
  await ok(await call(req, "PUT", `/v1/forms/${f.id}/draft`, { version: f.draftVersion, schema: { version: 1, fields, hidden: [], ...extra } }), "salvar rascunho");
  if (settings) await ok(await call(req, "PATCH", `/v1/forms/${f.id}`, { settings }), "configurações");
  const pub = await ok<any>(await call(req, "POST", `/v1/forms/${f.id}/publish`), "publicar");
  return { id: f.id as string, slug: pub.slug as string };
}
const answer = (req: APIRequestContext, slug: string, answers: Record<string, unknown>, extra: Record<string, unknown> = {}) => req.fetch(`${cfg.apiURL}/v1/public/forms/${slug}/responses`, { method: "POST", headers: { Origin: cfg.webURL, "Content-Type": "application/json", "Idempotency-Key": `k-${uniq()}` }, data: JSON.stringify({ answers, ...extra }), failOnStatusCode: false });
const responses = async (req: APIRequestContext, id: string, q = "") => items<any>(await ok(await call(req, "GET", `/v1/forms/${id}/responses${q}`), "respostas"));
const nameF = { id: "nome", type: "short_text", label: "Seu nome" }, mailF = { id: "email", type: "email", label: "Seu e-mail" };

test.describe("Forms · operação", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset forms");
  });

  test("API: resposta parcial — salva, retoma pelo token, progresso, envio fecha e desistências por pergunta", async ({ request }) => {
    await register(request, newUser("formparc"));
    await ensureFeature(request, "forms_logic");
    const f = await form(request, [nameF, mailF, { id: "lgpd", type: "consent", label: "Concordo com o uso dos meus dados" }, { id: "msg", type: "long_text", label: "Mensagem" }, { id: "tem", type: "yes_no", label: "Tem empresa?" }, { id: "cnpj", type: "cnpj", label: "CNPJ", visibleIf: { match: "all", rules: [{ field: "tem", op: "eq", value: "true" }] } }], {}, { savePartials: true });
    const put = (b: Record<string, unknown>) => call(request, "PUT", `/v1/public/forms/${f.slug}/partials`, b);
    const p1 = await ok<any>(await put({ answers: { nome: "Ana", email: "ana@example.com" } }), "parcial");
    expect(p1.progress, "e-mail fica de fora antes do consentimento; CNPJ escondido não conta").toMatchObject({ answered: 1, total: 5, lastFieldId: "nome" });
    const back = await ok<any>(await call(request, "GET", `/v1/public/forms/${f.slug}/partials/${p1.token}`), "retomar");
    expect(back.answers).toEqual({ nome: "Ana" });
    const p2 = await ok<any>(await put({ token: p1.token, answers: { email: "ana@example.com", lgpd: true } }), "continuar");
    expect(p2.token).toBe(p1.token);
    expect(p2.progress).toMatchObject({ answered: 3, total: 5, pct: 60, lastFieldId: "lgpd" });
    expect((await ok<any>(await put({ token: p1.token, answers: { tem: true } }), "abre o CNPJ")).progress, "pergunta que aparece entra no total").toMatchObject({ answered: 4, total: 6 });
    await expectCode(await call(request, "GET", `/v1/public/forms/${f.slug}/partials/naoexiste123`), 404, "PARTIAL_NOT_FOUND", "token desconhecido");
    await ok(await put({ answers: { nome: "Beto" } }), "outro que para no nome");
    await ok(await put({ answers: {} }), "abriu e não respondeu");
    expect((await answer(request, f.slug, { nome: "Ana", email: "ana@example.com", lgpd: true, msg: "Olá", tem: false }, { partialToken: p1.token })).status()).toBe(201);
    await expectCode(await call(request, "GET", `/v1/public/forms/${f.slug}/partials/${p1.token}`), 404, "PARTIAL_NOT_FOUND", "enviado não volta");
    const d = await ok<any>(await call(request, "GET", `/v1/forms/${f.id}/drop-off`), "desistências");
    expect([d.partials, d.completed]).toEqual([3, 1]);
    expect(d.fields.find((x: any) => x.fieldId === "nome").stopped, "Beto parou no nome").toBe(1);
    expect(d.fields.find((x: any) => x.fieldId === null).stopped, "um nem começou").toBe(1);
    expect(d.fields.find((x: any) => x.fieldId === "tem").stopped, "quem terminou não conta como desistência").toBe(0);
  });

  test("API: cálculo e quiz — fórmula inválida recusada, valores feitos no servidor e resultado pela faixa", async ({ request }) => {
    await register(request, newUser("formcalc"));
    await ensureFeature(request, "forms_advanced");
    const draft = await ok<any>(await call(request, "POST", "/v1/forms", { title: "Orçamento" }), "criar");
    const bad = await expectCode(await call(request, "PUT", `/v1/forms/${draft.id}/draft`, { version: draft.draftVersion, schema: { version: 1, hidden: [], fields: [{ id: "qtd", type: "number", label: "Pessoas" }], calculations: [{ id: "total", label: "Total", formula: "{qtd} * {preco}" }] } }), 400, "INVALID_FORM_SCHEMA", "referência que não existe");
    expect(pathsOf(bad)).toContain("calculations.0.formula");
    const fields = [
      { id: "qtd", type: "number", label: "Quantas pessoas?" },
      { id: "plano", type: "single_choice", label: "Plano", options: [{ id: "basico", label: "Básico", points: 100 }, { id: "pro", label: "Pro", points: 250 }] },
      { id: "frete", type: "yes_no", label: "Entrega?" },
      { id: "q1", type: "single_choice", label: "Quanto é 2 + 2?", options: [{ id: "a", label: "4" }, { id: "b", label: "5" }], correct: "a" },
      { id: "q2", type: "multiple_choice", label: "Quais são pares?", options: [{ id: "a", label: "2" }, { id: "b", label: "3" }, { id: "c", label: "4" }], correct: ["a", "c"], points: 2 },
    ];
    const f = await form(request, fields, { calculations: [{ id: "sub", label: "Subtotal", formula: "{qtd} * {plano}" }, { id: "total", label: "Total", formula: "{sub} * 100 + {frete} * 1500", format: "money" }], quiz: { passPct: 60, outcomes: [{ min: 0, max: 59.9, title: "Estude mais" }, { min: 60, max: 100, title: "Mandou bem" }] } });
    const r = await answer(request, f.slug, { qtd: 3, plano: "pro", frete: true, q1: "a", q2: { selected: ["a"] } }, { calculations: { total: 1 } });
    expect(r.status(), await r.text()).toBe(201);
    const j = await r.json();
    expect(j.calculations, "3 × 250 × 100 + 1500 (o total mandado pelo navegador é ignorado)").toEqual({ sub: 750, total: 76500 });
    expect(j.quiz, "q1 certa (1) e q2 errada (só uma das duas): 1 de 3").toMatchObject({ score: 1, max: 3, pct: 33.3, passed: false, outcome: { title: "Estude mais" } });
    const r2 = await (await answer(request, f.slug, { qtd: 1, plano: "basico", q1: "a", q2: { selected: ["c", "a"] } })).json();
    expect([r2.calculations.total, r2.quiz.pct, r2.quiz.passed, r2.quiz.outcome.title]).toEqual([10000, 100, true, "Mandou bem"]);
    expect((await responses(request, f.id))[1].calculations, "gravado na resposta").toEqual({ sub: 750, total: 76500 });
  });

  test("API: pagamento na resposta — valor do cálculo, aguardando pagamento e paga pelo modo de teste", async ({ request }) => {
    await register(request, newUser("formpay"));
    await ensureFeature(request, "forms_advanced");
    test.skip(!(await me(request)).plan?.features?.includes("fin_charges") || (await call(request, "GET", "/v1/fin/me")).status() === 404, "sem cobranças do Financeiro");
    await expectCode(await call(request, "PUT", `/v1/forms/${(await ok<any>(await call(request, "POST", "/v1/forms", { title: "x" }), "x")).id}/draft`, { version: 1, schema: { version: 1, hidden: [], fields: [{ id: "pg", type: "payment", label: "Pagar", settings: { amountCents: 10 } }] } }), 400, "INVALID_FORM_SCHEMA", "pagamento abaixo de R$ 0,50");
    const f = await form(request, [nameF, mailF, { id: "lote", type: "single_choice", label: "Ingresso", options: [{ id: "meia", label: "Meia", points: 2500 }, { id: "inteira", label: "Inteira", points: 5000 }] }, { id: "pg", type: "payment", label: "Pagamento", settings: { amountFrom: "valor", methods: ["pix", "card"] } }], { calculations: [{ id: "valor", label: "Valor", formula: "{lote}", format: "money" }] });
    const r = await answer(request, f.slug, { nome: "Ana Souza", email: "ana@example.com", lote: "inteira" });
    expect(r.status(), await r.text()).toBe(201);
    const j = await r.json();
    expect(j).toMatchObject({ status: "AWAITING_PAYMENT", payment: { amountCents: 5000 } });
    expect(j.payment.payUrl).toMatch(/\/pagar\/[^/]+$/);
    expect((await responses(request, f.id, "?status=AWAITING_PAYMENT")).length).toBe(1);
    expect((await responses(request, f.id, "?status=PAID")).length, "filtro por situação").toBe(0);
    await ok(await call(request, "POST", `/v1/public/fin/charges/${String(j.payment.payUrl).split("/").pop()}/fake-pay`, { method: "pix" }), "pagar (modo de teste)");
    const paid = (await responses(request, f.id)).find((x) => x.id === j.id);
    expect(paid.status, "pago pelo webhook").toBe("PAID");
    expect(paid.payment.paidAt).toBeTruthy();
  });

  test("API: assinatura desenhada — sem traço e sem nome recusados, guardada com hash e 'assinado por' na exportação", async ({ request }) => {
    await register(request, newUser("formsig"));
    await ensureFeature(request, "forms_advanced");
    const f = await form(request, [nameF, { id: "termo", type: "signature", label: "Assinatura do termo", required: true, settings: { requireName: true } }]);
    expect(pathsOf(await expectCode(await answer(request, f.slug, { nome: "Ana", termo: { dataUrl: PNG, strokes: 0, name: "Ana Souza" } }), 400, "VALIDATION_ERROR", "sem traço"))).toEqual(["answers.termo"]);
    await expectCode(await answer(request, f.slug, { nome: "Ana", termo: { dataUrl: PNG, strokes: 3, name: "Ana" } }), 400, "VALIDATION_ERROR", "sem sobrenome");
    await expectCode(await answer(request, f.slug, { nome: "Ana", termo: { dataUrl: "data:image/jpeg;base64,AAAA", strokes: 3, name: "Ana Souza" } }), 400, "VALIDATION_ERROR", "não é PNG");
    expect((await answer(request, f.slug, { nome: "Ana", termo: { dataUrl: PNG, strokes: 3, name: "Ana Souza" } })).status()).toBe(201);
    const r = (await responses(request, f.id))[0];
    expect(r.answers.termo).toMatchObject({ name: "Ana Souza" });
    expect(r.answers.termo.sha256, "hash da imagem").toMatch(/^[0-9a-f]{64}$/);
    expect(r.answers.termo.dataUrl ?? null, "a imagem vira arquivo, não fica na resposta").toBeNull();
    const csv = await (await call(request, "GET", `/v1/forms/${f.id}/responses/export?format=csv`)).text();
    expect(csv).toContain("Assinado por Ana Souza");
  });

  test("API: agendar no fim — horário com o contato da resposta, ocupado e já agendado recusados", async ({ request }) => {
    await register(request, newUser("formagenda"));
    test.skip(!(cfg.presets.includes("agenda") || (await call(request, "GET", "/v1/agenda/event-types")).status() !== 404), "projeto sem o preset agenda");
    const type = items<any>(await ok(await call(request, "GET", "/v1/agenda/event-types"), "tipos"))[0];
    const f = await form(request, [nameF, mailF, { id: "fone", type: "phone", label: "WhatsApp" }], {}, { schedule: { agendaTypeId: type.id } });
    const a = await (await answer(request, f.slug, { nome: "Ana Souza", email: "ana.agenda@example.com", fone: "(44) 99988-7766" })).json();
    expect(a.token, "token para agendar").toBeTruthy();
    const start = `${addDays(today(), 7)}T13:00:00.000Z`;
    const book = (id: string, token: string, s = start) => call(request, "POST", `/v1/public/forms/${f.slug}/responses/${id}/book`, { start: s, token });
    await expectCode(await book(a.id, "errado"), 404, "NOT_FOUND", "token de outra resposta");
    const b = await ok<any>(await book(a.id, a.token), "agendar");
    expect(b.appointment.status).toBe("CONFIRMED");
    const ap = await ok<any>(await call(request, "GET", `/v1/agenda/appointments/${b.appointment.id}`), "agendamento");
    expect(JSON.stringify(ap), "agendado com o nome e o e-mail da resposta").toContain("ana.agenda@example.com");
    await expectCode(await book(a.id, a.token, `${addDays(today(), 8)}T13:00:00.000Z`), 409, "ALREADY_BOOKED", "segunda vez");
    const c = await (await answer(request, f.slug, { nome: "Beto Lima", email: "beto@example.com" })).json();
    await expectCode(await book(c.id, c.token), 409, "SLOT_TAKEN", "mesmo horário");
    expect((await responses(request, f.id)).find((x) => x.id === a.id).appointmentId).toBe(b.appointment.id);
  });

  test("API: resposta abre chamado no Suporte com o assunto mapeado e o texto das respostas", async ({ request }) => {
    await register(request, newUser("formhd"));
    test.skip(!(cfg.presets.includes("helpdesk") || (await call(request, "GET", "/v1/helpdesk/me")).status() !== 404), "projeto sem o preset helpdesk");
    const f = await form(request, [nameF, mailF, { id: "assunto", type: "single_choice", label: "Assunto", options: [{ id: "erro", label: "Erro no sistema" }, { id: "duvida", label: "Dúvida" }] }, { id: "detalhe", type: "long_text", label: "Detalhe" }], {}, { integrations: { helpdesk: { enabled: true, subjectField: "assunto" } } });
    expect((await answer(request, f.slug, { nome: "Ana Souza", email: "ana.hd@example.com", assunto: "erro", detalhe: "Tela branca ao salvar" })).status()).toBe(201);
    const r = (await responses(request, f.id))[0];
    expect(r.ticket?.number, "chamado aberto").toBeTruthy();
    const t = await ok<any>(await call(request, "GET", `/v1/helpdesk/tickets/${r.ticket.id}`), "chamado");
    expect(t.subject).toBe("Erro no sistema");
    expect(JSON.stringify(t)).toContain("Detalhe: Tela branca ao salvar");
  });

  test("API: perfil pesquisas — NPS por mês, CSAT e retorno ao detrator", async ({ request }) => {
    await register(request, newUser("formnps"));
    const s = await ok<any>(await call(request, "PATCH", "/v1/forms/settings", { segment: "SURVEY" }), "perfil pesquisas");
    expect([s.segment, s.words?.form, s.on.includes("nps_trend")]).toEqual(["SURVEY", "pesquisa", true]);
    const hd = cfg.presets.includes("helpdesk") || (await call(request, "GET", "/v1/helpdesk/me")).status() !== 404;
    const f = await form(request, [nameF, mailF, { id: "nota", type: "nps", label: "De 0 a 10, quanto nos indicaria?" }, { id: "estrelas", type: "rating", label: "Atendimento", settings: { max: 5 } }], {}, hd ? { detractorFollowUp: "helpdesk" } : null);
    for (const [n, e] of [[10, 5], [9, 4], [8, 3], [6, 1]]) expect((await answer(request, f.slug, { nome: `Cliente ${n}`, email: `c${n}.${uniq()}@example.com`, nota: n, estrelas: e })).status()).toBe(201);
    const nps = await ok<any>(await call(request, "GET", `/v1/forms/${f.id}/nps`), "NPS");
    expect(nps).toMatchObject({ count: 4, promoters: 2, passives: 1, detractors: 1, score: 25 });
    expect(nps.months).toEqual([{ month: today().slice(0, 7), count: 4, promoters: 2, passives: 1, detractors: 1, score: 25 }]);
    expect(await ok<any>(await call(request, "GET", `/v1/forms/${f.id}/csat`), "CSAT"), "4 e 5 de 5: 2 de 4").toEqual({ count: 4, satisfied: 2, pct: 50 });
    if (hd) {
      const rs = await responses(request, f.id);
      expect(rs.find((x) => x.answers.nota === 6).followUp?.kind, "nota 6 já é detrator e abre o retorno").toBe("helpdesk");
      expect(rs.find((x) => x.answers.nota === 8).followUp ?? null, "neutro não").toBeNull();
    }
  });

  test("API: perfil eventos — vaga por lote, lista de espera, cancelamento promove, ingresso e check-in único", async ({ request }) => {
    await register(request, newUser("formevento"));
    await ensureFeature(request, "forms_events");
    const s = await ok<any>(await call(request, "PATCH", "/v1/forms/settings", { segment: "EVENTS" }), "perfil eventos");
    expect(s.words?.response).toBe("inscrito");
    const f = await form(request, [nameF, mailF, { id: "sessao", type: "single_choice", label: "Sessão", options: [{ id: "manha", label: "Manhã", capacity: 1 }, { id: "tarde", label: "Tarde", capacity: 5 }] }]);
    const a = await (await answer(request, f.slug, { nome: "Ana Souza", email: "ana.ev@example.com", sessao: "manha" })).json();
    expect(a.status).toBe("COMPLETE");
    expect(a.ticketCode).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    const b = await (await answer(request, f.slug, { nome: "Beto Lima", email: "beto.ev@example.com", sessao: "manha" })).json();
    expect([b.status, b.ticketCode], "lotou: lista de espera sem ingresso").toEqual(["WAITLIST", null]);
    const pub = await ok<any>(await call(request, "GET", `/v1/public/forms/${f.slug}`), "formulário público");
    expect(pub.seats.byOption.manha).toEqual({ capacity: 1, taken: 1, left: 0 });
    await expectCode(await call(request, "POST", `/v1/forms/${f.id}/checkin`, { code: "ABC" }), 400, "TICKET_INVALID", "código inválido");
    const ck = await ok<any>(await call(request, "POST", `/v1/forms/${f.id}/checkin`, { code: a.ticketCode.toLowerCase() }), "check-in");
    expect(ck).toMatchObject({ responseId: a.id, name: "Ana Souza", option: "Manhã" });
    const again = await expectCode(await call(request, "POST", `/v1/forms/${f.id}/checkin`, { code: a.ticketCode }), 409, "ALREADY_CHECKED_IN", "segunda leitura");
    expect(again.checkedInAt).toBe(ck.checkedInAt);
    await ok(await call(request, "POST", `/v1/forms/${f.id}/responses/${a.id}/cancel`), "Ana cancela");
    const att = await ok<any>(await call(request, "GET", `/v1/forms/${f.id}/attendees`), "inscritos");
    const beto = att.data.find((x: any) => x.responseId === b.id);
    expect(beto.status, "Beto saiu da lista de espera").toBe("COMPLETE");
    expect(beto.ticketCode).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(att.totals).toMatchObject({ confirmed: 1, waitlist: 0 });
    const f2 = await form(request, [nameF, mailF], {}, { capacity: 1, waitlist: false });
    expect((await answer(request, f2.slug, { nome: "A", email: "a@example.com" })).status()).toBe(201);
    await expectCode(await answer(request, f2.slug, { nome: "B", email: "b@example.com" }), 409, "FORM_FULL", "sem lista de espera");
  });

  test("API: perfil saúde — resposta sensível mascarada para quem não pode ver e alertas da ficha", async ({ browser, request }) => {
    const { owner, member, ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request;
    await ok(await call(o, "PATCH", "/v1/forms/settings", { segment: "HEALTH" }), "perfil saúde");
    const row = items<any>(await ok(await call(o, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === member.email);
    const memberId = row.user.id;
    await ok(await call(o, "PATCH", `/v1/members/${row.id}`, { role: "ADMIN" }), "membro admin");
    const f = await form(o, [nameF, { id: "alergia", type: "yes_no", label: "Tem alergia a medicamento?", settings: { alertIf: { op: "eq", value: "true", message: "Alergia a medicamento" } } }, { id: "qual", type: "short_text", label: "Qual medicamento?", sensitive: true }]);
    expect((await answer(o, f.slug, { nome: "Paciente", alergia: true, qual: "Dipirona" })).status()).toBe(201);
    const mine = (await responses(o, f.id))[0];
    expect(mine.answers.qual, "o responsável vê").toBe("Dipirona");
    expect(mine.alerts.map((a: any) => a.message)).toEqual(["Alergia a medicamento"]);
    const masked = (await responses(memberCtx.request, f.id))[0];
    expect(masked.answers.qual, "admin sem o acesso de saúde vê mascarado").toBe("•••");
    expect(masked.answers.nome, "o resto aparece").toBe("Paciente");
    await expectCode(await call(memberCtx.request, "PATCH", "/v1/forms/settings", { healthViewers: [memberId] }), 403, "FORBIDDEN", "só o responsável dá o acesso");
    await ok(await call(o, "PATCH", "/v1/forms/settings", { healthViewers: [memberId] }), "dar acesso de saúde");
    expect((await responses(memberCtx.request, f.id))[0].answers.qual).toBe("Dipirona");
    expect(owner).toBeTruthy();
    await ownerCtx.close(); await memberCtx.close();
  });

  test("Tela: escolher o perfil do Forms nas configurações", async ({ page }) => {
    await signUp(page, "formperfiltela");
    await page.goto("/forms/configuracoes");
    await page.getByTestId("forms-segment").selectOption("EVENTS");
    await expect.poll(async () => (await ok<any>(await call(page.context().request, "GET", "/v1/forms/settings"), "configurações")).segment, { timeout: 10_000 }).toBe("EVENTS");
  });

  test("Tela: check-in do evento lendo o código", async ({ page }) => {
    await signUp(page, "formcheckintela");
    const req = page.context().request;
    await ensureFeature(req, "forms_events");
    const f = await form(req, [nameF, mailF], {}, { capacity: 10 });
    const a = await (await answer(req, f.slug, { nome: "Ana Souza", email: "ana.tela@example.com" })).json();
    await page.goto(`/forms/f/${f.id}/checkin`);
    await page.getByTestId("form-checkin-code").fill(a.ticketCode);
    await page.getByTestId("form-checkin-code").press("Enter");
    await expect(page.getByTestId("form-checkin-result")).toHaveAttribute("data-status", "OK");
    await page.getByTestId("form-checkin-code").fill(a.ticketCode);
    await page.getByTestId("form-checkin-code").press("Enter");
    await expect(page.getByTestId("form-checkin-result")).toHaveAttribute("data-status", "ALREADY_CHECKED_IN");
  });

  test("Tela: NPS por mês", async ({ page }) => {
    await signUp(page, "formnpstela");
    const req = page.context().request;
    const f = await form(req, [{ id: "nota", type: "nps", label: "Nota" }]);
    await answer(req, f.slug, { nota: 10 });
    await page.goto(`/forms/f/${f.id}/nps`);
    await expect(page.locator(`[data-testid="form-nps-trend"][data-month="${today().slice(0, 7)}"]`)).toContainText("100");
  });
});
