#!/usr/bin/env node
/**
 * Monta docs/src/ (o srcDir do VitePress, gitignored — sempre regenerado) a partir de
 * duas fontes: conteúdo escrito à mão em docs/authored/ (tracked) e os arquivos que já
 * existem soltos no repositório (raiz + saída do TypeDoc do SDK + openapi.yaml do
 * Gateway) — sem duplicar/manter cópia manual de nenhum deles.
 *
 * Rodar via `npm run sync` (ou automaticamente antes de dev/build).
 */
import { existsSync, rmSync, mkdirSync, cpSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(__dirname, "..");
const repoRoot = join(docsRoot, "..");
const srcDir = join(docsRoot, "src");

function reset() {
  rmSync(srcDir, { recursive: true, force: true });
  mkdirSync(srcDir, { recursive: true });
}

// Os arquivos .md na raiz do repositório se linkam entre si com paths relativos "flat"
// (ex: "./GOVERNANCE.md"), corretos pra navegação no GitHub — mas no site viram páginas
// em subpastas diferentes (spec/, governance/, contributing/). Reescreve esses links
// pro path real no site ao copiar. Only aplica a arquivos copiados via copyRootDoc().
const ROOT_DOC_SITE_PATH = {
  "CONTRIBUTING.md": "/contributing/CONTRIBUTING",
  "CODE_OF_CONDUCT.md": "/contributing/CODE_OF_CONDUCT",
  "rfc-template.md": "/contributing/rfc-template",
  "GOVERNANCE.md": "/governance/GOVERNANCE",
  "BUSINESS.md": "/governance/BUSINESS",
  "RFC-0001.md": "/spec/RFC-0001",
  "RFC-0002-descoberta-chave-publica.md": "/spec/RFC-0002-descoberta-chave-publica",
  "HEADERS.md": "/spec/HEADERS",
  "SIGNATURES.md": "/spec/SIGNATURES",
  "INTEROP.md": "/spec/INTEROP",
  "MONETIZATION.md": "/spec/MONETIZATION",
  "well-known-herald.schema.json": "/well-known-herald.schema.json",
  "herald-agent-keys.schema.json": "/herald-agent-keys.schema.json",
};

function rewriteRootLinks(content) {
  return content.replace(/\]\(\.\/([^)]+)\)/g, (match, filename) => {
    const target = ROOT_DOC_SITE_PATH[filename];
    return target ? `](${target})` : match;
  });
}

function copyRootDoc(fromRel, toRel) {
  const from = join(repoRoot, fromRel);
  const to = join(srcDir, toRel);
  if (!existsSync(from)) {
    console.warn(`[sync-docs] aviso: ${fromRel} nao existe, pulando`);
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, rewriteRootLinks(readFileSync(from, "utf-8")));
}

function copyDir(fromRel, toRel) {
  const from = join(repoRoot, fromRel);
  const to = join(srcDir, toRel);
  if (!existsSync(from)) {
    console.warn(`[sync-docs] aviso: ${fromRel} nao existe (rode 'npm run docs' no pacote sdk primeiro?), pulando`);
    return;
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

reset();

// 1. Conteúdo escrito à mão (homepage, guias) — copiado tal qual.
copyDir("docs/authored", ".");

// 2. Especificação — arquivos normativos já existentes na raiz do repo.
for (const file of ["RFC-0001.md", "RFC-0002-descoberta-chave-publica.md", "HEADERS.md", "SIGNATURES.md", "INTEROP.md", "MONETIZATION.md"]) {
  copyRootDoc(file, `spec/${file}`);
}

// 3. Governança e negócio.
for (const file of ["GOVERNANCE.md", "BUSINESS.md"]) {
  copyRootDoc(file, `governance/${file}`);
}

// 4. Contribuindo.
for (const file of ["CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "rfc-template.md"]) {
  copyRootDoc(file, `contributing/${file}`);
}

// 5. Referência do SDK — saída do TypeDoc (sdk/docs-generated/, gerada por `npm run
//    docs` no pacote sdk). README.md já funciona como índice de diretório no VitePress
//    (mesma convenção do GitHub) — não precisa virar index.md, e os links relativos
//    "../README" que o typedoc-plugin-markdown gera entre as páginas dependem do nome
//    original.
copyDir("sdk/docs-generated", "reference/sdk");

// 6. Assets estáticos servidos como arquivo bruto (public/): openapi.yaml (embed do
//    Scalar na página de referência do Gateway) e os schemas JSON referenciados pelos
//    docs normativos.
mkdirSync(join(srcDir, "public"), { recursive: true });
copyFileSync(join(repoRoot, "gateway/openapi.yaml"), join(srcDir, "public/openapi.yaml"));
for (const schema of ["well-known-herald.schema.json", "herald-agent-keys.schema.json"]) {
  const from = join(repoRoot, schema);
  if (existsSync(from)) copyFileSync(from, join(srcDir, "public", schema));
}

console.log("[sync-docs] docs/src/ sincronizado.");
