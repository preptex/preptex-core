import { Lexer, TokenType } from '../src/lib/parse/tokens';

export function collectPairs(lex: Lexer): Array<[TokenType, string]> {
  const out: Array<[TokenType, string]> = [];
  let t;
  while ((t = lex.next())) out.push([t.type, t.value]);
  return out;
}
