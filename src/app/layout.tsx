import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";

const displayFont = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Enfinity Vision Demo",
  description: "Interactive Hugging Face image segmentation demo with premium dark aesthetics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">{children}</body>
    </html>
  );
}
