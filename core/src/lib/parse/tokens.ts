// Lexer is intentionally options-free; suppression and transforms are handled post-lexing.

export enum TokenType {
  Environment = 'Environment',
  Condition = 'Condition',
  ConditionDeclaration = 'ConditionDeclaration',
  Command = 'Command',
  Input = 'Input',
  Brace = 'Brace',
  Bracket = 'Bracket',
  Comment = 'Comment',
  MathDelim = 'MathDelim',
  Text = 'Text',
}

export const ALL_TOKEN_TYPES: ReadonlySet<TokenType> = new Set(
  Object.values(TokenType) as TokenType[]
);

export function getAllTokenTypes(): TokenType[] {
  return [...ALL_TOKEN_TYPES];
}

export interface Token {
  type: TokenType;
  start: number;
  end: number;
  line: number;
  // Unified fields:
  // - Text: text payload in `text`
  // - Command/Brace/Bracket/MathDelim/Condition/Environment: identifier in `name`
  text?: string;
  name?: string;
  // Environment only: indicates begin token; false implies end
  isBegin?: boolean;
}

// Characters that can follow a backslash and should be treated as literal text pairs ("\\X")
// rather than starting a command. Keep this local unless shared across modules.
const ESCAPABLE_TEXT_CHARS = new Set([' ', '\\', '%', '{', '}', '$']);

// Single-character command names that represent math delimiters, e.g. \\[ \\] \\( \\)
const MATH_DELIM_COMMANDS = new Set(['[', ']', '(', ')']);

export interface LexerOptions {
  enabledTokens?: Set<TokenType>;
  // When true (default), backslash+letter is escapable only if the following char is NOT a letter.
  // When false, backslash+letter always starts a command.
}

export class Lexer {
  private pos = 0;
  private current: Token | null = null;
  private pending: Token[] = [];
  private readonly lineStarts: number[];
  private curr_line_index = 0;

  constructor(
    private input: string,
    private opts: LexerOptions = {}
  ) {
    this.lineStarts = computeLineStarts(input);
  }

  private shouldEmit(t: Token): boolean {
    const enabled = this.opts.enabledTokens;
    return !enabled || enabled.has(t.type);
  }

  private isEscapablePair(nextChar: string | undefined): boolean {
    if (!nextChar) return false;
    // Non-letter escapables: always treated as text pairs
    if (ESCAPABLE_TEXT_CHARS.has(nextChar)) return true;
    // English letters: NEVER escapable — always start a command
    if (/^[A-Za-z]$/.test(nextChar)) return false;
    return false;
  }

  peek(): Token | null {
    return this.current;
  }
  *stream(): Generator<Token, void, unknown> {
    let t: Token | null;
    while ((t = this.next())) yield t;
  }

  next(): Token | null {
    if (this.pending.length) {
      this.current = this.pending.shift()!;
      return this.current;
    }
    // Do not skip whitespace: whitespace is part of Text tokens.
    if (this.pos >= this.input.length) return (this.current = null);
    const ch = this.input[this.pos];
    if (ch === '%') {
      const t = this.readComment();
      if (t && this.shouldEmit(t)) return t;
      return this.readText();
    }
    if (ch === '$') {
      const t = this.readDollarDelim();
      if (this.shouldEmit(t)) return t;
      return this.readText();
    }
    if (ch === '{' || ch === '}') {
      const t = this.readBrace(ch);
      if (this.shouldEmit(t)) return t;
      return this.readText();
    }
    if (ch === '[' || ch === ']') {
      const t = this.readBracket(ch);
      if (this.shouldEmit(t)) return t;
      return this.readText();
    }
    if (ch === '\\') {
      const nextChar = this.pos + 1 < this.input.length ? this.input[this.pos + 1] : '';
      const escAsText = this.isEscapablePair(nextChar);
      if (!nextChar || !escAsText) {
        const t = this.readCommand();
        if (this.shouldEmit(t)) return t;
        return this.readText();
      }
    }
    return this.readText();
  }

  private readComment(envC: boolean = false, start: number = this.pos): Token {
    const line = this.getLineForIndex(start);
    let end = start + 1;
    const ending = envC ? '\\end{comment}' : '\n';
    while (end < this.input.length && !this.input.startsWith(ending, end)) {
      end++;
    }
    // Include the terminator in the comment text
    if (this.input.startsWith(ending, end)) {
      end += ending.length;
    }
    const raw = this.input.slice(start, end);
    this.pos = end;
    // Distinguish comments that are commenting out environments (e.g., %\begin or %\end)
    return (this.current = {
      type: TokenType.Comment,
      name: envC ? 'env-comment' : '%',
      text: raw,
      start,
      end,
      line,
    });
  }

  private readBrace(ch: string): Token {
    const start = this.pos;
    const line = this.getLineForIndex(start);
    this.pos++;
    return (this.current = { type: TokenType.Brace, name: ch, start, end: this.pos, line });
  }

  private readBracket(ch: string): Token {
    const start = this.pos;
    const line = this.getLineForIndex(start);
    this.pos++;
    return (this.current = { type: TokenType.Bracket, name: ch, start, end: this.pos, line });
  }

  private readDollarDelim(): Token {
    const start = this.pos;
    const line = this.getLineForIndex(start);
    if (this.pos + 1 < this.input.length && this.input[this.pos + 1] === '$') {
      this.pos += 2;
      return (this.current = {
        type: TokenType.MathDelim,
        name: '$$',
        start,
        end: this.pos,
        line,
      });
    }
    this.pos += 1;
    return (this.current = {
      type: TokenType.MathDelim,
      name: '$',
      start,
      end: this.pos,
      line,
    });
  }

  private readCommand(): Token {
    const start = this.pos;
    const line = this.getLineForIndex(start);
    let run = 0;
    while (this.pos < this.input.length && this.input[this.pos] === '\\') {
      this.pos++;
      run++;
    }
    // Only solitary backslash is valid; otherwise error.
    if (run !== 1) {
      throw new Error(`Invalid backslash run of length ${run} at position ${start}`);
    }
    // Parse command name (letters or single non-letter char)
    let nameEnd = this.pos;
    if (nameEnd < this.input.length) {
      const nextChar = this.input[nameEnd];
      if (/^[a-zA-Z@]$/.test(nextChar)) {
        nameEnd++;
        while (nameEnd < this.input.length && /[a-zA-Z@]/.test(this.input[nameEnd])) nameEnd++;
      } else {
        nameEnd++;
      }
    }
    const name = this.input.slice(this.pos, nameEnd);
    this.pos = nameEnd;
    return (this.current = this.classifyCommand(name, start, this.pos, line));
  }

  private classifyCommand(name: string, start: number, end: number, line: number): Token {
    if (name === 'newif') return this.readNewIfDeclaration(start, end, line);
    if (MATH_DELIM_COMMANDS.has(name)) {
      const delim = `\\${name}`;
      return { type: TokenType.MathDelim, name: delim, start, end, line };
    }
    if (name === 'input') return this.readInputCommand(name, start, line);
    if (name === 'else') return { type: TokenType.Condition, name, start, end, line };
    if (name === 'fi') return { type: TokenType.Condition, name, start, end, line };
    if (name.startsWith('if'))
      return {
        type: TokenType.Condition,
        name: 'if',
        text: name.slice(2),
        start,
        end,
        line,
      };
    if (name === 'begin') return this.readEnvironment(start, true, line);
    if (name === 'end') return this.readEnvironment(start, false, line);
    return { type: TokenType.Command, name, start, end, line };
  }

  private readInputCommand(name: string, start: number, line: number): Token {
    const commandStart = start;
    this.skipWhitespace();

    let path = '';
    const hasBrace = this.pos < this.input.length && this.input[this.pos] === '{';

    if (hasBrace) {
      this.pos++; // consume '{'
      const pathStart = this.pos;
      while (this.pos < this.input.length && this.input[this.pos] !== '}') this.pos++;
      path = this.input.slice(pathStart, this.pos);
      if (this.pos < this.input.length && this.input[this.pos] === '}') this.pos++;
    } else {
      const pathStart = this.pos;
      while (this.pos < this.input.length && !/\s/.test(this.input[this.pos])) this.pos++;
      path = this.input.slice(pathStart, this.pos);
    }

    const end = this.pos;
    return (this.current = {
      type: TokenType.Input,
      name,
      text: path,
      start: commandStart,
      end,
      line,
    });
  }

  private readNewIfDeclaration(start: number, end: number, line: number): Token {
    const afterNewIf = end;
    this.skipWhitespace();

    const conditionStart = this.pos;
    if (conditionStart >= this.input.length || this.input[conditionStart] !== '\\') {
      this.pos = afterNewIf;
      return { type: TokenType.Command, name: 'newif', start, end: afterNewIf, line };
    }

    let p = conditionStart + 1; // skip backslash
    if (p >= this.input.length) {
      this.pos = afterNewIf;
      return { type: TokenType.Command, name: 'newif', start, end: afterNewIf, line };
    }

    const firstChar = this.input[p];
    if (!/^[a-zA-Z@]$/.test(firstChar)) {
      this.pos = afterNewIf;
      return { type: TokenType.Command, name: 'newif', start, end: afterNewIf, line };
    }

    p++;
    while (p < this.input.length && /[a-zA-Z@]/.test(this.input[p])) p++;
    const commandName = this.input.slice(conditionStart + 1, p);
    if (!commandName.startsWith('if') || commandName.length <= 2) {
      this.pos = afterNewIf;
      return { type: TokenType.Command, name: 'newif', start, end: afterNewIf, line };
    }

    const conditionName = commandName.slice(2);
    this.pos = p;

    let lineEnd = this.pos;
    while (
      lineEnd < this.input.length &&
      this.input[lineEnd] !== '\n' &&
      this.input[lineEnd] !== '\r'
    ) {
      lineEnd++;
    }

    if (lineEnd < this.input.length) {
      if (
        this.input[lineEnd] === '\r' &&
        lineEnd + 1 < this.input.length &&
        this.input[lineEnd + 1] === '\n'
      ) {
        lineEnd += 2;
      } else {
        lineEnd += 1;
      }
    }

    const text = this.input.slice(start, lineEnd);
    this.pos = lineEnd;

    return (this.current = {
      type: TokenType.ConditionDeclaration,
      name: conditionName,
      text,
      start,
      end: lineEnd,
      line,
    });
  }

  private readEnvironment(beginStart: number, isBegin: boolean, line: number): Token {
    this.skipWhitespace();
    if (this.input[this.pos] !== '{') {
      return {
        type: TokenType.Command,
        name: isBegin ? 'begin' : 'end',
        start: beginStart,
        end: this.pos,
        line,
      };
    }
    this.pos++;
    const nameStart = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== '}') this.pos++;
    const envName = this.input.slice(nameStart, this.pos);
    if (envName === 'comment') {
      return (this.current = this.readComment(true, beginStart));
    }
    if (this.input[this.pos] === '}') this.pos++;
    const end = this.pos;
    return (this.current = {
      type: TokenType.Environment,
      name: envName,
      isBegin,
      start: beginStart,
      end,
      line,
    });
  }

  private readText(): Token {
    const start = this.pos;
    const line = this.getLineForIndex(start);
    while (this.pos < this.input.length) {
      const c = this.input[this.pos];
      if (c === '%' || c === '{' || c === '}' || c === '[' || c === ']' || c === '$') break;
      if (c === '\\') {
        const nextChar = this.pos + 1 < this.input.length ? this.input[this.pos + 1] : '';
        const escAsText = this.isEscapablePair(nextChar);
        if (!nextChar) break; // solitary at EOF -> let readCommand produce Command('')
        if (escAsText) {
          this.pos += 2; // consume escaped pair as text
          continue;
        }
        break; // defer to readCommand
      }
      this.pos++;
    }
    const value = this.input.slice(start, this.pos);
    return (this.current = { type: TokenType.Text, text: value, start, end: this.pos, line });
  }

  private skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) this.pos++;
  }

  private getLineForIndex(index: number): number {
    while (
      this.curr_line_index + 1 < this.lineStarts.length &&
      this.lineStarts[this.curr_line_index + 1] <= index
    ) {
      this.curr_line_index++;
    }
    return this.curr_line_index + 1; // lines are 1-based
  }
}

function computeLineStarts(input: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '\r') {
      if (i + 1 < input.length && input[i + 1] === '\n') {
        starts.push(i + 2);
        i++;
      } else {
        starts.push(i + 1);
      }
      continue;
    }
    if (ch === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}
