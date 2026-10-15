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

// ================================================================== operação avançada (references/10) e perfis (11)
const cerr = (list, code, message, path) => list.push({ code, message, path });

// ------------------------------------------------------------------ sinal no aceite
/**
 * Sinal cobrado no aceite: { pct? | amountCents?, methods?, dueDays? } sobre o avulso (sem avulso: a 1ª mensalidade).
 * → centavos (nunca mais que a base); o resto segue o plano de pagamento.
 */
export function validateDeposit(d, totals) {
  const e = [];
  if (!d) return e;
  const hasPct = d.pct != null, hasAmount = d.amountCents != null;
  if (hasPct === hasAmount) cerr(e, "DEPOSIT_INVALID", "Sinal em % ou em R$ (um dos dois)", "deposit");
  if (hasPct && !(typeof d.pct === "number" && d.pct > 0 && d.pct <= 100)) cerr(e, "DEPOSIT_INVALID", "Sinal entre 0% e 100%", "deposit.pct");
  if (hasAmount && !(Number.isInteger(d.amountCents) && d.amountCents > 0)) cerr(e, "DEPOSIT_INVALID", "Sinal em centavos", "deposit.amountCents");
  if (d.dueDays != null && !(Number.isInteger(d.dueDays) && d.dueDays >= 0 && d.dueDays <= 30)) cerr(e, "DEPOSIT_INVALID", "Prazo do sinal de 0 a 30 dias", "deposit.dueDays");
  if (!e.length && totals && hasAmount && d.amountCents > depositBase(totals)) cerr(e, "DEPOSIT_ABOVE_TOTAL", "O sinal passa do valor da proposta", "deposit.amountCents");
  return e;
}
export const depositBase = (totals) => (totals.oneTime.totalCents > 0 ? totals.oneTime.totalCents : totals.monthlyCents || totals.yearlyCents || 0);
export function depositAmount(d, totals) {
  if (!d) return 0;
  const base = depositBase(totals);
  return Math.min(base, d.pct != null ? Math.round((base * d.pct) / 100) : d.amountCents);
}
/** Plano do avulso depois do sinal: o sinal sai do total e o restante segue o plano (o sinal vence no aceite). */
export function planAfterDeposit(totalCents, depositCents, plan) {
  const rest = totalCents - depositCents;
  if (rest <= 0) return { ok: true, errors: [], schedule: [] };
  return paymentPlan(rest, plan);
}

// ------------------------------------------------------------------ envio por WhatsApp
/** Telefone brasileiro em E.164 (+55DDNNNNNNNNN): aceita com ou sem 55, com ou sem o 9; null se não dá. */
export function toE164Br(phone) {
  let d = onlyDigits(phone);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 12 || d.length === 13) { if (!d.startsWith("55")) return null; d = d.slice(2); }
  if (d.length !== 10 && d.length !== 11) return null;
  if (Number(d.slice(0, 2)) < 11 || d[0] === "0") return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return "+55" + d;
}
/** Mensagem do envio (texto curto: o WhatsApp mostra a prévia do link). */
export function whatsappProposalText({ company, customerName, code, url, totalCents, monthlyCents, validUntil }) {
  const first = String(customerName ?? "").trim().split(/\s+/)[0] || "Olá";
  const value = [totalCents ? formatBRL(totalCents) : null, monthlyCents ? formatBRL(monthlyCents) + "/mês" : null].filter(Boolean).join(" + ");
  return `${first}, aqui é da ${company}. Segue a proposta ${code}${value ? " (" + value + ")" : ""}, válida até ${formatDate(validUntil)}: ${url}`;
}

// ------------------------------------------------------------------ reajuste por índice (Banco Central)
/** Séries mensais do SGS do Banco Central (variação % ao mês). Confira o código no catálogo do SGS ao portar. */
export const INDEX_SERIES = { IPCA: 433, "IGP-M": 189, INPC: 188, "IGP-DI": 190 };
export const sgsUrl = (code, from, to) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${formatDate(from)}&dataFinal=${formatDate(to)}`;
/** Resposta do SGS ([{ data: "DD/MM/AAAA", valor: "0,46" | "0.46" }]) → [{ month: "AAAA-MM", pct }]. */
export function parseSgs(rows) {
  return (rows ?? []).map((r) => { const [d, m, y] = String(r.data).split("/"); return { month: `${y}-${m}`, pct: Number(String(r.valor).replace(",", ".")), _d: d }; }).filter((r) => /^\d{4}-\d{2}$/.test(r.month) && Number.isFinite(r.pct)).map(({ month, pct }) => ({ month, pct }));
}
const prevMonth = (ym, n = 1) => { const [y, m] = ym.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 - n, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };
/**
 * Índice acumulado dos 12 meses anteriores ao mês do reajuste (aniversário): encadeado Π(1 + v/100) − 1, 4 casas.
 * series: [{ month, pct }]. Mês faltando → { ok: false, missing }. `floorZero`: deflação não reduz o valor (cláusula comum no IGP-M).
 */
export function accumulatedIndex(series, readjustMonth, { months = 12, floorZero = false } = {}) {
  const want = Array.from({ length: months }, (_, i) => prevMonth(readjustMonth, months - i));
  const by = new Map(series.map((s) => [s.month, s.pct]));
  const missing = want.filter((m) => !by.has(m));
  if (missing.length) return { ok: false, missing, from: want[0], to: want[want.length - 1] };
  const f = want.reduce((acc, m) => acc * (1 + by.get(m) / 100), 1);
  let pct = Math.round((f - 1) * 1_000_000) / 10_000;
  const raw = pct;
  if (floorZero && pct < 0) pct = 0;
  return { ok: true, pct, rawPct: raw, from: want[0], to: want[want.length - 1], floored: floorZero && raw < 0 };
}
/** Mês do próximo aniversário do contrato a partir de hoje (o mês do início, a cada 12 meses). */
export function anniversaryMonth(startDate, today) {
  const [sy, sm] = startDate.split("-").map(Number), [ty, tm] = today.split("-").map(Number);
  let y = ty; if (tm > sm || (tm === sm && today.slice(8) > startDate.slice(8))) y += 1;
  if (y <= sy) y = sy + 1;
  return `${y}-${String(sm).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ relatório de conversão
/**
 * Funil das propostas enviadas no período: [{ sentAt, viewedAt?, acceptedAt?, rejectedAt?, validUntil, sellerId, totalCents, monthlyCents, effectiveDiscountPct }]
 * → { sent, viewed, accepted, rejected, expired, open, conversionPct, viewRatePct, avgDaysToAccept, avgTicketCents, acceptedCents, bySeller: [...] }
 */
export function conversionReport(proposals, { from, to, today }) {
  const inR = proposals.filter((p) => p.sentAt && p.sentAt.slice(0, 10) >= from && p.sentAt.slice(0, 10) <= to);
  const calc = (list) => {
    const acc = list.filter((p) => p.acceptedAt), rej = list.filter((p) => !p.acceptedAt && p.rejectedAt);
    const exp = list.filter((p) => !p.acceptedAt && !p.rejectedAt && p.validUntil && p.validUntil < today);
    const decided = acc.length + rej.length + exp.length;
    const days = acc.map((p) => diffDays(p.sentAt.slice(0, 10), p.acceptedAt.slice(0, 10)));
    const value = (p) => (p.totalCents ?? 0) + 12 * (p.monthlyCents ?? 0);
    return {
      sent: list.length, viewed: list.filter((p) => p.viewedAt || p.acceptedAt || p.rejectedAt).length, accepted: acc.length, rejected: rej.length, expired: exp.length, open: list.length - decided,
      conversionPct: decided ? Math.round((acc.length / decided) * 1000) / 10 : null,
      viewRatePct: list.length ? Math.round((list.filter((p) => p.viewedAt || p.acceptedAt || p.rejectedAt).length / list.length) * 1000) / 10 : null,
      avgDaysToAccept: days.length ? Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10 : null,
      avgTicketCents: acc.length ? Math.round(acc.reduce((s, p) => s + value(p), 0) / acc.length) : null,
      acceptedCents: acc.reduce((s, p) => s + value(p), 0),
      avgDiscountAcceptedPct: acc.length ? Math.round((acc.reduce((s, p) => s + (p.effectiveDiscountPct ?? 0), 0) / acc.length) * 10) / 10 : null,
    };
  };
  const sellers = [...new Set(inR.map((p) => p.sellerId))];
  return { ...calc(inR), bySeller: sellers.map((id) => ({ sellerId: id, ...calc(inR.filter((p) => p.sellerId === id)) })).sort((a, b) => b.acceptedCents - a.acceptedCents) };
}

// ------------------------------------------------------------------ perfil locação
/** Diárias de uma locação (devolução no dia seguinte = 1 diária; mesmo dia = 1). */
export const rentalDays = (start, end) => Math.max(1, diffDays(start, end));
/**
 * Preço mais barato para `days` com as tarifas { dayCents, weekCents?, monthCents? } (mês = 30 dias, semana = 7):
 * combina meses, semanas e diárias e, em cada faixa, troca o resto por um período maior quando sai mais barato.
 */
export function rentalPrice(days, { dayCents, weekCents = null, monthCents = null }) {
  const best = new Array(days + 1).fill(Infinity); best[0] = 0;
  const opts = [[1, dayCents], ...(weekCents != null ? [[7, weekCents]] : []), ...(monthCents != null ? [[30, monthCents]] : [])];
  for (let d = 1; d <= days; d++) for (const [len, c] of opts) best[d] = Math.min(best[d], best[Math.max(0, d - len)] + c);
  return best[days];
}
/** Quantidade livre de um item para o período: estoque de locação − o que está alugado (ou reservado) e se sobrepõe. */
export function rentalAvailable(stockQty, bookings, { start, end }) {
  const busy = bookings.filter((b) => b.status !== "CANCELED" && b.status !== "RETURNED" && b.start < end && start < b.end).reduce((s, b) => s + b.qty, 0);
  return Math.max(0, stockQty - busy);
}
/** Devolução atrasada: diárias extras pela tarifa diária (com tolerância em horas). */
export function lateReturn({ end, returnedAt, dayCents, graceHours = 2 }) {
  const ms = Date.parse(returnedAt) - Date.parse(end + "T23:59:59-03:00") - graceHours * 3_600_000;
  const days = ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
  return { lateDays: days, chargeCents: days * dayCents };
}

// ------------------------------------------------------------------ perfil reforma/obra (medição)
/** Etapas da obra: [{ name, pct }] somando 100 → valor de cada etapa (maior resto). */
export function validateStages(stages) {
  const e = [];
  if (!Array.isArray(stages) || !stages.length) { cerr(e, "STAGES_REQUIRED", "Inclua as etapas", "stages"); return e; }
  stages.forEach((s, i) => { if (!String(s?.name ?? "").trim()) cerr(e, "NAME_REQUIRED", "Nome da etapa", `stages.${i}.name`); if (!(typeof s?.pct === "number" && s.pct > 0 && s.pct <= 100)) cerr(e, "PCT_INVALID", "Peso da etapa", `stages.${i}.pct`); });
  if (!e.length && Math.round(stages.reduce((a, s) => a + s.pct * 100, 0)) !== 10000) cerr(e, "STAGES_SUM", "Os pesos das etapas precisam somar 100%", "stages");
  return e;
}
export function stageValues(totalCents, stages) {
  const raw = stages.map((s) => (totalCents * Math.round(s.pct * 100)) / 10000), out = raw.map(Math.floor);
  let left = totalCents - out.reduce((a, v) => a + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]] += 1;
  return out;
}
/**
 * Medição: progresso acumulado de cada etapa (0–100) contra o já medido → valor a faturar com retenção técnica
 * (`retentionPct`, devolvida na entrega). Progresso nunca volta. → { ok, errors, lines, grossCents, retentionCents, netCents }
 */
export function measurement(totalCents, stages, previous, current, { retentionPct = 0 } = {}) {
  const values = stageValues(totalCents, stages), errors = [], lines = [];
  stages.forEach((s, i) => {
    const before = previous?.[i] ?? 0, now = current?.[i] ?? before;
    if (!(typeof now === "number" && now >= 0 && now <= 100)) { cerr(errors, "PROGRESS_INVALID", "Progresso de 0 a 100", `progress.${i}`); return; }
    if (now < before) { cerr(errors, "PROGRESS_BACKWARDS", "O progresso não volta", `progress.${i}`); return; }
    const billedBefore = Math.round((values[i] * before) / 100), billedNow = Math.round((values[i] * now) / 100);
    lines.push({ stage: s.name, before, now, amountCents: billedNow - billedBefore });
  });
  if (errors.length) return { ok: false, errors, lines: [], grossCents: 0, retentionCents: 0, netCents: 0 };
  const gross = lines.reduce((a, l) => a + l.amountCents, 0), ret = Math.round((gross * retentionPct) / 100);
  return { ok: true, errors, lines, grossCents: gross, retentionCents: ret, netCents: gross - ret };
}

// ------------------------------------------------------------------ perfil escola (matrícula)
/**
 * Plano da anuidade: { annualCents, installments (1–12), firstDue, siblingPct?, scholarshipPct?, punctualityPct?, materialCents?, enrollmentFeeCents? }
 * Descontos de irmão e bolsa somam sobre a anuidade (teto 100%); a pontualidade vale só até o vencimento.
 * → { schedule: [{ number, dueDate, grossCents, discountCents, amountCents, onTimeCents }], enrollmentCents, totalCents }
 */
export function tuitionPlan({ annualCents, installments, firstDue, siblingPct = 0, scholarshipPct = 0, punctualityPct = 0, materialCents = 0, enrollmentFeeCents = 0 }) {
  if (!Number.isInteger(installments) || installments < 1 || installments > 12) throw new Error("de 1 a 12 parcelas");
  const off = Math.min(100, siblingPct + scholarshipPct);
  const discounted = annualCents - Math.round((annualCents * off) / 100);
  const base = Math.floor(discounted / installments), rest = discounted - base * installments;
  const gBase = Math.floor(annualCents / installments), gRest = annualCents - gBase * installments;
  const anchor = Number(firstDue.slice(8, 10));
  const schedule = Array.from({ length: installments }, (_, i) => {
    const amount = base + (i === 0 ? rest : 0) + (i === 0 ? materialCents : 0), gross = gBase + (i === 0 ? gRest : 0) + (i === 0 ? materialCents : 0);
    const punct = Math.round(((base + (i === 0 ? rest : 0)) * punctualityPct) / 100);
    return { number: i + 1, dueDate: addMonths(firstDue, i, anchor), grossCents: gross, discountCents: gross - amount, amountCents: amount, onTimeCents: amount - punct };
  });
  return { schedule, enrollmentCents: enrollmentFeeCents, totalCents: enrollmentFeeCents + schedule.reduce((a, p) => a + p.amountCents, 0) };
}
/** Desconto de pontualidade vale para o pagamento até o vencimento (no dia ainda vale). */
export const tuitionDue = (p, payDate) => (payDate <= p.dueDate ? p.onTimeCents : p.amountCents);

// ------------------------------------------------------------------ perfis
export const COM_SEGMENTS = {
  GENERAL: { label: "Empresa em geral", words: { proposal: "proposta", proposals: "propostas", customer: "cliente", contract: "contrato" }, on: [] },
  RENTAL: { label: "Locação de equipamentos", words: { proposal: "orçamento de locação", proposals: "orçamentos de locação", customer: "locatário", contract: "contrato de locação" }, on: ["rentals", "deposit", "whatsapp"] },
  CONSTRUCTION: { label: "Reforma e obra", words: { proposal: "orçamento da obra", proposals: "orçamentos de obra", customer: "cliente", contract: "contrato de empreitada" }, on: ["stages", "measurements", "deposit", "erp_catalog"] },
  SCHOOL: { label: "Escola e curso", words: { proposal: "proposta de matrícula", proposals: "propostas de matrícula", customer: "responsável", contract: "contrato de matrícula" }, on: ["enrollment", "deposit", "readjust_index"] },
};
export const comSegment = (id) => (COM_SEGMENTS[id] ? { id, ...COM_SEGMENTS[id] } : { id: "GENERAL", ...COM_SEGMENTS.GENERAL });
