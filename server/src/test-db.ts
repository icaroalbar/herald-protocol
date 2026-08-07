import pg from "pg";
import * as crypto from "node:crypto";
import { migrate } from "./db.js";

const { Pool, Client } = pg;

export interface TestDb {
  pool: pg.Pool;
  /** Connection string deste banco efêmero — útil pra código que cria seu próprio Pool
   * a partir de uma URL (ex: @herald/cli, que nunca recebe um Pool pronto). */
  databaseUrl: string;
  dropDatabase: () => Promise<void>;
}

/**
 * Cria um banco Postgres real e efêmero (nome único), roda a migração, devolve um Pool
 * conectado a ele. Análogo direto ao fs.mkdtempSync usado nos testes do OutpostStore
 * original (dashboard/src/outposts.test.ts) — isolamento real por teste, não mock de
 * driver SQL. Requer DATABASE_URL apontando pra uma instância Postgres real e acessível
 * (docker-compose.yml deste pacote, ou o serviço `postgres:` do CI) — sem fallback,
 * falha cedo e claro se ausente.
 */
export async function createTestDatabase(): Promise<TestDb> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL ausente — rode `docker compose up -d` neste pacote antes dos testes.");
  }
  const dbName = `herald_test_${crypto.randomBytes(6).toString("hex")}`;

  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = "/postgres"; // banco administrativo padrão, sempre existe

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const testUrl = new URL(baseUrl);
  testUrl.pathname = `/${dbName}`;
  const pool = new Pool({ connectionString: testUrl.toString() });
  await migrate(pool);

  async function dropDatabase(): Promise<void> {
    await pool.end();
    const admin2 = new Client({ connectionString: adminUrl.toString() });
    await admin2.connect();
    await admin2.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin2.end();
  }

  return { pool, databaseUrl: testUrl.toString(), dropDatabase };
}
