export const ALLOWED_GLORY_WAR_STATUSES = ["Offline", "Attacker", "Defender"] as const;
export const APPLICANT_STATUSES = ["New", "Reviewing", "Interview", "Approved", "Rejected"] as const;
export const MIGRATION_STATUSES = ["Scouted", "Contacted", "Negotiating", "Ready", "Rejected"] as const;
export const MIGRATION_CONTACT_STATUSES = [
  "Not Contacted",
  "Contacted",
  "In Discussion",
  "Follow Up",
  "Closed",
] as const;
export const RECRUITMENT_CATEGORIES = ["Elite", "Advanced", "Medium", "Regular"] as const;
export const BUG_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export const BUG_STATUSES = ["Open", "In Review", "Resolved", "Closed"] as const;
export const TIMEZONE_OPTIONS = [
  "UTC-12",
  "UTC-11",
  "UTC-10",
  "UTC-9",
  "UTC-8",
  "UTC-7",
  "UTC-6",
  "UTC-5",
  "UTC-4",
  "UTC-3",
  "UTC-2",
  "UTC-1",
  "UTC+0",
  "UTC+1",
  "UTC+2",
  "UTC+3",
  "UTC+4",
  "UTC+5",
  "UTC+6",
  "UTC+7",
  "UTC+8",
  "UTC+9",
  "UTC+10",
  "UTC+11",
  "UTC+12",
] as const;

function stripControlCharacters(value: string, preserveNewlines: boolean) {
  return preserveNewlines
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    : value.replace(/[\u0000-\u001F\u007F]/g, "");
}

export function sanitizeSingleLineText(value: unknown, maxLength: number) {
  const normalized = stripControlCharacters(String(value ?? ""), false)
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, maxLength);
}

export function sanitizeMultiLineText(value: unknown, maxLength: number) {
  const normalized = stripControlCharacters(String(value ?? ""), true)
    .replace(/\r\n/g, "\n")
    .trim();
  return normalized.slice(0, maxLength);
}

export function sanitizePlayerName(value: unknown) {
  const normalized = sanitizeSingleLineText(value, 40);
  return normalized.replace(/[^\p{L}\p{N}_\- .'[\]°]/gu, "");
}

export function sanitizeIdentifier(value: unknown) {
  return sanitizeSingleLineText(value, 80);
}

export function sanitizeRoleName(value: unknown) {
  return sanitizeSingleLineText(value, 50);
}

export function normalizeNonNegativeInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed));
}

export function ensureAllowedValue<T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  fallback?: T[number]
) {
  const normalized = sanitizeSingleLineText(value, 80);
  if (allowedValues.includes(normalized as T[number])) {
    return normalized as T[number];
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error("Invalid selection.");
}

export function ensureRecordId(value: unknown, label: string) {
  const normalized = sanitizeSingleLineText(value, 64);
  if (!normalized || normalized.length < 10) {
    throw new Error(`${label} is invalid.`);
  }

  return normalized;
}
