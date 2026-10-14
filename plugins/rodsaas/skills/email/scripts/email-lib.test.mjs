import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./email-lib.mjs";

const SECRET = "whsec_" + Buffer.from("segredo-de-teste-com-32-bytes!!!").toString("base64");
const ENV = {
  NODE_ENV: "production",
  MAIL_DRIVER: "",
  RESEND_API_KEY: "re_123456789_abcdef",
  RESEND_DOMAIN: "mock-lab.dev",
  RESEND_FROM: "Rodsaas Claude <no-reply@mock-lab.dev>",
  RESEND_REPLY_TO: "Rodsaas Claude <support@mock-lab.dev>",
  RESEND_SUPPORT_EMAIL: "Rodsaas Claude <support@mock-lab.dev>",
  RESEND_SUPPORT_NAME: "Rodsaas Claude",
  RESEND_WEBHOOK_SECRET: SECRET,
};

test("parseAddress e formatAddress", () => {
  assert.deepEqual(E.parseAddress("Rodsaas Claude <No-Reply@Mock-Lab.dev>"), { name: "Rodsaas Claude", address: "no-reply@mock-lab.dev" });
  assert.deepEqual(E.parseAddress("a@b.com"), { name: "", address: "a@b.com" });
  assert.deepEqual(E.parseAddress('"Silva, Ana" <ana@x.com.br>'), { name: "Silva, Ana", address: "ana@x.com.br" });
  assert.equal(E.parseAddress("sem arroba"), null);
  assert.equal(E.parseAddress("<a@b>"), null, "domínio sem ponto");
  assert.equal(E.formatAddress({ name: "Silva, Ana", address: "ana@x.com" }), '"Silva, Ana" <ana@x.com>');
  assert.equal(E.formatAddress({ name: "", address: "a@b.com" }), "a@b.com");
  assert.equal(E.maskEmail("rodrigo@exemplo.com"), "r***@exemplo.com");
  assert.ok(E.isOwnDomain("x@mock-lab.dev", "mock-lab.dev"));
  assert.ok(E.isOwnDomain("x@suporte.mock-lab.dev", "mock-lab.dev"));
  assert.ok(!E.isOwnDomain("x@notmock-lab.dev", "mock-lab.dev"));
});

test("resolveDriver: explícito, ou resend com chave, ou smtp", () => {
  assert.equal(E.resolveDriver({ RESEND_API_KEY: "re_x" }), "resend");
  assert.equal(E.resolveDriver({ RESEND_API_KEY: "" }), "smtp");
  assert.equal(E.resolveDriver({ RESEND_API_KEY: "re_x", MAIL_DRIVER: "smtp" }), "smtp", "dev com chave preenchida pode forçar o Mailpit");
});

test("validateEmailEnv: .env do Resend certo passa e monta a config", () => {
  const { errors, config } = E.validateEmailEnv(ENV);
  assert.deepEqual(errors, []);
  assert.equal(config.driver, "resend");
  assert.equal(config.from.address, "no-reply@mock-lab.dev");
  assert.equal(config.replyTo.address, "support@mock-lab.dev");
  assert.equal(config.supportName, "Rodsaas Claude");
});

test("validateEmailEnv: erros comuns", () => {
  const keys = (env) => E.validateEmailEnv({ ...ENV, ...env }).errors.map((e) => e.key);
  assert.ok(keys({ RESEND_DOMAIN: '"mock-lab.dev";' }).includes("RESEND_DOMAIN"), "ponto e vírgula/aspas sobrando");
  assert.ok(keys({ RESEND_FROM: "Rodsaas <no-reply@outro.com>" }).includes("RESEND_FROM"), "remetente fora do domínio verificado");
  assert.ok(keys({ RESEND_API_KEY: "chave" , MAIL_DRIVER: "resend" }).includes("RESEND_API_KEY"));
  assert.ok(keys({ RESEND_WEBHOOK_SECRET: "" }).includes("RESEND_WEBHOOK_SECRET"), "webhook obrigatório em produção");
  assert.ok(keys({ RESEND_WEBHOOK_SECRET: "abc" }).includes("RESEND_WEBHOOK_SECRET"));
  assert.ok(keys({ RESEND_INBOUND_FORWARD_TO: "eu@mock-lab.dev" }).includes("RESEND_INBOUND_FORWARD_TO"), "encaminhar para o próprio domínio = loop");
  assert.ok(keys({ RESEND_API_KEY: "", MAIL_DRIVER: "", SMTP_HOST: "localhost" }).includes("MAIL_DRIVER"), "produção com Mailpit");
  const dev = E.validateEmailEnv({ NODE_ENV: "development", MAIL_FROM: "Produto <no-reply@produto.dev>" });
  assert.deepEqual(dev.errors, [], "dev sem Resend: Mailpit com MAIL_FROM antigo");
  assert.equal(dev.config.driver, "smtp");
});

test("toResendPayload: remetente e resposta padrão, cabeçalhos, tags e anexos", () => {
  const { config } = E.validateEmailEnv(ENV);
  const p = E.toResendPayload({ to: "ana@x.com", subject: "Oi\r\nBcc: x@y", html: "<p>oi</p>", text: "oi", headers: { "List-Unsubscribe": "<https://x>" }, tags: { tipo: "notificação", org: "a b" }, attachments: [{ filename: "a.txt", content: Buffer.from("oi"), contentType: "text/plain" }] }, config);
  assert.equal(p.from, "Rodsaas Claude <no-reply@mock-lab.dev>");
  assert.deepEqual(p.reply_to, ["Rodsaas Claude <support@mock-lab.dev>"]);
  assert.deepEqual(p.to, ["ana@x.com"]);
  assert.equal(p.subject, "Oi Bcc: x@y", "quebra de linha no assunto não injeta cabeçalho");
  assert.deepEqual(p.headers, { "List-Unsubscribe": "<https://x>" });
  assert.deepEqual(p.tags, [{ name: "tipo", value: "notificacao" }, { name: "org", value: "a_b" }]);
  assert.deepEqual(p.attachments, [{ filename: "a.txt", content: Buffer.from("oi").toString("base64"), content_type: "text/plain" }]);
  const custom = E.toResendPayload({ to: ["a@x.com"], from: { name: "Acme Suporte", address: "no-reply@mock-lab.dev" }, replyTo: "acme@mock-lab.dev", subject: "s", html: "h" }, config);
  assert.equal(custom.from, "Acme Suporte <no-reply@mock-lab.dev>");
  assert.deepEqual(custom.reply_to, ["acme@mock-lab.dev"]);
});

test("retryDecision: 429 respeita retry-after, 5xx com espera crescente, 4xx não repete", () => {
  assert.deepEqual(E.retryDecision({ status: 200 }), { retry: false, ok: true });
  assert.deepEqual(E.retryDecision({ status: 429, retryAfter: "3" }), { retry: true, delayMs: 3000 });
  assert.deepEqual(E.retryDecision({ status: 503, attempt: 2 }), { retry: true, delayMs: 4000 });
  assert.equal(E.retryDecision({ status: 422 }).retry, false);
  assert.equal(E.retryDecision({ status: 500, attempt: 5 }).reason, "max_attempts");
  assert.equal(E.idempotencyKeyFor("job-1", 2), "rodsaas-job-1-2");
});

test("filterSuppressed", () => {
  const r = E.filterSuppressed(["Ana <ANA@x.com>", "bia@x.com"], new Set(["ana@x.com"]));
  assert.deepEqual(r.keep, ["bia@x.com"]);
  assert.deepEqual(r.dropped, ["Ana <ANA@x.com>"]);
});

test("signSvix + verifySvix: válido, adulterado, sem cabeçalho, fora do horário, várias assinaturas", () => {
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "e1" } });
  const now = Date.parse("2026-10-13T12:00:00Z");
  const h = E.signSvix(SECRET, { id: "msg_1", timestamp: now / 1000, body });
  assert.deepEqual(E.verifySvix(SECRET, h, body, { now }), { ok: true });
  assert.equal(E.verifySvix(SECRET, h, body + " ", { now }).reason, "signature", "corpo re-serializado quebra a assinatura");
  assert.equal(E.verifySvix(SECRET, { ...h, "svix-id": "msg_2" }, body, { now }).reason, "signature");
  assert.equal(E.verifySvix(SECRET, {}, body, { now }).reason, "missing_headers");
  assert.equal(E.verifySvix(SECRET, h, body, { now: now + 6 * 60_000 }).reason, "timestamp", "reenvio depois de 5 min");
  const other = E.signSvix("whsec_" + Buffer.from("outro-segredo-qualquer-32-bytes!").toString("base64"), { id: "msg_1", timestamp: now / 1000, body });
  assert.equal(E.verifySvix(SECRET, other, body, { now }).reason, "signature");
  assert.deepEqual(E.verifySvix(SECRET, { ...h, "svix-signature": `v1,AAAA ${h["svix-signature"]}` }, body, { now }), { ok: true }, "rotação de segredo manda duas");
  assert.deepEqual(E.verifySvix(SECRET, { "Svix-Id": h["svix-id"], "Svix-Timestamp": h["svix-timestamp"], "Svix-Signature": h["svix-signature"] }, body, { now }), { ok: true }, "cabeçalho em qualquer caixa");
});

test("classifyEvent: devolução definitiva e reclamação suprimem; temporária não", () => {
  assert.deepEqual(E.classifyEvent({ type: "email.bounced", data: { email_id: "e", to: ["Ana <ana@x.com>"], bounce: { type: "Permanent", subType: "General" } } }), { action: "suppress", reason: "bounce", detail: "General", emailId: "e", addresses: ["ana@x.com"] });
  assert.equal(E.classifyEvent({ type: "email.bounced", data: { to: ["a@x.com"], bounce: { type: "Temporary" } } }).action, "delayed");
  assert.equal(E.classifyEvent({ type: "email.complained", data: { to: ["a@x.com"] } }).action, "suppress");
  assert.equal(E.classifyEvent({ type: "email.suppressed", data: { to: ["a@x.com"] } }).reason, "provider");
  assert.equal(E.classifyEvent({ type: "email.delivered", data: { to: ["a@x.com"] } }).action, "delivered");
  assert.equal(E.classifyEvent({ type: "email.failed", data: { to: ["a@x.com"], failed: { reason: "x" } } }).detail, "x");
  assert.equal(E.classifyEvent({ type: "email.received", data: { email_id: "r1", to: ["s@x.com"] } }).action, "received");
  assert.equal(E.classifyEvent({ type: "email.opened", data: {} }).action, "ignore");
  assert.equal(E.classifyEvent({}).action, "ignore");
  assert.ok(E.WEBHOOK_EVENTS.includes("email.received") && E.WEBHOOK_EVENTS.includes("email.bounced"));
});

test("routeInbound: endereço exato, com +, received_for e ninguém", () => {
  const handlers = [
    { id: "helpdesk", match: (a, { local, domain }) => domain === "mock-lab.dev" && local === "acme" && { orgId: "o1" } },
    { id: "support", match: (a) => a === "support@mock-lab.dev" },
  ];
  assert.deepEqual(E.routeInbound(["Fulano <ACME@mock-lab.dev>"], handlers), { handlerId: "helpdesk", address: "acme@mock-lab.dev", ctx: { orgId: "o1" } });
  assert.deepEqual(E.routeInbound(["x@outro.com", "support+urgente@mock-lab.dev"], handlers), { handlerId: "support", address: "support+urgente@mock-lab.dev", ctx: {} });
  assert.equal(E.routeInbound(["ninguem@mock-lab.dev"], handlers), null);
  assert.ok(E.isReservedLocalPart("no-reply") && E.isReservedLocalPart("Support") && !E.isReservedLocalPart("acme"));
});

test("normalizeReceived: resposta do GET /emails/receiving/{id}", () => {
  const n = E.normalizeReceived({
    object: "email", id: "r1", to: ["acme@mock-lab.dev"], from: "Cliente <cli@gmail.com>", created_at: "2026-10-13T12:00:00Z",
    subject: "Re: [#12] Problema", html: "<p>oi</p>", text: "oi", headers: { "Message-ID": "<m2@gmail.com>", "In-Reply-To": "<m1@mock-lab.dev>", References: "<m0@mock-lab.dev> <m1@mock-lab.dev>" },
    cc: ["Outro <o@x.com>"], bcc: [], reply_to: [], received_for: ["acme@mock-lab.dev"], message_id: "<m2@gmail.com>",
    authentication: { spf: "pass", dkim: "pass", dmarc: "pass" }, raw: { download_url: "https://r/raw", expires_at: "x" },
    attachments: [{ id: "a1", filename: "print.png", content_type: "image/png", content_disposition: "inline", content_id: "img1", size: 10 }],
  });
  assert.equal(n.messageId, "<m2@gmail.com>");
  assert.equal(n.inReplyTo, "<m1@mock-lab.dev>");
  assert.deepEqual(n.references, ["<m0@mock-lab.dev>", "<m1@mock-lab.dev>"]);
  assert.deepEqual(n.from, { name: "Cliente", address: "cli@gmail.com" });
  assert.equal(n.cc[0].address, "o@x.com");
  assert.equal(n.headers["message-id"], "<m2@gmail.com>");
  assert.deepEqual(n.attachments[0], { id: "a1", filename: "print.png", contentType: "image/png", size: 10, inline: true, contentId: "img1" });
  assert.equal(n.rawUrl, "https://r/raw");
  assert.deepEqual(E.normalizeHeaders([{ name: "X-A", value: "1" }, { name: "x-a", value: "2" }]), { "x-a": "1" });
});

test("isAutomated e shouldForward: sem loop", () => {
  const base = { from: { name: "", address: "cli@gmail.com" }, to: [{ address: "contato@mock-lab.dev" }], subject: "Oi", text: "oi", html: "", headers: {} };
  const cfg = { forwardTo: { name: "Rodrigo", address: "rodrigo@gmail.com" }, domain: "mock-lab.dev" };
  assert.deepEqual(E.shouldForward(base, cfg), { forward: true });
  assert.equal(E.shouldForward(base, { ...cfg, forwardTo: null }).reason, "no_destination");
  assert.equal(E.shouldForward({ ...base, from: { address: "no-reply@mock-lab.dev" } }, cfg).reason, "own_domain");
  assert.equal(E.shouldForward({ ...base, headers: { "auto-submitted": "auto-replied" } }, cfg).reason, "automated");
  assert.equal(E.shouldForward({ ...base, headers: { precedence: "bulk" } }, cfg).reason, "automated");
  assert.equal(E.shouldForward({ ...base, from: { address: "MAILER-DAEMON@gmail.com" } }, cfg).reason, "automated");
  assert.equal(E.shouldForward({ ...base, headers: { "x-rodsaas-forwarded": "1" } }, cfg).reason, "already_forwarded");
  assert.equal(E.isAutomated({ ...base, headers: { "auto-submitted": "no" } }), false);
  const f = E.forwardMessage({ ...base, html: "<p>oi</p>" }, { forwardTo: cfg.forwardTo, from: "Rodsaas <no-reply@mock-lab.dev>" });
  assert.equal(f.to, "Rodrigo <rodrigo@gmail.com>");
  assert.equal(f.replyTo, "cli@gmail.com", "responder vai direto para o cliente");
  assert.equal(f.subject, "Fwd: Oi");
  assert.equal(f.headers["X-Rodsaas-Forwarded"], "1");
  assert.ok(f.html.startsWith('<p style="color:#666;font-size:12px">Encaminhado'));
});
