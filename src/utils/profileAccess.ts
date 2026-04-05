type ProfileSaveOwnershipInput = {
  canEditOthers: boolean;
  actingPlayerId: string;
  actingPlayerName: string;
  submittedName: string;
  existingPlayerId: string | null;
};

export function getProfileSaveOwnershipError(input: ProfileSaveOwnershipInput) {
  if (input.canEditOthers) {
    return null;
  }

  const submittedName = input.submittedName.trim().toLowerCase();
  const actingPlayerName = input.actingPlayerName.trim().toLowerCase();

  if (input.existingPlayerId && input.existingPlayerId !== input.actingPlayerId) {
    return "You can only update your own player profile.";
  }

  if (submittedName && submittedName !== actingPlayerName) {
    return "You can only save data to your own player profile.";
  }

  return null;
}
