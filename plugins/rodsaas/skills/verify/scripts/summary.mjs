#!/usr/bin/env node
// Resume o results.json do Playwright em português.
// Uso: node summary.mjs <rodsaas-verify-report/results.json>

import { readFileSync, existsSync } from "node:fs";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.log("sem resultados (a bateria não chegou a rodar?)");
  process.exit(1);
}
const report = JSON.parse(readFileSync(file, "utf8"));
const rows = [];

function visit(suite, trail) {
  const here = suite.title ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const last = t.results?.[t.results.length - 1];
      const status = t.status === "skipped" ? "skipped" : last?.status ?? t.status;
      const err = last?.error?.message ?? last?.errors?.[0]?.message ?? "";
      const reason = t.annotations?.find((a) => a.type === "skip")?.description ?? "";
      rows.push({ file: spec.file, title: [...here.slice(1), spec.title].join(" › "), project: t.projectName, status, err, reason });
    }
  }
  for (const s of suite.suites ?? []) visit(s, here);
}
for (const s of report.suites ?? []) visit(s, []);

const by = (st) => rows.filter((r) => (st === "failed" ? ["failed", "timedOut", "interrupted"].includes(r.status) : r.status === st));
const passed = by("passed");
const failed = by("failed");
const skipped = by("skipped");
const clean = (s) => s.replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter(Boolean).slice(0, 3).join(" · ");

console.log("");
console.log("══════════ rodsaas · verificação ══════════");
console.log(`✓ passaram: ${passed.length}   ✗ falharam: ${failed.length}   ○ pulados: ${skipped.length}`);
if (failed.length) {
  console.log("\nFalhas:");
  for (const f of failed) console.log(`  ✗ [${f.project}] ${f.title}\n      ${clean(f.err)}`);
}
if (skipped.length) {
  console.log("\nPulados:");
  for (const s of skipped) console.log(`  ○ ${s.title}${s.reason ? ` — ${s.reason}` : ""}`);
}
console.log("\nRelatório completo (com vídeo, print e trace das falhas): rodsaas-verify-report/html/index.html");
console.log("Abrir: npx playwright show-report rodsaas-verify-report/html");
process.exit(failed.length ? 1 : 0);
