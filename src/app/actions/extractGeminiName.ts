"use server";

const GEMINI_MODEL = "gemini-2.5-flash";

function normalizeName(value: string) {
  return value.replace(/[^a-zA-Z0-9 '\-]/g, "").replace(/\s+/g, " ").trim();
}

export async function extractGeminiName(input: { imageBase64: string; mimeType: string }) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { success: false, name: "", error: "Missing GEMINI_API_KEY" };
    }

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
                {
                  text: "Read only the player name from this game screenshot crop. Respond with just the exact player name and nothing else. If uncertain, return UNKNOWN.",
                },
                {
                  inlineData: {
                    mimeType: input.mimeType,
                    data: input.imageBase64,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      return {
        success: false,
        name: "",
        error: `Gemini request failed with status ${response.status}`,
      };
    }

    const data = await response.json();
    const rawText =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join(" ")
        .trim() ?? "";

    const cleaned = normalizeName(rawText);
    if (!cleaned || cleaned.toUpperCase() === "UNKNOWN") {
      return { success: false, name: "", error: "Gemini could not read a confident name" };
    }

    return { success: true, name: cleaned };
  } catch (error) {
    console.error("GEMINI NAME EXTRACTION ERROR:", error);
    return { success: false, name: "", error: "Gemini extraction failed" };
  }
}
