export type RecruitmentScope = "applicants" | "migrations";

export type RecruitmentScoreWeights = {
  troop: number;
  hero: number;
  tech: number;
  kills: number;
  structure: number;
  modVehicle: number;
};

export type RecruitmentScoreInput = {
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
};

export const recruitmentCategories = ["Elite", "Advanced", "Medium", "Regular"] as const;

export const defaultApplicantWeights: RecruitmentScoreWeights = {
  troop: 0.4,
  hero: 0.2,
  tech: 0.15,
  kills: 0.1,
  structure: 0.1,
  modVehicle: 0.05,
};

export const defaultMigrationWeights: RecruitmentScoreWeights = {
  troop: 0.3,
  hero: 0.2,
  tech: 0.15,
  kills: 0.1,
  structure: 0.1,
  modVehicle: 0.15,
};

export function getDefaultWeights(scope: RecruitmentScope) {
  return scope === "applicants" ? defaultApplicantWeights : defaultMigrationWeights;
}

export function normalizeWeightValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

export function normalizeWeights(
  raw: unknown,
  fallback: RecruitmentScoreWeights
): RecruitmentScoreWeights {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const next: RecruitmentScoreWeights = {
    troop: normalizeWeightValue(source.troop ?? fallback.troop),
    hero: normalizeWeightValue(source.hero ?? fallback.hero),
    tech: normalizeWeightValue(source.tech ?? fallback.tech),
    kills: normalizeWeightValue(source.kills ?? fallback.kills),
    structure: normalizeWeightValue(source.structure ?? fallback.structure),
    modVehicle: normalizeWeightValue(source.modVehicle ?? fallback.modVehicle),
  };

  const removedCombatWeight = normalizeWeightValue(source.combat);
  if (removedCombatWeight > 0) {
    const nonCombatTotal =
      next.troop + next.hero + next.tech + next.kills + next.structure + next.modVehicle;
    if (nonCombatTotal > 0) {
      const scale = (nonCombatTotal + removedCombatWeight) / nonCombatTotal;
      next.troop *= scale;
      next.hero *= scale;
      next.tech *= scale;
      next.kills *= scale;
      next.structure *= scale;
      next.modVehicle *= scale;
    }
  }

  const total = totalWeight(next);
  if (total <= 1.000001) {
    return next;
  }

  return fallback;
}

export function totalWeight(weights: RecruitmentScoreWeights) {
  return (
    weights.troop +
    weights.hero +
    weights.tech +
    weights.kills +
    weights.structure +
    weights.modVehicle
  );
}

export function getCombatPower(input: RecruitmentScoreInput) {
  return input.march1Power + input.march2Power + input.march3Power + input.march4Power;
}

export function computeRecruitmentScore(
  input: RecruitmentScoreInput,
  weights: RecruitmentScoreWeights
) {
  return Number(
    (
      (input.troopPower / 1_000_000) * weights.troop +
      (input.heroPower / 1_000_000) * weights.hero +
      (input.techPower / 1_000_000) * weights.tech +
      (input.kills / 1_000_000) * weights.kills +
      (input.structurePower / 1_000_000) * weights.structure +
      (input.modVehiclePower / 1_000_000) * weights.modVehicle
    ).toFixed(2)
  );
}

export function getFormulaLabel(
  scope: RecruitmentScope,
  weights: RecruitmentScoreWeights
) {
  const label = scope === "applicants" ? "Applicant Score" : "Migration Score";
  return `${label} = Troop x ${weights.troop.toFixed(2)} + Hero x ${weights.hero.toFixed(
    2
  )} + Tech x ${weights.tech.toFixed(
    2
  )} + Kills x ${weights.kills.toFixed(2)} + Structure x ${weights.structure.toFixed(
    2
  )} + Mod Vehicle x ${weights.modVehicle.toFixed(2)}`;
}

export function getRecommendationBand(score: number) {
  if (score >= 90) return "Strong Fit";
  if (score >= 55) return "Borderline";
  return "Low Priority";
}

export function getCategoryFromScore(score: number) {
  if (score >= 120) return "Elite";
  if (score >= 80) return "Advanced";
  if (score >= 45) return "Medium";
  return "Regular";
}
