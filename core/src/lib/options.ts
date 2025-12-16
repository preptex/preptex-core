export enum InputCmdHandling {
  NONE = 'none',
  FLATTEN = 'flatten',
  RECURSIVE = 'recursive',
}

// Parsing options are intentionally separate from transform options.
// Parsing never performs IO or input-tree recursion.
export interface ParseOptions {
  // Reserved for future parse-time options.
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

export interface CoreOptions extends ParseOptions {
  suppressComments?: boolean;
  ifDecisions?: Set<string>;
  handleInputCmd?: InputCmdHandling;
}
