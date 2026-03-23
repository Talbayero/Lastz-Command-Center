import { revalidateTag } from "next/cache";

export const CACHE_TAGS = {
  auth: "auth",
  roles: "roles",
  admin: "admin",
  players: "players",
  playerList: "player-list",
  snapshots: "snapshots",
  roster: "roster",
  leaderboard: "leaderboard",
  profile: "profile",
  bugs: "bugs",
  duel: "duel",
  duelRequirements: "duel-requirements",
  recruitment: "recruitment",
  recruitmentConfig: "recruitment-config",
} as const;

function revalidateTags(tags: string[]) {
  for (const tag of tags) {
    revalidateTag(tag, "max");
  }
}

export function invalidatePlayerDataCache() {
  revalidateTags([
    CACHE_TAGS.players,
    CACHE_TAGS.playerList,
    CACHE_TAGS.snapshots,
    CACHE_TAGS.roster,
    CACHE_TAGS.leaderboard,
    CACHE_TAGS.profile,
  ]);
}

export function invalidateAuthDataCache() {
  revalidateTags([CACHE_TAGS.auth, CACHE_TAGS.admin, CACHE_TAGS.roles]);
}

export function invalidateAdminDataCache() {
  revalidateTags([CACHE_TAGS.admin, CACHE_TAGS.roles, CACHE_TAGS.auth]);
}

export function invalidateBugDataCache() {
  revalidateTags([CACHE_TAGS.bugs]);
}

export function invalidateDuelDataCache() {
  revalidateTags([CACHE_TAGS.duel, CACHE_TAGS.duelRequirements, CACHE_TAGS.profile]);
}

export function invalidateRecruitmentDataCache() {
  revalidateTags([CACHE_TAGS.recruitment, CACHE_TAGS.recruitmentConfig]);
}
