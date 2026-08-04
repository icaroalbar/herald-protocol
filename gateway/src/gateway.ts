import { Router, type Request, type Response, type NextFunction } from "express";
import {
  identifyAgent,
  parseAcceptCapabilities,
  negotiateFormat,
  PolicyEngine,
  formatPolicyDecisionHeader,
  buildDiscoveryDocument,
  InMemoryMetricsCollector,
  verifyRequestSignature,
  parsePaymentSignatureHeader,
  buildPaymentRequiredHeader,
  buildPaymentResponseHeader,
  type AgentContext,
  type Capability,
  type DiscoveryDocumentConfig,
  type MetricsCollector,
  type PolicyEngineConfig,
  type PaymentRequirements,
  type PaymentVerifier,
  type ResolvePublicKeyContext,
} from "@herald/sdk";
import { FormatterRegistry } from "./formatters.js";
import { FixedWindowRateLimiter } from "./rate-limiter.js";
import { setHeraldContext } from "./context.js";

export interface SignatureVerificationConfig {
  /**
   * Resolve a chave pública (PEM) a partir do keyid declarado em Signature-Input. Um
   * resolver estático (ex: `(keyId) => meuMap.get(keyId)`) pode ignorar o segundo
   * parâmetro; para descoberta dinâmica via RFC-0002, plugue diretamente o retorno de
   * `createAgentKeyResolver()` (`@herald/sdk`, módulo `agent-keys.ts`).
   */
  resolvePublicKey: (
    keyId: string,
    context: ResolvePublicKeyContext
  ) => string | null | undefined | Promise<string | null | undefined>;
  /** default: 300 (5 minutos) */
  maxAgeSeconds?: number;
}

export interface MonetizationConfig {
  /**
   * Resolve os requirements de pagamento (x402, ver MONETIZATION.md) para o intent `ask`
   * neste recurso/agente. Retornar `null`/`undefined` mantém o 402 "puro" (sem header
   * Payment-Required) — útil quando `ask` significa aprovação humana fora de banda em vez
   * de pagamento automatizável.
   */
  resolveRequirements: (ctx: { agent: AgentContext; resource: string }) => PaymentRequirements | null | undefined;
  /** Verifica (e, numa integração real, liquida) o pagamento anexado via header Payment-Signature. */
  verifier: PaymentVerifier;
}

export interface HeraldGatewayConfig {
  discovery: DiscoveryDocumentConfig;
  policy: PolicyEngineConfig;
  metrics?: MetricsCollector;
  /** default: "/.well-known/herald" */
  wellKnownPath?: string;
  /** default: "/metrics" */
  metricsPath?: string;
  /**
   * Verificação de assinatura (RFC-0001 §4.4, HTTP Message Signatures / RFC 9421).
   * Sem essa opção, todo agente é tratado como não verificado (padrão seguro).
   * Quando configurada, requisições com Signature-Input/Signature válidos promovem
   * AgentContext.verified para true antes da avaliação de política — habilitando
   * `unverifiedOverride` no Policy Engine a diferenciar de fato os dois casos.
   */
  signatureVerification?: SignatureVerificationConfig;
  /**
   * Fluxo de referência x402 para o intent `ask` (ver MONETIZATION.md). Sem essa opção,
   * `ask` responde 402 apenas com a decisão de política, como hoje. Quando configurada, o
   * Gateway emite `Payment-Required` na primeira tentativa e verifica um eventual header
   * `Payment-Signature` reenviado pelo cliente; se o pagamento for liquidado, a requisição
   * segue o pipeline normalmente (rate limit, negociação de formato, formatter/next()).
   */
  monetization?: MonetizationConfig;
}

export interface HeraldGateway {
  /** Monte com `app.use(gateway.router)`. */
  router: Router;
  formatters: FormatterRegistry;
  metrics: MetricsCollector;
}

/**
 * Cria o Herald Gateway como um Router Express.
 *
 * Pipeline por requisição (ARCHITECTURE.md §3.1):
 *   1. identifica o agente (headers Herald ou fallback User-Agent)
 *   2. consulta o Policy Engine para intent=read
 *   3. aplica rate limit se a decisão trouxer um (RFC-0001 §8.5)
 *   4. nega/pede aprovação e curto-circuita se a política mandar (deny/ask)
 *   5. negocia o formato de resposta (Herald-Accept-Capabilities x capabilities da origem)
 *   6. se houver formatter registrado para (recurso, formato), responde direto;
 *      senão anexa o contexto resolvido em `getHeraldContext(req)` e chama `next()`
 *   7. registra métricas (requisição, decisão, formato, latência, erros)
 *
 * Clientes sem headers Herald passam pelo pipeline normalmente, mas resolvem para
 * agentType "unknown"/source "none" e nunca recebem headers Herald-* na resposta —
 * comportamento idêntico ao de hoje (RFC-0001 §3, princípio de compatibilidade retroativa).
 */
export function createHeraldGateway(config: HeraldGatewayConfig): HeraldGateway {
  const wellKnownPath = config.wellKnownPath ?? "/.well-known/herald";
  const metricsPath = config.metricsPath ?? "/metrics";

  const discoveryDoc = buildDiscoveryDocument(config.discovery);
  const policyEngine = new PolicyEngine(config.policy);
  const metrics = config.metrics ?? new InMemoryMetricsCollector();
  const formatters = new FormatterRegistry();
  const rateLimiter = new FixedWindowRateLimiter();

  const router = Router();

  router.get(wellKnownPath, (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "max-age=3600");
    res.json(discoveryDoc);
  });

  router.get(metricsPath, (_req: Request, res: Response) => {
    if (metrics instanceof InMemoryMetricsCollector) {
      res.json(metrics.snapshot());
    } else {
      res.status(501).json({ error: "snapshot() não suportado por este MetricsCollector" });
    }
  });

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agent = identifyAgent({
        headers: req.headers as Record<string, string | string[] | undefined>,
      });

      // Cliente sem qualquer identificação Herald: comportamento padrão inalterado,
      // sem métricas por agente (RFC-0001 §9 é sobre consumo de agentes, não tráfego geral).
      if (agent.source === "none") {
        return next();
      }

      // Promove verified=true quando a requisição traz uma assinatura válida
      // (RFC-0001 §4.4). Sem signatureVerification configurado, ou sem headers de
      // assinatura, o agente permanece verified=false — padrão seguro.
      if (agent.source === "herald-header" && config.signatureVerification) {
        const result = await verifyRequestSignature({
          request: {
            method: req.method,
            path: req.path,
            authority: req.headers.host ?? "",
            headers: req.headers as Record<string, string | string[] | undefined>,
          },
          resolvePublicKey: config.signatureVerification.resolvePublicKey,
          maxAgeSeconds: config.signatureVerification.maxAgeSeconds,
        });
        agent.verified = result.valid;
      }
      // Header de diagnóstico — não normativo, não faz parte do RFC-0001. Existe só
      // para observabilidade/debug de que a verificação criptográfica está funcionando.
      res.setHeader("X-Herald-Debug-Agent-Verified", String(agent.verified));

      const start = Date.now();
      metrics.incrementRequest(agent);

      res.on("finish", () => {
        metrics.recordLatency(agent, Date.now() - start);
        if (res.statusCode >= 400) metrics.recordError(agent, res.statusCode);
      });

      const decision = policyEngine.evaluate({ agent, resource: req.path, intent: "read" });
      metrics.recordPolicyDecision(agent, decision);
      res.setHeader("Herald-Policy-Decision", formatPolicyDecisionHeader(decision));
      res.setHeader("Vary", "Herald-Agent-Id, Herald-Accept-Capabilities");

      if (decision.result === "deny") {
        return res.status(403).json({ error: "denied", decision });
      }
      if (decision.result === "ask") {
        if (!config.monetization) {
          return res.status(402).json({ error: "ask", decision });
        }

        const requirements = config.monetization.resolveRequirements({ agent, resource: req.path });
        if (!requirements) {
          return res.status(402).json({ error: "ask", decision });
        }

        const rawPaymentHeader = req.headers["payment-signature"];
        const paymentHeader = Array.isArray(rawPaymentHeader) ? rawPaymentHeader[0] : rawPaymentHeader;
        const paymentPayload = parsePaymentSignatureHeader(paymentHeader);

        if (!paymentPayload) {
          // Primeira tentativa (sem Payment-Signature): informa o que é exigido para pagar.
          res.setHeader("Payment-Required", buildPaymentRequiredHeader(requirements));
          return res.status(402).json({ error: "ask", decision });
        }

        const settlement = await config.monetization.verifier.verify(paymentPayload, requirements);
        res.setHeader("Payment-Response", buildPaymentResponseHeader(settlement));

        if (!settlement.success) {
          res.setHeader("Payment-Required", buildPaymentRequiredHeader(requirements));
          return res.status(402).json({ error: "ask", decision, payment: settlement });
        }

        // Pagamento liquidado: segue o pipeline normalmente a partir daqui, como se a
        // decisão fosse "allow" (rate limit, negociação de formato, formatter/next()).
      }

      if (decision.rateLimit) {
        const key = agent.agentId ?? `type:${agent.agentType}`;
        const retryAfterSeconds = rateLimiter.check(key, decision.rateLimit);
        if (retryAfterSeconds !== null) {
          res.setHeader("Retry-After", String(retryAfterSeconds));
          return res.status(429).json({ error: "rate_limited", decision });
        }
      }

      const acceptHeader = req.headers["herald-accept-capabilities"];
      const requested = parseAcceptCapabilities(Array.isArray(acceptHeader) ? acceptHeader[0] : acceptHeader);
      const { format, matched } = negotiateFormat(requested, discoveryDoc.capabilities as Capability[]);

      setHeraldContext(req, { agent, format, matched });
      if (matched) res.setHeader("Herald-Content-Format", format);
      metrics.recordFormat(agent, matched ? format : "html");

      const formatterFn = matched ? formatters.resolve(req.path, format) : null;
      if (formatterFn) {
        Promise.resolve(formatterFn(req)).then(
          (body) => res.status(200).json(body),
          (err) => next(err)
        );
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  });

  return { router, formatters, metrics };
}
