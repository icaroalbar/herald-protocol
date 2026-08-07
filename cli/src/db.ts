import { createPool, migrate, PgOutpostStore, PgReportsStore } from "@herald/server";

export function resolveDatabaseUrl(flags: Record<string, string>): string {
  const url = flags["database-url"] ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Faltou --database-url (ou export DATABASE_URL=...)");
  }
  return url;
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
