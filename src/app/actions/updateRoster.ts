"use server";

import db from "@/utils/sqlite";
import { v4 as uuidv4 } from "uuid";
import { revalidatePath } from "next/cache";

export async function updateRoster(players: any[]) {
  try {
    const SCORE_WEIGHTS = { kills: 0.30, tech: 0.25, hero: 0.20, troop: 0.15, structure: 0.05, modVehicle: 0.05 };

    const updateStmt = db.prepare(`
      UPDATE Player 
      SET totalPower = ?, kills = ?, latestScore = ?, gloryWarStatus = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const snapshotStmt = db.prepare(`
      INSERT INTO Snapshot (
        id, playerId, kills, totalPower, structurePower, techPower, 
        troopPower, heroPower, modVehiclePower, score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Run as transaction for speed and safety
    const transaction = db.transaction((data) => {
      for (const p of data) {
        const kills = Number(p.kills) || 0;
        const tech = Number(p.techPower) || 0;
        const hero = Number(p.heroPower) || 0;
        const troop = Number(p.troopPower) || 0;
        const structure = Number(p.structurePower) || 0;
        const modVehicle = Number(p.modVehiclePower) || 0;

        const rawScore =
          (kills      * SCORE_WEIGHTS.kills) +
          (tech       * SCORE_WEIGHTS.tech) +
          (hero       * SCORE_WEIGHTS.hero) +
          (troop      * SCORE_WEIGHTS.troop) +
          (structure  * SCORE_WEIGHTS.structure) +
          (modVehicle * SCORE_WEIGHTS.modVehicle);

        const totalPower = Number(p.totalPower) || (tech + hero + troop + structure + modVehicle);

        // 1. Update master player record
        updateStmt.run(totalPower, kills, rawScore, p.gloryWarStatus, p.id);
        
        // 2. Create new snapshot so the dashboard sees the latest numbers
        snapshotStmt.run(
          uuidv4(), p.id, kills, totalPower, 
          structure, tech, troop, hero, modVehicle, rawScore
        );
      }
    });

    transaction(players);
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("ROSTER UPDATE ERROR:", error);
    return { success: false, error: error.message };
  }
}
