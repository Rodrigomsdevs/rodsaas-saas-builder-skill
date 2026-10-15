import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { billingMode, call, items, me, newUser, ok, plansFromApi, register, uniq } from "../support/api";
import { cfg } from "../support/config.mjs";
import { waitForEmail, linkFrom } from "../support/mailpit";
import { signUp } from "../support/ui";

// Tarefas · operação avançada e perfis (skills/tarefas/references/07 e 08). Roda com o preset tarefas. Confere o que mais
// se simplifica: a recorrente que cria a próxima no dia útil certo (uma vez só), o modelo que nasce com datas em dias
// úteis e dependências, campos personalizados validados e cobrados ao concluir, o Gantt que empurra as sucessoras (e
// nunca puxa para trás) com caminho crítico, automações que param na profundidade 3, a carga com capacidade e feriado,
// o cliente convidado que só vê o que é dele e aprova, e os perfis: obrigações com prazo legal, horas faturadas no
// Financeiro uma vez só e checklist com foto obrigatória.

async function installed(req: APIRequestContext) {
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
const addBusinessDays = (ymd: string, n: number) => { let d = ymd; while (n > 0) { d = addDays(d, 1); const w = new Date(d + "T12:00:00Z").getUTCDay(); if (w !== 0 && w !== 6) n--; } return d; };
const ymd = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : v);
const letters = (n: number) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

type Project = { id: string; key: string; statuses: { id: string; name: string; category: string }[] };
async function project(req: APIRequestContext, extra: Record<string, unknown> = {}): Promise<Project> {
  const p = await ok<any>(await call(req, "POST", "/v1/task-projects", { name: `Operação ${uniq()}`, key: "O" + letters(3), ...extra }), "criar projeto");
  return ok<any>(await call(req, "GET", `/v1/task-projects/${p.id}`), "detalhe do projeto");
}
const st = (p: Project, category: string) => p.statuses.find((x) => x.category === category)!;
const task = async (req: APIRequestContext, body: Record<string, unknown>) => ok<any>(await call(req, "POST", "/v1/tasks", body), `criar tarefa "${body.title}"`);
const detail = async (req: APIRequestContext, id: string) => ok<any>(await call(req, "GET", `/v1/tasks/${id}`), "detalhe da tarefa");
const move = (req: APIRequestContext, id: string, statusId: string) => call(req, "POST", `/v1/tasks/${id}/move`, { statusId });
const block = (req: APIRequestContext, laterId: string, earlierId: string, lagDays?: number) => call(req, "POST", `/v1/tasks/${laterId}/links`, { toTaskId: earlierId, type: "blocked_by", ...(lagDays != null ? { lagDays } : {}) });
async function guestToken(req: APIRequestContext, email: string) {
  const mail = await waitForEmail(req, email, { contains: "/convidado/" });
  return new URL(linkFrom(mail, "/convidado/")).pathname.split("/")[2];
}
const guestGet = (req: APIRequestContext, token: string) => req.fetch(`${cfg.apiURL}/v1/public/task-guest/${token}`, { headers: { Origin: cfg.webURL }, failOnStatusCode: false });
const decide = (req: APIRequestContext, token: string, taskId: string, data: Record<string, unknown>) => req.fetch(`${cfg.apiURL}/v1/public/task-guest/${token}/tasks/${taskId}/decision`, { method: "POST", headers: { Origin: cfg.webURL, "Content-Type": "application/json" }, data: JSON.stringify(data), failOnStatusCode: false });
async function upload(req: APIRequestContext) {
  const start = await ok<any>(await call(req, "POST", "/v1/uploads", { fileName: "laje.png", size: PNG.length, mimeType: "image/png", purpose: "task_photo" }), "iniciar envio da foto");
  const put = await req.fetch(start.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png", ...(start.headers ?? {}) }, data: PNG, failOnStatusCode: false });
  expect(put.status(), "enviar a foto").toBeLessThan(300);
  await ok(await call(req, "POST", `/v1/uploads/${start.fileId}/complete`), "concluir envio");
  return start.fileId as string;
}
/** Gantt de exemplo: A (5 dias) → B (3) → C (1) e A → D (12) → C. Caminho crítico A-D-C (18 dias). */
async function ganttFixture(req: APIRequestContext) {
  const p = await project(req);
  const mk = (title: string, startDate: string | null, dueDate: string) => task(req, { projectId: p.id, title, startDate: startDate ?? undefined, dueDate });
  const A = await mk("Fundação", "2027-03-01", "2027-03-05"), B = await mk("Alvenaria", "2027-03-08", "2027-03-10"), C = await mk("Entrega", null, "2027-03-11"), D = await mk("Estrutura", "2027-03-08", "2027-03-19");
  for (const [later, earlier] of [[B, A], [C, B], [D, A], [C, D]]) await ok(await block(req, later.id, earlier.id), `dependência ${earlier.title} → ${later.title}`);
  return { p, A, B, C, D };
}

test.describe("Tarefas · operação", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await installed(request)), "projeto sem o preset tarefas");
  });

  test("API: recorrência — regra validada, concluir cria a próxima no dia útil certo uma vez só e para no fim", async ({ request }) => {
    await register(request, newUser("tkrec"));
    const p = await project(request);
    await ok(await call(request, "PUT", "/v1/tasks/holidays", { dates: [{ date: "2027-02-22", name: "Feriado local" }] }), "feriados");
    const t = await task(request, { projectId: p.id, title: `Folha ${uniq()}`, dueDate: "2027-01-20" });
    expect(pathsOf(await expectCode(await call(request, "PUT", `/v1/tasks/${t.id}/recurrence`, { rule: { freq: "hourly" } }), 400, "VALIDATION_ERROR", "frequência inválida"))).toContain("rule.freq");
    const semPrazo = await task(request, { projectId: p.id, title: "Sem prazo" });
    expect(pathsOf(await expectCode(await call(request, "PUT", `/v1/tasks/${semPrazo.id}/recurrence`, { rule: { freq: "monthly", monthDay: 20 } }), 400, "VALIDATION_ERROR", "sem prazo"))).toContain("dueDate");
    const r = await ok<any>(await call(request, "PUT", `/v1/tasks/${t.id}/recurrence`, { rule: { freq: "monthly", monthDay: 20, onNonBusiness: "after" } }), "repetir todo dia 20");
    expect(r.recurrence.nextDue, "20/02 cai no sábado e a segunda é feriado: terça").toBe("2027-02-23");
    const item = await ok<any>(await call(request, "POST", `/v1/tasks/${t.id}/checklist`, { text: "Conferir guias" }), "item");
    await ok(await call(request, "PATCH", `/v1/tasks/${t.id}/checklist/${item.id}`, { done: true }), "marcar item");
    await ok(await move(request, t.id, st(p, "DONE").id), "concluir");
    const done = await detail(request, t.id);
    expect(done.recurrence?.nextTaskId, "a concluída aponta a próxima").toBeTruthy();
    const nx = await detail(request, done.recurrence.nextTaskId);
    expect([nx.title, ymd(nx.dueDate), nx.status.category, nx.recurrence?.occurrence]).toEqual([t.title, "2027-02-23", "TODO", 2]);
    expect(nx.checklist.map((c: any) => [c.text, c.done]), "checklist desmarcado").toEqual([["Conferir guias", false]]);
    await ok(await move(request, t.id, st(p, "TODO").id), "reabrir");
    await ok(await move(request, t.id, st(p, "DONE").id), "concluir de novo");
    const same = items<any>(await ok(await call(request, "GET", `/v1/tasks?projectId=${p.id}&q=${encodeURIComponent(t.title)}`), "lista")).filter((x) => x.title === t.title);
    expect(same.length, "reabrir e concluir não cria outra").toBe(2);
    const once = await task(request, { projectId: p.id, title: "Uma vez", dueDate: "2027-01-20" });
    expect((await ok<any>(await call(request, "PUT", `/v1/tasks/${once.id}/recurrence`, { rule: { freq: "daily", count: 1 } }), "uma repetição")).recurrence.nextDue, "contagem esgotada").toBeNull();
    await ok(await move(request, once.id, st(p, "DONE").id), "concluir");
    expect((await detail(request, once.id)).recurrence.nextTaskId, "não cria depois do fim").toBeNull();
  });

  test("API: modelo — validado e aplicado com datas em dias úteis, dependências, checklist, subtarefas e responsável pelo papel", async ({ request }) => {
    await register(request, newUser("tkmodelo"));
    const myId = (await me(request)).user.id;
    const p = await project(request);
    const badT = await expectCode(await call(request, "POST", "/v1/task-templates", { name: "Ruim", tasks: [{ key: "a", title: "A", offsetDays: 0 }, { key: "a", title: "", offsetDays: -1, dependsOn: ["zz"] }] }), 400, "VALIDATION_ERROR", "modelo inválido");
    expect(pathsOf(badT)).toEqual(expect.arrayContaining(["tasks.1.key", "tasks.1.title", "tasks.1.offsetDays", "tasks.1.dependsOn"]));
    const tp = await ok<any>(await call(request, "POST", "/v1/task-templates", { name: `Onboarding ${uniq()}`, tasks: [
      { key: "kickoff", title: "Reunião inicial", offsetDays: 0, businessDays: true, assigneeRole: "ATENDIMENTO", checklist: ["Pauta", { text: "Foto do local", requirePhoto: true }] },
      { key: "briefing", title: "Briefing", offsetDays: 2, businessDays: true, durationDays: 2, dependsOn: ["kickoff"], subtasks: [{ title: "Coletar logos", offsetDays: 1 }] },
      { key: "entrega", title: "Entrega", offsetDays: 5, businessDays: true, dependsOn: ["briefing"] },
    ] }), "criar modelo");
    const out = await ok<any>(await call(request, "POST", `/v1/task-templates/${tp.id}/apply`, { projectId: p.id, startDate: "2027-01-16", assignees: { ATENDIMENTO: myId } }), "aplicar no sábado");
    expect(out.tasks.map((x: any) => [x.title, ymd(x.dueDate)]), "dias úteis contam a partir de segunda").toEqual([["Reunião inicial", "2027-01-18"], ["Briefing", "2027-01-20"], ["Entrega", "2027-01-25"]]);
    const [k, b, e] = await Promise.all(out.tasks.map((x: any) => detail(request, x.id)));
    expect(k.assignee?.id, "responsável pelo papel").toBe(myId);
    expect(b.assignee, "papel sem pessoa fica sem responsável").toBeNull();
    expect(k.checklist.map((c: any) => [c.text, !!c.requirePhoto]), "checklist do modelo").toEqual([["Pauta", false], ["Foto do local", true]]);
    expect(ymd(b.startDate), "duração de 2 dias").toBe("2027-01-19");
    expect(b.subtaskList.map((x: any) => x.title)).toEqual(["Coletar logos"]);
    expect(e.links.map((l: any) => [l.type, l.task.id]), "dependência vira vínculo").toEqual([["blocked_by", b.id]]);
    expect(b.links.map((l: any) => l.type).sort()).toEqual(["blocked_by", "blocks"]);
  });

  test("API: campos personalizados — definição e valores validados, filtro e obrigatório cobrado ao concluir", async ({ request }) => {
    await register(request, newUser("tkcampos"));
    await ensureFeature(request, "task_advanced");
    const myId = (await me(request)).user.id;
    const p = await project(request);
    expect(pathsOf(await expectCode(await call(request, "PUT", `/v1/task-projects/${p.id}/fields`, { fields: [{ key: "1x", label: "", type: "cor" }] }), 400, "VALIDATION_ERROR", "campo inválido"))).toEqual(expect.arrayContaining(["fields.0.key", "fields.0.label", "fields.0.type"]));
    await ok(await call(request, "PUT", `/v1/task-projects/${p.id}/fields`, { fields: [{ key: "fase", label: "Fase", type: "select", options: ["Briefing", "Arte"], required: true }, { key: "horas", label: "Horas", type: "number" }, { key: "revisor", label: "Revisor", type: "user" }] }), "campos");
    const a = await task(request, { projectId: p.id, title: "Peça A" }), b = await task(request, { projectId: p.id, title: "Peça B" });
    expect(pathsOf(await expectCode(await call(request, "PATCH", `/v1/tasks/${a.id}`, { customFields: { fase: "Outra" } }), 400, "VALIDATION_ERROR", "opção fora da lista"))).toContain("customFields.fase");
    expect(pathsOf(await expectCode(await call(request, "PATCH", `/v1/tasks/${a.id}`, { customFields: { revisor: "00000000-0000-0000-0000-000000000000" } }), 400, "VALIDATION_ERROR", "pessoa de fora"))).toContain("customFields.revisor");
    expect(pathsOf(await expectCode(await call(request, "PATCH", `/v1/tasks/${a.id}`, { customFields: { inexistente: 1 } }), 400, "VALIDATION_ERROR", "campo que não existe"))).toContain("customFields.inexistente");
    await ok(await call(request, "PATCH", `/v1/tasks/${a.id}`, { customFields: { fase: "Arte", horas: 3, revisor: myId } }), "valores");
    expect((await detail(request, a.id)).customFields).toEqual({ fase: "Arte", horas: 3, revisor: myId });
    const f = items<any>(await ok(await call(request, "GET", `/v1/tasks?projectId=${p.id}&cf.fase=Arte`), "filtro por campo"));
    expect(f.map((x) => x.id), "filtro cf.").toEqual([a.id]);
    const req = await expectCode(await move(request, b.id, st(p, "DONE").id), 409, "CUSTOM_FIELDS_REQUIRED", "concluir sem a fase");
    expect(pathsOf(req)).toEqual(["customFields.fase"]);
    await ok(await move(request, a.id, st(p, "DONE").id), "com a fase conclui");
    await ok(await call(request, "PATCH", `/v1/tasks/${a.id}`, { customFields: { horas: null } }), "limpar");
    expect((await detail(request, a.id)).customFields).toEqual({ fase: "Arte", revisor: myId });
  });

  test("API: Gantt — ciclo recusado, caminho crítico, mover a barra empurra as sucessoras com a folga e nunca puxa para trás", async ({ request }) => {
    await register(request, newUser("tkgantt"));
    await ensureFeature(request, "task_advanced");
    const { p, A, B, C, D } = await ganttFixture(request);
    await expectCode(await block(request, A.id, C.id), 409, "DEPENDENCY_CYCLE", "dependência que fecha ciclo");
    const g = await ok<any>(await call(request, "GET", `/v1/task-projects/${p.id}/gantt`), "Gantt");
    expect(g.criticalPath, "caminho crítico").toEqual({ ids: [A.id, D.id, C.id], days: 18 });
    expect(g.tasks.filter((x: any) => x.critical).map((x: any) => x.id).sort()).toEqual([A.id, C.id, D.id].sort());
    expect(g.links.length).toBe(4);
    await expectCode(await call(request, "PATCH", `/v1/tasks/${A.id}/schedule`, { startDate: "2027-03-10", dueDate: "2027-03-09" }), 400, "VALIDATION_ERROR", "início depois do prazo");
    const r = await ok<any>(await call(request, "PATCH", `/v1/tasks/${A.id}/schedule`, { startDate: "2027-03-01", dueDate: "2027-03-09" }), "esticar a fundação");
    const mv = Object.fromEntries(r.moved.map((x: any) => [x.id, [ymd(x.startDate), ymd(x.dueDate)]]));
    expect(mv, "sucessoras andam mantendo a duração; a entrega espera a mais longa").toEqual({ [B.id]: ["2027-03-10", "2027-03-12"], [D.id]: ["2027-03-10", "2027-03-21"], [C.id]: [null, "2027-03-22"] });
    expect(ymd((await detail(request, C.id)).dueDate)).toBe("2027-03-22");
    const back = await ok<any>(await call(request, "PATCH", `/v1/tasks/${A.id}/schedule`, { startDate: "2027-03-01", dueDate: "2027-03-02" }), "encurtar");
    expect(back.moved, "nunca puxa para trás").toEqual([]);
    expect(ymd((await detail(request, B.id)).startDate)).toBe("2027-03-10");
    const E = await task(request, { projectId: p.id, title: "Cura", startDate: "2027-03-01", dueDate: "2027-03-01" }), F = await task(request, { projectId: p.id, title: "Acabamento", startDate: "2027-03-02", dueDate: "2027-03-02" });
    await ok(await block(request, F.id, E.id, 2), "começa 2 dias depois");
    const lag = await ok<any>(await call(request, "PATCH", `/v1/tasks/${E.id}/schedule`, { startDate: "2027-03-01", dueDate: "2027-03-01" }), "replanejar");
    expect(lag.moved.map((x: any) => [x.id, ymd(x.startDate)]), "folga respeitada").toEqual([[F.id, "2027-03-04"]]);
  });

  test("API: automações — regra que desfaz o gatilho recusada, mudar o status atribui e dá prazo, execuções e profundidade 3", async ({ request }) => {
    await register(request, newUser("tkauto"));
    await ensureFeature(request, "task_advanced");
    const myId = (await me(request)).user.id;
    const p = await project(request);
    const ip = st(p, "IN_PROGRESS"), todo = st(p, "TODO"), bl = st(p, "BACKLOG");
    const loop = await expectCode(await call(request, "POST", `/v1/task-projects/${p.id}/automations`, { name: "Loop", trigger: { type: "status_changed", toStatusId: ip.id }, actions: [{ type: "move_status", statusId: ip.id }] }), 400, "VALIDATION_ERROR", "regra que desfaz o gatilho");
    expect(loop.errors.map((e: any) => e.code ?? e.path)).toEqual(expect.arrayContaining([expect.stringMatching(/LOOP|actions\.0\.statusId/)]));
    const a = await ok<any>(await call(request, "POST", `/v1/task-projects/${p.id}/automations`, { name: "Começou", trigger: { type: "status_changed", toStatusId: ip.id }, actions: [{ type: "set_assignee", userId: myId }, { type: "set_due_in_days", days: 2 }, { type: "comment", text: "Atribuída pela automação" }] }), "automação");
    const t = await task(request, { projectId: p.id, title: "Peça" });
    await ok(await move(request, t.id, ip.id), "começar");
    const d = await detail(request, t.id);
    expect([d.assignee?.id, ymd(d.dueDate)], "atribuiu e deu prazo em 2 dias úteis").toEqual([myId, addBusinessDays(today(), 2)]);
    const tl = items<any>(await ok(await call(request, "GET", `/v1/tasks/${t.id}/timeline`), "atividade"));
    expect(tl.some((x) => /Atribuída pela automação/.test(x.bodyText ?? x.text ?? "")), "comentário da automação").toBe(true);
    const runs = items<any>(await ok(await call(request, "GET", `/v1/task-automations/${a.id}/runs`), "execuções"));
    expect(runs.map((r) => [r.taskId, r.ok])).toEqual([[t.id, true]]);
    const fail = await ok<any>(await call(request, "POST", `/v1/task-projects/${p.id}/automations`, { name: "Quebrada", trigger: { type: "task_created" }, actions: [{ type: "set_assignee", userId: "00000000-0000-0000-0000-000000000000" }] }), "automação que vai falhar");
    const t2 = await task(request, { projectId: p.id, title: "Criada mesmo assim" });
    expect(t2.id, "a falha da regra não desfaz a ação de quem mexeu").toBeTruthy();
    const fr = items<any>(await ok(await call(request, "GET", `/v1/task-automations/${fail.id}/runs`), "execução com erro"));
    expect(fr.find((r) => r.taskId === t2.id)?.ok).toBe(false);
    await ok(await call(request, "PATCH", `/v1/task-automations/${fail.id}`, { active: false }), "desligar");
    const p1 = await ok<any>(await call(request, "POST", `/v1/task-projects/${p.id}/automations`, { name: "Pingue", trigger: { type: "status_changed", toStatusId: bl.id }, actions: [{ type: "move_status", statusId: todo.id }] }), "pingue");
    const p2 = await ok<any>(await call(request, "POST", `/v1/task-projects/${p.id}/automations`, { name: "Pongue", trigger: { type: "status_changed", toStatusId: todo.id }, actions: [{ type: "move_status", statusId: bl.id }] }), "pongue");
    const t3 = await task(request, { projectId: p.id, title: "Bola", statusId: ip.id });
    await ok(await move(request, t3.id, bl.id), "dispara o pingue-pongue");
    const n1 = items<any>(await ok(await call(request, "GET", `/v1/task-automations/${p1.id}/runs`), "runs 1")).filter((r) => r.taskId === t3.id).length;
    const n2 = items<any>(await ok(await call(request, "GET", `/v1/task-automations/${p2.id}/runs`), "runs 2")).filter((r) => r.taskId === t3.id).length;
    expect([n1, n2], "para na profundidade 3").toEqual([2, 1]);
    expect(items<any>(await ok(await call(request, "GET", `/v1/task-automations/${fail.id}/runs`), "regra desligada")).some((r) => r.taskId === t3.id), "regra desligada não roda").toBe(false);
    expect((await detail(request, t3.id)).status.category).toBe("TODO");
  });

  test("API: carga por pessoa — semana acima da capacidade, capacidade maior desmarca, feriado e concluída saem", async ({ request }) => {
    await register(request, newUser("tkcarga"));
    await ensureFeature(request, "task_advanced");
    const myId = (await me(request)).user.id;
    const p = await project(request);
    await ok(await call(request, "PATCH", `/v1/task-projects/${p.id}`, { estimateType: "HOURS" }), "estimativa em horas");
    const t1 = await task(request, { projectId: p.id, title: "Campanha", assigneeId: myId, startDate: "2027-04-05", dueDate: "2027-04-09" });
    const t2 = await task(request, { projectId: p.id, title: "Relatório", assigneeId: myId, startDate: "2027-04-12", dueDate: "2027-04-13" });
    await ok(await call(request, "PATCH", `/v1/tasks/${t1.id}`, { estimate: 50 }), "estimar 50 h");
    await ok(await call(request, "PATCH", `/v1/tasks/${t2.id}`, { estimate: 10 }), "estimar 10 h");
    const get = async () => (await ok<any>(await call(request, "GET", "/v1/tasks/workload?from=2027-04-05&to=2027-04-18"), "carga")).people.find((x: any) => x.user.id === myId);
    expect((await get()).weeks).toEqual([{ week: "2027-04-05", hours: 50, capacity: 40, overloaded: true }, { week: "2027-04-12", hours: 10, capacity: 40, overloaded: false }]);
    expect(pathsOf(await expectCode(await call(request, "PUT", `/v1/task-capacity/${myId}`, { hoursPerDay: 25 }), 400, "VALIDATION_ERROR", "capacidade impossível"))).toContain("hoursPerDay");
    await ok(await call(request, "PUT", `/v1/task-capacity/${myId}`, { hoursPerDay: 10 }), "10 h por dia");
    await ok(await call(request, "PUT", "/v1/tasks/holidays", { dates: [{ date: "2027-04-14" }] }), "feriado");
    const w = await get();
    expect(w.hoursPerDay).toBe(10);
    expect(w.weeks.map((x: any) => [x.week, x.capacity, x.overloaded]), "capacidade maior desmarca; feriado tira um dia").toEqual([["2027-04-05", 50, false], ["2027-04-12", 40, false]]);
    await ok(await move(request, t2.id, st(p, "DONE").id), "concluir");
    expect((await get()).weeks.map((x: any) => x.week), "concluída não pesa").toEqual(["2027-04-05"]);
  });

  test("API: cliente convidado — vê só o que é dele, pedir ajustes exige comentário e devolve, aprovar registra e revogar fecha", async ({ request }) => {
    await register(request, newUser("tkguest"));
    const plan: any = (await me(request)).plan;
    const p0 = await project(request);
    if (!plan?.features?.includes("task_guests")) await expectCode(await call(request, "POST", `/v1/task-projects/${p0.id}/guests`, { name: "X", email: `x-${uniq()}@example.com` }), 403, "FEATURE_NOT_IN_PLAN", "sem a feature");
    await ensureFeature(request, "task_guests");
    const p = await project(request);
    const a = await task(request, { projectId: p.id, title: "Arte do post" }), b = await task(request, { projectId: p.id, title: "Interna" });
    expect(pathsOf(await expectCode(await call(request, "POST", `/v1/task-projects/${p.id}/guests`, { name: "Carla", email: "nao-e-email" }), 400, "VALIDATION_ERROR", "e-mail inválido"))).toContain("email");
    const mail = `carla-${uniq()}@example.com`;
    const g = await ok<any>(await call(request, "POST", `/v1/task-projects/${p.id}/guests`, { name: "Cliente Carla", email: mail }), "convidar");
    const token = await guestToken(request, mail);
    expect((await (await guestGet(request, token)).json()).tasks, "nada visível ainda").toEqual([]);
    expect((await ok<any>(await call(request, "POST", `/v1/tasks/${a.id}/approval`), "pedir aprovação")).approval.status).toBe("PENDING");
    await expectCode(await call(request, "POST", `/v1/tasks/${a.id}/approval`), 409, "APPROVAL_INVALID", "já pendente");
    const view = await (await guestGet(request, token)).json();
    expect(view.tasks.map((x: any) => [x.id, x.approval?.status]), "só a marcada para o cliente").toEqual([[a.id, "PENDING"]]);
    expect(view.guest.name).toBe("Cliente Carla");
    expect((await decide(request, token, b.id, { decision: "approve" })).status(), "tarefa interna não existe para o convidado").toBe(404);
    expect(pathsOf(await expectCode(await decide(request, token, a.id, { decision: "request_changes" }), 400, "VALIDATION_ERROR", "ajustes sem dizer o quê"))).toContain("comment");
    const ch = await (await decide(request, token, a.id, { decision: "request_changes", comment: "Trocar a cor do fundo" })).json();
    expect(ch.approval.status).toBe("CHANGES_REQUESTED");
    expect((await detail(request, a.id)).status.category, "volta para fazendo").toBe("IN_PROGRESS");
    const tl = items<any>(await ok(await call(request, "GET", `/v1/tasks/${a.id}/timeline`), "atividade"));
    expect(tl.some((x) => /Trocar a cor do fundo/.test(x.bodyText ?? x.text ?? "")), "pedido na atividade").toBe(true);
    await expectCode(await decide(request, token, a.id, { decision: "approve" }), 409, "APPROVAL_NOT_PENDING", "decisão repetida");
    await ok(await call(request, "POST", `/v1/tasks/${a.id}/approval`), "pedir de novo");
    expect((await decide(request, token, a.id, { decision: "approve" })).status()).toBe(200);
    const d = await detail(request, a.id);
    expect([d.approval?.status, d.approval?.decidedBy?.name, d.clientVisible]).toEqual(["APPROVED", "Cliente Carla", true]);
    await ok(await call(request, "DELETE", `/v1/task-guests/${g.id}`), "revogar");
    expect((await guestGet(request, token)).status(), "link revogado").toBe(404);
  });

  test("API: perfil contábil — obrigações do mês com prazo legal no dia útil, folga interna, idempotente e atrasadas no painel", async ({ request }) => {
    await register(request, newUser("tkcontabil"));
    const myId = (await me(request)).user.id;
    await expectCode(await call(request, "PATCH", "/v1/tasks/settings", { segment: "PADARIA" }), 400, "VALIDATION_ERROR", "perfil inválido");
    const s1 = await ok<any>(await call(request, "PATCH", "/v1/tasks/settings", { segment: "ACCOUNTING" }), "perfil contábil");
    expect(s1.on).toEqual(expect.arrayContaining(["obligations", "recurrence"]));
    expect(s1.words.task).toBe("obrigação");
    const s2 = await ok<any>(await call(request, "PATCH", "/v1/tasks/settings", { segment: "GENERAL" }), "voltar ao geral");
    expect([s2.segment, s2.on.includes("obligations")], "não desliga nada").toEqual(["GENERAL", true]);
    const p = await project(request);
    await ok(await call(request, "PUT", "/v1/tasks/holidays", { dates: [{ date: "2027-02-19" }] }), "feriado");
    await ok(await call(request, "PUT", "/v1/tasks/obligation-types", { types: [{ code: "DAS", name: "DAS (Simples Nacional)", day: 20, leadDays: 2 }] }), "folga do DAS");
    expect(pathsOf(await expectCode(await call(request, "PUT", "/v1/tasks/obligation-clients", { clients: [{ name: "X", obligations: ["XYZ"] }] }), 400, "VALIDATION_ERROR", "obrigação fora do catálogo"))).toContain("clients.0.obligations");
    await ok(await call(request, "PUT", "/v1/tasks/obligation-clients", { clients: [{ name: "Padaria Sol", obligations: ["DAS", "FGTS"], assigneeId: myId }, { name: "Oficina Lua", obligations: ["ESOCIAL"] }] }), "carteira");
    expect(pathsOf(await expectCode(await call(request, "POST", "/v1/tasks/obligations/generate", { projectId: p.id, competence: "2027-13" }), 400, "VALIDATION_ERROR", "competência inválida"))).toContain("competence");
    const g1 = await ok<any>(await call(request, "POST", "/v1/tasks/obligations/generate", { projectId: p.id, competence: "2027-01" }), "gerar janeiro");
    expect([g1.created, g1.skipped]).toEqual([3, 0]);
    const by = Object.fromEntries(g1.tasks.map((x: any) => [x.code, [x.clientName, x.legalDue, x.dueDate]]));
    expect(by, "DAS prorroga (sábado) com 2 úteis de folga pulando o feriado; FGTS antecipa do feriado").toEqual({ DAS: ["Padaria Sol", "2027-02-22", "2027-02-17"], FGTS: ["Padaria Sol", "2027-02-18", "2027-02-18"], ESOCIAL: ["Oficina Lua", "2027-02-15", "2027-02-15"] });
    expect([(await ok<any>(await call(request, "POST", "/v1/tasks/obligations/generate", { projectId: p.id, competence: "2027-01" }), "gerar de novo")).created], "idempotente").toEqual([0]);
    const das = await ok<any>(await call(request, "GET", `/v1/tasks/by-key/${g1.tasks.find((x: any) => x.code === "DAS").key}`), "tarefa do DAS");
    expect([das.assignee?.id, das.obligation?.legalDue, das.obligation?.competence]).toEqual([myId, "2027-02-22", "2027-01"]);
    const panel = await ok<any>(await call(request, "GET", "/v1/tasks/obligations?competence=2027-01"), "painel");
    expect(panel.totals).toEqual({ total: 3, done: 0, open: 3, late: 0 });
    const old = await ok<any>(await call(request, "POST", "/v1/tasks/obligations/generate", { projectId: p.id, competence: "2020-01" }), "competência antiga");
    await ok(await move(request, (await ok<any>(await call(request, "GET", `/v1/tasks/by-key/${old.tasks[0].key}`), "uma")).id, st(p, "DONE").id), "entregar uma");
    const late = await ok<any>(await call(request, "GET", "/v1/tasks/obligations?competence=2020-01"), "painel antigo");
    expect(late.totals, "prazo legal passado e aberta = atrasada").toEqual({ total: 3, done: 1, open: 2, late: 2 });
  });

  test("API: perfil agência — horas arredondadas por pessoa, faturar lança no Financeiro e não fatura de novo", async ({ request }) => {
    await register(request, newUser("tkagencia"));
    test.skip(!cfg.presets.includes("financeiro") && (await call(request, "GET", "/v1/fin/me")).status() === 404, "projeto sem o Financeiro");
    const myId = (await me(request)).user.id;
    await ok(await call(request, "PATCH", "/v1/tasks/settings", { segment: "AGENCY" }), "perfil agência");
    const p = await project(request);
    await ok(await call(request, "PATCH", `/v1/task-projects/${p.id}`, { client: { name: "Cliente Alfa" } }), "conta do cliente");
    expect(pathsOf(await expectCode(await call(request, "PUT", "/v1/tasks/rates", { defaultRateCents: -1 }), 400, "VALIDATION_ERROR", "valor negativo"))).toContain("defaultRateCents");
    await ok(await call(request, "PUT", "/v1/tasks/rates", { defaultRateCents: 12000, roundTo: 15, users: { [myId]: 18000 } }), "valores por hora");
    const t = await task(request, { projectId: p.id, title: "Job" });
    await ok(await call(request, "POST", `/v1/tasks/${t.id}/time-entries`, { minutes: 50, date: "2027-05-03" }), "50 min");
    const second = await ok<any>(await call(request, "POST", `/v1/tasks/${t.id}/time-entries`, { minutes: 20, date: "2027-05-04" }), "20 min");
    await ok(await call(request, "POST", `/v1/tasks/${t.id}/time-entries`, { minutes: 600, date: "2027-05-05", billable: false }), "não faturável");
    await ok(await call(request, "POST", `/v1/tasks/${t.id}/time-entries`, { minutes: 90, date: "2027-06-01" }), "fora do período");
    const bill = await ok<any>(await call(request, "GET", "/v1/tasks/billing?from=2027-05-01&to=2027-05-31"), "prévia");
    const row = bill.data.find((x: any) => x.project.id === p.id);
    expect([row.minutes, row.amountCents, row.lines[0].rateCents, row.project.client?.name], "70 min → 75 (quarto de hora) a R$ 180/h").toEqual([75, 22500, 18000, "Cliente Alfa"]);
    const inv = await ok<any>(await call(request, "POST", "/v1/tasks/billing/invoice", { projectId: p.id, from: "2027-05-01", to: "2027-05-31" }), "faturar");
    expect([inv.amountCents, inv.minutes]).toEqual([22500, 75]);
    const e = await ok<any>(await call(request, "GET", `/v1/fin/entries/${inv.entryId}`), "receita no Financeiro");
    expect([e.type, e.amountCents, /Cliente Alfa/.test(e.description)]).toEqual(["INCOME", 22500, true]);
    await expectCode(await call(request, "POST", "/v1/tasks/billing/invoice", { projectId: p.id, from: "2027-05-01", to: "2027-05-31" }), 409, "NOTHING_TO_INVOICE", "faturar de novo");
    expect((await ok<any>(await call(request, "GET", "/v1/tasks/billing?from=2027-05-01&to=2027-05-31"), "prévia depois")).data.filter((x: any) => x.project.id === p.id)).toEqual([]);
    await expectCode(await call(request, "DELETE", `/v1/time-entries/${second.id}`), 409, "TIME_ENTRY_INVOICED", "lançamento faturado");
  });

  test("API: perfil obras — item com foto obrigatória, foto inválida recusada e concluir exige o checklist completo", async ({ request }) => {
    await register(request, newUser("tkobras"));
    test.skip(!cfg.addons.includes("uploads") && (await call(request, "GET", "/v1/files/usage")).status() === 404, "projeto sem o add-on uploads");
    const s = await ok<any>(await call(request, "PATCH", "/v1/tasks/settings", { segment: "CONSTRUCTION" }), "perfil obras");
    expect(s.on).toEqual(expect.arrayContaining(["photo_checklist", "gantt"]));
    expect(s.words.project).toBe("obra");
    const p = await project(request);
    await ok(await call(request, "PATCH", `/v1/task-projects/${p.id}`, { requireChecklist: true }), "exigir checklist");
    const t = await task(request, { projectId: p.id, title: "Laje do 2º andar" });
    const laje = await ok<any>(await call(request, "POST", `/v1/tasks/${t.id}/checklist`, { text: "Foto da laje concretada", requirePhoto: true }), "item com foto");
    const limpeza = await ok<any>(await call(request, "POST", `/v1/tasks/${t.id}/checklist`, { text: "Limpeza" }), "item simples");
    await expectCode(await call(request, "PATCH", `/v1/tasks/${t.id}/checklist/${laje.id}`, { done: true }), 409, "PHOTO_REQUIRED", "marcar sem foto");
    expect(pathsOf(await expectCode(await call(request, "POST", `/v1/tasks/${t.id}/checklist/${laje.id}/photos`, { fileId: "00000000-0000-0000-0000-000000000000" }), 400, "VALIDATION_ERROR", "foto que não existe"))).toContain("fileId");
    const fileId = await upload(request);
    expect((await ok<any>(await call(request, "POST", `/v1/tasks/${t.id}/checklist/${laje.id}/photos`, { fileId }), "anexar foto")).photoIds).toEqual([fileId]);
    await ok(await call(request, "PATCH", `/v1/tasks/${t.id}/checklist/${laje.id}`, { done: true }), "com foto marca");
    await expectCode(await move(request, t.id, st(p, "DONE").id), 409, "CHECKLIST_INCOMPLETE", "concluir com item aberto");
    await ok(await call(request, "PATCH", `/v1/tasks/${t.id}/checklist/${limpeza.id}`, { done: true }), "limpeza");
    await ok(await move(request, t.id, st(p, "DONE").id), "agora conclui");
  });

  test("Tela: escolher o perfil do Tarefas nas configurações", async ({ page }) => {
    await signUp(page, "tkperfiltela");
    await page.goto("/tarefas/configuracoes");
    await page.getByTestId("tasks-segment").selectOption("AGENCY");
    await expect.poll(async () => (await ok<any>(await call(page.context().request, "GET", "/v1/tasks/settings"), "configurações")).segment, { timeout: 10_000 }).toBe("AGENCY");
  });

  test("Tela: Gantt com o caminho crítico em destaque", async ({ page }) => {
    await signUp(page, "tkgantttela");
    const req = page.context().request;
    await ensureFeature(req, "task_advanced");
    const { p, A, B } = await ganttFixture(req);
    await page.goto(`/tarefas/p/${p.key}?visao=gantt`);
    await expect(page.getByTestId("tasks-gantt")).toBeVisible();
    await expect(page.locator(`[data-testid="tasks-gantt-bar"][data-task-key="${A.key}"]`)).toHaveAttribute("data-critical", "true");
    await expect(page.locator(`[data-testid="tasks-gantt-bar"][data-task-key="${B.key}"]`)).toHaveAttribute("data-critical", "false");
  });

  test("Tela: cliente convidado aprova pelo link", async ({ page, request }) => {
    await signUp(page, "tkguesttela");
    const req = page.context().request;
    await ensureFeature(req, "task_guests");
    const p = await project(req);
    const a = await task(req, { projectId: p.id, title: "Logo nova" });
    const mail = `cli-${uniq()}@example.com`;
    await ok(await call(req, "POST", `/v1/task-projects/${p.id}/guests`, { name: "Cliente Duda", email: mail }), "convidar");
    await ok(await call(req, "POST", `/v1/tasks/${a.id}/approval`), "pedir aprovação");
    const token = await guestToken(request, mail);
    await page.goto(`/convidado/${token}`);
    const row = page.locator(`[data-testid="task-guest-row"][data-task-key="${a.key}"]`);
    await expect(row).toHaveAttribute("data-approval", "PENDING");
    await row.getByTestId("task-guest-approve").click();
    await expect(page.locator(`[data-testid="task-guest-row"][data-task-key="${a.key}"]`)).toHaveAttribute("data-approval", "APPROVED");
    expect((await detail(req, a.id)).approval.status).toBe("APPROVED");
  });

  test("Tela: carga por pessoa marca a semana estourada", async ({ page }) => {
    await signUp(page, "tkcargatela");
    const req = page.context().request;
    await ensureFeature(req, "task_advanced");
    const myId = (await me(req)).user.id;
    const p = await project(req);
    await ok(await call(req, "PATCH", `/v1/task-projects/${p.id}`, { estimateType: "HOURS" }), "estimativa em horas");
    const t = await task(req, { projectId: p.id, title: "Lançamento", assigneeId: myId, startDate: "2027-04-05", dueDate: "2027-04-09" });
    await ok(await call(req, "PATCH", `/v1/tasks/${t.id}`, { estimate: 45 }), "45 h");
    await page.goto("/tarefas/carga?de=2027-04-05&ate=2027-04-18");
    await expect(page.getByTestId("tasks-workload")).toBeVisible();
    await expect(page.locator(`[data-testid="tasks-workload-cell"][data-user="${myId}"][data-week="2027-04-05"]`)).toHaveAttribute("data-overloaded", "true");
  });
});
