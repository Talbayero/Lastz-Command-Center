"use server";

import db from "@/utils/sqlite";

export async function getPlayers() {
  try {
    const players = db.prepare('SELECT name FROM Player ORDER BY name ASC').all() as { name: string }[];
    return players.map(p => p.name);
  } catch (error) {
    console.error("Failed to fetch players:", error);
    return [];
  }
}
