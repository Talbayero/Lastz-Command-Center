import type { PermissionKey, RolePermissions } from "@/utils/permissions";

export type PermissionCheckUser = {
  isActive: boolean;
  disabledByUser: boolean;
  mustChangePassword: boolean;
  permissions: RolePermissions;
} | null;

export function getPermissionBlockReason(
  user: PermissionCheckUser,
  permission: PermissionKey
) {
  if (!user || !user.isActive || user.disabledByUser) {
    return "You must be signed in to continue.";
  }

  if (user.mustChangePassword) {
    return "Change your temporary password before using the command center.";
  }

  if (!user.permissions[permission]) {
    return "You do not have permission to do that.";
  }

  return null;
}

export function getAdminSelfManagementBlockReason(
  actingUserId: string,
  targetUserId: string,
  actionLabel: "edit" | "reset-password" | "delete"
) {
  if (actingUserId !== targetUserId) {
    return null;
  }

  if (actionLabel === "edit") {
    return "Use the account panel to manage your own account. Admin self-edits are protected.";
  }

  if (actionLabel === "reset-password") {
    return "Use the account panel to manage your own password. Admin self-resets are protected.";
  }

  return "Use the account panel to manage your own account. Admin self-deletes are protected.";
}
