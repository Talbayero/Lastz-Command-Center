import prisma from "@/utils/db";

export const ALLIANCE_DUEL_SCORE_TYPES = ["daily", "weekly", "overall"] as const;
export type AllianceDuelScoreType = (typeof ALLIANCE_DUEL_SCORE_TYPES)[number];

export const ALLIANCE_DUEL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type AllianceDuelDayKey = (typeof ALLIANCE_DUEL_DAYS)[number];

export const DEFAULT_ALLIANCE_DUEL_REQUIREMENTS: Record<AllianceDuelDayKey, { eventName: string; minimumScore: number }> = {
  Mon: { eventName: "Mod Vehicle Boost", minimumScore: 3_000_000 },
  Tue: { eventName: "Shelter Upgrade", minimumScore: 2_000_000 },
  Wed: { eventName: "Age of Science", minimumScore: 3_000_000 },
  Thu: { eventName: "Hero Initiative", minimumScore: 6_000_000 },
  Fri: { eventName: "Holistic Growth", minimumScore: 3_000_000 },
  Sat: { eventName: "Enemy Buster", minimumScore: 6_000_000 },
};

const ALLIANCE_DUEL_REQUIREMENTS_ENSURE_TTL_MS = 10 * 60 * 1000;

let lastAllianceDuelRequirementsEnsureAt = 0;
let allianceDuelRequirementsEnsurePromise: Promise<void> | null = null;

export function getAllianceDuelDayLabel(dayKey: string) {
  return DEFAULT_ALLIANCE_DUEL_REQUIREMENTS[dayKey as AllianceDuelDayKey]?.eventName ?? dayKey;
}

export function getScoreScopeKey(scoreType: AllianceDuelScoreType, dayKey?: string) {
  return scoreType === "daily" ? dayKey ?? "Mon" : "ALL";
}

export async function ensureAllianceDuelRequirements() {
  const now = Date.now();
  if (
    lastAllianceDuelRequirementsEnsureAt &&
    now - lastAllianceDuelRequirementsEnsureAt < ALLIANCE_DUEL_REQUIREMENTS_ENSURE_TTL_MS
  ) {
    return;
  }

  if (allianceDuelRequirementsEnsurePromise) {
    return allianceDuelRequirementsEnsurePromise;
  }

  allianceDuelRequirementsEnsurePromise = (async () => {
  const existing = await prisma.allianceDuelRequirement.findMany({
    select: { dayKey: true },
  });

  const existingKeys = new Set(existing.map((entry) => entry.dayKey));
  const missing = ALLIANCE_DUEL_DAYS.filter((dayKey) => !existingKeys.has(dayKey));

  if (missing.length === 0) {
    lastAllianceDuelRequirementsEnsureAt = Date.now();
    return;
  }

  await prisma.allianceDuelRequirement.createMany({
    data: missing.map((dayKey) => ({
      dayKey,
      eventName: DEFAULT_ALLIANCE_DUEL_REQUIREMENTS[dayKey].eventName,
      minimumScore: DEFAULT_ALLIANCE_DUEL_REQUIREMENTS[dayKey].minimumScore,
    })),
  });
    lastAllianceDuelRequirementsEnsureAt = Date.now();
  })().finally(() => {
    allianceDuelRequirementsEnsurePromise = null;
  });

  return allianceDuelRequirementsEnsurePromise;
}
