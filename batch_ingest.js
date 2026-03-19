require("dotenv").config();

const fs = require("fs");
const path = require("path");
const Tesseract = require("tesseract.js");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const DEFAULT_BOM_DIR = "C:\\Users\\Teddy A\\OneDrive\\Escritorio\\BOM";
const inputDirArg = process.argv.find((arg) => !arg.startsWith("--") && arg !== process.argv[0] && arg !== process.argv[1]);
const BOM_DIR = inputDirArg || process.env.BOM_DIR || DEFAULT_BOM_DIR;
const SHOULD_CLEAR = process.argv.includes("--clear") || process.env.CLEAR_ROSTER === "1";
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

function parseDigits(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function normalizeLabel(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

function normalizeHeaderNumbers(text) {
  return (String(text ?? "").match(/\d[\d,\s.]{4,}/g) ?? [])
    .map((entry) => parseDigits(entry))
    .filter((value) => value > 0)
    .sort((a, b) => b - a);
}

function groupWordsIntoRows(words) {
  const sorted = words
    .filter((word) => word && word.text && word.bbox)
    .map((word) => ({
      text: String(word.text).trim(),
      x0: word.bbox.x0 ?? 0,
      y0: word.bbox.y0 ?? 0,
      x1: word.bbox.x1 ?? 0,
      y1: word.bbox.y1 ?? 0,
    }))
    .filter((word) => word.text)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  const rows = [];

  for (const word of sorted) {
    const center = (word.y0 + word.y1) / 2;
    const existing = rows.find((row) => {
      const averageCenter = row.reduce((sum, item) => sum + (item.y0 + item.y1) / 2, 0) / Math.max(row.length, 1);
      return Math.abs(averageCenter - center) <= 24;
    });

    if (existing) {
      existing.push(word);
    } else {
      rows.push([word]);
    }
  }

  return rows.map((row) => row.sort((a, b) => a.x0 - b.x0));
}

function parseLabelAlignedStats(words, imageWidth) {
  const rows = groupWordsIntoRows(words);
  const stats = {
    structure: 0,
    tech: 0,
    troop: 0,
    hero: 0,
    modVehicle: 0,
  };
  const labels = [
    { key: "structure", match: ["structurepower", "structure"] },
    { key: "tech", match: ["techpower", "tech"] },
    { key: "troop", match: ["trooppower", "troop"] },
    { key: "hero", match: ["heropower", "hero"] },
    { key: "modVehicle", match: ["modvehiclepower", "modvehicle", "vehiclepower"] },
  ];

  for (const row of rows) {
    const labelWords = row.filter((word) => word.x0 < imageWidth * 0.55);
    const valueWords = row.filter((word) => word.x0 >= imageWidth * 0.45);
    const labelText = normalizeLabel(labelWords.map((word) => word.text).join(""));
    const match = labels.find((label) => label.match.some((candidate) => labelText.includes(candidate)));
    if (!match) continue;

    const parsedValue = parseDigits(valueWords.map((word) => word.text).join(" "));
    if (parsedValue > 0) {
      stats[match.key] = parsedValue;
    }
  }

  return stats;
}

function parseProfile(text, words = [], imageWidth = 0, imageHeight = 0) {
  const powerStats = parseLabelAlignedStats(
    words.filter((word) => {
      const bbox = word?.bbox;
      if (!bbox) return false;
      const centerY = ((bbox.y0 ?? 0) + (bbox.y1 ?? 0)) / 2;
      return centerY >= imageHeight * 0.34 && centerY <= imageHeight * 0.92;
    }),
    imageWidth
  );

  if (Object.values(powerStats).every((value) => value === 0)) {
    const extractStat = (label) => {
      const regex = new RegExp(`${label}[\\s\\n]*([\\d,]{4,})`, "i");
      const match = text.match(regex);
      const value = match?.[1] ?? "";
      return value ? parseInt(value.replace(/,/g, ""), 10) : 0;
    };

    powerStats.structure = extractStat("Structure Power");
    powerStats.tech = extractStat("Tech Power");
    powerStats.troop = extractStat("Troop Power");
    powerStats.hero = extractStat("Hero Power");
    powerStats.modVehicle = extractStat("Mod Vehicle Power");
  }

  const subStatSum = Object.values(powerStats).reduce((sum, value) => sum + value, 0);

  const headerWords = words.filter((word) => {
    const bbox = word?.bbox;
    if (!bbox) return false;
    const centerY = ((bbox.y0 ?? 0) + (bbox.y1 ?? 0)) / 2;
    return centerY <= imageHeight * 0.23;
  });
  const headerText = headerWords.length
    ? headerWords
        .sort((a, b) => (a.bbox.y0 ?? 0) - (b.bbox.y0 ?? 0) || (a.bbox.x0 ?? 0) - (b.bbox.x0 ?? 0))
        .map((word) => word.text ?? "")
        .join(" ")
    : String(text).split("\n").slice(0, 5).join("\n");
  const headerNumbers = normalizeHeaderNumbers(headerText);

  let totalPower = subStatSum;
  let kills = 0;

  if (headerNumbers.length >= 2) {
    totalPower = headerNumbers[0];
    kills = headerNumbers[1];
  } else if (headerNumbers.length === 1) {
    totalPower = headerNumbers[0];
  }

  if (subStatSum > 0 && totalPower > subStatSum * 1.5) {
    const corrected = parseInt(totalPower.toString().substring(1), 10);
    if (Math.abs(corrected - subStatSum) < subStatSum * 0.15) {
      totalPower = corrected;
    } else {
      totalPower = subStatSum;
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
  if (SHOULD_CLEAR) {
    await clearRosterData();
    console.log("Cleared existing player and snapshot data before import.");
  }

  console.log(`Starting ingestion of ${files.length} screenshots from ${BOM_DIR}...`);

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const filePath = path.join(BOM_DIR, file);
    process.stdout.write(`[${index + 1}/${files.length}] Processing ${file}... `);

    try {
      const result = await Tesseract.recognize(filePath, "eng");
      const parsed = parseProfile(
        result.data.text,
        result.data.words ?? [],
        result.data.imageSize?.width ?? 0,
        result.data.imageSize?.height ?? 0
      );
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
