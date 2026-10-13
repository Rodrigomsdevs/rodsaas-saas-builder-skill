import { test, expect, type APIRequestContext, type APIResponse, type Locator, type Page } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext, ownerWithMember, signUp } from "../support/ui";

// Parte do Tarefas (preset /rodsaas:tarefas). Roda quando rodsaas.json tem "tarefas" em presets ou a API tem /v1/task-projects.

async function tasksInstalled(req: APIRequestContext) {
  if (cfg.presets.includes("tarefas")) return true;
  return (await call(req, "GET", "/v1/task-projects")).status() !== 404;
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

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const plusDays = (ymd: string, n: number) => new Date(Date.parse(ymd + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const letters = (n: number) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
const ymd = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : v);

type Project = { id: string; key: string; name: string; statuses: { id: string; name: string; category: string }[] };

async function createProject(req: APIRequestContext, extra: Record<string, unknown> = {}): Promise<Project> {
  const key = "Q" + letters(3);
  const p = await ok<any>(await call(req, "POST", "/v1/task-projects", { name: `Projeto ${uniq()}`, key, ...extra }), "criar projeto");
  expect(p.key, "chave do projeto").toBe(key);
  const full = await ok<any>(await call(req, "GET", `/v1/task-projects/${p.id}`), "detalhe do projeto");
  expect((full.statuses ?? []).length, "projeto nasce com o fluxo padrão").toBeGreaterThanOrEqual(4);
  return full;
}
const statusOf = (p: Project, category: string) => {
  const s = p.statuses.find((x) => x.category === category);
  expect(s, `status da categoria ${category}`).toBeTruthy();
  return s!;
};
const createTask = async (req: APIRequestContext, body: Record<string, unknown>) => ok<any>(await call(req, "POST", "/v1/tasks", body), `criar tarefa "${body.title}"`);
const getTask = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/tasks/${id}`), "detalhe da tarefa");

/** Arrasta com o mouse (funciona com dnd-kit e com arrastar nativo). */
async function dragTo(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const a = (await source.boundingBox())!, b = (await target.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 80), { steps: 20 });
  await page.mouse.up();
}

test.describe("Tarefas", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await tasksInstalled(request)), "projeto sem o preset tarefas");
  });

  // ------------------------------------------------------------------ API
  test("API: projeto com fluxo padrão, projeto inicial e código sequencial", async ({ request }) => {
    await register(request, newUser("tasks"));
    const list = items<any>(await ok(await call(request, "GET", "/v1/task-projects"), "projetos"));
    expect(list.map((p) => p.key), "empresa nova ganha o projeto 'Primeiros passos' (PP)").toContain("PP");

    const p = await createProject(request);
    for (const cat of ["TODO", "IN_PROGRESS", "DONE"]) statusOf(p, cat);
    const created = await Promise.all(Array.from({ length: 5 }, (_, i) => createTask(request, { projectId: p.id, title: `Simultânea ${i} ${uniq()}` })));
    const numbers = created.map((t) => t.number).sort((a, b) => a - b);
    expect(numbers, "5 criações simultâneas → 1..5 sem repetir nem pular").toEqual([1, 2, 3, 4, 5]);
    for (const t of created) expect(t.key).toBe(`${p.key}-${t.number}`);
    expect(created[0].status?.category, "sem status → primeiro TODO").toBe("TODO");

    const byKey = await ok<any>(await call(request, "GET", `/v1/tasks/by-key/${p.key}-3`), "abrir pelo código");
    expect(byKey.number).toBe(3);
    expect(byKey.project?.key).toBe(p.key);
  });

  test("API: quadro por status; mover para concluído preenche e limpa a data de conclusão", async ({ request }) => {
    await register(request, newUser("tasksboard"));
    const p = await createProject(request);
    const t = await createTask(request, { projectId: p.id, title: `Card ${uniq()}`, priority: "HIGH", dueDate: today() });
    const board = await ok<any>(await call(request, "GET", `/v1/task-projects/${p.id}/board`), "quadro");
    expect((board.columns ?? []).map((c: any) => c.status.id), "uma coluna por status, na ordem do fluxo").toEqual(p.statuses.map((s) => s.id));
    const todoCol = board.columns.find((c: any) => c.status.category === "TODO");
    const card = todoCol.tasks.find((x: any) => x.id === t.id);
    expect(card, "card na coluna A fazer").toBeTruthy();
    expect(card.key).toBe(t.key);
    expect(card.priority).toBe("HIGH");

    const done = statusOf(p, "DONE");
    await ok(await call(request, "POST", `/v1/tasks/${t.id}/move`, { statusId: done.id }), "mover para Feito");
    const d1 = await getTask(request, t.id);
    expect(d1.status?.category).toBe("DONE");
    expect(d1.completedAt, "concluída ganha completedAt").toBeTruthy();
    await ok(await call(request, "POST", `/v1/tasks/${t.id}/move`, { statusId: statusOf(p, "TODO").id }), "voltar para A fazer");
    expect((await getTask(request, t.id)).completedAt ?? null, "reaberta limpa completedAt").toBeNull();
  });

  test("API: subtarefas, checklist e vínculos aparecem no detalhe da tarefa", async ({ request }) => {
    await register(request, newUser("taskssub"));
    const p = await createProject(request);
    const a = await createTask(request, { projectId: p.id, title: `Pai ${uniq()}` });
    const b = await createTask(request, { projectId: p.id, title: `Outra ${uniq()}` });

    const sub = await ok<any>(await call(request, "POST", `/v1/tasks/${a.id}/subtasks`, { title: "Subtarefa 1" }), "criar subtarefa");
    expect(sub.parent?.id ?? sub.parentId, "subtarefa ligada ao pai").toBe(a.id);
    expect((await call(request, "POST", `/v1/tasks/${sub.id}/subtasks`, { title: "Neta" })).status(), "subtarefa de subtarefa (1 nível só)").toBe(400);

    const i1 = await ok<any>(await call(request, "POST", `/v1/tasks/${a.id}/checklist`, { text: "Revisar texto" }), "item 1");
    await ok(await call(request, "POST", `/v1/tasks/${a.id}/checklist`, { text: "Aprovar" }), "item 2");
    await ok(await call(request, "PATCH", `/v1/tasks/${a.id}/checklist/${i1.id}`, { done: true }), "marcar item 1");
    await ok(await call(request, "POST", `/v1/tasks/${a.id}/links`, { toTaskId: b.id, type: "blocks" }), "vínculo: bloqueia");

    const da = await getTask(request, a.id);
    expect((da.subtaskList ?? []).map((x: any) => x.id), "subtarefas no detalhe").toEqual([sub.id]);
    expect(da.subtasks, "contagem de subtarefas").toEqual({ done: 0, total: 1 });
    expect((da.checklist ?? []).map((x: any) => [x.text, x.done]), "checklist no detalhe").toEqual([["Revisar texto", true], ["Aprovar", false]]);
    expect((da.links ?? []).find((l: any) => l.task?.id === b.id)?.type, "vínculo do lado de quem bloqueia").toBe("blocks");
    const db = await getTask(request, b.id);
    expect((db.links ?? []).find((l: any) => l.task?.id === a.id)?.type, "vínculo invertido do outro lado").toBe("blocked_by");
    expect(db.blocked, "tarefa bloqueada por outra aberta").toBe(true);
  });

  test("API: descrição com versão — editar com versão velha não sobrescreve (409)", async ({ request }) => {
    await register(request, newUser("tasksdesc"));
    const p = await createProject(request);
    const t = await createTask(request, { projectId: p.id, title: `Doc ${uniq()}` });
    const v = (await getTask(request, t.id)).descriptionVersion;
    expect(Number.isInteger(v), "descriptionVersion no detalhe").toBe(true);
    await ok(await call(request, "PATCH", `/v1/tasks/${t.id}/description`, { version: v, content: [] }), "salvar descrição");
    const conflict = await expectCode(await call(request, "PATCH", `/v1/tasks/${t.id}/description`, { version: v, content: [] }), 409, "VERSION_CONFLICT", "salvar com a versão velha");
    expect(conflict.currentVersion, "conflito informa a versão atual").toBe(v + 1);
  });

  test("API: comentário com menção notifica o mencionado e não o autor", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request;
    const memberId = (await me(m)).user.id;
    const p = await createProject(o);
    const t = await createTask(o, { projectId: p.id, title: `Revisar contrato ${uniq()}` });
    const text = `Pode olhar isto? ${uniq()}`;
    await ok(await call(o, "POST", `/v1/tasks/${t.id}/comments`, { body: text, mentions: [memberId] }), "comentar mencionando o membro");

    const tl = items<any>(await ok(await call(o, "GET", `/v1/tasks/${t.id}/timeline?filter=comments`), "histórico"));
    expect(tl.some((x) => x.kind === "comment" && String(x.bodyText ?? "").includes(text)), "comentário no histórico").toBe(true);
    await expect.poll(async () => items<any>(await ok(await call(m, "GET", "/v1/notifications"), "notificações do membro")).some((n) => n.type === "task.mentioned"), { message: "mencionado recebe task.mentioned", timeout: 15_000 }).toBe(true);
    const mine = items<any>(await ok(await call(o, "GET", "/v1/notifications"), "notificações do autor"));
    expect(mine.filter((n) => n.type === "task.mentioned" || n.type === "task.commented"), "quem fez a ação não é notificado").toHaveLength(0);
    expect((await getTask(o, t.id)).isWatching, "quem comenta passa a seguir").toBe(true);
    await Promise.all([ownerCtx.close(), memberCtx.close()]);
  });

  test("API: cronômetro — um por pessoa, iniciar outro para o atual e parar lança as horas", async ({ request }) => {
    await register(request, newUser("taskstimer"));
    const p = await createProject(request);
    const a = await createTask(request, { projectId: p.id, title: `A ${uniq()}` });
    const b = await createTask(request, { projectId: p.id, title: `B ${uniq()}` });
    await ok(await call(request, "POST", `/v1/tasks/${a.id}/timer/start`), "iniciar em A");
    const first = await ok<any>(await call(request, "GET", "/v1/timer"), "cronômetro");
    expect(first?.taskId ?? first?.task?.id, "cronômetro em A").toBe(a.id);
    await ok(await call(request, "POST", `/v1/tasks/${b.id}/timer/start`), "iniciar em B para o de A");
    const running = await ok<any>(await call(request, "GET", "/v1/timer"), "cronômetro");
    expect(running?.taskId ?? running?.task?.id, "um cronômetro por pessoa: agora em B").toBe(b.id);
    const stop = await ok<any>(await call(request, "POST", "/v1/timer/stop", { minutesOverride: 25 }), "parar");
    expect(stop.entry?.minutes).toBe(25);
    expect(await ok<any>(await call(request, "GET", "/v1/timer"), "sem cronômetro"), "nada rodando depois de parar").toBeFalsy();
    await expectCode(await call(request, "POST", "/v1/timer/stop", {}), 409, "TIMER_ALREADY_STOPPED", "parar de novo");

    await ok(await call(request, "POST", `/v1/tasks/${b.id}/time-entries`, { minutes: 90, date: today(), note: "reunião" }), "lançamento manual");
    const entries = await ok<any>(await call(request, "GET", `/v1/tasks/${b.id}/time-entries`), "horas da tarefa");
    expect(entries.totalMinutes, "25 + 90").toBe(115);
    expect((await getTask(request, b.id)).timeSpentMinutes).toBe(115);
    const ea = await ok<any>(await call(request, "GET", `/v1/tasks/${a.id}/time-entries`), "horas de A");
    expect(ea.totalMinutes, "trocar de tarefa lança o tempo de A (mínimo 1 min)").toBeGreaterThanOrEqual(1);
  });

  test("API: edição em massa é tudo ou nada", async ({ request }) => {
    await register(request, newUser("tasksbulk"));
    const p = await createProject(request);
    const ts = await Promise.all([1, 2, 3].map((i) => createTask(request, { projectId: p.id, title: `Massa ${i} ${uniq()}` })));
    const bad = await call(request, "POST", "/v1/tasks/bulk", { ids: [...ts.map((t) => t.id), "00000000-0000-7000-8000-000000000000"], set: { priority: "URGENT" } });
    expect(bad.status(), "um id inválido recusa tudo").toBeGreaterThanOrEqual(400);
    for (const t of ts) expect((await getTask(request, t.id)).priority, "nada mudou").not.toBe("URGENT");
    await ok(await call(request, "POST", "/v1/tasks/bulk", { ids: ts.map((t) => t.id), set: { priority: "URGENT", dueDate: today() } }), "massa válida");
    for (const t of ts) {
      const d = await getTask(request, t.id);
      expect(d.priority).toBe("URGENT");
      expect(ymd(d.dueDate)).toBe(today());
    }
  });

  test("API: projeto privado não existe para quem não é membro (404)", async ({ browser, request }) => {
    test.slow();
    const { ownerCtx, memberCtx } = await ownerWithMember(browser, request);
    const o = ownerCtx.request, m = memberCtx.request;
    await ensureFeature(o, "private_projects");
    const p = await createProject(o, { visibility: "PRIVATE" });
    const t = await createTask(o, { projectId: p.id, title: `Segredo ${uniq()}` });
    expect((await call(m, "GET", `/v1/task-projects/${p.id}`)).status(), "projeto privado").toBe(404);
    expect((await call(m, "GET", `/v1/tasks/${t.id}`)).status(), "tarefa do privado").toBe(404);
    expect((await call(m, "GET", `/v1/tasks/by-key/${t.key}`)).status(), "código da tarefa do privado").toBe(404);
    expect((await call(m, "GET", `/v1/task-projects/${p.id}/board`)).status(), "quadro do privado").toBe(404);
    expect((await call(m, "POST", `/v1/tasks/${t.id}/comments`, { body: "oi" })).status(), "comentar no privado").toBe(404);
    expect(items<any>(await ok(await call(m, "GET", "/v1/task-projects"), "projetos do membro")).map((x) => x.id), "fora da lista").not.toContain(p.id);
    expect(items<any>(await ok(await call(m, "GET", `/v1/tasks?q=${encodeURIComponent(t.title)}`), "busca do membro")), "fora da busca").toHaveLength(0);

    const other = await newContext(browser);
    await register(other.request, newUser("tasksother"));
    expect((await call(other.request, "GET", `/v1/tasks/${t.id}`)).status(), "outra empresa").toBe(404);
    await Promise.all([ownerCtx.close(), memberCtx.close(), other.close()]);
  });

  test("API: sprint — só uma ativa e concluir manda o que ficou aberto para o backlog", async ({ request }) => {
    await register(request, newUser("taskssprint"));
    await ensureFeature(request, "sprints");
    const p = await createProject(request, { sprintsEnabled: true });
    const s1 = await ok<any>(await call(request, "POST", `/v1/task-projects/${p.id}/sprints`, { startDate: today(), endDate: plusDays(today(), 14) }), "sprint 1");
    const s2 = await ok<any>(await call(request, "POST", `/v1/task-projects/${p.id}/sprints`, { startDate: plusDays(today(), 15), endDate: plusDays(today(), 28) }), "sprint 2");
    const done = await createTask(request, { projectId: p.id, title: `Feita ${uniq()}`, sprintId: s1.id });
    const open = await createTask(request, { projectId: p.id, title: `Aberta ${uniq()}`, sprintId: s1.id });
    await ok(await call(request, "POST", `/v1/tasks/${done.id}/move`, { statusId: statusOf(p, "DONE").id }), "concluir uma");
    await ok(await call(request, "POST", `/v1/sprints/${s1.id}/start`), "iniciar sprint 1");
    await expectCode(await call(request, "POST", `/v1/sprints/${s2.id}/start`), 409, "SPRINT_ALREADY_ACTIVE", "iniciar outra com uma ativa");
    const res = await ok<any>(await call(request, "POST", `/v1/sprints/${s1.id}/complete`, { moveOpenTo: "backlog" }), "concluir sprint");
    expect(res.summary?.completed, "resumo com o que foi entregue").toBe(1);
    expect((await getTask(request, open.id)).sprintId ?? null, "aberta volta para o backlog").toBeNull();
    expect((await getTask(request, done.id)).sprintId, "concluída fica na sprint").toBe(s1.id);
  });

  // ------------------------------------------------------------------ telas
  test("projetos: criar pela tela com a chave sugerida e abrir no quadro", async ({ page }) => {
    await signUp(page, "tasksproj", "/tarefas/projetos");
    await page.getByTestId("tasks-project-new").click();
    const sheet = page.getByTestId("form-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("field-name").fill(`Marketing ${uniq()}`);
    await expect(sheet.getByTestId("field-key"), "chave sugerida a partir do nome").toHaveValue(/^[A-Z]{2,6}$/);
    const key = "Z" + letters(3);
    await sheet.getByTestId("field-key").fill(key);
    await sheet.getByTestId("form-submit").click();
    await expect(page, "abre o projeto").toHaveURL(new RegExp(`/tarefas/p/${key}`));
    await expect(page.getByTestId("tasks-board")).toBeVisible();
    expect(await page.getByTestId("tasks-column").count(), "uma coluna por status").toBeGreaterThanOrEqual(4);
  });

  test("quadro: adição rápida com atalhos e arrastar o card muda o status", async ({ page }) => {
    const u = await signUp(page, "tasksquick");
    const req = page.context().request;
    const p = await createProject(req);
    await page.goto(`/tarefas/p/${p.key}`);
    const todo = page.locator(`[data-testid="tasks-column"][data-status-id="${statusOf(p, "TODO").id}"]`);
    await expect(todo).toBeVisible();
    const title = `Revisar contrato ${uniq()}`;
    const quick = todo.getByTestId("tasks-quick-add");
    if (!(await quick.isVisible().catch(() => false))) await todo.getByText(/adicionar tarefa/i).click();
    await quick.fill(`${title} @${u.email.split("@")[0]} !alta amanhã #juridico`);
    await quick.press("Enter");
    const card = todo.getByTestId("tasks-card").filter({ hasText: title });
    await expect(card, "card criado na coluna").toBeVisible();

    const found = items<any>(await ok(await call(req, "GET", `/v1/tasks?projectId=${p.id}&q=${encodeURIComponent(title)}`), "busca"));
    const t = found.find((x) => x.title === title);
    expect(t, "título limpo, sem os atalhos").toBeTruthy();
    expect(t.priority, "!alta").toBe("HIGH");
    expect(ymd(t.dueDate), "amanhã").toBe(plusDays(today(), 1));
    expect(t.assignee?.id, "@responsável").toBe((await me(req)).user.id);
    expect((t.labels ?? []).map((l: any) => l.name), "#etiqueta criada").toContain("juridico");

    const doing = page.locator(`[data-testid="tasks-column"][data-status-id="${statusOf(p, "IN_PROGRESS").id}"]`);
    await dragTo(page, card, doing);
    await expect(doing.getByTestId("tasks-card").filter({ hasText: title }), "card na coluna nova").toBeVisible();
    await expect.poll(async () => (await getTask(req, t.id)).status?.category, { message: "status gravado ao arrastar" }).toBe("IN_PROGRESS");
  });

  test("tarefa: painel com subtarefa, checklist e comentário", async ({ page }) => {
    await signUp(page, "taskspanel");
    const req = page.context().request;
    const p = await createProject(req);
    const t = await createTask(req, { projectId: p.id, title: `Lançamento ${uniq()}` });
    await page.goto(`/tarefas/p/${p.key}?tarefa=${t.key}`);
    const panel = page.getByTestId("tasks-task-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("tasks-task-title")).toContainText(t.title);

    await panel.getByTestId("tasks-subtask-add").fill("Escrever o post");
    await panel.getByTestId("tasks-subtask-add").press("Enter");
    await expect(panel.getByTestId("tasks-subtask-row").filter({ hasText: "Escrever o post" })).toBeVisible();

    await panel.getByTestId("tasks-checklist-add").fill("Revisar ortografia");
    await panel.getByTestId("tasks-checklist-add").press("Enter");
    const item = panel.getByTestId("tasks-checklist-item").filter({ hasText: "Revisar ortografia" });
    await expect(item).toBeVisible();
    await item.getByRole("checkbox").check();

    const comment = `Primeira versão pronta ${uniq()}`;
    await panel.getByTestId("tasks-comment-input").click();
    await panel.getByTestId("tasks-comment-input").fill(comment);
    await panel.getByTestId("tasks-comment-submit").click();
    await expect(panel.getByTestId("tasks-timeline-item").filter({ hasText: comment }), "comentário no histórico").toBeVisible();

    await expect.poll(async () => { const d = await getTask(req, t.id); return `${d.subtasks?.total}|${(d.checklist ?? []).filter((x: any) => x.done).length}`; }, { message: "subtarefa e checklist gravados" }).toBe("1|1");
    await expect.poll(async () => items<any>(await ok(await call(req, "GET", `/v1/tasks/${t.id}/timeline?filter=comments`), "histórico")).some((x) => String(x.bodyText ?? "").includes(comment)), { message: "comentário gravado na API" }).toBe(true);
    await page.reload();
    await expect(page.getByTestId("tasks-task-panel").getByTestId("tasks-timeline-item").filter({ hasText: comment }), "comentário continua depois de recarregar").toBeVisible();
  });

  test("tarefa: cronômetro aparece no topo e parar lança as horas", async ({ page }) => {
    await signUp(page, "taskstimerui");
    const req = page.context().request;
    const p = await createProject(req);
    const t = await createTask(req, { projectId: p.id, title: `Cronometrar ${uniq()}` });
    await page.goto(`/tarefas/p/${p.key}?tarefa=${t.key}`);
    await page.getByTestId("tasks-task-panel").getByTestId("tasks-timer-toggle").click();
    const chip = page.getByTestId("tasks-timer-chip");
    await expect(chip, "chip do cronômetro no topo").toContainText(t.key);
    await page.reload();
    await expect(page.getByTestId("tasks-timer-chip"), "cronômetro vive no servidor (sobrevive a recarregar)").toContainText(t.key);
    await page.getByTestId("tasks-timer-stop").click();
    await expect(page.getByTestId("tasks-timer-chip")).toHaveCount(0);
    await expect.poll(async () => (await ok<any>(await call(req, "GET", `/v1/tasks/${t.id}/time-entries`), "horas")).totalMinutes, { message: "tempo lançado ao parar" }).toBeGreaterThanOrEqual(1);
  });

  test("minhas tarefas: aba Hoje e concluir pela linha", async ({ page }) => {
    await signUp(page, "tasksmine");
    const req = page.context().request;
    const p = await createProject(req);
    const t = await createTask(req, { projectId: p.id, title: `Ligar para o fornecedor ${uniq()}`, assigneeId: (await me(req)).user.id, dueDate: today() });
    await page.goto("/tarefas");
    await page.getByTestId("tasks-mine-tab-today").click();
    const row = page.locator(`[data-testid="tasks-mine-row"][data-task-key="${t.key}"]`);
    await expect(row, "tarefa de hoje na aba Hoje").toBeVisible();
    await row.getByTestId("tasks-mine-done").click();
    await expect.poll(async () => (await getTask(req, t.id)).status?.category, { message: "concluída pela linha" }).toBe("DONE");
  });

  test("visões: lista e calendário mostram a tarefa no lugar certo", async ({ page }) => {
    await signUp(page, "tasksviews");
    const req = page.context().request;
    const p = await createProject(req);
    const due = today();
    const t = await createTask(req, { projectId: p.id, title: `Entrega ${uniq()}`, dueDate: due });
    await page.goto(`/tarefas/p/${p.key}`);
    await page.locator('[data-testid="tasks-view-tab"][data-view="lista"]').click();
    await expect(page.locator(`[data-testid="tasks-list-row"][data-task-key="${t.key}"]`), "linha na lista").toBeVisible();
    await page.locator('[data-testid="tasks-view-tab"][data-view="calendario"]').click();
    await expect(page.getByTestId("tasks-calendar")).toBeVisible();
    const item = page.locator(`[data-testid="tasks-calendar-item"][data-task-key="${t.key}"]`);
    await expect(item, "tarefa no calendário").toBeVisible();
    await expect(page.locator(`[data-testid="tasks-calendar"] [data-date="${due}"]`).locator(`[data-task-key="${t.key}"]`), "no dia do prazo").toBeVisible();
  });
});
