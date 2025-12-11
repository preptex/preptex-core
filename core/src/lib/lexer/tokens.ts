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
  name?: string;
  // Environment only: indicates begin token; false implies end
  isBegin?: boolean;
  // Input only: parsed input path
  path?: string;
  // Condition only: condition name for "if*" tokens (e.g. for "\\ifdraft" -> "draft")
  condition?: string;
}

// Single-character command names that represent math delimiters, e.g. \\[ \\] \\( \\)
const MATH_DELIM_COMMANDS = new Set(['[', ']', '(', ')']);

export interface LexerOptions {
  enabledTokens?: Set<TokenType>;
  // When true (default), backslash+letter is escapable only if the following char is NOT a letter.
  // When false, backslash+letter always starts a command.
}

import {
  isEscapablePair,
  parseControlSequenceNameEnd,
  isBraceTokenAt,
  isMathDelimTokenAt,
  isCommentTokenAt,
  isEnvironmentTokenAt,
  isControlSequenceTokenAt,
  isConditionName,
  TEXT_END_CHARS,
  readEnvName,
  readControlSequenceName,
  skipWhitespace,
} from './tokenUtils.js';

export function peekNextTokenType(
  input: string,
  start: number,
  opts: LexerOptions
): TokenType | null {
  if (start >= input.length) return null;
  const enabled = opts.enabledTokens;
  const isEnabled = (t: TokenType) => !enabled || enabled.has(t);

  if (isEnabled(TokenType.Brace) && isBraceTokenAt(input, start)) {
    return TokenType.Brace;
  }
  if (isEnabled(TokenType.MathDelim) && isMathDelimTokenAt(input, start)) {
    return TokenType.MathDelim;
  }
  if (isEnabled(TokenType.Comment) && isCommentTokenAt(input, start)) {
    return TokenType.Comment;
  }
  if (isEnabled(TokenType.Environment) && isEnvironmentTokenAt(input, start)) {
    return TokenType.Environment;
  }
  if (isControlSequenceTokenAt(input, start)) {
    const name = readControlSequenceName(input, start).name;
    if (isEnabled(TokenType.ConditionDeclaration) && name === 'newif') {
      return TokenType.ConditionDeclaration;
    }
    if (isEnabled(TokenType.Condition) && isConditionName(name)) {
      return TokenType.Condition;
    }
    if (isEnabled(TokenType.Input) && name === 'input') {
      return TokenType.Input;
    }
    if (isEnabled(TokenType.Command)) {
      return TokenType.Command;
    }
  }
  return TokenType.Text;
}

export class Lexer {
  private pos = 0;
  private readonly lineStarts: number[];
  private curr_line_index = 0;

  constructor(
    private input: string,
    private opts: LexerOptions = {}
  ) {
    this.lineStarts = computeLineStarts(input);
  }

  *stream(): Generator<Token, void, unknown> {
    let t: Token | null;
    while ((t = this.next())) yield t;
  }

  private parseWhitespace(skipLines: boolean = true) {
    this.pos = skipWhitespace(this.input, this.pos, skipLines);
  }

  private parseEnvName(): { name: string; end: number } {
    const { name, end } = readEnvName(this.input, this.pos);
    this.pos = end + 1;
    return { name, end };
  }

  private parseControlSequenceName(): string {
    const { name, end } = readControlSequenceName(this.input, this.pos);
    this.pos = end + 1;
    return name;
  }

  next(): Token | null {
    // Do not skip whitespace: whitespace is part of Text tokens.
    if (this.pos >= this.input.length) return null;

    const nextType = peekNextTokenType(this.input, this.pos, this.opts);
    if (!nextType) return null;

    switch (nextType) {
      case TokenType.Text:
        return this.readText();
      case TokenType.Comment:
        return this.readComment();
      case TokenType.Brace:
        return this.readBrace();
      case TokenType.Bracket:
        return this.readBracket();
      case TokenType.MathDelim:
        return this.readMathToken();
      case TokenType.Input:
        return this.readInputCommand();
      case TokenType.ConditionDeclaration:
        return this.readIfDeclaration();
      case TokenType.Condition:
        return this.readConditionToken();
      case TokenType.Environment:
        return this.readEnvironment();
      case TokenType.Command:
        return this.readControlSequence();
      default:
        throw new Error(`Unhandled token type in lexer: ${nextType}`);
    }
  }

  private readComment(): Token {
    const start = this.pos;
    const envC = !(this.input[this.pos] == '%');
    const remainder = this.input.slice(start);
    const re = envC ? /\r?\n\\end\{comment\}\r?\n/ : /\r?\n/;
    const m = re.exec(remainder);
    let end: number;
    if (m) {
      end = start + m.index;
      // Include the terminator in the comment text (match[0] is the terminator)
      end += m[0].length - 1;
    } else {
      // No terminator found -> consume to EOF (preserve previous behaviour)
      end = this.input.length;
    }

    this.pos = end + 1;
    return {
      type: TokenType.Comment,
      name: envC ? 'env-comment' : '%',
      start,
      end,
      line: this.getLineForIndex(start),
    };
  }

  private readBrace(): Token {
    const ch = this.input[this.pos];
    const start = this.pos;
    const line = this.getLineForIndex(start);
    this.pos++;
    return { type: TokenType.Brace, name: ch, start, end: this.pos - 1, line };
  }

  private readBracket(): Token {
    const ch = this.input[this.pos];
    const start = this.pos;
    const line = this.getLineForIndex(start);
    this.pos++;
    return { type: TokenType.Bracket, name: ch, start, end: this.pos - 1, line };
  }

  private readMathToken(): Token {
    const curr = this.input[this.pos];
    const next = this.input[this.pos + 1];
    if (curr != '$' && (curr != '\\' || !MATH_DELIM_COMMANDS.has(next))) {
      throw new Error(`Expected math delimiter at position ${this.pos}`);
    }
    const len = curr === '$' && next !== '$' ? 1 : 2;
    const start = this.pos;
    this.pos += len;
    return {
      type: TokenType.MathDelim,
      start,
      end: this.pos - 1,
      line: this.getLineForIndex(start),
      name: this.input.slice(start, this.pos),
    };
  }

  private readControlSequence(): Token {
    const start = this.pos;
    const line = this.getLineForIndex(start);
    const name = this.parseControlSequenceName();
    const commandEndExclusive = this.pos;
    let token = { type: TokenType.Command, name, start, end: commandEndExclusive - 1, line };

    const c = this.input[this.pos - 1];
    if (!MATH_DELIM_COMMANDS.has(name) && c !== '}') this.suppressSingleTrailingWhitespace();
    const finalEnd = this.pos > start ? this.pos - 1 : start;
    token.end = Math.max(token.end, finalEnd);
    return token;
  }

  private readConditionToken(): Token {
    const start = this.pos;
    const line = this.getLineForIndex(start);
    let name = this.parseControlSequenceName();
    this.suppressSingleTrailingWhitespace();

    let condition = undefined;
    if (name.startsWith('if')) {
      condition = name.slice(2);
      name = 'if';
    }
    return {
      type: TokenType.Condition,
      name,
      condition,
      start,
      end: this.pos - 1,
      line,
    };
  }

  private readInputCommand(): Token {
    const start = this.pos;
    const name = this.parseControlSequenceName();
    if (name !== 'input') {
      throw new Error(`Expected input command at position ${start}`);
    }
    const { name: envName, end } = this.parseEnvName();
    return {
      type: TokenType.Input,
      name,
      path: envName,
      start: start,
      end: end,
      line: this.getLineForIndex(start),
    };
  }

  private readIfDeclaration(): Token {
    const start = this.pos;
    const name = this.parseControlSequenceName();
    if (name !== 'newif') {
      throw new Error(`Expected newif command at position ${start}`);
    }
    const afterNewIfPos = this.pos;
    this.parseWhitespace();

    if (this.pos >= this.input.length || this.input[this.pos] !== '\\') {
      throw new Error(`Expected condition name after \\newif at position ${afterNewIfPos}`);
    }
    this.pos++;
    if (this.pos >= this.input.length) {
      throw new Error(`Expected condition name after \\newif at position ${afterNewIfPos}`);
    }
    const firstCharPos = this.pos++;
    if (!/^[a-zA-Z@]$/.test(this.input[firstCharPos])) {
      throw new Error(`Invalid condition name after \\newif at position ${afterNewIfPos}`);
    }

    while (this.pos < this.input.length && /[a-zA-Z@]/.test(this.input[this.pos])) this.pos++;
    const commandName = this.input.slice(firstCharPos, this.pos);
    if (!commandName.startsWith('if')) {
      throw new Error(
        `Invalid condition name "${commandName}" after \\newif at position ${afterNewIfPos}`
      );
    }

    const conditionName = commandName.slice(2);
    this.parseWhitespace(false);

    if (
      this.pos < this.input.length - 1 &&
      this.input[this.pos] === '\r' &&
      this.input[this.pos + 1] === '\n'
    ) {
      this.pos++;
    }
    if (this.pos < this.input.length && this.input[this.pos] === '\n') {
      this.pos++;
    }

    return {
      type: TokenType.ConditionDeclaration,
      name: conditionName,
      start,
      end: this.pos - 1,
      line: this.getLineForIndex(start),
    };
  }

  private readEnvironment(): Token {
    const start = this.pos;
    const name = this.parseControlSequenceName();
    if (name !== 'begin' && name !== 'end') {
      throw new Error(`Expected begin or end command at position ${start}`);
    }
    const isBegin = name === 'begin';
    this.parseWhitespace();
    if (this.pos >= this.input.length) {
      throw new Error(`Unexpected end of input after \\${name} at position ${start}`);
    }
    const { name: envName, end } = this.parseEnvName();
    return {
      type: TokenType.Environment,
      name: envName,
      isBegin,
      start,
      end,
      line: this.getLineForIndex(start),
    };
  }

  private readText(): Token {
    const start = this.pos;
    const line = this.getLineForIndex(start);
    while (this.pos < this.input.length) {
      const c = this.input[this.pos];
      if (this.pos > start && TEXT_END_CHARS.has(c)) break;
      if (c === '\\') {
        const nextChar = this.pos + 1 < this.input.length ? this.input[this.pos + 1] : null;
        if (this.pos > start && nextChar && !isEscapablePair(nextChar)) break;
        this.pos += 2; // consume escaped pair as text
        continue;
      }
      this.pos++;
    }
    const currToken = {
      type: TokenType.Text,
      start,
      end: this.pos > start ? this.pos - 1 : start - 1,
      line,
    };
    while (peekNextTokenType(this.input, this.pos, this.opts) === TokenType.Text) {
      const nextToken = this.readText();
      currToken.end = nextToken.end;
    }
    return currToken;
  }

  private suppressSingleTrailingWhitespace() {
    if (this.pos >= this.input.length) return;
    const ch = this.input[this.pos];
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      this.pos++;
      return;
    }
    if (ch === '\r') {
      this.pos++;
      if (this.pos < this.input.length && this.input[this.pos] === '\n') {
        this.pos++;
      }
      return;
    }
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
