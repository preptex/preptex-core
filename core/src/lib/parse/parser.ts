import type { CoreOptions } from '../options.js';
import { NodeType, type AstNode, type AstRoot, type InnerNode } from './types.js';
import { parseToAst } from './parseToAst.js';

export class Parser {
  private input = '';
  private root: AstRoot | null = null;
  private declaredConditions: Set<string> = new Set();
  private inputFiles: Set<string> = new Set();

  constructor(private options: CoreOptions) {}

  parse(input: string): void {
    this.input = input;
    this.inputFiles.clear();
    const root = parseToAst(input, this.options, this.inputFiles);
    this.root = root;
    this.declaredConditions = collectConditionDeclarations(root);
  }

  getRoot(): AstRoot {
    return this.ensureRoot();
  }

  getInput(): string {
    return this.input;
  }

  getDeclaredConditions(): ReadonlySet<string> {
    this.ensureRoot();
    return new Set(this.declaredConditions);
  }

  getInputFiles(): ReadonlySet<string> {
    this.ensureRoot();
    return new Set(this.inputFiles);
  }

  exportJSON(_options: CoreOptions): JSON {
    void _options;
    this.ensureRoot();
    // TODO: Implement export pipeline according to options.
    throw new Error('Export not implemented yet');
  }

  private ensureRoot(): AstRoot {
    if (!this.root) {
      throw new Error('No AST available. Call parse() before accessing the tree.');
    }
    return this.root;
  }
}

function collectConditionDeclarations(root: AstRoot): Set<string> {
  const declarations = new Set<string>();
  const stack: AstNode[] = [root];

  while (stack.length) {
    const node = stack.pop()!;

    if (node.type === NodeType.ConditionDeclaration) {
      declarations.add(node.name);
      continue;
    }

    if ('children' in node) {
      for (const child of (node as InnerNode).children) {
        stack.push(child);
      }
    }
  }

  return declarations;
}
