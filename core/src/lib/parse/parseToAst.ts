import { CallStack } from './callstack.js';
import {
  AstNode,
  InnerNode,
  AstRoot,
  NodeType,
  ConditionBranchType,
  CommandNode,
} from './types.js';
import type { CoreOptions } from '../options.js';
import { Lexer, TokenType, type Token } from './tokens.js';
import { sanityCheck } from './sanity.js';
import { SECTION_LEVELS } from './constants.js';

interface ParseRuntime {
  input: string;
  root: AstRoot;
  stack: CallStack;
}

type TokenHandler = (runtime: ParseRuntime, token: Token) => void;

const HANDLERS: Map<TokenType, TokenHandler> = new Map([
  [TokenType.Text, handleText],
  [TokenType.Command, handleCommand],
  [TokenType.Brace, handleBrace],
  [TokenType.Bracket, handleBracket],
  [TokenType.Comment, handleComment],
  [TokenType.MathDelim, handleMathDelim],
  [TokenType.Environment, handleEnvironment],
  [TokenType.Condition, handleCondition],
  [TokenType.ConditionDeclaration, handleConditionDeclaration],
]);

export function parseToAst(input: string, options: CoreOptions): AstRoot {
  void options;
  const runtime = createRuntime(input);

  const sanity = sanityCheck(input);
  const lexer = new Lexer(input, sanity.lexerOptions);

  for (const token of lexer.stream()) {
    const handler = HANDLERS.get(token.type);
    if (!handler) {
      throw new Error(`No handler for token type: ${token.type}`);
    }
    handler(runtime, token);
  }

  return runtime.root;
}

function createRuntime(input: string): ParseRuntime {
  const root: AstRoot = {
    type: NodeType.Root,
    start: 0,
    end: input.length,
    line: 1,
    children: [],
    prefix: '',
    suffix: '',
  };
  const stack = new CallStack(root);
  stack.push(root);
  return {
    input,
    root,
    stack,
  };
}

function getParentNode(runtime: ParseRuntime): AstNode {
  const parent = runtime.stack.peek();
  if (!parent) {
    throw new Error('Stack empty');
  }
  return parent;
}

function handleText(runtime: ParseRuntime, token: Token) {
  const parent = getParentNode(runtime) as InnerNode;
  parent.children.push({
    type: NodeType.Text,
    start: token.start,
    end: token.end,
    line: token.line,
    value: token.text ?? '',
  });
}

function handleSection(runtime: ParseRuntime, token: Token) {
  const name = token.name ?? '';
  const level = SECTION_LEVELS[name];
  if (level === undefined) {
    throw new Error(`Unknown section command: ${name}`);
  }

  let parent = getParentNode(runtime) as AstNode;
  if (parent.type !== NodeType.Root && parent.type !== NodeType.Section) {
    throw new Error(
      'Sections can only appear at the root or inside another section. Found:' + parent.type
    );
  }

  while (parent.type === NodeType.Section && (parent as any).level >= level) {
    runtime.stack.pop();
    parent = getParentNode(runtime) as AstNode;
  }

  const sectionNode = {
    type: NodeType.Section,
    level,
    start: token.start,
    end: token.end,
    line: token.line,
    children: [],
    prefix: `\\${name}`,
    suffix: ``,
  } as AstNode;

  (parent as InnerNode).children.push(sectionNode);
  runtime.stack.push(sectionNode);
}

function handleCommand(runtime: ParseRuntime, token: Token) {
  const name = token.name ?? '';
  if (name in SECTION_LEVELS) {
    handleSection(runtime, token);
    return;
  }

  const cmdNode = {
    type: NodeType.Command,
    start: token.start,
    end: token.end,
    line: token.line,
    name,
    value: `\\${name}`,
  } as CommandNode;

  const parent = getParentNode(runtime) as InnerNode;
  parent.children.push(cmdNode);
}

function handleBrace(runtime: ParseRuntime, token: Token) {
  const parent = getParentNode(runtime) as InnerNode;
  const name = token.name ?? '';

  if (name === '{') {
    const group = {
      type: NodeType.Group,
      start: token.start,
      end: token.end,
      line: token.line,
      children: [],
      prefix: '{',
      suffix: '}',
    } as AstNode;
    parent.children.push(group);
    runtime.stack.push(group);
    return;
  }

  runtime.stack.pop();
}

function handleEnvironment(runtime: ParseRuntime, token: Token) {
  const parent = getParentNode(runtime) as InnerNode;
  const isBegin = Boolean(token.isBegin);
  const name = token.name ?? '';

  if (isBegin) {
    const envNode = {
      type: NodeType.Environment,
      name,
      start: token.start,
      end: token.end,
      line: token.line,
      children: [],
      prefix: `\\begin{${name}}`,
      suffix: `\\end{${name}}`,
    } as AstNode;
    parent.children.push(envNode);
    runtime.stack.push(envNode);
    return;
  }

  runtime.stack.pop();
}

function handleBracket(_runtime: ParseRuntime, _token: Token) {
  void _runtime;
  void _token;
}

function handleMathDelim(runtime: ParseRuntime, token: Token) {
  const delim = token.name ?? '';
  const top = runtime.stack.peek() as any;
  if (!top) {
    throw new Error('Stack empty');
  }
  const isDollar = delim === '$' || delim === '$$';
  const isParenClose = delim === '\\]' || delim === '\\)';
  const isClosing = (isDollar && top.type === NodeType.Math && top.delim === delim) || isParenClose;

  if (isClosing) {
    runtime.stack.pop();
    return;
  }

  const parent = getParentNode(runtime) as InnerNode;
  const mathNode = {
    type: NodeType.Math,
    delim,
    start: token.start,
    end: token.end,
    line: token.line,
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
  runtime.stack.push(mathNode);
}

function handleCondition(runtime: ParseRuntime, token: Token) {
  const kind = token.name ?? '';

  if (kind === 'if') {
    const parent = getParentNode(runtime) as InnerNode;
    const name = token.text ?? '';
    if (!name) {
      throw new Error('Condition name missing in ' + kind);
    }

    const conditionNode = {
      type: NodeType.Condition,
      name,
      start: token.start,
      end: token.end,
      line: token.line,
      children: [],
      prefix: ``,
      suffix: `\\fi`,
    } as AstNode;

    parent.children.push(conditionNode);
    runtime.stack.push(conditionNode);

    const ifBranch = {
      type: NodeType.ConditionBranch,
      name,
      branch: ConditionBranchType.If,
      start: token.start,
      end: token.end,
      line: token.line,
      children: [],
      prefix: `\\if${name}`,
      suffix: ``,
    } as AstNode;

    (conditionNode as InnerNode).children.push(ifBranch);
    runtime.stack.push(ifBranch);
    return;
  }

  if (kind === 'else') {
    const top = runtime.stack.peek() as any;
    if (!top || top.type !== NodeType.ConditionBranch || top.branch !== ConditionBranchType.If) {
      throw new Error('Unexpected "else" without an open IF branch');
    }
    top.end = token.start - 1;
    runtime.stack.pop();

    const parent = runtime.stack.peek() as any;
    if (!parent || parent.type !== NodeType.Condition) {
      throw new Error('Unexpected stack state at else');
    }

    const elseBranch = {
      type: NodeType.ConditionBranch,
      name: parent.name,
      branch: ConditionBranchType.Else,
      start: token.start,
      end: token.end,
      line: token.line,
      children: [],
      prefix: `\\else`,
      suffix: ``,
    } as AstNode;

    (parent as InnerNode).children.push(elseBranch);
    runtime.stack.push(elseBranch);
    return;
  }

  if (kind === 'fi') {
    let top = runtime.stack.peek() as any;
    if (!top || top.type !== NodeType.ConditionBranch) {
      throw new Error('Unexpected "fi" without an open condition');
    }
    top.end = token.end;
    runtime.stack.pop();

    top = runtime.stack.peek() as any;
    if (!top || top.type !== NodeType.Condition) {
      throw new Error('Unexpected "fi" without an open condition');
    }
    top.end = token.end;
    runtime.stack.pop();
    return;
  }

  throw new Error(`Unknown condition token: ${kind}`);
}

function handleComment(runtime: ParseRuntime, token: Token) {
  const parent = getParentNode(runtime) as InnerNode;
  parent.children.push({
    type: NodeType.Comment,
    start: token.start,
    end: token.end,
    line: token.line,
    name: token.name ?? '',
    value: token.text ?? '',
  });
}

function handleConditionDeclaration(runtime: ParseRuntime, token: Token) {
  const parent = getParentNode(runtime) as InnerNode;
  parent.children.push({
    type: NodeType.ConditionDeclaration,
    start: token.start,
    end: token.end,
    line: token.line,
    name: token.name ?? '',
    value: token.text ?? '',
  });
}
