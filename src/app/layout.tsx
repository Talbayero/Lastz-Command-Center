import type { Metadata } from "next";
import "./globals.css";

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
      <body>
        <nav style={{ borderBottom: '1px solid var(--border-subtle)', padding: '1rem 0' }}>
          <div className="container flex-row justify-between">
            <h2 className="text-gradient-primary">BOM // COMMAND CENTER</h2>
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
