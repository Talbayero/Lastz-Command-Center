"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import Tesseract from "tesseract.js";
import { AlertTriangle, ChevronDown, ChevronRight, Download, LayoutGrid, Pencil, Table2, Upload, Trash2 } from "lucide-react";
import { parseLastZProfileImage } from "@/utils/ocrParser";
import { extractGeminiName } from "@/app/actions/extractGeminiName";
import {
  deleteApplicant,
  deleteMigrationCandidate,
  saveApplicant,
  saveMigrationCandidate,
  saveRecruitmentScoringConfig,
} from "@/app/actions/recruitment";
import {
  computeRecruitmentScore,
  defaultRecommendationThresholds,
  getCategoryFromScore,
  getFormulaLabel,
  getRecommendationBand,
  totalWeight,
  type RecruitmentRecommendationThresholds,
  type RecruitmentScoreWeights,
} from "@/utils/recruitmentScoring";

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
  march1Power: number;
  march2Power: number;
  march3Power: number;
  march4Power: number;
  combatPower: number;
  kills: number;
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
  march1Power: number;
  march2Power: number;
  march3Power: number;
  march4Power: number;
  combatPower: number;
  kills: number;
  createdAt: string;
  updatedAt: string;
};

type ApplicantDraft = SharedDraft & {
  timezone: string;
  status: string;
};

type MigrationDraft = SharedDraft & {
  originalServer: string;
  originalAlliance: string;
  reasonForLeaving: string;
  contactStatus: string;
  category: string;
  status: string;
};

type RecruitmentRecommendation = string;

type ApplicantRow = ApplicantRecord & {
  score: number;
  recommendation: RecruitmentRecommendation;
  effectiveCategory: string;
  hasWarning: boolean;
};

type MigrationRow = MigrationRecord & {
  score: number;
  recommendation: RecruitmentRecommendation;
  effectiveCategory: string;
  hasWarning: boolean;
};

type RecruitmentRow = ApplicantRow | MigrationRow;

type SharedDraft = {
  name: string;
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
  march1Power: number;
  march2Power: number;
  march3Power: number;
  march4Power: number;
  combatPower: number;
  kills: number;
  notes: string;
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
  march1Power: 0,
  march2Power: 0,
  march3Power: 0,
  march4Power: 0,
  combatPower: 0,
  kills: 0,
  notes: "",
};

const emptyApplicantDraft = {
  ...emptySharedDraft,
  timezone: "UTC-6",
  status: "New",
} satisfies ApplicantDraft;

const emptyMigrationDraft = {
  ...emptySharedDraft,
  originalServer: "",
  originalAlliance: "",
  reasonForLeaving: "",
  contactStatus: "Not Contacted",
  category: "Regular",
  status: "Scouted",
} satisfies MigrationDraft;

function isMigrationRow(row: RecruitmentRow): row is MigrationRow {
  return "originalServer" in row;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function normalizeCsvHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsvText(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map(normalizeCsvHeader);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });
}

function csvNumber(value: string | undefined) {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function getCsvValue(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeCsvHeader(key);
    const value = row[normalized];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return "";
}

function preferNonZero(current: number, incoming: number) {
  return current === 0 && incoming > 0 ? incoming : current;
}

function preferBlank(current: string, incoming: string) {
  return current.trim() === "" && incoming.trim() !== "" ? incoming : current;
}

function toApplicantDraftFromCsv(row: Record<string, string>): ApplicantDraft {
  return {
    name: getCsvValue(row, "player name", "name"),
    timezone: getCsvValue(row, "timezone") || "UTC-6",
    status: getCsvValue(row, "status") || "New",
    techPower: csvNumber(getCsvValue(row, "tech power", "tech")),
    heroPower: csvNumber(getCsvValue(row, "hero power", "hero")),
    troopPower: csvNumber(getCsvValue(row, "troop power", "troop")),
    modVehiclePower: csvNumber(getCsvValue(row, "mod vehicle power", "mod vehicle", "modvehicle")),
    structurePower: csvNumber(getCsvValue(row, "structure power", "structure")),
    march1Power: csvNumber(getCsvValue(row, "march 1 power", "march1power", "march1")),
    march2Power: csvNumber(getCsvValue(row, "march 2 power", "march2power", "march2")),
    march3Power: csvNumber(getCsvValue(row, "march 3 power", "march3power", "march3")),
    march4Power: csvNumber(getCsvValue(row, "march 4 power", "march4power", "march4")),
    combatPower: 0,
    kills: csvNumber(getCsvValue(row, "kills")),
    notes: getCsvValue(row, "notes"),
  };
}

function toMigrationDraftFromCsv(row: Record<string, string>): MigrationDraft {
  return {
    name: getCsvValue(row, "player name", "name"),
    originalServer: getCsvValue(row, "original server", "server", "origin server"),
    originalAlliance: getCsvValue(row, "original alliance", "alliance", "origin alliance"),
    reasonForLeaving: getCsvValue(row, "reason for leaving", "reason"),
    contactStatus: getCsvValue(row, "contact status", "contact") || "Not Contacted",
    category: getCsvValue(row, "category") || "Regular",
    status: getCsvValue(row, "status") || "Scouted",
    techPower: csvNumber(getCsvValue(row, "tech power", "tech")),
    heroPower: csvNumber(getCsvValue(row, "hero power", "hero")),
    troopPower: csvNumber(getCsvValue(row, "troop power", "troop")),
    modVehiclePower: csvNumber(getCsvValue(row, "mod vehicle power", "mod vehicle", "modvehicle")),
    structurePower: csvNumber(getCsvValue(row, "structure power", "structure")),
    march1Power: csvNumber(getCsvValue(row, "march 1 power", "march1power", "march1")),
    march2Power: csvNumber(getCsvValue(row, "march 2 power", "march2power", "march2")),
    march3Power: csvNumber(getCsvValue(row, "march 3 power", "march3power", "march3")),
    march4Power: csvNumber(getCsvValue(row, "march 4 power", "march4power", "march4")),
    combatPower: 0,
    kills: csvNumber(getCsvValue(row, "kills")),
    notes: getCsvValue(row, "notes"),
  };
}

function mergeApplicantDraft(existing: ApplicantRecord, incoming: ApplicantDraft): ApplicantDraft {
  return {
    name: existing.name,
    timezone: preferBlank(existing.timezone, incoming.timezone) || "UTC-6",
    status: existing.status || incoming.status,
    techPower: preferNonZero(existing.techPower, incoming.techPower),
    heroPower: preferNonZero(existing.heroPower, incoming.heroPower),
    troopPower: preferNonZero(existing.troopPower, incoming.troopPower),
    modVehiclePower: preferNonZero(existing.modVehiclePower, incoming.modVehiclePower),
    structurePower: preferNonZero(existing.structurePower, incoming.structurePower),
    march1Power: preferNonZero(existing.march1Power, incoming.march1Power),
    march2Power: preferNonZero(existing.march2Power, incoming.march2Power),
    march3Power: preferNonZero(existing.march3Power, incoming.march3Power),
    march4Power: preferNonZero(existing.march4Power, incoming.march4Power),
    combatPower: 0,
    kills: preferNonZero(existing.kills, incoming.kills),
    notes: preferBlank(existing.notes, incoming.notes),
  };
}

function mergeMigrationDraft(existing: MigrationRecord, incoming: MigrationDraft): MigrationDraft {
  return {
    name: existing.name,
    originalServer: preferBlank(existing.originalServer, incoming.originalServer),
    originalAlliance: preferBlank(existing.originalAlliance, incoming.originalAlliance),
    reasonForLeaving: preferBlank(existing.reasonForLeaving, incoming.reasonForLeaving),
    contactStatus: existing.contactStatus || incoming.contactStatus,
    category: existing.category || incoming.category || "Regular",
    status: existing.status || incoming.status,
    techPower: preferNonZero(existing.techPower, incoming.techPower),
    heroPower: preferNonZero(existing.heroPower, incoming.heroPower),
    troopPower: preferNonZero(existing.troopPower, incoming.troopPower),
    modVehiclePower: preferNonZero(existing.modVehiclePower, incoming.modVehiclePower),
    structurePower: preferNonZero(existing.structurePower, incoming.structurePower),
    march1Power: preferNonZero(existing.march1Power, incoming.march1Power),
    march2Power: preferNonZero(existing.march2Power, incoming.march2Power),
    march3Power: preferNonZero(existing.march3Power, incoming.march3Power),
    march4Power: preferNonZero(existing.march4Power, incoming.march4Power),
    combatPower: 0,
    kills: preferNonZero(existing.kills, incoming.kills),
    notes: preferBlank(existing.notes, incoming.notes),
  };
}

function createCsvTemplate(scope: "applicants" | "migrations") {
  const headers =
    scope === "applicants"
      ? [
          "player_name",
          "timezone",
          "status",
          "tech_power",
          "hero_power",
          "troop_power",
          "mod_vehicle_power",
          "structure_power",
          "march_1_power",
          "march_2_power",
          "march_3_power",
          "march_4_power",
          "kills",
          "notes",
        ]
      : [
          "player_name",
          "original_server",
          "original_alliance",
          "status",
          "contact_status",
          "category",
          "reason_for_leaving",
          "tech_power",
          "hero_power",
          "troop_power",
          "mod_vehicle_power",
          "structure_power",
          "march_1_power",
          "march_2_power",
          "march_3_power",
          "march_4_power",
          "kills",
          "notes",
        ];

  const sample =
    scope === "applicants"
      ? [
          "SamplePlayer",
          "UTC-6",
          "New",
          "19255142",
          "56195929",
          "81674460",
          "8061391",
          "63673199",
          "0",
          "0",
          "0",
          "0",
          "4341281",
          "Optional notes",
        ]
      : [
          "SamplePlayer",
          "123",
          "PHnx",
          "Scouted",
          "Not Contacted",
          "Regular",
          "Optional reason",
          "19255142",
          "56195929",
          "81674460",
          "8061391",
          "63673199",
          "0",
          "0",
          "0",
          "0",
          "4341281",
          "Optional notes",
        ];

  return `${headers.join(",")}\n${sample.join(",")}\n`;
}

function marchTotal(entry: Pick<SharedDraft, "march1Power" | "march2Power" | "march3Power" | "march4Power">) {
  return entry.march1Power + entry.march2Power + entry.march3Power + entry.march4Power;
}

function effectiveCombatPower(entry: SharedDraft) {
  return marchTotal(entry);
}

function hasMissingStats(entry: SharedDraft) {
  return [
    entry.techPower,
    entry.heroPower,
    entry.troopPower,
    entry.modVehiclePower,
    entry.structurePower,
    effectiveCombatPower(entry),
    entry.kills,
  ].some((value) => value === 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
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
  a: RecruitmentRow,
  b: RecruitmentRow,
  sort: { key: ApplicantSortKey | MigrationSortKey; direction: SortDirection }
) {
  switch (sort.key) {
    case "warning":
      return compareValues(a.hasWarning, b.hasWarning, sort.direction);
    case "name":
      return compareValues(a.name, b.name, sort.direction);
    case "timezone":
      return compareValues(isMigrationRow(a) ? "" : a.timezone, isMigrationRow(b) ? "" : b.timezone, sort.direction);
    case "originalServer":
      return compareValues(isMigrationRow(a) ? a.originalServer : "", isMigrationRow(b) ? b.originalServer : "", sort.direction);
    case "originalAlliance":
      return compareValues(isMigrationRow(a) ? a.originalAlliance : "", isMigrationRow(b) ? b.originalAlliance : "", sort.direction);
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
      // @ts-expect-error Tesseract accepts this runtime option even though the package type omits it.
      tessedit_pageseg_mode: "7",
    });
    return result.data.text.replace(/[^a-zA-Z ]/g, "").trim().replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

export default function RecruitmentPanel({
  initialApplicants,
  initialMigrations,
  initialApplicantWeights,
  initialMigrationWeights,
  initialApplicantThresholds,
  initialMigrationThresholds,
  canManage,
}: {
  initialApplicants: ApplicantRecord[];
  initialMigrations: MigrationRecord[];
  initialApplicantWeights: RecruitmentScoreWeights;
  initialMigrationWeights: RecruitmentScoreWeights;
  initialApplicantThresholds: RecruitmentRecommendationThresholds;
  initialMigrationThresholds: RecruitmentRecommendationThresholds;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"applicants" | "migrations">("applicants");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [applicants, setApplicants] = useState(initialApplicants);
  const [migrations, setMigrations] = useState(initialMigrations);
  const [applicantDraft, setApplicantDraft] = useState<ApplicantDraft>(emptyApplicantDraft);
  const [migrationDraft, setMigrationDraft] = useState<MigrationDraft>(emptyMigrationDraft);
  const [applicantEditId, setApplicantEditId] = useState<string | null>(null);
  const [migrationEditId, setMigrationEditId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [applicantWeights, setApplicantWeights] = useState<RecruitmentScoreWeights>(initialApplicantWeights);
  const [migrationWeights, setMigrationWeights] = useState<RecruitmentScoreWeights>(initialMigrationWeights);
  const [applicantThresholds, setApplicantThresholds] =
    useState<RecruitmentRecommendationThresholds>(initialApplicantThresholds);
  const [migrationThresholds, setMigrationThresholds] =
    useState<RecruitmentRecommendationThresholds>(initialMigrationThresholds);
  const [dirtyWeights, setDirtyWeights] = useState<{ applicants: boolean; migrations: boolean }>({
    applicants: false,
    migrations: false,
  });
  const [savingWeightsScope, setSavingWeightsScope] = useState<"applicants" | "migrations" | null>(null);
  const [expandedRowIds, setExpandedRowIds] = useState<string[]>([]);
  const [applicantSort, setApplicantSort] = useState<{ key: ApplicantSortKey; direction: SortDirection }>({
    key: "score",
    direction: "desc",
  });
  const [migrationSort, setMigrationSort] = useState<{ key: MigrationSortKey; direction: SortDirection }>({
    key: "score",
    direction: "desc",
  });
  const formPanelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setApplicantWeights(initialApplicantWeights);
    setMigrationWeights(initialMigrationWeights);
    setApplicantThresholds(initialApplicantThresholds);
    setMigrationThresholds(initialMigrationThresholds);
    setDirtyWeights({ applicants: false, migrations: false });
  }, [
    initialApplicantThresholds,
    initialApplicantWeights,
    initialMigrationThresholds,
    initialMigrationWeights,
  ]);

  const applicantRows = useMemo<ApplicantRow[]>(
    () =>
        applicants
          .map((entry) => {
            const score = computeRecruitmentScore(entry, applicantWeights);
            return {
              ...entry,
              score,
              recommendation: getRecommendationBand(score, applicantThresholds),
              effectiveCategory: "",
              hasWarning: hasMissingStats(entry),
            };
          })
          .sort((a, b) => compareRecruitmentRows(a, b, applicantSort)),
    [applicants, applicantThresholds, applicantWeights, applicantSort]
  );
  const migrationRows = useMemo<MigrationRow[]>(
    () =>
        migrations
          .map((entry) => {
            const score = computeRecruitmentScore(entry, migrationWeights);
            return {
              ...entry,
              score,
              recommendation: getRecommendationBand(score, migrationThresholds),
              effectiveCategory: entry.category || getCategoryFromScore(score),
              hasWarning: hasMissingStats(entry),
            };
          })
          .sort((a, b) => compareRecruitmentRows(a, b, migrationSort)),
    [migrations, migrationThresholds, migrationWeights, migrationSort]
  );

  const currentRows = useMemo<RecruitmentRow[]>(() => {
    const rows: RecruitmentRow[] = tab === "applicants" ? applicantRows : migrationRows;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(query));
  }, [tab, applicantRows, migrationRows, searchQuery]);

  const summaryRows = useMemo(() => {
    const rows = currentRows;
    return {
      total: rows.length,
      strongFit: rows.filter((row) => row.recommendation === "Strong Fit").length,
      borderline: rows.filter((row) => row.recommendation === "Borderline").length,
      lowPriority: rows.filter((row) => row.recommendation === "Low Priority").length,
      byCategory:
        tab === "migrations"
          ? recruitmentCategories.map((category) => ({
              category,
              count: rows.filter((row) => row.effectiveCategory === category).length,
            }))
          : [],
    };
  }, [currentRows, tab]);

  const currentFormula =
    tab === "applicants"
      ? getFormulaLabel("applicants", applicantWeights)
      : getFormulaLabel("migrations", migrationWeights);
  const currentWeightTotal = totalWeight(tab === "applicants" ? applicantWeights : migrationWeights);
  const currentWeightsDirty = dirtyWeights[tab];
  const currentThresholds = tab === "applicants" ? applicantThresholds : migrationThresholds;

  const downloadCsvTemplate = () => {
    const csv = createCsvTemplate(tab);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = tab === "applicants" ? "applicant-template.csv" : "migration-candidates-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleScreenshot = async (file: File) => {
    setIsScanning(true);
    setMessage(null);
    try {
      const [parsed, nameResult] = await Promise.all([
        parseLastZProfileImage(file),
        extractNameFromImage(file),
      ]);
      const nextShared = {
        name: nameResult || parsed.name === "Unknown Player" ? nameResult || "" : parsed.name,
        techPower: parsed.powerStats.tech,
        heroPower: parsed.powerStats.hero,
        troopPower: parsed.powerStats.troop,
        modVehiclePower: parsed.powerStats.modVehicle,
        structurePower: parsed.powerStats.structure,
        march1Power: 0,
        march2Power: 0,
        march3Power: 0,
        march4Power: 0,
        // Combat power in recruitment is march-based; profile screenshots do not include it.
        combatPower: 0,
        kills: parsed.kills,
        notes: "",
      };

      if (tab === "applicants") {
        setApplicantDraft((prev) => ({ ...prev, ...nextShared }));
      } else {
        const nextScore = computeRecruitmentScore(nextShared, migrationWeights);
        setMigrationDraft((prev) => ({ ...prev, ...nextShared, category: getCategoryFromScore(nextScore) }));
      }

      setMessage({ type: "success", text: "Screenshot parsed into a draft. Review the fields before saving." });
    } catch (error: unknown) {
      setMessage({ type: "error", text: getErrorMessage(error) || "Failed to parse screenshot." });
    } finally {
      setIsScanning(false);
    }
  };

  const handleCsvImport = async (file: File) => {
    setIsScanning(true);
    setMessage(null);

    try {
      const text = await file.text();
      const rows = parseCsvText(text);
      if (rows.length === 0) {
        throw new Error("CSV is empty or missing data rows.");
      }

      if (tab === "applicants") {
        const createdRecords: ApplicantRecord[] = [];
        let successCount = 0;
        let enrichedCount = 0;

        for (const row of rows) {
          const draft = toApplicantDraftFromCsv(row);
          if (!draft.name.trim()) {
            continue;
          }

          const existingApplicant = applicants.find(
            (entry) => entry.name.trim().toLowerCase() === draft.name.trim().toLowerCase()
          );
          const payload = existingApplicant
            ? { ...mergeApplicantDraft(existingApplicant, draft), id: existingApplicant.id }
            : draft;

          const result = await saveApplicant(payload);
          if (!result.success || !result.record) {
            throw new Error(result.error || `Failed to import applicant ${draft.name}.`);
          }

          createdRecords.push({
            ...result.record,
            createdAt: new Date(result.record.createdAt).toISOString(),
            updatedAt: new Date(result.record.updatedAt).toISOString(),
          });
          if (existingApplicant) {
            enrichedCount += 1;
          } else {
            successCount += 1;
          }
        }

        if (successCount === 0 && enrichedCount === 0) {
          throw new Error("No valid applicant rows were found in the CSV.");
        }

        setApplicants((prev) => {
          const merged = [...prev];
          for (const record of createdRecords) {
            const existingIndex = merged.findIndex((entry) => entry.id === record.id);
            if (existingIndex >= 0) {
              merged[existingIndex] = record;
            } else {
              merged.unshift(record);
            }
          }
          return merged;
        });

        setMessage({
          type: "success",
          text: `Applicants import complete. Created: ${successCount}. Enriched existing: ${enrichedCount}.`,
        });
      } else {
        const createdRecords: MigrationRecord[] = [];
        let createdCount = 0;
        let enrichedCount = 0;

        for (const row of rows) {
          const draft = toMigrationDraftFromCsv(row);
          if (!draft.name.trim()) {
            continue;
          }

          const existingMigration = migrations.find(
            (entry) => entry.name.trim().toLowerCase() === draft.name.trim().toLowerCase()
          );
          const payload = existingMigration
            ? { ...mergeMigrationDraft(existingMigration, draft), id: existingMigration.id }
            : draft;

          const result = await saveMigrationCandidate(payload);
          if (!result.success || !result.record) {
            throw new Error(result.error || `Failed to import migration candidate ${draft.name}.`);
          }

          createdRecords.push({
            ...result.record,
            createdAt: new Date(result.record.createdAt).toISOString(),
            updatedAt: new Date(result.record.updatedAt).toISOString(),
          });
          if (existingMigration) {
            enrichedCount += 1;
          } else {
            createdCount += 1;
          }
        }

        if (createdCount === 0 && enrichedCount === 0) {
          throw new Error("No valid migration rows were found in the CSV.");
        }

        setMigrations((prev) => {
          const merged = [...prev];
          for (const record of createdRecords) {
            const existingIndex = merged.findIndex((entry) => entry.id === record.id);
            if (existingIndex >= 0) {
              merged[existingIndex] = record;
            } else {
              merged.unshift(record);
            }
          }
          return merged;
        });

        setMessage({
          type: "success",
          text: `Migration import complete. Created: ${createdCount}. Enriched existing: ${enrichedCount}.`,
        });
      }
    } catch (error: unknown) {
      setMessage({ type: "error", text: getErrorMessage(error) || "Failed to import CSV." });
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
        const record = result.record;
        const nextEntry = {
          ...(applicantEditId
            ? applicants.find((entry) => entry.id === applicantEditId)!
            : { id: `temp-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
          ...(record
            ? {
                ...record,
                createdAt: new Date(record.createdAt).toISOString(),
                updatedAt: new Date(record.updatedAt).toISOString(),
              }
            : {
                ...applicantDraft,
                updatedAt: new Date().toISOString(),
              }),
        };
        setApplicants((prev) =>
          applicantEditId ? prev.map((entry) => (entry.id === applicantEditId ? nextEntry : entry)) : [nextEntry, ...prev]
        );
        setApplicantDraft(emptyApplicantDraft);
        setApplicantEditId(null);
        setMessage({ type: "success", text: "Applicant saved." });
      } else {
        const result = await saveMigrationCandidate({ id: migrationEditId ?? undefined, ...migrationDraft });
        if (!result.success) {
          setMessage({ type: "error", text: result.error || "Failed to save migration candidate." });
          return;
        }
        const record = result.record;
        const nextEntry = {
          ...(migrationEditId
            ? migrations.find((entry) => entry.id === migrationEditId)!
            : { id: `temp-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
          ...(record
            ? {
                ...record,
                createdAt: new Date(record.createdAt).toISOString(),
                updatedAt: new Date(record.updatedAt).toISOString(),
              }
            : {
                ...migrationDraft,
                updatedAt: new Date().toISOString(),
              }),
        };
        setMigrations((prev) =>
          migrationEditId ? prev.map((entry) => (entry.id === migrationEditId ? nextEntry : entry)) : [nextEntry, ...prev]
        );
        setMigrationDraft(emptyMigrationDraft);
        setMigrationEditId(null);
        setMessage({ type: "success", text: "Migration candidate saved." });
      }
    });
  };

  const editApplicant = (entry: ApplicantRecord) => {
    setApplicantEditId(entry.id);
    setExpandedRowIds((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]));
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
      march1Power: entry.march1Power,
      march2Power: entry.march2Power,
      march3Power: entry.march3Power,
      march4Power: entry.march4Power,
      combatPower: entry.combatPower,
      kills: entry.kills,
    });
    setMessage({ type: "success", text: `Inline editing applicant: ${entry.name}` });
  };

  const editMigration = (entry: MigrationRecord) => {
    setMigrationEditId(entry.id);
    setExpandedRowIds((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]));
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
      march1Power: entry.march1Power,
      march2Power: entry.march2Power,
      march3Power: entry.march3Power,
      march4Power: entry.march4Power,
      combatPower: entry.combatPower,
      kills: entry.kills,
    });
    setMessage({ type: "success", text: `Inline editing migration candidate: ${entry.name}` });
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

  const saveFormula = () => {
    if (!canManage) return;

    const scope = tab;
    const weights = scope === "applicants" ? applicantWeights : migrationWeights;
    const thresholds = scope === "applicants" ? applicantThresholds : migrationThresholds;
    const total = totalWeight(weights);
    if (Math.abs(total - 1) >= 0.0001) {
      setMessage({
        type: "error",
        text: "The scoring formula must total exactly 100% before you can save it.",
      });
      return;
    }
    if (thresholds.strongFit <= thresholds.borderline) {
      setMessage({
        type: "error",
        text: "Strong Fit threshold must be higher than Borderline.",
      });
      return;
    }

    setMessage(null);
    setSavingWeightsScope(scope);
    startTransition(async () => {
      try {
        const result = await saveRecruitmentScoringConfig({ scope, weights, thresholds });
        if (result.success) {
          if (scope === "applicants") {
            if (result.weights) {
              setApplicantWeights(result.weights);
            }
            if (result.thresholds) {
              setApplicantThresholds(result.thresholds);
            }
          } else {
            if (result.weights) {
              setMigrationWeights(result.weights);
            }
            if (result.thresholds) {
              setMigrationThresholds(result.thresholds);
            }
          }
          setDirtyWeights((prev) => ({ ...prev, [scope]: false }));
          setMessage({ type: "success", text: `${scope === "applicants" ? "Applicant" : "Migration"} scoring formula saved.` });
          router.refresh();
        } else {
          setMessage({ type: "error", text: result.error || "Failed to save recruitment scoring weights." });
        }
      } catch (error: unknown) {
        setMessage({ type: "error", text: getErrorMessage(error) || "Failed to save recruitment scoring weights." });
      }
      setSavingWeightsScope(null);
    });
  };

  const clearInlineEdit = () => {
    if (tab === "applicants") {
      setApplicantDraft(emptyApplicantDraft);
      setApplicantEditId(null);
    } else {
      setMigrationDraft(emptyMigrationDraft);
      setMigrationEditId(null);
    }
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
            Strong Fit: {currentThresholds.strongFit}+ | Borderline: {currentThresholds.borderline}+ | Low Priority: under {currentThresholds.borderline}
          </div>
        </div>

      {canManage && (
        <section className="cyber-card flex-col gap-4">
          <h3 style={{ color: "var(--accent-neon)" }}>
            {tab === "applicants" ? "Applicant Scoring Engine" : "Migration Scoring Engine"}
          </h3>
          <div style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>
            Adjust the score weights for this tab. Changes auto-save for all leaders and admins so everyone sees the same formula.
          </div>
            <div style={miniStatsGridStyle}>
              <WeightField label="Troop" value={(tab === "applicants" ? applicantWeights : migrationWeights).troop} onChange={(value) => handleWeightChange(tab, "troop", value, setApplicantWeights, setMigrationWeights, setDirtyWeights)} />
              <WeightField label="Hero" value={(tab === "applicants" ? applicantWeights : migrationWeights).hero} onChange={(value) => handleWeightChange(tab, "hero", value, setApplicantWeights, setMigrationWeights, setDirtyWeights)} />
              <WeightField label="Tech" value={(tab === "applicants" ? applicantWeights : migrationWeights).tech} onChange={(value) => handleWeightChange(tab, "tech", value, setApplicantWeights, setMigrationWeights, setDirtyWeights)} />
              <WeightField label="Kills" value={(tab === "applicants" ? applicantWeights : migrationWeights).kills} onChange={(value) => handleWeightChange(tab, "kills", value, setApplicantWeights, setMigrationWeights, setDirtyWeights)} />
              <WeightField label="Structure" value={(tab === "applicants" ? applicantWeights : migrationWeights).structure} onChange={(value) => handleWeightChange(tab, "structure", value, setApplicantWeights, setMigrationWeights, setDirtyWeights)} />
              <WeightField label="Mod Vehicle" value={(tab === "applicants" ? applicantWeights : migrationWeights).modVehicle} onChange={(value) => handleWeightChange(tab, "modVehicle", value, setApplicantWeights, setMigrationWeights, setDirtyWeights)} />
            </div>
            <div style={miniStatsGridStyle}>
              <ThresholdField
                label="Strong Fit Starts"
                value={currentThresholds.strongFit}
                onChange={(value) =>
                  tab === "applicants"
                    ? (setApplicantThresholds((prev) => ({ ...prev, strongFit: value })), setDirtyWeights((prev) => ({ ...prev, applicants: true })))
                    : (setMigrationThresholds((prev) => ({ ...prev, strongFit: value })), setDirtyWeights((prev) => ({ ...prev, migrations: true })))
                }
              />
              <ThresholdField
                label="Borderline Starts"
                value={currentThresholds.borderline}
                onChange={(value) =>
                  tab === "applicants"
                    ? (setApplicantThresholds((prev) => ({ ...prev, borderline: value })), setDirtyWeights((prev) => ({ ...prev, applicants: true })))
                    : (setMigrationThresholds((prev) => ({ ...prev, borderline: value })), setDirtyWeights((prev) => ({ ...prev, migrations: true })))
                }
              />
            </div>
            <div className="flex-row justify-between gap-3 items-center" style={{ flexWrap: "wrap" }}>
              <div
                style={{
                  borderRadius: "6px",
                  padding: "0.8rem 1rem",
                  border: `1px solid ${Math.abs(currentWeightTotal - 1) < 0.0001 ? "var(--accent-neon)" : currentWeightTotal > 1 ? "var(--accent-red)" : "var(--accent-purple)"}`,
                  backgroundColor: Math.abs(currentWeightTotal - 1) < 0.0001 ? "rgba(0,255,157,0.08)" : currentWeightTotal > 1 ? "rgba(255,51,102,0.08)" : "rgba(153,0,255,0.08)",
                  color: Math.abs(currentWeightTotal - 1) < 0.0001 ? "var(--accent-neon)" : currentWeightTotal > 1 ? "var(--accent-red)" : "var(--accent-purple)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.84rem",
                }}
              >
                Total Weight: {(currentWeightTotal * 100).toFixed(0)}%
                {Math.abs(currentWeightTotal - 1) < 0.0001
                  ? " (Ready to save)"
                  : currentWeightTotal > 1
                    ? " (Over 100%)"
                    : " (Target: 100%)"}
              </div>
              <button
                className="cyber-button primary"
                onClick={saveFormula}
                disabled={
                  isPending ||
                  savingWeightsScope === tab ||
                  !currentWeightsDirty ||
                  Math.abs(currentWeightTotal - 1) >= 0.0001 ||
                  currentThresholds.strongFit <= currentThresholds.borderline
                }
              >
                {savingWeightsScope === tab ? "SAVING FORMULA..." : "SAVE FORMULA"}
              </button>
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
        {tab === "migrations" && summaryRows.byCategory.length > 0 && (
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
        )}
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
              <label className="cyber-label">CSV Import</label>
              <div className="flex-row gap-2" style={{ flexWrap: "wrap" }}>
                <label className="cyber-button" style={{ cursor: isScanning ? "not-allowed" : "pointer", opacity: isScanning ? 0.65 : 1 }}>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    disabled={isScanning}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void handleCsvImport(file);
                      }
                      e.currentTarget.value = "";
                    }}
                  />
                  <Upload size={14} />
                  <span>Upload CSV</span>
                </label>
                <button className="cyber-button" type="button" onClick={downloadCsvTemplate}>
                  <Download size={14} />
                  <span>Download Template</span>
                </button>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                {tab === "applicants"
                  ? "Bulk import names, timezone, status, stats, marches, kills, and notes."
                  : "Bulk import server/alliance info, contact status, category, stats, marches, kills, and notes."}
              </div>
            </div>
          </section>

          <section ref={formPanelRef} className="cyber-card flex-col gap-4">
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
                Current score: {tab === "applicants" ? computeRecruitmentScore(applicantDraft, applicantWeights).toFixed(2) : computeRecruitmentScore(migrationDraft, migrationWeights).toFixed(2)}
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
          <div className="flex-row justify-between gap-3" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: "220px", flex: "1 1 320px" }}>
              <div style={summaryLabelStyle}>Search {tab === "applicants" ? "Applicant" : "Candidate"}</div>
              <input
                className="cyber-input"
                placeholder={`Type a ${tab === "applicants" ? "player" : "candidate"} name...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
              Showing {currentRows.length} of {(tab === "applicants" ? applicantRows : migrationRows).length}
            </div>
          </div>
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
                  {tab === "migrations" && (
                    <SortableHeaderCell
                      active={migrationSort.key === "category"}
                      direction={migrationSort.key === "category" ? migrationSort.direction : null}
                      onClick={() => toggleSort("category")}
                    >
                      Category
                    </SortableHeaderCell>
                  )}
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
                {currentRows.map((row, index) => {
                  const migrationRow: MigrationRow | null = isMigrationRow(row) ? row : null;
                  const applicantRow: ApplicantRow | null = isMigrationRow(row) ? null : row;

                  return (
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
                        {row.hasWarning ? (
                          <span title="One or more important stats are zero and should be reviewed" style={{ color: "#ffd166", display: "inline-flex", alignItems: "center" }}>
                            <AlertTriangle size={15} />
                          </span>
                        ) : (
                          "—"
                        )}
                      </BodyCell>
                      <BodyCell strong>{`${index + 1}. ${row.name}`}</BodyCell>
                      {migrationRow && <BodyCell>{migrationRow.originalServer}</BodyCell>}
                      {migrationRow && <BodyCell>{migrationRow.originalAlliance}</BodyCell>}
                      {applicantRow && <BodyCell>{applicantRow.timezone || "-"}</BodyCell>}
                      {migrationRow && <BodyCell><span style={categoryBadgeStyle(migrationRow.effectiveCategory)}>{migrationRow.effectiveCategory}</span></BodyCell>}
                      <BodyCell>{row.status}</BodyCell>
                      <BodyCell>{row.score.toFixed(2)}</BodyCell>
                      <BodyCell><span style={badgeStyle(row.recommendation)}>{row.recommendation}</span></BodyCell>
                      <BodyCell>{formatDate(row.updatedAt)}</BodyCell>
                      {canManage && (
                        <BodyCell>
                          <div className="flex-row gap-2" style={{ flexWrap: "wrap" }}>
                            <button className="cyber-button" onClick={() => (migrationRow ? editMigration(migrationRow) : editApplicant(applicantRow!))} aria-label="Edit record">
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
                            <MiniMetric label="Verify" value={row.hasWarning ? "Needs Review" : "OK"} />
                            {migrationRow && <MiniMetric label="Contact" value={migrationRow.contactStatus} />}
                            <MiniMetric label="Troop" value={row.troopPower.toLocaleString()} />
                            <MiniMetric label="Combat" value={effectiveCombatPower(row).toLocaleString()} />
                            <MiniMetric label="March 1" value={row.march1Power.toLocaleString()} />
                            <MiniMetric label="March 2" value={row.march2Power.toLocaleString()} />
                            <MiniMetric label="March 3" value={row.march3Power.toLocaleString()} />
                            <MiniMetric label="March 4" value={row.march4Power.toLocaleString()} />
                            <MiniMetric label="Kills" value={row.kills.toLocaleString()} />
                            <MiniMetric label="Hero" value={row.heroPower.toLocaleString()} />
                            <MiniMetric label="Tech" value={row.techPower.toLocaleString()} />
                            <MiniMetric label="Mod Vehicle" value={row.modVehiclePower.toLocaleString()} />
                            <MiniMetric label="Structure" value={row.structurePower.toLocaleString()} />
                          </div>
                          {migrationRow && (migrationRow.reasonForLeaving || migrationRow.notes) && (
                            <div style={{ marginTop: "0.9rem", color: "var(--text-muted)", fontSize: "0.84rem" }}>
                              {migrationRow.reasonForLeaving ? `Reason: ${migrationRow.reasonForLeaving}` : ""}
                              {migrationRow.reasonForLeaving && migrationRow.notes ? " | " : ""}
                              {migrationRow.notes ? `Notes: ${migrationRow.notes}` : ""}
                            </div>
                          )}
                          {tab === "applicants" && row.notes && (
                            <div style={{ marginTop: "0.9rem", color: "var(--text-muted)", fontSize: "0.84rem" }}>
                              Notes: {row.notes}
                            </div>
                          )}
                          {canManage &&
                            ((tab === "applicants" && applicantEditId === row.id) ||
                              (tab === "migrations" && migrationEditId === row.id)) && (
                              <div
                                className="cyber-card flex-col gap-4"
                                style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "rgba(0, 255, 231, 0.03)" }}
                              >
                                <div className="flex-row justify-between gap-3" style={{ flexWrap: "wrap", alignItems: "center" }}>
                                  <div style={{ color: "var(--accent-neon)", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
                                    Inline editing: {row.name}
                                  </div>
                                  <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                                    Live score: {tab === "applicants"
                                      ? computeRecruitmentScore(applicantDraft, applicantWeights).toFixed(2)
                                      : computeRecruitmentScore(migrationDraft, migrationWeights).toFixed(2)}
                                  </div>
                                </div>
                                {tab === "applicants" ? (
                                  <ApplicantForm draft={applicantDraft} setDraft={setApplicantDraft} />
                                ) : (
                                  <MigrationForm draft={migrationDraft} setDraft={setMigrationDraft} />
                                )}
                                <div className="flex-row justify-end gap-2" style={{ flexWrap: "wrap" }}>
                                  <button className="cyber-button" onClick={clearInlineEdit}>
                                    Cancel
                                  </button>
                                  <button className="cyber-button primary" onClick={saveCurrent} disabled={isPending}>
                                    {isPending ? "Saving..." : "Save Changes"}
                                  </button>
                                </div>
                              </div>
                            )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          {currentRows.map((row, index) => {
            const migrationRow: MigrationRow | null = isMigrationRow(row) ? row : null;
            const applicantRow: ApplicantRow | null = isMigrationRow(row) ? null : row;
            return (
            <section key={row.id} className="cyber-card flex-col gap-3">
              <div className="flex-row justify-between gap-3" style={{ alignItems: "flex-start" }}>
                <div>
                  <div style={summaryLabelStyle}>Rank #{index + 1}</div>
                  <h3 style={{ color: "var(--accent-neon)", marginTop: "0.35rem" }}>{row.name}</h3>
                </div>
                <span style={badgeStyle(row.recommendation)}>{row.recommendation}</span>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                {applicantRow
                  ? `Timezone: ${applicantRow.timezone || "-"}`
                  : `Server ${migrationRow?.originalServer || "-"} | ${migrationRow?.originalAlliance || "-"}`
                }
              </div>
              {migrationRow && (
                <div>
                  <span style={categoryBadgeStyle(migrationRow.effectiveCategory)}>{migrationRow.effectiveCategory}</span>
                </div>
              )}
              <div style={miniStatsGridStyle}>
                <MiniMetric label="Status" value={row.status} />
                {migrationRow && <MiniMetric label="Contact" value={migrationRow.contactStatus} />}
                <MiniMetric label="Troop" value={row.troopPower.toLocaleString()} />
                <MiniMetric label="Combat" value={effectiveCombatPower(row).toLocaleString()} />
                <MiniMetric label="Kills" value={row.kills.toLocaleString()} />
                <MiniMetric label="Score" value={row.score.toFixed(2)} />
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.84rem" }}>{row.notes || "No notes yet."}</div>
              {canManage && (
                <div className="flex-row justify-between gap-2" style={{ flexWrap: "wrap" }}>
                  <button className="cyber-button" onClick={() => (migrationRow ? editMigration(migrationRow) : editApplicant(applicantRow!))} aria-label="Edit record">
                    <Pencil size={14} />
                  </button>
                  <button className="cyber-button" style={{ borderColor: "var(--accent-red)", color: "var(--accent-red)" }} onClick={() => (tab === "applicants" ? removeApplicant(row.id) : removeMigration(row.id))}>
                    Remove
                  </button>
                </div>
              )}
            </section>
          );
        })}
        </div>
      )}
    </div>
  );
}

function ApplicantForm({
  draft,
  setDraft,
}: {
  draft: ApplicantDraft;
  setDraft: Dispatch<SetStateAction<ApplicantDraft>>;
}) {
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
      <SharedStatFields draft={draft} setDraft={setDraft} />
      <div style={{ gridColumn: "1 / -1" }}>
        <LabeledField label="Notes"><textarea className="cyber-input" rows={4} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></LabeledField>
      </div>
    </div>
  );
}

function MigrationForm({
  draft,
  setDraft,
}: {
  draft: MigrationDraft;
  setDraft: Dispatch<SetStateAction<MigrationDraft>>;
}) {
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

function SharedStatFields<T extends SharedDraft>({
  draft,
  setDraft,
}: {
  draft: T;
  setDraft: Dispatch<SetStateAction<T>>;
}) {
  const fields = [
    ["Tech Power", "techPower"],
    ["Hero Power", "heroPower"],
    ["Troop Power", "troopPower"],
    ["Mod Vehicle Power", "modVehiclePower"],
    ["Structure Power", "structurePower"],
    ["Kills", "kills"],
  ] as const;
  const combatPower = effectiveCombatPower(draft);

  return (
    <>
      {fields.map(([label, key]) => (
        <LabeledField key={key} label={label}>
          <input className="cyber-input" type="number" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) || 0 })} />
        </LabeledField>
      ))}
      <LabeledField label="March 1 Power">
        <input className="cyber-input" type="number" value={draft.march1Power} onChange={(e) => setDraft({ ...draft, march1Power: Number(e.target.value) || 0 })} />
      </LabeledField>
      <LabeledField label="March 2 Power">
        <input className="cyber-input" type="number" value={draft.march2Power} onChange={(e) => setDraft({ ...draft, march2Power: Number(e.target.value) || 0 })} />
      </LabeledField>
      <LabeledField label="March 3 Power">
        <input className="cyber-input" type="number" value={draft.march3Power} onChange={(e) => setDraft({ ...draft, march3Power: Number(e.target.value) || 0 })} />
      </LabeledField>
      <LabeledField label="March 4 Power (Optional)">
        <input className="cyber-input" type="number" value={draft.march4Power} onChange={(e) => setDraft({ ...draft, march4Power: Number(e.target.value) || 0 })} />
      </LabeledField>
      <LabeledField label="Combat Power (Auto)">
        <input className="cyber-input" type="text" value={combatPower.toLocaleString()} readOnly />
      </LabeledField>
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

function ThresholdField({
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
      <div style={summaryLabelStyle}>{label}</div>
      <input
        className="cyber-input"
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        style={{ marginTop: "0.45rem" }}
      />
      <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.35rem" }}>
        Score threshold
      </div>
    </div>
  );
}

function handleWeightChange(
  tab: "applicants" | "migrations",
  key: keyof RecruitmentScoreWeights,
  value: number,
  setApplicantWeights: Dispatch<SetStateAction<RecruitmentScoreWeights>>,
  setMigrationWeights: Dispatch<SetStateAction<RecruitmentScoreWeights>>,
  setDirtyWeights: Dispatch<SetStateAction<{ applicants: boolean; migrations: boolean }>>
) {
  if (tab === "applicants") {
    setApplicantWeights((prev) => ({ ...prev, [key]: value }));
    setDirtyWeights((prev) => ({ ...prev, applicants: true }));
  } else {
    setMigrationWeights((prev) => ({ ...prev, [key]: value }));
    setDirtyWeights((prev) => ({ ...prev, migrations: true }));
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
