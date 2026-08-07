import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/** ~/.herald/config.json — guarda o database-url configurado uma vez via
 * `herald configure`, pra não precisar de --database-url em todo comando depois. */
export function defaultConfigPath(): string {
  return path.join(os.homedir(), ".herald", "config.json");
}

interface HeraldConfig {
  databaseUrl?: string;
}

export async function readSavedDatabaseUrl(configPath: string = defaultConfigPath()): Promise<string | undefined> {
  try {
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as HeraldConfig;
    return config.databaseUrl;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

export async function saveDatabaseUrl(databaseUrl: string, configPath: string = defaultConfigPath()): Promise<void> {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ databaseUrl }, null, 2) + "\n", "utf-8");
}
