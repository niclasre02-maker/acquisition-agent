import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { getPreferences } from "@/lib/preferences";
import { BRANCH_SEGMENTS, INTERIM_OPEN_MARKET_SEGMENTS } from "@/lib/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Acquisition Agent Dashboard",
  description:
    "Live-Dashboard für Interim Demand Radar und Open Market Akquise Radar",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const prefs = await getPreferences();
  const visibleSegments =
    prefs.mode === "interim"
      ? INTERIM_OPEN_MARKET_SEGMENTS
      : BRANCH_SEGMENTS.filter((seg) => prefs.branches.includes(seg.slug));

  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-neutral-50 dark:bg-neutral-950">
        <Nav mode={prefs.mode} visibleSegments={visibleSegments} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-7xl px-4 py-4 text-xs text-neutral-400">
          Daten werden alle 60&nbsp;Sekunden aus Google Sheets aktualisiert.
        </footer>
      </body>
    </html>
  );
}
