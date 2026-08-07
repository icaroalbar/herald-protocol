export interface OutpostCreateOptions {
  dashboardUrl: string;
  name?: string;
  fetchImpl?: typeof fetch;
  /**
   * Permite dashboardUrl em HTTP puro fora de localhost — a chave recém-criada volta em
   * texto puro na resposta, e viajaria pela rede sem proteção. Só ligue isso se a conexão
   * já está protegida por outra camada (VPN, rede privada/VPC) — nunca na internet pública.
   */
  allowInsecureHttp?: boolean;
}

export interface OutpostCreateResult {
  id: string;
  name: string;
  key: string;
  createdAt: string;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/** Mesma checagem de sdk/src/reporting.ts (assertSecureDashboardUrl) — duplicada aqui de
 * propósito porque cli/ é um pacote leaf, sem dependência em @herald/sdk. */
function assertSecureDashboardUrl(dashboardUrl: string, allowInsecureHttp?: boolean): void {
  const parsed = new URL(dashboardUrl);
  if (parsed.protocol === "https:" || isLoopbackHost(parsed.hostname) || allowInsecureHttp) return;
  throw new Error(
    `dashboardUrl ("${dashboardUrl}") não é HTTPS e não é localhost — a chave recém-criada viajaria em texto puro na rede. ` +
      "Use https://, ou passe --allow-insecure-http se a conexão já está protegida por outra camada " +
      "(VPN/rede privada) — nunca na internet pública."
  );
}

export async function createOutpost(options: OutpostCreateOptions): Promise<OutpostCreateResult> {
  assertSecureDashboardUrl(options.dashboardUrl, options.allowInsecureHttp);
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(`${options.dashboardUrl.replace(/\/+$/, "")}/api/outposts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options.name ? { name: options.name } : {}),
  });
  if (!res.ok) {
    throw new Error(`Dashboard respondeu HTTP ${res.status} ao criar Outpost`);
  }
  return (await res.json()) as OutpostCreateResult;
}
