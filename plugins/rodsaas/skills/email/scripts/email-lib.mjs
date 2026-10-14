// rodsaas · email — regras puras do e-mail com Resend (sem rede).
// Endereços ("Nome <a@b>"), validação do .env, escolha do driver, corpo da chamada ao Resend, decisão de
// nova tentativa (429/5xx com retry-after), assinatura dos webhooks (formato Svix, para testes e mocks),
// classificação dos eventos (supressão, entrega), roteamento dos e-mails recebidos, proteção contra loop
// e normalização do e-mail recebido para o formato que os apps consomem.
// Porte para TypeScript em api/src/lib/email/ junto com os testes de email-lib.test.mjs.
// Em produção a verificação da assinatura usa a lib `svix` (ou resend.webhooks.verify); signSvix/verifySvix
// daqui servem para os testes e para entender o formato. Rode: node --test email-lib.test.mjs

import { createHmac, timingSafeEqual } from "node:crypto";

// ------------------------------------------------------------------ endereços

const ADDR_RE = /^[^\s@<>()",;:]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
export const isEmail = (s) => ADDR_RE.test(String(s ?? "").trim());

/** "Nome <a@b.com>" | "a@b.com" | "\"Nome, Sobrenome\" <a@b>" → { name, address } (address em minúsculas) ou null. */
export function parseAddress(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(?:"?([^"<]*?)"?\s*)?<([^<>\s]+)>$/);
  const address = (m ? m[2] : s).trim().toLowerCase();
  if (!isEmail(address)) return null;
  const name = m && m[1] ? m[1].trim() : "";
  return { name, address };
}

/** { name, address } → "Nome <a@b>" (com aspas se o nome tiver vírgula, ponto e vírgula ou aspas). */
export function formatAddress({ name, address }) {
  if (!name) return address;
  const safe = /[",;<>@()]/.test(name) ? `"${name.replace(/["\\]/g, "")}"` : name;
  return `${safe} <${address}>`;
}

export const domainOf = (address) => String(address ?? "").split("@")[1]?.toLowerCase() ?? "";
/** O endereço é do domínio verificado (ou de um subdomínio dele)? */
export const isOwnDomain = (address, domain) => { const d = domainOf(address), base = String(domain ?? "").toLowerCase(); return !!base && (d === base || d.endsWith("." + base)); };

/** "rodrigo@exemplo.com" → "r***@exemplo.com" (para telas públicas e logs). */
export function maskEmail(address) {
  const [user, dom] = String(address ?? "").split("@");
  if (!user || !dom) return "";
  return `${user.slice(0, 1)}***@${dom}`;
}

// ------------------------------------------------------------------ .env

const DOMAIN_RE = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Driver de envio: MAIL_DRIVER explícito; sem ele, "resend" quando há RESEND_API_KEY e "smtp" (Mailpit) quando não há.
 * Em produção, smtp apontando para localhost é recusado (e-mail sumiria).
 */
export function resolveDriver(env) {
  const d = String(env.MAIL_DRIVER ?? "").trim().toLowerCase();
  if (d) return d;
  return String(env.RESEND_API_KEY ?? "").trim() ? "resend" : "smtp";
}

/**
 * Valida as variáveis de e-mail. Devolve { config, errors }.
 * config: { driver, domain, from, replyTo, support, supportName, webhookSecret, forwardTo, apiKey, smtp }
 */
export function validateEmailEnv(env) {
  const errors = [];
  const get = (k) => (env[k] == null ? "" : String(env[k]).trim());
  const driver = resolveDriver(env);
  if (!["smtp", "resend"].includes(driver)) errors.push({ key: "MAIL_DRIVER", message: "Use smtp ou resend" });
  const domain = get("RESEND_DOMAIN").toLowerCase();
  const addr = (k, required) => {
    const raw = get(k);
    if (!raw) { if (required) errors.push({ key: k, message: "Obrigatório" }); return null; }
    if (/[;]\s*$/.test(raw)) { errors.push({ key: k, message: "Tire o ponto e vírgula do fim da linha" }); return null; }
    const a = parseAddress(raw);
    if (!a) { errors.push({ key: k, message: 'Use "Nome <email@dominio>" ou email@dominio' }); return null; }
    return a;
  };
  const isResend = driver === "resend";
  if (isResend || domain) {
    if (!domain) errors.push({ key: "RESEND_DOMAIN", message: "Obrigatório com o Resend (domínio verificado no painel do Resend)" });
    else if (/;/.test(domain) || !DOMAIN_RE.test(domain)) errors.push({ key: "RESEND_DOMAIN", message: "Domínio inválido (só o domínio, ex.: meusaas.com.br, sem aspas sobrando nem ponto e vírgula)" });
  }
  const from = addr("RESEND_FROM", isResend) ?? (get("MAIL_FROM") ? parseAddress(get("MAIL_FROM")) : null);
  const replyTo = addr("RESEND_REPLY_TO", false);
  const support = addr("RESEND_SUPPORT_EMAIL", false);
  const forwardTo = addr("RESEND_INBOUND_FORWARD_TO", false);
  if (!from && !isResend) errors.push({ key: "RESEND_FROM", message: "Defina RESEND_FROM (ou MAIL_FROM, nome antigo)" });
  if (isResend && domain && from && !isOwnDomain(from.address, domain)) errors.push({ key: "RESEND_FROM", message: `O remetente precisa ser do domínio verificado (${domain})` });
  if (forwardTo && domain && isOwnDomain(forwardTo.address, domain)) errors.push({ key: "RESEND_INBOUND_FORWARD_TO", message: "Use uma caixa de fora do domínio do Resend (senão o e-mail volta para cá em loop)" });
  const apiKey = get("RESEND_API_KEY");
  if (isResend && !/^re_[A-Za-z0-9_]{8,}$/.test(apiKey)) errors.push({ key: "RESEND_API_KEY", message: "Chave do Resend (começa com re_)" });
  const webhookSecret = get("RESEND_WEBHOOK_SECRET");
  if (webhookSecret && !/^whsec_[A-Za-z0-9+/=]{16,}$/.test(webhookSecret)) errors.push({ key: "RESEND_WEBHOOK_SECRET", message: "Segredo do webhook (começa com whsec_)" });
  if (isResend && env.NODE_ENV === "production" && !webhookSecret) errors.push({ key: "RESEND_WEBHOOK_SECRET", message: "Obrigatório em produção (crie o webhook com npm run email:setup)" });
  const smtpHost = get("SMTP_HOST");
  if (driver === "smtp" && env.NODE_ENV === "production" && (!smtpHost || /^(localhost|127\.0\.0\.1)$/.test(smtpHost))) errors.push({ key: "MAIL_DRIVER", message: "Em produção use o Resend (MAIL_DRIVER=resend) ou um SMTP real" });
  return {
    errors,
    config: {
      driver, domain: domain || null, from, replyTo, support,
      supportName: get("RESEND_SUPPORT_NAME") || support?.name || from?.name || "",
      webhookSecret: webhookSecret || null, forwardTo, apiKey: apiKey || null,
      smtp: { host: smtpHost || "localhost", port: Number(get("SMTP_PORT") || 1025), user: get("SMTP_USER") || null, pass: get("SMTP_PASS") || null },
    },
  };
}

// ------------------------------------------------------------------ envio

const TAG_RE = /[^A-Za-z0-9_-]/g;
/** Tags do Resend: só letras ASCII, números, _ e -, até 256. */
export const sanitizeTag = (s) => String(s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(TAG_RE, "_").slice(0, 256);

/**
 * Corpo do POST https://api.resend.com/emails a partir da mensagem do Mailer.
 * mail: { to, subject, html, text, from?, replyTo?, cc?, bcc?, headers?, tags?: {nome: valor}, attachments?: [{ filename, content(Buffer|base64), contentType, contentId }] }
 */
export function toResendPayload(mail, config) {
  const list = (v) => (v == null ? undefined : (Array.isArray(v) ? v : [v]).map((x) => (typeof x === "string" ? x : formatAddress(x))));
  const from = mail.from ? (typeof mail.from === "string" ? mail.from : formatAddress(mail.from)) : formatAddress(config.from);
  const replyTo = mail.replyTo ?? (config.replyTo ? formatAddress(config.replyTo) : undefined);
  const body = {
    from,
    to: list(mail.to),
    subject: String(mail.subject ?? "").replace(/[\r\n]+/g, " ").slice(0, 998),
    html: mail.html,
    text: mail.text,
  };
  if (mail.cc) body.cc = list(mail.cc);
  if (mail.bcc) body.bcc = list(mail.bcc);
  if (replyTo) body.reply_to = list(replyTo);
  if (mail.headers && Object.keys(mail.headers).length) body.headers = mail.headers;
  if (mail.tags) body.tags = Object.entries(mail.tags).map(([name, value]) => ({ name: sanitizeTag(name), value: sanitizeTag(value) }));
  if (mail.attachments?.length) body.attachments = mail.attachments.map((a) => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
    ...(a.contentType ? { content_type: a.contentType } : {}),
    ...(a.contentId ? { content_id: a.contentId } : {}),
  }));
  return body;
}

/** Erros que não adianta repetir (dados errados): 400, 401, 403, 404, 422. 429 e 5xx repetem. */
export function retryDecision({ status, retryAfter = null, attempt = 1, maxAttempts = 5 }) {
  if (status >= 200 && status < 300) return { retry: false, ok: true };
  if (attempt >= maxAttempts) return { retry: false, ok: false, reason: "max_attempts" };
  if (status === 429) {
    const s = Number(retryAfter);
    return { retry: true, delayMs: (Number.isFinite(s) && s > 0 ? s : 1) * 1000 };
  }
  if (status >= 500 || status === 0) return { retry: true, delayMs: Math.min(60_000, 2 ** attempt * 1000) };
  return { retry: false, ok: false, reason: "client_error" };
}

/** Chave de idempotência do envio (o mesmo job repetido não manda duas vezes; o Resend guarda 24 h, até 256 caracteres). */
export const idempotencyKeyFor = (jobId, recipientIndex = 0) => `rodsaas-${jobId}-${recipientIndex}`.slice(0, 256);

/** Separa destinatários suprimidos (devolução definitiva, reclamação de spam) dos que podem receber. */
export function filterSuppressed(recipients, suppressed) {
  const set = suppressed instanceof Set ? suppressed : new Set(suppressed);
  const keep = [], dropped = [];
  for (const r of recipients) { const a = parseAddress(r)?.address; (a && set.has(a) ? dropped : keep).push(r); }
  return { keep, dropped };
}

// ------------------------------------------------------------------ webhooks (formato Svix)

const secretBytes = (secret) => Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");

/** Cabeçalhos svix-* válidos para um corpo (testes, mocks e o `/rodsaas:verify`). */
export function signSvix(secret, { id, timestamp = Math.floor(Date.now() / 1000), body }) {
  const sig = createHmac("sha256", secretBytes(secret)).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${sig}` };
}

/**
 * Confere a assinatura como a lib `svix` faz: HMAC-SHA256 de "id.timestamp.corpo cru", qualquer uma das
 * assinaturas "v1,..." do cabeçalho, e o horário dentro de ±5 min (contra reenvio de evento capturado).
 * Devolve { ok: true } ou { ok: false, reason }.
 */
export function verifySvix(secret, headers, rawBody, { now = Date.now(), toleranceSec = 300 } = {}) {
  const h = Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]));
  const id = h["svix-id"], ts = h["svix-timestamp"], sigs = h["svix-signature"];
  if (!id || !ts || !sigs) return { ok: false, reason: "missing_headers" };
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSec) return { ok: false, reason: "timestamp" };
  const want = Buffer.from(createHmac("sha256", secretBytes(secret)).update(`${id}.${ts}.${rawBody}`).digest("base64"));
  for (const part of String(sigs).split(" ")) {
    const [v, s] = part.split(",");
    if (v !== "v1" || !s) continue;
    const got = Buffer.from(s);
    if (got.length === want.length && timingSafeEqual(got, want)) return { ok: true };
  }
  return { ok: false, reason: "signature" };
}

/**
 * O que fazer com cada evento do Resend:
 * suppress (devolução definitiva, reclamação de spam, suprimido pelo Resend), delivered, delayed, failed,
 * received (e-mail que chegou), ignore (o resto: aberto, clicado, contatos…).
 */
export function classifyEvent(event) {
  const type = event?.type ?? "";
  const d = event?.data ?? {};
  const to = (Array.isArray(d.to) ? d.to : d.to ? [d.to] : []).map((x) => parseAddress(x)?.address).filter(Boolean);
  switch (type) {
    case "email.bounced":
      return String(d.bounce?.type ?? "").toLowerCase() === "permanent"
        ? { action: "suppress", reason: "bounce", detail: d.bounce?.subType ?? null, emailId: d.email_id, addresses: to }
        : { action: "delayed", reason: "soft_bounce", detail: d.bounce?.subType ?? null, emailId: d.email_id, addresses: to };
    case "email.complained": return { action: "suppress", reason: "complaint", emailId: d.email_id, addresses: to };
    case "email.suppressed": return { action: "suppress", reason: "provider", emailId: d.email_id, addresses: to };
    case "email.delivered": return { action: "delivered", emailId: d.email_id, addresses: to };
    case "email.delivery_delayed": return { action: "delayed", emailId: d.email_id, addresses: to };
    case "email.failed": return { action: "failed", emailId: d.email_id, addresses: to, detail: d.failed?.reason ?? null };
    case "email.received": return { action: "received", emailId: d.email_id, addresses: to };
    default: return { action: "ignore" };
  }
}

/** Eventos que o webhook do projeto assina (o `npm run email:setup` cria com esta lista). */
export const WEBHOOK_EVENTS = ["email.received", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.failed", "email.suppressed"];

// ------------------------------------------------------------------ recebimento

const RESERVED_LOCAL = new Set(["no-reply", "noreply", "postmaster", "abuse", "mailer-daemon", "admin", "root", "hostmaster", "webmaster", "security", "billing", "suporte", "support", "contato", "financeiro"]);
/** Parte local que não pode virar endereço de empresa (helpdesk, etc.). */
export const isReservedLocalPart = (local) => RESERVED_LOCAL.has(String(local ?? "").toLowerCase());

/**
 * Para quem o e-mail recebido vai, na ordem: cada destinatário (to, cc e received_for) é testado contra os
 * handlers; o primeiro que casar leva. handler: { id, match: (address, { local, plus, domain }) => boolean | ctx }.
 * Endereço com "+": "suporte+acme@x" casa com o handler de "suporte@x" e entrega plus = "acme".
 * Devolve { handlerId, address, ctx } ou null (ninguém pegou → encaminhar/registrar).
 */
export function routeInbound(recipients, handlers) {
  const seen = new Set();
  for (const raw of recipients) {
    const a = parseAddress(raw)?.address;
    if (!a || seen.has(a)) continue;
    seen.add(a);
    const [localFull, domain] = a.split("@");
    const [local, plus = null] = localFull.split("+");
    for (const h of handlers) {
      const r = h.match(`${local}@${domain}`, { local, plus, domain, original: a });
      if (r) return { handlerId: h.id, address: a, ctx: r === true ? {} : r };
    }
  }
  return null;
}

/** Cabeçalhos em minúsculas, um valor por nome (o primeiro). Aceita objeto ou lista [{ name, value }]. */
export function normalizeHeaders(h) {
  const out = {};
  if (Array.isArray(h)) { for (const x of h) { const k = String(x?.name ?? "").toLowerCase(); if (k && !(k in out)) out[k] = String(x.value ?? ""); } return out; }
  for (const [k, v] of Object.entries(h ?? {})) { const key = k.toLowerCase(); if (!(key in out)) out[key] = Array.isArray(v) ? String(v[0] ?? "") : String(v ?? ""); }
  return out;
}

/** "<a@x> <b@y>" → ["<a@x>", "<b@y>"] */
export const parseMessageIds = (s) => String(s ?? "").match(/<[^<>\s]+>/g) ?? [];

/**
 * E-mail recebido (resposta de GET /emails/receiving/{id}) → formato normalizado que os apps consomem
 * (o mesmo `ingestEmail` do helpdesk recebe isto, venha do Resend, do IMAP ou de outro provedor).
 */
export function normalizeReceived(r) {
  const headers = normalizeHeaders(r.headers);
  const addrs = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(parseAddress).filter(Boolean);
  return {
    provider: "resend",
    providerId: r.id,
    messageId: r.message_id ?? headers["message-id"] ?? null,
    inReplyTo: parseMessageIds(headers["in-reply-to"])[0] ?? null,
    references: parseMessageIds(headers["references"]),
    from: addrs(r.from)[0] ?? null,
    to: addrs(r.to),
    cc: addrs(r.cc),
    replyTo: addrs(r.reply_to),
    receivedFor: addrs(r.received_for),
    subject: String(r.subject ?? ""),
    text: r.text ?? "",
    html: r.html ?? "",
    headers,
    authentication: r.authentication ?? null,
    attachments: (r.attachments ?? []).map((a) => ({ id: a.id, filename: a.filename, contentType: a.content_type, size: a.size ?? null, inline: a.content_disposition === "inline", contentId: a.content_id ?? null })),
    rawUrl: r.raw?.download_url ?? null,
    receivedAt: r.created_at ?? null,
  };
}

/** Resposta automática, devolução ou lista (nunca responder nem encaminhar de volta). */
export function isAutomated(msg) {
  const h = msg.headers ?? {};
  const auto = (h["auto-submitted"] ?? "").toLowerCase();
  if (auto && auto !== "no") return true;
  if (h["x-autoreply"] || h["x-autorespond"] || /^(auto_reply|bulk|junk|list)$/i.test(h["precedence"] ?? "")) return true;
  if (h["list-id"] || h["list-unsubscribe"]) return true;
  const from = msg.from?.address ?? "";
  if (/^(mailer-daemon|postmaster)@/i.test(from)) return true;
  return false;
}

/**
 * Encaminhar e-mail que ninguém pegou para RESEND_INBOUND_FORWARD_TO? Só se houver destino, o remetente não for
 * do nosso domínio (evita loop), não for automático e não tiver passado por aqui antes (cabeçalho X-Rodsaas-Forwarded).
 */
export function shouldForward(msg, { forwardTo, domain }) {
  if (!forwardTo) return { forward: false, reason: "no_destination" };
  if (msg.from && isOwnDomain(msg.from.address, domain)) return { forward: false, reason: "own_domain" };
  if (isAutomated(msg)) return { forward: false, reason: "automated" };
  if (msg.headers?.["x-rodsaas-forwarded"]) return { forward: false, reason: "already_forwarded" };
  return { forward: true };
}

/** Mensagem de encaminhamento (sai pelo Mailer com Reply-To do remetente original). */
export function forwardMessage(msg, { forwardTo, from }) {
  const who = msg.from ? formatAddress(msg.from) : "remetente desconhecido";
  const intro = `Encaminhado automaticamente · De: ${who} · Para: ${msg.to.map((a) => a.address).join(", ")}`;
  return {
    to: formatAddress(forwardTo),
    from,
    replyTo: msg.from ? formatAddress(msg.from) : undefined,
    subject: `Fwd: ${msg.subject}`.slice(0, 998),
    text: `${intro}\n\n${msg.text || "(sem texto; veja a versão HTML)"}`,
    html: msg.html ? `<p style="color:#666;font-size:12px">${escapeHtml(intro)}</p>${msg.html}` : undefined,
    headers: { "X-Rodsaas-Forwarded": "1", "Auto-Submitted": "auto-forwarded" },
  };
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
