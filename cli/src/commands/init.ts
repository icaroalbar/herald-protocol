import path from "node:path";
import { upsertEnvVars } from "../env-file.js";
import { defaultAsk } from "../prompt.js";

export interface InitDeps {
  /** Injetável pra testar sem simular stdin de verdade. */
  ask: (question: string) => Promise<string>;
  cwd?: string;
}

export async function runInit(deps: InitDeps = { ask: defaultAsk }): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();

  const dashboardUrl = (await deps.ask("URL do Dashboard (ex: http://localhost:4000): ")).trim();
  const outpostKey = (await deps.ask("Outpost key (gerada via `herald outpost create`): ")).trim();

  const envPath = path.join(cwd, ".env");
  await upsertEnvVars(envPath, {
    HERALD_DASHBOARD_URL: dashboardUrl,
    HERALD_OUTPOST_KEY: outpostKey,
  });

  console.log(`.env atualizado em ${envPath}`);
}
