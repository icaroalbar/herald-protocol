import pg from "pg";
import { SCHEMA_SQL } from "./schema.js";

const { Pool } = pg;

export function createPool(databaseUrl: string): pg.Pool {
  return new Pool({ connectionString: databaseUrl });
}

/** Idempotente — seguro de chamar toda vez que o processo sobe (CREATE TABLE/INDEX IF NOT EXISTS). */
export async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
