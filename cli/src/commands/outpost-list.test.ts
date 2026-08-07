import { test } from "node:test";
import assert from "node:assert/strict";
import { listOutposts } from "./outpost-list.js";

function fakeFetch(body: unknown): typeof fetch {
  return (async () => ({ ok: true, status: 200, json: async () => body }) as unknown as globalThis.Response) as unknown as typeof fetch;
}

test("listOutposts faz GET em {dashboardUrl}/api/outposts e retorna a lista", async () => {
  const outposts = [{ id: "a", name: "app-a", createdAt: "now", lastSeenAt: null }];
  const fetchImpl = fakeFetch({ outposts });

  const result = await listOutposts({ dashboardUrl: "https://x", fetchImpl });
  assert.deepEqual(result, outposts);
});

test("listOutposts lanca Error quando o Server responde nao-2xx", async () => {
  const fetchImpl = (async () => ({ ok: false, status: 500 }) as unknown as globalThis.Response) as unknown as typeof fetch;
  await assert.rejects(() => listOutposts({ dashboardUrl: "https://x", fetchImpl }), /HTTP 500/);
});

test("listOutposts lanca pra dashboardUrl http:// fora de localhost, sem allowInsecureHttp", async () => {
  const fetchImpl = fakeFetch({ outposts: [] });
  await assert.rejects(
    () => listOutposts({ dashboardUrl: "http://dashboard.example.com", fetchImpl }),
    /HTTPS/
  );
});

test("listOutposts aceita http:// em localhost sem allowInsecureHttp", async () => {
  const fetchImpl = fakeFetch({ outposts: [] });
  await assert.doesNotReject(() => listOutposts({ dashboardUrl: "http://localhost:4100", fetchImpl }));
});
