export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/** Mesma checagem de sdk/src/reporting.ts (assertSecureServerUrl) — duplicada aqui de
 * propósito porque cli/ é um pacote leaf, sem dependência em @herald/sdk. Centralizada
 * neste módulo dentro do próprio pacote pra não duplicar de novo entre outpost-create.ts,
 * outpost-list.ts, outpost-remove.ts e outpost-inspect.ts. */
export function assertSecureServerUrl(serverUrl: string, allowInsecureHttp?: boolean): void {
  const parsed = new URL(serverUrl);
  if (parsed.protocol === "https:" || isLoopbackHost(parsed.hostname) || allowInsecureHttp) return;
  throw new Error(
    `serverUrl ("${serverUrl}") não é HTTPS e não é localhost — dados sensíveis (chave, métricas) ` +
      "viajariam em texto puro na rede. Use https://, ou passe --allow-insecure-http se a conexão já " +
      "está protegida por outra camada (VPN/rede privada) — nunca na internet pública."
  );
}
