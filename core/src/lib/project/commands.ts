import type {
  CustomCommandSignature,
  NormalizedViewConfiguration,
  ProjectSnapshot,
  ReachedFact,
  SourceToken,
} from '../../project-types.js';
import {
  readBracedGroupTokens,
  readOptionalBracketTokens,
  skipTriviaTokens,
  type BracedGroupTokenMatch,
  type OptionalBracketTokenMatch,
} from './tokenize.js';

export interface CommandParameterSpec {
  readonly kind: 'optional' | 'mandatory';
  readonly form: 'braced' | 'tex-arg';
  readonly opaque: boolean;
}

export interface CommandSignature {
  readonly name: string;
  readonly allowStar: boolean;
  readonly role: 'command' | 'section' | 'environment-delimiter' | 'input';
  readonly sectionLevel?: 1 | 2 | 3 | 4 | 5;
  readonly params: readonly CommandParameterSpec[];
}

export interface EnvironmentSignature {
  readonly name: string;
  readonly params: readonly CommandParameterSpec[];
}

const OPT_OPAQUE: CommandParameterSpec = { kind: 'optional', form: 'braced', opaque: true };
const OPT_TEXT: CommandParameterSpec = { kind: 'optional', form: 'tex-arg', opaque: false };
const BRACED_OPAQUE: CommandParameterSpec = { kind: 'mandatory', form: 'braced', opaque: true };
const TEX_ARG_OPAQUE: CommandParameterSpec = { kind: 'mandatory', form: 'tex-arg', opaque: true };
const TEX_ARG_TEXT: CommandParameterSpec = { kind: 'mandatory', form: 'tex-arg', opaque: false };

const SIGNATURE_LIST: readonly CommandSignature[] = [
  // Sections (level 1..5 hierarchical containers)
  {
    name: 'section',
    allowStar: true,
    role: 'section',
    sectionLevel: 1,
    params: [OPT_TEXT, TEX_ARG_TEXT],
  },
  {
    name: 'subsection',
    allowStar: true,
    role: 'section',
    sectionLevel: 2,
    params: [OPT_TEXT, TEX_ARG_TEXT],
  },
  {
    name: 'subsubsection',
    allowStar: true,
    role: 'section',
    sectionLevel: 3,
    params: [OPT_TEXT, TEX_ARG_TEXT],
  },
  {
    name: 'paragraph',
    allowStar: true,
    role: 'section',
    sectionLevel: 4,
    params: [OPT_TEXT, TEX_ARG_TEXT],
  },
  {
    name: 'subparagraph',
    allowStar: true,
    role: 'section',
    sectionLevel: 5,
    params: [OPT_TEXT, TEX_ARG_TEXT],
  },

  // Environment delimiters & inputs
  { name: 'begin', allowStar: false, role: 'environment-delimiter', params: [BRACED_OPAQUE] },
  { name: 'end', allowStar: false, role: 'environment-delimiter', params: [BRACED_OPAQUE] },
  { name: 'input', allowStar: false, role: 'input', params: [BRACED_OPAQUE] },

  // Stored keys, references, citations, preamble, and links
  { name: 'label', allowStar: false, role: 'command', params: [BRACED_OPAQUE] },
  { name: 'ref', allowStar: false, role: 'command', params: [BRACED_OPAQUE] },
  { name: 'pageref', allowStar: false, role: 'command', params: [BRACED_OPAQUE] },
  { name: 'eqref', allowStar: false, role: 'command', params: [BRACED_OPAQUE] },
  { name: 'autoref', allowStar: true, role: 'command', params: [BRACED_OPAQUE] },
  { name: 'cref', allowStar: true, role: 'command', params: [BRACED_OPAQUE] },
  { name: 'Cref', allowStar: true, role: 'command', params: [BRACED_OPAQUE] },
  {
    name: 'documentclass',
    allowStar: false,
    role: 'command',
    params: [OPT_OPAQUE, BRACED_OPAQUE],
  },
  {
    name: 'usepackage',
    allowStar: false,
    role: 'command',
    params: [OPT_OPAQUE, BRACED_OPAQUE, OPT_OPAQUE],
  },
  {
    name: 'RequirePackage',
    allowStar: false,
    role: 'command',
    params: [OPT_OPAQUE, BRACED_OPAQUE, OPT_OPAQUE],
  },
  {
    name: 'cite',
    allowStar: true,
    role: 'command',
    params: [OPT_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE],
  },
  {
    name: 'citep',
    allowStar: true,
    role: 'command',
    params: [OPT_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE],
  },
  {
    name: 'citet',
    allowStar: true,
    role: 'command',
    params: [OPT_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE],
  },
  {
    name: 'Citep',
    allowStar: true,
    role: 'command',
    params: [OPT_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE],
  },
  {
    name: 'Citet',
    allowStar: true,
    role: 'command',
    params: [OPT_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE],
  },
  {
    name: 'citeauthor',
    allowStar: true,
    role: 'command',
    params: [OPT_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE],
  },
  {
    name: 'citeyear',
    allowStar: true,
    role: 'command',
    params: [OPT_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE],
  },
  {
    name: 'bibliography',
    allowStar: false,
    role: 'command',
    params: [BRACED_OPAQUE],
  },
  {
    name: 'bibliographystyle',
    allowStar: false,
    role: 'command',
    params: [BRACED_OPAQUE],
  },
  {
    name: 'addbibresource',
    allowStar: false,
    role: 'command',
    params: [OPT_OPAQUE, BRACED_OPAQUE],
  },
  {
    name: 'bibitem',
    allowStar: false,
    role: 'command',
    params: [OPT_OPAQUE, BRACED_OPAQUE],
  },
  { name: 'keywords', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'affil', allowStar: false, role: 'command', params: [OPT_OPAQUE, TEX_ARG_TEXT] },
  { name: 'institute', allowStar: false, role: 'command', params: [OPT_OPAQUE, TEX_ARG_TEXT] },
  { name: 'email', allowStar: false, role: 'command', params: [BRACED_OPAQUE] },
  { name: 'and', allowStar: false, role: 'command', params: [] },
  { name: 'operatorname', allowStar: true, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'text', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'maketitle', allowStar: false, role: 'command', params: [] },
  { name: 'tableofcontents', allowStar: false, role: 'command', params: [] },
  { name: 'appendix', allowStar: false, role: 'command', params: [] },
  { name: 'url', allowStar: false, role: 'command', params: [BRACED_OPAQUE] },
  { name: 'href', allowStar: false, role: 'command', params: [BRACED_OPAQUE, TEX_ARG_TEXT] },
  {
    name: 'includegraphics',
    allowStar: true,
    role: 'command',
    params: [OPT_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE],
  },

  // Document metadata, structural headings (non-level-1..5), and formatting
  { name: 'part', allowStar: true, role: 'command', params: [OPT_TEXT, TEX_ARG_TEXT] },
  { name: 'chapter', allowStar: true, role: 'command', params: [OPT_TEXT, TEX_ARG_TEXT] },
  { name: 'title', allowStar: false, role: 'command', params: [OPT_TEXT, TEX_ARG_TEXT] },
  { name: 'author', allowStar: false, role: 'command', params: [OPT_TEXT, TEX_ARG_TEXT] },
  { name: 'date', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'caption', allowStar: true, role: 'command', params: [OPT_TEXT, TEX_ARG_TEXT] },
  { name: 'footnote', allowStar: false, role: 'command', params: [OPT_TEXT, TEX_ARG_TEXT] },
  { name: 'thanks', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'textbf', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'textit', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'textrm', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'textsf', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'texttt', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'textsc', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'textsl', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'textmd', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'textup', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'emph', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'underline', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'textsuperscript', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'textsubscript', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  { name: 'mbox', allowStar: false, role: 'command', params: [TEX_ARG_TEXT] },
  {
    name: 'textcolor',
    allowStar: false,
    role: 'command',
    params: [OPT_OPAQUE, BRACED_OPAQUE, TEX_ARG_TEXT],
  },
  {
    name: 'colorbox',
    allowStar: false,
    role: 'command',
    params: [OPT_OPAQUE, BRACED_OPAQUE, TEX_ARG_TEXT],
  },
  { name: 'frac', allowStar: false, role: 'command', params: [TEX_ARG_TEXT, TEX_ARG_TEXT] },
  { name: 'dfrac', allowStar: false, role: 'command', params: [TEX_ARG_TEXT, TEX_ARG_TEXT] },
  { name: 'tfrac', allowStar: false, role: 'command', params: [TEX_ARG_TEXT, TEX_ARG_TEXT] },
  { name: 'sqrt', allowStar: false, role: 'command', params: [OPT_TEXT, TEX_ARG_TEXT] },
  { name: 'hspace', allowStar: true, role: 'command', params: [TEX_ARG_OPAQUE] },
  { name: 'vspace', allowStar: true, role: 'command', params: [TEX_ARG_OPAQUE] },
  {
    name: 'parbox',
    allowStar: false,
    role: 'command',
    params: [OPT_OPAQUE, OPT_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE, TEX_ARG_TEXT],
  },
  {
    name: 'makebox',
    allowStar: false,
    role: 'command',
    params: [OPT_OPAQUE, OPT_OPAQUE, TEX_ARG_TEXT],
  },
  { name: 'item', allowStar: false, role: 'command', params: [OPT_TEXT] },
  { name: '\\', allowStar: true, role: 'command', params: [OPT_OPAQUE] },
];

const SIGNATURES = new Map<string, CommandSignature>(SIGNATURE_LIST.map((s) => [s.name, s]));

const ENVIRONMENT_SIGNATURE_LIST: readonly EnvironmentSignature[] = [
  { name: 'theorem', params: [OPT_TEXT] },
  { name: 'lemma', params: [OPT_TEXT] },
  { name: 'proposition', params: [OPT_TEXT] },
  { name: 'corollary', params: [OPT_TEXT] },
  { name: 'definition', params: [OPT_TEXT] },
  { name: 'remark', params: [OPT_TEXT] },
  { name: 'example', params: [OPT_TEXT] },
  { name: 'proof', params: [OPT_TEXT] },
  { name: 'figure', params: [OPT_OPAQUE] },
  { name: 'figure*', params: [OPT_OPAQUE] },
  { name: 'table', params: [OPT_OPAQUE] },
  { name: 'table*', params: [OPT_OPAQUE] },
  { name: 'itemize', params: [OPT_OPAQUE] },
  { name: 'enumerate', params: [OPT_OPAQUE] },
  { name: 'description', params: [OPT_OPAQUE] },
  { name: 'tabular', params: [OPT_OPAQUE, BRACED_OPAQUE] },
  { name: 'tabular*', params: [BRACED_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE] },
  { name: 'array', params: [OPT_OPAQUE, BRACED_OPAQUE] },
  { name: 'minipage', params: [OPT_OPAQUE, OPT_OPAQUE, OPT_OPAQUE, BRACED_OPAQUE] },
  { name: 'multicols', params: [BRACED_OPAQUE] },
  { name: 'frame', params: [OPT_OPAQUE, OPT_TEXT] },
  { name: 'lstlisting', params: [OPT_OPAQUE] },
];

const ENVIRONMENT_SIGNATURES = new Map<string, EnvironmentSignature>(
  ENVIRONMENT_SIGNATURE_LIST.map((s) => [s.name, s])
);

export function getCommandSignature(name: string): CommandSignature | undefined {
  return SIGNATURES.get(name);
}

export function getBuiltinEnvironmentSignature(name: string): EnvironmentSignature | undefined {
  return ENVIRONMENT_SIGNATURES.get(name);
}

export function customSignatureToCommandSignature(sig: CustomCommandSignature): CommandSignature {
  let params: readonly CommandParameterSpec[];
  if (sig.params) {
    params = sig.params;
  } else {
    const optCount = sig.optionalArgs ?? 0;
    const mandCount = sig.mandatoryArgs;
    const optSpec = sig.opaque ? OPT_OPAQUE : OPT_TEXT;
    const mandSpec = sig.opaque ? BRACED_OPAQUE : TEX_ARG_TEXT;
    const built: CommandParameterSpec[] = [];
    for (let i = 0; i < optCount; i++) built.push(optSpec);
    for (let i = 0; i < mandCount; i++) built.push(mandSpec);
    params = built;
  }
  return {
    name: sig.name,
    allowStar: sig.allowStar ?? true,
    role: 'command',
    params,
  };
}

export function inferDefinitionSignature(
  snapshot: ProjectSnapshot,
  path: string,
  form: string,
  name: string,
  starred: boolean,
  argRanges: readonly { readonly start: number; readonly end: number }[]
): CommandSignature | null {
  const file = snapshot.files.find((f) => f.path === path);
  if (!file) return null;
  if (form === 'def') {
    if (argRanges.length === 0) {
      return { name, allowStar: starred, role: 'command', params: [] };
    }
    const paramText = file.source.slice(argRanges[0]!.start, argRanges[0]!.end + 1);
    const match = /^(?:#([1-9]))+$/.exec(paramText);
    if (!match) return null;
    const indices = [...paramText.matchAll(/#([1-9])/g)].map((m) => Number(m[1]));
    for (let idx = 0; idx < indices.length; idx++) {
      if (indices[idx] !== idx + 1) return null;
    }
    const params: CommandParameterSpec[] = indices.map(() => TEX_ARG_TEXT);
    return { name, allowStar: starred, role: 'command', params };
  }
  if (argRanges.length === 0) {
    return { name, allowStar: true, role: 'command', params: [] };
  }
  const countText = file.source.slice(argRanges[0]!.start, argRanges[0]!.end + 1).trim();
  if (!/^[0-9]$/.test(countText)) return null;
  const total = Number(countText);
  const hasOptional = argRanges.length >= 2 && total >= 1;
  const params: CommandParameterSpec[] = [];
  if (hasOptional) params.push(OPT_TEXT);
  const mandCount = hasOptional ? total - 1 : total;
  for (let i = 0; i < mandCount; i++) params.push(TEX_ARG_TEXT);
  return { name, allowStar: true, role: 'command', params };
}

export function resolveCommandSignatures(
  snapshot: ProjectSnapshot,
  config: NormalizedViewConfiguration,
  reachedFacts?: readonly ReachedFact[]
): ReadonlyMap<string, CommandSignature> {
  const map = new Map<string, CommandSignature>(SIGNATURES);
  if (config.inferDefinedCommands) {
    const facts = reachedFacts
      ? reachedFacts.map((r) => r.fact)
      : snapshot.files.flatMap((f) => f.facts);
    for (const fact of facts) {
      if (fact.kind !== 'definition' || !fact.name) continue;
      if (SIGNATURES.get(fact.name)?.role && SIGNATURES.get(fact.name)!.role !== 'command') {
        continue;
      }
      const inferred = inferDefinitionSignature(
        snapshot,
        fact.path,
        fact.form,
        fact.name,
        fact.starred,
        fact.arguments
      );
      if (inferred) map.set(fact.name, inferred);
    }
  }
  for (const custom of config.customCommands) {
    map.set(custom.name, customSignatureToCommandSignature(custom));
  }
  return map;
}

export function sectionLevel(name: string): 1 | 2 | 3 | 4 | 5 | undefined {
  const sig = SIGNATURES.get(name);
  return sig?.role === 'section' ? sig.sectionLevel : undefined;
}

/** Length in UTF-16 code units of the single code point starting at `offset`. */
export function firstCodePointLength(text: string, offset: number): number {
  const cp = text.codePointAt(offset);
  return cp !== undefined && cp > 0xffff ? 2 : 1;
}

export interface ScannedCommandArg {
  readonly slot: number;
  readonly spec: CommandParameterSpec;
  readonly startIndex: number;
  readonly startCharOffset: number;
  readonly endIndex: number;
  readonly endCharOffset: number;
  readonly innerStartIndex: number;
  readonly innerEndIndex: number;
  readonly start: number;
  readonly end: number;
  readonly innerStart: number;
  readonly innerEnd: number;
  readonly braced: BracedGroupTokenMatch | null;
  readonly optional: OptionalBracketTokenMatch | null;
}

export interface ScannedCommandCall {
  readonly signature: CommandSignature;
  readonly starred: boolean;
  readonly args: readonly ScannedCommandArg[];
  readonly nextIndex: number;
  readonly nextCharOffset: number;
  readonly endIndex: number;
  readonly endCharOffset: number;
  readonly missingMandatory: boolean;
}

/**
 * Scan arguments of a known command over `tokens` starting after `commandIndex`.
 * Stops cleanly without unbounded lookahead when a required argument is absent.
 */
export function scanCommandTokens(
  tokens: readonly SourceToken[],
  commandIndex: number,
  signature: CommandSignature,
  untilIndex = tokens.length,
  options: { readonly stopBeforeNonOpaque?: boolean } = {}
): ScannedCommandCall {
  let cursor = commandIndex + 1;
  let charOffset = 0;
  let starred = false;
  let lastIndex = commandIndex;
  let lastCharOffset = tokens[commandIndex]!.value.length - 1;

  if (signature.allowStar) {
    const starIdx = skipTriviaTokens(tokens, cursor, untilIndex);
    if (
      starIdx < untilIndex &&
      tokens[starIdx]!.kind === 'text' &&
      tokens[starIdx]!.value.startsWith('*')
    ) {
      starred = true;
      lastIndex = starIdx;
      lastCharOffset = 0;
      if (tokens[starIdx]!.value.length > 1) {
        cursor = starIdx;
        charOffset = 1;
      } else {
        cursor = starIdx + 1;
        charOffset = 0;
      }
    }
  }

  const args: ScannedCommandArg[] = [];
  let missingMandatory = false;

  for (let slot = 0; slot < signature.params.length; slot++) {
    const spec = signature.params[slot]!;
    if (options.stopBeforeNonOpaque && !spec.opaque) break;

    if (spec.kind === 'optional') {
      const opt = readOptionalBracketTokens(tokens, cursor, untilIndex, charOffset);
      if (!opt) continue;
      args.push({
        slot,
        spec,
        startIndex: opt.startIndex,
        startCharOffset: opt.startCharOffset,
        endIndex: opt.endIndex,
        endCharOffset: opt.endCharOffset,
        innerStartIndex: opt.innerStartIndex,
        innerEndIndex: opt.innerEndIndex,
        start: opt.start,
        end: opt.end,
        innerStart: opt.innerStart,
        innerEnd: opt.innerEnd,
        braced: null,
        optional: opt,
      });
      lastIndex = opt.endIndex;
      lastCharOffset = opt.endCharOffset;
      cursor = opt.nextIndex;
      charOffset = opt.nextCharOffset;
      continue;
    }

    if (charOffset > 0) {
      const tok = tokens[cursor]!;
      if (spec.form === 'braced') {
        missingMandatory = true;
        break;
      }
      const len = firstCodePointLength(tok.value, charOffset);
      const start = tok.range.start + charOffset;
      const end = start + len;
      args.push({
        slot,
        spec,
        startIndex: cursor,
        startCharOffset: charOffset,
        endIndex: cursor,
        endCharOffset: charOffset + len - 1,
        innerStartIndex: cursor,
        innerEndIndex: cursor - 1,
        start,
        end,
        innerStart: start,
        innerEnd: end - 1,
        braced: null,
        optional: null,
      });
      lastIndex = cursor;
      lastCharOffset = charOffset + len - 1;
      if (charOffset + len < tok.value.length) {
        charOffset += len;
      } else {
        cursor++;
        charOffset = 0;
      }
      continue;
    }

    const pos = skipTriviaTokens(tokens, cursor, untilIndex);
    if (pos >= untilIndex) {
      missingMandatory = true;
      break;
    }
    const tok = tokens[pos]!;
    if (tok.kind === 'open') {
      const grp = readBracedGroupTokens(tokens, pos, untilIndex);
      if (!grp) {
        missingMandatory = true;
        break;
      }
      args.push({
        slot,
        spec,
        startIndex: grp.openIndex,
        startCharOffset: 0,
        endIndex: grp.closeIndex,
        endCharOffset: 0,
        innerStartIndex: grp.innerStartIndex,
        innerEndIndex: grp.innerEndIndex,
        start: grp.start,
        end: grp.end,
        innerStart: grp.innerStart,
        innerEnd: grp.innerEnd,
        braced: grp,
        optional: null,
      });
      lastIndex = grp.closeIndex;
      lastCharOffset = 0;
      cursor = grp.nextIndex;
      charOffset = 0;
      continue;
    }

    if (spec.form === 'braced') {
      missingMandatory = true;
      break;
    }

    if (tok.kind === 'command') {
      args.push({
        slot,
        spec,
        startIndex: pos,
        startCharOffset: 0,
        endIndex: pos,
        endCharOffset: tok.value.length - 1,
        innerStartIndex: pos + 1,
        innerEndIndex: pos - 1,
        start: tok.range.start,
        end: tok.range.end + 1,
        innerStart: tok.range.start,
        innerEnd: tok.range.end,
        braced: null,
        optional: null,
      });
      lastIndex = pos;
      lastCharOffset = tok.value.length - 1;
      cursor = pos + 1;
      charOffset = 0;
      continue;
    }

    if (tok.kind === 'text') {
      const len = firstCodePointLength(tok.value, 0);
      const start = tok.range.start;
      const end = start + len;
      args.push({
        slot,
        spec,
        startIndex: pos,
        startCharOffset: 0,
        endIndex: pos,
        endCharOffset: len - 1,
        innerStartIndex: pos,
        innerEndIndex: pos - 1,
        start,
        end,
        innerStart: start,
        innerEnd: end - 1,
        braced: null,
        optional: null,
      });
      lastIndex = pos;
      lastCharOffset = len - 1;
      if (len < tok.value.length) {
        cursor = pos;
        charOffset = len;
      } else {
        cursor = pos + 1;
        charOffset = 0;
      }
      continue;
    }

    missingMandatory = true;
    break;
  }

  return {
    signature,
    starred,
    args,
    nextIndex: cursor,
    nextCharOffset: charOffset,
    endIndex: lastIndex,
    endCharOffset: lastCharOffset,
    missingMandatory,
  };
}
