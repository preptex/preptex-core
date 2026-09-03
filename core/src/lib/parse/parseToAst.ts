import { CallStack } from './callstack.js';
import {
  NodeType,
  ConditionBranchKind,
  CommentKind,
  type AstNode,
  type InnerNode,
  type AstRoot,
  type CommandNode,
  type InputNode,
  type SectionNode,
} from './types.js';
import type { LineEnding, MathDelimiter } from '../../api-types.js';
import { DiagnosticCode } from '../../api-types.js';
import type { ParseNotice } from './notices.js';
import { ParseFailure } from './failure.js';
import { SECTION_LEVELS } from './constants.js';
import type { ParseOptions } from '../options.js';
import { Lexer, TokenType, type Token } from '../lexer/tokens.js';

const SECTION_COMMAND_BY_LEVEL: ReadonlyMap<number, string> = new Map(
  Object.entries(SECTION_LEVELS).map(([cmd, lvl]) => [lvl, cmd])
);

interface ParseRuntime {
  input: string;
  root: AstRoot;
  stack: CallStack;
  inputFiles?: Set<string>;
  notes?: string[];
  notices?: ParseNotice[];
  nextId: number;
}

function allocId(runtime: ParseRuntime): number {
  return runtime.nextId++;
}

function addNote(runtime: ParseRuntime, message: string, token: Token): void {
  runtime.notes?.push(`${message} Line: ${token.line}`);
  runtime.notices?.push({
    code: DiagnosticCode.SectionReclassified,
    message,
    start: token.start,
    end: token.end,
    line: token.line,
  });
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
  [TokenType.Comment, handleComment],
  [TokenType.NewLine, handleNewLine],
  [TokenType.MathDelim, handleMathDelim],
  [TokenType.Environment, handleEnvironment],
  [TokenType.Input, handleInput],
  [TokenType.Condition, handleCondition],
  [TokenType.ConditionDeclaration, handleConditionDeclaration],
]);

export function parseToAst(
  lexer: Lexer,
  input: string,
  options: ParseOptions,
  inputFiles?: Set<string>,
  notes?: string[],
  notices?: ParseNotice[]
): AstRoot {
  void options;
  const runtime = createRuntime(input, inputFiles, notes, notices);

  for (const token of lexer.stream()) {
    const handler = HANDLERS.get(token.type);
    if (!handler) {
      throw new Error(`No handler for token type: ${token.type}`);
    }
    handler(runtime, token);
  }

  finalizeParse(runtime);

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

function finalizeParse(runtime: ParseRuntime): void {
  const lastIndex = runtime.input.length - 1;
  closeSectionsLevel(runtime, 1, lastIndex);

  const top = runtime.stack.peek();
  const stackSize = runtime.stack.size();
  if (stackSize === 1 && top === runtime.root) return;

  if (!top || top === runtime.root || stackSize === 1) {
    const topType = top?.type ?? 'empty stack';
    throw new Error(
      `Parser invariant violated: expected one root after finalization; found ${stackSize} stack entries with ${topType} on top.`
    );
  }

  throw new ParseFailure(`Unclosed ${top.type} construct opened on line ${top.line}.`, {
    position: top.start,
    line: top.line,
  });
}

function createRuntime(
  input: string,
  inputFiles?: Set<string>,
  notes?: string[],
  notices?: ParseNotice[]
): ParseRuntime {
  const root: AstRoot = {
    type: NodeType.Root,
    id: 0,
    start: 0,
    end: input.length - 1,
    line: 1,
    children: [],
    prefix: '',
    suffix: '',
  };
  const stack = new CallStack(root);
  return {
    input,
    root,
    stack,
    ...(inputFiles === undefined ? {} : { inputFiles }),
    ...(notes === undefined ? {} : { notes }),
    ...(notices === undefined ? {} : { notices }),
    nextId: 1,
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
    id: allocId(runtime),
    start: token.start,
    end: token.end,
    line: token.line,
    value: sliceTokenValue(runtime.input, token.start, token.end),
  });
}

function handleNewLine(runtime: ParseRuntime, token: Token) {
  const parent = getParentNode(runtime) as InnerNode;
  parent.children.push({
    type: NodeType.NewLine,
    id: allocId(runtime),
    start: token.start,
    end: token.end,
    line: token.line,
    value: sliceTokenValue(runtime.input, token.start, token.end) as LineEnding,
    originalLineIsWhitespaceOnly: isOriginalLineWhitespaceOnly(runtime.input, token.start),
  });
}

function isOriginalLineWhitespaceOnly(input: string, lineEnd: number): boolean {
  let lineStart = lineEnd;
  while (lineStart > 0) {
    const prev = input[lineStart - 1];
    if (prev === '\n' || prev === '\r') break;
    lineStart--;
  }

  for (let i = lineStart; i < lineEnd; i++) {
    if (!/[\s]/.test(input.charAt(i))) return false;
  }
  return true;
}

function handleSection(runtime: ParseRuntime, token: Token) {
  const name = token.name ?? '';
  const level = token.level;
  if (level === undefined) {
    throw new Error(`Missing section level for section ${name} at line ${token.line}`);
  }

  let parent = getParentNode(runtime) as AstNode;

  // Sections are wrappers; they must not appear inside open groupings like environments,
  // math blocks, or brace-groups because those closers assume they are on top of the stack.
  // If they do appear there, treat the whole token span as a normal command node.
  if (parent.type !== NodeType.Section && parent.type !== NodeType.Root) {
    const cmdName = SECTION_COMMAND_BY_LEVEL.get(level) ?? 'section';
    addNote(runtime, `Section command parsed as command inside ${parent.type}`, token);
    const cmdNode = {
      type: NodeType.Command,
      id: allocId(runtime),
      start: token.start,
      end: token.end,
      line: token.line,
      name: cmdName,
      starred: Boolean(token.is_starred),
      value: runtime.input.slice(token.start, token.end + 1),
    } as CommandNode;
    (parent as InnerNode).children.push(cmdNode);
    return;
  }

  while (parent.type === NodeType.Section && (parent as any).level >= level) {
    const closed = runtime.stack.pop() as SectionNode | undefined;
    if (closed?.type === NodeType.Section) {
      closed.end = token.start - 1;
    }
    parent = getParentNode(runtime) as AstNode;
  }

  const sectionNode: SectionNode = {
    type: NodeType.Section,
    id: allocId(runtime),
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
    starred: Boolean(token.is_starred),
  };

  (parent as InnerNode).children.push(sectionNode);
  runtime.stack.push(sectionNode);
}

function handleCommand(runtime: ParseRuntime, token: Token) {
  const cmdNode = {
    type: NodeType.Command,
    id: allocId(runtime),
    start: token.start,
    end: token.end,
    line: token.line,
    name: token.name ?? '',
    starred: Boolean(token.is_starred),
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
      id: allocId(runtime),
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

  const top = runtime.stack.peek() as AstNode | undefined;
  if (!top) {
    throw new Error('Parser invariant violated: the root node is missing while closing a group.');
  }
  if (top.type !== NodeType.Group) {
    throw new ParseFailure(
      `${token.line}: Unexpected "}" without a matching "{". Found ${top.type} at line ${top.line}.`,
      { position: token.start, line: token.line }
    );
  }
  top.end = token.end;
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
        id: allocId(runtime),
        level: 0,
        name: 'document',
        start: token.start,
        end: token.end,
        line: token.line,
        children: [],
        prefix: runtime.input.slice(token.start, token.end + 1),
        suffix: '',
        starred: false,
      };
      parent.children.push(docSection);
      runtime.stack.push(docSection as unknown as AstNode);
      return;
    }
    const envNode = {
      type: NodeType.Environment,
      id: allocId(runtime),
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
    handleText(runtime, token);
    return;
  }
  if (name === 'document') {
    closeSectionsLevel(runtime, 1, token.start - 1);
    const top = runtime.stack.peek() as AstNode | undefined;
    if (!top) {
      handleText(runtime, token);
      return;
    }
    if (top.type !== NodeType.Section || (top as any).name !== 'document') {
      handleText(runtime, token);
      return;
    }
    top.end = token.end;
    top.suffix = runtime.input.slice(token.start, token.end + 1);
    runtime.stack.pop();
    return;
  }
  if (envNode.type !== NodeType.Environment) {
    handleText(runtime, token);
    return;
  }
  if ((envNode as any).name !== name) {
    handleText(runtime, token);
    return;
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
    id: allocId(runtime),
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

function handleMathDelim(runtime: ParseRuntime, token: Token) {
  const delimiter = token.name ?? '';
  const top = runtime.stack.peek() as any;
  if (!top) {
    throw new Error('Stack empty');
  }
  const isDollar = delimiter === '$' || delimiter === '$$';
  const isParenClose = delimiter === '\\]' || delimiter === '\\)';

  if (isParenClose) {
    const expectedOpen: MathDelimiter = delimiter === '\\)' ? '\\(' : '\\[';
    if (top.type !== NodeType.Math || top.delimiter !== expectedOpen) {
      throw new ParseFailure(
        `${token.line}: Unexpected math closer "${delimiter}" without matching opener "${expectedOpen}". Found ${top.type} at line ${top.line}.`,
        { position: token.start, line: token.line }
      );
    }
    top.end = token.end;
    top.suffix = runtime.input.slice(token.start, token.end + 1);
    runtime.stack.pop();
    return;
  }

  if (isDollar && top.type === NodeType.Math && top.delimiter === delimiter) {
    top.end = token.end;
    top.suffix = runtime.input.slice(token.start, token.end + 1);
    runtime.stack.pop();
    return;
  }

  const parent = getParentNode(runtime) as InnerNode;
  const mathNode = {
    type: NodeType.Math,
    id: allocId(runtime),
    delimiter: delimiter as MathDelimiter,
    start: token.start,
    end: token.end,
    line: token.line,
    children: [],
    prefix: runtime.input.slice(token.start, token.end + 1),
    suffix:
      delimiter === '$' || delimiter === '$$'
        ? delimiter
        : delimiter === '\\['
          ? '\\]'
          : delimiter === '\\('
            ? '\\)'
            : delimiter,
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
      throw new ParseFailure(`Condition name missing in ${kind} at line ${token.line}`, {
        position: token.start,
        line: token.line,
      });
    }

    const conditionNode = {
      type: NodeType.Condition,
      id: allocId(runtime),
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
      id: allocId(runtime),
      name,
      branch: ConditionBranchKind.If,
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
    if (!top || top.type !== NodeType.ConditionBranch || top.branch !== ConditionBranchKind.If) {
      throw new ParseFailure(`Unexpected "else" without an open IF branch at line ${token.line}`, {
        position: token.start,
        line: token.line,
      });
    }
    top.end = token.start - 1;
    runtime.stack.pop();

    const parent = runtime.stack.peek() as any;
    if (!parent || parent.type !== NodeType.Condition) {
      throw new Error('Unexpected stack state at else');
    }

    const elseBranch = {
      type: NodeType.ConditionBranch,
      id: allocId(runtime),
      name: parent.name,
      branch: ConditionBranchKind.Else,
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
      throw new ParseFailure(
        `${token.line}: Unexpected "fi" without an open condition. Found: ${String(top)}.`,
        { position: token.start, line: token.line }
      );
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
    id: allocId(runtime),
    start: token.start,
    end: token.end,
    line: token.line,
    kind: token.name === 'env-comment' ? CommentKind.Environment : CommentKind.Line,
    value: sliceTokenValue(runtime.input, token.start, token.end),
  });
}

function handleConditionDeclaration(runtime: ParseRuntime, token: Token) {
  const parent = getParentNode(runtime) as InnerNode;
  parent.children.push({
    type: NodeType.ConditionDeclaration,
    id: allocId(runtime),
    start: token.start,
    end: token.end,
    line: token.line,
    name: token.name ?? '',
    value: sliceTokenValue(runtime.input, token.start, token.end),
  });
}
