import Link from "next/link";
import OcrUploader from "@/components/OcrUploader";
import Leaderboard from "@/components/Leaderboard";
import PlayerRadar from "@/components/PlayerRadar";
import ScoringEngine from "@/components/ScoringEngine";
import Roster from "@/components/Roster";
import BugList from "@/components/BugList";
import AllianceOverview from "@/components/AllianceOverview";
import AllianceDuelPanel from "@/components/AllianceDuelPanel";
import RecruitmentPanel from "@/components/RecruitmentPanel";
import AuthPanel from "@/components/AuthPanel";
import AdminPanel from "@/components/AdminPanel";
import ProfilePanel from "@/components/ProfilePanel";
import prisma from "@/utils/db";
import { getCurrentUser, hasPermission } from "@/utils/auth";
import { ALLIANCE_DUEL_DAYS, ensureAllianceDuelRequirements, getAllianceDuelDayLabel } from "@/utils/allianceDuel";
import { normalizePermissions } from "@/utils/permissions";
import { getAllianceAverage, getRosterData, getSelectedPlayer } from "@/utils/dashboardData";
import { getDefaultWeights, normalizeWeights } from "@/utils/recruitmentScoring";

type RecruitmentApplicantRow = Awaited<ReturnType<typeof prisma.allianceApplicant.findMany>>[number];
type RecruitmentMigrationRow = Awaited<ReturnType<typeof prisma.migrationCandidate.findMany>>[number];
type ProfileViewData = {
  id: string;
  name: string;
  totalPower: number;
  kills: number;
  latestScore: number;
  gloryWarStatus: string;
  march1Power: number;
  march2Power: number;
  march3Power: number;
  march4Power: number;
  combatPower: number;
  updatedAt: string;
  structurePower: number;
  techPower: number;
  troopPower: number;
  heroPower: number;
  modVehiclePower: number;
  rank: number;
  todayDuelScore: number | null;
  todayDuelRank: number | null;
  duelRequirement: number;
  duelRequirementName: string;
  duelCompliance: "Met" | "Below Requirement" | "Missing Data";
  leaderNotes: string;
  snapshots: Array<{
    id: string;
    createdAt: string;
    totalPower: number;
    kills: number;
    score: number;
  }>;
};

export default async function Home(props: { searchParams: Promise<{ name?: string; view?: string }> }) {
  const searchParams = await props.searchParams;
  const targetName = searchParams.name;
  const requestedView = searchParams.view || "performance";
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    const authPlayers = await prisma.player.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
    });

    return <AuthPanel players={authPlayers.map((player) => player.name)} />;
  }

  const canViewOverview = hasPermission(currentUser, "viewAllianceOverview");
  const canViewRecruitment = hasPermission(currentUser, "viewRecruitment");
  const canManageRecruitment = hasPermission(currentUser, "manageRecruitment");
  const canViewAllianceDuel = hasPermission(currentUser, "viewAllianceDuel");
  const canManageAllianceDuel = hasPermission(currentUser, "manageAllianceDuel");
  const canViewDashboard = hasPermission(currentUser, "viewDashboard");
  const canUploadProfile = hasPermission(currentUser, "uploadProfile");
  const canManageBugs = hasPermission(currentUser, "manageBugs");
  const canAccessAdmin = hasPermission(currentUser, "manageUsers") || hasPermission(currentUser, "manageRoles");
  const canBrowseProfiles = canAccessAdmin || hasPermission(currentUser, "editRoster");
  const canUploadForOthers = canAccessAdmin || hasPermission(currentUser, "editRoster") || hasPermission(currentUser, "editPlayerNames");

  const availableViews = [
    "profile",
    canViewOverview ? "overview" : null,
    canViewRecruitment ? "recruitment" : null,
    canViewAllianceDuel ? "duel" : null,
    canViewDashboard ? "performance" : null,
    canViewDashboard ? "roster" : null,
    canManageBugs ? "bugs" : null,
    canAccessAdmin ? "admin" : null,
  ].filter(Boolean) as string[];

  const currentView = availableViews.includes(requestedView) ? requestedView : availableViews[0] || "performance";
  const shouldLoadDuelData = currentView === "duel" && canViewAllianceDuel;
  const shouldLoadRecruitmentData = currentView === "recruitment" && canViewRecruitment;
  const profileTargetName = currentView === "profile" ? targetName || currentUser.playerName : undefined;

  const needsAllPlayers =
    currentView === "performance" ||
    currentView === "duel" ||
    currentView === "admin" ||
    (currentView === "profile" && canBrowseProfiles);
  const needsAllianceAverage =
    currentView === "profile" ||
    currentView === "performance";
  const needsSelectedPlayer = currentView === "performance";
  const needsRosterData =
    currentView === "overview" ||
    currentView === "roster" ||
    currentView === "profile";
  const needsBugData =
    (currentView === "bugs" && canManageBugs) ||
    (currentView === "overview" && canManageBugs);

  const [allPlayers, allianceAvg, selectedPlayerData, rosterData, bugData, adminRoles, adminUsers] = await Promise.all([
    needsAllPlayers
      ? prisma.player.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    needsAllianceAverage
      ? getAllianceAverage()
      : Promise.resolve({
          techPower: 0,
          heroPower: 0,
          troopPower: 0,
          modVehiclePower: 0,
          structurePower: 0,
        }),
    needsSelectedPlayer ? getSelectedPlayer(targetName) : Promise.resolve(null),
    needsRosterData ? getRosterData() : Promise.resolve([]),
    needsBugData
      ? prisma.bug.findMany({
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    canAccessAdmin
      ? prisma.role.findMany({
          orderBy: [{ isSystem: "desc" }, { name: "asc" }],
          select: { id: true, name: true, isSystem: true, permissions: true },
        })
      : Promise.resolve([]),
    canAccessAdmin
      ? prisma.user.findMany({
          orderBy: { player: { name: "asc" } },
          select: {
            id: true,
            playerId: true,
            roleId: true,
            isActive: true,
            disabledByUser: true,
            lastLoginAt: true,
            player: {
              select: { id: true, name: true },
            },
            role: {
              select: { name: true },
            },
            sessions: {
              where: {
                expiresAt: {
                  gt: new Date(),
                },
              },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, createdAt: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  let duelRequirements: Array<{ dayKey: string; eventName: string; minimumScore: number }> = [];
  let duelScores: Array<{
    playerId: string;
    scoreType: string;
    dayKey: string;
    score: number;
    rank: number | null;
  }> = [];
  let duelLoadError: string | null = null;
  let recruitmentLoadError: string | null = null;
  let profileData: ProfileViewData | null = null;
  let recruitmentApplicants: RecruitmentApplicantRow[] = [];
  let recruitmentMigrations: RecruitmentMigrationRow[] = [];
  let recruitmentApplicantWeights = getDefaultWeights("applicants");
  let recruitmentMigrationWeights = getDefaultWeights("migrations");

  if (shouldLoadDuelData) {
    try {
      await ensureAllianceDuelRequirements();
      [duelRequirements, duelScores] = await Promise.all([
        prisma.allianceDuelRequirement.findMany({
          orderBy: { dayKey: "asc" },
        }),
        prisma.allianceDuelScore.findMany({
          select: {
            playerId: true,
            scoreType: true,
            dayKey: true,
            score: true,
            rank: true,
          },
        }),
      ]);
    } catch (error: unknown) {
      console.error("ALLIANCE DUEL PAGE LOAD ERROR:", error);
      duelLoadError = "Alliance Duel data is temporarily unavailable. Refresh in a moment and try again.";
    }
  }

  if (shouldLoadRecruitmentData) {
    try {
      const existingScopes = await prisma.recruitmentScoringConfig.findMany({
        select: { scope: true },
      });
      const existingScopeSet = new Set(existingScopes.map((entry) => entry.scope));
      const missingScopes = (["applicants", "migrations"] as const).filter((scope) => !existingScopeSet.has(scope));

      if (missingScopes.length > 0) {
        await prisma.recruitmentScoringConfig.createMany({
          data: missingScopes.map((scope) => ({
            scope,
            weights: getDefaultWeights(scope),
          })),
          skipDuplicates: true,
        });
      }

      const [applicantConfig, migrationConfig, applicants, migrations] = await Promise.all([
        prisma.recruitmentScoringConfig.findUnique({ where: { scope: "applicants" } }),
        prisma.recruitmentScoringConfig.findUnique({ where: { scope: "migrations" } }),
        prisma.allianceApplicant.findMany({ orderBy: { updatedAt: "desc" } }),
        prisma.migrationCandidate.findMany({ orderBy: { updatedAt: "desc" } }),
      ]);
      recruitmentApplicantWeights = normalizeWeights(applicantConfig?.weights, getDefaultWeights("applicants"));
      recruitmentMigrationWeights = normalizeWeights(migrationConfig?.weights, getDefaultWeights("migrations"));
      recruitmentApplicants = applicants;
      recruitmentMigrations = migrations;
    } catch (error: unknown) {
      console.error("RECRUITMENT PAGE LOAD ERROR:", error);
      recruitmentLoadError = "Recruitment data is temporarily unavailable. Refresh in a moment and try again.";
    }
  }

  if (currentView === "profile") {
    await ensureAllianceDuelRequirements();
    const resolvedTargetName = canBrowseProfiles ? profileTargetName : currentUser.playerName;
    const profilePlayer =
      (resolvedTargetName
        ? await prisma.player.findFirst({
            where: { name: { equals: resolvedTargetName, mode: "insensitive" } },
            select: {
              id: true,
              name: true,
              totalPower: true,
              kills: true,
              latestScore: true,
              gloryWarStatus: true,
              march1Power: true,
              march2Power: true,
              march3Power: true,
              march4Power: true,
              updatedAt: true,
              leaderNotes: true,
              snapshots: {
                orderBy: { createdAt: "desc" },
                take: 3,
                select: {
                  id: true,
                  createdAt: true,
                  totalPower: true,
                  kills: true,
                  score: true,
                  structurePower: true,
                  techPower: true,
                  troopPower: true,
                  heroPower: true,
                  modVehiclePower: true,
                },
              },
            },
          })
        : null) ??
      (await prisma.player.findUnique({
        where: { id: currentUser.playerId },
        select: {
          id: true,
          name: true,
          totalPower: true,
          kills: true,
          latestScore: true,
          gloryWarStatus: true,
          march1Power: true,
          march2Power: true,
          march3Power: true,
          march4Power: true,
          updatedAt: true,
          leaderNotes: true,
          snapshots: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              createdAt: true,
              totalPower: true,
              kills: true,
              score: true,
              structurePower: true,
              techPower: true,
              troopPower: true,
              heroPower: true,
              modVehiclePower: true,
            },
          },
        },
      }));

    if (profilePlayer) {
      const currentDayIndex = new Date().getDay();
      const currentDayKey = ALLIANCE_DUEL_DAYS[Math.max(0, Math.min(ALLIANCE_DUEL_DAYS.length - 1, currentDayIndex - 1))];
      const [dailyRequirement, dailyScore] = await Promise.all([
        prisma.allianceDuelRequirement.findUnique({ where: { dayKey: currentDayKey } }),
        prisma.allianceDuelScore.findUnique({
          where: {
            playerId_scoreType_dayKey: {
              playerId: profilePlayer.id,
              scoreType: "daily",
              dayKey: currentDayKey,
            },
          },
        }),
      ]);

      const sortedByScore = [...rosterData].sort((a, b) => b.latestScore - a.latestScore);
      const rank = sortedByScore.findIndex((player) => player.id === profilePlayer.id) + 1;
      const latestSnapshot = profilePlayer.snapshots[0];
      const combatPower =
        profilePlayer.march1Power +
        profilePlayer.march2Power +
        profilePlayer.march3Power +
        profilePlayer.march4Power;
      const duelRequirement = dailyRequirement?.minimumScore ?? 0;
      const duelScore = dailyScore?.score ?? null;
      const duelCompliance =
        duelScore === null ? "Missing Data" : duelScore >= duelRequirement ? "Met" : "Below Requirement";

      profileData = {
        id: profilePlayer.id,
        name: profilePlayer.name,
        totalPower: profilePlayer.totalPower,
        kills: profilePlayer.kills,
        latestScore: profilePlayer.latestScore,
        gloryWarStatus: profilePlayer.gloryWarStatus,
        march1Power: profilePlayer.march1Power,
        march2Power: profilePlayer.march2Power,
        march3Power: profilePlayer.march3Power,
        march4Power: profilePlayer.march4Power,
        combatPower,
        updatedAt: profilePlayer.updatedAt.toISOString(),
        structurePower: latestSnapshot?.structurePower ?? 0,
        techPower: latestSnapshot?.techPower ?? 0,
        troopPower: latestSnapshot?.troopPower ?? 0,
        heroPower: latestSnapshot?.heroPower ?? 0,
        modVehiclePower: latestSnapshot?.modVehiclePower ?? 0,
        rank: rank > 0 ? rank : 1,
        todayDuelScore: duelScore,
        todayDuelRank: dailyScore?.rank ?? null,
        duelRequirement,
        duelRequirementName: dailyRequirement?.eventName ?? getAllianceDuelDayLabel(currentDayKey),
        duelCompliance,
        leaderNotes: profilePlayer.leaderNotes,
        snapshots: profilePlayer.snapshots.map((snapshot) => ({
          id: snapshot.id,
          createdAt: snapshot.createdAt.toISOString(),
          totalPower: snapshot.totalPower,
          kills: snapshot.kills,
          score: snapshot.score,
        })),
      };
    }
  }

  const effectiveName = selectedPlayerData?.name || currentUser.playerName || "Alliance Member";
  const allPlayerNames = allPlayers.map((player) => player.name);

  return (
    <div className="page-shell flex-col gap-6">
      <header className="page-header">
        <div className="page-header-copy flex-row gap-4 items-center">
          <div>
            <h1>Alliance Dashboard</h1>
            <p style={{ color: "var(--text-muted)" }}>Real-time performance metrics and combat analysis.</p>
          </div>
        </div>

        <nav className="page-nav">
          <Link href="/?view=profile" className={`cyber-button ${currentView === "profile" ? "primary" : ""}`} style={tabLinkStyle}>
            Profile
          </Link>
          {canViewOverview && (
            <Link href="/?view=overview" className={`cyber-button ${currentView === "overview" ? "primary" : ""}`} style={tabLinkStyle}>
              Overview
            </Link>
          )}
          {canViewRecruitment && (
            <Link href="/?view=recruitment" className={`cyber-button ${currentView === "recruitment" ? "primary" : ""}`} style={tabLinkStyle}>
              Recruitment
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
              {currentView === "profile"
                ? "PLAYER PROFILE"
                : currentView === "overview"
                  ? "ALLIANCE ANALYTICS"
                : currentView === "recruitment"
                  ? "RECRUITMENT COMMAND"
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

            {currentView === "profile" ? (
              profileData ? (
                <ProfilePanel
                  profile={profileData}
                  allianceAverage={allianceAvg}
                  availablePlayers={allPlayerNames}
                  canEditProfile={currentUser.playerId === profileData.id || canBrowseProfiles}
                  canManageNotes={canBrowseProfiles}
                  canBrowsePlayers={canBrowseProfiles}
                />
              ) : (
                <div style={{ color: "var(--accent-red)", fontFamily: "var(--font-mono)" }}>
                  Profile not found.
                </div>
              )
            ) : currentView === "overview" ? (
              <AllianceOverview players={rosterData} bugs={bugData} />
            ) : currentView === "recruitment" ? (
              recruitmentLoadError ? (
                <div
                  style={{
                    padding: "1rem 1.1rem",
                    borderRadius: "6px",
                    border: "1px solid var(--accent-red)",
                    backgroundColor: "rgba(255,51,102,0.08)",
                    color: "var(--accent-red)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.9rem",
                  }}
                >
                  {recruitmentLoadError}
                </div>
              ) : (
                <RecruitmentPanel
                  initialApplicants={recruitmentApplicants.map((entry) => ({
                    ...entry,
                    createdAt: entry.createdAt.toISOString(),
                    updatedAt: entry.updatedAt.toISOString(),
                  }))}
                  initialMigrations={recruitmentMigrations.map((entry) => ({
                    ...entry,
                    createdAt: entry.createdAt.toISOString(),
                    updatedAt: entry.updatedAt.toISOString(),
                  }))}
                  initialApplicantWeights={recruitmentApplicantWeights}
                  initialMigrationWeights={recruitmentMigrationWeights}
                  canManage={canManageRecruitment}
                />
              )
            ) : currentView === "duel" ? (
              duelLoadError ? (
                <div
                  style={{
                    padding: "1rem 1.1rem",
                    borderRadius: "6px",
                    border: "1px solid var(--accent-red)",
                    backgroundColor: "rgba(255,51,102,0.08)",
                    color: "var(--accent-red)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.9rem",
                  }}
                >
                  {duelLoadError}
                </div>
              ) : (
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
              )
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
                    isOnline:
                      Boolean(account?.sessions.length) &&
                      Boolean(account?.lastLoginAt && account.lastLoginAt > new Date(Date.now() - 15 * 60 * 1000)),
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
              <PlayerRadar
                key={selectedPlayerData?.name ?? "empty-player-radar"}
                playerData={selectedPlayerData}
                allPlayerNames={allPlayerNames}
                allianceAverage={allianceAvg}
              />
            </div>
          )}
        </section>

        {currentView === "performance" && canUploadProfile && (
          <section className="col-span-4 flex-col gap-6">
            <OcrUploader initialName={currentUser.playerName} lockName={!canUploadForOthers} />
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
