import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rankaê · Pelada ao vivo",
    short_name: "Rankaê",
    description: "Placar, times e estatísticas da sua pelada.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8faf8",
    theme_color: "#121b17",
    lang: "pt-BR",
    icons: [
      { src: "/rankae-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/rankae-icon-transparent.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

