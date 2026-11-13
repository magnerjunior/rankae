import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rankaê · Seu futebol organizado",
    short_name: "Rankaê",
    description: "Placar, times e estatísticas de cada jogo.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef3ff",
    theme_color: "#0739d5",
    lang: "pt-BR",
    icons: [
      { src: "/rankae-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/rankae-icon-transparent.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

