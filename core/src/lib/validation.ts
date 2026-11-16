import type { ProjectFilePath } from '../api-types.js';
import { PrepTexError, PrepTexErrorCode } from '../errors.js';
import { normalizeVirtualPath } from './virtual-path.js';

function invalidArgument(message: string): never {
  throw new PrepTexError(message, PrepTexErrorCode.InvalidArgument);
}

function requireString(value: unknown, label: string, allowEmpty = true): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    invalidArgument(`${label} must be ${allowEmpty ? 'a string' : 'a non-empty string'}.`);
  }
  return value;
}

/** Normalizes and validates a public virtual project path. */
export function normalizeProjectFilePath(
  value: unknown,
  label: string,
  allowDefaultInputPath = false
): ProjectFilePath {
  const path = requireString(value, label, false);
  if (path.trim().length === 0) invalidArgument(`${label} must not contain only whitespace.`);
  if (path.includes('\0') || /^(?:[a-zA-Z]:|[\\/])/.test(path)) {
    invalidArgument(`${label} must be a project-relative path.`);
  }
  if (allowDefaultInputPath && path === '<input>') return path;
  const normalized = normalizeVirtualPath(path);
  if (!normalized) invalidArgument(`${label} escapes the virtual project root.`);
  return normalized;
}
