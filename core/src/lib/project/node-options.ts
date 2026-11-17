import type {
  NodeEditAction,
  NodeTransformationRequest,
  SymbolRefactorAction,
  SymbolRefactorRequest,
} from '../../node-types.js';
import { array, bounded, fields, invalid, record, string, testKind } from './shared.js';
import { normalizeSelection } from './selection.js';
import { environmentName } from './environments.js';
import { sectionLevel } from './commands.js';
import { normalizeProjectFilePath } from '../validation.js';

const RESERVED_COMMANDS = new Set([
  'begin',
  'end',
  'input',
  'newif',
  'else',
  'fi',
  'verb',
  'global',
]);

export function commandName(value: unknown): string {
  const raw = string(value, 'command name').replace(/^\\+/, '');
  if (
    !/^[A-Za-z@]+$/.test(raw) ||
    RESERVED_COMMANDS.has(raw) ||
    sectionLevel(raw) !== undefined ||
    testKind(raw) !== null
  ) {
    invalid(`Invalid or reserved command name: ${raw}.`);
  }
  return raw;
}

export function conditionName(value: unknown): string {
  const raw = string(value, 'condition name');
  if (!/^[A-Za-z]+$/.test(raw) || testKind(`if${raw}`) !== 'named-candidate') {
    invalid(`Invalid condition name: ${raw}.`);
  }
  return raw;
}

export function normalizeNodeActions(value: unknown): readonly NodeEditAction[] {
  const actions = array(value, 'node actions');
  if (actions.length > 10000) invalid('At most 10000 node actions are supported.');
  return actions.map((raw) => {
    const a = record(raw, 'node action'),
      kind = a['kind'];
    if (kind === 'remove-node' || kind === 'unwrap-node') {
      fields(a, ['kind', 'selection'], 'node action');
      return { kind, selection: normalizeSelection(a['selection']) };
    }
    if (kind === 'rename-environment' || kind === 'wrap-node') {
      fields(a, ['kind', 'selection', 'name'], 'node action');
      return {
        kind,
        selection: normalizeSelection(a['selection']),
        name: environmentName(a['name']),
      };
    }
    if (kind === 'rename-command') {
      fields(a, ['kind', 'selection', 'name'], 'node action');
      return {
        kind,
        selection: normalizeSelection(a['selection']),
        name: commandName(a['name']),
      };
    }
    if (kind === 'rename-section') {
      fields(a, ['kind', 'selection', 'sectionCommand', 'starred'], 'node action');
      const sectionCommand = a['sectionCommand'];
      if (
        sectionCommand !== 'section' &&
        sectionCommand !== 'subsection' &&
        sectionCommand !== 'subsubsection' &&
        sectionCommand !== 'paragraph' &&
        sectionCommand !== 'subparagraph'
      ) {
        invalid('Invalid sectionCommand.');
      }
      if (a['starred'] !== undefined && typeof a['starred'] !== 'boolean') {
        invalid('starred must be a boolean.');
      }
      return {
        kind,
        selection: normalizeSelection(a['selection']),
        sectionCommand,
        ...(a['starred'] !== undefined ? { starred: a['starred'] } : {}),
      };
    }
    return invalid('Unknown node action.');
  });
}

function normalizeSourceLocation(value: unknown) {
  const loc = record(value, 'definitionLocation');
  fields(loc, ['path', 'range'], 'definitionLocation');
  const path = normalizeProjectFilePath(loc['path'], 'definitionLocation.path');
  const range = record(loc['range'], 'definitionLocation.range');
  fields(range, ['start', 'end', 'line'], 'definitionLocation.range');
  const start = range['start'];
  const end = range['end'];
  const line = range['line'];
  if (
    typeof start !== 'number' ||
    !Number.isSafeInteger(start) ||
    typeof end !== 'number' ||
    !Number.isSafeInteger(end) ||
    typeof line !== 'number' ||
    !Number.isSafeInteger(line)
  ) {
    invalid('definitionLocation range bounds must be integers.');
  }
  return { path, range: { start, end, line } };
}

export function normalizeSymbolRefactorActions(value: unknown): readonly SymbolRefactorAction[] {
  const actions = array(value, 'symbol refactor actions');
  if (actions.length > 10000) invalid('At most 10000 symbol refactor actions are supported.');
  return actions.map((raw) => {
    const a = record(raw, 'symbol refactor action');
    const kind = a['kind'];
    switch (kind) {
      case 'rename-command-globally': {
        fields(a, ['kind', 'oldName', 'newName', 'includeDefinitions'], 'symbol refactor action');
        if (a['includeDefinitions'] !== undefined && typeof a['includeDefinitions'] !== 'boolean') {
          invalid('includeDefinitions must be a boolean.');
        }
        return {
          kind,
          oldName: commandName(a['oldName']),
          newName: commandName(a['newName']),
          ...(a['includeDefinitions'] !== undefined
            ? { includeDefinitions: a['includeDefinitions'] }
            : {}),
        };
      }
      case 'edit-command-definition': {
        fields(
          a,
          ['kind', 'definitionLocation', 'newName', 'numArgs', 'defaultArg', 'newBody'],
          'symbol refactor action'
        );
        const definitionLocation = normalizeSourceLocation(a['definitionLocation']);
        const numArgs = a['numArgs'];
        if (
          numArgs !== undefined &&
          (typeof numArgs !== 'number' ||
            !Number.isSafeInteger(numArgs) ||
            numArgs < 0 ||
            numArgs > 9)
        ) {
          invalid('numArgs must be an integer from 0 to 9.');
        }
        const defaultArg = a['defaultArg'];
        if (defaultArg !== undefined && defaultArg !== null && typeof defaultArg !== 'string') {
          invalid('defaultArg must be a string or null.');
        }
        const newBody = a['newBody'];
        if (newBody !== undefined && typeof newBody !== 'string') {
          invalid('newBody must be a string.');
        }
        return {
          kind,
          definitionLocation,
          ...(a['newName'] !== undefined ? { newName: commandName(a['newName']) } : {}),
          ...(numArgs !== undefined ? { numArgs } : {}),
          ...(defaultArg !== undefined ? { defaultArg } : {}),
          ...(newBody !== undefined ? { newBody } : {}),
        };
      }
      case 'rename-environment-globally': {
        fields(a, ['kind', 'oldName', 'newName', 'includeDefinitions'], 'symbol refactor action');
        if (a['includeDefinitions'] !== undefined && typeof a['includeDefinitions'] !== 'boolean') {
          invalid('includeDefinitions must be a boolean.');
        }
        return {
          kind,
          oldName: environmentName(a['oldName']),
          newName: environmentName(a['newName']),
          ...(a['includeDefinitions'] !== undefined
            ? { includeDefinitions: a['includeDefinitions'] }
            : {}),
        };
      }
      case 'rename-condition-globally': {
        fields(a, ['kind', 'oldName', 'newName'], 'symbol refactor action');
        return {
          kind,
          oldName: conditionName(a['oldName']),
          newName: conditionName(a['newName']),
        };
      }
      case 'rename-label-globally':
      case 'rename-citation-globally': {
        fields(a, ['kind', 'oldKey', 'newKey'], 'symbol refactor action');
        const oldKey = string(a['oldKey'], 'oldKey').trim();
        const newKey = string(a['newKey'], 'newKey').trim();
        if (!oldKey || !newKey || /[\\{}%#\r\n]/.test(newKey)) {
          invalid('Invalid label/citation key.');
        }
        if (kind === 'rename-citation-globally' && newKey.includes(',')) {
          invalid('Citation keys cannot contain commas.');
        }
        return { kind, oldKey, newKey };
      }
      case 'edit-metadata': {
        fields(a, ['kind', 'field', 'newValue', 'shortValue'], 'symbol refactor action');
        const field = a['field'];
        if (field !== 'title' && field !== 'author' && field !== 'date' && field !== 'abstract') {
          invalid('Metadata field must be title, author, date, or abstract.');
        }
        const newValue = string(a['newValue'], 'newValue');
        const shortValue = a['shortValue'];
        if (shortValue !== undefined && shortValue !== null && typeof shortValue !== 'string') {
          invalid('shortValue must be a string or null.');
        }
        return {
          kind,
          field,
          newValue,
          ...(shortValue !== undefined ? { shortValue } : {}),
        };
      }
      default:
        return invalid('Unknown symbol refactor action.');
    }
  });
}

export function normalizeSymbolRefactorOperation(value: unknown): SymbolRefactorRequest {
  const o = record(value, 'symbol refactor options');
  fields(o, ['target', 'actions', 'maxOutputCodeUnits'], 'symbol refactor options');
  const target = o['target'];
  if (
    target !== undefined &&
    target !== 'selected' &&
    target !== 'source' &&
    target !== 'artifact'
  ) {
    invalid('Invalid symbol refactor target.');
  }
  return {
    operation: 'refactor-symbols',
    options: {
      ...(target !== undefined ? { target } : {}),
      actions: normalizeSymbolRefactorActions(o['actions']),
      maxOutputCodeUnits: bounded(
        o['maxOutputCodeUnits'],
        10000000,
        100000000,
        'maxOutputCodeUnits'
      ),
    },
  };
}
export function normalizeNodeOperation(
  operation: 'edit-nodes' | 'remove-environments',
  value: unknown
): NodeTransformationRequest {
  const o = record(value, 'node operation options');
  fields(
    o,
    operation === 'edit-nodes'
      ? ['target', 'actions', 'maxOutputCodeUnits']
      : ['target', 'names', 'maxOutputCodeUnits'],
    'node operation options'
  );
  const target = o['target'];
  if (
    operation === 'edit-nodes'
      ? target !== 'selected' && target !== 'artifact'
      : target !== 'selected' && target !== 'source' && target !== 'artifact'
  ) {
    invalid('Invalid node operation target.');
  }
  const maxOutputCodeUnits = bounded(
    o['maxOutputCodeUnits'],
    10000000,
    100000000,
    'maxOutputCodeUnits'
  );
  if (operation === 'edit-nodes') {
    return {
      operation,
      options: {
        target: target as 'selected' | 'artifact',
        actions: normalizeNodeActions(o['actions']),
        maxOutputCodeUnits,
      },
    };
  }
  const names = [...new Set(array(o['names'], 'environment names').map(environmentName))].sort();
  if (!names.length || names.length > 1000) invalid('Request 1–1000 environment names.');
  return {
    operation,
    options: {
      target: target as 'selected' | 'source' | 'artifact',
      names,
      maxOutputCodeUnits,
    },
  };
}
