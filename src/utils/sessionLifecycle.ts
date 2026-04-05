export const SESSION_TTL_DAYS = 7;
export const SESSION_ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;
export const SESSION_EXPIRY_REFRESH_WINDOW_MS = 48 * 60 * 60 * 1000;

export function shouldRotateSession(nowMs: number, createdAt: Date, expiresAt: Date) {
  const ageMs = nowMs - createdAt.getTime();
  const msUntilExpiry = expiresAt.getTime() - nowMs;
  return ageMs >= SESSION_ROTATE_AFTER_MS || msUntilExpiry <= SESSION_EXPIRY_REFRESH_WINDOW_MS;
}

export function getNextSessionExpiry(nowMs: number) {
  return new Date(nowMs + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
