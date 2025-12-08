import type { CoreOptions } from '../options.js';
import { transform as runTransform, type Transformer } from '../transform/transform.js';
import type { AstRoot } from './types.js';
import { parseToAst } from './parseToAst.js';

export class Parser {
  private input = '';
  private root: AstRoot | null = null;

  constructor(private options: CoreOptions) {}

  parse(input: string): void {
    this.input = input;
    this.root = parseToAst(input, this.options);
  }

  getRoot(): AstRoot {
    return this.ensureRoot();
  }

  getInput(): string {
    return this.input;
  }

  transform(transformers: Transformer[]) {
    const root = this.ensureRoot();
    return runTransform(root, transformers);
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
