import assert from "node:assert/strict";

import {
  computeRecruitmentScore,
  defaultApplicantWeights,
  defaultMigrationWeights,
  getCategoryFromScore,
  getCombatPower,
  getRecommendationBand,
  normalizeWeights,
  totalWeight,
} from "../src/utils/recruitmentScoring.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("getCombatPower prefers march total when marches are present", () => {
  const result = getCombatPower({
    techPower: 0,
    heroPower: 0,
    troopPower: 0,
    modVehiclePower: 0,
    structurePower: 0,
    march1Power: 10,
    march2Power: 20,
    march3Power: 30,
    march4Power: 40,
    combatPower: 999,
    kills: 0,
  });

  assert.equal(result, 100);
});

runTest("getCombatPower stays at zero when no marches are provided", () => {
  const result = getCombatPower({
    techPower: 0,
    heroPower: 0,
    troopPower: 0,
    modVehiclePower: 0,
    structurePower: 0,
    march1Power: 0,
    march2Power: 0,
    march3Power: 0,
    march4Power: 0,
    combatPower: 123456,
    kills: 0,
  });

  assert.equal(result, 0);
});

runTest("normalizeWeights keeps valid totals and rejects totals over 100%", () => {
  const valid = normalizeWeights(
    { troop: 0.25, combat: 0.25, hero: 0.2, tech: 0.1, kills: 0.1, structure: 0.1, modVehicle: 0 },
    defaultApplicantWeights
  );

  assert.ok(Math.abs(totalWeight(valid) - 1) < 0.000001);

  const fallback = normalizeWeights(
    { troop: 1, combat: 1, hero: 1, tech: 1, kills: 1, structure: 1, modVehicle: 1 },
    defaultApplicantWeights
  );

  assert.deepEqual(fallback, defaultApplicantWeights);
});

runTest("computeRecruitmentScore uses applicant and migration weights predictably", () => {
  const sample = {
    techPower: 20_000_000,
    heroPower: 40_000_000,
    troopPower: 80_000_000,
    modVehiclePower: 10_000_000,
    structurePower: 30_000_000,
    march1Power: 25_000_000,
    march2Power: 25_000_000,
    march3Power: 25_000_000,
    march4Power: 0,
    combatPower: 5,
    kills: 15_000_000,
  };

  assert.equal(computeRecruitmentScore(sample, defaultApplicantWeights), 58);
  assert.equal(computeRecruitmentScore(sample, defaultMigrationWeights), 54.25);
});

runTest("recommendation bands and categories map to expected thresholds", () => {
  assert.equal(getRecommendationBand(90), "Strong Fit");
  assert.equal(getRecommendationBand(55), "Borderline");
  assert.equal(getRecommendationBand(54.99), "Low Priority");

  assert.equal(getCategoryFromScore(120), "Elite");
  assert.equal(getCategoryFromScore(80), "Advanced");
  assert.equal(getCategoryFromScore(45), "Medium");
  assert.equal(getCategoryFromScore(44.99), "Regular");
});

console.log("Recruitment scoring smoke tests passed.");
