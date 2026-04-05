function stripControlCharacters(value: string) {
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

function sanitizeSingleLineText(value: unknown, maxLength: number) {
  const normalized = stripControlCharacters(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, maxLength);
}

export function validatePassword(password: string) {
  const normalizedPassword = sanitizeSingleLineText(password, 256);

  if (normalizedPassword.length < 10) {
    return "Password must be at least 10 characters long.";
  }

  if (!/[A-Z]/.test(normalizedPassword) || !/[a-z]/.test(normalizedPassword) || !/\d/.test(normalizedPassword)) {
    return "Password must include uppercase, lowercase, and a number.";
  }

  return null;
}

export function validateTemporaryPassword(password: string) {
  const normalizedPassword = sanitizeSingleLineText(password, 256);

  if (normalizedPassword.length < 8) {
    return "Temporary password must be at least 8 characters long.";
  }

  return null;
}
