import path from "node:path";
import { upsertEnvVars } from "../env-file.js";
import { defaultAsk, closePrompt } from "../prompt.js";

export interface InitDeps {
  /** Injetável pra testar sem simular stdin de verdade. */
  ask: (question: string) => Promise<string>;
  /** Chamado uma vez ao final, depois do último ask() — fecha a interface readline
   * compartilhada (ver prompt.ts). Sem efeito com um `ask` de teste (não usa readline). */
  close?: () => void;
  cwd?: string;
}

export async function runInit(deps: InitDeps = { ask: defaultAsk, close: closePrompt }): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();

  try {
    const serverUrl = (await deps.ask("URL do Server (ex: http://localhost:4000): ")).trim();
    const outpostKey = (await deps.ask("Outpost key (gerada via `herald outpost create`): ")).trim();

    const envPath = path.join(cwd, ".env");
    await upsertEnvVars(envPath, {
      HERALD_SERVER_URL: serverUrl,
      HERALD_OUTPOST_KEY: outpostKey,
    });

    console.log(`.env atualizado em ${envPath}`);
  } finally {
    deps.close?.();
  }
}
