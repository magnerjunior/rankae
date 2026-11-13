import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { CookieConsent } from "@/components/cookie-consent";
import { siteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "Rankaê | Organize seu futebol do início ao fim",
  description: "Organize jogadores, monte os times, acompanhe o placar e registre as estatísticas de cada jogo. Tudo pelo celular, com o Rankaê.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/rankae-icon.svg", type: "image/svg+xml" }],
    shortcut: "/rankae-icon.svg",
    apple: "/rankae-icon.svg",
  },
  openGraph: {
    title: "Rankaê | Seu futebol organizado em um só lugar",
    description: "Da chegada dos jogadores ao último apito: times, placar, rodízio e estatísticas direto no celular.",
    type: "website",
    url: "/",
    siteName: "Rankaê",
    locale: "pt_BR",
    images: [{ url: "/rankae-brand-social.png", alt: "Rankaê" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rankaê | Seu futebol organizado em um só lugar",
    description: "Da chegada dos jogadores ao último apito: times, placar, rodízio e estatísticas direto no celular.",
    images: ["/rankae-brand-social.png"],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0739d5" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('rankae:theme')==='dark')document.documentElement.dataset.theme='dark'}catch{}" }} /></head>
      <body><PwaRegister />{children}<CookieConsent /></body>
    </html>
  );
}
