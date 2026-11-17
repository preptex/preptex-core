export function normalizeVirtualPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return '';
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

export function virtualDirname(path: string): string {
  const normalized = normalizeVirtualPath(path);
  const separator = normalized.lastIndexOf('/');
  return separator < 0 ? '' : normalized.slice(0, separator);
}

export function withTexExtension(path: string): string {
  return path.toLowerCase().endsWith('.tex') ? path : `${path}.tex`;
}

export type ResolvedVirtualInput =
  | { readonly status: 'invalid-path'; readonly matches: readonly [] }
  | { readonly status: 'missing' | 'present' | 'ambiguous'; readonly matches: readonly string[] };

/**
 * Resolve a relative LaTeX `\input` target against the current file directory first,
 * falling back to the entry document directory and virtual project root.
 */
export function resolveVirtualInputPath(
  rawPath: string,
  currentFilePath: string,
  entryFilePath: string,
  hasFile: (path: string) => boolean
): ResolvedVirtualInput {
  if (!rawPath || /^(?:[\\/]|[A-Za-z]:)/.test(rawPath) || rawPath.includes('\0')) {
    return { status: 'invalid-path', matches: [] };
  }
  const currentBase = virtualDirname(currentFilePath);
  const relCurrent = normalizeVirtualPath(currentBase ? `${currentBase}/${rawPath}` : rawPath);
  if (!relCurrent) {
    return { status: 'invalid-path', matches: [] };
  }
  const currentMatches = [...new Set([relCurrent, withTexExtension(relCurrent)])].filter(hasFile);
  if (currentMatches.length > 0) {
    return {
      status: currentMatches.length === 1 ? 'present' : 'ambiguous',
      matches: currentMatches,
    };
  }

  const entryBase = virtualDirname(entryFilePath);
  if (entryBase !== currentBase && !rawPath.startsWith('.')) {
    const relEntry = normalizeVirtualPath(entryBase ? `${entryBase}/${rawPath}` : rawPath);
    if (relEntry) {
      const entryMatches = [...new Set([relEntry, withTexExtension(relEntry)])].filter(hasFile);
      if (entryMatches.length > 0) {
        return {
          status: entryMatches.length === 1 ? 'present' : 'ambiguous',
          matches: entryMatches,
        };
      }
    }
  }

  if (entryBase !== '' && !rawPath.startsWith('.')) {
    const relRoot = normalizeVirtualPath(rawPath);
    if (relRoot) {
      const rootMatches = [...new Set([relRoot, withTexExtension(relRoot)])].filter(hasFile);
      if (rootMatches.length > 0) {
        return {
          status: rootMatches.length === 1 ? 'present' : 'ambiguous',
          matches: rootMatches,
        };
      }
    }
  }

  return { status: 'missing', matches: [] };
}
