// Lexer is intentionally options-free; suppression and transforms are handled post-lexing.

export enum TokenType {
  BeginEnv = 'BeginEnv',
  EndEnv = 'EndEnv',
  If = 'If',
  Else = 'Else',
  Fi = 'Fi',
  Command = 'Command',
  LBrace = 'LBrace',
  RBrace = 'RBrace',
  LBracket = 'LBracket',
  RBracket = 'RBracket',
  Comment = 'Comment',
  MathDelim = 'MathDelim',
  Text = 'Text',
}

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

// Characters that can follow a backslash and should be treated as literal text pairs ("\\X")
// rather than starting a command. Keep this local unless shared across modules.
const ESCAPABLE_TEXT_CHARS = new Set([' ', '\\', '%', '{', '}', '$', 'n', 't']);

// Single-character command names that represent math delimiters, e.g. \\[ \\] \\( \\)
const MATH_DELIM_COMMANDS = new Set(['[', ']', '(', ')']);

export class Lexer {
  private pos = 0;
  private current: Token | null = null;
  private pending: Token[] = [];

  constructor(private input: string) {}

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
    if (ch === '%') return this.readComment();
    if (ch === '$') return this.readDollarDelim();
    if (ch === '{' || ch === '}') return this.readBrace(ch);
    if (ch === '[' || ch === ']') return this.readBracket(ch);
    if (ch === '\\') {
      const nextChar = this.pos + 1 < this.input.length ? this.input[this.pos + 1] : '';
      const escAsText = nextChar && ESCAPABLE_TEXT_CHARS.has(nextChar);
      if (!nextChar || !escAsText) {
        return this.readCommand();
      }
    }
    return this.readText();
  }

  private readComment(): Token | null {
    const start = this.pos;
    let end = start + 1;
    while (end < this.input.length && this.input[end] !== '\n') end++;
    const raw = this.input.slice(start, end);
    this.pos = end;
    return (this.current = { type: TokenType.Comment, value: raw, start, end });
  }

  private readBrace(ch: string): Token {
    const start = this.pos;
    this.pos++;
    const type = ch === '{' ? TokenType.LBrace : TokenType.RBrace;
    return (this.current = { type, value: ch, start, end: this.pos });
  }

  private readBracket(ch: string): Token {
    const start = this.pos;
    this.pos++;
    const type = ch === '[' ? TokenType.LBracket : TokenType.RBracket;
    return (this.current = { type, value: ch, start, end: this.pos });
  }

  private readDollarDelim(): Token {
    const start = this.pos;
    if (this.pos + 1 < this.input.length && this.input[this.pos + 1] === '$') {
      this.pos += 2;
      return (this.current = { type: TokenType.MathDelim, value: '$$', start, end: this.pos });
    }
    this.pos += 1;
    return (this.current = { type: TokenType.MathDelim, value: '$', start, end: this.pos });
  }

  private readCommand(): Token {
    const start = this.pos;
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
    return (this.current = this.classifyCommand(name, start, this.pos));
  }

  private classifyCommand(name: string, start: number, end: number): Token {
    if (MATH_DELIM_COMMANDS.has(name)) {
      const delim = `\\${name}`;
      return { type: TokenType.MathDelim, value: delim, start, end };
    }
    if (name === 'else') return { type: TokenType.Else, value: name, start, end };
    if (name === 'fi') return { type: TokenType.Fi, value: name, start, end };
    if (name.startsWith('if')) return { type: TokenType.If, value: name, start, end };
    if (name === 'begin') return this.readEnvironment(start, true);
    if (name === 'end') return this.readEnvironment(start, false);
    return { type: TokenType.Command, value: name, start, end };
  }

  private readEnvironment(beginStart: number, isBegin: boolean): Token {
    this.skipWhitespace();
    if (this.input[this.pos] !== '{') {
      return {
        type: TokenType.Command,
        value: isBegin ? 'begin' : 'end',
        start: beginStart,
        end: this.pos,
      };
    }
    this.pos++;
    const nameStart = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== '}') this.pos++;
    const envName = this.input.slice(nameStart, this.pos);
    if (this.input[this.pos] === '}') this.pos++;
    const end = this.pos;
    return (this.current = {
      type: isBegin ? TokenType.BeginEnv : TokenType.EndEnv,
      value: envName,
      start: beginStart,
      end,
    });
  }

  private readText(): Token {
    const start = this.pos;
    while (this.pos < this.input.length) {
      const c = this.input[this.pos];
      if (c === '%' || c === '{' || c === '}' || c === '[' || c === ']' || c === '$') break;
      if (c === '\\') {
        const nextChar = this.pos + 1 < this.input.length ? this.input[this.pos + 1] : '';
        const escAsText = nextChar && ESCAPABLE_TEXT_CHARS.has(nextChar);
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
    return (this.current = { type: TokenType.Text, value, start, end: this.pos });
  }

  private skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) this.pos++;
  }
}
