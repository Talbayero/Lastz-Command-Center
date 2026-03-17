"use server";

import { revalidatePath } from "next/cache";
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

const GEMINI_MODEL = "gemini-2.5-flash";

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

async function parseAllianceDuelImage(input: { imageBase64: string; mimeType: string }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const prompt = [
    "Read this Last Z alliance duel ranking screenshot.",
    "Return JSON only.",
    'Use this schema: {"entries":[{"rank":1,"name":"Player Name","score":123456}]}',
    "Extract only visible players.",
    "Do not invent missing players.",
    "Scores must be integers with no commas.",
    "If rank is not visible, use null.",
  ].join(" ");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: input.mimeType,
                  data: input.imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }

  const data = await response.json();
  const rawText =
    data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join(" ")
      .trim() ?? "";

  const parsed = parseGeminiJsonResponse(rawText);
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];

  return entries.map((entry: any) => ({
    name: String(entry?.name ?? "").trim(),
    rank: normalizeRank(entry?.rank),
    score: normalizeScore(entry?.score),
  }));
}

function parseGeminiJsonResponse(rawText: string) {
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
    } catch (error: any) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Could not parse Gemini JSON response.");
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

export async function saveAllianceDuelRequirement(input: {
  dayKey: string;
  eventName: string;
  minimumScore: number;
}) {
  try {
    await requirePermission("manageAllianceDuel");
    await ensureAllianceDuelRequirements();

    if (!ALLIANCE_DUEL_DAYS.includes(input.dayKey as any)) {
      return { success: false, error: "Invalid duel day." };
    }

    await prisma.allianceDuelRequirement.update({
      where: { dayKey: input.dayKey },
      data: {
        eventName: input.eventName.trim() || getAllianceDuelDayLabel(input.dayKey),
        minimumScore: Math.max(0, Math.round(Number(input.minimumScore) || 0)),
      },
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("ALLIANCE DUEL REQUIREMENT ERROR:", error);
    return { success: false, error: error.message || "Failed to save duel requirement." };
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

    const scopeKey = getScoreScopeKey(input.scoreType, input.dayKey);
    const normalizedRank = input.rank ? Math.max(1, Math.round(input.rank)) : null;

    await prisma.allianceDuelScore.upsert({
      where: {
        playerId_scoreType_dayKey: {
          playerId: input.playerId,
          scoreType: input.scoreType,
          dayKey: scopeKey,
        },
      },
      create: {
        playerId: input.playerId,
        scoreType: input.scoreType,
        dayKey: scopeKey,
        score: Math.max(0, Math.round(Number(input.score) || 0)),
        rank: normalizedRank,
        source: "manual",
      },
      update: {
        score: Math.max(0, Math.round(Number(input.score) || 0)),
        rank: normalizedRank,
        source: "manual",
      },
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("ALLIANCE DUEL MANUAL SAVE ERROR:", error);
    return { success: false, error: error.message || "Failed to save duel score." };
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

    const matchedEntries: Array<{ playerId: string; playerName: string; score: number; rank: number | null }> = [];
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

    revalidatePath("/");
    return {
      success: true,
      appliedCount: matchedEntries.length,
      unmatchedNames: unmatchedEntries.map((entry) => entry.name),
      unmatchedEntries,
      updatedPlayers: matchedEntries,
    };
  } catch (error: any) {
    console.error("ALLIANCE DUEL SCREENSHOT ERROR:", error);
    return { success: false, error: error.message || "Failed to process duel screenshot." };
  }
}
