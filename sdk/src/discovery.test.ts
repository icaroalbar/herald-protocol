import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDiscoveryDocument } from "./discovery.js";

test("herald_version default e campos opcionais omitidos quando nao fornecidos", () => {
  const doc = buildDiscoveryDocument({
    origin: "https://example.com",
    capabilities: ["html"],
    defaultPolicy: { read: "allow" },
  });

  assert.equal(doc.herald_version, "1.0");
  assert.equal(doc.origin, "https://example.com");
  assert.deepEqual(doc.capabilities, ["html"]);
  assert.deepEqual(doc.policies.default, { read: "allow" });
  assert.ok(!("endpoints" in doc));
  assert.ok(!("by_agent_type" in doc.policies));
  assert.ok(!("by_agent_id" in doc.policies));
  assert.ok(!("analytics" in doc));
  assert.ok(!("extensions" in doc));
});

test("heraldVersion customizado sobrescreve o default", () => {
  const doc = buildDiscoveryDocument({
    heraldVersion: "1.1",
    origin: "https://example.com",
    capabilities: ["html"],
    defaultPolicy: { read: "allow" },
  });
  assert.equal(doc.herald_version, "1.1");
});

test("rateLimit converte para rate_limit/window_seconds (snake_case)", () => {
  const doc = buildDiscoveryDocument({
    origin: "https://example.com",
    capabilities: ["html"],
    defaultPolicy: { read: "allow", rateLimit: { requests: 10, windowSeconds: 60 } },
  });
  assert.deepEqual(doc.policies.default.rate_limit, { requests: 10, window_seconds: 60 });
});

test("campo de policy nao definido nao aparece no objeto serializado", () => {
  const doc = buildDiscoveryDocument({
    origin: "https://example.com",
    capabilities: ["html"],
    defaultPolicy: { read: "allow" },
  });
  assert.ok(!("train" in doc.policies.default));
});

test("by_agent_type e by_agent_id aparecem quando fornecidos", () => {
  const doc = buildDiscoveryDocument({
    origin: "https://example.com",
    capabilities: ["html"],
    defaultPolicy: { read: "allow" },
    byAgentType: { crawler: { read: "allow", train: "ask" } },
    byAgentId: { "anthropic-claude/1.0": { read: "allow" } },
  });
  assert.deepEqual(doc.policies.by_agent_type, { crawler: { read: "allow", train: "ask" } });
  assert.deepEqual(doc.policies.by_agent_id, { "anthropic-claude/1.0": { read: "allow" } });
});
