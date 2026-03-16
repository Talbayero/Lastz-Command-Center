"use server";

import prisma from "@/utils/db";
import { revalidatePath } from "next/cache";

export async function updateRoster(players: any[]) {
  try {
    const SCORE_WEIGHTS = { kills: 0.30, tech: 0.25, hero: 0.20, troop: 0.15, structure: 0.05, modVehicle: 0.05 };

    await prisma.$transaction(async (tx) => {
      for (const p of players) {
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

        await tx.player.update({
          where: { id: p.id },
          data: {
            totalPower,
            kills,
            latestScore: rawScore,
            gloryWarStatus: p.gloryWarStatus || "Offline",
          },
        });

        await tx.snapshot.create({
          data: {
            playerId: p.id,
            kills,
            totalPower,
            structurePower: structure,
            techPower: tech,
            troopPower: troop,
            heroPower: hero,
            modVehiclePower: modVehicle,
            score: rawScore,
          },
        });
      }
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("ROSTER UPDATE ERROR:", error);
    return { success: false, error: error.message };
  }
}
