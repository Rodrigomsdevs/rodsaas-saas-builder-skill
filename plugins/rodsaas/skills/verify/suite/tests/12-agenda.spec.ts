import { test, expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, ownerWithMember, signUp } from "../support/ui";

// Parte da Agenda (preset /rodsaas:agenda). Roda quando rodsaas.json tem "agenda" em presets ou a API tem /v1/agenda/settings.

const TZ = "America/Sao_Paulo";
const MIN = 60_000;
/** Segunda a sexta, 09:00–12:00 (0 = domingo). */
const WEEKDAYS_9_12 = { "0": [], "1": [["09:00", "12:00"]], "2": [["09:00", "12:00"]], "3": [["09:00", "12:00"]], "4": [["09:00", "12:00"]], "5": [["09:00", "12:00"]], "6": [] };
const ALL_DAY = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, [["00:00", "24:00"]]]));
const MORNING = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"];

// ------------------------------------------------------------------ datas no fuso da agenda
const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(instant: string | number | Date) {
  const p = Object.fromEntries(parts.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  const ymd = `${p.year}-${p.month}-${p.day}`;
  return { ymd, hm: `${p.hour}:${p.minute}`, dow: new Date(ymd + "T12:00:00Z").getUTCDay() };
}
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const today = () => local(Date.now()).ymd;
const iso = (v: string | number) => new Date(v).toISOString();

async function agendaInstalled(req: APIRequestContext) {
  if (cfg.presets.includes("agenda")) return true;
  return (await call(req, "GET", "/v1/agenda/settings")).status() !== 404;
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

type Setup = { page: string; type: string; typeId: string; scheduleId: string };

/** Ajusta a agenda padrão de quem está logado e cria um tipo de 30 min com horários de 30 em 30. */
async function setup(req: APIRequestContext, typeOverrides: Record<string, unknown> = {}, weekly: Record<string, string[][]> = WEEKDAYS_9_12): Promise<Setup> {
  const settings = await ok<any>(await call(req, "GET", "/v1/agenda/settings"), "configurações da agenda");
  expect(settings.pageSlug, "empresa nasce com o endereço da página").toBeTruthy();
  const schedules = items<any>(await ok(await call(req, "GET", "/v1/agenda/schedules"), "agendas"));
  const schedule = schedules.find((x) => x.isDefault) ?? schedules[0];
  expect(schedule, "empresa nasce com a agenda padrão do owner").toBeTruthy();
  await ok(await call(req, "PATCH", `/v1/agenda/schedules/${schedule.id}`, { timeZone: TZ, weekly }), "ajustar disponibilidade");
  const type = await ok<any>(
    await call(req, "POST", "/v1/agenda/event-types", {
      name: `Consulta ${uniq()}`, durations: [30], slotIntervalMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0, minNoticeMin: 0, maxDaysAhead: 30, locationKind: "JITSI", active: true,
      ...typeOverrides,
    }),
    "criar tipo de agendamento",
  );
  expect(type.slug, "tipo criado devolve o slug").toBeTruthy();
  expect(String(type.publicUrl ?? ""), "tipo criado devolve o link público").toContain("/agendar/");
  return { page: settings.pageSlug, type: type.slug, typeId: type.id, scheduleId: schedule.id };
}

/** Chamadas públicas: contexto novo, sem cookie e sem Origin (como o celular de um cliente). */
async function anon(playwright: any, s: Setup) {
  const ctx = await playwright.request.newContext();
  const base = `${cfg.apiURL}/v1/public/agenda`;
  const post = (path: string, body: unknown) =>
    ctx.fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `verify-${uniq()}` }, data: JSON.stringify(body), failOnStatusCode: false });
  const get = (path: string) => ctx.fetch(base + path, { failOnStatusCode: false });
  const days = async (from = addDays(today(), 1), to = addDays(today(), 14)) => {
    const body = await ok<any>(await get(`/${s.page}/types/${s.type}/slots?from=${from}&to=${to}&timeZone=${encodeURIComponent(TZ)}`), "horários livres");
    return (body.days ?? {}) as Record<string, { start: string; end: string; seatsLeft?: number }[]>;
  };
  const slots = async (from?: string, to?: string) => Object.values(await days(from, to)).flat().sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const has = async (start: string) => (await slots()).some((x) => iso(x.start) === iso(start));
  const client = (tag: string) => ({ name: `Cliente ${tag} ${uniq()}`, email: `cliente.${tag}.${uniq()}@example.com`, timeZone: TZ });
  const book = (start: string, extra: Record<string, unknown> = {}) => post(`/${s.page}/types/${s.type}/bookings`, { start, ...client("ag"), ...extra });
  const hold = (start: string) => post(`/${s.page}/types/${s.type}/holds`, { start });
  const manage = (token: string) => get(`/manage/${token}`);
  const cancel = (token: string, reason?: string) => post(`/manage/${token}/cancel`, { reason });
  const reschedule = (token: string, start: string) => post(`/manage/${token}/reschedule`, { start });
  return { ctx, get, days, slots, has, client, book, hold, manage, cancel, reschedule };
}
const tokenOf = (manageUrl: string) => new URL(manageUrl, cfg.webURL).pathname.split("/").filter(Boolean).pop()!;

/** Agenda e devolve { body, token }. */
async function booked(res: APIResponse, label: string) {
  const text = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(201);
  const body = JSON.parse(text);
  expect(String(body.manageUrl ?? ""), `${label}: link para gerenciar`).toContain("/agendamento/");
  return { body, token: tokenOf(body.manageUrl) };
}

async function findAppointment(req: APIRequestContext, email: string, status = "upcoming") {
  const list = items<any>(await ok(await call(req, "GET", `/v1/agenda/appointments?status=${status}`), "agendamentos"));
  return list.find((a) => (a.attendees ?? []).some((x: any) => String(x.email).toLowerCase() === email.toLowerCase()));
}

/** Envio feito rápido demais é tratado como robô (`_ts`); a tela espera o mesmo que uma pessoa levaria. */
const humanPause = (page: Page) => page.waitForTimeout(2_500);

test.describe("Agenda", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await agendaInstalled(request)), "projeto sem o preset agenda");
  });

  // ------------------------------------------------------------------ API
  test("API: horários públicos só dentro da disponibilidade, sem login e sem Origin", async ({ request, playwright }) => {
    await register(request, newUser("agenda"));
    const s = await setup(request);
    const pub = await anon(playwright, s);

    const page = await ok<any>(await pub.get(`/${s.page}`), "página pública da empresa");
    expect((page.eventTypes ?? []).map((t: any) => t.slug), "tipo ativo aparece na página").toContain(s.type);
    await ok(await pub.get(`/${s.page}/types/${s.type}`), "página pública do tipo");

    const days = await pub.days();
    const full: string[] = [];
    for (const [ymd, list] of Object.entries(days)) {
      if (!list.length) continue;
      expect([1, 2, 3, 4, 5], `${ymd}: só de segunda a sexta`).toContain(local(ymd + "T15:00:00Z").dow);
      for (const sl of list) {
        const l = local(sl.start);
        expect(l.ymd, "horário agrupado no dia certo (fuso pedido)").toBe(ymd);
        expect(MORNING, `${sl.start}: dentro de 09:00–12:00 em ${TZ}`).toContain(l.hm);
        expect(Date.parse(sl.end) - Date.parse(sl.start), "duração de 30 min").toBe(30 * MIN);
      }
      if (list.length === MORNING.length) full.push(ymd);
    }
    expect(full.length, "dias úteis com os 6 horários da manhã (feriados podem faltar)").toBeGreaterThanOrEqual(5);
    await pub.ctx.dispose();
  });

  test("API: agendar pelo link público e nunca marcar duas vezes o mesmo horário", async ({ request, playwright }) => {
    test.slow();
    const owner = newUser("agendabook");
    await register(request, owner);
    const s = await setup(request);
    const pub = await anon(playwright, s);
    const [a, b, c] = await pub.slots();
    expect(c, "precisa de horários livres").toBeTruthy();

    const who = pub.client("ana");
    const { body } = await booked(await pub.book(a.start, who), "agendamento público");
    expect(body.status, "sem aprovação manual já nasce confirmado").toBe("CONFIRMED");
    expect(iso(body.start)).toBe(iso(a.start));
    expect(JSON.stringify(body), "resposta não expõe dados da equipe").not.toContain(owner.email);

    await expectCode(await pub.book(a.start), 409, "SLOT_TAKEN", "mesmo horário de novo");
    expect(await pub.has(a.start), "horário marcado some da página").toBe(false);

    const burst = await Promise.all(Array.from({ length: 5 }, () => pub.book(b.start)));
    const statuses = burst.map((r) => r.status()).sort();
    expect(statuses.filter((x) => x === 201), `5 pedidos simultâneos no mesmo horário → exatamente 1 (${statuses.join(", ")})`).toHaveLength(1);
    expect(statuses.filter((x) => x === 409), "os outros recebem 409").toHaveLength(4);
    expect(await pub.has(c.start), "horário vizinho continua livre").toBe(true);

    const saved = await findAppointment(request, who.email);
    expect(saved, "agendamento aparece para a empresa").toBeTruthy();
    expect(saved.status).toBe("CONFIRMED");
    expect(iso(saved.start)).toBe(iso(a.start));
    const sameSlot = items<any>(await ok(await call(request, "GET", "/v1/agenda/appointments?status=upcoming"), "lista")).filter((x) => iso(x.start) === iso(b.start) && x.status !== "CANCELED");
    expect(sameSlot, "só um compromisso gravado no horário disputado").toHaveLength(1);
    await pub.ctx.dispose();
  });

  test("API: reserva temporária segura o horário enquanto o cliente preenche", async ({ request, playwright }) => {
    await register(request, newUser("agendahold"));
    const s = await setup(request);
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    const h = await ok<any>(await pub.hold(a.start), "reservar horário");
    expect(h.holdId, "reserva devolve o id").toBeTruthy();
    expect(Date.parse(h.expiresAt) - Date.now(), "reserva de poucos minutos").toBeLessThanOrEqual(10 * MIN);
    expect(await pub.has(a.start), "horário reservado não aparece para outros").toBe(false);
    await expectCode(await pub.book(a.start), 409, "SLOT_TAKEN", "outra pessoa tenta o horário reservado");
    await booked(await pub.book(a.start, { holdId: h.holdId }), "quem reservou confirma");
    await pub.ctx.dispose();
  });

  test("API: o cliente remarca e cancela pelo link e o horário volta a ficar livre", async ({ request, playwright }) => {
    await register(request, newUser("agendamanage"));
    const s = await setup(request);
    const pub = await anon(playwright, s);
    const [a, b] = await pub.slots();
    const who = pub.client("bia");
    const { token } = await booked(await pub.book(a.start, who), "agendar");

    const m1 = await ok<any>(await pub.manage(token), "abrir pelo link");
    expect(m1.status).toBe("CONFIRMED");
    expect(m1.canCancel && m1.canReschedule, "dentro da política pode alterar").toBe(true);
    expect(m1.attendee?.name).toBe(who.name);

    await ok(await pub.reschedule(token, b.start), "remarcar");
    const m2 = await ok<any>(await pub.manage(token), "depois de remarcar (mesmo token)");
    expect(iso(m2.start), "novo horário").toBe(iso(b.start));
    expect(await pub.has(a.start), "horário antigo liberado").toBe(true);
    expect(await pub.has(b.start), "horário novo ocupado").toBe(false);

    await ok(await pub.cancel(token, "imprevisto"), "cancelar");
    expect((await ok<any>(await pub.manage(token), "depois de cancelar")).status).toBe("CANCELED");
    expect(await pub.has(b.start), "cancelado libera o horário").toBe(true);
    await expectCode(await pub.cancel(token), 409, "CHANGE_NOT_ALLOWED", "cancelar de novo");
    expect((await pub.manage(`x${token.slice(1)}nao-existe`)).status(), "token inválido").toBe(404);
    const saved = await findAppointment(request, who.email, "canceled");
    expect(saved?.status, "a empresa vê o cancelamento").toBe("CANCELED");
    await pub.ctx.dispose();
  });

  test("API: antecedência mínima e janela máxima", async ({ request, playwright }) => {
    await register(request, newUser("agendawin"));
    const s = await setup(request, { minNoticeMin: 2 * 24 * 60, maxDaysAhead: 5 }, ALL_DAY);
    const pub = await anon(playwright, s);
    const before = Date.now();
    const list = await pub.slots(today(), addDays(today(), 10));
    expect(list.length, "há horários na janela").toBeGreaterThan(0);
    for (const sl of list) {
      expect(Date.parse(sl.start), `${sl.start}: respeita 2 dias de antecedência`).toBeGreaterThanOrEqual(before + 2 * 24 * 60 * MIN);
      expect(local(sl.start).ymd <= addDays(today(), 5), `${sl.start}: até 5 dias à frente`).toBe(true);
    }
    const soon = new Date(Math.ceil((Date.now() + 90 * MIN) / (30 * MIN)) * 30 * MIN).toISOString();
    await expectCode(await pub.book(soon), 409, "SLOT_TAKEN", "agendar em cima da hora pela API");
    const far = new Date(Date.parse(addDays(today(), 8) + "T13:00:00Z")).toISOString();
    await expectCode(await pub.book(far), 409, "SLOT_TAKEN", "agendar além da janela pela API");
    await pub.ctx.dispose();
  });

  test("API: aprovação manual — pedido pendente segura o horário e a empresa aprova ou recusa", async ({ request, playwright }) => {
    await register(request, newUser("agendaapprove"));
    await ensureFeature(request, "agenda_team");
    const s = await setup(request, { requiresApproval: true });
    const pub = await anon(playwright, s);
    const [a, b] = await pub.slots();

    const who = pub.client("caio");
    const { body, token } = await booked(await pub.book(a.start, who), "pedido");
    expect(body.status, "exige aprovação").toBe("PENDING");
    expect(JSON.stringify(body.location ?? ""), "pendente não recebe link de videochamada").not.toMatch(/meet\.|jit\.si/);
    expect(await pub.has(a.start), "pendente segura o horário").toBe(false);

    const pending = await findAppointment(request, who.email, "pending");
    expect(pending, "aparece em aguardando aprovação").toBeTruthy();
    await ok(await call(request, "POST", `/v1/agenda/appointments/${pending.id}/confirm`), "aprovar");
    expect((await ok<any>(await call(request, "GET", `/v1/agenda/appointments/${pending.id}`), "detalhe")).status).toBe("CONFIRMED");
    expect((await ok<any>(await pub.manage(token), "cliente vê")).status).toBe("CONFIRMED");

    const other = pub.client("davi");
    await booked(await pub.book(b.start, other), "segundo pedido");
    const p2 = await findAppointment(request, other.email, "pending");
    await ok(await call(request, "POST", `/v1/agenda/appointments/${p2.id}/decline`, { reason: "Agenda cheia" }), "recusar");
    expect((await ok<any>(await call(request, "GET", `/v1/agenda/appointments/${p2.id}`), "detalhe")).status).toBe("DECLINED");
    expect(await pub.has(b.start), "recusar libera o horário").toBe(true);
    await pub.ctx.dispose();
  });

  test("API: campo isca não grava nada", async ({ request, playwright }) => {
    await register(request, newUser("agendaspam"));
    const s = await setup(request);
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    const res = await pub.book(a.start, { _gotcha: "http://spam.example" });
    expect(res.status(), "robô recebe sucesso (não aprende)").toBeLessThan(300);
    expect(await pub.has(a.start), "horário continua livre").toBe(true);
    expect(items(await ok(await call(request, "GET", "/v1/agenda/appointments?status=upcoming"), "lista")), "nada gravado").toHaveLength(0);
    await pub.ctx.dispose();
  });

  test("API: tipo desligado deixa o link indisponível (410)", async ({ request, playwright }) => {
    await register(request, newUser("agendaoff"));
    const s = await setup(request);
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    await ok(await call(request, "PATCH", `/v1/agenda/event-types/${s.typeId}`, { active: false }), "desligar tipo");
    await expectCode(await pub.get(`/${s.page}/types/${s.type}`), 410, "AGENDA_UNAVAILABLE", "tipo desligado");
    await expectCode(await pub.book(a.start), 410, "AGENDA_UNAVAILABLE", "agendar tipo desligado");
    const page = await ok<any>(await pub.get(`/${s.page}`), "página da empresa continua no ar");
    expect((page.eventTypes ?? []).map((t: any) => t.slug), "tipo desligado sai da página").not.toContain(s.type);
    await pub.ctx.dispose();
  });

  test("API: outra empresa não vê nem mexe na agenda (404)", async ({ browser, request, playwright }) => {
    const owner = newUser("agendaiso");
    await register(request, owner);
    const s = await setup(request);
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    const who = pub.client("eva");
    await booked(await pub.book(a.start, who), "agendar");
    const appt = await findAppointment(request, who.email);

    const other = await newContext(browser);
    await register(other.request, newUser("agendaother"));
    const r = other.request;
    expect((await call(r, "GET", `/v1/agenda/appointments/${appt.id}`)).status(), "agendamento de outra empresa").toBe(404);
    expect((await call(r, "POST", `/v1/agenda/appointments/${appt.id}/cancel`, {})).status(), "cancelar agendamento de outra empresa").toBe(404);
    expect((await call(r, "GET", `/v1/agenda/event-types/${s.typeId}`)).status(), "tipo de outra empresa").toBe(404);
    expect((await call(r, "PATCH", `/v1/agenda/schedules/${s.scheduleId}`, { weekly: ALL_DAY })).status(), "agenda de outra empresa").toBe(404);
    const otherList = items<any>(await ok(await call(r, "GET", "/v1/agenda/appointments?status=upcoming"), "lista da outra empresa"));
    expect(otherList.find((x) => x.id === appt.id), "não aparece na lista da outra empresa").toBeUndefined();

    const pageText = await (await pub.get(`/${s.page}`)).text();
    expect(pageText, "página pública não expõe o e-mail da equipe").not.toContain(owner.email);
    expect(pageText, "página pública não expõe clientes").not.toContain(who.email);
    const slotsText = JSON.stringify(await pub.days());
    expect(slotsText, "horários não expõem clientes").not.toContain(who.email);
    await Promise.all([other.close(), pub.ctx.dispose()]);
  });

  test("API: qualquer um da equipe — agendamentos distribuídos em rodízio", async ({ browser, request, playwright }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request;
    await ensureFeature(o, "agenda_team");
    const memberId = (await me(m)).user.id, ownerId = (await me(o)).user.id;
    const ms = items<any>(await ok(await call(m, "GET", "/v1/agenda/schedules"), "agenda do membro (nasce sozinha)"));
    expect(ms.length, "membro ganha a agenda padrão").toBeGreaterThan(0);
    await ok(await call(m, "PATCH", `/v1/agenda/schedules/${ms[0].id}`, { timeZone: TZ, weekly: WEEKDAYS_9_12 }), "disponibilidade do membro");
    const s = await setup(o, { assignment: "any", hostIds: [ownerId, memberId] });
    const pub = await anon(playwright, s);
    const list = await pub.slots();
    for (const sl of list.slice(0, 4)) await booked(await pub.book(sl.start), "agendar no rodízio");
    const appts = items<any>(await ok(await call(o, "GET", "/v1/agenda/appointments?status=upcoming"), "agendamentos"));
    const hostIds = appts.map((a) => a.hosts?.[0]?.id);
    expect(hostIds.filter((x) => x === ownerId), `rodízio equilibrado (${hostIds.join(", ")})`).toHaveLength(2);
    expect(hostIds.filter((x) => x === memberId)).toHaveLength(2);
    const slotsText = JSON.stringify(await pub.days());
    expect(slotsText, "página pública não diz quem atende no rodízio").not.toContain(memberId);
    await Promise.all([pub.ctx.dispose(), ownerCtx.close(), memberCtx.close()]);
  });

  test("API: turma — vagas por horário e a última vaga fecha o horário", async ({ request, playwright }) => {
    await register(request, newUser("agendaturma"));
    await ensureFeature(request, "agenda_team");
    const s = await setup(request, { capacity: 3 });
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    expect(a.seatsLeft, "turma começa com 3 vagas").toBe(3);
    await booked(await pub.book(a.start), "vaga 1");
    expect((await pub.slots()).find((x) => iso(x.start) === iso(a.start))?.seatsLeft, "sobram 2").toBe(2);
    await booked(await pub.book(a.start), "vaga 2");
    await booked(await pub.book(a.start), "vaga 3");
    await expectCode(await pub.book(a.start), 409, "SLOT_TAKEN", "quarta pessoa na turma de 3");
    expect(await pub.has(a.start), "turma cheia sai da página").toBe(false);
    await pub.ctx.dispose();
  });

  test("API: encaixe interno — fora da disponibilidade só com confirmação e nunca sobreposto", async ({ request, playwright }) => {
    await register(request, newUser("agendaencaixe"));
    const s = await setup(request);
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    await booked(await pub.book(a.start), "agendamento público");
    let sat = addDays(today(), 1);
    while (new Date(sat + "T12:00:00Z").getUTCDay() !== 6) sat = addDays(sat, 1);
    const satStart = new Date(Date.parse(sat + "T13:00:00Z")).toISOString(); // 10:00 em São Paulo
    const client = { name: `Encaixe ${uniq()}`, email: `encaixe.${uniq()}@example.com` };
    await expectCode(await call(request, "POST", "/v1/agenda/appointments", { eventTypeId: s.typeId, start: satStart, client }), 409, "OUTSIDE_AVAILABILITY", "encaixe no sábado sem confirmar");
    const ok1 = await ok<any>(await call(request, "POST", "/v1/agenda/appointments", { eventTypeId: s.typeId, start: satStart, client, outsideAvailability: true }), "encaixe confirmado");
    expect(ok1.status, "encaixe nasce confirmado").toBe("CONFIRMED");
    await expectCode(await call(request, "POST", "/v1/agenda/appointments", { eventTypeId: s.typeId, start: a.start, client, outsideAvailability: true }), 409, "SLOT_TAKEN", "encaixe em cima de outro agendamento");
    await pub.ctx.dispose();
  });

  // ------------------------------------------------------------------ telas
  test("página pública: escolher dia e horário, preencher e confirmar; a empresa vê na lista", async ({ page, browser }) => {
    test.slow();
    await signUp(page, "agendaui");
    const s = await setup(page.context().request);
    const visitor = await newContext(browser);
    const pub = await visitor.newPage();
    await pub.goto(`/agendar/${s.page}/${s.type}`);
    await expect(pub.getByTestId("agenda-public-page")).toBeVisible();
    await expect(pub.getByTestId("agenda-public-calendar")).toBeVisible();

    const days = pub.getByTestId("agenda-public-day");
    await expect(days.first()).toBeVisible();
    for (const d of await days.all()) {
      const date = await d.getAttribute("data-date");
      if (!date) continue;
      const dow = new Date(date + "T12:00:00Z").getUTCDay();
      if (dow === 0 || dow === 6) await expect(d, `${date} (fim de semana) desabilitado`).toBeDisabled();
    }

    const slot = pub.getByTestId("agenda-public-slot").first();
    if (!(await slot.isVisible().catch(() => false))) await pub.locator('[data-testid="agenda-public-day"]:not([disabled])').first().click();
    await expect(slot, "horários do dia").toBeVisible();
    const start = await slot.getAttribute("data-start");
    expect(start, "horário com data-start").toBeTruthy();
    expect(MORNING, "horário mostrado está na disponibilidade").toContain(local(start!).hm);
    await slot.click();

    await expect(pub.getByTestId("agenda-public-form")).toBeVisible();
    const name = `Fábio ${uniq()}`;
    const email = `fabio.${uniq()}@example.com`;
    await pub.getByLabel("Nome", { exact: true }).fill(name);
    await pub.getByLabel("E-mail", { exact: true }).fill(email);
    await humanPause(pub);
    await pub.getByTestId("agenda-public-confirm").click();
    await expect(pub.getByTestId("agenda-public-confirmed"), "tela de confirmado").toBeVisible();
    await visitor.close();

    const saved = await findAppointment(page.context().request, email);
    expect(saved, "agendamento gravado").toBeTruthy();
    expect(iso(saved.start), "no horário escolhido").toBe(iso(start!));
    await page.goto("/agenda/agendamentos");
    await expect(page.getByTestId("agenda-appointment-row").filter({ hasText: name }), "linha na lista de agendamentos").toBeVisible();
  });

  test("agenda interna: o compromisso aparece no calendário e abre o painel", async ({ page, playwright }) => {
    await signUp(page, "agendacal");
    const req = page.context().request;
    const s = await setup(req);
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    const who = pub.client("gil");
    await booked(await pub.book(a.start, who), "agendar");
    const appt = await findAppointment(req, who.email);
    await pub.ctx.dispose();

    await page.goto(`/agenda?visao=semana&data=${local(a.start).ymd}`);
    await expect(page.getByTestId("agenda-calendar")).toBeVisible();
    const ev = page.locator(`[data-testid="agenda-event"][data-appointment-id="${appt.id}"]`);
    await expect(ev, "compromisso no calendário").toBeVisible();
    await ev.click();
    await expect(page.getByTestId("agenda-appointment-panel"), "painel do agendamento").toBeVisible();
    await expect(page.getByTestId("agenda-appointment-panel")).toContainText(who.name);
  });

  test("painel: aprovar pedido pendente e cancelar pela tela", async ({ page, playwright }) => {
    await signUp(page, "agendapanel");
    const req = page.context().request;
    await ensureFeature(req, "agenda_team");
    const s = await setup(req, { requiresApproval: true });
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    const who = pub.client("hugo");
    await booked(await pub.book(a.start, who), "pedido");
    const appt = await findAppointment(req, who.email, "pending");
    await pub.ctx.dispose();
    const status = async () => (await ok<any>(await call(req, "GET", `/v1/agenda/appointments/${appt.id}`), "detalhe")).status;

    await page.goto(`/agenda/agendamentos?a=${appt.id}`);
    const panel = page.getByTestId("agenda-appointment-panel");
    await expect(panel).toBeVisible();
    await panel.getByTestId("agenda-confirm").click();
    await expect.poll(status, { message: "aprovado pela tela", timeout: 15_000 }).toBe("CONFIRMED");

    await page.reload();
    await expect(panel).toBeVisible();
    await panel.getByTestId("agenda-cancel").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect.poll(status, { message: "cancelado pela tela", timeout: 15_000 }).toBe("CANCELED");
  });

  test("gerenciar pelo link: o cliente cancela pela tela", async ({ page, browser, playwright }) => {
    await signUp(page, "agendamui");
    const s = await setup(page.context().request);
    const pub = await anon(playwright, s);
    const [a] = await pub.slots();
    const { token } = await booked(await pub.book(a.start), "agendar");

    const visitor = await newContext(browser);
    const vp = await visitor.newPage();
    await vp.goto(`/agendamento/${token}`);
    await expect(vp.getByTestId("agenda-manage")).toBeVisible();
    await vp.getByTestId("agenda-manage-cancel").click();
    await vp.getByTestId("agenda-manage-cancel-confirm").click();
    await expect(vp.getByTestId("agenda-manage-canceled"), "tela de cancelado").toBeVisible();
    await visitor.close();

    expect((await ok<any>(await pub.manage(token), "status")).status).toBe("CANCELED");
    expect(await pub.has(a.start), "horário liberado").toBe(true);
    await pub.ctx.dispose();
  });

  test("link de tipo desligado mostra a tela de indisponível", async ({ page, browser }) => {
    await signUp(page, "agendaoffui");
    const req = page.context().request;
    const s = await setup(req);
    await ok(await call(req, "PATCH", `/v1/agenda/event-types/${s.typeId}`, { active: false }), "desligar tipo");
    const visitor = await newContext(browser);
    const vp = await visitor.newPage();
    await vp.goto(`/agendar/${s.page}/${s.type}`);
    await expect(vp.getByTestId("agenda-public-unavailable")).toBeVisible();
    await expect(vp.getByTestId("agenda-public-slot"), "sem horários").toHaveCount(0);
    await visitor.close();
  });

  test("tipos e disponibilidade: criar tipo pela tela e ver a semana", async ({ page }) => {
    await signUp(page, "agendatipo", "/agenda/tipos");
    const req = page.context().request;
    await page.getByTestId("agenda-type-new").click();
    const sheet = page.getByTestId("form-sheet");
    await expect(sheet).toBeVisible();
    const name = `Avaliação ${uniq()}`;
    await sheet.getByTestId("field-name").fill(name);
    await sheet.getByTestId("form-submit").click();

    const row = page.getByTestId("agenda-type-row").filter({ hasText: name });
    await expect(row, "cartão do tipo novo").toBeVisible();
    const link = row.getByTestId("agenda-type-link");
    const linkText = `${(await link.getAttribute("href")) ?? ""} ${(await link.textContent()) ?? ""} ${(await link.getAttribute("data-url")) ?? ""}`;
    expect(linkText, "link público do tipo").toContain("/agendar/");

    const types = items<any>(await ok(await call(req, "GET", "/v1/agenda/event-types"), "tipos"));
    const saved = types.find((t) => t.name === name);
    expect(saved, "tipo gravado com o nome digitado").toBeTruthy();
    expect(saved.durations, "duração padrão").toEqual([30]);

    await page.goto("/agenda/disponibilidade");
    const daysRows = page.getByTestId("agenda-schedule-day");
    await expect(daysRows, "uma linha por dia da semana").toHaveCount(7);
    const dows = (await Promise.all((await daysRows.all()).map((d) => d.getAttribute("data-dow")))).sort();
    expect(dows).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  });
});
