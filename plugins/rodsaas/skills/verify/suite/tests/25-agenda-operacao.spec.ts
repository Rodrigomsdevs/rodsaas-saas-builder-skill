import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { linkFrom, waitForEmail } from "../support/mailpit";
import { newContext, ownerWithMember, signUp } from "../support/ui";

// Parte da Agenda (preset /rodsaas:agenda) que cobre a operação do balcão: recursos, combos, bloqueios, série,
// lista de espera, sinal, confirmação e WhatsApp, recepção (chegou/concluir), comissões, clube, fidelidade, fila do
// dia, clínica (convênio, anamnese, retorno), perfil de segmento e ficha do cliente. Roda junto com 12-agenda
// (`-g "Agenda"`). Referências: skills/agenda/references/09-perfis-de-segmento.md e 10-atendimento-e-comissoes.md.

const TZ = "America/Sao_Paulo";
const MIN = 60_000;
const WEEKDAYS_9_12 = { "0": [], "1": [["09:00", "12:00"]], "2": [["09:00", "12:00"]], "3": [["09:00", "12:00"]], "4": [["09:00", "12:00"]], "5": [["09:00", "12:00"]], "6": [] };

const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(instant: string | number | Date) {
  const p = Object.fromEntries(parts.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const today = () => local(Date.now()).ymd;
const iso = (v: string | number) => new Date(v).toISOString();
const plus = (v: string, min: number) => new Date(Date.parse(v) + min * MIN).toISOString();
/** 10:00 em São Paulo de N dias atrás (encaixe no passado: lançar o que já aconteceu). */
const pastAt = (daysAgo: number, hm = "10:00") => new Date(Date.parse(`${addDays(today(), -daysAgo)}T${hm}:00-03:00`)).toISOString();
/** Agora arredondado para o minuto, menos `min` minutos. */
const minutesAgo = (min: number) => new Date(Math.floor((Date.now() - min * MIN) / MIN) * MIN).toISOString();

async function installed(req: APIRequestContext) {
  if (cfg.presets.includes("agenda")) return true;
  return (await call(req, "GET", "/v1/agenda/settings")).status() !== 404;
}
async function hasApp(req: APIRequestContext, preset: string, probe: string) {
  if (cfg.presets.includes(preset)) return true;
  return (await call(req, "GET", probe)).status() !== 404;
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
async function needFinanceiro(req: APIRequestContext) {
  test.skip(!(await hasApp(req, "financeiro", "/v1/fin/settings")), "sinal e clube cobram pelo Financeiro: projeto sem o preset financeiro");
  await ensureFeature(req, "fin_charges");
}

type Setup = { page: string; type: string; typeId: string; scheduleId: string };
async function setup(req: APIRequestContext, typeOverrides: Record<string, unknown> = {}): Promise<Setup> {
  const settings = await ok<any>(await call(req, "GET", "/v1/agenda/settings"), "configurações da agenda");
  const schedules = items<any>(await ok(await call(req, "GET", "/v1/agenda/schedules"), "agendas"));
  const schedule = schedules.find((x) => x.isDefault) ?? schedules[0];
  await ok(await call(req, "PATCH", `/v1/agenda/schedules/${schedule.id}`, { timeZone: TZ, weekly: WEEKDAYS_9_12 }), "ajustar disponibilidade");
  const type = await ok<any>(await call(req, "POST", "/v1/agenda/event-types", {
    name: `Corte ${uniq()}`, durations: [30], slotIntervalMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0, minNoticeMin: 0, maxDaysAhead: 30, locationKind: "IN_PERSON", active: true, ...typeOverrides,
  }), "criar tipo");
  return { page: settings.pageSlug, type: type.slug, typeId: type.id, scheduleId: schedule.id };
}
async function newType(req: APIRequestContext, body: Record<string, unknown>) {
  return ok<any>(await call(req, "POST", "/v1/agenda/event-types", { durations: [30], slotIntervalMin: 30, minNoticeMin: 0, maxDaysAhead: 30, locationKind: "IN_PERSON", active: true, ...body }), `tipo ${body.name}`);
}

async function anon(playwright: any, s: Setup) {
  const ctx = await playwright.request.newContext();
  const base = `${cfg.apiURL}/v1/public/agenda`;
  const post = (path: string, body: unknown) => ctx.fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `verify-${uniq()}` }, data: JSON.stringify(body), failOnStatusCode: false });
  const get = (path: string) => ctx.fetch(base + path, { failOnStatusCode: false });
  const slotsOf = async (type = s.type, q = "") => {
    const body = await ok<any>(await get(`/${s.page}/types/${type}/slots?from=${addDays(today(), 1)}&to=${addDays(today(), 14)}&timeZone=${encodeURIComponent(TZ)}${q}`), "horários livres");
    return { body, list: (Object.values(body.days ?? {}).flat() as any[]).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)) };
  };
  const slots = async (type = s.type, q = "") => (await slotsOf(type, q)).list;
  const has = async (start: string, type = s.type) => (await slots(type)).some((x) => iso(x.start) === iso(start));
  const client = (tag: string) => ({ name: `Cliente ${tag} ${uniq()}`, email: `cliente.${tag}.${uniq()}@example.com`, timeZone: TZ });
  const book = (start: string, extra: Record<string, unknown> = {}, type = s.type) => post(`/${s.page}/types/${type}/bookings`, { start, ...client("op"), ...extra });
  const manage = (token: string) => get(`/manage/${token}`);
  return { ctx, get, post, slots, slotsOf, has, client, book, manage };
}
const tokenOf = (url: string) => new URL(url, cfg.webURL).pathname.split("/").filter(Boolean).pop()!;
async function booked(res: APIResponse, label: string) {
  const text = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(201);
  const body = JSON.parse(text);
  return { body, token: tokenOf(body.manageUrl) };
}
const detail = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/agenda/appointments/${id}`), "detalhe do agendamento");
async function findBy(req: APIRequestContext, email: string, status = "") {
  const list = items<any>(await ok(await call(req, "GET", `/v1/agenda/appointments${status ? `?status=${status}` : ""}`), "agendamentos"));
  return list.find((a) => (a.attendees ?? []).some((x: any) => String(x.email).toLowerCase() === email.toLowerCase()));
}
/** Encaixe interno (no passado também: lançar o atendimento que já aconteceu). */
const encaixe = (req: APIRequestContext, typeId: string, start: string, client: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  call(req, "POST", "/v1/agenda/appointments", { eventTypeId: typeId, start, client, outsideAvailability: true, notify: false, ...extra });
const complete = (req: APIRequestContext, id: string, body: Record<string, unknown>) => call(req, "POST", `/v1/agenda/appointments/${id}/complete`, body);
const humanPause = (page: any) => page.waitForTimeout(2_500);

test.describe("Agenda — operação do balcão", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset agenda");
  });

  // ------------------------------------------------------------------ API
  test("API: recursos — dois profissionais disputam a mesma sala e só um fica com o horário", async ({ browser, request, playwright }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request;
    await ensureFeature(o, "agenda_resources");
    const memberId = (await me(m)).user.id;
    const ms = items<any>(await ok(await call(m, "GET", "/v1/agenda/schedules"), "agenda do membro"));
    await ok(await call(m, "PATCH", `/v1/agenda/schedules/${ms[0].id}`, { timeZone: TZ, weekly: WEEKDAYS_9_12 }), "disponibilidade do membro");
    const sala1 = await ok<any>(await call(o, "POST", "/v1/agenda/resources", { name: "Sala 1" }), "criar sala 1");
    expect(sala1.id, "recurso criado").toBeTruthy();
    const sA = await setup(o, { resourceIds: [sala1.id] });
    const tB = await newType(o, { name: `Limpeza ${uniq()}`, hostIds: [memberId], resourceIds: [sala1.id] });
    const pub = await anon(playwright, sA);
    const [a] = await pub.slots();
    expect(await pub.has(a.start, tB.slug), "antes: a sala está livre para os dois").toBe(true);
    await booked(await pub.book(a.start), "Ana pega a sala 1");
    expect(await pub.has(a.start, tB.slug), "a sala ocupada some da agenda da outra pessoa").toBe(false);
    await expectCode(await pub.book(a.start, {}, tB.slug), 409, "SLOT_TAKEN", "outra pessoa, mesma sala, mesmo horário");
    const sala2 = await ok<any>(await call(o, "POST", "/v1/agenda/resources", { name: "Sala 2" }), "criar sala 2");
    await ok(await call(o, "PATCH", `/v1/agenda/event-types/${tB.id}`, { resourceIds: [sala1.id, sala2.id] }), "tipo usa as duas salas");
    expect(await pub.has(a.start, tB.slug), "com a segunda sala o horário volta").toBe(true);
    const who = pub.client("sala2");
    await booked(await pub.book(a.start, who, tB.slug), "fica com a sala 2");
    const appt = await detail(o, (await findBy(o, who.email)).id);
    expect(appt.resource?.id, "agendamento ficou na sala 2").toBe(sala2.id);
    expect(items<any>(await ok(await call(o, "GET", "/v1/agenda/resources"), "recursos")).map((r) => r.id)).toEqual(expect.arrayContaining([sala1.id, sala2.id]));
    await Promise.all([pub.ctx.dispose(), ownerCtx.close(), memberCtx.close()]);
  });

  test("API: combo — o adicional soma duração e preço nos horários e no agendamento", async ({ request, playwright }) => {
    await register(request, newUser("agcombo"));
    const s = await setup(request, { priceCents: 4000 });
    const barba = await newType(request, { name: `Barba ${uniq()}`, durations: [20], priceCents: 3000, combinable: true });
    const quimica = await newType(request, { name: `Química ${uniq()}`, durations: [60], priceCents: 9000 });
    await expectCode(await call(request, "PATCH", `/v1/agenda/event-types/${s.typeId}`, { addOnIds: [quimica.id] }), 400, "VALIDATION_ERROR", "adicional que não é combinável");
    await ok(await call(request, "PATCH", `/v1/agenda/event-types/${s.typeId}`, { addOnIds: [barba.id] }), "barba como adicional do corte");
    const pub = await anon(playwright, s);
    const t = await ok<any>(await pub.get(`/${s.page}/types/${s.type}`), "tipo público");
    expect((t.addOns ?? []).map((x: any) => [x.slug, x.durationMin, x.priceCents]), "adicionais oferecidos").toEqual([[barba.slug, 20, 3000]]);
    const combo = await pub.slotsOf(s.type, `&addOns=${barba.slug}`);
    expect([combo.body.durationMin, combo.body.priceCents], "corte + barba: 50 min e R$ 70,00").toEqual([50, 7000]);
    expect(combo.list.length, "tem horários").toBeGreaterThan(0);
    for (const sl of combo.list) {
      expect(Date.parse(sl.end) - Date.parse(sl.start), "cada horário dura 50 min").toBe(50 * MIN);
      expect(local(sl.start).hm, "11:30 + 50 min passaria das 12:00").not.toBe("11:30");
    }
    const a = combo.list[0];
    const { body } = await booked(await pub.book(a.start, { addOns: [barba.slug] }), "agendar corte + barba");
    expect([body.priceCents, Date.parse(body.end) - Date.parse(body.start)], "preço e duração somados").toEqual([7000, 50 * MIN]);
    expect(await pub.has(plus(a.start, 30)), "a meia hora seguinte também ficou ocupada").toBe(false);
    await expectCode(await pub.book(plus(a.start, 60), { addOns: [quimica.slug] }), 400, "VALIDATION_ERROR", "adicional que o tipo não oferece");
    await pub.ctx.dispose();
  });

  test("API: bloqueio de horário some da página e não deixa encaixe por cima", async ({ request, playwright }) => {
    await register(request, newUser("agblock"));
    const s = await setup(request);
    const pub = await anon(playwright, s);
    const [a, , , d] = await pub.slots();
    const blk = await ok<any>(await call(request, "POST", "/v1/agenda/blocks", { start: a.start, end: plus(a.start, 60), title: "Almoço" }), "bloquear 1 h");
    expect(blk.kind, "bloqueio").toBe("BLOCK");
    expect([await pub.has(a.start), await pub.has(plus(a.start, 30))], "a hora bloqueada some da página").toEqual([false, false]);
    const list = items<any>(await ok(await call(request, "GET", `/v1/agenda/appointments?from=${encodeURIComponent(plus(a.start, -60))}&to=${encodeURIComponent(plus(a.start, 120))}`), "agenda"));
    expect(list.some((x) => x.id === blk.id && x.kind === "BLOCK"), "bloqueio aparece na agenda").toBe(true);
    await expectCode(await encaixe(request, s.typeId, a.start, { name: "Por cima" }), 409, "SLOT_TAKEN", "encaixe em cima do bloqueio");
    await booked(await pub.book(d.start), "agendamento");
    await expectCode(await call(request, "POST", "/v1/agenda/blocks", { start: d.start, end: plus(d.start, 30), title: "x" }), 409, "SLOT_TAKEN", "bloquear em cima de um agendamento");
    await ok(await call(request, "DELETE", `/v1/agenda/blocks/${blk.id}`), "tirar o bloqueio");
    expect(await pub.has(a.start), "horário volta").toBe(true);
    await pub.ctx.dispose();
  });

  test("API: série semanal — cria as sessões, pula a que conflita e cancela esta e as próximas", async ({ request, playwright }) => {
    await register(request, newUser("agserie"));
    await ensureFeature(request, "agenda_recurring");
    const s = await setup(request, { allowRecurring: true });
    const pub = await anon(playwright, s);
    const list = await pub.slots();
    const a = list.find((x) => list.some((y) => iso(y.start) === plus(x.start, 7 * 1440)));
    test.skip(!a, "sem dois horários com 7 dias de diferença na janela");
    await booked(await pub.book(plus(a!.start, 7 * 1440)), "alguém já tem a 2ª semana");
    const client = { name: `Paciente ${uniq()}`, email: `serie.${uniq()}@example.com` };
    const r = await ok<any>(await encaixe(request, s.typeId, a!.start, client, { recurrence: { freq: "WEEKLY", count: 4 } }), "série de 4 semanas");
    expect(r.seriesId, "série criada").toBeTruthy();
    expect((r.created ?? []).map((x: any) => iso(x.start)), "criou as 3 livres").toEqual([iso(a!.start), plus(a!.start, 14 * 1440), plus(a!.start, 21 * 1440)]);
    expect((r.conflicts ?? []).map((x: any) => [iso(x.start), x.code]), "listou a que conflita").toEqual([[plus(a!.start, 7 * 1440), "SLOT_TAKEN"]]);
    await expectCode(await encaixe(request, s.typeId, a!.start, { name: "Fail" }, { recurrence: { freq: "WEEKLY", count: 2, onConflict: "fail" } }), 409, "SERIES_CONFLICT", "fail não cria nada");
    const c = await ok<any>(await call(request, "POST", `/v1/agenda/appointments/${r.created[1].id}/cancel`, { scope: "following", notify: false }), "cancelar esta e as próximas");
    expect([...(c.canceled ?? [])].sort(), "3ª e 4ª canceladas").toEqual([r.created[1].id, r.created[2].id].sort());
    expect((await detail(request, r.created[0].id)).status, "a 1ª continua").toBe("CONFIRMED");
    expect((await detail(request, r.created[2].id)).status).toBe("CANCELED");
    await pub.ctx.dispose();
  });

  test("API: lista de espera — vaga cancelada vai para o primeiro da fila, que confirma pelo link", async ({ request, playwright }) => {
    await register(request, newUser("agespera"));
    await ensureFeature(request, "agenda_waitlist");
    const s = await setup(request, { waitlist: true });
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    const { token } = await booked(await pub.book(a.start), "horário ocupado");
    const day = local(a.start).ymd;
    const w1 = pub.client("primeiro"), w2 = pub.client("segundo");
    const e1 = await ok<any>(await pub.post(`/${s.page}/types/${s.type}/waitlist`, { ...w1, dateFrom: day, dateTo: day }), "entrar na lista (1º)");
    const e2 = await ok<any>(await pub.post(`/${s.page}/types/${s.type}/waitlist`, { ...w2, dateFrom: day, dateTo: day }), "entrar na lista (2º)");
    expect([e1.status, e1.position, e2.position], "posições").toEqual(["WAITING", 1, 2]);
    await expectCode(await pub.post(`/${s.page}/types/${s.type}/waitlist`, { ...w1, dateFrom: day, dateTo: day }), 409, "ALREADY_WAITING", "mesma pessoa de novo");
    await ok(await pub.post(`/manage/${token}/cancel`, { reason: "imprevisto" }), "cliente cancela");
    const mail = await waitForEmail(request, w1.email, { contains: "/espera/" });
    const offerToken = tokenOf(linkFrom(mail, "/espera/"));
    expect(await pub.has(a.start), "a vaga fica segurada para o 1º da fila").toBe(false);
    const offer = await ok<any>(await pub.get(`/waitlist/${offerToken}`), "ver a oferta");
    expect([offer.status, iso(offer.start)], "oferta do horário que vagou").toEqual(["OFFERED", iso(a.start)]);
    const acc = await booked(await pub.post(`/waitlist/${offerToken}/accept`, {}), "aceitar a vaga");
    expect(iso(acc.body.start)).toBe(iso(a.start));
    await expectCode(await pub.post(`/waitlist/${offerToken}/accept`, {}), 409, "OFFER_EXPIRED", "aceitar de novo");
    const wl = items<any>(await ok(await call(request, "GET", `/v1/agenda/waitlist?eventTypeId=${s.typeId}`), "lista de espera"));
    const st = Object.fromEntries(wl.map((x) => [x.email ?? x.client?.email, x.status]));
    expect([st[w1.email], st[w2.email]], "1º agendou, 2º continua esperando").toEqual(["BOOKED", "WAITING"]);
    await pub.ctx.dispose();
  });

  test("API: sinal no Pix — horário segurado até pagar, pago confirma e cancelar em cima da hora retém", async ({ request, playwright }) => {
    await register(request, newUser("agsinal"));
    await needFinanceiro(request);
    await ensureFeature(request, "agenda_deposits");
    await ok(await call(request, "PATCH", "/v1/agenda/settings", { refundIfHoursBefore: 720 }), "devolve só com 30 dias");
    const s = await setup(request, { priceCents: 8000, deposit: { kind: "PERCENT", value: 50 } });
    const pub = await anon(playwright, s);
    const [a, b] = await pub.slots();
    const r = await booked(await pub.book(a.start), "agendar com sinal");
    expect(r.body.status, "aguardando o sinal").toBe("AWAITING_PAYMENT");
    expect(r.body.payment?.amountCents, "50% de R$ 80,00").toBe(4000);
    expect(String(r.body.payment?.url ?? ""), "link de pagamento do Financeiro").toContain("/pagar/");
    expect(Date.parse(r.body.payment.expiresAt), "prazo para pagar").toBeGreaterThan(Date.now());
    expect(r.body.location ?? null, "sem local/link antes de pagar").toBeFalsy();
    expect(await pub.has(a.start), "horário segurado").toBe(false);
    await expectCode(await pub.book(a.start), 409, "SLOT_TAKEN", "outra pessoa no horário segurado");
    const anonFin = await playwright.request.newContext();
    const pay = (url: string) => anonFin.fetch(`${cfg.apiURL}/v1/public/fin/charges/${tokenOf(url)}/fake-pay`, { method: "POST", headers: { "Content-Type": "application/json" }, data: JSON.stringify({ method: "pix" }), failOnStatusCode: false });
    await ok(await pay(r.body.payment.url), "pagar o sinal (modo de teste)");
    const m = await ok<any>(await pub.manage(r.token), "abrir pelo link");
    expect([m.status, m.payment?.status], "pago confirma").toEqual(["CONFIRMED", "PAID"]);
    const c = await ok<any>(await pub.post(`/manage/${r.token}/cancel`, {}), "cliente cancela em cima da hora");
    expect([c.refund?.refundCents, c.refund?.retainedCents], "sinal retido").toEqual([0, 4000]);
    const cl2 = pub.client("sinal2");
    const r2 = await booked(await pub.book(b.start, cl2), "outro com sinal");
    await ok(await pay(r2.body.payment.url), "pagar");
    const id = (await findBy(request, cl2.email)).id;
    const tc = await ok<any>(await call(request, "POST", `/v1/agenda/appointments/${id}/cancel`, { reason: "profissional doente", notify: false }), "a empresa cancela");
    expect(tc.refund?.refundCents, "a empresa cancelou: devolve tudo").toBe(4000);
    await Promise.all([pub.ctx.dispose(), anonFin.dispose()]);
  });

  test("API: quem faltou duas vezes precisa pagar sinal no próximo agendamento", async ({ request, playwright }) => {
    await register(request, newUser("agfaltas"));
    await needFinanceiro(request);
    await ensureFeature(request, "agenda_deposits");
    await ok(await call(request, "PATCH", "/v1/agenda/settings", { depositAfterNoShows: 2 }), "sinal depois de 2 faltas");
    const s = await setup(request, { priceCents: 6000 });
    const faltoso = { name: `Faltoso ${uniq()}`, email: `faltoso.${uniq()}@example.com` };
    for (const d of [3, 2]) {
      const ap = await ok<any>(await encaixe(request, s.typeId, pastAt(d), faltoso), `atendimento de ${d} dias atrás`);
      await ok(await call(request, "POST", `/v1/agenda/appointments/${ap.id}/attendance`, { attendance: "NO_SHOW" }), "faltou");
    }
    const pub = await anon(playwright, s);
    const [a, b] = await pub.slots();
    const r = await booked(await pub.book(a.start, { ...faltoso, timeZone: TZ }), "faltoso agenda");
    expect([r.body.status, r.body.payment?.reason, r.body.payment?.amountCents], "pede sinal de 50% pelas faltas").toEqual(["AWAITING_PAYMENT", "NO_SHOWS", 3000]);
    const ok2 = await booked(await pub.book(b.start), "cliente sem faltas");
    expect([ok2.body.status, ok2.body.payment ?? null], "sem sinal").toEqual(["CONFIRMED", null]);
    await pub.ctx.dispose();
  });

  test("API: o cliente confirma presença pelo link e a recepção tem as mensagens de WhatsApp prontas", async ({ request, playwright }) => {
    await register(request, newUser("agconfirma"));
    const s = await setup(request);
    const pub = await anon(playwright, s);
    const [a, b] = await pub.slots();
    const who = pub.client("zap");
    const r = await booked(await pub.book(a.start, { ...who, phone: "(44) 99999-1234" }), "agendar com WhatsApp");
    const m1 = await ok<any>(await pub.manage(r.token), "abrir");
    expect([m1.canConfirm, m1.clientConfirmed], "pode confirmar").toEqual([true, false]);
    await ok(await pub.post(`/manage/${r.token}/confirm`, {}), "confirmar presença");
    expect((await ok<any>(await pub.manage(r.token), "abrir de novo")).clientConfirmed, "confirmado pelo cliente").toBe(true);
    const appt = await detail(request, (await findBy(request, who.email)).id);
    expect(appt.clientConfirmedAt, "a equipe vê a confirmação").toBeTruthy();
    expect(appt.whatsapp?.phone, "telefone normalizado").toBe("5544999991234");
    const link = String(appt.whatsapp?.links?.REMINDER ?? "");
    expect(link.startsWith("https://wa.me/5544999991234?text="), `link do WhatsApp: ${link}`).toBe(true);
    expect(decodeURIComponent(link.split("text=")[1] ?? ""), "mensagem com o link de gerenciar").toContain(`/agendamento/${r.token}`);
    const sem = pub.client("semzap");
    await booked(await pub.book(b.start, sem), "sem telefone");
    expect((await detail(request, (await findBy(request, sem.email)).id)).whatsapp ?? null, "sem telefone, sem WhatsApp").toBeNull();
    await ok(await pub.post(`/manage/${r.token}/cancel`, {}), "cancelar");
    await expectCode(await pub.post(`/manage/${r.token}/confirm`, {}), 409, "CHANGE_NOT_ALLOWED", "confirmar cancelado");
    await pub.ctx.dispose();
  });

  test("API: recepção — chegou, concluir com serviço e produto, comissão por profissional e fechamento do período", async ({ request, playwright }) => {
    await register(request, newUser("agbalcao"));
    await ensureFeature(request, "agenda_commissions");
    const ownerId = (await me(request)).user.id;
    const s = await setup(request, { priceCents: 5000 });
    await ok(await call(request, "PUT", "/v1/agenda/commission-rules", { rules: [{ kind: "SERVICE", pct: 40 }, { kind: "PRODUCT", pct: 10 }] }), "regras de comissão");
    const ap = await ok<any>(await encaixe(request, s.typeId, minutesAgo(20), { name: `Rafa ${uniq()}` }), "atendimento que começou há 20 min");
    const ci = await ok<any>(await call(request, "POST", `/v1/agenda/appointments/${ap.id}/check-in`, {}), "chegou");
    expect(ci.checkedInAt, "hora da chegada").toBeTruthy();
    await expectCode(await complete(request, ap.id, { payments: [{ method: "PIX", amountCents: 100 }] }), 422, "PAYMENT_MISMATCH", "pagamento que não fecha");
    const done = await ok<any>(await complete(request, ap.id, { items: [{ kind: "SERVICE", serviceId: s.typeId }, { kind: "PRODUCT", name: "Pomada", qty: 1, unitCents: 3500 }], payments: [{ method: "PIX", amountCents: 8500 }] }), "concluir");
    expect([done.totalCents, done.commissionCents, (done.items ?? []).length], "R$ 85,00; comissão 40% de 50 + 10% de 35").toEqual([8500, 2350, 2]);
    await expectCode(await complete(request, ap.id, { payments: [{ method: "PIX", amountCents: 8500 }] }), 409, "ALREADY_COMPLETED", "concluir duas vezes");
    const d = await detail(request, ap.id);
    expect([d.completedAt ? "ok" : null, d.attendees?.[0]?.attendance], "concluído = compareceu").toEqual(["ok", "ATTENDED"]);
    const rep = await ok<any>(await call(request, "GET", `/v1/agenda/reports/commissions?from=${today()}&to=${today()}`), "extrato");
    const mine = (rep.byHost ?? []).find((x: any) => x.hostId === ownerId);
    expect([mine?.servicesCents, mine?.productsCents, mine?.commissionCents, rep.closed], "extrato do dia").toEqual([5000, 3500, 2350, false]);
    await ok(await call(request, "PUT", "/v1/agenda/commission-rules", { rules: [{ kind: "SERVICE", pct: 90 }] }), "mudar a regra depois");
    expect(((await ok<any>(await call(request, "GET", `/v1/agenda/reports/commissions?from=${today()}&to=${today()}`), "extrato")).byHost ?? []).find((x: any) => x.hostId === ownerId)?.commissionCents, "o já concluído não muda").toBe(2350);
    const tomorrow = (await anon(playwright, s));
    const [t1] = await tomorrow.slots();
    const fut = await ok<any>(await encaixe(request, s.typeId, t1.start, { name: "Amanhã" }), "agendamento de amanhã");
    await expectCode(await call(request, "POST", `/v1/agenda/appointments/${fut.id}/check-in`, {}), 409, "TOO_EARLY", "chegou cedo demais");
    await expectCode(await complete(request, fut.id, {}), 409, "NOT_STARTED", "concluir antes de começar");
    await ok(await call(request, "POST", "/v1/agenda/commissions/close", { from: today(), to: today() }), "fechar o dia");
    await expectCode(await call(request, "POST", "/v1/agenda/commissions/close", { from: addDays(today(), -1), to: today() }), 409, "PERIOD_CLOSED", "fechar de novo");
    const late = await ok<any>(await encaixe(request, s.typeId, minutesAgo(90), { name: `Atrasado ${uniq()}` }), "outro atendimento de hoje");
    await expectCode(await complete(request, late.id, { payments: [{ method: "CASH", amountCents: 5000 }] }), 409, "PERIOD_CLOSED", "concluir em período fechado");
    await tomorrow.ctx.dispose();
  });

  test("API: clube — o assinante agenda sem pagar enquanto tem usos e depois paga normal", async ({ request, playwright }) => {
    await register(request, newUser("agclube"));
    await ensureFeature(request, "agenda_club");
    const s = await setup(request, { priceCents: 4500 });
    const plan = await ok<any>(await call(request, "POST", "/v1/agenda/club/plans", { name: "Clube 1 corte", priceCents: 8990, serviceIds: [s.typeId], usesPerPeriod: 1 }), "plano do clube");
    const socio = { name: `Sócio ${uniq()}`, email: `socio.${uniq()}@example.com` };
    const sub = await ok<any>(await call(request, "POST", "/v1/agenda/club/subscriptions", { planId: plan.id, client: socio }), "assinar");
    expect([sub.status, sub.usesLeft], "ativa com 1 uso").toEqual(["ACTIVE", 1]);
    await expectCode(await call(request, "POST", "/v1/agenda/club/subscriptions", { planId: plan.id, client: socio }), 409, "ALREADY_SUBSCRIBED", "assinar de novo");
    const pub = await anon(playwright, s);
    const [a, b, c] = await pub.slots();
    const r1 = await booked(await pub.book(a.start, { ...socio, timeZone: TZ }), "agendar pelo clube");
    expect([r1.body.priceCents, r1.body.paymentKind], "coberto pelo clube").toEqual([0, "CLUB"]);
    const r2 = await booked(await pub.book(b.start, { ...socio, timeZone: TZ }), "segundo no mesmo mês");
    expect([r2.body.priceCents, r2.body.paymentKind], "usos acabaram: preço normal").toEqual([4500, "PRIVATE"]);
    await ok(await pub.post(`/manage/${r1.token}/cancel`, {}), "cancelar o do clube");
    const r3 = await booked(await pub.book(c.start, { ...socio, timeZone: TZ }), "agendar de novo");
    expect(r3.body.paymentKind, "cancelado devolve o uso").toBe("CLUB");
    const other = await booked(await pub.book(c.start === a.start ? b.start : a.start), "quem não assina");
    expect(other.body.paymentKind, "não assinante paga").toBe("PRIVATE");
    await pub.ctx.dispose();
  });

  test("API: fidelidade — a cada 5 atendimentos concluídos o próximo sai de graça", async ({ request }) => {
    await register(request, newUser("agfiel"));
    await ensureFeature(request, "agenda_loyalty");
    const s = await setup(request, { priceCents: 4000 });
    await ok(await call(request, "PATCH", "/v1/agenda/settings", { loyalty: { everyN: 5, serviceIds: [s.typeId] } }), "a cada 5, 1 grátis");
    const fiel = { name: `Fiel ${uniq()}`, email: `fiel.${uniq()}@example.com` };
    let last: any;
    for (const d of [6, 5, 4, 3, 2]) {
      const ap = await ok<any>(await encaixe(request, s.typeId, pastAt(d), fiel), `atendimento de ${d} dias atrás`);
      last = await ok<any>(await complete(request, ap.id, { payments: [{ method: "PIX", amountCents: 4000 }] }), "concluir");
    }
    expect([last.loyalty?.rewardsAvailable, last.loyalty?.stamps], "5º libera o prêmio").toEqual([1, 0]);
    const free = await ok<any>(await encaixe(request, s.typeId, pastAt(1), fiel), "6º atendimento");
    const red = await ok<any>(await complete(request, free.id, { redeemLoyalty: true, payments: [] }), "resgatar");
    expect([red.totalCents, red.loyalty?.rewardsAvailable], "sai de graça e gasta o prêmio").toEqual([0, 0]);
    const again = await ok<any>(await encaixe(request, s.typeId, pastAt(1, "11:00"), fiel), "7º atendimento");
    await expectCode(await complete(request, again.id, { redeemLoyalty: true, payments: [] }), 409, "NO_REWARD", "resgatar sem prêmio");
  });

  test("API: fila do dia — posição, previsão e chamar vira atendimento com chegada", async ({ request }) => {
    await register(request, newUser("agfila"));
    const s = await setup(request);
    const qa = await ok<any>(await call(request, "POST", "/v1/agenda/queue", { name: `Walk A ${uniq()}`, serviceIds: [s.typeId] }), "1º na fila");
    const qb = await ok<any>(await call(request, "POST", "/v1/agenda/queue", { name: `Walk B ${uniq()}`, serviceIds: [s.typeId] }), "2º na fila");
    expect([qa.position, qa.etaMin, qb.position, qb.etaMin], "um profissional: o 2º espera 30 min").toEqual([1, 0, 2, 30]);
    const called = await ok<any>(await call(request, "POST", `/v1/agenda/queue/${qa.id}/call`, {}), "chamar o 1º");
    const ap = called.appointment;
    expect([ap?.status, !!ap?.checkedInAt], "atendimento já com chegada").toEqual(["CONFIRMED", true]);
    expect(Math.abs(Date.parse(ap.start) - Date.now()), "começa agora").toBeLessThan(2 * MIN);
    const q = items<any>(await ok(await call(request, "GET", `/v1/agenda/queue?date=${today()}`), "fila"));
    expect(q.map((x) => [x.id, x.position]), "o 1º saiu da fila").toEqual([[qb.id, 1]]);
    expect(q[0].etaMin, "espera até o atual acabar").toBeGreaterThanOrEqual(28);
    await expectCode(await call(request, "POST", `/v1/agenda/queue/${qb.id}/call`, {}), 409, "SLOT_TAKEN", "chamar com o profissional ocupado");
    await ok(await complete(request, ap.id, { payments: [] }), "concluir antes da hora libera");
    await ok(await call(request, "POST", `/v1/agenda/queue/${qb.id}/call`, {}), "agora chama o 2º");
  });

  test("API: clínica — convênio aceito ou recusado, anamnese na primeira vez e retorno sugerido", async ({ request, playwright }) => {
    await register(request, newUser("agclinica"));
    await ensureFeature(request, "agenda_clinic");
    await ok(await call(request, "PATCH", "/v1/agenda/settings", { segment: "DENTAL" }), "perfil odonto");
    const settings = await ok<any>(await call(request, "GET", "/v1/agenda/settings"), "configurações");
    expect([settings.vocabulary?.client, settings.vocabulary?.pro], "palavras do odonto").toEqual(["paciente", "dentista"]);
    const uni = await ok<any>(await call(request, "POST", "/v1/agenda/insurances", { name: `Uniodonto ${uniq()}` }), "convênio aceito");
    const amil = await ok<any>(await call(request, "POST", "/v1/agenda/insurances", { name: `Amil ${uniq()}` }), "convênio não aceito");
    let intakeFormId: string | undefined;
    if (await hasApp(request, "forms", "/v1/forms")) intakeFormId = (await ok<any>(await call(request, "POST", "/v1/forms", { title: "Anamnese" }), "formulário de anamnese")).id;
    const s = await setup(request, { priceCents: 20000, insuranceIds: [uni.id], returnAfterDays: 180, ...(intakeFormId ? { intakeFormId } : {}) });
    await ok(await call(request, "PATCH", `/v1/agenda/insurances/${uni.id}`, { prices: { [s.typeId]: 5000 } }), "coparticipação de R$ 50");
    const pub = await anon(playwright, s);
    const t = await ok<any>(await pub.get(`/${s.page}/types/${s.type}`), "tipo público");
    expect((t.insurances ?? []).map((x: any) => x.id), "só o convênio aceito").toEqual([uni.id]);
    const [a, b] = await pub.slots();
    const pac = pub.client("pac");
    const bad = await expectCode(await pub.book(a.start, { ...pac, insuranceId: amil.id }), 400, "VALIDATION_ERROR", "convênio não aceito");
    expect(pathsOf(bad)).toContain("insuranceId");
    const r1 = await booked(await pub.book(a.start, { ...pac, insuranceId: uni.id }), "pelo convênio");
    expect([r1.body.priceCents, r1.body.paymentKind], "valor do convênio").toEqual([5000, "INSURANCE"]);
    if (intakeFormId) {
      expect(String(r1.body.intake?.url ?? ""), "anamnese na primeira vez").toContain("/f/");
      const r2 = await booked(await pub.book(b.start, pac), "segunda vez");
      expect(r2.body.intake ?? null, "não pede de novo").toBeNull();
    }
    const ap = await ok<any>(await encaixe(request, s.typeId, pastAt(1), { name: pac.name, email: pac.email }), "consulta de ontem");
    const done = await ok<any>(await complete(request, ap.id, { payments: [{ method: "PIX", amountCents: 20000 }] }), "concluir");
    expect(done.recall?.dueDate, "retorno em 180 dias").toBe(addDays(addDays(today(), -1), 180));
    const rec = items<any>(await ok(await call(request, "GET", `/v1/agenda/recalls?due=${addDays(today(), 200)}`), "retornos"));
    expect(rec.some((x) => x.client?.email === pac.email && x.dueDate === done.recall.dueDate), "na lista de retornos").toBe(true);
    await pub.ctx.dispose();
  });

  test("API: perfil do segmento muda as palavras na API e na página pública sem apagar nada", async ({ request, playwright }) => {
    await register(request, newUser("agperfil"));
    const s = await setup(request);
    const before = items<any>(await ok(await call(request, "GET", "/v1/agenda/event-types"), "tipos")).length;
    await expectCode(await call(request, "PATCH", "/v1/agenda/settings", { segment: "XPTO" }), 400, "VALIDATION_ERROR", "perfil inválido");
    await ok(await call(request, "PATCH", "/v1/agenda/settings", { segment: "BARBERSHOP" }), "virar barbearia");
    const st = await ok<any>(await call(request, "GET", "/v1/agenda/settings"), "configurações");
    expect([st.segment, st.vocabulary?.pro, st.vocabulary?.service], "barbearia").toEqual(["BARBERSHOP", "barbeiro", "serviço"]);
    const pub = await anon(playwright, s);
    expect((await ok<any>(await pub.get(`/${s.page}`), "página pública")).vocabulary?.pro, "a página fala barbeiro").toBe("barbeiro");
    expect(items<any>(await ok(await call(request, "GET", "/v1/agenda/event-types"), "tipos")).length, "nada some").toBe(before);
    await pub.ctx.dispose();
  });

  test("API: ficha do cliente — visitas, faltas, gasto, último atendimento, próximo e anotações", async ({ request, playwright }) => {
    await register(request, newUser("agficha"));
    const s = await setup(request, { priceCents: 4000 });
    const cli = { name: `Ficha ${uniq()}`, email: `ficha.${uniq()}@example.com` };
    const v1 = await ok<any>(await encaixe(request, s.typeId, pastAt(10), cli), "visita 1");
    await ok(await complete(request, v1.id, { payments: [{ method: "PIX", amountCents: 4000 }] }), "concluir 1");
    const v2 = await ok<any>(await encaixe(request, s.typeId, pastAt(3), cli), "visita 2");
    await ok(await complete(request, v2.id, { payments: [{ method: "CASH", amountCents: 5000 }] }), "concluir 2 (troco em dinheiro)");
    const f = await ok<any>(await encaixe(request, s.typeId, pastAt(2), cli), "falta");
    await ok(await call(request, "POST", `/v1/agenda/appointments/${f.id}/attendance`, { attendance: "NO_SHOW" }), "faltou");
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    await booked(await pub.book(a.start, { ...cli, timeZone: TZ }), "próximo");
    const list = items<any>(await ok(await call(request, "GET", `/v1/agenda/clients?q=${encodeURIComponent(cli.email)}`), "clientes"));
    const c = list.find((x) => x.email === cli.email);
    expect(c, "cliente sem duplicar").toBeTruthy();
    expect(list.filter((x) => x.email === cli.email), "uma ficha só").toHaveLength(1);
    const fc = await ok<any>(await call(request, "GET", `/v1/agenda/clients/${c.id}`), "ficha");
    expect([fc.summary?.visits, fc.summary?.noShows, fc.summary?.spentCents], "2 visitas, 1 falta, R$ 80,00").toEqual([2, 1, 8000]);
    expect(iso(fc.summary?.lastVisit?.start), "último atendimento").toBe(iso(pastAt(3)));
    expect(iso(fc.summary?.nextAppointment?.start), "próximo").toBe(iso(a.start));
    await ok(await call(request, "PATCH", `/v1/agenda/clients/${c.id}`, { notes: "Prefere máquina 2 dos lados" }), "anotar");
    expect((await ok<any>(await call(request, "GET", `/v1/agenda/clients/${c.id}`), "ficha")).notes).toBe("Prefere máquina 2 dos lados");
    await pub.ctx.dispose();
  });

  // ------------------------------------------------------------------ telas
  test("Tela: recepção do dia — coluna do profissional, chegou e concluir com produto", async ({ page }) => {
    await signUp(page, "agrecepcao");
    const req = page.context().request;
    const ownerId = (await me(req)).user.id;
    const s = await setup(req, { priceCents: 5000 });
    const name = `Rafa ${uniq()}`;
    const ap = await ok<any>(await encaixe(req, s.typeId, minutesAgo(5), { name }), "atendimento de agora");
    await page.goto("/agenda/recepcao");
    await expect(page.getByTestId("agenda-reception")).toBeVisible();
    const col = page.locator(`[data-testid="agenda-day-column"][data-host="${ownerId}"]`);
    await expect(col, "coluna do profissional").toBeVisible();
    const card = col.locator(`[data-testid="agenda-reception-card"][data-appointment-id="${ap.id}"]`);
    await expect(card, "cartão do atendimento").toContainText(name);
    await card.getByTestId("agenda-checkin").click();
    await expect(card, "chegou").toHaveAttribute("data-state", "arrived");
    await card.getByTestId("agenda-complete").click();
    const dlg = page.getByTestId("agenda-complete-dialog");
    await expect(dlg).toBeVisible();
    await expect(dlg.getByTestId("agenda-complete-total"), "serviço já listado").toHaveAttribute("data-cents", "5000");
    await dlg.getByTestId("agenda-complete-product-add").click();
    await dlg.getByTestId("agenda-complete-product-name").fill("Pomada");
    await dlg.getByTestId("agenda-complete-product-price").fill("35,00");
    await expect(dlg.getByTestId("agenda-complete-total"), "total com o produto").toHaveAttribute("data-cents", "8500");
    await dlg.getByTestId("agenda-complete-method").selectOption("PIX");
    await dlg.getByTestId("agenda-complete-confirm").click();
    await expect(card, "concluído").toHaveAttribute("data-state", "done");
    const d = await detail(req, ap.id);
    expect([!!d.completedAt, (d.items ?? []).length], "gravado com as duas linhas").toEqual([true, 2]);
  });

  test("Tela: página pública com adicional e sinal — total somado e link para pagar", async ({ page, browser }) => {
    test.slow();
    await signUp(page, "agpubsinal");
    const req = page.context().request;
    await needFinanceiro(req);
    await ensureFeature(req, "agenda_deposits");
    const s = await setup(req, { priceCents: 4000, deposit: { kind: "FIXED", value: 2000 } });
    const barba = await newType(req, { name: `Barba ${uniq()}`, durations: [20], priceCents: 3000, combinable: true });
    await ok(await call(req, "PATCH", `/v1/agenda/event-types/${s.typeId}`, { addOnIds: [barba.id] }), "adicional");
    const visitor = await newContext(browser);
    const pub = await visitor.newPage();
    await pub.goto(`/agendar/${s.page}/${s.type}`);
    await expect(pub.getByTestId("agenda-public-page")).toBeVisible();
    await expect(pub.getByTestId("agenda-public-total"), "total do serviço").toHaveAttribute("data-cents", "4000");
    await pub.locator(`[data-testid="agenda-public-addon"][data-slug="${barba.slug}"]`).check();
    await expect(pub.getByTestId("agenda-public-total"), "total com a barba").toHaveAttribute("data-cents", "7000");
    const slot = pub.getByTestId("agenda-public-slot").first();
    if (!(await slot.isVisible().catch(() => false))) await pub.locator('[data-testid="agenda-public-day"]:not([disabled])').first().click();
    await expect(slot).toBeVisible();
    const start = await slot.getAttribute("data-start");
    await slot.click();
    const email = `pub.${uniq()}@example.com`;
    await pub.getByLabel("Nome", { exact: true }).fill(`Visitante ${uniq()}`);
    await pub.getByLabel("E-mail", { exact: true }).fill(email);
    await humanPause(pub);
    await pub.getByTestId("agenda-public-confirm").click();
    await expect(pub.getByTestId("agenda-public-payment"), "pede o sinal").toBeVisible();
    expect(await pub.getByTestId("agenda-public-pay-link").getAttribute("href"), "link de pagamento").toContain("/pagar/");
    await visitor.close();
    const appt = await detail(req, (await findBy(req, email)).id);
    expect([appt.status, appt.priceCents, iso(appt.start), Date.parse(appt.end) - Date.parse(appt.start)], "gravado com o combo e aguardando o sinal").toEqual(["AWAITING_PAYMENT", 7000, iso(start!), 50 * MIN]);
  });

  test("Tela: o cliente confirma a presença pelo link", async ({ page, browser, playwright }) => {
    await signUp(page, "agconfui");
    const s = await setup(page.context().request);
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    const { token } = await booked(await pub.book(a.start), "agendar");
    const visitor = await newContext(browser);
    const vp = await visitor.newPage();
    await vp.goto(`/agendamento/${token}`);
    await expect(vp.getByTestId("agenda-manage")).toBeVisible();
    await vp.getByTestId("agenda-manage-confirm").click();
    await expect(vp.getByTestId("agenda-manage-confirmed"), "presença confirmada").toBeVisible();
    await visitor.close();
    expect((await ok<any>(await pub.manage(token), "status")).clientConfirmed).toBe(true);
    await pub.ctx.dispose();
  });

  test("Tela: fila do dia — pôr na fila e chamar", async ({ page }) => {
    await signUp(page, "agfilaui");
    const req = page.context().request;
    const s = await setup(req);
    await page.goto("/agenda/fila");
    await expect(page.getByTestId("agenda-queue")).toBeVisible();
    await page.getByTestId("agenda-queue-add").click();
    const name = `Chegou agora ${uniq()}`;
    await page.getByTestId("agenda-queue-name").fill(name);
    await page.getByTestId("agenda-queue-service").selectOption(s.typeId);
    await page.getByTestId("agenda-queue-submit").click();
    const row = page.getByTestId("agenda-queue-row").filter({ hasText: name });
    await expect(row, "na fila").toBeVisible();
    await expect(row).toHaveAttribute("data-position", "1");
    await expect(row.getByTestId("agenda-queue-eta"), "previsão de espera").toBeVisible();
    await row.getByTestId("agenda-queue-call").click();
    await expect(row, "chamado sai da fila").toHaveCount(0);
    const list = items<any>(await ok(await call(req, "GET", "/v1/agenda/appointments?status=upcoming"), "agendamentos"));
    const all = list.length ? list : items<any>(await ok(await call(req, "GET", "/v1/agenda/appointments"), "agendamentos"));
    expect(all.some((x) => (x.attendees ?? []).some((p: any) => p.name === name) && x.checkedIn), "virou atendimento com chegada").toBe(true);
  });
});
