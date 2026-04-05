"use server";
import prisma from "@/utils/db";
import { requirePermission } from "@/utils/auth";
import { invalidateRecruitmentDataCache } from "@/utils/cacheTags";
import {
  computeRecruitmentScore,
  defaultRecommendationThresholds,
  getCategoryFromScore,
  getDefaultWeights,
  normalizeThresholds,
  normalizeWeights,
  type RecruitmentRecommendationThresholds,
  type RecruitmentScope,
} from "@/utils/recruitmentScoring";
import {
  APPLICANT_STATUSES,
  MIGRATION_CONTACT_STATUSES,
  MIGRATION_STATUSES,
  RECRUITMENT_CATEGORIES,
  TIMEZONE_OPTIONS,
  ensureAllowedValue,
  ensureRecordId,
  normalizeNonNegativeInt,
  sanitizeIdentifier,
  sanitizeMultiLineText,
  sanitizePlayerName,
} from "@/utils/validation";

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

function getCombatData(input: RecruitmentStatInput) {
  const march1Power = normalizeNonNegativeInt(input.march1Power);
  const march2Power = normalizeNonNegativeInt(input.march2Power);
  const march3Power = normalizeNonNegativeInt(input.march3Power);
  const march4Power = normalizeNonNegativeInt(input.march4Power);
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
  thresholds?: Record<string, unknown>;
}) {
  try {
    await requirePermission("manageRecruitment");
    const weights = normalizeWeights(input.weights, getDefaultWeights(input.scope));
    const thresholds = normalizeThresholds(input.thresholds, defaultRecommendationThresholds);

    await prisma.recruitmentScoringConfig.upsert({
      where: { scope: input.scope },
      update: { weights: { ...weights, ...thresholds } },
      create: {
        scope: input.scope,
        weights: { ...weights, ...thresholds },
      },
    });

    invalidateRecruitmentDataCache();
    return { success: true, weights, thresholds };
  } catch (error: unknown) {
    console.error("SAVE RECRUITMENT SCORING CONFIG ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to save recruitment scoring config.") };
  }
}

export async function saveApplicant(input: ApplicantInput) {
  try {
    await requirePermission("manageRecruitment");

    const name = sanitizePlayerName(input.name);
    if (!name) {
      return { success: false, error: "Player name is required." };
    }

    const status = ensureAllowedValue(input.status, APPLICANT_STATUSES);
    const timezone = ensureAllowedValue(input.timezone || "UTC-6", TIMEZONE_OPTIONS, "UTC-6");

    const data = {
      name,
      timezone,
      category: "",
      status,
      notes: sanitizeMultiLineText(input.notes, 2000),
      techPower: normalizeNonNegativeInt(input.techPower),
      heroPower: normalizeNonNegativeInt(input.heroPower),
      troopPower: normalizeNonNegativeInt(input.troopPower),
      modVehiclePower: normalizeNonNegativeInt(input.modVehiclePower),
      structurePower: normalizeNonNegativeInt(input.structurePower),
      ...getCombatData(input),
      kills: normalizeNonNegativeInt(input.kills),
      manualAdjustment: 0,
    };

    const record = input.id
      ? await prisma.allianceApplicant.update({
          where: { id: ensureRecordId(input.id, "Applicant") },
          data,
        })
      : await prisma.allianceApplicant.create({ data });

    invalidateRecruitmentDataCache();
    return { success: true, record };
  } catch (error: unknown) {
    console.error("SAVE APPLICANT ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to save applicant.") };
  }
}

export async function saveMigrationCandidate(input: MigrationCandidateInput) {
  try {
    await requirePermission("manageRecruitment");

    const name = sanitizePlayerName(input.name);
    if (!name) {
      return { success: false, error: "Player name is required." };
    }

    const status = ensureAllowedValue(input.status, MIGRATION_STATUSES);
    const contactStatus = ensureAllowedValue(input.contactStatus, MIGRATION_CONTACT_STATUSES);
    const requestedCategory = input.category
      ? ensureAllowedValue(input.category, RECRUITMENT_CATEGORIES)
      : "";

    const normalizedStats = {
      techPower: normalizeNonNegativeInt(input.techPower),
      heroPower: normalizeNonNegativeInt(input.heroPower),
      troopPower: normalizeNonNegativeInt(input.troopPower),
      modVehiclePower: normalizeNonNegativeInt(input.modVehiclePower),
      structurePower: normalizeNonNegativeInt(input.structurePower),
      ...getCombatData(input),
      kills: normalizeNonNegativeInt(input.kills),
    };
    const migrationWeights = await getScoringWeights("migrations");
    const fallbackCategory = getCategoryFromScore(computeRecruitmentScore(normalizedStats, migrationWeights));

    const data = {
      name,
      originalServer: sanitizeIdentifier(input.originalServer),
      originalAlliance: sanitizeIdentifier(input.originalAlliance),
      reasonForLeaving: sanitizeMultiLineText(input.reasonForLeaving, 500),
      contactStatus,
      category: requestedCategory || fallbackCategory,
      status,
      notes: sanitizeMultiLineText(input.notes, 2000),
      ...normalizedStats,
      manualAdjustment: 0,
    };

    const record = input.id
      ? await prisma.migrationCandidate.update({
          where: { id: ensureRecordId(input.id, "Migration candidate") },
          data,
        })
      : await prisma.migrationCandidate.create({ data });

    invalidateRecruitmentDataCache();
    return { success: true, record };
  } catch (error: unknown) {
    console.error("SAVE MIGRATION CANDIDATE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to save migration candidate.") };
  }
}

export async function deleteApplicant(input: { id: string }) {
  try {
    await requirePermission("manageRecruitment");
    await prisma.allianceApplicant.delete({ where: { id: ensureRecordId(input.id, "Applicant") } });
    invalidateRecruitmentDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("DELETE APPLICANT ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to delete applicant.") };
  }
}

export async function deleteMigrationCandidate(input: { id: string }) {
  try {
    await requirePermission("manageRecruitment");
    await prisma.migrationCandidate.delete({ where: { id: ensureRecordId(input.id, "Migration candidate") } });
    invalidateRecruitmentDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("DELETE MIGRATION CANDIDATE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to delete migration candidate.") };
  }
}
