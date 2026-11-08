import * as core from "@actions/core";

import { ConfigurationError } from "./util";

/**
 * This constant is set to the value of the `"version"` property in `package.json` by `esbuild`.
 * It is also set in `ava.setup.mjs` for tests.
 */
declare const __OPENFPGA_TOOLKIT_ACTION_VERSION__: string;

/**
 * Abstracts over GitHub Actions functions so that we do not have to stub
 * global functions in tests.
 */
export interface ActionsEnv {
  getRequiredInput: (name: string) => string;
  getOptionalInput: (name: string) => string | undefined;
}

/**
 * Gets the real `ActionsEnv` used by production code.
 */
export function getActionsEnv(): ActionsEnv {
  return {
    getRequiredInput,
    getOptionalInput,
  };
}

/**
 * Wrapper around core.getInput for inputs that always have a value.
 * Also see getOptionalInput.
 *
 * This allows us to get stronger type checking of required/optional inputs.
 */
export const getRequiredInput = function (name: string): string {
  const value = core.getInput(name);
  if (!value) {
    throw new ConfigurationError(`Input required and not supplied: ${name}`);
  }
  return value;
};

/**
 * Wrapper around core.getInput that converts empty inputs to undefined.
 * Also see getRequiredInput.
 *
 * This allows us to get stronger type checking of required/optional inputs.
 */
export const getOptionalInput = function (name: string): string | undefined {
  const value = core.getInput(name);
  return value.length > 0 ? value : undefined;
};

export function getActionVersion(): string {
  return __OPENFPGA_TOOLKIT_ACTION_VERSION__;
}
