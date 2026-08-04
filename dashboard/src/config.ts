export interface GatewaySource {
  name: string;
  metricsUrl: string;
}

export interface DashboardConfig {
  port: number;
  gateways: GatewaySource[];
  pollIntervalMs: number;
  historySize: number;
}

/**
 * Configuração via variáveis de ambiente:
 *   PORT                 porta do Dashboard (default 4000)
 *   HERALD_GATEWAYS          lista "nome=url,nome=url" de Gateways a consultar
 *                             (default: um único Gateway local em http://localhost:3000/metrics)
 *   HERALD_POLL_INTERVAL_MS   intervalo de atualização do frontend, em ms (default 5000)
 *   HERALD_HISTORY_SIZE       amostras de histórico mantidas por Gateway (default 60)
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): DashboardConfig {
  const gatewaysEnv = env.HERALD_GATEWAYS;

  const gateways: GatewaySource[] = gatewaysEnv
    ? gatewaysEnv
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [name, metricsUrl] = entry.split("=").map((s) => s.trim());
          return { name: name || metricsUrl, metricsUrl };
        })
    : [{ name: "default", metricsUrl: "http://localhost:3000/metrics" }];

  return {
    port: Number(env.PORT ?? 4000),
    gateways,
    pollIntervalMs: Number(env.HERALD_POLL_INTERVAL_MS ?? 5000),
    historySize: Number(env.HERALD_HISTORY_SIZE ?? 60),
  };
}
