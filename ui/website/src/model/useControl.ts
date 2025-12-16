import { useState } from 'react';

export type InputCmdHandlingUI = 'none' | 'flatten' | 'recursive';

export type CoreOptionsUI = {
  suppressComments: boolean;
  handleInputCmd: InputCmdHandlingUI;
  handleIfConditions: boolean;
  ifDecisions: string[];
};

export function useControl(initial?: Partial<CoreOptionsUI>) {
  const [options, setOptions] = useState<CoreOptionsUI>({
    suppressComments: initial?.suppressComments ?? false,
    handleInputCmd: initial?.handleInputCmd ?? 'none',
    handleIfConditions: initial?.handleIfConditions ?? false,
    ifDecisions: initial?.ifDecisions ?? [],
  });

  return { options, setOptions } as const;
}
