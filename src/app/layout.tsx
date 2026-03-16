import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Last Z Command Center",
  description: "Alliance performance tracking dashboard for Last Z: Survival Shooter",
  themeColor: "#09090b",
};

import BugReportModal from "@/components/BugReportModal";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <nav style={{ borderBottom: '1px solid var(--border-subtle)', padding: '1rem 0' }}>
          <div className="container flex-row justify-between">
            <h2 className="text-gradient-primary">LAST Z // COMMAND CENTER</h2>
            <div className="flex-row gap-4 items-center">
              <BugReportModal />
              <button className="cyber-button">Alliance Overview</button>
              <button className="cyber-button">Upload Profile</button>
            </div>
          </div>
        </nav>
        <main className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
