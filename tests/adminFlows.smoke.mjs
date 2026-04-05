import assert from "node:assert/strict";

import {
  getDeleteUserSuccessState,
  getManagedUserStatus,
} from "../src/utils/accountLifecycle.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("getManagedUserStatus distinguishes account lifecycle states", () => {
  assert.equal(
    getManagedUserStatus({ hasAccount: false, isActive: false, disabledByUser: false }),
    "No account"
  );
  assert.equal(
    getManagedUserStatus({ hasAccount: true, isActive: false, disabledByUser: false }),
    "Disabled by admin"
  );
  assert.equal(
    getManagedUserStatus({ hasAccount: true, isActive: true, disabledByUser: true }),
    "Disabled by user"
  );
  assert.equal(
    getManagedUserStatus({ hasAccount: true, isActive: true, disabledByUser: false }),
    "Active"
  );
});

runTest("getDeleteUserSuccessState clears account-bearing fields", () => {
  assert.deepEqual(getDeleteUserSuccessState(), {
    hasAccount: false,
    userId: null,
    isActive: false,
    disabledByUser: false,
    isOnline: false,
    lastLoginAt: null,
  });
});

console.log("Admin flow smoke tests passed.");
