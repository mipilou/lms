import type { Metadata } from "next";
import "./globals.css";

function normalizeSiteUrl(value: string | undefined) {
  const fallback = "https://cdl-pilotage-formation.espace-de-tr-6659.chatgpt.site";
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString().replace(/\/$/, "") : fallback;
  } catch {
    return fallback;
  }
}

const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Walyah Académie — Pilotage Formation",
  description:
    "La plateforme Walyah Académie pour former, suivre les progrès et piloter les compétences.",
  openGraph: {
    title: "Walyah Académie — Pilotage Formation",
    description: "Apprendre. Suivre. Faire progresser.",
    type: "website",
    url: siteUrl,
    siteName: "Walyah Académie",
    images: [{ url: `${siteUrl}/og.png`, width: 1200, height: 630, alt: "Walyah Académie — Apprendre. Suivre. Faire progresser." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Walyah Académie — Pilotage Formation",
    description: "Apprendre. Suivre. Faire progresser.",
    images: [`${siteUrl}/og.png`],
  },
  icons: {
    icon: "/walyah-mark.png",
    shortcut: "/walyah-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
