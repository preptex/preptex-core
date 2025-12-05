import { Parser } from './parse/parser.js';
import { CoreOptions } from './options.js';
import { transform, type Transformer } from './transform/transform.js';
import { suppressComments } from './transform/suppressComments.js';
import { filterConditions } from './transform/conditions.js';

export function transformCode(code: string, options: CoreOptions = {} as CoreOptions): string {
  const parser = new Parser(options);
  const ast = parser.parse(code);

  const transformers: Transformer[] = [];

  if (options.suppressComments) {
    transformers.push(suppressComments());
  }

  if (options.ifDecisions) {
    transformers.push(filterConditions(options.ifDecisions));
  }

  if (options.handleInputCmd) {
    throw new Error('Input flattening not implemented yet');
  }

  const { text } = transform(ast, transformers);
  return text;
}
