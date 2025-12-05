import { Lexer, TokenType, LexerOptions, getAllTokenTypes } from './tokens';
import { CallStack } from './callstack';
import { NodeType, type AstNode } from './types';
import { SECTION_COMMANDS } from './constants';

// Context kinds tracked on the stack: reuse NodeType subset

// Notes/messages
const NOTE_EMPTY_STACK = 'Closing group encountered with empty stack';
const NOTE_NO_MATCHING_IF = 'Fi encountered with no matching If';
const NOTE_SECTION_IN_IF = 'Section command encountered inside conditional';
const NOTE_MATH_IN_IF = 'Disabled MathDelim due to math inside conditional context';
const NOTE_IF_IN_MATH = 'Disabled MathDelim due to conditional inside math context';
const NOTE_IF_INTERSECTS_MATH = 'Disabled MathDelim due to conditional intersecting math context';
const NOTE_MATH_INTERSECTS_IF = 'Disabled MathDelim due to math intersecting conditional context';
const NOTE_NO_MATCHING_OPENER = 'Closing group encountered with no matching opener';

export interface SanityResult {
  lexerOptions: LexerOptions;
  notes: string[];
  intersectingPairs?: Array<{
    openCtx: NodeType;
    closeCtx: NodeType;
    openPos: number;
    closePos: number;
  }>;
  openedUnclosedGroupings?: Array<{
    ctx: NodeType;
    pos: number;
  }>;
  unopenedClosings?: Array<{
    ctx: NodeType;
    closePos: number;
  }>;
}

// Heuristic sanity check: detect intertwining of environments/sections/conditionals/math
// and decide which token categories to suppress at lex time.
export function sanityCheck(input: string): SanityResult {
  const lex = new Lexer(input);
  const tokens = Array.from(lex.stream());

  const notes: string[] = [];
  const enabled = new Set(getAllTokenTypes());

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
    for (let i = tmp.length - 1; i >= 0; i--) stack.push(tmp[i]);
    return found;
  };

  // Handlers map similar to parser
  const handlers: Map<TokenType, (t: any) => void> = new Map();
  const intersectingPairs: Array<{
    openCtx: NodeType;
    closeCtx: NodeType;
    openPos: number;
    closePos: number;
  }> = [];
  const unopenedClosings: Array<{
    ctx: NodeType;
    closePos: number;
  }> = [];

  // SECTION_COMMANDS centralized in constants.ts

  // Conditions handler (unified Condition tokens)
  const handleCondition = (t: any) => {
    const v = t.value as string;
    if (v === 'else') return; // no nesting change
    if (v === 'fi') {
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
          });
          if (topCtx === NodeType.Math && enabled.has(TokenType.MathDelim)) {
            enabled.delete(TokenType.MathDelim);
            notes.push(NOTE_IF_INTERSECTS_MATH);
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
      if (!closedIf) notes.push(NOTE_NO_MATCHING_IF);
      return;
    }
    // Opening if*
    stack.push({
      type: NodeType.Condition,
      start: t.start,
      end: t.end,
      condition: v,
      thenBranch: [],
      elseBranch: [],
      ctx: NodeType.Condition,
    } as unknown as AstNode);
    if (isInCtx(NodeType.Math) && enabled.has(TokenType.MathDelim)) {
      enabled.delete(TokenType.MathDelim);
      notes.push(NOTE_IF_IN_MATH);
    }
  };

  // Sections handler (via Command tokens)
  const handleSection = (t: any) => {
    const name = t.value as string;
    if (!SECTION_COMMANDS.has(name)) return;
    // Section inside conditional is contradictory parenting
    if (isInCtx(NodeType.Condition)) notes.push(NOTE_SECTION_IN_IF);
  };

  const is_group_opening = (t: any): boolean => {
    if (t.type === TokenType.Brace) return t.value === '{';
    if (t.type === TokenType.Environment) return t.value === 'begin';
    if (t.type === TokenType.MathDelim) {
      // Backslash pairs: explicit open/close, no stack lookups
      if (t.value === '\\(' || t.value === '\\[') return true;
      if (t.value === '\\)' || t.value === '\\]') return false;
      // Dollar delimiters: opening if there is no Math with the same delim on stack; else closing.
      const tmp: AstNode[] = [];
      let hasSameDelim = false;
      while (stack.size() > 0) {
        const n = stack.pop();
        if (!n) break;
        tmp.push(n);
        if ((n as any).ctx === 'Math' && (n as any).delim === t.value) {
          hasSameDelim = true;
          break;
        }
      }
      for (let i = tmp.length - 1; i >= 0; i--) stack.push(tmp[i]);
      return !hasSameDelim;
    }
    throw new Error('Not a grouping token');
  };

  const get_group_ctx = (t: any): Ctx | null => {
    if (t.type === TokenType.Environment) return NodeType.Environment;
    if (t.type === TokenType.MathDelim) return NodeType.Math;
    if (t.type === TokenType.Brace) return NodeType.Group;
    return null;
  };

  // Grouping handler: environments, math, groups
  const handleGrouping = (t: any) => {
    const isOpening = is_group_opening(t);
    const ctx = get_group_ctx(t);
    if (!ctx) return;

    if (isOpening) {
      if (ctx === NodeType.Environment) {
        const name = t.name as string;
        stack.push({
          type: NodeType.Environment,
          start: t.start,
          end: t.end,
          name,
          children: [],
          ctx: NodeType.Environment,
        } as unknown as AstNode);
      } else if (ctx === NodeType.Math) {
        stack.push({
          type: NodeType.Math,
          start: t.start,
          end: t.end,
          delim: t.value,
          children: [],
          ctx: NodeType.Math,
        } as unknown as AstNode);
        if (isInCtx(NodeType.Condition) && enabled.has(TokenType.MathDelim)) {
          enabled.delete(TokenType.MathDelim);
          notes.push(NOTE_MATH_IN_IF);
        }
      } else if (ctx === NodeType.Group) {
        stack.push({
          type: NodeType.Group,
          start: t.start,
          end: t.end,
          children: [],
          ctx: NodeType.Group,
        } as unknown as AstNode);
      }
      return;
    }

    // Closing logic: if the last opened (top of stack) is not the same type,
    // record intersecting pair, then still remove the matching opening from the stack
    if (stack.size() === 0) {
      notes.push(NOTE_EMPTY_STACK);
      // Record as unopened closing
      unopenedClosings.push({ ctx, closePos: t.start });
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
      });
      if (
        (topCtx === NodeType.Math && ctx === NodeType.Condition) ||
        (topCtx === NodeType.Condition && ctx === NodeType.Math)
      ) {
        if (enabled.has(TokenType.MathDelim)) {
          enabled.delete(TokenType.MathDelim);
          notes.push(NOTE_MATH_INTERSECTS_IF);
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
    if (!removed) notes.push(NOTE_NO_MATCHING_OPENER);
    // Push back the non-matching contexts (keep them)
    for (let i = temp.length - 1; i >= 0; i--) stack.push(temp[i]);
  };
  const handleAtom = () => {
    // No stack effects; atom-level tokens do not affect sanity state
    return;
  };

  // Register handlers
  handlers.set(TokenType.Condition, handleCondition);
  handlers.set(TokenType.Command, (t) => handleSection(t));
  handlers.set(TokenType.Environment, handleGrouping);
  handlers.set(TokenType.MathDelim, handleGrouping);
  handlers.set(TokenType.Brace, handleGrouping);
  handlers.set(TokenType.Text, handleAtom);
  handlers.set(TokenType.Comment, handleAtom);
  handlers.set(TokenType.Bracket, handleAtom);

  for (const t of tokens) {
    const h = handlers.get(t.type) || handleAtom;
    h(t);
  }
  // Anything left on the stack is an opened-but-unclosed grouping
  const openedUnclosedGroupings: Array<{
    ctx: NodeType;
    pos: number;
  }> = [];
  const tmpFinal: AstNode[] = [];
  while (stack.size() > 0) {
    const n = stack.pop();
    if (!n) break;
    tmpFinal.push(n);
    const c = (n as any).ctx as Ctx | undefined;
    if (c) openedUnclosedGroupings.push({ ctx: c, pos: (n as any).start });
  }
  // restore (not strictly necessary at end)
  for (let i = tmpFinal.length - 1; i >= 0; i--) stack.push(tmpFinal[i]);

  return {
    lexerOptions: { enabledTokens: enabled },
    notes,
    intersectingPairs,
    openedUnclosedGroupings,
    unopenedClosings,
  };
}
