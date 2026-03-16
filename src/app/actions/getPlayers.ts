"use server";

import prisma from "@/utils/db";

export async function getPlayers() {
  try {
    const players = await prisma.player.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
    });
    return players.map((p) => p.name);
  } catch (error) {
    console.error("Failed to fetch players:", error);
    return [];
  }
}
