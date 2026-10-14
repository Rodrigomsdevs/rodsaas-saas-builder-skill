import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "./catalog-lib.mjs";

const catalog = JSON.parse(readFileSync(new URL("../assets/catalogo.json", import.meta.url), "utf8"));
const RODSAAS = { presets: ["crm", "forms", "agenda", "helpdesk", "tarefas", "notion"], addons: ["uploads", "notificacoes", "email"], apps: [{ id: "cadastros" }, { id: "crm" }, { id: "forms" }, { id: "agenda" }, { id: "helpdesk" }, { id: "tarefas" }, { id: "paginas" }] };
const available = new Set(C.withStatus(catalog, RODSAAS).filter((a) => a.status === "disponivel").map((a) => a.id));

test("catálogo entregue é válido e cobre o roadmap inteiro", () => {
  assert.deepEqual(C.validateCatalog(catalog), []);
  assert.ok(catalog.apps.length >= 28);
  for (const id of ["crm", "helpdesk", "agenda", "tarefas", "paginas", "forms", "whatsapp", "cobrancas", "pessoas", "estoque", "chat", "email-marketing"]) assert.ok(catalog.apps.some((a) => a.id === id), id);
});

test("validateCatalog acusa os erros comuns", () => {
  const bad = structuredClone(catalog);
  bad.apps[1].slug = bad.apps[0].slug;
  bad.apps[2].category = "nada";
  bad.apps[3].benefits = bad.apps[3].benefits.slice(0, 2);
  bad.apps[4].pricing = { unit: "usuário" };
  bad.apps[5].integrations = ["inexistente"];
  bad.apps[0].shots = [{ id: "x", path: "crm", caption: "c" }];
  const e = C.validateCatalog(bad).join("\n");
  for (const m of ["slug repetido", "categoria desconhecida", "3 benefícios", "price > 0", "id desconhecido: inexistente", "path deve começar", "waitFor"]) assert.ok(e.includes(m), m);
});

test("withStatus: disponível pelo rodsaas.json (apps, presets ou add-ons), o resto em breve, disponíveis primeiro", () => {
  const list = C.withStatus(catalog, RODSAAS);
  assert.deepEqual([...available].sort(), ["agenda", "crm", "forms", "helpdesk", "paginas", "tarefas"]);
  assert.equal(list[0].status, "disponivel");
  assert.equal(list.find((a) => a.id === "pessoas").status, "em-breve");
  const withWa = C.withStatus(catalog, { ...RODSAAS, addons: [...RODSAAS.addons, "whatsapp", "pagamento-br"] });
  assert.equal(withWa.find((a) => a.id === "whatsapp").status, "disponivel");
  assert.equal(withWa.find((a) => a.id === "cobrancas").status, "disponivel", "add-on pagamento-br libera Cobranças");
});

test("formatBRL e priceLabel", () => {
  assert.equal(C.formatBRL(39), "R$ 39");
  assert.equal(C.formatBRL(1234.5), "R$ 1.234,50");
  const st = C.withStatus(catalog, RODSAAS);
  const by = (id) => st.find((a) => a.id === id);
  assert.equal(C.priceLabel(by("crm"), catalog), "R$ 39 por vendedor/mês");
  assert.equal(C.priceLabel(by("forms"), catalog), "a partir de R$ 29/mês");
  assert.equal(C.priceLabel(by("pessoas"), catalog), "Preço no lançamento", "em breve não mostra preço");
  const suite = { ...by("pessoas"), status: "disponivel" };
  assert.equal(C.priceLabel(suite, catalog), "Suíte RH: R$ 5 por colaborador/mês");
});

test("quote: exemplos da conversa de preço (clínica, agência, loja) e o Completo como teto", () => {
  const q1 = C.quote(catalog, { apps: { agenda: { seats: 3 }, crm: { seats: 1 }, forms: {} }, users: 4 }, { available });
  assert.equal(q1.monthly, 3 * 19 + 39 + 29);
  assert.equal(q1.best, "avulso");
  const q2 = C.quote(catalog, { apps: { tarefas: { seats: 8 }, paginas: { seats: 8 }, crm: { seats: 3 }, forms: {} }, users: 8 }, { available });
  assert.equal(q2.monthly, 96 + 72 + 117 + 29);
  const heavy = C.quote(catalog, { apps: { crm: { seats: 10 }, helpdesk: { seats: 10 }, agenda: { seats: 10 }, tarefas: { seats: 10 } }, users: 10 }, { available });
  assert.equal(heavy.monthly, 10 * (39 + 39 + 19 + 12));
  assert.equal(heavy.completoMonthly, 690);
  assert.equal(heavy.best, "completo");
  assert.equal(heavy.savingsWithCompleto, 1090 - 690);
  assert.equal(heavy.annual.total, 6900, "anual = 10 meses");
  assert.equal(heavy.annual.monthsFree, 2);
});

test("quote: grátis com até 2 usuários só nos apps grátis; faixa de Forms paga tira do grátis", () => {
  assert.equal(C.quote(catalog, { apps: { tarefas: { seats: 2 }, paginas: {} }, users: 2 }, { available }).best, "gratis");
  assert.equal(C.quote(catalog, { apps: { tarefas: {} }, users: 3 }, { available }).best, "avulso");
  assert.equal(C.quote(catalog, { apps: { forms: { tier: 1 } }, users: 1 }, { available }).best, "avulso");
  assert.equal(C.quote(catalog, { apps: { crm: {} }, users: 1 }, { available }).best, "avulso");
});

test("quote: Suíte RH por colaborador com mínimo, app em breve não entra, uso vira nota", () => {
  // um segundo app da suíte (futuro) para conferir que vários apps da suíte viram uma linha só
  const cat2 = structuredClone(catalog);
  cat2.apps.push({ ...structuredClone(cat2.apps.find((a) => a.id === "pessoas")), id: "ponto", slug: "ponto", name: "Ponto" });
  cat2.pricing.suites.rh.apps.push("ponto");
  const all = new Set([...available, "pessoas", "ponto", "whatsapp"]);
  const q = C.quote(cat2, { apps: { pessoas: {}, ponto: {}, whatsapp: {} }, users: 3, employees: 10 }, { available: all });
  const suite = q.lines.find((l) => l.appId === "suite:rh");
  assert.equal(suite.total, 79, "10 × 5 = 50, mínimo 79");
  assert.equal(suite.minimumApplied, true);
  assert.equal(q.lines.filter((l) => l.appId === "suite:rh").length, 1, "dois apps da suíte = uma linha");
  assert.ok(q.usageNotes[0].startsWith("WhatsApp:"));
  const q2 = C.quote(catalog, { apps: { pessoas: {} }, users: 3, employees: 40 }, { available: all });
  assert.equal(q2.lines[0].total, 200);
  assert.equal(C.quote(catalog, { apps: { pessoas: {} }, users: 3, employees: 40 }, { available }).lines.length, 0, "em breve não é vendido");
});

test("signupUrl e relatedApps", () => {
  const u = C.signupUrl("https://app.usebancada.app", { apps: ["crm", "agenda"], plan: "completo", cycle: "annual", utm: { utm_source: "google", evil: "x" } });
  assert.equal(u, "https://app.usebancada.app/cadastro?apps=crm%2Cagenda&plano=completo&ciclo=anual&utm_source=google");
  const rel = C.relatedApps(catalog, "crm").map((a) => a.id);
  assert.ok(rel.includes("forms") && rel.length === 3);
  const ld = C.productJsonLd({ name: "Bancada", url: "https://usebancada.app", description: "x", catalog, available });
  assert.equal(ld.offers.priceCurrency, "BRL");
  assert.equal(ld["@type"], "SoftwareApplication");
});
