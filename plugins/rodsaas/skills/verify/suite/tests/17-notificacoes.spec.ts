import { test, expect, type APIRequestContext, type APIResponse, type Browser, type BrowserContext } from "@playwright/test";
import { call, items, newUser, ok, register, sleep } from "../support/api";
import { cfg } from "../support/config.mjs";
import { emailHeaders, linkFrom, pathOf, waitForEmail } from "../support/mailpit";
import { newContext, ownerWithMember } from "../support/ui";

// Parte do add-on notificacoes (/rodsaas:notificacoes). Roda quando rodsaas.json tem "notificacoes" em addons
// ou a API tem /v1/notification-types. Usa só os avisos da própria base (convite aceito, papel alterado),
// então funciona com ou sem os outros presets.

async function installed(req: APIRequestContext) {
  if (cfg.addons.includes("notificacoes")) return true;
  return (await call(req, "GET", "/v1/notification-types")).status() !== 404;
}

async function expectCode(res: APIResponse, status: number, code: string, label: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  expect(JSON.parse(body || "{}").code, `${label}: code`).toBe(code);
}

const list = async (req: APIRequestContext, q = "") => items<any>(await ok(await call(req, "GET", `/v1/notifications${q}`), `notificações${q}`));
const unreadCount = async (req: APIRequestContext) => (await ok<any>(await call(req, "GET", "/v1/notifications/unread-count"), "contador do sino")).count as number;
const prefs = async (req: APIRequestContext) => ok<any>(await call(req, "GET", "/v1/notification-preferences"), "preferências");
const prefOf = (p: any, type: string) => (p.groups ?? []).flatMap((g: any) => g.types ?? []).find((t: any) => t.type === type);
const ofType = (l: any[], type: string) => l.filter((n) => n.type === type);

async function memberIdOf(ownerReq: APIRequestContext, email: string) {
  const m = items<any>(await ok(await call(ownerReq, "GET", "/v1/members"), "membros")).find((x) => x.user?.email === email);
  expect(m, `membro ${email} na lista`).toBeTruthy();
  return m.id as string;
}
const setRole = async (ownerReq: APIRequestContext, memberId: string, role: string) =>
  ok(await call(ownerReq, "PATCH", `/v1/members/${memberId}`, { role }), `mudar papel para ${role}`);

/** Convida e cadastra mais um membro na empresa do owner. */
async function addMember(browser: Browser, mailReq: APIRequestContext, ownerCtx: BrowserContext) {
  const u = newUser("member");
  await ok(await call(ownerCtx.request, "POST", "/v1/invitations", { email: u.email, role: "MEMBER" }), "convite");
  const mail = await waitForEmail(mailReq, u.email, { contains: "/convite" });
  const token = new URL(linkFrom(mail, "/convite")).searchParams.get("token");
  const ctx = await newContext(browser);
  await register(ctx.request, u, { invitationToken: token });
  return { user: u, ctx };
}

/** Membro com duas notificações "seu papel mudou" (não lidas). */
async function memberWithTwoRoleChanges(browser: Browser, mailReq: APIRequestContext) {
  const t = await ownerWithMember(browser, mailReq);
  const id = await memberIdOf(t.ownerCtx.request, t.member.email);
  await setRole(t.ownerCtx.request, id, "ADMIN");
  await setRole(t.ownerCtx.request, id, "MEMBER");
  await expect.poll(async () => ofType(await list(t.memberCtx.request), "org.role_changed").length, { message: "duas mudanças de papel = duas notificações (não agrupa)" }).toBe(2);
  return { ...t, memberId: id };
}

test.describe("Notificações", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o add-on notificacoes");
  });

  test("API: convite aceito avisa o owner e não quem entrou; dois aceites viram uma notificação agrupada", async ({ browser, request }) => {
    test.slow();
    const { owner, ownerCtx, member, memberCtx } = await ownerWithMember(browser, request);
    const second = await addMember(browser, request, ownerCtx);

    await expect.poll(async () => ofType(await list(ownerCtx.request), "org.member_joined")[0]?.count ?? 0, { message: "owner recebe org.member_joined com count 2", timeout: 15_000 }).toBe(2);
    const joined = ofType(await list(ownerCtx.request), "org.member_joined");
    expect(joined, "os dois aceites viram UMA notificação (agrupada)").toHaveLength(1);
    const n = joined[0];
    expect(n.actorsCount, "dois atores distintos").toBe(2);
    expect(n.read, "não lida").toBe(false);
    expect(n.readAt ?? null).toBeNull();
    expect(typeof n.id === "string" && typeof n.appId === "string" && typeof n.createdAt === "string" && typeof n.updatedAt === "string", "formato: id, appId, createdAt, updatedAt").toBeTruthy();
    expect(String(n.url), "url relativa do painel").toMatch(/^\/[^/]/);
    expect(Array.isArray(n.segments) && n.segments.some((s: any) => s.bold === true), "frase em segments com destaque").toBeTruthy();
    expect(n.segments.map((s: any) => s.text).join(""), "text = segments juntos").toBe(n.text);
    const firstName = (u: { name: string }) => u.name;
    expect(n.text.includes(firstName(second.user)) || n.text.includes(firstName(member)), `frase cita quem entrou: "${n.text}"`).toBeTruthy();
    expect(n.actor?.name, "ator mais recente = o último a entrar").toBe(second.user.name);

    for (const [ctx, who] of [[memberCtx, "1º membro"], [second.ctx, "2º membro"]] as const) {
      expect(ofType(await list(ctx.request), "org.member_joined"), `${who} não é avisado da própria entrada`).toHaveLength(0);
    }
    const c = await ok<any>(await call(ownerCtx.request, "GET", "/v1/notifications/unread-count"), "contador");
    expect(c.count, "contador do owner").toBeGreaterThanOrEqual(1);
    expect(typeof c.byApp === "object" && c.byApp !== null, "contador com byApp").toBeTruthy();
    void owner;
    await Promise.all([ownerCtx.close(), memberCtx.close(), second.ctx.close()]);
  });

  test("API: papel alterado avisa o membro e não quem alterou; e-mail chega com descadastro de um clique", async ({ browser, request, playwright }) => {
    test.slow();
    const { ownerCtx, member, memberCtx } = await ownerWithMember(browser, request);
    const id = await memberIdOf(ownerCtx.request, member.email);
    await setRole(ownerCtx.request, id, "ADMIN");

    await expect.poll(async () => ofType(await list(memberCtx.request), "org.role_changed").length, { message: "membro recebe org.role_changed" }).toBe(1);
    expect(ofType(await list(ownerCtx.request), "org.role_changed"), "quem alterou não é avisado").toHaveLength(0);

    const mail = await waitForEmail(request, member.email, { contains: "/notificacoes/descadastrar", timeoutMs: 120_000 });
    const h = await emailHeaders(request, mail.id);
    const lu = (h["list-unsubscribe"] ?? [])[0] ?? "";
    expect(lu, "cabeçalho List-Unsubscribe").toMatch(/<https?:\/\/[^>]+>/);
    expect((h["list-unsubscribe-post"] ?? [])[0] ?? "", "cabeçalho List-Unsubscribe-Post (RFC 8058)").toBe("List-Unsubscribe=One-Click");

    const before = prefOf(await prefs(memberCtx.request), "org.role_changed");
    expect(before, "org.role_changed nas preferências").toBeTruthy();
    expect(before.effectiveEmail, "abrir/receber o e-mail não descadastra").not.toBe("OFF");

    const oneClick = lu.match(/<(https?:\/\/[^>]+)>/)![1];
    const anonCtx = await playwright.request.newContext();
    const res = await anonCtx.fetch(oneClick, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, data: "List-Unsubscribe=One-Click", failOnStatusCode: false });
    expect(res.status(), `POST de um clique sem login e sem Origin → HTTP ${res.status()}: ${(await res.text()).slice(0, 200)}`).toBeLessThan(300);
    const again = await anonCtx.fetch(oneClick, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, data: "List-Unsubscribe=One-Click", failOnStatusCode: false });
    expect(again.status(), "um clique é idempotente").toBeLessThan(300);
    await anonCtx.dispose();

    expect(prefOf(await prefs(memberCtx.request), "org.role_changed").effectiveEmail, "e-mail daquele tipo desligado").toBe("OFF");
    const still = ofType(await list(memberCtx.request), "org.role_changed");
    expect(still, "o sino continua com a notificação").toHaveLength(1);
    expect(prefOf(await prefs(memberCtx.request), "org.role_changed").inApp, "descadastro não mexe no sino").toBe(true);
    await Promise.all([ownerCtx.close(), memberCtx.close()]);
  });

  test("API: ler, não lida, todas, remover e filtro; notificação de outra pessoa ou empresa = 404", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await memberWithTwoRoleChanges(browser, request);
    const m = memberCtx.request;
    const [a, b] = ofType(await list(m), "org.role_changed");
    expect(await unreadCount(m), "contador com as duas").toBeGreaterThanOrEqual(2);
    const base = await unreadCount(m);

    const r = await ok<any>(await call(m, "POST", `/v1/notifications/${a.id}/read`), "marcar como lida");
    expect(r.readAt, "readAt preenchido").toBeTruthy();
    expect(await unreadCount(m), "contador desce").toBe(base - 1);
    const unreadOnly = await list(m, "?status=unread");
    expect(unreadOnly.some((n) => n.id === a.id), "lida fora de status=unread").toBe(false);
    expect(unreadOnly.some((n) => n.id === b.id), "não lida em status=unread").toBe(true);
    expect((await list(m, "?unread=true")).some((n) => n.id === a.id), "formato antigo unread=true também filtra").toBe(false);
    expect((await list(m, "?status=all")).find((n) => n.id === a.id)?.read, "lida aparece em Todas como lida").toBe(true);

    await ok(await call(m, "POST", `/v1/notifications/${a.id}/unread`), "voltar a não lida");
    expect(await unreadCount(m), "contador volta").toBe(base);

    // outra pessoa da mesma empresa e outra empresa
    const other = await newContext(browser);
    await register(other.request, newUser("notifother"));
    for (const [ctx, who] of [[ownerCtx, "owner (mesma empresa)"], [other, "outra empresa"]] as const) {
      expect((await call(ctx.request, "POST", `/v1/notifications/${a.id}/read`)).status(), `${who} marcando a do membro`).toBe(404);
      expect((await call(ctx.request, "POST", `/v1/notifications/${a.id}/unread`)).status(), `${who}: não lida`).toBe(404);
      expect((await call(ctx.request, "DELETE", `/v1/notifications/${a.id}`)).status(), `${who} removendo a do membro`).toBe(404);
      await ok(await call(ctx.request, "POST", "/v1/notifications/read-all", {}), `${who}: marcar todas as suas`);
    }
    expect(await unreadCount(m), "nada do membro mudou com as tentativas dos outros").toBe(base);

    const all = await ok<any>(await call(m, "POST", "/v1/notifications/read-all", {}), "marcar todas");
    expect(all.updated, "read-all devolve quantas mudou").toBeGreaterThanOrEqual(2);
    expect(await unreadCount(m), "contador zera").toBe(0);

    expect((await call(m, "DELETE", `/v1/notifications/${b.id}`)).status(), "remover").toBeLessThan(300);
    expect((await list(m, "?status=all")).some((n) => n.id === b.id), "removida some da lista").toBe(false);
    await Promise.all([ownerCtx.close(), memberCtx.close(), other.close()]);
  });

  test("API: preferências por tipo desligam o aviso; aviso obrigatório não desliga; formato antigo; catálogo", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, member, memberCtx } = await ownerWithMember(browser, request);
    const m = memberCtx.request;
    const id = await memberIdOf(ownerCtx.request, member.email);

    const types = items<any>(await ok(await call(m, "GET", "/v1/notification-types"), "catálogo"));
    expect(types.some((x) => x.type === "org.role_changed"), "catálogo tem org.role_changed").toBe(true);
    expect(types.some((x) => x.type === "org.member_joined"), "membro não vê no catálogo o aviso que só owners/admins recebem").toBe(false);
    const ownerTypes = items<any>(await ok(await call(ownerCtx.request, "GET", "/v1/notification-types"), "catálogo do owner"));
    expect(ownerTypes.some((x) => x.type === "org.member_joined"), "catálogo do owner tem org.member_joined").toBe(true);
    const expectedByPreset: Record<string, string> = { tarefas: "task.assigned", crm: "crm.deal.assigned", forms: "forms.response.new", agenda: "agenda.booked" };
    for (const [preset, type] of Object.entries(expectedByPreset)) {
      if (cfg.presets.includes(preset)) expect(types.some((x) => x.type === type), `preset ${preset} registrou os tipos dele (${type})`).toBe(true);
    }

    let p = await ok<any>(await call(m, "PUT", "/v1/notification-preferences", { types: { "org.role_changed": { inApp: false, email: "OFF" } } }), "desligar o tipo");
    expect(prefOf(p, "org.role_changed")?.inApp, "PUT devolve o tipo desligado no app").toBe(false);
    expect(p.disabledTypes ?? [], "disabledTypes (formato antigo) inclui o tipo").toContain("org.role_changed");
    await setRole(ownerCtx.request, id, "ADMIN");
    await sleep(2000);
    expect(ofType(await list(m), "org.role_changed"), "tipo desligado não gera notificação").toHaveLength(0);

    await expectCode(await call(m, "PUT", "/v1/notification-preferences", { emailMode: "SEMPRE" }), 400, "VALIDATION_ERROR", "emailMode inválido");
    await expectCode(await call(m, "PUT", "/v1/notification-preferences", { types: { "nao.existe": { inApp: false } } }), 400, "VALIDATION_ERROR", "tipo desconhecido");
    await expectCode(await call(m, "PUT", "/v1/notification-preferences", { types: { "billing.payment_failed": { inApp: false } } }), 400, "VALIDATION_ERROR", "aviso obrigatório não desliga");

    p = await ok<any>(await call(m, "PUT", "/v1/notification-preferences", { emailMode: "IMMEDIATE", disabledTypes: [] }), "formato antigo religa");
    expect(prefOf(p, "org.role_changed")?.inApp, "religado no app").toBe(true);
    await setRole(ownerCtx.request, id, "MEMBER");
    await expect.poll(async () => ofType(await list(m), "org.role_changed").length, { message: "religado volta a notificar" }).toBe(1);

    p = await ok<any>(await call(m, "PUT", "/v1/notification-preferences", { emailMode: "DAILY", digestHour: 7 }), "resumo diário às 7 h");
    expect([p.emailMode, p.digestHour], "emailMode e digestHour salvos").toEqual(["DAILY", 7]);
    expect(prefOf(p, "org.role_changed")?.effectiveEmail, "e-mail efetivo do tipo segue a geral").toBe("DAILY");
    await Promise.all([ownerCtx.close(), memberCtx.close()]);
  });

  test("Descadastro: a página pública mostra o tipo, só descadastra no botão, desfaz; token adulterado é recusado", async ({ browser, request, playwright }) => {
    test.slow();
    const { ownerCtx, member, memberCtx } = await ownerWithMember(browser, request);
    await setRole(ownerCtx.request, await memberIdOf(ownerCtx.request, member.email), "ADMIN");
    const mail = await waitForEmail(request, member.email, { contains: "/notificacoes/descadastrar", timeoutMs: 120_000 });
    const link = linkFrom(mail, "/notificacoes/descadastrar");
    const token = new URL(link).searchParams.get("token") ?? "";
    expect(token, "token no link").toBeTruthy();

    const guest = await newContext(browser);
    const gp = await guest.newPage();
    await gp.goto(pathOf(link));
    await expect(gp.getByTestId("unsubscribe-page")).toBeVisible();
    await expect(gp.getByTestId("unsubscribe-description"), "diz o que vai parar").not.toBeEmpty();
    await sleep(1000);
    expect(prefOf(await prefs(memberCtx.request), "org.role_changed").effectiveEmail, "abrir a página NÃO descadastra").not.toBe("OFF");

    await gp.getByTestId("unsubscribe-confirm").click();
    await expect(gp.getByTestId("unsubscribe-done")).toBeVisible();
    await expect.poll(async () => prefOf(await prefs(memberCtx.request), "org.role_changed").effectiveEmail, { message: "botão descadastra" }).toBe("OFF");

    await gp.getByTestId("unsubscribe-undo").click();
    await expect.poll(async () => prefOf(await prefs(memberCtx.request), "org.role_changed").effectiveEmail, { message: "desfazer volta o e-mail" }).not.toBe("OFF");

    const anonCtx = await playwright.request.newContext();
    const bad = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    const r = await anonCtx.fetch(`${cfg.apiURL}/v1/public/notifications/unsubscribe?token=${encodeURIComponent(bad)}`, { failOnStatusCode: false });
    await expectCode(r, 400, "INVALID_UNSUBSCRIBE_TOKEN", "token adulterado");
    const rp = await anonCtx.fetch(`${cfg.apiURL}/v1/public/notifications/unsubscribe?token=${encodeURIComponent(bad)}`, { method: "POST", failOnStatusCode: false });
    await expectCode(rp, 400, "INVALID_UNSUBSCRIBE_TOKEN", "POST com token adulterado");
    await anonCtx.dispose();
    await gp.goto(`/notificacoes/descadastrar?token=${encodeURIComponent(bad)}`);
    await expect(gp.getByTestId("unsubscribe-invalid"), "página com link inválido").toBeVisible();
    await Promise.all([ownerCtx.close(), memberCtx.close(), guest.close()]);
  });

  test("Tela: sino com contador, painel com Não lidas, abrir marca como lida e marcar todas zera", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await memberWithTwoRoleChanges(browser, request);
    const total = await unreadCount(memberCtx.request);
    const page = await memberCtx.newPage();
    await page.goto("/inicio");
    const bell = page.getByTestId("notifications-bell");
    await expect(bell).toBeVisible();
    await expect(page.getByTestId("notifications-badge"), "contador no sino").toHaveText(String(total));

    await bell.click();
    const panel = page.getByTestId("notifications-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("notifications-tab-unread"), "abre em Não lidas").toHaveAttribute("aria-selected", "true");
    const rows = panel.locator('[data-testid="notification-item"][data-type="org.role_changed"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first(), "não lida marcada").toHaveAttribute("data-unread", "true");
    await expect(panel.locator('[data-testid="notifications-group"][data-bucket="today"]'), "grupo Hoje").toBeVisible();
    await expect(rows.first().getByTestId("notification-text")).not.toBeEmpty();
    await expect(rows.first().getByTestId("notification-time")).not.toBeEmpty();

    const url = (await ofType(await list(memberCtx.request), "org.role_changed"))[0].url as string;
    await rows.first().getByTestId("notification-text").click();
    await expect(page, "abrir leva para a url da notificação").toHaveURL(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split("?")[0] + "($|[?#])"));
    await expect(page.getByTestId("notifications-badge"), "abrir marca como lida").toHaveText(String(total - 1));
    await expect.poll(() => unreadCount(memberCtx.request), { message: "lida no servidor" }).toBe(total - 1);

    await page.getByTestId("notifications-bell").click();
    await page.getByTestId("notifications-tab-all").click();
    await expect(page.getByTestId("notifications-panel").locator('[data-testid="notification-item"][data-unread="false"]').first(), "Todas mostra a lida").toBeVisible();
    await page.getByTestId("notifications-mark-all").click();
    await expect(page.getByTestId("notifications-badge"), "contador some com zero").toHaveCount(0);
    await expect.poll(() => unreadCount(memberCtx.request), { message: "todas lidas no servidor" }).toBe(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/inicio");
    await expect(page.getByTestId("notifications-bell"), "sino no celular (um só)").toHaveCount(1);
    await expect(page.getByTestId("notifications-bell")).toBeVisible();
    await Promise.all([ownerCtx.close(), memberCtx.close()]);
  });

  test("Tela: /notificacoes filtra por status e app; preferências salvam por tipo; aviso obrigatório travado e só para o owner", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await memberWithTwoRoleChanges(browser, request);
    const [first] = ofType(await list(memberCtx.request), "org.role_changed");
    await ok(await call(memberCtx.request, "POST", `/v1/notifications/${first.id}/read`), "ler uma");
    const page = await memberCtx.newPage();

    await page.goto("/notificacoes");
    const pg = page.getByTestId("notifications-page");
    await expect(pg).toBeVisible();
    const rows = pg.locator('[data-testid="notification-item"][data-type="org.role_changed"]');
    await page.getByTestId("notifications-filter-unread").click();
    await expect(rows, "Não lidas: só a não lida").toHaveCount(1);
    await page.getByTestId("notifications-filter-all").click();
    await expect(rows, "Todas: as duas").toHaveCount(2);

    await page.getByTestId("notifications-filter-app").click();
    const options = page.getByTestId("notifications-filter-app-option");
    await expect(options.first()).toBeVisible();
    const values = await options.evaluateAll((els) => els.map((e) => e.getAttribute("data-value") ?? ""));
    expect(values, "filtro de app tem Geral").toContain("geral");
    const otherApp = values.find((v) => v && v !== "geral" && v !== "all" && v !== "");
    if (otherApp) {
      await page.locator(`[data-testid="notifications-filter-app-option"][data-value="${otherApp}"]`).click();
      await expect(pg.getByTestId("notifications-empty"), `app ${otherApp} sem notificações`).toBeVisible();
      await page.getByTestId("notifications-filter-app").click();
    }
    await page.locator('[data-testid="notifications-filter-app-option"][data-value="geral"]').click();
    await expect(rows, "Geral: as duas").toHaveCount(2);

    await page.goto("/configuracoes/notificacoes");
    await expect(page.getByTestId("notification-prefs")).toBeVisible();
    const row = page.locator('[data-testid="notification-pref-row"][data-type="org.role_changed"]');
    await expect(row).toBeVisible();
    await row.getByTestId("notification-pref-inapp").click();
    await expect(row.getByTestId("notification-pref-inapp")).toHaveAttribute("aria-checked", "false");
    await expect.poll(async () => prefOf(await prefs(memberCtx.request), "org.role_changed").inApp, { message: "No app desligado salvo" }).toBe(false);

    await row.getByTestId("notification-pref-email").click();
    await page.locator('[data-testid="notification-pref-email-option"][data-value="OFF"]').click();
    await expect.poll(async () => prefOf(await prefs(memberCtx.request), "org.role_changed").effectiveEmail, { message: "e-mail do tipo desligado salvo" }).toBe("OFF");

    await page.getByTestId("notification-prefs-email-mode-DAILY").click();
    await expect(page.getByTestId("notification-prefs-email-mode-DAILY")).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await prefs(memberCtx.request)).emailMode, { message: "e-mail geral salvo" }).toBe("DAILY");

    await expect(page.locator('[data-testid="notification-pref-row"][data-type="billing.payment_failed"]'), "membro não vê aviso que só o owner recebe").toHaveCount(0);

    const op = await ownerCtx.newPage();
    await op.goto("/configuracoes/notificacoes");
    const critical = op.locator('[data-testid="notification-pref-row"][data-type="billing.payment_failed"]');
    await expect(critical, "owner vê o aviso obrigatório").toBeVisible();
    await expect(critical.getByTestId("notification-pref-inapp"), "aviso obrigatório travado").toBeDisabled();
    await Promise.all([ownerCtx.close(), memberCtx.close()]);
  });
});
