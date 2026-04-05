import Link from "next/link";
import dynamic from "next/dynamic";
import Leaderboard from "@/components/Leaderboard";
import AllianceOverview from "@/components/AllianceOverview";
import { getCurrentUser, hasPermission } from "@/utils/auth";
import { ALLIANCE_DUEL_DAYS, ensureAllianceDuelRequirements, getAllianceDuelDayLabel } from "@/utils/allianceDuel";
import { normalizePermissions } from "@/utils/permissions";
import { getAllianceAverage, getRosterData, getSelectedPlayer } from "@/utils/dashboardData";
import {
  defaultRecommendationThresholds,
  getDefaultWeights,
  normalizeThresholds,
  normalizeWeights,
} from "@/utils/recruitmentScoring";
import {
  getAdminRolesCached,
  getAdminUsersCached,
  getAllPlayersCached,
  getBugDataCached,
  getDuelRequirementsCached,
  getDuelScoresCached,
  getPlayerNamesCached,
  getProfileDailyDuelDataCached,
  getProfilePlayerCached,
  getRecruitmentApplicantsCached,
  getRecruitmentConfigsCached,
  getRecruitmentMigrationsCached,
} from "@/utils/cachedQueries";

const AuthPanel = dynamic(() => import("@/components/AuthPanel"));
const OcrUploader = dynamic(() => import("@/components/OcrUploader"));
const PlayerRadar = dynamic(() => import("@/components/PlayerRadar"));
const ScoringEngine = dynamic(() => import("@/components/ScoringEngine"));
const Roster = dynamic(() => import("@/components/Roster"));
const BugList = dynamic(() => import("@/components/BugList"));
const AllianceDuelPanel = dynamic(() => import("@/components/AllianceDuelPanel"));
const RecruitmentPanel = dynamic(() => import("@/components/RecruitmentPanel"));
const AdminPanel = dynamic(() => import("@/components/AdminPanel"));
const ProfilePanel = dynamic(() => import("@/components/ProfilePanel"));

type RecruitmentApplicantRow = Awaited<ReturnType<typeof getRecruitmentApplicantsCached>>[number];
type RecruitmentMigrationRow = Awaited<ReturnType<typeof getRecruitmentMigrationsCached>>[number];
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

function toIsoString(value: string | Date | null | undefined) {
  if (!value) {
    return new Date(0).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function toDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default async function Home(props: { searchParams: Promise<{ name?: string; view?: string }> }) {
  const shouldLogPerf = process.env.ENABLE_PERF_LOGS === "true";
  // eslint-disable-next-line react-hooks/purity
  const pageStart = Date.now();
  const perfMarks: string[] = [];
  const timed = async <T,>(label: string, task: () => Promise<T>) => {
    // eslint-disable-next-line react-hooks/purity
    const start = Date.now();
    const result = await task();
    if (shouldLogPerf) {
      // eslint-disable-next-line react-hooks/purity
      perfMarks.push(`${label}:${Date.now() - start}ms`);
    }
    return result;
  };

  const searchParams = await props.searchParams;
  const targetName = searchParams.name;
  const requestedView = searchParams.view || "performance";
  const currentUser = await timed("getCurrentUser", () => getCurrentUser());

  if (!currentUser) {
    const authPlayers = await timed("authPlayers", () => getPlayerNamesCached());

    if (shouldLogPerf) {
      // eslint-disable-next-line react-hooks/purity
      console.info(`[PERF] view=auth total=${Date.now() - pageStart}ms ${perfMarks.join(" | ")}`);
    }

    return <AuthPanel players={authPlayers} />;
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
      ? timed("allPlayers", () => getAllPlayersCached())
      : Promise.resolve([]),
    needsAllianceAverage
      ? timed("allianceAverage", () => getAllianceAverage())
      : Promise.resolve({
          techPower: 0,
          heroPower: 0,
          troopPower: 0,
          modVehiclePower: 0,
          structurePower: 0,
        }),
    needsSelectedPlayer ? timed("selectedPlayer", () => getSelectedPlayer(targetName)) : Promise.resolve(null),
    needsRosterData ? timed("rosterData", () => getRosterData()) : Promise.resolve([]),
    needsBugData
      ? timed("bugData", () => getBugDataCached())
      : Promise.resolve([]),
    canAccessAdmin
      ? timed("adminRoles", () => getAdminRolesCached())
      : Promise.resolve([]),
    canAccessAdmin
      ? timed("adminUsers", () => getAdminUsersCached())
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
  let recruitmentApplicantThresholds = defaultRecommendationThresholds;
  let recruitmentMigrationThresholds = defaultRecommendationThresholds;

  if (shouldLoadDuelData) {
    try {
      await ensureAllianceDuelRequirements();
      [duelRequirements, duelScores] = await Promise.all([
        timed("duelRequirements", () => getDuelRequirementsCached()),
        timed("duelScores", () => getDuelScoresCached()),
      ]);
    } catch (error: unknown) {
      console.error("ALLIANCE DUEL PAGE LOAD ERROR:", error);
      duelLoadError = "Alliance Duel data is temporarily unavailable. Refresh in a moment and try again.";
    }
  }

  if (shouldLoadRecruitmentData) {
    try {
        const [
          {
            applicants: applicantWeights,
            migrations: migrationWeights,
            applicantThresholds,
            migrationThresholds,
          },
          applicants,
          migrations,
        ] = await Promise.all([
          timed("recruitmentConfig", () => getRecruitmentConfigsCached()),
          timed("recruitmentApplicants", () => getRecruitmentApplicantsCached()),
          timed("recruitmentMigrations", () => getRecruitmentMigrationsCached()),
        ]);
        recruitmentApplicantWeights = normalizeWeights(applicantWeights, getDefaultWeights("applicants"));
        recruitmentMigrationWeights = normalizeWeights(migrationWeights, getDefaultWeights("migrations"));
        recruitmentApplicantThresholds = normalizeThresholds(applicantThresholds, defaultRecommendationThresholds);
        recruitmentMigrationThresholds = normalizeThresholds(migrationThresholds, defaultRecommendationThresholds);
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
    const profilePlayer = await timed("profilePlayer", () =>
      getProfilePlayerCached(resolvedTargetName, currentUser.playerId)
    );

    if (profilePlayer) {
      const { currentDayKey, dailyRequirement, dailyScore } = await timed("profileDailyDuel", () =>
        getProfileDailyDuelDataCached(profilePlayer.id)
      );

      const sortedByScore = [...rosterData].sort((a, b) => b.latestScore - a.latestScore);
      const rank = sortedByScore.findIndex((player) => player.id === profilePlayer.id) + 1;
      const latestSnapshot = profilePlayer.snapshots[0];
      const combatPower =
        profilePlayer.march1Power +
        profilePlayer.march2Power +
        profilePlayer.march3Power +
        profilePlayer.march4Power;
      const duelRequirement = dailyRequirement.minimumScore ?? 0;
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
        updatedAt: toIsoString(profilePlayer.updatedAt),
        structurePower: latestSnapshot?.structurePower ?? 0,
        techPower: latestSnapshot?.techPower ?? 0,
        troopPower: latestSnapshot?.troopPower ?? 0,
        heroPower: latestSnapshot?.heroPower ?? 0,
        modVehiclePower: latestSnapshot?.modVehiclePower ?? 0,
        rank: rank > 0 ? rank : 1,
        todayDuelScore: duelScore,
        todayDuelRank: dailyScore?.rank ?? null,
        duelRequirement,
        duelRequirementName: dailyRequirement.eventName ?? getAllianceDuelDayLabel(currentDayKey),
        duelCompliance,
        leaderNotes: profilePlayer.leaderNotes,
        snapshots: profilePlayer.snapshots.map((snapshot) => ({
          id: snapshot.id,
          createdAt: toIsoString(snapshot.createdAt),
          totalPower: snapshot.totalPower,
          kills: snapshot.kills,
          score: snapshot.score,
        })),
      };
    }
  }

  const effectiveName = selectedPlayerData?.name || currentUser.playerName || "Alliance Member";
  const allPlayerNames = allPlayers.map((player) => player.name);

  if (shouldLogPerf) {
    // eslint-disable-next-line react-hooks/purity
    console.info(`[PERF] view=${currentView} total=${Date.now() - pageStart}ms ${perfMarks.join(" | ")}`);
  }

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
                    createdAt: toIsoString(entry.createdAt),
                    updatedAt: toIsoString(entry.updatedAt),
                  }))}
                  initialMigrations={recruitmentMigrations.map((entry) => ({
                    ...entry,
                    createdAt: toIsoString(entry.createdAt),
                    updatedAt: toIsoString(entry.updatedAt),
                  }))}
                  initialApplicantWeights={recruitmentApplicantWeights}
                  initialMigrationWeights={recruitmentMigrationWeights}
                  initialApplicantThresholds={recruitmentApplicantThresholds}
                  initialMigrationThresholds={recruitmentMigrationThresholds}
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
                      // eslint-disable-next-line react-hooks/purity
                      Boolean((toDate(account?.lastLoginAt)?.getTime() ?? 0) > Date.now() - 15 * 60 * 1000),
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
