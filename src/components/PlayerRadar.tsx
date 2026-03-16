"use client";

import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, Legend } from "recharts";
import { useRouter } from "next/navigation";

type RadarProps = {
  playerData: any;
  allPlayerNames: string[];
  allianceAverage?: any;
};

export default function PlayerRadar({ playerData, allPlayerNames, allianceAverage }: RadarProps) {
  const router = useRouter();
  if (!playerData) return null;

  const handlePlayerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    if (name) {
      router.push(`/?name=${encodeURIComponent(name)}`);
    } else {
      router.push('/');
    }
  };

  // Transform data into Recharts format
  const data = [
    {
      subject: "Tech",
      A: playerData.techPower,
      B: allianceAverage?.techPower || 0,
      fullMark: Math.max(playerData.techPower * 1.5, allianceAverage?.techPower * 1.5 || 1000000),
    },
    {
      subject: "Hero",
      A: playerData.heroPower,
      B: allianceAverage?.heroPower || 0,
      fullMark: Math.max(playerData.heroPower * 1.5, allianceAverage?.heroPower * 1.5 || 1000000),
    },
    {
      subject: "Troops",
      A: playerData.troopPower,
      B: allianceAverage?.troopPower || 0,
      fullMark: Math.max(playerData.troopPower * 1.5, allianceAverage?.troopPower * 1.5 || 1000000),
    },
    {
      subject: "Mod Vehicle",
      A: playerData.modVehiclePower,
      B: allianceAverage?.modVehiclePower || 0,
      fullMark: Math.max(playerData.modVehiclePower * 1.5, allianceAverage?.modVehiclePower * 1.5 || 1000000),
    },
    {
      subject: "Structures",
      A: playerData.structurePower,
      B: allianceAverage?.structurePower || 0,
      fullMark: Math.max(playerData.structurePower * 1.5, allianceAverage?.structurePower * 1.5 || 1000000),
    },
  ];

  return (
    <div className="flex-col gap-4" style={{ width: '100%' }}>
      <div className="flex-row justify-between items-end" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
        <div className="flex-col">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Target Selection</span>
          <select 
            value={playerData.name} 
            onChange={handlePlayerChange}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--accent-purple)',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              outline: 'none',
              cursor: 'pointer',
              padding: '0',
              fontFamily: 'inherit'
            }}
          >
            {allPlayerNames.map(name => (
              <option key={name} value={name} style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>{name}</option>
            ))}
          </select>
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
