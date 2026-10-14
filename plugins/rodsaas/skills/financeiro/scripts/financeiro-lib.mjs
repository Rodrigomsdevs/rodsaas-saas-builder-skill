// rodsaas · financeiro (app Financeiro) — regras puras de finanças da empresa (sem banco, sem rede).
// Dinheiro SEMPRE em centavos (inteiros); datas de calendário em "YYYY-MM-DD" (dia, sem fuso).
// Parcelamento com centavo certo, recorrência com dia âncora (31 vira o último dia do mês), situação do lançamento,
// multa e juros de atraso, baixa (parcial, com juros/multa/desconto), saldo de conta, fluxo de caixa realizado e
// previsto, DRE gerencial por competência ou caixa, inadimplência por faixa, leitura de extrato OFX (1.x SGML e 2.x
// XML) e CSV, sugestões de conciliação, regras automáticas de categoria, CPF/CNPJ, régua de cobrança e os limites dos
// meios de pagamento da Stripe no Brasil (boleto, Pix, cartão).
// Porte para TypeScript em api/src/modules/financeiro/lib/ (e o que o front usar), com os testes.
// Limites da Stripe citados abaixo: confira na doc atual antes de portar (docs.stripe.com/payments/boleto e /pix).
// Rode: node --test financeiro-lib.test.mjs

// ------------------------------------------------------------------ datas

const pad = (n) => String(n).padStart(2, "0");
const parse = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (ms) => { const t = new Date(ms); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
export const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;
export const addDays = (ymd, n) => fmt(parse(ymd) + n * 86_400_000);
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86_400_000); // b − a
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 1..12
/** Soma meses mantendo o dia âncora (31 → último dia do mês; 30/02 → 28 ou 29). */
export function addMonths(ymd, n, anchorDay) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const yy = t.getUTCFullYear(), mm = t.getUTCMonth() + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(anchorDay ?? d, lastDay(yy, mm)))}`;
}
const monthKey = (ymd) => ymd.slice(0, 7);

// ------------------------------------------------------------------ parcelas e recorrência

const STEP = { week: (d, k) => addDays(d, 7 * k), biweekly: (d, k) => addDays(d, 14 * k), month: (d, k, a) => addMonths(d, k, a), quarter: (d, k, a) => addMonths(d, 3 * k, a), semester: (d, k, a) => addMonths(d, 6 * k, a), year: (d, k, a) => addMonths(d, 12 * k, a) };
export const INTERVALS = Object.keys(STEP);

/**
 * Divide um valor em parcelas com o centavo certo (a diferença vai para a 1ª parcela: 100,00 em 3 = 33,34 + 33,33 + 33,33).
 * → [{ number, total, amountCents, dueDate }]
 */
export function splitInstallments(totalCents, n, firstDue, { interval = "month" } = {}) {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error("totalCents inválido");
  if (!Number.isInteger(n) || n < 1 || n > 360) throw new Error("número de parcelas inválido");
  if (!STEP[interval]) throw new Error("intervalo inválido");
  const base = Math.floor(totalCents / n), rest = totalCents - base * n;
  const anchor = Number(firstDue.slice(8, 10));
  return Array.from({ length: n }, (_, i) => ({ number: i + 1, total: n, amountCents: base + (i === 0 ? rest : 0), dueDate: STEP[interval](firstDue, i, anchor) }));
}

/**
 * Datas de uma recorrência dentro de [from, to]. rule: { start, interval, every=1, count?, until? }.
 * O dia âncora é o do `start` (todo dia 31 → último dia nos meses curtos).
 */
export function recurrenceDates(rule, { from, to }) {
  const { start, interval = "month", every = 1, count, until } = rule;
  if (!STEP[interval]) throw new Error("intervalo inválido");
  const anchor = Number(start.slice(8, 10)), out = [];
  for (let k = 0; k < 5000; k++) {
    if (count != null && k >= count) break;
    const d = STEP[interval](start, k * every, anchor);
    if ((until && d > until) || d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

// ------------------------------------------------------------------ situação, multa/juros e baixa

/**
 * Situação de um lançamento. entry: { amountCents, paidCents, dueDate, canceled?, awaitingApproval? }.
 * status: "CANCELED" | "AWAITING_APPROVAL" | "PAID" | "PARTIAL" | "OVERDUE" | "OPEN"; overdue também vale para PARTIAL.
 */
export function entryStatus(e, today) {
  const remainingCents = Math.max(0, e.amountCents - (e.paidCents ?? 0));
  const overdue = remainingCents > 0 && !e.canceled && e.dueDate < today;
  const daysLate = overdue ? diffDays(e.dueDate, today) : 0;
  let status;
  if (e.canceled) status = "CANCELED";
  else if (remainingCents === 0) status = "PAID";
  else if (e.awaitingApproval) status = "AWAITING_APPROVAL";
  else if ((e.paidCents ?? 0) > 0) status = "PARTIAL";
  else if (overdue) status = "OVERDUE";
  else status = "OPEN";
  return { status, overdue, daysLate, remainingCents };
}

/**
 * Multa e juros de atraso sobre o valor em aberto: multa fixa (padrão 2%, o teto do CDC para consumidor, art. 52 §1º)
 * e juros simples pro rata die (padrão 1% ao mês, contado por 30 dias). Arredondado ao centavo.
 */
export function lateCharges({ amountCents, dueDate, payDate, finePct = 2, monthlyInterestPct = 1 }) {
  const daysLate = Math.max(0, diffDays(dueDate, payDate));
  if (!daysLate) return { daysLate: 0, fineCents: 0, interestCents: 0, totalCents: amountCents };
  const fineCents = Math.round((amountCents * finePct) / 100);
  const interestCents = Math.round((amountCents * monthlyInterestPct * daysLate) / 100 / 30);
  return { daysLate, fineCents, interestCents, totalCents: amountCents + fineCents + interestCents };
}

/**
 * Valida e aplica uma baixa. p: { amountCents (principal quitado em dinheiro), interestCents, fineCents, discountCents, date }.
 * O desconto quita principal sem entrar dinheiro; juros e multa entram no caixa mas não abatem a dívida.
 * → { ok, errors, principalCents, cashCents, newPaidCents, status }
 */
export function applyPayment(entry, p, { today }) {
  const errors = [];
  const amount = p.amountCents ?? 0, interest = p.interestCents ?? 0, fine = p.fineCents ?? 0, discount = p.discountCents ?? 0;
  if (entry.canceled) errors.push({ code: "ENTRY_CANCELED", message: "Lançamento cancelado" });
  if (entry.awaitingApproval) errors.push({ code: "AWAITING_APPROVAL", message: "Este pagamento ainda precisa ser aprovado" });
  for (const [k, v] of [["amountCents", amount], ["interestCents", interest], ["fineCents", fine], ["discountCents", discount]]) if (!Number.isInteger(v) || v < 0) errors.push({ code: "INVALID_AMOUNT", message: "Valor inválido", path: k });
  if (amount + discount <= 0) errors.push({ code: "INVALID_AMOUNT", message: "Informe o valor da baixa", path: "amountCents" });
  if (!isDate(p.date)) errors.push({ code: "DATE_REQUIRED", message: "Informe a data", path: "date" });
  else if (p.date > today) errors.push({ code: "FUTURE_DATE", message: "A data da baixa não pode ser no futuro", path: "date" });
  const remaining = Math.max(0, entry.amountCents - (entry.paidCents ?? 0));
  if (amount + discount > remaining) errors.push({ code: "OVERPAYMENT", message: `O valor em aberto é ${formatBRL(remaining)}` });
  const principalCents = amount + discount;
  const newPaidCents = (entry.paidCents ?? 0) + (errors.length ? 0 : principalCents);
  return { ok: errors.length === 0, errors, principalCents, cashCents: amount + interest + fine, newPaidCents, status: entryStatus({ ...entry, paidCents: newPaidCents }, today).status };
}

// ------------------------------------------------------------------ saldos, fluxo de caixa

/** Saldo de uma conta até `until` (inclusive). movements: [{ date, amountCents }] com sinal (+ entrada, − saída). */
export function accountBalance(openingBalanceCents, movements, until) {
  return movements.reduce((s, m) => (m.date <= until ? s + m.amountCents : s), openingBalanceCents);
}

/**
 * Fluxo de caixa de [from, to] por dia ou mês.
 * opening: saldo inicial das contas (soma) + movimentos antes de `from`; movements: realizados [{ date, amountCents ±, transfer? }]
 * (transferências entre contas próprias não entram em entradas/saídas, mas mudam o saldo de cada conta — aqui, somadas, se anulam);
 * open: previstos em aberto [{ dueDate, remainingCents ± }]: datas antes de `today` (vencidos) entram no dia/mês de hoje.
 * → { openingCents, periods: [{ key, inCents, outCents, forecastInCents, forecastOutCents, netCents, balanceCents }], closingCents }
 */
export function cashFlow({ openingBalanceCents = 0, movements = [], open = [], from, to, today, groupBy = "month" }) {
  const key = (d) => (groupBy === "day" ? d : monthKey(d));
  const keys = [];
  if (groupBy === "day") for (let d = from; d <= to; d = addDays(d, 1)) keys.push(d);
  else for (let d = `${monthKey(from)}-01`; monthKey(d) <= monthKey(to); d = addMonths(d, 1, 1)) keys.push(monthKey(d));
  const P = Object.fromEntries(keys.map((k) => [k, { key: k, inCents: 0, outCents: 0, forecastInCents: 0, forecastOutCents: 0 }]));
  let openingCents = openingBalanceCents;
  for (const m of movements) {
    if (m.transfer) continue;
    if (m.date < from) { openingCents += m.amountCents; continue; }
    if (m.date > to) continue;
    const p = P[key(m.date)]; if (m.amountCents >= 0) p.inCents += m.amountCents; else p.outCents += -m.amountCents;
  }
  for (const o of open) {
    const d = o.dueDate < today ? today : o.dueDate;
    if (d < from || d > to || !o.remainingCents) continue;
    const p = P[key(d)]; if (o.remainingCents >= 0) p.forecastInCents += o.remainingCents; else p.forecastOutCents += -o.remainingCents;
  }
  let bal = openingCents;
  const periods = keys.map((k) => { const p = P[k]; const netCents = p.inCents - p.outCents + p.forecastInCents - p.forecastOutCents; bal += netCents; return { ...p, netCents, balanceCents: bal }; });
  return { openingCents, periods, closingCents: bal };
}

// ------------------------------------------------------------------ plano de contas e DRE

/** Grupos da DRE gerencial, na ordem, com o sinal (+1 receita, −1 despesa). NAO_OPERACIONAL fica fora da DRE (aportes, empréstimos, transferências). */
export const DRE_GROUPS = [
  { id: "RECEITA_BRUTA", label: "Receita bruta", sign: 1, type: "INCOME" },
  { id: "DEDUCOES", label: "Deduções e impostos sobre vendas", sign: -1, type: "EXPENSE" },
  { id: "CUSTOS", label: "Custos (CMV/CSP)", sign: -1, type: "EXPENSE" },
  { id: "DESPESAS_OPERACIONAIS", label: "Despesas operacionais", sign: -1, type: "EXPENSE" },
  { id: "RECEITAS_FINANCEIRAS", label: "Receitas financeiras", sign: 1, type: "INCOME" },
  { id: "DESPESAS_FINANCEIRAS", label: "Despesas financeiras", sign: -1, type: "EXPENSE" },
  { id: "OUTRAS_RECEITAS", label: "Outras receitas", sign: 1, type: "INCOME" },
  { id: "OUTRAS_DESPESAS", label: "Outras despesas", sign: -1, type: "EXPENSE" },
  { id: "IMPOSTOS_LUCRO", label: "IRPJ e CSLL", sign: -1, type: "EXPENSE" },
  { id: "NAO_OPERACIONAL", label: "Fora da DRE (aportes, empréstimos, investimentos)", sign: 0, type: null },
];
export const dreGroup = (id) => DRE_GROUPS.find((g) => g.id === id) ?? null;

/** Plano de contas padrão (key estável para o conteúdo inicial; parent = key do pai). */
export function defaultCategories() {
  const c = (key, name, type, dreGroup, parent = null) => ({ key, name, type, dreGroup, parent });
  return [
    c("receitas", "Receitas", "INCOME", "RECEITA_BRUTA"),
    c("vendas", "Vendas de produtos", "INCOME", "RECEITA_BRUTA", "receitas"),
    c("servicos", "Prestação de serviços", "INCOME", "RECEITA_BRUTA", "receitas"),
    c("rec_fin", "Rendimentos e juros recebidos", "INCOME", "RECEITAS_FINANCEIRAS"),
    c("outras_rec", "Outras receitas", "INCOME", "OUTRAS_RECEITAS"),
    c("impostos_vendas", "Impostos sobre vendas (Simples, ISS, ICMS)", "EXPENSE", "DEDUCOES"),
    c("devolucoes", "Devoluções e cancelamentos", "EXPENSE", "DEDUCOES"),
    c("custos", "Custos", "EXPENSE", "CUSTOS"),
    c("mercadorias", "Compra de mercadorias", "EXPENSE", "CUSTOS", "custos"),
    c("terceiros", "Serviços de terceiros", "EXPENSE", "CUSTOS", "custos"),
    c("pessoal", "Pessoal", "EXPENSE", "DESPESAS_OPERACIONAIS"),
    c("salarios", "Salários e encargos", "EXPENSE", "DESPESAS_OPERACIONAIS", "pessoal"),
    c("beneficios", "Benefícios", "EXPENSE", "DESPESAS_OPERACIONAIS", "pessoal"),
    c("administrativas", "Administrativas", "EXPENSE", "DESPESAS_OPERACIONAIS"),
    c("aluguel", "Aluguel e condomínio", "EXPENSE", "DESPESAS_OPERACIONAIS", "administrativas"),
    c("contas_consumo", "Água, luz, internet e telefone", "EXPENSE", "DESPESAS_OPERACIONAIS", "administrativas"),
    c("softwares", "Softwares e assinaturas", "EXPENSE", "DESPESAS_OPERACIONAIS", "administrativas"),
    c("contabilidade", "Contabilidade e jurídico", "EXPENSE", "DESPESAS_OPERACIONAIS", "administrativas"),
    c("marketing", "Marketing e publicidade", "EXPENSE", "DESPESAS_OPERACIONAIS"),
    c("tarifas", "Tarifas bancárias e de cobrança", "EXPENSE", "DESPESAS_FINANCEIRAS"),
    c("juros_pagos", "Juros e multas pagos", "EXPENSE", "DESPESAS_FINANCEIRAS"),
    c("outras_desp", "Outras despesas", "EXPENSE", "OUTRAS_DESPESAS"),
    c("irpj_csll", "IRPJ e CSLL", "EXPENSE", "IMPOSTOS_LUCRO"),
    c("aportes", "Aportes e empréstimos recebidos", "INCOME", "NAO_OPERACIONAL"),
    c("retiradas", "Retiradas de sócios e pagamento de empréstimos", "EXPENSE", "NAO_OPERACIONAL"),
  ];
}

/**
 * DRE gerencial. entries: [{ categoryId, amountCents, competenceDate, paidDate?, canceled? }] (sempre positivos);
 * categories: [{ id, dreGroup }]; basis: "competence" (padrão, pela competência) ou "cash" (pelos pagamentos:
 * payments: [{ categoryId, cashCents, date }]).
 */
export function dre({ entries = [], payments = [], categories, from, to, basis = "competence" }) {
  const groupOf = new Map(categories.map((c) => [c.id, c.dreGroup]));
  const totals = Object.fromEntries(DRE_GROUPS.map((g) => [g.id, 0]));
  const add = (catId, cents) => { const g = groupOf.get(catId); if (g && g in totals) totals[g] += cents; };
  if (basis === "cash") for (const p of payments) { if (p.date >= from && p.date <= to) add(p.categoryId, p.cashCents); }
  else for (const e of entries) { if (!e.canceled && e.competenceDate >= from && e.competenceDate <= to) add(e.categoryId, e.amountCents); }
  const receitaLiquida = totals.RECEITA_BRUTA - totals.DEDUCOES;
  const lucroBruto = receitaLiquida - totals.CUSTOS;
  const resultadoOperacional = lucroBruto - totals.DESPESAS_OPERACIONAIS;
  const resultadoFinanceiro = totals.RECEITAS_FINANCEIRAS - totals.DESPESAS_FINANCEIRAS;
  const resultadoAntesIR = resultadoOperacional + resultadoFinanceiro + totals.OUTRAS_RECEITAS - totals.OUTRAS_DESPESAS;
  const lucroLiquido = resultadoAntesIR - totals.IMPOSTOS_LUCRO;
  const pct = (v) => (receitaLiquida ? Math.round((v / receitaLiquida) * 1000) / 10 : null);
  return { groups: totals, receitaLiquida, lucroBruto, resultadoOperacional, resultadoFinanceiro, resultadoAntesIR, lucroLiquido, margemBruta: pct(lucroBruto), margemOperacional: pct(resultadoOperacional), margemLiquida: pct(lucroLiquido) };
}

// ------------------------------------------------------------------ inadimplência

/** Valores em aberto por faixa de atraso. items: [{ dueDate, remainingCents }] → { a_vencer, d1_30, d31_60, d61_90, d90_mais } (centavos e quantidade). */
export function aging(items, today) {
  const b = { a_vencer: [0, 0], d1_30: [0, 0], d31_60: [0, 0], d61_90: [0, 0], d90_mais: [0, 0] };
  for (const i of items) {
    if (!i.remainingCents) continue;
    const late = diffDays(i.dueDate, today);
    const k = late <= 0 ? "a_vencer" : late <= 30 ? "d1_30" : late <= 60 ? "d31_60" : late <= 90 ? "d61_90" : "d90_mais";
    b[k][0] += i.remainingCents; b[k][1] += 1;
  }
  return Object.fromEntries(Object.entries(b).map(([k, [cents, count]]) => [k, { cents, count }]));
}

// ------------------------------------------------------------------ extratos (OFX e CSV)

const toCents = (raw) => {
  let s = String(raw ?? "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
export { toCents };
const ofxDate = (s) => { const m = String(s ?? "").match(/^(\d{4})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i")); return m ? m[1].trim() : null; };

/**
 * Lê um extrato OFX (1.x SGML, sem tags de fechamento, ou 2.x XML). Valores com ponto ou vírgula decimal.
 * → { bankId, accountId, currency, transactions: [{ fitId, date, amountCents, type, memo, name, checkNum }], balance: { amountCents, date } | null }
 */
export function parseOfx(text) {
  const t = String(text ?? "");
  if (!/<OFX>/i.test(t)) throw new Error("Arquivo não é OFX");
  const transactions = [];
  for (const m of t.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)) {
    const b = m[1];
    const amountCents = toCents(tag(b, "TRNAMT"));
    const date = ofxDate(tag(b, "DTPOSTED"));
    if (!date || !Number.isFinite(amountCents)) continue;
    transactions.push({ fitId: tag(b, "FITID") ?? `${date}|${amountCents}|${transactions.length}`, date, amountCents, type: tag(b, "TRNTYPE"), memo: tag(b, "MEMO") ?? "", name: tag(b, "NAME") ?? "", checkNum: tag(b, "CHECKNUM") });
  }
  const bal = t.match(/<LEDGERBAL>([\s\S]*?)(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i);
  return {
    bankId: tag(t, "BANKID"), accountId: tag(t, "ACCTID"), currency: tag(t, "CURDEF"),
    transactions,
    balance: bal ? { amountCents: toCents(tag(bal[1], "BALAMT")), date: ofxDate(tag(bal[1], "DTASOF")) } : null,
  };
}

/** Hash curto e estável (FNV-1a 32 bits, hex) para o id de transações de CSV sem identificador. */
export function stableHash(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/**
 * Lê um extrato CSV simples: separador ";" ou "," (detectado), cabeçalho na 1ª linha, datas dd/mm/aaaa ou aaaa-mm-dd,
 * valor com sinal (ou colunas de crédito/débito). columns: { date, description, amount } ou { date, description, credit, debit } (nomes do cabeçalho, sem acento/maiúscula).
 */
export function parseCsvStatement(text, columns = { date: "data", description: "descricao", amount: "valor" }) {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { transactions: [], errors: [] };
  const sep = (lines[0].match(/;/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? ";" : ",";
  const split = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = split(lines[0]).map(normalizeText);
  const idx = (k) => (columns[k] ? head.indexOf(normalizeText(columns[k])) : -1);
  const iDate = idx("date"), iDesc = idx("description"), iAmt = idx("amount"), iCr = idx("credit"), iDb = idx("debit");
  const transactions = [], errors = [];
  lines.slice(1).forEach((l, n) => {
    const c = split(l);
    const rawDate = c[iDate] ?? "";
    const dm = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const date = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : rawDate;
    const amountCents = iAmt >= 0 ? toCents(c[iAmt]) : (toCents(c[iCr]) || 0) - Math.abs(toCents(c[iDb]) || 0);
    if (!isDate(date) || !Number.isFinite(amountCents) || amountCents === 0) { errors.push({ line: n + 2, message: "Linha sem data ou valor válido" }); return; }
    const memo = c[iDesc] ?? "";
    transactions.push({ fitId: "csv-" + stableHash(`${date}|${amountCents}|${memo}|${n}`), date, amountCents, memo, name: "" });
  });
  return { transactions, errors };
}

/** Separa transações novas das já importadas (pelo FITID, por conta). */
export function dedupeTransactions(existingFitIds, txs) {
  const seen = new Set(existingFitIds), fresh = [], duplicates = [];
  for (const t of txs) { if (seen.has(t.fitId)) duplicates.push(t); else { seen.add(t.fitId); fresh.push(t); } }
  return { fresh, duplicates };
}

// ------------------------------------------------------------------ conciliação e regras

export const normalizeText = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const tokens = (s) => new Set(normalizeText(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3));

/**
 * Sugestões de lançamentos em aberto para uma transação do extrato. Casa pelo valor em aberto exato (com sinal:
 * crédito → a receber, débito → a pagar), pontuando proximidade da data e palavras em comum (descrição, contato).
 * entries: [{ id, type: "INCOME"|"EXPENSE", remainingCents, dueDate, description, contactName }] → [{ entryId, score, daysDiff }]
 */
export function matchCandidates(tx, entries, { windowDays = 10, limit = 5 } = {}) {
  const type = tx.amountCents >= 0 ? "INCOME" : "EXPENSE", abs = Math.abs(tx.amountCents);
  const txWords = tokens(`${tx.memo} ${tx.name}`);
  return entries
    .filter((e) => e.type === type && e.remainingCents === abs && Math.abs(diffDays(e.dueDate, tx.date)) <= windowDays)
    .map((e) => {
      const daysDiff = Math.abs(diffDays(e.dueDate, tx.date));
      const common = [...tokens(`${e.description} ${e.contactName ?? ""}`)].filter((w) => txWords.has(w)).length;
      return { entryId: e.id, daysDiff, score: Math.max(0, 70 - daysDiff * 5) + Math.min(30, common * 15) };
    })
    .sort((a, b) => b.score - a.score || a.daysDiff - b.daysDiff)
    .slice(0, limit);
}

/**
 * Primeira regra que casa (por prioridade, menor primeiro). rule: { priority, match: { contains: ["tarifa", "ted"], sign: "in"|"out", minCents, maxCents }, set: { categoryId, contactId, costCenterId } }
 */
export function applyRules(tx, rules) {
  const text = normalizeText(`${tx.memo} ${tx.name}`), abs = Math.abs(tx.amountCents);
  for (const r of [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))) {
    const m = r.match ?? {};
    if (m.sign === "in" && tx.amountCents < 0) continue;
    if (m.sign === "out" && tx.amountCents > 0) continue;
    if (m.minCents != null && abs < m.minCents) continue;
    if (m.maxCents != null && abs > m.maxCents) continue;
    const terms = (m.contains ?? []).map(normalizeText).filter(Boolean);
    if (terms.length && !terms.some((w) => text.includes(w))) continue;
    if (!terms.length && m.minCents == null && m.maxCents == null && !m.sign) continue; // regra vazia não casa tudo
    return { ruleId: r.id ?? null, ...r.set };
  }
  return null;
}

// ------------------------------------------------------------------ CPF / CNPJ

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
/** "CPF" | "CNPJ" | null (inválido ou vazio). */
export const documentType = (v) => (isValidCpf(v) ? "CPF" : isValidCnpj(v) ? "CNPJ" : null);
export function formatDocument(v) {
  const d = onlyDigits(v);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return v;
}

// ------------------------------------------------------------------ cobranças (Stripe) e régua

/** Limites da Stripe no Brasil (confira na doc atual): boleto R$ 5,00–49.999,99, vencimento em até 60 dias, sem estorno; Pix a partir de R$ 0,50, só avulso. */
export const STRIPE_BR = { boletoMinCents: 500, boletoMaxCents: 4_999_999, boletoMaxDays: 60, pixMinCents: 50, pixMaxCents: 1_500_000 };
export const CHARGE_METHODS = ["card", "boleto", "pix"];

/**
 * Valida os meios de uma cobrança. { methods, amountCents, dueDate, today, recurring, customer: { name, document, email } }
 * → { ok, errors, warnings, methods (os válidos, na ordem), boletoExpiresAfterDays }
 */
export function validateCharge({ methods, amountCents, dueDate, today, recurring = false, customer = {} }) {
  const errors = [], warnings = [];
  const list = [...new Set(methods ?? [])];
  if (!list.length) errors.push({ code: "METHOD_REQUIRED", message: "Escolha pelo menos um meio de pagamento" });
  for (const m of list) if (!CHARGE_METHODS.includes(m)) errors.push({ code: "INVALID_METHOD", message: `Meio de pagamento inválido: ${m}` });
  if (!Number.isInteger(amountCents) || amountCents <= 0) errors.push({ code: "INVALID_AMOUNT", message: "Valor inválido" });
  if (!isDate(dueDate)) errors.push({ code: "DATE_REQUIRED", message: "Informe o vencimento" });
  else if (dueDate < today) errors.push({ code: "DUE_IN_PAST", message: "O vencimento já passou: atualize a data (com multa e juros, se for o caso)" });
  if (!customer.email && !customer.phone) warnings.push({ code: "NO_CONTACT", message: "Sem e-mail nem telefone: você precisará mandar o link à mão" });
  let boletoExpiresAfterDays = null;
  if (list.includes("boleto")) {
    if (amountCents < STRIPE_BR.boletoMinCents) errors.push({ code: "BOLETO_MIN", message: "Boleto a partir de R$ 5,00" });
    if (amountCents > STRIPE_BR.boletoMaxCents) errors.push({ code: "BOLETO_MAX", message: "Boleto até R$ 49.999,99" });
    if (!documentType(customer.document)) errors.push({ code: "BOLETO_NEEDS_DOCUMENT", message: "Boleto exige CPF ou CNPJ válido do cliente" });
    if (!String(customer.name ?? "").trim()) errors.push({ code: "BOLETO_NEEDS_NAME", message: "Boleto exige o nome do cliente" });
    if (isDate(dueDate) && dueDate >= today) {
      boletoExpiresAfterDays = diffDays(today, dueDate);
      if (boletoExpiresAfterDays > STRIPE_BR.boletoMaxDays) errors.push({ code: "BOLETO_DUE_TOO_FAR", message: "O boleto vence em até 60 dias: ele será gerado mais perto do vencimento" });
    }
  }
  if (list.includes("pix")) {
    if (recurring) errors.push({ code: "PIX_NOT_RECURRING", message: "Pix recorrente não está disponível no Brasil pela Stripe" });
    if (amountCents < STRIPE_BR.pixMinCents) errors.push({ code: "PIX_MIN", message: "Pix a partir de R$ 0,50" });
    if (amountCents > STRIPE_BR.pixMaxCents) warnings.push({ code: "PIX_MAX", message: "Valor alto para Pix pela Stripe (limite por transação): prefira boleto" });
  }
  return { ok: errors.length === 0, errors, warnings, methods: list.filter((m) => CHARGE_METHODS.includes(m)), boletoExpiresAfterDays };
}

/**
 * Régua de cobrança: qual lembrete mandar hoje. offsets em dias relativos ao vencimento (−3 = 3 dias antes; 0 = no dia; 3 = 3 dias depois).
 * Só o mais recente ainda não enviado (nunca uma fila de atrasados de uma vez). → offset | null
 */
export function reminderDue({ dueDate, offsets = [-3, 0, 3, 7], sent = [], today, paid = false, canceled = false }) {
  if (paid || canceled) return null;
  const due = [...offsets].sort((a, b) => a - b).filter((o) => addDays(dueDate, o) <= today);
  if (!due.length) return null;
  const latest = due[due.length - 1];
  return sent.includes(latest) ? null : latest;
}

// ------------------------------------------------------------------ formatos

export const formatBRL = (cents) => (cents < 0 ? "-" : "") + "R$ " + (Math.abs(cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** CSV (separador ";", BOM para o Excel) com cabeçalho; aspas quando preciso; texto começando com = + - @ ganha ' (injeção de fórmula). */
export function toCsv(rows, columns) {
  const esc = (v) => { let s = v == null ? "" : String(v); if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [columns.map((c) => esc(c.label)).join(";"), ...rows.map((r) => columns.map((c) => esc(typeof c.value === "function" ? c.value(r) : r[c.key])).join(";"))].join("\r\n") + "\r\n";
}
/** Centavos → "1234,56" (formato da contabilidade, sem R$). */
export const centsToDecimal = (c) => (c < 0 ? "-" : "") + Math.floor(Math.abs(c) / 100) + "," + pad(Math.abs(c) % 100);
