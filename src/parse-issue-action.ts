import * as fs from "fs/promises";

import * as core from "@actions/core";
import { parseIssue as parseIssueForm } from "@github/issue-parser";

import { Action, ActionState, runInActions } from "./action-common";
import * as actionsUtil from "./actions-util";
import { ActionName } from "./status-report";
import { wrapError } from "./util";

async function getTemplate(templatePath: string): Promise<string> {
  try {
    return await fs.readFile(templatePath, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read template file at ${templatePath}: ${error}`,
    );
  }
}

async function run(action: ActionState<["Base", "Logger", "Env", "Actions"]>) {
  const logger = action.logger;

  try {
    logger.info(`Running ${action.name} action...`);

    const issue = actionsUtil.getRequiredInput("issue");
    const templatePath = actionsUtil.getOptionalInput("template-path");

    let template: string | undefined;
    if (templatePath) {
      template = await getTemplate(templatePath);
    }

    const result = parseIssueForm(issue, template);
    core.setOutput("issue", JSON.stringify(result));
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    const message = error.message;
    core.setFailed(message);
    return;
  }
}

/** Defines the `parse-issue` Action. */
const parseIssue: Action = {
  name: ActionName.ParseIssue,
  run,
};

export async function runWrapper() {
  await runInActions(parseIssue);
}
