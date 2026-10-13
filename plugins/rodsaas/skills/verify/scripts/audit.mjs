#!/usr/bin/env node
// rodsaas · audita se um projeto segue o contrato testável (data-testid, rotas e API).
//
// Uso: node audit.mjs [pasta-do-projeto]
// Saída: o que falta, em português. Código 0 = tudo presente, 1 = pendências.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(here, "..", "contract.json"), "utf8"));
const projectDir = resolve(process.argv[2] ?? process.cwd());
const webSrc = ["web/src", "web/app", "web"].map((p) => join(projectDir, p)).find((p) => existsSync(p));

if (!webSrc) {
  console.log(`✗ não achei o frontend em ${projectDir}/web`);
  process.exit(1);
}

// ------------------------------------------------------------------ varrer o front
const SKIP = new Set(["node_modules", ".next", "dist", "build", ".turbo", "coverage", "rodsaas-verify-report"]);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk(webSrc);
const source = files.map((f) => readFileSync(f, "utf8")).join("\n");

// testids literais em data-testid="x", data-testid={'x'}, testId="x", "data-testid": "x", testid: 'x'
const found = new Set();
for (const m of source.matchAll(/(?:data-testid|testId|testid|"data-testid")\s*[=:]\s*\{?\s*["'`]([A-Za-z0-9_-]+)["'`]/g)) found.add(m[1]);
// qualquer string literal com o nome exato também conta (ex.: passada como prop para componente que aplica o testid)
const literal = (id) => found.has(id) || new RegExp(`["'\`]${id}["'\`]`).test(source);
const templatePrefix = (prefix) => new RegExp(`["'\`]${prefix}\\$\\{|\`${prefix}\\$\\{`).test(source);

const missing = {};
const check = (group, ids) => {
  for (const id of ids) {
    const ok = id.endsWith("*") ? templatePrefix(id.slice(0, -1)) || [...found].some((f) => f.startsWith(id.slice(0, -1))) : literal(id);
    if (!ok) (missing[group] ??= []).push(id);
  }
};
for (const [group, ids] of Object.entries(contract.testids)) check(group, ids);

const hasProjects = existsSync(join(projectDir, "web/src/app/(app)/projetos")) || /\/v1\/projects/.test(source);
const warnings = {};
for (const [group, def] of Object.entries(contract.optionalTestids)) {
  if (group === "modulo-exemplo") {
    if (hasProjects) check(group, def.ids);
    continue;
  }
  // recomendados: só avisam
  for (const id of def.ids) if (!literal(id)) (warnings[group] ??= []).push(id);
}

// ------------------------------------------------------------------ rotas (App Router)
const appDir = [join(webSrc, "app"), join(projectDir, "web/app")].find((p) => existsSync(p));
const pages = appDir
  ? walk(appDir)
      .filter((f) => /\/page\.(tsx|jsx|ts|js)$/.test(f))
      .map((f) => "/" + relative(appDir, dirname(f)).split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/"))
      .map((r) => (r === "/" ? "/" : r.replace(/\/$/, "")))
  : [];
const missingRoutes = contract.routes.filter((r) => !pages.includes(r));

// ------------------------------------------------------------------ API (openapi.json)
const openapiPath = ["api/openapi.json", "openapi.json"].map((p) => join(projectDir, p)).find((p) => existsSync(p));
const apiIssues = [];
if (!openapiPath) {
  apiIssues.push("api/openapi.json não encontrado (rode npm run openapi:export no api/)");
} else {
  const spec = JSON.parse(readFileSync(openapiPath, "utf8"));
  const norm = (p) => p.replace(/\{[^}]+\}|:[A-Za-z_]+/g, "{}");
  const paths = Object.fromEntries(Object.entries(spec.paths ?? {}).map(([p, v]) => [norm(p), v]));
  for (const ep of contract.api) {
    const op = paths[norm(ep.path)]?.[ep.method];
    if (!op) {
      apiIssues.push(`${ep.method.toUpperCase()} ${ep.path} não existe no OpenAPI`);
      continue;
    }
    if (ep.body) {
      let schema = op.requestBody?.content?.["application/json"]?.schema;
      if (schema?.$ref) schema = schema.$ref.split("/").slice(1).reduce((o, k) => o?.[k], spec);
      const props = new Set([
        ...Object.keys(schema?.properties ?? {}),
        ...(schema?.anyOf ?? schema?.oneOf ?? []).flatMap((s) => Object.keys((s.$ref ? s.$ref.split("/").slice(1).reduce((o, k) => o?.[k], spec) : s)?.properties ?? {})),
      ]);
      const absent = ep.body.filter((b) => !props.has(b));
      if (props.size && absent.length) apiIssues.push(`${ep.method.toUpperCase()} ${ep.path}: campos esperados ausentes no corpo: ${absent.join(", ")}`);
    }
  }
}

// ------------------------------------------------------------------ resultado
let problems = 0;
console.log(`Auditoria do contrato rodsaas · ${projectDir}`);
console.log(`  front: ${files.length} arquivos · testids encontrados: ${found.size}${hasProjects ? " · módulo de exemplo: sim" : ""}`);
for (const [group, ids] of Object.entries(missing)) {
  problems += ids.length;
  console.log(`✗ data-testid faltando (${group}): ${ids.join(", ")}`);
}
for (const [group, ids] of Object.entries(warnings)) console.log(`! recomendados ausentes (${group}): ${ids.join(", ")}`);
if (missingRoutes.length) {
  problems += missingRoutes.length;
  console.log(`✗ rotas faltando no painel: ${missingRoutes.join(", ")}`);
}
for (const i of apiIssues) {
  problems++;
  console.log(`✗ API: ${i}`);
}
if (!problems) {
  console.log("✓ contrato completo");
  process.exit(0);
}
console.log(`\n${problems} pendência(s). Veja skills/verify/references/contrato.md para onde vai cada item.`);
process.exit(1);
