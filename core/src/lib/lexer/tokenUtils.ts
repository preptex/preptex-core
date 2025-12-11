const ESCAPABLE_TEXT_CHARS = new Set([' ', '\\', '%', '{', '}', '$']);
export const TEXT_END_CHARS = new Set(['%', '{', '}', '[', ']', '$']);

export function skipWhitespace(input: string, pos: number, skipLines: boolean = true) {
  const matchStr = skipLines ? /\s/ : /[ \t]/;
  while (pos < input.length && matchStr.test(input[pos])) pos++;
  return pos;
}

export function isEscapablePair(nextChar: string | undefined): boolean {
  if (!nextChar) return true;
  return ESCAPABLE_TEXT_CHARS.has(nextChar);
}

export function readControlSequenceName(input: string, pos: number): { name: string; end: number } {
  if (input[pos] !== '\\') {
    throw new Error(`Expected backslash at position ${pos}`);
  }
  const start = ++pos;
  if (start < input.length && !/[a-zA-Z@]/.test(input[start])) {
    throw new Error(`Invalid control sequence name at position ${start}`);
  }
  // Parse command name (letters or single non-letter char)
  while (pos < input.length && /[a-zA-Z@]/.test(input[pos])) pos++;
  return { name: input.slice(start, pos), end: pos - 1 };
}

export function readEnvName(input: string, pos: number): { name: string; end: number } {
  pos = skipWhitespace(input, pos);
  let name = '';
  const hasBrace = pos < input.length && input[pos] === '{';
  if (!hasBrace) {
    return { name: input[pos], end: pos };
  }

  pos++; // consume '{'
  const nameStart = pos;
  while (pos < input.length && input[pos] !== '}') pos++;
  if (pos >= input.length) {
    throw new Error(`Unterminated environment name starting at position ${nameStart - 1}`);
  }
  name = input.slice(nameStart, pos);
  return { name, end: pos };
}

export function parseControlSequenceNameEnd(input: string, afterBackslash: number): number {
  let nameEnd = afterBackslash;
  if (nameEnd >= input.length) return nameEnd;
  const nextChar = input[nameEnd];
  if (/^[a-zA-Z@]$/.test(nextChar)) {
    nameEnd++;
    while (nameEnd < input.length && /[a-zA-Z@]/.test(input[nameEnd])) nameEnd++;
    return nameEnd;
  }
  return Math.min(input.length, nameEnd + 1);
}

export function isBraceTokenAt(input: string, start: number): boolean {
  const ch = input[start];
  return ch === '{' || ch === '}';
}

export function isBracketTokenAt(input: string, start: number): boolean {
  const ch = input[start];
  return ch === '[' || ch === ']';
}

export function isMathDelimTokenAt(input: string, start: number): boolean {
  const ch = input[start];
  if (ch === '$') return true;
  if (ch === '\\') {
    const nextChar = input[start + 1];
    return nextChar === '[' || nextChar === ']' || nextChar === '(' || nextChar === ')';
  }
  return false;
}

export function isCommentTokenAt(input: string, start: number): boolean {
  if (input[start] === '%') return true;
  if (isEnvironmentTokenAt(input, start)) {
    const { name, end } = readControlSequenceName(input, start);
    const envName = readEnvName(input, end + 1);
    return envName.name === 'comment';
  }
  return false;
}

export function isControlSequenceTokenAt(input: string, start: number): boolean {
  return input[start] === '\\' && !isEscapablePair(input[start + 1]);
}

export function isEnvironmentTokenAt(input: string, start: number): boolean {
  if (input[start] !== '\\') return false;
  const nameEnd = parseControlSequenceNameEnd(input, start + 1);
  const name = input.slice(start + 1, nameEnd);
  return name === 'begin' || name === 'end';
}

export function isConditionName(name: string): boolean {
  if (!name) return false;
  if (name === 'else' || name === 'fi') return true;
  return name.startsWith('if');
}

export function scanTextEndExclusive(input: string, start: number): number {
  let pos = start;
  while (pos < input.length) {
    const c = input[pos];
    if (c === '%' || c === '{' || c === '}' || c === '[' || c === ']' || c === '$') break;
    if (c === '\\') {
      const nextChar = pos + 1 < input.length ? input[pos + 1] : '';
      if (!nextChar) break;
      if (isEscapablePair(nextChar)) {
        pos += 2;
        continue;
      }
      break;
    }
    pos++;
  }
  return pos;
}

export function scanLineEndExclusive(input: string, start: number): number {
  let end = start;
  while (end < input.length && input[end] !== '\n' && input[end] !== '\r') end++;
  if (end < input.length) {
    if (input[end] === '\r' && end + 1 < input.length && input[end + 1] === '\n') return end + 2;
    return end + 1;
  }
  return end;
}
