import * as core from "@actions/core";

import { wrapError } from "./errors";

// Re-export for backwards compatibility to avoid updating a lot of imports elsewhere.
export * from "./errors";
export { getEnv, getRequiredEnvParam } from "./environment";

/**
 * Returns an appropriate message for the error.
 *
 * If the error is an `Error` instance, this returns the error message without
 * an `Error: ` prefix.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param milliseconds time to delay
 * @param opts options
 * @param opts.allowProcessExit if true, the timer will not prevent the process from exiting
 */
export async function delay(
  milliseconds: number,
  opts?: { allowProcessExit: boolean },
) {
  const { allowProcessExit } = opts || {};
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    if (allowProcessExit) {
      // Immediately `unref` the timer such that it only prevents the process from exiting if the
      // surrounding promise is being awaited.
      timer.unref();
    }
  });
}

let hadTimeout = false;

/**
 * Run a promise for a given amount of time, and if it doesn't resolve within
 * that time, call the provided callback and then return undefined. Due to the
 * limitation outlined below, using this helper function is not recommended
 * unless there is no other option for adding a timeout (e.g. the code that
 * would need the timeout added is an external library).
 *
 * Important: This does NOT cancel the original promise, so that promise will
 * continue in the background even after the timeout has expired. If the
 * original promise hangs, then this will prevent the process terminating.
 * If a timeout has occurred then the global hadTimeout variable will get set
 * to true, and the caller is responsible for forcing the process to exit
 * if this is the case by calling the `checkForTimeout` function at the end
 * of execution.
 *
 * @param timeoutMs The timeout in milliseconds.
 * @param promise The promise to run.
 * @param onTimeout A callback to call if the promise times out.
 * @returns The result of the promise, or undefined if the promise times out.
 */
export async function waitForResultWithTimeLimit<T>(
  timeoutMs: number,
  promise: Promise<T>,
  onTimeout: () => void,
): Promise<T | undefined> {
  let finished = false;
  const mainTask = async () => {
    const result = await promise;
    finished = true;
    return result;
  };
  const timeoutTask = async () => {
    await delay(timeoutMs, { allowProcessExit: true });
    if (!finished) {
      // Workaround: While the promise racing below will allow the main code
      // to continue, the process won't normally exit until the asynchronous
      // task in the background has finished. We set this variable to force
      // an exit at the end of our code when `checkForTimeout` is called.
      hadTimeout = true;
      onTimeout();
    }
    return undefined;
  };
  return await Promise.race([mainTask(), timeoutTask()]);
}

/**
 * Check if the global hadTimeout variable has been set, and if so then
 * exit the process to ensure any background tasks that are still running
 * are killed. This should be called at the end of execution if the
 * `waitForResultWithTimeLimit` function has been used.
 */
export async function checkForTimeout() {
  if (hadTimeout === true) {
    core.info(
      "A timeout occurred, force exiting the process after 30 seconds to prevent hanging.",
    );
    await delay(30_000, { allowProcessExit: true });
    process.exit();
  }
}
