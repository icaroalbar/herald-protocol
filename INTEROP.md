# Herald Protocol — Interoperabilidade com Padrões Adjacentes

> Item 1 do ICA-27 (revisão da Fase 1, revisitada em 2026-08-03). Mapeia o Herald Protocol
> contra os principais padrões que ocupam espaços de problema adjacentes, e decide se/como
> o Herald Protocol deveria interoperar com cada um.

## 1. Panorama (estado em agosto de 2026)

| Padrão | Mantenedor | O que resolve | Estado |
|---|---|---|---|
| **RSL** (Really Simple Licensing) | RSL Collective (nonprofit) | Licenciamento de conteúdo para treino de IA via extensão do `robots.txt` — termos de uso, preço, pay-per-crawl/pay-per-inference | Lançado set/2025, virou "official industry standard" em dez/2025. Adoção real: Reddit, Yahoo, Quora, Medium, O'Reilly, Fastly, Ziff Davis |
| **Content Signals Policy** | Cloudflare | Vocabulário machine-readable no `robots.txt` para separar 3 usos de conteúdo: `search`, `ai-input`, `ai-train` | Lançado set/2025. Google (via John Mueller) declarou publicamente que o crawler do Google **ignora** esse sinal — é preferência, não controle técnico. Cloudflare vai setar defaults restritivos (Training/Agent bloqueados em domínios novos) a partir de 15/set/2026 |
| **TDMRep** (TDM Reservation Protocol) | W3C Community Group | Permite a um rightsholder declarar opt-out de text-and-data-mining, alinhado à diretiva DSM da UE (2019) | Community Group Final Report desde 2022 — nunca virou W3C Recommendation formal. Desenvolvimento ainda ativo (issues em 2026) mas adoção de mercado modesta, majoritariamente Europa |
| **llms.txt** | Comunidade aberta (sem entidade formal) | Arquivo markdown em `/llms.txt` resumindo um site para consumo por LLMs/agentes de código | ~8.7% dos top 1000 sites globais (jun/2026). Ironia relevante: crawlers de treino/busca (GPTBot, ClaudeBot, PerplexityBot) **majoritariamente não buscam** esse arquivo — quem usa de verdade são agentes de IDE (Cursor, Claude Code, Copilot) puxando docs |
| **x402** | x402 Foundation (Linux Foundation, desde jul/2026) | Pagamento HTTP-nativo via status `402 Payment Required` — agente paga e reenvia a requisição | Ver MONETIZATION.md — tratado separadamente porque endereça o intent `ask`, não descoberta/política de acesso |

## 2. Onde cada um se sobrepõe (ou não) ao Herald Protocol

### RSL — maior sobreposição real

RSL e o Herald Protocol resolvem parte do mesmo problema (declarar o que um agente pode
fazer com o conteúdo) mas em camadas diferentes: RSL vive no `robots.txt` (nível de site,
antes de qualquer requisição HTTP individual, sem negociação em tempo real), enquanto o
Herald Protocol vive em headers HTTP por requisição + endpoint de descoberta (permite
decisão por recurso, por agente identificado, com resposta síncrona).

**Não são mutuamente exclusivos.** Um site pode publicar RSL no `robots.txt` (visível a
qualquer crawler, inclusive os que não sabem nada de Herald) *e* expor
`/.well-known/herald` (para agentes que quer tratar com granularidade maior — rate limit,
verificação de assinatura, resposta estruturada).

### Content Signals Policy — sobreposição parcial, mas o sinal é fraco

Mesma camada (`robots.txt`), vocabulário mais simples que RSL (3 categorias booleanas vs.
termos de licenciamento). Problema: o próprio Google já disse publicamente que ignora esse
sinal — não há garantia de enforcement, é intenção declarada sem mecanismo técnico. O
Herald Protocol, por operar com resposta HTTP síncrona (403/402/429), tem enforcement real
no nível da aplicação, não apenas uma preferência textual.

### TDMRep — sobreposição conceitual, tração baixa

Endereça uma motivação legal específica (opt-out de TDM sob a diretiva DSM da UE), não um
mecanismo de negociação de formato/identificação de agente. Overlap conceitual com o intent
`train` do Herald Protocol, mas TDMRep nunca decolou como padrão amplamente adotado fora da
Europa — não há Recommendation formal do W3C ainda, quase 4 anos depois do Community Group
Final Report.

### llms.txt — problema adjacente, não sobreposto

`llms.txt` resolve descoberta de conteúdo para *contexto* de um agente (documentação,
sumário do site), não identificação de agente nem política de acesso. É complementar, não
concorrente — um site pode ter os dois sem conflito nenhum de responsabilidade.

## 3. Decisão

**O Herald Protocol não importa nem tenta mapear automaticamente políticas de RSL/Content
Signals/TDMRep para dentro do documento de descoberta nesta fase.** Razões:

1. **Camadas diferentes, sem conflito real de namespace.** `robots.txt` e
   `/.well-known/herald` coexistem sem colisão — não há necessidade técnica de unificação
   para os dois funcionarem lado a lado no mesmo site.
2. **Tração desigual entre os padrões.** RSL tem adoção editorial real; Content Signals tem
   sinal fraco (Google ignora); TDMRep tem tração baixa fora da UE. Investir em import
   automático de 3 formatos com credibilidade tão diferente adicionaria complexidade sem
   benefício proporcional agora.
3. **Diferenciação deliberada**: o valor específico do Herald Protocol — negociação de
   *formato de entrega* por requisição, com resposta síncrona e verificação de identidade —
   não existe em nenhum desses 4 padrões. Não faz sentido diluir esse foco tentando virar um
   agregador de todo sinal adjacente.

O que **fica registrado como extensão futura possível**, não implementada agora: um campo
opcional em `extensions` do documento de descoberta apontando para uma política RSL
existente do site (`extensions.rsl_license_url`), só como referência cruzada informativa —
sem parsing nem enforcement automático pelo Herald Protocol. Não há issue aberta para isso;
revisitar se/quando houver demanda real de um adotante.

## 4. O que muda na comunicação do projeto

- README raiz e RFC-0001 devem deixar claro que o Herald Protocol **não substitui**
  `robots.txt`/RSL — um site continua precisando de ambos se quiser tanto opt-out amplo de
  crawlers de treino quanto negociação fina por requisição.
- Nenhuma mudança de código é necessária a partir desta decisão — é puramente uma decisão
  de posicionamento/escopo, documentada aqui para não ser perdida.
