import assert from "node:assert/strict";

import { getProfileSaveOwnershipError } from "../src/utils/profileAccess.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("getProfileSaveOwnershipError allows elevated users to target other players", () => {
  assert.equal(
    getProfileSaveOwnershipError({
      canEditOthers: true,
      actingPlayerId: "self",
      actingPlayerName: "Tedmeister",
      submittedName: "AnotherPlayer",
      existingPlayerId: "other",
    }),
    null
  );
});

runTest("getProfileSaveOwnershipError blocks normal users from targeting another existing player", () => {
  assert.equal(
    getProfileSaveOwnershipError({
      canEditOthers: false,
      actingPlayerId: "self",
      actingPlayerName: "Tedmeister",
      submittedName: "AnotherPlayer",
      existingPlayerId: "other",
    }),
    "You can only update your own player profile."
  );
});

runTest("getProfileSaveOwnershipError blocks normal users from changing the submitted player name", () => {
  assert.equal(
    getProfileSaveOwnershipError({
      canEditOthers: false,
      actingPlayerId: "self",
      actingPlayerName: "Tedmeister",
      submittedName: "AnotherPlayer",
      existingPlayerId: null,
    }),
    "You can only save data to your own player profile."
  );

  assert.equal(
    getProfileSaveOwnershipError({
      canEditOthers: false,
      actingPlayerId: "self",
      actingPlayerName: "Tedmeister",
      submittedName: "tedmeister",
      existingPlayerId: "self",
    }),
    null
  );
});

console.log("Profile access smoke tests passed.");
