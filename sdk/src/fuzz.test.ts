import { test } from "node:test";
import assert from "node:assert/strict";
import { identifyAgent } from "./identify.js";
import { parseAcceptCapabilities } from "./negotiate.js";
import { parsePaymentSignatureHeader } from "./monetization.js";
import { parseSignatureInputHeader, parseSignatureHeader } from "./signature.js";

/**
 * Fuzzing dos parsers de header do SDK (ICA-31 / TESTPLAN.md §5). Alvo: qualquer parser
 * que processa valor de header HTTP potencialmente hostil (vem de terceiros, não
 * confiável). Cobre os quatro parsers listados na lacuna original:
 * identifyAgent (Herald-Agent-Id/Herald-Agent-Type/User-Agent), parseAcceptCapabilities
 * (Herald-Accept-Capabilities), parsePaymentSignatureHeader (Payment-Signature),
 * parseSignatureInputHeader/parseSignatureHeader (Signature-Input/Signature).
 *
 * Não roda contra tamanho de header ilimitado: o servidor HTTP (Node --max-http-header-size,
 * default 16 KiB) já rejeita headers maiores antes de chegar em código de aplicação —
 * fuzzar além disso testaria o servidor HTTP, não o parser.
 */

// PRNG determinístico (mulberry32) — fuzzing reprodutível sem depender de Math.random.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHARSETS = {
  ascii: () => String.fromCharCode(32 + Math.floor(rand() * 95)),
  control: () => String.fromCharCode(Math.floor(rand() * 32)),
  unicode: () => String.fromCharCode(Math.floor(rand() * 0xffff)),
  grammar: () => "-/;=\"',.: ()".charAt(Math.floor(rand() * 12)),
} as const;

let rand = mulberry32(42);

function randomString(maxLen: number, charset: () => string): string {
  const len = Math.floor(rand() * maxLen);
  let s = "";
  for (let i = 0; i < len; i++) s += charset();
  return s;
}

// Formas adversariais conhecidas: muitos delimitadores repetidos, sem fechar aspas/parênteses,
// só o separador da gramática do parser — o tipo de entrada mais provável de causar
// backtracking patológico de regex ou loops não terminados.
function adversarialPatterns(maxLen: number): string[] {
  const seps = ["-", "/", ";", "=", '"', "(", ")", ":", ",", "."];
  const patterns: string[] = [];
  for (const sep of seps) {
    patterns.push(sep.repeat(maxLen));
    patterns.push("a".repeat(maxLen / 2) + sep.repeat(maxLen / 2));
  }
  patterns.push('"'.repeat(maxLen)); // aspas desbalanceadas
  patterns.push("(".repeat(maxLen / 2) + ")".repeat(maxLen / 2 - 1)); // parênteses quase balanceados
  return patterns;
}

const HEADER_SIZE_CAP = 16 * 1024; // Node --max-http-header-size default
const ITERATIONS = 3000;
const MAX_CALL_MS = 100; // canário de ReDoS/loop patológico, bem acima do custo esperado (sub-ms)

function fuzzParser(name: string, fn: (input: string) => unknown, maxLen = HEADER_SIZE_CAP) {
  test(`fuzz: ${name} — nao lanca excecao nem trava para entrada aleatoria/adversarial`, () => {
    const inputs: string[] = [
      "",
      ...adversarialPatterns(Math.min(maxLen, 4000)),
    ];
    for (let i = 0; i < ITERATIONS; i++) {
      const charset =
        i % 4 === 0
          ? CHARSETS.ascii
          : i % 4 === 1
            ? CHARSETS.control
            : i % 4 === 2
              ? CHARSETS.unicode
              : CHARSETS.grammar;
      inputs.push(randomString(Math.min(maxLen, 2000), charset));
    }

    for (const input of inputs) {
      const start = process.hrtime.bigint();
      let threw: unknown = null;
      try {
        fn(input);
      } catch (err) {
        threw = err;
      }
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      assert.equal(threw, null, `${name} lancou excecao para entrada de tamanho ${input.length}: ${threw}`);
      assert.ok(
        ms < MAX_CALL_MS,
        `${name} levou ${ms.toFixed(1)}ms (> ${MAX_CALL_MS}ms) para entrada de tamanho ${input.length} — possivel backtracking patologico`
      );
    }
  });
}

fuzzParser("parseAcceptCapabilities", (input) => parseAcceptCapabilities(input));
fuzzParser("parsePaymentSignatureHeader", (input) => parsePaymentSignatureHeader(input));
fuzzParser("parseSignatureInputHeader", (input) => parseSignatureInputHeader(input));
fuzzParser("parseSignatureHeader", (input) => parseSignatureHeader(input));

test("fuzz: identifyAgent — nao lanca excecao nem trava para Herald-Agent-Id/User-Agent hostis", () => {
  const inputs: string[] = ["", ...adversarialPatterns(4000)];
  for (let i = 0; i < ITERATIONS; i++) {
    const charset =
      i % 4 === 0 ? CHARSETS.ascii : i % 4 === 1 ? CHARSETS.control : i % 4 === 2 ? CHARSETS.unicode : CHARSETS.grammar;
    inputs.push(randomString(2000, charset));
  }

  for (const input of inputs) {
    const start = process.hrtime.bigint();
    let threw: unknown = null;
    try {
      identifyAgent({
        headers: { "Herald-Agent-Id": input, "Herald-Agent-Type": input, "User-Agent": input },
      });
    } catch (err) {
      threw = err;
    }
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    assert.equal(threw, null, `identifyAgent lancou excecao para entrada de tamanho ${input.length}: ${threw}`);
    assert.ok(
      ms < MAX_CALL_MS,
      `identifyAgent levou ${ms.toFixed(1)}ms (> ${MAX_CALL_MS}ms) para entrada de tamanho ${input.length} — possivel backtracking patologico`
    );
  }
});
