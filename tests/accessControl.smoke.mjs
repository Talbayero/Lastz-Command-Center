import assert from "node:assert/strict";

import {
  getAdminSelfManagementBlockReason,
  getPermissionBlockReason,
} from "../src/utils/accessControl.ts";
import { emptyPermissions } from "../src/utils/permissions.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("getPermissionBlockReason blocks inactive or missing users first", () => {
  assert.equal(getPermissionBlockReason(null, "viewDashboard"), "You must be signed in to continue.");
  assert.equal(
    getPermissionBlockReason(
      {
        isActive: false,
        disabledByUser: false,
        mustChangePassword: false,
        permissions: { ...emptyPermissions(), viewDashboard: true },
      },
      "viewDashboard"
    ),
    "You must be signed in to continue."
  );
});

runTest("getPermissionBlockReason blocks forced-password users before permission checks", () => {
  assert.equal(
    getPermissionBlockReason(
      {
        isActive: true,
        disabledByUser: false,
        mustChangePassword: true,
        permissions: { ...emptyPermissions(), manageUsers: true },
      },
      "manageUsers"
    ),
    "Change your temporary password before using the command center."
  );
});

runTest("getPermissionBlockReason denies missing permission and allows valid access", () => {
  assert.equal(
    getPermissionBlockReason(
      {
        isActive: true,
        disabledByUser: false,
        mustChangePassword: false,
        permissions: emptyPermissions(),
      },
      "manageUsers"
    ),
    "You do not have permission to do that."
  );

  assert.equal(
    getPermissionBlockReason(
      {
        isActive: true,
        disabledByUser: false,
        mustChangePassword: false,
        permissions: { ...emptyPermissions(), manageUsers: true },
      },
      "manageUsers"
    ),
    null
  );
});

runTest("getAdminSelfManagementBlockReason prevents admin self-management actions only", () => {
  assert.equal(
    getAdminSelfManagementBlockReason("u1", "u1", "edit"),
    "Use the account panel to manage your own account. Admin self-edits are protected."
  );
  assert.equal(
    getAdminSelfManagementBlockReason("u1", "u1", "reset-password"),
    "Use the account panel to manage your own password. Admin self-resets are protected."
  );
  assert.equal(
    getAdminSelfManagementBlockReason("u1", "u1", "delete"),
    "Use the account panel to manage your own account. Admin self-deletes are protected."
  );
  assert.equal(getAdminSelfManagementBlockReason("u1", "u2", "delete"), null);
});

console.log("Access control smoke tests passed.");
