/**
 * Mecânica de referência para o intent `ask` (RFC-0001 §8.2), alinhada ao protocolo x402
 * (Coinbase/Cloudflare, hoje sob governança da Linux Foundation via x402 Foundation desde
 * jul/2026). Ver MONETIZATION.md na raiz do repositório para o raciocínio completo por trás
 * dessa decisão (ICA-27, item 2).
 *
 * Implementa apenas o subconjunto de headers do x402 V2 necessário para o fluxo de
 * referência: `Payment-Required` (servidor→cliente), `Payment-Signature`
 * (cliente→servidor), `Payment-Response` (servidor→cliente). Não implementa liquidação
 * on-chain real nem integração com um facilitator de produção — isso é responsabilidade de
 * quem implementa `PaymentVerifier.verify()` na integração real.
 */

export interface PaymentRequirements {
  /** Esquema de pagamento x402, ex: "exact". */
  scheme: string;
  /** Rede usada para liquidação, ex: "base-sepolia", "solana". Informativo nesta implementação de referência. */
  network: string;
  /** Valor mínimo exigido, em unidades atômicas do asset, como string (evita perda de precisão de ponto flutuante). */
  maxAmountRequired: string;
  /** Identificador do asset (ex: endereço de contrato de um token). */
  asset: string;
  /** Endereço de destino do pagamento. */
  payTo: string;
  /** Recurso protegido, tipicamente o path da requisição. */
  resource: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
}

export interface PaymentPayload {
  scheme: string;
  network: string;
  /** Conteúdo específico do scheme (ex: autorização assinada, valor, remetente). */
  payload: Record<string, unknown>;
}

export interface SettlementResponse {
  success: boolean;
  network?: string;
  transaction?: string;
  payer?: string;
  errorReason?: string;
}

/** Verifica (e, numa implementação real, liquida) um pagamento contra os requirements exigidos. */
export interface PaymentVerifier {
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettlementResponse>;
}

/** Constrói o header `Payment-Required` (x402 V2): `{ x402Version, accepts: [requirements] }` em base64. */
export function buildPaymentRequiredHeader(requirements: PaymentRequirements): string {
  return Buffer.from(JSON.stringify({ x402Version: 2, accepts: [requirements] }), "utf-8").toString("base64");
}

/** Parseia o header `Payment-Signature` enviado pelo cliente ao reenviar a requisição. */
export function parsePaymentSignatureHeader(header: string | undefined): PaymentPayload | null {
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as PaymentPayload).scheme !== "string" ||
      typeof (parsed as PaymentPayload).network !== "string" ||
      typeof (parsed as PaymentPayload).payload !== "object"
    ) {
      return null;
    }
    return parsed as PaymentPayload;
  } catch {
    return null;
  }
}

/** Constrói o header `Payment-Response` com o resultado da liquidação. */
export function buildPaymentResponseHeader(settlement: SettlementResponse): string {
  return Buffer.from(JSON.stringify(settlement), "utf-8").toString("base64");
}

/**
 * Verificador de demonstração — NÃO faz liquidação on-chain real. Aceita qualquer payload
 * cujo `scheme`/`network` batam com os requirements e cujo `payload.amount` (string
 * numérica) seja >= `requirements.maxAmountRequired`. Existe só para provar o fluxo x402 de
 * ponta a ponta na PoC sem depender de uma rede blockchain real ou de um facilitator
 * externo. Uma integração de produção substitui isso por uma chamada real a um facilitator
 * (Coinbase, ou outro membro do x402 Foundation) que verifica e liquida on-chain de fato.
 */
export function createDemoPaymentVerifier(): PaymentVerifier {
  return {
    async verify(payload, requirements) {
      if (payload.scheme !== requirements.scheme || payload.network !== requirements.network) {
        return { success: false, errorReason: "scheme_ou_network_nao_batem" };
      }
      const amount = Number((payload.payload as { amount?: string }).amount ?? "0");
      const required = Number(requirements.maxAmountRequired);
      if (!Number.isFinite(amount) || amount < required) {
        return { success: false, errorReason: "valor_insuficiente" };
      }
      return {
        success: true,
        network: requirements.network,
        transaction: `demo-tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payer: typeof (payload.payload as { payer?: string }).payer === "string" ? (payload.payload as { payer: string }).payer : "unknown",
      };
    },
  };
}
