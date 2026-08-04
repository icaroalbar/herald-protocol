# Herald Protocol — Governança

> Decisão registrada em ICA-27 (revisão da Fase 1, revisitada em 2026-08-03).

## 1. Modelo atual: BDFL (Benevolent Dictator for Life) com gatilhos

Enquanto o projeto não tem tração externa real, a especificação (RFC-0001 e os documentos
normativos associados: HEADERS.md, SIGNATURES.md) e a implementação de referência (SDK,
Gateway, Dashboard, Policy Engine) são mantidas por um único autor (Icaro Albar), que tem
autoridade final sobre mudanças na spec.

Isso é deliberado: com um único mantenedor e nenhum adotante externo conhecido, um processo
formal de RFC/votação teria custo de coordenação sem benefício real — ninguém além do autor
está propondo mudanças hoje.

## 2. Gatilhos objetivos para migrar de modelo

O modelo BDFL deixa de ser adequado quando **qualquer um** dos critérios abaixo for
atingido. Isso não é uma previsão de quando isso vai acontecer — é um compromisso de que,
se acontecer, a governança muda:

| Gatilho | Ação disparada |
|---|---|
| 3+ implementações independentes do protocolo (não forks do SDK de referência) | Criar um processo leve de RFC (issue + período de comentário) para mudanças na spec |
| 5+ contribuidores externos com PRs aceitos no repositório de referência | Formar um grupo de revisores com poder de aprovação (não só o autor) |
| Uso em produção por 3+ organizações não afiliadas ao autor | Avaliar migrar a spec (não a implementação) para um formato de "living standard" com changelog público e processo de deprecação formal |
| Qualquer adotante propõe uma mudança incompatível com uma decisão de design existente | Documentar a decisão anterior explicitamente (o que já é prática neste projeto — ver ICA-27) antes de aceitar ou rejeitar |

## 3. O que já funciona como governança informal hoje

- Decisões de design controversas são registradas em issues do Linear (ex: ICA-27) com o
  raciocínio explícito, não só o resultado — permite auditoria retroativa mesmo sem
  processo formal.
- A separação entre **spec** (RFC-0001, normativa) e **implementação de referência** (SDK/
  Gateway/Dashboard, não-normativa) já existe desde a Fase 1 — uma mudança de governança
  futura pode afetar só uma das duas partes.
- Lacunas e limitações conhecidas são documentadas ao invés de escondidas (ver TESTPLAN.md
  §5, SIGNATURES.md §8) — reduz a superfície de "descoberta desagradável" por adotantes
  futuros, que é uma das formas mais comuns de erosão de confiança em specs abertas.

## 4. Fora de escopo por agora

- Escolha de fundação/entidade guarda-chuva (ex: seguir o modelo do x402 Foundation, que
  migrou para a Linux Foundation em 2026) — só faz sentido avaliar com tração real.
- Trademark/licenciamento formal do nome "Herald Protocol" — ver decisão de nome registrada
  em ICA-27; reavaliar antes de qualquer registro de marca.

## 5. Modelo de negócio e licenciamento

Ver [BUSINESS.md](./BUSINESS.md) — decisão separada (mesma data), sobre licenciamento
(spec permissiva, implementação de referência MIT) e sobre o modelo open-core pretendido
para uma eventual camada comercial (hosting gerenciado, recursos premium). O guardrail lá
descrito (nunca usar controle da spec para proteger o produto comercial) é uma extensão
direta do compromisso de neutralidade já assumido neste documento.
