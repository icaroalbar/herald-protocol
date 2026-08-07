import { createPool, migrate, PgOutpostStore, PgReportsStore } from "@herald/server";
import { defaultConfigPath, readSavedDatabaseUrl } from "./config.js";

/** Ordem: --database-url > DATABASE_URL (env) > config salva via `herald configure`.
 * `configPath` é injetável só pra teste — o binário real sempre usa o default
 * (~/.herald/config.json). */
export async function resolveDatabaseUrl(
  flags: Record<string, string>,
  configPath: string = defaultConfigPath()
): Promise<string> {
  const url = flags["database-url"] ?? process.env.DATABASE_URL ?? (await readSavedDatabaseUrl(configPath));
  if (!url) {
    throw new Error(
      "Faltou --database-url — rode `herald configure --database-url <url>` uma vez, " +
        "ou passe --database-url/export DATABASE_URL= em cada comando."
    );
  }
  return url;
}

/** Usado só por `herald configure` — valida a conexão e roda a migration explicitamente,
 * como confirmação visível do "instala o sistema" (mesma migrate() idempotente de baixo,
 * chamada de novo em toda invocação de withDb() — aqui é só pra dar feedback claro no
 * momento que o usuário entende como "configurar o banco"). */
export async function provisionDatabase(databaseUrl: string): Promise<void> {
  const pool = createPool(databaseUrl);
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}

/** Roda migrate() (idempotente) antes de toda chamada — primeiro comando contra um banco
 * vazio já provisiona o schema sozinho, sem comando `migrate` separado. */
export async function withDb<T>(
  databaseUrl: string,
  fn: (stores: { outposts: PgOutpostStore; reports: PgReportsStore }) => Promise<T>
): Promise<T> {
  const pool = createPool(databaseUrl);
  try {
    await migrate(pool);
    return await fn({ outposts: new PgOutpostStore(pool), reports: new PgReportsStore(pool) });
  } finally {
    await pool.end();
  }
}
