// rodsaas · whatsapp — regras puras do motor de WhatsApp (sem banco, sem rede).
//
// O motor guarda as regras e os dados (conversas, mensagens, janela de 24 h, modelos, descadastro, roteamento);
// cada provedor é só um DRIVER de transmissão (falso agora; Meta, Zenvia, RodTicket depois) com o mesmo contrato.
// Porte para TypeScript em api/src/modules/whatsapp/lib/ com os testes de whatsapp-lib.test.mjs.
// Rode: node --test whatsapp-lib.test.mjs

import { createHmac, timingSafeEqual } from "node:crypto";

const HOUR = 3_600_000;

// ------------------------------------------------------------------ telefone
/**
 * Número em E.164 sem "+" (o que todos os provedores aceitam): "(44) 99999-1234" → "5544999991234".
 * Sem código de país assume o Brasil. Brasil: DDD válido, celular com 9 dígitos começando com 9, fixo com 8.
 * Outros países: 8 a 15 dígitos com "+" ou "00" na frente. Inválido → null.
 */
export function normalizePhone(raw, { defaultCountry = "55" } = {}) {
  const s = String(raw ?? "").trim();
  const intl = s.startsWith("+") || s.startsWith("00");
  let d = s.replace(/\D/g, "");
  if (s.startsWith("00")) d = d.slice(2);
  if (!intl && (d.length === 10 || d.length === 11)) d = defaultCountry + d;
  if (d.startsWith("55")) {
    if (!/^55[1-9][1-9]\d{8,9}$/.test(d)) return null;
    if (d.length === 13 && d[4] !== "9") return null;
    return d;
  }
  return intl && /^[1-9]\d{7,14}$/.test(d) ? d : null;
}
/** "5544999991234" → "+55 44 99999-1234" (para mostrar). */
export function formatPhone(e164) {
  const d = String(e164 ?? "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : d ? `+${d}` : "";
}

// ------------------------------------------------------------------ janela de 24 h
/**
 * Janela de atendimento: depois da última mensagem DO CLIENTE, 24 h para mandar texto livre.
 * Fora dela, só modelo aprovado (regra da Meta; drivers sem essa regra declaram freeformAnytime).
 */
export function windowState(lastInboundAt, now = Date.now()) {
  if (!lastInboundAt) return { open: false, closesAt: null };
  const closes = Date.parse(lastInboundAt) + 24 * HOUR;
  return { open: Date.parse(new Date(now).toISOString()) < closes, closesAt: new Date(closes).toISOString() };
}
/**
 * Como mandar: texto livre ou modelo. capabilities do driver: { templates, freeformAnytime, media, buttons }.
 * → { ok, mode: "FREEFORM" | "TEMPLATE", error?: { code } }
 */
export function chooseSendMode({ kind, windowOpen, capabilities = {} }) {
  if (kind === "template") return capabilities.templates === false ? { ok: false, error: { code: "TEMPLATES_NOT_SUPPORTED" } } : { ok: true, mode: "TEMPLATE" };
  if (windowOpen || capabilities.freeformAnytime) return { ok: true, mode: "FREEFORM" };
  return { ok: false, error: { code: "OUTSIDE_WINDOW" } };
}

// ------------------------------------------------------------------ modelos (templates)
export const TEMPLATE_CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"];
/**
 * Valida um modelo no formato da Meta (o mais restrito; os outros drivers aceitam o mesmo):
 * name a-z0-9_, corpo até 1024, variáveis {{1}}..{{n}} em sequência, sem começar/terminar com variável,
 * sem duas variáveis coladas, até 3 botões de resposta rápida com até 20 caracteres.
 * → errors: [{ path, code, message }]
 */
export function validateTemplate(t) {
  const e = [];
  const err = (path, code, message) => e.push({ path, code, message });
  if (!/^[a-z0-9_]{1,512}$/.test(String(t?.name ?? ""))) err("name", "NAME_INVALID", "Nome com letras minúsculas, números e _");
  if (!TEMPLATE_CATEGORIES.includes(t?.category)) err("category", "CATEGORY_INVALID", "Categoria: UTILITY, MARKETING ou AUTHENTICATION");
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(String(t?.language ?? ""))) err("language", "LANGUAGE_INVALID", "Idioma como pt_BR");
  const body = String(t?.body ?? "");
  if (!body.trim()) err("body", "BODY_REQUIRED", "Escreva a mensagem");
  else if (body.length > 1024) err("body", "BODY_TOO_LONG", "Até 1024 caracteres");
  const vars = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const uniq = [...new Set(vars)].sort((a, b) => a - b);
  if (uniq.some((v, i) => v !== i + 1)) err("body", "VARIABLES_OUT_OF_ORDER", "Variáveis em sequência: {{1}}, {{2}}…");
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*[.!?]?\s*$/.test(body)) err("body", "VARIABLE_AT_EDGE", "A mensagem não pode começar nem terminar com variável");
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) err("body", "VARIABLES_ADJACENT", "Ponha texto entre duas variáveis");
  const buttons = t?.buttons ?? [];
  if (!Array.isArray(buttons) || buttons.length > 3) err("buttons", "TOO_MANY_BUTTONS", "Até 3 botões");
  else buttons.forEach((b, i) => { if (!String(b ?? "").trim() || String(b).length > 20) err(`buttons.${i}`, "BUTTON_INVALID", "Botão com 1 a 20 caracteres"); });
  return e;
}
/** Quantas variáveis o modelo pede. */
export const templateVariableCount = (body) => Math.max(0, ...[...String(body ?? "").matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
/** Preenche o modelo: variables ["Ana", "quinta 09:00"] → texto; faltando/vazia → errors com o índice. */
export function renderTemplate(body, variables = []) {
  const n = templateVariableCount(body), errors = [];
  for (let i = 0; i < n; i++) if (!String(variables[i] ?? "").trim()) errors.push({ path: `template.variables.${i}`, code: "VARIABLE_MISSING", message: `Preencha a variável {{${i + 1}}}` });
  if (variables.length > n) errors.push({ path: "template.variables", code: "TOO_MANY_VARIABLES", message: `O modelo tem ${n} variáveis` });
  if (errors.length) return { ok: false, errors };
  return { ok: true, text: String(body).replace(/\{\{(\d+)\}\}/g, (_, k) => String(variables[Number(k) - 1])) };
}

// ------------------------------------------------------------------ status da mensagem
const RANK = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3 };
/**
 * Status só anda para frente (os provedores mandam fora de ordem): QUEUED → SENT → DELIVERED → READ.
 * FAILED só antes de entregar. Repetido ou para trás → mantém o atual.
 */
export function nextStatus(current, incoming) {
  if (current === "FAILED" || current === incoming) return current;
  if (incoming === "FAILED") return RANK[current] <= RANK.SENT ? "FAILED" : current;
  if (!(incoming in RANK)) return current;
  return RANK[incoming] > RANK[current] ? incoming : current;
}

// ------------------------------------------------------------------ descadastro e respostas rápidas
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ");
export const OPT_OUT_WORDS = ["PARAR", "SAIR", "CANCELAR MENSAGENS", "STOP", "DESCADASTRAR", "NAO QUERO RECEBER"];
export const OPT_IN_WORDS = ["VOLTAR", "START", "QUERO RECEBER"];
/** A mensagem inteira é um pedido para parar/voltar a receber? ("parar." sim; "não vou parar de vir" não) */
export const isOptOut = (text) => OPT_OUT_WORDS.includes(fold(text));
export const isOptIn = (text) => OPT_IN_WORDS.includes(fold(text));
/**
 * Resposta rápida a uma mensagem com opções (botão ou número): options [{ key: "CONFIRM", labels: ["1", "Confirmo"] }].
 * → key ou null. Aceita o payload do botão, o número ou o texto do botão (sem acento/maiúscula).
 */
export function parseQuickReply(input, options) {
  const t = fold(typeof input === "object" ? input?.payload ?? input?.text : input);
  if (!t) return null;
  for (const o of options ?? []) if (fold(o.key) === t || (o.labels ?? []).some((l) => fold(l) === t)) return o.key;
  return null;
}

// ------------------------------------------------------------------ texto longo
/** Quebra em partes de até `max` caracteres, preferindo quebra de linha, depois espaço. */
export function splitText(text, max = 4096) {
  const out = [];
  let rest = String(text ?? "");
  while (rest.length > max) {
    const nl = rest.lastIndexOf("\n", max), sp = rest.lastIndexOf(" ", max);
    let cut = nl >= max * 0.5 ? nl : Math.max(nl, sp);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^[\n ]/, "");
  }
  if (rest.length || !out.length) out.push(rest);
  return out;
}

// ------------------------------------------------------------------ erros e nova tentativa
/** Erros internos (o que a tela e os apps entendem), iguais para todos os drivers. */
export const ERRORS = {
  INVALID_NUMBER: { retry: false, message: "Número inválido" },
  NOT_ON_WHATSAPP: { retry: false, message: "Este número não tem WhatsApp" },
  OUTSIDE_WINDOW: { retry: false, message: "Fora da janela de 24 h: use um modelo aprovado" },
  TEMPLATE_NOT_APPROVED: { retry: false, message: "Modelo não aprovado pelo provedor" },
  RATE_LIMIT: { retry: true, message: "Muitas mensagens: tentando de novo" },
  TEMPORARY: { retry: true, message: "Provedor fora do ar: tentando de novo" },
  AUTH: { retry: false, message: "Conexão expirada: reconecte o WhatsApp" },
  BLOCKED: { retry: false, message: "O cliente bloqueou ou o número foi restrito" },
  UNKNOWN: { retry: true, message: "Erro do provedor" },
};
/**
 * Tradução dos códigos de cada driver para os internos. A tabela da Meta segue a documentação da Cloud API
 * (confira na doc atual ao escrever o driver); a do falso é a que o /rodsaas:verify usa.
 */
export const DRIVER_ERROR_MAP = {
  fake: { FAKE_INVALID: "INVALID_NUMBER", FAKE_NOT_ON_WA: "NOT_ON_WHATSAPP", FAKE_RATE: "RATE_LIMIT", FAKE_DOWN: "TEMPORARY", FAKE_AUTH: "AUTH" },
  meta: { 131026: "NOT_ON_WHATSAPP", 131047: "OUTSIDE_WINDOW", 132001: "TEMPLATE_NOT_APPROVED", 130429: "RATE_LIMIT", 131056: "RATE_LIMIT", 131000: "TEMPORARY", 190: "AUTH", 131031: "BLOCKED", 100: "INVALID_NUMBER" },
};
export function normalizeError(driver, rawCode) {
  const code = DRIVER_ERROR_MAP[driver]?.[rawCode] ?? "UNKNOWN";
  return { code, ...ERRORS[code] };
}
/** Próxima tentativa: erro que repete com espera crescente (30 s, 2 min, 10 min, 30 min, 2 h); o resto falha. */
export function retryDelay(code, attempt) {
  const SCHEDULE = [30, 120, 600, 1800, 7200];
  if (!ERRORS[code]?.retry || attempt > SCHEDULE.length) return null;
  return SCHEDULE[attempt - 1] * 1000;
}

// ------------------------------------------------------------------ webhook
/** Assinatura dos webhooks (HMAC SHA-256 do corpo cru) — formato "sha256=<hex>" (o da Meta). */
export const signWebhook = (secret, rawBody) => "sha256=" + createHmac("sha256", String(secret)).update(String(rawBody)).digest("hex");
export function verifyWebhook(secret, rawBody, header) {
  if (!secret || typeof header !== "string") return false;
  const want = Buffer.from(signWebhook(secret, rawBody)), got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ------------------------------------------------------------------ roteamento do que chega
/**
 * Para qual app vai a mensagem recebida (cada app registra o handler):
 *  1. resposta a uma mensagem nossa (replyTo) → o app que mandou aquela mensagem;
 *  2. conversa com mensagem nossa nas últimas 72 h → o app da última;
 *  3. chamado aberto do mesmo número (Suporte) → helpdesk;
 *  4. a rota padrão da empresa (settings.defaultApp), se o app estiver ligado;
 *  5. ninguém → "inbox" (fica na caixa do WhatsApp para alguém pegar).
 * ctx: { replyToRef?, lastOutbound?: { app, at }, hasOpenTicket, defaultApp, enabledApps, now }
 */
export function routeInbound(ctx) {
  const on = (a) => !!a && (ctx.enabledApps ?? []).includes(a);
  if (ctx.replyToRef && on(ctx.replyToRef.app)) return { app: ctx.replyToRef.app, ref: ctx.replyToRef, reason: "REPLY" };
  if (ctx.lastOutbound && on(ctx.lastOutbound.app) && Date.parse(ctx.now ?? new Date()) - Date.parse(ctx.lastOutbound.at) <= 72 * HOUR) return { app: ctx.lastOutbound.app, ref: ctx.lastOutbound.ref ?? null, reason: "RECENT" };
  if (ctx.hasOpenTicket && on("helpdesk")) return { app: "helpdesk", ref: null, reason: "OPEN_TICKET" };
  if (on(ctx.defaultApp)) return { app: ctx.defaultApp, ref: null, reason: "DEFAULT" };
  return { app: "inbox", ref: null, reason: "UNROUTED" };
}

// ------------------------------------------------------------------ contrato do driver
/** Capacidades que cada driver declara (o motor decide pelo que o driver diz, nunca pelo nome). */
export const DRIVER_CAPABILITIES = ["templates", "freeformAnytime", "media", "buttons", "inbound", "statuses", "readReceipts"];
/** Confere um driver antes de registrar: nome, métodos e capacidades conhecidas. → errors: string[] */
export function validateDriver(d) {
  const e = [];
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(String(d?.id ?? ""))) e.push("id inválido");
  for (const m of ["connect", "send", "parseWebhook", "verifyWebhook"]) if (typeof d?.[m] !== "function") e.push(`falta o método ${m}`);
  for (const k of Object.keys(d?.capabilities ?? {})) if (!DRIVER_CAPABILITIES.includes(k)) e.push(`capacidade desconhecida: ${k}`);
  return e;
}
