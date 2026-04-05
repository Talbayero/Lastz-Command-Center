"use server";

import prisma from "@/utils/db";
import { requirePermission } from "@/utils/auth";
import { invalidatePlayerDataCache } from "@/utils/cacheTags";
import {
  ALLOWED_GLORY_WAR_STATUSES,
  ensureAllowedValue,
  ensureRecordId,
  normalizeNonNegativeInt,
  sanitizePlayerName,
} from "@/utils/validation";

type RosterUpdateInput = {
  id: string;
  name: string;
  kills?: number;
  techPower?: number;
  heroPower?: number;
  troopPower?: number;
  structurePower?: number;
  modVehiclePower?: number;
  march1Power?: number;
  march2Power?: number;
  march3Power?: number;
  march4Power?: number;
  totalPower?: number;
  gloryWarStatus?: string;
};

export async function updateRoster(players: RosterUpdateInput[]) {
  try {
    await requirePermission("editRoster");
    const SCORE_WEIGHTS = { kills: 0.30, tech: 0.25, hero: 0.20, troop: 0.15, structure: 0.05, modVehicle: 0.05 };
    const preparedPlayers = players.map((p) => {
      const id = ensureRecordId(p.id, "Player");
      const name = sanitizePlayerName(p.name);
      const kills = normalizeNonNegativeInt(p.kills);
      const tech = normalizeNonNegativeInt(p.techPower);
      const hero = normalizeNonNegativeInt(p.heroPower);
      const troop = normalizeNonNegativeInt(p.troopPower);
      const structure = normalizeNonNegativeInt(p.structurePower);
      const modVehicle = normalizeNonNegativeInt(p.modVehiclePower);
      const march1Power = normalizeNonNegativeInt(p.march1Power);
      const march2Power = normalizeNonNegativeInt(p.march2Power);
      const march3Power = normalizeNonNegativeInt(p.march3Power);
      const march4Power = normalizeNonNegativeInt(p.march4Power);
      const rawScore =
        (kills * SCORE_WEIGHTS.kills) +
        (tech * SCORE_WEIGHTS.tech) +
        (hero * SCORE_WEIGHTS.hero) +
        (troop * SCORE_WEIGHTS.troop) +
        (structure * SCORE_WEIGHTS.structure) +
        (modVehicle * SCORE_WEIGHTS.modVehicle);
      const totalPower = normalizeNonNegativeInt(p.totalPower) || (tech + hero + troop + structure + modVehicle);

      if (!name) {
        throw new Error("Player name cannot be empty.");
      }

      return {
        id,
        name,
        kills,
        tech,
        hero,
        troop,
        structure,
        modVehicle,
        march1Power,
        march2Power,
        march3Power,
        march4Power,
        rawScore,
        totalPower,
        gloryWarStatus: ensureAllowedValue(p.gloryWarStatus || "Offline", ALLOWED_GLORY_WAR_STATUSES, "Offline"),
      };
    });

    const duplicateName = preparedPlayers.find(
      (player, index) =>
        preparedPlayers.findIndex((candidate) => candidate.name.toLowerCase() === player.name.toLowerCase()) !== index
    );

    if (duplicateName) {
      throw new Error(`Player name "${duplicateName.name}" is already in use.`);
    }

    const existingConflicts = await prisma.player.findFirst({
      where: {
        NOT: { id: { in: preparedPlayers.map((player) => player.id) } },
        OR: preparedPlayers.map((player) => ({
          name: { equals: player.name, mode: "insensitive" as const },
        })),
      },
      select: { name: true },
    });

    if (existingConflicts) {
      throw new Error(`Player name "${existingConflicts.name}" is already in use.`);
    }

    const currentPlayers = await prisma.player.findMany({
      where: { id: { in: preparedPlayers.map((player) => player.id) } },
      select: { id: true, name: true },
    });

    const currentNameMap = new Map(currentPlayers.map((player) => [player.id, player.name]));
    const hasNameChanges = preparedPlayers.some((player) => currentNameMap.get(player.id) !== player.name);

    if (hasNameChanges) {
      await requirePermission("editPlayerNames");
    }

    const operations = preparedPlayers.flatMap((player) => [
      prisma.player.update({
        where: { id: player.id },
        data: {
          name: player.name,
          totalPower: player.totalPower,
          kills: player.kills,
          march1Power: player.march1Power,
          march2Power: player.march2Power,
          march3Power: player.march3Power,
          march4Power: player.march4Power,
          latestScore: player.rawScore,
          gloryWarStatus: player.gloryWarStatus,
        },
      }),
      prisma.snapshot.create({
        data: {
          playerId: player.id,
          kills: player.kills,
          totalPower: player.totalPower,
          structurePower: player.structure,
          techPower: player.tech,
          troopPower: player.troop,
          heroPower: player.hero,
          modVehiclePower: player.modVehicle,
          score: player.rawScore,
        },
      }),
    ]);

    await prisma.$transaction(operations);

    invalidatePlayerDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("ROSTER UPDATE ERROR:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update roster." };
  }
}

export async function deleteRosterPlayer(playerId: string) {
  try {
    await requirePermission("deleteRosterMembers");
    const normalizedPlayerId = ensureRecordId(playerId, "Player");

    await prisma.$transaction([
      prisma.snapshot.deleteMany({
        where: { playerId: normalizedPlayerId },
      }),
      prisma.player.delete({
        where: { id: normalizedPlayerId },
      }),
    ]);

    invalidatePlayerDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("ROSTER DELETE ERROR:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete player." };
  }
}
