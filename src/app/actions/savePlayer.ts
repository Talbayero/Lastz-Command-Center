"use server";

import prisma from "@/utils/db";
import { hasPermission, requirePermission } from "@/utils/auth";

type SavePlayerInput = {
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Database save failed";
}

export async function savePlayerData(data: SavePlayerInput) {
  try {
    const actingUser = await requirePermission("uploadProfile");

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

    const subSum = Object.values(powerStats).reduce((sum, value) => sum + value, 0);
    const totalPower = Math.round(Number(data.totalPower ?? 0) || subSum || 0);
    const SCORE_WEIGHTS = { kills: 0.30, tech: 0.25, hero: 0.20, troop: 0.15, structure: 0.05, modVehicle: 0.05 };

    const rawScore =
      (kills                 * SCORE_WEIGHTS.kills) +
      (powerStats.tech       * SCORE_WEIGHTS.tech) +
      (powerStats.hero       * SCORE_WEIGHTS.hero) +
      (powerStats.troop      * SCORE_WEIGHTS.troop) +
      (powerStats.structure  * SCORE_WEIGHTS.structure) +
      (powerStats.modVehicle * SCORE_WEIGHTS.modVehicle);

    const canEditOthers =
      hasPermission(actingUser, "editRoster") ||
      hasPermission(actingUser, "editPlayerNames") ||
      hasPermission(actingUser, "manageUsers");

    await prisma.$transaction(async (tx) => {
      const existingPlayer = await tx.player.findFirst({
        where: {
          name: {
            equals: name,
            mode: "insensitive",
          },
        },
        select: { id: true, name: true },
      });

      let targetPlayerId = actingUser.playerId;
      let targetPlayerName = actingUser.playerName;

      if (canEditOthers) {
        targetPlayerId = existingPlayer?.id ?? "";
        targetPlayerName = existingPlayer?.name ?? name;
      } else {
        const ownPlayer = await tx.player.findUnique({
          where: { id: actingUser.playerId },
          select: { id: true, name: true },
        });

        if (!ownPlayer) {
          throw new Error("Your linked player record could not be found.");
        }

        if (existingPlayer && existingPlayer.id !== ownPlayer.id) {
          throw new Error("You can only update your own player profile.");
        }

        if (name && name.toLowerCase() !== ownPlayer.name.toLowerCase()) {
          throw new Error("You can only save data to your own player profile.");
        }

        targetPlayerId = ownPlayer.id;
        targetPlayerName = ownPlayer.name;
      }

      const player =
        targetPlayerId && (existingPlayer || !canEditOthers)
          ? await tx.player.update({
              where: { id: targetPlayerId },
              data: {
                name: targetPlayerName,
                kills,
                totalPower,
                latestScore: rawScore,
              },
              select: { id: true },
            })
          : await tx.player.create({
              data: {
                name: targetPlayerName,
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
    return { success: true };

  } catch (error: unknown) {
    console.error("SQL SAVE ERROR:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}
