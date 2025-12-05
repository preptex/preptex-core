export enum InputCmdHandling {
  NONE = 'none',
  FLATTEN = 'flatten',
  RECURSIVE = 'recursive',
}
export const INPUT_CMD_HANDLING_VALUES = new Set<string>(Object.values(InputCmdHandling));

export interface CoreOptions {
  suppressComments?: boolean;
  ifDecisions?: Set<string>;
  handleInputCmd?: InputCmdHandling;
}
