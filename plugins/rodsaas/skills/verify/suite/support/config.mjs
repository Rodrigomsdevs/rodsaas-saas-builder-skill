// Configuração da bateria: lê rodsaas.json do projeto testado.
// Sobrescreva com RODSAAS_WEB_URL, RODSAAS_API_URL e MAILPIT_URL se precisar.
// `node support/config.mjs` imprime a configuração em JSON (usado pelo run.sh).

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(process.env.RODSAAS_PROJECT_DIR ?? process.cwd());

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const trim = (u) => String(u).replace(/\/+$/, "");

const rs = readJson(join(projectDir, "rodsaas.json")) ?? {};

/** Lê uma variável do api/.env do projeto (ex.: RESEND_WEBHOOK_SECRET, para assinar webhooks de teste). */
function apiEnv(key) {
  for (const f of ["api/.env", ".env"]) {
    const p = join(projectDir, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*)$`, "m"));
    if (m) return m[1].trim().replace(/^(['"])(.*)\1$/, "$2") || null;
  }
  return null;
}

function mailpitFromCompose() {
  for (const f of ["api/docker-compose.yml", "api/docker-compose.yaml", "api/compose.yml", "docker-compose.yml", "compose.yml"]) {
    const p = join(projectDir, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/["']?(?:[\d.]+:)?(\d{2,5}):8025["']?/);
    if (m) return `http://localhost:${m[1]}`;
  }
  return null;
}

export const cfg = {
  projectDir,
  hasRodsaasJson: Object.keys(rs).length > 0,
  webURL: trim(process.env.RODSAAS_WEB_URL ?? rs.domains?.app ?? `http://localhost:${rs.ports?.web ?? 3000}`),
  apiURL: trim(process.env.RODSAAS_API_URL ?? rs.domains?.api ?? `http://localhost:${rs.ports?.api ?? 3333}`),
  mailpitURL: trim(process.env.MAILPIT_URL ?? mailpitFromCompose() ?? "http://localhost:8025"),
  presets: rs.presets ?? [],
  addons: rs.addons ?? [],
  billingModel: rs.billing?.model ?? "plans",
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? apiEnv("RESEND_WEBHOOK_SECRET"),
  apps: Array.isArray(rs.apps) ? rs.apps : null,
  productName: rs.product?.name ?? null,
  reportDir: join(projectDir, "rodsaas-verify-report"),
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ ...cfg, resendWebhookSecret: cfg.resendWebhookSecret ? "***" : null }));
}
