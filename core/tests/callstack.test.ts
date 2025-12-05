import { describe, it, expect } from 'vitest';
import { CallStack } from '../src/lib/parse/callstack';
import { NodeType, AstNode, AstRoot } from '../src/lib/parse/types';

function makeNode(type: NodeType, extra: Partial<AstNode> = {}): AstNode {
  // minimal node with required fields for CallStack operations
  const base = { type, start: 0, end: 0 } as any;
  return Object.assign(base, extra) as AstNode;
}

describe('CallStack', () => {
  it('initializes with optional root', () => {
    const root = makeNode(NodeType.Root, { children: [] }) as AstRoot;
    const cs = new CallStack(root);
    expect(cs.size()).toBe(1);
    expect(cs.isEmpty()).toBe(false);
    expect(cs.peek()).toBe(root);
    expect(cs.current()).toBe(root);
    expect(cs.parent()).toBeUndefined();
  });

  it('push and pop follow LIFO order', () => {
    const cs = new CallStack();
    const n1 = makeNode(NodeType.Text);
    const n2 = makeNode(NodeType.Group);
    const n3 = makeNode(NodeType.Command);

    expect(cs.isEmpty()).toBe(true);
    cs.push(n1);
    cs.push(n2);
    cs.push(n3);

    expect(cs.size()).toBe(3);
    expect(cs.peek()).toBe(n3);
    expect(cs.parent()).toBe(n2);

    const p1 = cs.pop();
    expect(p1).toBe(n3);
    expect(cs.size()).toBe(2);
    expect(cs.peek()).toBe(n2);
    expect(cs.parent()).toBe(n1);

    const p2 = cs.pop();
    expect(p2).toBe(n2);
    const p3 = cs.pop();
    expect(p3).toBe(n1);

    expect(cs.size()).toBe(0);
    expect(cs.isEmpty()).toBe(true);
  });

  it('peek/current do not remove items', () => {
    const cs = new CallStack();
    const n1 = makeNode(NodeType.Environment);
    const n2 = makeNode(NodeType.Text);
    cs.push(n1);
    cs.push(n2);

    expect(cs.peek()).toBe(n2);
    expect(cs.current()).toBe(n2);
    expect(cs.size()).toBe(2);
  });

  it('parent returns previous or undefined when unavailable', () => {
    const cs = new CallStack();
    expect(cs.parent()).toBeUndefined();

    const n1 = makeNode(NodeType.Text);
    cs.push(n1);
    expect(cs.parent()).toBeUndefined();

    const n2 = makeNode(NodeType.Group);
    cs.push(n2);
    expect(cs.parent()).toBe(n1);
  });

  it('clear empties the stack', () => {
    const cs = new CallStack();
    cs.push(makeNode(NodeType.Text));
    cs.push(makeNode(NodeType.Group));

    expect(cs.isEmpty()).toBe(false);
    expect(cs.size()).toBe(2);

    cs.clear();
    expect(cs.isEmpty()).toBe(true);
    expect(cs.size()).toBe(0);
    expect(cs.peek()).toBeUndefined();
    expect(cs.parent()).toBeUndefined();
  });

  it('handles empty operations safely', () => {
    const cs = new CallStack();
    expect(cs.pop()).toBeUndefined();
    expect(cs.peek()).toBeUndefined();
    expect(cs.parent()).toBeUndefined();
  });
});
