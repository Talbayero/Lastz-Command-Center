"use client";

import { Fragment, useEffect, useMemo, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import Tesseract from "tesseract.js";
import { AlertTriangle, ChevronDown, ChevronRight, LayoutGrid, Pencil, Table2, Upload, Trash2 } from "lucide-react";
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
  category: string;
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
  category: string;
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

type ScoreWeights = {
  troop: number;
  combat: number;
  hero: number;
  tech: number;
  kills: number;
  structure: number;
  modVehicle: number;
};

type SortDirection = "asc" | "desc";

type ApplicantSortKey =
  | "name"
  | "timezone"
  | "category"
  | "status"
  | "score"
  | "fit"
  | "updatedAt"
  | "warning";

type MigrationSortKey =
  | "name"
  | "originalServer"
  | "originalAlliance"
  | "category"
  | "status"
  | "score"
  | "fit"
  | "updatedAt"
  | "warning";

const applicantStatuses = ["New", "Reviewing", "Interview", "Approved", "Rejected"];
const migrationStatuses = ["Scouted", "Contacted", "Negotiating", "Ready", "Rejected"];
const migrationContactStatuses = ["Not Contacted", "Contacted", "In Discussion", "Follow Up", "Closed"];
const recruitmentCategories = ["Elite", "Advanced", "Medium", "Regular"];
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
  category: "Regular",
  status: "New",
};

const emptyMigrationDraft = {
  ...emptySharedDraft,
  originalServer: "",
  originalAlliance: "",
  reasonForLeaving: "",
  contactStatus: "Not Contacted",
  category: "Regular",
  status: "Scouted",
};

const defaultApplicantWeights: ScoreWeights = {
  troop: 0.4,
  combat: 0.2,
  hero: 0.15,
  tech: 0.1,
  kills: 0.1,
  structure: 0.05,
  modVehicle: 0,
};

const defaultMigrationWeights: ScoreWeights = {
  troop: 0.3,
  combat: 0.25,
  hero: 0.15,
  tech: 0.1,
  kills: 0.1,
  structure: 0.05,
  modVehicle: 0.05,
};

function computeScore(entry: SharedDraft, weights: ScoreWeights) {
  return Number(
    (
      (entry.troopPower / 1_000_000) * weights.troop +
      (entry.combatPower / 1_000_000) * weights.combat +
      (entry.heroPower / 1_000_000) * weights.hero +
      (entry.techPower / 1_000_000) * weights.tech +
      (entry.kills / 1_000_000) * weights.kills +
      (entry.structurePower / 1_000_000) * weights.structure +
      (entry.modVehiclePower / 1_000_000) * weights.modVehicle +
      entry.manualAdjustment
    ).toFixed(2)
  );
}

function totalWeight(weights: ScoreWeights) {
  return (
    weights.troop +
    weights.combat +
    weights.hero +
    weights.tech +
    weights.kills +
    weights.structure +
    weights.modVehicle
  );
}

function recommendation(score: number) {
  if (score >= 90) return "Strong Fit";
  if (score >= 55) return "Borderline";
  return "Low Priority";
}

function categoryFromScore(score: number) {
  if (score >= 120) return "Elite";
  if (score >= 80) return "Advanced";
  if (score >= 45) return "Medium";
  return "Regular";
}

function hasMissingStats(entry: SharedDraft) {
  return [
    entry.techPower,
    entry.heroPower,
    entry.troopPower,
    entry.modVehiclePower,
    entry.structurePower,
    entry.combatPower,
    entry.kills,
  ].some((value) => value === 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function compareValues(a: string | number | boolean, b: string | number | boolean, direction: SortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") {
    return (a - b) * multiplier;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (Number(a) - Number(b)) * multiplier;
  }
  return String(a).localeCompare(String(b)) * multiplier;
}

function compareRecruitmentRows(
  a: any,
  b: any,
  sort: { key: ApplicantSortKey | MigrationSortKey; direction: SortDirection }
) {
  switch (sort.key) {
    case "warning":
      return compareValues(a.hasWarning, b.hasWarning, sort.direction);
    case "name":
      return compareValues(a.name, b.name, sort.direction);
    case "timezone":
      return compareValues(a.timezone ?? "", b.timezone ?? "", sort.direction);
    case "originalServer":
      return compareValues(a.originalServer ?? "", b.originalServer ?? "", sort.direction);
    case "originalAlliance":
      return compareValues(a.originalAlliance ?? "", b.originalAlliance ?? "", sort.direction);
    case "category":
      return compareValues(a.effectiveCategory, b.effectiveCategory, sort.direction);
    case "status":
      return compareValues(a.status, b.status, sort.direction);
    case "score":
      return compareValues(a.score, b.score, sort.direction);
    case "fit":
      return compareValues(a.recommendation, b.recommendation, sort.direction);
    case "updatedAt":
      return compareValues(new Date(a.updatedAt).getTime(), new Date(b.updatedAt).getTime(), sort.direction);
    default:
      return 0;
  }
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
  const [applicantWeights, setApplicantWeights] = useState<ScoreWeights>(defaultApplicantWeights);
  const [migrationWeights, setMigrationWeights] = useState<ScoreWeights>(defaultMigrationWeights);
  const [expandedRowIds, setExpandedRowIds] = useState<string[]>([]);
  const [applicantSort, setApplicantSort] = useState<{ key: ApplicantSortKey; direction: SortDirection }>({
    key: "score",
    direction: "desc",
  });
  const [migrationSort, setMigrationSort] = useState<{ key: MigrationSortKey; direction: SortDirection }>({
    key: "score",
    direction: "desc",
  });

  useEffect(() => {
    try {
      const applicantSaved = window.localStorage.getItem("recruitmentApplicantWeights");
      const migrationSaved = window.localStorage.getItem("recruitmentMigrationWeights");
      if (applicantSaved) {
        setApplicantWeights({ ...defaultApplicantWeights, ...JSON.parse(applicantSaved) });
      }
      if (migrationSaved) {
        setMigrationWeights({ ...defaultMigrationWeights, ...JSON.parse(migrationSaved) });
      }
    } catch {}
  }, []);

  useEffect(() => {
    window.localStorage.setItem("recruitmentApplicantWeights", JSON.stringify(applicantWeights));
  }, [applicantWeights]);

  useEffect(() => {
    window.localStorage.setItem("recruitmentMigrationWeights", JSON.stringify(migrationWeights));
  }, [migrationWeights]);

  const applicantRows = useMemo(
    () =>
      applicants
        .map((entry) => {
          const score = computeScore(entry, applicantWeights);
          return {
            ...entry,
            score,
            recommendation: recommendation(score),
            effectiveCategory: entry.category || categoryFromScore(score),
            hasWarning: hasMissingStats(entry),
          };
        })
        .sort((a, b) => compareRecruitmentRows(a, b, applicantSort)),
    [applicants, applicantWeights, applicantSort]
  );
  const migrationRows = useMemo(
    () =>
      migrations
        .map((entry) => {
          const score = computeScore(entry, migrationWeights);
          return {
            ...entry,
            score,
            recommendation: recommendation(score),
            effectiveCategory: entry.category || categoryFromScore(score),
            hasWarning: hasMissingStats(entry),
          };
        })
        .sort((a, b) => compareRecruitmentRows(a, b, migrationSort)),
    [migrations, migrationWeights, migrationSort]
  );

  const currentRows = tab === "applicants" ? applicantRows : migrationRows;

  const summaryRows = useMemo(() => {
    const rows = currentRows;
    const byCategory = recruitmentCategories.map((category) => ({
      category,
      count: rows.filter((row: any) => row.effectiveCategory === category).length,
    }));
    return {
      total: rows.length,
      strongFit: rows.filter((row: any) => row.recommendation === "Strong Fit").length,
      borderline: rows.filter((row: any) => row.recommendation === "Borderline").length,
      lowPriority: rows.filter((row: any) => row.recommendation === "Low Priority").length,
      byCategory,
    };
  }, [currentRows]);

  const currentFormula =
    tab === "applicants"
      ? formulaLabel("Applicant", applicantWeights)
      : formulaLabel("Migration", migrationWeights);

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
        const nextScore = computeScore(nextShared, applicantWeights);
        setApplicantDraft((prev) => ({ ...prev, ...nextShared, category: categoryFromScore(nextScore) }));
      } else {
        const nextScore = computeScore(nextShared, migrationWeights);
        setMigrationDraft((prev) => ({ ...prev, ...nextShared, category: categoryFromScore(nextScore) }));
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
      category: entry.category,
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
      category: entry.category,
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

  const toggleSort = (key: ApplicantSortKey | MigrationSortKey) => {
    if (tab === "applicants") {
      setApplicantSort((prev) => ({
        key: key as ApplicantSortKey,
        direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
      }));
    } else {
      setMigrationSort((prev) => ({
        key: key as MigrationSortKey,
        direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
      }));
    }
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
        <section className="cyber-card flex-col gap-4">
          <h3 style={{ color: "var(--accent-neon)" }}>
            {tab === "applicants" ? "Applicant Scoring Engine" : "Migration Scoring Engine"}
          </h3>
          <div style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>
            Adjust the score weights for this tab. Changes are saved in this browser so you can tune the formula live.
          </div>
          <div style={miniStatsGridStyle}>
            <WeightField label="Troop" value={(tab === "applicants" ? applicantWeights : migrationWeights).troop} onChange={(value) => updateWeights(tab, "troop", value, setApplicantWeights, setMigrationWeights)} />
            <WeightField label="Combat" value={(tab === "applicants" ? applicantWeights : migrationWeights).combat} onChange={(value) => updateWeights(tab, "combat", value, setApplicantWeights, setMigrationWeights)} />
            <WeightField label="Hero" value={(tab === "applicants" ? applicantWeights : migrationWeights).hero} onChange={(value) => updateWeights(tab, "hero", value, setApplicantWeights, setMigrationWeights)} />
            <WeightField label="Tech" value={(tab === "applicants" ? applicantWeights : migrationWeights).tech} onChange={(value) => updateWeights(tab, "tech", value, setApplicantWeights, setMigrationWeights)} />
            <WeightField label="Kills" value={(tab === "applicants" ? applicantWeights : migrationWeights).kills} onChange={(value) => updateWeights(tab, "kills", value, setApplicantWeights, setMigrationWeights)} />
            <WeightField label="Structure" value={(tab === "applicants" ? applicantWeights : migrationWeights).structure} onChange={(value) => updateWeights(tab, "structure", value, setApplicantWeights, setMigrationWeights)} />
            {tab === "migrations" && (
              <WeightField label="Mod Vehicle" value={migrationWeights.modVehicle} onChange={(value) => updateWeights("migrations", "modVehicle", value, setApplicantWeights, setMigrationWeights)} />
            )}
          </div>
          <div
            style={{
              borderRadius: "6px",
              padding: "0.8rem 1rem",
              border: `1px solid ${Math.abs(totalWeight(tab === "applicants" ? applicantWeights : migrationWeights) - 1) < 0.0001 ? "var(--accent-neon)" : "var(--accent-purple)"}`,
              backgroundColor: Math.abs(totalWeight(tab === "applicants" ? applicantWeights : migrationWeights) - 1) < 0.0001 ? "rgba(0,255,157,0.08)" : "rgba(153,0,255,0.08)",
              color: Math.abs(totalWeight(tab === "applicants" ? applicantWeights : migrationWeights) - 1) < 0.0001 ? "var(--accent-neon)" : "var(--accent-purple)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.84rem",
            }}
          >
            Total Weight: {(totalWeight(tab === "applicants" ? applicantWeights : migrationWeights) * 100).toFixed(0)}%
            {Math.abs(totalWeight(tab === "applicants" ? applicantWeights : migrationWeights) - 1) < 0.0001
              ? " (Optimized)"
              : " (Target: 100%)"}
          </div>
        </section>
      )}

      <section className="cyber-card flex-col gap-4">
        <h3 style={{ color: "var(--accent-purple)" }}>
          {tab === "applicants" ? "Applicant Summary" : "Migration Summary"}
        </h3>
        <div style={miniStatsGridStyle}>
          <MiniMetric label="Total" value={String(summaryRows.total)} />
          <MiniMetric label="Strong Fit" value={String(summaryRows.strongFit)} />
          <MiniMetric label="Borderline" value={String(summaryRows.borderline)} />
          <MiniMetric label="Low Priority" value={String(summaryRows.lowPriority)} />
        </div>
        <div className="responsive-table" style={{ backgroundColor: "var(--bg-input)", borderRadius: "6px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "360px" }}>
            <thead style={{ backgroundColor: "var(--bg-dark)" }}>
              <tr>
                <HeaderCell>Category</HeaderCell>
                <HeaderCell>Count</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {summaryRows.byCategory.map((row) => (
                <tr key={row.category} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <BodyCell><span style={categoryBadgeStyle(row.category)}>{row.category}</span></BodyCell>
                  <BodyCell>{String(row.count)}</BodyCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
                Current score: {tab === "applicants" ? computeScore(applicantDraft, applicantWeights).toFixed(2) : computeScore(migrationDraft, migrationWeights).toFixed(2)}
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
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ backgroundColor: "var(--bg-dark)" }}>
                <tr>
                  <HeaderCell>Open</HeaderCell>
                  <SortableHeaderCell
                    active={tab === "applicants" ? applicantSort.key === "warning" : migrationSort.key === "warning"}
                    direction={tab === "applicants" && applicantSort.key === "warning" ? applicantSort.direction : tab === "migrations" && migrationSort.key === "warning" ? migrationSort.direction : null}
                    onClick={() => toggleSort("warning")}
                  >
                    Verify
                  </SortableHeaderCell>
                  <SortableHeaderCell
                    active={tab === "applicants" ? applicantSort.key === "name" : migrationSort.key === "name"}
                    direction={tab === "applicants" && applicantSort.key === "name" ? applicantSort.direction : tab === "migrations" && migrationSort.key === "name" ? migrationSort.direction : null}
                    onClick={() => toggleSort("name")}
                  >
                    Name
                  </SortableHeaderCell>
                  {tab === "migrations" && (
                    <SortableHeaderCell
                      active={migrationSort.key === "originalServer"}
                      direction={migrationSort.key === "originalServer" ? migrationSort.direction : null}
                      onClick={() => toggleSort("originalServer")}
                    >
                      Original Server
                    </SortableHeaderCell>
                  )}
                  {tab === "migrations" && (
                    <SortableHeaderCell
                      active={migrationSort.key === "originalAlliance"}
                      direction={migrationSort.key === "originalAlliance" ? migrationSort.direction : null}
                      onClick={() => toggleSort("originalAlliance")}
                    >
                      Original Alliance
                    </SortableHeaderCell>
                  )}
                  {tab === "applicants" && (
                    <SortableHeaderCell
                      active={applicantSort.key === "timezone"}
                      direction={applicantSort.key === "timezone" ? applicantSort.direction : null}
                      onClick={() => toggleSort("timezone")}
                    >
                      Timezone
                    </SortableHeaderCell>
                  )}
                  <SortableHeaderCell
                    active={tab === "applicants" ? applicantSort.key === "category" : migrationSort.key === "category"}
                    direction={tab === "applicants" && applicantSort.key === "category" ? applicantSort.direction : tab === "migrations" && migrationSort.key === "category" ? migrationSort.direction : null}
                    onClick={() => toggleSort("category")}
                  >
                    Category
                  </SortableHeaderCell>
                  <SortableHeaderCell
                    active={tab === "applicants" ? applicantSort.key === "status" : migrationSort.key === "status"}
                    direction={tab === "applicants" && applicantSort.key === "status" ? applicantSort.direction : tab === "migrations" && migrationSort.key === "status" ? migrationSort.direction : null}
                    onClick={() => toggleSort("status")}
                  >
                    Status
                  </SortableHeaderCell>
                  <SortableHeaderCell
                    active={tab === "applicants" ? applicantSort.key === "score" : migrationSort.key === "score"}
                    direction={tab === "applicants" && applicantSort.key === "score" ? applicantSort.direction : tab === "migrations" && migrationSort.key === "score" ? migrationSort.direction : null}
                    onClick={() => toggleSort("score")}
                  >
                    Score
                  </SortableHeaderCell>
                  <SortableHeaderCell
                    active={tab === "applicants" ? applicantSort.key === "fit" : migrationSort.key === "fit"}
                    direction={tab === "applicants" && applicantSort.key === "fit" ? applicantSort.direction : tab === "migrations" && migrationSort.key === "fit" ? migrationSort.direction : null}
                    onClick={() => toggleSort("fit")}
                  >
                    Fit
                  </SortableHeaderCell>
                  <SortableHeaderCell
                    active={tab === "applicants" ? applicantSort.key === "updatedAt" : migrationSort.key === "updatedAt"}
                    direction={tab === "applicants" && applicantSort.key === "updatedAt" ? applicantSort.direction : tab === "migrations" && migrationSort.key === "updatedAt" ? migrationSort.direction : null}
                    onClick={() => toggleSort("updatedAt")}
                  >
                    Updated
                  </SortableHeaderCell>
                  {canManage && <HeaderCell>Actions</HeaderCell>}
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, index) => (
                  <Fragment key={row.id}>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <BodyCell>
                        <button
                          className="cyber-button"
                          style={{ padding: "0.35rem 0.55rem" }}
                          onClick={() =>
                            setExpandedRowIds((prev) =>
                              prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]
                            )
                          }
                          aria-label="Toggle details"
                        >
                          {expandedRowIds.includes(row.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </BodyCell>
                      <BodyCell>
                        {(row as any).hasWarning ? (
                          <span title="One or more important stats are zero and should be reviewed" style={{ color: "#ffd166", display: "inline-flex", alignItems: "center" }}>
                            <AlertTriangle size={15} />
                          </span>
                        ) : (
                          "—"
                        )}
                      </BodyCell>
                      <BodyCell strong>{`${index + 1}. ${row.name}`}</BodyCell>
                      {tab === "migrations" && <BodyCell>{(row as any).originalServer}</BodyCell>}
                      {tab === "migrations" && <BodyCell>{(row as any).originalAlliance}</BodyCell>}
                      {tab === "applicants" && <BodyCell>{(row as any).timezone || "-"}</BodyCell>}
                      <BodyCell><span style={categoryBadgeStyle((row as any).effectiveCategory)}>{(row as any).effectiveCategory}</span></BodyCell>
                      <BodyCell>{row.status}</BodyCell>
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
                    {expandedRowIds.includes(row.id) && (
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)", backgroundColor: "rgba(255,255,255,0.02)" }}>
                        <td colSpan={tab === "migrations" ? (canManage ? 10 : 9) : canManage ? 9 : 8} style={{ padding: "1rem" }}>
                          <div style={miniStatsGridStyle}>
                            <MiniMetric label="Verify" value={(row as any).hasWarning ? "Needs Review" : "OK"} />
                            {tab === "migrations" && <MiniMetric label="Contact" value={(row as any).contactStatus} />}
                            <MiniMetric label="Troop" value={row.troopPower.toLocaleString()} />
                            <MiniMetric label="Combat" value={row.combatPower.toLocaleString()} />
                            <MiniMetric label="Kills" value={row.kills.toLocaleString()} />
                            <MiniMetric label="Hero" value={row.heroPower.toLocaleString()} />
                            <MiniMetric label="Tech" value={row.techPower.toLocaleString()} />
                            <MiniMetric label="Mod Vehicle" value={row.modVehiclePower.toLocaleString()} />
                            <MiniMetric label="Structure" value={row.structurePower.toLocaleString()} />
                          </div>
                          {tab === "migrations" && ((row as any).reasonForLeaving || (row as any).notes) && (
                            <div style={{ marginTop: "0.9rem", color: "var(--text-muted)", fontSize: "0.84rem" }}>
                              {(row as any).reasonForLeaving ? `Reason: ${(row as any).reasonForLeaving}` : ""}
                              {(row as any).reasonForLeaving && (row as any).notes ? " | " : ""}
                              {(row as any).notes ? `Notes: ${(row as any).notes}` : ""}
                            </div>
                          )}
                          {tab === "applicants" && row.notes && (
                            <div style={{ marginTop: "0.9rem", color: "var(--text-muted)", fontSize: "0.84rem" }}>
                              Notes: {row.notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
              <div>
                <span style={categoryBadgeStyle((row as any).effectiveCategory)}>{(row as any).effectiveCategory}</span>
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
      <LabeledField label="Category">
        <select className="cyber-input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
          {recruitmentCategories.map((category) => <option key={category} value={category}>{category}</option>)}
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
      <LabeledField label="Category">
        <select className="cyber-input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
          {recruitmentCategories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </LabeledField>
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

function SortableHeaderCell({
  children,
  active,
  direction,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  direction: SortDirection | null;
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: "0.8rem 1rem",
        textAlign: "left",
        color: active ? "var(--accent-neon)" : "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        fontSize: "0.72rem",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {children} {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
    </th>
  );
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

function WeightField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ backgroundColor: "var(--bg-input)", borderRadius: "6px", padding: "0.75rem", border: "1px solid var(--border-subtle)" }}>
      <div style={summaryLabelStyle}>{label} Weight</div>
      <input
        className="cyber-input"
        type="number"
        step="1"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        onChange={(e) => onChange((Number(e.target.value) || 0) / 100)}
        style={{ marginTop: "0.45rem" }}
      />
      <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.35rem" }}>
        {Math.round(value * 100)}%
      </div>
    </div>
  );
}

function formulaLabel(label: string, weights: ScoreWeights) {
  const parts = [
    `Troop x ${weights.troop.toFixed(2)}`,
    `Combat x ${weights.combat.toFixed(2)}`,
    `Hero x ${weights.hero.toFixed(2)}`,
    `Tech x ${weights.tech.toFixed(2)}`,
    `Kills x ${weights.kills.toFixed(2)}`,
    weights.modVehicle > 0 ? `Mod Vehicle x ${weights.modVehicle.toFixed(2)}` : null,
    `Structure x ${weights.structure.toFixed(2)}`,
    "Manual Adjustment",
  ].filter(Boolean);
  return `${label} Score = ${parts.join(" + ")}`;
}

function updateWeights(
  tab: "applicants" | "migrations",
  key: keyof ScoreWeights,
  value: number,
  setApplicantWeights: Dispatch<SetStateAction<ScoreWeights>>,
  setMigrationWeights: Dispatch<SetStateAction<ScoreWeights>>
) {
  if (tab === "applicants") {
    setApplicantWeights((prev) => {
      const next = { ...prev, [key]: value };
      return totalWeight(next) > 1 ? prev : next;
    });
  } else {
    setMigrationWeights((prev) => {
      const next = { ...prev, [key]: value };
      return totalWeight(next) > 1 ? prev : next;
    });
  }
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

const categoryBadgeStyle = (value: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "0.28rem 0.6rem",
  borderRadius: "999px",
  fontFamily: "var(--font-mono)",
  fontSize: "0.72rem",
  border:
    value === "Elite"
      ? "1px solid var(--accent-neon)"
      : value === "Advanced"
        ? "1px solid var(--accent-purple)"
        : value === "Medium"
          ? "1px solid #ffd166"
          : "1px solid var(--border-subtle)",
  color:
    value === "Elite"
      ? "var(--accent-neon)"
      : value === "Advanced"
        ? "var(--accent-purple)"
        : value === "Medium"
          ? "#ffd166"
          : "var(--text-muted)",
});
