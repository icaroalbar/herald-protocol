import { assertSecureServerUrl } from "../security.js";

export interface OutpostSummary {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface OutpostListOptions {
  serverUrl: string;
  fetchImpl?: typeof fetch;
  allowInsecureHttp?: boolean;
}

export async function listOutposts(options: OutpostListOptions): Promise<OutpostSummary[]> {
  assertSecureServerUrl(options.serverUrl, options.allowInsecureHttp);
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(`${options.serverUrl.replace(/\/+$/, "")}/api/outposts`);
  if (!res.ok) {
    throw new Error(`Server respondeu HTTP ${res.status} ao listar Outposts`);
  }
  const body = (await res.json()) as { outposts: OutpostSummary[] };
  return body.outposts;
}
