export type ManagedUserState = {
  isActive: boolean;
  disabledByUser: boolean;
  hasAccount: boolean;
};

export function getManagedUserStatus(state: ManagedUserState) {
  if (!state.hasAccount) {
    return "No account";
  }

  if (!state.isActive) {
    return "Disabled by admin";
  }

  if (state.disabledByUser) {
    return "Disabled by user";
  }

  return "Active";
}

export function getDeleteUserSuccessState() {
  return {
    hasAccount: false,
    userId: null,
    isActive: false,
    disabledByUser: false,
    isOnline: false,
    lastLoginAt: null,
  };
}
