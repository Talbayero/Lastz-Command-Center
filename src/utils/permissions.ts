export const permissionLabels = {
  viewDashboard: "View Alliance Dashboard",
  uploadProfile: "Upload Profile",
  editRoster: "Edit Roster",
  exportRoster: "Export Roster",
  deleteRosterMembers: "Delete Roster Members",
  editPlayerNames: "Edit Player Names",
  manageBugs: "Manage Bugs",
  viewAllianceOverview: "View Alliance Overview",
  manageUsers: "Manage Users",
  manageRoles: "Manage Roles",
} as const;

export type PermissionKey = keyof typeof permissionLabels;
export type RolePermissions = Record<PermissionKey, boolean>;

export const permissionKeys = Object.keys(permissionLabels) as PermissionKey[];

export const emptyPermissions = (): RolePermissions => ({
  viewDashboard: false,
  uploadProfile: false,
  editRoster: false,
  exportRoster: false,
  deleteRosterMembers: false,
  editPlayerNames: false,
  manageBugs: false,
  viewAllianceOverview: false,
  manageUsers: false,
  manageRoles: false,
});

export function normalizePermissions(value: unknown): RolePermissions {
  const next = emptyPermissions();
  if (!value || typeof value !== "object") {
    return next;
  }

  for (const key of permissionKeys) {
    next[key] = Boolean((value as Record<string, unknown>)[key]);
  }

  return next;
}
