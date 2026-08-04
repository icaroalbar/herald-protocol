---
layout: home
hero:
  name: Herald Protocol
  text: Identidade e política de acesso pra agentes de IA na web
  tagline: Protocolo aberto sobre HTTP — identifica agentes, negocia formato de entrega, aplica política de acesso e gera observabilidade, sem quebrar clientes que não conhecem o protocolo.
  actions:
    - theme: brand
      text: Começar
      link: /guides/getting-started
    - theme: alt
      text: RFC-0001 (especificação)
      link: /spec/RFC-0001
    - theme: alt
      text: GitHub
      link: https://github.com/icaroalbar/herald-protocol
features:
  - title: Identificação de agentes
    details: Herald-Agent-Id/Herald-Agent-Type autodeclarados, com fallback por padrão de User-Agent e verificação criptográfica opcional via HTTP Message Signatures (RFC 9421).
  - title: Negociação de formato
    details: Mesmo conteúdo, entrega diferente — um agente pede JSON estruturado, um humano recebe HTML, sem duplicar a informação.
  - title: Política de acesso
    details: allow/deny/ask por intent (read/train/redistribute/monetize), em cascata por tipo ou id de agente, com rate limit.
  - title: Monetização (x402)
    details: Intent ask com fluxo de referência de pagamento — 402 com Payment-Required, o agente paga, a origem libera.
  - title: Observabilidade
    details: Métricas por agente, decisão, formato e latência — agregadas no Dashboard de referência.
  - title: Implementação de referência MIT
    details: SDK, Gateway (middleware Express) e Dashboard prontos para uso, testados com node:test + supertest.
---
