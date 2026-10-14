// rodsaas · erp (app ERP) — regras puras de produtos, preços, estoque, vendas, PDV, compras e relatórios (sem banco, sem rede).
// Dinheiro SEMPRE em centavos (inteiros); quantidade com até 3 casas (1,5 kg); datas de calendário "YYYY-MM-DD".
// Produtos simples, com variações (grade cor × tamanho), kits (composição) e serviços; código de barras EAN-8/13 e
// código interno; tabelas de preço (varejo, atacado: preço fixo ou % sobre o base) e faixas por quantidade
// (10+ un, 50+ un); margem e markup; saldo por depósito a partir das movimentações, reservado × disponível, custo médio
// ponderado, disponibilidade e baixa de kit, inventário, sugestão de compra; totais do pedido com desconto por item e
// geral (rateado), frete e parcelas; fluxo do pedido (orçamento → pedido → separação → entregue), limite de crédito,
// devolução; PDV: leitura "3*código", pagamentos com troco só em dinheiro, caixa (abertura, sangria, suprimento,
// fechamento com diferença); compras: recebimento parcial e rateio do frete no custo; curva ABC e dias de estoque.
// Porte para TypeScript em api/src/modules/erp/lib/ (e o que o PDV usar no front), com os testes.
// Rode: node --test erp-lib.test.mjs

// ------------------------------------------------------------------ datas, documentos e formatos

const pad = (n) => String(n).padStart(2, "0");
const parse = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (ms) => { const t = new Date(ms); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
export const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;
export const addDays = (ymd, n) => fmt(parse(ymd) + n * 86_400_000);
export const formatBRL = (cents) => (cents < 0 ? "-" : "") + "R$ " + (Math.abs(cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const onlyDigits = (s) => String(s ?? "").replace(/\D/g, "");
export function isValidCpf(v) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len) => { let s = 0; for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
export function isValidCnpj(v) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len) => { const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < len; i++) s += Number(d[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
export const documentType = (v) => (isValidCpf(v) ? "CPF" : isValidCnpj(v) ? "CNPJ" : null);

/** Quantidade válida: número > 0 com até 3 casas (unidade fracionável) ou inteiro (unidade inteira). */
export const isQty = (q, { fractional = true } = {}) => typeof q === "number" && Number.isFinite(q) && q > 0 && (fractional ? Math.round(q * 1000) === q * 1000 : Number.isInteger(q));
/** Arredonda quantidade para 3 casas (evita 0.1 + 0.2). */
export const roundQty = (q) => Math.round(q * 1000) / 1000;

// ------------------------------------------------------------------ código de barras

/** Dígito verificador GTIN (EAN-8, EAN-13, GTIN-14) para os dígitos sem o verificador. */
export function gtinCheckDigit(body) {
  const d = onlyDigits(body);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += Number(d[d.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (s % 10)) % 10;
}
/** EAN-8, EAN-13 ou GTIN-14 com o dígito certo. */
export function isValidGtin(code) {
  const d = String(code ?? "");
  if (!/^(\d{8}|\d{13}|\d{14})$/.test(d)) return false;
  return gtinCheckDigit(d.slice(0, -1)) === Number(d.at(-1));
}
/** Código interno da empresa (EAN-13 com prefixo 2, faixa de uso interno): "2" + 11 dígitos da sequência + verificador. */
export function internalBarcode(seq) {
  if (!Number.isInteger(seq) || seq < 1 || seq > 99_999_999_999) throw new Error("sequência inválida");
  const body = "2" + String(seq).padStart(11, "0");
  return body + gtinCheckDigit(body);
}

// ------------------------------------------------------------------ produtos

export const PRODUCT_TYPES = ["SIMPLE", "VARIANT", "KIT", "SERVICE"];
export const UNITS = { UN: false, CX: false, PC: false, PAR: false, KG: true, G: true, L: true, ML: true, M: true, M2: true, M3: true, H: true };
const err = (list, code, message, path) => list.push({ code, message, path });

/**
 * Valida um produto. p: { type, name, unit, sku?, barcode?, priceCents, costCents?, attributes?, components?, minStock?, maxStock? }
 *  - VARIANT: attributes [{ name, values: [..] }] (1 a 3, valores únicos, até 30 cada); as variações saem de variantCombinations
 *  - KIT: components [{ productId, qty }] (sem ele mesmo, sem repetir, quantidade da unidade do componente)
 *  - SERVICE: não controla estoque
 */
export function validateProduct(p, { selfId = null } = {}) {
  const e = [];
  if (!PRODUCT_TYPES.includes(p.type)) err(e, "TYPE_INVALID", "Tipo de produto inválido", "type");
  if (!String(p.name ?? "").trim()) err(e, "NAME_REQUIRED", "Informe o nome", "name");
  if (!(p.unit in UNITS)) err(e, "UNIT_INVALID", "Unidade inválida", "unit");
  if (p.sku != null && p.sku !== "" && !/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(p.sku)) err(e, "SKU_INVALID", "Código: letras maiúsculas, números, ponto, hífen e sublinhado", "sku");
  if (p.barcode != null && p.barcode !== "" && !isValidGtin(p.barcode)) err(e, "BARCODE_INVALID", "Código de barras inválido (EAN-8/13 com o dígito certo)", "barcode");
  if (!Number.isInteger(p.priceCents) || p.priceCents < 0) err(e, "PRICE_INVALID", "Preço em centavos", "priceCents");
  if (p.costCents != null && !(Number.isInteger(p.costCents) && p.costCents >= 0)) err(e, "COST_INVALID", "Custo em centavos", "costCents");
  if (p.minStock != null && !(typeof p.minStock === "number" && p.minStock >= 0)) err(e, "MIN_INVALID", "Estoque mínimo inválido", "minStock");
  if (p.maxStock != null && p.minStock != null && p.maxStock < p.minStock) err(e, "MAX_BELOW_MIN", "Máximo menor que o mínimo", "maxStock");
  if (p.type === "VARIANT") {
    const at = p.attributes ?? [];
    if (!Array.isArray(at) || at.length < 1 || at.length > 3) err(e, "ATTRIBUTES_INVALID", "De 1 a 3 atributos (ex.: cor, tamanho)", "attributes");
    else at.forEach((a, i) => {
      const vals = (a.values ?? []).map((v) => String(v).trim());
      if (!String(a.name ?? "").trim()) err(e, "ATTRIBUTE_NAME", "Nome do atributo", `attributes.${i}.name`);
      if (!vals.length || vals.length > 30 || vals.some((v) => !v)) err(e, "ATTRIBUTE_VALUES", "De 1 a 30 valores", `attributes.${i}.values`);
      else if (new Set(vals.map((v) => v.toLowerCase())).size !== vals.length) err(e, "ATTRIBUTE_DUPLICATE", "Valor repetido", `attributes.${i}.values`);
    });
    if (!e.some((x) => x.path?.startsWith("attributes")) && combinationsCount(at) > 200) err(e, "TOO_MANY_VARIANTS", "No máximo 200 variações", "attributes");
  }
  if (p.type === "KIT") {
    const c = p.components ?? [];
    if (!Array.isArray(c) || !c.length) err(e, "KIT_EMPTY", "Inclua os itens do kit", "components");
    else {
      const seen = new Set();
      c.forEach((x, i) => {
        if (!x.productId) err(e, "COMPONENT_REQUIRED", "Escolha o produto", `components.${i}.productId`);
        else if (selfId && x.productId === selfId) err(e, "KIT_SELF", "O kit não pode conter ele mesmo", `components.${i}.productId`);
        else if (seen.has(x.productId)) err(e, "COMPONENT_DUPLICATE", "Produto repetido no kit", `components.${i}.productId`);
        seen.add(x.productId);
        if (!isQty(x.qty)) err(e, "QTY_INVALID", "Quantidade maior que zero, até 3 casas", `components.${i}.qty`);
      });
    }
  }
  return e;
}
const combinationsCount = (attributes) => attributes.reduce((n, a) => n * (a.values?.length ?? 0), 1);
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 6);
/**
 * Grade de variações (produto cartesiano, na ordem dos atributos e valores).
 * → [{ key: "azul|p", values: { Cor: "Azul", Tamanho: "P" }, label: "Azul / P", skuSuffix: "AZUL-P" }]
 */
export function variantCombinations(attributes) {
  let out = [{ values: {}, parts: [] }];
  for (const a of attributes) out = out.flatMap((c) => a.values.map((v) => ({ values: { ...c.values, [a.name]: v }, parts: [...c.parts, String(v)] })));
  return out.map((c) => ({ key: c.parts.map((x) => x.toLowerCase()).join("|"), values: c.values, label: c.parts.join(" / "), skuSuffix: c.parts.map(slug).join("-") }));
}
/** SKU da variação: "CAMISETA" + ["Azul","P"] → "CAMISETA-AZUL-P". */
export const variantSku = (baseSku, combo) => `${baseSku}-${combo.skuSuffix}`;
/**
 * Muda a grade sem perder variações com histórico: compara as chaves atuais com a nova grade.
 * → { create: [combo], keep: [key], archive: [key] } (variação que sai e tem movimento é arquivada, nunca apagada)
 */
export function diffVariants(currentKeys, attributes) {
  const next = variantCombinations(attributes), nextKeys = new Set(next.map((c) => c.key));
  return { create: next.filter((c) => !currentKeys.includes(c.key)), keep: currentKeys.filter((k) => nextKeys.has(k)), archive: currentKeys.filter((k) => !nextKeys.has(k)) };
}

// ------------------------------------------------------------------ preços

/** Faixas por quantidade: [{ minQty, priceCents }] com minQty > 1, crescente, sem repetir; preço inteiro > 0. */
export function validateTiers(tiers) {
  const e = [];
  if (!Array.isArray(tiers)) return [{ code: "TIERS_INVALID", message: "Faixas inválidas", path: "tiers" }];
  tiers.forEach((t, i) => {
    if (!(typeof t.minQty === "number" && t.minQty > 1 && Math.round(t.minQty * 1000) === t.minQty * 1000)) err(e, "TIER_QTY_INVALID", "A partir de quantas unidades (maior que 1)", `tiers.${i}.minQty`);
    else if (i > 0 && !(t.minQty > tiers[i - 1].minQty)) err(e, "TIER_ORDER", "Faixas em ordem crescente, sem repetir", `tiers.${i}.minQty`);
    if (!Number.isInteger(t.priceCents) || t.priceCents <= 0) err(e, "TIER_PRICE_INVALID", "Preço da faixa em centavos", `tiers.${i}.priceCents`);
  });
  return e;
}
/**
 * Preço da tabela: override do produto (centavos) ou o ajuste da tabela sobre o preço base (% com 2 casas, ex.: -10 = atacado 10% menor).
 * table: { kind: "BASE" | "PERCENT", pct? } · override: centavos | null
 */
export function tablePrice(basePriceCents, table, overrideCents = null) {
  if (overrideCents != null) return overrideCents;
  if (!table || table.kind === "BASE") return basePriceCents;
  return Math.max(0, Math.round(basePriceCents * (1 + table.pct / 100)));
}
/**
 * Preço unitário de venda. Começa no preço da tabela; se o produto tem faixas por quantidade, vale a faixa com o maior
 * minQty ≤ qty; o resultado é o MENOR entre o da tabela e o da faixa (atacado nunca fica mais caro por levar mais).
 * → { unitCents, source: "table" | "tier", tier: { minQty, priceCents } | null }
 */
export function unitPrice({ basePriceCents, table = null, overrideCents = null, tiers = [], qty = 1 }) {
  const t = tablePrice(basePriceCents, table, overrideCents);
  const tier = [...tiers].sort((a, b) => b.minQty - a.minQty).find((x) => qty >= x.minQty) ?? null;
  if (tier && tier.priceCents < t) return { unitCents: tier.priceCents, source: "tier", tier };
  return { unitCents: t, source: "table", tier: null };
}
/** Margem (sobre o preço) e markup (sobre o custo), 1 casa. Sem custo → null. */
export function margin({ priceCents, costCents }) {
  if (costCents == null || costCents <= 0 || priceCents <= 0) return { marginPct: null, markupPct: null, profitCents: costCents == null ? null : priceCents - costCents };
  const p = priceCents - costCents;
  return { marginPct: Math.round((p / priceCents) * 1000) / 10, markupPct: Math.round((p / costCents) * 1000) / 10, profitCents: p };
}
/** Preço a partir do custo e do markup desejado (%): 1000 + 50% → 1500. */
export const priceFromMarkup = (costCents, markupPct) => Math.round(costCents * (1 + markupPct / 100));

// ------------------------------------------------------------------ estoque

export const MOVE_TYPES = ["IN", "OUT", "ADJUST", "TRANSFER_IN", "TRANSFER_OUT", "SALE", "RETURN", "PURCHASE", "INVENTORY"];
/** Saldos a partir das movimentações [{ productId, warehouseId, qty (+ entra, − sai) }] → { "prod|dep": qty } */
export function balances(movements) {
  const out = {};
  for (const m of movements) { const k = `${m.productId}|${m.warehouseId}`; out[k] = roundQty((out[k] ?? 0) + m.qty); }
  return out;
}
/** Disponível = em estoque − reservado (pedidos confirmados ainda não entregues). */
export const available = ({ onHand, reserved = 0 }) => roundQty(onHand - reserved);
/** Pode sair? → { ok, code? } (estoque negativo só se a configuração permitir) */
export function canTakeOut({ availableQty, qty, allowNegative = false }) {
  if (!isQty(qty)) return { ok: false, code: "QTY_INVALID" };
  if (!allowNegative && roundQty(availableQty - qty) < 0) return { ok: false, code: "INSUFFICIENT_STOCK", missing: roundQty(qty - availableQty) };
  return { ok: true };
}
/**
 * Custo médio ponderado depois de uma entrada (compra, devolução de cliente usa o custo médio atual):
 * saldo ≤ 0 → o custo da entrada; senão (qtd × médio + entrada × custo) / (qtd + entrada), arredondado ao centavo.
 */
export function averageCost({ qty, avgCostCents }, { inQty, unitCostCents }) {
  if (qty <= 0) return unitCostCents;
  return Math.round((qty * avgCostCents + inQty * unitCostCents) / (qty + inQty));
}
/** Disponível de um kit: o menor floor(disponível do componente / quantidade no kit). */
export function kitAvailable(components, availableOf) {
  if (!components.length) return 0;
  return Math.max(0, Math.min(...components.map((c) => Math.floor(roundQty(availableOf(c.productId) / c.qty) + 1e-9))));
}
/** Baixa de kit: o kit não tem estoque próprio, sai cada componente × quantidade. */
export const explodeKit = (kitQty, components) => components.map((c) => ({ productId: c.productId, qty: roundQty(kitQty * c.qty) }));
/** Custo do kit = soma dos custos dos componentes × quantidade. */
export const kitCost = (components, costOf) => Math.round(components.reduce((s, c) => s + costOf(c.productId) * c.qty, 0));
/** Inventário: contagens [{ productId, warehouseId, counted }] contra o saldo → ajustes só onde difere. */
export function inventoryAdjustments(counts, balanceOf) {
  return counts.map((c) => { const expected = balanceOf(c.productId, c.warehouseId); return { ...c, expected, diff: roundQty(c.counted - expected) }; }).filter((x) => x.diff !== 0);
}
/** Sugestão de compra: abaixo do mínimo → completar até o máximo (ou o mínimo) contando o que já está pedido. */
export function reorderSuggestion({ min, max = null, onHand, reserved = 0, incoming = 0 }) {
  const projected = roundQty(onHand - reserved + incoming);
  if (min == null || projected >= min) return 0;
  return roundQty((max ?? min) - projected);
}

// ------------------------------------------------------------------ vendas

/** Divide um valor em partes proporcionais aos pesos, centavo a centavo (maiores restos), somando exato. */
export function allocate(amountCents, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return weights.map(() => 0);
  const raw = weights.map((w) => (amountCents * w) / total), base = raw.map(Math.floor);
  let rest = amountCents - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - base[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k++, rest--) base[order[k % order.length][1]] += 1;
  return base;
}
/**
 * Totais do pedido. lines: [{ qty, unitCents, discountPct?, discountCents? }]; desconto geral (% ou centavos) rateado
 * pelas linhas (para a nota e a devolução saberem o valor de cada item); frete somado no fim.
 * → { lines: [{ grossCents, discountCents, globalDiscountCents, netCents }], subtotalCents, itemDiscountCents, globalDiscountCents, freightCents, totalCents }
 */
export function orderTotals(lines, { discountPct = 0, discountCents = 0, freightCents = 0 } = {}) {
  const ls = lines.map((l) => {
    const gross = Math.round(l.qty * l.unitCents);
    const d = Math.min(gross, l.discountPct ? Math.round((gross * l.discountPct) / 100) : l.discountCents ?? 0);
    return { grossCents: gross, discountCents: d, afterCents: gross - d };
  });
  const after = ls.reduce((a, l) => a + l.afterCents, 0);
  const global = Math.min(after, discountPct ? Math.round((after * discountPct) / 100) : discountCents);
  const parts = allocate(global, ls.map((l) => l.afterCents));
  const out = ls.map((l, i) => ({ grossCents: l.grossCents, discountCents: l.discountCents, globalDiscountCents: parts[i], netCents: l.afterCents - parts[i] }));
  return { lines: out, subtotalCents: ls.reduce((a, l) => a + l.grossCents, 0), itemDiscountCents: ls.reduce((a, l) => a + l.discountCents, 0), globalDiscountCents: global, freightCents, totalCents: after - global + freightCents };
}
/** Valida as linhas do pedido (mesma regra de quantidade da unidade do produto). */
export function validateLines(lines) {
  const e = [];
  if (!Array.isArray(lines) || !lines.length) return [{ code: "EMPTY_ORDER", message: "Inclua pelo menos um item", path: "items" }];
  lines.forEach((l, i) => {
    if (!l.productId) err(e, "PRODUCT_REQUIRED", "Escolha o produto", `items.${i}.productId`);
    if (!isQty(l.qty, { fractional: l.fractional ?? true })) err(e, "QTY_INVALID", l.fractional === false ? "Quantidade inteira maior que zero" : "Quantidade maior que zero, até 3 casas", `items.${i}.qty`);
    if (l.unitCents != null && !(Number.isInteger(l.unitCents) && l.unitCents >= 0)) err(e, "PRICE_INVALID", "Preço em centavos", `items.${i}.unitCents`);
    if (l.discountPct != null && !(l.discountPct >= 0 && l.discountPct <= 100)) err(e, "DISCOUNT_INVALID", "Desconto entre 0% e 100%", `items.${i}.discountPct`);
    if (l.discountPct != null && l.discountCents != null) err(e, "DISCOUNT_INVALID", "Use % ou R$, não os dois", `items.${i}.discountCents`);
  });
  return e;
}
/**
 * Fluxo do pedido de venda. QUOTE (orçamento) → CONFIRMED (reserva o estoque) → PICKING (separação) → DELIVERED (baixa)
 * · CANCELED a partir de QUOTE/CONFIRMED/PICKING (libera a reserva). Venda do PDV nasce DELIVERED.
 */
export const ORDER_FLOW = { QUOTE: ["CONFIRMED", "CANCELED"], CONFIRMED: ["PICKING", "DELIVERED", "CANCELED", "QUOTE"], PICKING: ["DELIVERED", "CONFIRMED", "CANCELED"], DELIVERED: [], CANCELED: [] };
export const canTransition = (from, to) => (ORDER_FLOW[from] ?? []).includes(to);
/** Situação do orçamento: vencido se passou da validade (sem job). */
export const quoteStatus = (o, today) => (o.status === "QUOTE" && o.validUntil && o.validUntil < today ? "EXPIRED" : o.status);
/** Limite de crédito do cliente (venda a prazo): em aberto + este pedido ≤ limite. null = sem limite. */
export function creditCheck({ limitCents, openCents, orderCents }) {
  if (limitCents == null) return { ok: true, availableCents: null };
  const availableCents = limitCents - openCents;
  return { ok: orderCents <= availableCents, availableCents };
}
/** Parcelas com o centavo da diferença na primeira, a cada `intervalDays` (padrão 30). */
export function installments(totalCents, n, firstDue, intervalDays = 30) {
  if (!Number.isInteger(n) || n < 1 || n > 24) throw new Error("de 1 a 24 parcelas");
  const base = Math.floor(totalCents / n), rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => ({ number: i + 1, amountCents: base + (i === 0 ? rest : 0), dueDate: addDays(firstDue, i * intervalDays) }));
}
/**
 * Devolução: [{ lineId, qty }] contra as linhas entregues [{ id, qty, netCents }] e o já devolvido { lineId: qty }.
 * → { ok, errors, refundCents } (valor proporcional ao líquido da linha, já com o desconto rateado)
 */
export function returnPlan(lines, returned, request) {
  const errors = []; let refund = 0;
  request.forEach((r, i) => {
    const l = lines.find((x) => x.id === r.lineId);
    if (!l) { err(errors, "LINE_NOT_FOUND", "Item não pertence ao pedido", `items.${i}.lineId`); return; }
    if (!isQty(r.qty)) { err(errors, "QTY_INVALID", "Quantidade inválida", `items.${i}.qty`); return; }
    const left = roundQty(l.qty - (returned[l.id] ?? 0));
    if (r.qty > left) { err(errors, "RETURN_QTY_EXCEEDED", `Só ${left} para devolver`, `items.${i}.qty`); return; }
    refund += Math.round((l.netCents * r.qty) / l.qty);
  });
  return { ok: !errors.length, errors, refundCents: refund };
}

// ------------------------------------------------------------------ PDV

export const PAYMENT_METHODS = ["CASH", "PIX", "CREDIT", "DEBIT", "VOUCHER", "ON_ACCOUNT"];
/** Leitura do PDV: "7891234567895", "3*7891234567895", "3x CAM-AZ-P", "1,5*2000000000015" → { qty, code } */
export function parseScan(input) {
  const s = String(input ?? "").trim();
  const m = s.match(/^(\d+(?:[.,]\d{1,3})?)\s*[*xX]\s*(\S+)$/);
  if (m) { const qty = Number(m[1].replace(",", ".")); return qty > 0 ? { qty, code: m[2] } : null; }
  return s ? { qty: 1, code: s } : null;
}
/**
 * Pagamentos do PDV. Troco só sai de dinheiro: a soma do que não é dinheiro não pode passar do total.
 * payments: [{ method, amountCents }] → { paidCents, changeCents, remainingCents, complete, errors }
 */
export function settlePayments(totalCents, payments) {
  const errors = [];
  payments.forEach((p, i) => {
    if (!PAYMENT_METHODS.includes(p.method)) err(errors, "METHOD_INVALID", "Forma de pagamento inválida", `payments.${i}.method`);
    if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) err(errors, "AMOUNT_INVALID", "Valor em centavos", `payments.${i}.amountCents`);
  });
  const nonCash = payments.filter((p) => p.method !== "CASH").reduce((a, p) => a + (p.amountCents || 0), 0);
  const cash = payments.filter((p) => p.method === "CASH").reduce((a, p) => a + (p.amountCents || 0), 0);
  if (nonCash > totalCents) err(errors, "OVERPAY_NON_CASH", "Cartão, Pix e outros não podem passar do total (troco só em dinheiro)", "payments");
  const paid = nonCash + cash;
  const changeCents = errors.length ? 0 : Math.max(0, paid - totalCents);
  return { paidCents: paid, changeCents, remainingCents: Math.max(0, totalCents - paid), complete: !errors.length && paid >= totalCents, errors };
}
/**
 * Caixa: abertura + vendas em dinheiro (já sem o troco) + suprimentos − sangrias − devoluções em dinheiro = esperado na gaveta.
 * movements: [{ type: "SALE_CASH" | "SUPPLY" | "WITHDRAWAL" | "REFUND_CASH", amountCents }]
 */
export function cashExpected(openingCents, movements) {
  const sign = { SALE_CASH: 1, SUPPLY: 1, WITHDRAWAL: -1, REFUND_CASH: -1 };
  return movements.reduce((s, m) => s + (sign[m.type] ?? 0) * m.amountCents, openingCents);
}
/** Fechamento: diferença contada − esperada → OK, SHORT (faltou) ou OVER (sobrou). */
export function closeCash(expectedCents, countedCents) {
  const diffCents = countedCents - expectedCents;
  return { diffCents, status: diffCents === 0 ? "OK" : diffCents < 0 ? "SHORT" : "OVER" };
}

// ------------------------------------------------------------------ compras

/** Situação do pedido de compra pelo recebido: OPEN | PARTIAL | RECEIVED. lines: [{ qty, receivedQty }] */
export function purchaseStatus(lines) {
  const got = lines.map((l) => l.receivedQty ?? 0);
  if (got.every((g) => g === 0)) return "OPEN";
  return lines.every((l) => (l.receivedQty ?? 0) >= l.qty) ? "RECEIVED" : "PARTIAL";
}
/** Recebimento: [{ lineId, qty }] sem passar do pedido (tolerância em %, padrão 0). → { ok, errors } */
export function validateReceipt(lines, receipt, { tolerancePct = 0 } = {}) {
  const errors = [];
  receipt.forEach((r, i) => {
    const l = lines.find((x) => x.id === r.lineId);
    if (!l) { err(errors, "LINE_NOT_FOUND", "Item não pertence ao pedido", `items.${i}.lineId`); return; }
    if (!isQty(r.qty)) { err(errors, "QTY_INVALID", "Quantidade inválida", `items.${i}.qty`); return; }
    const max = roundQty(l.qty * (1 + tolerancePct / 100) - (l.receivedQty ?? 0));
    if (r.qty > max) err(errors, "OVER_RECEIPT", `Recebendo mais que o pedido (faltam ${roundQty(l.qty - (l.receivedQty ?? 0))})`, `items.${i}.qty`);
  });
  return { ok: !errors.length, errors };
}
/** Custo de entrada com frete/despesas rateados pelo valor de cada linha: [{ qty, unitCostCents }] + extra → custo unitário. */
export function landedUnitCosts(lines, extraCents) {
  const parts = allocate(extraCents, lines.map((l) => Math.round(l.qty * l.unitCostCents)));
  return lines.map((l, i) => Math.round((Math.round(l.qty * l.unitCostCents) + parts[i]) / l.qty));
}

// ------------------------------------------------------------------ relatórios

/** Curva ABC por valor: A até 80% acumulado (o item que cruza 80% ainda é A), B até 95%, C o resto. rows: [{ id, valueCents }] */
export function abcCurve(rows) {
  const sorted = [...rows].filter((r) => r.valueCents > 0).sort((a, b) => b.valueCents - a.valueCents || String(a.id).localeCompare(String(b.id)));
  const total = sorted.reduce((a, r) => a + r.valueCents, 0);
  let acc = 0;
  return sorted.map((r) => { const before = acc; acc += r.valueCents; const cls = before < total * 0.8 ? "A" : before < total * 0.95 ? "B" : "C"; return { ...r, sharePct: Math.round((r.valueCents / total) * 1000) / 10, cumulativePct: Math.round((acc / total) * 1000) / 10, class: cls }; });
}
/** Dias de estoque com o ritmo de venda do período: saldo / (vendido / dias). Sem venda → null (parado). */
export function daysOfStock({ onHand, soldQty, days }) {
  if (!soldQty || soldQty <= 0) return null;
  return Math.floor(onHand / (soldQty / days));
}
