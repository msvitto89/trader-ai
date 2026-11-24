import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRADIA AI — AI Trading Intelligence",
  description:
    "Understand the market, find potential setups, size risk correctly and improve with AI journaling. Market analysis and educational information — not investment advice.",
  applicationName: "TRADIA AI",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
