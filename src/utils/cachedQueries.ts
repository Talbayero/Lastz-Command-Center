import "server-only";

import { unstable_cache } from "next/cache";
import prisma from "@/utils/db";
import { ALLIANCE_DUEL_DAYS, getAllianceDuelDayLabel } from "@/utils/allianceDuel";
import { CACHE_TAGS } from "@/utils/cacheTags";
import { getDefaultWeights, normalizeWeights } from "@/utils/recruitmentScoring";

export const getPlayerNamesCached = unstable_cache(
  async () => {
    const players = await prisma.player.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
    });
    return players.map((player) => player.name);
  },
  ["player-names"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.playerList, CACHE_TAGS.players],
  }
);

export const getAllPlayersCached = unstable_cache(
  async () =>
    prisma.player.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ["all-players"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.players, CACHE_TAGS.playerList],
  }
);

export const getBugDataCached = unstable_cache(
  async () =>
    prisma.bug.findMany({
      orderBy: { createdAt: "desc" },
    }),
  ["bug-list"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.bugs],
  }
);

export const getAdminRolesCached = unstable_cache(
  async () =>
    prisma.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isSystem: true, permissions: true },
    }),
  ["admin-roles"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.roles, CACHE_TAGS.admin],
  }
);

export const getAdminUsersCached = unstable_cache(
  async () =>
    prisma.user.findMany({
      orderBy: { player: { name: "asc" } },
      select: {
        id: true,
        playerId: true,
        roleId: true,
        isActive: true,
        disabledByUser: true,
        lastLoginAt: true,
        player: {
          select: { id: true, name: true },
        },
        role: {
          select: { name: true },
        },
        sessions: {
          where: {
            expiresAt: {
              gt: new Date(),
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, createdAt: true },
        },
      },
    }),
  ["admin-users"],
  {
    revalidate: 30,
    tags: [CACHE_TAGS.admin, CACHE_TAGS.auth],
  }
);

export const getDuelRequirementsCached = unstable_cache(
  async () =>
    prisma.allianceDuelRequirement.findMany({
      orderBy: { dayKey: "asc" },
    }),
  ["duel-requirements"],
  {
    revalidate: 600,
    tags: [CACHE_TAGS.duelRequirements, CACHE_TAGS.duel],
  }
);

export const getDuelScoresCached = unstable_cache(
  async () =>
    prisma.allianceDuelScore.findMany({
      select: {
        playerId: true,
        scoreType: true,
        dayKey: true,
        score: true,
        rank: true,
      },
    }),
  ["duel-scores"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.duel],
  }
);

export const getRecruitmentConfigsCached = unstable_cache(
  async () => {
    const [applicantConfig, migrationConfig] = await Promise.all([
      prisma.recruitmentScoringConfig.findUnique({ where: { scope: "applicants" } }),
      prisma.recruitmentScoringConfig.findUnique({ where: { scope: "migrations" } }),
    ]);

    return {
      applicants: normalizeWeights(applicantConfig?.weights, getDefaultWeights("applicants")),
      migrations: normalizeWeights(migrationConfig?.weights, getDefaultWeights("migrations")),
    };
  },
  ["recruitment-configs"],
  {
    revalidate: 120,
    tags: [CACHE_TAGS.recruitmentConfig, CACHE_TAGS.recruitment],
  }
);

export const getRecruitmentApplicantsCached = unstable_cache(
  async () =>
    prisma.allianceApplicant.findMany({
      orderBy: { updatedAt: "desc" },
    }),
  ["recruitment-applicants"],
  {
    revalidate: 120,
    tags: [CACHE_TAGS.recruitment],
  }
);

export const getRecruitmentMigrationsCached = unstable_cache(
  async () =>
    prisma.migrationCandidate.findMany({
      orderBy: { updatedAt: "desc" },
    }),
  ["recruitment-migrations"],
  {
    revalidate: 120,
    tags: [CACHE_TAGS.recruitment],
  }
);

export const getProfilePlayerCached = unstable_cache(
  async (resolvedTargetName: string | undefined, fallbackPlayerId: string) => {
    const targetPlayer =
      (resolvedTargetName
        ? await prisma.player.findFirst({
            where: { name: { equals: resolvedTargetName, mode: "insensitive" } },
            select: {
              id: true,
              name: true,
              totalPower: true,
              kills: true,
              latestScore: true,
              gloryWarStatus: true,
              march1Power: true,
              march2Power: true,
              march3Power: true,
              march4Power: true,
              updatedAt: true,
              leaderNotes: true,
              snapshots: {
                orderBy: { createdAt: "desc" },
                take: 3,
                select: {
                  id: true,
                  createdAt: true,
                  totalPower: true,
                  kills: true,
                  score: true,
                  structurePower: true,
                  techPower: true,
                  troopPower: true,
                  heroPower: true,
                  modVehiclePower: true,
                },
              },
            },
          })
        : null) ??
      (await prisma.player.findUnique({
        where: { id: fallbackPlayerId },
        select: {
          id: true,
          name: true,
          totalPower: true,
          kills: true,
          latestScore: true,
          gloryWarStatus: true,
          march1Power: true,
          march2Power: true,
          march3Power: true,
          march4Power: true,
          updatedAt: true,
          leaderNotes: true,
          snapshots: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              createdAt: true,
              totalPower: true,
              kills: true,
              score: true,
              structurePower: true,
              techPower: true,
              troopPower: true,
              heroPower: true,
              modVehiclePower: true,
            },
          },
        },
      }));

    return targetPlayer;
  },
  ["profile-player"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.profile, CACHE_TAGS.players, CACHE_TAGS.snapshots],
  }
);

export const getProfileDailyDuelDataCached = unstable_cache(
  async (playerId: string) => {
    const currentDayIndex = new Date().getDay();
    const currentDayKey = ALLIANCE_DUEL_DAYS[Math.max(0, Math.min(ALLIANCE_DUEL_DAYS.length - 1, currentDayIndex - 1))];

    const [dailyRequirement, dailyScore] = await Promise.all([
      prisma.allianceDuelRequirement.findUnique({ where: { dayKey: currentDayKey } }),
      prisma.allianceDuelScore.findUnique({
        where: {
          playerId_scoreType_dayKey: {
            playerId,
            scoreType: "daily",
            dayKey: currentDayKey,
          },
        },
      }),
    ]);

    return {
      currentDayKey,
      dailyRequirement: dailyRequirement
        ? {
            minimumScore: dailyRequirement.minimumScore,
            eventName: dailyRequirement.eventName,
          }
        : {
            minimumScore: 0,
            eventName: getAllianceDuelDayLabel(currentDayKey),
          },
      dailyScore: dailyScore
        ? {
            score: dailyScore.score,
            rank: dailyScore.rank,
          }
        : null,
    };
  },
  ["profile-daily-duel"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.duel, CACHE_TAGS.duelRequirements, CACHE_TAGS.profile],
  }
);
