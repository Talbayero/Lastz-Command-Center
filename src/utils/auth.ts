import "server-only";

import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import prisma from "@/utils/db";
import { invalidateAuthDataCache } from "@/utils/cacheTags";
import { getPermissionBlockReason } from "@/utils/accessControl";
import {
  getNextSessionExpiry,
  shouldRotateSession,
} from "@/utils/sessionLifecycle";
import {
  normalizePermissions,
  permissionKeys,
  type PermissionKey,
  type RolePermissions,
} from "@/utils/permissions";

export const SESSION_COOKIE = "bom_session";
export const TEMP_PASSWORD = "123456789";
const SYSTEM_ROLE_ENSURE_TTL_MS = 10 * 60 * 1000;
const CURRENT_USER_CACHE_TTL_MS = 15 * 1000;

let lastSystemRoleEnsureAt = 0;
let systemRoleEnsurePromise: Promise<void> | null = null;
type CurrentUser = {
  id: string;
  playerId: string;
  playerName: string;
  alliance: string;
  roleId: string;
  roleName: string;
  permissions: RolePermissions;
  isActive: boolean;
  disabledByUser: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
};
const currentUserCache = new Map<string, { expiresAt: number; value: CurrentUser | null }>();

type SessionWithUser = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  user: {
    id: string;
    playerId: string;
    isActive: boolean;
    disabledByUser: boolean;
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
    player: {
      name: string;
      alliance: string | null;
    };
    roleId: string;
    role: {
      name: string;
      permissions: unknown;
    };
  };
};

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
  const now = Date.now();
  if (lastSystemRoleEnsureAt && now - lastSystemRoleEnsureAt < SYSTEM_ROLE_ENSURE_TTL_MS) {
    return;
  }

  if (systemRoleEnsurePromise) {
    return systemRoleEnsurePromise;
  }

  systemRoleEnsurePromise = (async () => {
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
    lastSystemRoleEnsureAt = Date.now();
  })().finally(() => {
    systemRoleEnsurePromise = null;
  });

  return systemRoleEnsurePromise;
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

async function getSessionCookieStore() {
  return cookies();
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await getSessionCookieStore();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

function toCurrentUser(session: SessionWithUser): CurrentUser {
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

async function buildCurrentUser(tokenHash: string): Promise<{ currentUser: CurrentUser | null; session: SessionWithUser | null }> {
  const session = await prisma.userSession.findUnique({
    where: { tokenHash },
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
    return { currentUser: null, session: null };
  }

  if (session.expiresAt <= new Date()) {
    return { currentUser: null, session: null };
  }

  if (!session.user.isActive || session.user.disabledByUser) {
    return { currentUser: null, session: session as SessionWithUser };
  }

  return { currentUser: toCurrentUser(session as SessionWithUser), session: session as SessionWithUser };
}

async function maybeRotateSession(session: SessionWithUser) {
  const now = Date.now();
  if (!shouldRotateSession(now, session.createdAt, session.expiresAt)) {
    return false;
  }

  const nextToken = randomBytes(32).toString("hex");
  const nextTokenHash = hashSessionToken(nextToken);
  const nextExpiresAt = getNextSessionExpiry(now);

  await prisma.userSession.create({
    data: {
      userId: session.userId,
      tokenHash: nextTokenHash,
      expiresAt: nextExpiresAt,
    },
  });

  try {
    await setSessionCookie(nextToken, nextExpiresAt);
  } catch (error) {
    await prisma.userSession.deleteMany({
      where: { tokenHash: nextTokenHash },
    });
    console.warn("SESSION ROTATION SKIPPED:", error);
    return false;
  }

  await prisma.userSession.deleteMany({
    where: { id: session.id },
  });

  currentUserCache.delete(session.tokenHash);
  invalidateAuthDataCache();
  return true;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = getNextSessionExpiry(Date.now());

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  await setSessionCookie(token, expiresAt);
  clearCurrentUserCache();
  invalidateAuthDataCache();
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    currentUserCache.delete(hashSessionToken(token));
    await prisma.userSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }

  cookieStore.delete(SESSION_COOKIE);
  clearCurrentUserCache();
  invalidateAuthDataCache();
}

export async function getCurrentUser() {
  const cookieStore = await getSessionCookieStore();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const cached = currentUserCache.get(tokenHash);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const { currentUser, session } = await buildCurrentUser(tokenHash);
  if (session && currentUser) {
    await maybeRotateSession(session);
  }
  currentUserCache.set(tokenHash, {
    expiresAt: now + CURRENT_USER_CACHE_TTL_MS,
    value: currentUser,
  });

  return currentUser;
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
  const blockReason = getPermissionBlockReason(user, permission);
  if (blockReason) {
    throw new Error(blockReason);
  }
  return user;
}

export function clearCurrentUserCache() {
  currentUserCache.clear();
}
