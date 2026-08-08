import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Herald Protocol",
  description: "Protocolo aberto pra apps web identificarem agentes de IA, negociarem formato, aplicarem política de acesso e gerarem observabilidade.",
  srcDir: "src",
  appearance: "force-dark",
  cleanUrls: true,
  ignoreDeadLinks: false,

  themeConfig: {
    nav: [
      { text: "Começar", link: "/guides/getting-started" },
      { text: "Especificação", link: "/spec/RFC-0001" },
      { text: "Referência SDK", link: "/reference/sdk/README" },
      { text: "Referência Gateway", link: "/reference/gateway-api" },
      { text: "GitHub", link: "https://github.com/icaroalbar/herald-protocol" },
    ],

    sidebar: [
      {
        text: "Guias",
        items: [{ text: "Começando", link: "/guides/getting-started" }],
      },
      {
        text: "Especificação",
        items: [
          { text: "RFC-0001 — Herald Protocol", link: "/spec/RFC-0001" },
          { text: "RFC-0002 — Descoberta de chave pública (Draft)", link: "/spec/RFC-0002-descoberta-chave-publica" },
          { text: "Headers", link: "/spec/HEADERS" },
          { text: "Assinaturas (identidade)", link: "/spec/SIGNATURES" },
          { text: "Interoperabilidade", link: "/spec/INTEROP" },
          { text: "Monetização (x402)", link: "/spec/MONETIZATION" },
        ],
      },
      {
        text: "Referência",
        items: [
          { text: "SDK (@heraldserver/sdk)", link: "/reference/sdk/README" },
          { text: "API do Gateway", link: "/reference/gateway-api" },
        ],
      },
      {
        text: "Governança e negócio",
        items: [
          { text: "Governança", link: "/governance/GOVERNANCE" },
          { text: "Modelo de negócio", link: "/governance/BUSINESS" },
        ],
      },
      {
        text: "Contribuindo",
        items: [
          { text: "Guia de contribuição", link: "/contributing/CONTRIBUTING" },
          { text: "Código de conduta", link: "/contributing/CODE_OF_CONDUCT" },
          { text: "Template de RFC", link: "/contributing/rfc-template" },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/icaroalbar/herald-protocol" }],

    search: { provider: "local" },
  },
});
