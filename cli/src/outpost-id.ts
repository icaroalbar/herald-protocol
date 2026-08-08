import type { PgOutpostStore, OutpostRecordPublic } from "@heraldserver/server";

/** Prefix matching tipo `docker` — usuário digita só os primeiros hex chars do id (12 no
 * total), não precisa colar o id inteiro. Tenta match exato primeiro (caminho comum:
 * id completo colado de um `outpost ls`/`create` anterior), só cai pra busca por prefixo
 * se isso falhar — evita um round-trip extra no caso comum. */
export async function resolveOutpost(outposts: PgOutpostStore, idPrefix: string): Promise<OutpostRecordPublic> {
  const exact = await outposts.get(idPrefix);
  if (exact) return exact;

  const matches = await outposts.findByIdPrefix(idPrefix);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`Outpost ${idPrefix} não encontrado`);
  }
  throw new Error(
    `Prefixo "${idPrefix}" é ambíguo — corresponde a ${matches.length} Outposts: ` +
      matches.map((o) => o.id).join(", ")
  );
}
