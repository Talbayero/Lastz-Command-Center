"use client";

import { useMemo, useState, useTransition } from "react";
import Tesseract from "tesseract.js";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import {
  ALLIANCE_DUEL_DAYS,
  type AllianceDuelDayKey,
  type AllianceDuelScoreType,
} from "@/utils/allianceDuel";
import {
  saveAllianceDuelManualScore,
  saveAllianceDuelParsedEntries,
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
type UnmatchedDuelEntry = {
  name: string;
  score: number;
  rank: number | null;
};
type MatchDraftState = Record<string, string>;
type UploadReviewEntry = {
  detectedName: string;
  matchedPlayerId: string | null;
  matchedPlayerName: string | null;
  score: number;
  rank: number | null;
};

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
  const [unmatchedEntries, setUnmatchedEntries] = useState<UnmatchedDuelEntry[]>([]);
  const [matchDrafts, setMatchDrafts] = useState<MatchDraftState>({});
  const [uploadReviewEntries, setUploadReviewEntries] = useState<UploadReviewEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

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

  const applyMatchedScreenshotEntry = (entry: UnmatchedDuelEntry) => {
    const playerId = matchDrafts[getUnmatchedEntryKey(entry)];
    if (!playerId) {
      setMessage({ type: "error", text: `Choose a player for ${entry.name} first.` });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await saveAllianceDuelManualScore({
        playerId,
        scoreType: activeScoreType,
        dayKey: activeScoreType === "daily" ? activeDayKey : undefined,
        score: entry.score,
        rank: entry.rank,
      });

      if (!result.success) {
        setMessage({ type: "error", text: result.error || "Failed to apply matched duel score." });
        return;
      }

      const nextPlayers = applyUpdatedPlayers(players, [
        {
          playerId,
          score: entry.score,
          rank: entry.rank,
        },
      ]);
      setPlayers(nextPlayers);
      setManualDrafts(buildManualDrafts(nextPlayers, activeScoreType, activeDayKey));
      setUnmatchedEntries((prev) => prev.filter((candidate) => getUnmatchedEntryKey(candidate) !== getUnmatchedEntryKey(entry)));
      setMatchDrafts((prev) => {
        const next = { ...prev };
        delete next[getUnmatchedEntryKey(entry)];
        return next;
      });
      setMessage({ type: "success", text: `Matched ${entry.name} to the selected player.` });
    });
  };

  const applyReviewedEntry = (entry: UploadReviewEntry) => {
    const playerId = matchDrafts[getReviewEntryKey(entry)];
    if (!playerId) {
      setMessage({ type: "error", text: `Choose a player for ${entry.detectedName} first.` });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await saveAllianceDuelManualScore({
        playerId,
        scoreType: activeScoreType,
        dayKey: activeScoreType === "daily" ? activeDayKey : undefined,
        score: entry.score,
        rank: entry.rank,
      });

      if (!result.success) {
        setMessage({ type: "error", text: result.error || "Failed to apply reviewed duel score." });
        return;
      }

      const nextPlayers = applyUpdatedPlayers(players, [
        {
          playerId,
          score: entry.score,
          rank: entry.rank,
        },
      ]);
      setPlayers(nextPlayers);
      setManualDrafts(buildManualDrafts(nextPlayers, activeScoreType, activeDayKey));
      setUploadReviewEntries((prev) => prev.filter((candidate) => getReviewEntryKey(candidate) !== getReviewEntryKey(entry)));
      setMatchDrafts((prev) => {
        const next = { ...prev };
        delete next[getReviewEntryKey(entry)];
        return next;
      });
      setMessage({ type: "success", text: `Applied ${entry.detectedName} to the selected player.` });
    });
  };

  const applyUpdatedPlayers = (
    currentPlayers: DuelPlayer[],
    updatedPlayers: Array<{ playerId: string; score: number; rank: number | null }>
  ) =>
    currentPlayers.map((player) => {
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
    });

  const uploadScreenshots = async (files: FileList | File[]) => {
    setMessage(null);

    const fileList = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (fileList.length === 0) {
      setMessage({ type: "error", text: "Select at least one image to upload." });
      return;
    }

    setIsUploading(true);
    try {
      let nextPlayers = players;
      let totalAppliedCount = 0;
      const unmatchedNames = new Set<string>();
      const nextUnmatchedEntries: UnmatchedDuelEntry[] = [];
      const nextReviewEntries: UploadReviewEntry[] = [];

      for (const file of fileList) {
        const optimizedBlob = await optimizeUploadImage(file);
        const parsedEntries = await parseAllianceDuelImageLocally(optimizedBlob);
        if (parsedEntries.length === 0) {
          setMessage({
            type: "error",
            text:
              fileList.length > 1
                ? `Stopped on ${file.name}: OCR could not detect any duel rows. Try a clearer screenshot.`
                : "OCR could not detect any duel rows. Try a clearer screenshot.",
          });
          return;
        }
        const result = await withTimeout(
          saveAllianceDuelParsedEntries({
            scoreType: activeScoreType,
            dayKey: activeScoreType === "daily" ? activeDayKey : undefined,
            entries: parsedEntries,
          }),
          45000,
          `Saving timed out on ${file.name}. Try again in a moment.`
        );

        if (!result.success) {
          setMessage({
            type: "error",
            text:
              fileList.length > 1
                ? `Stopped on ${file.name}: ${result.error || "Failed to process screenshot."}`
                : result.error || "Failed to process screenshot.",
          });
          return;
        }

        totalAppliedCount += result.appliedCount ?? 0;
        for (const name of result.unmatchedNames ?? []) {
          unmatchedNames.add(name);
        }
        for (const entry of result.unmatchedEntries ?? []) {
          nextUnmatchedEntries.push(entry);
        }
        for (const entry of result.reviewEntries ?? []) {
          nextReviewEntries.push(entry);
        }

        nextPlayers = applyUpdatedPlayers(nextPlayers, result.updatedPlayers ?? []);
      }

      setPlayers(nextPlayers);
      setManualDrafts(buildManualDrafts(nextPlayers, activeScoreType, activeDayKey));
      setUnmatchedEntries(nextUnmatchedEntries);
      setUploadReviewEntries(nextReviewEntries);
      setMatchDrafts(
        [
          ...nextUnmatchedEntries.map((entry) => ({
            key: getUnmatchedEntryKey(entry),
            playerId: "",
          })),
          ...nextReviewEntries.map((entry) => ({
            key: getReviewEntryKey(entry),
            playerId: entry.matchedPlayerId ?? "",
          })),
        ].reduce<MatchDraftState>((acc, entry) => {
          acc[entry.key] = entry.playerId;
          return acc;
        }, {})
      );
      setMessage({
        type: "success",
        text:
          unmatchedNames.size > 0
            ? `Updated ${totalAppliedCount} players from ${fileList.length} screenshot${fileList.length === 1 ? "" : "s"}. Unmatched: ${Array.from(unmatchedNames).join(", ")}`
            : `Updated ${totalAppliedCount} players from ${fileList.length} screenshot${fileList.length === 1 ? "" : "s"}.`,
      });
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Upload failed." });
    } finally {
      setIsUploading(false);
      setIsDragging(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      void uploadScreenshots(files);
    }
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

      <div className="duel-main-grid">
        <section className="cyber-card flex-col gap-4">
          <h3 style={{ color: "var(--accent-purple)" }}>Alliance Requirements</h3>
          <div className="flex-col gap-3">
            {ALLIANCE_DUEL_DAYS.map((dayKey) => {
              const requirement = requirementDraft[dayKey];
              return (
                <div key={dayKey} style={requirementRowStyle}>
                  <div style={{ minWidth: "76px" }}>
                    <div style={summaryLabelStyle}>{dayKey}</div>
                    <div style={{ color: "var(--text-main)", fontWeight: 700, fontSize: "0.95rem" }}>{requirement.eventName}</div>
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
                        style={{ minWidth: "180px", flex: 1 }}
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
                        style={{ width: "120px" }}
                      />
                      <button className="cyber-button" onClick={() => saveRequirement(dayKey)} disabled={isPending} style={{ minWidth: "78px" }}>
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
            <label
              style={{
                ...uploadDropzoneStyle,
                borderColor: isDragging ? "var(--accent-neon)" : "var(--border-subtle)",
                backgroundColor: isDragging ? "rgba(0,255,157,0.06)" : "transparent",
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!isUploading) {
                  setIsDragging(true);
                }
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
            >
              {isUploading ? (
                <div className="flex-col gap-3" style={{ alignItems: "center" }}>
                  <Loader2 className="animate-spin" size={26} style={{ color: "var(--accent-neon)" }} />
                  <span style={{ color: "var(--accent-neon)", fontFamily: "var(--font-mono)" }}>Processing screenshot...</span>
                </div>
              ) : (
                <div className="flex-col gap-3" style={{ alignItems: "center" }}>
                  <Upload size={28} style={{ color: "var(--text-muted)" }} />
                  <span>Click or drag alliance duel screenshots here</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                disabled={isUploading}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    void uploadScreenshots(files);
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

      {canManage && unmatchedEntries.length > 0 && (
        <section className="cyber-card flex-col gap-4">
          <h3 style={{ color: "var(--accent-purple)" }}>Match Uploaded Players</h3>
          <p style={summaryHintStyle}>
            These screenshot rows could not be matched automatically. Pick the correct BOM player and apply the uploaded score.
          </p>
          <div className="flex-col gap-3">
            {unmatchedEntries.map((entry) => (
              <div key={getUnmatchedEntryKey(entry)} style={requirementRowStyle}>
                <div style={{ minWidth: "170px" }}>
                  <div style={summaryLabelStyle}>Uploaded Name</div>
                  <div style={{ color: "var(--text-main)", fontWeight: 700 }}>{entry.name}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                    Score {entry.score.toLocaleString()} {entry.rank ? `| Rank #${entry.rank}` : ""}
                  </div>
                </div>
                <select
                  className="cyber-input"
                  value={matchDrafts[getUnmatchedEntryKey(entry)] ?? ""}
                  onChange={(e) =>
                    setMatchDrafts((prev) => ({
                      ...prev,
                      [getUnmatchedEntryKey(entry)]: e.target.value,
                    }))
                  }
                  style={{ minWidth: "220px", flex: 1 }}
                >
                  <option value="">Select BOM player...</option>
                  {players
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                </select>
                <button className="cyber-button" onClick={() => applyMatchedScreenshotEntry(entry)} disabled={isPending}>
                  APPLY
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {canManage && uploadReviewEntries.length > 0 && (
        <section className="cyber-card flex-col gap-4">
          <h3 style={{ color: "var(--accent-neon)" }}>Review Uploaded Scores</h3>
          <p style={summaryHintStyle}>
            Every parsed screenshot row appears here so you can confirm the player-score match and correct it when needed.
          </p>
          <div className="flex-col gap-3">
            {uploadReviewEntries.map((entry) => (
              <div key={getReviewEntryKey(entry)} style={requirementRowStyle}>
                <div style={{ minWidth: "180px" }}>
                  <div style={summaryLabelStyle}>Detected Row</div>
                  <div style={{ color: "var(--text-main)", fontWeight: 700 }}>{entry.detectedName}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                    Score {entry.score.toLocaleString()} {entry.rank ? `| Rank #${entry.rank}` : ""}
                  </div>
                </div>
                <select
                  className="cyber-input"
                  value={matchDrafts[getReviewEntryKey(entry)] ?? entry.matchedPlayerId ?? ""}
                  onChange={(e) =>
                    setMatchDrafts((prev) => ({
                      ...prev,
                      [getReviewEntryKey(entry)]: e.target.value,
                    }))
                  }
                  style={{ minWidth: "220px", flex: 1 }}
                >
                  <option value="">Select BOM player...</option>
                  {players
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                </select>
                <button className="cyber-button" onClick={() => applyReviewedEntry(entry)} disabled={isPending}>
                  APPLY
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

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

function getUnmatchedEntryKey(entry: UnmatchedDuelEntry) {
  return `${entry.name}::${entry.score}::${entry.rank ?? "na"}`;
}

function getReviewEntryKey(entry: UploadReviewEntry) {
  return `${entry.detectedName}::${entry.score}::${entry.rank ?? "na"}::${entry.matchedPlayerId ?? "none"}`;
}

async function optimizeUploadImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cropX = Math.round(img.width * 0.03);
      const cropY = Math.round(img.height * 0.08);
      const cropWidth = Math.round(img.width * 0.94);
      const cropHeight = Math.round(img.height * 0.84);

      const maxWidth = 1400;
      const maxHeight = 2200;
      const scale = Math.min(maxWidth / cropWidth, maxHeight / cropHeight, 1.6);
      const width = Math.max(1, Math.round(cropWidth * scale));
      const height = Math.max(1, Math.round(cropHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);

      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        "image/png"
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

async function parseAllianceDuelImageLocally(blob: Blob) {
  const [normalDataUrl, enhancedDataUrl] = await Promise.all([
    blobToDataUrl(blob),
    preprocessDuelImageForOcr(blob),
  ]);

  const passes = await Promise.all([
    recognizeDuelRows(normalDataUrl),
    recognizeDuelRows(enhancedDataUrl),
  ]);

  return dedupeLocalEntries(passes.flat());
}

async function recognizeDuelRows(dataUrl: string) {
  const result = await Tesseract.recognize(dataUrl, "eng", {
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
  } as any);
  const ocrWords = (result.data as any)?.words;
  const words: any[] = Array.isArray(ocrWords) ? ocrWords : [];

  const groupedRows = groupWordsIntoRows(
    words
      .map((word) => ({
        text: String(word.text ?? "").trim(),
        x0: Number(word.bbox?.x0 ?? 0),
        y0: Number(word.bbox?.y0 ?? 0),
        y1: Number(word.bbox?.y1 ?? 0),
      }))
      .filter((word) => word.text)
  );

  return groupedRows
    .map(parseOcrRow)
    .filter((entry): entry is { name: string; rank: number | null; score: number } => Boolean(entry && entry.name && entry.score > 0));
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not encode image"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

async function preprocessDuelImageForOcr(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not prepare OCR image"));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const contrast = gray > 160 ? 255 : gray > 100 ? 210 : 25;
        data[i] = contrast;
        data[i + 1] = contrast;
        data[i + 2] = contrast;
        data[i + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Could not prepare OCR image"));
    img.src = URL.createObjectURL(blob);
  });
}

function groupWordsIntoRows(words: Array<{ text: string; x0: number; y0: number; y1: number }>) {
  const sorted = words.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const rows: Array<Array<{ text: string; x0: number; y0: number; y1: number }>> = [];

  for (const word of sorted) {
    const targetRow = rows.find((row) => {
      const rowCenter = average(row.map((entry) => (entry.y0 + entry.y1) / 2));
      const wordCenter = (word.y0 + word.y1) / 2;
      return Math.abs(rowCenter - wordCenter) <= 24;
    });

    if (targetRow) {
      targetRow.push(word);
    } else {
      rows.push([word]);
    }
  }

  return rows.map((row) => row.sort((a, b) => a.x0 - b.x0));
}

function parseOcrRow(row: Array<{ text: string; x0: number; y0: number; y1: number }>) {
  const scoreToken = [...row]
    .reverse()
    .find((entry) => /\d[\d,._]{4,}/.test(entry.text) || /^\d{5,}$/.test(entry.text.replace(/[^\d]/g, "")));
  const score = normalizeLocalScore(scoreToken?.text ?? "");
  if (score <= 0) return null;

  const rankToken = row.find((entry) => /^\d{1,3}$/.test(entry.text.replace(/[^\d]/g, "")));
  const rank = normalizeLocalRank(rankToken?.text ?? "");

  const filteredNameParts = row
    .filter((entry) => {
      const text = entry.text;
      const digits = text.replace(/[^\d]/g, "");
      if (digits.length >= 4) return false;
      if (/^\[.*\]$/.test(text)) return false;
      if (/rank|ranking|daily|weekly|alliance|misfits|band/i.test(text)) return false;
      return /[a-zA-Z]/.test(text);
    })
    .map((entry) => entry.text.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);

  const name = filteredNameParts.join(" ").trim();
  if (!name || name.length < 3) return null;

  return { name, rank, score };
}

function dedupeLocalEntries(entries: Array<{ name: string; rank: number | null; score: number }>) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.name.toLowerCase().replace(/[^a-z0-9]/g, "")}::${entry.score}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeLocalScore(value: unknown) {
  const digitsOnly = String(value ?? "").replace(/[^\d]/g, "");
  return digitsOnly ? Number(digitsOnly) : 0;
}

function normalizeLocalRank(value: unknown) {
  const digitsOnly = String(value ?? "").replace(/[^\d]/g, "");
  return digitsOnly ? Number(digitsOnly) : null;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
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

const requirementRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.7rem 0.85rem",
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(message));
      }, timeoutMs);
    }),
  ]);
}
