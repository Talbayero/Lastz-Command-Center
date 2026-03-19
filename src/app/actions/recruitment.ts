"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/db";
import { requirePermission } from "@/utils/auth";
import {
  computeRecruitmentScore,
  getCategoryFromScore,
  getDefaultWeights,
  normalizeWeights,
  type RecruitmentScope,
} from "@/utils/recruitmentScoring";

const applicantStatuses = ["New", "Reviewing", "Interview", "Approved", "Rejected"] as const;
const migrationStatuses = ["Scouted", "Contacted", "Negotiating", "Ready", "Rejected"] as const;
const migrationContactStatuses = ["Not Contacted", "Contacted", "In Discussion", "Follow Up", "Closed"] as const;
const recruitmentCategories = ["Elite", "Advanced", "Medium", "Regular"] as const;

export type RecruitmentStatInput = {
  name: string;
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
  march1Power: number;
  march2Power: number;
  march3Power: number;
  march4Power: number;
  combatPower: number;
  kills: number;
  notes: string;
};

export type ApplicantInput = RecruitmentStatInput & {
  id?: string;
  timezone: string;
  status: string;
};

export type MigrationCandidateInput = RecruitmentStatInput & {
  id?: string;
  originalServer: string;
  originalAlliance: string;
  reasonForLeaving: string;
  contactStatus: string;
  category: string;
  status: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeInt(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function getCombatData(input: RecruitmentStatInput) {
  const march1Power = normalizeInt(input.march1Power);
  const march2Power = normalizeInt(input.march2Power);
  const march3Power = normalizeInt(input.march3Power);
  const march4Power = normalizeInt(input.march4Power);
  const marchTotal = march1Power + march2Power + march3Power + march4Power;

  return {
    march1Power,
    march2Power,
    march3Power,
    march4Power,
    // Recruitment combat is always derived from the march aggregate.
    combatPower: marchTotal,
  };
}

async function getScoringWeights(scope: RecruitmentScope) {
  const config = await prisma.recruitmentScoringConfig.findUnique({
    where: { scope },
    select: { weights: true },
  });

  return normalizeWeights(config?.weights, getDefaultWeights(scope));
}

export async function ensureRecruitmentScoringConfigs() {
  await requirePermission("manageRecruitment");

  const scopes: RecruitmentScope[] = ["applicants", "migrations"];
  for (const scope of scopes) {
    await prisma.recruitmentScoringConfig.upsert({
      where: { scope },
      update: {},
      create: {
        scope,
        weights: getDefaultWeights(scope),
      },
    });
  }

  return { success: true };
}

export async function saveRecruitmentScoringConfig(input: {
  scope: RecruitmentScope;
  weights: Record<string, unknown>;
}) {
  try {
    await requirePermission("manageRecruitment");
    const weights = normalizeWeights(input.weights, getDefaultWeights(input.scope));

    await prisma.recruitmentScoringConfig.upsert({
      where: { scope: input.scope },
      update: { weights },
      create: {
        scope: input.scope,
        weights,
      },
    });

    revalidatePath("/");
    return { success: true, weights };
  } catch (error: unknown) {
    console.error("SAVE RECRUITMENT SCORING CONFIG ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to save recruitment scoring config.") };
  }
}

export async function saveApplicant(input: ApplicantInput) {
  try {
    await requirePermission("manageRecruitment");

    const name = input.name.trim();
    if (!name) {
      return { success: false, error: "Player name is required." };
    }

    if (!applicantStatuses.includes(input.status as (typeof applicantStatuses)[number])) {
      return { success: false, error: "Invalid applicant status." };
    }

    const data = {
      name,
      timezone: input.timezone.trim(),
      category: "",
      status: input.status,
      notes: input.notes.trim(),
      techPower: normalizeInt(input.techPower),
      heroPower: normalizeInt(input.heroPower),
      troopPower: normalizeInt(input.troopPower),
      modVehiclePower: normalizeInt(input.modVehiclePower),
      structurePower: normalizeInt(input.structurePower),
      ...getCombatData(input),
      kills: normalizeInt(input.kills),
      manualAdjustment: 0,
    };

    const record = input.id
      ? await prisma.allianceApplicant.update({
          where: { id: input.id },
          data,
        })
      : await prisma.allianceApplicant.create({ data });

    revalidatePath("/");
    return { success: true, record };
  } catch (error: unknown) {
    console.error("SAVE APPLICANT ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to save applicant.") };
  }
}

export async function saveMigrationCandidate(input: MigrationCandidateInput) {
  try {
    await requirePermission("manageRecruitment");

    const name = input.name.trim();
    if (!name) {
      return { success: false, error: "Player name is required." };
    }

    if (!migrationStatuses.includes(input.status as (typeof migrationStatuses)[number])) {
      return { success: false, error: "Invalid migration status." };
    }

    if (!migrationContactStatuses.includes(input.contactStatus as (typeof migrationContactStatuses)[number])) {
      return { success: false, error: "Invalid contact status." };
    }

    if (input.category && !recruitmentCategories.includes(input.category as (typeof recruitmentCategories)[number])) {
      return { success: false, error: "Invalid migration category." };
    }

    const normalizedStats = {
      techPower: normalizeInt(input.techPower),
      heroPower: normalizeInt(input.heroPower),
      troopPower: normalizeInt(input.troopPower),
      modVehiclePower: normalizeInt(input.modVehiclePower),
      structurePower: normalizeInt(input.structurePower),
      ...getCombatData(input),
      kills: normalizeInt(input.kills),
    };
    const migrationWeights = await getScoringWeights("migrations");
    const fallbackCategory = getCategoryFromScore(computeRecruitmentScore(normalizedStats, migrationWeights));

    const data = {
      name,
      originalServer: input.originalServer.trim(),
      originalAlliance: input.originalAlliance.trim(),
      reasonForLeaving: input.reasonForLeaving.trim(),
      contactStatus: input.contactStatus,
      category: input.category || fallbackCategory,
      status: input.status,
      notes: input.notes.trim(),
      ...normalizedStats,
      manualAdjustment: 0,
    };

    const record = input.id
      ? await prisma.migrationCandidate.update({
          where: { id: input.id },
          data,
        })
      : await prisma.migrationCandidate.create({ data });

    revalidatePath("/");
    return { success: true, record };
  } catch (error: unknown) {
    console.error("SAVE MIGRATION CANDIDATE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to save migration candidate.") };
  }
}

export async function deleteApplicant(input: { id: string }) {
  try {
    await requirePermission("manageRecruitment");
    await prisma.allianceApplicant.delete({ where: { id: input.id } });
    revalidatePath("/");
    return { success: true };
  } catch (error: unknown) {
    console.error("DELETE APPLICANT ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to delete applicant.") };
  }
}

export async function deleteMigrationCandidate(input: { id: string }) {
  try {
    await requirePermission("manageRecruitment");
    await prisma.migrationCandidate.delete({ where: { id: input.id } });
    revalidatePath("/");
    return { success: true };
  } catch (error: unknown) {
    console.error("DELETE MIGRATION CANDIDATE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to delete migration candidate.") };
  }
}
