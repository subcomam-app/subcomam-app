import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
const geist = Geist({ subsets: ["latin"], display: "swap" });
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};
export const metadata: Metadata = {
  title: "SUBCOMAM · Control migratorio",
  description:
    "Plataforma de registro de personas y controles de la Subcomisaría de Asuntos Migratorios.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
