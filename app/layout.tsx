import type { Metadata } from "next";
import { Lora, Public_Sans } from "next/font/google";
import "./globals.css";
import { PLATFORM } from "@/lib/brand";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: PLATFORM.name, template: `%s | ${PLATFORM.name}` },
  description: "Online consultation booking for Philippine law firms.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${lora.variable} ${publicSans.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col font-sans"
        style={{ background: "oklch(0.985 0.004 90)", color: "oklch(0.32 0.01 258)" }}
      >
        {children}
      </body>
    </html>
  );
}
