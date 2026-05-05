import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Trip Route Cards",
  description: "Generate executable citywalk route cards for lightweight trips."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
