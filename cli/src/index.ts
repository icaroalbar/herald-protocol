import path from "node:path";
import { runInit } from "./commands/init.js";
import { createOutpost } from "./commands/outpost-create.js";
import { listOutposts } from "./commands/outpost-list.js";
import { removeOutpost } from "./commands/outpost-remove.js";
import { inspectOutpost } from "./commands/outpost-inspect.js";
import { upsertEnvVars } from "./env-file.js";

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
  herald outpost init    --dashboard-url <url> [--name <nome>] [--allow-insecure-http]
  herald outpost create  --dashboard-url <url> [--name <nome>] [--allow-insecure-http]
  herald outpost ls      --dashboard-url <url>
  herald outpost rm      <id> --dashboard-url <url>
  herald outpost inspect <id> --dashboard-url <url>
  herald init

  outpost init     cria um novo Outpost no Dashboard E grava/atualiza .env de uma vez
                   (tipo "docker run" — cria e configura junto)
  outpost create   só cria o Outpost, imprime id/name/key (pra colar em outro lugar
                   manualmente, ou copiar a key pra outra máquina)
  outpost ls       lista os Outposts cadastrados
  outpost rm       remove/revoga um Outpost (a key dele para de funcionar)
  outpost inspect  mostra detalhes + o último snapshot de métricas recebido
  init             pergunta a URL do Dashboard + uma key já existente, grava/atualiza .env

  --allow-insecure-http   permite dashboardUrl em HTTP fora de localhost (a key viaja em
                          texto puro na rede) — só use se a conexão já está protegida por
                          outra camada (VPN/rede privada), nunca na internet pública`);
}

export async function runOutpostCreateCommand(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  if (!flags["dashboard-url"]) {
    console.error("Faltou --dashboard-url");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await createOutpost({
      dashboardUrl: flags["dashboard-url"],
      name: flags["name"],
      allowInsecureHttp: "allow-insecure-http" in flags,
    });
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
  deps: { cwd?: string; fetchImpl?: typeof fetch } = {}
): Promise<void> {
  const flags = parseFlags(argv);
  if (!flags["dashboard-url"]) {
    console.error("Faltou --dashboard-url");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await createOutpost({
      dashboardUrl: flags["dashboard-url"],
      name: flags["name"],
      allowInsecureHttp: "allow-insecure-http" in flags,
      fetchImpl: deps.fetchImpl,
    });

    const envPath = path.join(deps.cwd ?? process.cwd(), ".env");
    await upsertEnvVars(envPath, {
      HERALD_DASHBOARD_URL: flags["dashboard-url"],
      HERALD_OUTPOST_KEY: result.key,
    });

    console.log(`Outpost criado: ${result.name} (${result.id})`);
    console.log(`.env atualizado em ${envPath}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runOutpostLsCommand(
  argv: string[],
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<void> {
  const flags = parseFlags(argv);
  if (!flags["dashboard-url"]) {
    console.error("Faltou --dashboard-url");
    process.exitCode = 1;
    return;
  }
  try {
    const outposts = await listOutposts({
      dashboardUrl: flags["dashboard-url"],
      allowInsecureHttp: "allow-insecure-http" in flags,
      fetchImpl: deps.fetchImpl,
    });
    if (!outposts.length) {
      console.log("Nenhum Outpost cadastrado.");
      return;
    }
    for (const o of outposts) {
      console.log(`${o.id}  ${o.name}  criado ${o.createdAt}  visto ${o.lastSeenAt ?? "nunca"}`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runOutpostRmCommand(
  argv: string[],
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<void> {
  const [id, ...flagArgs] = argv;
  const flags = parseFlags(flagArgs);
  if (!id || !flags["dashboard-url"]) {
    console.error("Uso: herald outpost rm <id> --dashboard-url <url>");
    process.exitCode = 1;
    return;
  }
  try {
    await removeOutpost(id, {
      dashboardUrl: flags["dashboard-url"],
      allowInsecureHttp: "allow-insecure-http" in flags,
      fetchImpl: deps.fetchImpl,
    });
    console.log(`Outpost ${id} removido.`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runOutpostInspectCommand(
  argv: string[],
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<void> {
  const [id, ...flagArgs] = argv;
  const flags = parseFlags(flagArgs);
  if (!id || !flags["dashboard-url"]) {
    console.error("Uso: herald outpost inspect <id> --dashboard-url <url>");
    process.exitCode = 1;
    return;
  }
  try {
    const detail = await inspectOutpost(id, {
      dashboardUrl: flags["dashboard-url"],
      allowInsecureHttp: "allow-insecure-http" in flags,
      fetchImpl: deps.fetchImpl,
    });
    console.log(JSON.stringify(detail, null, 2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function runCli(argv: string[]): Promise<void> {
  const [command, sub, ...rest] = argv;

  if (command === "init") return runInit();
  if (command === "outpost" && sub === "init") return runOutpostInitCommand(rest);
  if (command === "outpost" && sub === "create") return runOutpostCreateCommand(rest);
  if (command === "outpost" && sub === "ls") return runOutpostLsCommand(rest);
  if (command === "outpost" && sub === "rm") return runOutpostRmCommand(rest);
  if (command === "outpost" && sub === "inspect") return runOutpostInspectCommand(rest);
  if (!command || command === "-h" || command === "--help") return printHelp();

  console.error(`Comando desconhecido: ${[command, sub].filter(Boolean).join(" ")}`);
  printHelp();
  process.exitCode = 1;
}
