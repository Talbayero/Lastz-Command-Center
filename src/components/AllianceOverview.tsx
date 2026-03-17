type PlayerData = {
  id: string;
  name: string;
  totalPower: number;
  combatPower: number;
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
  kills: number;
  gloryWarStatus: string;
  latestScore: number;
};

type BugData = {
  id: string;
  status: string;
  priority: string;
};

const correctionFields = [
  "techPower",
  "heroPower",
  "troopPower",
  "modVehiclePower",
  "structurePower",
  "kills",
] as const;

function needsCorrection(player: PlayerData) {
  return correctionFields.some((field) => player[field] === 0);
}

function averageOf(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export default function AllianceOverview({
  players,
  bugs,
}: {
  players: PlayerData[];
  bugs: BugData[];
}) {
  const totalMembers = players.length;
  const totalPower = players.reduce((sum, player) => sum + player.totalPower, 0);
  const totalKills = players.reduce((sum, player) => sum + player.kills, 0);
  const averageScore = players.reduce((sum, player) => sum + player.latestScore, 0) / (totalMembers || 1);
  const attackerPlayers = players.filter((player) => player.gloryWarStatus === "Attacker");
  const defenderPlayers = players.filter((player) => player.gloryWarStatus === "Defender");
  const offlinePlayers = players.filter((player) => player.gloryWarStatus === "Offline");
  const attackers = attackerPlayers.length;
  const defenders = defenderPlayers.length;
  const offline = offlinePlayers.length;
  const attackerAverageCombat = averageOf(attackerPlayers.map((player) => player.combatPower));
  const attackerAverageTroop = averageOf(attackerPlayers.map((player) => player.troopPower));
  const defenderAverageCombat = averageOf(defenderPlayers.map((player) => player.combatPower));
  const defenderAverageTroop = averageOf(defenderPlayers.map((player) => player.troopPower));
  const flaggedProfiles = players.filter(needsCorrection).length;
  const cleanProfiles = totalMembers - flaggedProfiles;
  const openBugs = bugs.filter((bug) => bug.status === "Open").length;
  const highPriorityBugs = bugs.filter((bug) => bug.priority === "High" && bug.status === "Open").length;

  const sortedByScore = [...players].sort((a, b) => b.latestScore - a.latestScore);
  const sortedByPower = [...players].sort((a, b) => b.totalPower - a.totalPower);
  const sortedByKills = [...players].sort((a, b) => b.kills - a.kills);

  const topScore = sortedByScore.slice(0, 5);
  const topPower = sortedByPower.slice(0, 5);
  const topKills = sortedByKills.slice(0, 5);

  const specialistLeaders = [
    { label: "Tech", player: [...players].sort((a, b) => b.techPower - a.techPower)[0], valueKey: "techPower" as const },
    { label: "Hero", player: [...players].sort((a, b) => b.heroPower - a.heroPower)[0], valueKey: "heroPower" as const },
    { label: "Troop", player: [...players].sort((a, b) => b.troopPower - a.troopPower)[0], valueKey: "troopPower" as const },
    { label: "Vehicle", player: [...players].sort((a, b) => b.modVehiclePower - a.modVehiclePower)[0], valueKey: "modVehiclePower" as const },
    { label: "Structure", player: [...players].sort((a, b) => b.structurePower - a.structurePower)[0], valueKey: "structurePower" as const },
  ];

  return (
    <div className="flex-col gap-6">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        <OverviewCard label="Alliance Members" value={totalMembers.toLocaleString()} accent="var(--accent-neon)" />
        <OverviewCard label="Combined Power" value={totalPower.toLocaleString()} accent="var(--accent-purple)" />
        <OverviewCard label="Combined Kills" value={totalKills.toLocaleString()} accent="#fff" />
        <OverviewCard label="Average Score" value={Math.round(averageScore).toLocaleString()} accent="var(--accent-neon)" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr",
          gap: "1rem",
        }}
      >
        <section className="cyber-card flex-col gap-4">
          <h3 style={sectionTitleStyle}>Alliance Readiness</h3>
          <div style={metricGridStyle}>
            <MetricBlock label="Attackers" value={attackers} color="var(--accent-purple)" />
            <MetricBlock label="Defenders" value={defenders} color="var(--accent-neon)" />
            <MetricBlock label="Offline" value={offline} color="#fff" />
          </div>
          <div style={readinessAverageGridStyle}>
            <ReadinessAverage label="Attacker Avg Combat" value={attackerAverageCombat} />
            <ReadinessAverage label="Attacker Avg Troop" value={attackerAverageTroop} />
            <ReadinessAverage label="Defender Avg Combat" value={defenderAverageCombat} />
            <ReadinessAverage label="Defender Avg Troop" value={defenderAverageTroop} />
          </div>
          <p style={bodyCopyStyle}>
            Current roster posture shows {attackers} attackers, {defenders} defenders, and {offline} offline members.
          </p>
        </section>

        <section className="cyber-card flex-col gap-4">
          <h3 style={sectionTitleStyle}>Data Quality</h3>
          <div style={metricGridStyle}>
            <MetricBlock label="Clean Profiles" value={cleanProfiles} color="var(--accent-neon)" />
            <MetricBlock label="Needs Correction" value={flaggedProfiles} color="var(--accent-red)" />
          </div>
          <p style={bodyCopyStyle}>
            {flaggedProfiles} profiles have at least one missing combat stat showing as 0 and should be reviewed manually.
          </p>
        </section>

        <section className="cyber-card flex-col gap-4">
          <h3 style={sectionTitleStyle}>Open Issues</h3>
          <div style={metricGridStyle}>
            <MetricBlock label="Open Bugs" value={openBugs} color="var(--accent-neon)" />
            <MetricBlock label="High Priority" value={highPriorityBugs} color="var(--accent-red)" />
          </div>
          <p style={bodyCopyStyle}>
            This gives you a quick health check of the command center itself alongside alliance performance.
          </p>
        </section>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "1rem",
        }}
      >
        <RankingPanel title="Top By Score" players={topScore} valueKey="latestScore" />
        <RankingPanel title="Top By Power" players={topPower} valueKey="totalPower" />
        <RankingPanel title="Top By Kills" players={topKills} valueKey="kills" />
      </div>

      <section className="cyber-card flex-col gap-4">
        <h3 style={sectionTitleStyle}>Specialist Leaders</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          {specialistLeaders.map(({ label, player, valueKey }) => (
            <div
              key={label}
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "6px",
                padding: "1rem",
              }}
            >
              <div style={miniLabelStyle}>{label} Leader</div>
              <div style={{ color: "var(--accent-neon)", fontWeight: 700, fontSize: "1.05rem", marginTop: "0.35rem" }}>
                {player?.name || "N/A"}
              </div>
              <div style={{ ...bodyCopyStyle, marginTop: "0.35rem", fontFamily: "var(--font-mono)" }}>
                {player ? Number(player[valueKey]).toLocaleString() : "0"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function OverviewCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="cyber-card">
      <div style={miniLabelStyle}>{label}</div>
      <div style={{ marginTop: "0.6rem", color: accent, fontSize: "1.8rem", fontWeight: 800, fontFamily: "var(--font-mono)" }}>
        {value}
      </div>
    </div>
  );
}

function MetricBlock({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div style={miniLabelStyle}>{label}</div>
      <div style={{ color, fontSize: "2rem", fontWeight: 800, lineHeight: 1, marginTop: "0.25rem" }}>{value}</div>
    </div>
  );
}

function ReadinessAverage({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        backgroundColor: "var(--bg-input)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "6px",
        padding: "0.75rem 0.85rem",
      }}
    >
      <div style={miniLabelStyle}>{label}</div>
      <div style={{ color: "var(--accent-neon)", fontFamily: "var(--font-mono)", fontWeight: 700, marginTop: "0.35rem" }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function RankingPanel({
  title,
  players,
  valueKey,
}: {
  title: string;
  players: PlayerData[];
  valueKey: "latestScore" | "totalPower" | "kills";
}) {
  return (
    <section className="cyber-card flex-col gap-4">
      <h3 style={sectionTitleStyle}>{title}</h3>
      <div className="flex-col gap-2">
        {players.map((player, index) => (
          <div
            key={`${title}-${player.id}`}
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr auto",
              gap: "0.75rem",
              alignItems: "center",
              backgroundColor: "var(--bg-input)",
              borderRadius: "6px",
              padding: "0.75rem 0.9rem",
            }}
          >
            <div style={{ color: "var(--accent-neon)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>#{index + 1}</div>
            <div style={{ fontWeight: 700 }}>{player.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-main)" }}>
              {Math.round(player[valueKey]).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  color: "var(--accent-purple)",
  fontSize: "1.15rem",
};

const miniLabelStyle: React.CSSProperties = {
  fontSize: "0.68rem",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

const bodyCopyStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "1rem",
};

const readinessAverageGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.75rem",
};
