export function wrapError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * An Error class that indicates an error that occurred due to
 * a misconfiguration of the action.
 */
export class ConfigurationError extends Error { }
