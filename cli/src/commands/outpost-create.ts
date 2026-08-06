export interface OutpostCreateOptions {
  dashboardUrl: string;
  name?: string;
  fetchImpl?: typeof fetch;
}

export interface OutpostCreateResult {
  id: string;
  name: string;
  key: string;
  createdAt: string;
}

export async function createOutpost(options: OutpostCreateOptions): Promise<OutpostCreateResult> {
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
