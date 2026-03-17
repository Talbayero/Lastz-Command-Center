import Link from "next/link";
export const dynamic = "force-dynamic";
import OcrUploader from "@/components/OcrUploader";
import Leaderboard from "@/components/Leaderboard";
import PlayerRadar from "@/components/PlayerRadar";
import ScoringEngine from "@/components/ScoringEngine";
import Roster from "@/components/Roster";
import BugList from "@/components/BugList";
import AllianceOverview from "@/components/AllianceOverview";
import AllianceDuelPanel from "@/components/AllianceDuelPanel";
import AuthPanel from "@/components/AuthPanel";
import AdminPanel from "@/components/AdminPanel";
import prisma from "@/utils/db";
import { getCurrentUser, hasPermission } from "@/utils/auth";
import { ALLIANCE_DUEL_DAYS, ensureAllianceDuelRequirements } from "@/utils/allianceDuel";
import { normalizePermissions } from "@/utils/permissions";
import { getAllianceAverage, getRosterData, getSelectedPlayer } from "@/utils/dashboardData";

export default async function Home(props: { searchParams: Promise<{ name?: string; view?: string }> }) {
  const searchParams = await props.searchParams;
  const targetName = searchParams.name;
  const requestedView = searchParams.view || "performance";
  const currentUser = await getCurrentUser();

  const allPlayers = await prisma.player.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (!currentUser) {
    return <AuthPanel players={allPlayers.map((player) => player.name)} />;
  }

  const canViewOverview = hasPermission(currentUser, "viewAllianceOverview");
  const canViewAllianceDuel = hasPermission(currentUser, "viewAllianceDuel");
  const canManageAllianceDuel = hasPermission(currentUser, "manageAllianceDuel");
  const canViewDashboard = hasPermission(currentUser, "viewDashboard");
  const canUploadProfile = hasPermission(currentUser, "uploadProfile");
  const canManageBugs = hasPermission(currentUser, "manageBugs");
  const canAccessAdmin = hasPermission(currentUser, "manageUsers") || hasPermission(currentUser, "manageRoles");

  const availableViews = [
    canViewOverview ? "overview" : null,
    canViewAllianceDuel ? "duel" : null,
    canViewDashboard ? "performance" : null,
    canViewDashboard ? "roster" : null,
    canManageBugs ? "bugs" : null,
    canAccessAdmin ? "admin" : null,
  ].filter(Boolean) as string[];

  const currentView = availableViews.includes(requestedView) ? requestedView : availableViews[0] || "performance";

  await ensureAllianceDuelRequirements();

  const [allianceAvg, selectedPlayerData, rosterData, bugData, adminRoles, adminUsers, duelRequirements, duelScores] = await Promise.all([
    getAllianceAverage(),
    getSelectedPlayer(targetName),
    getRosterData(),
    canManageBugs ? prisma.bug.findMany({ orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    canAccessAdmin ? prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] }) : Promise.resolve([]),
    canAccessAdmin
      ? prisma.user.findMany({
          orderBy: { player: { name: "asc" } },
          include: {
            player: true,
            role: true,
            sessions: {
              where: {
                expiresAt: {
                  gt: new Date(),
                },
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
    canViewAllianceDuel
      ? prisma.allianceDuelRequirement.findMany({
          orderBy: { dayKey: "asc" },
        })
      : Promise.resolve([]),
    canViewAllianceDuel
      ? prisma.allianceDuelScore.findMany({
          include: {
            player: {
              select: { id: true, name: true, alliance: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const effectiveName = selectedPlayerData?.name || currentUser.playerName || "Alliance Member";
  const allPlayerNames = allPlayers.map((player) => player.name);

  return (
    <div className="flex-col gap-6" style={{ marginTop: "2rem" }}>
      <header className="flex-row justify-between">
        <div className="flex-row gap-4 items-center">
          <div>
            <h1>Alliance Dashboard</h1>
            <p style={{ color: "var(--text-muted)" }}>Real-time performance metrics and combat analysis.</p>
          </div>
        </div>

        <nav className="flex-row gap-2" style={{ backgroundColor: "var(--bg-input)", padding: "4px", borderRadius: "8px" }}>
          {canViewOverview && (
            <Link href="/?view=overview" className={`cyber-button ${currentView === "overview" ? "primary" : ""}`} style={tabLinkStyle}>
              Overview
            </Link>
          )}
          {canViewAllianceDuel && (
            <Link href="/?view=duel" className={`cyber-button ${currentView === "duel" ? "primary" : ""}`} style={tabLinkStyle}>
              Alliance Duel
            </Link>
          )}
          {canViewDashboard && (
            <Link href="/?view=performance" className={`cyber-button ${currentView === "performance" ? "primary" : ""}`} style={tabLinkStyle}>
              Performance
            </Link>
          )}
          {canViewDashboard && (
            <Link href="/?view=roster" className={`cyber-button ${currentView === "roster" ? "primary" : ""}`} style={tabLinkStyle}>
              Roster
            </Link>
          )}
          {canManageBugs && (
            <Link href="/?view=bugs" className={`cyber-button ${currentView === "bugs" ? "primary" : ""}`} style={tabLinkStyle}>
              Bugs
            </Link>
          )}
          {canAccessAdmin && (
            <Link href="/?view=admin" className={`cyber-button ${currentView === "admin" ? "primary" : ""}`} style={tabLinkStyle}>
              Admin
            </Link>
          )}
        </nav>
      </header>

      <div className="dashboard-grid">
        <section className={currentView === "performance" && canUploadProfile ? "col-span-8" : "col-span-12"}>
          <div className="cyber-card flex-col gap-4">
            <h2 style={{ color: "var(--accent-neon)", fontSize: "1.25rem" }}>
              {currentView === "overview"
                ? "ALLIANCE ANALYTICS"
                : currentView === "duel"
                  ? "ALLIANCE DUEL MAINTENANCE"
                : currentView === "performance"
                  ? "TOP PERFORMERS"
                  : currentView === "roster"
                    ? "ALLIANCE ROSTER"
                    : currentView === "bugs"
                      ? "REPORTED ANOMALIES"
                      : "ADMINISTRATOR CONTROL"}
            </h2>

            {currentView === "overview" ? (
              <AllianceOverview players={rosterData} bugs={bugData} />
            ) : currentView === "duel" ? (
              <AllianceDuelPanel
                initialPlayers={allPlayers.map((player) => {
                  const playerScores = duelScores.filter((entry) => entry.playerId === player.id);
                  return {
                    id: player.id,
                    name: player.name,
                    scores: {
                      daily: Object.fromEntries(
                        ALLIANCE_DUEL_DAYS.map((dayKey) => {
                          const entry = playerScores.find((score) => score.scoreType === "daily" && score.dayKey === dayKey);
                          return [dayKey, entry ? { score: entry.score, rank: entry.rank } : null];
                        })
                      ),
                      weekly: (() => {
                        const entry = playerScores.find((score) => score.scoreType === "weekly" && score.dayKey === "ALL");
                        return entry ? { score: entry.score, rank: entry.rank } : null;
                      })(),
                      overall: (() => {
                        const entry = playerScores.find((score) => score.scoreType === "overall" && score.dayKey === "ALL");
                        return entry ? { score: entry.score, rank: entry.rank } : null;
                      })(),
                    },
                  };
                })}
                initialRequirements={duelRequirements.map((entry) => ({
                  dayKey: entry.dayKey as (typeof ALLIANCE_DUEL_DAYS)[number],
                  eventName: entry.eventName,
                  minimumScore: entry.minimumScore,
                }))}
                canManage={canManageAllianceDuel}
              />
            ) : currentView === "performance" ? (
              <Leaderboard selectedName={selectedPlayerData?.name} />
            ) : currentView === "roster" ? (
              <Roster
                initialPlayers={rosterData}
                canEditRoster={hasPermission(currentUser, "editRoster")}
                canExportRoster={hasPermission(currentUser, "exportRoster")}
                canDeleteRosterMembers={hasPermission(currentUser, "deleteRosterMembers")}
                canEditPlayerNames={hasPermission(currentUser, "editPlayerNames")}
              />
            ) : currentView === "bugs" ? (
              <BugList initialBugs={bugData} />
            ) : (
              <AdminPanel
                currentUserId={currentUser.id}
                initialRoles={adminRoles.map((role) => ({
                  id: role.id,
                  name: role.name,
                  isSystem: role.isSystem,
                  permissions: normalizePermissions(role.permissions),
                }))}
                initialRoster={allPlayers.map((player) => {
                  const account = adminUsers.find((user) => user.playerId === player.id);
                  return {
                    playerId: player.id,
                    playerName: player.name,
                    hasAccount: Boolean(account),
                    userId: account?.id ?? null,
                    roleId: account?.roleId ?? adminRoles.find((role) => role.name === "Alliance Member")?.id ?? null,
                    roleName: account?.role.name ?? null,
                    isActive: account?.isActive ?? true,
                    disabledByUser: account?.disabledByUser ?? false,
                    isOnline: Boolean(account?.sessions.length),
                    lastLoginAt: account?.lastLoginAt ?? null,
                  };
                })}
              />
            )}
          </div>

          {currentView === "performance" && (
            <div className="cyber-card flex-col gap-4" style={{ marginTop: "1.5rem" }}>
              <h3 style={{ color: "var(--accent-purple)" }}>Combat Balance Radar: {effectiveName}</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Comparing individual profile against the alliance average.</p>
              <PlayerRadar playerData={selectedPlayerData} allPlayerNames={allPlayerNames} allianceAverage={allianceAvg} />
            </div>
          )}
        </section>

        {currentView === "performance" && canUploadProfile && (
          <section className="col-span-4 flex-col gap-6">
            <OcrUploader />
            <div className="cyber-card">
              <h3 style={{ color: "var(--accent-purple)", marginBottom: "1.5rem" }}>Scoring Engine</h3>
              <ScoringEngine />
            </div>

            <div className="cyber-card">
              <h3 style={{ color: "var(--accent-neon)", marginBottom: "1rem" }}>System Status</h3>
              <div className="flex-row justify-between mb-2">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>DB CONNECTION</span>
                <span style={{ color: "var(--accent-neon)" }}>ONLINE</span>
              </div>
              <div className="flex-row justify-between">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>OCR ENGINE</span>
                <span style={{ color: "var(--accent-neon)" }}>ACTIVE</span>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const tabLinkStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  fontSize: "0.75rem",
};
