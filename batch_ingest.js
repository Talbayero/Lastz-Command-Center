require("dotenv").config();

const fs = require("fs");
const path = require("path");
const Tesseract = require("tesseract.js");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const BOM_DIR = "C:\\Users\\Teddy A\\OneDrive\\Escritorio\\BOM";
const GEMINI_MODEL = "gemini-2.5-flash";
const SCORE_WEIGHTS = {
  kills: 0.30,
  tech: 0.25,
  hero: 0.20,
  troop: 0.15,
  structure: 0.05,
  modVehicle: 0.05,
};

function normalizeName(value) {
  return value.replace(/[^a-zA-Z0-9 '\-]/g, "").replace(/\s+/g, " ").trim();
}

function parseProfile(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  const extractStat = (label) => {
    const regex = new RegExp(`${label}[\\s\\n]*([\\d,]{4,})`, "i");
    const match = text.match(regex);
    const value = match?.[1] ?? "";
    return value ? parseInt(value.replace(/,/g, ""), 10) : 0;
  };

  const powerStats = {
    structure: extractStat("Structure Power"),
    tech: extractStat("Tech Power"),
    troop: extractStat("Troop Power"),
    hero: extractStat("Hero Power"),
    modVehicle: extractStat("Mod Vehicle Power"),
  };

  const subStatSum = Object.values(powerStats).reduce((sum, value) => sum + value, 0);

  const structureIdx = text.toLowerCase().indexOf("structure power");
  const headerText = structureIdx > 0 ? text.substring(0, structureIdx) : lines.slice(0, 5).join("\n");
  const headerNums = headerText.match(/([\d,]{5,})/g);

  let totalPower = subStatSum;
  let kills = 0;

  if (headerNums && headerNums.length >= 2) {
    const sorted = headerNums
      .map((value) => parseInt(value.replace(/,/g, ""), 10))
      .sort((a, b) => b - a);

    totalPower = sorted[0];
    kills = sorted[1];

    if (subStatSum > 0 && totalPower > subStatSum * 1.5) {
      const corrected = parseInt(totalPower.toString().substring(1), 10);
      if (Math.abs(corrected - subStatSum) < subStatSum * 0.15) {
        totalPower = corrected;
      } else {
        totalPower = subStatSum;
      }
    }
  }

  const rawScore =
    (kills * SCORE_WEIGHTS.kills) +
    (powerStats.tech * SCORE_WEIGHTS.tech) +
    (powerStats.hero * SCORE_WEIGHTS.hero) +
    (powerStats.troop * SCORE_WEIGHTS.troop) +
    (powerStats.structure * SCORE_WEIGHTS.structure) +
    (powerStats.modVehicle * SCORE_WEIGHTS.modVehicle);

  return { kills, totalPower, powerStats, rawScore };
}

async function extractNameWithGemini(filePath) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "";
  }

  const imageBase64 = fs.readFileSync(filePath, { encoding: "base64" });
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
                text: "Read only the player name from this Last Z profile screenshot. Return only the exact player name with no explanation. If uncertain, return UNKNOWN.",
              },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status})`);
  }

  const data = await response.json();
  const rawText =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join(" ")
      .trim() ?? "";

  const cleaned = normalizeName(rawText);
  if (!cleaned || cleaned.toUpperCase() === "UNKNOWN") {
    return "";
  }

  return cleaned;
}

async function clearRosterData() {
  await prisma.$transaction(async (tx) => {
    await tx.snapshot.deleteMany({});
    await tx.player.deleteMany({});
  });
}

async function upsertPlayerSnapshot(data, fallbackName) {
  const finalName = data.name && data.name.length >= 3 ? data.name : fallbackName;

  await prisma.$transaction(async (tx) => {
    const existingPlayer = await tx.player.findUnique({
      where: { name: finalName },
      select: { id: true },
    });

    const player = existingPlayer
      ? await tx.player.update({
          where: { id: existingPlayer.id },
          data: {
            alliance: "BOM",
            kills: data.kills,
            totalPower: data.totalPower,
            latestScore: data.rawScore,
          },
          select: { id: true },
        })
      : await tx.player.create({
          data: {
            name: finalName,
            alliance: "BOM",
            kills: data.kills,
            totalPower: data.totalPower,
            latestScore: data.rawScore,
            gloryWarStatus: "Offline",
          },
          select: { id: true },
        });

    await tx.snapshot.create({
      data: {
        playerId: player.id,
        kills: data.kills,
        totalPower: data.totalPower,
        structurePower: data.powerStats.structure,
        techPower: data.powerStats.tech,
        troopPower: data.powerStats.troop,
        heroPower: data.powerStats.hero,
        modVehiclePower: data.powerStats.modVehicle,
        score: data.rawScore,
      },
    });
  });

  return finalName;
}

async function ingest() {
  const files = fs.readdirSync(BOM_DIR).filter((file) => file.toLowerCase().endsWith(".png"));
  await clearRosterData();
  console.log(`Starting ingestion of ${files.length} BOM screenshots...`);

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const filePath = path.join(BOM_DIR, file);
    process.stdout.write(`[${index + 1}/${files.length}] Processing ${file}... `);

    try {
      const result = await Tesseract.recognize(filePath, "eng");
      const parsed = parseProfile(result.data.text);
      const geminiName = await extractNameWithGemini(filePath).catch(() => "");
      const fallbackName = `Unknown_${path.parse(file).name.replace(/\s+/g, "_")}`;
      const enrichedData = {
        ...parsed,
        name: geminiName || fallbackName,
      };
      const finalName = await upsertPlayerSnapshot(enrichedData, fallbackName);
      process.stdout.write(`SUCCESS: ${finalName} (Score: ${Math.round(parsed.rawScore).toLocaleString()})\n`);
    } catch (error) {
      console.error(`FAILED: ${error.message}`);
    }
  }

  await prisma.$disconnect();
  console.log("\nBatch ingestion complete.");
}

ingest().catch(async (error) => {
  console.error("Ingestion failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
