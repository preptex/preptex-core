import type { Token } from './tokens';

export class CallStack {
  private stack: Token[] = [];
  push(item: Token) {
    this.stack.push(item);
  }
  pop(): Token | undefined {
    return this.stack.pop();
  }
  peek(): Token | undefined {
    return this.stack[this.stack.length - 1];
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
