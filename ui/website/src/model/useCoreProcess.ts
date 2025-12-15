import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  process as coreProcess,
  transform as coreTransform,
  InputCmdHandling,
} from '@preptex/core';

import type { CoreOptionsUI } from './useControl';

export type CoreRunResult = {
  declaredConditions: string[];
  isFlattened: boolean;
  error?: string;
};

export function useCoreProcess(
  entryFile: string,
  filesByName: Record<string, string>,
  options: CoreOptionsUI
) {
  const [result, setResult] = useState<CoreRunResult | null>(null);

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

  const readFile = useCallback(
    (name: string): string => {
      const text = filesByName[name];
      if (text === undefined) {
        console.warn(`[preptex] Missing file: ${name}`);
        return '';
      }
      return text;
    },
    [filesByName]
  );

  // Auto-parse whenever selection changes
  useEffect(() => {
    if (!entryFile) {
      setResult(null);
      return;
    }

    try {
      const project = coreProcess(entryFile, readFile, coreOptions);
      const declared = Array.from(project.getDeclaredConditions());
      setResult({
        declaredConditions: declared,
        isFlattened: project.isFlattened(),
      });
    } catch (err) {
      setResult({ declaredConditions: [], isFlattened: false, error: String(err) });
      console.log(err);
    }
  }, [entryFile, readFile, coreOptions]);

  const transform = useCallback(
    (entryOverride?: string): Record<string, string> | null => {
      const entry = entryOverride ?? entryFile;
      if (!entry) {
        return null;
      }

      try {
        const project = coreProcess(entry, readFile, coreOptions);
        const outputs = coreTransform(project, coreOptions);
        return outputs;
      } catch (err) {
        console.log(err);
        return null;
      }
    },
    [entryFile, readFile, coreOptions]
  );

  return { result, transform } as const;
}
