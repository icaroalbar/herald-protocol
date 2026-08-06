import { test } from "node:test";
import assert from "node:assert/strict";
import { createOutpostReporter } from "./reporting.js";

function fakeFetch(handler: (url: string, init: RequestInit) => { ok: boolean; status?: number }): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const result = handler(String(input), init ?? {});
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 500) } as Response;
  }) as typeof fetch;
}

test("createOutpostReporter lanca sincronamente se dashboardUrl ou outpostKey vazios", () => {
  assert.throws(() => createOutpostReporter(() => ({}), { dashboardUrl: "", outpostKey: "k" }));
  assert.throws(() => createOutpostReporter(() => ({}), { dashboardUrl: "http://x", outpostKey: "" }));
});

test("reportOnce faz POST em {dashboardUrl}/api/outposts/reports com Authorization Bearer e o snapshot", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit = {};
  const fetchImpl = fakeFetch((url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return { ok: true };
  });

  const reporter = createOutpostReporter(() => ({ sampleCount: 3 }), {
    dashboardUrl: "http://localhost:4000",
    outpostKey: "hrld_op_abc123",
    fetchImpl,
  });

  const ok = await reporter.reportOnce();
  assert.equal(ok, true);
  assert.equal(capturedUrl, "http://localhost:4000/api/outposts/reports");
  assert.equal(capturedInit.method, "POST");
  assert.equal((capturedInit.headers as Record<string, string>).authorization, "Bearer hrld_op_abc123");
  const body = JSON.parse(capturedInit.body as string);
  assert.deepEqual(body.snapshot, { sampleCount: 3 });
  assert.ok(typeof body.reportedAt === "string");
});

test("reportOnce retorna false quando o servidor responde nao-2xx", async () => {
  const fetchImpl = fakeFetch(() => ({ ok: false, status: 401 }));
  const reporter = createOutpostReporter(() => ({}), { dashboardUrl: "http://x", outpostKey: "k", fetchImpl });
  assert.equal(await reporter.reportOnce(), false);
});

test("reportOnce nunca lanca, mesmo quando fetch rejeita", async () => {
  const fetchImpl = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const reporter = createOutpostReporter(() => ({}), { dashboardUrl: "http://x", outpostKey: "k", fetchImpl });
  const ok = await reporter.reportOnce();
  assert.equal(ok, false);
});

test("dashboardUrl com barra final normaliza pra mesma URL de request", async () => {
  const urls: string[] = [];
  const fetchImpl = fakeFetch((url) => {
    urls.push(url);
    return { ok: true };
  });

  const a = createOutpostReporter(() => ({}), { dashboardUrl: "http://x/", outpostKey: "k", fetchImpl });
  const b = createOutpostReporter(() => ({}), { dashboardUrl: "http://x", outpostKey: "k", fetchImpl });
  await a.reportOnce();
  await b.reportOnce();
  assert.equal(urls[0], urls[1]);
});

test("start()/start() nao duplica o interval, stop() interrompe", async () => {
  let callCount = 0;
  const fetchImpl = fakeFetch(() => {
    callCount += 1;
    return { ok: true };
  });

  const reporter = createOutpostReporter(() => ({}), {
    dashboardUrl: "http://x",
    outpostKey: "k",
    intervalMs: 15,
    fetchImpl,
  });

  reporter.start();
  reporter.start(); // idempotente
  await new Promise((resolve) => setTimeout(resolve, 60));
  reporter.stop();

  const countAfterStop = callCount;
  assert.ok(countAfterStop >= 2, `esperava >=2 chamadas, teve ${countAfterStop}`);

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(callCount, countAfterStop, "nao deveria crescer mais apos stop()");
});
