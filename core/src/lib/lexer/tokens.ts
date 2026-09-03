import { TokenType } from '../../api-types.js';

export { TokenType } from '../../api-types.js';

export const ALL_TOKEN_TYPES: ReadonlySet<TokenType> = new Set(Object.values(TokenType));

export function getAllTokenTypes(): TokenType[] {
  return [...ALL_TOKEN_TYPES];
}

export interface Token {
  type: TokenType;
  start: number;
  end: number;
  line: number;
  name?: string;
  // Commands only: true when a star immediately follows the control sequence name.
  is_starred?: boolean;
  // Section only
  level?: number;
  // Environment only: indicates begin token; false implies end
  isBegin?: boolean;
  // Input only: parsed input path
  path?: string;
  // Condition only: condition name for "if*" tokens (e.g. for "\\ifdraft" -> "draft")
  condition?: string;
}

// Single-character command names that represent math delimiters, e.g. \\[ \\] \\( \\)
const MATH_DELIM_COMMANDS = new Set(['[', ']', '(', ')']);

const ENVIRONMENT_COMMANDS = new Set(['begin', 'end']);

export interface LexerOptions {
  enabledTokens?: ReadonlySet<TokenType>;
  // When set, only section commands with level <= sectionMaxLevel are tokenized as TokenType.Section.
  // Higher-level section commands are tokenized as TokenType.Command instead.
  // Example: sectionMaxLevel=1 allows \section but suppresses \subsection and deeper.
  sectionMaxLevel?: number;
  // When true (default), backslash+letter is escapable only if the following char is NOT a letter.
  // When false, backslash+letter always starts a command.
}

function scanCommentEndExclusive(input: string, start: number): number {
  if (input[start] === '%') {
    let end = start;
    while (end < input.length && input[end] !== '\r' && input[end] !== '\n') end++;
    if (end >= input.length) return input.length;
    return input[end] === '\r' && input[end + 1] === '\n' ? end + 2 : end + 1;
  }

  const lineEnding = '(?:\\r\\n|\\r|\\n)';
  const terminator = new RegExp(`${lineEnding}\\\\end\\{comment\\}${lineEnding}`);
  const match = terminator.exec(input.slice(start));
  return match ? start + match.index + match[0].length : input.length;
}

import {
  isEscapablePair,
  isBraceTokenAt,
  isMathDelimTokenAt,
  isCommentTokenAt,
  isNewLineTokenAt,
  isControlSequenceTokenAt,
  isConditionName,
  TEXT_END_CHARS,
  readEnvName,
  readControlSequenceName,
  skipWhitespace,
} from './tokenUtils.js';
import { SECTION_COMMANDS, SECTION_LEVELS } from '../parse/constants.js';
import { ParseFailure } from '../parse/failure.js';

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
  if (isCommentTokenAt(input, start)) {
    return isEnabled(TokenType.Comment) ? TokenType.Comment : TokenType.Text;
  }
  if (isEnabled(TokenType.NewLine) && isNewLineTokenAt(input, start)) {
    return TokenType.NewLine;
  }
  if (isControlSequenceTokenAt(input, start)) {
    const name = readControlSequenceName(input, start).name;
    if (isEnabled(TokenType.Environment) && ENVIRONMENT_COMMANDS.has(name)) {
      return TokenType.Environment;
    }
    if (isEnabled(TokenType.Section) && SECTION_COMMANDS.has(name)) {
      const maxLevel = opts.sectionMaxLevel;
      const level = SECTION_LEVELS[name]!;
      if (maxLevel == null || level <= maxLevel) return TokenType.Section;
    }
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

  private parseCommandStar(): boolean {
    if (this.input[this.pos] !== '*') return false;
    this.pos++;
    return true;
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
      case TokenType.NewLine:
        return this.readNewLine();
      case TokenType.Brace:
        return this.readBrace();
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
      case TokenType.Section:
        return this.readSection();
      case TokenType.Command:
        return this.readControlSequence();
      default:
        throw new Error(`Unhandled token type in lexer: ${nextType}`);
    }
  }

  private readComment(): Token {
    const start = this.pos;
    const envC = !(this.input[this.pos] == '%');
    this.pos = scanCommentEndExclusive(this.input, start);
    return {
      type: TokenType.Comment,
      name: envC ? 'env-comment' : '%',
      start,
      end: this.pos - 1,
      line: this.getLineForIndex(start),
    };
  }

  private readNewLine(): Token {
    const start = this.pos;
    const line = this.getLineForIndex(start);
    if (
      this.input[this.pos] === '\r' &&
      this.pos + 1 < this.input.length &&
      this.input[this.pos + 1] === '\n'
    ) {
      this.pos += 2;
    } else {
      this.pos++;
    }
    return {
      type: TokenType.NewLine,
      name: this.input.slice(start, this.pos),
      start,
      end: this.pos - 1,
      line,
    };
  }

  private readBrace(): Token {
    const ch = this.input.charAt(this.pos);
    const start = this.pos;
    const line = this.getLineForIndex(start);
    this.pos++;
    return { type: TokenType.Brace, name: ch, start, end: this.pos - 1, line };
  }

  private readMathToken(): Token {
    const curr = this.input.charAt(this.pos);
    const next = this.input.charAt(this.pos + 1);
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
    const is_starred = this.parseCommandStar();
    const commandEndExclusive = this.pos;
    const token: Token = {
      type: TokenType.Command,
      name,
      is_starred,
      start,
      end: commandEndExclusive - 1,
      line,
    };

    const c = this.input[this.pos - 1];
    if (!MATH_DELIM_COMMANDS.has(name) && c !== '}') this.suppressSingleTrailingWhitespace();
    const finalEnd = this.pos > start ? this.pos - 1 : start;
    token.end = Math.max(token.end, finalEnd);
    return token;
  }

  private readSection(): Token {
    const start = this.pos;
    const name = this.parseControlSequenceName();
    const is_starred = this.parseCommandStar();
    const line = this.getLineForIndex(start);
    if (!SECTION_COMMANDS.has(name)) {
      throw new Error(`Expected section command at position ${start}`);
    }
    const level = SECTION_LEVELS[name]!;
    this.parseWhitespace();
    if (this.pos >= this.input.length) {
      throw new ParseFailure(
        `Unexpected end of input after \\${name} at position ${start}, line ${line}`,
        { position: start, line }
      );
    }
    const { name: envName, end } = this.parseEnvName();
    return {
      type: TokenType.Section,
      level,
      name: envName,
      is_starred,
      start,
      end,
      line,
    };
  }

  private readConditionToken(): Token {
    const start = this.pos;
    const line = this.getLineForIndex(start);
    let name = this.parseControlSequenceName();

    let condition = undefined;
    if (name.startsWith('if')) {
      condition = name.slice(2);
      name = 'if';
    }
    return {
      type: TokenType.Condition,
      name,
      ...(condition === undefined ? {} : { condition }),
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
    const argumentStart = skipWhitespace(this.input, this.pos);
    if (this.input[argumentStart] !== '{') {
      throw new ParseFailure(`Expected a braced input path at position ${argumentStart}`, {
        position: argumentStart,
        line: this.getLineForIndex(argumentStart),
      });
    }
    const { name: envName, end } = this.parseEnvName();
    if (!envName) {
      throw new ParseFailure(`Input path must not be empty at position ${start}`, {
        position: start,
        line: this.getLineForIndex(start),
      });
    }
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
    this.parseWhitespace(false);

    if (this.pos >= this.input.length || this.input[this.pos] !== '\\') {
      throw new ParseFailure(`Expected condition name after \\newif at position ${afterNewIfPos}`, {
        position: afterNewIfPos,
        line: this.getLineForIndex(start),
      });
    }
    this.pos++;
    if (this.pos >= this.input.length) {
      throw new ParseFailure(`Expected condition name after \\newif at position ${afterNewIfPos}`, {
        position: afterNewIfPos,
        line: this.getLineForIndex(start),
      });
    }
    const firstCharPos = this.pos++;
    if (!/^[a-zA-Z@]$/.test(this.input.charAt(firstCharPos))) {
      throw new ParseFailure(
        `Invalid condition name after \\newif: Name starts with ${this.input[firstCharPos]} at position ${afterNewIfPos}`,
        { position: firstCharPos, line: this.getLineForIndex(start) }
      );
    }

    while (this.pos < this.input.length && /[a-zA-Z@]/.test(this.input.charAt(this.pos))) {
      this.pos++;
    }
    const commandName = this.input.slice(firstCharPos, this.pos);
    if (!commandName.startsWith('if')) {
      throw new ParseFailure(
        `Invalid condition name "${commandName}" after \\newif at position ${afterNewIfPos}`,
        { position: firstCharPos, line: this.getLineForIndex(start) }
      );
    }

    const conditionName = commandName.slice(2);
    if (!conditionName) {
      throw new ParseFailure(`Expected condition name after \\newif at position ${afterNewIfPos}`, {
        position: firstCharPos,
        line: this.getLineForIndex(start),
      });
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
      throw new ParseFailure(`Unexpected end of input after \\${name} at position ${start}`, {
        position: start,
        line: this.getLineForIndex(start),
      });
    }
    if (this.input[this.pos] !== '{') {
      throw new ParseFailure(`Expected a braced environment name after \\${name}`, {
        position: this.pos,
        line: this.getLineForIndex(this.pos),
      });
    }
    const { name: envName, end } = this.parseEnvName();
    if (!envName) {
      throw new ParseFailure(`Environment name after \\${name} must not be empty`, {
        position: start,
        line: this.getLineForIndex(start),
      });
    }
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
      if (
        this.opts.enabledTokens !== undefined &&
        !this.opts.enabledTokens.has(TokenType.Comment) &&
        isCommentTokenAt(this.input, this.pos)
      ) {
        this.pos = scanCommentEndExclusive(this.input, this.pos);
        continue;
      }
      const c = this.input.charAt(this.pos);
      if (
        this.pos > start &&
        TEXT_END_CHARS.has(c) &&
        peekNextTokenType(this.input, this.pos, this.opts) !== TokenType.Text
      ) {
        break;
      }
      if (c === '\\') {
        const nextChar = this.pos + 1 < this.input.length ? this.input[this.pos + 1] : null;
        if (
          this.pos > start &&
          nextChar &&
          !isEscapablePair(nextChar) &&
          peekNextTokenType(this.input, this.pos, this.opts) !== TokenType.Text
        ) {
          break;
        }
        this.pos += nextChar === null ? 1 : 2; // consume an escaped pair or trailing backslash
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
      this.lineStarts[this.curr_line_index + 1]! <= index
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
