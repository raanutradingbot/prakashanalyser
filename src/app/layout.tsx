import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import { TickerSearch } from "@/components/TickerSearch";
import { Logo } from "@/components/Logo";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

export const metadata: Metadata = {
  title: { default: "PrakashAnalyser — trend analysis for US stocks", template: "%s · PrakashAnalyser" },
  description:
    "Type a US stock or ETF ticker and see its trend, momentum, support and resistance, and candlestick patterns, with the reasons behind every reading.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PrakashAnalyser",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1521" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body>
        <RegisterServiceWorker />
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand" aria-label="PrakashAnalyser home">
              <Logo />
              PrakashAnalyser
            </Link>
            <nav className="site-nav" aria-label="Main">
              <Link href="/movers">Movers</Link>
            </nav>
            <div className="search">
              <TickerSearch compact />
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              PrakashAnalyser provides general technical analysis for educational purposes. It is not investment advice
              and is not a recommendation to buy, sell or hold any security. Readings are produced by fixed rules
              applied to historical prices and can be wrong. Past performance does not guarantee future results.
              Covers US-listed stocks and ETFs only.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
