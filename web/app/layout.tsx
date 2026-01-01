import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const syne = Syne({ subsets: ["latin"], variable: "--font-syne", weight: ["700", "800"] });

export const metadata: Metadata = {
  title: "StackHire — Find Developer Jobs on Telegram",
  description:
    "Describe your ideal role in plain text. StackHire searches job portals live and returns ranked results instantly on Telegram.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${syne.variable}`}>
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
