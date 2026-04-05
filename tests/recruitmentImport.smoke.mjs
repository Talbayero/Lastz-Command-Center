import assert from "node:assert/strict";

import {
  createCsvTemplate,
  mergeApplicantDraft,
  mergeMigrationDraft,
  parseCsvText,
  toApplicantDraftFromCsv,
  toMigrationDraftFromCsv,
} from "../src/utils/recruitmentImport.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("parseCsvText and applicant draft mapping support common headers", () => {
  const rows = parseCsvText(
    "Player Name,Timezone,Tech Power,Hero Power,Troop Power,Kills\nBryshen,UTC-6,19255142,56195929,81674460,4341281\n"
  );

  assert.equal(rows.length, 1);
  const draft = toApplicantDraftFromCsv(rows[0]);
  assert.equal(draft.name, "Bryshen");
  assert.equal(draft.timezone, "UTC-6");
  assert.equal(draft.techPower, 19255142);
  assert.equal(draft.heroPower, 56195929);
  assert.equal(draft.troopPower, 81674460);
  assert.equal(draft.kills, 4341281);
  assert.equal(draft.combatPower, 0);
});

runTest("migration draft mapping keeps migration-specific fields", () => {
  const rows = parseCsvText(
    "player_name,original_server,original_alliance,contact_status,category,status,reason_for_leaving\nDHB,123,NDr,In Discussion,Elite,Ready,Cannot go with team\n"
  );

  const draft = toMigrationDraftFromCsv(rows[0]);
  assert.equal(draft.name, "DHB");
  assert.equal(draft.originalServer, "123");
  assert.equal(draft.originalAlliance, "NDr");
  assert.equal(draft.contactStatus, "In Discussion");
  assert.equal(draft.category, "Elite");
  assert.equal(draft.status, "Ready");
  assert.equal(draft.reasonForLeaving, "Cannot go with team");
});

runTest("mergeApplicantDraft only enriches zero or blank fields", () => {
  const merged = mergeApplicantDraft(
    {
      id: "a1",
      name: "Bryshen",
      timezone: "",
      status: "Reviewing",
      techPower: 0,
      heroPower: 10,
      troopPower: 0,
      modVehiclePower: 5,
      structurePower: 0,
      march1Power: 0,
      march2Power: 0,
      march3Power: 0,
      march4Power: 0,
      combatPower: 0,
      kills: 0,
      notes: "",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
    {
      name: "Bryshen",
      timezone: "UTC-6",
      status: "New",
      techPower: 100,
      heroPower: 999,
      troopPower: 200,
      modVehiclePower: 777,
      structurePower: 300,
      march1Power: 11,
      march2Power: 22,
      march3Power: 33,
      march4Power: 44,
      combatPower: 0,
      kills: 400,
      notes: "Imported notes",
    }
  );

  assert.equal(merged.timezone, "UTC-6");
  assert.equal(merged.status, "Reviewing");
  assert.equal(merged.techPower, 100);
  assert.equal(merged.heroPower, 10);
  assert.equal(merged.troopPower, 200);
  assert.equal(merged.modVehiclePower, 5);
  assert.equal(merged.structurePower, 300);
  assert.equal(merged.march1Power, 11);
  assert.equal(merged.kills, 400);
  assert.equal(merged.notes, "Imported notes");
});

runTest("mergeMigrationDraft preserves filled values and enriches blanks", () => {
  const merged = mergeMigrationDraft(
    {
      id: "m1",
      name: "DHB",
      originalServer: "",
      originalAlliance: "NDr",
      reasonForLeaving: "",
      contactStatus: "",
      category: "Elite",
      status: "Ready",
      techPower: 0,
      heroPower: 20,
      troopPower: 0,
      modVehiclePower: 0,
      structurePower: 0,
      march1Power: 0,
      march2Power: 0,
      march3Power: 0,
      march4Power: 0,
      combatPower: 0,
      kills: 0,
      notes: "",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
    {
      name: "DHB",
      originalServer: "123",
      originalAlliance: "Other",
      reasonForLeaving: "Cannot go with team",
      contactStatus: "In Discussion",
      category: "Regular",
      status: "Scouted",
      techPower: 100,
      heroPower: 999,
      troopPower: 200,
      modVehiclePower: 300,
      structurePower: 400,
      march1Power: 10,
      march2Power: 20,
      march3Power: 30,
      march4Power: 40,
      combatPower: 0,
      kills: 500,
      notes: "Imported notes",
    }
  );

  assert.equal(merged.originalServer, "123");
  assert.equal(merged.originalAlliance, "NDr");
  assert.equal(merged.reasonForLeaving, "Cannot go with team");
  assert.equal(merged.contactStatus, "In Discussion");
  assert.equal(merged.category, "Elite");
  assert.equal(merged.status, "Ready");
  assert.equal(merged.techPower, 100);
  assert.equal(merged.heroPower, 20);
  assert.equal(merged.notes, "Imported notes");
});

runTest("createCsvTemplate exposes the expected tab-specific columns", () => {
  const applicantTemplate = createCsvTemplate("applicants");
  const migrationTemplate = createCsvTemplate("migrations");

  assert.match(applicantTemplate, /player_name,timezone,status,tech_power/i);
  assert.doesNotMatch(applicantTemplate, /original_server/i);
  assert.match(migrationTemplate, /player_name,original_server,original_alliance/i);
});

console.log("Recruitment import smoke tests passed.");
