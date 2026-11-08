import * as core from "@actions/core";
import { processZip } from "openfpga-validator/lib";

import { Action, ActionState, runInActions } from "./action-common";
import * as actionsUtil from "./actions-util";
import { ActionName } from "./status-report";
import { wrapError } from "./util";

async function run(action: ActionState<["Base", "Logger", "Env", "Actions"]>) {
  const logger = action.logger;
  logger.info(`Running ${action.name} action...`);

  try {
    const zipPath = actionsUtil.getRequiredInput("zip-path");

    const result = await processZip(
      zipPath,
      { failOnWarnings: false, failOnRecommendations: false },
      false,
    );

    if (result > 0) {
      throw new Error(`Validation failed with ${result} errors.`);
    }
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    const message = error.message;
    core.setFailed(message);
    return;
  }
}

/** Defines the `validate-core` Action. */
const validateCore: Action = {
  name: ActionName.ValidateCore,
  run,
};

export async function runWrapper() {
  await runInActions(validateCore);
}
