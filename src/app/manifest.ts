import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rankaê · Seu futebol organizado",
    short_name: "Rankaê",
    description: "Placar, times e estatísticas de cada jogo.",
    start_url: "/",
    display: "standalone",
    background_color: "#0739d5",
    theme_color: "#0739d5",
    lang: "pt-BR",
    icons: [
      { src: "/rankae-pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/rankae-pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/rankae-pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

