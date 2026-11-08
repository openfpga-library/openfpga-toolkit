export enum ActionName {
  DownloadFile = "download-file",
  ParseIssue = "parse-issue",
  ValidateCore = "validate-core",
}

/** A partial mapping from `ActionName` to names for actions whose display name is not the `ActionName` value. */
export const ACTION_DISPLAY_NAMES: Partial<Record<ActionName, string>> = {};

/**
 * Maps an {@link ActionName} to its display name. Usually that is the same, except
 * for actions which have a different display name in {@link ACTION_DISPLAY_NAMES}.
 */
export function getDisplayActionName(actionName: ActionName): string {
  const displayName = ACTION_DISPLAY_NAMES[actionName];

  if (displayName !== undefined) {
    return displayName;
  }
  return actionName;
}
