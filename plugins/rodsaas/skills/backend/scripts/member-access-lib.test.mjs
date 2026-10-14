// node --test member-access-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "./member-access-lib.mjs";

const codes = (errs) => errs.map((e) => e.code);
const HELPDESK = [
  { key: "isAgent", type: "boolean", label: "É atendente", default: true },
  { key: "queueIds", type: "multiselect", label: "Filas", source: "queues", showIf: "isAgent" },
];
const COMERCIAL = [{ key: "role", type: "select", label: "Papel", required: true, default: "SELLER", options: [{ value: "COM_ADMIN" }, { value: "SELLER" }, { value: "VIEWER" }] }];
const APPS = {
  helpdesk: { label: "Suporte", fields: HELPDESK, sources: { queues: [{ value: "q1" }, { value: "q2" }] } },
  comercial: { label: "Comercial", fields: COMERCIAL },
  crm: { label: "CRM", fields: [] },
  agenda: { label: "Agenda", fields: [], enabled: false },
};

test("definição dos campos: pega erro de registro", () => {
  assert.deepEqual(A.validateFieldDefs(HELPDESK), []);
  assert.deepEqual(A.validateFieldDefs(COMERCIAL), []);
  const bad = A.validateFieldDefs([{ key: "a", type: "text", label: "A" }, { key: "a", type: "select", label: "" }, { key: "b", type: "boolean", label: "B", showIf: "zz" }]);
  assert.equal(bad.length, 6, bad.join(" | "));
  for (const part of ["tipo text", "key repetida", "sem rótulo", "showIf"]) assert.ok(bad.some((m) => m.includes(part)), part);
});

test("valor do app: padrão, campos escondidos, opções da fonte e erros por campo", () => {
  assert.deepEqual(A.validateAccessValue(HELPDESK, {}, { sources: APPS.helpdesk.sources }), { value: { isAgent: true, queueIds: [] }, errors: [] });
  assert.deepEqual(A.validateAccessValue(HELPDESK, { isAgent: false, queueIds: ["q1"] }, { sources: APPS.helpdesk.sources }).value, { isAgent: false }, "filas somem quando não é atendente");
  assert.deepEqual(A.validateAccessValue(HELPDESK, { queueIds: ["q1", "q1", "q2"] }, { sources: APPS.helpdesk.sources }).value, { isAgent: true, queueIds: ["q1", "q2"] });
  assert.deepEqual(codes(A.validateAccessValue(HELPDESK, { queueIds: ["q9"] }, { sources: APPS.helpdesk.sources }).errors), ["OPTION_INVALID"]);
  assert.deepEqual(codes(A.validateAccessValue(HELPDESK, { isAgent: "sim" }).errors), ["VALUE_INVALID"]);
  assert.deepEqual(codes(A.validateAccessValue(HELPDESK, { nope: 1 }).errors), ["UNKNOWN_FIELD"]);
  assert.deepEqual(A.validateAccessValue(COMERCIAL, {}).value, { role: "SELLER" }, "padrão do select");
  assert.deepEqual(codes(A.validateAccessValue(COMERCIAL, { role: "DONO" }).errors), ["OPTION_INVALID"]);
  assert.deepEqual(codes(A.validateAccessValue(COMERCIAL, { role: null }).errors), ["REQUIRED"]);
  assert.deepEqual(codes(A.validateAccessValue(COMERCIAL, { role: 3 }).errors), ["VALUE_INVALID"]);
  assert.deepEqual(A.validateAccessValue([], {}), { value: {}, errors: [] }, "app sem campos: só 'usa o app'");
  assert.deepEqual(codes(A.validateAccessValue(HELPDESK, [1]).errors), ["VALUE_INVALID"]);
});

test("mapa de acessos: app desconhecido, desligado, caminhos dos erros e null só no ajuste", () => {
  const r = A.normalizeAccess({ helpdesk: { options: { queueIds: ["q2"] } }, comercial: { options: { role: "VIEWER" } }, crm: {} }, APPS);
  assert.deepEqual(r, { access: { helpdesk: { isAgent: true, queueIds: ["q2"] }, comercial: { role: "VIEWER" }, crm: {} }, errors: [] });
  const e = A.normalizeAccess({ xyz: {}, agenda: {}, comercial: { options: { role: "X" } } }, APPS);
  assert.deepEqual(e.errors.map((x) => [x.path, x.code]), [["access.xyz", "UNKNOWN_APP"], ["access.agenda", "APP_DISABLED"], ["access.comercial.role", "OPTION_INVALID"]]);
  assert.deepEqual(e.access, {});
  assert.deepEqual(A.normalizeAccess({ comercial: null }, APPS).access, {}, "convite ignora null");
  assert.deepEqual(A.normalizeAccess({ comercial: null }, APPS, { allowRemove: true }).access, { comercial: null });
  assert.deepEqual(A.normalizeAccess(null, APPS), { access: {}, errors: [] });
  assert.deepEqual(codes(A.normalizeAccess("x", APPS).errors), ["VALUE_INVALID"]);
});

test("planGrant: o que vale na hora, o que vira pedido e o que pede confirmação do valor", () => {
  const access = { crm: {}, comercial: { role: "SELLER" }, financeiro: { role: "FIN_ADMIN" }, helpdesk: { isAgent: true, queueIds: [] } };
  const checks = { crm: { grantable: false, reason: "NO_SEAT" }, financeiro: { grantable: false }, helpdesk: { grantable: true, needsConfirm: true, delta: { seats: 1 } } };
  const p = A.planGrant(access, checks);
  assert.deepEqual(Object.keys(p.grant).sort(), ["comercial", "helpdesk"]);
  assert.deepEqual(p.request, { crm: { options: {}, reason: "NO_SEAT" }, financeiro: { options: { role: "FIN_ADMIN" }, reason: "NOT_GRANTABLE" } });
  assert.deepEqual(p.confirm, [{ appId: "helpdesk", delta: { seats: 1 } }]);
  assert.deepEqual(A.planGrant(access, checks, { confirm: true }).confirm, [], "confirmado não pede de novo");
  assert.deepEqual(A.planGrant({ crm: null }, {}), { grant: {}, request: {}, confirm: [] });
});

test("assentos livres contam os convites pendentes", () => {
  assert.equal(A.freeSeats({ purchased: 3, used: 2 }), 1);
  assert.equal(A.freeSeats({ purchased: 3, used: 2, reserved: 1 }), 0);
  assert.equal(A.freeSeats({ purchased: 3, used: 4 }), 0, "nunca negativo");
  assert.equal(A.freeSeats({ purchased: null, used: 50 }), Infinity, "app sem assento (por empresa)");
});

test("diffAccess: parcial, null tira, ordem das listas não importa", () => {
  const cur = { crm: {}, helpdesk: { isAgent: true, queueIds: ["q1", "q2"] }, comercial: { role: "SELLER" } };
  const d = A.diffAccess(cur, { helpdesk: { queueIds: ["q2", "q1"], isAgent: true }, comercial: { role: "VIEWER" }, financeiro: { role: "VIEWER" }, crm: null, agenda: null });
  assert.deepEqual(d, { add: ["financeiro"], change: ["comercial"], remove: ["crm"], same: ["helpdesk"] });
  assert.deepEqual(A.diffAccess(cur, {}), { add: [], change: [], remove: [], same: [] }, "app ausente não mexe");
});

test("mergeRequest: um pedido aberto por pessoa e app", () => {
  const pending = [{ id: "r1", appId: "crm", userId: "u1", options: { x: 0, y: 2 }, sources: ["INVITE"] }];
  assert.deepEqual(A.mergeRequest(pending, { appId: "crm", userId: "u2", options: {}, source: "MEMBER" }).action, "create");
  const m = A.mergeRequest(pending, { appId: "crm", userId: "u1", options: { x: 1 }, source: "MEMBER" });
  assert.equal(m.action, "update");
  assert.deepEqual([m.request.id, m.request.options, m.request.sources], ["r1", { x: 1, y: 2 }, ["INVITE", "MEMBER"]], "o pedido mais novo vale por cima");
  assert.deepEqual(A.mergeRequest([], { appId: "crm", userId: "u1", options: {}, source: "INVITE" }).request.sources, ["INVITE"]);
});
