import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TechStack Scanner",
  description: "Detecte tecnologias de websites com evidências e score de confiança."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
