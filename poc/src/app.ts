import express, { type Express } from "express";
import { createHeraldGateway, getHeraldContext, type HeraldGateway } from "@herald/gateway";
import { generateSigningKeyPair, createDemoPaymentVerifier, type PaymentRequirements } from "@herald/sdk";
import { articles, findArticle } from "./data.js";

/**
 * App de exemplo que integra @herald/sdk (via @herald/gateway) sobre uma aplicação Express
 * "comum" com 3 artigos. Valida na prática os 5 pontos exigidos da PoC — ver
 * src/demo.ts para o script que exercita cada um deles.
 */

// Chave de assinatura gerada a cada start do servidor, só para a PoC provar que a
// verificação RFC 9421 funciona de ponta a ponta (ver SIGNATURES.md). Em produção a
// chave privada NUNCA sai do agente — aqui ela é exposta de propósito via uma rota de
// debug para que demo.ts (rodando como processo separado, simulando o "agente") possa
// assinar requisições sem precisar de coordenação de arquivos entre dois processos.
const DEMO_KEY_ID = "poc-demo-key-1";
const demoSigningKey = generateSigningKeyPair("ed25519");

// Requirements de pagamento (x402, ver MONETIZATION.md) para o único recurso com
// política `ask`: /artigos/relatorio-premium. O verificador de demonstração
// (createDemoPaymentVerifier) NÃO faz liquidação on-chain real — existe só para provar o
// fluxo Payment-Required -> Payment-Signature -> Payment-Response de ponta a ponta.
const PREMIUM_ARTICLE_REQUIREMENTS: PaymentRequirements = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "1000",
  asset: "0xUSDCDemo",
  payTo: "0xHeraldPocDemo",
  resource: "/artigos/relatorio-premium",
  description: "Acesso ao relatório premium (PoC do Herald Protocol)",
};

export function createPocApp(): { app: Express; gateway: HeraldGateway } {
  const gateway = createHeraldGateway({
    discovery: {
      origin: "http://localhost:3000",
      capabilities: ["structured-json", "html"],
      defaultPolicy: { read: "allow", train: "deny", redistribute: "deny" },
      byAgentType: {
        assistant: { read: "allow", train: "deny" },
        crawler: { read: "allow", train: "ask", rateLimit: { requests: 5, windowSeconds: 60 } },
        autonomous: { read: "allow", train: "deny" },
        "search-index": { read: "allow", train: "deny" },
      },
      analytics: { reporting: "aggregate", contact: "mailto:agents@example.com" },
    },
    policy: {
      default: { read: "allow", train: "deny" },
      // Espelha discovery.byAgentType acima — o Policy Engine deve aplicar exatamente
      // o que /.well-known/herald anuncia, senão Herald-Policy-Decision.rule vira enganoso
      // (caía em "default" por coincidência de valores em vez de "by_agent_type.assistant").
      byAgentType: {
        assistant: { read: "allow", train: "deny" },
        crawler: { read: "allow", train: "ask", rateLimit: { requests: 5, windowSeconds: 60 } },
        autonomous: { read: "allow", train: "deny" },
        "search-index": { read: "allow", train: "deny" },
      },
      byResource: [{ pattern: "/artigos/relatorio-premium", policies: { read: "ask" } }],
      // Reforça a decisão da revisão da Fase 1 (ICA-27): agente não verificado nunca
      // herda "allow"/"ask" para treino — vira "deny" direto.
      unverifiedOverride: { train: "deny" },
    },
    // Habilita a verificação de assinatura de verdade (RFC 9421 / SIGNATURES.md).
    // O registro de chaves aqui é só um Map em memória com uma única chave de demo —
    // uma origem real teria um registro persistente/administrável.
    signatureVerification: {
      resolvePublicKey: (keyId) => (keyId === DEMO_KEY_ID ? demoSigningKey.publicKeyPem : null),
    },
    // Fluxo de referência x402 (ver MONETIZATION.md) para o intent `ask`.
    monetization: {
      resolveRequirements: ({ resource }) =>
        resource === "/artigos/relatorio-premium" ? PREMIUM_ARTICLE_REQUIREMENTS : null,
      verifier: createDemoPaymentVerifier(),
    },
    // Push de métricas pro Dashboard via Outpost (ICA-34) — só ativa se as duas env vars
    // estiverem presentes (geradas por `herald outpost create` + `herald init`). Sem
    // elas, a PoC continua funcionando exatamente como antes.
    ...(process.env.HERALD_DASHBOARD_URL && process.env.HERALD_OUTPOST_KEY
      ? {
          reporting: {
            dashboardUrl: process.env.HERALD_DASHBOARD_URL,
            outpostKey: process.env.HERALD_OUTPOST_KEY,
            intervalMs: 10_000,
          },
        }
      : {}),
  });

  // Formatter: mesma fonte de dados do HTML, só muda a serialização (RFC-0001 §7).
  gateway.formatters.register("/artigos/*", "structured-json", async (req) => {
    const slug = req.path.replace(/^\/artigos\//, "");
    const article = findArticle(slug);
    if (!article) return { error: "not_found" };
    return { slug: article.slug, title: article.title, body: article.body, publishedAt: article.publishedAt };
  });

  const app = express();
  app.use(gateway.router);

  // Rota exclusiva de demo — NUNCA faça isso em produção. Existe só para permitir que
  // demo.ts assine requisições sem coordenação de arquivo entre os dois processos.
  app.get("/__poc/signing-key", (_req, res) => {
    res.json({ keyId: DEMO_KEY_ID, privateKeyPem: demoSigningKey.privateKeyPem });
  });

  app.get("/", (_req, res) => {
    const items = articles.map((a) => `<li><a href="/artigos/${a.slug}">${a.title}</a></li>`).join("");
    res.send(`<h1>Herald PoC</h1><ul>${items}</ul>`);
  });

  app.get("/artigos/:slug", (req, res) => {
    const article = findArticle(req.params.slug);
    if (!article) {
      res.status(404).send("Artigo não encontrado");
      return;
    }
    // Só chega aqui se o Gateway não interceptou com um formatter (ex: formato = html,
    // ou requisição de um cliente sem Herald) — renderiza a mesma fonte de dados em HTML.
    void getHeraldContext(req); // disponível se a aplicação quiser inspecionar o contexto resolvido
    res.send(
      `<article><h1>${article.title}</h1><p>${article.body}</p><small>${article.publishedAt}</small></article>`
    );
  });

  return { app, gateway };
}
