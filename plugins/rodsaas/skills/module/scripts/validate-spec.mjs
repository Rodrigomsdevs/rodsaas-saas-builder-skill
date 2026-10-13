#!/usr/bin/env node
// rodsaas · valida a especificação de um módulo (rodsaas/modules/<nome>.json).
//
// Uso: node validate-spec.mjs <arquivo.json>
// Saída: lista de problemas em português; código 0 = válido, 1 = inválido.
// Relações são conferidas contra os outros arquivos .json da mesma pasta.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, basename, join } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("uso: node validate-spec.mjs <rodsaas/modules/nome.json>");
  process.exit(1);
}

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

let spec;
try {
  spec = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`✗ não consegui ler ${file} como JSON: ${e.message}`);
  process.exit(1);
}

// ------------------------------------------------------------------ catálogos
const TYPES = {
  text: { searchable: true, max: true },
  longtext: { searchable: true, max: true },
  integer: { numeric: true, sortable: true },
  decimal: { numeric: true, sortable: true },
  money: { numeric: true, sortable: true },
  percent: { numeric: true, sortable: true },
  boolean: {},
  date: { sortable: true },
  datetime: { sortable: true },
  status: { options: true },
  select: { options: true },
  tags: {},
  email: { searchable: true },
  phone: { searchable: true },
  url: {},
  cpf: { searchable: true },
  cnpj: { searchable: true },
  cpfCnpj: { searchable: true },
  cep: {},
  address: {},
  relation: {},
  user: {},
};
const FIELD_KEYS = new Set([
  "name", "label", "type", "required", "default", "unique", "max", "min",
  "list", "filter", "search", "sort", "help", "options", "target", "onDelete",
]);
const TOP_KEYS = new Set([
  "name", "model", "label", "route", "icon", "titleField", "fields", "defaultSort",
  "views", "boardField", "permissions", "planLimit", "audit",
]);
const AUTOMATIC = new Set(["id", "organizationId", "createdById", "createdBy", "createdAt", "updatedAt", "organization"]);
const RESERVED_NAMES = new Set([
  "users", "organizations", "memberships", "members", "invitations", "auth", "billing", "subscriptions",
  "audit", "auditLogs", "health", "me", "public", "search", "pages", "trash", "databases", "stripe",
]);
const RESERVED_ROUTES = new Set([
  "inicio", "entrar", "cadastro", "esqueci-senha", "redefinir-senha", "verificar-email", "convite",
  "configuracoes", "perfil", "sem-empresa", "pagina", "publico", "api", "docs",
]);
const ROLES = new Set(["OWNER", "ADMIN", "MEMBER"]);
const COLORS = new Set(["default", "info", "success", "warning", "destructive"]);

const isCamel = (s) => typeof s === "string" && /^[a-z][a-zA-Z0-9]{1,49}$/.test(s);
const isPascal = (s) => typeof s === "string" && /^[A-Z][a-zA-Z0-9]{1,49}$/.test(s);
const isKebab = (s) => typeof s === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 50;

// ------------------------------------------------------------------ topo
for (const k of Object.keys(spec)) if (!TOP_KEYS.has(k)) warn(`chave desconhecida no topo: "${k}" (será ignorada)`);

if (!isCamel(spec.name)) err(`name "${spec.name}" deve ser camelCase em inglês, no plural (ex.: appointments)`);
else {
  if (RESERVED_NAMES.has(spec.name)) err(`name "${spec.name}" é reservado pela base rodsaas`);
  if (!spec.name.endsWith("s")) warn(`name "${spec.name}" normalmente fica no plural (ex.: ${spec.name}s)`);
  const expected = basename(file, ".json");
  if (expected !== spec.name) err(`o arquivo deve se chamar ${spec.name}.json (hoje: ${basename(file)})`);
}
if (!isPascal(spec.model)) err(`model "${spec.model}" deve ser PascalCase no singular (ex.: Appointment)`);
else if (["User", "Organization", "Membership", "Invitation", "Subscription", "AuditLog", "Page"].includes(spec.model))
  err(`model "${spec.model}" já existe na base`);

const label = spec.label ?? {};
if (!label.singular || !label.plural) err(`label precisa de singular e plural (ex.: { "singular": "Agendamento", "plural": "Agendamentos", "gender": "m" })`);
if (!["m", "f"].includes(label.gender)) err(`label.gender deve ser "m" ou "f" (concordância: "Novo"/"Nova")`);

if (!isKebab(spec.route)) err(`route "${spec.route}" deve ser kebab-case em português (ex.: agendamentos)`);
else if (RESERVED_ROUTES.has(spec.route)) err(`route "${spec.route}" já é usada pela base`);

if (typeof spec.icon !== "string" || !/^[A-Z][A-Za-z0-9]+$/.test(spec.icon)) err(`icon deve ser o nome de um ícone do lucide em PascalCase (ex.: CalendarClock)`);

// ------------------------------------------------------------------ campos
const fields = Array.isArray(spec.fields) ? spec.fields : [];
if (!Array.isArray(spec.fields) || fields.length === 0) err("fields deve ser uma lista com pelo menos um campo");

const byName = new Map();
const moduleDir = dirname(file);
const siblings = existsSync(moduleDir)
  ? readdirSync(moduleDir).filter((f) => f.endsWith(".json")).map((f) => basename(f, ".json"))
  : [];

fields.forEach((f, i) => {
  const where = `campo ${i + 1}${f?.name ? ` (${f.name})` : ""}`;
  if (typeof f !== "object" || f === null) return err(`${where}: deve ser um objeto`);
  for (const k of Object.keys(f)) if (!FIELD_KEYS.has(k)) warn(`${where}: propriedade desconhecida "${k}"`);

  if (!isCamel(f.name)) err(`${where}: name deve ser camelCase (ex.: startsAt)`);
  else if (AUTOMATIC.has(f.name)) err(`${where}: "${f.name}" é criado automaticamente; remova da lista`);
  else if (byName.has(f.name)) err(`${where}: nome repetido`);
  else byName.set(f.name, f);
  if (f.type === "relation" && f.name?.endsWith("Id")) warn(`${where}: use o nome da relação sem "Id" (ex.: client); a coluna clientId é criada sozinha`);
  if (f.type === "address" && f.name !== "address") warn(`${where}: o tipo address gera colunas address*; prefira name "address"`);

  if (!f.label || typeof f.label !== "string") err(`${where}: label (rótulo em português) é obrigatório`);
  const t = TYPES[f.type];
  const UNSUPPORTED = {
    file: "arquivo/imagem depende do add-on de uploads (ainda não existe); use url por enquanto",
    image: "arquivo/imagem depende do add-on de uploads (ainda não existe); use url por enquanto",
    richtext: "texto rico não é suportado nesta versão; use longtext",
    manyToMany: "muitos-para-muitos não é suportado; use tags ou um módulo intermediário",
  };
  if (UNSUPPORTED[f.type]) return err(`${where}: ${UNSUPPORTED[f.type]}`);
  if (!t) return err(`${where}: tipo "${f.type}" não existe. Tipos: ${Object.keys(TYPES).join(", ")}`);

  if (f.search && !t.searchable) err(`${where}: search só vale para campos de texto (text, longtext, email, phone, cpf, cnpj, cpfCnpj)`);
  if (f.sort) {
    if (!t.sortable && f.type !== "text") err(`${where}: sort não vale para o tipo ${f.type}`);
    if (!f.required) err(`${where}: sort exige required: true (a paginação por cursor não lida com valores vazios)`);
  }
  if (f.type === "longtext" && (f.list || f.filter)) warn(`${where}: longtext não aparece na lista nem nos filtros (só no detalhe)`);
  if (f.unique && ["boolean", "longtext", "tags", "address", "status", "select"].includes(f.type)) err(`${where}: unique não faz sentido para ${f.type}`);
  if ((f.max !== undefined || f.min !== undefined) && !(t.max || t.numeric)) err(`${where}: max/min só valem para texto e números`);
  if (f.max !== undefined && typeof f.max !== "number") err(`${where}: max deve ser número`);
  if (f.min !== undefined && f.max !== undefined && f.min > f.max) err(`${where}: min maior que max`);

  if (t.options) {
    if (!Array.isArray(f.options) || f.options.length === 0) err(`${where}: ${f.type} precisa de options`);
    else {
      const values = new Set();
      f.options.forEach((o, j) => {
        const ow = `${where}, opção ${j + 1}`;
        if (f.type === "status" && !/^[A-Z][A-Z0-9_]*$/.test(o?.value ?? "")) err(`${ow}: value de status em MAIÚSCULAS_COM_UNDERLINE (ex.: SCHEDULED)`);
        if (f.type === "select" && (typeof o?.value !== "string" || !o.value)) err(`${ow}: value obrigatório`);
        if (values.has(o?.value)) err(`${ow}: value repetido "${o?.value}"`);
        values.add(o?.value);
        if (!o?.label) err(`${ow}: label obrigatório`);
        if (f.type === "status" && !COLORS.has(o?.color)) err(`${ow}: color deve ser ${[...COLORS].join(", ")}`);
      });
      if (f.default !== undefined && !values.has(f.default)) err(`${where}: default "${f.default}" não está nas options`);
    }
  } else if (f.options) err(`${where}: options só vale para status e select`);

  if (f.type === "relation") {
    if (!isCamel(f.target)) err(`${where}: target deve ser o name de outro módulo (ex.: clients)`);
    else if (f.target === spec.name) err(`${where}: relação com o próprio módulo não é suportada nesta versão`);
    else if (!siblings.includes(f.target)) err(`${where}: o módulo alvo "${f.target}" não existe em ${moduleDir}/ (crie ele primeiro)`);
    if (f.onDelete !== undefined && !["restrict", "cascade"].includes(f.onDelete)) err(`${where}: onDelete deve ser restrict ou cascade`);
  } else {
    if (f.target) err(`${where}: target só vale para relation`);
    if (f.onDelete) err(`${where}: onDelete só vale para relation`);
  }
});

// ------------------------------------------------------------------ título, ordenação, visões
const title = byName.get(spec.titleField);
if (!title) err(`titleField "${spec.titleField}" precisa ser um dos campos`);
else if (title.type !== "text" || !title.required) err(`titleField deve apontar para um campo text com required: true`);

if (spec.defaultSort !== undefined) {
  const s = spec.defaultSort;
  if (!s || !["asc", "desc"].includes(s.direction)) err(`defaultSort.direction deve ser asc ou desc`);
  if (s?.field !== "createdAt" && !byName.get(s?.field)?.sort) err(`defaultSort.field deve ser createdAt ou um campo com sort: true`);
}

const views = spec.views ?? ["table"];
if (!Array.isArray(views) || !views.includes("table") || views.some((v) => !["table", "board"].includes(v)))
  err(`views deve ser ["table"] ou ["table", "board"]`);
if (views.includes("board")) {
  const b = byName.get(spec.boardField);
  if (!b || b.type !== "status") err(`quadro exige boardField apontando para um campo do tipo status`);
} else if (spec.boardField) warn(`boardField sem a visão "board" será ignorado`);

// ------------------------------------------------------------------ permissões e plano
const perms = spec.permissions ?? {};
for (const action of ["create", "update", "delete"]) {
  const roles = perms[action];
  if (!Array.isArray(roles) || roles.length === 0) err(`permissions.${action} deve listar papéis (OWNER, ADMIN, MEMBER)`);
  else {
    for (const r of roles) if (!ROLES.has(r)) err(`permissions.${action}: papel desconhecido "${r}"`);
    if (!roles.includes("OWNER")) err(`permissions.${action}: OWNER precisa estar presente`);
  }
}
if (perms.onlyOwnRecords !== undefined && typeof perms.onlyOwnRecords !== "boolean") err(`permissions.onlyOwnRecords deve ser true ou false`);

if (spec.planLimit !== null && spec.planLimit !== undefined && !isCamel(spec.planLimit))
  err(`planLimit deve ser null ou uma chave camelCase (ex.: appointments)`);
if (spec.audit !== undefined && typeof spec.audit !== "boolean") err(`audit deve ser true ou false`);

// ------------------------------------------------------------------ resultado
for (const w of warnings) console.log(`! ${w}`);
if (errors.length) {
  for (const e of errors) console.log(`✗ ${e}`);
  console.log(`\n${errors.length} problema(s) em ${file}`);
  process.exit(1);
}
const counts = fields.reduce((acc, f) => ((acc[f.type] = (acc[f.type] ?? 0) + 1), acc), {});
console.log(`✓ ${file} válido — ${spec.label.plural}: ${fields.length} campos (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}), visões: ${views.join(" + ")}`);
