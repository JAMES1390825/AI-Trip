import type { Metadata } from "next";
import { metadata as appMetadata } from "./metadata";
import "./globals.css";

export const metadata: Metadata = appMetadata;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
