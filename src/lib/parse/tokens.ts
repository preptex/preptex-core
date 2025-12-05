// Lexer is intentionally options-free; suppression and transforms are handled post-lexing.

import { env } from 'node:process';

export enum TokenType {
  Environment = 'Environment',
  Condition = 'Condition',
  Command = 'Command',
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

  constructor(
    private input: string,
    private opts: LexerOptions = {}
  ) {}

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
    });
  }

  private readBrace(ch: string): Token {
    const start = this.pos;
    this.pos++;
    return (this.current = { type: TokenType.Brace, name: ch, start, end: this.pos });
  }

  private readBracket(ch: string): Token {
    const start = this.pos;
    this.pos++;
    return (this.current = { type: TokenType.Bracket, name: ch, start, end: this.pos });
  }

  private readDollarDelim(): Token {
    const start = this.pos;
    if (this.pos + 1 < this.input.length && this.input[this.pos + 1] === '$') {
      this.pos += 2;
      return (this.current = {
        type: TokenType.MathDelim,
        name: '$$',
        start,
        end: this.pos,
      });
    }
    this.pos += 1;
    return (this.current = {
      type: TokenType.MathDelim,
      name: '$',
      start,
      end: this.pos,
    });
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
      return { type: TokenType.MathDelim, name: delim, start, end };
    }
    if (name === 'else') return { type: TokenType.Condition, name, start, end };
    if (name === 'fi') return { type: TokenType.Condition, name, start, end };
    if (name.startsWith('if'))
      return {
        type: TokenType.Condition,
        name: 'if',
        text: name.slice(2),
        start,
        end,
      };
    if (name === 'begin') return this.readEnvironment(start, true);
    if (name === 'end') return this.readEnvironment(start, false);
    return { type: TokenType.Command, name, start, end };
  }

  private readEnvironment(beginStart: number, isBegin: boolean): Token {
    this.skipWhitespace();
    if (this.input[this.pos] !== '{') {
      return {
        type: TokenType.Command,
        name: isBegin ? 'begin' : 'end',
        start: beginStart,
        end: this.pos,
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
    });
  }

  private readText(): Token {
    const start = this.pos;
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
    return (this.current = { type: TokenType.Text, text: value, start, end: this.pos });
  }

  private skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) this.pos++;
  }
}
