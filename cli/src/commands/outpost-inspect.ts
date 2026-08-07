import { assertSecureDashboardUrl } from "../security.js";

export interface OutpostDetail {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastSeenAt: string | null;
  latestReport: { reportedAt: string; snapshot: unknown } | null;
}

export interface OutpostInspectOptions {
  dashboardUrl: string;
  fetchImpl?: typeof fetch;
  allowInsecureHttp?: boolean;
}

export async function inspectOutpost(id: string, options: OutpostInspectOptions): Promise<OutpostDetail> {
  assertSecureDashboardUrl(options.dashboardUrl, options.allowInsecureHttp);
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(`${options.dashboardUrl.replace(/\/+$/, "")}/api/outposts/${id}`);
  if (res.status === 404) {
    throw new Error(`Outpost ${id} não encontrado`);
  }
  if (!res.ok) {
    throw new Error(`Server respondeu HTTP ${res.status} ao consultar Outpost ${id}`);
  }
  return (await res.json()) as OutpostDetail;
}
