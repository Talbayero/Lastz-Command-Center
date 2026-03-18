"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/db";
import { requirePermission } from "@/utils/auth";

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
  manualAdjustment: number;
};

export type ApplicantInput = RecruitmentStatInput & {
  id?: string;
  timezone: string;
  category: string;
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

function normalizeInt(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeSignedInt(value: unknown) {
  return Math.round(Number(value) || 0);
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
    combatPower: marchTotal > 0 ? marchTotal : normalizeInt(input.combatPower),
  };
}

function applicantScore(input: RecruitmentStatInput) {
  const combat = getCombatData(input).combatPower;
  const millions = {
    troop: normalizeInt(input.troopPower) / 1_000_000,
    combat: combat / 1_000_000,
    hero: normalizeInt(input.heroPower) / 1_000_000,
    tech: normalizeInt(input.techPower) / 1_000_000,
    kills: normalizeInt(input.kills) / 1_000_000,
    structure: normalizeInt(input.structurePower) / 1_000_000,
  };

  return Number(
    (
      millions.troop * 0.4 +
      millions.combat * 0.2 +
      millions.hero * 0.15 +
      millions.tech * 0.1 +
      millions.kills * 0.1 +
      millions.structure * 0.05 +
      normalizeSignedInt(input.manualAdjustment)
    ).toFixed(2)
  );
}

function migrationScore(input: RecruitmentStatInput) {
  const combat = getCombatData(input).combatPower;
  const millions = {
    troop: normalizeInt(input.troopPower) / 1_000_000,
    combat: combat / 1_000_000,
    hero: normalizeInt(input.heroPower) / 1_000_000,
    tech: normalizeInt(input.techPower) / 1_000_000,
    kills: normalizeInt(input.kills) / 1_000_000,
    structure: normalizeInt(input.structurePower) / 1_000_000,
    modVehicle: normalizeInt(input.modVehiclePower) / 1_000_000,
  };

  return Number(
    (
      millions.troop * 0.3 +
      millions.combat * 0.25 +
      millions.hero * 0.15 +
      millions.tech * 0.1 +
      millions.kills * 0.1 +
      millions.modVehicle * 0.05 +
      millions.structure * 0.05 +
      normalizeSignedInt(input.manualAdjustment)
    ).toFixed(2)
  );
}

function defaultCategoryFromScore(score: number) {
  if (score >= 120) return "Elite";
  if (score >= 80) return "Advanced";
  if (score >= 45) return "Medium";
  return "Regular";
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

    if (!recruitmentCategories.includes(input.category as (typeof recruitmentCategories)[number])) {
      return { success: false, error: "Invalid applicant category." };
    }

    const data = {
      name,
      timezone: input.timezone.trim(),
      category: input.category || defaultCategoryFromScore(applicantScore(input)),
      status: input.status,
      notes: input.notes.trim(),
      techPower: normalizeInt(input.techPower),
      heroPower: normalizeInt(input.heroPower),
      troopPower: normalizeInt(input.troopPower),
      modVehiclePower: normalizeInt(input.modVehiclePower),
      structurePower: normalizeInt(input.structurePower),
      ...getCombatData(input),
      kills: normalizeInt(input.kills),
      manualAdjustment: normalizeSignedInt(input.manualAdjustment),
    };

    if (input.id) {
      await prisma.allianceApplicant.update({
        where: { id: input.id },
        data,
      });
    } else {
      await prisma.allianceApplicant.create({ data });
    }

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("SAVE APPLICANT ERROR:", error);
    return { success: false, error: error.message || "Failed to save applicant." };
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

    if (!recruitmentCategories.includes(input.category as (typeof recruitmentCategories)[number])) {
      return { success: false, error: "Invalid migration category." };
    }

    const data = {
      name,
      originalServer: input.originalServer.trim(),
      originalAlliance: input.originalAlliance.trim(),
      reasonForLeaving: input.reasonForLeaving.trim(),
      contactStatus: input.contactStatus,
      category: input.category || defaultCategoryFromScore(migrationScore(input)),
      status: input.status,
      notes: input.notes.trim(),
      techPower: normalizeInt(input.techPower),
      heroPower: normalizeInt(input.heroPower),
      troopPower: normalizeInt(input.troopPower),
      modVehiclePower: normalizeInt(input.modVehiclePower),
      structurePower: normalizeInt(input.structurePower),
      ...getCombatData(input),
      kills: normalizeInt(input.kills),
      manualAdjustment: normalizeSignedInt(input.manualAdjustment),
    };

    if (input.id) {
      await prisma.migrationCandidate.update({
        where: { id: input.id },
        data,
      });
    } else {
      await prisma.migrationCandidate.create({ data });
    }

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("SAVE MIGRATION CANDIDATE ERROR:", error);
    return { success: false, error: error.message || "Failed to save migration candidate." };
  }
}

export async function deleteApplicant(input: { id: string }) {
  try {
    await requirePermission("manageRecruitment");
    await prisma.allianceApplicant.delete({ where: { id: input.id } });
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("DELETE APPLICANT ERROR:", error);
    return { success: false, error: error.message || "Failed to delete applicant." };
  }
}

export async function deleteMigrationCandidate(input: { id: string }) {
  try {
    await requirePermission("manageRecruitment");
    await prisma.migrationCandidate.delete({ where: { id: input.id } });
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("DELETE MIGRATION CANDIDATE ERROR:", error);
    return { success: false, error: error.message || "Failed to delete migration candidate." };
  }
}
