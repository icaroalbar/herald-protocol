# Herald Protocol — Modelo de Negócio e Licenciamento

> Decisão registrada em 2026-08-03, na mesma revisão do ICA-27 que decidiu nome (Herald
> Protocol) e governança (BDFL com gatilhos, ver GOVERNANCE.md). Complementa GOVERNANCE.md
> §4, que já listava "escolha de fundação/entidade" e "trademark" como fora de escopo por
> agora — este documento cobre a parte de modelo de negócio que faltava.

## 1. Decisão

O Herald Protocol segue um modelo **open-core**: a especificação e a implementação de
referência ficam abertas e permissivas; a camada comercial (hosting gerenciado, recursos
premium) é construída por cima, não dentro, do que é aberto.

Concretamente:

- **Spec** (RFC-0001.md, HEADERS.md, SIGNATURES.md, INTEROP.md, well-known-herald.schema.json)
  — licença de conteúdo permissiva (CC-BY 4.0). Qualquer um pode implementar o protocolo
  descrito sem depender de aprovação ou pagamento ao autor.
- **Implementação de referência** (`@heraldserver/sdk`, `@heraldserver/gateway`, `@herald/dashboard`,
  `@herald/poc`) — MIT, como já declarado nos quatro `package.json`. Um arquivo `LICENSE`
  na raiz do repositório formaliza isso (adicionado nesta mesma revisão).
- **Camada comercial** (ainda não construída) — hosting gerenciado do Gateway/Dashboard e
  recursos premium (analytics históricos, SLA, integração com um facilitator x402 real,
  gestão de chaves de assinatura) ficam de fora do código aberto, como produto/serviço à
  parte.

## 2. Por que essa separação, e não algo tipo BSL/SSPL

MongoDB e Elastic relicenciaram o núcleo do produto (de licença OSI-aprovada para SSPL/BSL)
para impedir provedores de cloud de revenderem hosting sem contribuir de volta. Isso gerou
desconfiança real da comunidade — "open source" passou a ser lido como posicionamento de
marketing, não compromisso.

Para o Herald isso seria ainda mais custoso, porque o produto não é só um banco de dados
que empresas rodam internamente — é um **protocolo**. Um protocolo só cria valor se
terceiros o implementam livremente; se o SDK de referência tivesse licença restritiva,
ninguém adotaria o Herald como padrão, só como produto de um fornecedor. Manter spec e SDK
permissivos é o que torna a adoção possível em primeiro lugar — é pré-requisito, não
generosidade.

## 3. Sequenciamento

**Não construir a camada comercial agora.** Hoje não há adotante externo — um "Herald
Cloud" hospedado resolveria um problema que ninguém tem ainda. A prioridade continua sendo
tração do protocolo: fechar os itens abertos do ICA-27 (monetização/x402 em andamento) e,
mais adiante, a Fase 5 (comunidade e especificação aberta) já registrada no Linear.

A camada comercial (hosting + premium) vira prioridade quando houver sinal real de adoção
externa — alguém rodando `@heraldserver/gateway` em produção e perguntando "vocês oferecem
hosting?" é o gatilho, não uma data no calendário.

## 4. Guardrail para quando houver tração

Se aparecer um segundo implementador do protocolo ou um provedor de hosting concorrente,
a resposta correta é reforçar a neutralidade da spec — documentar a decisão anterior
publicamente (mesma prática já usada no ICA-27) — e não usar controle sobre a spec ou o SDK
para proteger o produto comercial. Relicenciar o núcleo de forma restritiva para bloquear
concorrência está descartado como opção; se a pressão competitiva exigir isso no futuro,
o caminho é fortalecer o produto/serviço comercial, não fechar o que hoje é aberto.

## 5. Fora de escopo por agora

- Estrutura societária, preço, ou desenho de produto da camada comercial — não existe
  ainda, e desenhar isso antes de ter adotante é especulação.
- Escolha de fundação/entidade guarda-chuva para a spec — mantém-se a decisão já registrada
  em GOVERNANCE.md §4 de só avaliar isso com tração real.
