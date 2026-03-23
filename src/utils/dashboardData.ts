import "server-only";

import { unstable_cache } from "next/cache";
import prisma from "@/utils/db";
import { CACHE_TAGS } from "@/utils/cacheTags";

type SnapshotLike = {
  createdAt: Date;
  kills: number;
  totalPower: number;
  structurePower: number;
  techPower: number;
  troopPower: number;
  heroPower: number;
  modVehiclePower: number;
  score: number;
};

type PlayerLike = {
  id: string;
  name: string;
  totalPower: number;
  kills: number;
  latestScore: number;
  gloryWarStatus: string;
  march1Power: number;
  march2Power: number;
  march3Power: number;
  march4Power: number;
};

function flattenPlayerSnapshot(player: PlayerLike, snapshot?: SnapshotLike | null) {
  const combatPower = player.march1Power + player.march2Power + player.march3Power + player.march4Power;
  return {
    id: player.id,
    name: player.name,
    totalPower: player.totalPower,
    kills: player.kills,
    latestScore: player.latestScore,
    gloryWarStatus: player.gloryWarStatus,
    march1Power: player.march1Power,
    march2Power: player.march2Power,
    march3Power: player.march3Power,
    march4Power: player.march4Power,
    combatPower,
    createdAt: snapshot?.createdAt ?? null,
    structurePower: snapshot?.structurePower ?? 0,
    techPower: snapshot?.techPower ?? 0,
    troopPower: snapshot?.troopPower ?? 0,
    heroPower: snapshot?.heroPower ?? 0,
    modVehiclePower: snapshot?.modVehiclePower ?? 0,
    score: snapshot?.score ?? player.latestScore,
  };
}

const getAllianceAverageCached = unstable_cache(
  async () => {
    const players = await prisma.player.findMany({
      select: {
        snapshots: {
          select: {
            techPower: true,
            heroPower: true,
            troopPower: true,
            modVehiclePower: true,
            structurePower: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const latestSnapshots = players
      .map((player) => player.snapshots[0])
      .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));

    if (latestSnapshots.length === 0) {
      return {
        techPower: 0,
        heroPower: 0,
        troopPower: 0,
        modVehiclePower: 0,
        structurePower: 0,
      };
    }

    const totals = latestSnapshots.reduce(
      (acc, snapshot) => ({
        techPower: acc.techPower + snapshot.techPower,
        heroPower: acc.heroPower + snapshot.heroPower,
        troopPower: acc.troopPower + snapshot.troopPower,
        modVehiclePower: acc.modVehiclePower + snapshot.modVehiclePower,
        structurePower: acc.structurePower + snapshot.structurePower,
      }),
      {
        techPower: 0,
        heroPower: 0,
        troopPower: 0,
        modVehiclePower: 0,
        structurePower: 0,
      }
    );

    return {
      techPower: totals.techPower / latestSnapshots.length,
      heroPower: totals.heroPower / latestSnapshots.length,
      troopPower: totals.troopPower / latestSnapshots.length,
      modVehiclePower: totals.modVehiclePower / latestSnapshots.length,
      structurePower: totals.structurePower / latestSnapshots.length,
    };
  },
  ["alliance-average"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.players, CACHE_TAGS.snapshots, CACHE_TAGS.roster, CACHE_TAGS.profile],
  }
);

async function fetchSelectedPlayer(targetName?: string) {
  const player = targetName
    ? await prisma.player.findFirst({
        where: { name: { equals: targetName, mode: "insensitive" } },
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
          snapshots: {
            select: {
              createdAt: true,
              kills: true,
              totalPower: true,
              structurePower: true,
              techPower: true,
              troopPower: true,
              heroPower: true,
              modVehiclePower: true,
              score: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      })
    : await prisma.player.findFirst({
        orderBy: { latestScore: "desc" },
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
          snapshots: {
            select: {
              createdAt: true,
              kills: true,
              totalPower: true,
              structurePower: true,
              techPower: true,
              troopPower: true,
              heroPower: true,
              modVehiclePower: true,
              score: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

  if (!player) {
    return null;
  }

  return flattenPlayerSnapshot(player, player.snapshots[0]);
}

const getSelectedPlayerCached = unstable_cache(
  async (targetName?: string) => {
    const player = await fetchSelectedPlayer(targetName);
    if (!player && targetName) {
      return fetchSelectedPlayer();
    }
    return player;
  },
  ["selected-player"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.players, CACHE_TAGS.snapshots, CACHE_TAGS.leaderboard, CACHE_TAGS.profile],
  }
);

const getRosterDataCached = unstable_cache(
  async () => {
    const players = await prisma.player.findMany({
      orderBy: { name: "asc" },
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
        snapshots: {
          select: {
            createdAt: true,
            kills: true,
            totalPower: true,
            structurePower: true,
            techPower: true,
            troopPower: true,
            heroPower: true,
            modVehiclePower: true,
            score: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return players.map((player) => flattenPlayerSnapshot(player, player.snapshots[0]));
  },
  ["roster-data"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.players, CACHE_TAGS.snapshots, CACHE_TAGS.roster, CACHE_TAGS.profile],
  }
);

const getLeaderboardDataCached = unstable_cache(
  async () => {
    const players = await prisma.player.findMany({
      orderBy: { latestScore: "desc" },
      take: 10,
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
        snapshots: {
          select: {
            createdAt: true,
            kills: true,
            totalPower: true,
            structurePower: true,
            techPower: true,
            troopPower: true,
            heroPower: true,
            modVehiclePower: true,
            score: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return players.map((player) => flattenPlayerSnapshot(player, player.snapshots[0]));
  },
  ["leaderboard-data"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.players, CACHE_TAGS.snapshots, CACHE_TAGS.leaderboard],
  }
);

export async function getAllianceAverage() {
  return getAllianceAverageCached();
}

export async function getSelectedPlayer(targetName?: string) {
  return getSelectedPlayerCached(targetName);
}

export async function getRosterData() {
  return getRosterDataCached();
}

export async function getLeaderboardData() {
  return getLeaderboardDataCached();
}
