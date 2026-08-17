import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

function readDevVar(name: string): string {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  if (!existsSync(".dev.vars")) return "";
  for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match?.[1] === name) return match[2].replace(/^["']|["']$/g, "").trim();
  }
  return "";
}

const APP_PASSWORD = readDevVar("ANCLA_PASSWORD") || readDevVar("APP_PASSWORD");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    extraHTTPHeaders: { Origin: "http://127.0.0.1:5173" },
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "iphone-safari",
      testMatch: /mobile.*\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "api",
      testMatch: /(api|stress|clock|sync).*\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
    },
  ],
});

export { APP_PASSWORD };
