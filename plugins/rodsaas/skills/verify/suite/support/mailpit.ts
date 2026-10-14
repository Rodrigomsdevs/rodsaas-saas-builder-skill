import { expect, type APIRequestContext } from "@playwright/test";
import { cfg } from "./config.mjs";
import { sleep } from "./api";

export type Email = { id: string; subject: string; text: string; html: string };

/** Espera um e-mail para `to` cujo conteúdo contenha `contains` (ex.: "/convite"). */
export async function waitForEmail(
  req: APIRequestContext,
  to: string,
  opts: { contains?: string; timeoutMs?: number } = {},
): Promise<Email> {
  const timeout = opts.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeout;
  const seen = new Map<string, Email>();
  while (Date.now() < deadline) {
    const res = await req.get(`${cfg.mailpitURL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`, {
      failOnStatusCode: false,
    });
    if (res.ok()) {
      const list: any[] = (await res.json()).messages ?? [];
      for (const m of list) {
        let full = seen.get(m.ID);
        if (!full) {
          const r = await req.get(`${cfg.mailpitURL}/api/v1/message/${m.ID}`, { failOnStatusCode: false });
          if (!r.ok()) continue;
          const j = await r.json();
          full = { id: m.ID, subject: j.Subject ?? "", text: j.Text ?? "", html: j.HTML ?? "" };
          seen.set(m.ID, full);
        }
        if (!opts.contains || `${full.text}\n${full.html}`.includes(opts.contains)) return full;
      }
    }
    await sleep(1000);
  }
  throw new Error(
    `nenhum e-mail para ${to}${opts.contains ? ` contendo "${opts.contains}"` : ""} em ${timeout / 1000}s. ` +
      `Confira: Mailpit em ${cfg.mailpitURL}, SMTP da API apontando para ele, e a fila de e-mails (pg-boss) rodando.`,
  );
}

/** Primeiro link do e-mail que contém `path`. */
export function linkFrom(email: Email, path: string): string {
  const all = `${email.text}\n${email.html}`.replace(/&amp;/g, "&");
  const links = all.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const link = links.find((l) => l.includes(path));
  expect(link, `link com "${path}" no e-mail "${email.subject}"`).toBeTruthy();
  return link as string;
}

/** Caminho + query de um link absoluto (para navegar usando a baseURL do painel). */
export const pathOf = (link: string) => {
  const u = new URL(link);
  return u.pathname + u.search;
};

/** Cabeçalhos de um e-mail do Mailpit (nome → valores). */
export async function emailHeaders(req: APIRequestContext, id: string): Promise<Record<string, string[]>> {
  const res = await req.get(`${cfg.mailpitURL}/api/v1/message/${id}/headers`, { failOnStatusCode: false });
  expect(res.ok(), `cabeçalhos do e-mail ${id} no Mailpit`).toBeTruthy();
  const raw = (await res.json()) as Record<string, string[]>;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
}
