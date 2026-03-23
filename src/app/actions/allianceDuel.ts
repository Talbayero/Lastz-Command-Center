"use server";

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

const GEMINI_MODEL = "gemini-2.5-flash";
const HUGGINGFACE_VLM_MODEL = process.env.HUGGINGFACE_VLM_MODEL || "zai-org/GLM-4.5V";

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
  const prompt = [
    "Read this Last Z alliance duel ranking screenshot.",
    "Return JSON only.",
    'Use this schema: {"entries":[{"rank":1,"name":"Player Name","score":123456}]}',
    "Extract only visible players.",
    "Do not invent missing players.",
    "Each score must belong to the same horizontal row as the player name and rank.",
    "Do not borrow a score from a different player row.",
    "Ignore alliance tags like [BOM] and ignore decorative UI text.",
    "Scores must be integers with no commas.",
    "If rank is not visible, use null.",
  ].join(" ");

  if (apiKey) {
    try {
      const response = await fetchGeminiWithRetry(apiKey, {
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
      });

      const data = await response.json();
      const rawText =
        data?.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? "")
          .join(" ")
          .trim() ?? "";

      return normalizeAllianceDuelEntriesFromJson(rawText);
    } catch (error) {
      console.warn("ALLIANCE DUEL GEMINI FALLBACK TO HUGGING FACE/OCR:", error);
    }
  }

  try {
    return await parseAllianceDuelImageWithHuggingFace({
      prompt,
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
    });
  } catch (error) {
    console.warn("ALLIANCE DUEL HUGGING FACE PARSE FAILED:", error);
    throw new Error("Vision providers could not detect duel rows from that screenshot.");
  }
}

async function parseAllianceDuelImageWithHuggingFace(input: {
  prompt: string;
  imageBase64: string;
  mimeType: string;
}) {
  const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
  if (!apiKey) {
    throw new Error("Missing HUGGINGFACE_API_KEY");
  }

  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: HUGGINGFACE_VLM_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: input.prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mimeType};base64,${input.imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: {
        type: "json_object",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Hugging Face request failed with status ${response.status}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content?.trim() ?? "";
  return normalizeAllianceDuelEntriesFromJson(rawText);
}

function normalizeAllianceDuelEntriesFromJson(rawText: string) {
  const parsed = parseGeminiJsonResponse(rawText);
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];

  return entries.map((entry: any) => ({
    name: String(entry?.name ?? "").trim(),
    rank: normalizeRank(entry?.rank),
    score: normalizeScore(entry?.score),
  }));
}

async function fetchGeminiWithRetry(apiKey: string, body: Record<string, unknown>) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return response;
    }

    if (response.status !== 429 || attempt === 3) {
      throw new Error(`Gemini request failed with status ${response.status}`);
    }

    await wait(1200 * (attempt + 1));
  }

  throw new Error("Gemini request failed after retries.");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedupeEntries(entries: Array<{ name: string; rank: number | null; score: number }>) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${normalizePlayerName(entry.name)}::${entry.score}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    invalidateDuelDataCache();
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
    invalidateDuelDataCache();
    return { success: true };
  } catch (error: any) {
    console.error("ALLIANCE DUEL MANUAL SAVE ERROR:", error);
    return { success: false, error: error.message || "Failed to save duel score." };
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
        name: String(rawEntry.name ?? "").trim(),
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
  } catch (error: any) {
    console.error("ALLIANCE DUEL PARSED SAVE ERROR:", error);
    return { success: false, error: error.message || "Failed to save parsed duel scores." };
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
  } catch (error: any) {
    console.error("ALLIANCE DUEL SCREENSHOT ERROR:", error);
    return { success: false, error: error.message || "Failed to process duel screenshot." };
  }
}
