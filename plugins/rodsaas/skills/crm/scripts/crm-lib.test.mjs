import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "./crm-lib.mjs";

test("normalizePhoneBR: formatos comuns", () => {
  assert.equal(L.normalizePhoneBR("(44) 99999-1234"), "5544999991234");
  assert.equal(L.normalizePhoneBR("44999991234"), "5544999991234");
  assert.equal(L.normalizePhoneBR("+55 44 99999-1234"), "5544999991234");
  assert.equal(L.normalizePhoneBR("55 44 99999 1234"), "5544999991234");
  assert.equal(L.normalizePhoneBR("044 99999-1234"), "5544999991234");
  assert.equal(L.normalizePhoneBR("0 15 44 99999-1234"), "5544999991234");
  assert.equal(L.normalizePhoneBR("0055 44 99999-1234"), "5544999991234");
  assert.equal(L.normalizePhoneBR("(44) 3025-1234"), "554430251234");
  assert.equal(L.normalizePhoneBR("(44) 9999-1234"), "5544999991234", "celular antigo ganha o 9");
  assert.equal(L.normalizePhoneBR("+1 415 555 0100"), "14155550100", "internacional mantido");
});

test("normalizePhoneBR: inválidos", () => {
  assert.equal(L.normalizePhoneBR(""), null);
  assert.equal(L.normalizePhoneBR("99999-1234"), null, "sem DDD");
  assert.equal(L.normalizePhoneBR("(20) 99999-1234"), null, "DDD inválido");
  assert.equal(L.normalizePhoneBR("(44) 89999-1234"), null, "9 dígitos sem começar com 9");
  assert.equal(L.normalizePhoneBR("(44) 1999-1234"), null, "fixo começando com 1");
  assert.equal(L.normalizePhoneBR("abc"), null);
});

test("formatPhoneBR, isMobileBR e whatsappLink", () => {
  assert.equal(L.formatPhoneBR("5544999991234"), "(44) 99999-1234");
  assert.equal(L.formatPhoneBR("554430251234"), "(44) 3025-1234");
  assert.equal(L.formatPhoneBR("14155550100"), "+14155550100");
  assert.ok(L.isMobileBR("5544999991234"));
  assert.ok(!L.isMobileBR("554430251234"));
  assert.equal(L.whatsappLink("(44) 99999-1234", "Olá Ana, tudo bem?"), "https://wa.me/5544999991234?text=Ol%C3%A1%20Ana%2C%20tudo%20bem%3F");
  assert.equal(L.whatsappLink("5544999991234"), "https://wa.me/5544999991234");
  assert.equal(L.whatsappLink("1234"), null);
});

test("renderTemplate", () => {
  assert.equal(L.renderTemplate("Olá {primeiro_nome}, tudo bem?", { primeiro_nome: "Ana" }), "Olá Ana, tudo bem?");
  assert.equal(L.renderTemplate("Olá {primeiro_nome}, aqui é {vendedor} da {empresa}.", { primeiro_nome: "", vendedor: "Bruno" }), "Olá, aqui é Bruno da.");
  assert.equal(L.firstName("  Ana Maria Souza "), "Ana");
});

test("parseMoneyBR", () => {
  const cases = {
    "R$ 1.234,56": 123456, "1.234,56": 123456, "1234,56": 123456, "1234,5": 123450, "1234": 123400,
    "1.234": 123400, "1.234.567": 123456700, "1,234.56": 123456, "1234.56": 123456, "0,99": 99, "R$1.500,00": 150000,
    "1,234": 123400, "10.5": 1050, " 2 500,00 ": 250000,
  };
  for (const [input, cents] of Object.entries(cases)) assert.equal(L.parseMoneyBR(input), cents, input);
  assert.equal(L.parseMoneyBR(1500), 150000);
  assert.equal(L.parseMoneyBR(19.9), 1990);
  for (const bad of ["", "-10", "abc", "1,2,3,4", "1.23.4", "12,345,6", null, -5]) assert.equal(L.parseMoneyBR(bad), null, String(bad));
});

test("formatMoneyBR e forma curta", () => {
  assert.equal(L.formatMoneyBR(123456).replace(/\s/g, " "), "R$ 1.234,56");
  assert.equal(L.formatMoneyShortBR(95000), "R$ 950");
  assert.equal(L.formatMoneyShortBR(1250000), "R$ 12,5 mil");
  assert.equal(L.formatMoneyShortBR(18450000), "R$ 184,5 mil");
  assert.equal(L.formatMoneyShortBR(120000000), "R$ 1,2 mi");
});

test("itemTotal exato com desconto e quantidade fracionada", () => {
  assert.equal(L.itemTotal({ unitPrice: 10000, quantity: 3 }), 30000);
  assert.equal(L.itemTotal({ unitPrice: 9990, quantity: 2, discountPercent: 10 }), 17982);
  assert.equal(L.itemTotal({ unitPrice: 333, quantity: 1.5 }), 500, "499,5 arredonda para cima");
  assert.equal(L.itemTotal({ unitPrice: 199, quantity: 0.333, discountPercent: 12.5 }), 58);
  assert.equal(L.itemTotal({ unitPrice: 199_999_999, quantity: 10, discountPercent: 0.01 }), 1_999_799_990);
  assert.throws(() => L.itemTotal({ unitPrice: 199_999_999, quantity: 11 }), /R\$ 20 milhões/);
  assert.equal(L.itemTotal({ unitPrice: 5000, quantity: 1, discountPercent: 100 }), 0);
  assert.throws(() => L.itemTotal({ unitPrice: 100, quantity: 0 }));
  assert.throws(() => L.itemTotal({ unitPrice: 100, quantity: 1, discountPercent: 101 }));
  assert.equal(L.sumItems([{ unitPrice: 1000, quantity: 2 }, { unitPrice: 500, quantity: 1, discountPercent: 50 }]), 2250);
});

test("CPF e CNPJ (inclui alfanumérico)", () => {
  assert.ok(L.isValidCPF("529.982.247-25"));
  assert.ok(!L.isValidCPF("529.982.247-24"));
  assert.ok(!L.isValidCPF("111.111.111-11"));
  assert.ok(L.isValidCNPJ("11.222.333/0001-81"));
  assert.ok(!L.isValidCNPJ("11.222.333/0001-80"));
  assert.ok(L.isValidCNPJ("12.ABC.345/01DE-35"));
  assert.ok(L.isValidCNPJ("12abc34501de35"), "minúsculas e sem pontuação");
  assert.ok(!L.isValidCNPJ("12.ABC.345/01DE-34"));
  assert.ok(!L.isValidCNPJ("00.000.000/0000-00"));
  assert.ok(L.isNumericCNPJ("11.222.333/0001-81"));
  assert.ok(!L.isNumericCNPJ("12.ABC.345/01DE-35"));
});

test("dedupeKeys", () => {
  assert.deepEqual(L.dedupeKeys({ email: " Ana@Acme.COM.br ", phone: "(44) 99999-1234", cpf: "529.982.247-25", cnpj: "12.abc.345/01de-35" }), {
    email: "ana@acme.com.br", phone: "5544999991234", cpf: "52998224725", cnpj: "12ABC34501DE35",
  });
  assert.deepEqual(L.dedupeKeys({ email: "x", phone: "1", cpf: "123", cnpj: "1" }), { email: null, phone: null, cpf: null, cnpj: null });
});

test("activityState no fuso da empresa (perto da meia-noite)", () => {
  const tz = "America/Sao_Paulo";
  const now = new Date("2026-10-14T02:30:00Z"); // 23:30 de 13/10 em São Paulo
  assert.equal(L.dateInTZ(now, tz), "2026-10-13");
  assert.equal(L.activityState({ dueDate: "2026-10-13" }, now, tz), "today");
  assert.equal(L.activityState({ dueDate: "2026-10-13", dueTime: "23:00" }, now, tz), "overdue");
  assert.equal(L.activityState({ dueDate: "2026-10-13", dueTime: "23:45" }, now, tz), "today");
  assert.equal(L.activityState({ dueDate: "2026-10-12" }, now, tz), "overdue");
  assert.equal(L.activityState({ dueDate: "2026-10-14" }, now, tz), "future", "em UTC já seria hoje");
  assert.equal(L.activityState({ dueDate: "2026-10-01", done: true }, now, tz), "done");
});

test("nextActivity: data, hora (dia inteiro por último) e criação", () => {
  const acts = [
    { id: "a", dueDate: "2026-10-15", dueTime: null, createdAt: "1" },
    { id: "b", dueDate: "2026-10-15", dueTime: "16:00", createdAt: "2" },
    { id: "c", dueDate: "2026-10-15", dueTime: "09:00", createdAt: "3" },
    { id: "d", dueDate: "2026-10-14", dueTime: null, createdAt: "4", done: true },
    { id: "e", dueDate: "2026-10-16", dueTime: "08:00", createdAt: "0" },
  ];
  assert.equal(L.nextActivity(acts).id, "c");
  assert.equal(L.nextActivity([acts[0], { ...acts[0], id: "z", createdAt: "0" }]).id, "z");
  assert.equal(L.nextActivity([acts[3]]), null);
});

test("rottingInfo", () => {
  const tz = "America/Sao_Paulo";
  const now = new Date("2026-10-20T12:00:00Z");
  assert.deepEqual(L.rottingInfo({ stageChangedAt: "2026-10-10T15:00:00Z" }, 7, now, tz), { days: 10 });
  assert.equal(L.rottingInfo({ stageChangedAt: "2026-10-15T15:00:00Z" }, 7, now, tz), null);
  assert.equal(L.rottingInfo({ stageChangedAt: "2026-10-01T15:00:00Z" }, null, now, tz), null);
  assert.equal(L.rottingInfo({ status: "WON", stageChangedAt: "2026-10-01T15:00:00Z" }, 7, now, tz), null);
});

test("probabilidade, ponderado e totais", () => {
  const stages = { s1: { probability: 25 }, s2: { probability: 75 } };
  assert.equal(L.effectiveProbability({ status: "OPEN", probability: null }, stages.s1), 25);
  assert.equal(L.effectiveProbability({ status: "OPEN", probability: 60 }, stages.s1), 60);
  assert.equal(L.effectiveProbability({ status: "WON", probability: 10 }, stages.s1), 100);
  assert.equal(L.effectiveProbability({ status: "LOST" }, stages.s2), 0);
  assert.equal(L.weightedValue(333, 50), 167);
  assert.deepEqual(
    L.totals([{ value: 10000, stageId: "s1", status: "OPEN" }, { value: 20000, stageId: "s2", status: "OPEN", probability: 50 }], stages),
    { count: 2, value: 30000, weighted: 12500 },
  );
});

test("roundRobinPick distribui e pula quem saiu", () => {
  const ids = ["a", "b", "c"];
  const picks = [1, 2, 3, 4, 5, 6].map((c) => L.roundRobinPick(ids, c, ids));
  assert.deepEqual(picks, ["a", "b", "c", "a", "b", "c"]);
  assert.deepEqual([1, 2, 3].map((c) => L.roundRobinPick(ids, c, ["a", "c"])), ["a", "c", "a"]);
  assert.equal(L.roundRobinPick(ids, 1, []), null);
});

test("slugifyFieldKey", () => {
  assert.equal(L.slugifyFieldKey("Nº de funcionários"), "n_de_funcionarios");
  assert.equal(L.slugifyFieldKey("Plano atual", ["plano_atual"]), "plano_atual_2");
  assert.equal(L.slugifyFieldKey("2º contato"), "c_2_contato");
  assert.equal(L.slugifyFieldKey("!!!"), "campo");
});

test("validateCustomFields: tipos válidos e normalização", () => {
  const defs = [
    { key: "func", label: "Funcionários", type: "NUMBER" },
    { key: "fat", label: "Faturamento", type: "MONEY" },
    { key: "fund", label: "Fundação", type: "DATE" },
    { key: "porte", label: "Porte", type: "SELECT", options: [{ id: "p1", label: "Pequeno" }, { id: "p2", label: "Médio" }] },
    { key: "canais", label: "Canais", type: "MULTISELECT", options: [{ id: "c1", label: "Loja" }, { id: "c2", label: "Online" }] },
    { key: "ativo", label: "Ativo", type: "BOOLEAN" },
    { key: "site", label: "Site", type: "URL" },
    { key: "fin", label: "E-mail financeiro", type: "EMAIL" },
    { key: "tel", label: "Telefone", type: "PHONE" },
    { key: "cpf", label: "CPF do sócio", type: "CPF" },
    { key: "cnpj", label: "CNPJ matriz", type: "CNPJ" },
    { key: "obs", label: "Obs", type: "TEXTAREA" },
  ];
  const r = L.validateCustomFields(defs, {
    func: "1.250", fat: 1500000, fund: "2010-03-31", porte: "p2", canais: ["c1", "c2", "c1"], ativo: true,
    site: "https://acme.com.br", fin: " FIN@acme.com.br ", tel: "(44) 3025-1234", cpf: "529.982.247-25",
    cnpj: "12.abc.345/01de-35", obs: "  texto  ",
  });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value, {
    func: 1250, fat: 1500000, fund: "2010-03-31", porte: "p2", canais: ["c1", "c2"], ativo: true, site: "https://acme.com.br/",
    fin: "fin@acme.com.br", tel: "554430251234", cpf: "52998224725", cnpj: "12ABC34501DE35", obs: "texto",
  });
});

test("validateCustomFields: erros, obrigatório, desconhecido, arquivado e parcial", () => {
  const defs = [
    { key: "porte", label: "Porte", type: "SELECT", options: [{ id: "p1", label: "Pequeno" }], required: true },
    { key: "fund", label: "Fundação", type: "DATE" },
    { key: "velho", label: "Velho", type: "TEXT", archivedAt: "2026-01-01" },
    { key: "site", label: "Site", type: "URL" },
    { key: "fat", label: "Faturamento", type: "MONEY" },
  ];
  const r = L.validateCustomFields(defs, { fund: "2026-02-30", velho: "x", outro: 1, site: "javascript:alert(1)", fat: 10.5 });
  const paths = r.errors.map((e) => e.path).sort();
  assert.deepEqual(paths, ["customFields.fat", "customFields.fund", "customFields.outro", "customFields.porte", "customFields.site", "customFields.velho"]);
  assert.deepEqual(L.validateCustomFields(defs, { fund: "2026-02-28" }, { partial: true }).errors, [], "PATCH sem o obrigatório passa");
  assert.equal(L.validateCustomFields(defs, { porte: null }, { partial: true }).errors.length, 1, "PATCH limpando o obrigatório falha");
  assert.deepEqual(L.validateCustomFields(defs, { porte: "p1", fund: "" }).value, { porte: "p1", fund: null });
  assert.equal(L.validateCustomFields(defs, []).errors[0].path, "customFields");
});

test("normalizeLeadPayload: apelidos, UTM, extras e campos personalizados", () => {
  const r = L.normalizeLeadPayload({
    Nome: "Ana Souza", "E-mail": "ANA@acme.com.br", WhatsApp: "(44) 99999-1234", Empresa: "Acme", mensagem: "Quero orçamento",
    utm_source: "facebook", UTM_CAMPAIGN: "outubro", cf_porte: "p1", "custom.segmento": "varejo", Cidade: "Maringá", _gotcha: "", valor: "R$ 5.000",
  });
  assert.deepEqual(r.lead, {
    personName: "Ana Souza", email: "ana@acme.com.br", phone: "5544999991234", companyName: "Acme", cnpj: null,
    title: null, message: "Quero orçamento", value: 500000, source: null,
  });
  assert.deepEqual(r.utm, { utm_source: "facebook", utm_campaign: "outubro" });
  assert.deepEqual(r.custom, { porte: "p1", segmento: "varejo" });
  assert.deepEqual(r.extra, { Cidade: "Maringá" });
  assert.equal(r.spam, false);
  assert.deepEqual(r.errors, []);
});

test("normalizeLeadPayload: nome por partes, inválidos, spam e obrigatório", () => {
  const r = L.normalizeLeadPayload({ first_name: "Ana", last_name: "Souza", email: "ana@", phone: "123" });
  assert.equal(r.lead.personName, "Ana Souza");
  assert.equal(r.errors[0].path, "email");
  assert.equal(r.extra.email_invalido, "ana@");
  assert.equal(r.extra.telefone_invalido, "123");
  assert.ok(L.normalizeLeadPayload({ email: "a@b.com", _gotcha: "robô" }).spam);
  assert.ok(L.normalizeLeadPayload({ email: "a@b.com", _ts: "1000" }, { now: 2500 }).spam, "enviado em 1,5 s");
  assert.ok(!L.normalizeLeadPayload({ email: "a@b.com", _ts: "1000" }, { now: 5000 }).spam);
  const links = Array.from({ length: 6 }, (_, i) => `http://x${i}.com`).join(" ");
  assert.ok(L.normalizeLeadPayload({ email: "a@b.com", message: links }).spam);
  assert.equal(L.leadTitle({ personName: "Ana Souza" }, "Site"), "Ana Souza · Site");
  assert.equal(L.leadTitle({ phone: "5544999991234" }), "(44) 99999-1234");
});

test("detectDelimiter", () => {
  assert.equal(L.detectDelimiter("﻿Nome;E-mail;Telefone\nAna;ana@x.com;44999991234\n"), ";");
  assert.equal(L.detectDelimiter("Nome,E-mail\nAna,ana@x.com\n"), ",");
  assert.equal(L.detectDelimiter('Nome;Obs\n"Ana";"texto, com vírgula, e mais"\n'), ";");
  assert.equal(L.detectDelimiter("Nome\tE-mail\nAna\tana@x.com\n"), "\t");
  assert.equal(L.detectDelimiter('"Souza, Ana",ana@x.com\n"Lima, Bia",bia@x.com\n'), ",");
});

test("suggestMapping para cabeçalhos comuns", () => {
  const m = L.suggestMapping("CONTACT", ["Nome", "E-mail", "Celular", "Telefone fixo", "Empresa", "CNPJ", "Cargo", "Cidade", "Vendedor", "Etiquetas", "Porte"], [
    { key: "porte", label: "Porte" },
  ]);
  assert.deepEqual(m, {
    Nome: "name", "E-mail": "email", Celular: "phone", "Telefone fixo": "secondaryPhone", Empresa: "companyName", CNPJ: "companyCnpj",
    Cargo: "jobTitle", Cidade: "ignore", Vendedor: "ownerEmail", Etiquetas: "tags", Porte: "cf.porte",
  });
  const c = L.suggestMapping("COMPANY", ["Razão Social", "Nome Fantasia", "CNPJ", "UF", "Município", "CEP", "Telefone celular do contato"]);
  assert.equal(c["Razão Social"], "legalName");
  assert.equal(c.CNPJ, "cnpj");
  assert.equal(c.UF, "addressState");
  assert.equal(c["Município"], "addressCity");
  assert.equal(c.CEP, "addressZip");
  assert.equal(c["Telefone celular do contato"], "phone");
  assert.equal(L.suggestMapping("LEAD", ["Nome", "WhatsApp"]).Nome, "personName");
  assert.throws(() => L.suggestMapping("XYZ", []));
});

test("parseDateBR", () => {
  assert.equal(L.parseDateBR("31/12/1990"), "1990-12-31");
  assert.equal(L.parseDateBR("1/2/85"), "1985-02-01");
  assert.equal(L.parseDateBR("05-03-2020"), "2020-03-05");
  assert.equal(L.parseDateBR("2020-03-05T10:00:00Z"), "2020-03-05");
  assert.equal(L.parseDateBR(45000), "2023-03-15", "serial do Excel");
  assert.equal(L.parseDateBR("31/02/2020"), null);
  assert.equal(L.parseDateBR("ontem"), null);
});

test("normalizeImportRow: contato com campos BR e personalizados", () => {
  const mapping = { "Primeiro nome": "firstName", Sobrenome: "lastName", "E-mail": "email", Celular: "phone", CPF: "cpf", Nasc: "birthday", Etiquetas: "tags", Porte: "cf.porte", Fat: "cf.fat", Lixo: "ignore" };
  const defs = [
    { key: "porte", label: "Porte", type: "SELECT", options: [{ id: "p1", label: "Pequeno" }, { id: "p2", label: "Médio" }] },
    { key: "fat", label: "Faturamento", type: "MONEY" },
  ];
  const r = L.normalizeImportRow("CONTACT", mapping, {
    "Primeiro nome": "Ana", Sobrenome: "Souza", "E-mail": "Ana@X.com", Celular: "44 99999-1234", CPF: "529.982.247-25",
    Nasc: "31/12/1990", Etiquetas: "vip, varejo; vip", Porte: "médio", Fat: "R$ 1.500,00", Lixo: "x",
  }, defs);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.data, { name: "Ana Souza", email: "ana@x.com", phone: "5544999991234", cpf: "52998224725", birthday: "1990-12-31", tags: ["vip", "varejo"] });
  assert.deepEqual(r.custom, { porte: "p2", fat: 150000 });
});

test("normalizeImportRow: erros por coluna e obrigatórios", () => {
  const r = L.normalizeImportRow("CONTACT", { E: "email", T: "phone", C: "cpf", U: "addressState" }, { E: "ana@", T: "123", C: "111", U: "Paraná" });
  assert.deepEqual(r.errors.map((e) => e.column), ["E", "T", "C", "U", null]);
  const c = L.normalizeImportRow("COMPANY", { RS: "legalName", CNPJ: "cnpj", Site: "website", CEP: "addressZip" }, { RS: "Acme Ltda", CNPJ: "11.222.333/0001-81", Site: "acme.com.br", CEP: "87.020-000" });
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.data, { legalName: "Acme Ltda", cnpj: "11222333000181", website: "https://acme.com.br/", addressZip: "87020000", name: "Acme Ltda" });
  const l = L.normalizeImportRow("LEAD", { N: "personName", V: "value" }, { N: "Ana", V: "abc" });
  assert.deepEqual(l.errors.map((e) => e.message), ["Valor inválido", "Informe e-mail ou telefone"]);
});

test("csvSafe, csvMoney e csvDate", () => {
  assert.equal(L.csvSafe("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(L.csvSafe("+5544999"), "'+5544999");
  assert.equal(L.csvSafe("@soma"), "'@soma");
  assert.equal(L.csvSafe("Acme; Ltda"), '"Acme; Ltda"');
  assert.equal(L.csvSafe("linha\nquebrada"), '"linha\nquebrada"');
  assert.equal(L.csvSafe(null), "");
  assert.equal(L.csvSafe("ok"), "ok");
  assert.equal(L.csvMoney(123456), "1234,56");
  assert.equal(L.csvDate("2026-10-13"), "13/10/2026");
  assert.equal(L.csvDate("2026-10-13T15:00:00Z"), "13/10/2026");
});

// ================================================================== vendas avançadas e perfis
test("dias úteis e períodos de meta", () => {
  assert.equal(L.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(L.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(L.addBusinessDays("2026-10-16", 1), "2026-10-19", "sexta + 1 útil = segunda");
  assert.equal(L.addBusinessDays("2026-10-17", 0), "2026-10-19", "sábado + 0 empurra para segunda");
  assert.equal(L.addBusinessDays("2026-10-14", 0), "2026-10-14");
  assert.equal(L.addBusinessDays("2026-10-14", 2, ["2026-10-15"]), "2026-10-19", "pula o feriado");
  assert.equal(L.addBusinessDays("2026-10-14", 5), "2026-10-21");
  assert.equal(L.isBusinessDay("2026-10-18"), false);
  assert.equal(L.isBusinessDay("2026-11-02", ["2026-11-02"]), false);
  assert.deepEqual(L.periodBounds("2026-10"), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(L.periodBounds("2028-02"), { start: "2028-02-01", end: "2028-02-29" }, "bissexto");
  assert.deepEqual(L.periodBounds("2026-12"), { start: "2026-12-01", end: "2026-12-31" });
  assert.deepEqual(L.periodBounds("2026-Q1"), { start: "2026-01-01", end: "2026-03-31" });
  assert.deepEqual(L.periodBounds("2026-Q4"), { start: "2026-10-01", end: "2026-12-31" });
  assert.equal(L.periodBounds("2026-13"), null);
  assert.equal(L.periodBounds("2026-Q5"), null);
  assert.equal(L.periodBounds("outubro"), null);
});

test("metas: o que conta, por vendedor e equipe, e o ritmo do mês", () => {
  const data = {
    deals: [
      { ownerId: "a", pipelineId: "p1", status: "WON", value: 10000, wonOn: "2026-10-05", createdOn: "2026-09-20" },
      { ownerId: "a", pipelineId: "p2", status: "WON", value: 5000, wonOn: "2026-10-31", createdOn: "2026-10-01" },
      { ownerId: "a", pipelineId: "p1", status: "WON", value: 7000, wonOn: "2026-09-30", createdOn: "2026-10-02" },
      { ownerId: "a", pipelineId: "p1", status: "LOST", value: 9000, wonOn: null, createdOn: "2026-10-03" },
      { ownerId: "b", pipelineId: "p1", status: "WON", value: 3000, wonOn: "2026-10-10", createdOn: "2026-10-10" },
    ],
    activities: [{ ownerId: "a", done: true, doneOn: "2026-10-02" }, { ownerId: "a", done: false, doneOn: null }, { ownerId: "a", done: false, doneOn: "2026-10-05" }, { ownerId: "b", done: true, doneOn: "2026-11-01" }],
  };
  const r = { start: "2026-10-01", end: "2026-10-31" };
  assert.equal(L.goalAchieved("WON_VALUE", data, { ownerId: "a", ...r }), 15000, "ganhos no mês, de qualquer funil");
  assert.equal(L.goalAchieved("WON_VALUE", data, { ownerId: "a", pipelineId: "p1", ...r }), 10000);
  assert.equal(L.goalAchieved("WON_VALUE", data, { ...r }), 18000, "equipe");
  assert.equal(L.goalAchieved("WON_COUNT", data, { ownerId: "a", ...r }), 2);
  assert.equal(L.goalAchieved("DEALS_CREATED", data, { ownerId: "a", ...r }), 3);
  assert.equal(L.goalAchieved("ACTIVITIES_DONE", data, { ...r }), 1);
  assert.equal(L.goalAchieved("NOPE", data, r), 0);
  const p = (o) => L.goalProgress({ target: 100000, start: "2026-10-01", end: "2026-10-31", ...o });
  assert.deepEqual(p({ achieved: 50000, today: "2026-10-16" }), { pct: 50, expectedPct: 52, status: "ON_TRACK", remaining: 50000, daysLeft: 16, perDayNeeded: 3125 });
  assert.equal(p({ achieved: 20000, today: "2026-10-16" }).status, "BEHIND");
  assert.equal(p({ achieved: 41000, today: "2026-10-16" }).status, "BEHIND", "41 < 52 − 10");
  assert.equal(p({ achieved: 42000, today: "2026-10-16" }).status, "ON_TRACK", "42 ≥ 52 − 10");
  assert.equal(p({ achieved: 62000, today: "2026-10-16" }).status, "AHEAD", "62 ≥ 52 + 10");
  assert.equal(p({ achieved: 61000, today: "2026-10-16" }).status, "ON_TRACK");
  assert.equal(p({ achieved: 100000, today: "2026-10-02" }).status, "DONE");
  assert.deepEqual(p({ achieved: 0, today: "2026-09-20" }), { pct: 0, expectedPct: 0, status: "ON_TRACK", remaining: 100000, daysLeft: 31, perDayNeeded: 3226 }, "antes de começar");
  assert.deepEqual(p({ achieved: 30000, today: "2026-11-05" }), { pct: 30, expectedPct: 100, status: "BEHIND", remaining: 70000, daysLeft: 0, perDayNeeded: 70000 }, "depois do fim");
  assert.equal(p({ achieved: 30000, today: "2026-10-31" }).daysLeft, 1, "último dia conta");
  assert.equal(L.goalProgress({ target: 0, achieved: 5, start: "2026-10-01", end: "2026-10-31", today: "2026-10-10" }).pct, 0);
  assert.equal(L.goalProgress({ target: 3, achieved: 1, start: "2026-10-01", end: "2026-10-31", today: "2026-10-10" }).pct, 33, "arredonda para baixo");
  assert.equal(L.goalProgress({ target: 3, achieved: 2, start: "2026-10-01", end: "2026-10-31", today: "2026-10-10" }).pct, 66, "66,7 → 66");
});

test("condições", () => {
  const d = { value: 50000, sourceId: "s1", tagIds: ["t1", "t2"], ownerId: "u1", companyId: null, title: "Plano Anual Escola", customFields: { porte: "grande", qtd: 10 } };
  const m = (field, op, value) => L.conditionMatches({ field, op, value }, d);
  assert.equal(m("value", "gte", 50000), true); assert.equal(m("value", "gt", 50000), false);
  assert.equal(m("value", "lt", 50001), true); assert.equal(m("value", "lte", 49999), false);
  assert.equal(m("sourceId", "eq", "s1"), true); assert.equal(m("sourceId", "neq", "s1"), false);
  assert.equal(m("sourceId", "in", ["s0", "s1"]), true); assert.equal(m("sourceId", "in", "s1"), false);
  assert.equal(m("tagIds", "contains", "t2"), true); assert.equal(m("tagIds", "contains", "t3"), false);
  assert.equal(m("tagIds", "eq", "t1"), false, "lista não é igual a um valor");
  assert.equal(L.conditionMatches({ field: "tagIds", op: "eq", value: "t1" }, { tagIds: ["t1"] }), false, "nem com um item só");
  assert.equal(m("value", "lte", 50000), true);
  assert.equal(m("title", "contains", "escola"), true, "texto sem caixa e acento"); assert.equal(m("title", "contains", "anuál"), true);
  assert.equal(m("companyId", "empty"), true); assert.equal(m("tagIds", "notEmpty"), true); assert.equal(m("companyId", "notEmpty"), false);
  assert.equal(L.conditionMatches({ field: "tagIds", op: "empty" }, { tagIds: [] }), true);
  assert.equal(m("cf.porte", "eq", "grande"), true); assert.equal(m("cf.qtd", "gt", 5), true);
  assert.equal(m("value", "gt", "1"), false, "comparação numérica só com número");
  assert.equal(L.conditionMatches({ field: "value", op: "gt", value: 1 }, { value: "999" }), false, "valor guardado como texto não compara");
  assert.equal(m("value", "nope", 1), false);
});

test("automações: validação, gatilho e ações resolvidas", () => {
  const ctx = { stageIds: ["st1", "st2"], tagIds: ["tg"], userIds: ["u1", "u2", "u3"], sequenceIds: ["sq"], templateIds: ["tp"] };
  const ok = { name: "Proposta → follow-up", trigger: { type: "STAGE_ENTERED", stageId: "st2" }, conditions: [{ field: "value", op: "gte", value: 1000 }], actions: [{ type: "CREATE_ACTIVITY", activityType: "CALL", subject: "Follow-up", dueInDays: 3, assignTo: "OWNER" }] };
  assert.deepEqual(L.validateAutomation(ok, ctx), []);
  const paths = (a) => L.validateAutomation(a, ctx).map((e) => e.path);
  assert.deepEqual(paths({ ...ok, name: " " }), ["name"]);
  assert.deepEqual(paths({ ...ok, trigger: { type: "STAGE_ENTERED", stageId: "zz" } }), ["trigger.stageId"]);
  assert.deepEqual(paths({ ...ok, trigger: { type: "DEAL_ROTTING" } }), ["trigger.stageId"]);
  assert.deepEqual(paths({ ...ok, trigger: { type: "DEAL_WON" } }), [], "ganho não precisa de etapa");
  assert.deepEqual(paths({ ...ok, trigger: { type: "X" } }), ["trigger.type"]);
  assert.deepEqual(paths({ ...ok, conditions: [{ field: "", op: "eq" }, { field: "value", op: "~" }] }), ["conditions.0.field", "conditions.1.op"]);
  assert.deepEqual(paths({ ...ok, actions: [] }), ["actions"]);
  assert.deepEqual(paths({ ...ok, actions: Array(11).fill(ok.actions[0]) }), ["actions"]);
  const act = (a) => paths({ ...ok, actions: [a] });
  assert.deepEqual(act({ type: "CREATE_ACTIVITY", activityType: "FAX", subject: "", dueInDays: 400, assignTo: "USER" }), ["actions.0.activityType", "actions.0.subject", "actions.0.dueInDays", "actions.0.userId"]);
  assert.deepEqual(act({ type: "CREATE_ACTIVITY", activityType: "CALL", subject: "x", dueInDays: 1.5 }), ["actions.0.dueInDays"]);
  assert.deepEqual(act({ type: "CREATE_ACTIVITY", activityType: "CALL", subject: "x", dueInDays: 0, assignTo: "USER", userId: "u2" }), []);
  assert.deepEqual(act({ type: "CREATE_ACTIVITY", activityType: "CALL", subject: "x", dueInDays: 0, assignTo: "USER", userId: "fora" }), ["actions.0.userId"], "pessoa fora da empresa");
  assert.deepEqual(act({ type: "ASSIGN_OWNER", userIds: ["u1", "zz"] }), ["actions.0.userIds"]);
  assert.deepEqual(act({ type: "ASSIGN_OWNER", userIds: [] }), ["actions.0.userIds"]);
  assert.deepEqual(act({ type: "ADD_TAG", tagId: "zz" }), ["actions.0.tagId"]);
  assert.deepEqual(act({ type: "START_SEQUENCE", sequenceId: "sq" }), []);
  assert.deepEqual(act({ type: "START_SEQUENCE" }), ["actions.0.sequenceId"]);
  assert.deepEqual(act({ type: "SEND_EMAIL", templateId: "zz" }), ["actions.0.templateId"]);
  assert.deepEqual(act({ type: "SEND_WHATSAPP" }), ["actions.0.templateName"]);
  assert.deepEqual(act({ type: "SEND_WHATSAPP", templateName: "agenda_lembrete" }), []);
  assert.deepEqual(act({ type: "NOTIFY", userIds: [] }), ["actions.0.userIds"]);
  assert.deepEqual(act({ type: "DELETE_ALL" }), ["actions.0.type"]);
  assert.deepEqual(L.validateAutomation(ok), [], "sem contexto não confere ids");

  const a = { ...ok, active: true, pipelineId: "p1" };
  const deal = { pipelineId: "p1", value: 2000, ownerId: "u1" };
  assert.equal(L.automationMatches(a, { type: "STAGE_ENTERED", stageId: "st2" }, deal), true);
  assert.equal(L.automationMatches(a, { type: "STAGE_ENTERED", stageId: "st1" }, deal), false, "outra etapa");
  assert.equal(L.automationMatches(a, { type: "DEAL_WON" }, deal), false, "outro gatilho");
  assert.equal(L.automationMatches({ ...a, active: false }, { type: "STAGE_ENTERED", stageId: "st2" }, deal), false, "desligada");
  assert.equal(L.automationMatches(a, { type: "STAGE_ENTERED", stageId: "st2" }, { ...deal, value: 999 }), false, "condição");
  assert.equal(L.automationMatches(a, { type: "STAGE_ENTERED", stageId: "st2" }, { ...deal, pipelineId: "p2" }), false, "outro funil");
  assert.equal(L.automationMatches({ ...a, pipelineId: null }, { type: "STAGE_ENTERED", stageId: "st2" }, { ...deal, pipelineId: "p2" }), true, "qualquer funil");
  assert.equal(L.automationMatches({ ...a, trigger: { type: "DEAL_WON" }, conditions: [] }, { type: "DEAL_WON" }, deal), true);
  assert.equal(L.automationMatches({ ...a, trigger: { type: "DEAL_WON" }, conditions: [{ field: "value", op: "gte", value: 1000 }, { field: "ownerId", op: "eq", value: "u9" }] }, { type: "DEAL_WON" }, deal), false, "todas as condições");

  const plan = L.planActions({ actions: [{ type: "CREATE_ACTIVITY", activityType: "CALL", subject: "x", dueInDays: 3, assignTo: "OWNER" }, { type: "CREATE_ACTIVITY", activityType: "TASK", subject: "y", dueInDays: 1, assignTo: "USER", userId: "u3" }, { type: "ASSIGN_OWNER", userIds: ["u1", "u2"] }, { type: "ASSIGN_OWNER", userIds: ["u1", "u2"] }, { type: "ADD_TAG", tagId: "tg" }] }, deal, { today: "2026-10-16", rrCursor: 4 });
  assert.equal(plan.actions[0].dueDate, "2026-10-19"); assert.equal(plan.actions[0].ownerId, "u1", "dono do negócio");
  assert.equal(plan.actions[1].ownerId, "u3"); assert.equal(plan.actions[1].dueDate, "2026-10-17");
  assert.equal(plan.actions[2].ownerId, "u1", "rodízio: cursor 5 → u1"); assert.equal(plan.actions[3].ownerId, "u2"); assert.equal(plan.rrCursor, 6);
  assert.deepEqual(plan.actions[4], { type: "ADD_TAG", tagId: "tg" });
  assert.equal(L.planActions({ actions: [{ type: "CREATE_ACTIVITY", dueInDays: 1, assignTo: "OWNER" }] }, deal, { today: "2026-10-16", businessDays: true }).actions[0].dueDate, "2026-10-19", "dias úteis");
  assert.equal(L.planActions({ actions: [{ type: "ASSIGN_OWNER", userIds: ["u1", "u2"] }] }, deal, { today: "2026-10-16", rrCursor: 0, activeUserIds: ["u2"] }).actions[0].ownerId, "u2", "pula quem saiu");
  assert.equal(L.planActions({ actions: [] }, deal, { today: "2026-10-16" }).rrCursor, 0);
  assert.equal(L.MAX_AUTOMATION_DEPTH, 3);
});

test("sequências: validação, datas dos passos e parada", () => {
  const steps = [{ dayOffset: 0, type: "EMAIL", subject: "a" }, { dayOffset: 2, type: "CALL", subject: "b" }, { dayOffset: 2, type: "WHATSAPP", subject: "c" }, { dayOffset: 7, type: "CALL", subject: "d" }];
  assert.deepEqual(L.validateSequence({ name: "Prospecção", steps, stopOn: ["DEAL_WON", "REPLIED"] }), []);
  const paths = (s) => L.validateSequence(s).map((e) => e.path);
  assert.deepEqual(paths({ name: "", steps }), ["name"]);
  assert.deepEqual(paths({ name: "x", steps: [] }), ["steps"]);
  assert.deepEqual(paths({ name: "x", steps: Array(21).fill(steps[0]) }), ["steps"]);
  assert.deepEqual(paths({ name: "x", steps: [steps[1], steps[0]] }), ["steps.1.dayOffset"], "dias não voltam");
  assert.deepEqual(paths({ name: "x", steps: [{ dayOffset: -1, type: "FAX", subject: "" }] }), ["steps.0.type", "steps.0.subject", "steps.0.dayOffset"]);
  assert.deepEqual(paths({ name: "x", steps: [{ dayOffset: 181, type: "CALL", subject: "s" }] }), ["steps.0.dayOffset"]);
  assert.deepEqual(paths({ name: "x", steps, stopOn: ["NEVER"] }), ["stopOn"]);
  assert.equal(L.stepDueDate(steps, 0, "2026-10-16"), "2026-10-16", "1º passo no dia");
  assert.equal(L.stepDueDate(steps, 0, "2026-10-17"), "2026-10-19", "começou no sábado → segunda");
  assert.equal(L.stepDueDate(steps, 1, "2026-10-16"), "2026-10-20", "2 dias úteis depois da sexta");
  assert.equal(L.stepDueDate(steps, 1, "2026-10-16", { businessDays: false }), "2026-10-18");
  assert.equal(L.stepDueDate(steps, 2, "2026-10-20"), "2026-10-20", "mesmo dia do anterior");
  assert.equal(L.stepDueDate(steps, 3, "2026-10-20"), "2026-10-27", "intervalo de 5 dias úteis");
  assert.equal(L.stepDueDate(steps, 1, "2026-10-14", { holidays: ["2026-10-15"] }), "2026-10-19");
  assert.equal(L.nextStepIndex(steps, 0), 1); assert.equal(L.nextStepIndex(steps, 3), null);
  assert.equal(L.sequenceStopReason({ stopOn: ["DEAL_WON"] }, "DEAL_WON"), "DEAL_WON");
  assert.equal(L.sequenceStopReason({ stopOn: ["DEAL_WON"] }, "REPLIED"), null);
  assert.equal(L.sequenceStopReason({}, "REPLIED"), "REPLIED", "padrão: todos");
});

test("duplicados e mesclagem", () => {
  const rs = [
    { id: "1", name: "Ana Souza", email: "ANA@x.com", phone: "(44) 99999-1234", cpf: "529.982.247-25", companyId: "c1" },
    { id: "2", name: "ana souza", email: "ana@x.com", phone: null, cpf: "52998224725", companyId: "c1" },
    { id: "3", name: "Beto", email: "beto@x.com", phone: "44999991234", cpf: null },
    { id: "4", name: "Carla", email: "carla@x.com", phone: null, cpf: "11111111111" },
    { id: "5", name: "Carla", email: "c2@x.com", phone: null, cpf: "11111111111" },
    { id: "6", name: "Ana Souza", email: "outra@x.com", phone: null, cpf: null, companyId: "c2" },
  ];
  const g = L.duplicateGroups(rs);
  assert.deepEqual(g.map((x) => [x.by, x.ids]), [["cpf", ["1", "2"]], ["phone", ["1", "3"]], ["name", ["4", "5"]]], "e-mail e nome de 1/2 já saíram no CPF; CPF inválido não agrupa; mesmo nome em outra empresa não");
  assert.deepEqual(L.duplicateGroups([]), []);
  assert.deepEqual(L.duplicateGroups([{ id: "x", name: "X", email: "Ze@Mail.com " }, { id: "y", name: "Y", email: "ze@mail.com" }]).map((x) => [x.by, x.ids]), [["email", ["x", "y"]]], "e-mail sem caixa e espaço");
  assert.deepEqual(L.duplicateGroups([{ id: "x", name: "X", phone: "+55 44 99999-1234" }, { id: "y", name: "Y", phone: "(44) 9999-1234" }]).map((x) => [x.by, x.ids]), [["phone", ["x", "y"]]], "telefone normalizado (com o nono dígito)");
  const t = { id: "t", name: "Ana", email: "", phone: "5544999991234", jobTitle: "Gerente", tagIds: ["a"], customFields: { porte: "grande", origem: null }, createdAt: "x" };
  const s = { id: "s", name: "Ana Souza", email: "ana@x.com", phone: "5544988887777", jobTitle: null, tagIds: ["a", "b"], customFields: { porte: "pequeno", origem: "site", nps: 9 }, createdAt: "y" };
  const r = L.mergeRecords(t, s);
  assert.equal(r.merged.id, "t"); assert.equal(r.merged.createdAt, "x");
  assert.equal(r.merged.name, "Ana", "conflito: fica o destino");
  assert.equal(r.merged.email, "ana@x.com", "vazio (texto vazio) preenchido");
  assert.equal(r.merged.jobTitle, "Gerente");
  assert.deepEqual(r.merged.tagIds, ["a", "b"]);
  assert.deepEqual(r.merged.customFields, { porte: "grande", origem: "site", nps: 9 });
  assert.deepEqual(r.conflicts.sort(), ["cf.porte", "name", "phone"]);
  const c = L.mergeRecords(t, s, { name: "source", "cf.porte": "source" });
  assert.equal(c.merged.name, "Ana Souza"); assert.equal(c.merged.phone, "5544999991234"); assert.equal(c.merged.customFields.porte, "pequeno");
  assert.deepEqual(L.mergeRecords({ id: 1, tagIds: [] }, { id: 2 }).merged.tagIds, []);
});

test("modelos: variáveis, validação e preenchimento", () => {
  assert.deepEqual(L.templateVariables("Oi {{contato.primeiro_nome}}, {{ negocio.valor }} e {{contato.primeiro_nome}}"), ["contato.primeiro_nome", "negocio.valor"]);
  assert.deepEqual(L.validateTemplateVars({ subject: "Proposta {{negocio.titulo}}", body: "Oi {{contato.apelido}} {{hoje}}" }), [{ path: "body", message: "Variável desconhecida: {{contato.apelido}}" }]);
  const ctx = { contact: { name: "Ana Souza", email: "ana@x.com", phone: "5544999991234" }, company: { name: "Mercado Bom" }, deal: { title: "Plano anual", value: 150000, stageName: "Proposta" }, owner: { name: "Rodrigo Lima", email: "r@x.com" }, today: "2026-10-16" };
  const r = L.renderCrmTemplate("Oi {{contato.primeiro_nome}}! {{empresa.nome}} · {{negocio.titulo}} por {{negocio.valor}} ({{negocio.etapa}}). {{vendedor.primeiro_nome}} — {{hoje}} — {{contato.telefone}}", ctx);
  assert.equal(r.text, `Oi Ana! Mercado Bom · Plano anual por ${L.formatMoneyBR(150000)} (Proposta). Rodrigo — 16/10/2026 — (44) 99999-1234`);
  assert.deepEqual(r.missing, []);
  const m = L.renderCrmTemplate("Oi {{contato.primeiro_nome}} da {{empresa.nome}} {{empresa.nome}}", { contact: { name: "Ana" } });
  assert.equal(m.text, "Oi Ana da  "); assert.deepEqual(m.missing, ["empresa.nome"]);
  assert.equal(L.renderCrmTemplate("{{negocio.valor}}", { deal: { value: 0 } }).text, L.formatMoneyBR(0), "zero é valor");
  assert.deepEqual(L.renderCrmTemplate("{{hoje}} {{contato.telefone}}", {}).missing, ["hoje", "contato.telefone"]);
  assert.equal(L.TEMPLATE_VARS.length, 12);
});

test("pontuação de lead e temperatura", () => {
  const rules = [
    { id: "r1", field: "sourceId", op: "eq", value: "indicacao", points: 30 },
    { id: "r2", field: "hasPhone", op: "eq", value: true, points: 15 },
    { id: "r3", field: "hasCnpj", op: "eq", value: true, points: 20 },
    { id: "r4", field: "value", op: "gte", value: 100000, points: 25 },
    { id: "r5", field: "utmSource", op: "eq", value: "concorrente", points: -40 },
    { id: "r6", field: "cf.porte", op: "in", value: ["médio", "grande"], points: 10 },
    { id: "r7", field: "hasEmail", op: "eq", value: false, points: -10 },
    { id: "r8", field: "hasEmail", op: "eq", value: true, points: 5 },
  ];
  assert.deepEqual(L.validateScoring({ rules, warmAt: 30, hotAt: 70 }), []);
  const paths = (o) => L.validateScoring(o).map((e) => e.path);
  assert.deepEqual(paths({ rules: [], warmAt: 70, hotAt: 30 }), ["hotAt"]);
  assert.deepEqual(paths({ rules: [], warmAt: 30, hotAt: 101 }), ["hotAt"]);
  assert.deepEqual(paths({ rules: [{ field: "idade", op: "eq", points: 5 }, { field: "via", op: "~", points: 0 }, { field: "via", op: "eq", points: 60 }] }), ["rules.0.field", "rules.1.op", "rules.1.points", "rules.2.points"]);
  assert.deepEqual(paths({ rules: Array(51).fill(rules[0]) }), ["rules"]);
  assert.deepEqual(paths({ rules: [{ field: "cf.porte", op: "eq", points: 5 }] }), [], "campo personalizado");
  const hot = L.leadScore({ sourceId: "indicacao", phone: "(44) 99999-1234", email: "a@x.com", cnpj: "11.222.333/0001-81", value: 150000, customFields: { porte: "grande" } }, rules);
  assert.equal(hot.score, 100, "teto 100 (30+15+20+25+10+5 = 105)");
  assert.deepEqual(hot.breakdown.map((b) => b.ruleId), ["r1", "r2", "r3", "r4", "r6", "r8"]);
  assert.deepEqual(L.leadScore({ email: "nao-e-email" }, rules).breakdown.map((b) => b.ruleId), ["r7"], "e-mail inválido conta como sem e-mail");
  const cold = L.leadScore({ utm: { source: "concorrente" }, phone: "123" }, rules);
  assert.equal(cold.score, 0, "piso 0 (−40 −10)");
  assert.deepEqual(cold.breakdown.map((b) => b.points), [-40, -10]);
  assert.equal(L.leadScore({ phone: "44999991234", email: "a@x.com", cnpj: "11222333000182" }, rules).score, 20, "CNPJ inválido não conta (telefone 15 + e-mail 5)");
  assert.equal(L.leadFacts({ companyName: " " }).hasCompany, false); assert.equal(L.leadFacts({ companyName: "Loja" }).hasCompany, true);
  assert.equal(L.temperatureOf(70), "HOT"); assert.equal(L.temperatureOf(69), "WARM"); assert.equal(L.temperatureOf(30), "WARM"); assert.equal(L.temperatureOf(29), "COLD");
  assert.equal(L.temperatureOf(50, { warmAt: 20, hotAt: 50 }), "HOT");
});

test("imobiliária: imóveis compatíveis com o interesse", () => {
  const ps = [
    { id: "a", status: "AVAILABLE", purpose: "SALE", type: "APARTMENT", neighborhood: "Zona 7", bedrooms: 2, priceCents: 40000000 },
    { id: "b", status: "AVAILABLE", purpose: "SALE", type: "APARTMENT", neighborhood: "Centro", bedrooms: 3, priceCents: 38000000 },
    { id: "c", status: "AVAILABLE", purpose: "SALE", type: "HOUSE", neighborhood: "Zona 7", bedrooms: 3, priceCents: 45000000 },
    { id: "d", status: "SOLD", purpose: "SALE", type: "APARTMENT", neighborhood: "Zona 7", bedrooms: 2, priceCents: 30000000 },
    { id: "e", status: "AVAILABLE", purpose: "RENT", type: "APARTMENT", neighborhood: "Zona 7", bedrooms: 2, priceCents: 200000 },
    { id: "f", status: "AVAILABLE", purpose: "SALE", type: "APARTMENT", neighborhood: "Zona 7", bedrooms: 1, priceCents: 25000000 },
    { id: "g", status: "AVAILABLE", purpose: "SALE", type: "APARTMENT", neighborhood: "zona 7", bedrooms: 2, priceCents: 50000001 },
    { id: "h", status: "AVAILABLE", purpose: "SALE", type: "APARTMENT", neighborhood: "Novo Centro", bedrooms: 2, priceCents: 35000000 },
  ];
  const r = L.matchProperties({ purpose: "SALE", types: ["APARTMENT"], neighborhoods: ["Zona 7"], minBedrooms: 2, maxPriceCents: 50000000 }, ps);
  assert.deepEqual(r.map((x) => x.property.id), ["a", "b", "h"], "bairro primeiro; depois mais quartos; depois o mais barato");
  assert.deepEqual(r[0].reasons, ["bairro desejado"]); assert.deepEqual(r[1].reasons, ["mais quartos que o pedido"]);
  assert.deepEqual(L.matchProperties({ purpose: "RENT" }, ps).map((x) => x.property.id), ["e"]);
  assert.deepEqual(L.matchProperties({ purpose: "SALE", types: ["APARTMENT"] }, ps).map((x) => x.property.id), ["f", "h", "b", "a", "g"], "empate: o mais barato primeiro");
  assert.deepEqual(L.matchProperties({ purpose: "SALE", minPriceCents: 40000000, maxPriceCents: 45000000 }, ps).map((x) => x.property.id), ["a", "c"]);
  assert.deepEqual(L.matchProperties({ purpose: "SALE", neighborhoods: ["ZONA 7"], minBedrooms: 2 }, ps).slice(0, 3).map((x) => x.property.id), ["c", "a", "g"], "bairro sem caixa; mais quartos desempata");
});

test("perfis de segmento", () => {
  assert.deepEqual(L.CRM_SEGMENTS.map((s) => s.id), ["GENERAL", "B2B", "REAL_ESTATE", "EDUCATION", "RETAIL"]);
  assert.equal(L.crmSegment("REAL_ESTATE").vocabulary.deal[1], "negociações");
  assert.equal(L.crmSegment("EDUCATION").vocabulary.deal[0], "matrícula");
  assert.equal(L.crmSegment("nope").id, "GENERAL");
  for (const s of L.CRM_SEGMENTS) {
    for (const sn of s.snippets) assert.deepEqual(L.validateTemplateVars({ body: sn.body }), [], `${s.id}: ${sn.name}`);
    if (s.sequence) assert.deepEqual(L.validateSequence(s.sequence), [], `${s.id}: sequência`);
    if (s.pipeline) for (const [n, p, r] of s.pipeline.stages) assert.ok(n && p >= 0 && p <= 100 && r > 0, `${s.id}: etapa ${n}`);
    for (const a of s.automations) {
      const stageIds = s.pipeline ? s.pipeline.stages.map(([n]) => n) : [];
      assert.deepEqual(L.validateAutomation({ ...a, trigger: { type: a.trigger.type, stageId: a.trigger.stage } }, { stageIds }), [], `${s.id}: ${a.name}`);
    }
  }
});
