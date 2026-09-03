import {
  CommentKind,
  ConditionBranchKind,
  DiagnosticCode,
  DiagnosticSeverity,
  InputHandlingMode,
  NodeType,
  PrepTexError,
  PrepTexErrorCode,
  PrepTexSyntaxError,
  isContainerNode,
  isInputHandlingMode,
  mergeProjects,
  parseDocument,
  parseProject,
  serializeDocument,
  transformProject,
  type AstNode,
  type Diagnostic,
  type LineEnding,
  type ParseOptions,
  type ParseResult,
  type ParsedProject,
  type SourceFile,
  type SyntaxDiagnostic,
  type TransformOptions,
  type TransformResult,
} from '@preptex/core';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;
type IsExactly<TActual, TExpected> =
  (<T>() => T extends TActual ? 1 : 2) extends <T>() => T extends TExpected ? 1 : 2 ? true : false;

type ParseReturnIsPrecise = Assert<IsExactly<ReturnType<typeof parseDocument>, ParseResult>>;
type ProjectReturnIsPrecise = Assert<IsExactly<ReturnType<typeof parseProject>, ParsedProject>>;
type TransformReturnIsPrecise = Assert<
  IsExactly<ReturnType<typeof transformProject>, TransformResult>
>;
type ParseReturnIsNotAny = Assert<
  IsAny<ReturnType<typeof parseDocument>> extends false ? true : false
>;
type TextValueIsString = Assert<
  IsExactly<Extract<AstNode, { type: NodeType.Text }>['value'], string>
>;
type NewLineValueIsPrecise = Assert<
  IsExactly<Extract<AstNode, { type: NodeType.NewLine }>['value'], LineEnding>
>;

const parseOptions = {
  maximumSectionLevel: 3,
  sourcePath: 'main.tex',
} as const satisfies ParseOptions;
const sourceFiles = [
  { path: 'main.tex', source: 'Hello \\input{chapter.tex}', version: 1 },
  { path: 'chapter.tex', source: 'Chapter', version: 1 },
] as const satisfies readonly SourceFile[];
const transformOptions = {
  inputHandling: InputHandlingMode.Flatten,
  enabledConditions: ['draft'],
  suppressComments: true,
} as const satisfies TransformOptions;

const parsedDocument: ParseResult = parseDocument('Hello', parseOptions);
const parsedProject: ParsedProject = parseProject(sourceFiles);
const mergedProject: ParsedProject = mergeProjects(parsedProject, parsedProject);
const transformedProject: TransformResult = transformProject(
  'main.tex',
  mergedProject,
  transformOptions
);
const serialized: string = serializeDocument(parsedDocument.root);

const diagnostic: Diagnostic = {
  code: DiagnosticCode.SectionReclassified,
  severity: DiagnosticSeverity.Warning,
  message: 'Section was represented as a command.',
  path: 'main.tex',
  range: { start: 0, end: 0, line: 1 },
};
const syntaxDiagnostic: SyntaxDiagnostic = {
  ...diagnostic,
  code: DiagnosticCode.SyntaxError,
  severity: DiagnosticSeverity.Error,
};
const expectedError: PrepTexError = new PrepTexError(
  'Missing input',
  PrepTexErrorCode.MissingInput
);
const syntaxError: PrepTexSyntaxError = new PrepTexSyntaxError('Cannot parse', syntaxDiagnostic);
const syntaxErrorCode: PrepTexErrorCode.SyntaxError = syntaxError.code;
const untrustedMode: unknown = 'flatten';
if (isInputHandlingMode(untrustedMode)) {
  const narrowedMode: InputHandlingMode = untrustedMode;
  void narrowedMode;
}

for (const file of parsedProject.files) {
  const source: string = file.path;
  const version: number = file.version;
  const diagnostics: readonly Diagnostic[] = file.diagnostics;
  void source;
  void version;
  void diagnostics;

  for (const node of file.root.children) {
    inspectNode(node);
  }
}

function inspectNode(node: AstNode): void {
  if (isContainerNode(node)) {
    const children: readonly AstNode[] = node.children;
    void children;
  }

  switch (node.type) {
    case NodeType.Command: {
      const starred: boolean = node.starred;
      void starred;
      // @ts-expect-error Legacy AST spelling is intentionally not public.
      void node.is_starred;
      break;
    }
    case NodeType.Section: {
      const starred: boolean = node.starred;
      void starred;
      break;
    }
    case NodeType.Math: {
      const delimiter: '$' | '$$' | '\\(' | '\\[' = node.delimiter;
      void delimiter;
      // @ts-expect-error Legacy AST spelling is intentionally not public.
      void node.delim;
      break;
    }
    case NodeType.Comment: {
      const kind: CommentKind = node.kind;
      void kind;
      break;
    }
    case NodeType.ConditionBranch: {
      const branch: ConditionBranchKind = node.branch;
      void branch;
      break;
    }
    default:
      break;
  }
}

// @ts-expect-error Parse results are immutable snapshots.
parsedDocument.path = 'other.tex';
// @ts-expect-error AST child arrays are readonly.
parsedDocument.root.children.push(parsedDocument.root);
// @ts-expect-error Project file arrays are readonly.
parsedProject.files.pop();
// @ts-expect-error Transform output arrays are readonly.
transformedProject.files.splice(0, 1);
// @ts-expect-error Input modes use the named enum, not raw string literals.
const rawStringMode: TransformOptions = { inputHandling: 'flatten' };
// @ts-expect-error The legacy record-shaped project input is not accepted.
parseProject({ 'main.tex': { text: 'Hello', version: 1 } });
// @ts-expect-error The legacy option name is not part of TransformOptions.
const legacyTransformOptions: TransformOptions = { handleInputCmd: InputHandlingMode.Flatten };
// @ts-expect-error TransformResult is not a path-keyed string record.
const legacyOutput: string = transformedProject['main.tex'];

void serialized;
void syntaxError;
void syntaxErrorCode;
void expectedError;
void rawStringMode;
void legacyTransformOptions;
void legacyOutput;
type _Assertions = [
  ParseReturnIsPrecise,
  ProjectReturnIsPrecise,
  TransformReturnIsPrecise,
  ParseReturnIsNotAny,
  TextValueIsString,
  NewLineValueIsPrecise,
];
