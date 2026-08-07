import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectOutpost } from "./outpost-inspect.js";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as globalThis.Response) as unknown as typeof fetch;
}

test("inspectOutpost faz GET em {dashboardUrl}/api/outposts/{id} e retorna o detalhe", async () => {
  const detail = {
    id: "abc123",
    name: "app-a",
    keyPrefix: "hrld_op_xy",
    createdAt: "now",
    lastSeenAt: "now",
    latestReport: { reportedAt: "now", snapshot: { sampleCount: 1 } },
  };
  const fetchImpl = fakeFetch(detail);

  const result = await inspectOutpost("abc123", { dashboardUrl: "https://x", fetchImpl });
  assert.deepEqual(result, detail);
});

test("inspectOutpost lanca Error especifico quando o id nao existe (404)", async () => {
  const fetchImpl = fakeFetch({ error: "not_found" }, 404);
  await assert.rejects(() => inspectOutpost("nao-existe", { dashboardUrl: "https://x", fetchImpl }), /não encontrado/);
});

test("inspectOutpost lanca pra dashboardUrl http:// fora de localhost, sem allowInsecureHttp", async () => {
  const fetchImpl = fakeFetch({});
  await assert.rejects(
    () => inspectOutpost("abc123", { dashboardUrl: "http://dashboard.example.com", fetchImpl }),
    /HTTPS/
  );
});
