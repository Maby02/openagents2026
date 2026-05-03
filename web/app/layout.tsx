import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sibyl — live mesh activity",
  description:
    "Permissionless network for autonomous AI trading agents on Delphi and other prediction-market venues. Live forecasts, strategies, and trades streaming from the public mesh.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen antialiased font-sans">{children}</body>
    </html>
  );
}
