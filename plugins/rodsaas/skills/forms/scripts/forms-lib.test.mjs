import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as L from "./forms-lib.mjs";

const templates = JSON.parse(readFileSync(new URL("./templates.json", import.meta.url), "utf8"));
const byId = (id) => templates.find((t) => t.id === id).schema;
const now = new Date("2026-10-14T02:30:00Z"); // 23:30 de 13/10 em São Paulo
const tz = "America/Sao_Paulo";

test("todos os modelos são esquemas válidos", () => {
  assert.equal(templates.length, 8);
  for (const t of templates) assert.deepEqual(L.validateSchema(t.schema), [], t.id);
});

test("validateSchema pega os erros comuns", () => {
  const errs = L.validateSchema({
    version: 1,
    fields: [
      { id: "f_a", type: "short_text", label: "A" },
      { id: "f_a", type: "short_text", label: "Repetido" },
      { id: "Ruim", type: "short_text", label: "id ruim" },
      { id: "f_b", type: "single_choice", label: "B", options: [] },
      { id: "f_c", type: "dropdown", label: "C", options: [{ id: "o1", label: "x" }, { id: "o1", label: "y" }] },
      { id: "f_d", type: "xyz", label: "D" },
      { id: "f_e", type: "short_text", label: "" },
      { id: "f_f", type: "short_text", label: "F", visibleIf: { match: "all", rules: [{ field: "f_z", op: "eq", value: "1" }] } },
      { id: "f_g", type: "short_text", label: "G", visibleIf: { match: "all", rules: [{ field: "f_a", op: "gt", value: 1 }] } },
      { id: "f_h", type: "short_text", label: "H", visibleIf: { match: "all", rules: [{ field: "f_c", op: "eq", value: "nao_existe" }] } },
      { id: "f_i", type: "scale", label: "I", settings: { min: 5, max: 5 } },
      { id: "f_z", type: "short_text", label: "Z" },
    ],
    hidden: [{ key: "f_a" }, { key: "1x" }],
  });
  const paths = errs.map((e) => e.path);
  for (const p of ["fields.1.id", "fields.2.id", "fields.3.options", "fields.4.options.1.id", "fields.5.type", "fields.6.label", "fields.7.visibleIf.rules.0", "fields.8.visibleIf.rules.0", "fields.9.visibleIf.rules.0", "fields.10.settings", "hidden.0.key", "hidden.1.key"])
    assert.ok(paths.includes(p), `esperava erro em ${p}: ${JSON.stringify(paths)}`);
  assert.equal(L.validateSchema(null)[0].path, "schema");
  assert.equal(L.validateSchema({ version: 2, fields: [] })[0].path, "version");
});

test("pagesOf e páginas com lógica", () => {
  const s = byId("orcamento");
  const pages = L.pagesOf(s);
  assert.equal(pages.length, 2);
  assert.equal(pages[1].title, "Sobre o pedido");
  assert.deepEqual(pages[0].fields.map((f) => f.id), ["f_tipo", "f_nome", "f_empresa", "f_cnpj", "f_email", "f_whats"]);
  const withPageLogic = { version: 1, fields: [
    { id: "f_q", type: "yes_no", label: "Tem empresa?" },
    { id: "p_emp", type: "page", label: "Empresa", visibleIf: { match: "all", rules: [{ field: "f_q", op: "eq", value: true }] } },
    { id: "f_cnpj", type: "cnpj", label: "CNPJ", required: true },
    { id: "p_fim", type: "page", label: "Fim" },
    { id: "f_obs", type: "long_text", label: "Obs" },
  ] };
  assert.deepEqual(L.visiblePages(withPageLogic, {}).map((p) => p.title), [null, "Fim"]);
  assert.deepEqual(L.visiblePages(withPageLogic, { f_q: true }).map((p) => p.title), [null, "Empresa", "Fim"]);
  assert.deepEqual(L.validateAnswers(withPageLogic, { f_q: false }).errors, [], "página escondida não exige o CNPJ");
  assert.equal(L.validateAnswers(withPageLogic, { f_q: true }).errors[0].path, "answers.f_cnpj");
});

test("lógica: escolha, números, texto e cadeia", () => {
  const s = byId("orcamento");
  assert.ok(!L.visibleFieldIds(s, {}).has("f_empresa"));
  assert.ok(!L.visibleFieldIds(s, { f_tipo: "o_pf" }).has("f_empresa"));
  assert.ok(L.visibleFieldIds(s, { f_tipo: "o_pj" }).has("f_cnpj"));
  const nps = byId("nps");
  const vis = (v) => [...L.visibleFieldIds(nps, { f_nps: v })].filter((id) => id.startsWith("f_motivo"));
  assert.deepEqual(vis(3), ["f_motivo_baixo"]);
  assert.deepEqual(vis(7), ["f_motivo_medio"]);
  assert.deepEqual(vis(10), ["f_motivo_alto"]);
  assert.deepEqual(vis(undefined), []);
  assert.ok(L.visibleFieldIds(nps, { f_contato: true }).has("f_email"));
  const chain = { version: 1, fields: [
    { id: "f_a", type: "yes_no", label: "A" },
    { id: "f_b", type: "short_text", label: "B", visibleIf: { match: "all", rules: [{ field: "f_a", op: "eq", value: true }] } },
    { id: "f_c", type: "short_text", label: "C", visibleIf: { match: "all", rules: [{ field: "f_b", op: "contains", value: "sim" }] } },
    { id: "f_d", type: "multiple_choice", label: "D", options: [{ id: "o1", label: "1" }, { id: "o2", label: "2" }] },
    { id: "f_e", type: "short_text", label: "E", visibleIf: { match: "any", rules: [{ field: "f_d", op: "contains", value: "o2" }, { field: "f_a", op: "not_answered" }] } },
  ] };
  assert.ok(L.visibleFieldIds(chain, { f_a: true, f_b: "Sim, claro" }).has("f_c"));
  assert.ok(!L.visibleFieldIds(chain, { f_a: false, f_b: "Sim, claro" }).has("f_c"), "resposta de campo escondido não conta");
  assert.ok(L.visibleFieldIds(chain, {}).has("f_e"));
  assert.ok(!L.visibleFieldIds(chain, { f_a: false, f_d: { selected: ["o1"] } }).has("f_e"));
  assert.ok(L.visibleFieldIds(chain, { f_a: false, f_d: { selected: ["o1", "o2"] } }).has("f_e"));
});

test("validateAnswers: formulário de orçamento completo e normalizado", () => {
  const s = byId("orcamento");
  const r = L.validateAnswers(s, {
    f_tipo: "o_pj", f_nome: "  Ana Souza ", f_empresa: "Acme", f_cnpj: "12.abc.345/01de-35", f_email: "ANA@Acme.com.br",
    f_whats: "(44) 99999-1234", f_servicos: { selected: ["o_site", "o_app", "o_site"], other: "Integração" },
    f_verba: 1500000, f_prazo: "2026-11-01", f_detalhes: "Preciso de um site", f_lixo: "ignorado",
  }, { now, timeZone: tz });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value, {
    f_tipo: "o_pj", f_nome: "Ana Souza", f_empresa: "Acme", f_cnpj: "12ABC34501DE35", f_email: "ana@acme.com.br",
    f_whats: "5544999991234", f_servicos: { selected: ["o_site", "o_app"], other: "Integração" }, f_verba: 1500000,
    f_prazo: "2026-11-01", f_detalhes: "Preciso de um site",
  });
});

test("validateAnswers: obrigatórios, lógica e erros por campo", () => {
  const s = byId("orcamento");
  const r = L.validateAnswers(s, { f_tipo: "o_pf", f_email: "x@", f_whats: "123", f_prazo: "2026-10-12", f_servicos: { selected: [] } }, { now, timeZone: tz });
  const paths = Object.fromEntries(r.errors.map((e) => [e.path, e.message]));
  assert.deepEqual(Object.keys(paths).sort(), ["answers.f_email", "answers.f_nome", "answers.f_prazo", "answers.f_servicos", "answers.f_whats"].sort());
  assert.equal(paths["answers.f_prazo"], "Data antes do permitido", "mínimo 'hoje' no fuso da empresa (13/10)");
  assert.ok(!("answers.f_empresa" in paths), "empresa escondida não é exigida");
  assert.deepEqual(L.validateAnswers(s, { f_tipo: "o_pf", f_empresa: "Não grava" }).value.f_empresa, undefined, "resposta de campo escondido é descartada");
  assert.equal(L.validateAnswers(s, { f_prazo: "2026-10-13" }, { now, timeZone: tz }).errors.find((e) => e.path === "answers.f_prazo"), undefined, "hoje é permitido");
});

test("validateAnswers: cada tipo", () => {
  const s = { version: 1, fields: [
    { id: "f_rat", type: "rating", label: "r", settings: { max: 5 } },
    { id: "f_nps", type: "nps", label: "n" },
    { id: "f_sc", type: "scale", label: "s", settings: { min: 0, max: 3 } },
    { id: "f_num", type: "number", label: "n", validation: { min: 1, max: 10, integer: true } },
    { id: "f_one", type: "single_choice", label: "o", allowOther: true, options: [{ id: "o1", label: "Um" }] },
    { id: "f_yn", type: "yes_no", label: "y" },
    { id: "f_t", type: "time", label: "t" },
    { id: "f_addr", type: "address", label: "a" },
    { id: "f_file", type: "file", label: "f", settings: { maxFiles: 2 } },
    { id: "f_ok", type: "consent", label: "c", required: true },
    { id: "f_cpf", type: "cpf", label: "cpf" },
    { id: "f_info", type: "statement", label: "Só texto" },
  ] };
  const good = L.validateAnswers(s, {
    f_rat: 5, f_nps: 0, f_sc: 0, f_num: "7", f_one: { other: " Outro texto " }, f_yn: false, f_t: "09:30",
    f_addr: { cep: "87.020-000", street: "Av. Brasil", number: "100", city: "Maringá", state: "pr" },
    f_file: ["0192b5c4-1111-7000-8000-000000000001"], f_ok: true, f_cpf: "529.982.247-25", f_info: "ignorado",
  });
  assert.deepEqual(good.errors, []);
  assert.deepEqual(good.value.f_one, { other: "Outro texto" });
  assert.equal(good.value.f_num, 7);
  assert.deepEqual(good.value.f_addr, { cep: "87020000", street: "Av. Brasil", number: "100", complement: null, district: null, city: "Maringá", state: "PR" });
  assert.equal(good.value.f_info, undefined);
  const bad = L.validateAnswers(s, {
    f_rat: 6, f_nps: 11, f_sc: 4, f_num: 1.5, f_one: "o9", f_yn: "sim", f_t: "24:00", f_addr: { cep: "123" },
    f_file: ["a", "b"], f_ok: false, f_cpf: "111.111.111-11",
  });
  assert.equal(bad.errors.length, 11, JSON.stringify(bad.errors));
  const fc = L.validateAnswers(s, { f_ok: true, f_file: ["0192b5c4-1111-7000-8000-000000000001"] }, { fileCheck: () => "Arquivo não encontrado ou de outro formulário" });
  assert.equal(fc.errors[0].message, "Arquivo não encontrado ou de outro formulário");
});

test("ocultos, e-mail do respondente e texto para busca", () => {
  const s = byId("contato");
  assert.deepEqual(L.pickHidden(s, new URLSearchParams("utm_source=google&utm_campaign=bf&x=1")), { utm_source: "google", utm_campaign: "bf" });
  const { value } = L.validateAnswers(s, { f_nome: "Ana", f_email: "Ana@x.com", f_assunto: "o_orcamento", f_msg: "Oi", f_lgpd: true });
  assert.equal(L.respondentEmail(s, value), "ana@x.com");
  assert.equal(L.answersText(s, value), "Ana \n ana@x.com \n Orçamento \n Oi");
});

test("npsScore e resumo por pergunta", () => {
  assert.deepEqual(L.npsScore([10, 9, 9, 8, 7, 6, 0, 10, 3, 5]), { count: 10, promoters: 4, passives: 2, detractors: 4, score: 0 });
  assert.deepEqual(L.npsScore([10, 10, 9]).score, 100);
  assert.equal(L.npsScore([]).score, null);
  const s = { version: 1, fields: [
    { id: "f_c", type: "single_choice", label: "Cor", allowOther: true, options: [{ id: "o_a", label: "Azul" }, { id: "o_v", label: "Verde" }] },
    { id: "f_m", type: "multiple_choice", label: "Canais", options: [{ id: "o_x", label: "X" }, { id: "o_y", label: "Y" }] },
    { id: "f_r", type: "rating", label: "Nota", settings: { max: 5 } },
    { id: "f_n", type: "nps", label: "NPS" },
    { id: "f_t", type: "short_text", label: "Texto" },
    { id: "f_y", type: "yes_no", label: "Sim?" },
  ] };
  const rs = [
    { answers: { f_c: "o_a", f_m: { selected: ["o_x", "o_y"] }, f_r: 5, f_n: 10, f_t: "um", f_y: true } },
    { answers: { f_c: "o_a", f_m: { selected: ["o_y"] }, f_r: 3, f_n: 6, f_t: "dois", f_y: false } },
    { answers: { f_c: { other: "Roxo" }, f_r: 4, f_n: 9, f_y: true } },
    { answers: {} },
  ];
  const sum = Object.fromEntries(L.summarize(s, rs).map((x) => [x.fieldId, x]));
  assert.deepEqual(sum.f_c.options.map((o) => [o.label, o.count, o.pct]), [["Azul", 2, 66.7], ["Verde", 0, 0]]);
  assert.equal(sum.f_c.other, 1);
  assert.equal(sum.f_c.skipped, 1);
  assert.deepEqual(sum.f_m.options.map((o) => o.count), [1, 2]);
  assert.equal(sum.f_r.average, 4);
  assert.deepEqual(sum.f_r.distribution, { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 });
  assert.equal(sum.f_n.nps.score, 33);
  assert.deepEqual(sum.f_t.latest, ["dois", "um"]);
  assert.deepEqual([sum.f_y.yes, sum.f_y.no], [2, 1]);
});

test("CSV de respostas: Excel pt-BR, colunas removidas, ocultos e proteção de fórmula", () => {
  const s = byId("contato");
  const csv = L.responsesToCsv(s, [
    { submittedAt: "2026-10-13T17:05:00Z", answers: { f_nome: "=Ana", f_email: "ana@x.com", f_whats: "5544999991234", f_assunto: "o_suporte", f_msg: "linha 1\nlinha; 2", f_lgpd: true, f_antigo: "velho" }, hidden: { utm_source: "google" } },
  ], { removedFields: [{ id: "f_antigo", label: "Pergunta antiga", type: "short_text" }] });
  assert.ok(csv.startsWith("﻿Enviado em;Seu nome;Seu e-mail;WhatsApp;Assunto;Mensagem;"));
  assert.ok(csv.includes("Pergunta antiga;utm_source;utm_medium;utm_campaign"));
  const row = csv.split("\r\n")[1];
  assert.ok(row.startsWith("13/10/2026"), row);
  assert.ok(row.includes(";'=Ana;ana@x.com;(44) 99999-1234;Suporte;\"linha 1\nlinha; 2\";Concordou;velho;google;;"), row);
});

test("displayAnswer formata cada tipo", () => {
  const f = (type, extra = {}) => ({ id: "x", type, label: "x", ...extra });
  assert.equal(L.displayAnswer(f("money"), 150000).replace(/\s/g, " "), "R$ 1.500,00");
  assert.equal(L.displayAnswer(f("date"), "2026-10-13"), "13/10/2026");
  assert.equal(L.displayAnswer(f("phone"), "554430251234"), "(44) 3025-1234");
  assert.equal(L.displayAnswer(f("cpf"), "52998224725"), "529.982.247-25");
  assert.equal(L.displayAnswer(f("cnpj"), "11222333000181"), "11.222.333/0001-81");
  assert.equal(L.displayAnswer(f("dropdown", { options: [{ id: "o1", label: "Um" }] }), "o9"), "(opção removida)");
  assert.equal(L.displayAnswer(f("address"), { cep: "87020000", street: "Av. Brasil", number: "100", city: "Maringá", state: "PR" }), "Av. Brasil, 100, Maringá/PR, 87020-000");
  assert.equal(L.displayAnswer(f("short_text"), ""), "");
});

test("slug, ids e passos do modo uma por vez", () => {
  let i = 0;
  const seq = () => [0.1, 0.5, 0.9, 0.3, 0.7, 0.2][i++ % 6];
  assert.match(L.formSlug("Orçamento do Site!", seq), /^orcamento-do-site-[a-z2-9]{6}$/);
  assert.match(L.formSlug("!!!"), /^formulario-[a-z2-9]{6}$/);
  assert.ok(L.isValidSlug("orcamento-k3x9ab"));
  assert.ok(!L.isValidSlug("-ruim") && !L.isValidSlug("a") && !L.isValidSlug("Maiuscula"));
  const id = L.newId("f_", ["f_aaaaaa"]);
  assert.match(id, /^f_[a-z2-9]{6}$/);
  const steps = L.stepsOf(byId("nps"), { f_nps: 9 }).map((f) => f.id);
  assert.deepEqual(steps, ["f_nps", "f_motivo_alto", "f_contato"]);
});

test("webhook: assina, confere, recusa adulterado e fora da janela", () => {
  const body = JSON.stringify({ event: "form.response.created", id: "r1" });
  const sig = L.signWebhook(body, "segredo", 1_760_000_000);
  assert.match(sig, /^t=1760000000,v1=[0-9a-f]{64}$/);
  assert.ok(L.verifyWebhook(body, sig, "segredo", 1_760_000_100));
  assert.ok(!L.verifyWebhook(body + " ", sig, "segredo", 1_760_000_100));
  assert.ok(!L.verifyWebhook(body, sig, "outro", 1_760_000_100));
  assert.ok(!L.verifyWebhook(body, sig, "segredo", 1_760_001_000));
  assert.ok(!L.verifyWebhook(body, "lixo", "segredo"));
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(L.webhookBackoff), [60, 300, 1800, 7200, 21600, null]);
});

test("leadFromResponse monta o lead do CRM", () => {
  const s = byId("orcamento");
  const { value } = L.validateAnswers(s, { f_tipo: "o_pj", f_nome: "Ana", f_empresa: "Acme", f_email: "ana@acme.com.br", f_whats: "44999991234", f_servicos: { selected: ["o_site"] }, f_verba: 500000, f_detalhes: "Urgente" }, { now, timeZone: tz });
  const out = L.leadFromResponse(s, value, { personName: "f_nome", email: "f_email", phone: "f_whats", companyName: "f_empresa", value: "f_verba", message: ["f_servicos", "f_detalhes"] }, { formTitle: "Orçamento", hidden: { utm_source: "meta", outro: "x" } });
  assert.deepEqual(out.lead, { personName: "Ana", email: "ana@acme.com.br", phone: "5544999991234", companyName: "Acme", cnpj: null, value: 500000, message: "O que você precisa?: Site\nConte um pouco mais: Urgente" });
  assert.deepEqual(out.extra, { "Você é": "Empresa" });
  assert.deepEqual(out.utm, { utm_source: "meta" });
  assert.equal(out.title, "Ana · Orçamento");
});

// ================================================================== operação avançada e perfis
const PNG = "data:image/png;base64," + "iVBORw0KGgo".padEnd(200, "A");
const sch = (fields, extra = {}) => ({ version: 1, fields, ...extra });
test("fórmula: precedência, parênteses, funções, referências, erros e divisão por zero", () => {
  const ev = (t, v = {}) => { const p = L.parseFormula(t); assert.ok(p.ok, p.error); return L.evalFormula(p.ast, v); };
  assert.equal(ev("2 + 3 * 4"), 14);
  assert.equal(ev("(2 + 3) * 4"), 20);
  assert.equal(ev("10 - 4 - 3"), 3, "esquerda para a direita");
  assert.equal(ev("12 / 4 / 3"), 1);
  assert.equal(ev("-3 + 5"), 2);
  assert.equal(ev("- (2 * 3)"), -6);
  assert.equal(ev("{qtd} * 150 + {extra}", { qtd: 3, extra: 25 }), 475);
  assert.equal(ev("{qtd} * 2", {}), 0, "sem resposta = 0");
  assert.equal(ev("min(5, 2, 9) + max(1, 7)"), 9);
  assert.equal(ev("round(10 / 3, 2)"), 3.33);
  assert.equal(ev("round(2.5)"), 3);
  assert.equal(ev("0.1 + 0.2"), 0.3, "sem erro de ponto flutuante");
  assert.equal(ev("10 / ({aa} - {aa})", { aa: 2 }), null, "divisão por zero não vira infinito");
  assert.equal(ev("min(1, 10 / 0)"), null);
  assert.deepEqual(L.parseFormula("{qtd} * {preco_unit} + {qtd}").refs, ["qtd", "preco_unit"]);
  for (const bad of ["2 +", "(1 + 2", "1 + 2)", "{Qtd} + 1", "{qtd + 1", "foo(1)", "1 $ 2", "round(1, 2, 3)", "", "1..2"]) assert.equal(L.parseFormula(bad).ok, false, bad);
});

test("cálculo e quiz no esquema: validação, valores das perguntas, pontos e resultado", () => {
  const fields = [
    { id: "qtd", type: "number", label: "Quantas pessoas?" },
    { id: "plano", type: "single_choice", label: "Plano", options: [{ id: "a", label: "Básico", points: 100 }, { id: "b", label: "Pro", points: 250 }] },
    { id: "extras", type: "multiple_choice", label: "Extras", options: [{ id: "x", label: "X", points: 10 }, { id: "y", label: "Y", points: 5 }] },
    { id: "frete", type: "yes_no", label: "Entrega?" },
    { id: "pay", type: "payment", label: "Pagar", settings: { amountFrom: "total" } },
  ];
  const calcs = [{ id: "sub", label: "Subtotal", formula: "{qtd} * {plano} + {extras}" }, { id: "total", label: "Total", formula: "{sub} * 100 + {frete} * 1500", format: "money" }];
  assert.deepEqual(L.validateSchema(sch(fields, { calculations: calcs })), []);
  assert.deepEqual(L.validateSchema(sch(fields, { calculations: [{ id: "total", label: "T", formula: "{nada} + 1" }] })).map((e) => e.path), ["calculations.0.formula"]);
  assert.deepEqual(L.validateSchema(sch(fields, { calculations: [{ id: "qtd", label: "Repetido", formula: "1" }, { id: "total", label: "T", formula: "1" }] })).map((e) => e.path), ["calculations.0.id"]);
  assert.deepEqual(L.validateSchema(sch(fields, { calculations: [{ id: "total", label: "", formula: "1 +", format: "x" }] })).map((e) => e.path), ["calculations.0.label", "calculations.0.formula", "calculations.0.format"]);
  assert.deepEqual(L.validateSchema(sch(fields, { calculations: [{ id: "total", label: "T", formula: "{depois}" }, { id: "depois", label: "D", formula: "1" }] })).map((e) => e.path), ["calculations.0.formula"], "cálculo só usa os anteriores");
  assert.deepEqual(L.validateSchema(sch(fields)).map((e) => e.path), ["fields.4.settings.amountFrom"], "pagamento de cálculo que não existe");
  const ans = { qtd: 3, plano: "b", extras: { selected: ["x", "y"] }, frete: true };
  assert.deepEqual(L.computeCalculations(sch(fields, { calculations: calcs }), ans), { sub: 765, total: 78000 });
  assert.equal(L.paymentAmount(sch(fields, { calculations: calcs }), ans), 78000);
  assert.equal(L.paymentAmount(sch(fields, { calculations: calcs }), {}), 0);
  assert.equal(L.fieldNumber({ type: "money" }, 1990), 1990);
  assert.equal(L.fieldNumber({ type: "short_text" }, "12"), 0, "texto não entra na conta");
  assert.equal(L.fieldNumber({ type: "yes_no" }, false), 0);
  const hidden = [{ id: "tem", type: "yes_no", label: "Tem?" }, { id: "nn", type: "number", label: "N", visibleIf: { match: "all", rules: [{ field: "tem", op: "eq", value: "true" }] } }];
  assert.deepEqual(L.computeCalculations(sch(hidden, { calculations: [{ id: "cc", label: "C", formula: "{nn} * 2" }] }), { tem: false, nn: 9 }), { cc: 0 }, "pergunta escondida vale 0");
  const quiz = sch([
    { id: "q1", type: "single_choice", label: "2+2", options: [{ id: "a", label: "4" }, { id: "b", label: "5" }], correct: "a" },
    { id: "q2", type: "multiple_choice", label: "Pares", options: [{ id: "a", label: "2" }, { id: "b", label: "3" }, { id: "c", label: "4" }], correct: ["a", "c"], points: 2 },
    { id: "q3", type: "single_choice", label: "Sem gabarito", options: [{ id: "a", label: "x" }] },
  ], { quiz: { passPct: 60, outcomes: [{ min: 0, max: 59.9, title: "Estude mais" }, { min: 60, max: 100, title: "Mandou bem", message: "Parabéns" }] } });
  assert.deepEqual(L.validateSchema(quiz), []);
  const r = L.quizScore(quiz, { q1: "a", q2: { selected: ["c", "a"] } });
  assert.deepEqual([r.score, r.max, r.pct, r.passed, r.outcome.title], [3, 3, 100, true, "Mandou bem"]);
  const r2 = L.quizScore(quiz, { q1: "a", q2: { selected: ["a"] } });
  assert.deepEqual([r2.score, r2.pct, r2.passed, r2.outcome.title], [1, 33.3, false, "Estude mais"], "múltipla só conta inteira certa");
  assert.deepEqual(L.quizScore(quiz, { q1: "b", q2: { selected: ["a", "b", "c"] } }).perField.map((x) => x.correct), [false, false]);
  assert.deepEqual(L.quizScore(sch([{ id: "zz", type: "short_text", label: "z" }]), {}), { score: 0, max: 0, pct: null, passed: null, outcome: null, perField: [] });
  assert.deepEqual(L.validateSchema(sch([{ id: "qq", type: "single_choice", label: "Q", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], correct: ["a", "b"] }])).map((e) => e.path), ["fields.0.correct"]);
  assert.deepEqual(L.validateSchema(sch([{ id: "qq", type: "single_choice", label: "Q", options: [{ id: "a", label: "A" }], correct: "z" }])).map((e) => e.path), ["fields.0.correct"]);
  assert.deepEqual(L.validateSchema(sch([{ id: "qq", type: "short_text", label: "Q", correct: "a" }])).map((e) => e.path), ["fields.0.correct"]);
  assert.deepEqual(L.validateSchema(sch([], { quiz: { passPct: 120, outcomes: [{ min: 50, max: 10, title: "" }] } })).map((e) => e.path), ["quiz.passPct", "quiz.outcomes.0", "quiz.outcomes.0.title"]);
});

test("pagamento e assinatura no esquema e nas respostas", () => {
  assert.deepEqual(L.validateSchema(sch([{ id: "pg", type: "payment", label: "Pagar", settings: { amountCents: 49 } }])).map((e) => e.path), ["fields.0.settings.amountCents"]);
  assert.deepEqual(L.validateSchema(sch([{ id: "pg", type: "payment", label: "Pagar", settings: {} }])).map((e) => e.path), ["fields.0.settings"]);
  assert.deepEqual(L.validateSchema(sch([{ id: "pg", type: "payment", label: "Pagar", settings: { amountCents: 100, amountFrom: "x" } }])).map((e) => e.path).slice(0, 1), ["fields.0.settings"]);
  assert.deepEqual(L.validateSchema(sch([{ id: "pg", type: "payment", label: "Pagar", settings: { amountCents: 50, methods: ["pix", "ted"] } }])).map((e) => e.path), ["fields.0.settings.methods"]);
  assert.deepEqual(L.validateSchema(sch([{ id: "pg", type: "payment", label: "A", settings: { amountCents: 50 } }, { id: "qq", type: "payment", label: "B", settings: { amountCents: 50 } }])).map((e) => e.path), ["fields"]);
  assert.equal(L.paymentAmount(sch([{ id: "pg", type: "payment", label: "Pagar", settings: { amountCents: 5000 } }]), {}), 5000);
  assert.equal(L.paymentAmount(sch([{ id: "nn", type: "short_text", label: "N" }]), {}), null);
  assert.equal(L.validateSignatureData({ dataUrl: PNG, strokes: 3 }), null);
  assert.equal(L.validateSignatureData("6f9619ff-8b86-d011-b42d-00c04fc964ff"), null, "arquivo já enviado");
  assert.equal(L.validateSignatureData("x"), "Assinatura inválida");
  assert.equal(L.validateSignatureData({ dataUrl: "data:image/jpeg;base64,AAAA", strokes: 3 }), "Assinatura precisa ser uma imagem PNG");
  assert.equal(L.validateSignatureData({ dataUrl: PNG, strokes: 0 }), "Assine no quadro");
  assert.equal(L.validateSignatureData({ dataUrl: "data:image/png;base64," + "A".repeat(200_004), strokes: 1 }), "Assinatura grande demais");
  assert.equal(L.validateSignatureData({ dataUrl: "data:image/png;base64," + "A".repeat(200_000), strokes: 1 }), null, "150 KB exatos");
  assert.equal(L.validateSignatureData({ dataUrl: PNG, strokes: 1, name: "Ana" }, { requireName: true }), "Escreva o nome completo");
  assert.equal(L.validateSignatureData({ dataUrl: PNG, strokes: 1, name: "Ana Souza" }, { requireName: true }), null);
  const s = sch([{ id: "ass", type: "signature", label: "Assinatura", required: true, settings: { requireName: true } }]);
  assert.deepEqual(L.validateSchema(s), []);
  assert.deepEqual(L.validateSchema(sch([{ id: "ass", type: "signature", label: "A", settings: { requireName: "sim" } }])).map((e) => e.path), ["fields.0.settings.requireName"]);
  assert.deepEqual(L.validateAnswers(s, {}).errors.map((e) => e.path), ["answers.ass"]);
  assert.deepEqual(L.validateAnswers(s, { ass: { dataUrl: PNG, strokes: 2, name: "  Ana Souza " } }).value, { ass: { dataUrl: PNG, strokes: 2, name: "Ana Souza" } });
  assert.equal(L.displayAnswer(s.fields[0], { dataUrl: PNG, strokes: 2, name: "Ana Souza" }), "Assinado por Ana Souza");
  assert.equal(L.displayAnswer(s.fields[0], "6f9619ff-8b86-d011-b42d-00c04fc964ff"), "Assinado");
});

test("resposta parcial: progresso, junção e onde as pessoas param", () => {
  const s = sch([{ id: "nome", type: "short_text", label: "Seu nome" }, { id: "info", type: "statement", label: "Info" }, { id: "email", type: "email", label: "E-mail" }, { id: "tem", type: "yes_no", label: "Tem empresa?" }, { id: "cnpj", type: "cnpj", label: "CNPJ", visibleIf: { match: "all", rules: [{ field: "tem", op: "eq", value: "true" }] } }]);
  assert.deepEqual(L.partialProgress(s, { nome: "Ana" }), { answered: 1, total: 3, pct: 33, lastFieldId: "nome" });
  assert.deepEqual(L.partialProgress(s, { nome: "Ana", tem: true }), { answered: 2, total: 4, pct: 50, lastFieldId: "tem" }, "pergunta que aparece entra no total");
  assert.deepEqual(L.partialProgress(s, {}), { answered: 0, total: 3, pct: 0, lastFieldId: null });
  assert.deepEqual(L.partialProgress(sch([]), {}).pct, 0);
  assert.deepEqual(L.mergePartial({ nome: "Ana", email: "a@x.com" }, { email: "", tem: false }), { nome: "Ana", tem: false });
  assert.deepEqual(L.mergePartial(null, { nome: "B" }), { nome: "B" });
  assert.deepEqual(L.dropOff(s, [{ lastFieldId: "nome" }, { lastFieldId: "nome" }, { lastFieldId: null }, { lastFieldId: "email", completed: true }, { lastFieldId: "sumiu" }]), [{ fieldId: null, stopped: 2 }, { fieldId: "nome", stopped: 2 }, { fieldId: "email", stopped: 0 }, { fieldId: "tem", stopped: 0 }, { fieldId: "cnpj", stopped: 0 }]);
});

test("resposta para agenda e chamado: contato e assunto", () => {
  const s = sch([{ id: "assunto", type: "single_choice", label: "Assunto", options: [{ id: "bug", label: "Erro no sistema" }] }, { id: "seu_nome", type: "short_text", label: "Seu nome completo" }, { id: "apelido", type: "short_text", label: "Como prefere ser chamado", settings: { role: "name" } }, { id: "mail", type: "email", label: "E-mail" }, { id: "fone", type: "phone", label: "WhatsApp" }]);
  const v = { assunto: "bug", seu_nome: "Ana Souza", apelido: "Aninha", mail: "ana@x.com", fone: "5544999887766" };
  assert.deepEqual(L.contactFromResponse(s, v), { name: "Aninha", email: "ana@x.com", phone: "5544999887766" }, "role name vence");
  assert.deepEqual(L.contactFromResponse(s, { seu_nome: "Ana Souza" }), { name: "Ana Souza", email: null, phone: null });
  assert.deepEqual(L.contactFromResponse(sch([{ id: "nao", type: "short_text", label: "Nomenclatura" }]), { nao: "x" }).name, null, "precisa ser a palavra nome");
  const t = L.ticketFromResponse(s, v, { subject: "assunto" }, { formTitle: "Suporte" });
  assert.equal(t.subject, "Erro no sistema");
  assert.deepEqual(t.requester, { name: "Aninha", email: "ana@x.com" });
  assert.match(t.text, /^Assunto: Erro no sistema\nSeu nome completo: Ana Souza\n/);
  assert.equal(L.ticketFromResponse(s, { mail: "b@x.com" }, {}, { formTitle: "Suporte" }).subject, "Suporte");
  assert.equal(L.ticketFromResponse(s, { mail: "b@x.com" }, {}).subject, "Resposta de formulário");
  assert.equal(L.ticketFromResponse(s, { mail: "b@x.com", fone: "x" }, { email: "fone" }).requester.email, "x", "e-mail mapeado vence");
});

test("pesquisas: NPS por mês no fuso, CSAT e detrator", () => {
  const rows = [{ submittedAt: "2026-09-30T23:30:00-03:00", value: 10 }, { submittedAt: "2026-10-01T02:30:00Z", value: 3 }, { submittedAt: "2026-10-15T12:00:00Z", value: 9 }, { submittedAt: "2026-10-16T12:00:00Z", value: 7 }];
  assert.deepEqual(L.npsTrend(rows), [{ month: "2026-09", count: 2, promoters: 1, passives: 0, detractors: 1, score: 0 }, { month: "2026-10", count: 2, promoters: 1, passives: 1, detractors: 0, score: 50 }], "02:30 UTC do dia 1º ainda é setembro em São Paulo");
  assert.deepEqual(L.csatScore([5, 4, 3, 5, 1, 0, 6]), { count: 5, satisfied: 3, pct: 60 });
  assert.deepEqual(L.csatScore([7, 6, 5], 7), { count: 3, satisfied: 2, pct: 66.7 });
  assert.deepEqual(L.csatScore([]), { count: 0, satisfied: 0, pct: null });
  assert.deepEqual([0, 6, 7, 10, 6.5, -1].map(L.isDetractor), [true, true, false, false, false, false]);
});

test("eventos: vagas por opção, situação da inscrição, código do ingresso e lista de espera", () => {
  const f = { id: "lote", type: "single_choice", options: [{ id: "manha", label: "Manhã", capacity: 2 }, { id: "tarde", label: "Tarde", capacity: 1 }, { id: "livre", label: "Livre" }] };
  assert.deepEqual(L.seatsByOption(f, ["manha", "tarde", "manha", "livre"]), { manha: { capacity: 2, taken: 2, left: 0 }, tarde: { capacity: 1, taken: 1, left: 0 } });
  const fm = { ...f, type: "multiple_choice" };
  assert.deepEqual(L.seatsByOption(fm, [{ selected: ["manha", "tarde"] }, { selected: ["manha"] }]).manha, { capacity: 2, taken: 2, left: 0 });
  assert.equal(L.registrationStatus({ formCapacity: 10, confirmedCount: 9 }), "CONFIRMED");
  assert.equal(L.registrationStatus({ formCapacity: 10, confirmedCount: 10 }), "WAITLIST");
  assert.equal(L.registrationStatus({ formCapacity: 10, confirmedCount: 10, waitlist: false }), "FULL");
  assert.equal(L.registrationStatus({ optionLeft: 0 }), "WAITLIST");
  assert.equal(L.registrationStatus({ optionLeft: 1, formCapacity: null }), "CONFIRMED");
  let seed = 0; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const codes = Array.from({ length: 50 }, () => L.ticketCode(rnd));
  assert.ok(codes.every((c) => /^[A-HJ-NP-Z2-9]{10}$/.test(c) && L.isTicketCode(c)));
  assert.equal(L.isTicketCode(codes[0].toLowerCase()), true);
  assert.equal(L.isTicketCode(codes[0].slice(0, 5) + "-" + codes[0].slice(5)), true);
  const swapped = codes[0].slice(0, 9) + (codes[0][9] === "A" ? "B" : "A");
  assert.equal(L.isTicketCode(swapped), false, "dígito de controle");
  const t = codes.find((c) => c[0] !== c[1]); assert.equal(L.isTicketCode(t[1] + t[0] + t.slice(2)), false, "troca de posição");
  assert.equal(L.isTicketCode("ABC"), false);
  const w = [{ id: "c", createdAt: "2026-10-03" }, { id: "a", createdAt: "2026-10-01" }, { id: "b", createdAt: "2026-10-01" }];
  assert.deepEqual(L.promoteWaitlist(w, 2).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(L.promoteWaitlist(w, 0), []);
  assert.deepEqual(L.promoteWaitlist(w, -1), []);
});

test("saúde: alertas da ficha, validade e respostas sensíveis", () => {
  const s = sch([{ id: "alergia", type: "yes_no", label: "Tem alergia a medicamento?", settings: { alertIf: { op: "eq", value: "true", message: "Alergia a medicamento" } } }, { id: "qual", type: "short_text", label: "Qual?", sensitive: true, settings: { alertIf: { op: "answered" } } }, { id: "pressao", type: "number", label: "Pressão (máxima)", settings: { alertIf: { op: "gte", value: 14, message: "Pressão alta" } } }, { id: "nome", type: "short_text", label: "Nome" }]);
  assert.deepEqual(L.intakeAlerts(s, { alergia: true, qual: "Dipirona", pressao: 15, nome: "Ana" }).map((a) => [a.fieldId, a.message]), [["alergia", "Alergia a medicamento"], ["qual", "Qual?"], ["pressao", "Pressão alta"]]);
  assert.deepEqual(L.intakeAlerts(s, { alergia: false, pressao: 12 }), []);
  assert.deepEqual(L.intakeAlerts(s, { pressao: 14 }).map((a) => a.fieldId), ["pressao"], "14 já alerta (gte)");
  assert.equal(L.intakeExpiresOn("2026-10-15"), "2027-10-15");
  assert.equal(L.intakeExpiresOn("2028-02-29"), "2029-02-28");
  assert.equal(L.intakeExpiresOn("2026-08-31", 6), "2027-02-28");
  assert.deepEqual(L.maskSensitive(s, { qual: "Dipirona", nome: "Ana" }, false), { qual: "•••", nome: "Ana" });
  assert.deepEqual(L.maskSensitive(s, { qual: "Dipirona" }, true), { qual: "Dipirona" });
});

test("perfis do Forms", () => {
  assert.deepEqual(Object.keys(L.FORMS_SEGMENTS), ["GENERAL", "SURVEY", "EVENTS", "HEALTH"]);
  assert.equal(L.formsSegment("EVENTS").words.response, "inscrito");
  assert.ok(L.formsSegment("HEALTH").on.includes("sensitive"));
  assert.ok(L.formsSegment("SURVEY").on.includes("nps_trend"));
  assert.equal(L.formsSegment("??").id, "GENERAL");
  assert.equal(L.FIELD_TYPES.signature.answerable, true);
  assert.equal(L.FIELD_TYPES.payment.answerable, false);
});
