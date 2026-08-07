import { test } from "node:test";
import assert from "node:assert/strict";
import { removeOutpost } from "./outpost-remove.js";

function fakeFetch(handler: (url: string, init: RequestInit) => { ok: boolean; status?: number }): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const result = handler(String(input), init ?? {});
    return { ok: result.ok, status: result.status ?? (result.ok ? 204 : 500) } as unknown as globalThis.Response;
  }) as unknown as typeof fetch;
}

test("removeOutpost faz DELETE em {dashboardUrl}/api/outposts/{id}", async () => {
  let capturedUrl = "";
  let capturedMethod = "";
  const fetchImpl = fakeFetch((url, init) => {
    capturedUrl = url;
    capturedMethod = init.method ?? "";
    return { ok: true, status: 204 };
  });

  await removeOutpost("abc123", { dashboardUrl: "https://x", fetchImpl });
  assert.equal(capturedUrl, "https://x/api/outposts/abc123");
  assert.equal(capturedMethod, "DELETE");
});

test("removeOutpost lanca Error especifico quando o id nao existe (404)", async () => {
  const fetchImpl = fakeFetch(() => ({ ok: false, status: 404 }));
  await assert.rejects(() => removeOutpost("nao-existe", { dashboardUrl: "https://x", fetchImpl }), /não encontrado/);
});

test("removeOutpost lanca Error generico pra outro status nao-2xx", async () => {
  const fetchImpl = fakeFetch(() => ({ ok: false, status: 500 }));
  await assert.rejects(() => removeOutpost("abc123", { dashboardUrl: "https://x", fetchImpl }), /HTTP 500/);
});

test("removeOutpost lanca pra dashboardUrl http:// fora de localhost, sem allowInsecureHttp", async () => {
  const fetchImpl = fakeFetch(() => ({ ok: true }));
  await assert.rejects(
    () => removeOutpost("abc123", { dashboardUrl: "http://dashboard.example.com", fetchImpl }),
    /HTTPS/
  );
});
