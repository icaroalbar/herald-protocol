/**
 * Script de validação da PoC — exercita, contra uma instância rodando de `server.ts`,
 * os 5 pontos exigidos pelo Herald Protocol, mais verificação de assinatura e o fluxo de
 * monetização (decisões registradas em ICA-27):
 *   1. Identificação de agentes
 *   2. Resposta diferenciada sem alterar o conteúdo
 *   3. Políticas de acesso (incluindo rate limit)
 *   4. Métricas
 *   5. Extensibilidade e compatibilidade HTTP
 *   6-7. Verificação de assinatura (aceita assinatura válida, rejeita forjada)
 *   8-10. Monetização x402 (ver MONETIZATION.md): Payment-Required na primeira tentativa,
 *         pagamento válido libera o recurso, pagamento insuficiente continua bloqueado
 *
 * Uso: em um terminal, `npm start`; em outro, `npm run demo`.
 */

import { signRequest, generateSigningKeyPair } from "@herald/sdk";

const BASE_URL = process.env.HERALD_POC_URL ?? "http://localhost:4811";

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

async function main(): Promise<void> {
  console.log(`Validando PoC Herald em ${BASE_URL}\n`);

  // --- 1. Identificação de agentes -----------------------------------------
  const asAssistant = await fetch(`${BASE_URL}/artigos/bem-vindo-ao-herald`, {
    headers: {
      "Herald-Agent-Id": "anthropic-claude/1.0",
      "Herald-Agent-Type": "assistant",
      "Herald-Accept-Capabilities": "structured-json;q=1.0",
    },
  });
  const decisionHeader = asAssistant.headers.get("Herald-Policy-Decision");
  check(
    "1. Identificacao de agentes",
    decisionHeader !== null,
    decisionHeader ? `Herald-Policy-Decision presente: "${decisionHeader}"` : "header ausente"
  );

  // --- 2. Resposta diferenciada sem alterar o conteúdo ---------------------
  const asAssistantJson = (await asAssistant.json()) as { title?: string; body?: string };
  const asHuman = await fetch(`${BASE_URL}/artigos/bem-vindo-ao-herald`);
  const humanHtml = await asHuman.text();
  const sameFacts =
    typeof asAssistantJson.title === "string" &&
    typeof asAssistantJson.body === "string" &&
    humanHtml.includes(asAssistantJson.title) &&
    humanHtml.includes(asAssistantJson.body);
  check(
    "2. Resposta diferenciada sem alterar conteudo",
    sameFacts,
    sameFacts
      ? "JSON estruturado (agente) contem o mesmo titulo/corpo do HTML servido ao humano"
      : "conteudo divergente entre as duas representacoes"
  );

  // --- 3. Políticas de acesso ------------------------------------------------
  const premium = await fetch(`${BASE_URL}/artigos/relatorio-premium`, {
    headers: { "Herald-Agent-Id": "anthropic-claude/1.0", "Herald-Agent-Type": "assistant" },
  });
  check(
    "3. Politicas de acesso (recurso com regra 'ask')",
    premium.status === 402,
    `GET /artigos/relatorio-premium com agente -> HTTP ${premium.status} (esperado 402)`
  );

  let rateLimited = false;
  for (let i = 0; i < 7; i++) {
    const r = await fetch(`${BASE_URL}/artigos/como-funciona-a-negociacao`, {
      headers: { "Herald-Agent-Id": "acme-researchcrawler/0.1", "Herald-Agent-Type": "crawler" },
    });
    if (r.status === 429) {
      rateLimited = true;
      break;
    }
  }
  check(
    "3b. Rate limiting (crawler, limite de 5 req/min)",
    rateLimited,
    rateLimited ? "HTTP 429 recebido apos exceder o limite configurado" : "limite nao foi acionado em 7 requisicoes"
  );

  // --- 4. Métricas -------------------------------------------------------------
  const metricsRes = await fetch(`${BASE_URL}/metrics`);
  const metrics = (await metricsRes.json()) as {
    sampleCount: number;
    requestsByAgent: Record<string, number>;
  };
  const hasAgentMetrics = metrics.sampleCount > 0 && Object.keys(metrics.requestsByAgent).length > 0;
  check(
    "4. Metricas",
    hasAgentMetrics,
    hasAgentMetrics
      ? `sampleCount=${metrics.sampleCount}, agentes rastreados=[${Object.keys(metrics.requestsByAgent).join(", ")}]`
      : "nenhuma metrica coletada"
  );

  // --- 5. Extensibilidade e compatibilidade HTTP --------------------------------
  const futureAgentRes = await fetch(`${BASE_URL}/artigos/bem-vindo-ao-herald`, {
    headers: {
      "Herald-Agent-Id": "acme-futuroagente/9.9",
      "Herald-Agent-Type": "assistant",
      "Herald-Ext-Custom-Field": "qualquer-coisa-nao-reconhecida",
      "Herald-Accept-Capabilities": "formato-inexistente;q=1.0",
    },
  });
  const unknownHandledGracefully = futureAgentRes.status === 200;
  const humanUnaffected = asHuman.status === 200 && asHuman.headers.get("Herald-Content-Format") === null;
  check(
    "5. Extensibilidade e compatibilidade HTTP",
    unknownHandledGracefully && humanUnaffected,
    `capability desconhecida + header Herald-Ext-* ignorados sem erro (HTTP ${futureAgentRes.status}); ` +
      `cliente humano sem headers Herald-* na resposta: ${humanUnaffected}`
  );

  // --- 6-7. Verificação de assinatura (RFC 9421) --------------------------------
  const keyRes = await fetch(`${BASE_URL}/__poc/signing-key`);
  const { keyId, privateKeyPem } = (await keyRes.json()) as { keyId: string; privateKeyPem: string };
  const authority = new URL(BASE_URL).host;
  const signedResource = "/artigos/como-funciona-a-negociacao";

  const validSignature = signRequest({
    request: {
      method: "GET",
      path: signedResource,
      authority,
      headers: { "herald-agent-id": "anthropic-claude/1.0" },
    },
    keyId,
    alg: "ed25519",
    privateKeyPem,
    expiresInSeconds: 300,
  });

  const signedRes = await fetch(`${BASE_URL}${signedResource}`, {
    headers: { "Herald-Agent-Id": "anthropic-claude/1.0", "Herald-Agent-Type": "assistant", ...validSignature },
  });
  const verifiedHeader = signedRes.headers.get("X-Herald-Debug-Agent-Verified");
  check(
    "6. Verificacao de assinatura - assinatura valida aceita",
    verifiedHeader === "true",
    `requisicao assinada com a chave correta -> X-Herald-Debug-Agent-Verified=${verifiedHeader}`
  );

  // Impostor: reivindica o keyid real (conhecido publicamente), mas assina com uma
  // chave privada diferente — a assinatura NAO deve validar contra a chave publica
  // registrada no servidor para esse keyid.
  const forgedKeyPair = generateSigningKeyPair("ed25519");
  const forgedSignature = signRequest({
    request: {
      method: "GET",
      path: signedResource,
      authority,
      headers: { "herald-agent-id": "anthropic-claude/1.0" },
    },
    keyId,
    alg: "ed25519",
    privateKeyPem: forgedKeyPair.privateKeyPem,
  });

  const forgedRes = await fetch(`${BASE_URL}${signedResource}`, {
    headers: { "Herald-Agent-Id": "anthropic-claude/1.0", "Herald-Agent-Type": "assistant", ...forgedSignature },
  });
  const forgedVerifiedHeader = forgedRes.headers.get("X-Herald-Debug-Agent-Verified");
  check(
    "7. Verificacao de assinatura - assinatura forjada rejeitada",
    forgedVerifiedHeader === "false",
    `requisicao com assinatura forjada (keyid real, chave errada) -> X-Herald-Debug-Agent-Verified=${forgedVerifiedHeader} (esperado false)`
  );

  // --- 8-10. Monetização x402 (ver MONETIZATION.md) -------------------------------
  const paymentRequiredHeader = premium.headers.get("Payment-Required");
  let requirements: { scheme?: string; network?: string; maxAmountRequired?: string } = {};
  if (paymentRequiredHeader) {
    const decoded = JSON.parse(Buffer.from(paymentRequiredHeader, "base64").toString("utf-8")) as {
      accepts: Array<{ scheme: string; network: string; maxAmountRequired: string }>;
    };
    requirements = decoded.accepts[0] ?? {};
  }
  check(
    "8. Monetizacao (x402) - primeira tentativa retorna Payment-Required",
    paymentRequiredHeader !== null && requirements.scheme === "exact",
    paymentRequiredHeader
      ? `Payment-Required decodificado: scheme=${requirements.scheme}, network=${requirements.network}, maxAmountRequired=${requirements.maxAmountRequired}`
      : "header Payment-Required ausente"
  );

  const validPaymentPayload = {
    scheme: requirements.scheme ?? "exact",
    network: requirements.network ?? "base-sepolia",
    payload: { amount: String(Number(requirements.maxAmountRequired ?? "1000") + 500), payer: "0xAgentePoC" },
  };
  const validPaymentHeader = Buffer.from(JSON.stringify(validPaymentPayload), "utf-8").toString("base64");

  const paidRes = await fetch(`${BASE_URL}/artigos/relatorio-premium`, {
    headers: {
      "Herald-Agent-Id": "anthropic-claude/1.0",
      "Herald-Agent-Type": "assistant",
      "Payment-Signature": validPaymentHeader,
    },
  });
  const paymentResponseHeader = paidRes.headers.get("Payment-Response");
  const settlement = paymentResponseHeader
    ? (JSON.parse(Buffer.from(paymentResponseHeader, "base64").toString("utf-8")) as { success: boolean })
    : null;
  check(
    "9. Monetizacao (x402) - pagamento valido libera o recurso",
    paidRes.status === 200 && settlement?.success === true,
    `GET /artigos/relatorio-premium com Payment-Signature valido -> HTTP ${paidRes.status}, Payment-Response.success=${settlement?.success}`
  );

  const insufficientPaymentPayload = {
    scheme: requirements.scheme ?? "exact",
    network: requirements.network ?? "base-sepolia",
    payload: { amount: "1", payer: "0xAgentePoC" },
  };
  const insufficientPaymentHeader = Buffer.from(JSON.stringify(insufficientPaymentPayload), "utf-8").toString("base64");
  const underpaidRes = await fetch(`${BASE_URL}/artigos/relatorio-premium`, {
    headers: {
      "Herald-Agent-Id": "anthropic-claude/1.0",
      "Herald-Agent-Type": "assistant",
      "Payment-Signature": insufficientPaymentHeader,
    },
  });
  check(
    "10. Monetizacao (x402) - pagamento insuficiente continua bloqueado",
    underpaidRes.status === 402,
    `GET /artigos/relatorio-premium com Payment-Signature de valor insuficiente -> HTTP ${underpaidRes.status} (esperado 402)`
  );

  // --- Resultado final -----------------------------------------------------------
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} validacoes passaram.`);
  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Erro ao rodar a validacao da PoC:", err);
  process.exitCode = 1;
});
