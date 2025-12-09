export enum InputCmdHandling {
  NONE = 'none',
  FLATTEN = 'flatten',
  RECURSIVE = 'recursive',
}

export function inputCommandOption(options: Record<string, string | true>): InputCmdHandling {
  const flatten = options.flatten;
  const recursive = options.recursive;
  if (flatten && recursive) {
    throw new Error('Cannot use both --flatten and --recursive options together.');
  }
  if (flatten) {
    return InputCmdHandling.FLATTEN;
  }
  if (recursive) {
    return InputCmdHandling.RECURSIVE;
  }
  return InputCmdHandling.NONE;
}

export const INPUT_CMD_HANDLING_VALUES = new Set<string>(Object.values(InputCmdHandling));

export interface CoreOptions {
  suppressComments?: boolean;
  ifDecisions?: Set<string>;
  handleInputCmd?: InputCmdHandling;
}
