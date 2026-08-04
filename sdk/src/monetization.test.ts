import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPaymentRequiredHeader,
  parsePaymentSignatureHeader,
  buildPaymentResponseHeader,
  createDemoPaymentVerifier,
  type PaymentRequirements,
} from "./monetization.js";

const requirements: PaymentRequirements = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "1000",
  asset: "0xUSDC",
  payTo: "0xDestino",
  resource: "/artigos/relatorio-premium",
  description: "Acesso ao relatório premium",
};

test("buildPaymentRequiredHeader produz base64 de {x402Version, accepts:[requirements]}", () => {
  const header = buildPaymentRequiredHeader(requirements);
  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  assert.equal(decoded.x402Version, 2);
  assert.deepEqual(decoded.accepts, [requirements]);
});

test("parsePaymentSignatureHeader faz round-trip com um payload válido", () => {
  const payload = { scheme: "exact", network: "base-sepolia", payload: { amount: "1000", payer: "0xAgente" } };
  const header = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
  const parsed = parsePaymentSignatureHeader(header);
  assert.deepEqual(parsed, payload);
});

test("parsePaymentSignatureHeader retorna null para header ausente", () => {
  assert.equal(parsePaymentSignatureHeader(undefined), null);
});

test("parsePaymentSignatureHeader retorna null para base64 malformado", () => {
  assert.equal(parsePaymentSignatureHeader("%%%nao-e-base64%%%---"), null);
});

test("parsePaymentSignatureHeader retorna null quando faltam campos obrigatórios", () => {
  const header = Buffer.from(JSON.stringify({ scheme: "exact" }), "utf-8").toString("base64");
  assert.equal(parsePaymentSignatureHeader(header), null);
});

test("buildPaymentResponseHeader faz round-trip com um settlement", () => {
  const settlement = { success: true, network: "base-sepolia", transaction: "tx-123", payer: "0xAgente" };
  const header = buildPaymentResponseHeader(settlement);
  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  assert.deepEqual(decoded, settlement);
});

test("createDemoPaymentVerifier aceita pagamento com valor suficiente e scheme/network corretos", async () => {
  const verifier = createDemoPaymentVerifier();
  const result = await verifier.verify(
    { scheme: "exact", network: "base-sepolia", payload: { amount: "1500", payer: "0xAgente" } },
    requirements
  );
  assert.equal(result.success, true);
  assert.equal(result.network, "base-sepolia");
  assert.equal(result.payer, "0xAgente");
  assert.ok(result.transaction);
});

test("createDemoPaymentVerifier rejeita valor insuficiente", async () => {
  const verifier = createDemoPaymentVerifier();
  const result = await verifier.verify(
    { scheme: "exact", network: "base-sepolia", payload: { amount: "10", payer: "0xAgente" } },
    requirements
  );
  assert.equal(result.success, false);
  assert.equal(result.errorReason, "valor_insuficiente");
});

test("createDemoPaymentVerifier rejeita scheme/network que não batem com os requirements", async () => {
  const verifier = createDemoPaymentVerifier();
  const result = await verifier.verify(
    { scheme: "upto", network: "solana", payload: { amount: "5000" } },
    requirements
  );
  assert.equal(result.success, false);
  assert.equal(result.errorReason, "scheme_ou_network_nao_batem");
});

test("createDemoPaymentVerifier usa 'unknown' quando payer não é informado", async () => {
  const verifier = createDemoPaymentVerifier();
  const result = await verifier.verify(
    { scheme: "exact", network: "base-sepolia", payload: { amount: "1000" } },
    requirements
  );
  assert.equal(result.success, true);
  assert.equal(result.payer, "unknown");
});
