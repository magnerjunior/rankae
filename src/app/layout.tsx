import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Rankaê · Gestão de peladas",
  description: "Gestão presencial, placar ao vivo e estatísticas para peladas brasileiras.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/rankae-icon.svg", apple: "/rankae-icon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8faf8" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body><PwaRegister />{children}</body>
    </html>
  );
}
