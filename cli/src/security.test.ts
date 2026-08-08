import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSecureServerUrl, isLoopbackHost } from "./security.js";

test("assertSecureServerUrl aceita https:// de qualquer host", () => {
  assert.doesNotThrow(() => assertSecureServerUrl("https://exemplo.com"));
  assert.doesNotThrow(() => assertSecureServerUrl("https://192.168.1.10:4810"));
});

test("assertSecureServerUrl aceita http:// em localhost/127.0.0.1/::1 sem allowInsecureHttp", () => {
  assert.doesNotThrow(() => assertSecureServerUrl("http://localhost:4810"));
  assert.doesNotThrow(() => assertSecureServerUrl("http://127.0.0.1:4810"));
  assert.doesNotThrow(() => assertSecureServerUrl("http://[::1]:4810"));
});

test("assertSecureServerUrl lanca para http:// fora de localhost, sem allowInsecureHttp", () => {
  assert.throws(() => assertSecureServerUrl("http://exemplo.com"), /HTTPS/);
});

test("assertSecureServerUrl aceita http:// fora de localhost quando allowInsecureHttp=true", () => {
  assert.doesNotThrow(() => assertSecureServerUrl("http://exemplo.com", true));
});

test("isLoopbackHost não trata subdomínio como loopback (ex: localhost.evil.com)", () => {
  assert.equal(isLoopbackHost("localhost.evil.com"), false);
  assert.equal(isLoopbackHost("localhost"), true);
});

test("assertSecureServerUrl com https:// não depende do hostname ser loopback", () => {
  // https:// já é seguro independente do host — isLoopbackHost não entra na decisão.
  assert.doesNotThrow(() => assertSecureServerUrl("https://qualquer-coisa.exemplo.com"));
});
