import express, { type Express } from "express";
import type pg from "pg";
import { loadConfig, type ServerConfig } from "./config.js";
import { createPool, migrate } from "./db.js";
import { PgOutpostStore } from "./outposts.js";
import { PgReportsStore } from "./reports.js";
import { createOutpostRouter } from "./outpost-routes.js";

export interface ServerApp {
  app: Express;
  pool: pg.Pool;
  config: ServerConfig;
  close: () => Promise<void>;
}

/**
 * Async (diferente de createDashboardApp, síncrono) — migrate() precisa de um round-trip
 * real ao Postgres antes do app poder servir tráfego. Todo call site (inclusive testes)
 * precisa dar await.
 */
export async function createServerApp(configOverride?: Partial<ServerConfig>): Promise<ServerApp> {
  const config = { ...loadConfig(), ...configOverride };
  const pool = createPool(config.databaseUrl);
  await migrate(pool);

  const app = express();
  const outpostStore = new PgOutpostStore(pool);
  const reportsStore = new PgReportsStore(pool);
  app.use(createOutpostRouter(outpostStore, reportsStore));

  async function close(): Promise<void> {
    await pool.end();
  }

  return { app, pool, config, close };
}
