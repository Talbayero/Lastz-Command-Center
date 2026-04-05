"use server";

import prisma from "@/utils/db";
import {
  clearCurrentUserCache,
  clearSession,
  createSession,
  getRoleByName,
  hashPassword,
  requireCurrentUser,
  requirePermission,
  TEMP_PASSWORD,
  validatePassword,
  validateTemporaryPassword,
  verifyPassword,
} from "@/utils/auth";
import { invalidateAdminDataCache, invalidateAuthDataCache, invalidatePlayerDataCache } from "@/utils/cacheTags";
import { emptyPermissions, type PermissionKey } from "@/utils/permissions";
import {
  ensureRecordId,
  sanitizeSingleLineText,
  sanitizeRoleName,
} from "@/utils/validation";

type CredentialsInput = {
  playerName: string;
  password: string;
  confirmPassword?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizePlayerName(name: string) {
  return sanitizeSingleLineText(name, 80);
}

export async function signUpUser(input: CredentialsInput) {
  try {
    const playerName = normalizePlayerName(input.playerName);
    const isBootstrapAdmin = playerName.toLowerCase() === "tedmeister";
    const passwordError = validatePassword(input.password);

    if (!playerName) {
      return { success: false, error: "Player name is required." };
    }

    if (passwordError) {
      return { success: false, error: passwordError };
    }

    if (input.password !== input.confirmPassword) {
      return { success: false, error: "Passwords do not match." };
    }

    let player = await prisma.player.findFirst({
      where: {
        name: { equals: playerName, mode: "insensitive" },
        alliance: "BOM",
      },
      select: { id: true, name: true },
    });

    if (!player && isBootstrapAdmin) {
      const existingTedmeister = await prisma.player.findFirst({
        where: {
          name: { equals: "Tedmeister", mode: "insensitive" },
        },
        select: { id: true, name: true, alliance: true },
      });

      player = existingTedmeister
        ? await prisma.player.update({
            where: { id: existingTedmeister.id },
            data: { alliance: "BOM" },
            select: { id: true, name: true },
          })
        : await prisma.player.create({
            data: {
              name: "Tedmeister",
              alliance: "BOM",
            },
            select: { id: true, name: true },
          });
    }

    if (!player) {
      return { success: false, error: "Player not found in BOM roster." };
    }

    const existingAccount = await prisma.user.findUnique({
      where: { playerId: player.id },
      select: { id: true },
    });

    if (existingAccount) {
      return { success: false, error: "That player already has an account." };
    }

    const adminRole = await getRoleByName("Admin");
    const memberRole = await getRoleByName("Alliance Member");

    if (!adminRole || !memberRole) {
      return { success: false, error: "Default roles are not available yet." };
    }

    const roleId = isBootstrapAdmin ? adminRole.id : memberRole.id;

    const user = await prisma.user.create({
      data: {
        playerId: player.id,
        roleId,
        passwordHash: hashPassword(input.password),
      },
      select: { id: true },
    });

    await createSession(user.id);
    clearCurrentUserCache();
    invalidateAuthDataCache();
    invalidateAdminDataCache();
    if (isBootstrapAdmin) {
      invalidatePlayerDataCache();
    }
    return { success: true };
  } catch (error: unknown) {
    console.error("SIGNUP ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to create account.") };
  }
}

export async function loginUser(input: CredentialsInput) {
  try {
    const playerName = normalizePlayerName(input.playerName);

    if (!playerName || !input.password) {
      return { success: false, error: "Player name and password are required." };
    }

    const user = await prisma.user.findFirst({
      where: {
        player: {
          name: { equals: playerName, mode: "insensitive" },
        },
      },
      include: {
        player: true,
      },
    });

    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      return { success: false, error: "Invalid player name or password." };
    }

    if (!user.isActive) {
      return { success: false, error: "This account has been disabled by an administrator." };
    }

    if (user.disabledByUser) {
      return { success: false, error: "This account is disabled. Ask an admin to re-enable it." };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await createSession(user.id);
    clearCurrentUserCache();
    invalidateAuthDataCache();
    return { success: true, mustChangePassword: user.mustChangePassword };
  } catch (error: unknown) {
    console.error("LOGIN ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to sign in.") };
  }
}

export async function logoutUser() {
  await clearSession();
  clearCurrentUserCache();
  invalidateAuthDataCache();
  return { success: true };
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  try {
    const currentUser = await requireCurrentUser();
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, passwordHash: true },
    });

    if (!user || !verifyPassword(input.currentPassword, user.passwordHash)) {
      return { success: false, error: "Current password is incorrect." };
    }

    const passwordError = validatePassword(input.newPassword);
    if (passwordError) {
      return { success: false, error: passwordError };
    }

    if (input.newPassword !== input.confirmPassword) {
      return { success: false, error: "New passwords do not match." };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(input.newPassword),
        mustChangePassword: false,
      },
    });

    clearCurrentUserCache();
    invalidateAuthDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("CHANGE PASSWORD ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to change password.") };
  }
}

export async function disableOwnAccount() {
  try {
    const currentUser = await requireCurrentUser();

    await prisma.user.update({
      where: { id: currentUser.id },
      data: { disabledByUser: true },
    });

    await clearSession();
    clearCurrentUserCache();
    invalidateAuthDataCache();
    invalidateAdminDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("DISABLE ACCOUNT ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to disable account.") };
  }
}

export async function adminUpdateUser(input: {
  userId: string;
  roleId: string;
  isActive: boolean;
  disabledByUser: boolean;
}) {
  try {
    const actingUser = await requirePermission("manageUsers");
    const userId = ensureRecordId(input.userId, "User");
    const roleId = ensureRecordId(input.roleId, "Role");

    if (actingUser.id === userId) {
      return {
        success: false,
        error: "Use the account panel to manage your own account. Admin self-edits are protected.",
      };
    }

    const targetRole = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true },
    });

    if (!targetRole) {
      return { success: false, error: "Role not found." };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        roleId,
        isActive: Boolean(input.isActive),
        disabledByUser: Boolean(input.disabledByUser),
      },
    });

    clearCurrentUserCache();
    invalidateAdminDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("ADMIN UPDATE USER ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to update user.") };
  }
}

export async function adminCreateUserAccount(input: {
  playerId: string;
  roleId: string;
}) {
  try {
    await requirePermission("manageUsers");
    const playerId = ensureRecordId(input.playerId, "Player");
    const roleId = ensureRecordId(input.roleId, "Role");

    const existingUser = await prisma.user.findUnique({
      where: { playerId },
      select: { id: true },
    });

    if (existingUser) {
      return { success: false, error: "That player already has an account." };
    }

    const [player, role] = await Promise.all([
      prisma.player.findUnique({
        where: { id: playerId },
        select: { id: true },
      }),
      prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true },
      }),
    ]);

    if (!player) {
      return { success: false, error: "Player not found." };
    }

    if (!role) {
      return { success: false, error: "Role not found." };
    }

    await prisma.user.create({
      data: {
        playerId,
        roleId,
        passwordHash: hashPassword(TEMP_PASSWORD),
        mustChangePassword: true,
      },
    });

    invalidateAdminDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("ADMIN CREATE USER ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to create account.") };
  }
}

export async function adminResetUserPassword(input: { userId: string; tempPassword: string }) {
  try {
    const actingUser = await requirePermission("manageUsers");
    const userId = ensureRecordId(input.userId, "User");
    const tempPassword = input.tempPassword;

    const temporaryPasswordError = validateTemporaryPassword(tempPassword);
    if (temporaryPasswordError) {
      return { success: false, error: temporaryPasswordError };
    }

    if (actingUser.id === userId) {
      return {
        success: false,
        error: "Use the account panel to manage your own password. Admin self-resets are protected.",
      };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: hashPassword(tempPassword),
          mustChangePassword: true,
        },
      }),
      prisma.userSession.deleteMany({
        where: { userId },
      }),
    ]);

    clearCurrentUserCache();
    invalidateAdminDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("ADMIN RESET PASSWORD ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to reset password.") };
  }
}

export async function adminDeleteUser(input: { userId: string }) {
  try {
    const actingUser = await requirePermission("manageUsers");
    const userId = ensureRecordId(input.userId, "User");

    if (actingUser.id === userId) {
      return {
        success: false,
        error: "Use the account panel to manage your own account. Admin self-deletes are protected.",
      };
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    clearCurrentUserCache();
    invalidateAdminDataCache();
    invalidateAuthDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("ADMIN DELETE USER ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to delete user.") };
  }
}

export async function createRole(input: { name: string; permissions: Partial<Record<PermissionKey, boolean>> }) {
  try {
    await requirePermission("manageRoles");

    const name = sanitizeRoleName(input.name);
    if (!name) {
      return { success: false, error: "Role name is required." };
    }

    const permissions = { ...emptyPermissions(), ...input.permissions };

    await prisma.role.create({
      data: {
        name,
        permissions,
        isSystem: false,
      },
    });

    clearCurrentUserCache();
    invalidateAdminDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("CREATE ROLE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to create role.") };
  }
}

export async function updateRole(input: {
  roleId: string;
  name: string;
  permissions: Partial<Record<PermissionKey, boolean>>;
}) {
  try {
    await requirePermission("manageRoles");

    const roleId = ensureRecordId(input.roleId, "Role");
    const name = sanitizeRoleName(input.name);
    if (!name) {
      return { success: false, error: "Role name is required." };
    }

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { permissions: true },
    });

    if (!role) {
      return { success: false, error: "Role not found." };
    }

    const permissions = { ...emptyPermissions(), ...(role.permissions as object), ...input.permissions };

    await prisma.role.update({
      where: { id: roleId },
      data: {
        name,
        permissions,
      },
    });

    clearCurrentUserCache();
    invalidateAdminDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("UPDATE ROLE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to update role.") };
  }
}
