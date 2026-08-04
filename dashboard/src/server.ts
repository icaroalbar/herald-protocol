import express, { type Express } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type DashboardConfig } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Espelha o shape de InMemoryMetricsCollector.snapshot() do @herald/sdk. */
interface MetricsSnapshot {
  requestsByAgent: Record<string, number>;
  decisionsByResult: Record<string, number>;
  formatsServed: Record<string, number>;
  errorsByAgent: Record<string, number>;
  averageLatencyMs: number;
  sampleCount: number;
}

type GatewayResult =
  | { name: string; ok: true; data: MetricsSnapshot }
  | { name: string; ok: false; error: string };

async function fetchGatewayMetrics(name: string, url: string): Promise<GatewayResult> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      return { name, ok: false, error: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as MetricsSnapshot;
    return { name, ok: true, data };
  } catch (err) {
    return { name, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function createDashboardApp(configOverride?: Partial<DashboardConfig>): { app: Express; config: DashboardConfig } {
  const config = { ...loadConfig(), ...configOverride };
  const app = express();

  app.use(express.static(path.join(__dirname, "..", "public")));

  // Agrega /metrics de um ou mais Gateways no servidor — evita problemas de CORS no
  // navegador e permite o Dashboard consultar múltiplas origens (ARCHITECTURE.md §2.1).
  app.get("/api/metrics", async (_req, res) => {
    const gateways = await Promise.all(
      config.gateways.map((gw) => fetchGatewayMetrics(gw.name, gw.metricsUrl))
    );

    res.json({
      fetchedAt: new Date().toISOString(),
      pollIntervalMs: config.pollIntervalMs,
      gateways,
    });
  });

  return { app, config };
}
