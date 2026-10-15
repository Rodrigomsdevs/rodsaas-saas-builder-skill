// Rode: node --test paginas-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as P from "./paginas-lib.mjs";

const codes = (e) => e.map((x) => x.code).sort();
const txt = (t, styles) => ({ type: "text", text: t, ...(styles ? { styles } : {}) });
const blk = (id, type, content = [], props = {}, children = []) => ({ id, type, props, content, children });

test("blocos: percorrer, texto e ids", () => {
  const doc = [blk("a", "paragraph", [txt("Olá "), { type: "link", href: "https://x.com", content: [txt("mundo")] }, { type: "mention", props: { userId: "u1", name: "Ana" } }], {}, [blk("b", "paragraph", [txt("filho")])])];
  const seen = []; P.walkBlocks(doc, (b, d) => seen.push([b.id, d]));
  assert.deepEqual(seen, [["a", 0], ["b", 1]]);
  assert.equal(P.inlineText(doc[0].content), "Olá mundo@Ana");
  assert.equal(P.inlineText("cru"), "cru");
  assert.equal(P.inlineText(null), "");
  assert.deepEqual([...P.blockIds(doc)], ["a", "b"]);
  P.walkBlocks(null, () => assert.fail());
});

test("comentários", () => {
  const ids = new Set(["b1"]);
  assert.deepEqual(P.validateComment({ body: "Ok", blockId: "b1", quote: "trecho" }, { blockIds: ids }), []);
  assert.deepEqual(P.validateComment({ body: "Na página" }), []);
  assert.deepEqual(codes(P.validateComment({ body: "  " })), ["BODY_REQUIRED"]);
  assert.deepEqual(codes(P.validateComment({ body: "x".repeat(5001) })), ["BODY_TOO_LONG"]);
  assert.deepEqual(P.validateComment({ body: "x".repeat(5000) }), []);
  assert.deepEqual(codes(P.validateComment({ body: "a", blockId: "zz" }, { blockIds: ids })), ["BLOCK_NOT_FOUND"]);
  assert.deepEqual(codes(P.validateComment({ body: "a", quote: "sem bloco" })), ["QUOTE_INVALID"]);
  assert.deepEqual(codes(P.validateComment({ body: "a", blockId: "b1", quote: "q".repeat(301) }, { blockIds: ids })), ["QUOTE_INVALID"]);
  assert.deepEqual(P.validateComment({ body: "a", blockId: "b1", quote: "q".repeat(300) }, { blockIds: ids }), []);
  assert.deepEqual(P.extractMentions("Oi @[Ana](u1) e @[Bia](u2), @[Ana](u1) de novo, @[Zé](u9)", ["u1", "u2"]), ["u1", "u2"]);
  assert.deepEqual(P.extractMentions(null), []);
  const c = { authorId: "u1", deletedAt: null };
  assert.equal(P.canEditComment(c, "u1"), true);
  assert.equal(P.canEditComment(c, "u2"), false);
  assert.equal(P.canEditComment({ ...c, deletedAt: "x" }, "u1"), false);
  assert.equal(P.canDeleteComment(c, "u2"), false);
  assert.equal(P.canDeleteComment(c, "u2", true), true);
  assert.equal(P.canDeleteComment(c, "u1"), true);
  assert.equal(P.canDeleteComment({ ...c, deletedAt: "x" }, "u1", true), false);
  assert.deepEqual(P.orphanedThreads([{ id: "t1", blockId: "b1" }, { id: "t2", blockId: "gone" }, { id: "t3", blockId: null }], [blk("b1", "paragraph")]), ["t2"]);
});

test("histórico: quando gravar, diferença e limpeza", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  assert.equal(P.shouldSnapshot(null, { now, authorId: "u1" }), true);
  const last = { authorId: "u1", createdAt: "2026-10-15T11:55:00Z" };
  assert.equal(P.shouldSnapshot(last, { now, authorId: "u1" }), false);
  assert.equal(P.shouldSnapshot(last, { now, authorId: "u2" }), true);
  assert.equal(P.shouldSnapshot({ ...last, createdAt: "2026-10-15T11:50:00Z" }, { now, authorId: "u1" }), true);
  assert.equal(P.shouldSnapshot({ ...last, createdAt: "2026-10-15T11:50:01Z" }, { now, authorId: "u1" }), false);
  assert.equal(P.shouldSnapshot(last, { now, authorId: "u1", minMinutes: 5 }), true);
  const a = [blk("1", "paragraph", [txt("a")]), blk("2", "paragraph", [txt("b")], {}, [blk("3", "paragraph", [txt("c")])])];
  const b = [blk("1", "paragraph", [txt("a")]), blk("2", "paragraph", [txt("B")], {}, [blk("3", "paragraph", [txt("c")])]), blk("4", "paragraph")];
  assert.deepEqual(P.diffBlocks(a, b), { added: 1, removed: 0, changed: 1 });
  assert.deepEqual(P.diffBlocks(b, a), { added: 0, removed: 1, changed: 1 });
  assert.deepEqual(P.diffBlocks(a, a), { added: 0, removed: 0, changed: 0 });
  assert.deepEqual(P.diffBlocks(a, [blk("1", "paragraph", [txt("a")]), blk("2", "paragraph", [txt("b")])]), { added: 0, removed: 1, changed: 0 }, "filho que saiu não muda o pai");
  const vs = [{ id: "v1", createdAt: "2026-01-01T00:00:00Z" }, { id: "v3", createdAt: "2026-10-14T00:00:00Z" }, { id: "v2", createdAt: "2026-06-01T00:00:00Z" }];
  assert.deepEqual(P.pruneVersions(vs, { now, keepDays: 30 }).sort(), ["v1", "v2"]);
  assert.deepEqual(P.pruneVersions(vs, { now, keepDays: null }), []);
  assert.deepEqual(P.pruneVersions([{ id: "old", createdAt: "2020-01-01T00:00:00Z" }], { now, keepDays: 7 }), [], "a mais recente fica");
  assert.deepEqual(P.pruneVersions(vs, { now, keepDays: 200 }), ["v1"]);
});

test("arquivos nos blocos", () => {
  const prev = [blk("1", "image", [], { fileId: "f1" }), blk("2", "paragraph", [], { fileId: "nao" }), blk("3", "file", [], { fileId: "f2" }, [blk("4", "pdf", [], { fileId: "f3" })]), blk("5", "image", [], { url: "https://x" })];
  assert.deepEqual([...P.fileIdsInBlocks(prev)].sort(), ["f1", "f2", "f3"]);
  assert.deepEqual(P.filesToRelease(prev, [blk("1", "image", [], { fileId: "f1" })]).sort(), ["f2", "f3"]);
  assert.deepEqual(P.filesToRelease(prev, prev), []);
});

test("modelos", () => {
  const vars = { today: "2026-10-15", author: "Ana", workspace: "Acme" };
  assert.equal(P.fillTemplate("Ata {{data}} · {{ autor }} · {{workspace}} · {{hoje}} · {{outro}}", vars), "Ata 15/10/2026 · Ana · Acme · 15/10/2026 · {{outro}}");
  assert.equal(P.fillTemplate("{{data}} {{autor}} {{workspace}}", {}), "{{data}} {{autor}} {{workspace}}");
  assert.equal(P.fillTemplate(null, vars), "");
  let n = 0; const id = () => "n" + ++n;
  const out = P.instantiatePageTemplate({ title: "Reunião {{data}}", icon: "📝", content: [blk("x", "heading", [txt("Pauta de {{autor}}"), { type: "mention", props: { userId: "u" } }], { level: 2 }, [blk("y", "paragraph", [txt("{{workspace}}")])])], children: [{ title: "Anexos", content: [] }] }, vars, id);
  assert.equal(out.title, "Reunião 15/10/2026");
  assert.equal(out.icon, "📝");
  assert.equal(out.content[0].id, "n1");
  assert.equal(out.content[0].content[0].text, "Pauta de Ana");
  assert.deepEqual(out.content[0].content[1], { type: "mention", props: { userId: "u" } });
  assert.equal(out.content[0].children[0].content[0].text, "Acme");
  assert.equal(out.content[0].children[0].id, "n2");
  assert.deepEqual(out.children, [{ title: "Anexos", icon: null, content: [], children: [] }]);
});

test("permissão por página", () => {
  const pages = new Map([
    ["root", { parentId: null }],
    ["rh", { parentId: "root", access: { restricted: true, grants: [{ type: "user", id: "u1", level: "edit" }, { type: "role", id: "MEMBER", level: "view" }] } }],
    ["rh-sal", { parentId: "rh" }],
    ["fin", { parentId: "root", access: { restricted: true, grants: [{ type: "user", id: "u2", level: "comment" }] } }],
    ["wiki", { parentId: "root", access: { restricted: false, workspaceLevel: "comment", grants: [{ type: "user", id: "u3", level: "full" }] } }],
    ["wiki-sub", { parentId: "wiki", access: { restricted: false } }],
  ]);
  const m = (id, role = "MEMBER") => ({ id, role });
  assert.equal(P.effectivePermission("root", pages, m("u9")), "full");
  assert.equal(P.effectivePermission("rh-sal", pages, m("u1")), "edit", "herda do pai");
  assert.equal(P.effectivePermission("rh-sal", pages, m("u9")), "view", "papel");
  assert.equal(P.effectivePermission("fin", pages, m("u9")), "none");
  assert.equal(P.effectivePermission("fin", pages, m("u2")), "comment");
  assert.equal(P.effectivePermission("fin", pages, m("u9", "ADMIN")), "full");
  assert.equal(P.effectivePermission("fin", pages, m("u9", "OWNER")), "full");
  assert.equal(P.effectivePermission("wiki", pages, m("u9")), "comment");
  assert.equal(P.effectivePermission("wiki", pages, m("u3")), "full");
  assert.equal(P.effectivePermission("wiki-sub", pages, m("u9")), "full", "a mais próxima vence");
  assert.equal(P.effectivePermission("nope", pages, m("u9")), "full");
  assert.equal(P.effectivePermission("rh", new Map([["rh", { parentId: null, access: { restricted: true, grants: [{ type: "user", id: "u1", level: "view" }, { type: "user", id: "u1", level: "edit" }] } }]]), m("u1")), "edit");
  assert.equal(P.can("view", "view"), true);
  assert.equal(P.can("view", "comment"), false);
  assert.equal(P.can("comment", "comment"), true);
  assert.equal(P.can("comment", "edit"), false);
  assert.equal(P.can("edit", "edit"), true);
  assert.equal(P.can("edit", "manage"), false);
  assert.equal(P.can("full", "manage"), true);
  assert.equal(P.can("none", "view"), false);
  assert.equal(P.can("full", "nada"), true);
  assert.equal(P.can("edit", "nada"), false);
  assert.deepEqual(P.validateAccess({ restricted: true, workspaceLevel: "view", grants: [{ type: "user", id: "u1", level: "edit" }, { type: "role", id: "ADMIN", level: "full" }] }, { memberIds: ["u1"] }), []);
  assert.deepEqual(codes(P.validateAccess({ grants: [{ type: "x" }, { type: "user", id: "u9", level: "none" }, { type: "role", id: "OWNER", level: "edit" }] }, { memberIds: ["u1"] })), ["GRANT_INVALID", "LEVEL_INVALID", "LEVEL_INVALID", "NOT_MEMBER", "RESTRICTED_REQUIRED", "ROLE_INVALID"]);
  assert.deepEqual(codes(P.validateAccess({ restricted: false, workspaceLevel: "dono" })), ["LEVEL_INVALID"]);
  assert.deepEqual(codes(P.validateAccess({ restricted: true, grants: [{ type: "role", id: "MEMBER", level: "admin" }] })), ["LEVEL_INVALID"]);
  assert.deepEqual(P.validateAccess({ restricted: false, grants: [{ type: "role", id: "MEMBER", level: "view" }] }), []);
});

test("databases: filtro e ordenação", () => {
  const props = [{ id: "st", type: "SELECT" }, { id: "n", type: "NUMBER" }, { id: "d", type: "DATE" }, { id: "ok", type: "CHECKBOX" }, { id: "tags", type: "MULTI_SELECT" }, { id: "t", type: "TEXT" }];
  const rows = [
    { id: "r1", title: "Beta", createdAt: "2", properties: { st: "a", n: 5, d: { start: "2026-10-10" }, ok: true, tags: ["x", "y"], t: "Relatório Mensal" } },
    { id: "r2", title: "alfa", createdAt: "1", properties: { st: "b", n: 1, d: { start: "2026-10-20T10:00:00Z" }, ok: false, tags: ["x"], t: "" } },
    { id: "r3", title: "Gama", createdAt: "3", properties: { st: "a", tags: [] } },
  ];
  const ids = (cfg) => P.applyView(rows, props, cfg).map((r) => r.id);
  const f = (propertyId, op, value) => ids({ filters: [{ propertyId, op, value }] });
  assert.deepEqual(f("st", "is", "a"), ["r1", "r3"]);
  assert.deepEqual(f("st", "is_not", "a"), ["r2"]);
  assert.deepEqual(f("tags", "contains", "y"), ["r1"]);
  assert.deepEqual(f("tags", "is", "x"), ["r2"]);
  assert.deepEqual(f("tags", "is_not", "y"), ["r2", "r3"]);
  assert.deepEqual(f("t", "contains", "relatório"), ["r1"]);
  assert.deepEqual(f("title", "contains", "AL"), ["r2"]);
  assert.deepEqual(f("t", "is_empty"), ["r2", "r3"]);
  assert.deepEqual(f("tags", "is_empty"), ["r3"]);
  assert.deepEqual(f("t", "is_not_empty"), ["r1"]);
  assert.deepEqual(f("ok", "checked"), ["r1"]);
  assert.deepEqual(f("ok", "unchecked"), ["r2", "r3"]);
  assert.deepEqual(f("n", "gt", "1"), ["r1"]);
  assert.deepEqual(f("n", "lt", "5"), ["r2"]);
  assert.deepEqual(f("d", "before", "2026-10-20"), ["r1"]);
  assert.deepEqual(f("d", "after", "2026-10-10"), ["r2"]);
  assert.deepEqual(f("st", "op-desconhecida"), ["r1", "r2", "r3"]);
  assert.deepEqual(f("d", "after", "2026-10-20"), [], "compara só o dia");
  assert.equal(P.matchFilter({ properties: { ok: "sim" } }, { id: "ok" }, { op: "checked" }), false);
  assert.equal(P.matchFilter({ properties: { n: null } }, { id: "n" }, { op: "lt", value: "5" }), false);
  assert.deepEqual(P.applyView([{ id: "a", title: "A", properties: {} }, { id: "b", title: "B", properties: {} }], props, { sorts: [{ propertyId: "n", direction: "asc" }, { propertyId: "title", direction: "desc" }] }).map((r) => r.id), ["b", "a"], "dois vazios desempatam pela próxima");
  assert.deepEqual(ids({ filters: [{ propertyId: "st", op: "is", value: "a" }, { propertyId: "ok", op: "checked" }] }), ["r1"], "todas as condições");
  assert.deepEqual(ids({ sorts: [{ propertyId: "n", direction: "asc" }] }), ["r2", "r1", "r3"], "vazio no fim");
  assert.deepEqual(ids({ sorts: [{ propertyId: "n", direction: "desc" }] }), ["r1", "r2", "r3"], "vazio no fim também ao contrário");
  assert.deepEqual(ids({ sorts: [{ propertyId: "title", direction: "asc" }] }), ["r2", "r1", "r3"], "ordem do português sem diferenciar maiúscula");
  assert.deepEqual(ids({ sorts: [{ propertyId: "createdAt", direction: "desc" }] }), ["r3", "r1", "r2"]);
  assert.deepEqual(ids({ sorts: [{ propertyId: "d", direction: "desc" }] }), ["r2", "r1", "r3"]);
  assert.deepEqual(ids({ sorts: [{ propertyId: "st", direction: "asc" }, { propertyId: "title", direction: "desc" }] }), ["r3", "r1", "r2"], "desempate pela segunda");
  assert.deepEqual(ids({ sorts: [{ propertyId: "ok", direction: "asc" }, { propertyId: "title", direction: "asc" }] }).length, 3);
  assert.deepEqual(ids({}), ["r1", "r2", "r3"]);
  assert.deepEqual(P.applyView([{ id: "a", properties: {} }, { id: "b", properties: {} }], props, { sorts: [{ propertyId: "n", direction: "asc" }] }).map((r) => r.id), ["a", "b"]);
});

test("databases: calendário e galeria", () => {
  const rows = [
    { id: "a", properties: { d: { start: "2026-10-30", end: "2026-11-02" } } },
    { id: "b", properties: { d: { start: "2026-09-29", end: "2026-10-01" } } },
    { id: "c", properties: { d: "2026-10-15T10:00:00Z" } },
    { id: "e", properties: {} },
    { id: "f", properties: { d: { start: "2026-12-01" } } },
  ];
  const cal = P.calendarMonth(rows, "d", "2026-10");
  assert.deepEqual(cal.days, { "2026-10-30": ["a"], "2026-10-31": ["a"], "2026-10-01": ["b"], "2026-10-15": ["c"] });
  assert.deepEqual(cal.undated, ["e"]);
  assert.deepEqual(P.calendarMonth(rows, "d", "2026-02").days, {});
  assert.deepEqual(Object.keys(P.calendarMonth([{ id: "x", properties: { d: { start: "2026-02-27", end: "2026-03-03" } } }], "d", "2026-02").days), ["2026-02-27", "2026-02-28"]);
  const content = [blk("1", "paragraph"), blk("2", "image", [], { url: "https://img/a.png" }), blk("3", "image", [], { url: "https://img/b.png" })];
  assert.deepEqual(P.galleryCard({ id: "r", title: "", properties: {} }, { content }), { id: "r", title: "Sem título", cover: "https://img/a.png" });
  assert.deepEqual(P.galleryCard({ id: "r", title: "Casa", properties: { capa: "https://c" } }, { coverPropId: "capa", content }), { id: "r", title: "Casa", cover: "https://c" });
  assert.deepEqual(P.galleryCard({ id: "r", title: "X", properties: {} }, { coverPropId: "capa", content: [blk("1", "image", [], { fileId: "f1" })] }).cover, { fileId: "f1" });
  assert.equal(P.galleryCard({ id: "r", title: "X", properties: {} }).cover, null);
});

test("relação e rollup", () => {
  assert.equal(P.validateRelation(["a", "b"], { targetRowIds: ["a", "b", "c"] }), null);
  assert.equal(P.validateRelation("a", { targetRowIds: ["a"] }), "Lista de linhas");
  assert.equal(P.validateRelation(["a", "a"], { targetRowIds: ["a"] }), "Linha repetida");
  assert.equal(P.validateRelation(["z"], { targetRowIds: ["a"] }), "Linha de outra database");
  assert.equal(P.validateRelation(["a", "b"], { targetRowIds: ["a", "b"], limit: 1 }), "Até 1 linhas");
  assert.equal(P.validateRelation(["a"], { targetRowIds: ["a"], limit: 1 }), null);
  assert.equal(P.validateRelation([]), null);
  assert.deepEqual(P.relationDiff(["a", "b"], ["b", "c"]), { add: ["c"], remove: ["a"] });
  assert.deepEqual(P.relationDiff(undefined, ["x"]), { add: ["x"], remove: [] });
  const v = [3, null, 5, "", 2.5, true, false, true, []];
  assert.equal(P.rollup(v, "count"), 6);
  assert.equal(P.rollup(v, "count_empty"), 3);
  assert.equal(P.rollup(v, "sum"), 10.5);
  assert.equal(P.rollup(v, "avg"), 3.5);
  assert.equal(P.rollup([1, 2, 2], "avg"), 1.67);
  assert.equal(P.rollup(v, "min"), 2.5);
  assert.equal(P.rollup(v, "max"), 5);
  assert.equal(P.rollup([true, false, true, true], "percent_checked"), 75);
  assert.equal(P.rollup([], "percent_checked"), null);
  assert.equal(P.rollup([true, "x"], "percent_checked"), 50);
  assert.equal(P.rollup([], "avg"), null);
  assert.equal(P.rollup(["a"], "min"), null);
  assert.equal(P.rollup(["a"], "max"), null);
  assert.equal(P.rollup([1], "x"), null);
  assert.equal(P.rollup([Infinity, 1], "sum"), 1);
});

test("exportar HTML (para o PDF) e Markdown", () => {
  const doc = [
    blk("1", "heading", [txt("Título <b>")], { level: 2 }),
    blk("2", "paragraph", [txt("negrito", { bold: true }), txt(" "), txt("it", { italic: true }), txt(" "), txt("c", { code: true }), txt(" "), txt("u", { underline: true }), txt(" "), txt("s", { strike: true }), txt(" "), { type: "link", href: "javascript:alert(1)", content: [txt("ruim")] }, txt(" "), { type: "link", href: "https://ok.com/?a=1&b=2", content: [txt("bom")] }, { type: "mention", props: { name: "Ana" } }]),
    blk("3", "bulletListItem", [txt("a")]), blk("4", "bulletListItem", [txt("b")], {}, [blk("4a", "bulletListItem", [txt("b1")])]),
    blk("5", "numberedListItem", [txt("um")]), blk("6", "numberedListItem", [txt("dois")]),
    blk("7", "checkListItem", [txt("feito")], { checked: true }), blk("8", "checkListItem", [txt("falta")]),
    blk("9", "quote", [txt("cit")]), blk("10", "codeBlock", [txt("<x>")]), blk("11", "divider"),
    blk("12", "image", [], { url: "https://img/a.png", caption: "Foto \"1\"" }), blk("13", "image", [], { url: "javascript:x" }),
    blk("14", "heading", [txt("H")], { level: 9 }), blk("15", "paragraph", [txt("pai")], {}, [blk("16", "paragraph", [txt("filho")])]),
  ];
  const html = P.blocksToHtml(doc, { title: "Doc & <script>" });
  assert.ok(html.startsWith("<article><h1>Doc &amp; &lt;script&gt;</h1><h2>Título &lt;b&gt;</h2>"));
  assert.ok(html.includes("<strong>negrito</strong> <em>it</em> <code>c</code> <u>u</u> <s>s</s> ruim <a href=\"https://ok.com/?a=1&amp;b=2\">bom</a>@Ana"));
  assert.ok(!html.includes("javascript"));
  assert.ok(html.includes("<ul><li>a</li><li>b<ul><li>b1</li></ul></li></ul><ol><li>um</li><li>dois</li></ol>"));
  assert.ok(html.includes('<p class="todo">☑ feito</p><p class="todo">☐ falta</p><blockquote>cit</blockquote><pre><code>&lt;x&gt;</code></pre><hr><img src="https://img/a.png" alt="Foto &quot;1&quot;"><h1>H</h1><p>pai</p><p>filho</p></article>'));
  assert.equal(P.blocksToHtml([]), "<article><h1></h1></article>");
  const md = P.blocksToMarkdown(doc);
  assert.equal(md, [
    "## Título <b>", "**negrito** *it* `c` u s ruim [bom](https://ok.com/?a=1&b=2)@Ana", "- a", "- b", "  - b1", "1. um", "2. dois",
    "- [x] feito", "- [ ] falta", "> cit", "```\n<x>\n```", "---", "![Foto \"1\"](https://img/a.png)", "# H", "pai", "  filho",
  ].join("\n"));
  assert.equal(P.blocksToMarkdown([blk("a", "numberedListItem", [txt("x")]), blk("b", "paragraph", [txt("p")]), blk("c", "numberedListItem", [txt("y")])]), "1. x\np\n1. y");
});

test("perfil manual de processos: verificação", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  assert.deepEqual(P.verificationStatus({}, now), { status: "unverified", expiresOn: null });
  assert.deepEqual(P.verificationStatus({ verifiedAt: "2026-09-01T10:00:00Z", reviewEveryDays: 30 }, now), { status: "expired", expiresOn: "2026-10-01" });
  assert.deepEqual(P.verificationStatus({ verifiedAt: "2026-09-15T10:00:00Z", reviewEveryDays: 30 }, now), { status: "verified", expiresOn: "2026-10-15" }, "vale até o fim do dia");
  assert.deepEqual(P.verificationStatus({ verifiedAt: "2026-07-20T00:00:00Z" }, now), { status: "verified", expiresOn: "2026-10-18" }, "padrão 90 dias");
  assert.equal(P.verificationStatus({ verifiedAt: "2026-07-01T00:00:00Z" }, now).status, "expired");
});

test("perfil base pública: endereço e utilidade", () => {
  assert.equal(P.slugify("Como emitir a 2ª via do boleto?"), "como-emitir-a-2-via-do-boleto");
  assert.equal(P.slugify("  Ação & Reação  "), "acao-reacao");
  assert.equal(P.slugify("!!!"), "pagina");
  assert.equal(P.slugify(null), "pagina");
  assert.equal(P.slugify("a".repeat(100)).length, 80);
  assert.equal(P.uniqueSlug("faq", []), "faq");
  assert.equal(P.uniqueSlug("faq", ["faq", "faq-2"]), "faq-3");
  assert.equal(P.uniqueSlug("faq", ["faq", "faq-3"]), "faq-2");
  assert.deepEqual(P.helpfulness([true, true, false, null]), { yes: 2, no: 1, total: 3, pct: 67 });
  assert.deepEqual(P.helpfulness([]), { yes: 0, no: 0, total: 0, pct: null });
});

test("perfil atas: itens de ação viram tarefas", () => {
  const men = (userId, name) => ({ type: "mention", props: { userId, name } });
  const doc = [
    blk("h", "heading", [txt("Ações")]),
    blk("a1", "checkListItem", [txt("Enviar proposta "), men("u1", "Ana"), txt(" até 20/11")]),
    blk("a2", "checkListItem", [txt("Revisar contrato até 05/01/2027 "), men("u9", "Fora")]),
    blk("a3", "checkListItem", [txt("Ligar para o cliente amanhã")]),
    blk("a4", "checkListItem", [txt("Já feito")], { checked: true }),
    blk("a5", "checkListItem", [txt("Agendar visita 10/10")], {}, [blk("a6", "checkListItem", [men("u2", "Bia"), txt(" Comprar material hoje")])]),
    blk("a7", "checkListItem", [txt("Data inválida 31/02")]),
    blk("a8", "checkListItem", [txt("   ")]),
    blk("a9", "checkListItem", [{ type: "link", href: "https://x", content: [txt("Ler o link")] }, txt(" - ")]),
  ];
  const out = P.extractActionItems(doc, { memberIds: ["u1", "u2"], today: "2026-10-15" });
  assert.deepEqual(out, [
    { blockId: "a1", title: "Enviar proposta", assigneeId: "u1", dueDate: "2026-11-20" },
    { blockId: "a2", title: "Revisar contrato", assigneeId: null, dueDate: "2027-01-05" },
    { blockId: "a3", title: "Ligar para o cliente", assigneeId: null, dueDate: "2026-10-16" },
    { blockId: "a5", title: "Agendar visita", assigneeId: null, dueDate: "2027-10-10" },
    { blockId: "a6", title: "Comprar material", assigneeId: "u2", dueDate: "2026-10-15" },
    { blockId: "a7", title: "Data inválida 31/02", assigneeId: null, dueDate: null },
    { blockId: "a9", title: "Ler o link", assigneeId: null, dueDate: null },
  ]);
  assert.deepEqual(P.extractActionItems([blk("x", "checkListItem", [txt("Hoje é dia de pagar 15/10")])], { today: "2026-10-15" }), [{ blockId: "x", title: "Hoje é dia de pagar", assigneeId: null, dueDate: "2026-10-15" }]);
});

test("perfis de segmento", () => {
  assert.deepEqual(Object.keys(P.PAGE_SEGMENTS), ["GENERAL", "PROCESSES", "KNOWLEDGE_BASE", "MEETINGS"]);
  assert.ok(P.pageSegment("PROCESSES").on.includes("verification"));
  assert.ok(P.pageSegment("KNOWLEDGE_BASE").on.includes("public_site"));
  assert.ok(P.pageSegment("MEETINGS").on.includes("action_items"));
  assert.equal(P.pageSegment("MEETINGS").words.pages, "atas");
  assert.equal(P.pageSegment("x").id, "GENERAL");
  assert.deepEqual(P.pageSegment(undefined).on, []);
  assert.equal(P.pageSegment("KNOWLEDGE_BASE").id, "KNOWLEDGE_BASE");
});
