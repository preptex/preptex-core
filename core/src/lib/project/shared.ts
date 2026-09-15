import { PrepTexError, PrepTexErrorCode } from '../../errors.js';
import type { SourceRange } from '../../api-types.js';
import type {
  Coverage,
  ProjectIssue,
  ProjectIssueCode,
  SourceLocation,
} from '../../project-types.js';

export const CORE_VERSION = '0.3.0';
export const ASSUMPTIONS = Object.freeze([
  'Direct LaTeX syntax with ordinary catcodes; no macro expansion or package execution.',
  'Source facts are syntactic occurrences, not proof of TeX execution or absence of generated syntax.',
]);

export function invalid(message: string): never {
  throw new PrepTexError(message, PrepTexErrorCode.InvalidArgument);
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(`${label} must be a plain object.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    invalid(`${label} must be a plain object.`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor))
      invalid(`${label} must contain only enumerable data fields.`);
  }
  return value as Record<string, unknown>;
}

export function fields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) invalid(`Unknown ${label} field: ${key}.`);
}

export function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array.`);
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor)) invalid(`${label} must be a dense data array.`);
  }
  return value;
}

export function string(value: unknown, label: string): string {
  if (typeof value !== 'string') invalid(`${label} must be a string.`);
  return value;
}

export function bounded(value: unknown, fallback: number, maximum: number, label: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum)
    invalid(`${label} must be an integer from 1 to ${maximum}.`);
  return value;
}

export function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Two independent 64-bit accumulators over UTF-16, including lone surrogates.
// Identity is a deterministic cache key, never a cryptographic authorization token.
export function identity(prefix: string, value: unknown): string {
  const input = JSON.stringify(value);
  let a = 0xcbf29ce484222325n;
  let b = 0x84222325cbf29ce4n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    a = ((a ^ BigInt(input.charCodeAt(i))) * 0x100000001b3n) & mask;
    b = ((b ^ BigInt(input.charCodeAt(i))) * 0x100000001e7n) & mask;
  }
  return `${prefix}:${a.toString(16).padStart(16, '0')}${b.toString(16).padStart(16, '0')}`;
}

export function lineStarts(source: string): readonly number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\r') {
      if (source[i + 1] === '\n') i++;
      starts.push(i + 1);
    } else if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

export function rangeAt(starts: readonly number[], start: number, end: number): SourceRange {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle]! <= start) low = middle;
    else high = middle;
  }
  return { start, end, line: low + 1 };
}

export function issue(
  code: ProjectIssueCode,
  message: string,
  location: SourceLocation | null,
  severity: 'warning' | 'error' = 'warning'
): ProjectIssue {
  return { code, message, location, severity, inputChain: [] };
}

export function coverage(issues: readonly ProjectIssue[]): Coverage {
  return {
    status: issues.length ? 'partial' : 'complete',
    profile: 'direct-latex-v1',
    assumptions: ASSUMPTIONS,
    issues,
  };
}

export const PRIMITIVE_TESTS = new Set([
  'if',
  'ifcat',
  'ifnum',
  'ifdim',
  'ifodd',
  'ifvmode',
  'ifhmode',
  'ifmmode',
  'ifinner',
  'ifvoid',
  'ifhbox',
  'ifvbox',
  'ifx',
  'ifeof',
  'ifcase',
  'ifdefined',
  'ifcsname',
  'iffontchar',
  'ifincsname',
  'ifpdfprimitive',
  'ifprimitive',
  'ifabsnum',
  'ifabsdim',
]);
export const ORDINARY_IF_COMMANDS = new Set([
  'iff',
  'ifthenelse',
  'ifstrequal',
  'ifstrempty',
  'ifboolexpr',
]);
export function testKind(name: string): 'literal' | 'primitive' | 'named-candidate' | null {
  if (name === 'iftrue' || name === 'iffalse') return 'literal';
  if (PRIMITIVE_TESTS.has(name)) return 'primitive';
  if (/^if[A-Za-z]+$/.test(name) && !ORDINARY_IF_COMMANDS.has(name)) return 'named-candidate';
  return null;
}
