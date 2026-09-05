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
  title: "Эво — тамагочи, которое пишет свой код 24/7",
  description:
    "Тамагочи из кода: живёт на сервере и круглосуточно сам себя переписывает, даже когда сайт закрыт. Вернись — и увидишь отчёт, как он рос. Настоящий генетический алгоритм. A Tamagotchi-like self-evolving program that lives on the server 24/7.",
  keywords: ["tamagotchi", "self-evolving", "genetic algorithm", "self-modifying code", "тамагочи", "эволюция", "саморазвитие", "эво"],
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
