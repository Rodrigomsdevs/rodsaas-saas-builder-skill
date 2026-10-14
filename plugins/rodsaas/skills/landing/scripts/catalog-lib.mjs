// rodsaas · landing — regras puras do catálogo de apps e da calculadora de preço (sem rede, sem React).
// Copie para site/src/lib/ (porte para TS se quiser) junto com os testes de catalog-lib.test.mjs.
// O site importa o catálogo (assets/catalogo.json copiado para site/src/content/catalogo.json) e usa:
//   withStatus()  → quais apps estão disponíveis (pelo rodsaas.json) e quais são "em breve"
//   priceLabel()  → texto do preço de cada app
//   quote()       → calculadora da página de preços
//   signupUrl()   → link do botão "Começar" com apps, plano e UTMs
// Rode: node --test catalog-lib.test.mjs

const UNITS_PER_SEAT = new Set(["usuário", "vendedor", "atendente", "profissional com agenda", "local"]);

/** Erros do catálogo (ids/slugs repetidos, categoria inexistente, preço mal formado, textos longos, prints sem espera). */
export function validateCatalog(c) {
  const errors = [];
  const cats = new Set((c.categories ?? []).map((x) => x.id));
  const ids = new Set(), slugs = new Set();
  const known = new Set([...(c.apps ?? []).map((a) => a.id), ...(c.platform ?? []).map((p) => p.id)]);
  const suites = c.pricing?.suites ?? {};
  for (const a of c.apps ?? []) {
    const w = (m) => errors.push(`${a.id ?? "(sem id)"}: ${m}`);
    if (!/^[a-z][a-z0-9-]*$/.test(a.id ?? "")) w("id inválido");
    if (ids.has(a.id)) w("id repetido"); ids.add(a.id);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(a.slug ?? "")) w("slug inválido");
    if (slugs.has(a.slug)) w("slug repetido"); slugs.add(a.slug);
    if (!cats.has(a.category)) w(`categoria desconhecida: ${a.category}`);
    if (!a.name) w("nome obrigatório");
    if (!a.icon) w("ícone obrigatório");
    if (!a.tagline || a.tagline.length > 90) w("tagline obrigatória com até 90 caracteres");
    if (!a.description || a.description.length > 240) w("descrição obrigatória com até 240 caracteres");
    if (!Array.isArray(a.benefits) || a.benefits.length !== 3 || a.benefits.some((b) => !b.title || !b.text)) w("exatamente 3 benefícios com título e texto");
    if (!Array.isArray(a.features) || a.features.length < 4) w("pelo menos 4 recursos");
    const p = a.pricing ?? {};
    if (p.suite) { if (!suites[p.suite]) w(`suíte desconhecida: ${p.suite}`); }
    else if (p.unit === "uso" || p.unit === "incluido") { if (!p.note) w("preço por uso/incluído precisa de nota"); }
    else if (Array.isArray(p.tiers)) { if (!p.tiers.length || p.tiers.some((t) => !t.label || !(t.price > 0))) w("faixas de preço inválidas"); }
    else if (!p.unit || !(p.price > 0)) w("preço precisa de unit e price > 0 (ou tiers, suite, uso, incluido)");
    for (const i of a.integrations ?? []) if (!known.has(i)) w(`integração com id desconhecido: ${i}`);
    for (const s of a.shots ?? []) {
      if (!s.id || !s.caption) w("print sem id ou legenda");
      if (!/^(\/|\$public:)/.test(s.path ?? "")) w(`print ${s.id}: path deve começar com / ou $public:`);
      if (!s.waitFor) w(`print ${s.id}: waitFor (testid) obrigatório`);
    }
  }
  for (const s of Object.entries(suites)) for (const id of s[1].apps ?? []) if (!ids.has(id)) errors.push(`suíte ${s[0]}: app desconhecido ${id}`);
  for (const id of c.pricing?.free?.apps ?? []) if (!ids.has(id)) errors.push(`grátis: app desconhecido ${id}`);
  return errors;
}

/**
 * Apps com status pelo rodsaas.json do projeto: "disponivel" se o app está em rodsaas.json → apps (id) ou o
 * preset/add-on dele está em presets/addons; senão "em-breve". Ordem: disponíveis primeiro, na ordem do catálogo.
 */
export function withStatus(catalog, rodsaas = {}) {
  const appIds = new Set((rodsaas.apps ?? []).map((a) => a.id));
  const installed = new Set([...(rodsaas.presets ?? []), ...(rodsaas.addons ?? [])]);
  const list = catalog.apps.map((a) => ({ ...a, status: appIds.has(a.id) || installed.has(a.preset) ? "disponivel" : "em-breve" }));
  return [...list.filter((a) => a.status === "disponivel"), ...list.filter((a) => a.status !== "disponivel")];
}

/** 39 → "R$ 39"; 1234.5 → "R$ 1.234,50"; 0 → "R$ 0". */
export function formatBRL(n) {
  const v = Math.round(Number(n) * 100) / 100;
  const cents = Math.round(v * 100) % 100 !== 0;
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
}

/** Texto do preço de um app ("R$ 39 por vendedor/mês", "a partir de R$ 29/mês", "Suíte RH", "Incluído", "Por uso"). */
export function priceLabel(app, catalog) {
  const p = app.pricing ?? {};
  if (app.status === "em-breve") return "Preço no lançamento";
  if (p.suite) { const s = catalog.pricing.suites[p.suite]; return `${s.label}: ${formatBRL(s.price)} por ${s.unit}/mês`; }
  if (p.unit === "incluido") return "Incluído";
  if (p.unit === "uso") return "Por uso";
  if (Array.isArray(p.tiers)) return `a partir de ${formatBRL(Math.min(...p.tiers.map((t) => t.price)))}/mês`;
  if (p.unit === "empresa") return `${formatBRL(p.price)}/mês`;
  return `${formatBRL(p.price)} por ${p.unit}/mês`;
}

/**
 * Calculadora da página de preços.
 * selection: { apps: { crm: { seats: 3 }, forms: { tier: 0 }, pessoas: {} }, users, employees, cycle: "monthly"|"annual" }
 *   - seats: quantas pessoas usam aquele app (para apps cobrados por pessoa)
 *   - users: pessoas da empresa que usam o sistema (para o Completo e o grátis)
 *   - employees: colaboradores (para a Suíte RH)
 * Só apps disponíveis entram. Devolve linhas, total avulso, total do Completo, o mais barato e os valores do anual.
 */
export function quote(catalog, selection, { available } = {}) {
  const P = catalog.pricing;
  const byId = new Map(catalog.apps.map((a) => [a.id, a]));
  const ok = (id) => byId.has(id) && (!available || available.has(id));
  const users = Math.max(1, Math.floor(selection.users ?? 1));
  const employees = Math.max(0, Math.floor(selection.employees ?? 0));
  const chosen = Object.entries(selection.apps ?? {}).filter(([id]) => ok(id));
  const lines = [];
  const suitesUsed = new Set();
  for (const [id, opt] of chosen) {
    const a = byId.get(id), p = a.pricing;
    if (p.suite) { suitesUsed.add(p.suite); continue; }
    if (p.unit === "uso" || p.unit === "incluido") { lines.push({ appId: id, label: a.name, qty: 1, unit: p.unit === "uso" ? "uso" : "incluído", unitPrice: 0, total: 0, note: p.note }); continue; }
    if (Array.isArray(p.tiers)) { const t = p.tiers[Math.min(Math.max(0, opt?.tier ?? 0), p.tiers.length - 1)]; lines.push({ appId: id, label: `${a.name} (${t.label})`, qty: 1, unit: "empresa", unitPrice: t.price, total: t.price }); continue; }
    const qty = UNITS_PER_SEAT.has(p.unit) ? Math.max(1, Math.floor(opt?.seats ?? 1)) : 1;
    lines.push({ appId: id, label: a.name, qty, unit: p.unit, unitPrice: p.price, total: qty * p.price });
  }
  for (const sid of suitesUsed) {
    const s = P.suites[sid];
    const total = Math.max(s.minimum ?? 0, employees * s.price);
    lines.push({ appId: `suite:${sid}`, label: s.label, qty: employees, unit: s.unit, unitPrice: s.price, total, minimumApplied: total > employees * s.price });
  }
  const monthly = lines.reduce((t, l) => t + l.total, 0);
  const usageOnly = lines.filter((l) => l.unit === "uso");
  const completoMonthly = Math.max(P.completo.minUsers, users) * P.completo.pricePerUser;
  const freeApps = new Set(P.free.apps);
  const free = chosen.length > 0 && users <= P.free.maxUsers && chosen.every(([id]) => freeApps.has(id)) && chosen.every(([id, opt]) => id !== "forms" || !(opt?.tier > 0));
  const best = free ? "gratis" : chosen.length && completoMonthly < monthly ? "completo" : "avulso";
  const months = P.annualMonthsCharged ?? 10;
  const pick = best === "gratis" ? 0 : best === "completo" ? completoMonthly : monthly;
  return {
    lines, monthly, completoMonthly, best, free,
    usageNotes: usageOnly.map((l) => `${l.label}: ${l.note}`),
    savingsWithCompleto: best === "completo" ? monthly - completoMonthly : 0,
    annual: { total: pick * months, perMonth: Math.round((pick * months / 12) * 100) / 100, monthsFree: 12 - months },
    cycle: selection.cycle === "annual" ? "annual" : "monthly",
  };
}

/** Link do "Começar": cadastro do painel com apps, plano, ciclo e UTMs (o painel guarda e aplica depois do cadastro). */
export function signupUrl(appURL, { apps = [], plan = null, cycle = null, utm = {} } = {}) {
  const u = new URL("/cadastro", appURL);
  if (apps.length) u.searchParams.set("apps", apps.join(","));
  if (plan) u.searchParams.set("plano", plan);
  if (cycle) u.searchParams.set("ciclo", cycle === "annual" ? "anual" : "mensal");
  for (const [k, v] of Object.entries(utm)) if (/^utm_(source|medium|campaign|term|content)$/.test(k) && v) u.searchParams.set(k, String(v).slice(0, 100));
  return u.toString();
}

/** Apps relacionados (integrações nos dois sentidos), só os que existem no catálogo. */
export function relatedApps(catalog, id, limit = 3) {
  const a = catalog.apps.find((x) => x.id === id);
  if (!a) return [];
  const back = catalog.apps.filter((x) => (x.integrations ?? []).includes(id)).map((x) => x.id);
  const ids = [...new Set([...(a.integrations ?? []), ...back])].filter((x) => x !== id && catalog.apps.some((y) => y.id === x));
  return ids.slice(0, limit).map((x) => catalog.apps.find((y) => y.id === x));
}

/** JSON-LD SoftwareApplication do produto (home) com a oferta mais barata e as categorias. */
export function productJsonLd({ name, url, description, catalog, available }) {
  const prices = catalog.apps.filter((a) => available.has(a.id) && a.pricing?.price > 0).map((a) => a.pricing.price);
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name, url, description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    offers: { "@type": "AggregateOffer", priceCurrency: "BRL", lowPrice: 0, highPrice: catalog.pricing.completo.pricePerUser, offerCount: prices.length + 2 },
  };
}
