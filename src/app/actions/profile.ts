"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/db";
import { hasPermission, requireCurrentUser } from "@/utils/auth";

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

function normalizeInt(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export async function saveProfileData(input: ProfileInput) {
  try {
    const currentUser = await requireCurrentUser();
    const canManageOthers = hasPermission(currentUser, "editRoster") || hasPermission(currentUser, "manageUsers");
    const isSelf = currentUser.playerId === input.playerId;

    if (!isSelf && !canManageOthers) {
      return { success: false, error: "You do not have permission to update that profile." };
    }

    const name = input.name.trim();
    if (!name) {
      return { success: false, error: "Player name is required." };
    }

    const existingConflict = await prisma.player.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        NOT: { id: input.playerId },
      },
      select: { id: true },
    });

    if (existingConflict) {
      return { success: false, error: `Player name "${name}" is already in use.` };
    }

    const kills = normalizeInt(input.kills);
    const techPower = normalizeInt(input.techPower);
    const heroPower = normalizeInt(input.heroPower);
    const troopPower = normalizeInt(input.troopPower);
    const modVehiclePower = normalizeInt(input.modVehiclePower);
    const structurePower = normalizeInt(input.structurePower);
    const totalPower =
      normalizeInt(input.totalPower) ||
      techPower + heroPower + troopPower + modVehiclePower + structurePower;
    const march1Power = normalizeInt(input.march1Power);
    const march2Power = normalizeInt(input.march2Power);
    const march3Power = normalizeInt(input.march3Power);
    const march4Power = normalizeInt(input.march4Power);
    const latestScore =
      kills * SCORE_WEIGHTS.kills +
      techPower * SCORE_WEIGHTS.tech +
      heroPower * SCORE_WEIGHTS.hero +
      troopPower * SCORE_WEIGHTS.troop +
      structurePower * SCORE_WEIGHTS.structure +
      modVehiclePower * SCORE_WEIGHTS.modVehicle;

    await prisma.$transaction([
      prisma.player.update({
        where: { id: input.playerId },
        data: {
          name,
          gloryWarStatus: input.gloryWarStatus || "Offline",
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
          playerId: input.playerId,
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

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("PROFILE SAVE ERROR:", error);
    return { success: false, error: error.message || "Failed to update profile." };
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
      where: { id: input.playerId },
      data: { leaderNotes: input.leaderNotes.trim() },
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("PROFILE NOTES ERROR:", error);
    return { success: false, error: error.message || "Failed to update leader notes." };
  }
}
