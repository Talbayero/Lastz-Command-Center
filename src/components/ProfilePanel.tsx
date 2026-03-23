"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle, Sparkles } from "lucide-react";
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

type AllianceAverage = {
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
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
  allianceAverage,
  availablePlayers,
  canEditProfile,
  canManageNotes,
  canBrowsePlayers,
}: {
  profile: ProfileData;
  allianceAverage: AllianceAverage;
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
  const improvementRecommendations = useMemo(() => {
    const recommendationPool = [
      {
        label: "Troop Power",
        current: formData.troopPower,
        average: allianceAverage.troopPower,
        suggestion: "Build troop power first to close the biggest frontline gap.",
      },
      {
        label: "Hero Power",
        current: formData.heroPower,
        average: allianceAverage.heroPower,
        suggestion: "Invest in heroes next to raise march quality and survivability.",
      },
      {
        label: "Tech Power",
        current: formData.techPower,
        average: allianceAverage.techPower,
        suggestion: "Push research upgrades to catch up with alliance tech benchmarks.",
      },
      {
        label: "Mod Vehicle Power",
        current: formData.modVehiclePower,
        average: allianceAverage.modVehiclePower,
        suggestion: "Upgrade mod vehicles to improve march efficiency and duel output.",
      },
      {
        label: "Structure Power",
        current: formData.structurePower,
        average: allianceAverage.structurePower,
        suggestion: "Strengthen structures to support long-term total power growth.",
      },
    ]
      .map((entry) => ({
        ...entry,
        rawGap: Math.round(entry.average - entry.current),
        gap: Math.max(0, Math.round(entry.average - entry.current)),
        percentBehind: entry.average > 0 ? ((entry.average - entry.current) / entry.average) * 100 : 0,
      }))
      .sort((a, b) => b.rawGap - a.rawGap);

    return recommendationPool.slice(0, 3);
  }, [
    allianceAverage.heroPower,
    allianceAverage.modVehiclePower,
    allianceAverage.structurePower,
    allianceAverage.techPower,
    allianceAverage.troopPower,
    formData.heroPower,
    formData.modVehiclePower,
    formData.structurePower,
    formData.techPower,
    formData.troopPower,
  ]);

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
      <div className="profile-top-grid">
        <SummaryCard label="Alliance Rank" value={`#${profile.rank}`} accent="var(--accent-neon)" />
        <SummaryCard label="Current Score" value={Math.round(profile.latestScore).toLocaleString()} accent="var(--accent-purple)" />
        <SummaryCard label="Combat Power" value={combatPower.toLocaleString()} accent="var(--accent-neon)" />
        <SummaryCard label="Last Updated" value={formatDate(profile.updatedAt)} accent="#fff" />
      </div>

      <div className="profile-main-grid">
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
            <div className="responsive-table" style={{ backgroundColor: "var(--bg-input)", borderRadius: "6px", overflow: "hidden" }}>
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

      <div className="profile-bottom-grid">
        <section className="cyber-card flex-col gap-4">
          <h3 style={{ color: "var(--accent-neon)" }}>Profile Controls</h3>
          {message && <div style={messageStyle(message.type)}>{message.text}</div>}
          <div className="profile-form-grid">
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
          <section className="cyber-card flex-col gap-4 mith-hologram-panel">
            <div className="flex-row justify-between gap-4" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ color: "var(--accent-purple)" }}>Mith Tactical Advisor</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>
                  Friendly co-pilot guidance based on your current gap versus the alliance average.
                </p>
              </div>
              <div className="mith-avatar-wrap" style={mithAvatarWrapStyle}>
                <div style={mithAvatarGlowStyle} />
                <div className="mith-hover-bubble" style={mithHoverBubbleStyle}>
                  Hello!
                </div>
                <div className="mith-avatar-core" style={mithAvatarStyle}>
                  <div className="mith-avatar-frame" style={mithImageFrameStyle}>
                    <Image
                      src="/mith-avatar-small.jpg"
                      alt="Mith hologram avatar"
                      fill
                      sizes="72px"
                      quality={75}
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                  <span style={{ fontSize: "0.68rem", letterSpacing: "0.12em" }}>MITH</span>
                </div>
              </div>
            </div>

            <div style={mithOverlayStyle}>
              <div style={mithStatusRowStyle}>
                <span style={mithPillStyle}>
                  <Sparkles size={12} />
                  CO-PILOT ONLINE
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontFamily: "var(--font-mono)" }}>
                  Hologram advisory layer
                </span>
              </div>

              {improvementRecommendations.length === 0 ? (
                <div style={mithBubbleStyle}>
                  You are holding strong across the tracked stats. Keep your uploads current and focus on maintaining consistency.
                </div>
              ) : (
                <div className="flex-col gap-3">
                  <div style={mithBubbleStyle}>
                    Primary focus: <strong>{improvementRecommendations[0].label}</strong>. That is your biggest gap against the alliance average right now.
                  </div>
                  {improvementRecommendations.map((entry, index) => (
                    <div key={entry.label} style={mithTipStyle}>
                      <div style={mithTipIndexStyle}>0{index + 1}</div>
                      <div className="flex-col gap-1">
                        <div style={{ color: "var(--text-main)", fontWeight: 700 }}>{entry.label}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.84rem" }}>
                          {entry.gap > 0 ? entry.suggestion : `You are already on pace here. Keep ${entry.label.toLowerCase()} stable while you push your weaker areas.`}
                        </div>
                        <div style={{ color: entry.gap > 0 ? "var(--accent-neon)" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                          {entry.gap > 0
                            ? `Gap: ${entry.gap.toLocaleString()} (${Math.max(0, Math.round(entry.percentBehind))}% below average)`
                            : "At or above alliance average"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

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

const mithAvatarWrapStyle: React.CSSProperties = {
  position: "relative",
  width: "90px",
  height: "90px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const mithAvatarGlowStyle: React.CSSProperties = {
  position: "absolute",
  inset: "10px",
  borderRadius: "50%",
  background:
    "radial-gradient(circle, rgba(0,255,204,0.35) 0%, rgba(0,255,204,0.08) 45%, rgba(176,38,255,0.18) 75%, transparent 100%)",
  filter: "blur(4px)",
};

const mithHoverBubbleStyle: React.CSSProperties = {
  position: "absolute",
  top: "-12px",
  left: "56px",
  zIndex: 2,
  padding: "0.3rem 0.55rem",
  borderRadius: "999px",
  border: "1px solid rgba(0,255,204,0.45)",
  background: "rgba(9, 20, 28, 0.92)",
  color: "var(--accent-neon)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.72rem",
  boxShadow: "0 0 16px rgba(0,255,204,0.18)",
  whiteSpace: "nowrap",
};

const mithAvatarStyle: React.CSSProperties = {
  position: "relative",
  width: "72px",
  height: "72px",
  borderRadius: "50%",
  border: "1px solid rgba(0,255,204,0.65)",
  background:
    "linear-gradient(180deg, rgba(0,255,204,0.14) 0%, rgba(176,38,255,0.16) 100%)",
  boxShadow: "0 0 18px rgba(0,255,204,0.22)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.2rem",
  color: "var(--accent-neon)",
  fontFamily: "var(--font-mono)",
  textTransform: "uppercase",
};

const mithImageFrameStyle: React.CSSProperties = {
  position: "relative",
  width: "46px",
  height: "46px",
  borderRadius: "50%",
  overflow: "hidden",
  border: "1px solid rgba(0,255,204,0.5)",
  background: "radial-gradient(circle, rgba(0,255,204,0.18) 0%, rgba(176,38,255,0.12) 100%)",
};

const mithOverlayStyle: React.CSSProperties = {
  position: "relative",
  padding: "1rem",
  borderRadius: "8px",
  border: "1px solid rgba(0,255,204,0.25)",
  background:
    "linear-gradient(180deg, rgba(0,255,204,0.06) 0%, rgba(176,38,255,0.08) 100%)",
  overflow: "hidden",
};

const mithStatusRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginBottom: "0.9rem",
};

const mithPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.35rem 0.65rem",
  borderRadius: "999px",
  border: "1px solid rgba(0,255,204,0.4)",
  color: "var(--accent-neon)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.72rem",
  letterSpacing: "0.08em",
};

const mithBubbleStyle: React.CSSProperties = {
  padding: "0.9rem 1rem",
  borderRadius: "8px",
  border: "1px solid rgba(0,255,204,0.2)",
  backgroundColor: "rgba(9, 20, 28, 0.72)",
  color: "var(--text-main)",
  lineHeight: 1.6,
};

const mithTipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.85rem",
  padding: "0.85rem 0.95rem",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.06)",
  backgroundColor: "rgba(20,20,23,0.75)",
};

const mithTipIndexStyle: React.CSSProperties = {
  minWidth: "34px",
  height: "34px",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(176,38,255,0.55)",
  color: "var(--accent-purple)",
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  fontSize: "0.78rem",
  boxShadow: "0 0 12px rgba(176,38,255,0.15)",
};
