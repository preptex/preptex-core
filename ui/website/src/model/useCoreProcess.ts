import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  process as coreProcess,
  transform as coreTransform,
  combine_project,
  InputCmdHandling,
} from '@preptex/core';

import type { CoreOptionsUI } from './useControl';
import type { FilesMutation } from './useFiles';

export type CoreRunResult = {
  declaredConditions: string[];
  error?: string;
};

type CoreProject = ReturnType<typeof coreProcess>;

export function useCoreProcess(
  entryFile: string,
  filesByName: Record<string, string>,
  mutation: FilesMutation,
  options: CoreOptionsUI
) {
  const [result, setResult] = useState<CoreRunResult | null>(null);
  const [projectVersion, setProjectVersion] = useState(0);

  const globalVersionRef = useRef(0);
  const versionedFilesRef = useRef<Record<string, { text: string; version: number }>>({});
  const globalProjectRef = useRef<CoreProject | null>(null);

  const normalizeText = useCallback((text: string) => text.replace(/\r\n/g, '\n'), []);

  const { id: mutationId, upserts, removes } = mutation;

  const coreOptions = useMemo(
    () => ({
      suppressComments: options.suppressComments,
      handleInputCmd:
        options.handleInputCmd === 'flatten'
          ? InputCmdHandling.FLATTEN
          : options.handleInputCmd === 'recursive'
            ? InputCmdHandling.RECURSIVE
            : InputCmdHandling.NONE,
      ifDecisions: options.handleIfConditions ? new Set(options.ifDecisions ?? []) : undefined,
    }),
    [options]
  );

  // Update global project incrementally whenever the user uploads/updates/removes files.
  useEffect(() => {
    try {
      // Advance global version once per batch.
      globalVersionRef.current = Math.max(globalVersionRef.current + 1, mutationId);
      const version = globalVersionRef.current;

      // Apply removals: rebuild, since combine_project can't delete files.
      if (removes.length > 0) {
        for (const name of removes) {
          delete versionedFilesRef.current[name];
        }

        globalProjectRef.current = coreProcess({ ...versionedFilesRef.current });
      }

      // Apply upserts: parse only the batch and combine into the global project.
      const upsertNames = Object.keys(upserts);
      if (upsertNames.length > 0) {
        const batch: Record<string, { text: string; version: number }> = {};
        for (const [name, raw] of Object.entries(upserts)) {
          const text = normalizeText(String(raw ?? ''));
          const vf = { text, version };
          versionedFilesRef.current[name] = vf;
          batch[name] = vf;
        }

        const batchProject = coreProcess(batch);
        globalProjectRef.current = globalProjectRef.current
          ? combine_project(globalProjectRef.current, batchProject)
          : batchProject;
      }

      const declared = Array.from(globalProjectRef.current?.getDeclaredConditions() ?? []);
      setResult({ declaredConditions: declared });
      setProjectVersion((v) => v + 1);
    } catch (err) {
      setResult({ declaredConditions: [], error: String(err) });
      console.log(err);
    }
  }, [mutationId, upserts, removes, normalizeText]);

  // Keep UI state in sync when selection changes (even if no new mutation occurs).
  useEffect(() => {
    if (!entryFile) {
      setResult(null);
      return;
    }

    const declared = Array.from(globalProjectRef.current?.getDeclaredConditions() ?? []);
    setResult((prev) => ({ declaredConditions: declared, error: prev?.error }));
  }, [entryFile]);

  const transform = useCallback(
    (entryOverride?: string): Record<string, string> | null => {
      const entry = entryOverride ?? entryFile;
      if (!entry) {
        return null;
      }

      try {
        const project = globalProjectRef.current;
        if (!project) return null;
        const outputs = coreTransform(entry, project, coreOptions);
        return outputs;
      } catch (err) {
        console.log(err);
        return null;
      }
    },
    [entryFile, coreOptions]
  );

  return {
    result,
    transform,
    project: globalProjectRef.current,
    projectVersion,
  } as const;
}
