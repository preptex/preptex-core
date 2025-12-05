import { CallStack } from './callstack';
import { AstNode, InnerNode, AstRoot, NodeType, ConditionBranchType } from './types';
import { CoreOptions, Artifact } from '../options';
import { Lexer, TokenType } from './tokens';
import { sanityCheck } from './sanity';
import { SECTION_LEVELS } from './constants';

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
    (parent as InnerNode).children.push({
      type: NodeType.Text,
      start: token.start,
      end: token.end,
      value: token.text,
    });
  }

  private handleSection(token: any) {
    const level = SECTION_LEVELS[token.name];
    if (level === undefined) {
      throw new Error(`Unknown section command: ${token.name}`);
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
      prefix: `\\${token.name}`,
      suffix: ``,
    } as AstNode;

    (parent as InnerNode).children.push(sectionNode);
    this.stack.push(sectionNode);
  }

  private handleCommand(token: any) {
    if (token.name in SECTION_LEVELS) {
      this.handleSection(token);
      return;
    }
    const parent = this.getParentNode();
    (parent as InnerNode).children.push({
      type: NodeType.Command,
      start: token.start,
      end: token.end,
      name: token.name,
      prefix: `\\${token.name}`,
    });
  }

  private handleBrace(token: any) {
    const parent = this.getParentNode() as any;
    if (!parent) return;
    if (token.name === '{') {
      const group = {
        type: NodeType.Group,
        start: token.start,
        end: token.end,
        children: [],
        prefix: '{',
        suffix: '}',
      } as AstNode;
      parent.children.push(group);
      this.stack.push(group);
    } else {
      this.stack.pop();
    }
  }

  private handleEnvironment(token: any) {
    const parent = this.getParentNode() as any;
    const isBegin = !!token.isBegin;
    const name = token.name as string;
    if (isBegin) {
      const envNode = {
        type: NodeType.Environment,
        name,
        start: token.start,
        end: token.end,
        children: [],
        prefix: `\\begin{${name}}`,
        suffix: `\\end{${name}}`,
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
    const delim: string = token.name;
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
      prefix: delim,
      suffix:
        delim === '$' || delim === '$$'
          ? delim
          : delim === '\\['
            ? '\\]'
            : delim === '\\('
              ? '\\)'
              : delim,
    } as AstNode;
    parent.children.push(mathNode);
    this.stack.push(mathNode);
  }

  private handleCondition(_token: any) {
    const token = _token as any;
    const kind: string = token.name; // 'if', 'else', 'fi'

    // Open a new condition node on 'if<Name>' / 'if'
    if (kind === 'if') {
      const parent = this.getParentNode() as any;
      const name: string = token.text;

      if (!name) {
        throw new Error('Condition name missing in ' + kind);
      }

      const conditionNode = {
        type: NodeType.Condition,
        name,
        start: token.start,
        end: token.end,
        children: [],
        prefix: ``,
        suffix: `\\fi`,
      } as any;

      parent.children.push(conditionNode);
      this.stack.push(conditionNode as AstNode);

      // create IF branch and route children into it by pushing it on the stack
      const ifBranch = {
        type: NodeType.ConditionBranch,
        name,
        branch: ConditionBranchType.If,
        start: token.start,
        end: token.end,
        children: [],
        prefix: `\\if${name}`,
        suffix: ``,
      } as any;
      conditionNode.children.push(ifBranch);
      this.stack.push(ifBranch as AstNode);
      return;
    }

    // Switch to ELSE branch
    if (kind === 'else') {
      const top = this.stack.peek() as any;
      if (!top || top.type !== NodeType.ConditionBranch || top.branch !== ConditionBranchType.If) {
        throw new Error('Unexpected "else" without an open IF branch');
      }
      // close IF branch
      top.end = token.start - 1;
      this.stack.pop();
      const parent = this.stack.peek() as any;
      if (!parent || parent.type !== NodeType.Condition) {
        throw new Error('Unexpected stack state at else');
      }
      const elseBranch = {
        type: NodeType.ConditionBranch,
        name: parent.name,
        branch: ConditionBranchType.Else,
        start: token.start,
        end: token.end,
        children: [],
        prefix: `\\else`,
        suffix: ``,
      } as any;
      parent.children.push(elseBranch);
      // route subsequent children into ELSE branch
      this.stack.push(elseBranch as AstNode);
      return;
    }

    // Close condition on 'fi'
    if (kind === 'fi') {
      let top = this.stack.peek() as any;
      if (!top || top.type !== NodeType.ConditionBranch) {
        throw new Error('Unexpected "fi" without an open condition');
      }
      top.end = token.end;
      if (top.type === NodeType.ConditionBranch) {
        this.stack.pop();
      }
      top = this.stack.peek() as any;
      if (!top || top.type !== NodeType.Condition) {
        throw new Error('Unexpected "fi" without an open condition');
      }
      top.end = token.end;
      this.stack.pop();
      return;
    }

    // Unknown condition token kind
    throw new Error(`Unknown condition token: ${kind}`);
  }

  private handleComment(_token: any) {
    const token = _token as any;
    const parent = this.getParentNode() as any;
    if (!parent) throw new Error('Stack empty');
    parent.children.push({
      type: NodeType.Comment,
      start: token.start,
      end: token.end,
      name: token.name,
      value: token.text,
    });
  }

  parse(input: string): AstRoot {
    this.input = input;
    // Pre-sanity layer: analyze input and configure lexer
    const sanity = sanityCheck(this.input);
    const lexer = new Lexer(this.input, sanity.lexerOptions);
    const tokens = Array.from(lexer.stream());

    this.root = {
      type: NodeType.Root,
      start: 0,
      end: this.input.length,
      children: [],
      prefix: '',
      suffix: '',
    };
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
