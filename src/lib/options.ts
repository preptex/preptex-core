export type IfBranchDecision = 'if' | 'else' | 'keep-both';

export interface CoreOptions {
  suppressComments?: boolean;
  ifDecisions?: Record<string, IfBranchDecision>;
  flattenInputs?: 'none' | 'main-only' | 'recursive';
}

export interface Artifact {
  kind: 'text' | 'json';
  content: string;
}
