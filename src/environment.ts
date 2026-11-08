import * as core from "@actions/core";

/**
 * This constant is set in `ava.setup.mjs` for tests.
 */
declare const __OPENFPGA_TOOLKIT_ACTION_TEST_ENV__: string | undefined;

/**
 * Environment variables used by Default Setup to communicate the private registry proxy configuration.
 */
export enum RegistryProxyVars {
  PROXY_HOST = "OPENFPGA_TOOLKIT_PROXY_HOST",
  PROXY_PORT = "OPENFPGA_TOOLKIT_PROXY_PORT",
  PROXY_CA_CERTIFICATE = "OPENFPGA_TOOLKIT_PROXY_CA_CERTIFICATE",
  PROXY_URLS = "OPENFPGA_TOOLKIT_PROXY_URLS",
}

/**
 * Environment variables used by the openFPGA Action.
 *
 * We recommend prefixing environment variables with `OPENFPGA_TOOLKIT_ACTION_`
 * to reduce the risk that they are overwritten by other steps.
 */
export enum EnvVar {
  /** Whether to enable test mode for the openFPGA Toolkit Action */
  TEST_MODE = "OPENFPGA_TOOLKIT_ACTION_TEST_MODE",

  /** Semver of the CodeQL Action as specified in `package.json`. */
  VERSION = "OPENFPGA_TOOLKIT_ACTION_VERSION",
}

/**
 * Enumerates known GitHub Actions environment variables that we expect
 * to be set in a GitHub Actions environment.
 */
export enum ActionsEnvVars {
  GITHUB_ACTION_REPOSITORY = "GITHUB_ACTION_REPOSITORY",
  GITHUB_API_URL = "GITHUB_API_URL",
  GITHUB_EVENT_NAME = "GITHUB_EVENT_NAME",
  GITHUB_EVENT_PATH = "GITHUB_EVENT_PATH",
  GITHUB_JOB = "GITHUB_JOB",
  GITHUB_REF = "GITHUB_REF",
  GITHUB_REPOSITORY = "GITHUB_REPOSITORY",
  GITHUB_RUN_ATTEMPT = "GITHUB_RUN_ATTEMPT",
  GITHUB_RUN_ID = "GITHUB_RUN_ID",
  GITHUB_SERVER_URL = "GITHUB_SERVER_URL",
  GITHUB_SHA = "GITHUB_SHA",
  GITHUB_WORKFLOW = "GITHUB_WORKFLOW",
  GITHUB_WORKSPACE = "GITHUB_WORKSPACE",
  RUNNER_ENVIRONMENT = "RUNNER_ENVIRONMENT",
  RUNNER_NAME = "RUNNER_NAME",
  RUNNER_OS = "RUNNER_OS",
  RUNNER_TEMP = "RUNNER_TEMP",
  RUNNER_TOOL_CACHE = "RUNNER_TOOL_CACHE",
}

/** Environment variables which are not specific to openFPGA Toolkit. */
export enum SystemEnvVar {
  /**
   * Used by Node and related tools to indicate what kind of environment we are running in.
   */
  NODE_ENV = "NODE_ENV",
}

/** A type representing all known environment variables. */
export type KnownEnvVar =
  EnvVar | ActionsEnvVars | RegistryProxyVars | SystemEnvVar;

/**
 * Gets an environment variable, but throws an error if it is not set.
 */
function getRequiredEnvVar(env: NodeJS.ProcessEnv, paramName: string): string {
  const value = env[paramName];
  if (value === undefined || value.length === 0) {
    throw new Error(`${paramName} environment variable must be set`);
  }
  return value;
}

/**
 * Get an environment parameter, but throw an error if it is not set.
 *
 * @deprecated Use `getRequired` of a `ReadOnlyEnv` or `Env` instance instead.
 */
export function getRequiredEnvParam(paramName: string): string {
  return getRequiredEnvVar(process.env, paramName);
}

/**
 * Gets an environment variable, but returns `undefined` if it is not set or empty.
 */
function getOptionalEnvVarFrom(
  env: NodeJS.ProcessEnv,
  paramName: string,
): string | undefined {
  const value = env[paramName];
  if (value?.trim().length === 0) {
    return undefined;
  }
  return value;
}

/**
 * Get an environment variable, but return `undefined` if it is not set or empty.
 *
 * @deprecated Use `getOptional` of a `ReadOnlyEnv` or `Env` instance instead.
 */
export function getOptionalEnvVar(paramName: string): string | undefined {
  return getOptionalEnvVarFrom(process.env, paramName);
}

/**
 * An abstraction around read-only environment variables, to allow abstracting away from `process.env`
 * in tests, while clearly signalling in regular code that the consumer of the `ReadOnlyEnv` instance
 * will only read from it.
 */
export class ReadOnlyEnv {
  constructor(protected readonly vars: Record<string, string | undefined>) { }

  /** Clones the object while detaching the underlying environment from the original. */
  public clone(): this {
    return Object.create(this, { vars: { value: { ...this.vars } } }) as this;
  }

  /** Gets a copy of the underlying environment. */
  public get(): Record<string, string | undefined> {
    return { ...this.vars };
  }

  /** Tries to get the value for `name` and throws if there isn't one. */
  public getRequired(name: string): string {
    return getRequiredEnvVar(this.vars, name);
  }

  /** Gets the value for `name`, or `undefined` if it isn't set or empty. */
  public getOptional(name: string): string | undefined {
    return getOptionalEnvVarFrom(this.vars, name);
  }

  /** Gets the entries of the underlying `ProcessEnv`. */
  public entries(): Array<[string, string | undefined]> {
    return Object.entries(this.vars);
  }

  /**
   * Gets a value indicative of whether we are in a testing environment
   * by testing whether the value of the `NODE_ENV` variable is "test".
   * This is expected to be the case if e.g. `ava` is running the tests
   * or if this instance was constructed by `getTestEnv`.
   */
  public isTestingEnv(): boolean {
    return __OPENFPGA_TOOLKIT_ACTION_TEST_ENV__ === "unit-test";
  }
}

/**
 * A wrapper around an environment, to allow abstracting away from `process.env` in tests.
 * Use `ReadOnlyEnv` instead if you only plan to read from the environment.
 * This type allows writing to the environment.
 */
export class Env extends ReadOnlyEnv {
  private changed: boolean = false;

  /** Sets an environment variable. */
  public set(name: string, value: string | undefined): void {
    this.vars[name] = value;
    this.changed = true;
  }

  /** Sets all environment variables given by `vars`. */
  public setAll(vars: Record<string, string | undefined>): void {
    for (const [key, val] of Object.entries(vars)) {
      this.set(key, val);
    }
  }

  /**
   * Wrapper around `core.exportVariable` which does not call `core.exportVariable`
   * when running unit tests. This is important, because otherwise `core.exportVariable`
   * sets environment variables for other steps in a workflow when we run unit tests in CI.
   *
   * @param name The name of the environment variable to set and export.
   * @param val The value to set and export for the environment variable.
   */
  public export(name: string, val: string): void {
    // Setting the environment variable for this instance is always OK, including
    // in tests, since we use fresh `Env` instances whenever needed. This allows
    // tests to pass that rely on that part of the `core.exportVariable` behaviour.
    this.set(name, val);

    // Call `core.exportVariable` whenever we are not in a test environment.
    if (!this.isTestingEnv()) {
      core.exportVariable(name, val);
    }
  }

  /**
   * Set some initial environment variables that we can set even without
   * knowing what version of openFPGA Toolkit we're running.
   */
  public initialise(version: string) {
    this.export(EnvVar.VERSION, version);
  }

  /** Gets a value indicating whether `set` was called at least once. */
  public hasChanged(): boolean {
    return this.changed;
  }
}

/** Gets an `Env` instance for `env`, which is `process.env` by default. */
export function getEnv(env: NodeJS.ProcessEnv = process.env): Env {
  return new Env(env);
}

/**
 * Returns whether we are in test mode. This is used by openFPGA Toolkit Action PR checks.
 *
 * In test mode, we skip several uploads (SARIF results, status reports, DBs, ...).
 *
 * @deprecated
 *  The purpose of this function is ambiguous. Use `isSkippingUploadsInTests` on
 *  a `ReadOnlyEnv` instance instead for equivalent behaviour. Use `isTestingEnv`
 *  to determine if we are running in a unit test.
 */
export function isInTestMode(): boolean {
  return getEnv().getOptional(EnvVar.TEST_MODE) === "true";
}

/**
 * Wrapper around `core.exportVariable` which does not call `core.exportVariable`
 * when running unit tests. This is important, because otherwise `core.exportVariable`
 * sets environment variables for other steps in a workflow when we run unit tests in CI.
 *
 * @deprecated Use `export` on an `Env` instance instead.
 */
export function exportEnvVar(name: string, val: any): void {
  const env = getEnv();

  if (typeof val === "string") {
    env.export(name, val);
  } else {
    env.export(name, JSON.stringify(val));
  }
}
