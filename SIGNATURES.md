# Herald Protocol — Verificação de Identidade via HTTP Message Signatures

> Detalha normativamente o que o [RFC-0001](./RFC-0001.md) §4.4 deixa como recomendação
> (SHOULD) sem especificar o mecanismo. Este documento descreve a implementação de
> referência (`@herald/sdk`, módulo `signature.ts`) — um subconjunto prático da RFC 9421,
> não a especificação completa.

## 1. Por que isso existe

`Herald-Agent-Id` é autodeclarado (RFC-0001 §4.1) — qualquer cliente pode enviar
`Herald-Agent-Id: anthropic-claude/1.0` sem ser a Anthropic. Para políticas que dependem
dessa identidade valer alguma coisa (ex: `train: "ask"` só é significativo se o agente que
está pedindo é mesmo quem diz ser), é preciso um mecanismo de prova. A revisão da Fase 1
do projeto (registrada em ICA-27) determinou que o SDK deveria tratar identidade
verificada e não verificada de forma explicitamente diferente — este documento é a
implementação dessa decisão.

## 2. Escopo do subconjunto suportado

A RFC 9421 completa é grande (múltiplos rótulos de assinatura por requisição, parâmetros
de componente como `;req`/`;key`/`;sf`, algoritmos diversos, `Accept-Signature` para
negociação). A implementação de referência do Herald Protocol suporta deliberadamente
menos:

- Um único rótulo de assinatura por requisição (`sig1`, fixo).
- Componentes cobertos: derivados (`@method`, `@path`, `@authority`, `@scheme`) e campos de
  header simples (sem parâmetros de componente).
- Dois algoritmos: `ed25519` (recomendado) e `ecdsa-p256-sha256`.
- Parâmetros de assinatura: `created`, `expires`, `keyid`, `alg`, `nonce`.

Isso é suficiente para o caso de uso do Herald Protocol (provar a identidade declarada em
`Herald-Agent-Id`) sem a complexidade de uma biblioteca RFC 9421 genérica.

## 3. Componentes cobertos por padrão

```
@method @path @authority herald-agent-id
```

Uma origem MAY exigir componentes adicionais cobertos (ex: incluir `herald-agent-type` ou
um header customizado); o agente precisa assinar exatamente os componentes que a origem vai
verificar — não há negociação automática de quais componentes cobrir nesta implementação.

## 4. Construção da string-base

Idêntica em espírito à RFC 9421 §2.5: uma linha por componente coberto, na ordem
declarada, seguida da linha `@signature-params`, juntas por `\n` (sem `\n` final):

```
"@method": GET
"@path": /artigos/exemplo
"@authority": example.com
"herald-agent-id": anthropic-claude/1.0
"@signature-params": ("@method" "@path" "@authority" "herald-agent-id");created=1735689600;keyid="anthropic-claude-key-1";alg="ed25519"
```

## 5. Headers

| Header | Exemplo |
|---|---|
| `Signature-Input` | `sig1=("@method" "@path" "@authority" "herald-agent-id");created=1735689600;keyid="anthropic-claude-key-1";alg="ed25519"` |
| `Signature` | `sig1=:MEUCIQD...base64...:` |

## 6. Fluxo

```
1. Agente gera (ou já possui) um par de chaves — generateSigningKeyPair("ed25519")
2. Origem registra a chave pública sob um keyid conhecido (fora de banda — não faz
   parte deste RFC; pode ser um arquivo de config, um serviço interno, etc.)
3. Agente assina cada requisição — signRequest({ request, keyId, alg, privateKeyPem })
   e anexa Signature-Input + Signature
4. Origem verifica — verifyRequestSignature({ request, resolvePublicKey })
5. Se válido: AgentContext.verified = true
   Se ausente/inválido/expirado: AgentContext.verified permanece false (nunca hard-falha
   a requisição por conta disso — verified=false é um estado normal, não um erro)
```

O `@herald/gateway` já executa os passos 4–5 automaticamente quando configurado com
`signatureVerification` (ver README do Gateway).

## 7. Expiração

`created` e `expires` (ambos em segundos desde epoch) protegem contra replay de
assinaturas capturadas. A implementação de referência rejeita (`valid: false`) assinaturas
com `created` mais antigo que `maxAgeSeconds` (default 300s) ou com `expires` já passado —
mas isso é uma janela de tolerância de aplicação, não faz parte da assinatura
criptográfica em si.

## 8. O que fica de fora (limitações conhecidas)

- Sem suporte a múltiplos rótulos de assinatura simultâneos.
- Sem parâmetros de componente (`;req`, `;bs`, etc.) — não é possível assinar, por
  exemplo, apenas uma parte estruturada de um header multi-valor.
- Sem `Accept-Signature` (negociação de quais algoritmos/componentes a origem aceita) —
  isso precisa ser combinado fora de banda hoje.
- ~~Sem registro/descoberta de chave pública padronizado~~ — RESOLVIDO (2026-08-04,
  ICA-32): [RFC-0002](./RFC-0002-descoberta-chave-publica.md) (Draft) define um
  mecanismo opcional, aditivo, via header `Herald-Agent-Keys-Url` — implementação de
  referência em `createAgentKeyResolver()` (`@herald/sdk`, módulo `agent-keys.ts`).
  `resolvePublicKey` continua podendo ser um Map/tabela/serviço estático quando a
  descoberta dinâmica não é necessária; os dois modos coexistem (`resolvePublicKey`
  agora recebe um segundo parâmetro de contexto opcional de usar — ver
  `ResolvePublicKeyContext`). RFC-0002 ainda está em Draft — ver "Perguntas em aberto"
  lá antes de tratar o mecanismo como definitivo.

## 9. Referências

- RFC 9421 — HTTP Message Signatures
- RFC-0001 §4.4 — Verificação de Identidade (opcional, recomendado)
