export interface Article {
  slug: string;
  title: string;
  body: string;
  publishedAt: string;
}

export const articles: Article[] = [
  {
    slug: "bem-vindo-ao-herald",
    title: "Bem-vindo ao Herald Protocol",
    body: "O Herald Protocol permite que aplicações web identifiquem agentes de IA, negociem o formato de entrega e apliquem políticas de acesso — sem alterar o conteúdo servido a humanos.",
    publishedAt: "2026-08-01",
  },
  {
    slug: "como-funciona-a-negociacao",
    title: "Como funciona a negociação de capacidades",
    body: "Um agente envia Herald-Accept-Capabilities; a origem escolhe o formato de maior prioridade em comum com o que ela suporta, ou cai para HTML se não houver interseção.",
    publishedAt: "2026-08-02",
  },
  {
    slug: "relatorio-premium",
    title: "Relatório Premium (acesso sob aprovação)",
    body: "Este artigo ilustra uma política por recurso: leitura por qualquer agente exige aprovação (ask), independente do tipo de agente.",
    publishedAt: "2026-08-02",
  },
];

export function findArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
