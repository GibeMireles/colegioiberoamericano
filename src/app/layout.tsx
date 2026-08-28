import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getConfiguracion } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfiguracion();

  return {
    title: config.nombre,
    description: "Plataforma de gestión escolar",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const config = await getConfiguracion();

  const themeStyle = {
    "--color-primario": config.colorPrimario,
    "--color-secundario": config.colorSecundario,
  } as CSSProperties;

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={themeStyle}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
