import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuickAdd, parseDuration, formatDuration } from "./parsers.mjs";

// terça-feira, 13/10/2026
const today = { year: 2026, month: 10, day: 13 };
const members = [
  { id: "u-ana", name: "Ana Souza", email: "ana@empresa.com" },
  { id: "u-anderson", name: "Anderson Lima", email: "anderson@empresa.com" },
  { id: "u-bruno", name: "Bruno Lima", email: "bruno.lima@empresa.com" },
  { id: "u-joao", name: "João Pereira", email: "jp@empresa.com" },
];
const labels = [
  { id: "l-bug", name: "Bug" },
  { id: "l-jur", name: "Jurídico" },
  { id: "l-urg", name: "Urgente cliente" },
];
const ctx = { members, labels, today };

test("frase completa", () => {
  const r = parseQuickAdd("Revisar contrato @ana !alta #juridico amanhã ~3", ctx);
  assert.equal(r.title, "Revisar contrato");
  assert.equal(r.assigneeId, "u-ana");
  assert.equal(r.priority, "HIGH");
  assert.deepEqual(r.labelIds, ["l-jur"]);
  assert.equal(r.dueDate, "2026-10-14");
  assert.equal(r.estimate, 3);
  assert.equal(r.spans.length, 5);
});

test("datas relativas", () => {
  assert.equal(parseQuickAdd("x hoje", ctx).dueDate, "2026-10-13");
  assert.equal(parseQuickAdd("x depois de amanhã", ctx).dueDate, "2026-10-15");
  assert.equal(parseQuickAdd("x em 10 dias", ctx).dueDate, "2026-10-23");
  assert.equal(parseQuickAdd("x em 2 semanas", ctx).dueDate, "2026-10-27");
  assert.equal(parseQuickAdd("Ligar para cliente depois de amanhã", ctx).title, "Ligar para cliente");
});

test("dia da semana é sempre a próxima ocorrência", () => {
  assert.equal(parseQuickAdd("x sexta", ctx).dueDate, "2026-10-16");
  assert.equal(parseQuickAdd("x terça", ctx).dueDate, "2026-10-20"); // hoje é terça → semana que vem
  assert.equal(parseQuickAdd("x segunda-feira", ctx).dueDate, "2026-10-19");
  assert.equal(parseQuickAdd("x sábado", ctx).dueDate, "2026-10-17");
});

test("dd/mm e dd/mm/aaaa", () => {
  assert.equal(parseQuickAdd("x 20/10", ctx).dueDate, "2026-10-20");
  assert.equal(parseQuickAdd("x 05/01", ctx).dueDate, "2027-01-05"); // já passou → ano que vem
  assert.equal(parseQuickAdd("x 31/12/2027", ctx).dueDate, "2027-12-31");
  assert.equal(parseQuickAdd("x 15/03/27", ctx).dueDate, "2027-03-15");
  const invalid = parseQuickAdd("x 31/02", ctx);
  assert.equal(invalid.dueDate, null);
  assert.equal(invalid.title, "x 31/02");
});

test("só a primeira data vale", () => {
  const r = parseQuickAdd("Reunião sexta hoje", ctx);
  assert.equal(r.dueDate, "2026-10-16");
  assert.equal(r.title, "Reunião hoje");
});

test("menções", () => {
  assert.equal(parseQuickAdd("x @bruno", ctx).assigneeId, "u-bruno");
  assert.equal(parseQuickAdd("x @joao", ctx).assigneeId, "u-joao");          // sem acento acha João
  assert.equal(parseQuickAdd("x @jp", ctx).assigneeId, "u-joao");            // parte local do e-mail
  assert.equal(parseQuickAdd("x @ana", ctx).assigneeId, "u-ana");            // exato vence o prefixo (Anderson)
  const amb = parseQuickAdd("x @an", ctx);                                    // Ana e Anderson
  assert.equal(amb.assigneeId, null);
  assert.deepEqual(amb.unresolvedMentions, ["an"]);
  assert.equal(amb.title, "x @an");
  const nobody = parseQuickAdd("Falar com @carla", ctx);
  assert.equal(nobody.assigneeId, null);
  assert.equal(nobody.title, "Falar com @carla");
});

test("e-mail no meio do texto não vira menção", () => {
  const r = parseQuickAdd("Responder ana@empresa.com amanhã", ctx);
  assert.equal(r.assigneeId, null);
  assert.equal(r.title, "Responder ana@empresa.com");
});

test("prioridades", () => {
  assert.equal(parseQuickAdd("x !urgente", ctx).priority, "URGENT");
  assert.equal(parseQuickAdd("x !média", ctx).priority, "MEDIUM");
  assert.equal(parseQuickAdd("x !4", ctx).priority, "LOW");
  const r = parseQuickAdd("Atenção !importante", ctx);
  assert.equal(r.priority, null);
  assert.equal(r.title, "Atenção !importante");
});

test("etiquetas", () => {
  const r = parseQuickAdd("Corrigir login #bug #bug #novidade", ctx);
  assert.deepEqual(r.labelIds, ["l-bug"]);
  assert.deepEqual(r.newLabels, ["novidade"]);
  assert.equal(r.title, "Corrigir login");
  assert.deepEqual(parseQuickAdd("x #urgente-cliente", ctx).labelIds, ["l-urg"]);
  const issue = parseQuickAdd("Ver issue #45", ctx);
  assert.equal(issue.title, "Ver issue #45");
  assert.deepEqual(issue.labelIds, []);
});

test("estimativa", () => {
  assert.equal(parseQuickAdd("x ~1,5", ctx).estimate, 1.5);
  assert.equal(parseQuickAdd("x ~8", ctx).estimate, 8);
});

test("pontuação colada e espaços", () => {
  const r = parseQuickAdd("  Enviar   proposta,  amanhã.  ", ctx);
  assert.equal(r.dueDate, "2026-10-14");
  assert.equal(r.title, "Enviar proposta,");
});

test("título vazio quando só há atalhos", () => {
  assert.equal(parseQuickAdd("@ana amanhã", ctx).title, "");
});

test("parseDuration", () => {
  const cases = {
    "1h30": 90, "1h 30m": 90, "1h30min": 90, "90m": 90, "90min": 90, "45 min": 45,
    "1,5": 90, "1.5h": 90, "2": 120, "2h": 120, "2 horas": 120, "1:30": 90, "0:15": 15, "0,25": 15,
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(parseDuration(input), expected, input);
  for (const bad of ["", "abc", "0", "25h", "1h99", "-1", "1:75"]) assert.equal(parseDuration(bad), null, bad);
});

test("formatDuration", () => {
  assert.equal(formatDuration(90), "1h 30min");
  assert.equal(formatDuration(120), "2h");
  assert.equal(formatDuration(45), "45min");
  assert.equal(formatDuration(0), "0min");
  assert.equal(formatDuration(1505), "25h 5min");
});
