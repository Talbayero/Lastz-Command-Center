"use server";

import { getPlayerNamesCached } from "@/utils/cachedQueries";

export async function getPlayers() {
  try {
    return await getPlayerNamesCached();
  } catch (error) {
    console.error("Failed to fetch players:", error);
    return [];
  }
}
