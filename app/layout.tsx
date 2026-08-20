import type { Metadata } from "next";
import "./globals.css";

function normalizeSiteUrl(value?: string) {
  const candidate = value?.trim();
  if (!candidate) return "http://localhost:3000";

  const urlWithProtocol = /^https?:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;

  try {
    return new URL(urlWithProtocol).origin;
  } catch {
    return "http://localhost:3000";
  }
}

const siteUrl = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL ?? process.env.URL,
);

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
