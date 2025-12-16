import { CallStack } from './callstack.js';
import {
  AstNode,
  InnerNode,
  AstRoot,
  NodeType,
  ConditionBranchType,
  CommandNode,
  InputNode,
  type SectionNode,
} from './types.js';
import type { ParseOptions } from '../options.js';
import { Lexer, TokenType, type Token } from '../lexer/tokens.js';
import { sanityCheck } from './sanity.js';

interface ParseRuntime {
  input: string;
  root: AstRoot;
  stack: CallStack;
  inputFiles?: Set<string>;
}

function sliceTokenValue(input: string, start: number, end: number): string {
  if (end < start) return '';
  return input.slice(start, end + 1);
}

type TokenHandler = (runtime: ParseRuntime, token: Token) => void;

const HANDLERS: Map<TokenType, TokenHandler> = new Map([
  [TokenType.Text, handleText],
  [TokenType.Command, handleCommand],
  [TokenType.Section, handleSection],
  [TokenType.Brace, handleBrace],
  [TokenType.Bracket, handleBracket],
  [TokenType.Comment, handleComment],
  [TokenType.MathDelim, handleMathDelim],
  [TokenType.Environment, handleEnvironment],
  [TokenType.Input, handleInput],
  [TokenType.Condition, handleCondition],
  [TokenType.ConditionDeclaration, handleConditionDeclaration],
]);

export function parseToAst(
  input: string,
  options: ParseOptions,
  inputFiles?: Set<string>
): AstRoot {
  void options;
  const runtime = createRuntime(input, inputFiles);

  const sanity = sanityCheck(input);
  const lexer = new Lexer(input, sanity.lexerOptions);

  for (const token of lexer.stream()) {
    const handler = HANDLERS.get(token.type);
    if (!handler) {
      throw new Error(`No handler for token type: ${token.type}`);
    }
    handler(runtime, token);
  }

  // Keep finalization for inputs without a document environment.
  finalizeOpenSections(runtime);

  return runtime.root;
}

function closeSectionsLevel(runtime: ParseRuntime, level: number, end: number): void {
  let top = runtime.stack.peek();
  while (top && top.type === NodeType.Section && (top as any).level >= level) {
    const sec = runtime.stack.pop() as AstNode;
    sec.end = end;
    top = runtime.stack.peek();
  }
}

function finalizeOpenSections(runtime: ParseRuntime): void {
  const lastIndex = runtime.input.length - 1;
  closeSectionsLevel(runtime, 1, lastIndex);
}

function createRuntime(input: string, inputFiles?: Set<string>): ParseRuntime {
  const root: AstRoot = {
    type: NodeType.Root,
    start: 0,
    end: input.length - 1,
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
    inputFiles,
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
    value: sliceTokenValue(runtime.input, token.start, token.end),
  });
}

function handleSection(runtime: ParseRuntime, token: Token) {
  const name = token.name ?? '';
  const level = token.level;
  if (level === undefined) {
    throw new Error(`Missing section level for section ${name} at line ${token.line}`);
  }

  let parent = getParentNode(runtime) as AstNode;

  while (parent.type === NodeType.Section && (parent as any).level >= level) {
    const closed = runtime.stack.pop() as SectionNode | undefined;
    if (closed?.type === NodeType.Section) {
      closed.end = token.start - 1;
    }
    parent = getParentNode(runtime) as AstNode;
  }

  const sectionNode: SectionNode = {
    type: NodeType.Section,
    level: level as SectionNode['level'],
    name,
    start: token.start,
    // Sections are wrappers; default to spanning until EOF and get closed when a
    // same/higher-level section begins.
    end: token.end,
    line: token.line,
    children: [],
    prefix: runtime.input.slice(token.start, token.end + 1),
    suffix: '',
  };

  (parent as InnerNode).children.push(sectionNode);
  runtime.stack.push(sectionNode);
}

function handleCommand(runtime: ParseRuntime, token: Token) {
  const cmdNode = {
    type: NodeType.Command,
    start: token.start,
    end: token.end,
    line: token.line,
    name: token.name ?? '',
    value: runtime.input.slice(token.start, token.end + 1),
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
    // Special: treat \begin{document} as a top-level Section wrapper with highest level (0)
    if (name === 'document') {
      const docSection: SectionNode = {
        type: NodeType.Section,
        level: 0,
        name: 'document',
        start: token.start,
        end: token.end,
        line: token.line,
        children: [],
        prefix: runtime.input.slice(token.start, token.end + 1),
        suffix: '',
      };
      parent.children.push(docSection);
      runtime.stack.push(docSection as unknown as AstNode);
      return;
    }
    const envNode = {
      type: NodeType.Environment,
      name,
      start: token.start,
      end: token.end,
      line: token.line,
      children: [],
      prefix: runtime.input.slice(token.start, token.end + 1),
      suffix: `\\end{${name}}`,
    } as AstNode;
    parent.children.push(envNode);
    runtime.stack.push(envNode);
    return;
  }

  const envNode = runtime.stack.peek() as AstNode | undefined;
  if (!envNode) {
    throw new Error(
      `${token.line}: Unexpected "end" without a matching "begin" environment. Empty stack.`
    );
  }
  if (name === 'document') {
    closeSectionsLevel(runtime, 1, token.start - 1);
    const top = runtime.stack.peek() as AstNode | undefined;
    if (!top) {
      throw new Error(
        `${token.line}: Unexpected "end{document}": missing document environment. Empty stack.`
      );
    }
    if (top.type !== NodeType.Section || (top as any).name !== 'document') {
      throw new Error(
        `${token.line}: Unexpected "end{document}": missing document environment. Found: ${top} at line ${top.line}.`
      );
    }
    top.end = token.end;
    top.suffix = runtime.input.slice(token.start, token.end + 1);
    runtime.stack.pop();
    return;
  }
  if (envNode.type !== NodeType.Environment) {
    throw new Error(
      `${token.line}: Unexpected "end" without a matching "begin" environment. Found ${envNode.type} at line ${envNode.line}.`
    );
  }
  envNode.end = token.end;
  (envNode as InnerNode).suffix = runtime.input.slice(token.start, token.end + 1);
  runtime.stack.pop();
}

function handleInput(runtime: ParseRuntime, token: Token) {
  const parent = getParentNode(runtime) as InnerNode;
  const path = token.path ?? '';
  const raw = sliceTokenValue(runtime.input, token.start, token.end);

  const inputNode: InputNode = {
    type: NodeType.Input,
    start: token.start,
    end: token.end,
    line: token.line,
    path,
    value: raw,
  };

  parent.children.push(inputNode);
  if (path && runtime.inputFiles) {
    runtime.inputFiles.add(path);
  }
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
    top.end = token.end;
    top.suffix = runtime.input.slice(token.start, token.end + 1);
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
    prefix: runtime.input.slice(token.start, token.end + 1),
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
    const name = token.condition ?? '';
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
      suffix: ``,
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
      prefix: runtime.input.slice(token.start, token.end + 1),
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
      prefix: runtime.input.slice(token.start, token.end + 1),
      suffix: ``,
    } as AstNode;

    (parent as InnerNode).children.push(elseBranch);
    runtime.stack.push(elseBranch);
    return;
  }

  if (kind === 'fi') {
    let top = runtime.stack.peek() as any;
    if (!top || top.type !== NodeType.ConditionBranch) {
      throw new Error(`${token.line}: Unexpected "fi" without an open condition. Found: ${top}.`);
    }
    top.end = token.end;
    runtime.stack.pop();

    top = runtime.stack.peek() as any;
    if (!top || top.type !== NodeType.Condition) {
      throw new Error(`${token.line}: Unexpected "fi": missing parent environment. Found: ${top}.`);
    }
    top.end = token.end;
    (top as InnerNode).suffix = runtime.input.slice(token.start, token.end + 1);
    runtime.stack.pop();
    return;
  }

  throw new Error(`Unknown condition token: ${kind} at line ${token.line}`);
}

function handleComment(runtime: ParseRuntime, token: Token) {
  const parent = getParentNode(runtime) as InnerNode;
  parent.children.push({
    type: NodeType.Comment,
    start: token.start,
    end: token.end,
    line: token.line,
    name: token.name ?? '',
    value: sliceTokenValue(runtime.input, token.start, token.end),
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
    value: sliceTokenValue(runtime.input, token.start, token.end),
  });
}
