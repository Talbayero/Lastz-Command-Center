"use server";

import prisma from "@/utils/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/utils/auth";

export async function savePlayerData(data: any) {
  try {
    await requirePermission("uploadProfile");

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

    await prisma.$transaction(async (tx) => {
      const existingPlayer = await tx.player.findUnique({
        where: { name },
        select: { id: true },
      });

      const player = existingPlayer
        ? await tx.player.update({
            where: { id: existingPlayer.id },
            data: {
              kills,
              totalPower,
              latestScore: rawScore,
            },
            select: { id: true },
          })
        : await tx.player.create({
            data: {
              name,
              kills,
              totalPower,
              latestScore: rawScore,
            },
            select: { id: true },
          });

      await tx.snapshot.create({
        data: {
          playerId: player.id,
          kills,
          totalPower,
          structurePower: powerStats.structure,
          techPower: powerStats.tech,
          troopPower: powerStats.troop,
          heroPower: powerStats.hero,
          modVehiclePower: powerStats.modVehicle,
          score: rawScore,
        },
      });
    });

    revalidatePath("/");
    return { success: true };

  } catch (error: any) {
    console.error("SQL SAVE ERROR:", error);
    return { success: false, error: error.message ?? "Database save failed" };
  }
}
