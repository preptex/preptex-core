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
