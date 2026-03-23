import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TechStack Scanner",
  description: "Detecte tecnologias de websites e analise websites de hotel com foco em performance, SEO e motor de reservas."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="sticky top-0 z-40 border-b border-ink/10 bg-surface/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
            <Link href="/" className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-ink">
              Omni Scrapping
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <Link
                href="/"
                className="rounded-full px-3 py-2 font-semibold text-ink transition hover:bg-white"
              >
                Scanner Base
              </Link>
              <Link
                href="/hotel"
                className="rounded-full bg-panel px-3 py-2 font-semibold text-white"
              >
                Hotéis
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
