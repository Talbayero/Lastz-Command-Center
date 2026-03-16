// ============================================================
// OCR Parser for Last Z Profile Screenshots
// 
// KEY FINDING (verified via debug):
//   - Tesseract CANNOT read the game's custom player name font.
//     The name "Erick Dylan" is garbled into "oj)" etc.
//   - The structured stat table (Structure Power, Tech Power, etc.) 
//     IS read correctly.
//   - Line 1 always contains: [garbage name] [TotalPower] [Kills]
//   - So we extract Power + Kills from the first raw OCR line.
// ============================================================

export const parseLastZProfile = (text: string) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. POWER SUB-STATS — labeled rows, very reliable
  const extractStat = (label: string): number => {
    const regex = new RegExp(`${label}[\\s\\n]*([\\d,]{4,})`, 'i');
    const match = text.match(regex);
    const valStr = match?.[1] ?? "";
    return valStr ? parseInt(valStr.replace(/,/g, ''), 10) : 0;
  };

  const powerStats = {
    structure: extractStat("Structure Power"),
    tech: extractStat("Tech Power"),
    troop: extractStat("Troop Power"),
    hero: extractStat("Hero Power"),
    modVehicle: extractStat("Mod Vehicle Power"),
  };

  const subStatSum = Object.values(powerStats).reduce((a, b) => a + b, 0);

  // 2. TOTAL POWER & KILLS — always on the first line of OCR output
  //    e.g. "¥ oj) {1'276,490,376 3,139,279"
  //    Simply grab the two largest comma-formatted numbers from that line.
  let totalPower = subStatSum;
  let kills = 0;

  // Search header area (before "Structure Power" label)
  const structureIdx = text.toLowerCase().indexOf("structure power");
  const headerText = structureIdx > 0 ? text.substring(0, structureIdx) : lines.slice(0, 5).join('\n');

  const headerNums = headerText.match(/([\d,]{5,})/g);
  if (headerNums && headerNums.length >= 2) {
    const sorted = headerNums
      .map(n => {
        const s = n ?? "";
        return s ? parseInt(s.replace(/,/g, ''), 10) : 0;
      })
      .sort((a, b) => b - a);

    totalPower = sorted[0];
    kills = sorted[1];

    // Auto-correct shield icon noise (e.g. "1270517833" should be "270517833")
    if (subStatSum > 0 && totalPower > subStatSum * 1.5) {
      const corrected = parseInt(totalPower.toString().substring(1), 10);
      if (Math.abs(corrected - subStatSum) < subStatSum * 0.15) {
        totalPower = corrected;
      } else {
        totalPower = subStatSum;
      }
    }
  }

  // 3. PLAYER NAME — Tesseract cannot read the game font.
  //    Return "Unknown Player" so the user types it manually.
  //    The UI will auto-focus the name field and show instructions.
  return {
    name: "Unknown Player",
    kills,
    totalPower,
    powerStats,
  };
};
