// rodsaas · comercial (app Comercial) — regras puras de propostas, contratos e assinatura eletrônica (sem banco, sem rede).
// Dinheiro SEMPRE em centavos (inteiros); datas de calendário em "YYYY-MM-DD"; instantes em ISO 8601.
// Totais da proposta (itens com quantidade fracionada, desconto por item e geral, itens opcionais, recorrentes),
// desconto efetivo e aprovação, plano de pagamento (à vista, parcelado, entrada + parcelas), modelos com variáveis
// {{cliente.nome}} e filtros (moeda, data, extenso, documento, maiusculas), valor por extenso em reais, situação da
// proposta e quem pode aceitar, vigência/aviso/renovação/reajuste de contrato, ordem de assinatura (sequencial e
// paralela), situação do envelope, código por e-mail (validade e tentativas), código de verificação do documento,
// manifesto de assinaturas e resumo de visualizações.
// Porte para TypeScript em api/src/modules/comercial/lib/ (e o que o front usar), com os testes.
// Rode: node --test comercial-lib.test.mjs

// ------------------------------------------------------------------ datas e formatos

const pad = (n) => String(n).padStart(2, "0");
const parse = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (ms) => { const t = new Date(ms); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
export const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;
export const addDays = (ymd, n) => fmt(parse(ymd) + n * 86_400_000);
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86_400_000);
export function addMonths(ymd, n, anchorDay) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const yy = t.getUTCFullYear(), mm = t.getUTCMonth() + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${pad(mm)}-${pad(Math.min(anchorDay ?? d, last))}`;
}
export const formatBRL = (cents) => (cents < 0 ? "-" : "") + "R$ " + (Math.abs(cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatDate = (ymd) => (isDate(ymd) ? ymd.split("-").reverse().join("/") : String(ymd ?? ""));
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
export function formatDocument(v) {
  const d = onlyDigits(v);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return String(v ?? "");
}

// ------------------------------------------------------------------ valor por extenso (reais)

const UNITS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
function under1000(n) {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const h = Math.floor(n / 100), r = n % 100, parts = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) parts.push(r < 20 ? UNITS[r] : TENS[Math.floor(r / 10)] + (r % 10 ? " e " + UNITS[r % 10] : ""));
  return parts.join(" e ");
}
/** Número inteiro (até 999 bilhões) por extenso: 1250 → "mil duzentos e cinquenta"; 1200 → "mil e duzentos". */
export function integerToWords(n) {
  if (!Number.isInteger(n) || n < 0 || n >= 1e12) throw new Error("fora do intervalo");
  if (n === 0) return "zero";
  const scales = [[1e9, "bilhão", "bilhões"], [1e6, "milhão", "milhões"], [1e3, "mil", "mil"], [1, "", ""]];
  const groups = [];
  let rest = n;
  for (const [size, one, many] of scales) {
    const g = Math.floor(rest / size); rest %= size;
    if (!g) continue;
    const words = size === 1 ? under1000(g) : size === 1e3 ? (g === 1 ? "mil" : `${under1000(g)} mil`) : `${under1000(g)} ${g === 1 ? one : many}`;
    groups.push({ g, words });
  }
  return groups.map((x, i) => {
    if (i === 0) return x.words;
    const isLast = i === groups.length - 1;
    return (isLast && (x.g < 100 || x.g % 100 === 0) ? " e " : " ") + x.words;
  }).join("");
}
/** Centavos por extenso em reais: 150030 → "mil e quinhentos reais e trinta centavos"; 100000000 → "um milhão de reais". */
export function centsToWords(cents) {
  if (!Number.isInteger(cents) || cents < 0) throw new Error("centavos inválidos");
  const reais = Math.floor(cents / 100), cent = cents % 100;
  const parts = [];
  if (reais) parts.push(`${integerToWords(reais)}${reais >= 1e6 && reais % 1e6 === 0 ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  if (cent) parts.push(`${integerToWords(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return parts.length ? parts.join(" e ") : "zero reais";
}

// ------------------------------------------------------------------ itens e totais da proposta

export const RECURRENCES = [null, "month", "year"];
/**
 * Valida os itens. item: { id, description, qty (até 3 casas), unitCents, discountPct?, discountCents?, recurring?: null|"month"|"year", optional?, selected? }
 */
export function validateItems(items) {
  const errors = [];
  if (!Array.isArray(items) || !items.length) return [{ code: "EMPTY_PROPOSAL", message: "Inclua pelo menos um item" }];
  items.forEach((it, i) => {
    const at = (code, message, field) => errors.push({ code, message, path: `items.${i}.${field}` });
    if (!String(it.description ?? "").trim()) at("DESCRIPTION_REQUIRED", "Descreva o item", "description");
    if (!(typeof it.qty === "number" && it.qty > 0 && Math.round(it.qty * 1000) === it.qty * 1000)) at("QTY_INVALID", "Quantidade maior que zero, até 3 casas", "qty");
    if (!Number.isInteger(it.unitCents) || it.unitCents < 0) at("PRICE_INVALID", "Preço em centavos", "unitCents");
    if (it.discountPct != null && !(it.discountPct >= 0 && it.discountPct <= 100)) at("DISCOUNT_INVALID", "Desconto entre 0% e 100%", "discountPct");
    if (it.discountCents != null && !(Number.isInteger(it.discountCents) && it.discountCents >= 0)) at("DISCOUNT_INVALID", "Desconto em centavos", "discountCents");
    if (it.discountPct != null && it.discountCents != null) at("DISCOUNT_INVALID", "Use desconto em % ou em R$, não os dois", "discountCents");
    if (!RECURRENCES.includes(it.recurring ?? null)) at("RECURRING_INVALID", "Recorrência inválida", "recurring");
  });
  if (!errors.length && !items.some((it) => !it.optional || it.selected)) errors.push({ code: "EMPTY_PROPOSAL", message: "Nenhum item incluído" });
  return errors;
}

/**
 * Totais. Desconto do item: % sobre o bruto (quantidade × preço) ou valor fixo (nunca maior que o bruto).
 * Desconto geral (% ou centavos) vale só sobre o avulso (os recorrentes têm só o desconto do item).
 * Itens opcionais entram só se `selected`. → { lines, oneTime: { grossCents, itemDiscountCents, globalDiscountCents, totalCents }, monthlyCents, yearlyCents, effectiveDiscountPct }
 */
export function proposalTotals(items, { globalDiscountPct = 0, globalDiscountCents = 0 } = {}) {
  const lines = items.map((it) => {
    const grossCents = Math.round(it.qty * it.unitCents);
    const discountCents = Math.min(grossCents, it.discountPct != null ? Math.round((grossCents * it.discountPct) / 100) : it.discountCents ?? 0);
    return { id: it.id, recurring: it.recurring ?? null, included: !it.optional || !!it.selected, grossCents, discountCents, netCents: grossCents - discountCents };
  });
  const inc = lines.filter((l) => l.included);
  const once = inc.filter((l) => !l.recurring);
  const grossCents = once.reduce((a, l) => a + l.grossCents, 0);
  const itemDiscountCents = once.reduce((a, l) => a + l.discountCents, 0);
  const afterItems = grossCents - itemDiscountCents;
  const globalDiscount = Math.min(afterItems, globalDiscountPct ? Math.round((afterItems * globalDiscountPct) / 100) : globalDiscountCents);
  const sum = (r) => inc.filter((l) => l.recurring === r).reduce((a, l) => a + l.netCents, 0);
  const allGross = inc.reduce((a, l) => a + l.grossCents, 0);
  const allDiscount = inc.reduce((a, l) => a + l.discountCents, 0) + globalDiscount;
  return {
    lines,
    oneTime: { grossCents, itemDiscountCents, globalDiscountCents: globalDiscount, totalCents: afterItems - globalDiscount },
    monthlyCents: sum("month"), yearlyCents: sum("year"),
    effectiveDiscountPct: allGross ? Math.round((allDiscount / allGross) * 1000) / 10 : 0,
  };
}

/** Precisa de aprovação? (desconto efetivo acima do limite do vendedor, ou valor acima do teto; null = sem regra) */
export function needsApproval({ effectiveDiscountPct, totalCents }, { maxDiscountPct = 15, maxTotalCents = null } = {}) {
  const reasons = [];
  if (maxDiscountPct != null && effectiveDiscountPct > maxDiscountPct) reasons.push({ code: "DISCOUNT_ABOVE_LIMIT", message: `Desconto de ${effectiveDiscountPct}% acima do limite de ${maxDiscountPct}%` });
  if (maxTotalCents != null && totalCents > maxTotalCents) reasons.push({ code: "TOTAL_ABOVE_LIMIT", message: `Valor acima de ${formatBRL(maxTotalCents)}` });
  return { required: reasons.length > 0, reasons };
}

/**
 * Plano de pagamento do avulso. plan: { kind: "avista" | "parcelado" | "entrada", installments?, downPaymentPct?, firstDue, minInstallmentCents? }
 * Parcelas com o centavo certo (a diferença vai na 1ª), mesmo dia do mês. → { ok, errors, schedule: [{ number, label, amountCents, dueDate }] }
 */
export function paymentPlan(totalCents, plan) {
  const errors = [], { kind, installments = 1, downPaymentPct = 0, firstDue, minInstallmentCents = 0 } = plan ?? {};
  if (!["avista", "parcelado", "entrada"].includes(kind)) errors.push({ code: "PLAN_INVALID", message: "Forma de pagamento inválida" });
  if (!isDate(firstDue)) errors.push({ code: "DATE_REQUIRED", message: "Informe o 1º vencimento" });
  if (kind !== "avista" && (!Number.isInteger(installments) || installments < 1 || installments > 60)) errors.push({ code: "INSTALLMENTS_INVALID", message: "De 1 a 60 parcelas" });
  if (kind === "entrada" && !(downPaymentPct > 0 && downPaymentPct < 100)) errors.push({ code: "DOWNPAYMENT_INVALID", message: "Entrada entre 0% e 100%" });
  if (errors.length || totalCents <= 0) return { ok: errors.length === 0 && totalCents > 0, errors, schedule: [] };
  const anchor = Number(firstDue.slice(8, 10));
  const split = (amount, n, start, offset) => { const base = Math.floor(amount / n), rest = amount - base * n; return Array.from({ length: n }, (_, i) => ({ amountCents: base + (i === 0 ? rest : 0), dueDate: addMonths(start, i + offset, anchor) })); };
  let schedule;
  if (kind === "avista") schedule = [{ amountCents: totalCents, dueDate: firstDue, label: "À vista" }];
  else if (kind === "parcelado") schedule = split(totalCents, installments, firstDue, 0).map((p, i) => ({ ...p, label: `Parcela ${i + 1}/${installments}` }));
  else {
    const down = Math.round((totalCents * downPaymentPct) / 100);
    schedule = [{ amountCents: down, dueDate: firstDue, label: "Entrada" }, ...split(totalCents - down, installments, firstDue, 1).map((p, i) => ({ ...p, label: `Parcela ${i + 1}/${installments}` }))];
  }
  schedule = schedule.map((p, i) => ({ number: i + 1, ...p }));
  if (minInstallmentCents && schedule.some((p) => p.amountCents < minInstallmentCents)) errors.push({ code: "MIN_INSTALLMENT", message: `Parcela mínima de ${formatBRL(minInstallmentCents)}` });
  return { ok: errors.length === 0, errors, schedule };
}

// ------------------------------------------------------------------ modelos com variáveis

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:\|\s*([a-z]+)\s*)?\}\}/g;
export const FILTERS = ["moeda", "data", "extenso", "documento", "maiusculas"];
/** Variáveis permitidas por tipo de modelo (07-modelos-e-pdf.md). */
const V_COMMON = ["empresa.nome", "empresa.razaoSocial", "empresa.documento", "empresa.endereco", "empresa.email", "empresa.telefone", "hoje", "vendedor.nome", "vendedor.email", "vendedor.telefone", "cliente.nome", "cliente.empresa", "cliente.documento", "cliente.email", "cliente.telefone"];
const V_PROPOSAL = ["proposta.codigo", "proposta.titulo", "proposta.avulso", "proposta.mensal", "proposta.anual", "proposta.desconto", "proposta.validade", "proposta.pagamento", "proposta.observacoes", "proposta.condicoes"];
const V_CONTRACT = ["contrato.codigo", "contrato.titulo", "contrato.valor", "contrato.recorrencia", "contrato.valorTotal", "contrato.inicio", "contrato.fim", "contrato.meses", "contrato.aviso", "contrato.renovacao", "contrato.indice", "contratante.nome", "contratante.documento", "contratante.email", "contratada.nome", "contratada.documento", "contratada.email"];
export const VARIABLES = {
  PROPOSAL: [...V_COMMON, ...V_PROPOSAL],
  CONTRACT: [...V_COMMON, ...V_PROPOSAL, ...V_CONTRACT],
  AMENDMENT: [...V_COMMON, ...V_PROPOSAL, ...V_CONTRACT, "aditivo.numero", "aditivo.titulo", "aditivo.valor", "aditivo.fim"],
};
/** Blocos (<div data-block="x"></div>) permitidos por tipo. */
export const BLOCKS = { PROPOSAL: ["itens", "totais", "pagamento", "aceite", "quebra"], CONTRACT: ["itens", "totais", "pagamento", "assinaturas", "quebra"], AMENDMENT: ["assinaturas", "quebra"] };
/** Blocos usados que não valem para o tipo → [{ code: "UNKNOWN_BLOCK", path }] */
export function validateBlocks(html, kind) {
  const allowed = new Set(BLOCKS[kind] ?? []), errors = [];
  for (const m of String(html ?? "").matchAll(/data-block\s*=\s*["']([^"']*)["']/g)) if (!allowed.has(m[1])) errors.push({ code: "UNKNOWN_BLOCK", message: `Bloco não permitido: ${m[1]}`, path: m[1] });
  return errors;
}
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** Variáveis usadas num modelo: [{ path, filter }] (sem repetir). */
export function templateVariables(text) {
  const seen = new Set(), out = [];
  for (const m of String(text ?? "").matchAll(VAR_RE)) { const k = `${m[1]}|${m[2] ?? ""}`; if (!seen.has(k)) { seen.add(k); out.push({ path: m[1], filter: m[2] ?? null }); } }
  return out;
}
/** Confere as variáveis contra as permitidas (`allowed`: lista de caminhos) e os filtros conhecidos. */
export function validateTemplate(text, allowed) {
  const errors = [], set = new Set(allowed);
  for (const v of templateVariables(text)) {
    if (!set.has(v.path)) errors.push({ code: "UNKNOWN_VARIABLE", message: `Variável desconhecida: {{${v.path}}}`, path: v.path });
    if (v.filter && !FILTERS.includes(v.filter)) errors.push({ code: "UNKNOWN_FILTER", message: `Filtro desconhecido: ${v.filter}`, path: v.path });
  }
  if (/\{\{(?![^}]*\}\})/.test(String(text ?? ""))) errors.push({ code: "UNCLOSED_VARIABLE", message: "Há uma variável sem fechar }}" });
  return errors;
}
const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
/**
 * Preenche um modelo (HTML). Valores são escapados. Filtros: moeda (centavos → R$), data (YYYY-MM-DD → dd/mm/aaaa),
 * extenso (centavos → por extenso em reais), documento (CPF/CNPJ formatado), maiusculas.
 * Variável sem valor vira "" e entra em `missing` (a tela avisa antes de enviar).
 */
export function renderTemplate(text, data) {
  const missing = [];
  const html = String(text ?? "").replace(VAR_RE, (_, path, filter) => {
    const v = get(data, path);
    if (v == null || v === "") { missing.push(path); return ""; }
    let out;
    switch (filter) {
      case "moeda": out = formatBRL(Number(v)); break;
      case "data": out = formatDate(String(v)); break;
      case "extenso": out = centsToWords(Number(v)); break;
      case "documento": out = formatDocument(v); break;
      case "maiusculas": out = String(v).toLocaleUpperCase("pt-BR"); break;
      default: out = String(v);
    }
    return escHtml(out);
  });
  return { html, missing: [...new Set(missing)] };
}

// ------------------------------------------------------------------ proposta: situação e aceite

/** DRAFT | PENDING_APPROVAL | SENT | VIEWED | ACCEPTED | REJECTED | EXPIRED | CANCELED | SUPERSEDED */
export function proposalStatus(p, today) {
  if (p.acceptedAt) return "ACCEPTED";
  if (p.rejectedAt) return "REJECTED";
  if (p.canceledAt) return "CANCELED";
  if (p.supersededById) return "SUPERSEDED";
  if (p.approvalStatus === "PENDING") return "PENDING_APPROVAL";
  if (!p.sentAt) return "DRAFT";
  if (p.validUntil && p.validUntil < today) return "EXPIRED";
  return p.viewedAt ? "VIEWED" : "SENT";
}
/** O cliente pode aceitar/recusar agora? → { ok, code? } */
export function canDecide(p, today) {
  const s = proposalStatus(p, today);
  if (s === "SENT" || s === "VIEWED") return { ok: true };
  const code = { ACCEPTED: "ALREADY_DECIDED", REJECTED: "ALREADY_DECIDED", EXPIRED: "PROPOSAL_EXPIRED", CANCELED: "PROPOSAL_CANCELED", SUPERSEDED: "PROPOSAL_SUPERSEDED" }[s] ?? "NOT_SENT";
  return { ok: false, code };
}
/** Valida o aceite do cliente: nome, documento (CPF/CNPJ) e concordância. */
export function validateAcceptance({ name, document, agree }) {
  const errors = [];
  if (String(name ?? "").trim().split(/\s+/).length < 2) errors.push({ code: "NAME_REQUIRED", message: "Informe o nome completo", path: "name" });
  if (!documentType(document)) errors.push({ code: "DOCUMENT_INVALID", message: "CPF ou CNPJ inválido", path: "document" });
  if (agree !== true) errors.push({ code: "AGREE_REQUIRED", message: "Marque que leu e concorda", path: "agree" });
  return errors;
}
/** Resumo de visualizações: events [{ sessionId, at, seconds }] → { opens, sessions, totalSeconds, firstViewedAt, lastViewedAt } */
export function viewSummary(events) {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return { opens: events.length, sessions: new Set(events.map((e) => e.sessionId)).size, totalSeconds: events.reduce((a, e) => a + (e.seconds ?? 0), 0), firstViewedAt: sorted[0]?.at ?? null, lastViewedAt: sorted.at(-1)?.at ?? null };
}

// ------------------------------------------------------------------ contratos

/** Vigência: fim = início + meses − 1 dia; aviso = fim − dias de aviso prévio. */
export function contractTerm({ startDate, months, noticeDays = 30 }) {
  if (!isDate(startDate) || !Number.isInteger(months) || months < 1) throw new Error("vigência inválida");
  const endDate = addDays(addMonths(startDate, months, Number(startDate.slice(8, 10))), -1);
  return { startDate, endDate, noticeDate: addDays(endDate, -noticeDays) };
}
/**
 * Situação. c: { status: DRAFT|IN_REVIEW|AWAITING_SIGNATURE|SIGNED|CANCELED|TERMINATED, startDate, endDate, noticeDays, autoRenew }
 * Assinado vira: SCHEDULED (antes do início), ACTIVE, EXPIRING (dentro do aviso; com renovação automática: RENEWING), ENDED (passou do fim sem renovação).
 */
export function contractStatus(c, today) {
  if (c.status !== "SIGNED") return c.status;
  if (today < c.startDate) return "SCHEDULED";
  if (c.endDate && today > c.endDate) return c.autoRenew ? "RENEWING" : "ENDED";
  if (c.endDate && today >= addDays(c.endDate, -(c.noticeDays ?? 30))) return c.autoRenew ? "RENEWING" : "EXPIRING";
  return "ACTIVE";
}
/** Próxima vigência da renovação automática. */
export const renewTerm = (c) => contractTerm({ startDate: addDays(c.endDate, 1), months: c.renewalMonths ?? c.months, noticeDays: c.noticeDays ?? 30 });
/** Reajuste por índice (%): arredonda ao centavo. */
export const readjust = (valueCents, pct) => Math.round(valueCents * (1 + pct / 100));

// ------------------------------------------------------------------ assinatura

/**
 * signers: [{ id, order, role: "SIGNER"|"WITNESS"|"APPROVER", status: "PENDING"|"SIGNED"|"REFUSED" }]
 * Mesma ordem = em paralelo; a próxima ordem só começa quando todos da anterior assinaram. Recusa encerra.
 */
export function currentTurn(signers) {
  if (signers.some((s) => s.status === "REFUSED")) return [];
  const pending = signers.filter((s) => s.status === "PENDING");
  if (!pending.length) return [];
  const min = Math.min(...pending.map((s) => s.order ?? 1));
  return pending.filter((s) => (s.order ?? 1) === min).map((s) => s.id);
}
export function canSign(signerId, signers) {
  const s = signers.find((x) => x.id === signerId);
  if (!s) return { ok: false, code: "NOT_A_SIGNER" };
  if (signers.some((x) => x.status === "REFUSED")) return { ok: false, code: "ENVELOPE_REFUSED" };
  if (s.status === "SIGNED") return { ok: false, code: "ALREADY_SIGNED" };
  if (!currentTurn(signers).includes(signerId)) return { ok: false, code: "NOT_YOUR_TURN" };
  return { ok: true };
}
/** CANCELED | REFUSED | COMPLETED | EXPIRED | IN_PROGRESS */
export function envelopeStatus(signers, { canceled = false, expiresAt = null, now = new Date().toISOString() } = {}) {
  if (canceled) return "CANCELED";
  if (signers.some((s) => s.status === "REFUSED")) return "REFUSED";
  if (signers.length && signers.every((s) => s.status === "SIGNED")) return "COMPLETED";
  if (expiresAt && now > expiresAt) return "EXPIRED";
  return "IN_PROGRESS";
}
/** Código enviado por e-mail: 6 dígitos, validade de 10 minutos, 5 tentativas. → { ok, code? } */
export function checkOtp({ code, expected, createdAt, now, attempts = 0, ttlMinutes = 10, maxAttempts = 5 }) {
  if (!expected || !createdAt) return { ok: false, code: "CODE_NOT_SENT" };
  if (attempts >= maxAttempts) return { ok: false, code: "TOO_MANY_ATTEMPTS" };
  if (Date.parse(now) - Date.parse(createdAt) > ttlMinutes * 60_000) return { ok: false, code: "CODE_EXPIRED" };
  if (String(code ?? "").trim() !== String(expected)) return { ok: false, code: "INVALID_CODE" };
  return { ok: true };
}
/** Código de verificação curto a partir do SHA-256 do PDF final: "A1B2-C3D4-E5F6". */
export function verificationCode(sha256Hex) {
  if (!/^[0-9a-f]{64}$/i.test(sha256Hex)) throw new Error("hash inválido");
  const s = sha256Hex.slice(0, 12).toUpperCase();
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
const ACTION = { CREATED: "criou o documento", SENT: "enviou para assinatura", VIEWED: "abriu o documento", CODE_SENT: "recebeu o código por e-mail", SIGNED: "assinou", REFUSED: "recusou", CANCELED: "cancelou", COMPLETED: "Documento concluído" };
const ROLE = { SIGNER: "parte", WITNESS: "testemunha", APPROVER: "aprovador" };
/**
 * Linhas do manifesto (folha de assinaturas) em horário de Brasília. events: [{ at, type, name, email, role, ip, document }]
 */
export function manifestLines(events, { timeZone = "America/Sao_Paulo" } = {}) {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return [...events].sort((a, b) => a.at.localeCompare(b.at)).map((e) => {
    const who = e.name ? `${e.name}${e.email ? ` <${e.email}>` : ""}${e.role ? ` (${ROLE[e.role] ?? e.role})` : ""}` : "";
    const doc = e.document ? ` · ${formatDocument(e.document)}` : "";
    const ip = e.ip ? ` · IP ${e.ip}` : "";
    return `${f.format(new Date(e.at)).replace(",", "")} · ${[who, ACTION[e.type] ?? e.type].filter(Boolean).join(" ")}${doc}${ip}`;
  });
}
