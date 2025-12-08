import { Parser } from './parse/parser.js';
import { CoreOptions } from './options.js';
import type { Transformer } from './transform/transform.js';
import { filterConditions, suppressComments } from './transform/transforems.js';

export function transformCode(code: string, options: CoreOptions = {} as CoreOptions): string {
  const parser = new Parser(options);
  parser.parse(code);

  const transformers: Transformer[] = [];

  if (options.suppressComments) {
    transformers.push(suppressComments);
  }

  if (options.ifDecisions) {
    transformers.push(filterConditions(options.ifDecisions));
  }

  if (options.handleInputCmd) {
    throw new Error('Input flattening not implemented yet');
  }

  const { text } = parser.transform(transformers);
  return text;
}
