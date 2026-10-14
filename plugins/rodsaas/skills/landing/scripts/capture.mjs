#!/usr/bin/env node
// rodsaas · landing — prints e vídeos do sistema de verdade para a landing (Playwright).
//
// Uso (na pasta site/):
//   node capture.mjs --config capture/config.json            # prints (claro/escuro, desktop/celular)
//   node capture.mjs --config capture/config.json --videos   # também os vídeos (mp4 + webm + pôster)
//   node capture.mjs --config capture/config.json --only crm-funil,agenda-semana
//
// O config (JSON) diz onde está o painel, a conta de demonstração (opcional: sem "login", só páginas públicas),
// os prints extras e onde salvar.
// Os prints dos apps disponíveis vêm do catálogo (shots/video de cada app); o config pode acrescentar ou trocar.
// Saída: <out>/<id>-<tema>-<aparelho>.webp (2x e 1x), vídeos <id>.mp4/.webm/.webp (pôster) e <out>/manifest.json.
// Requer: playwright (ou @playwright/test) instalado no site/ e o Chromium. sharp é opcional (sem ele, PNG);
// vídeos usam o screencast do Chromium + o ffmpeg do sistema (sem ffmpeg, os vídeos são pulados com aviso).

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : def; };
const configPath = resolve(String(opt("config", "capture/config.json")));
if (!existsSync(configPath)) { console.error(`config não encontrado: ${configPath}`); process.exit(1); }
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const base = dirname(configPath);
const rel = (p) => resolve(base, p);
const wantVideos = !!opt("videos", false);
const noImages = !!opt("no-images", false);
const only = opt("only") ? String(opt("only")).split(",") : null;

// ------------------------------------------------------------------ dependências
const req = createRequire(join(process.cwd(), "package.json"));
let chromium;
for (const m of ["playwright", "@playwright/test", "playwright-core"]) { try { ({ chromium } = req(m)); break; } catch {} }
if (!chromium) { console.error("instale o Playwright no site/: npm i -D playwright (e npx playwright install chromium, se não houver navegador)"); process.exit(1); }
let sharp = null; try { sharp = req("sharp"); } catch {}
const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

// ------------------------------------------------------------------ catálogo → lista de prints
const out = rel(cfg.out ?? "../public/shots");
mkdirSync(out, { recursive: true });
const devices = cfg.devices ?? { desktop: { width: 1440, height: 900, scale: 2 }, mobile: { width: 390, height: 844, scale: 3 } };
const themes = cfg.themes ?? ["light", "dark"];
let shots = [], videos = [];
if (cfg.catalog) {
  const catalog = JSON.parse(readFileSync(rel(cfg.catalog), "utf8"));
  const rs = cfg.rodsaas ? JSON.parse(readFileSync(rel(cfg.rodsaas), "utf8")) : {};
  const appIds = new Set((rs.apps ?? []).map((a) => a.id));
  const installed = new Set([...(rs.presets ?? []), ...(rs.addons ?? [])]);
  for (const a of catalog.apps) {
    if (!(appIds.has(a.id) || installed.has(a.preset))) continue; // em breve: sem print (nunca tela de mentira)
    for (const s of a.shots ?? []) shots.push({ app: a.id, ...s });
    if (a.video) videos.push({ app: a.id, ...a.video });
  }
}
const override = (list, extra = []) => { const m = new Map(list.map((s) => [s.id, s])); for (const s of extra) m.set(s.id, { ...(m.get(s.id) ?? {}), ...s }); return [...m.values()].filter((s) => !s.skip); };
shots = override(shots, cfg.shots);
videos = override(videos, cfg.videos);
if (only) { shots = shots.filter((s) => only.includes(s.id)); videos = videos.filter((v) => only.includes(v.id)); }

const resolvePath = (p) => {
  if (!p.startsWith("$public:")) return p;
  const key = p.slice(8), v = cfg.public?.[key];
  if (!v) throw new Error(`config.public.${key} não definido (endereço público de ${key}, ex.: /agendar/minha-empresa)`);
  return v;
};

// ------------------------------------------------------------------ sessão
async function apiLogin(context) {
  const r = await context.request.post(new URL("/v1/auth/login", cfg.apiURL).toString(), {
    headers: { Origin: new URL(cfg.baseURL).origin, "Content-Type": "application/json" },
    data: JSON.stringify(cfg.login), failOnStatusCode: false,
  });
  if (r.status() >= 300) throw new Error(`login da conta de demonstração falhou (HTTP ${r.status()}): ${(await r.text()).slice(0, 200)}`);
}

async function api(context) {
  const origin = new URL(cfg.baseURL).origin;
  return async (method, path, data) => {
    const r = await context.request.fetch(new URL(path, cfg.apiURL).toString(), { method, headers: { Origin: origin, ...(data ? { "Content-Type": "application/json" } : {}) }, data: data ? JSON.stringify(data) : undefined, failOnStatusCode: false });
    const text = await r.text();
    if (r.status() >= 300) throw new Error(`${method} ${path} → HTTP ${r.status()}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
}

// ------------------------------------------------------------------ passos
const loc = (page, spec) => { const [id, n] = String(spec).split(":"); return page.getByTestId(id).nth(n ? Number(n) - 1 : 0); };
async function humanMove(page, target, video) {
  const box = await target.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 24), { steps: video ? 25 : 1 });
}
async function runSteps(page, steps, { video = false } = {}) {
  for (const st of steps ?? []) {
    const [kind] = Object.keys(st), v = st[kind];
    if (kind === "goto") await page.goto(resolvePath(v));
    else if (kind === "waitFor") await loc(page, v).waitFor({ state: "visible", timeout: 20_000 });
    else if (kind === "click") { const l = loc(page, v); await l.waitFor({ state: "visible", timeout: 20_000 }); await humanMove(page, l, video); await l.click(); }
    else if (kind === "hover") { const l = loc(page, v); await humanMove(page, l, video); await l.hover(); }
    else if (kind === "fill") await loc(page, v[0]).fill(v[1]);
    else if (kind === "type") { const l = loc(page, v[0]); await humanMove(page, l, video); await l.click(); await l.pressSequentially(v[1], { delay: video ? 55 : 0 }); }
    else if (kind === "press") await page.keyboard.press(v);
    else if (kind === "pause") await page.waitForTimeout(video ? v : Math.min(v, 300));
    else if (kind === "scroll") await page.mouse.wheel(0, v);
    else if (kind === "dragTo") {
      const a = loc(page, v[0]), b = loc(page, v[1]);
      const ba = await a.boundingBox(), bb = await b.boundingBox();
      if (!ba || !bb) throw new Error(`dragTo: ${v[0]} ou ${v[1]} não visível`);
      await page.mouse.move(ba.x + ba.width / 2, ba.y + ba.height / 2, { steps: video ? 20 : 2 });
      await page.mouse.down();
      await page.mouse.move(ba.x + ba.width / 2 + 12, ba.y + ba.height / 2 + 6, { steps: 4 });
      await page.mouse.move(bb.x + bb.width / 2, bb.y + Math.min(bb.height / 2, 80), { steps: video ? 30 : 6 });
      await page.waitForTimeout(150);
      await page.mouse.up();
    } else throw new Error(`passo desconhecido: ${kind}`);
  }
}

const HIDE_CSS = (extra) => `*,*::before,*::after{caret-color:transparent!important}::-webkit-scrollbar{display:none}html{scrollbar-width:none}${(extra ?? []).map((s) => `${s}{visibility:hidden!important}`).join("")}`;
const CURSOR_JS = `(() => {
  const add = () => {
    if (document.getElementById("__cap_cursor")) return;
    const c = document.createElement("div"); c.id = "__cap_cursor";
    c.style.cssText = "position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(17,17,17,.35);border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);pointer-events:none;transition:transform .12s;left:-50px;top:-50px";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => { c.style.transform = "scale(.7)"; }, true);
    addEventListener("mouseup", () => { c.style.transform = "scale(1)"; }, true);
  };
  if (document.body) add(); else addEventListener("DOMContentLoaded", add);
})();`;

async function settle(page) {
  try { await page.waitForLoadState("networkidle", { timeout: 5000 }); } catch {}
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(250);
}

// ------------------------------------------------------------------ imagens
async function saveImage(buf, name, w) {
  const files = {};
  if (sharp) {
    const img = sharp(buf), meta = await img.metadata();
    const f2 = `${name}.webp`, f1 = `${name}@1x.webp`;
    await sharp(buf).webp({ quality: 82 }).toFile(join(out, f2));
    await sharp(buf).resize({ width: Math.round(meta.width / 2) }).webp({ quality: 80 }).toFile(join(out, f1));
    Object.assign(files, { webp: f2, webp1x: f1, width: meta.width, height: meta.height });
  } else {
    writeFileSync(join(out, `${name}.png`), buf);
    files.png = `${name}.png`; files.width = w;
  }
  return files;
}

// ------------------------------------------------------------------ execução
const manifest = existsSync(join(out, "manifest.json")) ? JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) : { shots: {}, videos: {} };
const browser = await chromium.launch(cfg.executablePath ? { executablePath: cfg.executablePath } : {});
const failures = [];
try {
  // conta de demonstração: login (e seed opcional uma vez)
  const boot = await browser.newContext({ baseURL: cfg.baseURL });
  if (cfg.login) await apiLogin(boot); // sem login: páginas públicas (ex.: revisão visual da própria landing)
  if (cfg.seed && !opt("no-seed")) {
    const mod = await import(pathToFileURL(rel(cfg.seed)).href);
    console.log("→ seed dos dados de demonstração");
    await mod.default({ api: await api(boot), config: cfg });
  }
  const storage = await boot.storageState();
  await boot.close();

  if (!noImages) for (const [devName, dev] of Object.entries(devices)) for (const theme of themes) {
    const list = shots.filter((s) => (s.device ?? "desktop") === devName || s.device === "both");
    if (!list.length) continue;
    const ctx = await browser.newContext({ baseURL: cfg.baseURL, storageState: storage, viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.scale ?? 2, colorScheme: theme, reducedMotion: "reduce", locale: "pt-BR", timezoneId: cfg.timezone ?? "America/Sao_Paulo", isMobile: devName === "mobile", hasTouch: devName === "mobile" });
    if (cfg.fixedTime && ctx.clock) await ctx.clock.setFixedTime(new Date(cfg.fixedTime));
    for (const s of list) {
      const page = await ctx.newPage();
      try {
        await page.goto(resolvePath(s.path));
        await loc(page, s.waitFor).waitFor({ state: "visible", timeout: 20_000 });
        await runSteps(page, s.actions);
        await page.addStyleTag({ content: HIDE_CSS([...(cfg.hide ?? []), ...(s.hide ?? [])]) });
        await settle(page);
        const target = s.clip && s.clip !== "viewport" && s.clip !== "full" ? loc(page, s.clip) : null;
        const buf = target ? await target.screenshot() : await page.screenshot({ fullPage: s.clip === "full" });
        const name = `${s.id}-${theme}-${devName}`;
        const files = await saveImage(buf, name, dev.width);
        manifest.shots[name] = { id: s.id, app: s.app ?? null, theme, device: devName, caption: s.caption ?? "", ...files };
        console.log(`  ✓ ${name}`);
      } catch (e) {
        failures.push(`${s.id} (${theme}/${devName}): ${e.message.split("\n")[0]}`);
        console.log(`  ✗ ${s.id} (${theme}/${devName}): ${e.message.split("\n")[0]}`);
        try { await page.screenshot({ path: join(out, `_falha-${s.id}-${theme}-${devName}.png`) }); } catch {}
      } finally { await page.close(); }
    }
    await ctx.close();
  }

  if (wantVideos && !hasFfmpeg) console.log("! ffmpeg não encontrado: vídeos pulados (instale o ffmpeg do sistema: apt install ffmpeg)");
  if (wantVideos && hasFfmpeg) for (const v of videos) {
    // Gravação pelo screencast do Chromium (CDP) + ffmpeg do sistema: não depende do ffmpeg do Playwright,
    // e começa só depois da tela pronta (sem quadros em branco no início).
    const mobile = v.device === "mobile";
    const dev = mobile ? { width: 390, height: 844 } : (cfg.videoSize ?? { width: 1280, height: 800 });
    const tmp = join(out, `_tmp-${v.id}`); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
    const ctx = await browser.newContext({ baseURL: cfg.baseURL, storageState: storage, viewport: dev, deviceScaleFactor: mobile ? 2 : 1, colorScheme: v.theme ?? "light", locale: "pt-BR", timezoneId: cfg.timezone ?? "America/Sao_Paulo", isMobile: mobile, hasTouch: mobile });
    if (cfg.fixedTime && ctx.clock) await ctx.clock.setFixedTime(new Date(cfg.fixedTime));
    await ctx.addInitScript({ content: CURSOR_JS });
    const page = await ctx.newPage();
    const frames = [];
    let cdp = null, ok = false;
    try {
      await page.goto(resolvePath(v.path));
      const first = v.steps?.[0]?.waitFor ?? v.waitFor;
      if (first) await loc(page, first).waitFor({ state: "visible", timeout: 20_000 });
      await page.addStyleTag({ content: HIDE_CSS([...(cfg.hide ?? []), ...(v.hide ?? [])]) });
      await settle(page);
      cdp = await ctx.newCDPSession(page);
      cdp.on("Page.screencastFrame", async (f) => {
        const file = join(tmp, `f${String(frames.length).padStart(5, "0")}.jpg`);
        writeFileSync(file, Buffer.from(f.data, "base64"));
        frames.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 });
        try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {}
      });
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
      await page.mouse.move(dev.width / 2, dev.height / 2);
      await page.waitForTimeout(400);
      await runSteps(page, v.steps, { video: true });
      await page.waitForTimeout(800);
      ok = true;
    } catch (e) {
      failures.push(`vídeo ${v.id}: ${e.message.split("\n")[0]}`);
      console.log(`  ✗ vídeo ${v.id}: ${e.message.split("\n")[0]}`);
    }
    const end = Date.now() / 1000;
    if (cdp) { try { await cdp.send("Page.stopScreencast"); } catch {} }
    await page.close(); await ctx.close();
    if (!ok || frames.length < 2) { if (ok) failures.push(`vídeo ${v.id}: poucos quadros gravados`); rmSync(tmp, { recursive: true, force: true }); continue; }
    // lista com a duração real de cada quadro (o screencast só manda quadro quando a tela muda)
    const lines = [];
    frames.forEach((f, i) => { const next = i + 1 < frames.length ? frames[i + 1].t : end; lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(3)}`); });
    lines.push(`file '${frames[frames.length - 1].file}'`);
    const list = join(tmp, "frames.txt"); writeFileSync(list, lines.join("\n") + "\n");
    const vf = "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2";
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", join(out, `${v.id}.mp4`)]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(out, `${v.id}.mp4`), "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-an", join(out, `${v.id}.webm`)]);
    const posterSrc = frames[Math.min(frames.length - 1, Math.floor(frames.length / 3))].file;
    const entry = { id: v.id, app: v.app ?? null, device: mobile ? "mobile" : "desktop", mp4: `${v.id}.mp4`, webm: `${v.id}.webm`, seconds: Math.round((end - frames[0].t) * 10) / 10, bytes: statSync(join(out, `${v.id}.mp4`)).size };
    if (sharp) { const meta = await sharp(posterSrc).metadata(); await sharp(posterSrc).webp({ quality: 80 }).toFile(join(out, `${v.id}-poster.webp`)); Object.assign(entry, { poster: `${v.id}-poster.webp`, width: meta.width, height: meta.height }); }
    else { writeFileSync(join(out, `${v.id}-poster.jpg`), readFileSync(posterSrc)); entry.poster = `${v.id}-poster.jpg`; }
    rmSync(tmp, { recursive: true, force: true });
    manifest.videos[v.id] = entry;
    console.log(`  ✓ vídeo ${v.id} (${entry.seconds}s, ${Math.round(entry.bytes / 1024)} KB)`);
  }
} finally {
  await browser.close();
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}
if (!sharp) console.log("! sharp não instalado: prints em PNG (npm i -D sharp para WebP 2x/1x)");
if (failures.length) { console.log(`\n${failures.length} falha(s):\n- ${failures.join("\n- ")}\n(veja _falha-*.png em ${out})`); process.exit(2); }
console.log(`\nOK: ${Object.keys(manifest.shots).length} prints e ${Object.keys(manifest.videos).length} vídeos em ${out}`);
