import { readMainFile } from './io/reader';
import { Parser } from './parse/parser';
import { CoreOptions, Artifact } from './options';

export async function processProject(
  entryPath: string,
  options: CoreOptions = {}
): Promise<Artifact> {
  const input = await readMainFile(entryPath);
  const parser = new Parser(options);
  const ast = parser.parse(input);
  return parser.export(ast, options);
}
