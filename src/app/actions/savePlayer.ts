"use server";

import db from "@/utils/sqlite";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";

export async function savePlayerData(data: any) {
  try {
    const name = (data.name ?? "").trim();
    const kills = Math.round(Number(data.kills ?? 0) || 0);

    const p = data.powerStats ?? {};
    const powerStats = {
      structure: Math.round(Number(p.structure ?? 0) || 0),
      tech:      Math.round(Number(p.tech      ?? 0) || 0),
      troop:     Math.round(Number(p.troop     ?? 0) || 0),
      hero:      Math.round(Number(p.hero      ?? 0) || 0),
      modVehicle:Math.round(Number(p.modVehicle?? 0) || 0),
    };

    if (!name || name === "Unknown Player") {
      return { success: false, error: "Please enter a valid player name" };
    }

    const subSum = Object.values(powerStats).reduce((a, b: any) => a + b, 0);
    const totalPower = Math.round(Number(data.totalPower ?? 0) || subSum || 0);
    const SCORE_WEIGHTS = { kills: 0.30, tech: 0.25, hero: 0.20, troop: 0.15, structure: 0.05, modVehicle: 0.05 };

    const rawScore =
      (kills                 * SCORE_WEIGHTS.kills) +
      (powerStats.tech       * SCORE_WEIGHTS.tech) +
      (powerStats.hero       * SCORE_WEIGHTS.hero) +
      (powerStats.troop      * SCORE_WEIGHTS.troop) +
      (powerStats.structure  * SCORE_WEIGHTS.structure) +
      (powerStats.modVehicle * SCORE_WEIGHTS.modVehicle);

    // --- SQL TRANSACTION BEGIN ---
    const run = db.transaction(() => {
      // 1. Find or Create Player
      let player = db.prepare('SELECT id FROM Player WHERE name = ?').get(name) as { id: string } | undefined;
      
      if (!player) {
        player = { id: uuidv4() };
        db.prepare(`
          INSERT INTO Player (id, name, kills, totalPower, latestScore, updatedAt)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(player.id, name, kills, totalPower, rawScore);
      } else {
        db.prepare(`
          UPDATE Player 
          SET kills = ?, totalPower = ?, latestScore = ?, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(kills, totalPower, rawScore, player.id);
      }

      // 2. Create Snapshot
      db.prepare(`
        INSERT INTO Snapshot (
          id, playerId, kills, totalPower, structurePower, techPower, 
          troopPower, heroPower, modVehiclePower, score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), player.id, kills, totalPower, 
        powerStats.structure, powerStats.tech, powerStats.troop, 
        powerStats.hero, powerStats.modVehicle, rawScore
      );

      return true;
    });

    run();
    // --- SQL TRANSACTION END ---

    revalidatePath("/");
    return { success: true };

  } catch (error: any) {
    console.error("SQL SAVE ERROR:", error);
    return { success: false, error: error.message ?? "Database save failed" };
  }
}
