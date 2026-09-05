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
  title: "Эво — существо, которое пишет свой код",
  description:
    "Нажми одну кнопку — и Эво начнёт сам переписывать свой код, становиться быстрее и расти. Настоящий генетический алгоритм, понятный даже ребёнку. A self-evolving program that writes and improves its own code, live.",
  keywords: ["self-evolving", "genetic algorithm", "self-modifying code", "эволюция", "саморазвитие", "эво"],
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
