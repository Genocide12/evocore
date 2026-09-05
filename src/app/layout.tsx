import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EvoCore ARENA — гонки саморазвивающихся мутантов",
  description:
    "Азартная арена эволюции: мутанты соревнуются реальной скоростью своего кода, чемпионы перезаписывают геном программы. Ставки на семейства, уровни организма, живые гонки. A genetic algorithm arena where code races and rewrites itself.",
  keywords: ["evolution", "genetic algorithm", "self-modifying code", "arena", "эволюция", "арена", "саморазвитие"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
