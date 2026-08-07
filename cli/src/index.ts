import { runInit } from "./commands/init.js";
import { createOutpost } from "./commands/outpost-create.js";

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
  herald outpost create --dashboard-url <url> [--name <nome>] [--allow-insecure-http]
  herald init

  outpost create   cria um novo Outpost no Dashboard, imprime id/name/key
  init             pergunta a URL do Dashboard + a key, grava/atualiza .env

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

export async function runCli(argv: string[]): Promise<void> {
  const [command, sub, ...rest] = argv;

  if (command === "init") return runInit();
  if (command === "outpost" && sub === "create") return runOutpostCreateCommand(rest);
  if (!command || command === "-h" || command === "--help") return printHelp();

  console.error(`Comando desconhecido: ${[command, sub].filter(Boolean).join(" ")}`);
  printHelp();
  process.exitCode = 1;
}
