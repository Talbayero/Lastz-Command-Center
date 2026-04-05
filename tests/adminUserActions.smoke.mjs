import assert from "node:assert/strict";

import {
  getCreateAccountActionError,
  getDeleteUserActionError,
  getResetPasswordActionError,
} from "../src/utils/adminUserActions.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("getCreateAccountActionError blocks duplicate accounts and missing role", () => {
  assert.equal(
    getCreateAccountActionError({
      hasAccount: true,
      isCurrentUser: false,
      roleId: "role-1",
    }),
    "That player already has an account."
  );

  assert.equal(
    getCreateAccountActionError({
      hasAccount: false,
      isCurrentUser: false,
      roleId: "   ",
    }),
    "No role is available for this account yet."
  );

  assert.equal(
    getCreateAccountActionError({
      hasAccount: false,
      isCurrentUser: false,
      roleId: "role-1",
    }),
    null
  );
});

runTest("getResetPasswordActionError blocks invalid reset attempts before server action", () => {
  assert.equal(
    getResetPasswordActionError({
      hasAccount: false,
      isCurrentUser: false,
      tempPassword: "Temp1234",
    }),
    "This player does not have an account yet."
  );

  assert.equal(
    getResetPasswordActionError({
      hasAccount: true,
      isCurrentUser: true,
      tempPassword: "Temp1234",
    }),
    "Use the account panel to manage your own password."
  );

  assert.equal(
    getResetPasswordActionError({
      hasAccount: true,
      isCurrentUser: false,
      tempPassword: "123",
    }),
    "Temporary password must be at least 8 characters long."
  );

  assert.equal(
    getResetPasswordActionError({
      hasAccount: true,
      isCurrentUser: false,
      tempPassword: "Temp1234",
    }),
    null
  );
});

runTest("getDeleteUserActionError blocks invalid delete attempts before confirmation", () => {
  assert.equal(
    getDeleteUserActionError({
      hasAccount: false,
      isCurrentUser: false,
    }),
    "This player does not have an account yet."
  );

  assert.equal(
    getDeleteUserActionError({
      hasAccount: true,
      isCurrentUser: true,
    }),
    "Use the account panel to manage your own account."
  );

  assert.equal(
    getDeleteUserActionError({
      hasAccount: true,
      isCurrentUser: false,
    }),
    null
  );
});

console.log("Admin user action smoke tests passed.");
