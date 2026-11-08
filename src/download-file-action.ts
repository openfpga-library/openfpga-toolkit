import * as core from "@actions/core";

import { Action, ActionState, runInActions } from "./action-common";
import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import { parseRepositoryNwo, type RepositoryNwo } from "./repository";
import { ActionName } from "./status-report";
import { wrapError } from "./util";

async function getLatestRelease(repositoryNwo: RepositoryNwo) {
  const releases = await api.getRepositoryReleases(repositoryNwo);
  if (releases.length === 0) {
    throw new Error(
      `No releases found for repository ${repositoryNwo.owner}/${repositoryNwo.repo}`,
    );
  }
  return releases[0];
}

async function getReleaseAsset(
  repositoryNwo: RepositoryNwo,
  releaseId: number,
  filter: string | undefined,
) {
  const assets = await api.getReleaseAssets(repositoryNwo, releaseId);
  if (assets.length === 0) {
    throw new Error(
      `No assets found for release ${releaseId} in repository ${repositoryNwo.owner}/${repositoryNwo.repo}`,
    );
  }

  if (!filter) return assets[0];

  const pattern = new RegExp(filter);
  const result = assets.find((asset) => pattern.test(asset.name));
  if (!result) {
    throw new Error(
      `No assets found for release ${releaseId} in repository ${repositoryNwo.owner}/${repositoryNwo.repo} matching filter "${filter}"`,
    );
  }

  return result;
}

async function run(action: ActionState<["Base", "Logger", "Env", "Actions"]>) {
  const logger = action.logger;

  try {
    logger.info(`Running ${action.name} action...`);

    const repository = actionsUtil.getRequiredInput("repository");
    const outputPath = actionsUtil.getRequiredInput("output-path");
    const assetFilter = actionsUtil.getOptionalInput("asset-filter");
    const contentPath = actionsUtil.getOptionalInput("content-path");

    // Validate the repository NWO format before proceeding.
    const repositoryNwo = parseRepositoryNwo(repository);

    if (contentPath) {
      await api.downloadContent(repositoryNwo, contentPath, outputPath);
      return;
    }

    const release = await getLatestRelease(repositoryNwo);
    const asset = await getReleaseAsset(repositoryNwo, release.id, assetFilter);
    await api.downloadReleaseAsset(repositoryNwo, asset.id, outputPath);
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    const message = error.message;
    core.setFailed(message);
    return;
  }
}

/** Defines the `download-file` Action. */
const downloadFile: Action = {
  name: ActionName.DownloadFile,
  run,
};

export async function runWrapper() {
  await runInActions(downloadFile);
}
