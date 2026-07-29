import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WisdomLoong · 机器人前沿知识平台",
  description: "分享机器人前沿论文、阅读笔记与研究观点。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
