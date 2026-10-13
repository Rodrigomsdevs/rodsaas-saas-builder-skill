// rodsaas · tarefas — parsers de referência (sem dependências).
//
// Porte para TypeScript em web/src/features/tasks/lib/ mantendo o comportamento
// e copie os testes de parsers.test.mjs. Rode aqui com: node --test parsers.test.mjs
//
// - parseQuickAdd: "Revisar contrato @ana !alta #juridico amanhã ~3"
//     → título limpo + responsável, prioridade, etiquetas, prazo e estimativa
// - parseDuration: "1h30", "90min", "1,5" (horas), "1:30" → minutos
// - formatDuration: 90 → "1h 30min"

const strip = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const trimPunct = (s) => s.replace(/[.,;:!?)\]]+$/u, "");

// ------------------------------------------------------------------ datas
const WEEKDAYS = {
  domingo: 0,
  segunda: 1, "segunda-feira": 1,
  terca: 2, "terca-feira": 2,
  quarta: 3, "quarta-feira": 3,
  quinta: 4, "quinta-feira": 4,
  sexta: 5, "sexta-feira": 5,
  sabado: 6,
};

const toUTC = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day));
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

// ------------------------------------------------------------------ prioridade
const PRIORITIES = {
  urgente: "URGENT", "1": "URGENT",
  alta: "HIGH", "2": "HIGH",
  media: "MEDIUM", "3": "MEDIUM",
  baixa: "LOW", "4": "LOW",
};

// ------------------------------------------------------------------ pessoas
function resolveMember(q, members) {
  const norm = (m) => {
    const name = strip(m.name ?? "");
    const first = name.split(/\s+/)[0] ?? "";
    const local = strip((m.email ?? "").split("@")[0]);
    return { first, compact: name.replace(/\s+/g, ""), local };
  };
  const list = members.map((m) => ({ m, n: norm(m) }));
  const exact = list.filter(({ n }) => n.first === q || n.local === q || n.compact === q);
  if (exact.length === 1) return exact[0].m;
  if (exact.length > 1) return null;
  const prefix = list.filter(({ n }) => n.first.startsWith(q) || n.compact.startsWith(q) || n.local.startsWith(q));
  return prefix.length === 1 ? prefix[0].m : null;
}

/**
 * @param {string} input
 * @param {{ members?: {id:string,name:string,email?:string}[], labels?: {id:string,name:string}[],
 *           today: {year:number,month:number,day:number} }} ctx  today = data local da empresa
 */
export function parseQuickAdd(input, ctx) {
  const members = ctx.members ?? [];
  const labels = ctx.labels ?? [];
  const today = toUTC(ctx.today);

  const tokens = [...String(input).matchAll(/\S+/g)].map((m) => ({ raw: m[0], start: m.index, end: m.index + m[0].length }));
  const spans = [];
  const result = {
    title: "",
    assigneeId: null,
    priority: null,
    labelIds: [],
    newLabels: [],
    dueDate: null,
    estimate: null,
    unresolvedMentions: [],
    spans,
  };

  const take = (i, count, type, value) => {
    const first = tokens[i];
    const last = tokens[i + count - 1];
    spans.push({ type, value, start: first.start, end: last.end, raw: input.slice(first.start, last.end) });
    for (let k = i; k < i + count; k++) tokens[k].used = true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.used) continue;
    const w = strip(trimPunct(t.raw));
    const next = tokens[i + 1] ? strip(trimPunct(tokens[i + 1].raw)) : null;
    const next2 = tokens[i + 2] ? strip(trimPunct(tokens[i + 2].raw)) : null;

    // ---- datas (só a primeira vale)
    if (!result.dueDate) {
      let date = null;
      let count = 1;
      if (w === "depois" && next === "de" && next2 === "amanha") { date = addDays(today, 2); count = 3; }
      else if (w === "em" && /^\d{1,3}$/.test(next ?? "") && ["dia", "dias", "semana", "semanas"].includes(next2)) {
        const n = Number(next);
        date = addDays(today, next2.startsWith("semana") ? n * 7 : n);
        count = 3;
      }
      else if (w === "hoje") date = today;
      else if (w === "amanha") date = addDays(today, 1);
      else if (w in WEEKDAYS) {
        const target = WEEKDAYS[w];
        const diff = (target - today.getUTCDay() + 7) % 7 || 7; // sempre a próxima ocorrência, nunca hoje
        date = addDays(today, diff);
      } else {
        const m = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
        if (m) {
          const d = Number(m[1]);
          const mo = Number(m[2]);
          let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getUTCFullYear();
          let dt = validDate(y, mo, d);
          if (dt && !m[3] && dt < today) dt = validDate(y + 1, mo, d); // dd/mm que já passou → ano que vem
          date = dt;
        }
      }
      if (date) { result.dueDate = iso(date); take(i, count, "date", result.dueDate); i += count - 1; continue; }
    }

    // ---- @responsável (só no começo de palavra; e-mail no meio do texto não conta)
    const mention = t.raw.match(/^@([\p{L}\p{N}._-]+)$/u);
    if (mention && !result.assigneeId) {
      const q = strip(trimPunct(mention[1]));
      const member = resolveMember(q, members);
      if (member) { result.assigneeId = member.id; take(i, 1, "assignee", member.id); continue; }
      result.unresolvedMentions.push(mention[1]); // fica no título; a UI sugere quem pode ser
      continue;
    }

    // ---- !prioridade
    const prio = t.raw.match(/^!(\S+)$/u);
    if (prio && !result.priority) {
      const p = PRIORITIES[strip(trimPunct(prio[1]))];
      if (p) { result.priority = p; take(i, 1, "priority", p); continue; }
    }

    // ---- #etiqueta (precisa começar com letra: "issue #45" continua no título)
    const tag = t.raw.match(/^#(\p{L}[\p{L}\p{N}_-]*)$/u);
    if (tag) {
      const name = trimPunct(tag[1]);
      const found = labels.find((l) => strip(l.name).replace(/\s+/g, "-") === strip(name));
      if (found) { if (!result.labelIds.includes(found.id)) result.labelIds.push(found.id); take(i, 1, "label", found.id); }
      else { if (!result.newLabels.includes(name)) result.newLabels.push(name); take(i, 1, "new-label", name); }
      continue;
    }

    // ---- ~estimativa
    const est = t.raw.match(/^~(\d+(?:[.,]\d+)?)$/);
    if (est && result.estimate === null) {
      result.estimate = Number(est[1].replace(",", "."));
      take(i, 1, "estimate", result.estimate);
      continue;
    }
  }

  // título = texto original sem os trechos reconhecidos
  let title = "";
  let cursor = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    title += input.slice(cursor, s.start);
    cursor = s.end;
  }
  title += input.slice(cursor);
  result.title = title.replace(/\s+/g, " ").trim();
  return result;
}

// ------------------------------------------------------------------ duração
const MAX_MINUTES = 24 * 60;

/** "1h30" | "1h 30min" | "90m" | "90min" | "1,5" (horas) | "2" (horas) | "1:30" | "45 min" → minutos, ou null */
export function parseDuration(input) {
  const s = strip(input).replace(/\s+/g, "");
  if (!s) return null;
  let total = null;
  let m;
  if ((m = s.match(/^(\d{1,2}):([0-5]\d)$/))) total = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = s.match(/^(\d+)h([0-5]?\d)$/))) total = Number(m[1]) * 60 + Number(m[2]);
  else if (/^\d+h\d+$/.test(s)) return null; // "1h99": minutos fora de 0–59
  else if ((m = s.match(/^(?:(\d+(?:[.,]\d+)?)h)?(?:(\d+)(?:m|min|mins|minutos?))?$/)) && (m[1] || m[2])) {
    const h = m[1] ? Number(m[1].replace(",", ".")) : 0;
    total = Math.round(h * 60) + (m[2] ? Number(m[2]) : 0);
  } else if ((m = s.match(/^(\d+(?:[.,]\d+)?)(?:hs?|horas?)?$/))) total = Math.round(Number(m[1].replace(",", ".")) * 60);
  if (total === null || !Number.isFinite(total) || total <= 0 || total > MAX_MINUTES) return null;
  return total;
}

/** 90 → "1h 30min" · 120 → "2h" · 45 → "45min" · 0 → "0min" */
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}min`;
  if (h) return `${h}h`;
  return `${r}min`;
}
