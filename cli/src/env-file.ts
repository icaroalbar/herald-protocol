import { readFile, writeFile } from "node:fs/promises";

/**
 * Cria (ou atualiza) um arquivo `.env`, substituindo o valor de chaves já existentes no
 * lugar e acrescentando as que faltarem no final. Sem parser de .env completo — os
 * valores que este CLI grava (URL, chave base64url) nunca precisam de aspas/escaping.
 */
export async function upsertEnvVars(filePath: string, updates: Record<string, string>): Promise<void> {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const lines = existing.length ? existing.split("\n") : [];
  // Um arquivo terminado em "\n" produz um "" final no split — é só o artefato da quebra
  // de linha final, não uma linha em branco intencional do usuário; remove pra não
  // acumular linhas em branco extras a cada chamada.
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const seen = new Set<string>();

  const updatedLines = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      updatedLines.push(`${key}=${value}`);
    }
  }

  const content = updatedLines.join("\n").replace(/\n*$/, "\n");
  await writeFile(filePath, content, "utf-8");
}
