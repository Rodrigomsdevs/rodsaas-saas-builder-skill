// rodsaas · páginas — regras puras da operação avançada (sem banco, sem rede): comentários, histórico e restaurar,
// arquivos nos blocos, modelos, permissão por página, databases (filtro, ordenação, calendário, galeria, relação e
// rollup), exportação (HTML para o PDF e Markdown) e os perfis (manual de processos, base pública, atas → tarefas).
// Blocos no formato do editor (BlockNote): { id, type, props, content: [{ type: "text", text } | { type: "link", href, content } |
// { type: "mention", props: { userId } }], children: [] }. Porte para TypeScript em api/src/modules/pages/lib/ com os testes.
// Rode: node --test paginas-lib.test.mjs

const err = (list, code, message, path) => list.push({ code, message, path });
const pad = (n) => String(n).padStart(2, "0");
const isYmd = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ blocos
/** Percorre todos os blocos (filhos inclusive), em ordem. */
export function walkBlocks(blocks, fn, depth = 0) {
  for (const b of Array.isArray(blocks) ? blocks : []) { fn(b, depth); walkBlocks(b?.children, fn, depth + 1); }
}
/** Texto de um conteúdo inline (texto, links e menções). */
export function inlineText(content) {
  if (typeof content === "string") return content;
  return (Array.isArray(content) ? content : []).map((n) => (n?.type === "text" ? n.text ?? "" : n?.type === "link" ? inlineText(n.content) : n?.type === "mention" ? "@" + (n.props?.name ?? "") : "")).join("");
}
export function blockIds(blocks) { const out = new Set(); walkBlocks(blocks, (b) => b?.id && out.add(b.id)); return out; }

// ------------------------------------------------------------------ comentários
/** Comentário: { body, blockId?, quote? } — no bloco (com o trecho citado) ou na página. */
export function validateComment(c, { blockIds: ids = new Set() } = {}) {
  const e = [];
  const body = String(c?.body ?? "").trim();
  if (!body) err(e, "BODY_REQUIRED", "Escreva o comentário", "body");
  else if (body.length > 5000) err(e, "BODY_TOO_LONG", "Até 5.000 caracteres", "body");
  if (c?.blockId != null && !ids.has(c.blockId)) err(e, "BLOCK_NOT_FOUND", "O bloco não existe mais na página", "blockId");
  if (c?.quote != null && (c.blockId == null || String(c.quote).length > 300)) err(e, "QUOTE_INVALID", "Trecho citado (até 300 caracteres) só em comentário de bloco", "quote");
  return e;
}
/** Menções no texto do comentário: "@[Nome](userId)" → ids únicos de quem é membro. */
export function extractMentions(text, memberIds = []) {
  const out = [];
  for (const m of String(text ?? "").matchAll(/@\[[^\]]{1,80}\]\(([^)\s]{1,64})\)/g)) if (memberIds.includes(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out;
}
export const canEditComment = (c, userId) => !c.deletedAt && c.authorId === userId;
export const canDeleteComment = (c, userId, isAdmin = false) => !c.deletedAt && (c.authorId === userId || isAdmin);
/** Conversas cujo bloco sumiu da página (aparecem como "bloco removido"). */
export const orphanedThreads = (threads, blocks) => { const ids = blockIds(blocks); return threads.filter((t) => t.blockId && !ids.has(t.blockId)).map((t) => t.id); };

// ------------------------------------------------------------------ histórico de versões
/** Grava versão nova quando não há nenhuma, mudou o autor ou passaram `minMinutes` da última. */
export function shouldSnapshot(last, { now, authorId, minMinutes = 10 }) {
  if (!last) return true;
  if (last.authorId !== authorId) return true;
  return now - Date.parse(last.createdAt) >= minMinutes * 60_000;
}
/** Diferença por id de bloco (em qualquer profundidade): { added, removed, changed } */
export function diffBlocks(a, b) {
  const map = (bl) => { const m = new Map(); walkBlocks(bl, (x) => { if (x?.id) { const { children, ...own } = x; void children; m.set(x.id, JSON.stringify(own)); } }); return m; };
  const A = map(a), B = map(b);
  let added = 0, removed = 0, changed = 0;
  for (const [id, v] of B) { if (!A.has(id)) added++; else if (A.get(id) !== v) changed++; }
  for (const id of A.keys()) if (!B.has(id)) removed++;
  return { added, removed, changed };
}
/** Versões a apagar: mais velhas que `keepDays`, mas a mais recente fica sempre. versions: [{ id, createdAt }] */
export function pruneVersions(versions, { now, keepDays }) {
  if (keepDays == null) return [];
  const sorted = [...versions].sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
  return sorted.slice(1).filter((v) => now - Date.parse(v.createdAt) > keepDays * 86_400_000).map((v) => v.id);
}

// ------------------------------------------------------------------ arquivos nos blocos
export const FILE_BLOCKS = ["image", "file", "video", "audio", "pdf"];
/** Ids de arquivo (add-on uploads) usados pelos blocos de arquivo. */
export function fileIdsInBlocks(blocks) { const out = new Set(); walkBlocks(blocks, (b) => { if (FILE_BLOCKS.includes(b?.type) && b.props?.fileId) out.add(b.props.fileId); }); return out; }
/** Arquivos que saíram do conteúdo (soltar a referência; o arquivo some quando nenhuma versão usa). */
export const filesToRelease = (prev, next) => { const n = fileIdsInBlocks(next); return [...fileIdsInBlocks(prev)].filter((id) => !n.has(id)); };

// ------------------------------------------------------------------ modelos
/** Troca {{data}}, {{hoje}}, {{autor}}, {{workspace}}; o que não conhece fica como está. */
export function fillTemplate(text, vars = {}) {
  return String(text ?? "").replace(/\{\{\s*(data|hoje|autor|workspace)\s*\}\}/g, (m, k) => {
    if (k === "data" || k === "hoje") return vars.today ? vars.today.slice(8, 10) + "/" + vars.today.slice(5, 7) + "/" + vars.today.slice(0, 4) : m;
    if (k === "autor") return vars.author ?? m;
    return vars.workspace ?? m;
  });
}
/** Página-modelo → página nova: títulos e textos preenchidos, ids novos, filhos junto. tree: { title, icon?, content, children?: [tree] } */
export function instantiatePageTemplate(tree, vars, newId) {
  const blocks = (bl) => (Array.isArray(bl) ? bl : []).map((b) => ({ ...b, id: newId(), content: Array.isArray(b.content) ? b.content.map((n) => (n?.type === "text" ? { ...n, text: fillTemplate(n.text, vars) } : n)) : b.content, children: blocks(b.children) }));
  const page = (t) => ({ title: fillTemplate(t.title, vars), icon: t.icon ?? null, content: blocks(t.content), children: (t.children ?? []).map(page) });
  return page(tree);
}

// ------------------------------------------------------------------ permissão por página
export const PERMISSION_LEVELS = ["none", "view", "comment", "edit", "full"];
const rank = (l) => PERMISSION_LEVELS.indexOf(l);
const maxLevel = (a, b) => (rank(a) >= rank(b) ? a : b);
/**
 * Nível de acesso: owner/admin = full; senão vale a página mais próxima (ela ou um ancestral) com `access`
 * ({ restricted, workspaceLevel?, grants: [{ type: "user" | "role", id, level }] }); sem nenhuma, full para membros.
 * pages: Map id → { parentId, access? }
 */
export function effectivePermission(pageId, pages, user) {
  if (["OWNER", "ADMIN"].includes(user.role)) return "full";
  let p = pages.get(pageId), guard = 0;
  while (p && !p.access && p.parentId && guard++ < 1000) p = pages.get(p.parentId);
  const a = p?.access;
  if (!a) return "full";
  let level = a.restricted ? "none" : (a.workspaceLevel ?? "full");
  for (const g of a.grants ?? []) if ((g.type === "user" && g.id === user.id) || (g.type === "role" && g.id === user.role)) level = maxLevel(level, g.level);
  return level;
}
const NEEDS = { view: "view", comment: "comment", edit: "edit", manage: "full" };
export const can = (level, action) => rank(level) >= rank(NEEDS[action] ?? "full");
export function validateAccess(a, { memberIds = [] } = {}) {
  const e = [];
  if (typeof a?.restricted !== "boolean") err(e, "RESTRICTED_REQUIRED", "Restrita ou aberta ao workspace", "restricted");
  if (a?.workspaceLevel != null && !PERMISSION_LEVELS.includes(a.workspaceLevel)) err(e, "LEVEL_INVALID", "Nível", "workspaceLevel");
  (a?.grants ?? []).forEach((g, i) => {
    if (!["user", "role"].includes(g?.type)) err(e, "GRANT_INVALID", "Pessoa ou papel", `grants.${i}.type`);
    else if (g.type === "user" && !memberIds.includes(g.id)) err(e, "NOT_MEMBER", "Pessoa não é membro do workspace", `grants.${i}.id`);
    else if (g.type === "role" && !["MEMBER", "ADMIN"].includes(g.id)) err(e, "ROLE_INVALID", "Papel", `grants.${i}.id`);
    if (!PERMISSION_LEVELS.includes(g?.level) || g?.level === "none") err(e, "LEVEL_INVALID", "Nível", `grants.${i}.level`);
  });
  return e;
}

// ------------------------------------------------------------------ databases: filtro, ordenação, calendário, galeria
const empty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
const dateStart = (v) => (v && typeof v === "object" ? v.start : v) ?? null;
/** Uma condição de filtro sobre a linha. prop: { id, type }, row: { title, properties } */
export function matchFilter(row, prop, f) {
  const v = prop ? row.properties?.[prop.id] : row.title;
  switch (f.op) {
    case "is_empty": return empty(v);
    case "is_not_empty": return !empty(v);
    case "checked": return v === true;
    case "unchecked": return v !== true;
    case "contains": return Array.isArray(v) ? v.includes(f.value) : String(v ?? "").toLowerCase().includes(String(f.value ?? "").toLowerCase());
    case "is": return Array.isArray(v) ? v.length === 1 && v[0] === f.value : v === f.value;
    case "is_not": return Array.isArray(v) ? !v.includes(f.value) : v !== f.value;
    case "gt": return typeof v === "number" && v > Number(f.value);
    case "lt": return typeof v === "number" && v < Number(f.value);
    case "before": return !!dateStart(v) && dateStart(v).slice(0, 10) < f.value;
    case "after": return !!dateStart(v) && dateStart(v).slice(0, 10) > f.value;
    default: return true;
  }
}
/** Filtro (todas as condições) e ordenação da visão. Vazios vão para o fim em qualquer direção. */
export function applyView(rows, props, config = {}) {
  const byId = new Map(props.map((p) => [p.id, p]));
  let out = rows.filter((r) => (config.filters ?? []).every((f) => matchFilter(r, byId.get(f.propertyId), f)));
  const sorts = config.sorts ?? [];
  if (sorts.length) {
    const val = (r, s) => { if (s.propertyId === "title") return r.title ?? ""; if (s.propertyId === "createdAt") return r.createdAt ?? ""; const v = r.properties?.[s.propertyId]; return dateStart(v) ?? v; };
    out = [...out].sort((a, b) => {
      for (const s of sorts) {
        const x = val(a, s), y = val(b, s);
        if (empty(x) && empty(y)) continue;
        if (empty(x)) return 1;
        if (empty(y)) return -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
        if (c) return s.direction === "desc" ? -c : c;
      }
      return 0;
    });
  }
  return out;
}
/** Calendário do mês ("AAAA-MM") pela propriedade de data: { days: { "AAAA-MM-DD": [ids] }, undated: [ids] } — período ocupa cada dia. */
export function calendarMonth(rows, propId, ym) {
  const days = {}, undated = [];
  const first = ym + "-01", last = addDays(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1)).toISOString().slice(0, 10), -1);
  for (const r of rows) {
    const v = r.properties?.[propId], s = dateStart(v)?.slice(0, 10);
    if (!s) { undated.push(r.id); continue; }
    const e = (v && typeof v === "object" && v.end ? v.end.slice(0, 10) : s);
    for (let d = s < first ? first : s, n = 0; d <= e && d <= last && n < 62; d = addDays(d, 1), n++) (days[d] ??= []).push(r.id);
  }
  return { days, undated };
}
/** Card da galeria: capa = propriedade URL escolhida, senão a primeira imagem do conteúdo. */
export function galleryCard(row, { coverPropId = null, content = [] } = {}) {
  let cover = coverPropId ? row.properties?.[coverPropId] ?? null : null;
  if (!cover) walkBlocks(content, (b) => { if (!cover && b?.type === "image") cover = b.props?.fileId ? { fileId: b.props.fileId } : b.props?.url ?? null; });
  return { id: row.id, title: row.title || "Sem título", cover };
}

// ------------------------------------------------------------------ relação e rollup
/** Valor de relação: lista de ids de linhas da database alvo, sem repetir, até `limit`. */
export function validateRelation(value, { targetRowIds = [], limit = 100 } = {}) {
  if (!Array.isArray(value)) return "Lista de linhas";
  if (new Set(value).size !== value.length) return "Linha repetida";
  if (value.length > limit) return `Até ${limit} linhas`;
  if (value.some((id) => !targetRowIds.includes(id))) return "Linha de outra database";
  return null;
}
/** O que muda do outro lado (relação de mão dupla). */
export const relationDiff = (prev = [], next = []) => ({ add: next.filter((x) => !prev.includes(x)), remove: prev.filter((x) => !next.includes(x)) });
export const ROLLUP_FNS = ["count", "count_empty", "sum", "avg", "min", "max", "percent_checked"];
/** Rollup dos valores da propriedade nas linhas relacionadas. */
export function rollup(values, fn) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  switch (fn) {
    case "count": return values.filter((v) => !empty(v)).length;
    case "count_empty": return values.filter(empty).length;
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "avg": return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null;
    case "min": return nums.length ? Math.min(...nums) : null;
    case "max": return nums.length ? Math.max(...nums) : null;
    case "percent_checked": return values.length ? Math.round((values.filter((v) => v === true).length / values.length) * 100) : null;
    default: return null;
  }
}

// ------------------------------------------------------------------ exportar
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const safeUrl = (u) => (/^(https?:|mailto:)/i.test(String(u ?? "")) ? String(u) : null);
function inlineHtml(content) {
  return (Array.isArray(content) ? content : []).map((n) => {
    if (n?.type === "text") { let t = esc(n.text); const s = n.styles ?? {}; if (s.code) t = `<code>${t}</code>`; if (s.bold) t = `<strong>${t}</strong>`; if (s.italic) t = `<em>${t}</em>`; if (s.underline) t = `<u>${t}</u>`; if (s.strike) t = `<s>${t}</s>`; return t; }
    if (n?.type === "link") { const u = safeUrl(n.href); return u ? `<a href="${esc(u)}">${inlineHtml(n.content)}</a>` : inlineHtml(n.content); }
    if (n?.type === "mention") return `@${esc(n.props?.name ?? "")}`;
    return "";
  }).join("");
}
/** HTML escapado do documento (base do PDF): títulos, listas, to-do, citação, código, divisor, imagem só http(s). */
export function blocksToHtml(blocks, { title = "" } = {}) {
  const out = [];
  const render = (bl) => {
    let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const b of Array.isArray(bl) ? bl : []) {
      const want = b.type === "bulletListItem" ? "ul" : b.type === "numberedListItem" ? "ol" : null;
      if (want !== list) { close(); if (want) { out.push(`<${want}>`); list = want; } }
      const inner = inlineHtml(b.content);
      if (want) { out.push(`<li>${inner}`); if (b.children?.length) render(b.children); out.push("</li>"); continue; }
      if (b.type === "heading") out.push(`<h${[1, 2, 3].includes(b.props?.level) ? b.props.level : 1}>${inner}</h${[1, 2, 3].includes(b.props?.level) ? b.props.level : 1}>`);
      else if (b.type === "checkListItem") out.push(`<p class="todo">${b.props?.checked ? "☑" : "☐"} ${inner}</p>`);
      else if (b.type === "quote") out.push(`<blockquote>${inner}</blockquote>`);
      else if (b.type === "codeBlock") out.push(`<pre><code>${inner}</code></pre>`);
      else if (b.type === "divider") out.push("<hr>");
      else if (b.type === "image") { const u = safeUrl(b.props?.url); if (u) out.push(`<img src="${esc(u)}" alt="${esc(b.props?.caption ?? "")}">`); }
      else out.push(`<p>${inner}</p>`);
      if (b.children?.length) render(b.children);
    }
    close();
  };
  render(blocks);
  return `<article><h1>${esc(title)}</h1>${out.join("")}</article>`;
}
function inlineMd(content) {
  return (Array.isArray(content) ? content : []).map((n) => {
    if (n?.type === "text") { let t = n.text ?? ""; const s = n.styles ?? {}; if (s.code) t = "`" + t + "`"; if (s.bold) t = `**${t}**`; if (s.italic) t = `*${t}*`; return t; }
    if (n?.type === "link") { const u = safeUrl(n.href); return u ? `[${inlineMd(n.content)}](${u})` : inlineMd(n.content); }
    if (n?.type === "mention") return "@" + (n.props?.name ?? "");
    return "";
  }).join("");
}
export function blocksToMarkdown(blocks, depth = 0) {
  const ind = "  ".repeat(depth), lines = [];
  let n = 0;
  for (const b of Array.isArray(blocks) ? blocks : []) {
    const t = inlineMd(b.content);
    n = b.type === "numberedListItem" ? n + 1 : 0;
    if (b.type === "heading") lines.push("#".repeat([1, 2, 3].includes(b.props?.level) ? b.props.level : 1) + " " + t);
    else if (b.type === "bulletListItem") lines.push(`${ind}- ${t}`);
    else if (b.type === "numberedListItem") lines.push(`${ind}${n}. ${t}`);
    else if (b.type === "checkListItem") lines.push(`${ind}- [${b.props?.checked ? "x" : " "}] ${t}`);
    else if (b.type === "quote") lines.push(`> ${t}`);
    else if (b.type === "codeBlock") lines.push("```\n" + t + "\n```");
    else if (b.type === "divider") lines.push("---");
    else if (b.type === "image") { const u = safeUrl(b.props?.url); if (u) lines.push(`![${b.props?.caption ?? ""}](${u})`); }
    else lines.push(ind + t);
    if (b.children?.length) lines.push(blocksToMarkdown(b.children, depth + 1));
  }
  return lines.join("\n");
}

// ------------------------------------------------------------------ perfil manual de processos: verificação
/** Página verificada vale `reviewEveryDays`; depois vence e pede revisão ao dono. */
export function verificationStatus({ verifiedAt = null, reviewEveryDays = 90 } = {}, now) {
  if (!verifiedAt) return { status: "unverified", expiresOn: null };
  const exp = new Date(Date.parse(verifiedAt) + reviewEveryDays * 86_400_000).toISOString().slice(0, 10);
  return { status: now > Date.parse(exp + "T23:59:59Z") ? "expired" : "verified", expiresOn: exp };
}

// ------------------------------------------------------------------ perfil base pública: endereço e utilidade
export function slugify(title) {
  return String(title ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "pagina";
}
export function uniqueSlug(base, taken) { const t = new Set(taken); if (!t.has(base)) return base; for (let i = 2; ; i++) if (!t.has(`${base}-${i}`)) return `${base}-${i}`; }
/** "Isso ajudou?": { yes, no, total, pct } (pct = sim sobre o total, inteiro). */
export function helpfulness(votes) { const yes = votes.filter((v) => v === true).length, no = votes.filter((v) => v === false).length, total = yes + no; return { yes, no, total, pct: total ? Math.round((yes / total) * 100) : null }; }

// ------------------------------------------------------------------ perfil atas: itens de ação → tarefas
/**
 * To-dos não marcados da ata viram tarefas: responsável = primeira menção a um membro; prazo = "hoje", "amanhã",
 * "dd/mm" (próxima ocorrência a partir de hoje) ou "dd/mm/aaaa"; o título sai sem a data ("até 20/11").
 * → [{ blockId, title, assigneeId, dueDate }]
 */
export function extractActionItems(blocks, { memberIds = [], today }) {
  const out = [];
  walkBlocks(blocks, (b) => {
    if (b?.type !== "checkListItem" || b.props?.checked) return;
    const assigneeId = (Array.isArray(b.content) ? b.content : []).find((n) => n?.type === "mention" && memberIds.includes(n.props?.userId))?.props?.userId ?? null;
    let text = (Array.isArray(b.content) ? b.content : []).map((n) => (n?.type === "text" ? n.text ?? "" : n?.type === "link" ? inlineText(n.content) : "")).join("");
    let dueDate = null;
    const rel = /(?:\s|^)(?:at[ée]\s+)?(hoje|amanh[ãa])(?![\p{L}\p{N}])/iu.exec(text);
    const abs = /(?:\s|^)(?:at[ée]\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?!\d)/i.exec(text);
    if (abs) {
      const d = Number(abs[1]), m = Number(abs[2]);
      let y = abs[3] ? Number(abs[3]) : Number(today.slice(0, 4));
      let iso = `${y}-${pad(m)}-${pad(d)}`;
      if (!abs[3] && isYmd(iso) && iso < today) { y++; iso = `${y}-${pad(m)}-${pad(d)}`; }
      if (isYmd(iso)) { dueDate = iso; text = text.replace(abs[0], " "); }
    } else if (rel) { dueDate = /^hoje$/i.test(rel[1]) ? today : addDays(today, 1); text = text.replace(rel[0], " "); }
    const title = text.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim().replace(/[,;:\-–]+$/, "").trim();
    if (title) out.push({ blockId: b.id, title, assigneeId, dueDate });
  });
  return out;
}

// ------------------------------------------------------------------ perfis
export const PAGE_SEGMENTS = {
  GENERAL: { label: "Documentos em geral", words: { page: "página", pages: "páginas", workspace: "workspace" }, on: [] },
  PROCESSES: { label: "Manual de processos", words: { page: "procedimento", pages: "procedimentos", workspace: "manual" }, on: ["verification", "history", "permissions", "templates", "read_receipts"] },
  KNOWLEDGE_BASE: { label: "Base de conhecimento pública", words: { page: "artigo", pages: "artigos", workspace: "central de ajuda" }, on: ["public_site", "helpfulness", "history", "templates"] },
  MEETINGS: { label: "Atas e reuniões", words: { page: "ata", pages: "atas", workspace: "reuniões" }, on: ["action_items", "templates", "comments", "calendar_view"] },
};
export const pageSegment = (id) => (PAGE_SEGMENTS[id] ? { id, ...PAGE_SEGMENTS[id] } : { id: "GENERAL", ...PAGE_SEGMENTS.GENERAL });
