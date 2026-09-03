import type { ParseOptions } from '../options.js';
import { NodeType, type AstNode, type AstRoot, type InnerNode } from './types.js';
import { parseToAst } from './parseToAst.js';
import { Lexer } from '../lexer/tokens.js';
import type { ParseNotice } from './notices.js';

export class Parser {
  private input = '';
  private root: AstRoot | null = null;
  private declaredConditions: Set<string> = new Set();
  private inputFiles: Set<string> = new Set();
  private notes: string[] = [];
  private notices: ParseNotice[] = [];

  constructor(private options: ParseOptions = {}) {}

  parse(lexer: Lexer, input: string): void {
    this.input = input;
    this.inputFiles.clear();
    this.notes = [];
    this.notices = [];
    const root = parseToAst(lexer, input, this.options, this.inputFiles, this.notes, this.notices);
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

  getNotes(): Readonly<string[]> {
    this.ensureRoot();
    return [...this.notes];
  }

  getNotices(): readonly ParseNotice[] {
    this.ensureRoot();
    return [...this.notices];
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
