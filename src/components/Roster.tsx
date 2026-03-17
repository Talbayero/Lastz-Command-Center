"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteRosterPlayer, updateRoster } from "@/app/actions/updateRoster";
import { Pencil, Check, Trash2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

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
  march1Power: number;
  march2Power: number;
  march3Power: number;
  march4Power: number;
  combatPower: number;
};

type SortField =
  | "verify"
  | "rank"
  | "name"
  | "combatPower"
  | "gloryWarStatus"
  | "techPower"
  | "heroPower"
  | "troopPower"
  | "modVehiclePower"
  | "structurePower"
  | "kills"
  | "latestScore";

type SortDirection = "asc" | "desc";

const correctionFields = [
  "techPower",
  "heroPower",
  "troopPower",
  "modVehiclePower",
  "structurePower",
  "kills",
] as const;

function getCorrectionFields(player: PlayerData) {
  return correctionFields.filter((field) => player[field] === 0);
}

function renderStatValue(value: number) {
  if (value !== 0) {
    return Number(value).toLocaleString();
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "var(--accent-red)", fontWeight: 700 }}>
      <AlertTriangle size={14} />
      VERIFY
    </span>
  );
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export default function Roster({
  initialPlayers,
  canEditRoster = true,
  canDeleteRosterMembers = true,
  canEditPlayerNames = true,
}: {
  initialPlayers: PlayerData[];
  canEditRoster?: boolean;
  canDeleteRosterMembers?: boolean;
  canEditPlayerNames?: boolean;
}) {
  const router = useRouter();
  const [players, setPlayers] = useState<PlayerData[]>(initialPlayers);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("latestScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showMarchColumns, setShowMarchColumns] = useState(false);

  const handleInputChange = (id: string, field: keyof PlayerData, value: string | number) => {
    setPlayers(prev => prev.map((p) => {
      if (p.id !== id) return p;

      const nextPlayer = { ...p, [field]: value } as PlayerData;
      nextPlayer.combatPower =
        Number(nextPlayer.march1Power || 0) +
        Number(nextPlayer.march2Power || 0) +
        Number(nextPlayer.march3Power || 0) +
        Number(nextPlayer.march4Power || 0);

      return nextPlayer;
    }));
  };

  const onSave = async () => {
    if (!canEditRoster) return;
    setIsSaving(true);
    setMessage(null);
    const result = await updateRoster(players);
    setIsSaving(false);
    
    if (result.success) {
      setMessage({ type: 'success', text: 'Roster updated successfully! 🚀' });
      setEditingRowId(null);
      router.refresh();
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update roster.' });
    }
  };

  const toggleEdit = (id: string) => {
    if (!canEditRoster) return;
    if (editingRowId === id) {
      setEditingRowId(null);
    } else {
      setEditingRowId(id);
    }
  };

  const onDelete = async (player: PlayerData) => {
    const confirmed = window.confirm(`Delete ${player.name} from the roster? This will also remove their saved snapshots.`);
    if (!confirmed) return;

    setIsSaving(true);
    setMessage(null);

    const result = await deleteRosterPlayer(player.id);
    setIsSaving(false);

    if (result.success) {
      setPlayers((prev) => prev.filter((p) => p.id !== player.id));
      if (editingRowId === player.id) {
        setEditingRowId(null);
      }
      setMessage({ type: "success", text: `${player.name} deleted successfully.` });
      router.refresh();
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({ type: "error", text: result.error || "Failed to delete player." });
    }
  };

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection(field === "name" || field === "gloryWarStatus" ? "asc" : "desc");
  };

  const scoreRankings = [...players]
    .sort((a, b) => b.latestScore - a.latestScore)
    .reduce<Record<string, number>>((acc, player, index) => {
      acc[player.id] = index + 1;
      return acc;
    }, {});

  const filteredPlayers = players.filter((player) =>
    player.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    const aNeedsReview = getCorrectionFields(a).length > 0;
    const bNeedsReview = getCorrectionFields(b).length > 0;

    if (aNeedsReview !== bNeedsReview) {
      return aNeedsReview ? -1 : 1;
    }

    const direction = sortDirection === "asc" ? 1 : -1;

    if (sortField === "verify") {
      return (getCorrectionFields(a).length - getCorrectionFields(b).length) * direction;
    }

    if (sortField === "rank") {
      return (scoreRankings[a.id] - scoreRankings[b.id]) * direction;
    }

    if (sortField === "name" || sortField === "gloryWarStatus") {
      return a[sortField].localeCompare(b[sortField]) * direction;
    }

    return ((a[sortField] ?? 0) - (b[sortField] ?? 0)) * direction;
  });

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return " ↕";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  const attackers = players.filter((player) => player.gloryWarStatus === "Attacker");
  const defenders = players.filter((player) => player.gloryWarStatus === "Defender");
  const offline = players.filter((player) => player.gloryWarStatus === "Offline");
  const attackerAverageCombat = getAverage(attackers.map((player) => player.combatPower));
  const attackerAverageTroop = getAverage(attackers.map((player) => player.troopPower));
  const defenderAverageCombat = getAverage(defenders.map((player) => player.combatPower));
  const defenderAverageTroop = getAverage(defenders.map((player) => player.troopPower));

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
          <div style={{ ...summaryLabelStyle, color: 'var(--accent-purple)', fontSize: '1.1rem', fontWeight: 800 }}>GLORY WAR READINESS</div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <div className="flex-col">
              <span style={miniLabelStyle}>ATTACKERS</span>
              <span style={{ color: 'var(--accent-purple)', fontWeight: 800, fontSize: '1.6rem', lineHeight: 1 }}>{attackers.length}</span>
            </div>
            <div className="flex-col">
              <span style={miniLabelStyle}>DEFENDERS</span>
              <span style={{ color: 'var(--accent-neon)', fontWeight: 800, fontSize: '1.6rem', lineHeight: 1 }}>{defenders.length}</span>
            </div>
            <div className="flex-col">
              <span style={miniLabelStyle}>TOTAL OFFLINE</span>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.6rem', lineHeight: 1 }}>{offline.length}</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem", marginTop: "1rem" }}>
            <div style={avgItemStyle}>
              <span style={miniLabelStyle}>ATTACKER AVG COMBAT</span>
              <span style={avgValueStyle}>{attackerAverageCombat.toLocaleString()}</span>
            </div>
            <div style={avgItemStyle}>
              <span style={miniLabelStyle}>ATTACKER AVG TROOP</span>
              <span style={avgValueStyle}>{attackerAverageTroop.toLocaleString()}</span>
            </div>
            <div style={avgItemStyle}>
              <span style={miniLabelStyle}>DEFENDER AVG COMBAT</span>
              <span style={avgValueStyle}>{defenderAverageCombat.toLocaleString()}</span>
            </div>
            <div style={avgItemStyle}>
              <span style={miniLabelStyle}>DEFENDER AVG TROOP</span>
              <span style={avgValueStyle}>{defenderAverageTroop.toLocaleString()}</span>
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

      <div className="flex-row justify-between gap-4" style={{ alignItems: 'end' }}>
        <div className="flex-col gap-2" style={{ minWidth: '320px' }}>
          <label className="cyber-label" style={{ marginBottom: 0 }}>SEARCH BY NAME</label>
          <input
            type="text"
            className="cyber-input"
            placeholder="Type a player name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex-row gap-4 items-center">
          <button
            type="button"
            className="cyber-button"
            onClick={() => setShowMarchColumns((prev) => !prev)}
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.72rem' }}
          >
            {showMarchColumns ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {showMarchColumns ? 'Hide Marches' : 'Show Marches'}
          </button>
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            SHOWING {sortedPlayers.length} OF {players.length}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-input)', borderRadius: '4px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
          <thead style={{ backgroundColor: 'var(--bg-dark)', borderBottom: '1px solid var(--border-subtle)' }}>
            <tr>
              <th style={thStyle}>ACTIONS</th>
              <th style={sortableThStyle(sortField === "verify")} onClick={() => onSort("verify")}>VERIFY{getSortIndicator("verify")}</th>
              <th style={sortableThStyle(sortField === "rank")} onClick={() => onSort("rank")}>RANK{getSortIndicator("rank")}</th>
              <th style={sortableThStyle(sortField === "name")} onClick={() => onSort("name")}>NAME{getSortIndicator("name")}</th>
              <th style={sortableThStyle(sortField === "combatPower")} onClick={() => onSort("combatPower")}>COMBAT POWER{getSortIndicator("combatPower")}</th>
              {showMarchColumns && <th style={thStyle}>MARCH 1</th>}
              {showMarchColumns && <th style={thStyle}>MARCH 2</th>}
              {showMarchColumns && <th style={thStyle}>MARCH 3</th>}
              {showMarchColumns && <th style={thStyle}>MARCH 4</th>}
              <th style={{ ...sortableThStyle(sortField === "gloryWarStatus"), backgroundColor: 'rgba(176, 38, 255, 0.2)', borderLeft: '1px solid rgba(176, 38, 255, 0.4)', borderRight: '1px solid rgba(176, 38, 255, 0.4)', color: 'var(--accent-purple)', fontWeight: 'bold' }} onClick={() => onSort("gloryWarStatus")}>GLORY WAR{getSortIndicator("gloryWarStatus")}</th>
              <th style={sortableThStyle(sortField === "techPower")} onClick={() => onSort("techPower")}>TECH POWER{getSortIndicator("techPower")}</th>
              <th style={sortableThStyle(sortField === "heroPower")} onClick={() => onSort("heroPower")}>HERO POWER{getSortIndicator("heroPower")}</th>
              <th style={sortableThStyle(sortField === "troopPower")} onClick={() => onSort("troopPower")}>TROOP POWER{getSortIndicator("troopPower")}</th>
              <th style={sortableThStyle(sortField === "modVehiclePower")} onClick={() => onSort("modVehiclePower")}>MOD VEHICLE{getSortIndicator("modVehiclePower")}</th>
              <th style={sortableThStyle(sortField === "structurePower")} onClick={() => onSort("structurePower")}>STRUCTURE{getSortIndicator("structurePower")}</th>
              <th style={sortableThStyle(sortField === "kills")} onClick={() => onSort("kills")}>KILLS{getSortIndicator("kills")}</th>
              <th style={{ ...sortableThStyle(sortField === "latestScore"), textAlign: 'right' }} onClick={() => onSort("latestScore")}>SCORE (EST){getSortIndicator("latestScore")}</th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((p, idx) => {
              const isEditing = editingRowId === p.id;
              const missingFields = getCorrectionFields(p);
              const needsReview = missingFields.length > 0;
              return (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor: isEditing
                      ? 'rgba(176, 38, 255, 0.05)'
                      : needsReview
                        ? 'rgba(255, 51, 102, 0.05)'
                        : 'transparent'
                  }}
                >
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {canEditRoster && (
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
                      )}
                      {canDeleteRosterMembers && (
                        <button
                          onClick={() => onDelete(p)}
                          disabled={isSaving}
                          title={`Delete ${p.name}`}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-red)',
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: isSaving ? 0.5 : 1,
                          }}
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {needsReview ? (
                      <span
                        title={`Verify ${p.name}: missing ${missingFields.join(", ")}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--accent-red)',
                        }}
                      >
                        <AlertTriangle size={16} />
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: 'var(--accent-neon)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      #{scoreRankings[p.id]}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {isEditing && canEditPlayerNames ? (
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => handleInputChange(p.id, "name", e.target.value)}
                        style={{ ...inputStyle, width: "180px" }}
                      />
                    ) : (
                      p.name
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', color: 'var(--accent-neon)', fontWeight: 700 }}>
                    {Number(p.combatPower).toLocaleString()}
                  </td>
                  {showMarchColumns && (
                    <td style={tdStyle}>
                      {isEditing && canEditRoster
                        ? <input type="number" value={p.march1Power} onChange={(e) => handleInputChange(p.id, 'march1Power', Number(e.target.value))} style={inputStyle} />
                        : Number(p.march1Power).toLocaleString()}
                    </td>
                  )}
                  {showMarchColumns && (
                    <td style={tdStyle}>
                      {isEditing && canEditRoster
                        ? <input type="number" value={p.march2Power} onChange={(e) => handleInputChange(p.id, 'march2Power', Number(e.target.value))} style={inputStyle} />
                        : Number(p.march2Power).toLocaleString()}
                    </td>
                  )}
                  {showMarchColumns && (
                    <td style={tdStyle}>
                      {isEditing && canEditRoster
                        ? <input type="number" value={p.march3Power} onChange={(e) => handleInputChange(p.id, 'march3Power', Number(e.target.value))} style={inputStyle} />
                        : Number(p.march3Power).toLocaleString()}
                    </td>
                  )}
                  {showMarchColumns && (
                    <td style={tdStyle}>
                      {isEditing && canEditRoster
                        ? <input type="number" value={p.march4Power} onChange={(e) => handleInputChange(p.id, 'march4Power', Number(e.target.value))} style={inputStyle} />
                        : Number(p.march4Power).toLocaleString()}
                    </td>
                  )}
                  <td style={{ ...tdStyle, backgroundColor: 'rgba(176, 38, 255, 0.1)', borderLeft: '1px solid rgba(176, 38, 255, 0.3)', borderRight: '1px solid rgba(176, 38, 255, 0.3)' }}>
                    <select 
                      value={p.gloryWarStatus || 'Offline'}
                      onChange={(e) => handleInputChange(p.id, 'gloryWarStatus', e.target.value)}
                      disabled={!canEditRoster}
                      style={{
                        ...selectStyle,
                        color: p.gloryWarStatus === 'Attacker' ? 'var(--accent-purple)' : 
                               p.gloryWarStatus === 'Defender' ? 'var(--accent-neon)' : 
                               'var(--text-muted)',
                        backgroundColor: 'var(--bg-dark)',
                        border: '1px solid transparent',
                        padding: '2px 4px',
                        fontWeight: p.gloryWarStatus === 'Offline' ? 400 : 700,
                        cursor: canEditRoster ? 'pointer' : 'default',
                        opacity: canEditRoster ? 1 : 0.75,
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
                    {isEditing && canEditRoster ? 
                      <input type="number" value={p.techPower} onChange={(e) => handleInputChange(p.id, 'techPower', Number(e.target.value))} style={inputStyle} /> 
                      : renderStatValue(p.techPower)}
                  </td>
                  <td style={tdStyle}>
                    {isEditing && canEditRoster ? 
                      <input type="number" value={p.heroPower} onChange={(e) => handleInputChange(p.id, 'heroPower', Number(e.target.value))} style={inputStyle} /> 
                      : renderStatValue(p.heroPower)}
                  </td>
                  <td style={tdStyle}>
                    {isEditing && canEditRoster ? 
                      <input type="number" value={p.troopPower} onChange={(e) => handleInputChange(p.id, 'troopPower', Number(e.target.value))} style={inputStyle} /> 
                      : renderStatValue(p.troopPower)}
                  </td>
                  <td style={tdStyle}>
                    {isEditing && canEditRoster ? 
                      <input type="number" value={p.modVehiclePower} onChange={(e) => handleInputChange(p.id, 'modVehiclePower', Number(e.target.value))} style={inputStyle} /> 
                      : renderStatValue(p.modVehiclePower)}
                  </td>
                  <td style={tdStyle}>
                    {isEditing && canEditRoster ? 
                      <input type="number" value={p.structurePower} onChange={(e) => handleInputChange(p.id, 'structurePower', Number(e.target.value))} style={inputStyle} /> 
                      : renderStatValue(p.structurePower)}
                  </td>
                  <td style={tdStyle}>
                    {isEditing && canEditRoster ? 
                      <input type="number" value={p.kills} onChange={(e) => handleInputChange(p.id, 'kills', Number(e.target.value))} style={inputStyle} /> 
                      : renderStatValue(p.kills)}
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

      {canEditRoster && (
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
      )}
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

const sortableThStyle = (active: boolean): React.CSSProperties => ({
  ...thStyle,
  cursor: 'pointer',
  userSelect: 'none',
  color: active ? 'var(--accent-neon)' : thStyle.color,
});

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
