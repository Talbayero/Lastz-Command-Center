import assert from "node:assert/strict";

import {
  emptyPermissions,
  normalizePermissions,
  permissionKeys,
} from "../src/utils/permissions.ts";
import {
  validatePassword,
  validateTemporaryPassword,
} from "../src/utils/authValidation.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("normalizePermissions defaults missing permissions to false", () => {
  const normalized = normalizePermissions({ viewDashboard: true, manageUsers: true });

  assert.equal(normalized.viewDashboard, true);
  assert.equal(normalized.manageUsers, true);
  assert.equal(normalized.manageRoles, false);
  assert.equal(normalized.viewRecruitment, false);
});

runTest("emptyPermissions contains every declared permission key", () => {
  const empty = emptyPermissions();

  assert.deepEqual(Object.keys(empty).sort(), [...permissionKeys].sort());
});

runTest("validatePassword enforces length and character classes", () => {
  assert.equal(validatePassword("short"), "Password must be at least 10 characters long.");
  assert.equal(
    validatePassword("alllowercase1"),
    "Password must include uppercase, lowercase, and a number."
  );
  assert.equal(validatePassword("ValidPass1"), null);
});

runTest("validateTemporaryPassword enforces minimum length", () => {
  assert.equal(validateTemporaryPassword("1234567"), "Temporary password must be at least 8 characters long.");
  assert.equal(validateTemporaryPassword("12345678"), null);
});

console.log("Auth and permissions smoke tests passed.");
