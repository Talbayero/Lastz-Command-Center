"use server";

import { extractPlayerNameWithVision } from "@/utils/ai/vision";

export async function extractGeminiName(input: { imageBase64: string; mimeType: string }) {
  return extractPlayerNameWithVision(input);
}
