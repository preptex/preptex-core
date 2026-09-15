import type {
  BooleanValues,
  ConditionPolicy,
  NormalizedViewConfiguration,
} from '../../project-types.js';
import { normalizeProjectFilePath } from '../validation.js';
import { bounded, fields, invalid, record, testKind } from './shared.js';

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

function policy(value: unknown = { mode: 'source' }): ConditionPolicy {
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
  return invalid('Invalid condition policy mode.');
}

export function normalizeConfiguration(value: unknown): NormalizedViewConfiguration {
  const input = record(value, 'view configuration');
  fields(
    input,
    ['entryPath', 'traversal', 'conditions', 'profile', 'limits'],
    'view configuration'
  );
  const traversal = input['traversal'] === undefined ? 'project' : input['traversal'];
  if (traversal !== 'project' && traversal !== 'file-only')
    invalid('Invalid input traversal mode.');
  const profile = input['profile'] === undefined ? 'direct-latex-v1' : input['profile'];
  if (profile !== 'direct-latex-v1') invalid('Unsupported interpretation profile.');
  const limits = record(input['limits'] === undefined ? {} : input['limits'], 'view limits');
  fields(
    limits,
    ['maxInputDepth', 'maxOccurrences', 'maxNesting', 'maxSelectedCodeUnits'],
    'view limits'
  );
  return {
    entryPath: normalizeProjectFilePath(input['entryPath'], 'entryPath'),
    traversal,
    profile,
    conditions: policy(input['conditions']),
    limits: {
      maxInputDepth: bounded(limits['maxInputDepth'], 64, 256, 'maxInputDepth'),
      maxOccurrences: bounded(limits['maxOccurrences'], 10000, 1000000, 'maxOccurrences'),
      maxNesting: bounded(limits['maxNesting'], 256, 512, 'maxNesting'),
      maxSelectedCodeUnits: bounded(
        limits['maxSelectedCodeUnits'],
        10000000,
        100000000,
        'maxSelectedCodeUnits'
      ),
    },
  };
}
