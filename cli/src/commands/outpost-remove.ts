import { assertSecureServerUrl } from "../security.js";

export interface OutpostRemoveOptions {
  serverUrl: string;
  fetchImpl?: typeof fetch;
  allowInsecureHttp?: boolean;
}

export async function removeOutpost(id: string, options: OutpostRemoveOptions): Promise<void> {
  assertSecureServerUrl(options.serverUrl, options.allowInsecureHttp);
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(`${options.serverUrl.replace(/\/+$/, "")}/api/outposts/${id}`, {
    method: "DELETE",
  });
  if (res.status === 404) {
    throw new Error(`Outpost ${id} não encontrado`);
  }
  if (!res.ok) {
    throw new Error(`Server respondeu HTTP ${res.status} ao remover Outpost ${id}`);
  }
}
