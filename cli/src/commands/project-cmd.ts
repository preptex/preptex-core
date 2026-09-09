import {
  createProjectSnapshot,
  inspectProject,
  resolveProjectView,
  runAnalysis,
  PrepTexError,
  PrepTexSyntaxError,
  ProjectOperationError,
  type ProjectView,
} from '@preptex/core';
import path from 'node:path';
import { readAllTexFiles } from '../io.js';
import { parseProjectArgs, printProjectHelp, type ProjectCommand } from '../project-args.js';

export async function handleProjectCommand(
  command: ProjectCommand,
  args: readonly string[]
): Promise<void> {
  let view: ProjectView | undefined;
  try {
    const options = parseProjectArgs(command, args);
    if (options.help) {
      printProjectHelp(command);
      return;
    }
    const files = await readAllTexFiles(path.resolve(options.workDir));
    const snapshot = createProjectSnapshot(files);
    if (options.command === 'inventory') {
      process.stdout.write(
        `${JSON.stringify(inspectProject(snapshot, options.request), null, 2)}\n`
      );
    } else {
      if (options.configuration) view = resolveProjectView(snapshot, options.configuration);
      process.stdout.write(
        `${JSON.stringify(runAnalysis(view ?? snapshot, options.request), null, 2)}\n`
      );
    }
  } catch (error: unknown) {
    process.stderr.write(
      `${JSON.stringify({
        name: error instanceof Error ? error.name : 'Error',
        code: error instanceof PrepTexError ? error.code : 'cli-error',
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof PrepTexSyntaxError ? { diagnostic: error.diagnostic } : {}),
        ...(error instanceof ProjectOperationError ? { failure: error.failure } : {}),
        ...(view && view.status !== 'ready' ? { viewIssue: view.reason } : {}),
      })}\n`
    );
    process.exitCode = 1;
  }
}
