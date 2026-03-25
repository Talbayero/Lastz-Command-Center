import "server-only";

import { Prisma } from "@prisma/client";

export const PROFILE_SNAPSHOT_RETENTION = 12;

export async function prunePlayerSnapshots(
  tx: Prisma.TransactionClient,
  playerId: string,
  keepCount = PROFILE_SNAPSHOT_RETENTION
) {
  const snapshotsToDelete = await tx.snapshot.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    skip: keepCount,
    select: { id: true },
  });

  if (snapshotsToDelete.length === 0) {
    return;
  }

  await tx.snapshot.deleteMany({
    where: {
      id: {
        in: snapshotsToDelete.map((snapshot) => snapshot.id),
      },
    },
  });
}
