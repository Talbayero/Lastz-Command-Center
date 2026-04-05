"use server";

import { parseAllianceDuelEntriesWithVision } from "@/utils/ai/vision";
import prisma from "@/utils/db";
import {
  ALLIANCE_DUEL_DAYS,
  ALLIANCE_DUEL_SCORE_TYPES,
  ensureAllianceDuelRequirements,
  getAllianceDuelDayLabel,
  getScoreScopeKey,
  type AllianceDuelScoreType,
} from "@/utils/allianceDuel";
import { requirePermission } from "@/utils/auth";
import { invalidateDuelDataCache } from "@/utils/cacheTags";
import { ensureRecordId, normalizeNonNegativeInt, sanitizePlayerName, sanitizeSingleLineText } from "@/utils/validation";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizePlayerName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

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

function isValidScoreType(value: string): value is AllianceDuelScoreType {
  return ALLIANCE_DUEL_SCORE_TYPES.includes(value as AllianceDuelScoreType);
}

function isValidAllianceDuelDay(value: string) {
  return (ALLIANCE_DUEL_DAYS as readonly string[]).includes(value);
}

async function parseAllianceDuelImage(input: { imageBase64: string; mimeType: string }) {
  return parseAllianceDuelEntriesWithVision(input);
}

export async function saveAllianceDuelRequirement(input: {
  dayKey: string;
  eventName: string;
  minimumScore: number;
}) {
  try {
    await requirePermission("manageAllianceDuel");
    await ensureAllianceDuelRequirements();

    if (!isValidAllianceDuelDay(input.dayKey)) {
      return { success: false, error: "Invalid duel day." };
    }

    await prisma.allianceDuelRequirement.update({
      where: { dayKey: input.dayKey },
      data: {
        eventName: sanitizeSingleLineText(input.eventName, 80) || getAllianceDuelDayLabel(input.dayKey),
        minimumScore: normalizeNonNegativeInt(input.minimumScore),
      },
    });
    invalidateDuelDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("ALLIANCE DUEL REQUIREMENT ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to save duel requirement.") };
  }
}

export async function saveAllianceDuelManualScore(input: {
  playerId: string;
  scoreType: string;
  dayKey?: string;
  score: number;
  rank?: number | null;
}) {
  try {
    await requirePermission("manageAllianceDuel");

    if (!isValidScoreType(input.scoreType)) {
      return { success: false, error: "Invalid duel score type." };
    }
    const playerId = ensureRecordId(input.playerId, "Player");

    const scopeKey = getScoreScopeKey(input.scoreType, input.dayKey);
    const normalizedRank = input.rank ? Math.max(1, Math.round(input.rank)) : null;

    await prisma.allianceDuelScore.upsert({
          where: {
            playerId_scoreType_dayKey: {
              playerId,
              scoreType: input.scoreType,
              dayKey: scopeKey,
            },
          },
          create: {
            playerId,
            scoreType: input.scoreType,
            dayKey: scopeKey,
            score: normalizeNonNegativeInt(input.score),
            rank: normalizedRank,
            source: "manual",
          },
          update: {
            score: normalizeNonNegativeInt(input.score),
            rank: normalizedRank,
            source: "manual",
      },
    });
    invalidateDuelDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("ALLIANCE DUEL MANUAL SAVE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to save duel score.") };
  }
}

export async function saveAllianceDuelParsedEntries(input: {
  scoreType: string;
  dayKey?: string;
  entries: Array<{ name: string; score: number; rank: number | null }>;
}) {
  try {
    await requirePermission("manageAllianceDuel");

    if (!isValidScoreType(input.scoreType)) {
      return { success: false, error: "Invalid duel score type." };
    }

    const scopeKey = getScoreScopeKey(input.scoreType, input.dayKey);
    const players = await prisma.player.findMany({
      where: { alliance: "BOM" },
      select: { id: true, name: true },
    });

    const playersByNormalizedName = new Map(players.map((player) => [normalizePlayerName(player.name), player]));
    const matchedEntries: Array<{ playerId: string; playerName: string; score: number; rank: number | null; detectedName: string }> = [];
    const unmatchedEntries: Array<{ name: string; score: number; rank: number | null }> = [];

    for (const rawEntry of input.entries) {
      const entry = {
        name: sanitizePlayerName(rawEntry.name),
        score: normalizeScore(rawEntry.score),
        rank: normalizeRank(rawEntry.rank),
      };
      const normalizedName = normalizePlayerName(entry.name);
      if (!normalizedName || entry.score <= 0) {
        continue;
      }

      let player = playersByNormalizedName.get(normalizedName);

      if (!player) {
        const looseMatches = players.filter((candidate) => {
          const candidateName = normalizePlayerName(candidate.name);
          return candidateName.includes(normalizedName) || normalizedName.includes(candidateName);
        });

        if (looseMatches.length === 1) {
          player = looseMatches[0];
        }
      }

      if (!player) {
        unmatchedEntries.push(entry);
        continue;
      }

      matchedEntries.push({
        playerId: player.id,
        playerName: player.name,
        score: entry.score,
        rank: entry.rank,
        detectedName: entry.name,
      });
    }

    await prisma.$transaction(
      matchedEntries.map((entry) =>
        prisma.allianceDuelScore.upsert({
          where: {
            playerId_scoreType_dayKey: {
              playerId: entry.playerId,
              scoreType: input.scoreType,
              dayKey: scopeKey,
            },
          },
          create: {
            playerId: entry.playerId,
            scoreType: input.scoreType,
            dayKey: scopeKey,
            score: entry.score,
            rank: entry.rank,
            source: "screenshot",
          },
          update: {
            score: entry.score,
            rank: entry.rank,
            source: "screenshot",
          },
        })
      )
    );
    invalidateDuelDataCache();
    return {
      success: true,
      appliedCount: matchedEntries.length,
      unmatchedNames: unmatchedEntries.map((entry) => entry.name),
      unmatchedEntries,
      updatedPlayers: matchedEntries,
      reviewEntries: [
        ...matchedEntries.map((entry) => ({
          detectedName: entry.detectedName,
          matchedPlayerId: entry.playerId,
          matchedPlayerName: entry.playerName,
          score: entry.score,
          rank: entry.rank,
        })),
        ...unmatchedEntries.map((entry) => ({
          detectedName: entry.name,
          matchedPlayerId: null,
          matchedPlayerName: null,
          score: entry.score,
          rank: entry.rank,
        })),
      ],
    };
  } catch (error: unknown) {
    console.error("ALLIANCE DUEL PARSED SAVE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to save parsed duel scores.") };
  }
}

export async function processAllianceDuelScreenshot(input: {
  imageBase64: string;
  mimeType: string;
  scoreType: string;
  dayKey?: string;
}) {
  try {
    await requirePermission("manageAllianceDuel");

    if (!isValidScoreType(input.scoreType)) {
      return { success: false, error: "Invalid duel score type." };
    }

    const scopeKey = getScoreScopeKey(input.scoreType, input.dayKey);
    const parsedEntries = await parseAllianceDuelImage({
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
    });

    const players = await prisma.player.findMany({
      where: { alliance: "BOM" },
      select: { id: true, name: true },
    });

    const playersByNormalizedName = new Map(players.map((player) => [normalizePlayerName(player.name), player]));

    const matchedEntries: Array<{ playerId: string; playerName: string; score: number; rank: number | null; detectedName: string }> = [];
    const unmatchedEntries: Array<{ name: string; score: number; rank: number | null }> = [];

    for (const entry of parsedEntries) {
      const normalizedName = normalizePlayerName(entry.name);
      if (!normalizedName || entry.score <= 0) {
        continue;
      }

      let player = playersByNormalizedName.get(normalizedName);

      if (!player) {
        const looseMatches = players.filter((candidate) => {
          const candidateName = normalizePlayerName(candidate.name);
          return candidateName.includes(normalizedName) || normalizedName.includes(candidateName);
        });

        if (looseMatches.length === 1) {
          player = looseMatches[0];
        }
      }

      if (!player) {
        unmatchedEntries.push({
          name: entry.name,
          score: entry.score,
          rank: entry.rank,
        });
        continue;
      }

      matchedEntries.push({
        playerId: player.id,
        playerName: player.name,
        score: entry.score,
        rank: entry.rank,
        detectedName: entry.name,
      });
    }

    await prisma.$transaction(
      matchedEntries.map((entry) =>
        prisma.allianceDuelScore.upsert({
          where: {
            playerId_scoreType_dayKey: {
              playerId: entry.playerId,
              scoreType: input.scoreType,
              dayKey: scopeKey,
            },
          },
          create: {
            playerId: entry.playerId,
            scoreType: input.scoreType,
            dayKey: scopeKey,
            score: entry.score,
            rank: entry.rank,
            source: "screenshot",
          },
          update: {
            score: entry.score,
            rank: entry.rank,
            source: "screenshot",
          },
        })
      )
    );
    invalidateDuelDataCache();
    return {
      success: true,
      appliedCount: matchedEntries.length,
      unmatchedNames: unmatchedEntries.map((entry) => entry.name),
      unmatchedEntries,
      updatedPlayers: matchedEntries,
      reviewEntries: [
        ...matchedEntries.map((entry) => ({
          detectedName: entry.detectedName,
          matchedPlayerId: entry.playerId,
          matchedPlayerName: entry.playerName,
          score: entry.score,
          rank: entry.rank,
        })),
        ...unmatchedEntries.map((entry) => ({
          detectedName: entry.name,
          matchedPlayerId: null,
          matchedPlayerName: null,
          score: entry.score,
          rank: entry.rank,
        })),
      ],
    };
  } catch (error: unknown) {
    console.error("ALLIANCE DUEL SCREENSHOT ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to process duel screenshot.") };
  }
}
