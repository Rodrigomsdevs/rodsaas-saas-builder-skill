#!/usr/bin/env node
// rodsaas · gera os tokens de tema (shadcn/ui + Tailwind) a partir da marca.
//
// Uso:
//   node brand.mjs <rodsaas.json> --css <saida.css> [--preview <saida.html>]
//
// Lê `brand` do rodsaas.json ({ primary: "#hex", style: "corporate|modern|dense" }),
// gera uma escala de cor em OKLCH (50..950), escolhe a cor de texto sobre a cor
// principal pelo contraste WCAG, ajusta a cor principal no modo escuro se ficar
// apagada, e escreve o CSS com as variáveis do tema claro e escuro.
// Sem dependências: só Node.

import { readFileSync, writeFileSync } from "node:fs";

// ------------------------------------------------------------------ args
const args = process.argv.slice(2);
const configPath = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const cssOut = flag("--css");
const previewOut = flag("--preview");
if (!configPath || !cssOut) {
  console.error("uso: node brand.mjs <rodsaas.json> --css <saida.css> [--preview <saida.html>]");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const brand = config.brand ?? {};
const productName = config.product?.name ?? "Meu SaaS";
const tenantLabel = config.product?.tenantLabel ?? "Empresa";
const style = brand.style ?? "modern";
const primaryHex = (brand.primary ?? "#2563eb").toLowerCase();
if (!/^#[0-9a-f]{6}$/.test(primaryHex)) {
  console.error(`brand.primary inválido: "${brand.primary}" (use #rrggbb)`);
  process.exit(1);
}

const STYLES = {
  corporate: { radius: "0.25rem", label: "Corporativo sóbrio" },
  modern: { radius: "0.75rem", label: "Moderno" },
  dense: { radius: "0.375rem", label: "Denso" },
};
if (!STYLES[style]) {
  console.error(`brand.style inválido: "${style}" (use corporate, modern ou dense)`);
  process.exit(1);
}

// ------------------------------------------------------------------ cor
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklch([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

function oklchToLinearRgb({ L, C, H }) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (c) => oklchToLinearRgb(c).every((v) => v >= -1e-4 && v <= 1 + 1e-4);

// Reduz o croma até a cor caber no sRGB (mantém luminosidade e matiz).
function clampToGamut(c) {
  if (inGamut(c)) return c;
  let lo = 0;
  let hi = c.C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ ...c, C: mid })) lo = mid;
    else hi = mid;
  }
  return { ...c, C: lo };
}

const toHex = (c) =>
  "#" +
  oklchToLinearRgb(c)
    .map((v) => Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, v))))) * 255))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");

const fmt = ({ L, C, H }) => `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;

function luminance(c) {
  const [r, g, b] = oklchToLinearRgb(c).map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ------------------------------------------------------------------ escala
const base = rgbToOklch(hexToRgb(primaryHex));
const STEPS = { 50: 0.97, 100: 0.936, 200: 0.885, 300: 0.808, 400: 0.714, 500: 0.627, 600: 0.546, 700: 0.477, 800: 0.401, 900: 0.336, 950: 0.258 };
// Croma menor nos extremos, para os tons claros/escuros não ficarem "gritando".
const chromaFactor = (L) => Math.max(0.18, 1 - Math.abs(L - 0.6) * 1.6);
const scale = Object.fromEntries(
  Object.entries(STEPS).map(([k, L]) => [k, clampToGamut({ L, C: base.C * chromaFactor(L), H: base.H })]),
);

// Neutros levemente tingidos com o matiz da marca.
const neutral = (L) => ({ L, C: Math.min(0.012, base.C * 0.08), H: base.H });

const WHITE = { L: 1, C: 0, H: 0 };
const NEAR_BLACK = neutral(0.145);

// Texto sobre a cor principal: branco ou quase preto, o que tiver mais contraste.
const pickForeground = (bg) => (contrast(bg, WHITE) >= contrast(bg, NEAR_BLACK) ? WHITE : NEAR_BLACK);

// Claro: a cor exata da marca.
const primaryLight = base;
const primaryLightFg = pickForeground(primaryLight);

// Escuro: se a cor da marca some no fundo escuro, sobe para um tom mais claro da escala.
const darkBg = neutral(0.145);
let primaryDark = base;
if (contrast(primaryDark, darkBg) < 3) {
  primaryDark = ["400", "300", "200"].map((k) => scale[k]).find((c) => contrast(c, darkBg) >= 3) ?? scale["300"];
}
const primaryDarkFg = pickForeground(primaryDark);

// Texto/ícone/link na cor da marca sobre o fundo (ex.: links, foco). Cores claras
// (amarelo, verde-limão) não servem para isso no tema claro: desce na escala.
const primaryTextLight =
  contrast(base, WHITE) >= 4.5 ? base : ["600", "700", "800", "900"].map((k) => scale[k]).find((c) => contrast(c, WHITE) >= 4.5) ?? scale["900"];
const primaryTextDark =
  contrast(primaryDark, darkBg) >= 4.5 ? primaryDark : ["300", "200", "100"].map((k) => scale[k]).find((c) => contrast(c, darkBg) >= 4.5) ?? scale["100"];

// Cores de estado (fixas, ajustadas para contraste razoável nos dois temas).
const STATUS = {
  destructive: { light: { L: 0.577, C: 0.245, H: 27.3 }, dark: { L: 0.704, C: 0.191, H: 22.2 } },
  success: { light: { L: 0.596, C: 0.145, H: 163.2 }, dark: { L: 0.696, C: 0.17, H: 162.5 } },
  warning: { light: { L: 0.666, C: 0.179, H: 58.3 }, dark: { L: 0.769, C: 0.188, H: 70.1 } },
};

// Cores de gráfico: a marca + 4 matizes espaçados.
const chart = [0, 72, 144, 216, 288].map((dh, i) =>
  clampToGamut({ L: [0.62, 0.68, 0.56, 0.74, 0.5][i], C: Math.max(0.12, base.C * 0.9), H: (base.H + dh) % 360 }),
);

const light = {
  background: WHITE,
  foreground: neutral(0.145),
  card: WHITE,
  "card-foreground": neutral(0.145),
  popover: WHITE,
  "popover-foreground": neutral(0.145),
  primary: primaryLight,
  "primary-foreground": primaryLightFg,
  secondary: neutral(0.97),
  "secondary-foreground": neutral(0.205),
  muted: neutral(0.97),
  "muted-foreground": neutral(0.556),
  accent: scale["50"],
  "accent-foreground": scale["900"],
  destructive: STATUS.destructive.light,
  success: STATUS.success.light,
  warning: STATUS.warning.light,
  border: neutral(0.922),
  input: neutral(0.922),
  ring: primaryTextLight,
  "primary-text": primaryTextLight,
  sidebar: neutral(0.985),
  "sidebar-foreground": neutral(0.145),
  "sidebar-primary": primaryLight,
  "sidebar-primary-foreground": primaryLightFg,
  "sidebar-accent": scale["100"],
  "sidebar-accent-foreground": scale["900"],
  "sidebar-border": neutral(0.922),
  "sidebar-ring": primaryTextLight,
};

const dark = {
  background: darkBg,
  foreground: neutral(0.985),
  card: neutral(0.205),
  "card-foreground": neutral(0.985),
  popover: neutral(0.205),
  "popover-foreground": neutral(0.985),
  primary: primaryDark,
  "primary-foreground": primaryDarkFg,
  secondary: neutral(0.269),
  "secondary-foreground": neutral(0.985),
  muted: neutral(0.269),
  "muted-foreground": neutral(0.708),
  accent: clampToGamut({ L: 0.3, C: base.C * 0.35, H: base.H }),
  "accent-foreground": scale["100"],
  destructive: STATUS.destructive.dark,
  success: STATUS.success.dark,
  warning: STATUS.warning.dark,
  border: { ...neutral(1), L: 1 },
  input: { ...neutral(1), L: 1 },
  ring: primaryTextDark,
  "primary-text": primaryTextDark,
  sidebar: neutral(0.205),
  "sidebar-foreground": neutral(0.985),
  "sidebar-primary": primaryDark,
  "sidebar-primary-foreground": primaryDarkFg,
  "sidebar-accent": neutral(0.269),
  "sidebar-accent-foreground": neutral(0.985),
  "sidebar-border": { ...neutral(1), L: 1 },
  "sidebar-ring": primaryTextDark,
};

// No escuro, bordas são branco com transparência (padrão shadcn).
const varLine = (name, c) => {
  if (dark[name] === c && ["border", "input", "sidebar-border"].includes(name)) return `  --${name}: oklch(1 0 0 / 10%);`;
  return `  --${name}: ${fmt(c)};`;
};

const chartVars = chart.map((c, i) => `  --chart-${i + 1}: ${fmt(c)};`).join("\n");
const scaleVars = Object.entries(scale).map(([k, c]) => `  --brand-${k}: ${fmt(c)};`).join("\n");

const css = `/* Gerado por rodsaas/brand.mjs a partir de rodsaas.json — não edite à mão.
   Para mudar: altere brand em rodsaas.json e rode o script de novo.
   Marca: ${primaryHex} · estilo: ${STYLES[style].label} */

:root {
  --radius: ${STYLES[style].radius};
${scaleVars}
${Object.entries(light).map(([k, c]) => varLine(k, c)).join("\n")}
${chartVars}
}

.dark {
${Object.entries(dark).map(([k, c]) => varLine(k, c)).join("\n")}
${chartVars}
}
`;
writeFileSync(cssOut, css);

// ------------------------------------------------------------------ relatório
const checks = [
  ["texto sobre a cor principal (claro)", contrast(primaryLight, primaryLightFg), 4.5],
  ["texto sobre a cor principal (escuro)", contrast(primaryDark, primaryDarkFg), 4.5],
  ["links/foco na cor da marca sobre fundo claro (--primary-text)", contrast(primaryTextLight, WHITE), 4.5],
  ["links/foco na cor da marca sobre fundo escuro (--primary-text)", contrast(primaryTextDark, darkBg), 4.5],
  ["texto secundário sobre fundo claro", contrast(light["muted-foreground"], WHITE), 4.5],
];
const report = {
  primary: primaryHex,
  style,
  primaryDarkAdjusted: primaryDark !== base,
  primaryDarkHex: toHex(primaryDark),
  primaryTextLightHex: toHex(primaryTextLight),
  notes: [
    ...(contrast(base, WHITE) < 3 ? ["Cor clara: botões usam texto escuro; links e foco usam um tom mais escuro da marca (--primary-text)."] : []),
    ...(primaryDark !== base ? ["No tema escuro a cor principal foi clareada para continuar visível."] : []),
  ],
  scale: Object.fromEntries(Object.entries(scale).map(([k, c]) => [k, toHex(c)])),
  contrast: checks.map(([label, ratio, min]) => ({ label, ratio: Number(ratio.toFixed(2)), min, ok: ratio >= min })),
};
console.log(JSON.stringify(report, null, 2));

// ------------------------------------------------------------------ prévia
if (previewOut) {
  const swatches = Object.entries(scale)
    .map(([k, c]) => `<div class="sw" style="background:${fmt(c)};color:${fmt(pickForeground(c))}">${k}</div>`)
    .join("");
  const panel = (mode) => `
  <section class="${mode}" style="background:var(--background);color:var(--foreground)">
    <h2>${mode === "dark" ? "Tema escuro" : "Tema claro"}</h2>
    <div class="row">
      <button class="btn primary">Salvar</button>
      <button class="btn secondary">Cancelar</button>
      <button class="btn outline">Exportar</button>
      <button class="btn destructive">Excluir</button>
      <button class="btn primary" disabled><span class="spin"></span>Salvando…</button>
    </div>
    <div class="row">
      <span class="badge">Pro</span><span class="badge ok">Ativo</span><span class="badge warn">Pendente</span><span class="badge err">Cancelado</span>
    </div>
    <div class="card">
      <div class="card-h"><div><strong>Membros</strong><div class="muted">3 de 5 usuários do plano</div></div><button class="btn primary sm">Convidar</button></div>
      <div class="bar"><div style="width:60%"></div></div>
      <table>
        <thead><tr><th>Nome</th><th>Papel</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Ana Souza</td><td>Owner</td><td><span class="badge ok">Ativo</span></td></tr>
          <tr class="sel"><td>Bruno Lima</td><td>Admin</td><td><span class="badge ok">Ativo</span></td></tr>
          <tr><td>carla@exemplo.com</td><td>Membro</td><td><span class="badge warn">Convite enviado</span></td></tr>
        </tbody>
      </table>
    </div>
    <div class="row"><input placeholder="Buscar clientes…" /><a style="color:var(--primary-text);font-size:14px" href="#">Ver todos →</a><input class="focus" value="Campo com foco" /></div>
    <div class="side"><div class="nav active">▣ Início</div><div class="nav">◫ Projetos</div><div class="nav">⚙ ${tenantLabel}</div></div>
  </section>`;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prévia da marca · ${productName}</title>
<style>${css}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff}
header{padding:20px 24px;background:#fff;color:#111}header h1{margin:0 0 4px;font-size:20px}
.scale{display:flex;gap:4px;margin-top:12px}.sw{flex:1;height:44px;border-radius:6px;font-size:11px;display:flex;align-items:end;padding:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr))}
section{padding:24px;display:flex;flex-direction:column;gap:14px}section h2{margin:0;font-size:15px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.btn{border:1px solid transparent;border-radius:var(--radius);padding:8px 14px;font:inherit;font-size:14px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.btn.sm{padding:5px 10px;font-size:13px}
.primary{background:var(--primary);color:var(--primary-foreground)}
.secondary{background:var(--secondary);color:var(--secondary-foreground)}
.outline{background:transparent;color:var(--foreground);border-color:var(--border)}
.destructive{background:var(--destructive);color:#fff}
.btn:disabled{opacity:.6;cursor:not-allowed}
.spin{width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}
.badge{font-size:12px;padding:2px 8px;border-radius:999px;background:var(--accent);color:var(--accent-foreground)}
.badge.ok{background:color-mix(in oklch,var(--success) 18%,transparent);color:var(--success)}
.badge.warn{background:color-mix(in oklch,var(--warning) 20%,transparent);color:var(--warning)}
.badge.err{background:color-mix(in oklch,var(--destructive) 18%,transparent);color:var(--destructive)}
.card{background:var(--card);color:var(--card-foreground);border:1px solid var(--border);border-radius:calc(var(--radius) + 4px);padding:16px;display:flex;flex-direction:column;gap:12px}
.card-h{display:flex;justify-content:space-between;align-items:center}.muted{color:var(--muted-foreground);font-size:13px}
.bar{height:6px;background:var(--muted);border-radius:99px;overflow:hidden}.bar div{height:100%;background:var(--primary)}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;color:var(--muted-foreground);font-weight:500;font-size:12px}
th,td{padding:8px 6px;border-bottom:1px solid var(--border)}tr.sel td{background:var(--accent)}
input{background:transparent;color:var(--foreground);border:1px solid var(--input);border-radius:var(--radius);padding:8px 10px;font:inherit;font-size:14px;flex:1;min-width:140px}
input.focus{outline:3px solid color-mix(in oklch,var(--ring) 40%,transparent);border-color:var(--ring)}
.side{background:var(--sidebar);color:var(--sidebar-foreground);border:1px solid var(--sidebar-border);border-radius:var(--radius);padding:8px;display:flex;flex-direction:column;gap:2px;max-width:220px}
.nav{padding:7px 10px;border-radius:var(--radius);font-size:14px}.nav.active{background:var(--sidebar-accent);color:var(--sidebar-accent-foreground);font-weight:500}
</style></head><body>
<header><h1>${productName}</h1><div>Cor ${primaryHex} · estilo ${STYLES[style].label}${report.primaryDarkAdjusted ? ` · no escuro a cor principal foi clareada para ${report.primaryDarkHex} para continuar visível` : ""}</div>
<div class="scale">${swatches}</div></header>
<div class="grid">${panel("light")}${panel("dark")}</div>
</body></html>`;
  writeFileSync(previewOut, html);
}
