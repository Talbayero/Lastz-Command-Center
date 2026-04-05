import "server-only";

import { getAiPrompt, type AiPromptKey } from "@/utils/ai/prompts";
import { logAiEvent } from "@/utils/ai/telemetry";
import { normalizeAllianceDuelEntriesFromJson } from "@/utils/ai/visionParsing";

const GEMINI_MODEL = "gemini-2.5-flash";
const HUGGINGFACE_VLM_MODEL = process.env.HUGGINGFACE_VLM_MODEL || "zai-org/GLM-4.5V";

export type VisionImageInput = {
  imageBase64: string;
  mimeType: string;
};

type VisionProvider = "gemini" | "huggingface";

function normalizeName(value: string) {
  return value.replace(/[^a-zA-Z0-9 '\-]/g, "").replace(/\s+/g, " ").trim();
}

function getVisionLogMeta(feature: string, promptKey: AiPromptKey, provider: VisionProvider) {
  const prompt = getAiPrompt(promptKey);
  return {
    feature,
    promptId: prompt.id,
    promptVersion: prompt.version,
    provider,
    model: provider === "gemini" ? GEMINI_MODEL : HUGGINGFACE_VLM_MODEL,
  };
}

async function fetchGeminiWithRetry(promptKey: AiPromptKey, feature: string, input: VisionImageInput) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const prompt = getAiPrompt(promptKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body: Record<string, unknown> = {
    contents: [
      {
        parts: [
          { text: prompt.text },
          {
            inlineData: {
              mimeType: input.mimeType,
              data: input.imageBase64,
            },
          },
        ],
      },
    ],
  };

  if (prompt.expectsJson) {
    body.generationConfig = { responseMimeType: "application/json" };
  }

  const meta = getVisionLogMeta(feature, promptKey, "gemini");
  const startedAt = Date.now();
  logAiEvent("start", meta);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();
      const rawText =
        data?.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? "")
          .join(" ")
          .trim() ?? "";
      logAiEvent("success", { ...meta, durationMs: Date.now() - startedAt });
      return rawText;
    }

    if (response.status !== 429 || attempt === 3) {
      const error = `status=${response.status}`;
      logAiEvent("failure", { ...meta, durationMs: Date.now() - startedAt, details: error });
      throw new Error(`Gemini request failed with status ${response.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
  }

  logAiEvent("failure", { ...meta, durationMs: Date.now() - startedAt, details: "retry_exhausted" });
  throw new Error("Gemini request failed after retries.");
}

async function fetchHuggingFace(promptKey: AiPromptKey, feature: string, input: VisionImageInput) {
  const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
  if (!apiKey) {
    throw new Error("Missing HUGGINGFACE_API_KEY");
  }

  const prompt = getAiPrompt(promptKey);
  const meta = getVisionLogMeta(feature, promptKey, "huggingface");
  const startedAt = Date.now();
  logAiEvent("start", meta);

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
            { type: "text", text: prompt.text },
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
      max_tokens: prompt.expectsJson ? 500 : 120,
      ...(prompt.expectsJson ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const error = `status=${response.status}`;
    logAiEvent("failure", { ...meta, durationMs: Date.now() - startedAt, details: error });
    throw new Error(`Hugging Face request failed with status ${response.status}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content?.trim() ?? "";
  logAiEvent("success", { ...meta, durationMs: Date.now() - startedAt });
  return rawText;
}

export async function extractPlayerNameWithVision(input: VisionImageInput) {
  try {
    const rawText = await fetchGeminiWithRetry("playerNameVision", "player_name_extract", input);
    const cleaned = normalizeName(rawText);
    if (cleaned && cleaned.toUpperCase() !== "UNKNOWN") {
      return { success: true, name: cleaned };
    }
  } catch (error) {
    console.warn("PLAYER NAME GEMINI FALLBACK TO HUGGING FACE:", error);
  }

  try {
    const rawText = await fetchHuggingFace("playerNameVision", "player_name_extract", input);
    const cleaned = normalizeName(rawText);
    if (!cleaned || cleaned.toUpperCase() === "UNKNOWN") {
      return { success: false, name: "", error: "Vision models could not read a confident name" };
    }

    return { success: true, name: cleaned };
  } catch (error) {
    console.error("VISION NAME EXTRACTION ERROR:", error);
    return { success: false, name: "", error: "Vision extraction failed" };
  }
}

export async function parseAllianceDuelEntriesWithVision(input: VisionImageInput) {
  try {
    const rawText = await fetchGeminiWithRetry("allianceDuelVision", "alliance_duel_extract", input);
    return normalizeAllianceDuelEntriesFromJson(rawText);
  } catch (error) {
    console.warn("ALLIANCE DUEL GEMINI FALLBACK TO HUGGING FACE:", error);
  }

  try {
    const rawText = await fetchHuggingFace("allianceDuelVision", "alliance_duel_extract", input);
    return normalizeAllianceDuelEntriesFromJson(rawText);
  } catch (error) {
    console.warn("ALLIANCE DUEL HUGGING FACE PARSE FAILED:", error);
    throw new Error("Vision providers could not detect duel rows from that screenshot.");
  }
}
