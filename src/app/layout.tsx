import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "A.I.M (에임) — Academic Improvement Management",
  description: "학업 성취도 향상 관리 | 과제 제출, 자동 채점, 진척도 관리를 한 곳에서",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
  icons: { icon: "/aim-logo.png", apple: "/aim-logo.png" },
  openGraph: {
    title: "A.I.M (에임) — Academic Improvement Management",
    description: "학업 성취도 향상 관리",
    images: [{ url: "/aim-logo.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
