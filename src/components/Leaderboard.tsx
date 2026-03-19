import { getLeaderboardData } from "@/utils/dashboardData";
import Link from "next/link";

type LeaderboardPlayer = Awaited<ReturnType<typeof getLeaderboardData>>[number];

export default async function Leaderboard({ selectedName }: { selectedName?: string }) {
  let players: LeaderboardPlayer[] = [];
  try {
    players = await getLeaderboardData();
  } catch (e) {
    console.error("Leaderboard fetch failed:", e);
  }

  if (players.length === 0) {
    return (
      <div style={{ backgroundColor: 'var(--bg-input)', padding: '2rem', borderRadius: '4px', textAlign: 'center', color: 'var(--text-muted)' }}>
         No players have been scanned yet. Upload a screenshot to begin.
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead style={{ backgroundColor: 'var(--bg-dark)', borderBottom: '1px solid var(--border-subtle)' }}>
          <tr>
            <th style={{ padding: '1rem', color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)' }}>RANK</th>
            <th style={{ padding: '1rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>NAME</th>
            <th style={{ padding: '1rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>POWER</th>
            <th style={{ padding: '0.5rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>TECH</th>
            <th style={{ padding: '0.5rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>HERO</th>
            <th style={{ padding: '0.5rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>TROOPS</th>
            <th style={{ padding: '0.5rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>MOD VEHICLE</th>
            <th style={{ padding: '0.5rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>STRUCTURE</th>
            <th style={{ padding: '1rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>KILLS</th>
            <th style={{ padding: '1rem', color: 'var(--accent-neon)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>SCORE</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, idx) => {
            const isSelected = selectedName === player.name;
            return (
              <tr 
                key={player.id} 
                style={{ 
                  borderBottom: '1px solid var(--border-subtle)',
                  backgroundColor: isSelected ? 'rgba(0, 255, 157, 0.05)' : 'transparent',
                  borderLeft: isSelected ? '4px solid var(--accent-neon)' : 'none'
                }}
              >
                <td style={{ padding: '1rem', color: isSelected ? 'var(--accent-neon)' : 'var(--accent-neon)', fontWeight: 'bold' }}>#{idx + 1}</td>
                <td style={{ padding: '1rem', fontWeight: 600 }}>
                  <Link 
                    href={isSelected ? '/' : `/?name=${encodeURIComponent(player.name)}`} 
                    style={{ 
                      color: isSelected ? 'var(--accent-neon)' : 'inherit', 
                      textDecoration: 'none', 
                      borderBottom: isSelected ? 'none' : '1px dashed var(--accent-purple)' 
                    }}
                  >
                     {player.name} {isSelected && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(SELECTED)</span>}
                  </Link>
                </td>
                <td style={{ padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                  {Number(player.totalPower).toLocaleString()}
                </td>
                <td style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {Number(player.techPower).toLocaleString()}
                </td>
                <td style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {Number(player.heroPower).toLocaleString()}
                </td>
                <td style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {Number(player.troopPower).toLocaleString()}
                </td>
                <td style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {Number(player.modVehiclePower).toLocaleString()}
                </td>
                <td style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {Number(player.structurePower).toLocaleString()}
                </td>
                <td style={{ padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                  {Number(player.kills).toLocaleString()}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--accent-neon)', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                  {Math.round(player.latestScore).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
