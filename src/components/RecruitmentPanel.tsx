"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Tesseract from "tesseract.js";
import { LayoutGrid, Pencil, Table2, Upload, Trash2 } from "lucide-react";
import { parseLastZProfile } from "@/utils/ocrParser";
import { extractGeminiName } from "@/app/actions/extractGeminiName";
import {
  deleteApplicant,
  deleteMigrationCandidate,
  saveApplicant,
  saveMigrationCandidate,
} from "@/app/actions/recruitment";

type ApplicantRecord = {
  id: string;
  name: string;
  timezone: string;
  status: string;
  notes: string;
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
  combatPower: number;
  kills: number;
  manualAdjustment: number;
  createdAt: string;
  updatedAt: string;
};

type MigrationRecord = {
  id: string;
  name: string;
  originalServer: string;
  originalAlliance: string;
  reasonForLeaving: string;
  contactStatus: string;
  status: string;
  notes: string;
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
  combatPower: number;
  kills: number;
  manualAdjustment: number;
  createdAt: string;
  updatedAt: string;
};

type SharedDraft = {
  name: string;
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
  combatPower: number;
  kills: number;
  notes: string;
  manualAdjustment: number;
};

const applicantStatuses = ["New", "Reviewing", "Interview", "Approved", "Rejected"];
const migrationStatuses = ["Scouted", "Contacted", "Negotiating", "Ready", "Rejected"];
const migrationContactStatuses = ["Not Contacted", "Contacted", "In Discussion", "Follow Up", "Closed"];
const timezoneOptions = [
  "UTC-12",
  "UTC-11",
  "UTC-10",
  "UTC-9",
  "UTC-8",
  "UTC-7",
  "UTC-6",
  "UTC-5",
  "UTC-4",
  "UTC-3",
  "UTC-2",
  "UTC-1",
  "UTC+0",
  "UTC+1",
  "UTC+2",
  "UTC+3",
  "UTC+4",
  "UTC+5",
  "UTC+6",
  "UTC+7",
  "UTC+8",
  "UTC+9",
  "UTC+10",
  "UTC+11",
  "UTC+12",
  "UTC+13",
  "UTC+14",
];

const emptySharedDraft: SharedDraft = {
  name: "",
  techPower: 0,
  heroPower: 0,
  troopPower: 0,
  modVehiclePower: 0,
  structurePower: 0,
  combatPower: 0,
  kills: 0,
  notes: "",
  manualAdjustment: 0,
};

const emptyApplicantDraft = {
  ...emptySharedDraft,
  timezone: "UTC-6",
  status: "New",
};

const emptyMigrationDraft = {
  ...emptySharedDraft,
  originalServer: "",
  originalAlliance: "",
  reasonForLeaving: "",
  contactStatus: "Not Contacted",
  status: "Scouted",
};

function applicantScore(entry: SharedDraft) {
  return Number(
    (
      (entry.troopPower / 1_000_000) * 0.4 +
      (entry.combatPower / 1_000_000) * 0.2 +
      (entry.heroPower / 1_000_000) * 0.15 +
      (entry.techPower / 1_000_000) * 0.1 +
      (entry.kills / 1_000_000) * 0.1 +
      (entry.structurePower / 1_000_000) * 0.05 +
      entry.manualAdjustment
    ).toFixed(2)
  );
}

function migrationScore(entry: SharedDraft) {
  return Number(
    (
      (entry.troopPower / 1_000_000) * 0.3 +
      (entry.combatPower / 1_000_000) * 0.25 +
      (entry.heroPower / 1_000_000) * 0.15 +
      (entry.techPower / 1_000_000) * 0.1 +
      (entry.kills / 1_000_000) * 0.1 +
      (entry.modVehiclePower / 1_000_000) * 0.05 +
      (entry.structurePower / 1_000_000) * 0.05 +
      entry.manualAdjustment
    ).toFixed(2)
  );
}

function recommendation(score: number) {
  if (score >= 90) return "Strong Fit";
  if (score >= 55) return "Borderline";
  return "Low Priority";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

async function cropNameBlob(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      const cropX = Math.round(img.width * 0.3);
      const cropW = Math.round(img.width * 0.7);
      const cropH = Math.round(img.height * 0.18);
      const scale = 3;
      canvas.width = cropW * scale;
      canvas.height = cropH * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, cropX, 0, cropW, cropH, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to encode image"));
        return;
      }
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

async function extractNameFromImage(file: File): Promise<string> {
  const croppedBlob = await cropNameBlob(file);
  if (!croppedBlob) return "";

  try {
    const imageBase64 = await blobToBase64(croppedBlob);
    const result = await extractGeminiName({ imageBase64, mimeType: "image/png" });
    if (result.success && result.name) {
      return result.name;
    }
  } catch {}

  try {
    const result = await Tesseract.recognize(croppedBlob, "eng", {
      // @ts-ignore
      tessedit_pageseg_mode: "7",
    } as any);
    return result.data.text.replace(/[^a-zA-Z ]/g, "").trim().replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

export default function RecruitmentPanel({
  initialApplicants,
  initialMigrations,
  canManage,
}: {
  initialApplicants: ApplicantRecord[];
  initialMigrations: MigrationRecord[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"applicants" | "migrations">("applicants");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [applicants, setApplicants] = useState(initialApplicants);
  const [migrations, setMigrations] = useState(initialMigrations);
  const [applicantDraft, setApplicantDraft] = useState(emptyApplicantDraft);
  const [migrationDraft, setMigrationDraft] = useState(emptyMigrationDraft);
  const [applicantEditId, setApplicantEditId] = useState<string | null>(null);
  const [migrationEditId, setMigrationEditId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const applicantRows = useMemo(
    () =>
      applicants
        .map((entry) => ({ ...entry, score: applicantScore(entry), recommendation: recommendation(applicantScore(entry)) }))
        .sort((a, b) => b.score - a.score),
    [applicants]
  );
  const migrationRows = useMemo(
    () =>
      migrations
        .map((entry) => ({ ...entry, score: migrationScore(entry), recommendation: recommendation(migrationScore(entry)) }))
        .sort((a, b) => b.score - a.score),
    [migrations]
  );

  const currentFormula =
    tab === "applicants"
      ? "Applicant Score = Troop x 0.40 + Combat x 0.20 + Hero x 0.15 + Tech x 0.10 + Kills x 0.10 + Structure x 0.05 + Manual Adjustment"
      : "Migration Score = Troop x 0.30 + Combat x 0.25 + Hero x 0.15 + Tech x 0.10 + Kills x 0.10 + Mod Vehicle x 0.05 + Structure x 0.05 + Manual Adjustment";

  const currentRows = tab === "applicants" ? applicantRows : migrationRows;

  const handleScreenshot = async (file: File) => {
    setIsScanning(true);
    setMessage(null);
    try {
      const [ocrResult, nameResult] = await Promise.all([
        Tesseract.recognize(file, "eng"),
        extractNameFromImage(file),
      ]);
      const parsed = parseLastZProfile(ocrResult.data.text);
      const nextShared = {
        name: nameResult || parsed.name === "Unknown Player" ? nameResult || "" : parsed.name,
        techPower: parsed.powerStats.tech,
        heroPower: parsed.powerStats.hero,
        troopPower: parsed.powerStats.troop,
        modVehiclePower: parsed.powerStats.modVehicle,
        structurePower: parsed.powerStats.structure,
        combatPower: 0,
        kills: parsed.kills,
        notes: "",
        manualAdjustment: 0,
      };

      if (tab === "applicants") {
        setApplicantDraft((prev) => ({ ...prev, ...nextShared }));
      } else {
        setMigrationDraft((prev) => ({ ...prev, ...nextShared }));
      }

      setMessage({ type: "success", text: "Screenshot parsed into a draft. Review the fields before saving." });
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Failed to parse screenshot." });
    } finally {
      setIsScanning(false);
    }
  };

  const saveCurrent = () => {
    setMessage(null);
    startTransition(async () => {
      if (tab === "applicants") {
        const result = await saveApplicant({ id: applicantEditId ?? undefined, ...applicantDraft });
        if (!result.success) {
          setMessage({ type: "error", text: result.error || "Failed to save applicant." });
          return;
        }
        const nextEntry = {
          ...(applicantEditId
            ? applicants.find((entry) => entry.id === applicantEditId)!
            : { id: `temp-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
          ...applicantDraft,
          updatedAt: new Date().toISOString(),
        };
        setApplicants((prev) =>
          applicantEditId ? prev.map((entry) => (entry.id === applicantEditId ? nextEntry : entry)) : [nextEntry, ...prev]
        );
        setApplicantDraft(emptyApplicantDraft);
        setApplicantEditId(null);
        setMessage({ type: "success", text: "Applicant saved." });
        router.refresh();
      } else {
        const result = await saveMigrationCandidate({ id: migrationEditId ?? undefined, ...migrationDraft });
        if (!result.success) {
          setMessage({ type: "error", text: result.error || "Failed to save migration candidate." });
          return;
        }
        const nextEntry = {
          ...(migrationEditId
            ? migrations.find((entry) => entry.id === migrationEditId)!
            : { id: `temp-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
          ...migrationDraft,
          updatedAt: new Date().toISOString(),
        };
        setMigrations((prev) =>
          migrationEditId ? prev.map((entry) => (entry.id === migrationEditId ? nextEntry : entry)) : [nextEntry, ...prev]
        );
        setMigrationDraft(emptyMigrationDraft);
        setMigrationEditId(null);
        setMessage({ type: "success", text: "Migration candidate saved." });
        router.refresh();
      }
    });
  };

  const editApplicant = (entry: ApplicantRecord) => {
    setApplicantEditId(entry.id);
    setApplicantDraft({
      name: entry.name,
      timezone: entry.timezone,
      status: entry.status,
      notes: entry.notes,
      techPower: entry.techPower,
      heroPower: entry.heroPower,
      troopPower: entry.troopPower,
      modVehiclePower: entry.modVehiclePower,
      structurePower: entry.structurePower,
      combatPower: entry.combatPower,
      kills: entry.kills,
      manualAdjustment: entry.manualAdjustment,
    });
  };

  const editMigration = (entry: MigrationRecord) => {
    setMigrationEditId(entry.id);
    setMigrationDraft({
      name: entry.name,
      originalServer: entry.originalServer,
      originalAlliance: entry.originalAlliance,
      reasonForLeaving: entry.reasonForLeaving,
      contactStatus: entry.contactStatus,
      status: entry.status,
      notes: entry.notes,
      techPower: entry.techPower,
      heroPower: entry.heroPower,
      troopPower: entry.troopPower,
      modVehiclePower: entry.modVehiclePower,
      structurePower: entry.structurePower,
      combatPower: entry.combatPower,
      kills: entry.kills,
      manualAdjustment: entry.manualAdjustment,
    });
  };

  const removeApplicant = (id: string) => {
    startTransition(async () => {
      const result = await deleteApplicant({ id });
      if (result.success) {
        setApplicants((prev) => prev.filter((entry) => entry.id !== id));
        setMessage({ type: "success", text: "Applicant removed." });
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to remove applicant." });
      }
    });
  };

  const removeMigration = (id: string) => {
    startTransition(async () => {
      const result = await deleteMigrationCandidate({ id });
      if (result.success) {
        setMigrations((prev) => prev.filter((entry) => entry.id !== id));
        setMessage({ type: "success", text: "Migration candidate removed." });
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to remove migration candidate." });
      }
    });
  };

  return (
    <div className="flex-col gap-5">
      {message && <div style={messageStyle(message.type)}>{message.text}</div>}

      <div className="flex-row justify-between gap-4" style={{ flexWrap: "wrap" }}>
        <div className="flex-row gap-2" style={{ flexWrap: "wrap" }}>
          <button className={`cyber-button ${tab === "applicants" ? "primary" : ""}`} onClick={() => setTab("applicants")}>
            Applicants
          </button>
          <button className={`cyber-button ${tab === "migrations" ? "primary" : ""}`} onClick={() => setTab("migrations")}>
            Migration Candidates
          </button>
        </div>
        <div className="flex-row gap-2">
          <button className={`cyber-button ${viewMode === "table" ? "primary" : ""}`} onClick={() => setViewMode("table")}>
            <Table2 size={14} /> Table
          </button>
          <button className={`cyber-button ${viewMode === "cards" ? "primary" : ""}`} onClick={() => setViewMode("cards")}>
            <LayoutGrid size={14} /> Cards
          </button>
        </div>
      </div>

      <div style={summaryBannerStyle}>
        <div>
          <div style={summaryLabelStyle}>Scoring Formula</div>
          <div style={{ color: "var(--text-main)", marginTop: "0.4rem" }}>{currentFormula}</div>
        </div>
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
          Strong Fit: 90+ | Borderline: 55+ | Low Priority: under 55
        </div>
      </div>

      {canManage && (
        <div className="duel-main-grid">
          <section className="cyber-card flex-col gap-4">
            <h3 style={{ color: "var(--accent-purple)" }}>
              {tab === "applicants" ? "Applicant Intake" : "Migration Candidate Intake"}
            </h3>
            <div className="flex-col gap-3">
              <label className="cyber-label">Screenshot Import</label>
              <label style={dropzoneStyle}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={isScanning}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void handleScreenshot(file);
                    }
                    e.currentTarget.value = "";
                  }}
                />
                <div className="flex-col gap-3" style={{ alignItems: "center" }}>
                  <Upload size={28} style={{ color: "var(--text-muted)" }} />
                  <div style={{ textAlign: "center" }}>
                    {isScanning ? "Processing screenshot..." : "Click to parse a profile screenshot into this draft"}
                  </div>
                </div>
              </label>
            </div>
          </section>

          <section className="cyber-card flex-col gap-4">
            <h3 style={{ color: "var(--accent-neon)" }}>
              {tab === "applicants" ? (applicantEditId ? "Edit Applicant" : "New Applicant") : migrationEditId ? "Edit Migration Candidate" : "New Migration Candidate"}
            </h3>
            {tab === "applicants" ? (
              <ApplicantForm draft={applicantDraft} setDraft={setApplicantDraft} />
            ) : (
              <MigrationForm draft={migrationDraft} setDraft={setMigrationDraft} />
            )}
            <div className="flex-row justify-between gap-3" style={{ flexWrap: "wrap" }}>
              <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                Current score: {tab === "applicants" ? applicantScore(applicantDraft).toFixed(2) : migrationScore(migrationDraft).toFixed(2)}
              </div>
              <div className="flex-row gap-2" style={{ flexWrap: "wrap" }}>
                <button
                  className="cyber-button"
                  onClick={() => {
                    if (tab === "applicants") {
                      setApplicantDraft(emptyApplicantDraft);
                      setApplicantEditId(null);
                    } else {
                      setMigrationDraft(emptyMigrationDraft);
                      setMigrationEditId(null);
                    }
                  }}
                >
                  Clear
                </button>
                <button className="cyber-button primary" onClick={saveCurrent} disabled={isPending}>
                  {isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {viewMode === "table" ? (
        <section className="cyber-card flex-col gap-4">
          <h3 style={{ color: "var(--accent-neon)" }}>
            {tab === "applicants" ? "Applicant Ranking" : "Migration Candidate Ranking"}
          </h3>
          <div className="responsive-table" style={{ backgroundColor: "var(--bg-input)", borderRadius: "6px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: tab === "applicants" ? "1080px" : "1280px" }}>
              <thead style={{ backgroundColor: "var(--bg-dark)" }}>
                <tr>
                  <HeaderCell>Rank</HeaderCell>
                  <HeaderCell>Name</HeaderCell>
                  {tab === "migrations" && <HeaderCell>Original Server</HeaderCell>}
                  {tab === "migrations" && <HeaderCell>Original Alliance</HeaderCell>}
                  {tab === "applicants" && <HeaderCell>Timezone</HeaderCell>}
                  <HeaderCell>Status</HeaderCell>
                  {tab === "migrations" && <HeaderCell>Contact</HeaderCell>}
                  <HeaderCell>Troop</HeaderCell>
                  <HeaderCell>Combat</HeaderCell>
                  <HeaderCell>Kills</HeaderCell>
                  <HeaderCell>Score</HeaderCell>
                  <HeaderCell>Fit</HeaderCell>
                  <HeaderCell>Updated</HeaderCell>
                  {canManage && <HeaderCell>Actions</HeaderCell>}
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, index) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <BodyCell>#{index + 1}</BodyCell>
                    <BodyCell strong>{row.name}</BodyCell>
                    {tab === "migrations" && <BodyCell>{(row as any).originalServer}</BodyCell>}
                    {tab === "migrations" && <BodyCell>{(row as any).originalAlliance}</BodyCell>}
                    {tab === "applicants" && <BodyCell>{(row as any).timezone || "-"}</BodyCell>}
                    <BodyCell>{row.status}</BodyCell>
                    {tab === "migrations" && <BodyCell>{(row as any).contactStatus}</BodyCell>}
                    <BodyCell>{row.troopPower.toLocaleString()}</BodyCell>
                    <BodyCell>{row.combatPower.toLocaleString()}</BodyCell>
                    <BodyCell>{row.kills.toLocaleString()}</BodyCell>
                    <BodyCell>{row.score.toFixed(2)}</BodyCell>
                    <BodyCell><span style={badgeStyle((row as any).recommendation)}>{(row as any).recommendation}</span></BodyCell>
                    <BodyCell>{formatDate(row.updatedAt)}</BodyCell>
                    {canManage && (
                      <BodyCell>
                        <div className="flex-row gap-2" style={{ flexWrap: "wrap" }}>
                          <button className="cyber-button" onClick={() => (tab === "applicants" ? editApplicant(row as ApplicantRecord) : editMigration(row as MigrationRecord))} aria-label="Edit record">
                            <Pencil size={14} />
                          </button>
                          <button className="cyber-button" style={{ borderColor: "var(--accent-red)", color: "var(--accent-red)" }} onClick={() => (tab === "applicants" ? removeApplicant(row.id) : removeMigration(row.id))}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </BodyCell>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          {currentRows.map((row, index) => (
            <section key={row.id} className="cyber-card flex-col gap-3">
              <div className="flex-row justify-between gap-3" style={{ alignItems: "flex-start" }}>
                <div>
                  <div style={summaryLabelStyle}>Rank #{index + 1}</div>
                  <h3 style={{ color: "var(--accent-neon)", marginTop: "0.35rem" }}>{row.name}</h3>
                </div>
                <span style={badgeStyle((row as any).recommendation)}>{(row as any).recommendation}</span>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                {tab === "applicants"
                  ? `Timezone: ${(row as any).timezone || "-"}`
                  : `Server ${(row as any).originalServer || "-"} | ${(row as any).originalAlliance || "-"}`
                }
              </div>
              <div style={miniStatsGridStyle}>
                <MiniMetric label="Status" value={row.status} />
                {tab === "migrations" && <MiniMetric label="Contact" value={(row as any).contactStatus} />}
                <MiniMetric label="Troop" value={row.troopPower.toLocaleString()} />
                <MiniMetric label="Combat" value={row.combatPower.toLocaleString()} />
                <MiniMetric label="Kills" value={row.kills.toLocaleString()} />
                <MiniMetric label="Score" value={row.score.toFixed(2)} />
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.84rem" }}>{row.notes || "No notes yet."}</div>
              {canManage && (
                <div className="flex-row justify-between gap-2" style={{ flexWrap: "wrap" }}>
                  <button className="cyber-button" onClick={() => (tab === "applicants" ? editApplicant(row as ApplicantRecord) : editMigration(row as MigrationRecord))} aria-label="Edit record">
                    <Pencil size={14} />
                  </button>
                  <button className="cyber-button" style={{ borderColor: "var(--accent-red)", color: "var(--accent-red)" }} onClick={() => (tab === "applicants" ? removeApplicant(row.id) : removeMigration(row.id))}>
                    Remove
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicantForm({ draft, setDraft }: any) {
  return (
    <div className="profile-form-grid">
      <LabeledField label="Player Name"><input className="cyber-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></LabeledField>
      <LabeledField label="Timezone">
        <select className="cyber-input" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
          {timezoneOptions.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezone}
            </option>
          ))}
        </select>
      </LabeledField>
      <LabeledField label="Status">
        <select className="cyber-input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
          {applicantStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </LabeledField>
      <LabeledField label="Manual Adjustment"><input className="cyber-input" type="number" value={draft.manualAdjustment} onChange={(e) => setDraft({ ...draft, manualAdjustment: Number(e.target.value) || 0 })} /></LabeledField>
      <SharedStatFields draft={draft} setDraft={setDraft} />
      <div style={{ gridColumn: "1 / -1" }}>
        <LabeledField label="Notes"><textarea className="cyber-input" rows={4} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></LabeledField>
      </div>
    </div>
  );
}

function MigrationForm({ draft, setDraft }: any) {
  return (
    <div className="profile-form-grid">
      <LabeledField label="Player Name"><input className="cyber-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></LabeledField>
      <LabeledField label="Original Server"><input className="cyber-input" value={draft.originalServer} onChange={(e) => setDraft({ ...draft, originalServer: e.target.value })} /></LabeledField>
      <LabeledField label="Original Alliance"><input className="cyber-input" value={draft.originalAlliance} onChange={(e) => setDraft({ ...draft, originalAlliance: e.target.value })} /></LabeledField>
      <LabeledField label="Status">
        <select className="cyber-input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
          {migrationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </LabeledField>
      <LabeledField label="Contact Status">
        <select className="cyber-input" value={draft.contactStatus} onChange={(e) => setDraft({ ...draft, contactStatus: e.target.value })}>
          {migrationContactStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </LabeledField>
      <LabeledField label="Manual Adjustment"><input className="cyber-input" type="number" value={draft.manualAdjustment} onChange={(e) => setDraft({ ...draft, manualAdjustment: Number(e.target.value) || 0 })} /></LabeledField>
      <div style={{ gridColumn: "1 / -1" }}>
        <LabeledField label="Reason for Leaving"><input className="cyber-input" value={draft.reasonForLeaving} onChange={(e) => setDraft({ ...draft, reasonForLeaving: e.target.value })} /></LabeledField>
      </div>
      <SharedStatFields draft={draft} setDraft={setDraft} />
      <div style={{ gridColumn: "1 / -1" }}>
        <LabeledField label="Notes"><textarea className="cyber-input" rows={4} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></LabeledField>
      </div>
    </div>
  );
}

function SharedStatFields({ draft, setDraft }: any) {
  const fields = [
    ["Tech Power", "techPower"],
    ["Hero Power", "heroPower"],
    ["Troop Power", "troopPower"],
    ["Mod Vehicle Power", "modVehiclePower"],
    ["Structure Power", "structurePower"],
    ["Combat Power", "combatPower"],
    ["Kills", "kills"],
  ] as const;

  return (
    <>
      {fields.map(([label, key]) => (
        <LabeledField key={key} label={label}>
          <input className="cyber-input" type="number" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) || 0 })} />
        </LabeledField>
      ))}
    </>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-col gap-2">
      <label className="cyber-label">{label}</label>
      {children}
    </div>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "0.8rem 1rem", textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>{children}</th>;
}

function BodyCell({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return <td style={{ padding: "0.9rem 1rem", fontWeight: strong ? 700 : 400 }}>{children}</td>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ backgroundColor: "var(--bg-input)", borderRadius: "6px", padding: "0.75rem", border: "1px solid var(--border-subtle)" }}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={{ color: "var(--text-main)", marginTop: "0.3rem" }}>{value}</div>
    </div>
  );
}

const messageStyle = (type: "success" | "error"): React.CSSProperties => ({
  padding: "0.85rem 1rem",
  borderRadius: "4px",
  border: `1px solid ${type === "success" ? "var(--accent-neon)" : "var(--accent-red)"}`,
  backgroundColor: type === "success" ? "rgba(0,255,157,0.08)" : "rgba(255,51,102,0.08)",
  color: type === "success" ? "var(--accent-neon)" : "var(--accent-red)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.85rem",
});

const summaryBannerStyle: React.CSSProperties = {
  padding: "1rem 1.1rem",
  borderRadius: "8px",
  border: "1px solid var(--border-subtle)",
  backgroundColor: "var(--bg-input)",
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
};

const summaryLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.7rem",
  color: "var(--accent-neon)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const dropzoneStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "140px",
  border: "2px dashed var(--border-subtle)",
  borderRadius: "8px",
  cursor: "pointer",
  padding: "1rem",
  textAlign: "center",
};

const miniStatsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: "0.75rem",
};

const badgeStyle = (value: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "0.28rem 0.6rem",
  borderRadius: "999px",
  fontFamily: "var(--font-mono)",
  fontSize: "0.72rem",
  border:
    value === "Strong Fit"
      ? "1px solid var(--accent-neon)"
      : value === "Borderline"
        ? "1px solid var(--accent-purple)"
        : "1px solid var(--accent-red)",
  color:
    value === "Strong Fit"
      ? "var(--accent-neon)"
      : value === "Borderline"
        ? "var(--accent-purple)"
        : "var(--accent-red)",
});
