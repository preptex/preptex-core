import type {
  BooleanValues,
  ConditionPolicy,
  CustomCommandParameterSpec,
  CustomCommandSignature,
  NormalizedViewConfiguration,
  ViewLimits,
} from '../../project-types.js';
import { normalizeProjectFilePath } from '../validation.js';
import { sectionLevel } from './commands.js';
import { array, bounded, fields, invalid, record, string, testKind } from './shared.js';

function values(value: unknown): BooleanValues {
  const input = record(value, 'boolean values');
  const result: Record<string, boolean> = {};
  for (const key of Object.keys(input).sort()) {
    if (!/^[A-Za-z]+$/.test(key) || testKind(`if${key}`) !== 'named-candidate')
      invalid(`Invalid named boolean: ${key}. Primitive and literal tests cannot be overridden.`);
    const val = input[key];
    if (typeof val !== 'boolean') invalid('Named boolean values must be booleans.');
    Object.defineProperty(result, key, {
      value: val,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

export function normalizeConditionPolicy(
  value: unknown = { mode: 'source' },
  allowNone = true,
  allowIgnore = true
): ConditionPolicy {
  const input = record(value, 'condition policy');
  if (input['mode'] === 'source') {
    fields(input, ['mode', 'initialValues'], 'source policy');
    return {
      mode: 'source',
      initialValues: values(input['initialValues'] === undefined ? {} : input['initialValues']),
    };
  }
  if (input['mode'] === 'manual') {
    fields(input, ['mode', 'values'], 'manual policy');
    return { mode: 'manual', values: values(input['values']) };
  }
  if (input['mode'] === 'source-with-overrides') {
    fields(input, ['mode', 'initialValues', 'overrides'], 'override policy');
    return {
      mode: 'source-with-overrides',
      overrides: values(input['overrides']),
      initialValues: values(input['initialValues'] === undefined ? {} : input['initialValues']),
    };
  }
  if (allowNone && input['mode'] === 'none') {
    fields(input, ['mode'], 'none policy');
    return { mode: 'none' };
  }
  if (allowIgnore && input['mode'] === 'ignore') {
    fields(input, ['mode'], 'ignore policy');
    return { mode: 'ignore' };
  }
  return invalid('Invalid condition policy mode.');
}

export function normalizeViewLimits(value: unknown): Required<ViewLimits> {
  const limits = record(value === undefined ? {} : value, 'view limits');
  fields(
    limits,
    ['maxInputDepth', 'maxOccurrences', 'maxNesting', 'maxSelectedCodeUnits'],
    'view limits'
  );
  return {
    maxInputDepth: bounded(limits['maxInputDepth'], 64, 256, 'maxInputDepth'),
    maxOccurrences: bounded(limits['maxOccurrences'], 10000, 1000000, 'maxOccurrences'),
    maxNesting: bounded(limits['maxNesting'], 256, 512, 'maxNesting'),
    maxSelectedCodeUnits: bounded(
      limits['maxSelectedCodeUnits'],
      10000000,
      100000000,
      'maxSelectedCodeUnits'
    ),
  };
}

const RESERVED_STRUCTURAL_COMMANDS = new Set([
  'begin',
  'end',
  'input',
  'newif',
  'else',
  'fi',
  'verb',
  'global',
]);

function normalizeCommandParamSpec(value: unknown): CustomCommandParameterSpec {
  const spec = record(value, 'custom command parameter');
  fields(spec, ['kind', 'form', 'opaque'], 'custom command parameter');
  const kind = spec['kind'];
  if (kind !== 'optional' && kind !== 'mandatory')
    invalid('Custom command parameter kind must be optional or mandatory.');
  const form = spec['form'];
  if (form !== 'braced' && form !== 'tex-arg')
    invalid('Custom command parameter form must be braced or tex-arg.');
  if (typeof spec['opaque'] !== 'boolean')
    invalid('Custom command parameter opaque must be a boolean.');
  return { kind, form, opaque: spec['opaque'] };
}

export function normalizeCustomCommands(value: unknown): readonly CustomCommandSignature[] {
  if (value === undefined) return [];
  const items = array(value, 'customCommands');
  const seen = new Set<string>();
  const normalized: CustomCommandSignature[] = [];
  for (const raw of items) {
    const item = record(raw, 'custom command signature');
    fields(
      item,
      ['name', 'mandatoryArgs', 'optionalArgs', 'params', 'allowStar', 'opaque'],
      'custom command signature'
    );
    const name = string(item['name'], 'custom command name');
    if (
      !/^(?:[A-Za-z@]+|[^A-Za-z@\s])$/.test(name) ||
      RESERVED_STRUCTURAL_COMMANDS.has(name) ||
      sectionLevel(name) !== undefined ||
      testKind(name) !== null
    ) {
      invalid(`Invalid or reserved custom command name: ${name}.`);
    }
    if (seen.has(name)) invalid(`Duplicate custom command signature: ${name}.`);
    seen.add(name);
    const mandatoryArgs = item['mandatoryArgs'];
    if (
      typeof mandatoryArgs !== 'number' ||
      !Number.isSafeInteger(mandatoryArgs) ||
      mandatoryArgs < 0 ||
      mandatoryArgs > 9
    ) {
      invalid('mandatoryArgs must be an integer from 0 to 9.');
    }
    const optionalArgs = item['optionalArgs'] === undefined ? 0 : item['optionalArgs'];
    if (
      typeof optionalArgs !== 'number' ||
      !Number.isSafeInteger(optionalArgs) ||
      optionalArgs < 0 ||
      optionalArgs > 9
    ) {
      invalid('optionalArgs must be an integer from 0 to 9.');
    }
    if (item['allowStar'] !== undefined && typeof item['allowStar'] !== 'boolean')
      invalid('allowStar must be a boolean.');
    if (item['opaque'] !== undefined && typeof item['opaque'] !== 'boolean')
      invalid('opaque must be a boolean.');
    const params =
      item['params'] === undefined
        ? undefined
        : array(item['params'], 'custom command params').map(normalizeCommandParamSpec);
    if (params && params.length > 18)
      invalid('Custom command params may contain at most 18 parameters.');
    normalized.push({
      name,
      mandatoryArgs,
      optionalArgs,
      ...(params ? { params } : {}),
      allowStar: item['allowStar'] ?? true,
      opaque: item['opaque'] ?? false,
    });
  }
  return normalized.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function normalizeConfiguration(value: unknown): NormalizedViewConfiguration {
  const input = record(value, 'view configuration');
  fields(
    input,
    [
      'entryPath',
      'traversal',
      'conditions',
      'profile',
      'limits',
      'inferDefinedCommands',
      'customCommands',
    ],
    'view configuration'
  );
  const traversal = input['traversal'] === undefined ? 'project' : input['traversal'];
  if (traversal !== 'project' && traversal !== 'file-only')
    invalid('Invalid input traversal mode.');
  const profile = input['profile'] === undefined ? 'direct-latex-v1' : input['profile'];
  if (profile !== 'direct-latex-v1') invalid('Unsupported interpretation profile.');
  if (
    input['inferDefinedCommands'] !== undefined &&
    typeof input['inferDefinedCommands'] !== 'boolean'
  ) {
    invalid('inferDefinedCommands must be a boolean.');
  }
  return {
    entryPath: normalizeProjectFilePath(input['entryPath'], 'entryPath'),
    traversal,
    profile,
    conditions: normalizeConditionPolicy(input['conditions'], true),
    limits: normalizeViewLimits(input['limits']),
    inferDefinedCommands: input['inferDefinedCommands'] ?? true,
    customCommands: normalizeCustomCommands(input['customCommands']),
  };
}
