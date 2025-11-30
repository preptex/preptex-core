import { readMainFile } from './io/reader';
import { Parser } from './parse/parser';
import { CallStack } from './parse/callstack';
import { CoreOptions, Artifact } from './options';

export async function processProject(
  entryPath: string,
  options: CoreOptions = {}
): Promise<Artifact> {
  const input = await readMainFile(entryPath, options);
  const stack = new CallStack();
  const parser = new Parser(stack, options);
  const ast = parser.parse(input);
  return parser.export(ast, options);
}
