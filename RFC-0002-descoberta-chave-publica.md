# RFC-0002: Descoberta de chave pública do agente

| | |
|---|---|
| **Status** | Draft |
| **Categoria** | Standards Track |
| **Autor** | Icaro Albar |
| **Data** | 2026-08-04 |
| **Substitui** | — |
| **Substituído por** | — |

> Proposta aberta — ver "Perguntas em aberto" (§7) antes de tratar isso como decisão
> final. Registrada a partir de ICA-27 (item 3) e refinada em ICA-32.

## Sumário

Define um mecanismo opcional para uma origem descobrir automaticamente a chave pública
de um agente ao verificar `Signature`/`Signature-Input` (RFC-0001 §4.4, SIGNATURES.md),
sem depender de registro manual fora de banda.

## Motivação

SIGNATURES.md §8 documenta a lacuna: `resolvePublicKey` hoje é implementado por quem
opera a origem — um `Map` em memória, uma tabela, um serviço interno. Isso funciona para
integrações combinadas previamente (ex: uma origem que já conhece os agentes que
espera), mas não escala para o caso geral: uma origem que nunca viu um agente antes não
tem como verificar sua identidade sem um passo manual de configuração.

Isso é o análogo do problema que o DKIM resolve para e-mail: o receptor não conhece o
remetente previamente, mas consegue buscar a chave pública do domínio declarado
(`d=`) via DNS. O Herald Protocol precisa de um equivalente: dado um agente que se
identifica com `Herald-Agent-Id` e assina a requisição, como a origem descobre a chave
pública correspondente sem coordenação prévia?

## Terminologia

- **Provedor de agente (Agent Provider)**: a organização que opera um agente e publica
  suas chaves de assinatura (ex: a empresa por trás de `anthropic-claude/1.0`).
- **Documento de chaves do agente (Agent Keys Document)**: JSON publicado pelo provedor
  de agente, listando as chaves de assinatura ativas/revogadas para um `Herald-Agent-Id`
  específico. Ver §3.

## Especificação

### 1. Header `Herald-Agent-Keys-Url`

Um agente que assina requisições MAY incluir:

```
Herald-Agent-Keys-Url: https://anthropic.com/.well-known/herald-agent-keys.json
```

Apontando para um Documento de Chaves do Agente (§3) publicado pelo seu provedor. A URL
MUST usar `https://`. Uma origem que não implementa este RFC MUST ignorar este header
(compatibilidade retroativa — ver §4).

Quando presente, `herald-agent-keys-url` SHOULD ser incluído nos componentes cobertos
pela assinatura (junto de `herald-agent-id`), para que uma tentativa de trocar a URL em
trânsito invalide a assinatura.

### 2. Convenção de path (não normativa)

Não é normativo que o Documento de Chaves do Agente viva em um path fixo — a URL exata é
sempre declarada explicitamente pelo header (§1), nunca derivada implicitamente. Como
convenção recomendada, provedores de agente SHOULD publicar em
`/.well-known/herald-agent-keys.json` no seu próprio domínio, análogo ao padrão
`/.well-known/herald` já usado pelas origens (RFC-0001 §6).

### 3. Formato do Documento de Chaves do Agente

```json
{
  "herald_version": "1.0",
  "agent_id": "anthropic-claude/1.0",
  "signing_keys": [
    {
      "key_id": "anthropic-claude-key-1",
      "alg": "ed25519",
      "public_key_pem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
      "status": "active",
      "not_before": "2026-08-01T00:00:00Z",
      "not_after": null
    }
  ]
}
```

Ver `herald-agent-keys.schema.json` (raiz do repositório) para o schema JSON completo.

- `agent_id` MUST corresponder exatamente ao `Herald-Agent-Id` que a origem recebeu na
  requisição sendo verificada — uma origem MUST rejeitar (tratar como chave não
  encontrada) um documento cujo `agent_id` não bata.
- `signing_keys[].status` MUST ser `"active"` ou `"revoked"`. Uma origem MUST tratar
  chaves `"revoked"` como inexistentes para fins de verificação de novas assinaturas.
- `not_before`/`not_after` (ISO-8601, opcionais) limitam a janela de validade de uma
  chave. Ausentes = sem limite naquela direção.
- Um provedor de agente rotaciona chaves publicando uma nova entrada em `signing_keys`
  com novo `key_id` e `status: "active"`, mantendo a entrada antiga (também `"active"`,
  ou movida para `"revoked"` se a chave antiga foi comprometida) até que agentes parem de
  usá-la.

### 4. Comportamento da origem ao verificar

1. Extrai `keyid` de `Signature-Input` (já existente, RFC-0001 §4.4).
2. Se `Herald-Agent-Keys-Url` está presente: busca o documento (HTTPS obrigatório),
   valida contra o schema, confere `agent_id` contra o `Herald-Agent-Id` declarado.
3. Localiza em `signing_keys` uma entrada com `key_id` igual ao `keyid` da assinatura,
   `status: "active"`, e dentro da janela `not_before`/`not_after`.
4. Se todos os passos acima produzem uma chave: usa `public_key_pem` para verificar a
   assinatura, como já descrito em SIGNATURES.md §4–6.
5. Se qualquer passo falha (URL ausente, fetch falha, `agent_id` não bate, chave não
   encontrada/revogada/fora da janela): a origem trata como chave pública desconhecida —
   mesmo comportamento hoje já definido para `resolvePublicKey` retornando
   `null`/`undefined` (verificação falha, `AgentContext.verified` permanece `false`, a
   requisição NÃO é hard-rejeitada só por isso — RFC-0001 princípio de não quebrar
   agentes não identificados).
6. Origens SHOULD cachear o documento buscado por um período curto (ex: 5–15 minutos) por
   URL, para não buscar a cada requisição, mas SHOULD respeitar um TTL baixo o
   suficiente para que revogação tenha efeito em tempo hábil.

## Compatibilidade retroativa

Aditivo: um agente que não envia `Herald-Agent-Keys-Url` continua funcionando exatamente
como antes (`resolvePublicKey` configurado fora de banda pela origem, como hoje). Uma
origem que não implementa este RFC ignora o header e se comporta como hoje. Nenhum
campo existente (`Herald-Agent-Id`, formato de `Signature-Input`/`Signature`) muda.

## Alternativas consideradas

- **Publicar chaves de agente no `/.well-known/herald` da própria origem visitada**:
  descartado — esse documento descreve a origem (capacidades, políticas), não os
  agentes que a visitam; não faz sentido semântico e forçaria toda origem a manter uma
  cópia das chaves de todo agente que pode aparecer.
- **Redefinir `Herald-Agent-Id` para embutir um domínio** (ex:
  `anthropic.com/claude/1.0`), permitindo derivar a URL de descoberta sem header novo,
  mais parecido com DKIM puro: descartado por ora — quebraria `AGENT_ID_PATTERN` e todo
  código/dado existente que assume o formato atual (`vendor-slug/versão`), sem ganho
  proporcional (o header cobre o mesmo caso de uso sendo aditivo).
- **DNS (TXT record) em vez de HTTPS**: mais fiel ao DKIM, mas HTTPS + JSON é
  consistente com o resto do Herald Protocol (que já é inteiramente HTTP) e não exige
  que um provedor de agente controle configuração DNS além do que já usa para hospedar
  conteúdo.

## Perguntas em aberto

- **Força do vínculo de identidade**: este mecanismo prova "quem controla a URL
  declarada vouches por este `agent_id`" — o mesmo nível de confiança que o DKIM dá sem
  DMARC (não prova que o domínio da URL "é" a organização nomeada no `agent_id`). Vale a
  pena definir uma forma de pin/allowlist de URLs confiáveis por vendor conhecido (fora
  de banda, na origem), como complemento? Ou isso é responsabilidade de quem opera a
  origem, fora do escopo desta RFC?
- **Múltiplos `agent_id` por documento**: a v1 aqui assume um Documento de Chaves por
  `agent_id` (um provedor com múltiplos agentes publica múltiplos documentos, múltiplas
  URLs). Vale a pena permitir `agent_id` como lista num único documento? Simplicidade vs.
  flexibilidade — não decidido.
- **TTL de cache recomendado**: "5–15 minutos" (§3.6) é um chute razoável, não medido.
  Precisa de dado real de quão rápido revogação precisa se propagar em produção.
- **Descoberta em massa**: nada aqui cobre uma origem que quer pré-carregar/auditar
  chaves de agentes conhecidos proativamente (fora do caminho de verificação de uma
  requisição real) — pode ser um caso de uso futuro, não coberto nesta versão.
