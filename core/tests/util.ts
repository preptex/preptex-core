import { Lexer, type Token } from '../src/lib/parse/tokens';

// Collect all tokens with full data as produced by the lexer
export function collectPairs(lex: Lexer): Token[] {
  const out: Token[] = [];
  let t: Token | null;
  while ((t = lex.next())) out.push(t);
  return out;
}
