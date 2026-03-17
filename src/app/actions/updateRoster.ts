"use server";

import prisma from "@/utils/db";
import { revalidatePath } from "next/cache";

export async function updateRoster(players: any[]) {
  try {
    const SCORE_WEIGHTS = { kills: 0.30, tech: 0.25, hero: 0.20, troop: 0.15, structure: 0.05, modVehicle: 0.05 };

    await prisma.$transaction(async (tx) => {
      for (const p of players) {
        const name = String(p.name ?? "").trim();
        const kills = Number(p.kills) || 0;
        const tech = Number(p.techPower) || 0;
        const hero = Number(p.heroPower) || 0;
        const troop = Number(p.troopPower) || 0;
        const structure = Number(p.structurePower) || 0;
        const modVehicle = Number(p.modVehiclePower) || 0;
        const march1Power = Number(p.march1Power) || 0;
        const march2Power = Number(p.march2Power) || 0;
        const march3Power = Number(p.march3Power) || 0;
        const march4Power = Number(p.march4Power) || 0;

        const rawScore =
          (kills      * SCORE_WEIGHTS.kills) +
          (tech       * SCORE_WEIGHTS.tech) +
          (hero       * SCORE_WEIGHTS.hero) +
          (troop      * SCORE_WEIGHTS.troop) +
          (structure  * SCORE_WEIGHTS.structure) +
          (modVehicle * SCORE_WEIGHTS.modVehicle);

        const totalPower = Number(p.totalPower) || (tech + hero + troop + structure + modVehicle);

        if (!name) {
          throw new Error("Player name cannot be empty.");
        }

        const duplicatePlayer = await tx.player.findFirst({
          where: {
            name,
            NOT: { id: p.id },
          },
          select: { id: true },
        });

        if (duplicatePlayer) {
          throw new Error(`Player name "${name}" is already in use.`);
        }

        await tx.player.update({
          where: { id: p.id },
          data: {
            name,
            totalPower,
            kills,
            march1Power,
            march2Power,
            march3Power,
            march4Power,
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

export async function deleteRosterPlayer(playerId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.snapshot.deleteMany({
        where: { playerId },
      });

      await tx.player.delete({
        where: { id: playerId },
      });
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("ROSTER DELETE ERROR:", error);
    return { success: false, error: error.message || "Failed to delete player." };
  }
}
