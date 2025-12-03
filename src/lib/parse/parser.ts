import { CallStack } from './callstack';
import { AstNode, AstRoot, NodeType } from './types';
import { CoreOptions, Artifact } from '../options';
import { Lexer, TokenType } from './tokens';
import { sanityCheck } from './sanity';

export const SECTION_LEVELS: Record<string, number> = {
  section: 1,
  subsection: 2,
  subsubsection: 3,
} as const;

export class Parser {
  private handlers: Map<TokenType, (token: any) => void> = new Map();

  private input: string = '';
  private root!: AstRoot;
  private stack: CallStack = new CallStack();

  constructor(private options: CoreOptions) {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers() {
    // Token types per tokens.ts
    this.handlers.set(TokenType.Text, this.handleText.bind(this));
    this.handlers.set(TokenType.Command, this.handleCommand.bind(this));
    this.handlers.set(TokenType.Brace, this.handleBrace.bind(this));
    this.handlers.set(TokenType.Bracket, this.handleBracket.bind(this));
    this.handlers.set(TokenType.Comment, this.handleComment.bind(this));
    this.handlers.set(TokenType.MathDelim, this.handleMathDelim.bind(this));
    this.handlers.set(TokenType.Environment, this.handleEnvironment.bind(this));
    this.handlers.set(TokenType.Condition, this.handleCondition.bind(this));
  }

  private getParentNode(): AstNode | null {
    const parent = this.stack.peek();
    if (!parent) throw new Error('Stack empty');
    return parent;
  }

  private handleText(token: any) {
    const parent = this.getParentNode();
    (parent as any).children.push({
      type: NodeType.Text,
      start: token.start,
      end: token.end,
      value: token.value,
    });
  }

  private handleSection(token: any) {
    const level = SECTION_LEVELS[token.value];
    if (level === undefined) {
      throw new Error(`Unknown section command: ${token.value}`);
    }

    let parent: AstNode = this.getParentNode() as AstNode;
    // Sections are only valid at the root level or inside another section
    if (parent.type !== NodeType.Root && parent.type !== NodeType.Section) {
      throw new Error(
        'Sections can only appear at the root or inside another section. Found:' + parent.type
      );
    }
    while (parent.type === NodeType.Section && parent.level >= level) {
      this.stack.pop();
      parent = this.getParentNode() as AstNode;
    }

    const sectionNode = {
      type: NodeType.Section,
      level,
      start: token.start,
      end: token.end,
      children: [],
    } as AstNode;

    (parent as any).children.push(sectionNode);
    this.stack.push(sectionNode);
  }

  private handleCommand(token: any) {
    if (token.value in SECTION_LEVELS) {
      this.handleSection(token);
      return;
    }
    const parent = this.getParentNode();
    (parent as any).children.push({
      type: NodeType.Command,
      start: token.start,
      end: token.end,
      name: token.value,
    });
  }

  private handleBrace(token: any) {
    const parent = this.getParentNode() as any;
    if (!parent) return;
    if (token.value === '{') {
      const group = {
        type: NodeType.Group,
        start: token.start,
        end: token.end,
        children: [],
      } as AstNode;
      parent.children.push(group);
      this.stack.push(group);
    } else {
      this.stack.pop();
    }
  }
  private handleEnvironment(token: any) {
    const parent = this.getParentNode() as any;
    const isBegin = token.value === 'begin';
    const name = token.name as string;
    if (isBegin) {
      const envNode = {
        type: NodeType.Environment,
        name,
        start: token.start,
        end: token.end,
        children: [],
      } as AstNode;
      parent.children.push(envNode);
      this.stack.push(envNode);
    } else {
      this.stack.pop();
    }
  }
  private handleBracket(_token: any) {
    void _token;
  }
  private handleMathDelim(token: any) {
    const delim: string = token.value;
    const top = this.stack.peek() as any;
    if (top === undefined) throw new Error('Stack empty');
    const isDollar = delim === '$' || delim === '$$';
    const isParenClose = delim === '\\]' || delim === '\\)';
    const isClosing =
      (isDollar && top.type === NodeType.Math && top.delim === delim) || isParenClose;

    if (isClosing) {
      this.stack.pop();
      return;
    }

    // Opening math node for all other cases ($, $$, \\[, \\()
    const parent = this.getParentNode() as any;
    const mathNode = {
      type: NodeType.Math,
      delim,
      start: token.start,
      end: token.end,
      children: [],
    } as AstNode;
    parent.children.push(mathNode);
    this.stack.push(mathNode);
  }
  private handleCondition(_token: any) {
    void _token;
  }
  private handleComment(_token: any) {
    void _token;
  }

  parse(input: string): AstRoot {
    this.input = input;
    // Pre-sanity layer: analyze input and configure lexer
    const sanity = sanityCheck(this.input);
    const lexer = new Lexer(this.input, sanity.lexerOptions);
    const tokens = Array.from(lexer.stream());

    this.root = { type: NodeType.Root, start: 0, end: this.input.length, children: [] };
    this.stack = new CallStack(this.root);
    this.stack.push(this.root);

    // Dispatch each token to its handler
    for (const token of tokens) {
      const handler = this.handlers.get(token.type);
      if (handler) {
        handler(token);
      } else {
        throw new Error(`No handler for token type: ${token.type}`);
      }
    }

    return this.root;
  }

  export(ast: AstRoot, _options: CoreOptions): Artifact {
    void ast; // silence unused for now
    void _options;
    // TODO: Implement export pipeline according to options.
    return { kind: 'text', content: '' };
  }
}
