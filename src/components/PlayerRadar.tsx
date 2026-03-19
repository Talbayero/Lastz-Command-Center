"use client";

import { useState } from "react";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, Legend } from "recharts";
import { useRouter } from "next/navigation";

type RadarPlayerData = {
  name: string;
  totalPower: number;
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
};

type RadarAllianceAverage = {
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
};

type RadarProps = {
  playerData: RadarPlayerData | null;
  allPlayerNames: string[];
  allianceAverage?: RadarAllianceAverage;
};

export default function PlayerRadar({ playerData, allPlayerNames, allianceAverage }: RadarProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState(playerData?.name ?? "");

  if (!playerData) return null;

  const handlePlayerChange = (name: string) => {
    if (name) {
      router.push(`/?name=${encodeURIComponent(name)}`);
    } else {
      router.push('/');
    }
  };

  const filteredNames = searchTerm.trim().length === 0
    ? allPlayerNames.slice(0, 8)
    : allPlayerNames
        .filter((name) => name.toLowerCase().includes(searchTerm.toLowerCase()))
        .slice(0, 8);

  // Transform data into Recharts format
  const data = [
    {
      subject: "Tech",
      A: playerData.techPower,
      B: allianceAverage?.techPower || 0,
      fullMark: Math.max(playerData.techPower * 1.5, (allianceAverage?.techPower ?? 0) * 1.5 || 1000000),
    },
    {
      subject: "Hero",
      A: playerData.heroPower,
      B: allianceAverage?.heroPower || 0,
      fullMark: Math.max(playerData.heroPower * 1.5, (allianceAverage?.heroPower ?? 0) * 1.5 || 1000000),
    },
    {
      subject: "Troops",
      A: playerData.troopPower,
      B: allianceAverage?.troopPower || 0,
      fullMark: Math.max(playerData.troopPower * 1.5, (allianceAverage?.troopPower ?? 0) * 1.5 || 1000000),
    },
    {
      subject: "Mod Vehicle",
      A: playerData.modVehiclePower,
      B: allianceAverage?.modVehiclePower || 0,
      fullMark: Math.max(playerData.modVehiclePower * 1.5, (allianceAverage?.modVehiclePower ?? 0) * 1.5 || 1000000),
    },
    {
      subject: "Structures",
      A: playerData.structurePower,
      B: allianceAverage?.structurePower || 0,
      fullMark: Math.max(playerData.structurePower * 1.5, (allianceAverage?.structurePower ?? 0) * 1.5 || 1000000),
    },
  ];

  return (
    <div className="flex-col gap-4" style={{ width: '100%' }}>
      <div className="flex-row justify-between items-end" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
        <div className="flex-col">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Target Selection</span>
          <div className="flex-col gap-2" style={{ minWidth: '280px', marginTop: '0.4rem' }}>
            <input
              type="text"
              className="cyber-input"
              placeholder="Search player name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const exactMatch = allPlayerNames.find((name) => name.toLowerCase() === searchTerm.trim().toLowerCase());
                  handlePlayerChange(exactMatch || filteredNames[0] || "");
                }
              }}
              style={{
                color: 'var(--accent-purple)',
                fontWeight: 'bold',
                fontSize: '1rem',
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {filteredNames.map((name) => (
                <button
                  key={name}
                  className="cyber-button"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.7rem' }}
                  onClick={() => handlePlayerChange(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Total Power</span>
          <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--accent-neon)', fontFamily: 'var(--font-mono)' }}>
            {Number(playerData.totalPower || 0).toLocaleString()}
          </span>
        </div>
      </div>
      <div style={{ width: '100%', height: 350 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="var(--border-subtle)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }} />
          <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} tick={false} axisLine={false} />
          <Radar
            name={playerData.name}
            dataKey="A"
            stroke="var(--accent-neon)"
            fill="var(--accent-neon)"
            fillOpacity={0.5}
          />
          {allianceAverage && (
            <Radar
              name="Alliance Average"
              dataKey="B"
              stroke="var(--accent-purple)"
              fill="var(--accent-purple)"
              fillOpacity={0.3}
            />
          )}
          <Tooltip 
             contentStyle={{ 
                 backgroundColor: 'var(--bg-card)', 
                 borderColor: 'var(--border-subtle)',
                 fontFamily: 'var(--font-mono)'
             }}
             itemStyle={{ color: 'var(--text-main)' }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            formatter={(value) => <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{value}</span>}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}
