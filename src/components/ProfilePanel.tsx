"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import OcrUploader from "@/components/OcrUploader";
import { saveProfileData, saveProfileLeaderNotes } from "@/app/actions/profile";

type ProfileSnapshot = {
  id: string;
  createdAt: string;
  totalPower: number;
  kills: number;
  score: number;
};

type ProfileData = {
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
  snapshots: ProfileSnapshot[];
};

const correctionFields: Array<keyof Pick<
  ProfileData,
  "techPower" | "heroPower" | "troopPower" | "modVehiclePower" | "structurePower" | "kills"
>> = ["techPower", "heroPower", "troopPower", "modVehiclePower", "structurePower", "kills"];

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export default function ProfilePanel({
  profile,
  availablePlayers,
  canEditProfile,
  canManageNotes,
  canBrowsePlayers,
}: {
  profile: ProfileData;
  availablePlayers: string[];
  canEditProfile: boolean;
  canManageNotes: boolean;
  canBrowsePlayers: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [notesMessage, setNotesMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [formData, setFormData] = useState({
    name: profile.name,
    gloryWarStatus: profile.gloryWarStatus,
    totalPower: profile.totalPower,
    kills: profile.kills,
    techPower: profile.techPower,
    heroPower: profile.heroPower,
    troopPower: profile.troopPower,
    modVehiclePower: profile.modVehiclePower,
    structurePower: profile.structurePower,
    march1Power: profile.march1Power,
    march2Power: profile.march2Power,
    march3Power: profile.march3Power,
    march4Power: profile.march4Power,
  });
  const [leaderNotes, setLeaderNotes] = useState(profile.leaderNotes);

  const combatPower = useMemo(
    () => formData.march1Power + formData.march2Power + formData.march3Power + formData.march4Power,
    [formData.march1Power, formData.march2Power, formData.march3Power, formData.march4Power]
  );

  const missingFields = correctionFields.filter((field) => formData[field] === 0);

  const onSaveProfile = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveProfileData({
        playerId: profile.id,
        ...formData,
      });

      if (result.success) {
        setMessage({ type: "success", text: "Profile updated successfully." });
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to update profile." });
      }
    });
  };

  const onSaveNotes = () => {
    setNotesMessage(null);
    startTransition(async () => {
      const result = await saveProfileLeaderNotes({ playerId: profile.id, leaderNotes });
      if (result.success) {
        setNotesMessage({ type: "success", text: "Leader notes saved." });
        router.refresh();
      } else {
        setNotesMessage({ type: "error", text: result.error || "Failed to save leader notes." });
      }
    });
  };

  return (
    <div className="flex-col gap-5">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "1rem" }}>
        <SummaryCard label="Alliance Rank" value={`#${profile.rank}`} accent="var(--accent-neon)" />
        <SummaryCard label="Current Score" value={Math.round(profile.latestScore).toLocaleString()} accent="var(--accent-purple)" />
        <SummaryCard label="Combat Power" value={combatPower.toLocaleString()} accent="var(--accent-neon)" />
        <SummaryCard label="Last Updated" value={formatDate(profile.updatedAt)} accent="#fff" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "1rem" }}>
        <section className="cyber-card flex-col gap-4">
          <div className="flex-row justify-between gap-4" style={{ alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ color: "var(--accent-neon)", marginBottom: "0.35rem" }}>{profile.name}</h3>
              <p style={{ color: "var(--text-muted)" }}>
                Review your standing, update stats, and keep your record current.
              </p>
            </div>
            {canBrowsePlayers && (
              <div className="flex-col gap-2" style={{ minWidth: "240px" }}>
                <label className="cyber-label">OPEN PLAYER PROFILE</label>
                <select className="cyber-input" value={profile.name} onChange={(e) => router.replace(`/?view=profile&name=${encodeURIComponent(e.target.value)}`)}>
                  {availablePlayers.map((playerName) => (
                    <option key={playerName} value={playerName}>{playerName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.85rem" }}>
            <ProfileMetric label="Readiness Role" value={formData.gloryWarStatus} accent="var(--accent-purple)" />
            <ProfileMetric label="Today Duel Score" value={profile.todayDuelScore ? profile.todayDuelScore.toLocaleString() : "Missing"} accent="var(--accent-neon)" />
            <ProfileMetric label="Today Duel Rank" value={profile.todayDuelRank ? `#${profile.todayDuelRank}` : "Missing"} accent="#fff" />
            <ProfileMetric label="Today Compliance" value={profile.duelCompliance} accent={profile.duelCompliance === "Met" ? "var(--accent-neon)" : profile.duelCompliance === "Below Requirement" ? "var(--accent-red)" : "#fff"} />
          </div>

          {missingFields.length > 0 && (
            <div style={warningStyle}>
              <AlertTriangle size={16} />
              Missing or zero-value fields detected: {missingFields.join(", ")}.
            </div>
          )}
        </section>

        <section className="cyber-card flex-col gap-4">
          <h3 style={{ color: "var(--accent-purple)" }}>Recent Snapshot History</h3>
          {profile.snapshots.length === 0 ? (
            <div style={{ color: "var(--text-muted)" }}>No snapshot history yet.</div>
          ) : (
            <div style={{ backgroundColor: "var(--bg-input)", borderRadius: "6px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ backgroundColor: "var(--bg-dark)" }}>
                  <tr>
                    <th style={thStyle}>Captured</th>
                    <th style={thStyle}>Score</th>
                    <th style={thStyle}>Power</th>
                    <th style={thStyle}>Kills</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.snapshots.map((snapshot) => (
                    <tr key={snapshot.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={tdStyle}>{formatDate(snapshot.createdAt)}</td>
                      <td style={tdStyle}>{Math.round(snapshot.score).toLocaleString()}</td>
                      <td style={tdStyle}>{snapshot.totalPower.toLocaleString()}</td>
                      <td style={tdStyle}>{snapshot.kills.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "1rem" }}>
        <section className="cyber-card flex-col gap-4">
          <h3 style={{ color: "var(--accent-neon)" }}>Profile Controls</h3>
          {message && <div style={messageStyle(message.type)}>{message.text}</div>}
          <div style={formGridStyle}>
            <Field label="Player Name"><input className="cyber-input" value={formData.name} disabled={!canEditProfile} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} /></Field>
            <Field label="Glory War Role">
              <select className="cyber-input" value={formData.gloryWarStatus} disabled={!canEditProfile} onChange={(e) => setFormData((prev) => ({ ...prev, gloryWarStatus: e.target.value }))}>
                <option value="Offline">Offline</option>
                <option value="Attacker">Attacker</option>
                <option value="Defender">Defender</option>
              </select>
            </Field>
            <Field label="Total Power"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.totalPower} onChange={(e) => setFormData((prev) => ({ ...prev, totalPower: Number(e.target.value) || 0 }))} /></Field>
            <Field label="Kills"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.kills} onChange={(e) => setFormData((prev) => ({ ...prev, kills: Number(e.target.value) || 0 }))} /></Field>
            <Field label="Tech Power"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.techPower} onChange={(e) => setFormData((prev) => ({ ...prev, techPower: Number(e.target.value) || 0 }))} /></Field>
            <Field label="Hero Power"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.heroPower} onChange={(e) => setFormData((prev) => ({ ...prev, heroPower: Number(e.target.value) || 0 }))} /></Field>
            <Field label="Troop Power"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.troopPower} onChange={(e) => setFormData((prev) => ({ ...prev, troopPower: Number(e.target.value) || 0 }))} /></Field>
            <Field label="Mod Vehicle Power"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.modVehiclePower} onChange={(e) => setFormData((prev) => ({ ...prev, modVehiclePower: Number(e.target.value) || 0 }))} /></Field>
            <Field label="Structure Power"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.structurePower} onChange={(e) => setFormData((prev) => ({ ...prev, structurePower: Number(e.target.value) || 0 }))} /></Field>
            <Field label="March 1"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.march1Power} onChange={(e) => setFormData((prev) => ({ ...prev, march1Power: Number(e.target.value) || 0 }))} /></Field>
            <Field label="March 2"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.march2Power} onChange={(e) => setFormData((prev) => ({ ...prev, march2Power: Number(e.target.value) || 0 }))} /></Field>
            <Field label="March 3"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.march3Power} onChange={(e) => setFormData((prev) => ({ ...prev, march3Power: Number(e.target.value) || 0 }))} /></Field>
            <Field label="March 4"><input className="cyber-input" type="number" disabled={!canEditProfile} value={formData.march4Power} onChange={(e) => setFormData((prev) => ({ ...prev, march4Power: Number(e.target.value) || 0 }))} /></Field>
            <Field label="Combat Power"><input className="cyber-input" value={combatPower.toLocaleString()} disabled /></Field>
          </div>
          {canEditProfile && (
            <div className="flex-row justify-end">
              <button className="cyber-button primary" onClick={onSaveProfile} disabled={isPending}>{isPending ? "UPDATING..." : "SAVE PROFILE"}</button>
            </div>
          )}
        </section>

        <div className="flex-col gap-4">
          {canEditProfile && <OcrUploader initialName={profile.name} lockName />}
          {canManageNotes && (
            <section className="cyber-card flex-col gap-4">
              <h3 style={{ color: "var(--accent-purple)" }}>Leader Notes</h3>
              {notesMessage && <div style={messageStyle(notesMessage.type)}>{notesMessage.text}</div>}
              <textarea className="cyber-input" value={leaderNotes} onChange={(e) => setLeaderNotes(e.target.value)} rows={8} placeholder="Visible to leaders and admins only." style={{ resize: "vertical" }} />
              <div className="flex-row justify-end">
                <button className="cyber-button" onClick={onSaveNotes} disabled={isPending}>{isPending ? "SAVING..." : "SAVE NOTES"}</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="cyber-card">
      <div style={miniLabelStyle}>{label}</div>
      <div style={{ marginTop: "0.5rem", color: accent, fontSize: "1.5rem", fontWeight: 800, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}

function ProfileMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ backgroundColor: "var(--bg-input)", borderRadius: "6px", padding: "0.9rem", border: "1px solid var(--border-subtle)" }}>
      <div style={miniLabelStyle}>{label}</div>
      <div style={{ marginTop: "0.35rem", color: accent, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-col gap-2">
      <label className="cyber-label">{label}</label>
      {children}
    </div>
  );
}

const warningStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.85rem 1rem",
  borderRadius: "6px",
  border: "1px solid var(--accent-red)",
  backgroundColor: "rgba(255, 51, 102, 0.08)",
  color: "var(--accent-red)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.85rem",
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "1rem",
};

const miniLabelStyle: React.CSSProperties = {
  fontSize: "0.68rem",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

const thStyle: React.CSSProperties = {
  padding: "0.75rem",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.72rem",
  textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "0.75rem",
  fontSize: "0.85rem",
};

const messageStyle = (type: "success" | "error"): React.CSSProperties => ({
  padding: "0.85rem 1rem",
  borderRadius: "4px",
  border: `1px solid ${type === "success" ? "var(--accent-neon)" : "var(--accent-red)"}`,
  backgroundColor: type === "success" ? "rgba(0,255,157,0.08)" : "rgba(255,51,102,0.08)",
  color: type === "success" ? "var(--accent-neon)" : "var(--accent-red)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.85rem",
});
