import { Parser } from './parse/parser.js';
import { CoreOptions, InputCmdHandling } from './options.js';
import { transform as renderAst, type Transformer } from './transform/transform.js';
import { filterConditions, suppressComments } from './transform/transformers.js';
import type { AstRoot } from './parse/types.js';

const SINGLE_ENTRY_ID = '__entry__';

export class Project {
  private readonly files: Record<string, AstRoot>;
  private readonly declaredConditions: Set<string>;
  private readonly recursive: boolean;
  private readonly entryPath: string;

  constructor(
    entryPath: string,
    files: Record<string, AstRoot>,
    declared: Set<string>,
    recursive: boolean
  ) {
    this.entryPath = entryPath;
    this.files = Object.freeze({ ...files });
    this.declaredConditions = new Set(declared);
    this.recursive = recursive;
  }

  get entry(): string {
    return this.entryPath;
  }

  getRoot(): AstRoot {
    const root = this.files[this.entryPath];
    if (!root) {
      throw new Error(`Project root not found for entry ${this.entryPath}`);
    }
    return root;
  }

  getFiles(): Readonly<Record<string, AstRoot>> {
    return this.files;
  }

  getFileNames(): Readonly<string[]> {
    return Object.keys(this.files);
  }

  getDeclaredConditions(): ReadonlySet<string> {
    return new Set(this.declaredConditions);
  }

  isFlattened(): boolean {
    return this.recursive;
  }
}

export function process(
  entry: string,
  readFile: (filename: string) => string,
  options: CoreOptions = {} as CoreOptions
): Project {
  const flattenInputs =
    options.handleInputCmd === InputCmdHandling.FLATTEN ||
    options.handleInputCmd === InputCmdHandling.RECURSIVE;

  if (!readFile) {
    throw new Error('Input processing requires a readFile callback');
  }

  // Non-flattening: parse only the entry file, but still treat it as a path
  if (!flattenInputs) {
    const text = readFile(entry);
    if (text === undefined || text === null) {
      throw new Error(`readFile callback returned no content for ${entry}`);
    }

    const parser = new Parser(options);
    parser.parse(String(text));

    const files: Record<string, AstRoot> = {
      [entry]: parser.getRoot(),
    };

    return new Project(entry, files, new Set(parser.getDeclaredConditions()), false);
  }

  // Flattening / recursive: walk the input tree starting from the entry path
  const entryFile = entry;
  const discovered = new Set<string>();
  const astByFile: Record<string, AstRoot> = {};
  const declaredConditions = new Set<string>();
  const stack: string[] = [entryFile];

  while (stack.length) {
    const file = stack.pop()!;
    if (discovered.has(file)) {
      throw new Error(`Multiple inclusion detected: ${file} is already processed`);
    }
    discovered.add(file);

    const text = readFile(file);
    if (text === undefined || text === null) {
      throw new Error(`readFile callback returned no content for ${file}`);
    }

    const fileParser = new Parser(options);
    fileParser.parse(String(text));
    const ast = fileParser.getRoot();
    astByFile[file] = ast;

    for (const cond of fileParser.getDeclaredConditions()) {
      declaredConditions.add(cond);
    }

    for (const child of fileParser.getInputFiles()) {
      if (!discovered.has(child)) {
        stack.push(child);
      }
    }
  }

  if (!astByFile[entryFile]) {
    throw new Error(`Failed to parse entry file: ${entryFile}`);
  }

  return new Project(entryFile, astByFile, declaredConditions, true);
}

export function transform(
  project: Project,
  options: CoreOptions = {} as CoreOptions
): Record<string, string> {
  const transformers: Transformer[] = [];
  if (options.suppressComments) {
    transformers.push(suppressComments);
  }

  if (options.ifDecisions) {
    transformers.push(filterConditions(options.ifDecisions, project.getDeclaredConditions()));
  }

  // Recursive handling: run non-flattening transform on each discovered file
  if (options.handleInputCmd === InputCmdHandling.RECURSIVE) {
    const outputs: Record<string, string> = {};
    for (const [file, ast] of Object.entries(project.getFiles())) {
      outputs[file] = renderAst(ast, transformers);
    }
    return outputs;
  }

  // Flatten inputs: inline referenced files during transform
  if (options.handleInputCmd === InputCmdHandling.FLATTEN) {
    const outputs: Record<string, string> = {};
    outputs[project.entry] = renderAst(project.getRoot(), transformers, project.getFiles(), {
      flatten: true,
    });
    return outputs;
  }

  // Default: emit as-is for single-root projects
  return { [project.entry]: renderAst(project.getRoot(), transformers) };
}
