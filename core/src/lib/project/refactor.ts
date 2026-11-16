import type { SourceRange } from '../../api-types.js';
import type {
  ProjectEdit,
  ProjectSnapshot,
  ProjectView,
  SelectedToken,
} from '../../project-types.js';
import type { SymbolRefactorAction } from '../../node-types.js';
import { inspectProjectCatalog } from './catalog.js';
import { reject } from './fail.js';
import { extractMetadataWithEditInfo } from './metadata.js';
import { DEFINITIONS } from './scan.js';
import { normalizeChanges, sourceChanges, type TextChange } from './text-edits.js';

interface PhysicalSpanEdit {
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly occurrenceId: string | null;
}

function addFileChange(byPath: Map<string, TextChange[]>, path: string, change: TextChange): void {
  const list = byPath.get(path) ?? [];
  list.push(change);
  byPath.set(path, list);
}

function collectPhysicalEdits(
  model: ProjectSnapshot | ProjectView,
  actions: readonly SymbolRefactorAction[]
): Map<string, TextChange[]> {
  const snapshot = model.kind === 'snapshot' ? model : model.snapshot;
  const view = model.kind === 'view' ? model : null;
  const filesByPath = new Map(snapshot.files.map((f) => [f.path, f]));
  const catalog = inspectProjectCatalog(model);
  const byPath = new Map<string, TextChange[]>();
  const collected: PhysicalSpanEdit[] = [];

  for (const action of actions) {
    switch (action.kind) {
      case 'rename-command-globally': {
        const entry = catalog.commands.find((c) => c.name === action.oldName);
        if (!entry || !entry.canRenameGlobally) {
          reject('unavailable', `Command \\${action.oldName} cannot be renamed globally.`, []);
        }
        for (const occ of entry.occurrences) {
          collected.push({
            path: occ.location.path,
            start: occ.commandTokenRange.start,
            end: occ.commandTokenRange.end + 1,
            text: `\\${action.newName}`,
            occurrenceId: occ.location.occurrenceId,
          });
        }
        if (action.includeDefinitions !== false) {
          for (const def of entry.definitions) {
            if (!def.nameRange) {
              reject(
                'unavailable',
                `Definition of \\${action.oldName} lacks a literal name range.`,
                [def.location]
              );
            }
            collected.push({
              path: def.location.path,
              start: def.nameRange.start - 1,
              end: def.nameRange.end + 1,
              text: `\\${action.newName}`,
              occurrenceId: def.location.occurrenceId,
            });
          }
        }
        break;
      }

      case 'edit-command-definition': {
        const file = filesByPath.get(action.definitionLocation.path);
        const fact = file?.facts.find(
          (f) =>
            f.kind === 'definition' &&
            f.range.start === action.definitionLocation.range.start &&
            f.range.end === action.definitionLocation.range.end
        );
        if (!fact || fact.kind !== 'definition' || !fact.name || !fact.body) {
          reject('unavailable', 'Target command definition could not be found.');
        }
        if (!DEFINITIONS.has(fact.form)) {
          reject('unavailable', `Definition form \\${fact.form} cannot be edited.`);
        }
        if (
          fact.form === 'def' &&
          (action.numArgs !== undefined || action.defaultArg !== undefined)
        ) {
          reject(
            'invalid-edit',
            '\\def parameter counts and defaults cannot be modified with numArgs/defaultArg.'
          );
        }
        const effectiveName = action.newName ?? fact.name;
        const effectiveNumArgs = action.numArgs ?? fact.numArgs;
        const effectiveDefault =
          action.defaultArg !== undefined ? action.defaultArg : fact.defaultArg;
        if (effectiveNumArgs === 0 && effectiveDefault !== null) {
          reject('invalid-edit', 'A default argument requires numArgs >= 1.');
        }
        const bodyText =
          action.newBody !== undefined
            ? action.newBody
            : file!.source.slice(fact.body.start, fact.body.end + 1);
        let replacement: string;
        if (fact.form === 'def') {
          const params =
            fact.arguments.length > 0
              ? file!.source.slice(fact.arguments[0]!.start, fact.arguments[0]!.end + 1)
              : '';
          replacement = `\\def\\${effectiveName}${params}{${bodyText}}`;
        } else {
          const argPart =
            (effectiveNumArgs > 0 ? `[${effectiveNumArgs}]` : '') +
            (effectiveDefault !== null ? `[${effectiveDefault}]` : '');
          replacement = `\\${fact.form}${fact.starred ? '*' : ''}{\\${effectiveName}}${argPart}{${bodyText}}`;
        }
        collected.push({
          path: fact.path,
          start: fact.range.start,
          end: fact.range.end + 1,
          text: replacement,
          occurrenceId: null,
        });
        break;
      }

      case 'rename-environment-globally': {
        const entry = catalog.environments.find((e) => e.name === action.oldName);
        if (!entry || !entry.canRenameGlobally) {
          reject('unavailable', `Environment ${action.oldName} cannot be renamed globally.`, []);
        }
        for (const occ of entry.occurrences) {
          if (!occ.openingNameRange || !occ.closingNameRange) {
            reject('unavailable', `Environment ${action.oldName} has incomplete delimiters.`, [
              occ.location,
            ]);
          }
          collected.push({
            path: occ.location.path,
            start: occ.openingNameRange.start,
            end: occ.openingNameRange.end + 1,
            text: action.newName,
            occurrenceId: occ.location.occurrenceId,
          });
          collected.push({
            path: occ.location.path,
            start: occ.closingNameRange.start,
            end: occ.closingNameRange.end + 1,
            text: action.newName,
            occurrenceId: occ.location.occurrenceId,
          });
        }
        if (action.includeDefinitions !== false) {
          for (const def of entry.definitions) {
            if (!def.nameRange) {
              reject(
                'unavailable',
                `Definition of environment ${action.oldName} lacks a literal name range.`,
                [def.location]
              );
            }
            collected.push({
              path: def.location.path,
              start: def.nameRange.start,
              end: def.nameRange.end + 1,
              text: action.newName,
              occurrenceId: def.location.occurrenceId,
            });
          }
        }
        break;
      }

      case 'rename-condition-globally': {
        const cond = catalog.conditions.find((c) => c.name === action.oldName);
        if (!cond || !cond.canRenameGlobally) {
          reject('unavailable', `Condition ${action.oldName} cannot be renamed globally.`, []);
        }
        for (const decl of cond.declarations) {
          collected.push({
            path: decl.location.path,
            start: decl.targetNameRange.start - 1,
            end: decl.targetNameRange.end + 1,
            text: `\\if${action.newName}`,
            occurrenceId: decl.location.occurrenceId,
          });
        }
        for (const test of cond.tests) {
          collected.push({
            path: test.location.path,
            start: test.commandRange.start,
            end: test.commandRange.end + 1,
            text: `\\if${action.newName}`,
            occurrenceId: test.location.occurrenceId,
          });
        }
        for (const setter of cond.setters) {
          collected.push({
            path: setter.location.path,
            start: setter.commandRange.start,
            end: setter.commandRange.end + 1,
            text: `\\${action.newName}${setter.value ? 'true' : 'false'}`,
            occurrenceId: setter.location.occurrenceId,
          });
        }
        break;
      }

      case 'rename-label-globally': {
        const label = catalog.labels.find((l) => l.key === action.oldKey);
        if (!label || !label.canRenameGlobally) {
          reject('unavailable', `Label ${action.oldKey} was not found.`, []);
        }
        for (const decl of label.declarations) {
          collected.push({
            path: decl.location.path,
            start: decl.keyRange.start,
            end: decl.keyRange.end + 1,
            text: action.newKey,
            occurrenceId: decl.location.occurrenceId,
          });
        }
        for (const occ of label.occurrences) {
          collected.push({
            path: occ.location.path,
            start: occ.keyRange.start,
            end: occ.keyRange.end + 1,
            text: action.newKey,
            occurrenceId: occ.location.occurrenceId,
          });
        }
        break;
      }

      case 'rename-citation-globally': {
        const cite = catalog.citations.find((c) => c.key === action.oldKey);
        if (!cite || !cite.canRenameGlobally) {
          reject('unavailable', `Citation ${action.oldKey} was not found.`, []);
        }
        for (const def of cite.definitions) {
          collected.push({
            path: def.location.path,
            start: def.keyRange.start,
            end: def.keyRange.end + 1,
            text: action.newKey,
            occurrenceId: def.location.occurrenceId,
          });
        }
        for (const occ of cite.occurrences) {
          collected.push({
            path: occ.location.path,
            start: occ.keyRange.start,
            end: occ.keyRange.end + 1,
            text: action.newKey,
            occurrenceId: occ.location.occurrenceId,
          });
        }
        break;
      }

      case 'edit-metadata': {
        const { editableFields } = extractMetadataWithEditInfo(model);
        const info = editableFields.get(action.field);
        if (!info || !info.field.contentLocation) {
          reject('unavailable', `Metadata field ${action.field} is not present to edit.`);
        }
        const contentLoc = info.field.contentLocation;
        if (action.shortValue !== undefined) {
          if (action.field === 'abstract' || action.field === 'date') {
            reject('invalid-edit', `Metadata field ${action.field} does not accept shortValue.`);
          }
          if (action.shortValue === null) {
            if (info.shortOuterRange) {
              collected.push({
                path: contentLoc.path,
                start: info.shortOuterRange.start,
                end: info.shortOuterRange.end + 1,
                text: '',
                occurrenceId: contentLoc.occurrenceId,
              });
            }
          } else {
            if (info.shortRange) {
              collected.push({
                path: contentLoc.path,
                start: info.shortRange.start,
                end: info.shortRange.end + 1,
                text: action.shortValue,
                occurrenceId: contentLoc.occurrenceId,
              });
            } else if (info.mandatoryOuterRange) {
              collected.push({
                path: contentLoc.path,
                start: info.mandatoryOuterRange.start,
                end: info.mandatoryOuterRange.start,
                text: `[${action.shortValue}]`,
                occurrenceId: contentLoc.occurrenceId,
              });
            }
          }
        }
        collected.push({
          path: contentLoc.path,
          start: contentLoc.range.start,
          end: contentLoc.range.end + 1,
          text:
            action.field === 'abstract' || info.isBraced ? action.newValue : `{${action.newValue}}`,
          occurrenceId: contentLoc.occurrenceId,
        });
        break;
      }
    }
  }

  // Deduplicate identical edits across multiple inclusions of one physical file,
  // and reject conflicting edits to the same span.
  const dedup = new Map<string, PhysicalSpanEdit>();
  for (const item of collected) {
    const spanKey = `${item.path}:${item.start}:${item.end}`;
    const existing = dedup.get(spanKey);
    if (existing) {
      if (existing.text !== item.text) {
        reject('edit-conflict', 'Incompatible symbol refactorings target the same source span.');
      }
      continue;
    }
    dedup.set(spanKey, item);
  }

  // When running against a view, verify repeated physical inclusions agree on modified spans
  if (view) {
    for (const item of dedup.values()) {
      const occs = view.occurrences.filter((o) => o.path === item.path);
      if (occs.length <= 1) continue;
      for (const occ of occs) {
        const matching = collected.filter(
          (c) =>
            c.path === item.path &&
            c.start === item.start &&
            c.end === item.end &&
            c.occurrenceId === occ.id
        );
        if (
          matching.length === 0 &&
          collected.some(
            (c) =>
              c.path === item.path &&
              c.start === item.start &&
              c.end === item.end &&
              c.occurrenceId !== null
          )
        ) {
          // Only reject if the span is inactive/different in another inclusion
          const activeInOcc = view.selectedTokens.some(
            (t) =>
              t.origin.occurrenceId === occ.id &&
              t.origin.range.start <= item.start &&
              t.origin.range.end >= Math.max(item.start, item.end - 1)
          );
          if (!activeInOcc) {
            reject(
              'edit-conflict',
              'Every physical inclusion must permit the same symbol refactoring.'
            );
          }
        }
      }
    }
  }

  for (const item of dedup.values()) {
    addFileChange(byPath, item.path, {
      start: item.start,
      end: item.end,
      text: item.text,
    });
  }

  return byPath;
}

export function symbolRefactorSourceEdits(
  model: ProjectSnapshot | ProjectView,
  actions: readonly SymbolRefactorAction[]
): ProjectEdit[] {
  const snapshot = model.kind === 'snapshot' ? model : model.snapshot;
  const byPath = collectPhysicalEdits(model, actions);
  return sourceChanges(snapshot, byPath);
}

export function symbolRefactorProjectionChanges(
  view: ProjectView,
  actions: readonly SymbolRefactorAction[]
): TextChange[] {
  const byPath = collectPhysicalEdits(view, actions);
  const changes: TextChange[] = [];

  const mapOffsetInOcc = (
    occurrenceId: string,
    offset: number,
    isEndExclusive: boolean
  ): number | null => {
    for (const sel of view.selectedTokens) {
      if (sel.origin.occurrenceId !== occurrenceId) continue;
      if (
        offset >= sel.origin.range.start &&
        offset <= sel.origin.range.end + (isEndExclusive ? 1 : 0)
      ) {
        return sel.projectedRange.start + (offset - sel.origin.range.start);
      }
    }
    return null;
  };

  for (const [path, list] of byPath) {
    const occs = view.occurrences.filter((o) => o.path === path);
    for (const occ of occs) {
      for (const change of list) {
        const pStart = mapOffsetInOcc(occ.id, change.start, false);
        const pEnd = mapOffsetInOcc(occ.id, change.end, true);
        if (pStart === null || pEnd === null) continue;
        changes.push({ start: pStart, end: pEnd, text: change.text });
      }
    }
  }
  return normalizeChanges(changes);
}
