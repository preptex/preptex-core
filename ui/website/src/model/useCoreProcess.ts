import { useEffect, useMemo, useState } from 'react';
import { process as coreProcess, InputCmdHandling } from '@preptex/core';

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
      ifDecisions: new Set(options.ifDecisions),
    }),
    [options]
  );

  useEffect(() => {
    if (!entryFile) {
      setResult(null);
      return;
    }
    try {
      const project = coreProcess(entryFile, (name: string) => filesByName[name], coreOptions);
      const declared = Array.from(project.getDeclaredConditions());
      console.log('Declared conditions:', declared);
      setResult({
        declaredConditions: declared,
        isFlattened: project.isFlattened(),
      });
    } catch (err) {
      setResult({ declaredConditions: [], isFlattened: false, error: String(err) });
      console.log(err);
    }
  }, [entryFile, filesByName, coreOptions]);

  return result;
}
