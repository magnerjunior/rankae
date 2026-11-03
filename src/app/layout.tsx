import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const metadataBase = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: "Rankaê · Gestão de peladas",
  description: "Gestão presencial, placar ao vivo e estatísticas para peladas brasileiras.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/rankae-icon.svg", type: "image/svg+xml" }],
    shortcut: "/rankae-icon.svg",
    apple: "/rankae-icon.svg",
  },
  openGraph: {
    title: "Rankaê · Gestão de peladas",
    description: "Gestão presencial, placar ao vivo e estatísticas para peladas brasileiras.",
    type: "website",
    locale: "pt_BR",
    images: [{ url: "/rankae-brand-social.png", alt: "Rankaê" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rankaê · Gestão de peladas",
    description: "Gestão presencial, placar ao vivo e estatísticas para peladas brasileiras.",
    images: ["/rankae-brand-social.png"],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8faf8" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body><PwaRegister />{children}</body>
    </html>
  );
}
