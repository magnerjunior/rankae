import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rankaê · Pelada ao vivo",
    short_name: "Rankaê",
    description: "Placar, times e estatísticas da sua pelada.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8faf8",
    theme_color: "#0b3d2e",
    lang: "pt-BR",
    icons: [{ src: "/rankae-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}

