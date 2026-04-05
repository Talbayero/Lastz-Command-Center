type AdminRowActionInput = {
  hasAccount: boolean;
  isCurrentUser: boolean;
};

function validateTemporaryPassword(password: string) {
  const normalizedPassword = String(password ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 256);

  if (normalizedPassword.length < 8) {
    return "Temporary password must be at least 8 characters long.";
  }

  return null;
}

export function getCreateAccountActionError(input: AdminRowActionInput & { roleId: string }) {
  if (input.hasAccount) {
    return "That player already has an account.";
  }

  if (!input.roleId.trim()) {
    return "No role is available for this account yet.";
  }

  return null;
}

export function getResetPasswordActionError(
  input: AdminRowActionInput & { tempPassword: string }
) {
  if (!input.hasAccount) {
    return "This player does not have an account yet.";
  }

  if (input.isCurrentUser) {
    return "Use the account panel to manage your own password.";
  }

  return validateTemporaryPassword(input.tempPassword.trim());
}

export function getDeleteUserActionError(input: AdminRowActionInput) {
  if (!input.hasAccount) {
    return "This player does not have an account yet.";
  }

  if (input.isCurrentUser) {
    return "Use the account panel to manage your own account.";
  }

  return null;
}
