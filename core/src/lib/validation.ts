import {
  CommentKind,
  ConditionBranchKind,
  DiagnosticCode,
  DiagnosticSeverity,
  NodeType,
  type AstNode,
  type AstRoot,
  type ConditionName,
  type ParsedFile,
  type ParsedProject,
  type ProjectFilePath,
  type SourceRange,
  type WarningDiagnostic,
} from '../api-types.js';
import { PrepTexError, PrepTexErrorCode } from '../errors.js';
import { normalizeVirtualPath } from './virtual-path.js';

interface DataRecord {
  type?: unknown;
  id?: unknown;
  start?: unknown;
  end?: unknown;
  line?: unknown;
  children?: unknown;
  prefix?: unknown;
  suffix?: unknown;
  value?: unknown;
  originalLineIsWhitespaceOnly?: unknown;
  kind?: unknown;
  name?: unknown;
  starred?: unknown;
  branch?: unknown;
  delimiter?: unknown;
  level?: unknown;
  path?: unknown;
  code?: unknown;
  severity?: unknown;
  message?: unknown;
  range?: unknown;
  root?: unknown;
  diagnostics?: unknown;
  declaredConditions?: unknown;
  referencedFiles?: unknown;
  version?: unknown;
  files?: unknown;
}

const BASE_NODE_FIELDS = ['type', 'id', 'start', 'end', 'line'] as const;
const CONTAINER_NODE_FIELDS = [...BASE_NODE_FIELDS, 'children', 'prefix', 'suffix'] as const;
const NODE_TYPES = new Set<unknown>(Object.values(NodeType));
const CONTAINER_NODE_TYPES = new Set<NodeType>([
  NodeType.Root,
  NodeType.Environment,
  NodeType.Condition,
  NodeType.ConditionBranch,
  NodeType.Math,
  NodeType.Group,
  NodeType.Section,
]);
const COMMENT_KINDS = new Set<unknown>(Object.values(CommentKind));
const CONDITION_BRANCH_KINDS = new Set<unknown>(Object.values(ConditionBranchKind));
const WARNING_CODES = new Set<unknown>(
  Object.values(DiagnosticCode).filter((code) => code !== DiagnosticCode.SyntaxError)
);
const MATH_DELIMITERS = new Set<unknown>(['$', '$$', '\\(', '\\[']);
const LINE_ENDINGS = new Set<unknown>(['\n', '\r', '\r\n']);

interface AstInspection {
  readonly root: AstRoot;
  readonly deeplyFrozen: boolean;
}

interface DiagnosticInspection {
  readonly diagnostic: WarningDiagnostic;
  readonly deeplyFrozen: boolean;
}

interface ParsedFileInspection {
  readonly file: ParsedFile;
  readonly ast: AstInspection;
  readonly diagnostics: readonly DiagnosticInspection[];
  readonly deeplyFrozen: boolean;
}

function invalidArgument(message: string): never {
  throw new PrepTexError(message, PrepTexErrorCode.InvalidArgument);
}

function isPlainRecord(value: unknown): value is DataRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainRecord(value: unknown, label: string): DataRecord {
  if (!isPlainRecord(value)) invalidArgument(`${label} must be a plain object.`);
  return value;
}

function requireExactDataFields(
  value: DataRecord,
  expectedFields: readonly string[],
  label: string
): void {
  const expected = new Set(expectedFields);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expected.size ||
    ownKeys.some((key) => typeof key !== 'string' || !expected.has(key))
  ) {
    invalidArgument(`${label} does not have the documented PrepTeX data shape.`);
  }
  for (const field of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      invalidArgument(`${label}.${field} must be an enumerable data property.`);
    }
  }
}

function requireString(value: unknown, label: string, allowEmpty = true): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    invalidArgument(`${label} must be ${allowEmpty ? 'a string' : 'a non-empty string'}.`);
  }
  return value;
}

function requireInteger(value: unknown, label: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    invalidArgument(`${label} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') invalidArgument(`${label} must be a boolean.`);
  return value;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalidArgument(`${label} must be an array.`);
  return value;
}

function inspectRangeFields(value: DataRecord, label: string, allowEmptyRoot = false): void {
  const start = requireInteger(value.start, `${label}.start`, 0);
  const end = requireInteger(value.end, `${label}.end`, allowEmptyRoot ? -1 : 0);
  requireInteger(value.line, `${label}.line`, 1);
  if (end < start && !(allowEmptyRoot && start === 0 && end === -1)) {
    invalidArgument(`${label}.end must not precede ${label}.start.`);
  }
}

function fieldsForNodeType(type: NodeType): readonly string[] {
  switch (type) {
    case NodeType.Root:
    case NodeType.Group:
      return CONTAINER_NODE_FIELDS;
    case NodeType.Environment:
    case NodeType.Condition:
      return [...CONTAINER_NODE_FIELDS, 'name'];
    case NodeType.ConditionBranch:
      return [...CONTAINER_NODE_FIELDS, 'name', 'branch'];
    case NodeType.Math:
      return [...CONTAINER_NODE_FIELDS, 'delimiter'];
    case NodeType.Section:
      return [...CONTAINER_NODE_FIELDS, 'level', 'name', 'starred'];
    case NodeType.Text:
      return [...BASE_NODE_FIELDS, 'value'];
    case NodeType.NewLine:
      return [...BASE_NODE_FIELDS, 'value', 'originalLineIsWhitespaceOnly'];
    case NodeType.Comment:
      return [...BASE_NODE_FIELDS, 'kind', 'value'];
    case NodeType.Command:
      return [...BASE_NODE_FIELDS, 'name', 'value', 'starred'];
    case NodeType.ConditionDeclaration:
      return [...BASE_NODE_FIELDS, 'name', 'value'];
    case NodeType.Input:
      return [...BASE_NODE_FIELDS, 'path', 'value'];
  }
}

function inspectAstRoot(value: unknown, label: string): AstInspection {
  const rootRecord = requirePlainRecord(value, label);
  if (rootRecord.type !== NodeType.Root) invalidArgument(`${label}.type must be NodeType.Root.`);

  const root = rootRecord as unknown as AstRoot;
  const pending: Array<{ readonly value: unknown; readonly label: string }> = [
    { value: root, label },
  ];
  const seenNodes = new Set<object>();
  const seenIds = new Set<number>();
  let deeplyFrozen = true;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const record = requirePlainRecord(current.value, current.label);
    if (seenNodes.has(record)) {
      invalidArgument(`${label} must be a tree without shared or circular node objects.`);
    }
    seenNodes.add(record);

    const type = record.type;
    if (!NODE_TYPES.has(type))
      invalidArgument(`${current.label}.type is not a supported NodeType.`);
    const nodeType = type as NodeType;
    requireExactDataFields(record, fieldsForNodeType(nodeType), current.label);
    const id = requireInteger(record.id, `${current.label}.id`, 0);
    if (seenIds.has(id)) invalidArgument(`${label} contains duplicate node id ${id}.`);
    seenIds.add(id);
    inspectRangeFields(record, current.label, nodeType === NodeType.Root);
    deeplyFrozen = deeplyFrozen && Object.isFrozen(record);

    if (CONTAINER_NODE_TYPES.has(nodeType)) {
      const children = requireArray(record.children, `${current.label}.children`);
      requireString(record.prefix, `${current.label}.prefix`);
      requireString(record.suffix, `${current.label}.suffix`);
      deeplyFrozen = deeplyFrozen && Object.isFrozen(children);
      for (let index = children.length - 1; index >= 0; index--) {
        pending.push({ value: children[index], label: `${current.label}.children[${index}]` });
      }
    }

    switch (nodeType) {
      case NodeType.Root:
        if (id !== 0) invalidArgument(`${label}.id must be 0.`);
        break;
      case NodeType.Text:
        requireString(record.value, `${current.label}.value`);
        break;
      case NodeType.NewLine:
        if (!LINE_ENDINGS.has(record.value)) {
          invalidArgument(`${current.label}.value must be LF, CR, or CRLF.`);
        }
        requireBoolean(
          record.originalLineIsWhitespaceOnly,
          `${current.label}.originalLineIsWhitespaceOnly`
        );
        break;
      case NodeType.Comment:
        if (!COMMENT_KINDS.has(record.kind)) invalidArgument(`${current.label}.kind is invalid.`);
        requireString(record.value, `${current.label}.value`);
        break;
      case NodeType.Command:
        requireString(record.name, `${current.label}.name`, false);
        requireString(record.value, `${current.label}.value`);
        requireBoolean(record.starred, `${current.label}.starred`);
        break;
      case NodeType.ConditionDeclaration:
        requireString(record.name, `${current.label}.name`, false);
        requireString(record.value, `${current.label}.value`);
        break;
      case NodeType.Environment:
      case NodeType.Condition:
        requireString(record.name, `${current.label}.name`, false);
        break;
      case NodeType.ConditionBranch:
        requireString(record.name, `${current.label}.name`, false);
        if (!CONDITION_BRANCH_KINDS.has(record.branch)) {
          invalidArgument(`${current.label}.branch is invalid.`);
        }
        break;
      case NodeType.Math:
        if (!MATH_DELIMITERS.has(record.delimiter)) {
          invalidArgument(`${current.label}.delimiter is invalid.`);
        }
        break;
      case NodeType.Group:
        break;
      case NodeType.Section: {
        const level = requireInteger(record.level, `${current.label}.level`, 0);
        if (level > 5) invalidArgument(`${current.label}.level must not exceed 5.`);
        requireString(record.name, `${current.label}.name`);
        requireBoolean(record.starred, `${current.label}.starred`);
        break;
      }
      case NodeType.Input:
        requireString(record.path, `${current.label}.path`, false);
        requireString(record.value, `${current.label}.value`);
        break;
    }
  }

  return { root, deeplyFrozen };
}

function cloneAndFreezeAst(inspection: AstInspection): AstRoot {
  if (inspection.deeplyFrozen) return inspection.root;

  type Frame = { readonly node: AstNode; readonly exiting: boolean };
  const frames: Frame[] = [{ node: inspection.root, exiting: false }];
  const copies = new Map<AstNode, AstNode>();
  while (frames.length > 0) {
    const frame = frames.pop();
    if (!frame) continue;
    const { node } = frame;
    if (!frame.exiting && CONTAINER_NODE_TYPES.has(node.type)) {
      frames.push({ node, exiting: true });
      const children = (node as AstRoot).children;
      for (let index = children.length - 1; index >= 0; index--) {
        frames.push({ node: children[index]!, exiting: false });
      }
      continue;
    }

    const copy: DataRecord = { ...node };
    if (CONTAINER_NODE_TYPES.has(node.type)) {
      const children = (node as AstRoot).children.map((child) => copies.get(child)!);
      copy.children = Object.freeze(children);
    }
    copies.set(node, Object.freeze(copy) as unknown as AstNode);
  }
  return copies.get(inspection.root)! as AstRoot;
}

function inspectSourceRange(
  value: unknown,
  label: string
): {
  readonly range: SourceRange;
  readonly deeplyFrozen: boolean;
} {
  const record = requirePlainRecord(value, label);
  requireExactDataFields(record, ['start', 'end', 'line'], label);
  inspectRangeFields(record, label);
  return { range: record as unknown as SourceRange, deeplyFrozen: Object.isFrozen(record) };
}

function inspectWarningDiagnostic(value: unknown, label: string): DiagnosticInspection {
  const record = requirePlainRecord(value, label);
  requireExactDataFields(record, ['code', 'severity', 'message', 'path', 'range'], label);
  if (!WARNING_CODES.has(record.code)) invalidArgument(`${label}.code is not a warning code.`);
  if (record.severity !== DiagnosticSeverity.Warning) {
    invalidArgument(`${label}.severity must be DiagnosticSeverity.Warning.`);
  }
  requireString(record.message, `${label}.message`);
  normalizeProjectFilePath(record.path, `${label}.path`, true);
  const range = inspectSourceRange(record.range, `${label}.range`);
  return {
    diagnostic: record as unknown as WarningDiagnostic,
    deeplyFrozen: Object.isFrozen(record) && range.deeplyFrozen,
  };
}

function normalizeDiagnostic(inspection: DiagnosticInspection): WarningDiagnostic {
  if (inspection.deeplyFrozen) return inspection.diagnostic;
  return Object.freeze({
    ...inspection.diagnostic,
    range: Object.freeze({ ...inspection.diagnostic.range }),
  });
}

function inspectStringArray(
  value: unknown,
  label: string,
  options: { readonly requireNonEmpty?: boolean; readonly requireSorted?: boolean } = {}
): readonly string[] {
  const array = requireArray(value, label);
  const seen = new Set<string>();
  let previous: string | undefined;
  for (let index = 0; index < array.length; index++) {
    const item = requireString(array[index], `${label}[${index}]`, !options.requireNonEmpty);
    if (seen.has(item)) invalidArgument(`${label} must not contain duplicate values.`);
    if (options.requireSorted && previous !== undefined && previous >= item) {
      invalidArgument(`${label} must be in deterministic ascending order.`);
    }
    seen.add(item);
    previous = item;
  }
  return array as readonly string[];
}

function inspectParsedFile(value: unknown, label: string): ParsedFileInspection {
  const record = requirePlainRecord(value, label);
  requireExactDataFields(
    record,
    ['path', 'root', 'diagnostics', 'declaredConditions', 'referencedFiles', 'version'],
    label
  );
  const path = normalizeProjectFilePath(record.path, `${label}.path`);
  if (record.path !== path) invalidArgument(`${label}.path must already be normalized.`);
  if (typeof record.version !== 'number' || !Number.isFinite(record.version)) {
    invalidArgument(`${label}.version must be a finite number.`);
  }
  const ast = inspectAstRoot(record.root, `${label}.root`);
  const diagnosticValues = requireArray(record.diagnostics, `${label}.diagnostics`);
  const diagnostics = diagnosticValues.map((diagnostic, index) =>
    inspectWarningDiagnostic(diagnostic, `${label}.diagnostics[${index}]`)
  );
  for (const diagnostic of diagnostics) {
    if (diagnostic.diagnostic.path !== path) {
      invalidArgument(`${label}.diagnostics must refer to ${label}.path.`);
    }
  }
  inspectStringArray(record.declaredConditions, `${label}.declaredConditions`, {
    requireNonEmpty: true,
    requireSorted: true,
  });
  inspectStringArray(record.referencedFiles, `${label}.referencedFiles`, {
    requireNonEmpty: true,
  });

  const file = record as unknown as ParsedFile;
  const deeplyFrozen =
    Object.isFrozen(record) &&
    ast.deeplyFrozen &&
    Object.isFrozen(file.diagnostics) &&
    diagnostics.every((diagnostic) => diagnostic.deeplyFrozen) &&
    Object.isFrozen(file.declaredConditions) &&
    Object.isFrozen(file.referencedFiles);
  return { file, ast, diagnostics, deeplyFrozen };
}

function sameDiagnostic(left: WarningDiagnostic, right: WarningDiagnostic): boolean {
  return (
    left.code === right.code &&
    left.severity === right.severity &&
    left.message === right.message &&
    left.path === right.path &&
    left.range.start === right.range.start &&
    left.range.end === right.range.end &&
    left.range.line === right.range.line
  );
}

function normalizeParsedFile(inspection: ParsedFileInspection): ParsedFile {
  if (inspection.deeplyFrozen) return inspection.file;
  return Object.freeze({
    path: inspection.file.path,
    root: cloneAndFreezeAst(inspection.ast),
    diagnostics: Object.freeze(inspection.diagnostics.map(normalizeDiagnostic)),
    declaredConditions: Object.freeze([...inspection.file.declaredConditions]),
    referencedFiles: Object.freeze([...inspection.file.referencedFiles]),
    version: inspection.file.version,
  });
}

/** Ensures an options argument is a regular data object before reading its fields. */
export function assertOptionsObject(value: unknown, label = 'options'): void {
  requirePlainRecord(value, label);
}

/** Normalizes and validates a public virtual project path. */
export function normalizeProjectFilePath(
  value: unknown,
  label: string,
  allowDefaultInputPath = false
): ProjectFilePath {
  const path = requireString(value, label, false);
  if (path.trim().length === 0) invalidArgument(`${label} must not contain only whitespace.`);
  if (path.includes('\0') || /^(?:[a-zA-Z]:|[\\/])/.test(path)) {
    invalidArgument(`${label} must be a project-relative path.`);
  }
  if (allowDefaultInputPath && path === '<input>') return path;
  const normalized = normalizeVirtualPath(path);
  if (!normalized) invalidArgument(`${label} escapes the virtual project root.`);
  return normalized;
}

/** Validates an AST supplied back through the public API. */
export function validateAstRoot(value: unknown, label = 'root'): AstRoot {
  return inspectAstRoot(value, label).root;
}

/**
 * Validates a transported project and returns frozen files safe for a new snapshot.
 * Already deeply frozen canonical files retain identity; mutable files are copied.
 */
export function normalizeParsedProjectFiles(value: unknown, label: string): readonly ParsedFile[] {
  const record = requirePlainRecord(value, label);
  requireExactDataFields(record, ['files', 'declaredConditions', 'diagnostics'], label);
  const fileValues = requireArray(record.files, `${label}.files`);
  const inspections = fileValues.map((file, index) =>
    inspectParsedFile(file, `${label}.files[${index}]`)
  );

  let previousPath: string | undefined;
  for (const inspection of inspections) {
    if (previousPath !== undefined && previousPath >= inspection.file.path) {
      invalidArgument(`${label}.files must have unique paths in deterministic ascending order.`);
    }
    previousPath = inspection.file.path;
  }

  const conditions = inspectStringArray(record.declaredConditions, `${label}.declaredConditions`, {
    requireNonEmpty: true,
    requireSorted: true,
  });
  const expectedConditions = [
    ...new Set(inspections.flatMap((inspection) => inspection.file.declaredConditions)),
  ].sort();
  if (
    conditions.length !== expectedConditions.length ||
    conditions.some((condition, index) => condition !== expectedConditions[index])
  ) {
    invalidArgument(`${label}.declaredConditions is inconsistent with ${label}.files.`);
  }

  const projectDiagnosticValues = requireArray(record.diagnostics, `${label}.diagnostics`);
  const projectDiagnostics = projectDiagnosticValues.map((diagnostic, index) =>
    inspectWarningDiagnostic(diagnostic, `${label}.diagnostics[${index}]`)
  );
  const expectedDiagnostics = inspections.flatMap((inspection) => inspection.diagnostics);
  if (
    projectDiagnostics.length !== expectedDiagnostics.length ||
    projectDiagnostics.some(
      (diagnostic, index) =>
        !sameDiagnostic(diagnostic.diagnostic, expectedDiagnostics[index]!.diagnostic)
    )
  ) {
    invalidArgument(`${label}.diagnostics is inconsistent with ${label}.files.`);
  }

  return inspections.map(normalizeParsedFile);
}

/** Narrows a validated project for callers that only need to read it. */
export function validateParsedProject(value: unknown, label = 'project'): ParsedProject {
  const files = normalizeParsedProjectFiles(value, label);
  const conditions = new Set<ConditionName>();
  const diagnostics: WarningDiagnostic[] = [];
  for (const file of files) {
    for (const condition of file.declaredConditions) conditions.add(condition);
    diagnostics.push(...file.diagnostics);
  }
  return Object.freeze({
    files: Object.freeze([...files]),
    declaredConditions: Object.freeze([...conditions].sort()),
    diagnostics: Object.freeze(diagnostics),
  });
}
