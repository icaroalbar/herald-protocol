import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAcceptCapabilities, negotiateFormat } from "./negotiate.js";

test("parseAcceptCapabilities: q-values explicitos, ordenado desc", () => {
  const parsed = parseAcceptCapabilities("structured-json;q=1.0, markdown;q=0.8, html;q=0.3");
  assert.deepEqual(
    parsed.map((p) => p.capability),
    ["structured-json", "markdown", "html"]
  );
  assert.equal(parsed[0].q, 1.0);
  assert.equal(parsed[1].q, 0.8);
  assert.equal(parsed[2].q, 0.3);
});

test("parseAcceptCapabilities: q implicito default 1.0", () => {
  const parsed = parseAcceptCapabilities("html");
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].capability, "html");
  assert.equal(parsed[0].q, 1.0);
});

test("parseAcceptCapabilities: header ausente/vazio retorna []", () => {
  assert.deepEqual(parseAcceptCapabilities(undefined), []);
  assert.deepEqual(parseAcceptCapabilities(""), []);
});

test("negotiateFormat: escolhe o de maior q em comum", () => {
  const requested = parseAcceptCapabilities("structured-json;q=1.0, markdown;q=0.8, html;q=0.3");
  const result = negotiateFormat(requested, ["structured-json", "html"]);
  assert.equal(result.format, "structured-json");
  assert.equal(result.matched, true);
});

test("negotiateFormat: sem intersecao cai no fallback", () => {
  const requested = parseAcceptCapabilities("graphql;q=1.0");
  const result = negotiateFormat(requested, ["structured-json", "html"]);
  assert.equal(result.format, "html");
  assert.equal(result.matched, false);
});

test("negotiateFormat: fallback customizado", () => {
  const requested = parseAcceptCapabilities("graphql;q=1.0");
  const result = negotiateFormat(requested, ["structured-json"], "markdown");
  assert.equal(result.format, "markdown");
  assert.equal(result.matched, false);
});

test("negotiateFormat: empate de q desempata pela ordem de 'supported'", () => {
  const requested = parseAcceptCapabilities("html;q=0.9, markdown;q=0.9");
  const result = negotiateFormat(requested, ["markdown", "html"]);
  assert.equal(result.format, "markdown");
  assert.equal(result.matched, true);
});

test("negotiateFormat: q=0 exclui a capacidade explicitamente", () => {
  const requested = parseAcceptCapabilities("structured-json;q=0, html;q=0.5");
  const result = negotiateFormat(requested, ["structured-json", "html"]);
  assert.equal(result.format, "html");
});
