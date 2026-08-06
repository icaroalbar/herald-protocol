import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Interface readline compartilhada, consumida via iterador assíncrono. Duas armadilhas
 * reais descobertas na verificação manual desta feature (não hipotéticas):
 *
 * 1. Criar uma interface NOVA por pergunta quebra com stdin não-interativo (pipe/CI):
 *    uma segunda interface criada depois que o stream já chegou ao fim nunca recebe o
 *    evento 'line'.
 * 2. Mesmo com UMA interface compartilhada, chamar `rl.question()` várias vezes em
 *    sequência trava na segunda chamada quando a entrada inteira já chegou de uma vez
 *    (pipe totalmente bufferizado) — `question()` não drena corretamente múltiplas
 *    linhas já enfileiradas internamente. O iterador assíncrono da própria interface
 *    (`rl[Symbol.asyncIterator]()`) não tem esse problema — drena a fila corretamente,
 *    tanto pra entrada bufferizada de uma vez quanto pra digitação interativa real.
 *
 * Sem máscara de senha — ver rationale no plano da ICA-34: mascarar exigiria depender de
 * API interna não documentada do readline, risco desnecessário pra polish não pedido
 * explicitamente.
 */
let sharedInterface: Interface | null = null;
let lineIterator: AsyncIterator<string> | null = null;

function getIterator(): AsyncIterator<string> {
  if (!sharedInterface) {
    sharedInterface = createInterface({ input: stdin, output: stdout });
    lineIterator = sharedInterface[Symbol.asyncIterator]();
  }
  return lineIterator!;
}

export async function defaultAsk(question: string): Promise<string> {
  const iterator = getIterator();
  stdout.write(question);
  const { value, done } = await iterator.next();
  return done ? "" : value;
}

/** Fecha a interface compartilhada, se alguma foi aberta — chamar uma vez ao final de um
 * fluxo de prompts (ex: fim de runInit()), nunca entre perguntas. */
export function closePrompt(): void {
  sharedInterface?.close();
  sharedInterface = null;
  lineIterator = null;
}
