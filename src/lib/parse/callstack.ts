import type { AstNode, AstRoot } from './types';

export class CallStack {
  private stack: AstNode[] = [];

  constructor(root?: AstRoot) {
    if (root) this.stack.push(root);
  }

  push(node: AstNode) {
    this.stack.push(node);
  }

  pop(): AstNode | undefined {
    return this.stack.pop();
  }

  peek(): AstNode | undefined {
    if (this.stack.length === 0) return undefined;
    return this.stack[this.stack.length - 1];
  }

  current(): AstNode | undefined {
    return this.peek();
  }

  parent(): AstNode | undefined {
    if (this.stack.length < 2) return undefined;
    return this.stack[this.stack.length - 2];
  }

  clear() {
    this.stack = [];
  }

  size(): number {
    return this.stack.length;
  }

  isEmpty(): boolean {
    return this.stack.length === 0;
  }
}
