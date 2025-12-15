import { useState } from 'react';

export type InputCmdHandlingUI = 'none' | 'flatten' | 'recursive';

export type CoreOptionsUI = {
  suppressComments: boolean;
  handleInputCmd: InputCmdHandlingUI;
  ifDecisions: string[];
};

export function useControl(initial?: Partial<CoreOptionsUI>) {
  const [options, setOptions] = useState<CoreOptionsUI>({
    suppressComments: initial?.suppressComments ?? false,
    handleInputCmd: initial?.handleInputCmd ?? 'none',
    ifDecisions: initial?.ifDecisions ?? [],
  });

  return { options, setOptions } as const;
}
