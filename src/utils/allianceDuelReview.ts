import type { AllianceDuelScoreType } from "@/utils/allianceDuel";

export type DuelEntry = {
  score: number;
  rank: number | null;
};

export type DuelCompliance = "Met" | "Below Requirement" | "Missing Data" | "N/A";

export type LocalParsedEntry = {
  name: string;
  rank: number | null;
  score: number;
};

export type PositionedWord = {
  text: string;
  x0: number;
  y0: number;
  y1: number;
};

export function getAllianceDuelCompliance(
  scoreType: AllianceDuelScoreType,
  duelEntry: DuelEntry | null,
  minimumScore: number
): DuelCompliance {
  if (scoreType !== "daily") {
    return "N/A";
  }

  if (!duelEntry) {
    return "Missing Data";
  }

  return duelEntry.score >= minimumScore ? "Met" : "Below Requirement";
}

export function summarizeAllianceDuelCompliance(
  scoreType: AllianceDuelScoreType,
  compliances: DuelCompliance[]
) {
  if (scoreType !== "daily") {
    return {
      met: 0,
      below: 0,
      missing: compliances.filter((value) => value === "Missing Data").length,
    };
  }

  return compliances.reduce(
    (acc, compliance) => {
      if (compliance === "Met") acc.met += 1;
      else if (compliance === "Below Requirement") acc.below += 1;
      else if (compliance === "Missing Data") acc.missing += 1;
      return acc;
    },
    { met: 0, below: 0, missing: 0 }
  );
}

export function normalizeLocalScore(value: unknown) {
  const digitsOnly = String(value ?? "").replace(/[^\d]/g, "");
  return digitsOnly ? Number(digitsOnly) : 0;
}

export function normalizeLocalRank(value: unknown) {
  const digitsOnly = String(value ?? "").replace(/[^\d]/g, "");
  return digitsOnly ? Number(digitsOnly) : null;
}

export function parseAllianceDuelOcrRow(row: PositionedWord[]): LocalParsedEntry | null {
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

export function dedupeLocalEntries(entries: LocalParsedEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.name.toLowerCase().replace(/[^a-z0-9]/g, "")}::${entry.score}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
