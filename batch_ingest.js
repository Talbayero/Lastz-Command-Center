const Tesseract = require('tesseract.js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// --- CONFIG ---
const BOM_DIR = 'C:\\Users\\Teddy A\\OneDrive\\Escritorio\\Last Z\\BOM';
const DB_PATH = './dev.db';
const db = new Database(DB_PATH);

// --- SCORING WEIGHTS ---
const SCORE_WEIGHTS = { kills: 0.30, tech: 0.25, hero: 0.20, troop: 0.15, structure: 0.05, modVehicle: 0.05 };

/** Simplified parser based on ocrParser.ts with aggressive name cleaning */
function parseProfile(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  const extractStat = (label) => {
    const regex = new RegExp(`${label}[\\s\\n]*([\\d,]{4,})`, 'i');
    const match = text.match(regex);
    const valStr = match?.[1] ?? "";
    return valStr ? parseInt(valStr.replace(/,/g, ''), 10) : 0;
  };

  const powerStats = {
    structure: extractStat("Structure Power"),
    tech:      extractStat("Tech Power"),
    troop:     extractStat("Troop Power"),
    hero:      extractStat("Hero Power"),
    modVehicle:extractStat("Mod Vehicle Power"),
  };

  const subStatSum = Object.values(powerStats).reduce((a, b) => a + b, 0);

  // Name extraction: Grab the first line, remove non-alpha, common artifacts
  let rawNameLine = lines[0] || "";
  // Artifacts like "(iB ", "B ", "3 ", symbols
  let name = rawNameLine
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/^(iB|B|3|S|G|8)\s+/, '') // Remove potential OCR misreads of icons
    .split(/\s+/)[0] // Take only the first word as a safe guess if name is complex
    || "Unknown_Player_" + Date.now();

  // Clean name further: only allow A-Z, a-z
  name = name.replace(/[^a-zA-Z]/g, '');
  if (name.length < 3) name = "Unknown_" + Math.floor(Math.random() * 1000);

  // Total Power & Kills from top area
  const structureIdx = text.toLowerCase().indexOf("structure power");
  const headerText = structureIdx > 0 ? text.substring(0, structureIdx) : lines.slice(0, 5).join('\n');
  const headerNums = headerText.match(/([\d,]{5,})/g);
  
  let totalPower = subStatSum;
  let kills = 0;

  if (headerNums && headerNums.length >= 2) {
    const sorted = headerNums
      .map(n => parseInt(n.replace(/,/g, ''), 10))
      .sort((a, b) => b - a);

    totalPower = sorted[0];
    kills = sorted[1];

    // Correction logic
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
    (kills                 * SCORE_WEIGHTS.kills) +
    (powerStats.tech       * SCORE_WEIGHTS.tech) +
    (powerStats.hero       * SCORE_WEIGHTS.hero) +
    (powerStats.troop      * SCORE_WEIGHTS.troop) +
    (powerStats.structure  * SCORE_WEIGHTS.structure) +
    (powerStats.modVehicle * SCORE_WEIGHTS.modVehicle);

  return { name, kills, totalPower, powerStats, rawScore };
}

async function ingest() {
  const files = fs.readdirSync(BOM_DIR).filter(f => f.endsWith('.png'));
  console.log(`Starting ingestion of ${files.length} intelligence reports...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(BOM_DIR, file);
    process.stdout.write(`[${i + 1}/${files.length}] Processing ${file}... `);

    try {
      const result = await Tesseract.recognize(filePath, 'eng');
      const data = parseProfile(result.data.text);
      
      // Fallback name if extraction failed
      let finalName = data.name;
      if (!finalName || finalName.length < 3) {
        finalName = "Unknown_" + file.replace('Screenshot 2026-03-16 ', '').replace('.png', '').replace(/\s+/g, '_');
      }

      const transaction = db.transaction(() => {
        // 1. Upsert Player
        let player = db.prepare('SELECT id FROM Player WHERE name = ?').get(finalName);
        let playerId;
        
        if (!player) {
          playerId = uuidv4();
          db.prepare(`
            INSERT INTO Player (id, name, kills, totalPower, latestScore, updatedAt)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(playerId, finalName, data.kills, data.totalPower, data.rawScore);
        } else {
          playerId = player.id;
          db.prepare(`
            UPDATE Player 
            SET kills = ?, totalPower = ?, latestScore = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(data.kills, data.totalPower, data.rawScore, playerId);
        }

        // 2. Add Snapshot
        db.prepare(`
          INSERT INTO Snapshot (
            id, playerId, kills, totalPower, structurePower, techPower, 
            troopPower, heroPower, modVehiclePower, score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(), playerId, data.kills, data.totalPower, 
          data.powerStats.structure, data.powerStats.tech, data.powerStats.troop, 
          data.powerStats.hero, data.powerStats.modVehicle, data.rawScore
        );
      });

      transaction();
      process.stdout.write(`SUCCESS: ${data.name} (Score: ${Math.round(data.rawScore).toLocaleString()})\n`);
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
    }
  }

  console.log("\nBatch ingestion mission complete. All tactical intelligence integrated into Roster.");
}

ingest();
