import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Implementação padrão de `ask` — sem mascarar a entrada (mascarar exigiria depender de
 * API interna não documentada do readline, risco desnecessário pra polish que não foi
 * pedido explicitamente; trocar por uma lib de prompt de verdade é a via se isso vier a
 * ser necessário depois).
 */
export async function defaultAsk(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
