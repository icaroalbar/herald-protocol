import express, { type Express } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type DashboardConfig } from "./config.js";
import { MetricsHistoryStore, type MetricsSnapshot } from "./history.js";
import { OutpostStore } from "./outposts.js";
import { createOutpostRouter } from "./outpost-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

/** Busca todos os Gateways configurados uma vez e grava o resultado no MetricsHistoryStore. */
export async function pollOnce(config: DashboardConfig, historyStore: MetricsHistoryStore): Promise<void> {
  const results = await Promise.all(config.gateways.map((gw) => fetchGatewayMetrics(gw.name, gw.metricsUrl)));
  const fetchedAt = new Date().toISOString();
  for (const result of results) {
    historyStore.record(
      result.name,
      result.ok ? { fetchedAt, data: result.data } : { fetchedAt, data: null, error: result.error }
    );
  }
}

export interface DashboardApp {
  app: Express;
  config: DashboardConfig;
  historyStore: MetricsHistoryStore;
  outpostStore: OutpostStore;
  /** Inicia o poller em background que alimenta o histórico (idempotente). Não é chamado
   * automaticamente — quem sobe o processo real (index.ts) chama explicitamente; testes
   * que não precisam de histórico não pagam o custo de um setInterval por teste. */
  startHistoryPolling: () => void;
  /** Para o poller. Sempre chamar em testes que usaram startHistoryPolling(), para não
   * vazar o timer entre execuções (setInterval mantém o event loop vivo). */
  stopHistoryPolling: () => void;
}

export function createDashboardApp(configOverride?: Partial<DashboardConfig>): DashboardApp {
  const config = { ...loadConfig(), ...configOverride };
  const app = express();
  const historyStore = new MetricsHistoryStore(config.historySize);
  const outpostStore = new OutpostStore(config.outpostsFilePath);

  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use(createOutpostRouter(outpostStore, historyStore));

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

  // Histórico: ciclo de fetch independente do /api/metrics acima (não reaproveita a
  // mesma chamada de rede) — trade-off aceito por simplicidade no MVP, ver plano.
  app.get("/api/metrics/history", (_req, res) => {
    res.json({
      pollIntervalMs: config.pollIntervalMs,
      historySize: config.historySize,
      gateways: historyStore.snapshot(),
    });
  });

  let intervalHandle: NodeJS.Timeout | null = null;

  function startHistoryPolling(): void {
    if (intervalHandle) return;
    intervalHandle = setInterval(() => {
      pollOnce(config, historyStore).catch(() => {
        // pollOnce já captura erro por Gateway individualmente (fetchGatewayMetrics
        // nunca rejeita) — chegar aqui seria um bug de programação, não uma falha de
        // rede esperada. Não derruba o poller por causa disso.
      });
    }, config.pollIntervalMs);
    intervalHandle.unref?.();
  }

  function stopHistoryPolling(): void {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  return { app, config, historyStore, outpostStore, startHistoryPolling, stopHistoryPolling };
}
