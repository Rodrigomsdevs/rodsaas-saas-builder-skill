import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { cfg } from "./support/config.mjs";

const chromium = process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {};

export default defineConfig({
  testDir: "./tests",
  // Em série: os testes criam contas e esbarram no rate limit de cadastro/login de propósito.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: join(cfg.reportDir, "artifacts"),
  reporter: [
    ["list"],
    ["html", { outputFolder: join(cfg.reportDir, "html"), open: "never" }],
    ["json", { outputFile: join(cfg.reportDir, "results.json") }],
  ],
  use: {
    baseURL: cfg.webURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // vídeo precisa do ffmpeg que vem com o Chromium do Playwright; com navegador do sistema (PW_CHROMIUM_PATH) fica desligado
    video: process.env.PW_CHROMIUM_PATH || process.env.PW_NO_VIDEO ? "off" : "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "api", testMatch: /00-api\.spec\.ts/ },
    {
      name: "ui",
      testIgnore: /00-api\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...chromium },
    },
  ],
});
