import "server-only";

import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import prisma from "@/utils/db";
import {
  emptyPermissions,
  normalizePermissions,
  permissionKeys,
  type PermissionKey,
  type RolePermissions,
} from "@/utils/permissions";

export const SESSION_COOKIE = "bom_session";
const SESSION_TTL_DAYS = 30;
export const TEMP_PASSWORD = "123456789";

const defaultRoleDefinitions: Array<{ name: string; permissions: RolePermissions; isSystem: boolean }> = [
  {
    name: "Admin",
    isSystem: true,
    permissions: {
      viewDashboard: true,
      viewRecruitment: true,
      viewAllianceDuel: true,
      uploadProfile: true,
      editRoster: true,
      exportRoster: true,
      manageRecruitment: true,
      manageAllianceDuel: true,
      deleteRosterMembers: true,
      editPlayerNames: true,
      manageBugs: true,
      viewAllianceOverview: true,
      manageUsers: true,
      manageRoles: true,
    },
  },
  {
    name: "Alliance Member",
    isSystem: true,
    permissions: {
      viewDashboard: true,
      viewRecruitment: false,
      viewAllianceDuel: true,
      uploadProfile: true,
      editRoster: false,
      exportRoster: false,
      manageRecruitment: false,
      manageAllianceDuel: false,
      deleteRosterMembers: false,
      editPlayerNames: false,
      manageBugs: false,
      viewAllianceOverview: true,
      manageUsers: false,
      manageRoles: false,
    },
  },
  {
    name: "Alliance Leader",
    isSystem: true,
    permissions: {
      viewDashboard: true,
      viewRecruitment: true,
      viewAllianceDuel: true,
      uploadProfile: true,
      editRoster: true,
      exportRoster: true,
      manageRecruitment: true,
      manageAllianceDuel: true,
      deleteRosterMembers: true,
      editPlayerNames: true,
      manageBugs: false,
      viewAllianceOverview: true,
      manageUsers: false,
      manageRoles: false,
    },
  },
];

export async function ensureSystemRoles() {
  const existingRoles = await prisma.role.findMany({
    where: { name: { in: defaultRoleDefinitions.map((role) => role.name) } },
    select: { id: true, name: true, permissions: true },
  });

  const existingNames = new Set(existingRoles.map((role) => role.name));
  const missingRoles = defaultRoleDefinitions.filter((role) => !existingNames.has(role.name));

  if (missingRoles.length > 0) {
    await prisma.role.createMany({
      data: missingRoles.map((role) => ({
        name: role.name,
        permissions: role.permissions,
        isSystem: role.isSystem,
      })),
    });
  }

  for (const role of existingRoles) {
    const definition = defaultRoleDefinitions.find((entry) => entry.name === role.name);
    if (!definition) continue;

    const rawPermissions =
      role.permissions && typeof role.permissions === "object"
        ? (role.permissions as Record<string, unknown>)
        : {};

    const mergedPermissions = { ...definition.permissions };
    for (const key of permissionKeys) {
      if (typeof rawPermissions[key] === "boolean") {
        mergedPermissions[key] = rawPermissions[key] as boolean;
      }
    }

    const normalized = normalizePermissions(role.permissions);
    const needsUpdate = permissionKeys.some((key) => normalized[key] !== mergedPermissions[key]);
    if (!needsUpdate) continue;

    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: mergedPermissions },
    });
  }
}

export async function getRoleByName(name: string) {
  await ensureSystemRoles();
  return prisma.role.findUnique({
    where: { name },
  });
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const original = Buffer.from(key, "hex");

  return derived.length === original.length && timingSafeEqual(derived, original);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.userSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  await ensureSystemRoles();

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          player: true,
          role: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    return null;
  }

  if (!session.user.isActive || session.user.disabledByUser) {
    return null;
  }

  return {
    id: session.user.id,
    playerId: session.user.playerId,
    playerName: session.user.player.name,
    alliance: session.user.player.alliance ?? "BOM",
    roleId: session.user.roleId,
    roleName: session.user.role.name,
    permissions: normalizePermissions(session.user.role.permissions),
    isActive: session.user.isActive,
    disabledByUser: session.user.disabledByUser,
    mustChangePassword: session.user.mustChangePassword,
    lastLoginAt: session.user.lastLoginAt,
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user || !user.isActive || user.disabledByUser) {
    throw new Error("You must be signed in to continue.");
  }
  return user;
}

export function hasPermission(
  user: { permissions: RolePermissions } | null | undefined,
  permission: PermissionKey
) {
  return Boolean(user?.permissions?.[permission]);
}

export async function requirePermission(permission: PermissionKey) {
  const user = await requireCurrentUser();
  if (user.mustChangePassword) {
    throw new Error("Change your temporary password before using the command center.");
  }
  if (!hasPermission(user, permission)) {
    throw new Error("You do not have permission to do that.");
  }
  return user;
}

export function validatePassword(password: string) {
  if (password.length < 8) {
    return "Password must be at least 8 characters long.";
  }

  return null;
}
