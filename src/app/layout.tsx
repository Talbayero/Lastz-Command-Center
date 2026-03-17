import type { Metadata } from "next";
import "./globals.css";
import BugReportModal from "@/components/BugReportModal";
import AccountPanel from "@/components/AccountPanel";
import { getCurrentUser, hasPermission } from "@/utils/auth";

export const metadata: Metadata = {
  title: "BOM Command Center",
  description: "Alliance performance tracking dashboard for BOM",
  themeColor: "#09090b",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentUser = await getCurrentUser();
  const canManageBugs = hasPermission(currentUser, "manageBugs");

  return (
    <html lang="en">
      <body>
        <nav style={{ borderBottom: "1px solid var(--border-subtle)", padding: "1rem 0" }}>
          <div className="container flex-row justify-between">
            <h2 className="text-gradient-primary">BOM // COMMAND CENTER</h2>
            <div className="flex-row gap-4 items-center">
              {currentUser ? (
                <>
                  {canManageBugs && <BugReportModal />}
                  <AccountPanel
                    playerName={currentUser.playerName}
                    roleName={currentUser.roleName}
                    forcePasswordChange={currentUser.mustChangePassword}
                  />
                </>
              ) : (
                <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                  BOM secure access required
                </span>
              )}
            </div>
          </div>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
