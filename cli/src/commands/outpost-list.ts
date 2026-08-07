import { assertSecureDashboardUrl } from "../security.js";

export interface OutpostSummary {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface OutpostListOptions {
  dashboardUrl: string;
  fetchImpl?: typeof fetch;
  allowInsecureHttp?: boolean;
}

export async function listOutposts(options: OutpostListOptions): Promise<OutpostSummary[]> {
  assertSecureDashboardUrl(options.dashboardUrl, options.allowInsecureHttp);
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(`${options.dashboardUrl.replace(/\/+$/, "")}/api/outposts`);
  if (!res.ok) {
    throw new Error(`Server respondeu HTTP ${res.status} ao listar Outposts`);
  }
  const body = (await res.json()) as { outposts: OutpostSummary[] };
  return body.outposts;
}
