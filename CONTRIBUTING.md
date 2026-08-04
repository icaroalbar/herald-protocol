# Contribuindo com o Herald Protocol

Obrigado pelo interesse. Este documento descreve como propor mudanças, tanto na
especificação quanto na implementação de referência.

## Duas coisas diferentes: spec e implementação

O projeto separa deliberadamente:

- **Especificação** (`RFC-0001.md` e os documentos normativos associados —
  `HEADERS.md`, `SIGNATURES.md`) — normativa, define o protocolo em si.
- **Implementação de referência** (`sdk/`, `gateway/`, `dashboard/`, `poc/`) — não
  normativa, uma forma de implementar a spec, não a única possível.

Mudanças na spec têm barra mais alta (afetam qualquer implementador atual ou
futuro) e seguem o processo de RFC abaixo. Mudanças na implementação de
referência (bugs, refatoração, novos testes) podem ir direto via Pull Request.

## Governança atual

O projeto está hoje sob um modelo BDFL (Benevolent Dictator for Life) — decisão
final sobre a spec é do autor (Icaro Albar) enquanto não houver tração externa
real. Isso é deliberado, não permanente: os gatilhos objetivos que disparam
migração para um processo mais formal (RFC com votação, grupo de revisores)
estão documentados em [GOVERNANCE.md](./GOVERNANCE.md). Se você é um adotante
externo e um desses gatilhos já se aplica ao seu caso, abra uma issue dizendo
isso explicitamente.

## Propondo uma mudança na especificação

1. Para clarificações pequenas (erro de digitação, ambiguidade de texto sem
   mudança de comportamento): abra um Pull Request direto editando o arquivo
   normativo relevante.
2. Para mudanças de comportamento, novos campos, novas capacidades ou intents:
   abra uma issue usando o [template de RFC](./rfc-template.md) preenchido.
   Descreva motivação, alternativas consideradas e impacto em compatibilidade
   retroativa (princípio §3 da RFC-0001) antes de qualquer implementação.

Não implemente uma mudança de spec em código antes de a proposta ser discutida
— reduz o custo de mudar de direção.

## Contribuindo com código

1. Fork + branch a partir de `main`.
2. Cada pacote (`sdk/`, `gateway/`, `dashboard/`, `poc/`) é independente: rode
   `npm install`, `npm run build` e `npm test` dentro do pacote que você
   alterou antes de abrir o PR. Testes usam `node:test` + `supertest`, sem
   framework externo.
3. PRs que alteram comportamento observável (headers, formato de resposta,
   políticas) precisam de teste cobrindo o caso novo — ver `TESTPLAN.md` para
   o que já está coberto e as lacunas conhecidas (§5).
4. Mudanças em `sdk/` que afetam a assinatura pública de uma função exigem
   atualizar o `README.md` do pacote correspondente.

## Relatando problemas

Abra uma issue no GitHub descrevendo o comportamento esperado vs observado. Se
for uma vulnerabilidade de segurança, não abra issue pública — envie um e-mail
para icaro.albar@gmail.com.

## Código de conduta

Este projeto segue o [Código de Conduta](./CODE_OF_CONDUCT.md) — participar
implica concordar com ele.
