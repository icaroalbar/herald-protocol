import { assertSecureDashboardUrl } from "../security.js";

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
