import { Lexer, TokenType, getAllTokenTypes, type LexerOptions } from '../lexer/tokens.js';
import { CallStack } from './callstack.js';
import { NodeType, type AstNode } from './types.js';
import { SECTION_LEVELS } from './constants.js';
import { DiagnosticCode, type WarningDiagnosticCode } from '../../api-types.js';
import type { ParseNotice } from './notices.js';

// Context kinds tracked on the stack: reuse NodeType subset

// Notes/messages
const NOTE_EMPTY_STACK = 'Closing group encountered with empty stack';
const NOTE_NO_MATCHING_IF = 'Fi encountered with no matching If';
const NOTE_SECTION_IN_IF = 'Section command encountered inside conditional';
const NOTE_MATH_IN_IF = 'Disabled MathDelim due to math inside conditional context';
const NOTE_IF_IN_MATH = 'Disabled MathDelim due to conditional inside math context';
const NOTE_IF_INTERSECTS_MATH = 'Disabled MathDelim due to conditional intersecting math context';
const NOTE_MATH_INTERSECTS_IF = 'Disabled MathDelim due to math intersecting conditional context';
const NOTE_MIXED_MATH_DELIMITERS =
  'Disabled MathDelim because nested or mismatched math delimiters cannot be represented safely';
const NOTE_NO_MATCHING_OPENER = 'Closing group encountered with no matching opener';

const SECTION_COMMAND_BY_LEVEL: ReadonlyMap<number, string> = new Map(
  Object.entries(SECTION_LEVELS).map(([cmd, lvl]) => [lvl, cmd])
);

function formatSectionInConditionalNote(
  token: { name?: unknown },
  lvl: number,
  effectiveSectionMaxLevel: number | undefined
): string {
  const cmd = SECTION_COMMAND_BY_LEVEL.get(lvl);
  const cmdText = cmd ? `\\${cmd}` : 'a section command';
  const titleText =
    typeof token.name === 'string' && token.name.length > 0 ? `{${token.name}}` : '';
  const effectiveText =
    effectiveSectionMaxLevel == null ? 'unset' : String(effectiveSectionMaxLevel);

  return (
    `${NOTE_SECTION_IN_IF}: saw ${cmdText}${titleText} (TokenType.Section, level=${lvl}). ` +
    `From section level ${lvl} onward, section commands are tokenized as TokenType.Command ` +
    `(effective sectionMaxLevel=${effectiveText}).`
  );
}

function formatSectionInConditionalUnknownLevelNote(): string {
  return (
    `${NOTE_SECTION_IN_IF}: saw a section TokenType.Section with unknown level. ` +
    `From this level onward, section commands will be tokenized as TokenType.Command.`
  );
}

export interface SanityResult {
  lexerOptions: LexerOptions;
  notes: string[];
  notices: ParseNotice[];
  intersectingPairs?: Array<{
    openCtx: NodeType;
    closeCtx: NodeType;
    openPos: number;
    closePos: number;
    openLine: number;
    closeLine: number;
  }>;
  openedUnclosedGroupings?: Array<{
    ctx: NodeType;
    pos: number;
    line: number;
  }>;
  unopenedClosings?: Array<{
    ctx: NodeType;
    closePos: number;
    line: number;
  }>;
}

// Heuristic sanity check: detect intertwining of environments/sections/conditionals/math
// and decide which token categories to suppress at lex time.
export function sanityCheck(input: string, lexerOptions: LexerOptions = {}): SanityResult {
  const lex = new Lexer(input, lexerOptions);
  const tokens = Array.from(lex.stream());

  let nextId = 1;

  const notes: string[] = [];
  const notices: ParseNotice[] = [];
  const addNote = (code: WarningDiagnosticCode, message: string, token: any) => {
    const line = typeof token.line === 'number' ? token.line : 1;
    notes.push(`${message} Line: ${line}`);
    notices.push({
      code,
      message,
      start: typeof token.start === 'number' ? token.start : 0,
      end: typeof token.end === 'number' ? token.end : 0,
      line,
    });
  };
  const enabled = new Set(lexerOptions.enabledTokens ?? getAllTokenTypes());
  let sectionMaxLevel = lexerOptions.sectionMaxLevel;
  // Use CallStack to track grouping contexts
  const stack = new CallStack(undefined);
  type Ctx = NodeType;

  const isInCtx = (ctx: Ctx): boolean => {
    const tmp: AstNode[] = [];
    let found = false;
    while (stack.size() > 0) {
      const n = stack.pop();
      if (n) {
        tmp.push(n);
        if ((n as any).ctx === ctx) {
          found = true;
          break;
        }
      }
    }
    for (let i = tmp.length - 1; i >= 0; i--) stack.push(tmp[i]!);
    return found;
  };

  // Handlers map similar to parser
  const handlers: Map<TokenType, (t: any) => void> = new Map();
  const intersectingPairs: Array<{
    openCtx: NodeType;
    closeCtx: NodeType;
    openPos: number;
    closePos: number;
    openLine: number;
    closeLine: number;
  }> = [];
  const unopenedClosings: Array<{
    ctx: NodeType;
    closePos: number;
    line: number;
  }> = [];

  // SECTION_COMMANDS centralized in constants.ts

  // Conditions handler (unified Condition tokens)
  const handleCondition = (t: any) => {
    const name = t.name as string;
    if (name === 'else') return; // no nesting change
    if (name === 'fi') {
      // Close latest If
      // Intersect check against current top
      if (stack.size() > 0) {
        const top = stack.pop();
        if (top) stack.push(top);
        const topCtx = (top as any)?.ctx as Ctx | undefined;
        if (topCtx && topCtx !== NodeType.Condition) {
          intersectingPairs.push({
            openCtx: topCtx,
            closeCtx: NodeType.Condition,
            openPos: (top as any).start,
            closePos: t.start,
            openLine: (top as any).line ?? 1,
            closeLine: t.line ?? 1,
          });
          if (topCtx === NodeType.Math && enabled.has(TokenType.MathDelim)) {
            enabled.delete(TokenType.MathDelim);
            addNote(DiagnosticCode.TokenizationAdjusted, NOTE_IF_INTERSECTS_MATH, t);
          }
        }
      }
      // Closing If handled via stack pop; unopened closings tracked generically in grouping handler
      let closedIf = false;
      while (stack.size() > 0) {
        const n = stack.pop();
        if ((n as any)?.ctx === NodeType.Condition) {
          closedIf = true;
          break;
        }
      }
      if (!closedIf) addNote(DiagnosticCode.UnmatchedClosing, NOTE_NO_MATCHING_IF, t);
      return;
    }
    // Opening if*
    stack.push({
      type: NodeType.Condition,
      id: nextId++,
      start: t.start,
      end: t.end,
      line: t.line ?? 1,
      condition: t.condition ?? 'if',
      thenBranch: [],
      elseBranch: [],
      ctx: NodeType.Condition,
    } as unknown as AstNode);
    if (isInCtx(NodeType.Math) && enabled.has(TokenType.MathDelim)) {
      enabled.delete(TokenType.MathDelim);
      addNote(DiagnosticCode.TokenizationAdjusted, NOTE_IF_IN_MATH, t);
    }
  };

  // Sections handler (via Command tokens)
  const handleSection = (t: any) => {
    if (isInCtx(NodeType.Condition)) {
      const lvl = Number(t.level ?? NaN);
      if (Number.isFinite(lvl)) {
        // Disable this section level and deeper globally for the second lex pass.
        // Example: seeing \subsection (2) inside an if allows \section (1) but suppresses >=2.
        const newMax = Math.max(0, lvl - 1);
        sectionMaxLevel = sectionMaxLevel == null ? newMax : Math.min(sectionMaxLevel, newMax);

        addNote(
          DiagnosticCode.SectionReclassified,
          formatSectionInConditionalNote(t, lvl, sectionMaxLevel),
          t
        );
      } else {
        addNote(
          DiagnosticCode.SectionReclassified,
          formatSectionInConditionalUnknownLevelNote(),
          t
        );
      }
    }
  };

  const is_group_opening = (t: any): boolean => {
    if (t.type === TokenType.Brace) return t.name === '{';
    if (t.type === TokenType.Environment) return !!t.isBegin;
    if (t.type === TokenType.MathDelim) {
      // Backslash pairs: explicit open/close, no stack lookups
      if (t.name === '\\(' || t.name === '\\[') return true;
      if (t.name === '\\)' || t.name === '\\]') return false;
      return true;
    }
    throw new Error('Not a grouping token');
  };

  const findActiveMath = (): AstNode | undefined => {
    const temporary: AstNode[] = [];
    let active: AstNode | undefined;
    while (stack.size() > 0) {
      const node = stack.pop();
      if (!node) break;
      temporary.push(node);
      if ((node as any).ctx === NodeType.Math) {
        active = node;
        break;
      }
    }
    for (let index = temporary.length - 1; index >= 0; index--) {
      stack.push(temporary[index]!);
    }
    return active;
  };

  const dropActiveMath = (): void => {
    const retained: AstNode[] = [];
    while (stack.size() > 0) {
      const node = stack.pop();
      if (!node) break;
      if ((node as any).ctx !== NodeType.Math) retained.push(node);
    }
    for (let index = retained.length - 1; index >= 0; index--) {
      stack.push(retained[index]!);
    }
  };

  let ignoreMathTokens = false;
  const classifyMathOpening = (t: any): boolean | undefined => {
    if (ignoreMathTokens) return undefined;
    const delimiter = t.name as string;
    const active = findActiveMath();
    const activeDelimiter = active ? ((active as any).delim as string | undefined) : undefined;
    const expectedOpening = delimiter === '\\)' ? '\\(' : delimiter === '\\]' ? '\\[' : undefined;
    const explicitlyOpens = delimiter === '\\(' || delimiter === '\\[';

    let opening: boolean;
    let mismatch = false;
    if (explicitlyOpens) {
      opening = true;
      mismatch = active !== undefined;
    } else if (expectedOpening !== undefined) {
      opening = false;
      mismatch = active !== undefined && activeDelimiter !== expectedOpening;
    } else {
      opening = activeDelimiter !== delimiter;
      mismatch = active !== undefined && activeDelimiter !== delimiter;
    }

    if (!mismatch) return opening;
    ignoreMathTokens = true;
    if (enabled.has(TokenType.MathDelim)) {
      enabled.delete(TokenType.MathDelim);
      addNote(DiagnosticCode.TokenizationAdjusted, NOTE_MIXED_MATH_DELIMITERS, t);
    }
    dropActiveMath();
    return undefined;
  };

  const get_group_ctx = (t: any): Ctx | null => {
    if (t.type === TokenType.Environment) return NodeType.Environment;
    if (t.type === TokenType.MathDelim) return NodeType.Math;
    if (t.type === TokenType.Brace) return NodeType.Group;
    return null;
  };

  // Grouping handler: environments, math, groups
  const handleGrouping = (t: any) => {
    const mathOpening = t.type === TokenType.MathDelim ? classifyMathOpening(t) : undefined;
    if (t.type === TokenType.MathDelim && mathOpening === undefined) return;
    const isOpening = mathOpening ?? is_group_opening(t);
    const ctx = get_group_ctx(t);
    if (!ctx) return;

    if (isOpening) {
      if (ctx === NodeType.Environment) {
        const name = t.name as string;
        stack.push({
          type: NodeType.Environment,
          id: nextId++,
          start: t.start,
          end: t.end,
          line: t.line ?? 1,
          name,
          children: [],
          ctx: NodeType.Environment,
        } as unknown as AstNode);
      } else if (ctx === NodeType.Math) {
        stack.push({
          type: NodeType.Math,
          id: nextId++,
          start: t.start,
          end: t.end,
          line: t.line ?? 1,
          delim: t.name,
          children: [],
          ctx: NodeType.Math,
        } as unknown as AstNode);
        if (isInCtx(NodeType.Condition) && enabled.has(TokenType.MathDelim)) {
          enabled.delete(TokenType.MathDelim);
          addNote(DiagnosticCode.TokenizationAdjusted, NOTE_MATH_IN_IF, t);
        }
      } else if (ctx === NodeType.Group) {
        stack.push({
          type: NodeType.Group,
          id: nextId++,
          start: t.start,
          end: t.end,
          line: t.line ?? 1,
          children: [],
          ctx: NodeType.Group,
        } as unknown as AstNode);
      }
      return;
    }

    // Closing logic: if the last opened (top of stack) is not the same type,
    // record intersecting pair, then still remove the matching opening from the stack
    if (stack.size() === 0) {
      addNote(DiagnosticCode.UnmatchedClosing, NOTE_EMPTY_STACK, t);
      // Record as unopened closing
      unopenedClosings.push({ ctx, closePos: t.start, line: t.line ?? 1 });
      return;
    }

    // Peek top
    const top = stack.pop();
    if (!top) return;
    stack.push(top);
    const topCtx = (top as any).ctx as Ctx | undefined;
    if (topCtx && topCtx !== ctx) {
      intersectingPairs.push({
        openCtx: topCtx,
        closeCtx: ctx,
        openPos: (top as any).start,
        closePos: t.start,
        openLine: (top as any).line ?? 1,
        closeLine: t.line ?? 1,
      });
      if (
        (topCtx === NodeType.Math && ctx === NodeType.Condition) ||
        (topCtx === NodeType.Condition && ctx === NodeType.Math)
      ) {
        if (enabled.has(TokenType.MathDelim)) {
          enabled.delete(TokenType.MathDelim);
          addNote(DiagnosticCode.TokenizationAdjusted, NOTE_MATH_INTERSECTS_IF, t);
        }
      }
    }

    // Remove matching opening from stack, keep contradicted envs in between
    const temp: AstNode[] = [];
    let removed = false;
    while (stack.size() > 0) {
      const n = stack.pop();
      if (!n) break;
      if ((n as any).ctx === ctx) {
        removed = true;
        break;
      }
      temp.push(n);
    }
    if (!removed) addNote(DiagnosticCode.UnmatchedClosing, NOTE_NO_MATCHING_OPENER, t);
    // Push back the non-matching contexts (keep them)
    for (let i = temp.length - 1; i >= 0; i--) stack.push(temp[i]!);
  };
  const handleAtom = () => {
    // No stack effects; atom-level tokens do not affect sanity state
    return;
  };

  // Register handlers
  handlers.set(TokenType.Condition, handleCondition);
  handlers.set(TokenType.Section, (t) => handleSection(t));
  handlers.set(TokenType.Environment, handleGrouping);
  handlers.set(TokenType.MathDelim, handleGrouping);
  handlers.set(TokenType.Brace, handleGrouping);
  handlers.set(TokenType.Text, handleAtom);
  handlers.set(TokenType.NewLine, handleAtom);
  handlers.set(TokenType.Comment, handleAtom);
  handlers.set(TokenType.ConditionDeclaration, handleAtom);
  handlers.set(TokenType.Input, handleAtom);

  for (const t of tokens) {
    const h = handlers.get(t.type) || handleAtom;
    h(t);
  }
  // Anything left on the stack is an opened-but-unclosed grouping
  const openedUnclosedGroupings: Array<{
    ctx: NodeType;
    pos: number;
    line: number;
  }> = [];
  const tmpFinal: AstNode[] = [];
  while (stack.size() > 0) {
    const n = stack.pop();
    if (!n) break;
    tmpFinal.push(n);
    const c = (n as any).ctx as Ctx | undefined;
    if (c)
      openedUnclosedGroupings.push({ ctx: c, pos: (n as any).start, line: (n as any).line ?? 1 });
  }
  // restore (not strictly necessary at end)
  for (let i = tmpFinal.length - 1; i >= 0; i--) stack.push(tmpFinal[i]!);

  return {
    lexerOptions: {
      enabledTokens: enabled,
      ...(sectionMaxLevel === undefined ? {} : { sectionMaxLevel }),
    },
    notes,
    notices,
    intersectingPairs,
    openedUnclosedGroupings,
    unopenedClosings,
  };
}
