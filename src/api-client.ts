import * as fs from "fs";
import { pipeline } from "node:stream/promises";

import * as core from "@actions/core";
import * as githubUtils from "@actions/github/lib/utils";
import type { OctokitOptions } from "@octokit/core";
import * as retry from "@octokit/plugin-retry";
import { RequestRequestOptions } from "@octokit/types";
import {
  ProxyAgent,
  RequestInfo,
  RequestInit,
  fetch as undiciFetch,
} from "undici";

import { getActionVersion, getRequiredInput } from "./actions-util";
import { ReadOnlyEnv, getEnv } from "./environment";
import {
  getCurrentInstance,
  type GitHubApiCombinedDetails,
  type GitHubApiDetails,
} from "./github";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";

export type { GitHubApiDetails, GitHubApiCombinedDetails } from "./github";

/**
 * HTTP status codes that should not be retried.
 *
 * The default Octokit list is 400, 401, 403, 404, 410, 422, and 451. We have
 * observed transient errors with authentication, so we remove 401, 403, and 404
 * from the default list to ensure that these errors are retried.
 */
export const DO_NOT_RETRY_STATUSES = [400, 410, 422, 451];

/** The type of GitHub API client we use. */
export type ApiClient = InstanceType<typeof githubUtils.GitHub>;

/**
 * Constructs a `RequestRequestOptions` with a custom `fetch` implementation
 * that uses `dispatcher` as a proxy for requests.
 *
 * @param dispatcher The proxy to use, if any.
 */
export function makeProxyRequestOptions(
  dispatcher: ProxyAgent | undefined,
): RequestRequestOptions | undefined {
  // If we don't have a custom `ProxyAgent`, return the defaults.
  if (dispatcher === undefined) {
    return githubUtils.defaults.request;
  }

  // Otherwise, construct the custom `fetch` and add it onto the defaults.
  return {
    ...githubUtils.defaults.request,
    fetch: (req: RequestInfo, init?: RequestInit) => {
      return undiciFetch(req, { ...init, dispatcher });
    },
  };
}

/** Options for `createApiClientWithDetails`. */
interface CreateApiClientOptions {
  allowExternal?: boolean;
  proxy?: ProxyAgent;
}

function createApiClientWithDetails(
  apiDetails: GitHubApiCombinedDetails,
  { allowExternal = false, proxy = undefined }: CreateApiClientOptions = {},
): ApiClient {
  const auth =
    allowExternal && apiDetails.externalRepoAuth !== undefined
      ? apiDetails.externalRepoAuth
      : apiDetails.auth;
  const retryingOctokit = githubUtils.GitHub.plugin(retry.retry);
  const requestOptions = makeProxyRequestOptions(proxy);

  const opts: OctokitOptions = {
    auth:
      auth !== undefined && auth.trim() !== "" ? `token ${auth}` : undefined,
    baseUrl: apiDetails.apiURL,
    userAgent: `openFPGA-Toolkit-Action/${getActionVersion()}`,
    log: {
      debug: core.debug,
      info: core.info,
      warn: core.warning,
      error: core.error,
    },
    request: requestOptions,
    retry: {
      doNotRetry: DO_NOT_RETRY_STATUSES,
    },
  };

  return new retryingOctokit(opts);
}

/**
 * Gets a `GitHubApiDetails` object describing the GitHub instance we are currently running on.
 *
 * @param env The environment variables to read.
 */
export function getApiDetails(env: ReadOnlyEnv = getEnv()): GitHubApiDetails {
  return {
    auth: getRequiredInput("token"),
    ...getCurrentInstance(env),
  };
}

/**
 * Constructs an {@link ApiClient} using {@link apiDetails}.
 *
 * If {@link apiDetails} is not specified, then the GitHub instance URLs and auth token
 * are taken from {@link env}.
 *
 * If {@link env} is not specified, then the process environment is used.
 *
 * @param env The environment to obtain the GitHub instance URLs from.
 * @param apiDetails The {@link GitHubApiDetails} to construct the {@link ApiClient} for.
 */
export function getApiClient(
  env: ReadOnlyEnv = getEnv(),
  apiDetails?: GitHubApiDetails,
) {
  return createApiClientWithDetails(apiDetails ?? getApiDetails(env));
}

export function getApiClientWithExternalAuth(
  apiDetails: GitHubApiCombinedDetails,
  proxy?: ProxyAgent,
) {
  return createApiClientWithDetails(apiDetails, { allowExternal: true, proxy });
}

/**
 * Gets a value for the `Authorization` header for a request to `url`; or `undefined` if the
 * `Authorization` header should not be set for `url`.
 *
 * @param logger The logger to use for debugging messages.
 * @param apiDetails Details of the GitHub API we are using.
 * @param url The URL for which we want to add an `Authorization` header.
 *
 * @returns The value for the `Authorization` header or `undefined` if it shouldn't be populated.
 */
export function getAuthorizationHeaderFor(
  logger: Logger,
  apiDetails: GitHubApiDetails,
  url: string,
): string | undefined {
  // We don't have to check the `url` if we don't have a token to begin with.
  const token = apiDetails.auth?.trim();
  if (token === undefined || token === "") {
    return undefined;
  }

  // We only want to provide an authorization header if we are downloading
  // from the same GitHub instance the Action is running on.
  // This avoids leaking Enterprise tokens to dotcom.
  if (
    url.startsWith(`${apiDetails.url}/`) ||
    (apiDetails.apiURL && url.startsWith(`${apiDetails.apiURL}/`))
  ) {
    logger.debug(`Providing an authorization token.`);
    return `token ${token}`;
  }

  logger.debug(`Not using an authorization token.`);
  return undefined;
}

export async function getRepositoryReleases(repositoryNwo: RepositoryNwo) {
  return await getApiClient().paginate("GET /repos/{owner}/{repo}/releases", {
    owner: repositoryNwo.owner,
    repo: repositoryNwo.repo,
    per_page: 100,
  });
}

export async function getReleaseAssets(
  repositoryNwo: RepositoryNwo,
  releaseId: number,
) {
  return await getApiClient().paginate(
    "GET /repos/{owner}/{repo}/releases/{release_id}/assets",
    {
      owner: repositoryNwo.owner,
      repo: repositoryNwo.repo,
      release_id: releaseId,
      per_page: 100,
    },
  );
}

export async function downloadReleaseAsset(
  repositoryNwo: RepositoryNwo,
  assetId: number,
  outputPath: string,
) {
  const response = await getApiClient().rest.repos.getReleaseAsset({
    owner: repositoryNwo.owner,
    repo: repositoryNwo.repo,
    asset_id: assetId,
    headers: {
      accept: "application/octet-stream",
    },
    request: {
      parseSuccessResponseBody: false,
    },
  });

  const stream = response.data as unknown as ReadableStream<Uint8Array>;
  await pipeline(stream, fs.createWriteStream(outputPath));
}

export async function downloadContent(
  repositoryNwo: RepositoryNwo,
  contentPath: string,
  outputPath: string,
) {
  const response = await getApiClient().rest.repos.getContent({
    owner: repositoryNwo.owner,
    repo: repositoryNwo.repo,
    path: contentPath,
    headers: {
      accept: "application/vnd.github.raw+json",
    },
    request: {
      parseSuccessResponseBody: false,
    },
  });

  const stream = response.data as unknown as ReadableStream<Uint8Array>;
  await pipeline(stream, fs.createWriteStream(outputPath));
}
