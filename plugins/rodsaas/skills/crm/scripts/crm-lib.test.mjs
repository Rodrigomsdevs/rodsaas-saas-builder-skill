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
