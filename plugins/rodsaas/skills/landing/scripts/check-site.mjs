#!/usr/bin/env node
// rodsaas · landing — confere o site estático gerado (site/out) antes de publicar.
//
// Uso (na pasta site/, depois do npm run build):
//   node check-site.mjs --dir out --catalog src/content/catalogo.json --rodsaas ../rodsaas.json [--app-url https://app.usebancada.app]
//
// Sobe um servidor local para a pasta, navega por todas as páginas a partir de "/" (Playwright/Chromium) e confere:
// status, título e descrição únicos, canonical, Open Graph, um h1, lang pt-BR, alt nas imagens, nada quebrado
// (requisições 404, erros no console), sem rolagem horizontal no celular, textos proibidos (lorem ipsum, TODO,
// NaN, undefined, {{ }}), vídeos com muted/playsinline/poster, links de cadastro certos, página de cada app
// disponível, app "em breve" sem print de tela, preços batendo com o catálogo, sitemap, robots, JSON-LD, 404
// e páginas legais. Depoimentos só com data-proof e autorização em content/depoimentos.json.
// Sai com código 1 se houver erro (avisos não reprovam).

import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, resolve, normalize } from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const dir = resolve(opt("dir", "out"));
const catalogPath = opt("catalog");
const rodsaasPath = opt("rodsaas");
const depoPath = opt("depoimentos", "src/content/depoimentos.json");
const maxPages = Number(opt("max", 300));
if (!existsSync(join(dir, "index.html"))) { console.error(`não achei ${join(dir, "index.html")} (rode o build do site antes)`); process.exit(1); }

const req = createRequire(join(process.cwd(), "package.json"));
let chromium; for (const m of ["playwright", "@playwright/test", "playwright-core"]) { try { ({ chromium } = req(m)); break; } catch {} }
if (!chromium) { console.error("instale o Playwright no site/: npm i -D playwright"); process.exit(1); }

const catalog = catalogPath ? JSON.parse(readFileSync(catalogPath, "utf8")) : null;
const rodsaas = rodsaasPath && existsSync(rodsaasPath) ? JSON.parse(readFileSync(rodsaasPath, "utf8")) : {};
const appURL = opt("app-url", rodsaas.domains?.app ?? null);
const depoimentos = existsSync(depoPath) ? JSON.parse(readFileSync(depoPath, "utf8")) : [];

const errors = [], warns = [];
const err = (page, m) => errors.push(`${page}: ${m}`);
const warn = (page, m) => warns.push(`${page}: ${m}`);

// ------------------------------------------------------------------ servidor estático (igual ao nginx do domain.sh)
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };
function fileFor(urlPath) {
  const p = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  for (const c of [p, `${p}.html`, join(p, "index.html")]) { const f = join(dir, c); if (f.startsWith(dir) && existsSync(f) && statSync(f).isFile()) return f; }
  return null;
}
const server = http.createServer((rq, rs) => {
  const f = fileFor(rq.url);
  if (!f) { const nf = join(dir, "404.html"); rs.writeHead(404, { "content-type": TYPES[".html"] }); return rs.end(existsSync(nf) ? readFileSync(nf) : "404"); }
  rs.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" });
  rs.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ------------------------------------------------------------------ navegação
const FORBIDDEN = [/lorem ipsum/i, /\bTODO\b/, /\bFIXME\b/, /\{\{.*?\}\}/, /\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /placeholder/i, /seu texto aqui/i];
const CLAIM = /(\+\s?)?\d[\d.]*\s*(mil\s+)?(empresas|clientes|usuários|negócios fechados)\b/i;
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const titles = new Map(), descs = new Map(), pages = new Map();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  // isMobile: false de propósito: no modo celular o Chromium afasta o zoom e esconde a rolagem horizontal
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const queue = ["/"], seen = new Set(queue);
  while (queue.length && pages.size < maxPages) {
    const path = queue.shift();
    const page = await ctx.newPage();
    const consoleErrors = [], broken = [];
    page.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => consoleErrors.push(String(e.message).slice(0, 160)));
    page.on("response", (r) => { if (r.url().startsWith(origin) && r.status() >= 400 && r.url() !== origin + path) broken.push(`${r.status()} ${r.url().slice(origin.length)}`); });
    const res = await page.goto(origin + path, { waitUntil: "load" });
    await page.waitForTimeout(150);
    const status = res?.status() ?? 0;
    if (status !== 200) { err(path, `HTTP ${status} (link quebrado)`); await page.close(); continue; }
    const info = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const meta = (n) => q(`meta[name="${n}"]`)?.content ?? q(`meta[property="${n}"]`)?.content ?? null;
      return {
        lang: document.documentElement.lang, title: document.title, desc: meta("description"),
        canonical: q('link[rel="canonical"]')?.href ?? null,
        og: { title: meta("og:title"), description: meta("og:description"), image: meta("og:image") },
        h1: document.querySelectorAll("h1").length,
        imgs: [...document.images].map((i) => ({ src: i.currentSrc || i.src, alt: i.getAttribute("alt"), hidden: i.getAttribute("aria-hidden") === "true" || i.getAttribute("role") === "presentation", ok: i.complete && i.naturalWidth > 0, lazy: i.loading })),
        videos: [...document.querySelectorAll("video")].map((v) => ({ muted: v.muted || v.hasAttribute("muted"), autoplay: v.hasAttribute("autoplay"), inline: v.hasAttribute("playsinline"), poster: v.getAttribute("poster"), sources: [...v.querySelectorAll("source")].map((s) => s.src).concat(v.src ? [v.src] : []) })),
        links: [...document.querySelectorAll("a[href]")].map((a) => ({ href: a.href, text: (a.textContent || "").trim().slice(0, 60), cta: a.hasAttribute("data-cta") })),
        icon: document.querySelector('link[rel~="icon"]')?.href ?? null,
        jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
        text: document.body.innerText,
        proofs: document.querySelectorAll("[data-proof]").length,
        shots: [...document.images].filter((i) => /\/shots\//.test(i.src)).length + [...document.querySelectorAll("video source, video[src]")].filter((v) => /\/shots\//.test(v.src)).length,
        emBreve: /em breve/i.test(document.body.innerText),
      };
    });
    pages.set(path, info);
    if (info.lang !== "pt-BR") err(path, `<html lang> deve ser "pt-BR" (está "${info.lang}")`);
    if (!info.title) err(path, "sem <title>"); else { if (info.title.length > 70) warn(path, `título longo (${info.title.length} caracteres)`); titles.set(info.title, [...(titles.get(info.title) ?? []), path]); }
    if (!info.desc) err(path, "sem meta description"); else { if (info.desc.length < 50 || info.desc.length > 170) warn(path, `description com ${info.desc.length} caracteres (ideal 50–160)`); descs.set(info.desc, [...(descs.get(info.desc) ?? []), path]); }
    if (!info.canonical) err(path, "sem link canonical");
    else if (!/^https:\/\//.test(info.canonical) && !info.canonical.startsWith(origin)) warn(path, `canonical não é https: ${info.canonical}`);
    for (const k of ["title", "description", "image"]) if (!info.og[k]) err(path, `sem og:${k}`);
    if (info.og.image) { try { const u = new URL(info.og.image, origin); if (!fileFor(u.pathname)) err(path, `og:image não existe no site: ${u.pathname}`); } catch { err(path, "og:image inválida"); } }
    { const iconPath = info.icon ? new URL(info.icon, origin).pathname : "/favicon.ico"; if (!fileFor(iconPath)) err(path, `sem favicon (${iconPath})`); }
    if (info.h1 !== 1) err(path, `deve ter exatamente um <h1> (tem ${info.h1})`);
    for (const i of info.imgs) {
      if (i.alt === null && !i.hidden) err(path, `imagem sem alt: ${i.src.slice(origin.length)}`);
      if (!i.ok && i.lazy !== "lazy") err(path, `imagem não carregou: ${i.src.slice(origin.length)}`);
    }
    for (const v of info.videos) {
      if (v.autoplay && !v.muted) err(path, "vídeo com autoplay precisa de muted (o navegador bloqueia)");
      if (!v.inline) err(path, "vídeo sem playsinline (no iPhone abre em tela cheia)");
      if (!v.poster) err(path, "vídeo sem poster (fica preto até carregar)");
      for (const s of v.sources) { const u = new URL(s, origin); if (u.origin === origin && !fileFor(u.pathname)) err(path, `vídeo não existe: ${u.pathname}`); }
    }
    for (const j of info.jsonld) { try { JSON.parse(j); } catch { err(path, "JSON-LD inválido"); } }
    for (const re of FORBIDDEN) { const m = info.text.match(re); if (m) err(path, `texto proibido na página: "${m[0]}"`); }
    const claim = info.text.match(CLAIM);
    if (claim) warn(path, `número de prova social ("${claim[0]}"): só publique se for real e você puder provar`);
    for (const c of consoleErrors) err(path, `erro no console: ${c}`);
    for (const b of broken) err(path, `recurso quebrado: ${b}`);
    for (const l of info.links) {
      let u; try { u = new URL(l.href); } catch { continue; }
      if (u.origin === origin) { const p = u.pathname.replace(/\/$/, "") || "/"; if (!seen.has(p) && !/\.(png|jpe?g|webp|svg|mp4|webm|pdf|xml|txt|ico)$/i.test(p)) { seen.add(p); queue.push(p); } }
      else if (appURL && u.origin === new URL(appURL).origin) {
        if (!/^\/(cadastro|entrar)$/.test(u.pathname)) err(path, `link para o painel fora de /cadastro ou /entrar: ${u.pathname}`);
        const apps = u.searchParams.get("apps");
        if (apps && catalog) for (const id of apps.split(",")) if (!catalog.apps.some((a) => a.id === id)) err(path, `link de cadastro com app desconhecido: ${id}`);
      } else if (/localhost|127\.0\.0\.1/.test(u.host)) err(path, `link para localhost: ${l.href}`);
    }
    // celular: sem rolagem horizontal
    const mp = await mobile.newPage();
    await mp.goto(origin + path, { waitUntil: "load" });
    const over = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) err(path, `rolagem horizontal no celular (${over}px a mais que a tela de 390px)`);
    await mp.close();
    await page.close();
  }
  // calculadora de preços de verdade (não uma imagem/tabela parada): ligar um app soma o preço, mudar pessoas multiplica
  if (catalog && pages.has("/precos")) {
    const pg = await ctx.newPage();
    await pg.goto(origin + "/precos", { waitUntil: "load" });
    const calc = pg.getByTestId("site-pricing-calculator");
    if (!(await calc.count())) err("/precos", "sem a calculadora (data-testid=site-pricing-calculator)");
    else {
      const appIds = new Set((rodsaas.apps ?? []).map((a) => a.id)), inst = new Set([...(rodsaas.presets ?? []), ...(rodsaas.addons ?? [])]);
      const target = catalog.apps.find((a) => (appIds.has(a.id) || inst.has(a.preset)) && a.pricing?.price > 0 && !["empresa", "uso", "incluido"].includes(a.pricing.unit));
      const money = async () => { const t = (await pg.getByTestId("site-pricing-total").innerText()).replace(/\u00a0/g, " "); const m = t.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/); return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : NaN; };
      if (target) {
        const row = pg.locator(`[data-testid="site-pricing-app"][data-app="${target.id}"]`);
        if (!(await row.count())) err("/precos", `calculadora sem o app ${target.name} (data-testid=site-pricing-app, data-app=${target.id})`);
        else {
          const t0 = await money();
          await row.click();
          await pg.waitForTimeout(200);
          const t1 = await money();
          const on = t1 > t0;
          const seatsIn = pg.locator(`[data-testid="site-pricing-seats"][data-app="${target.id}"]`);
          const seats = (await seatsIn.count()) ? Number(await seatsIn.inputValue()) || 1 : 1;
          if (Number.isNaN(t0) || Number.isNaN(t1)) err("/precos", "total da calculadora sem valor em R$ (data-testid=site-pricing-total)");
          else if (Math.abs(Math.abs(t1 - t0) - target.pricing.price * seats) > 0.01) err("/precos", `ligar/desligar ${target.name} mudou o total em ${Math.abs(t1 - t0)} (esperado ${target.pricing.price * seats})`);
          else if (on && (await seatsIn.count())) {
            await seatsIn.fill(String(seats + 2));
            await seatsIn.dispatchEvent("change");
            await pg.waitForTimeout(200);
            const t2 = await money();
            if (Math.abs(t2 - t1 - target.pricing.price * 2) > 0.01) err("/precos", `mais 2 pessoas no ${target.name} mudou o total em ${t2 - t1} (esperado ${target.pricing.price * 2})`);
          } else if (on) warn("/precos", `calculadora sem campo de pessoas para ${target.name} (data-testid=site-pricing-seats)`);
        }
      }
    }
    await pg.close();
  }
  await ctx.close(); await mobile.close();
} finally {
  await browser.close();
  server.close();
}

// ------------------------------------------------------------------ site inteiro
for (const [t, ps] of titles) if (ps.length > 1) err(ps.join(", "), `título repetido: "${t}"`);
for (const [d, ps] of descs) if (ps.length > 1) err(ps.join(", "), "description repetida");
for (const must of ["/precos", "/apps", "/termos", "/privacidade"]) if (!pages.has(must)) err(must, "página obrigatória não encontrada (nem por link a partir da home)");
if (!existsSync(join(dir, "404.html"))) err("/404", "sem 404.html");
const home = pages.get("/");
if (home && appURL && !home.links.some((l) => l.href.startsWith(appURL) && /\/cadastro/.test(l.href))) err("/", "home sem botão de cadastro levando ao painel");
if (pages.has("/precos") && appURL && !pages.get("/precos").links.some((l) => l.href.startsWith(appURL) && /\/cadastro/.test(l.href))) err("/precos", "preços sem botão de cadastro");

// sitemap e robots
const sitemap = existsSync(join(dir, "sitemap.xml")) ? readFileSync(join(dir, "sitemap.xml"), "utf8") : null;
if (!sitemap) err("/sitemap.xml", "não existe");
else {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/\/$/, "") || "/");
  for (const p of pages.keys()) if (!locs.includes(p)) err("/sitemap.xml", `página fora do sitemap: ${p}`);
  if (sitemap.includes("localhost")) err("/sitemap.xml", "endereços com localhost (use o domínio do site)");
}
const robots = existsSync(join(dir, "robots.txt")) ? readFileSync(join(dir, "robots.txt"), "utf8") : null;
if (!robots) err("/robots.txt", "não existe"); else if (!/sitemap:/i.test(robots)) err("/robots.txt", "sem a linha Sitemap:");

// catálogo: página de cada app, em breve sem print, preços
if (catalog) {
  const appIds = new Set((rodsaas.apps ?? []).map((a) => a.id));
  const inst = new Set([...(rodsaas.presets ?? []), ...(rodsaas.addons ?? [])]);
  const precos = pages.get("/precos")?.text.replace(/ /g, " ") ?? "";
  for (const a of catalog.apps) {
    const avail = appIds.has(a.id) || inst.has(a.preset);
    const p = pages.get(`/apps/${a.slug}`);
    if (avail) {
      if (!p) { err(`/apps/${a.slug}`, `app disponível sem página (${a.name})`); continue; }
      if (p.emBreve && !/disponível/i.test(p.text)) warn(`/apps/${a.slug}`, `app disponível marcado como "em breve"`);
      if (a.pricing?.price > 0 && precos && !precos.includes(`R$ ${a.pricing.price}`)) err("/precos", `preço do ${a.name} (R$ ${a.pricing.price}) não aparece`);
      if ((a.shots ?? []).length && p.shots === 0) warn(`/apps/${a.slug}`, "app disponível sem nenhum print ou vídeo do sistema");
    } else if (p) {
      if (!p.emBreve) err(`/apps/${a.slug}`, `app que ainda não existe precisa dizer "Em breve" (${a.name})`);
      if (p.shots > 0) err(`/apps/${a.slug}`, `app "em breve" com print/vídeo de tela (${a.name}): não existe tela para mostrar`);
    }
  }
}

// prova social
const authorized = depoimentos.filter((d) => d.autorizado === true).length;
const proofs = [...pages.values()].reduce((t, p) => Math.max(t, p.proofs), 0);
if (proofs > authorized) err("prova social", `${proofs} depoimento(s) na página, mas só ${authorized} autorizado(s) em ${depoPath}`);

// legais
for (const lp of ["/termos", "/privacidade"]) { const t = pages.get(lp)?.text ?? ""; if (t && !/CNPJ/i.test(t)) warn(lp, "sem CNPJ e razão social da empresa"); }

console.log(`Páginas conferidas: ${pages.size}`);
for (const w of warns) console.log(`  ! ${w}`);
for (const e of errors) console.log(`  ✗ ${e}`);
console.log(errors.length ? `\nERROS: ${errors.length} · avisos: ${warns.length}` : `\nOK · avisos: ${warns.length}`);
process.exit(errors.length ? 1 : 0);
