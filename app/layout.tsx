import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://visuala.io";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Visuala — The Design Intelligence Platform",
    template: "%s | Visuala",
  },
  description:
    "Visuala empowers design teams to ship stunning interfaces faster. AI-powered design system, real-time collaboration, and pixel-perfect exports.",
  keywords: [
    "design platform",
    "design system",
    "UI design",
    "design tools",
    "collaboration",
  ],
  authors: [{ name: "Visuala Team" }],
  creator: "Visuala",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Visuala",
    title: "Visuala — The Design Intelligence Platform",
    description:
      "Visuala empowers design teams to ship stunning interfaces faster.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Visuala — The Design Intelligence Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Visuala — The Design Intelligence Platform",
    description:
      "Visuala empowers design teams to ship stunning interfaces faster.",
    images: ["/og-image.png"],
    creator: "@visuala_io",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0f1a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh bg-surface-0 text-text-primary antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
