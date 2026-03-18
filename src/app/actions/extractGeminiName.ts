"use server";

const GEMINI_MODEL = "gemini-2.5-flash";
const HUGGINGFACE_VLM_MODEL = process.env.HUGGINGFACE_VLM_MODEL || "zai-org/GLM-4.5V";

function normalizeName(value: string) {
  return value.replace(/[^a-zA-Z0-9 '\-]/g, "").replace(/\s+/g, " ").trim();
}

export async function extractGeminiName(input: { imageBase64: string; mimeType: string }) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const prompt =
      "Read only the player name from this game screenshot crop. Respond with just the exact player name and nothing else. If uncertain, return UNKNOWN.";

    if (apiKey) {
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
                    text: prompt,
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

      if (response.ok) {
        const data = await response.json();
        const rawText =
          data?.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text ?? "")
            .join(" ")
            .trim() ?? "";

        const cleaned = normalizeName(rawText);
        if (cleaned && cleaned.toUpperCase() !== "UNKNOWN") {
          return { success: true, name: cleaned };
        }
      }
    }

    const huggingFaceKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
    if (!huggingFaceKey) {
      return { success: false, name: "", error: "Missing GEMINI_API_KEY and HUGGINGFACE_API_KEY" };
    }

    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${huggingFaceKey}`,
      },
      body: JSON.stringify({
        model: HUGGINGFACE_VLM_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
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
        max_tokens: 120,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        name: "",
        error: `Gemini/Hugging Face request failed with status ${response.status}`,
      };
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content?.trim() ?? "";
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
