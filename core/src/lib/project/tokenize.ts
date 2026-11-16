import type { SourceRange } from '../../api-types.js';
import type { SourceToken, SourceTokenKind } from '../../project-types.js';
import { lineStarts, rangeAt } from './shared.js';

export interface BracedGroupTokenMatch {
  readonly openIndex: number;
  readonly closeIndex: number;
  readonly nextIndex: number;
  readonly innerStartIndex: number;
  readonly innerEndIndex: number;
  readonly start: number;
  readonly end: number;
  readonly innerStart: number;
  readonly innerEnd: number;
  readonly text: string;
}

export interface OptionalBracketTokenMatch {
  readonly startIndex: number;
  readonly startCharOffset: number;
  readonly endIndex: number;
  readonly endCharOffset: number;
  readonly nextIndex: number;
  readonly nextCharOffset: number;
  readonly innerStartIndex: number;
  readonly innerEndIndex: number;
  readonly start: number;
  readonly end: number;
  readonly innerStart: number;
  readonly innerEnd: number;
  readonly text: string;
}

export interface VerbatimTokenMatch {
  readonly kind: 'verb' | 'environment';
  readonly startIndex: number;
  readonly openEndIndex?: number;
  readonly closeStartIndex?: number | null;
  readonly endIndex: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly envName: string | null;
  readonly closed: boolean;
  readonly error?: string;
}

export interface DefinitionTokenMatch {
  readonly name: string | null;
  readonly starred: boolean;
  readonly endOffset: number;
  readonly nextIndex: number;
  readonly body: BracedGroupTokenMatch | null;
  readonly arguments: readonly {
    readonly start: number;
    readonly end: number;
    readonly innerStart: number;
    readonly innerEnd: number;
    readonly innerStartIndex: number;
    readonly innerEndIndex: number;
    readonly text: string;
  }[];
  readonly valid: boolean;
}

/**
 * Stateless whole-file tokenizer (Stage 0, INV-1 & INV-2).
 * Scans a raw LaTeX string once from 0 to source.length without any condition,
 * input, or environment state.
 */
export function tokenizeFile(source: string): readonly SourceToken[] {
  const starts = lineStarts(source);
  const tokens: SourceToken[] = [];
  for (let pos = 0; pos < source.length;) {
    const c = source[pos]!;
    let end = pos + 1;
    let kind: SourceTokenKind = 'text';
    let name = '';
    if (c === '%') {
      kind = 'comment';
      while (end < source.length && source[end] !== '\r' && source[end] !== '\n') end++;
      if (source[end] === '\r') end++;
      if (source[end] === '\n') end++;
    } else if (/\s/.test(c)) {
      kind = 'space';
      while (end < source.length && /\s/.test(source[end]!)) end++;
    } else if (c === '{') {
      kind = 'open';
    } else if (c === '}') {
      kind = 'close';
    } else if (c === '$') {
      kind = 'math';
      if (source[end] === '$') end++;
    } else if (c === '\\') {
      if (/[A-Za-z@]/.test(source[end] ?? '')) {
        while (end < source.length && /[A-Za-z@]/.test(source[end]!)) end++;
      } else if (end < source.length) {
        end++;
      }
      name = source.slice(pos + 1, end);
      kind = name === '(' || name === ')' || name === '[' || name === ']' ? 'math' : 'command';
    } else {
      while (end < source.length && !/[\\%{}$\s]/.test(source[end]!)) end++;
    }
    const range: SourceRange = Object.freeze(rangeAt(starts, pos, end - 1));
    tokens.push(
      Object.freeze({
        index: tokens.length,
        kind,
        value: source.slice(pos, end),
        name,
        range,
      })
    );
    pos = end;
  }
  return Object.freeze(tokens);
}

/** Advance past space and comment tokens. */
export function skipTriviaTokens(
  tokens: readonly SourceToken[],
  fromIndex: number,
  untilIndex = tokens.length
): number {
  let i = fromIndex;
  while (i < untilIndex && (tokens[i]!.kind === 'space' || tokens[i]!.kind === 'comment')) {
    i++;
  }
  return i;
}

/** Read a balanced `{...}` group over the token array starting after trivia from `fromIndex`. */
export function readBracedGroupTokens(
  tokens: readonly SourceToken[],
  fromIndex: number,
  untilIndex = tokens.length
): BracedGroupTokenMatch | null {
  const openIndex = skipTriviaTokens(tokens, fromIndex, untilIndex);
  if (openIndex >= untilIndex || tokens[openIndex]!.kind !== 'open') return null;
  const openToken = tokens[openIndex]!;
  let depth = 1;
  for (let i = openIndex + 1; i < untilIndex; i++) {
    const tok = tokens[i]!;
    if (tok.kind === 'command' && tok.name === 'verb') {
      const verb = matchVerbatimTokens(tokens, i, [], untilIndex);
      if (verb && verb.closed) {
        i = verb.endIndex;
        continue;
      }
    }
    if (tok.kind === 'open') depth++;
    else if (tok.kind === 'close') {
      depth--;
      if (depth === 0) {
        const innerParts: string[] = [];
        for (let k = openIndex + 1; k < i; k++) innerParts.push(tokens[k]!.value);
        return {
          openIndex,
          closeIndex: i,
          nextIndex: i + 1,
          innerStartIndex: openIndex + 1,
          innerEndIndex: i - 1,
          start: openToken.range.start,
          end: tok.range.end + 1,
          innerStart: openToken.range.end + 1,
          innerEnd: tok.range.start - 1,
          text: innerParts.join(''),
        };
      }
    }
  }
  return null;
}

/**
 * Read an optional `[...]` bracket argument over the token array, respecting nested `{...}`
 * groups and active `\verb`, closing on the first unbraced `]` per LaTeX rules, and supporting
 * consecutive `[a][b]` brackets within a single `'text'` token via `charOffset`.
 */
export function readOptionalBracketTokens(
  tokens: readonly SourceToken[],
  fromIndex: number,
  untilIndex = tokens.length,
  charOffset = 0
): OptionalBracketTokenMatch | null {
  const startIndex = charOffset === 0 ? skipTriviaTokens(tokens, fromIndex, untilIndex) : fromIndex;
  if (startIndex >= untilIndex) return null;
  const firstTok = tokens[startIndex]!;
  if (firstTok.kind !== 'text' || firstTok.value[charOffset] !== '[') return null;
  const startOffset = firstTok.range.start + charOffset;
  let braces = 0;
  const textParts: string[] = [];
  const finish = (
    endIndex: number,
    endCharOffset: number,
    tok: SourceToken
  ): OptionalBracketTokenMatch => {
    const endOffset = tok.range.start + endCharOffset + 1;
    const nextCharOffset = endCharOffset + 1 < tok.value.length ? endCharOffset + 1 : 0;
    const nextIndex = nextCharOffset > 0 ? endIndex : endIndex + 1;
    return {
      startIndex,
      startCharOffset: charOffset,
      endIndex,
      endCharOffset,
      nextIndex,
      nextCharOffset,
      innerStartIndex: startIndex + 1,
      innerEndIndex: endIndex - 1,
      start: startOffset,
      end: endOffset,
      innerStart: startOffset + 1,
      innerEnd: endOffset - 2,
      text: textParts.join(''),
    };
  };
  for (let tIdx = startIndex; tIdx < untilIndex; tIdx++) {
    const tok = tokens[tIdx]!;
    const cStart = tIdx === startIndex ? charOffset + 1 : 0;
    if (tok.kind === 'open') {
      braces++;
      textParts.push(tok.value);
      continue;
    }
    if (tok.kind === 'close') {
      if (braces === 0) return null;
      braces--;
      textParts.push(tok.value);
      continue;
    }
    if (tok.kind === 'command' && tok.name === 'verb') {
      const verb = matchVerbatimTokens(tokens, tIdx, [], untilIndex);
      if (verb && verb.closed) {
        for (let k = tIdx; k < verb.endIndex; k++) {
          textParts.push(
            k === tIdx && cStart > 0 ? tokens[k]!.value.slice(cStart) : tokens[k]!.value
          );
        }
        const endTok = tokens[verb.endIndex]!;
        const afterVerb = verb.endOffset - endTok.range.start + 1;
        const headStart = verb.endIndex === tIdx ? cStart : 0;
        textParts.push(endTok.value.slice(headStart, afterVerb));
        if (braces === 0 && endTok.kind === 'text') {
          for (let k = afterVerb; k < endTok.value.length; k++) {
            if (endTok.value[k] === ']') {
              textParts.push(endTok.value.slice(afterVerb, k));
              return finish(verb.endIndex, k, endTok);
            }
          }
        }
        if (afterVerb < endTok.value.length) {
          textParts.push(endTok.value.slice(afterVerb));
        }
        tIdx = verb.endIndex;
        continue;
      }
    }
    if (braces === 0 && tok.kind === 'text') {
      for (let k = cStart; k < tok.value.length; k++) {
        if (tok.value[k] === ']') {
          textParts.push(tok.value.slice(cStart, k));
          return finish(tIdx, k, tok);
        }
      }
    }
    textParts.push(cStart > 0 ? tok.value.slice(cStart) : tok.value);
  }
  return null;
}

/**
 * Match an active `\verb[*]<delim>...<delim>` or `\begin{<verbatimEnv>}...\end{<verbatimEnv>}`
 * construct over the token array without re-lexing raw source characters.
 */
export function matchVerbatimTokens(
  tokens: readonly SourceToken[],
  commandIndex: number,
  verbatimEnvironments: readonly string[],
  untilIndex = tokens.length
): VerbatimTokenMatch | null {
  const cmd = tokens[commandIndex];
  if (!cmd || cmd.kind !== 'command') return null;

  if (cmd.name === 'verb') {
    const next = commandIndex + 1 < untilIndex ? tokens[commandIndex + 1] : undefined;
    if (!next || next.kind === 'space') {
      return {
        kind: 'verb',
        startIndex: commandIndex,
        endIndex: commandIndex,
        startOffset: cmd.range.start,
        endOffset: cmd.range.end,
        envName: null,
        closed: false,
        error: 'Missing inline verbatim delimiter.',
      };
    }
    let delim: string;
    let searchTokenIndex: number;
    let searchCharOffset: number;
    if (next.kind === 'text' && next.value.startsWith('*')) {
      if (next.value.length > 1) {
        delim = next.value[1]!;
        searchTokenIndex = commandIndex + 1;
        searchCharOffset = 2;
      } else {
        const afterStar = commandIndex + 2 < untilIndex ? tokens[commandIndex + 2] : undefined;
        if (!afterStar || afterStar.kind === 'space') {
          return {
            kind: 'verb',
            startIndex: commandIndex,
            endIndex: commandIndex + 1,
            startOffset: cmd.range.start,
            endOffset: next.range.end,
            envName: null,
            closed: false,
            error: 'Missing inline verbatim delimiter.',
          };
        }
        delim = afterStar.value[0]!;
        searchTokenIndex = commandIndex + 2;
        searchCharOffset = 1;
      }
    } else {
      delim = next.value[0]!;
      searchTokenIndex = commandIndex + 1;
      searchCharOffset = 1;
    }

    for (let tIdx = searchTokenIndex; tIdx < untilIndex; tIdx++) {
      const tok = tokens[tIdx]!;
      const cStart = tIdx === searchTokenIndex ? searchCharOffset : 0;
      for (let k = cStart; k < tok.value.length; k++) {
        const ch = tok.value[k]!;
        if (ch === delim) {
          return {
            kind: 'verb',
            startIndex: commandIndex,
            endIndex: tIdx,
            startOffset: cmd.range.start,
            endOffset: tok.range.start + k,
            envName: null,
            closed: true,
          };
        }
        if (ch === '\r' || ch === '\n') {
          return {
            kind: 'verb',
            startIndex: commandIndex,
            endIndex: k === 0 ? Math.max(commandIndex, tIdx - 1) : tIdx,
            startOffset: cmd.range.start,
            endOffset: tok.range.start + k - 1,
            envName: null,
            closed: false,
            error: 'Unterminated inline verbatim region; recovery starts at the next line.',
          };
        }
      }
    }
    const lastTok = tokens[untilIndex - 1]!;
    return {
      kind: 'verb',
      startIndex: commandIndex,
      endIndex: untilIndex - 1,
      startOffset: cmd.range.start,
      endOffset: lastTok.range.end,
      envName: null,
      closed: false,
      error: 'Unterminated inline verbatim region; recovery starts at the next line.',
    };
  }

  if (cmd.name === 'begin') {
    let p = commandIndex + 1;
    while (p < tokens.length && tokens[p]!.kind === 'space') p++;
    if (
      tokens[p]?.kind !== 'open' ||
      tokens[p + 1]?.kind !== 'text' ||
      tokens[p + 2]?.kind !== 'close'
    ) {
      return null;
    }
    const envName = tokens[p + 1]!.value;
    if (!/^[A-Za-z*]+$/.test(envName) || !verbatimEnvironments.includes(envName)) {
      return null;
    }
    const openEndIndex = p + 2;
    const closingSpelling = `\\end{${envName}}`;
    for (let tIdx = openEndIndex + 1; tIdx < tokens.length; tIdx++) {
      const tok = tokens[tIdx]!;
      if (
        tok.kind === 'command' &&
        tok.name === 'end' &&
        tokens[tIdx + 1]?.kind === 'open' &&
        tokens[tIdx + 2]?.kind === 'text' &&
        tokens[tIdx + 2]?.value === envName &&
        tokens[tIdx + 3]?.kind === 'close'
      ) {
        return {
          kind: 'environment',
          startIndex: commandIndex,
          openEndIndex,
          closeStartIndex: tIdx,
          endIndex: tIdx + 3,
          startOffset: cmd.range.start,
          endOffset: tokens[tIdx + 3]!.range.end,
          envName,
          closed: true,
        };
      }
      if (tok.kind === 'comment') {
        const found = tok.value.indexOf(closingSpelling);
        if (found !== -1) {
          return {
            kind: 'environment',
            startIndex: commandIndex,
            openEndIndex,
            closeStartIndex: tIdx,
            endIndex: tIdx,
            startOffset: cmd.range.start,
            endOffset: tok.range.start + found + closingSpelling.length - 1,
            envName,
            closed: true,
          };
        }
      }
    }
    const lastTok = tokens[tokens.length - 1]!;
    return {
      kind: 'environment',
      startIndex: commandIndex,
      openEndIndex,
      closeStartIndex: null,
      endIndex: tokens.length - 1,
      startOffset: cmd.range.start,
      endOffset: lastTok.range.end,
      envName,
      closed: false,
      error: 'Unterminated protected environment; coverage stops at its opener.',
    };
  }

  return null;
}

/**
 * Split `tokens[verb.endIndex]` when a closed `\verb` or `\begin{verbatim}` ends
 * before the end of that token (or inside a `comment` token), re-tokenizing the
 * trailing characters with exact source offsets and line numbers.
 */
export function spliceVerbatimMatch(
  tokens: readonly SourceToken[],
  verb: VerbatimTokenMatch,
  source: string,
  starts: readonly number[]
): {
  readonly tokens: SourceToken[];
  readonly verb: VerbatimTokenMatch;
  readonly delta: number;
} | null {
  if (!verb.closed) return null;
  const endTok = tokens[verb.endIndex];
  if (!endTok) return null;
  const needsSplit =
    verb.endOffset < endTok.range.end || (verb.kind === 'environment' && endTok.kind === 'comment');
  if (!needsSplit) return null;

  const headTokens: SourceToken[] = [];
  let newCloseStartIndex = verb.closeStartIndex;

  if (verb.kind === 'verb') {
    const headValue = source.slice(endTok.range.start, verb.endOffset + 1);
    headTokens.push(
      Object.freeze({
        index: 0,
        kind: 'text',
        value: headValue,
        name: '',
        range: Object.freeze(rangeAt(starts, endTok.range.start, verb.endOffset)),
      })
    );
  } else {
    const closingLen = 5 + (verb.envName?.length ?? 0) + 1;
    const closeStartOffset = verb.endOffset - closingLen + 1;
    if (closeStartOffset > endTok.range.start) {
      headTokens.push(
        Object.freeze({
          index: 0,
          kind: 'text',
          value: source.slice(endTok.range.start, closeStartOffset),
          name: '',
          range: Object.freeze(rangeAt(starts, endTok.range.start, closeStartOffset - 1)),
        })
      );
    }
    newCloseStartIndex = verb.endIndex + headTokens.length;
    const closingToks = tokenizeFile(source.slice(closeStartOffset, verb.endOffset + 1));
    for (const t of closingToks) {
      headTokens.push(
        Object.freeze({
          index: 0,
          kind: t.kind,
          value: t.value,
          name: t.name,
          range: Object.freeze(
            rangeAt(starts, t.range.start + closeStartOffset, t.range.end + closeStartOffset)
          ),
        })
      );
    }
  }

  const tailTokens: SourceToken[] = [];
  if (verb.endOffset < endTok.range.end) {
    const tailOffset = verb.endOffset + 1;
    const rawTail = tokenizeFile(source.slice(tailOffset, endTok.range.end + 1));
    for (const t of rawTail) {
      tailTokens.push(
        Object.freeze({
          index: 0,
          kind: t.kind,
          value: t.value,
          name: t.name,
          range: Object.freeze(
            rangeAt(starts, t.range.start + tailOffset, t.range.end + tailOffset)
          ),
        })
      );
    }
  }

  const replacement = [...headTokens, ...tailTokens];
  const updated: SourceToken[] = [
    ...tokens.slice(0, verb.endIndex),
    ...replacement,
    ...tokens.slice(verb.endIndex + 1),
  ];
  for (let i = verb.endIndex; i < updated.length; i++) {
    const tok = updated[i]!;
    if (tok.index !== i) {
      updated[i] = Object.freeze({ ...tok, index: i });
    }
  }
  const newEndIndex = verb.endIndex + headTokens.length - 1;
  return {
    tokens: updated,
    verb: {
      ...verb,
      endIndex: newEndIndex,
      ...(newCloseStartIndex !== undefined ? { closeStartIndex: newCloseStartIndex } : {}),
    },
    delta: replacement.length - 1,
  };
}

/**
 * Read a `\newcommand[*]`, `\renewcommand[*]`, `\providecommand[*]`, or `\def`
 * declaration header and body over the token array.
 */
export function readDefinitionTokens(
  tokens: readonly SourceToken[],
  commandIndex: number,
  untilIndex = tokens.length
): DefinitionTokenMatch {
  const cmd = tokens[commandIndex]!;
  let cursor = commandIndex + 1;
  let charOffset = 0;
  let starred = false;
  if (
    cursor < untilIndex &&
    tokens[cursor]!.kind === 'text' &&
    tokens[cursor]!.value.startsWith('*')
  ) {
    starred = true;
    if (tokens[cursor]!.value.length === 1) {
      cursor++;
    } else {
      charOffset = 1;
    }
  }
  if (charOffset === 0) {
    cursor = skipTriviaTokens(tokens, cursor, untilIndex);
  }
  let name: string | null = null;
  let lastOffset = starred ? cmd.range.end + 2 : cmd.range.end + 1;
  if (charOffset === 0 && cursor < untilIndex) {
    const targetTok = tokens[cursor]!;
    if (targetTok.kind === 'command' || targetTok.kind === 'math') {
      if (targetTok.kind === 'command' && /^[A-Za-z@]+$/.test(targetTok.name)) {
        name = targetTok.name;
      }
      lastOffset = targetTok.range.end + 1;
      cursor++;
    } else if (cmd.name !== 'def') {
      const grp = readBracedGroupTokens(tokens, cursor, untilIndex);
      if (grp) {
        name = /^\\([A-Za-z@]+)$/.exec(grp.text.trim())?.[1] ?? null;
        lastOffset = grp.end;
        cursor = grp.nextIndex;
      }
    }
  }

  const args: {
    readonly start: number;
    readonly end: number;
    readonly innerStart: number;
    readonly innerEnd: number;
    readonly innerStartIndex: number;
    readonly innerEndIndex: number;
    readonly text: string;
  }[] = [];

  if (cmd.name === 'def') {
    const paramStartIndex = cursor;
    const parameterStart = lastOffset;
    while (cursor < untilIndex && tokens[cursor]!.kind !== 'open') {
      lastOffset = tokens[cursor]!.range.end + 1;
      cursor++;
    }
    if (cursor > paramStartIndex && lastOffset > parameterStart) {
      const paramText = tokens
        .slice(paramStartIndex, cursor)
        .map((t) => t.value)
        .join('');
      args.push({
        start: parameterStart,
        end: lastOffset,
        innerStart: parameterStart,
        innerEnd: lastOffset - 1,
        innerStartIndex: paramStartIndex,
        innerEndIndex: cursor - 1,
        text: paramText,
      });
    }
  } else {
    let optOffset = charOffset;
    for (let i = 0; i < 2; i++) {
      const opt = readOptionalBracketTokens(tokens, cursor, untilIndex, optOffset);
      if (!opt) break;
      args.push({
        start: opt.start,
        end: opt.end,
        innerStart: opt.innerStart,
        innerEnd: opt.innerEnd,
        innerStartIndex: opt.innerStartIndex,
        innerEndIndex: opt.innerEndIndex,
        text: opt.text,
      });
      lastOffset = opt.end;
      cursor = opt.nextIndex;
      optOffset = opt.nextCharOffset;
    }
    if (optOffset > 0) {
      cursor++;
    }
  }

  const body = readBracedGroupTokens(tokens, cursor, untilIndex);
  if (body) {
    lastOffset = body.end;
    cursor = body.nextIndex;
  }
  const valid =
    Boolean(name && body) &&
    (cmd.name === 'def' ||
      args.length === 0 ||
      (/^[0-9]$/.test(args[0]!.text.trim()) &&
        (args.length === 1 || args[0]!.text.trim() !== '0')));
  return {
    name,
    starred,
    endOffset: body ? body.end : Math.max(lastOffset, cmd.range.end + 1),
    nextIndex: body ? body.nextIndex : untilIndex,
    body,
    arguments: args,
    valid,
  };
}
