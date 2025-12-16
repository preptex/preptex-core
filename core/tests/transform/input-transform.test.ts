import { transform, type Transformer } from '../../src/lib/transform/transform';
import { NodeType, type AstNode, type AstRoot, type InputNode } from '../../src/lib/parse/types';
import { describe, it, expect } from 'vitest';

describe('transform', () => {
  const mockAst: AstRoot = {
    type: NodeType.Root,
    start: 0,
    end: 0,
    line: 1,
    children: [
      {
        type: NodeType.Text,
        start: 0,
        end: 4,
        line: 1,
        value: 'Text',
      },
      {
        type: NodeType.Input,
        start: 5,
        end: 10,
        line: 2,
        path: 'file1',
        value: '\\input{file1}',
      },
    ],
    prefix: '',
    suffix: '',
  };

  const mockFileAst: AstRoot = {
    type: NodeType.Root,
    start: 0,
    end: 0,
    line: 1,
    children: [
      {
        type: NodeType.Text,
        start: 0,
        end: 6,
        line: 1,
        value: 'File1',
      },
    ],
    prefix: '',
    suffix: '',
  };

  const transformers: Transformer[] = [
    (node, ctx) => {
      // No-op transformer for testing
      return ctx;
    },
  ];

  it('should transform without flattening (non-flattening mode)', () => {
    const result = transform(mockAst, transformers, { file1: mockFileAst }, { flatten: false });

    // Expect the input command to remain as-is
    expect(result).toBe('Text\\input{file1}');
  });

  it('should transform with flattening (flattening mode)', () => {
    const result = transform(mockAst, transformers, { file1: mockFileAst }, { flatten: true });

    // Expect the input command to be replaced with the content of file1
    expect(result).toBe('TextFile1');
  });

  it('should handle missing files gracefully in flattening mode', () => {
    // Expect transform to throw when flattening and file is missing
    expect(() => transform(mockAst, transformers, {}, { flatten: true })).toThrow(
      'Missing input file: file1'
    );
  });

  it('should handle empty ASTs correctly', () => {
    const emptyAst: AstRoot = {
      type: NodeType.Root,
      start: 0,
      end: 0,
      line: 1,
      children: [],
      prefix: '',
      suffix: '',
    };

    const result = transform(emptyAst, transformers, {}, { flatten: true });

    // Expect empty output for an empty AST
    expect(result).toBe('');
  });
});
