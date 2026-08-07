import { test } from "node:test";
import assert from "node:assert/strict";
import { createOutpostReporter, assertSecureServerUrl } from "./reporting.js";

function fakeFetch(handler: (url: string, init: RequestInit) => { ok: boolean; status?: number }): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const result = handler(String(input), init ?? {});
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 500) } as Response;
  }) as typeof fetch;
}

test("createOutpostReporter lanca sincronamente se serverUrl ou outpostKey vazios", () => {
  assert.throws(() => createOutpostReporter(() => ({}), { serverUrl: "", outpostKey: "k" }));
  assert.throws(() => createOutpostReporter(() => ({}), { serverUrl: "http://x", outpostKey: "" }));
});

test("assertSecureServerUrl aceita https:// de qualquer host", () => {
  assert.doesNotThrow(() => assertSecureServerUrl("https://server.example.com"));
});

test("assertSecureServerUrl aceita http:// em localhost/127.0.0.1/::1 sem allowInsecureHttp", () => {
  assert.doesNotThrow(() => assertSecureServerUrl("http://localhost:4000"));
  assert.doesNotThrow(() => assertSecureServerUrl("http://127.0.0.1:4000"));
  assert.doesNotThrow(() => assertSecureServerUrl("http://[::1]:4000"));
});

test("assertSecureServerUrl lanca para http:// fora de localhost, sem allowInsecureHttp", () => {
  assert.throws(() => assertSecureServerUrl("http://server.example.com"), /HTTPS/);
});

test("assertSecureServerUrl aceita http:// fora de localhost quando allowInsecureHttp=true", () => {
  assert.doesNotThrow(() => assertSecureServerUrl("http://server.example.com", true));
});

test("createOutpostReporter lanca na construcao para serverUrl http:// fora de localhost", () => {
  assert.throws(
    () => createOutpostReporter(() => ({}), { serverUrl: "http://server.example.com", outpostKey: "k" }),
    /HTTPS/
  );
});

test("createOutpostReporter aceita http:// fora de localhost com allowInsecureHttp: true", () => {
  assert.doesNotThrow(() =>
    createOutpostReporter(() => ({}), { serverUrl: "http://server.example.com", outpostKey: "k", allowInsecureHttp: true })
  );
});

test("reportOnce faz POST em {serverUrl}/api/outposts/reports com Authorization Bearer e o snapshot", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit = {};
  const fetchImpl = fakeFetch((url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return { ok: true };
  });

  const reporter = createOutpostReporter(() => ({ sampleCount: 3 }), {
    serverUrl: "http://localhost:4000",
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
  const reporter = createOutpostReporter(() => ({}), { serverUrl: "https://x", outpostKey: "k", fetchImpl });
  assert.equal(await reporter.reportOnce(), false);
});

test("reportOnce nunca lanca, mesmo quando fetch rejeita", async () => {
  const fetchImpl = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const reporter = createOutpostReporter(() => ({}), { serverUrl: "https://x", outpostKey: "k", fetchImpl });
  const ok = await reporter.reportOnce();
  assert.equal(ok, false);
});

test("serverUrl com barra final normaliza pra mesma URL de request", async () => {
  const urls: string[] = [];
  const fetchImpl = fakeFetch((url) => {
    urls.push(url);
    return { ok: true };
  });

  const a = createOutpostReporter(() => ({}), { serverUrl: "https://x/", outpostKey: "k", fetchImpl });
  const b = createOutpostReporter(() => ({}), { serverUrl: "https://x", outpostKey: "k", fetchImpl });
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
    serverUrl: "https://x",
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
