import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { call, newUser, ok, register } from "../support/api";
import { cfg } from "../support/config.mjs";
import { newContext } from "../support/ui";

// Parte do add-on uploads (/rodsaas:uploads). Roda quando rodsaas.json tem "uploads" em addons ou a API tem /v1/files/usage.

async function uploadsInstalled(req: APIRequestContext) {
  if (cfg.addons.includes("uploads")) return true;
  return (await call(req, "GET", "/v1/files/usage")).status() !== 404;
}

async function expectStatus(res: APIResponse, status: number, label: string, code?: string) {
  const body = await res.text();
  expect(res.status(), `${label} → HTTP ${res.status()}: ${body.slice(0, 300)}`).toBe(status);
  if (code) expect(JSON.parse(body || "{}").code, `${label}: code`).toBe(code);
}

// PNG 1×1 de verdade
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>');
const HTML_AS_PNG = Buffer.from("<html><script>alert(1)</script></html>");

/** Fluxo completo: iniciar → enviar para a URL devolvida → concluir. */
async function upload(req: APIRequestContext, fileName: string, mimeType: string, bytes: Buffer, purpose = "task_attachment") {
  const start = await ok<any>(await call(req, "POST", "/v1/uploads", { fileName, size: bytes.length, mimeType, purpose }), `iniciar envio de ${fileName}`);
  expect(start.fileId && start.uploadUrl, "fileId e uploadUrl").toBeTruthy();
  const put = await req.fetch(start.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType, ...(start.headers ?? {}) }, data: bytes, failOnStatusCode: false });
  expect(put.status(), `enviar os bytes → HTTP ${put.status()}`).toBeLessThan(300);
  return { fileId: start.fileId as string, complete: () => call(req, "POST", `/v1/uploads/${start.fileId}/complete`) };
}

test.describe("Uploads", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await uploadsInstalled(request)), "projeto sem o add-on uploads");
  });

  test("API: enviar, concluir e abrir pela URL assinada; o uso do plano soma o arquivo", async ({ request }) => {
    await register(request, newUser("upl"));
    const before = await ok<any>(await call(request, "GET", "/v1/files/usage"), "uso");
    const up = await upload(request, "foto.png", "image/png", PNG);
    await ok(await up.complete(), "concluir");
    const link = await ok<any>(await call(request, "GET", `/v1/files/${up.fileId}/url`), "URL assinada");
    const res = await request.fetch(link.url, { failOnStatusCode: false });
    expect(res.status(), "arquivo abre pela URL").toBe(200);
    expect(Buffer.compare(await res.body(), PNG), "mesmos bytes").toBe(0);
    expect(res.headers()["x-content-type-options"] ?? "", "nosniff").toContain("nosniff");
    const after = await ok<any>(await call(request, "GET", "/v1/files/usage"), "uso depois");
    expect(after.usedBytes - before.usedBytes, "uso do plano soma o arquivo").toBe(PNG.length);
  });

  test("API: conteúdo que não bate com o tipo é recusado ao concluir", async ({ request }) => {
    await register(request, newUser("uplfake"));
    const up = await upload(request, "foto.png", "image/png", HTML_AS_PNG);
    const res = await up.complete();
    expect(res.status(), "HTML disfarçado de PNG").toBe(400);
    expect((await call(request, "GET", `/v1/files/${up.fileId}/url`)).status(), "arquivo recusado não abre").not.toBe(200);
  });

  test("API: tipo bloqueado e arquivo grande demais são recusados antes de enviar; SVG só baixa", async ({ request }) => {
    await register(request, newUser("uplrules"));
    await expectStatus(await call(request, "POST", "/v1/uploads", { fileName: "instalador.exe", size: 1000, mimeType: "application/octet-stream", purpose: "task_attachment" }), 415, "tipo bloqueado", "FILE_TYPE_NOT_ALLOWED");
    const usage = await ok<any>(await call(request, "GET", "/v1/files/usage"), "limites");
    await expectStatus(await call(request, "POST", "/v1/uploads", { fileName: "grande.pdf", size: usage.maxFileBytes + 1, mimeType: "application/pdf", purpose: "task_attachment" }), 413, "acima do limite do plano", "FILE_TOO_LARGE");

    const svg = await upload(request, "logo.svg", "image/svg+xml", SVG);
    await ok(await svg.complete(), "concluir SVG");
    const link = await ok<any>(await call(request, "GET", `/v1/files/${svg.fileId}/url`), "URL do SVG");
    const res = await request.fetch(link.url, { failOnStatusCode: false });
    expect(res.headers()["content-disposition"] ?? "", "SVG nunca inline (evita script)").toMatch(/attachment/i);
  });

  test("API: arquivo de outra empresa não abre (404)", async ({ request, browser }) => {
    await register(request, newUser("uplA"));
    const up = await upload(request, "contrato.png", "image/png", PNG);
    await ok(await up.complete(), "concluir");
    const other = await newContext(browser);
    await register(other.request, newUser("uplB"));
    expect((await call(other.request, "GET", `/v1/files/${up.fileId}/url`)).status(), "URL de arquivo de outra empresa").toBe(404);
    expect((await call(other.request, "POST", `/v1/uploads/${up.fileId}/complete`)).status(), "concluir envio de outra empresa").toBe(404);
    expect((await call(other.request, "DELETE", `/v1/uploads/${up.fileId}`)).status(), "cancelar envio de outra empresa").toBe(404);
    await other.close();
  });
});
