"use client";

import { useMemo, useState, useTransition } from "react";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import {
  ALLIANCE_DUEL_DAYS,
  type AllianceDuelDayKey,
  type AllianceDuelScoreType,
} from "@/utils/allianceDuel";
import {
  processAllianceDuelScreenshot,
  saveAllianceDuelManualScore,
  saveAllianceDuelRequirement,
} from "@/app/actions/allianceDuel";

type DuelEntry = {
  score: number;
  rank: number | null;
};

type DuelPlayer = {
  id: string;
  name: string;
  scores: {
    daily: Record<string, DuelEntry | null>;
    weekly: DuelEntry | null;
    overall: DuelEntry | null;
  };
};

type DuelRequirement = {
  dayKey: AllianceDuelDayKey;
  eventName: string;
  minimumScore: number;
};

type ManualDraftState = Record<string, { score: number; rank: string }>;

const scoreTypeLabels: Record<AllianceDuelScoreType, string> = {
  daily: "Daily Rank",
  weekly: "Weekly Rank",
  overall: "Ranking",
};

export default function AllianceDuelPanel({
  initialPlayers,
  initialRequirements,
  canManage,
}: {
  initialPlayers: DuelPlayer[];
  initialRequirements: DuelRequirement[];
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [players, setPlayers] = useState(initialPlayers);
  const [requirements, setRequirements] = useState(initialRequirements);
  const [activeScoreType, setActiveScoreType] = useState<AllianceDuelScoreType>("daily");
  const [activeDayKey, setActiveDayKey] = useState<AllianceDuelDayKey>("Mon");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [manualDrafts, setManualDrafts] = useState<ManualDraftState>(() => buildManualDrafts(initialPlayers, "daily", "Mon"));
  const [requirementDraft, setRequirementDraft] = useState<Record<AllianceDuelDayKey, DuelRequirement>>(() =>
    requirementsToMap(initialRequirements)
  );

  const activeRequirement = requirementDraft[activeDayKey];
  const activePlayers = useMemo(() => {
    const entries = players.map((player) => {
      const duelEntry =
        activeScoreType === "daily"
          ? player.scores.daily[activeDayKey] ?? null
          : player.scores[activeScoreType];

      return {
        ...player,
        duelEntry,
        compliance:
          activeScoreType !== "daily"
            ? "N/A"
            : !duelEntry
              ? "Missing Data"
              : duelEntry.score >= activeRequirement.minimumScore
                ? "Met"
                : "Below Requirement",
      };
    });

    return entries.sort((a, b) => {
      if (a.duelEntry && !b.duelEntry) return -1;
      if (!a.duelEntry && b.duelEntry) return 1;
      return (b.duelEntry?.score ?? 0) - (a.duelEntry?.score ?? 0);
    });
  }, [players, activeScoreType, activeDayKey, activeRequirement.minimumScore]);

  const summary = useMemo(() => {
    if (activeScoreType !== "daily") {
      return {
        met: 0,
        below: 0,
        missing: activePlayers.filter((player) => !player.duelEntry).length,
      };
    }

    return activePlayers.reduce(
      (acc, player) => {
        if (player.compliance === "Met") acc.met += 1;
        else if (player.compliance === "Below Requirement") acc.below += 1;
        else acc.missing += 1;
        return acc;
      },
      { met: 0, below: 0, missing: 0 }
    );
  }, [activePlayers, activeScoreType]);

  const handleScopeChange = (scoreType: AllianceDuelScoreType, dayKey: AllianceDuelDayKey) => {
    setActiveScoreType(scoreType);
    setActiveDayKey(dayKey);
    setManualDrafts(buildManualDrafts(players, scoreType, dayKey));
  };

  const updateDraft = (playerId: string, field: "score" | "rank", value: string) => {
    setManualDrafts((prev) => ({
      ...prev,
      [playerId]: {
        score: field === "score" ? Number(value.replace(/[^\d]/g, "")) || 0 : prev[playerId]?.score ?? 0,
        rank: field === "rank" ? value.replace(/[^\d]/g, "") : prev[playerId]?.rank ?? "",
      },
    }));
  };

  const saveRequirement = (dayKey: AllianceDuelDayKey) => {
    const requirement = requirementDraft[dayKey];
    setMessage(null);
    startTransition(async () => {
      const result = await saveAllianceDuelRequirement(requirement);
      if (result.success) {
        setRequirements((prev) => prev.map((entry) => (entry.dayKey === dayKey ? requirement : entry)));
        setMessage({ type: "success", text: `${dayKey} requirement saved.` });
      } else {
        setMessage({ type: "error", text: result.error || "Failed to save requirement." });
      }
    });
  };

  const saveManualScore = (playerId: string) => {
    const draft = manualDrafts[playerId];
    if (!draft) return;

    setMessage(null);
    startTransition(async () => {
      const result = await saveAllianceDuelManualScore({
        playerId,
        scoreType: activeScoreType,
        dayKey: activeScoreType === "daily" ? activeDayKey : undefined,
        score: draft.score,
        rank: draft.rank ? Number(draft.rank) : null,
      });

      if (result.success) {
        setPlayers((prev) =>
          prev.map((player) =>
            player.id === playerId
              ? {
                  ...player,
                  scores: {
                    ...player.scores,
                    [activeScoreType]:
                      activeScoreType === "daily"
                        ? {
                            ...player.scores.daily,
                            [activeDayKey]: {
                              score: draft.score,
                              rank: draft.rank ? Number(draft.rank) : null,
                            },
                          }
                        : {
                            score: draft.score,
                            rank: draft.rank ? Number(draft.rank) : null,
                          },
                  },
                }
              : player
          )
        );
        setMessage({ type: "success", text: "Alliance duel score saved." });
      } else {
        setMessage({ type: "error", text: result.error || "Failed to save duel score." });
      }
    });
  };

  const uploadScreenshot = async (file: File) => {
    setMessage(null);
    const imageBase64 = await fileToBase64(file);
    startTransition(async () => {
      const result = await processAllianceDuelScreenshot({
        imageBase64,
        mimeType: file.type || "image/png",
        scoreType: activeScoreType,
        dayKey: activeScoreType === "daily" ? activeDayKey : undefined,
      });

      if (!result.success) {
        setMessage({ type: "error", text: result.error || "Failed to process screenshot." });
        return;
      }

      const updatedPlayers = result.updatedPlayers ?? [];
      const unmatchedNames = result.unmatchedNames ?? [];

      setPlayers((prev) =>
        prev.map((player) => {
          const updated = updatedPlayers.find((entry) => entry.playerId === player.id);
          if (!updated) return player;

          return {
            ...player,
            scores: {
              ...player.scores,
              [activeScoreType]:
                activeScoreType === "daily"
                  ? {
                      ...player.scores.daily,
                      [activeDayKey]: {
                        score: updated.score,
                        rank: updated.rank,
                      },
                    }
                  : {
                      score: updated.score,
                      rank: updated.rank,
                    },
            },
          };
        })
      );

      setManualDrafts(buildManualDrafts(
        players.map((player) => {
          const updated = updatedPlayers.find((entry) => entry.playerId === player.id);
          if (!updated) return player;

          return {
            ...player,
            scores: {
              ...player.scores,
              [activeScoreType]:
                activeScoreType === "daily"
                  ? {
                      ...player.scores.daily,
                      [activeDayKey]: {
                        score: updated.score,
                        rank: updated.rank,
                      },
                    }
                  : {
                      score: updated.score,
                      rank: updated.rank,
                    },
            },
          };
        }),
        activeScoreType,
        activeDayKey
      ));

      setMessage({
        type: "success",
        text:
          unmatchedNames.length > 0
            ? `Updated ${result.appliedCount} players. Unmatched: ${unmatchedNames.join(", ")}`
            : `Updated ${result.appliedCount} players from screenshot.`,
      });
    });
  };

  return (
    <div className="flex-col gap-5">
      {message && <div style={messageStyle(message.type)}>{message.text}</div>}

      <div style={scopeTabContainerStyle}>
        {(["daily", "weekly", "overall"] as AllianceDuelScoreType[]).map((scoreType) => (
          <button
            key={scoreType}
            type="button"
            className={`cyber-button ${activeScoreType === scoreType ? "primary" : ""}`}
            onClick={() => handleScopeChange(scoreType, activeDayKey)}
            style={scopeTabStyle}
          >
            {scoreTypeLabels[scoreType]}
          </button>
        ))}
      </div>

      {activeScoreType === "daily" && (
        <div style={dayTabContainerStyle}>
          {ALLIANCE_DUEL_DAYS.map((dayKey) => (
            <button
              key={dayKey}
              type="button"
              className={`cyber-button ${activeDayKey === dayKey ? "primary" : ""}`}
              onClick={() => handleScopeChange("daily", dayKey)}
              style={dayTabStyle}
            >
              {dayKey}
            </button>
          ))}
        </div>
      )}

      <div style={summaryGridStyle}>
        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>Current Scope</div>
          <div style={{ ...summaryValueStyle, color: "var(--accent-neon)" }}>
            {activeScoreType === "daily" ? `${activeDayKey} Daily Rank` : scoreTypeLabels[activeScoreType]}
          </div>
        </div>

        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>Requirement</div>
          <div style={{ ...summaryValueStyle, color: "var(--accent-purple)" }}>
            {activeScoreType === "daily" ? activeRequirement.minimumScore.toLocaleString() : "Daily Only"}
          </div>
          <div style={summaryHintStyle}>
            {activeScoreType === "daily" ? activeRequirement.eventName : "Use Daily Rank to review requirement compliance."}
          </div>
        </div>

        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>Met</div>
          <div style={{ ...summaryValueStyle, color: "var(--accent-neon)" }}>{summary.met}</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>Below</div>
          <div style={{ ...summaryValueStyle, color: "var(--accent-red)" }}>{summary.below}</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>Missing</div>
          <div style={{ ...summaryValueStyle, color: "#fff" }}>{summary.missing}</div>
        </div>
      </div>

      <div style={twoColumnGridStyle}>
        <section className="cyber-card flex-col gap-4">
          <h3 style={{ color: "var(--accent-purple)" }}>Alliance Requirements</h3>
          <div className="flex-col gap-3">
            {ALLIANCE_DUEL_DAYS.map((dayKey) => {
              const requirement = requirementDraft[dayKey];
              return (
                <div key={dayKey} style={requirementRowStyle}>
                  <div style={{ minWidth: "80px" }}>
                    <div style={summaryLabelStyle}>{dayKey}</div>
                    <div style={{ color: "var(--text-main)", fontWeight: 700 }}>{requirement.eventName}</div>
                  </div>

                  {canManage ? (
                    <>
                      <input
                        className="cyber-input"
                        value={requirement.eventName}
                        onChange={(e) =>
                          setRequirementDraft((prev) => ({
                            ...prev,
                            [dayKey]: { ...prev[dayKey], eventName: e.target.value },
                          }))
                        }
                        style={{ minWidth: "220px" }}
                      />
                      <input
                        className="cyber-input"
                        type="number"
                        value={requirement.minimumScore}
                        onChange={(e) =>
                          setRequirementDraft((prev) => ({
                            ...prev,
                            [dayKey]: { ...prev[dayKey], minimumScore: Number(e.target.value) || 0 },
                          }))
                        }
                        style={{ width: "140px" }}
                      />
                      <button className="cyber-button" onClick={() => saveRequirement(dayKey)} disabled={isPending}>
                        SAVE
                      </button>
                    </>
                  ) : (
                    <div style={{ marginLeft: "auto", color: "var(--accent-neon)", fontFamily: "var(--font-mono)" }}>
                      {requirement.minimumScore.toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {canManage && (
          <section className="cyber-card flex-col gap-4">
            <h3 style={{ color: "var(--accent-neon)" }}>Upload Duel Screenshot</h3>
            <p style={summaryHintStyle}>
              Upload ranking screenshots for the current view. Only visible players are updated; missing players stay unchanged.
            </p>
            <label style={uploadDropzoneStyle}>
              {isPending ? (
                <div className="flex-col gap-3" style={{ alignItems: "center" }}>
                  <Loader2 className="animate-spin" size={26} style={{ color: "var(--accent-neon)" }} />
                  <span style={{ color: "var(--accent-neon)", fontFamily: "var(--font-mono)" }}>Processing screenshot...</span>
                </div>
              ) : (
                <div className="flex-col gap-3" style={{ alignItems: "center" }}>
                  <Upload size={28} style={{ color: "var(--text-muted)" }} />
                  <span>Click or drag alliance duel screenshot here</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void uploadScreenshot(file);
                  }
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontFamily: "var(--font-mono)" }}>
              Current upload target: {activeScoreType === "daily" ? `${activeDayKey} Daily Rank` : scoreTypeLabels[activeScoreType]}
            </div>
          </section>
        )}
      </div>

      <section className="cyber-card flex-col gap-4">
        <h3 style={{ color: "var(--accent-neon)" }}>Alliance Duel Table</h3>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead style={theadStyle}>
              <tr>
                <th style={thStyle}>Rank</th>
                <th style={thStyle}>Player</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Compliance</th>
                {canManage && <th style={thStyle}>Manual Update</th>}
              </tr>
            </thead>
            <tbody>
              {activePlayers.map((player, index) => {
                const draft = manualDrafts[player.id] ?? { score: player.duelEntry?.score ?? 0, rank: player.duelEntry?.rank ? String(player.duelEntry.rank) : "" };
                return (
                  <tr key={player.id} style={rowStyle(index)}>
                    <td style={tdStyle}>{player.duelEntry?.rank ?? "-"}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{player.name}</td>
                    <td style={tdStyle}>{player.duelEntry ? player.duelEntry.score.toLocaleString() : "Not Seen Yet"}</td>
                    <td style={tdStyle}>
                      <span style={compliancePillStyle(player.compliance)}>
                        {player.compliance}
                      </span>
                    </td>
                    {canManage && (
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            className="cyber-input"
                            type="number"
                            placeholder="Score"
                            value={draft.score}
                            onChange={(e) => updateDraft(player.id, "score", e.target.value)}
                            style={{ width: "130px" }}
                          />
                          <input
                            className="cyber-input"
                            type="text"
                            placeholder="Rank"
                            value={draft.rank}
                            onChange={(e) => updateDraft(player.id, "rank", e.target.value)}
                            style={{ width: "80px" }}
                          />
                          <button className="cyber-button" onClick={() => saveManualScore(player.id)} disabled={isPending}>
                            SAVE
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function buildManualDrafts(players: DuelPlayer[], scoreType: AllianceDuelScoreType, dayKey: AllianceDuelDayKey): ManualDraftState {
  return players.reduce<ManualDraftState>((acc, player) => {
    const entry = scoreType === "daily" ? player.scores.daily[dayKey] ?? null : player.scores[scoreType];
    acc[player.id] = {
      score: entry?.score ?? 0,
      rank: entry?.rank ? String(entry.rank) : "",
    };
    return acc;
  }, {});
}

function requirementsToMap(requirements: DuelRequirement[]) {
  return requirements.reduce<Record<AllianceDuelDayKey, DuelRequirement>>((acc, requirement) => {
    acc[requirement.dayKey] = requirement;
    return acc;
  }, {} as Record<AllianceDuelDayKey, DuelRequirement>);
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not encode image"));
        return;
      }
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

const scopeTabContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const scopeTabStyle: React.CSSProperties = {
  minWidth: "140px",
};

const dayTabContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const dayTabStyle: React.CSSProperties = {
  minWidth: "72px",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "1rem",
};

const summaryCardStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-input)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "6px",
  padding: "1rem",
};

const summaryLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.68rem",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const summaryValueStyle: React.CSSProperties = {
  marginTop: "0.5rem",
  fontSize: "1.5rem",
  fontWeight: 800,
  fontFamily: "var(--font-mono)",
};

const summaryHintStyle: React.CSSProperties = {
  marginTop: "0.45rem",
  color: "var(--text-muted)",
  fontSize: "0.82rem",
  lineHeight: 1.5,
};

const twoColumnGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.15fr 1fr",
  gap: "1rem",
};

const requirementRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.9rem",
  backgroundColor: "var(--bg-input)",
  borderRadius: "6px",
  border: "1px solid var(--border-subtle)",
  flexWrap: "wrap",
};

const uploadDropzoneStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "180px",
  border: "2px dashed var(--border-subtle)",
  borderRadius: "8px",
  cursor: "pointer",
  padding: "1rem",
  textAlign: "center",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  borderRadius: "6px",
  backgroundColor: "var(--bg-input)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "920px",
};

const theadStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-dark)",
  borderBottom: "1px solid var(--border-subtle)",
};

const thStyle: React.CSSProperties = {
  padding: "0.9rem 1rem",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "0.9rem 1rem",
  borderBottom: "1px solid var(--border-subtle)",
};

const rowStyle = (index: number): React.CSSProperties => ({
  backgroundColor: index % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
});

const compliancePillStyle = (status: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "0.28rem 0.6rem",
  borderRadius: "999px",
  fontFamily: "var(--font-mono)",
  fontSize: "0.72rem",
  border:
    status === "Met"
      ? "1px solid var(--accent-neon)"
      : status === "Below Requirement"
        ? "1px solid var(--accent-red)"
        : "1px solid var(--border-subtle)",
  color:
    status === "Met"
      ? "var(--accent-neon)"
      : status === "Below Requirement"
        ? "var(--accent-red)"
        : "var(--text-muted)",
});

const messageStyle = (type: "success" | "error"): React.CSSProperties => ({
  padding: "0.85rem 1rem",
  borderRadius: "4px",
  border: `1px solid ${type === "success" ? "var(--accent-neon)" : "var(--accent-red)"}`,
  backgroundColor: type === "success" ? "rgba(0,255,157,0.08)" : "rgba(255,51,102,0.08)",
  color: type === "success" ? "var(--accent-neon)" : "var(--accent-red)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.85rem",
});
