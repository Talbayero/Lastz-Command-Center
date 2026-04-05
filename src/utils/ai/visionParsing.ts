type AllianceDuelJsonEntry = {
  name?: unknown;
  rank?: unknown;
  score?: unknown;
};

type AllianceDuelJsonResponse = {
  entries?: AllianceDuelJsonEntry[];
};

function normalizeScore(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  const digitsOnly = String(value ?? "").replace(/[^\d]/g, "");
  return digitsOnly ? Number(digitsOnly) : 0;
}

function normalizeRank(value: unknown) {
  const digitsOnly = String(value ?? "").replace(/[^\d]/g, "");
  return digitsOnly ? Number(digitsOnly) : null;
}

function extractJsonBlock(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return value;
  }
  return value.slice(start, end + 1);
}

function removeTrailingCommas(value: string) {
  return value.replace(/,\s*([}\]])/g, "$1");
}

export function parseVisionJsonResponse(rawText: string) {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [
    cleaned,
    extractJsonBlock(cleaned),
    removeTrailingCommas(extractJsonBlock(cleaned)),
    removeTrailingCommas(cleaned),
  ].filter(Boolean) as string[];

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error("Could not parse AI JSON response.");
    }
  }

  throw lastError ?? new Error("Could not parse AI JSON response.");
}

export function normalizeAllianceDuelEntriesFromJson(rawText: string) {
  const parsed = parseVisionJsonResponse(rawText) as AllianceDuelJsonResponse;
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];

  return entries.map((entry) => ({
    name: String(entry?.name ?? "").trim(),
    rank: normalizeRank(entry?.rank),
    score: normalizeScore(entry?.score),
  }));
}
