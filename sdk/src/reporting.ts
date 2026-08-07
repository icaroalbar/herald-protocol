/**
 * Push de métricas para um Herald Dashboard (fluxo Outpost, ICA-34). Espelha o estilo de
 * closure de `agent-keys.ts` (createAgentKeyResolver), mas invertido: empurra em vez de
 * buscar.
 */

export interface OutpostReportingConfig {
  dashboardUrl: string;
  outpostKey: string;
  /** default 60_000 */
  intervalMs?: number;
  /** default 5_000 */
  timeoutMs?: number;
  /** Implementação de fetch a usar (testes); default: fetch global. */
  fetchImpl?: typeof fetch;
  /**
   * Permite `dashboardUrl` em HTTP puro fora de localhost — a chave (header
   * `Authorization: Bearer`) viajaria em texto puro na rede a cada push. Só ligue isso se
   * a conexão já está protegida por outra camada (VPN, rede privada/VPC) — nunca através
   * da internet pública. default: false.
   */
  allowInsecureHttp?: boolean;
}

function isLoopbackHost(hostname: string): boolean {
  // new URL(...).hostname mantém colchetes em endereços IPv6, ex: "[::1]".
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/** Lança se dashboardUrl não é https:// e não é localhost, a menos que allowInsecureHttp
 * esteja explicitamente ligado — evita a chave viajando em texto puro por engano. */
export function assertSecureDashboardUrl(dashboardUrl: string, allowInsecureHttp?: boolean): void {
  const parsed = new URL(dashboardUrl);
  if (parsed.protocol === "https:" || isLoopbackHost(parsed.hostname) || allowInsecureHttp) return;
  throw new Error(
    `dashboardUrl ("${dashboardUrl}") não é HTTPS e não é localhost — a chave viajaria em texto puro na rede. ` +
      "Use https://, ou passe allowInsecureHttp: true se a conexão já está protegida por outra camada " +
      "(VPN/rede privada) — nunca na internet pública."
  );
}

export interface OutpostReporter {
  /** Inicia o push periódico em background (idempotente). */
  start: () => void;
  stop: () => void;
  /** Dispara um push imediato. Nunca lança — falha de rede é rotina, não deve derrubar
   * a aplicação hospedeira. Retorna false em qualquer falha (rede, timeout, HTTP não-2xx). */
  reportOnce: () => Promise<boolean>;
}

/**
 * `getSnapshot` é um callback (não um `MetricsCollector` concreto) para este módulo não
 * acoplar em `InMemoryMetricsCollector` — quem instancia decide de onde vem o snapshot.
 */
export function createOutpostReporter(getSnapshot: () => unknown, config: OutpostReportingConfig): OutpostReporter {
  if (!config.dashboardUrl || !config.outpostKey) {
    // Erro de configuração (env var ausente/vazia), não falha de rede — falha alto e
    // cedo na construção. Diferente de reportOnce(), que nunca lança (falha de rede é
    // esperada/rotina em produção).
    throw new Error("OutpostReportingConfig requer dashboardUrl e outpostKey não vazios");
  }
  assertSecureDashboardUrl(config.dashboardUrl, config.allowInsecureHttp);

  const fetchImpl = config.fetchImpl ?? fetch;
  const intervalMs = config.intervalMs ?? 60_000;
  const timeoutMs = config.timeoutMs ?? 5_000;
  const url = `${config.dashboardUrl.replace(/\/+$/, "")}/api/outposts/reports`;
  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  async function reportOnce(): Promise<boolean> {
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.outpostKey}` },
        body: JSON.stringify({ reportedAt: new Date().toISOString(), snapshot: getSnapshot() }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function start(): void {
    if (intervalHandle) return;
    intervalHandle = setInterval(() => {
      reportOnce().catch(() => {});
    }, intervalMs);
    intervalHandle.unref?.();
  }

  function stop(): void {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  return { start, stop, reportOnce };
}
