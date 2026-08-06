import { test } from "node:test";
import assert from "node:assert/strict";
import { createOutpost } from "./outpost-create.js";

function fakeFetch(handler: (url: string, init: RequestInit) => { ok: boolean; status?: number; body?: unknown }): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const result = handler(String(input), init ?? {});
    return {
      ok: result.ok,
      status: result.status ?? (result.ok ? 200 : 500),
      json: async () => result.body ?? {},
    } as unknown as globalThis.Response;
  }) as unknown as typeof fetch;
}

test("createOutpost faz POST em {dashboardUrl}/api/outposts com o name, se informado", async () => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  const fetchImpl = fakeFetch((url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body as string);
    return { ok: true, body: { id: "abc123", name: "meu-app", key: "hrld_op_x", createdAt: "2026-01-01T00:00:00.000Z" } };
  });

  const result = await createOutpost({ dashboardUrl: "http://localhost:4000", name: "meu-app", fetchImpl });

  assert.equal(capturedUrl, "http://localhost:4000/api/outposts");
  assert.deepEqual(capturedBody, { name: "meu-app" });
  assert.equal(result.id, "abc123");
  assert.equal(result.key, "hrld_op_x");
});

test("createOutpost sem name envia body vazio", async () => {
  let capturedBody: unknown = null;
  const fetchImpl = fakeFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return { ok: true, body: { id: "x", name: "gerado", key: "k", createdAt: "now" } };
  });

  await createOutpost({ dashboardUrl: "http://x", fetchImpl });
  assert.deepEqual(capturedBody, {});
});

test("createOutpost lanca Error quando o Dashboard responde nao-2xx", async () => {
  const fetchImpl = fakeFetch(() => ({ ok: false, status: 500 }));
  await assert.rejects(() => createOutpost({ dashboardUrl: "http://x", fetchImpl }), /HTTP 500/);
});
