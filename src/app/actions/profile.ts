"use server";

import prisma from "@/utils/db";
import { hasPermission, requireCurrentUser } from "@/utils/auth";
import { invalidateDuelDataCache, invalidatePlayerDataCache } from "@/utils/cacheTags";
import {
  ALLOWED_GLORY_WAR_STATUSES,
  ensureAllowedValue,
  ensureRecordId,
  normalizeNonNegativeInt,
  sanitizeMultiLineText,
  sanitizePlayerName,
} from "@/utils/validation";

const SCORE_WEIGHTS = { kills: 0.30, tech: 0.25, hero: 0.20, troop: 0.15, structure: 0.05, modVehicle: 0.05 };

type ProfileInput = {
  playerId: string;
  name: string;
  gloryWarStatus: string;
  totalPower: number;
  kills: number;
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
  march1Power: number;
  march2Power: number;
  march3Power: number;
  march4Power: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function saveProfileData(input: ProfileInput) {
  try {
    const currentUser = await requireCurrentUser();
    const playerId = ensureRecordId(input.playerId, "Player");
    const canManageOthers = hasPermission(currentUser, "editRoster") || hasPermission(currentUser, "manageUsers");
    const isSelf = currentUser.playerId === playerId;

    if (!isSelf && !canManageOthers) {
      return { success: false, error: "You do not have permission to update that profile." };
    }

    const name = sanitizePlayerName(input.name);
    if (!name) {
      return { success: false, error: "Player name is required." };
    }

    const existingConflict = await prisma.player.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        NOT: { id: playerId },
      },
      select: { id: true },
    });

    if (existingConflict) {
      return { success: false, error: `Player name "${name}" is already in use.` };
    }

    const kills = normalizeNonNegativeInt(input.kills);
    const techPower = normalizeNonNegativeInt(input.techPower);
    const heroPower = normalizeNonNegativeInt(input.heroPower);
    const troopPower = normalizeNonNegativeInt(input.troopPower);
    const modVehiclePower = normalizeNonNegativeInt(input.modVehiclePower);
    const structurePower = normalizeNonNegativeInt(input.structurePower);
    const totalPower =
      normalizeNonNegativeInt(input.totalPower) ||
      techPower + heroPower + troopPower + modVehiclePower + structurePower;
    const march1Power = normalizeNonNegativeInt(input.march1Power);
    const march2Power = normalizeNonNegativeInt(input.march2Power);
    const march3Power = normalizeNonNegativeInt(input.march3Power);
    const march4Power = normalizeNonNegativeInt(input.march4Power);
    const gloryWarStatus = ensureAllowedValue(input.gloryWarStatus, ALLOWED_GLORY_WAR_STATUSES, "Offline");
    const latestScore =
      kills * SCORE_WEIGHTS.kills +
      techPower * SCORE_WEIGHTS.tech +
      heroPower * SCORE_WEIGHTS.hero +
      troopPower * SCORE_WEIGHTS.troop +
      structurePower * SCORE_WEIGHTS.structure +
      modVehiclePower * SCORE_WEIGHTS.modVehicle;

    await prisma.$transaction([
      prisma.player.update({
        where: { id: playerId },
        data: {
          name,
          gloryWarStatus,
          totalPower,
          kills,
          march1Power,
          march2Power,
          march3Power,
          march4Power,
          latestScore,
        },
      }),
      prisma.snapshot.create({
        data: {
          playerId,
          kills,
          totalPower,
          structurePower,
          techPower,
          troopPower,
          heroPower,
          modVehiclePower,
          score: latestScore,
        },
      }),
    ]);
    invalidatePlayerDataCache();
    invalidateDuelDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("PROFILE SAVE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to update profile.") };
  }
}

export async function saveProfileLeaderNotes(input: { playerId: string; leaderNotes: string }) {
  try {
    const currentUser = await requireCurrentUser();
    const canManageNotes = hasPermission(currentUser, "editRoster") || hasPermission(currentUser, "manageUsers");

    if (!canManageNotes) {
      return { success: false, error: "You do not have permission to update leader notes." };
    }

    await prisma.player.update({
      where: { id: ensureRecordId(input.playerId, "Player") },
      data: { leaderNotes: sanitizeMultiLineText(input.leaderNotes, 2000) },
    });
    invalidatePlayerDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("PROFILE NOTES ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to update leader notes.") };
  }
}
