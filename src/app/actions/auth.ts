"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/db";
import {
  clearSession,
  createSession,
  getRoleByName,
  hashPassword,
  requireCurrentUser,
  requirePermission,
  TEMP_PASSWORD,
  validatePassword,
  verifyPassword,
} from "@/utils/auth";
import { emptyPermissions, type PermissionKey } from "@/utils/permissions";

type CredentialsInput = {
  playerName: string;
  password: string;
  confirmPassword?: string;
};

function normalizePlayerName(name: string) {
  return name.trim();
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
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("SIGNUP ERROR:", error);
    return { success: false, error: error.message || "Failed to create account." };
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
    revalidatePath("/");
    return { success: true, mustChangePassword: user.mustChangePassword };
  } catch (error: any) {
    console.error("LOGIN ERROR:", error);
    return { success: false, error: error.message || "Failed to sign in." };
  }
}

export async function logoutUser() {
  await clearSession();
  revalidatePath("/");
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

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("CHANGE PASSWORD ERROR:", error);
    return { success: false, error: error.message || "Failed to change password." };
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
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("DISABLE ACCOUNT ERROR:", error);
    return { success: false, error: error.message || "Failed to disable account." };
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

    if (actingUser.id === input.userId) {
      return {
        success: false,
        error: "Use the account panel to manage your own account. Admin self-edits are protected.",
      };
    }

    await prisma.user.update({
      where: { id: input.userId },
      data: {
        roleId: input.roleId,
        isActive: input.isActive,
        disabledByUser: input.disabledByUser,
      },
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("ADMIN UPDATE USER ERROR:", error);
    return { success: false, error: error.message || "Failed to update user." };
  }
}

export async function adminCreateUserAccount(input: {
  playerId: string;
  roleId: string;
}) {
  try {
    await requirePermission("manageUsers");

    const existingUser = await prisma.user.findUnique({
      where: { playerId: input.playerId },
      select: { id: true },
    });

    if (existingUser) {
      return { success: false, error: "That player already has an account." };
    }

    await prisma.user.create({
      data: {
        playerId: input.playerId,
        roleId: input.roleId,
        passwordHash: hashPassword(TEMP_PASSWORD),
        mustChangePassword: true,
      },
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("ADMIN CREATE USER ERROR:", error);
    return { success: false, error: error.message || "Failed to create account." };
  }
}

export async function createRole(input: { name: string; permissions: Partial<Record<PermissionKey, boolean>> }) {
  try {
    await requirePermission("manageRoles");

    const name = input.name.trim();
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

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("CREATE ROLE ERROR:", error);
    return { success: false, error: error.message || "Failed to create role." };
  }
}

export async function updateRole(input: {
  roleId: string;
  name: string;
  permissions: Partial<Record<PermissionKey, boolean>>;
}) {
  try {
    await requirePermission("manageRoles");

    const name = input.name.trim();
    if (!name) {
      return { success: false, error: "Role name is required." };
    }

    const role = await prisma.role.findUnique({
      where: { id: input.roleId },
      select: { permissions: true },
    });

    if (!role) {
      return { success: false, error: "Role not found." };
    }

    const permissions = { ...emptyPermissions(), ...(role.permissions as object), ...input.permissions };

    await prisma.role.update({
      where: { id: input.roleId },
      data: {
        name,
        permissions,
      },
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE ROLE ERROR:", error);
    return { success: false, error: error.message || "Failed to update role." };
  }
}
