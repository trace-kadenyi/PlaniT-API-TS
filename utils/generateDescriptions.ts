interface Change {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface UserSnapshot {
  firstName: string;
  lastName: string;
}

export function generateDescription(
  changes: Change[],
  targetUser: UserSnapshot,
  updater: UserSnapshot,
  isSelf: boolean,
): string {
  const action = isSelf
    ? "updated their profile"
    : `${updater.firstName} ${updater.lastName} updated ${targetUser.firstName}'s profile`;

  const changeStrings = changes.map((change) => {
    if (change.field === "password") {
      return `password ${isSelf ? "changed" : "reset"}`;
    } else if (change.field === "role") {
      return `role changed from ${change.oldValue} to ${change.newValue}`;
    } else {
      return `${change.field} updated`;
    }
  });

  return `${action}: ${changeStrings.join(", ")}`;
}
