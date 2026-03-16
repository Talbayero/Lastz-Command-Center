"use client";

import { useState } from "react";
import { updateRoster } from "@/app/actions/updateRoster";
import { Pencil, Check, X } from "lucide-react";

type PlayerData = {
  id: string;
  name: string;
  totalPower: number;
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
  kills: number;
  gloryWarStatus: string;
  latestScore: number;
};

export default function Roster({ initialPlayers }: { initialPlayers: PlayerData[] }) {
  const [players, setPlayers] = useState<PlayerData[]>(initialPlayers);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleInputChange = (id: string, field: keyof PlayerData, value: string | number) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const onSave = async () => {
    setIsSaving(true);
    setMessage(null);
    const result = await updateRoster(players);
    setIsSaving(false);
    
    if (result.success) {
      setMessage({ type: 'success', text: 'Roster updated successfully! 🚀' });
      setEditingRowId(null);
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update roster.' });
    }
  };

  const toggleEdit = (id: string) => {
    if (editingRowId === id) {
      setEditingRowId(null);
    } else {
      setEditingRowId(id);
    }
  };

  return (
    <div className="flex-col gap-4">
      {message && (
        <div style={{ 
          padding: '1rem', 
          borderRadius: '4px', 
          backgroundColor: message.type === 'success' ? 'rgba(0, 255, 157, 0.1)' : 'rgba(255, 51, 102, 0.1)',
          border: `1px solid ${message.type === 'success' ? 'var(--accent-neon)' : 'var(--accent-red)'}`,
          color: message.type === 'success' ? 'var(--accent-neon)' : 'var(--accent-red)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem'
        }}>
          {message.text}
        </div>
      )}

      {/* --- COMMAND INTELLIGENCE SUMMARY --- */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '1rem' 
      }}>
        {/* Force Strength */}
        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>TOTAL FORCE</div>
          <div style={{ ...summaryValueStyle, color: 'var(--accent-neon)' }}>{players.length} MEMBERS</div>
        </div>

        {/* Glory War Status */}
        <div style={{ ...summaryCardStyle, borderLeft: '4px solid var(--accent-purple)' }}>
          <div style={{ ...summaryLabelStyle, color: 'var(--accent-purple)', fontSize: '1.1rem' }}>GLORY WAR READINESS</div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <div className="flex-col">
              <span style={miniLabelStyle}>ATTACKERS</span>
              <span style={{ color: 'var(--accent-purple)', fontWeight: 'bold' }}>{players.filter(p => p.gloryWarStatus === 'Attacker').length}</span>
            </div>
            <div className="flex-col">
              <span style={miniLabelStyle}>DEFENDERS</span>
              <span style={{ color: 'var(--accent-neon)', fontWeight: 'bold' }}>{players.filter(p => p.gloryWarStatus === 'Defender').length}</span>
            </div>
            <div className="flex-col">
              <span style={miniLabelStyle}>TOTAL ONLINE</span>
              <span style={{ color: '#fff', fontWeight: 'bold' }}>{players.filter(p => p.gloryWarStatus !== 'Offline').length}</span>
            </div>
          </div>
        </div>

        {/* Global Averages */}
        <div style={{ ...summaryCardStyle, gridColumn: 'span 2' }}>
          <div style={summaryLabelStyle}>TACTICAL AVERAGES</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.5rem' }}>
            <div style={avgItemStyle}>
              <span style={miniLabelStyle}>TECH</span>
              <span style={avgValueStyle}>{Math.round(players.reduce((sum, p) => sum + p.techPower, 0) / (players.length || 1)).toLocaleString()}</span>
            </div>
            <div style={avgItemStyle}>
              <span style={miniLabelStyle}>HERO</span>
              <span style={avgValueStyle}>{Math.round(players.reduce((sum, p) => sum + p.heroPower, 0) / (players.length || 1)).toLocaleString()}</span>
            </div>
            <div style={avgItemStyle}>
              <span style={miniLabelStyle}>TROOP</span>
              <span style={avgValueStyle}>{Math.round(players.reduce((sum, p) => sum + p.troopPower, 0) / (players.length || 1)).toLocaleString()}</span>
            </div>
            <div style={avgItemStyle}>
              <span style={miniLabelStyle}>VEHICLE</span>
              <span style={avgValueStyle}>{Math.round(players.reduce((sum, p) => sum + p.modVehiclePower, 0) / (players.length || 1)).toLocaleString()}</span>
            </div>
            <div style={avgItemStyle}>
              <span style={miniLabelStyle}>STRUCTURE</span>
              <span style={avgValueStyle}>{Math.round(players.reduce((sum, p) => sum + p.structurePower, 0) / (players.length || 1)).toLocaleString()}</span>
            </div>
            <div style={avgItemStyle}>
              <span style={miniLabelStyle}>KILLS</span>
              <span style={avgValueStyle}>{Math.round(players.reduce((sum, p) => sum + p.kills, 0) / (players.length || 1)).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-input)', borderRadius: '4px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
          <thead style={{ backgroundColor: 'var(--bg-dark)', borderBottom: '1px solid var(--border-subtle)' }}>
            <tr>
              <th style={thStyle}>EDIT</th>
              <th style={thStyle}>NAME</th>
              <th style={{ ...thStyle, backgroundColor: 'rgba(176, 38, 255, 0.2)', borderLeft: '1px solid rgba(176, 38, 255, 0.4)', borderRight: '1px solid rgba(176, 38, 255, 0.4)', color: 'var(--accent-purple)', fontWeight: 'bold' }}>GLORY WAR</th>
              <th style={thStyle}>TECH POWER</th>
              <th style={thStyle}>HERO POWER</th>
              <th style={thStyle}>TROOP POWER</th>
              <th style={thStyle}>MOD VEHICLE</th>
              <th style={thStyle}>STRUCTURE</th>
              <th style={thStyle}>KILLS</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>SCORE (EST)</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const isEditing = editingRowId === p.id;
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: isEditing ? 'rgba(176, 38, 255, 0.05)' : 'transparent' }}>
                  <td style={tdStyle}>
                    <button 
                      onClick={() => toggleEdit(p.id)}
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        color: isEditing ? 'var(--accent-purple)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {isEditing ? <Check size={18} /> : <Pencil size={18} />}
                    </button>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{p.name}</td>
                  <td style={{ ...tdStyle, backgroundColor: 'rgba(176, 38, 255, 0.1)', borderLeft: '1px solid rgba(176, 38, 255, 0.3)', borderRight: '1px solid rgba(176, 38, 255, 0.3)' }}>
                    <select 
                      value={p.gloryWarStatus || 'Offline'}
                      onChange={(e) => handleInputChange(p.id, 'gloryWarStatus', e.target.value)}
                      style={{
                        ...selectStyle,
                        color: p.gloryWarStatus === 'Attacker' ? 'var(--accent-purple)' : 
                               p.gloryWarStatus === 'Defender' ? 'var(--accent-neon)' : 
                               'var(--text-muted)',
                        backgroundColor: 'var(--bg-dark)',
                        border: '1px solid transparent',
                        padding: '2px 4px',
                        fontWeight: p.gloryWarStatus === 'Offline' ? 400 : 700
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.border = '1px solid var(--border-subtle)'}
                      onMouseLeave={(e) => e.currentTarget.style.border = '1px solid transparent'}
                    >
                      <option value="Offline" style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-muted)' }}>Offline</option>
                      <option value="Attacker" style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--accent-purple)' }}>Attacker</option>
                      <option value="Defender" style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--accent-neon)' }}>Defender</option>
                    </select>
                  </td>
                  <td style={tdStyle}>
                    {isEditing ? 
                      <input type="number" value={p.techPower} onChange={(e) => handleInputChange(p.id, 'techPower', Number(e.target.value))} style={inputStyle} /> 
                      : Number(p.techPower).toLocaleString()}
                  </td>
                  <td style={tdStyle}>
                    {isEditing ? 
                      <input type="number" value={p.heroPower} onChange={(e) => handleInputChange(p.id, 'heroPower', Number(e.target.value))} style={inputStyle} /> 
                      : Number(p.heroPower).toLocaleString()}
                  </td>
                  <td style={tdStyle}>
                    {isEditing ? 
                      <input type="number" value={p.troopPower} onChange={(e) => handleInputChange(p.id, 'troopPower', Number(e.target.value))} style={inputStyle} /> 
                      : Number(p.troopPower).toLocaleString()}
                  </td>
                  <td style={tdStyle}>
                    {isEditing ? 
                      <input type="number" value={p.modVehiclePower} onChange={(e) => handleInputChange(p.id, 'modVehiclePower', Number(e.target.value))} style={inputStyle} /> 
                      : Number(p.modVehiclePower).toLocaleString()}
                  </td>
                  <td style={tdStyle}>
                    {isEditing ? 
                      <input type="number" value={p.structurePower} onChange={(e) => handleInputChange(p.id, 'structurePower', Number(e.target.value))} style={inputStyle} /> 
                      : Number(p.structurePower).toLocaleString()}
                  </td>
                  <td style={tdStyle}>
                    {isEditing ? 
                      <input type="number" value={p.kills} onChange={(e) => handleInputChange(p.id, 'kills', Number(e.target.value))} style={inputStyle} /> 
                      : Number(p.kills).toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--accent-neon)', fontWeight: 'bold' }}>
                    {Math.round(p.latestScore).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex-row justify-end" style={{ marginTop: '1rem' }}>
        <button 
          className="cyber-button primary" 
          onClick={onSave} 
          disabled={isSaving}
          style={{ minWidth: '200px' }}
        >
          {isSaving ? 'UPLOADING INTEL...' : 'SAVE ALL CHANGES'}
        </button>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '1rem',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase'
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  fontSize: '0.875rem'
};

const inputStyle: React.CSSProperties = {
  width: '100px',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid #444',
  color: '#fff',
  padding: '4px 8px',
  borderRadius: '4px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem'
};

const selectStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-highlight)',
  color: 'var(--accent-neon)',
  padding: '4px 8px',
  borderRadius: '4px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  cursor: 'pointer'
};

const summaryCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  padding: '1rem',
  borderRadius: '4px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center'
};

const summaryLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.65rem',
  color: 'var(--text-muted)',
  letterSpacing: '0.1em',
  marginBottom: '0.25rem'
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 'bold',
  fontFamily: 'var(--font-mono)'
};

const miniLabelStyle: React.CSSProperties = {
  fontSize: '0.55rem',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.05em'
};

const avgItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '4px 8px',
  backgroundColor: 'rgba(255,255,255,0.02)',
  borderRadius: '2px'
};

const avgValueStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-mono)',
  color: 'var(--accent-neon)'
};
