# Herald Protocol — Monetização do Intent `ask` via x402

> Item 2 do ICA-27 (revisão da Fase 1, revisitada em 2026-08-03). Detalha o que o
> [RFC-0001](./RFC-0001.md) §8.2 deixa como recomendação genérica ("acesso requer aprovação
> fora de banda") sem especificar um mecanismo concreto — este documento descreve a
> implementação de referência (`@heraldserver/sdk`, módulo `monetization.ts`).

## 1. Por que x402

O intent `ask` do Herald Protocol (RFC-0001 §8) cobre dois casos bem diferentes na prática:
aprovação humana fora de banda (ex: negociar um acordo comercial por e-mail) e pagamento
automatizável, onde o próprio agente pode resolver o `ask` sem intervenção humana. Para o
segundo caso, escrever um mecanismo de pagamento do zero não faz sentido quando já existe um
padrão emergente para exatamente isso: **x402**, hoje sob governança da x402 Foundation
(Linux Foundation, desde jul/2026), que reaproveita o status HTTP `402 Payment Required`
(reservado desde o início da especificação HTTP, nunca usado de forma padronizada até agora)
para um fluxo de "paga e reenvia a requisição".

Isso está alinhado com a decisão já registrada em INTEROP.md: o Herald Protocol não tenta
reinventar mecanismos que já têm um padrão emergente com tração real — ele referencia e
integra.

## 2. Escopo do subconjunto suportado

x402 V2 completo inclui múltiplos schemes de pagamento (`exact`, `upto`, `batch-settlement`),
múltiplas redes, e a figura de um "facilitator" que confirma liquidação on-chain. A
implementação de referência do Herald Protocol suporta deliberadamente menos:

- Os três headers do fluxo (`Payment-Required`, `Payment-Signature`, `Payment-Response`),
  cada um base64 de um JSON, no mesmo formato do x402 V2.
- Nenhum scheme específico é hardcoded — `PaymentRequirements.scheme`/`network` são
  campos livres, repassados como estão para quem implementa `PaymentVerifier`.
- **Sem liquidação on-chain própria.** O Gateway não fala com nenhuma blockchain nem
  facilitator — ele delega inteiramente a verificação/liquidação para um `PaymentVerifier`
  fornecido por quem configura o Gateway (ver §4).

Isso é suficiente para o caso de uso do Herald Protocol (dar ao `ask` um caminho
automatizável quando fizer sentido) sem acoplar o Gateway a uma blockchain, rede, ou
facilitator específico.

## 3. Fluxo

```
1. Agente faz GET normal em um recurso com policy `ask`.
2. Origem resolve PaymentRequirements para (agente, recurso) e responde:
     402 Payment Required
     Payment-Required: <base64 de {x402Version:2, accepts:[requirements]}>
3. Agente decodifica Payment-Required, monta um PaymentPayload (scheme, network,
   payload com os dados da autorização/valor/pagador) e reenvia a MESMA requisição com:
     Payment-Signature: <base64 do PaymentPayload>
4. Origem verifica o payload contra os requirements via PaymentVerifier.verify() e responde:
     Payment-Response: <base64 de SettlementResponse>
   Se settlement.success = true: a requisição segue o pipeline normalmente a partir daí
   (rate limit, negociação de formato, formatter/next()) — como se a policy fosse "allow".
   Se settlement.success = false: 402 novamente, com Payment-Required reanexado.
```

## 4. `PaymentVerifier` — ponto de extensão

```ts
export interface PaymentVerifier {
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettlementResponse>;
}
```

Quem opera uma origem real implementa isso chamando um facilitator de verdade (ex: um membro
da x402 Foundation) que confirma liquidação on-chain. A implementação de referência inclui
`createDemoPaymentVerifier()` — **não faz liquidação real**, apenas aceita qualquer payload
cujo `scheme`/`network` batam com os requirements e cujo `payload.amount` seja numericamente
suficiente. Existe só para provar o fluxo de ponta a ponta na PoC (ver `poc/src/app.ts`,
recurso `/artigos/relatorio-premium`) sem depender de infraestrutura blockchain real.

## 5. Configuração no Gateway

```ts
createHeraldGateway({
  // ...
  monetization: {
    resolveRequirements: ({ agent, resource }) =>
      resource === "/artigos/relatorio-premium"
        ? { scheme: "exact", network: "base-sepolia", maxAmountRequired: "1000", asset: "0xUSDC", payTo: "0x...", resource }
        : null, // null mantem o 402 "puro" — ask continua significando aprovação fora de banda
    verifier: createDemoPaymentVerifier(), // trocar por um verifier real em produção
  },
});
```

Retornar `null`/`undefined` em `resolveRequirements` para um recurso preserva o
comportamento anterior a esta mudança (402 sem headers de pagamento) — a integração x402 é
estritamente aditiva, não muda nada para quem não configura `monetization`.

## 6. O que fica de fora (limitações conhecidas)

- Sem liquidação on-chain própria — depende inteiramente do `PaymentVerifier` fornecido.
- Sem suporte helper para os schemes `upto`/`batch-settlement` do x402 V2 (liquidação
  imediata vs. resgate onchain diferido) — quem implementa `PaymentVerifier` pode suportar
  qualquer scheme, mas não há lógica específica de cada um no SDK.
- Sem retry automático no lado do agente — o Herald Protocol define o fluxo do lado da
  origem; um cliente/agente real precisaria de sua própria lógica para decodificar
  `Payment-Required`, decidir se paga, e reenviar a requisição.
- Sem descoberta de `PaymentRequirements` no documento de descoberta (`/.well-known/herald`)
  — os requirements só aparecem no header `Payment-Required` da resposta 402, não são
  anunciados antecipadamente. Registrado como possível extensão futura, não implementada.

## 7. Referências

- x402 Foundation / x402 V2 — headers `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE`.
- RFC-0001 §8.2 — intent `ask`.
- INTEROP.md — critério geral do projeto para integrar (não reinventar) padrões adjacentes.
