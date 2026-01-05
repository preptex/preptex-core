import { Parser } from './parse/parser.js';
import { CoreOptions, InputCmdHandling, type ParseOptions } from './options.js';
import { transform as renderAst, type Transformer } from './transform/transform.js';
import { filterConditions, suppressComments } from './transform/transformers.js';
import type { AstRoot } from './parse/types.js';
import { Lexer, LexerOptions } from './lexer/tokens.js';
import { sanityCheck } from './parse/sanity.js';

export type VersionedTextFile = {
  text: string;
  version: number;
};

export type ProjectFile = {
  root: AstRoot;
  version: number;
  declaredConditions: ReadonlySet<string>;
};

export class Project {
  private files: Record<string, ProjectFile>;

  constructor(files: Record<string, ProjectFile>) {
    this.files = { ...files };
  }

  getFiles(): Readonly<Record<string, ProjectFile>> {
    // Return a snapshot to discourage external mutation.
    return Object.freeze({ ...this.files });
  }

  mergeFrom(other: Project): void {
    for (const [name, file] of Object.entries(other.files)) {
      const existing = this.files[name];
      if (!existing) {
        this.files[name] = file;
        continue;
      }

      // Prefer the higher version; if equal, prefer `other`.
      this.files[name] = file.version >= existing.version ? file : existing;
    }
  }

  getRoots(): Readonly<Record<string, AstRoot>> {
    const roots: Record<string, AstRoot> = {};
    for (const [name, file] of Object.entries(this.files)) {
      roots[name] = file.root;
    }
    return roots;
  }

  getRoot(name: string): AstRoot {
    const f = this.files[name];
    if (!f) {
      throw new Error(`Project root not found for file ${name}`);
    }
    return f.root;
  }

  getFileNames(): Readonly<string[]> {
    return Object.keys(this.files);
  }

  getDeclaredConditions(): ReadonlySet<string> {
    const all = new Set<string>();
    for (const f of Object.values(this.files)) {
      for (const c of f.declaredConditions) all.add(c);
    }
    return all;
  }
}

export function process(
  files: Record<string, VersionedTextFile>,
  lexerOptions: LexerOptions = {} as LexerOptions,
  parseOptions: ParseOptions = {} as ParseOptions
): Project {
  if (!files || typeof files !== 'object') {
    throw new Error('process() requires a record of filename -> {text, version}');
  }

  const parsed: Record<string, ProjectFile> = {};

  for (const [file, input] of Object.entries(files)) {
    const version = Number((input as any)?.version ?? 0);
    if (!Number.isFinite(version)) {
      throw new Error(`Invalid version for ${file}: ${String((input as any)?.version)}`);
    }
    const text = String((input as any)?.text ?? '');

    const sanity = sanityCheck(text, lexerOptions);
    const lexer = new Lexer(text, sanity.lexerOptions);

    const fileParser = new Parser(parseOptions);
    fileParser.parse(lexer, text);

    parsed[file] = {
      root: fileParser.getRoot(),
      version,
      declaredConditions: new Set(fileParser.getDeclaredConditions()),
    };
  }

  return new Project(parsed);
}

export function combine_project(a: Project, b: Project): Project {
  a.mergeFrom(b);
  return a;
}

export function transform(
  entry: string,
  project: Project,
  options: CoreOptions = {} as CoreOptions
): Record<string, string> {
  if (!entry) {
    throw new Error('Missing required entry filename');
  }

  const transformers: Transformer[] = [];
  if (options.suppressComments) {
    transformers.push(suppressComments);
  }

  if (options.ifDecisions) {
    transformers.push(filterConditions(options.ifDecisions, project.getDeclaredConditions()));
  }

  const roots = project.getRoots();
  const entryRoot = project.getRoot(entry);

  // Recursive: emit outputs for all project files (no flattening).
  if (options.handleInputCmd === InputCmdHandling.RECURSIVE) {
    const outputs: Record<string, string> = {};
    for (const [file, ast] of Object.entries(roots)) {
      outputs[file] = renderAst(ast, transformers);
    }
    return outputs;
  }

  // Flatten: inline referenced files starting from the entry.
  if (options.handleInputCmd === InputCmdHandling.FLATTEN) {
    return {
      [entry]: renderAst(entryRoot, transformers, roots, { flatten: true }),
    };
  }

  // Default: transform only the entry.
  return {
    [entry]: renderAst(entryRoot, transformers),
  };
}
