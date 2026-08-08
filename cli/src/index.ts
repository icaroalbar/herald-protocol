import path from "node:path";
import { runInit } from "./commands/init.js";
import { createOutpost } from "./commands/outpost-create.js";
import { listOutposts } from "./commands/outpost-list.js";
import { removeOutpost } from "./commands/outpost-remove.js";
import { inspectOutpost } from "./commands/outpost-inspect.js";
import { stopOutpost } from "./commands/outpost-stop.js";
import { startOutpost } from "./commands/outpost-start.js";
import { pruneReports } from "./commands/outpost-prune.js";
import { upsertEnvVars } from "./env-file.js";
import { resolveDatabaseUrl, provisionDatabase } from "./db.js";
import { saveDatabaseUrl } from "./config.js";
import { assertSecureServerUrl } from "@heraldserver/outpost";
import { defaultAsk, closePrompt } from "./prompt.js";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
      flags[key] = value;
    }
  }
  return flags;
}

function printHelp(): void {
  console.log(`Uso:
  herald configure        --database-url <url>
  herald outpost init     [--database-url <url>] --server-url <url> [--name <nome>] [--allow-insecure-http]
  herald outpost create   [--database-url <url>] [--name <nome>]
  herald outpost ls       [--database-url <url>]
  herald outpost stop     <id> [--database-url <url>]
  herald outpost start    <id> [--database-url <url>]
  herald outpost rm       <id> [--database-url <url>]
  herald outpost inspect  <id> [--database-url <url>]
  herald outpost prune    [<id>] --older-than-days <n> [--database-url <url>]
  herald init

  configure        roda uma vez, na instalação: aplica o schema no banco e salva a URL
                   em ~/.herald/config.json — comandos "outpost ..." seguintes não
                   precisam mais de --database-url. Sem a flag, pergunta interativamente
  outpost init     cria um novo Outpost direto no banco E grava/atualiza .env de uma vez
                   (tipo "docker run" — cria e configura junto)
  outpost create   só cria o Outpost, imprime id/name/key (pra colar em outro lugar
                   manualmente, ou copiar a key pra outra máquina)
  outpost ls       lista os Outposts cadastrados
  outpost stop     pausa um Outpost (tipo "docker stop") — key continua existindo, push
                   passa a ser rejeitado (403) até "outpost start". Reversível
  outpost start    retoma um Outpost pausado (tipo "docker start") — push volta a ser aceito
  outpost rm       remove/revoga um Outpost pra sempre (a key dele para de funcionar,
                   histórico de reports é apagado — irreversível, diferente de "stop")
  outpost inspect  mostra detalhes + o último snapshot de métricas recebido
  outpost prune    apaga reports mais antigos que --older-than-days (manual, sem cron —
                   sem <id>, poda de todos os Outposts; com, só desse). Irreversível
  init             pergunta a URL do Server + uma key já existente, grava/atualiza .env

  --database-url   connection string do Postgres — só é obrigatório em "herald configure";
                   depois disso é opcional em todo o resto (fallback: flag > DATABASE_URL
                   no ambiente > URL salva por "herald configure")
  --server-url     endereço HTTP do processo @heraldserver/server (só em "outpost init", vai
                   pro .env — é o que o Gateway usa em runtime pra empurrar métricas, nunca
                   toca o banco)
  --older-than-days   janela de retenção pro "outpost prune" — obrigatório, sem default
                      (ação destrutiva não tem valor mágico silencioso)
  --allow-insecure-http   permite --server-url em HTTP fora de localhost (a key viaja em
                          texto puro na rede) — só use se a conexão já está protegida por
                          outra camada (VPN/rede privada), nunca na internet pública`);
}

export async function runConfigureCommand(
  argv: string[],
  deps: { configPath?: string; ask?: (question: string) => Promise<string>; close?: () => void } = {}
): Promise<void> {
  const flags = parseFlags(argv);
  let databaseUrl = flags["database-url"];
  let prompted = false;

  try {
    if (!databaseUrl) {
      const ask = deps.ask ?? defaultAsk;
      databaseUrl = (await ask("URL do Postgres (ex: postgres://user:senha@host:5432/dbname): ")).trim();
      prompted = true;
    }
    if (!databaseUrl) {
      console.error("Faltou --database-url");
      process.exitCode = 1;
      return;
    }
    await provisionDatabase(databaseUrl);
    await saveDatabaseUrl(databaseUrl, deps.configPath);
    console.log("Banco configurado (schema aplicado) e URL salva.");
    console.log("Comandos `herald outpost ...` seguintes não precisam mais de --database-url.");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    if (prompted) (deps.close ?? closePrompt)();
  }
}

export async function runOutpostCreateCommand(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  let databaseUrl: string;
  try {
    databaseUrl = await resolveDatabaseUrl(flags);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  try {
    const result = await createOutpost({ databaseUrl, name: flags["name"] });
    console.log(`Outpost criado: ${result.name} (${result.id})`);
    console.log(`Key: ${result.key}`);
    console.log("Guarde esta key agora — ela não pode ser recuperada depois.");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runOutpostInitCommand(
  argv: string[],
  deps: { cwd?: string } = {}
): Promise<void> {
  const flags = parseFlags(argv);
  let databaseUrl: string;
  try {
    databaseUrl = await resolveDatabaseUrl(flags);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  if (!flags["server-url"]) {
    console.error("Faltou --server-url");
    process.exitCode = 1;
    return;
  }
  try {
    assertSecureServerUrl(flags["server-url"], "allow-insecure-http" in flags);

    const result = await createOutpost({ databaseUrl, name: flags["name"] });

    const envPath = path.join(deps.cwd ?? process.cwd(), ".env");
    await upsertEnvVars(envPath, {
      HERALD_SERVER_URL: flags["server-url"],
      HERALD_OUTPOST_KEY: result.key,
    });

    console.log(`Outpost criado: ${result.name} (${result.id})`);
    console.log(`.env atualizado em ${envPath}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runOutpostLsCommand(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  let databaseUrl: string;
  try {
    databaseUrl = await resolveDatabaseUrl(flags);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  try {
    const outposts = await listOutposts({ databaseUrl });
    if (!outposts.length) {
      console.log("Nenhum Outpost cadastrado.");
      return;
    }
    const idW = Math.max(12, ...outposts.map((o) => o.id.length)) + 2;
    const nameW = Math.max(20, ...outposts.map((o) => o.name.length)) + 2;
    const statusW = 9;
    console.log(
      `${"ID".padEnd(idW)}${"NOME".padEnd(nameW)}${"STATUS".padEnd(statusW)}${"HUMANO".padStart(8)}  ${"AGENTE".padStart(8)}  VISTO`
    );
    for (const o of outposts) {
      const status = o.active ? "active" : "stopped";
      console.log(
        `${o.id.padEnd(idW)}${o.name.padEnd(nameW)}${status.padEnd(statusW)}${String(o.humanRequests).padStart(8)}  ${String(o.agentRequests).padStart(8)}  ${o.lastSeenAt ?? "nunca"}`
      );
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runOutpostStopCommand(argv: string[]): Promise<void> {
  const [id, ...flagArgs] = argv;
  const flags = parseFlags(flagArgs);
  let databaseUrl: string;
  try {
    databaseUrl = await resolveDatabaseUrl(flags);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  if (!id) {
    console.error("Uso: herald outpost stop <id> --database-url <url>");
    process.exitCode = 1;
    return;
  }
  try {
    await stopOutpost(id, { databaseUrl });
    console.log(`Outpost ${id} parado.`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runOutpostStartCommand(argv: string[]): Promise<void> {
  const [id, ...flagArgs] = argv;
  const flags = parseFlags(flagArgs);
  let databaseUrl: string;
  try {
    databaseUrl = await resolveDatabaseUrl(flags);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  if (!id) {
    console.error("Uso: herald outpost start <id> --database-url <url>");
    process.exitCode = 1;
    return;
  }
  try {
    await startOutpost(id, { databaseUrl });
    console.log(`Outpost ${id} retomado.`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runOutpostRmCommand(argv: string[]): Promise<void> {
  const [id, ...flagArgs] = argv;
  const flags = parseFlags(flagArgs);
  let databaseUrl: string;
  try {
    databaseUrl = await resolveDatabaseUrl(flags);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  if (!id) {
    console.error("Uso: herald outpost rm <id> --database-url <url>");
    process.exitCode = 1;
    return;
  }
  try {
    await removeOutpost(id, { databaseUrl });
    console.log(`Outpost ${id} removido.`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runOutpostInspectCommand(argv: string[]): Promise<void> {
  const [id, ...flagArgs] = argv;
  const flags = parseFlags(flagArgs);
  let databaseUrl: string;
  try {
    databaseUrl = await resolveDatabaseUrl(flags);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  if (!id) {
    console.error("Uso: herald outpost inspect <id> --database-url <url>");
    process.exitCode = 1;
    return;
  }
  try {
    const detail = await inspectOutpost(id, { databaseUrl });
    console.log(JSON.stringify(detail, null, 2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runOutpostPruneCommand(argv: string[]): Promise<void> {
  const hasLeadingId = argv.length > 0 && !argv[0].startsWith("--");
  const idPrefix = hasLeadingId ? argv[0] : undefined;
  const flags = parseFlags(hasLeadingId ? argv.slice(1) : argv);

  let databaseUrl: string;
  try {
    databaseUrl = await resolveDatabaseUrl(flags);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  const olderThanDays = Number(flags["older-than-days"]);
  if (!flags["older-than-days"] || !Number.isFinite(olderThanDays) || olderThanDays <= 0) {
    console.error("Uso: herald outpost prune [<id>] --older-than-days <n> [--database-url <url>]");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await pruneReports(idPrefix, { databaseUrl, olderThanDays });
    console.log(`${result.deleted} report(s) apagado(s).`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runCli(argv: string[]): Promise<void> {
  const [command, sub, ...rest] = argv;

  if (command === "configure") return runConfigureCommand(argv.slice(1));
  if (command === "init") return runInit();
  if (command === "outpost" && sub === "init") return runOutpostInitCommand(rest);
  if (command === "outpost" && sub === "create") return runOutpostCreateCommand(rest);
  if (command === "outpost" && sub === "ls") return runOutpostLsCommand(rest);
  if (command === "outpost" && sub === "stop") return runOutpostStopCommand(rest);
  if (command === "outpost" && sub === "start") return runOutpostStartCommand(rest);
  if (command === "outpost" && sub === "rm") return runOutpostRmCommand(rest);
  if (command === "outpost" && sub === "inspect") return runOutpostInspectCommand(rest);
  if (command === "outpost" && sub === "prune") return runOutpostPruneCommand(rest);
  if (!command || command === "-h" || command === "--help") return printHelp();

  console.error(`Comando desconhecido: ${[command, sub].filter(Boolean).join(" ")}`);
  printHelp();
  process.exitCode = 1;
}
