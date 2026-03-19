import Tesseract from "tesseract.js";

export type ParsedProfileStats = {
  name: string;
  kills: number;
  totalPower: number;
  powerStats: {
    structure: number;
    tech: number;
    troop: number;
    hero: number;
    modVehicle: number;
  };
};

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LoadedImage = {
  image: HTMLImageElement;
  width: number;
  height: number;
};

type PreprocessMode = "name" | "numeric";
type OcrWord = {
  text: string;
  bbox?: {
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
  };
};

type PositionedWord = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

const STAT_ROW_ORDER = [
  { key: "structure", y: 0.41 },
  { key: "tech", y: 0.515 },
  { key: "troop", y: 0.62 },
  { key: "hero", y: 0.73 },
  { key: "modVehicle", y: 0.84 },
] as const;

async function loadImageFromFile(file: File): Promise<LoadedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = objectUrl;
    });

    return { image, width: image.width, height: image.height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function clampBox(box: CropBox, imageWidth: number, imageHeight: number): CropBox {
  const x = Math.max(0, Math.min(imageWidth - 1, Math.round(box.x)));
  const y = Math.max(0, Math.min(imageHeight - 1, Math.round(box.y)));
  const width = Math.max(1, Math.min(imageWidth - x, Math.round(box.width)));
  const height = Math.max(1, Math.min(imageHeight - y, Math.round(box.height)));
  return { x, y, width, height };
}

function drawCropToCanvas(loaded: LoadedImage, box: CropBox, scale: number, mode: PreprocessMode) {
  const crop = clampBox(box, loaded.width, loaded.height);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width * scale;
  canvas.height = crop.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is unavailable");
  }

  ctx.imageSmoothingEnabled = mode === "name";
  ctx.drawImage(
    loaded.image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * (mode === "numeric" ? 2.6 : 1.8) + 128));
    const value = mode === "numeric" ? (contrasted > 155 ? 255 : 0) : contrasted;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode crop"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function parseDigits(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function normalizeHeaderNumbers(text: string) {
  return (text.match(/\d[\d,\s.]{4,}/g) ?? [])
    .map((entry) => parseDigits(entry))
    .filter((value) => value > 0)
    .sort((a, b) => b - a);
}

async function recognizeCanvasText(
  canvas: HTMLCanvasElement,
  mode: PreprocessMode,
  progressBase = 0,
  progressSpan = 0,
  onProgress?: (value: number) => void
) {
  const blob = await canvasToBlob(canvas);
  const result = await Tesseract.recognize(blob, "eng", {
    // @ts-expect-error Tesseract accepts these runtime OCR options even though the package type omits them.
    tessedit_pageseg_mode: mode === "numeric" ? "7" : "6",
    tessedit_char_whitelist: mode === "numeric" ? "0123456789," : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ '",
    preserve_interword_spaces: "1",
    logger: (message) => {
      if (message.status === "recognizing text" && onProgress) {
        onProgress(progressBase + Math.round(message.progress * progressSpan));
      }
    },
  });

  return result.data.text.trim();
}

async function recognizeCanvasWords(
  canvas: HTMLCanvasElement,
  mode: PreprocessMode,
  progressBase = 0,
  progressSpan = 0,
  onProgress?: (value: number) => void
) {
  const blob = await canvasToBlob(canvas);
  const result = await Tesseract.recognize(blob, "eng", {
    // @ts-expect-error Tesseract accepts these runtime OCR options even though the package type omits them.
    tessedit_pageseg_mode: mode === "numeric" ? "7" : "6",
    tessedit_char_whitelist:
      mode === "numeric"
        ? "0123456789,"
        : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ ',",
    preserve_interword_spaces: "1",
    logger: (message) => {
      if (message.status === "recognizing text" && onProgress) {
        onProgress(progressBase + Math.round(message.progress * progressSpan));
      }
    },
  });

  const words = ((result.data as { words?: OcrWord[] }).words ?? [])
    .map((word) => {
      const bbox = word.bbox;
      if (!bbox) return null;
      return {
        text: word.text?.trim() ?? "",
        x0: bbox.x0 ?? 0,
        y0: bbox.y0 ?? 0,
        x1: bbox.x1 ?? 0,
        y1: bbox.y1 ?? 0,
      };
    })
    .filter((word): word is PositionedWord => Boolean(word?.text));

  return {
    text: result.data.text.trim(),
    words,
  };
}

function getHeaderBox(width: number, height: number): CropBox {
  return {
    x: width * 0.32,
    y: height * 0.035,
    width: width * 0.63,
    height: height * 0.18,
  };
}

function getTableBox(width: number, height: number): CropBox {
  return {
    x: width * 0.1,
    y: height * 0.34,
    width: width * 0.82,
    height: height * 0.58,
  };
}

function normalizeLabel(text: string) {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

function parseLabelAlignedStats(words: PositionedWord[], canvasWidth: number) {
  const groupedRows = groupWordsIntoRows(words);
  const stats = {
    structure: 0,
    tech: 0,
    troop: 0,
    hero: 0,
    modVehicle: 0,
  };

  const labels: Array<{ key: keyof typeof stats; match: string[] }> = [
    { key: "structure", match: ["structurepower", "structure"] },
    { key: "tech", match: ["techpower", "tech"] },
    { key: "troop", match: ["trooppower", "troop"] },
    { key: "hero", match: ["heropower", "hero"] },
    { key: "modVehicle", match: ["modvehiclepower", "modvehicle", "vehiclepower"] },
  ];

  for (const row of groupedRows) {
    const labelWords = row.filter((word) => word.x0 < canvasWidth * 0.55);
    const valueWords = row.filter((word) => word.x0 >= canvasWidth * 0.45);
    const labelText = normalizeLabel(labelWords.map((word) => word.text).join(""));
    const matchedLabel = labels.find((label) => label.match.some((candidate) => labelText.includes(candidate)));
    if (!matchedLabel) continue;

    const valueText = valueWords.map((word) => word.text).join(" ");
    const parsedValue = parseDigits(valueText);
    if (parsedValue > 0) {
      stats[matchedLabel.key] = parsedValue;
    }
  }

  return stats;
}

function groupWordsIntoRows(words: PositionedWord[]) {
  const sorted = words.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const rows: PositionedWord[][] = [];

  for (const word of sorted) {
    const rowCenter = (word.y0 + word.y1) / 2;
    const targetRow = rows.find((row) => {
      const averageCenter =
        row.reduce((sum, entry) => sum + (entry.y0 + entry.y1) / 2, 0) / Math.max(row.length, 1);
      return Math.abs(averageCenter - rowCenter) <= 24;
    });

    if (targetRow) {
      targetRow.push(word);
    } else {
      rows.push([word]);
    }
  }

  return rows.map((row) => row.sort((a, b) => a.x0 - b.x0));
}

export async function parseLastZProfileImage(
  file: File,
  onProgress?: (value: number) => void
): Promise<ParsedProfileStats> {
  const loaded = await loadImageFromFile(file);

  const headerCanvas = drawCropToCanvas(loaded, getHeaderBox(loaded.width, loaded.height), 3, "numeric");
  const headerText = await recognizeCanvasText(headerCanvas, "numeric", 0, 25, onProgress);
  const headerNumbers = normalizeHeaderNumbers(headerText);

  const tableCanvas = drawCropToCanvas(loaded, getTableBox(loaded.width, loaded.height), 3, "name");
  const tableOcr = await recognizeCanvasWords(tableCanvas, "name", 25, 55, onProgress);
  const alignedStats = parseLabelAlignedStats(tableOcr.words, tableCanvas.width);

  const powerStats = { ...alignedStats };

  for (const row of STAT_ROW_ORDER) {
    if (powerStats[row.key] > 0) continue;
    const rowCanvas = drawCropToCanvas(
      loaded,
      {
        x: loaded.width * 0.55,
        y: loaded.height * row.y - (loaded.height * 0.085) / 2,
        width: loaded.width * 0.37,
        height: loaded.height * 0.085,
      },
      3,
      "numeric"
    );
    const rowText = await recognizeCanvasText(rowCanvas, "numeric", 80, 10, onProgress);
    const parsedValue = parseDigits(rowText);
    if (parsedValue > 0) {
      powerStats[row.key] = parsedValue;
    }
  }

  const subStatSum = Object.values(powerStats).reduce((sum, value) => sum + value, 0);
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

  onProgress?.(90);

  return {
    name: "Unknown Player",
    kills,
    totalPower,
    powerStats,
  };
}

// Legacy text parser kept for compatibility with older flows and scripts.
export const parseLastZProfile = (text: string) => {
  const extractStat = (label: string): number => {
    const regex = new RegExp(`${label}[\\s\\n]*([\\d,]{4,})`, "i");
    const match = text.match(regex);
    const valStr = match?.[1] ?? "";
    return valStr ? parseInt(valStr.replace(/,/g, ""), 10) : 0;
  };

  const powerStats = {
    structure: extractStat("Structure Power"),
    tech: extractStat("Tech Power"),
    troop: extractStat("Troop Power"),
    hero: extractStat("Hero Power"),
    modVehicle: extractStat("Mod Vehicle Power"),
  };

  const subStatSum = Object.values(powerStats).reduce((a, b) => a + b, 0);
  const structureIdx = text.toLowerCase().indexOf("structure power");
  const headerText = structureIdx > 0 ? text.substring(0, structureIdx) : text.split("\n").slice(0, 5).join("\n");
  const headerNums = normalizeHeaderNumbers(headerText);

  let totalPower = subStatSum;
  let kills = 0;

  if (headerNums.length >= 2) {
    totalPower = headerNums[0];
    kills = headerNums[1];
  }

  if (subStatSum > 0 && totalPower > subStatSum * 1.5) {
    const corrected = parseInt(totalPower.toString().substring(1), 10);
    totalPower = Math.abs(corrected - subStatSum) < subStatSum * 0.15 ? corrected : subStatSum;
  }

  return {
    name: "Unknown Player",
    kills,
    totalPower,
    powerStats,
  };
};
