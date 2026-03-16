import Link from "next/link";
export const dynamic = "force-dynamic";
import OcrUploader from "@/components/OcrUploader";
import Leaderboard from "@/components/Leaderboard";
import PlayerRadar from "@/components/PlayerRadar";
import ScoringEngine from "@/components/ScoringEngine";
import Roster from "@/components/Roster";
import BugReportModal from "@/components/BugReportModal";
import BugList from "@/components/BugList";

import db from "@/utils/sqlite";

export default async function Home(props: { searchParams: Promise<{ name?: string, view?: string }> }) {
  const searchParams = await props.searchParams;
  const targetName = searchParams.name;
  const currentView = searchParams.view || 'performance';

  // 1. Fetch Alliance Average
  // ... (keep avg)
  const allianceAvg = db.prepare(`
    SELECT 
      AVG(techPower) as techPower, 
      AVG(heroPower) as heroPower, 
      AVG(troopPower) as troopPower, 
      AVG(modVehiclePower) as modVehiclePower, 
      AVG(structurePower) as structurePower 
    FROM Snapshot
  `).get() as any;

  // 2. Fetch Selected Player
  let selectedPlayerData: any = null;
  if (targetName) {
    selectedPlayerData = db.prepare(`
      SELECT p.name, p.totalPower, s.* 
      FROM Player p
      JOIN Snapshot s ON p.id = s.playerId
      WHERE LOWER(p.name) = LOWER(?)
      ORDER BY s.createdAt DESC LIMIT 1
    `).get(targetName);
  }

  if (!selectedPlayerData) {
    selectedPlayerData = db.prepare(`
      SELECT p.name, p.totalPower, s.* 
      FROM Player p
      JOIN Snapshot s ON p.id = s.playerId
      ORDER BY p.latestScore DESC LIMIT 1
    `).get();
  }

  // 3. Fetch Roster Data
  const rosterData = db.prepare(`
    SELECT 
      p.id, p.name, p.totalPower, p.kills, p.gloryWarStatus, p.latestScore,
      s.techPower, s.heroPower, s.troopPower, s.modVehiclePower, s.structurePower
    FROM Player p
    LEFT JOIN Snapshot s ON p.id = s.playerId
    WHERE s.createdAt = (SELECT MAX(createdAt) FROM Snapshot WHERE playerId = p.id)
    OR s.id IS NULL
    ORDER BY p.name ASC
  `).all() as any[];

  // 4. Fetch Bugs
  const bugData = db.prepare(`SELECT * FROM Bug ORDER BY createdAt DESC`).all() as any[];

  const effectiveName = selectedPlayerData?.name || "Alliance Member";
  const allPlayers = db.prepare('SELECT name FROM Player ORDER BY name ASC').all() as { name: string }[];
  const allPlayerNames = allPlayers.map(p => p.name);

  return (
    <div className="flex-col gap-6" style={{ marginTop: '2rem' }}>
      <header className="flex-row justify-between">
        <div className="flex-row gap-4 items-center">
          <div>
            <h1>Alliance Dashboard</h1>
            <p style={{ color: 'var(--text-muted)' }}>Real-time performance metrics and combat analysis.</p>
          </div>
        </div>

        <nav className="flex-row gap-2" style={{ backgroundColor: 'var(--bg-input)', padding: '4px', borderRadius: '8px' }}>
          <Link 
            href="/?view=performance" 
            className={`cyber-button ${currentView === 'performance' ? 'primary' : ''}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}
          >
            Performance
          </Link>
          <Link 
            href="/?view=roster" 
            className={`cyber-button ${currentView === 'roster' ? 'primary' : ''}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}
          >
            Roster
          </Link>
          <Link 
            href="/?view=bugs" 
            className={`cyber-button ${currentView === 'bugs' ? 'primary' : ''}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}
          >
            Bugs
          </Link>
        </nav>
      </header>

      <div className="dashboard-grid">
        <section className={currentView === 'performance' ? "col-span-8" : "col-span-12"}>
          <div className="cyber-card flex-col gap-4">
            <h2 style={{ color: 'var(--accent-neon)', fontSize: '1.25rem' }}>
              {currentView === 'performance' ? 'TOP PERFORMERS' : 
               currentView === 'roster' ? 'ALLIANCE ROSTER' : 'REPORTED ANOMALIES'}
            </h2>
            
            {currentView === 'performance' ? (
              <Leaderboard selectedName={selectedPlayerData?.name} />
            ) : currentView === 'roster' ? (
              <Roster initialPlayers={rosterData} />
            ) : (
              <BugList initialBugs={bugData} />
            )}
          </div>

          {currentView === 'performance' && (
            <div className="cyber-card flex-col gap-4" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ color: 'var(--accent-purple)' }}>Combat Balance Radar: {effectiveName}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Comparing individual profile against the alliance average.</p>
              <PlayerRadar 
                 playerData={selectedPlayerData}
                 allPlayerNames={allPlayerNames}
                 allianceAverage={allianceAvg}
              />
            </div>
          )}
        </section>

        {currentView === 'performance' && (
          <section className="col-span-4 flex-col gap-6">
            <OcrUploader />
            <div className="cyber-card">
              <h3 style={{ color: 'var(--accent-purple)', marginBottom: '1.5rem' }}>Scoring Engine</h3>
              <ScoringEngine />
            </div>

            <div className="cyber-card">
              <h3 style={{ color: 'var(--accent-neon)', marginBottom: '1rem' }}>System Status</h3>
              <div className="flex-row justify-between mb-2">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>DB CONNECTION</span>
                <span style={{ color: 'var(--accent-neon)' }}>ONLINE</span>
              </div>
              <div className="flex-row justify-between">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>OCR ENGINE</span>
                <span style={{ color: 'var(--accent-neon)' }}>ACTIVE</span>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
