// rodsaas · fiscal — regras puras do motor de documentos fiscais (NF-e modelo 55, NFC-e modelo 65; base para NFS-e).
//
// O motor é dono do documento: numeração, chave de acesso, regras de imposto, totais, validação, status, eventos
// (cancelamento, carta de correção, inutilização), QR Code da NFC-e e o XML no layout 4.00. Transmitir é o trabalho
// de um DRIVER (falso agora; provedores — Focus NFe, NFE.io, PlugNotas, Nuvem Fiscal — e SEFAZ nativa depois).
// Porte para TypeScript em api/src/modules/fiscal/lib/ com os testes de fiscal-lib.test.mjs.
// Rode: node --test fiscal-lib.test.mjs

import { createHash } from "node:crypto";

export const onlyDigits = (s) => String(s ?? "").replace(/\D/g, "");
const pad = (v, n) => String(v).padStart(n, "0");
const roundHalfUp = (x) => Math.floor(x + 0.5);

// ------------------------------------------------------------------ documentos (CPF/CNPJ)
export function isValidCnpj(v) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base) => { let s = 0, w = base.length - 7; for (const ch of base) { s += Number(ch) * w--; if (w < 2) w = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]);
}
export function isValidCpf(v) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

// ------------------------------------------------------------------ UF e chave de acesso
/** Códigos IBGE das UFs (cUF da chave de acesso). */
export const UF_CODES = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };
/** Dígito verificador módulo 11 da chave (pesos 2 a 9 da direita para a esquerda; resto 0 ou 1 → 0). */
export function mod11(digits) {
  let s = 0, w = 2;
  for (let i = digits.length - 1; i >= 0; i--) { s += Number(digits[i]) * w; w = w === 9 ? 2 : w + 1; }
  const r = s % 11;
  return r < 2 ? 0 : 11 - r;
}
/** Código numérico (cNF, 8 dígitos) que compõe a chave; nunca igual ao número da nota (regra da SEFAZ). */
export function numericCode(number, rand = Math.random) {
  for (;;) { const c = pad(Math.floor(rand() * 1e8), 8); if (Number(c) !== Number(number) % 1e8) return c; }
}
/**
 * Chave de acesso (44 dígitos): cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) DV(1).
 * emissionType: 1 normal · 9 contingência offline da NFC-e.
 */
export function accessKey({ uf, yearMonth, cnpj, model, series, number, emissionType = 1, code }) {
  const cUF = UF_CODES[uf];
  if (!cUF) throw new Error(`UF inválida: ${uf}`);
  const [y, m] = String(yearMonth).split("-");
  const base = `${cUF}${y.slice(2)}${m}${pad(onlyDigits(cnpj), 14)}${model}${pad(series, 3)}${pad(number, 9)}${emissionType}${pad(code, 8)}`;
  if (base.length !== 43) throw new Error("dados inválidos para a chave");
  return base + mod11(base);
}
export function parseAccessKey(key) {
  const k = onlyDigits(key);
  if (k.length !== 44) return { valid: false };
  const ufEntry = Object.entries(UF_CODES).find(([, c]) => c === Number(k.slice(0, 2)));
  return { valid: mod11(k.slice(0, 43)) === Number(k[43]) && !!ufEntry, uf: ufEntry?.[0] ?? null, yearMonth: `20${k.slice(2, 4)}-${k.slice(4, 6)}`, cnpj: k.slice(6, 20), model: Number(k.slice(20, 22)), series: Number(k.slice(22, 25)), number: Number(k.slice(25, 34)), emissionType: Number(k[34]), code: k.slice(35, 43) };
}

// ------------------------------------------------------------------ regras de imposto
/** Destino da operação: dentro do estado, outro estado ou exterior (define o 1º dígito do CFOP: 5/6/7 na saída). */
export const destinationOf = (issuerUf, recipientUf, foreign = false) => (foreign ? "EXPORT" : !recipientUf || recipientUf === issuerUf ? "INTERNAL" : "INTERSTATE");
const CFOP_FIRST = { OUT: { INTERNAL: "5", INTERSTATE: "6", EXPORT: "7" }, IN: { INTERNAL: "1", INTERSTATE: "2", EXPORT: "3" } };
/**
 * Regra fiscal que vale para o item: a mais específica entre as que batem (cada condição que bate conta; prefixo de
 * NCM conta pelo tamanho). Condições: operation, destination, consumerFinal, regime, ncmPrefix.
 * rules: [{ id, when: {...}, set: { cfop, csosn? | cst?, icmsRate?, icmsReductionPct?, pisCst, pisRate, cofinsCst, cofinsRate, ipiCst?, ipiRate? } }]
 */
export function pickTaxRule(ctx, rules) {
  let best = null, bestScore = -1;
  for (const r of rules ?? []) {
    const w = r.when ?? {};
    let score = 0, ok = true;
    for (const k of ["operation", "destination", "consumerFinal", "regime"]) if (w[k] !== undefined) { if (w[k] === ctx[k]) score += 1; else ok = false; }
    if (w.ncmPrefix) { if (String(ctx.ncm ?? "").startsWith(w.ncmPrefix)) score += w.ncmPrefix.length; else ok = false; }
    if (ok && score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}
/** Regras padrão do Simples Nacional (sem ST): o contador ajusta. CSOSN 102 (sem crédito), PIS/COFINS 49. */
export function defaultSimplesRules() {
  const pc = { pisCst: "49", pisRate: 0, cofinsCst: "49", cofinsRate: 0 };
  return [
    { id: "venda-interna", name: "Venda dentro do estado", when: { operation: "SALE", destination: "INTERNAL" }, set: { cfop: "5102", csosn: "102", ...pc } },
    { id: "venda-interestadual", name: "Venda para outro estado", when: { operation: "SALE", destination: "INTERSTATE" }, set: { cfop: "6102", csosn: "102", ...pc } },
    { id: "venda-exterior", name: "Exportação", when: { operation: "SALE", destination: "EXPORT" }, set: { cfop: "7102", csosn: "300", ...pc } },
    { id: "devolucao-interna", name: "Devolução de venda (entrada)", when: { operation: "RETURN", destination: "INTERNAL" }, set: { cfop: "1202", csosn: "900", ...pc } },
  ];
}
/** O CFOP combina com o destino e a direção? (5xxx dentro do estado, 6xxx fora, 7xxx exterior; entradas 1/2/3) */
export const cfopMatches = (cfop, destination, direction = "OUT") => /^\d{4}$/.test(String(cfop)) && String(cfop)[0] === CFOP_FIRST[direction][destination];

/**
 * Impostos de um item (centavos). Base = bruto − desconto + frete + outras despesas rateados.
 * Simples (csosn): ICMS próprio 0 (destacado só no 101/201 como crédito, `icmsCreditRate`). Normal (cst 00/20): ICMS
 * sobre a base (com redução no 20). IPI sobre o valor. PIS/COFINS pela alíquota (0 no Simples).
 */
/**
 * Reforma tributária (IBS/CBS, LC 214/2025, NT 2025.002-RTC): grupo IBSCBS por item. Em 2026 é ano de teste
 * (CBS 0,9%, IBS estadual 0,1%, IBS municipal 0%) e não soma no vNF. Obrigatório para o regime normal a partir de
 * 03/08/2026 e para Simples/MEI a partir de 01/01/2027; a rejeição 1115 em produção foi adiada sem data. Confira o
 * cronograma atual e o cClassTrib com o contador.
 */
export const IBS_CBS_2026 = { cst: "000", cClassTrib: "000001", cbsRate: 0.9, ibsUfRate: 0.1, ibsMunRate: 0 };
const IBS_CBS_SINCE = { NORMAL: "2026-08-03", SIMPLES: "2027-01-01", SIMPLES_EXCESSO: "2027-01-01" };
/** O grupo IBSCBS é obrigatório para este regime nesta data (AAAA-MM-DD)? */
export const ibsCbsRequired = (regime, dateIso) => !!IBS_CBS_SINCE[regime] && String(dateIso).slice(0, 10) >= IBS_CBS_SINCE[regime];

export function itemTaxes(item, set) {
  const gross = roundHalfUp(item.qty * item.unitCents);
  const base = gross - (item.discountCents ?? 0) + (item.freightCents ?? 0) + (item.otherCents ?? 0);
  const out = { grossCents: gross, baseCents: base, icmsBaseCents: 0, icmsCents: 0, icmsCreditCents: 0, ipiCents: 0, pisCents: 0, cofinsCents: 0, ibsCbsBaseCents: 0, cbsCents: 0, ibsUfCents: 0, ibsMunCents: 0 };
  if (set.cst != null) {
    const red = set.cst === "20" ? (set.icmsReductionPct ?? 0) : 0;
    out.icmsBaseCents = ["00", "20"].includes(set.cst) ? roundHalfUp(base * (1 - red / 100)) : 0;
    out.icmsCents = roundHalfUp((out.icmsBaseCents * (set.icmsRate ?? 0)) / 100);
  } else if (["101", "201"].includes(set.csosn)) out.icmsCreditCents = roundHalfUp((base * (set.icmsCreditRate ?? 0)) / 100);
  out.ipiCents = roundHalfUp((gross * (set.ipiRate ?? 0)) / 100);
  out.pisCents = roundHalfUp((base * (set.pisRate ?? 0)) / 100);
  out.cofinsCents = roundHalfUp((base * (set.cofinsRate ?? 0)) / 100);
  if (set.ibsCbs) {
    out.ibsCbsBaseCents = base;
    out.cbsCents = roundHalfUp((base * (set.ibsCbs.cbsRate ?? 0)) / 100);
    out.ibsUfCents = roundHalfUp((base * (set.ibsCbs.ibsUfRate ?? 0)) / 100);
    out.ibsMunCents = roundHalfUp((base * (set.ibsCbs.ibsMunRate ?? 0)) / 100);
  }
  return out;
}
/** Rateio de um valor da nota (desconto, frete) pelos itens, proporcional ao bruto; o centavo que sobra vai para o último. */
export function allocate(totalCents, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !totalCents) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((totalCents * w) / sum));
  parts[parts.length - 1] += totalCents - parts.reduce((a, b) => a + b, 0);
  return parts;
}
/** Totais da nota (grupo ICMSTot): vNF = vProd − vDesc + vFrete + vOutro + vIPI (IBS/CBS ficam à parte: IBSCBSTot). */
export function documentTotals(lines) {
  const t = { productsCents: 0, discountCents: 0, freightCents: 0, otherCents: 0, icmsBaseCents: 0, icmsCents: 0, ipiCents: 0, pisCents: 0, cofinsCents: 0, ibsCbsBaseCents: 0, cbsCents: 0, ibsUfCents: 0, ibsMunCents: 0 };
  for (const l of lines) {
    t.productsCents += l.grossCents; t.discountCents += l.discountCents ?? 0; t.freightCents += l.freightCents ?? 0; t.otherCents += l.otherCents ?? 0;
    t.icmsBaseCents += l.icmsBaseCents; t.icmsCents += l.icmsCents; t.ipiCents += l.ipiCents; t.pisCents += l.pisCents; t.cofinsCents += l.cofinsCents;
    t.ibsCbsBaseCents += l.ibsCbsBaseCents ?? 0; t.cbsCents += l.cbsCents ?? 0; t.ibsUfCents += l.ibsUfCents ?? 0; t.ibsMunCents += l.ibsMunCents ?? 0;
  }
  t.totalCents = t.productsCents - t.discountCents + t.freightCents + t.otherCents + t.ipiCents;
  return t;
}

// ------------------------------------------------------------------ validação do documento
/**
 * Confere a nota antes de numerar. doc: { model: 55 | 65, issuer: { cnpj, ie, uf, regime }, recipient?: { document, name, uf, foreign? },
 * items: [{ description, ncm, cfop, unit, qty, unitCents }], payments: [{ method, amountCents }], totalCents }
 * opts: { nfceIdentifyAboveCents = 1_000_000 (NFC-e acima do valor exige CPF/CNPJ — confira o limite da sua UF),
 *         requireIbsCbs = false (true quando ibsCbsRequired: cada item precisa de ibsCbs { cst, cClassTrib }) }
 * → errors: [{ path, code, message }]
 */
export function validateDocument(doc, { nfceIdentifyAboveCents = 1_000_000, requireIbsCbs = false } = {}) {
  const e = [];
  const err = (path, code, message) => e.push({ path, code, message });
  if (![55, 65].includes(doc.model)) err("model", "MODEL_INVALID", "Modelo 55 (NF-e) ou 65 (NFC-e)");
  if (!isValidCnpj(doc.issuer?.cnpj)) err("issuer.cnpj", "CNPJ_INVALID", "CNPJ do emitente inválido");
  if (!UF_CODES[doc.issuer?.uf]) err("issuer.uf", "UF_INVALID", "UF do emitente inválida");
  if (!String(doc.issuer?.ie ?? "").trim()) err("issuer.ie", "IE_REQUIRED", "Inscrição estadual do emitente (ou ISENTO)");
  const r = doc.recipient;
  const docOk = (d) => isValidCpf(d) || isValidCnpj(d);
  if (doc.model === 55) {
    if (!r?.foreign && !docOk(r?.document)) err("recipient.document", "RECIPIENT_REQUIRED", "NF-e exige CPF ou CNPJ válido do destinatário");
    if (!String(r?.name ?? "").trim()) err("recipient.name", "RECIPIENT_REQUIRED", "Nome do destinatário");
    if (!r?.foreign && !UF_CODES[r?.uf]) err("recipient.uf", "RECIPIENT_UF_REQUIRED", "UF do destinatário (endereço)");
  } else if (doc.model === 65) {
    if (r?.document && !docOk(r.document)) err("recipient.document", "DOCUMENT_INVALID", "CPF ou CNPJ inválido");
    if (!r?.document && (doc.totalCents ?? 0) > nfceIdentifyAboveCents) err("recipient.document", "RECIPIENT_REQUIRED", "Acima do limite a NFC-e exige o CPF/CNPJ do consumidor");
    if (r?.uf && r.uf !== doc.issuer?.uf) err("recipient.uf", "NFCE_INTERSTATE", "NFC-e é só para venda presencial dentro do estado");
  }
  if (!Array.isArray(doc.items) || !doc.items.length) err("items", "ITEMS_REQUIRED", "Inclua os itens");
  const dest = destinationOf(doc.issuer?.uf, r?.uf, !!r?.foreign);
  (doc.items ?? []).forEach((it, i) => {
    if (!String(it.description ?? "").trim()) err(`items.${i}.description`, "DESCRIPTION_REQUIRED", "Descrição do item");
    if (!/^\d{8}$/.test(String(it.ncm ?? ""))) err(`items.${i}.ncm`, "NCM_INVALID", "NCM com 8 dígitos");
    if (!cfopMatches(it.cfop, dest, it.direction ?? "OUT")) err(`items.${i}.cfop`, "CFOP_MISMATCH", `CFOP não combina com a operação (${dest === "INTERNAL" ? "5xxx" : dest === "INTERSTATE" ? "6xxx" : "7xxx"})`);
    if (doc.model === 65 && String(it.cfop)[0] !== "5") err(`items.${i}.cfop`, "NFCE_CFOP", "NFC-e só com CFOP 5xxx");
    if (!(it.qty > 0) || Math.round(it.qty * 10000) !== it.qty * 10000) err(`items.${i}.qty`, "QTY_INVALID", "Quantidade com até 4 casas");
    if (!Number.isInteger(it.unitCents) || it.unitCents < 0) err(`items.${i}.unitCents`, "PRICE_INVALID", "Valor em centavos");
    if (!String(it.unit ?? "").trim()) err(`items.${i}.unit`, "UNIT_REQUIRED", "Unidade");
    if (requireIbsCbs && !(/^\d{3}$/.test(String(it.ibsCbs?.cst ?? "")) && /^\d{6}$/.test(String(it.ibsCbs?.cClassTrib ?? "")))) err(`items.${i}.ibsCbs`, "IBSCBS_REQUIRED", "Informe o IBS/CBS do item (CST e cClassTrib)");
  });
  const paid = (doc.payments ?? []).reduce((a, p) => a + (p.amountCents ?? 0), 0);
  if (doc.model === 65 && paid < (doc.totalCents ?? 0)) err("payments", "UNDERPAID", "Pagamentos menores que o total");
  return e;
}

// ------------------------------------------------------------------ status e eventos
/** Fluxo: DRAFT → PROCESSING → AUTHORIZED | REJECTED | DENIED | CONTINGENCY; REJECTED/CONTINGENCY → PROCESSING; AUTHORIZED → CANCELED. */
export const DOC_FLOW = { DRAFT: ["PROCESSING"], PROCESSING: ["AUTHORIZED", "REJECTED", "DENIED", "CONTINGENCY"], REJECTED: ["PROCESSING"], CONTINGENCY: ["PROCESSING"], AUTHORIZED: ["CANCELED"], DENIED: [], CANCELED: [] };
export const canTransition = (from, to) => (DOC_FLOW[from] ?? []).includes(to);
const justificationOk = (t) => { const n = String(t ?? "").trim().length; return n >= 15 && n <= 255; };
/**
 * Pode cancelar? Só autorizada, dentro do prazo (padrão: NF-e 24 h; NFC-e 30 min — o prazo varia por UF, deixe
 * configurável), justificativa de 15 a 255 caracteres. → { ok, code? }
 */
export function cancelCheck({ status, model, authorizedAt, justification, now = Date.now(), windowMinutes }) {
  if (status !== "AUTHORIZED") return { ok: false, code: "INVALID_STATUS" };
  if (!justificationOk(justification)) return { ok: false, code: "JUSTIFICATION_INVALID" };
  const win = windowMinutes ?? (model === 65 ? 30 : 24 * 60);
  if (Date.parse(new Date(now).toISOString()) - Date.parse(authorizedAt) > win * 60_000) return { ok: false, code: "CANCEL_WINDOW_EXPIRED" };
  return { ok: true };
}
/** Carta de correção: só NF-e autorizada, texto de 15 a 1000 caracteres, até 20 por nota (sequência). → { ok, sequence?, code? } */
export function correctionCheck({ status, model, text, previousCount = 0 }) {
  if (model !== 55) return { ok: false, code: "NFE_ONLY" };
  if (status !== "AUTHORIZED") return { ok: false, code: "INVALID_STATUS" };
  const n = String(text ?? "").trim().length;
  if (n < 15 || n > 1000) return { ok: false, code: "TEXT_INVALID" };
  if (previousCount >= 20) return { ok: false, code: "TOO_MANY_CORRECTIONS" };
  return { ok: true, sequence: previousCount + 1 };
}
/** Inutilização de uma faixa de números que não foram usados (mesma série). → { ok, code?, numbers? } */
export function voidCheck({ from, to, used = [], justification, max = 999_999_999 }) {
  if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from && to <= max)) return { ok: false, code: "RANGE_INVALID" };
  if (!justificationOk(justification)) return { ok: false, code: "JUSTIFICATION_INVALID" };
  const inUse = used.filter((n) => n >= from && n <= to);
  if (inUse.length) return { ok: false, code: "NUMBERS_IN_USE", numbers: inUse };
  return { ok: true };
}
/** Próximo número da série pulando as faixas inutilizadas. */
export function nextNumber(current, voided = []) {
  let n = current;
  for (let changed = true; changed;) { changed = false; for (const v of voided) if (n >= v.from && n <= v.to) { n = v.to + 1; changed = true; } }
  return n;
}

// ------------------------------------------------------------------ retornos da SEFAZ
/** Principais códigos de retorno (cStat) traduzidos; confira a tabela atual do Manual de Orientação do Contribuinte. */
export const SEFAZ_STATUS = {
  100: { status: "AUTHORIZED", message: "Autorizada" },
  150: { status: "AUTHORIZED", message: "Autorizada fora do prazo" },
  110: { status: "DENIED", message: "Uso denegado (situação do emitente ou destinatário na SEFAZ)" },
  301: { status: "DENIED", message: "Uso denegado: irregularidade fiscal do emitente" },
  302: { status: "DENIED", message: "Uso denegado: irregularidade fiscal do destinatário" },
  204: { status: "REJECTED", message: "Duplicidade de NF-e (este número já foi autorizado)" },
  225: { status: "REJECTED", message: "XML fora do padrão (falha no schema)" },
  539: { status: "REJECTED", message: "Duplicidade de NF-e com diferença na chave de acesso" },
  778: { status: "REJECTED", message: "NCM inexistente" },
  108: { status: "UNAVAILABLE", message: "SEFAZ paralisada momentaneamente" },
  109: { status: "UNAVAILABLE", message: "SEFAZ paralisada sem previsão" },
};
export const sefazResult = (code) => SEFAZ_STATUS[code] ?? { status: "REJECTED", message: `Rejeição ${code}: veja a mensagem da SEFAZ` };

// ------------------------------------------------------------------ QR Code da NFC-e
/**
 * URL do QR Code da NFC-e, versão 2 (emissão normal): p = chave|2|tpAmb|idCSC|hash, com
 * hash = SHA-1 (hex maiúsculo) de "chave|2|tpAmb|idCSC" + CSC; idCSC sem zeros à esquerda.
 * (Contingência offline tem outro formato: confira a nota técnica atual.) tpAmb: 1 produção, 2 homologação.
 */
export function nfceQrCodeUrl({ baseUrl, key, environment, cscId, csc }) {
  const id = String(Number(cscId));
  const params = `${key}|2|${environment}|${id}`;
  const hash = createHash("sha1").update(params + csc).digest("hex").toUpperCase();
  return `${baseUrl}?p=${params}|${hash}`;
}

// ------------------------------------------------------------------ XML (layout 4.00, grupos principais)
const x = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const money = (c) => (c / 100).toFixed(2);
const address = (wrap, a) => (a ? `<${wrap}>${tag("xLgr", a.street)}${tag("nro", a.number ?? "S/N")}${tag("xCpl", a.complement)}${tag("xBairro", a.district)}${tag("cMun", a.cityCode)}${tag("xMun", a.city)}${tag("UF", a.uf)}${tag("CEP", onlyDigits(a.zip))}</${wrap}>` : "");
const tag = (name, value) => (value === undefined || value === null || value === "" ? "" : `<${name}>${x(value)}</${name}>`);
/**
 * XML da NF-e/NFC-e (sem a assinatura — assinar é do driver nativo; provedores que recebem JSON nem usam).
 * Valide no projeto com os XSDs oficiais do Portal Nacional da NF-e. doc: o documento já calculado
 * ({ key, model, series, number, issuedAt, environment, emissionType, issuer, recipient, lines, totals, payments, additionalInfo }).
 */
export function buildXml(doc) {
  const k = parseAccessKey(doc.key);
  const ide = `<ide>${tag("cUF", UF_CODES[doc.issuer.uf])}${tag("cNF", k.code)}${tag("natOp", doc.natureOfOperation ?? "VENDA")}${tag("mod", doc.model)}${tag("serie", doc.series)}${tag("nNF", doc.number)}${tag("dhEmi", doc.issuedAt)}${tag("tpNF", 1)}${tag("idDest", { INTERNAL: 1, INTERSTATE: 2, EXPORT: 3 }[destinationOf(doc.issuer.uf, doc.recipient?.uf, doc.recipient?.foreign)])}${tag("cMunFG", doc.issuer.cityCode)}${tag("tpImp", doc.model === 65 ? 4 : 1)}${tag("tpEmis", doc.emissionType ?? 1)}${tag("cDV", doc.key.slice(-1))}${tag("tpAmb", doc.environment)}${tag("finNFe", 1)}${tag("indFinal", doc.model === 65 || doc.recipient?.consumerFinal ? 1 : 0)}${tag("indPres", doc.model === 65 ? 1 : 0)}${tag("procEmi", 0)}${tag("verProc", "rodsaas-fiscal")}</ide>`;
  const emit = `<emit>${tag("CNPJ", onlyDigits(doc.issuer.cnpj))}${tag("xNome", doc.issuer.name)}${address("enderEmit", doc.issuer.address)}${tag("IE", doc.issuer.ie)}${tag("CRT", { SIMPLES: 1, SIMPLES_EXCESSO: 2, NORMAL: 3 }[doc.issuer.regime])}</emit>`;
  const r = doc.recipient;
  const docTag = r?.document ? (onlyDigits(r.document).length === 14 ? tag("CNPJ", onlyDigits(r.document)) : tag("CPF", onlyDigits(r.document))) : "";
  const dest = r && (r.document || r.name) ? `<dest>${docTag}${tag("xNome", r.name)}${address("enderDest", r.address)}${tag("indIEDest", 9)}</dest>` : "";
  const det = doc.lines.map((l, i) => {
    const icms = l.csosn ? `<ICMSSN${l.csosn}>${tag("orig", l.origin ?? 0)}${tag("CSOSN", l.csosn)}</ICMSSN${l.csosn}>` : `<ICMS${l.cst}>${tag("orig", l.origin ?? 0)}${tag("CST", l.cst)}${tag("vBC", money(l.icmsBaseCents))}${tag("pICMS", (l.icmsRate ?? 0).toFixed(2))}${tag("vICMS", money(l.icmsCents))}</ICMS${l.cst}>`;
    const ib = l.ibsCbs;
    const ibscbs = ib ? `<IBSCBS>${tag("CST", ib.cst)}${tag("cClassTrib", ib.cClassTrib)}<gIBSCBS>${tag("vBC", money(l.ibsCbsBaseCents))}<gIBSUF>${tag("pIBSUF", (ib.ibsUfRate ?? 0).toFixed(4))}${tag("vIBSUF", money(l.ibsUfCents))}</gIBSUF><gIBSMun>${tag("pIBSMun", (ib.ibsMunRate ?? 0).toFixed(4))}${tag("vIBSMun", money(l.ibsMunCents))}</gIBSMun>${tag("vIBS", money(l.ibsUfCents + l.ibsMunCents))}<gCBS>${tag("pCBS", (ib.cbsRate ?? 0).toFixed(4))}${tag("vCBS", money(l.cbsCents))}</gCBS></gIBSCBS></IBSCBS>` : "";
    return `<det nItem="${i + 1}"><prod>${tag("cProd", l.code ?? i + 1)}${tag("cEAN", l.barcode ?? "SEM GTIN")}${tag("xProd", l.description)}${tag("NCM", l.ncm)}${tag("CFOP", l.cfop)}${tag("uCom", l.unit)}${tag("qCom", Number(l.qty).toFixed(4))}${tag("vUnCom", money(l.unitCents))}${tag("vProd", money(l.grossCents))}${tag("cEANTrib", l.barcode ?? "SEM GTIN")}${tag("uTrib", l.unit)}${tag("qTrib", Number(l.qty).toFixed(4))}${tag("vUnTrib", money(l.unitCents))}${l.discountCents ? tag("vDesc", money(l.discountCents)) : ""}${l.freightCents ? tag("vFrete", money(l.freightCents)) : ""}${tag("indTot", 1)}</prod><imposto><ICMS>${icms}</ICMS><PIS><PISOutr>${tag("CST", l.pisCst ?? "49")}${tag("vBC", money(l.baseCents))}${tag("pPIS", (l.pisRate ?? 0).toFixed(2))}${tag("vPIS", money(l.pisCents))}</PISOutr></PIS><COFINS><COFINSOutr>${tag("CST", l.cofinsCst ?? "49")}${tag("vBC", money(l.baseCents))}${tag("pCOFINS", (l.cofinsRate ?? 0).toFixed(2))}${tag("vCOFINS", money(l.cofinsCents))}</COFINSOutr></COFINS>${ibscbs}</imposto></det>`;
  }).join("");
  const t = doc.totals;
  const total = `<total><ICMSTot>${tag("vBC", money(t.icmsBaseCents))}${tag("vICMS", money(t.icmsCents))}${tag("vProd", money(t.productsCents))}${tag("vFrete", money(t.freightCents))}${tag("vDesc", money(t.discountCents))}${tag("vIPI", money(t.ipiCents))}${tag("vPIS", money(t.pisCents))}${tag("vCOFINS", money(t.cofinsCents))}${tag("vOutro", money(t.otherCents))}${tag("vNF", money(t.totalCents))}</ICMSTot>${doc.lines.some((l) => l.ibsCbs) ? `<IBSCBSTot>${tag("vBCIBSCBS", money(t.ibsCbsBaseCents))}<gIBS><gIBSUF>${tag("vIBSUF", money(t.ibsUfCents))}</gIBSUF><gIBSMun>${tag("vIBSMun", money(t.ibsMunCents))}</gIBSMun>${tag("vIBS", money(t.ibsUfCents + t.ibsMunCents))}</gIBS><gCBS>${tag("vCBS", money(t.cbsCents))}</gCBS></IBSCBSTot>` : ""}</total>`;
  const PAY = { CASH: "01", CHECK: "02", CREDIT: "03", DEBIT: "04", STORE_CREDIT: "05", VOUCHER: "10", BOLETO: "15", PIX: "17", OTHER: "99" };
  const paid = (doc.payments ?? []).reduce((a, p) => a + p.amountCents, 0);
  const pag = `<pag>${(doc.payments ?? []).map((p) => `<detPag>${tag("tPag", PAY[p.method] ?? "99")}${tag("vPag", money(p.amountCents))}</detPag>`).join("")}${paid > t.totalCents ? tag("vTroco", money(paid - t.totalCents)) : ""}</pag>`;
  const inf = doc.additionalInfo ? `<infAdic>${tag("infCpl", doc.additionalInfo)}</infAdic>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe${doc.key}">${ide}${emit}${dest}${det}${total}<transp><modFrete>${doc.model === 65 ? 9 : doc.freightMode ?? 9}</modFrete></transp>${pag}${inf}</infNFe></NFe>`;
}

// ------------------------------------------------------------------ contrato do driver
export const DRIVER_CAPABILITIES = ["nfe", "nfce", "nfse", "contingency", "correction", "void", "xml", "danfe"];
export function validateDriver(d) {
  const e = [];
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(String(d?.id ?? ""))) e.push("id inválido");
  for (const m of ["authorize", "status", "cancel"]) if (typeof d?.[m] !== "function") e.push(`falta o método ${m}`);
  for (const k of Object.keys(d?.capabilities ?? {})) if (!DRIVER_CAPABILITIES.includes(k)) e.push(`capacidade desconhecida: ${k}`);
  if (d?.capabilities?.correction && typeof d?.correct !== "function") e.push("declara correction sem o método correct");
  if (d?.capabilities?.void && typeof d?.voidRange !== "function") e.push("declara void sem o método voidRange");
  return e;
}
