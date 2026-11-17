import path from 'node:path';
import process from 'node:process';
import {
  createProjectSnapshot,
  planTransformation,
  realizeProjectConditions,
  resolveProjectView,
  type ConditionPolicy,
  type GeneratedArtifact,
} from '@preptex/core';
import { parseTransformArgs, printTransformHelp, type TransformCliOptions } from '../args.js';
import { readAllTexFiles, resolvePaths, writeArtifacts } from '../io.js';
import { formatProjectIssue } from './realize-cmd.js';

export async function handleTransform(args: string[]): Promise<void> {
  let options: TransformCliOptions;
  try {
    options = parseTransformArgs(args);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    printTransformHelp();
    return;
  }

  const vlog = (msg: string): void => {
    if (!options.verbose) return;
    process.stderr.write(`[verbose] ${msg}\n`);
  };

  if (options.help) {
    printTransformHelp();
    return;
  }

  if (!options.input) {
    process.stderr.write('Missing required --input argument.\n');
    process.exitCode = 1;
    printTransformHelp();
    return;
  }

  const conditions: ConditionPolicy = options.enabledConditions
    ? {
        mode: 'source-with-overrides',
        overrides: Object.fromEntries(options.enabledConditions.map((name) => [name, true])),
      }
    : (options.conditions ?? { mode: 'source' });

  try {
    vlog('resolving paths');
    const { entryPath, baseDir, outDir, outName } = resolvePaths({
      input: options.input,
      ...(options.workDir === undefined ? {} : { workDir: options.workDir }),
      ...(options.outDir === undefined ? {} : { outDir: options.outDir }),
      ...(options.output === undefined ? {} : { output: options.output }),
    });

    vlog(`baseDir: ${baseDir}`);
    vlog(`entryPath: ${entryPath}`);

    vlog('reading .tex files');
    const files = await readAllTexFiles(baseDir, outDir);
    vlog(`discovered ${files.length} .tex file(s)`);
    const entryKey = path.relative(baseDir, entryPath).replace(/\\/g, '/').replace(/^\.\//, '');

    if (!files.some((file) => file.path === entryKey)) {
      throw new Error(`Entry file not found under work directory: ${entryKey}`);
    }

    vlog(`entryKey: ${entryKey}`);
    vlog('processing project');
    const snapshot = createProjectSnapshot(files);

    if (options.inputHandling === 'separate') {
      const needsAstExport =
        options.suppressComments ||
        options.suppressCommentEnvironments ||
        conditions.mode === 'none';

      let artifacts: readonly Pick<GeneratedArtifact, 'path' | 'source'>[];
      if (!needsAstExport) {
        const realized = realizeProjectConditions(snapshot, {
          traversal: options.traversal ?? 'file-only',
          ...(options.traversal === 'project' ? { entryPath: entryKey } : {}),
          conditions,
        });
        if (realized.status !== 'ready') {
          throw new Error(formatProjectIssue(realized.reason, 'Condition realization failed.'));
        }
        artifacts = realized.artifacts;
      } else {
        const exported: Pick<GeneratedArtifact, 'path' | 'source'>[] = [];
        for (const file of snapshot.files) {
          const fileView = resolveProjectView(snapshot, {
            entryPath: file.path,
            traversal: options.traversal ?? 'project',
            conditions,
          });
          if (fileView.status !== 'ready') {
            throw new Error(
              formatProjectIssue(fileView.reason, `Failed to resolve view for ${file.path}.`)
            );
          }
          const result = planTransformation(fileView, {
            operation: 'export-project',
            options: {
              inputs: 'preserve',
              suppressComments: options.suppressComments,
              suppressCommentEnvironments: options.suppressCommentEnvironments,
            },
          });
          const artifact =
            result.artifacts.find((a) => a.path === file.path) ?? result.artifacts[0];
          if (artifact) exported.push(artifact);
        }
        artifacts = exported;
      }

      vlog(`generated ${artifacts.length} output(s)`);
      await writeArtifacts(outDir, artifacts, {
        entryKey,
        outName,
        verbose: options.verbose,
        label: 'recursive',
      });
      vlog('done');
      return;
    }

    vlog('transforming');
    const transformed =
      conditions.mode === 'ignore'
        ? planTransformation(snapshot, {
            operation: 'export-project',
            options: {
              entryPath: entryKey,
              traversal: options.traversal ?? 'project',
              inputs: options.inputHandling === 'flatten' ? 'inline' : 'preserve',
              suppressComments: options.suppressComments,
              suppressCommentEnvironments: options.suppressCommentEnvironments,
            },
          })
        : (() => {
            const view = resolveProjectView(snapshot, {
              entryPath: entryKey,
              traversal: options.traversal ?? 'project',
              conditions,
            });
            if (view.status !== 'ready') {
              throw new Error(
                formatProjectIssue(view.reason, 'A complete configured view is required.')
              );
            }
            return planTransformation(view, {
              operation: 'export-project',
              options: {
                inputs: options.inputHandling === 'flatten' ? 'inline' : 'preserve',
                suppressComments: options.suppressComments,
                suppressCommentEnvironments: options.suppressCommentEnvironments,
              },
            });
          })();
    vlog(`generated ${transformed.artifacts.length} output(s)`);
    vlog(`outDir: ${outDir}`);
    vlog(`outName: ${outName}`);

    if (options.inputHandling === 'flatten' || options.output !== undefined) {
      const single =
        transformed.artifacts.find((a) => a.path === entryKey) ?? transformed.artifacts[0];
      if (!single) {
        throw new Error('No output generated from transformation.');
      }
      await writeArtifacts(outDir, [{ path: entryKey, source: single.source }], {
        entryKey,
        outName,
        verbose: options.verbose,
      });
    } else {
      await writeArtifacts(outDir, transformed.artifacts, {
        entryKey,
        outName,
        verbose: options.verbose,
        label: 'preserve',
      });
    }
    vlog('done');
  } catch (err) {
    process.stderr.write(
      `Failed to transform ${options.input}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exitCode = 1;
  }
}
