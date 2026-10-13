import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { cfg } from "./config.mjs";

export type TestUser = { name: string; email: string; password: string; organizationName: string };

export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function newUser(tag = "user"): TestUser {
  const id = uniq();
  return {
    name: `Teste ${tag} ${id}`,
    email: `rodsaas.${tag}.${id}@example.com`,
    password: `Senha-forte-${id}`,
    organizationName: `Empresa ${tag} ${id}`,
  };
}

type CallOpts = { retry429?: boolean; origin?: string };

/**
 * Chama a API com o Origin do painel (exigido pela proteção CSRF) e, por padrão,
 * espera e repete quando bate no rate limit (429) — a bateria cria várias contas.
 */
export async function call(
  req: APIRequestContext,
  method: string,
  path: string,
  data?: unknown,
  opts: CallOpts = {},
): Promise<APIResponse> {
  const retry = opts.retry429 ?? true;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await req.fetch(cfg.apiURL + path, {
      method,
      headers: {
        Origin: opts.origin ?? cfg.webURL,
        ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      data: data !== undefined ? JSON.stringify(data) : undefined,
      failOnStatusCode: false,
    });
    if (res.status() !== 429 || !retry) return res;
    const wait = Number(res.headers()["retry-after"] ?? "15");
    await sleep(Math.min(Math.max(Number.isFinite(wait) ? wait : 15, 1), 65) * 1000);
  }
  throw new Error(`rate limit persistente em ${method} ${path}`);
}

/** Garante 2xx e devolve o JSON (mensagem de erro mostra o corpo da resposta). */
export async function ok<T = any>(res: APIResponse, label: string): Promise<T> {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 500)}`).toBeLessThan(300);
  return (body ? JSON.parse(body) : undefined) as T;
}

/** Lista de { data } ou array direto. */
export const items = <T = any>(body: any): T[] => (Array.isArray(body) ? body : (body?.data ?? []));

export async function register(req: APIRequestContext, u: TestUser, extra: Record<string, unknown> = {}) {
  const body: Record<string, unknown> = { name: u.name, email: u.email, password: u.password, ...extra };
  if (!("invitationToken" in extra)) body.organizationName = u.organizationName;
  return ok(await call(req, "POST", "/v1/auth/register", body), `cadastro de ${u.email}`);
}

export async function login(req: APIRequestContext, u: Pick<TestUser, "email" | "password">) {
  return ok(await call(req, "POST", "/v1/auth/login", { email: u.email, password: u.password }), `login de ${u.email}`);
}

export type Me = {
  user: { id: string; name: string; email: string; emailVerified?: boolean };
  organization: { id: string; name: string; role: string } | null;
  organizations: { id: string; name: string; role: string }[];
  plan?: { id: string; name: string; limits?: Record<string, number | null>; features?: string[] };
};

export async function me(req: APIRequestContext): Promise<Me> {
  return ok<Me>(await call(req, "GET", "/v1/me"), "GET /v1/me");
}

export async function createOrg(req: APIRequestContext, name: string) {
  return ok(await call(req, "POST", "/v1/organizations", { name }), `criar empresa "${name}"`);
}

export async function switchOrg(req: APIRequestContext, organizationId: string) {
  return ok(await call(req, "POST", "/v1/auth/switch-organization", { organizationId }), "trocar de empresa");
}

export async function createProject(req: APIRequestContext, name: string) {
  return ok<{ id: string; name: string }>(await call(req, "POST", "/v1/projects", { name }), `criar projeto "${name}"`);
}

/** A rota existe? Sem login, rota protegida responde 401; rota inexistente, 404. */
export async function routeExists(req: APIRequestContext, path: string) {
  const res = await call(req, "GET", path);
  return res.status() !== 404;
}

export const hasProjectsModule = (req: APIRequestContext) => routeExists(req, "/v1/projects");
