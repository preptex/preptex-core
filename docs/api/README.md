**@preptex/core v0.3.0**

***

# @preptex/core v0.3.0

PrepTeX's environment-neutral public API for parsing and transforming virtual
LaTeX projects.

## Enumerations

### CommentKind

Identifies the syntax used to write a comment.

#### Enumeration Members

##### Environment

> **Environment**: `"environment"`

A `comment` environment.

##### Line

> **Line**: `"line"`

A percent comment that continues through its line ending.

***

### ConditionBranchKind

Identifies a conditional branch.

#### Enumeration Members

##### Else

> **Else**: `"Else"`

The optional branch between `\else` and `\fi`.

##### If

> **If**: `"If"`

The branch between `\if...` and `\else` or `\fi`.

***

### DiagnosticCode

Stable machine-readable categories for PrepTeX diagnostics.

#### Enumeration Members

##### IntersectingConstructs

> **IntersectingConstructs**: `"intersecting-constructs"`

Supported grouping constructs close in an intersecting order.

##### SectionReclassified

> **SectionReclassified**: `"section-reclassified"`

A section command was treated as a plain command to preserve nesting.

##### SyntaxError

> **SyntaxError**: `"syntax-error"`

The source contains malformed or unbalanced supported syntax.

##### TokenizationAdjusted

> **TokenizationAdjusted**: `"tokenization-adjusted"`

Tokenization was narrowed because two supported constructs intersect.

##### UnmatchedClosing

> **UnmatchedClosing**: `"unmatched-closing"`

A closing construct has no corresponding opener.

***

### DiagnosticSeverity

The severity assigned to a parse diagnostic.

#### Enumeration Members

##### Error

> **Error**: `"error"`

The source could not be parsed safely.

##### Warning

> **Warning**: `"warning"`

Parsing succeeded after a documented fallback or reclassification.

***

### ~~InputHandlingMode~~

Controls how `\input` nodes are handled while transforming a legacy project.

#### Deprecated

New workflows separate ViewConfiguration.traversal from ExportOptions.inputs; see docs/migration-0.3.md.

#### Enumeration Members

##### ~~Flatten~~

> **Flatten**: `"flatten"`

Emit the entry file with reachable `\input` targets inlined.

##### ~~Preserve~~

> **Preserve**: `"preserve"`

Emit the entry file and preserve each `\input` command literally.

##### ~~Separate~~

> **Separate**: `"separate"`

Emit every parsed project file separately without inlining.

***

### NodeType

Identifies every node shape in a PrepTeX syntax tree.

#### Enumeration Members

##### Command

> **Command**: `"Command"`

A LaTeX control sequence.

##### Comment

> **Comment**: `"Comment"`

A percent comment or `comment` environment.

##### Condition

> **Condition**: `"Condition"`

A complete `\if...\fi` conditional.

##### ConditionBranch

> **ConditionBranch**: `"ConditionBranch"`

The selected or alternative branch of a conditional.

##### ConditionDeclaration

> **ConditionDeclaration**: `"ConditionDeclaration"`

A `\newif` declaration.

##### Environment

> **Environment**: `"Environment"`

A `\begin`/`\end` environment pair.

##### Group

> **Group**: `"Group"`

A brace-delimited group.

##### Input

> **Input**: `"Input"`

An `\input` command.

##### Math

> **Math**: `"Math"`

A delimited inline or display math region.

##### NewLine

> **NewLine**: `"NewLine"`

A line-feed, carriage-return, or CRLF sequence.

##### Root

> **Root**: `"Root"`

The synthetic root of one parsed source file.

##### Section

> **Section**: `"Section"`

A section command or the `document` environment.

##### Text

> **Text**: `"Text"`

Literal source text that was not classified more specifically.

***

### PrepTexErrorCode

Stable machine-readable categories for exceptions thrown by PrepTeX.

#### Enumeration Members

##### CircularInput

> **CircularInput**: `"circular-input"`

Flattening would revisit a file that is already active.

##### EditConflict

> **EditConflict**: `"edit-conflict"`

Occurrence-specific edits cannot be represented by one physical file.

##### InvalidArgument

> **InvalidArgument**: `"invalid-argument"`

A runtime value does not satisfy the documented public input type.

##### InvalidEdit

> **InvalidEdit**: `"invalid-edit"`

Source edit ranges or preconditions are invalid.

##### MissingEntry

> **MissingEntry**: `"missing-entry"`

The requested project entry path is absent.

##### MissingInput

> **MissingInput**: `"missing-input"`

A flattened `\input` target cannot be resolved.

##### OperationUnavailable

> **OperationUnavailable**: `"operation-unavailable"`

The requested operation cannot run against this representation or coverage.

##### OutputLimit

> **OutputLimit**: `"output-limit"`

Emission exceeded the caller's configured output bound.

##### StaleResult

> **StaleResult**: `"stale-result"`

Source or configured identity no longer matches the proposal.

##### SyntaxError

> **SyntaxError**: `"syntax-error"`

Supported LaTeX syntax is malformed or unbalanced.

***

### TokenType

Identifies token categories that can be enabled during parsing.

#### Enumeration Members

##### Brace

> **Brace**: `"Brace"`

Opening and closing brace tokens.

##### Command

> **Command**: `"Command"`

General control-sequence tokens.

##### Comment

> **Comment**: `"Comment"`

Percent-comment and `comment`-environment tokens.

##### Condition

> **Condition**: `"Condition"`

`\if...`, `\else`, and `\fi` tokens.

##### ConditionDeclaration

> **ConditionDeclaration**: `"ConditionDeclaration"`

`\newif` tokens.

##### Environment

> **Environment**: `"Environment"`

`\begin` and `\end` tokens.

##### Input

> **Input**: `"Input"`

`\input` tokens.

##### MathDelim

> **MathDelim**: `"MathDelim"`

Dollar and control-sequence math delimiters.

##### NewLine

> **NewLine**: `"NewLine"`

Line-ending tokens.

##### Section

> **Section**: `"Section"`

Supported section-command tokens.

##### Text

> **Text**: `"Text"`

Text not classified as another enabled token type.

## Classes

### PrepTexError

Base class for expected PrepTeX failures.

#### Extends

- `Error`

#### Extended by

- [`PrepTexSyntaxError`](#preptexsyntaxerror)
- [`ProjectOperationError`](#projectoperationerror)

#### Constructors

##### Constructor

> **new PrepTexError**(`message`, `code`): [`PrepTexError`](#preptexerror)

Creates an expected PrepTeX failure.

###### Parameters

###### message

`string`

Human-readable failure description.

###### code

[`PrepTexErrorCode`](#preptexerrorcode)

Stable machine-readable category.

###### Returns

[`PrepTexError`](#preptexerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`PrepTexErrorCode`](#preptexerrorcode)

Stable category suitable for programmatic error handling.

##### message

> **message**: `string`

###### Inherited from

`Error.message`

##### name

> **name**: `string`

###### Inherited from

`Error.name`

##### stack?

> `optional` **stack?**: `string`

###### Inherited from

`Error.stack`

***

### PrepTexSyntaxError

Error thrown when supported LaTeX syntax cannot be parsed safely.

#### Extends

- [`PrepTexError`](#preptexerror)

#### Constructors

##### Constructor

> **new PrepTexSyntaxError**(`message`, `diagnostic`): [`PrepTexSyntaxError`](#preptexsyntaxerror)

Creates a syntax error from a structured diagnostic.

###### Parameters

###### message

`string`

Human-readable parse failure description.

###### diagnostic

[`SyntaxDiagnostic`](#syntaxdiagnostic)

Structured error location and code.

###### Returns

[`PrepTexSyntaxError`](#preptexsyntaxerror)

###### Overrides

[`PrepTexError`](#preptexerror).[`constructor`](#constructor)

#### Properties

##### code

> `readonly` **code**: [`SyntaxError`](#syntaxerror-1)

Literal syntax-error category for exhaustive error handling.

###### Overrides

[`PrepTexError`](#preptexerror).[`code`](#code)

##### diagnostic

> `readonly` **diagnostic**: [`SyntaxDiagnostic`](#syntaxdiagnostic)

Structured error diagnostic containing the source and location.

##### message

> **message**: `string`

###### Inherited from

[`PrepTexError`](#preptexerror).[`message`](#message)

##### name

> **name**: `string`

###### Inherited from

[`PrepTexError`](#preptexerror).[`name`](#name)

##### stack?

> `optional` **stack?**: `string`

###### Inherited from

[`PrepTexError`](#preptexerror).[`stack`](#stack)

***

### ProjectOperationError

Expected analysis/edit/export rejection with transport-safe located reasons.

#### Extends

- [`PrepTexError`](#preptexerror)

#### Constructors

##### Constructor

> **new ProjectOperationError**(`failure`): [`ProjectOperationError`](#projectoperationerror)

Create a located operation failure.

###### Parameters

###### failure

[`OperationFailure`](#operationfailure)

Stable code, message, and original locations.

###### Returns

[`ProjectOperationError`](#projectoperationerror)

###### Overrides

[`PrepTexError`](#preptexerror).[`constructor`](#constructor)

#### Properties

##### code

> `readonly` **code**: [`PrepTexErrorCode`](#preptexerrorcode)

Stable category suitable for programmatic error handling.

###### Inherited from

[`PrepTexError`](#preptexerror).[`code`](#code)

##### failure

> `readonly` **failure**: [`OperationFailure`](#operationfailure)

Structured failure; serialize this instead of stack traces.

##### message

> **message**: `string`

###### Inherited from

[`PrepTexError`](#preptexerror).[`message`](#message)

##### name

> **name**: `string`

###### Inherited from

[`PrepTexError`](#preptexerror).[`name`](#name)

##### stack?

> `optional` **stack?**: `string`

###### Inherited from

[`PrepTexError`](#preptexerror).[`stack`](#stack)

## Interfaces

### AnalysisFinding

A located analysis finding with explicit coverage qualifications.

#### Properties

##### code

> `readonly` **code**: `"no-recognized-use"` \| `"missing-reference"` \| `"duplicate-label"` \| `"forward-reference"` \| `"unresolved-key"`

Stable finding code.

##### message

> `readonly` **message**: `string`

Qualified explanation within the supported grammar.

##### primary

> `readonly` **primary**: [`AnalysisLocation`](#analysislocation)

Primary occurrence.

##### related

> `readonly` **related**: readonly [`AnalysisLocation`](#analysislocation)[]

Related occurrences, in execution order.

##### severity

> `readonly` **severity**: `"warning"` \| `"information"`

Forward references and unused candidates are information, not TeX errors.

***

### AnalysisLocation

Location for a source-only fact or configured occurrence.

#### Extends

- [`SourceLocation`](#sourcelocation)

#### Properties

##### occurrenceId

> `readonly` **occurrenceId**: `string` \| `null`

Inclusion ID, or null for independent source inspection.

##### path

> `readonly` **path**: `string`

Normalized project-relative source path.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`path`](#path-8)

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`range`](#range-2)

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact source identity.

***

### AnalysisOptions

Options shared by independently runnable analyses.

#### Properties

##### allowIncomplete?

> `readonly` `optional` **allowIncomplete?**: `boolean`

Accept observations up to the view's failure boundary; default false.

##### scope?

> `readonly` `optional` **scope?**: [`SourceScope`](#sourcescope)

Snapshot-only source scope; default all-files.

***

### AnalysisResult

Analysis output with qualified findings and exact operation dependencies.

#### Properties

##### commands

> `readonly` **commands**: readonly [`CommandUsage`](#commandusage)[]

Command evidence, empty for reference analysis.

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-2)

Explicit recognized coverage; an empty partial list does not establish absence.

##### findings

> `readonly` **findings**: readonly [`AnalysisFinding`](#analysisfinding)[]

Findings in reference encounter order or definition source/encounter order for command evidence.

##### kind

> `readonly` **kind**: `"findings"`

Analysis-result discriminant.

##### provenance

> `readonly` **provenance**: [`OperationProvenance`](#operationprovenance)

Exact source, view, operation version, and options.

##### references

> `readonly` **references**: readonly [`ReferenceResolution`](#referenceresolution)[]

Reference observations, empty for unused-command analysis.

##### resultId

> `readonly` **resultId**: `string`

Exact source/view/operation/options result key.

***

### ArtifactDependency

A retained input relationship in emitted source.

#### Properties

##### fromPath

> `readonly` **fromPath**: `string`

Artifact containing the reference.

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Inclusive location in the emitted artifact, not an original offset.

##### reference

> `readonly` **reference**: `string` \| `null`

Exact literal spelling, or null for dynamic source.

##### status

> `readonly` **status**: `"missing"` \| `"present"` \| `"ambiguous"` \| `"dynamic"` \| `"invalid-path"`

Whether the output artifact set satisfies this literal relationship.

##### targetPath

> `readonly` **targetPath**: `string` \| `null`

Resolved artifact path, null when unresolved/missing/ambiguous.

***

### AstRoot

The synthetic root for one parsed source file.

#### Extends

- [`ContainerNodeBase`](#containernodebase)\<[`Root`](#root)\>

#### Properties

##### children

> `readonly` **children**: readonly [`AstNode`](#astnode)[]

Child nodes in source order.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`children`](#children-3)

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`end`](#end-6)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`id`](#id-6)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`line`](#line-7)

##### prefix

> `readonly` **prefix**: `string`

Original source text emitted before the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`prefix`](#prefix-3)

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`start`](#start-6)

##### suffix

> `readonly` **suffix**: `string`

Original source text emitted after the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`suffix`](#suffix-3)

##### type

> `readonly` **type**: [`Root`](#root)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`type`](#type-6)

***

### BranchContext

Syntactic branch membership does not establish execution.

#### Properties

##### arm

> `readonly` **arm**: `"then"` \| `"else"`

Syntactic arm containing the fact.

##### test

> `readonly` **test**: [`SourceRange`](#sourcerange)

Range of the source conditional opener in the same file.

***

### CapabilityReason

Structured operation ineligibility.

#### Properties

##### code

> `readonly` **code**: `"not-implemented"` \| `"wrong-model"` \| `"view-not-ready"` \| `"missing-file"`

Stable reason.

##### message

> `readonly` **message**: `string`

Display explanation.

***

### CommandNode

A general LaTeX control sequence.

#### Extends

- [`NodeBase`](#nodebase)\<[`Command`](#command)\>

#### Properties

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`end`](#end-12)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`NodeBase`](#nodebase).[`id`](#id-13)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`NodeBase`](#nodebase).[`line`](#line-13)

##### name

> `readonly` **name**: `string`

Control-sequence name without the leading backslash or star.

##### starred

> `readonly` **starred**: `boolean`

Whether a star immediately followed the control-sequence name.

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`start`](#start-12)

##### type

> `readonly` **type**: [`Command`](#command)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`NodeBase`](#nodebase).[`type`](#type-12)

##### value

> `readonly` **value**: `string`

Exact source spelling, including consumed delimiter whitespace.

***

### CommandUsage

Conservative per-definition command evidence; never permission to delete a definition.

#### Properties

##### bodyReferences

> `readonly` **bodyReferences**: readonly [`AnalysisLocation`](#analysislocation)[]

Uses inside other stored definitions/defaults.

##### classification

> `readonly` **classification**: `"directly-used"` \| `"body-referenced"` \| `"self-recursive-only"` \| `"no-recognized-use"` \| `"ambiguous-binding"`

Qualified classification within the requested coverage.

##### definition

> `readonly` **definition**: [`AnalysisLocation`](#analysislocation)

Source or configured definition occurrence.

##### directUses

> `readonly` **directUses**: readonly [`AnalysisLocation`](#analysislocation)[]

Direct document uses; ambiguous source bindings can appear in several candidates.

##### name

> `readonly` **name**: `string`

Defined name without the backslash.

##### selfReferences

> `readonly` **selfReferences**: readonly [`AnalysisLocation`](#analysislocation)[]

Self references are listed separately and are not root uses.

***

### CommentNode

A percent comment or `comment` environment.

#### Extends

- [`NodeBase`](#nodebase)\<[`Comment`](#comment)\>

#### Properties

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`end`](#end-12)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`NodeBase`](#nodebase).[`id`](#id-13)

##### kind

> `readonly` **kind**: [`CommentKind`](#commentkind)

The comment syntax recognized by the lexer.

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`NodeBase`](#nodebase).[`line`](#line-13)

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`start`](#start-12)

##### type

> `readonly` **type**: [`Comment`](#comment)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`NodeBase`](#nodebase).[`type`](#type-12)

##### value

> `readonly` **value**: `string`

The exact source text covered by this comment.

***

### ConditionBranchNode

One branch of a LaTeX conditional.

#### Extends

- [`ContainerNodeBase`](#containernodebase)\<[`ConditionBranch`](#conditionbranch)\>

#### Properties

##### branch

> `readonly` **branch**: [`ConditionBranchKind`](#conditionbranchkind)

Whether this is the `if` or `else` branch.

##### children

> `readonly` **children**: readonly [`AstNode`](#astnode)[]

Child nodes in source order.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`children`](#children-3)

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`end`](#end-6)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`id`](#id-6)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`line`](#line-7)

##### name

> `readonly` **name**: `string`

Name of the containing condition.

##### prefix

> `readonly` **prefix**: `string`

Original source text emitted before the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`prefix`](#prefix-3)

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`start`](#start-6)

##### suffix

> `readonly` **suffix**: `string`

Original source text emitted after the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`suffix`](#suffix-3)

##### type

> `readonly` **type**: [`ConditionBranch`](#conditionbranch)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`type`](#type-6)

***

### ConditionDecision

One evaluated or skipped test. Unknown is distinct from false and not-reached.

#### Properties

##### command

> `readonly` **command**: `string`

Full control sequence name.

##### effectiveValue

> `readonly` **effectiveValue**: `boolean` \| `null`

Effective value after policy; null means unknown or not reached.

##### origin

> `readonly` **origin**: [`SourceOrigin`](#sourceorigin)

Original test occurrence.

##### outcome

> `readonly` **outcome**: `"false"` \| `"true"` \| `"unknown"` \| `"not-reached"`

Reached result or explicit skipped marker.

##### trackedValue

> `readonly` **trackedValue**: `boolean` \| `null`

Source state at this point; null means unknown or not reached.

***

### ConditionDeclarationNode

A `\newif` condition declaration.

#### Extends

- [`NodeBase`](#nodebase)\<[`ConditionDeclaration`](#conditiondeclaration)\>

#### Properties

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`end`](#end-12)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`NodeBase`](#nodebase).[`id`](#id-13)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`NodeBase`](#nodebase).[`line`](#line-13)

##### name

> `readonly` **name**: `string`

Declared condition name without the leading `if`.

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`start`](#start-12)

##### type

> `readonly` **type**: [`ConditionDeclaration`](#conditiondeclaration)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`NodeBase`](#nodebase).[`type`](#type-12)

##### value

> `readonly` **value**: `string`

Exact source spelling of the declaration.

***

### ConditionNode

A complete LaTeX conditional.

#### Extends

- [`ContainerNodeBase`](#containernodebase)\<[`Condition`](#condition)\>

#### Properties

##### children

> `readonly` **children**: readonly [`AstNode`](#astnode)[]

Child nodes in source order.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`children`](#children-3)

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`end`](#end-6)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`id`](#id-6)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`line`](#line-7)

##### name

> `readonly` **name**: `string`

Condition name without the leading `if`.

##### prefix

> `readonly` **prefix**: `string`

Original source text emitted before the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`prefix`](#prefix-3)

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`start`](#start-6)

##### suffix

> `readonly` **suffix**: `string`

Original source text emitted after the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`suffix`](#suffix-3)

##### type

> `readonly` **type**: [`Condition`](#condition)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`type`](#type-6)

***

### ConfiguredIndex

Reusable configured fact index in execution order.

#### Properties

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-2)

Coverage includes the view's stop boundary and possible macro-generated syntax.

##### entries

> `readonly` **entries**: readonly [`ReachedFact`](#reachedfact)[]

Reached labels, references, definitions, and command uses.

##### resultId

> `readonly` **resultId**: `string`

Deterministic index identity including its implementation version.

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact source identity.

##### viewId

> `readonly` **viewId**: `string`

Exact view identity.

***

### ConfiguredNodeBase

Common fields on configured structural nodes; these are not legacy AstNodes.

#### Properties

##### occurrenceKey

> `readonly` **occurrenceKey**: `string`

Deterministic node key unique within the view.

##### origins

> `readonly` **origins**: readonly [`SourceOrigin`](#sourceorigin)[]

Ordered contributing original spans; excludes all omitted gaps.

##### projectedRange

> `readonly` **projectedRange**: [`SourceRange`](#sourcerange)

Inclusive range in the virtual selected token tape; empty root ends at -1.

##### viewId

> `readonly` **viewId**: `string`

Exact configured view identity.

***

### ContainerNodeBase

Shared fields present on nodes that contain other nodes.

#### Extends

- [`NodeBase`](#nodebase)\<`TType`\>

#### Extended by

- [`AstRoot`](#astroot)
- [`ConditionBranchNode`](#conditionbranchnode)
- [`ConditionNode`](#conditionnode)
- [`EnvironmentNode`](#environmentnode)
- [`GroupNode`](#groupnode)
- [`MathNode`](#mathnode)
- [`SectionNode`](#sectionnode)

#### Type Parameters

##### TType

`TType` *extends* [`ContainerNodeType`](#containernodetype)

#### Properties

##### children

> `readonly` **children**: readonly [`AstNode`](#astnode)[]

Child nodes in source order.

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`end`](#end-12)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`NodeBase`](#nodebase).[`id`](#id-13)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`NodeBase`](#nodebase).[`line`](#line-13)

##### prefix

> `readonly` **prefix**: `string`

Original source text emitted before the children.

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`start`](#start-12)

##### suffix

> `readonly` **suffix**: `string`

Original source text emitted after the children.

##### type

> `readonly` **type**: `TType`

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`NodeBase`](#nodebase).[`type`](#type-12)

***

### Coverage

Completeness is always relative to the documented recognized grammar.

#### Properties

##### assumptions

> `readonly` **assumptions**: readonly `string`[]

Assumptions that apply even to a complete result.

##### issues

> `readonly` **issues**: readonly [`ProjectIssue`](#projectissue)[]

Located limitations, in deterministic encounter order.

##### profile

> `readonly` **profile**: `"direct-latex-v1"`

Grammar under which observations were made.

##### status

> `readonly` **status**: `"complete"` \| `"partial"`

Complete recognized coverage, or explicitly limited observations.

***

### EnvironmentNode

A matched LaTeX environment other than `document`.

#### Extends

- [`ContainerNodeBase`](#containernodebase)\<[`Environment`](#environment-1)\>

#### Properties

##### children

> `readonly` **children**: readonly [`AstNode`](#astnode)[]

Child nodes in source order.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`children`](#children-3)

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`end`](#end-6)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`id`](#id-6)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`line`](#line-7)

##### name

> `readonly` **name**: `string`

Environment name between the braces.

##### prefix

> `readonly` **prefix**: `string`

Original source text emitted before the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`prefix`](#prefix-3)

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`start`](#start-6)

##### suffix

> `readonly` **suffix**: `string`

Original source text emitted after the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`suffix`](#suffix-3)

##### type

> `readonly` **type**: [`Environment`](#environment-1)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`type`](#type-6)

***

### ExportOptions

Output policies for a configured project. No filename rewriting is performed.

#### Properties

##### conditions

> `readonly` **conditions**: `"materialize"` \| `"preserve"`

Keep wrappers/inactive slices exactly, or export only resolved source.

##### inputs

> `readonly` **inputs**: `"preserve"` \| `"inline"`

Preserve input commands and relative files, or expand active occurrences.

##### maxOutputCodeUnits?

> `readonly` `optional` **maxOutputCodeUnits?**: `number`

Total UTF-16 output limit across artifacts, default 10000000; maximum 100000000.

##### suppressComments?

> `readonly` `optional` **suppressComments?**: `boolean`

Remove eligible active comments; default false.

***

### FactContext

Context shared by every source inventory fact.

#### Properties

##### branches

> `readonly` **branches**: readonly [`BranchContext`](#branchcontext)[]

Enclosing source branches, outermost first.

##### definitionBodies

> `readonly` **definitionBodies**: readonly [`SourceRange`](#sourcerange)[]

Enclosing definition bodies, outermost first.

##### opaqueArguments

> `readonly` **opaqueArguments**: readonly [`SourceRange`](#sourcerange)[]

Stored/opaque command arguments, outermost first; these are not executed.

***

### GeneratedArtifact

Generated artifact, separate from source inputs.

#### Properties

##### origins

> `readonly` **origins**: readonly [`ArtifactOrigin`](#artifactorigin)[]

Mappings ordered by output offset. They may overlap when identical output retains several inclusion origins.

##### path

> `readonly` **path**: `string`

Artifact virtual path in an independent namespace.

##### provenance

> `readonly` **provenance**: [`OperationProvenance`](#operationprovenance)

Exact operation preconditions.

##### remainingInputs

> `readonly` **remainingInputs**: readonly `string`[]

Preserved literal dependencies; empty alone does not certify TeX portability.

##### source

> `readonly` **source**: `string`

Generated source string.

##### topology

> `readonly` **topology**: `"preserved-project"` \| `"active-inputs-expanded"` \| `"self-contained-profile"` \| `"independent-sources"`

Explicit export completeness claim.

***

### GroupNode

A brace-delimited group.

#### Extends

- [`ContainerNodeBase`](#containernodebase)\<[`Group`](#group)\>

#### Properties

##### children

> `readonly` **children**: readonly [`AstNode`](#astnode)[]

Child nodes in source order.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`children`](#children-3)

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`end`](#end-6)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`id`](#id-6)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`line`](#line-7)

##### prefix

> `readonly` **prefix**: `string`

Original source text emitted before the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`prefix`](#prefix-3)

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`start`](#start-6)

##### suffix

> `readonly` **suffix**: `string`

Original source text emitted after the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`suffix`](#suffix-3)

##### type

> `readonly` **type**: [`Group`](#group)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`type`](#type-6)

***

### InputNode

An `\input` command.

#### Extends

- [`NodeBase`](#nodebase)\<[`Input`](#input)\>

#### Properties

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`end`](#end-12)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`NodeBase`](#nodebase).[`id`](#id-13)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`NodeBase`](#nodebase).[`line`](#line-13)

##### path

> `readonly` **path**: `string`

Requested virtual-project path exactly as written inside the command.

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`start`](#start-12)

##### type

> `readonly` **type**: [`Input`](#input)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`NodeBase`](#nodebase).[`type`](#type-12)

##### value

> `readonly` **value**: `string`

Exact source spelling of the command.

***

### InputOccurrence

A repeated visit to a source file has its own inclusion identity.

#### Properties

##### id

> `readonly` **id**: `string`

View-local inclusion ID.

##### parentId

> `readonly` **parentId**: `string` \| `null`

Parent inclusion, null for entry.

##### path

> `readonly` **path**: `string`

Included source path.

##### reference

> `readonly` **reference**: [`SourceOrigin`](#sourceorigin) \| `null`

Original input reference, null for entry.

***

### InventoryRequest

Source inventory request; no entry, conditions, or output destination.

#### Properties

##### kinds?

> `readonly` `optional` **kinds?**: readonly (`"input"` \| `"definition"` \| `"command-use"` \| `"label"` \| `"reference"` \| `"condition-declaration"` \| `"condition-test"` \| `"condition-delimiter"` \| `"condition-assignment"` \| `"opaque"`)[]

Fact categories; omitted means all; empty means none.

##### scope?

> `readonly` `optional` **scope?**: [`SourceScope`](#sourcescope)

Source set; default all files.

***

### InventoryResult

Located source inventory with exact operation/source provenance.

#### Properties

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-2)

Coverage of the requested files.

##### facts

> `readonly` **facts**: readonly [`SyntaxFact`](#syntaxfact)[]

Facts sorted by file, offset, and category.

##### kind

> `readonly` **kind**: `"inventory"`

Result discriminant.

##### operationId

> `readonly` **operationId**: `"source-inventory"`

Descriptor ID.

##### operationVersion

> `readonly` **operationVersion**: `1`

Operation implementation version.

##### resultId

> `readonly` **resultId**: `string`

Deterministic source/options/operation identity.

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact snapshot.

***

### MathNode

A delimited LaTeX math region.

#### Extends

- [`ContainerNodeBase`](#containernodebase)\<[`Math`](#math)\>

#### Properties

##### children

> `readonly` **children**: readonly [`AstNode`](#astnode)[]

Child nodes in source order.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`children`](#children-3)

##### delimiter

> `readonly` **delimiter**: [`MathDelimiter`](#mathdelimiter)

Opening math delimiter; the matching closer is represented by `suffix`.

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`end`](#end-6)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`id`](#id-6)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`line`](#line-7)

##### prefix

> `readonly` **prefix**: `string`

Original source text emitted before the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`prefix`](#prefix-3)

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`start`](#start-6)

##### suffix

> `readonly` **suffix**: `string`

Original source text emitted after the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`suffix`](#suffix-3)

##### type

> `readonly` **type**: [`Math`](#math)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`type`](#type-6)

***

### NewLineNode

A source line ending.

#### Extends

- [`NodeBase`](#nodebase)\<[`NewLine`](#newline)\>

#### Properties

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`end`](#end-12)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`NodeBase`](#nodebase).[`id`](#id-13)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`NodeBase`](#nodebase).[`line`](#line-13)

##### originalLineIsWhitespaceOnly

> `readonly` **originalLineIsWhitespaceOnly**: `boolean`

Whether the source line before this ending contained only whitespace.

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`start`](#start-12)

##### type

> `readonly` **type**: [`NewLine`](#newline)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`NodeBase`](#nodebase).[`type`](#type-12)

##### value

> `readonly` **value**: [`LineEnding`](#lineending)

The exact line-ending sequence: LF, CR, or CRLF.

***

### NodeBase

Shared fields present on every syntax-tree node.

#### Extends

- [`SourceRange`](#sourcerange)

#### Extended by

- [`CommandNode`](#commandnode)
- [`CommentNode`](#commentnode)
- [`ConditionDeclarationNode`](#conditiondeclarationnode)
- [`ContainerNodeBase`](#containernodebase)
- [`InputNode`](#inputnode)
- [`NewLineNode`](#newlinenode)
- [`TextNode`](#textnode)

#### Type Parameters

##### TType

`TType` *extends* [`NodeType`](#nodetype)

#### Properties

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`SourceRange`](#sourcerange).[`end`](#end-14)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`SourceRange`](#sourcerange).[`line`](#line-15)

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`SourceRange`](#sourcerange).[`start`](#start-14)

##### type

> `readonly` **type**: `TType`

Discriminant used to narrow the [AstNode](#astnode) union.

***

### NormalizedScanOptions

Canonical options stored in each snapshot and included in its identity.

#### Properties

##### maxNesting

> `readonly` **maxNesting**: `number`

Maximum inventory recursion depth.

##### verbatimEnvironments

> `readonly` **verbatimEnvironments**: readonly `string`[]

Sorted unique names, including verbatim, verbatim*, and comment.

***

### NormalizedViewConfiguration

Fully specified canonical view settings.

#### Properties

##### conditions

> `readonly` **conditions**: [`ConditionPolicy`](#conditionpolicy)

Explicit normalized policy with sorted maps.

##### entryPath

> `readonly` **entryPath**: `string`

Normalized entry.

##### limits

> `readonly` **limits**: `Required`\<[`ViewLimits`](#viewlimits)\>

All limits are present.

##### profile

> `readonly` **profile**: `"direct-latex-v1"`

Interpretation grammar.

##### traversal

> `readonly` **traversal**: `"project"` \| `"file-only"`

Semantic input traversal.

***

### OperationDescriptor

Machine-readable operation requirements; descriptors contain no executable callbacks.

#### Properties

##### coverage

> `readonly` **coverage**: `"recognized"` \| `"ready-view"`

Required completeness.

##### id

> `readonly` **id**: `"source-inventory"` \| `"resolve-view"` \| `"references"` \| `"unused-commands"` \| `"suppress-comments"` \| `"identity"` \| `"materialize"` \| `"export-project"`

Stable operation name.

##### implemented

> `readonly` **implemented**: `boolean`

Whether execution is shipped in this release.

##### representation

> `readonly` **representation**: `"snapshot"` \| `"view"` \| `"either"`

Required model, allowing a source or selected-path comment operation.

##### resultKind

> `readonly` **resultKind**: `"view"` \| `"inventory"` \| `"findings"` \| `"edits"` \| `"artifacts"`

Output category.

##### scopes

> `readonly` **scopes**: readonly (`"all-files"` \| `"files"` \| `"configured"`)[]

Valid source/execution scopes.

##### version

> `readonly` **version**: `1`

Contract version.

***

### OperationFailure

Located structured rejection of an analysis, edit, or export operation.

#### Properties

##### code

> `readonly` **code**: `"unavailable"` \| `"stale-result"` \| `"invalid-edit"` \| `"edit-conflict"` \| `"output-limit"`

Stable category, independent of explanatory prose.

##### locations

> `readonly` **locations**: readonly [`AnalysisLocation`](#analysislocation)[]

Relevant original locations; empty when no source range applies.

##### message

> `readonly` **message**: `string`

Human-readable explanation.

***

### OperationProvenance

Exact dependencies shared by findings/edit/artifact results.

#### Properties

##### operationVersion

> `readonly` **operationVersion**: `1`

Operation contract version.

##### request

> `readonly` **request**: [`OperationRequest`](#operationrequest)

Typed operation and all of its semantic options.

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact source identity.

##### viewId

> `readonly` **viewId**: `string` \| `null`

Exact configured identity, null for source-local work.

***

### ParsedFile

A parsed project file and the caller-owned version associated with it.

#### Extends

- [`ParseResult`](#parseresult)

#### Properties

##### declaredConditions

> `readonly` **declaredConditions**: readonly `string`[]

Distinct declared condition names in ascending code-unit order.

###### Inherited from

[`ParseResult`](#parseresult).[`declaredConditions`](#declaredconditions-2)

##### diagnostics

> `readonly` **diagnostics**: readonly [`WarningDiagnostic`](#warningdiagnostic)[]

Non-fatal parser warnings in ascending source-offset order.

###### Inherited from

[`ParseResult`](#parseresult).[`diagnostics`](#diagnostics-2)

##### path

> `readonly` **path**: `string`

Normalized virtual source path associated with this parse.

###### Inherited from

[`ParseResult`](#parseresult).[`path`](#path-5)

##### referencedFiles

> `readonly` **referencedFiles**: readonly `string`[]

Distinct paths requested by `\input` commands, in first-encounter order.

###### Inherited from

[`ParseResult`](#parseresult).[`referencedFiles`](#referencedfiles-1)

##### root

> `readonly` **root**: [`AstRoot`](#astroot)

Immutable syntax-tree root.

###### Inherited from

[`ParseResult`](#parseresult).[`root`](#root-2)

##### version

> `readonly` **version**: `number`

Version copied from the corresponding [SourceFile](#sourcefile).

***

### ParsedProject

A transport-safe, immutable parsed project.

#### Properties

##### declaredConditions

> `readonly` **declaredConditions**: readonly `string`[]

Distinct condition names in ascending code-unit order.

##### diagnostics

> `readonly` **diagnostics**: readonly [`WarningDiagnostic`](#warningdiagnostic)[]

Diagnostics grouped by deterministic file order, then by source offset.

##### files

> `readonly` **files**: readonly [`ParsedFile`](#parsedfile)[]

Parsed files in deterministic path order.

***

### ~~ParseOptions~~

Options for parsing one legacy LaTeX document.

#### Deprecated

New workflows use ScanOptions and ViewConfiguration with different semantics; see docs/migration-0.3.md.

#### Properties

##### ~~enabledTokens?~~

> `readonly` `optional` **enabledTokens?**: readonly [`TokenType`](#tokentype)[]

Token categories recognized by the lexer.

Omit this field to enable every supported category. Disabled constructs are
preserved as text where possible.

##### ~~maximumSectionLevel?~~

> `readonly` `optional` **maximumSectionLevel?**: [`SectionLevel`](#sectionlevel)

Deepest section command represented as a section node.

Deeper section commands are represented as ordinary command nodes. Omit this
field to recognize all supported levels.

##### ~~sourcePath?~~

> `readonly` `optional` **sourcePath?**: `string`

Virtual path attached to diagnostics; defaults to `<input>`.

***

### ParseResult

The immutable result of parsing one LaTeX source string.

#### Extended by

- [`ParsedFile`](#parsedfile)

#### Properties

##### declaredConditions

> `readonly` **declaredConditions**: readonly `string`[]

Distinct declared condition names in ascending code-unit order.

##### diagnostics

> `readonly` **diagnostics**: readonly [`WarningDiagnostic`](#warningdiagnostic)[]

Non-fatal parser warnings in ascending source-offset order.

##### path

> `readonly` **path**: `string`

Normalized virtual source path associated with this parse.

##### referencedFiles

> `readonly` **referencedFiles**: readonly `string`[]

Distinct paths requested by `\input` commands, in first-encounter order.

##### root

> `readonly` **root**: [`AstRoot`](#astroot)

Immutable syntax-tree root.

***

### ProjectEditPlan

Immutable proposal, not applied source. Equal-offset insertions and insertion/replacement overlap are rejected.

#### Properties

##### edits

> `readonly` **edits**: readonly [`ProjectEdit`](#projectedit)[]

Edits in ascending path/offset order; boundaries may not split a UTF-16 surrogate pair.

##### kind

> `readonly` **kind**: `"edits"`

Edit result discriminant.

##### provenance

> `readonly` **provenance**: [`OperationProvenance`](#operationprovenance)

Exact preconditions.

***

### ProjectIssue

A located issue with an inclusion chain when produced by interpretation.

#### Properties

##### code

> `readonly` **code**: [`ProjectIssueCode`](#projectissuecode-1)

Stable category for control flow.

##### inputChain

> `readonly` **inputChain**: readonly `string`[]

Entry-to-current inclusion IDs, empty for source-only issues.

##### location

> `readonly` **location**: [`SourceLocation`](#sourcelocation) \| `null`

Original location, or null for an absent entry/empty project.

##### message

> `readonly` **message**: `string`

Human-readable explanation.

##### severity

> `readonly` **severity**: `"error"` \| `"warning"`

Error blocks required syntax; warning denotes unsupported or uncertain behavior.

***

### ~~ProjectParseOptions~~

Options applied uniformly while parsing a legacy virtual project.

#### Deprecated

New workflows use ScanOptions and ViewConfiguration; see docs/migration-0.3.md.

#### Properties

##### ~~enabledTokens?~~

> `readonly` `optional` **enabledTokens?**: readonly [`TokenType`](#tokentype)[]

Token categories recognized by the lexer.

Omit this field to enable every supported category. Disabled constructs are
preserved as text where possible.

##### ~~maximumSectionLevel?~~

> `readonly` `optional` **maximumSectionLevel?**: [`SectionLevel`](#sectionlevel)

Deepest section command represented as a section node.

Deeper section commands are represented as ordinary command nodes. Omit this
field to recognize all supported levels.

***

### ProjectPipelineOptions

Settings for a synchronous configured analysis/export pipeline.

#### Properties

##### analyses?

> `readonly` `optional` **analyses?**: readonly `object`[]

Configured analyses in requested order; omission means none. Source file scopes are forbidden here.

##### configuration

> `readonly` **configuration**: [`ViewConfiguration`](#viewconfiguration)

Required configuration with an entryPath; other fields use ViewConfiguration defaults.

##### exportOptions

> `readonly` **exportOptions**: [`ExportOptions`](#exportoptions)

Required conditional retention and input topology; optional comment/output settings use ExportOptions defaults.

##### scanOptions?

> `readonly` `optional` **scanOptions?**: [`ScanOptions`](#scanoptions-2)

Optional source scanning settings; omission uses scanner defaults.

***

### ProjectPipelineResult

Results from composing public operations; source and artifacts remain separate.

#### Properties

##### analyses

> `readonly` **analyses**: readonly [`AnalysisResult`](#analysisresult)[]

Independent analysis results in request order; empty when none were requested.

##### kind

> `readonly` **kind**: `"pipeline"`

Pipeline result discriminant.

##### snapshot

> `readonly` **snapshot**: [`ProjectSnapshot`](#projectsnapshot)

Frozen source authority created from the supplied files.

##### transformation

> `readonly` **transformation**: [`TransformationResult`](#transformationresult)

Generated export preview with exact mappings and dependency metadata.

##### view

> `readonly` **view**: [`ProjectView`](#projectview)

Configured view sharing this snapshot; non-exportable views throw before results are returned.

***

### ProjectSnapshot

Immutable source authority. No entry or configuration is needed to create it.

#### Properties

##### coreVersion

> `readonly` **coreVersion**: `string`

Core implementation version.

##### files

> `readonly` **files**: readonly [`ScannedFile`](#scannedfile)[]

Files in ascending UTF-16 path order.

##### id

> `readonly` **id**: `string`

Identity derived from contents, paths, revisions, options, core and schema versions.

##### kind

> `readonly` **kind**: `"snapshot"`

Representation discriminant.

##### scanOptions

> `readonly` **scanOptions**: [`NormalizedScanOptions`](#normalizedscanoptions)

Normalized scanner options.

##### schemaVersion

> `readonly` **schemaVersion**: `1`

Source-model schema version.

***

### ProjectViewBase

Fields shared by ready, incomplete, and blocked configured results.

#### Properties

##### configuration

> `readonly` **configuration**: [`NormalizedViewConfiguration`](#normalizedviewconfiguration)

Canonical semantic settings.

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-2)

Supported grammar, assumptions, and limitations.

##### decisions

> `readonly` **decisions**: readonly [`ConditionDecision`](#conditiondecision)[]

Decisions up to the first unresolved/invalid required effect.

##### id

> `readonly` **id**: `string`

Identity includes snapshot and every semantic setting.

##### kind

> `readonly` **kind**: `"view"`

Representation discriminant.

##### occurrences

> `readonly` **occurrences**: readonly [`InputOccurrence`](#inputoccurrence)[]

Inclusion occurrences in encounter order.

##### reachedFacts

> `readonly` **reachedFacts**: readonly [`ReachedFact`](#reachedfact)[]

Reached facts only, in execution order.

##### selectedTokens

> `readonly` **selectedTokens**: readonly [`SelectedToken`](#selectedtoken)[]

Selected token tape, partial on failure; not a generated artifact.

##### snapshot

> `readonly` **snapshot**: [`ProjectSnapshot`](#projectsnapshot)

Original immutable source authority; transported views can be reconstructed from it.

##### snapshotId

> `readonly` **snapshotId**: `string`

Source snapshot identity.

***

### ReachedFact

A recognized reached event, in execution order; source-only body facts are absent.

#### Properties

##### fact

> `readonly` **fact**: [`SyntaxFact`](#syntaxfact)

Original immutable syntax fact.

##### origin

> `readonly` **origin**: [`SourceOrigin`](#sourceorigin)

This visit's source origin.

***

### ReferenceResolution

One reference resolution observation; missing means no recognized target in covered source.

#### Properties

##### forward

> `readonly` **forward**: `boolean` \| `null`

Whether the sole matched target occurs later; null if not uniquely matched.

##### key

> `readonly` **key**: `string` \| `null`

Literal key, null for a generated/unresolved argument.

##### reference

> `readonly` **reference**: [`SourceOrigin`](#sourceorigin)

Original reference occurrence.

##### status

> `readonly` **status**: `"unresolved"` \| `"matched"` \| `"duplicate"` \| `"missing"` \| `"unknown-coverage"`

Distinguishes matched, ambiguous, missing, and insufficient coverage.

##### targets

> `readonly` **targets**: readonly [`SourceOrigin`](#sourceorigin)[]

All recognized target occurrences in execution order.

***

### ScannedFile

One independently scanned source file; even malformed source remains available.

#### Extends

- [`SourceFile`](#sourcefile)

#### Properties

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-2)

Recognized syntax coverage and localized diagnostics.

##### facts

> `readonly` **facts**: readonly [`SyntaxFact`](#syntaxfact)[]

Located facts in source order, then deterministic fact-kind order.

##### path

> `readonly` **path**: `string`

Stable virtual path used by entry selection and `\input` resolution.

###### Inherited from

[`SourceFile`](#sourcefile).[`path`](#path-7)

##### source

> `readonly` **source**: `string`

LaTeX source text.

###### Inherited from

[`SourceFile`](#sourcefile).[`source`](#source-2)

##### tokens

> `readonly` **tokens**: readonly [`SourceToken`](#sourcetoken)[]

Lossless ordered lexical partition, empty for empty source.

##### version

> `readonly` **version**: `number`

Caller-owned finite number used to resolve incremental merge conflicts.

###### Inherited from

[`SourceFile`](#sourcefile).[`version`](#version-3)

***

### ScanOptions

Optional scanner settings. No setting changes the original source strings.

#### Properties

##### maxNesting?

> `readonly` `optional` **maxNesting?**: `number`

Maximum nested definition/argument inventory depth, 1–256; default 64.

##### verbatimEnvironments?

> `readonly` `optional` **verbatimEnvironments?**: readonly `string`[]

Additional literal verbatim environment names; default is an empty list.

***

### SectionNode

A supported section command or the `document` environment.

#### Extends

- [`ContainerNodeBase`](#containernodebase)\<[`Section`](#section)\>

#### Properties

##### children

> `readonly` **children**: readonly [`AstNode`](#astnode)[]

Child nodes in source order.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`children`](#children-3)

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`end`](#end-6)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`id`](#id-6)

##### level

> `readonly` **level**: [`SectionLevel`](#sectionlevel)

Section depth; zero is reserved for the `document` environment.

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`line`](#line-7)

##### name

> `readonly` **name**: `string`

Section title, or `document` for the document environment.

##### prefix

> `readonly` **prefix**: `string`

Original source text emitted before the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`prefix`](#prefix-3)

##### starred

> `readonly` **starred**: `boolean`

Whether the section command used its starred form.

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`start`](#start-6)

##### suffix

> `readonly` **suffix**: `string`

Original source text emitted after the children.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`suffix`](#suffix-3)

##### type

> `readonly` **type**: [`Section`](#section)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`ContainerNodeBase`](#containernodebase).[`type`](#type-6)

***

### SelectedToken

A selected lexical token with distinct projected and original coordinates.

#### Properties

##### interpretation

> `readonly` **interpretation**: `"opaque"` \| `"structure"`

Opaque stored syntax is a leaf; structural delimiters there never execute.

##### origin

> `readonly` **origin**: [`SourceOrigin`](#sourceorigin)

Original inclusion origin.

##### projectedRange

> `readonly` **projectedRange**: [`SourceRange`](#sourcerange)

Inclusive offsets in the virtual token tape; not an emitted LaTeX string.

##### token

> `readonly` **token**: [`SourceToken`](#sourcetoken)

Lexical source token, keeping its original offsets.

***

### ~~SerializeOptions~~

Options for serializing one legacy parsed syntax tree.

#### Deprecated

Use typed OperationRequest/ExportOptions for new workflows; condition omission and whitelists do not map to source evaluation. See docs/migration-0.3.md.

#### Extended by

- [`TransformOptions`](#transformoptions)

#### Properties

##### ~~enabledConditions?~~

> `readonly` `optional` **enabledConditions?**: readonly `string`[]

Conditions whose `if` branch is retained.

Omit this field to preserve conditional syntax. Pass an empty array to resolve
every recognized condition to its `else` branch. Resolving conditions also
removes recognized `\newif` declarations and their generated toggle commands.
Names are compared case-sensitively.

###### Deprecated

Retained as a static legacy whitelist. Select an explicit ConditionPolicy for new workflows; see docs/migration-0.3.md.

##### ~~suppressComments?~~

> `readonly` `optional` **suppressComments?**: `boolean`

Replace recognized comments and newly empty comment lines; defaults to `false`.

***

### SourceFile

One versioned source file supplied to [parseProject](#parseproject).

#### Extended by

- [`ScannedFile`](#scannedfile)

#### Properties

##### path

> `readonly` **path**: `string`

Stable virtual path used by entry selection and `\input` resolution.

##### source

> `readonly` **source**: `string`

LaTeX source text.

##### version

> `readonly` **version**: `number`

Caller-owned finite number used to resolve incremental merge conflicts.

***

### SourceLocation

A location in an original source string; ranges are inclusive UTF-16.

#### Extended by

- [`SourceOrigin`](#sourceorigin)
- [`SyntaxFactBase`](#syntaxfactbase)
- [`AnalysisLocation`](#analysislocation)

#### Properties

##### path

> `readonly` **path**: `string`

Normalized project-relative source path.

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

***

### SourceOrigin

A location of one selected source occurrence.

#### Extends

- [`SourceLocation`](#sourcelocation)

#### Properties

##### occurrenceId

> `readonly` **occurrenceId**: `string`

Inclusion occurrence containing this span.

##### path

> `readonly` **path**: `string`

Normalized project-relative source path.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`path`](#path-8)

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`range`](#range-2)

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact source snapshot identity.

***

### SourceRange

An inclusive source range in the original JavaScript string.

Offsets count UTF-16 code units and `line` is one-based. For an empty document,
the root range is `start = 0`, `end = -1`, and `line = 1`.

#### Extended by

- [`NodeBase`](#nodebase)

#### Properties

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

***

### SourceToken

A lossless lexical segment. Concatenating values reproduces the source exactly.

#### Properties

##### kind

> `readonly` **kind**: `"text"` \| `"space"` \| `"command"` \| `"comment"` \| `"verbatim"` \| `"open"` \| `"close"` \| `"math"`

Lexical category; commands in protected text are not separate tokens.

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Inclusive original range.

##### value

> `readonly` **value**: `string`

Exact source substring.

***

### SyntaxDiagnostic

A fatal parser diagnostic attached to [PrepTexSyntaxError](#preptexsyntaxerror).

#### Properties

##### code

> `readonly` **code**: [`SyntaxError`](#syntaxerror)

Literal code used to discriminate fatal syntax diagnostics.

##### message

> `readonly` **message**: `string`

Human-readable explanation intended for display or logs.

##### path

> `readonly` **path**: `string`

Virtual path of the source that could not be parsed.

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Inclusive range in the original source.

##### severity

> `readonly` **severity**: [`Error`](#error)

Literal severity used to discriminate fatal syntax diagnostics.

***

### SyntaxFactBase

Common fields for facts; IDs are unique within the source file only.

#### Extends

- [`SourceLocation`](#sourcelocation)

#### Properties

##### context

> `readonly` **context**: [`FactContext`](#factcontext)

Syntactic context; never evidence that a fact was reached.

##### id

> `readonly` **id**: `string`

Deterministic file-local fact identifier.

##### path

> `readonly` **path**: `string`

Normalized project-relative source path.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`path`](#path-8)

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`range`](#range-2)

##### recognition

> `readonly` **recognition**: `"recognized"` \| `"candidate"`

Whether this construct is recognized or retained as an unresolved candidate.

***

### TextNode

Literal source text.

#### Extends

- [`NodeBase`](#nodebase)\<[`Text`](#text)\>

#### Properties

##### end

> `readonly` **end**: `number`

Zero-based offset of the last included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`end`](#end-12)

##### id

> `readonly` **id**: `number`

Identifier unique within the containing parsed file, starting at zero.

###### Inherited from

[`NodeBase`](#nodebase).[`id`](#id-13)

##### line

> `readonly` **line**: `number`

One-based line containing `start`.

###### Inherited from

[`NodeBase`](#nodebase).[`line`](#line-13)

##### start

> `readonly` **start**: `number`

Zero-based offset of the first included UTF-16 code unit.

###### Inherited from

[`NodeBase`](#nodebase).[`start`](#start-12)

##### type

> `readonly` **type**: [`Text`](#text)

Discriminant used to narrow the [AstNode](#astnode) union.

###### Inherited from

[`NodeBase`](#nodebase).[`type`](#type-12)

##### value

> `readonly` **value**: `string`

The exact source text covered by this node.

***

### TransformationResult

Successful transformation preview/export, with sources unchanged.

#### Properties

##### artifacts

> `readonly` **artifacts**: readonly [`GeneratedArtifact`](#generatedartifact)[]

Preview/export files, in deterministic path order.

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-2)

Explicit source/view coverage and limited simplification.

##### dependencies

> `readonly` **dependencies**: readonly [`ArtifactDependency`](#artifactdependency)[]

Remaining input relationships with emitted locations.

##### editPlan

> `readonly` **editPlan**: [`ProjectEditPlan`](#projecteditplan) \| `null`

Editable proposal for identity/comment operations; null for configured exports.

##### entryPath

> `readonly` **entryPath**: `string` \| `null`

Entry artifact, null for independent source previews.

##### kind

> `readonly` **kind**: `"transformation"`

Result discriminant.

##### provenance

> `readonly` **provenance**: [`OperationProvenance`](#operationprovenance)

Exact operation dependencies.

##### resultId

> `readonly` **resultId**: `string`

Exact operation/source/configuration result identity.

***

### TransformedFile

One transformed LaTeX output file.

#### Properties

##### path

> `readonly` **path**: `string`

Virtual output path.

##### source

> `readonly` **source**: `string`

Serialized LaTeX source.

***

### ~~TransformOptions~~

Options for transforming a legacy parsed project.

#### Deprecated

Use ViewConfiguration and ExportOptions independently; see docs/migration-0.3.md.

#### Extends

- [`SerializeOptions`](#serializeoptions)

#### Properties

##### ~~enabledConditions?~~

> `readonly` `optional` **enabledConditions?**: readonly `string`[]

Conditions whose `if` branch is retained.

Omit this field to preserve conditional syntax. Pass an empty array to resolve
every recognized condition to its `else` branch. Resolving conditions also
removes recognized `\newif` declarations and their generated toggle commands.
Names are compared case-sensitively.

###### Deprecated

Retained as a static legacy whitelist. Select an explicit ConditionPolicy for new workflows; see docs/migration-0.3.md.

###### Inherited from

[`SerializeOptions`](#serializeoptions).[`enabledConditions`](#enabledconditions)

##### ~~inputHandling?~~

> `readonly` `optional` **inputHandling?**: [`InputHandlingMode`](#inputhandlingmode)

How `\input` commands affect the generated file set; defaults to `Preserve`.

##### ~~suppressComments?~~

> `readonly` `optional` **suppressComments?**: `boolean`

Replace recognized comments and newly empty comment lines; defaults to `false`.

###### Inherited from

[`SerializeOptions`](#serializeoptions).[`suppressComments`](#suppresscomments-1)

***

### TransformResult

The immutable output of [transformProject](#transformproject).

#### Properties

##### files

> `readonly` **files**: readonly [`TransformedFile`](#transformedfile)[]

Generated files.

Preserve and flatten modes return only the entry file. Separate mode returns
every project file in deterministic path order.

***

### ViewConfiguration

Independent semantic configuration; output naming and visual filters are excluded.

#### Properties

##### conditions?

> `readonly` `optional` **conditions?**: [`ConditionPolicy`](#conditionpolicy)

Boolean policy; default source with no seeds.

##### entryPath

> `readonly` **entryPath**: `string`

Entry virtual path.

##### limits?

> `readonly` `optional` **limits?**: [`ViewLimits`](#viewlimits)

Optional resource bounds.

##### profile?

> `readonly` `optional` **profile?**: `"direct-latex-v1"`

Supported grammar; default direct-latex-v1.

##### traversal?

> `readonly` `optional` **traversal?**: `"project"` \| `"file-only"`

Follow active literal inputs or stop at a file-only input; default project.

***

### ViewLimits

Bounds on synchronous interpretation; hosts still own deadlines and scheduling.

#### Properties

##### maxInputDepth?

> `readonly` `optional` **maxInputDepth?**: `number`

Maximum active input depth, including entry, default 64; maximum 256.

##### maxNesting?

> `readonly` `optional` **maxNesting?**: `number`

Conditional, scope, and structural nesting bound, default 256; maximum 512.

##### maxOccurrences?

> `readonly` `optional` **maxOccurrences?**: `number`

Total inclusions including entry, default 10000.

##### maxSelectedCodeUnits?

> `readonly` `optional` **maxSelectedCodeUnits?**: `number`

Selected UTF-16 code units, default 10000000. This is not a wall-clock bound.

***

### WarningDiagnostic

A non-fatal parser message with a stable code and exact source location.

#### Properties

##### code

> `readonly` **code**: [`WarningDiagnosticCode`](#warningdiagnosticcode-1)

Stable machine-readable warning category.

##### message

> `readonly` **message**: `string`

Human-readable explanation intended for display or logs.

##### path

> `readonly` **path**: `string`

Virtual source path, or the `sourcePath` supplied to [parseDocument](#parsedocument).

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Inclusive range in the original source.

##### severity

> `readonly` **severity**: [`Warning`](#warning)

Literal severity used to discriminate warning diagnostics.

## Type Aliases

### AnalysisRequest

> **AnalysisRequest** = `Extract`\<[`OperationRequest`](#operationrequest), \{ `operation`: `"references"` \| `"unused-commands"`; \}\>

Executable analysis subset of the public operation union.

***

### ArtifactOrigin

> **ArtifactOrigin** = \{ `kind`: `"source"`; `origins`: readonly [`AnalysisLocation`](#analysislocation)[]; `outputRange`: [`SourceRange`](#sourcerange); \} \| \{ `kind`: `"synthetic"`; `outputRange`: [`SourceRange`](#sourcerange); `reason`: `string`; \}

Output mapping for a generated artifact; synthetic text has no original offset.

#### Union Members

##### Type Literal

\{ `kind`: `"source"`; `origins`: readonly [`AnalysisLocation`](#analysislocation)[]; `outputRange`: [`SourceRange`](#sourcerange); \}

###### kind

> `readonly` **kind**: `"source"`

Copied/rewritten source mapping.

###### origins

> `readonly` **origins**: readonly [`AnalysisLocation`](#analysislocation)[]

Contributing original ranges.

###### outputRange

> `readonly` **outputRange**: [`SourceRange`](#sourcerange)

Inclusive output range.

***

##### Type Literal

\{ `kind`: `"synthetic"`; `outputRange`: [`SourceRange`](#sourcerange); `reason`: `string`; \}

###### kind

> `readonly` **kind**: `"synthetic"`

Inserted lexical delimiter or generated text.

###### outputRange

> `readonly` **outputRange**: [`SourceRange`](#sourcerange)

Inclusive output range.

###### reason

> `readonly` **reason**: `string`

Why this text exists.

***

### AstNode

> **AstNode** = [`TextNode`](#textnode) \| [`NewLineNode`](#newlinenode) \| [`CommentNode`](#commentnode) \| [`CommandNode`](#commandnode) \| [`ConditionDeclarationNode`](#conditiondeclarationnode) \| [`EnvironmentNode`](#environmentnode) \| [`ConditionNode`](#conditionnode) \| [`ConditionBranchNode`](#conditionbranchnode) \| [`MathNode`](#mathnode) \| [`GroupNode`](#groupnode) \| [`SectionNode`](#sectionnode) \| [`InputNode`](#inputnode) \| [`AstRoot`](#astroot)

The exhaustive discriminated union of public PrepTeX syntax-tree nodes.

***

### BooleanValues

> **BooleanValues** = `Readonly`\<`Record`\<`string`, `boolean`\>\>

Named values, case-sensitive; names exclude the if prefix and primitives.

***

### ConditionName

> **ConditionName** = `string`

The name of a boolean condition declared with LaTeX's `\newif`.

***

### ConditionPolicy

> **ConditionPolicy** = \{ `initialValues?`: [`BooleanValues`](#booleanvalues); `mode`: `"source"`; \} \| \{ `mode`: `"manual"`; `values`: [`BooleanValues`](#booleanvalues); \} \| \{ `initialValues?`: [`BooleanValues`](#booleanvalues); `mode`: `"source-with-overrides"`; `overrides`: [`BooleanValues`](#booleanvalues); \}

Source tracking, permanent manual forcing, and initial seeds have distinct semantics.

#### Union Members

##### Type Literal

\{ `initialValues?`: [`BooleanValues`](#booleanvalues); `mode`: `"source"`; \}

###### initialValues?

> `readonly` `optional` **initialValues?**: [`BooleanValues`](#booleanvalues)

Seed values before entry; declarations reset them to false.

###### mode

> `readonly` **mode**: `"source"`

Follow reached declarations and setters.

***

##### Type Literal

\{ `mode`: `"manual"`; `values`: [`BooleanValues`](#booleanvalues); \}

###### mode

> `readonly` **mode**: `"manual"`

Force only named values supplied here; omitted names are unknown.

###### values

> `readonly` **values**: [`BooleanValues`](#booleanvalues)

Permanent per-test named values.

***

##### Type Literal

\{ `initialValues?`: [`BooleanValues`](#booleanvalues); `mode`: `"source-with-overrides"`; `overrides`: [`BooleanValues`](#booleanvalues); \}

###### initialValues?

> `readonly` `optional` **initialValues?**: [`BooleanValues`](#booleanvalues)

Initial source state, reset by declarations.

###### mode

> `readonly` **mode**: `"source-with-overrides"`

Track source and force specified names at each test.

###### overrides

> `readonly` **overrides**: [`BooleanValues`](#booleanvalues)

Permanent per-test overrides.

***

### ConfiguredContainerNode

> **ConfiguredContainerNode** = [`ConfiguredNodeBase`](#configurednodebase) & \{ `children`: readonly [`ConfiguredNode`](#configurednode)[]; `kind`: `"root"`; \} \| \{ `children`: readonly [`ConfiguredNode`](#configurednode)[]; `kind`: `"environment"`; `name`: `string`; \} \| \{ `children`: readonly [`ConfiguredNode`](#configurednode)[]; `kind`: `"group"`; \} \| \{ `children`: readonly [`ConfiguredNode`](#configurednode)[]; `delimiter`: [`MathDelimiter`](#mathdelimiter); `kind`: `"math"`; \} \| \{ `children`: readonly [`ConfiguredNode`](#configurednode)[]; `kind`: `"section"`; `level`: `1` \| `2` \| `3` \| `4` \| `5`; `name`: `string`; `starred`: `boolean`; \}

Configured containers, with a complete ordered child list only in ready views.

***

### ConfiguredNode

> **ConfiguredNode** = [`ConfiguredContainerNode`](#configuredcontainernode) \| [`ConfiguredNodeBase`](#configurednodebase) & `object`

Exhaustive configured structure. Leaf tokens are never re-lexed across source joins.

***

### ContainerNode

> **ContainerNode** = [`AstRoot`](#astroot) \| [`EnvironmentNode`](#environmentnode) \| [`ConditionNode`](#conditionnode) \| [`ConditionBranchNode`](#conditionbranchnode) \| [`MathNode`](#mathnode) \| [`GroupNode`](#groupnode) \| [`SectionNode`](#sectionnode)

Any syntax-tree node that owns an ordered child list.

***

### ContainerNodeType

> **ContainerNodeType** = [`Root`](#root) \| [`Environment`](#environment-1) \| [`Condition`](#condition) \| [`ConditionBranch`](#conditionbranch) \| [`Math`](#math) \| [`Group`](#group) \| [`Section`](#section)

The node types that contain child nodes.

***

### Diagnostic

> **Diagnostic** = [`WarningDiagnostic`](#warningdiagnostic) \| [`SyntaxDiagnostic`](#syntaxdiagnostic)

Any structured warning or fatal syntax diagnostic emitted by PrepTeX.

***

### InputReferencePath

> **InputReferencePath** = `string`

A non-empty path written inside a braced `\input` command.

It retains the source spelling and is interpreted relative to the including
file only when a project is flattened.

***

### InterpretationProfile

> **InterpretationProfile** = `"direct-latex-v1"`

Supported source/interpretation grammar, not a promise of TeX equivalence.

***

### LineEnding

> **LineEnding** = "\n" \| "\r" \| "\r\n"

An exact source line-ending sequence.

***

### LiteralArgument

> **LiteralArgument** = \{ `kind`: `"literal"`; `range`: [`SourceRange`](#sourcerange); `value`: `string`; \} \| \{ `kind`: `"unresolved"`; `range`: [`SourceRange`](#sourcerange) \| `null`; `source`: `string`; \}

A literal or unresolved key/path.

#### Union Members

##### Type Literal

\{ `kind`: `"literal"`; `range`: [`SourceRange`](#sourcerange); `value`: `string`; \}

###### kind

> `readonly` **kind**: `"literal"`

Literal discriminant.

###### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Argument interior range; empty uses end=start-1.

###### value

> `readonly` **value**: `string`

Exact interior string.

***

##### Type Literal

\{ `kind`: `"unresolved"`; `range`: [`SourceRange`](#sourcerange) \| `null`; `source`: `string`; \}

###### kind

> `readonly` **kind**: `"unresolved"`

Unresolved discriminant.

###### range

> `readonly` **range**: [`SourceRange`](#sourcerange) \| `null`

Interior range, or null when missing.

###### source

> `readonly` **source**: `string`

Original argument spelling, without guessing expansion.

***

### MathDelimiter

> **MathDelimiter** = `"$"` \| `"$$"` \| "\\(" \| "\\\["

An opening delimiter recognized for a LaTeX math node.

***

### NodeId

> **NodeId** = `number`

A node identifier that is unique within one parsed file.

***

### OccurrenceId

> **OccurrenceId** = `string`

Inclusion identity unique within a view, including repeated visits to one file.

***

### OperationCapability

> **OperationCapability** = \{ `eligible`: `true`; `reasons`: readonly \[\]; \} \| \{ `eligible`: `false`; `reasons`: readonly [`CapabilityReason`](#capabilityreason)[]; \}

Eligibility result; execution enforces these same requirements.

#### Union Members

##### Type Literal

\{ `eligible`: `true`; `reasons`: readonly \[\]; \}

###### eligible

> `readonly` **eligible**: `true`

Eligible.

###### reasons

> `readonly` **reasons**: readonly \[\]

No reasons.

***

##### Type Literal

\{ `eligible`: `false`; `reasons`: readonly [`CapabilityReason`](#capabilityreason)[]; \}

###### eligible

> `readonly` **eligible**: `false`

Ineligible.

###### reasons

> `readonly` **reasons**: readonly [`CapabilityReason`](#capabilityreason)[]

Ordered reasons.

***

### OperationRequest

> **OperationRequest** = \{ `operation`: `"source-inventory"`; `options?`: [`InventoryRequest`](#inventoryrequest); \} \| \{ `operation`: `"resolve-view"`; `options`: [`ViewConfiguration`](#viewconfiguration); \} \| \{ `operation`: `"references"` \| `"unused-commands"`; `options?`: [`AnalysisOptions`](#analysisoptions); \} \| \{ `operation`: `"suppress-comments"` \| `"identity"`; `options`: \{ `maxOutputCodeUnits?`: `number`; `scope?`: [`SourceScope`](#sourcescope); `target`: `"source"` \| `"selected"`; \}; \} \| \{ `operation`: `"materialize"`; `options`: \{ `inputs`: `"preserve"` \| `"inline"`; `maxOutputCodeUnits?`: `number`; `suppressComments?`: `boolean`; \}; \} \| \{ `operation`: `"export-project"`; `options`: [`ExportOptions`](#exportoptions); \}

Public requests for independent inventory, interpretation, analysis, and transformation.

#### Union Members

##### Type Literal

\{ `operation`: `"source-inventory"`; `options?`: [`InventoryRequest`](#inventoryrequest); \}

###### operation

> `readonly` **operation**: `"source-inventory"`

Inventory operation.

###### options?

> `readonly` `optional` **options?**: [`InventoryRequest`](#inventoryrequest)

Source options.

***

##### Type Literal

\{ `operation`: `"resolve-view"`; `options`: [`ViewConfiguration`](#viewconfiguration); \}

###### operation

> `readonly` **operation**: `"resolve-view"`

Configured view operation.

###### options

> `readonly` **options**: [`ViewConfiguration`](#viewconfiguration)

Interpretation settings.

***

##### Type Literal

\{ `operation`: `"references"` \| `"unused-commands"`; `options?`: [`AnalysisOptions`](#analysisoptions); \}

###### operation

> `readonly` **operation**: `"references"` \| `"unused-commands"`

Independent analysis; unused-command analysis also accepts source snapshots.

###### options?

> `readonly` `optional` **options?**: [`AnalysisOptions`](#analysisoptions)

Partial view observations require explicit opt-in; source scope is for source models only.

***

##### Type Literal

\{ `operation`: `"suppress-comments"` \| `"identity"`; `options`: \{ `maxOutputCodeUnits?`: `number`; `scope?`: [`SourceScope`](#sourcescope); `target`: `"source"` \| `"selected"`; \}; \}

###### operation

> `readonly` **operation**: `"suppress-comments"` \| `"identity"`

Exact source edit preview.

###### options

> `readonly` **options**: `object`

Explicit source or selected-path target.

###### options.maxOutputCodeUnits?

> `readonly` `optional` **maxOutputCodeUnits?**: `number`

Maximum total preview size in UTF-16 code units; default 10,000,000, maximum 100,000,000.

###### options.scope?

> `readonly` `optional` **scope?**: [`SourceScope`](#sourcescope)

Source-only scope; forbidden with a selected-path target.

###### options.target

> `readonly` **target**: `"source"` \| `"selected"`

Inspect all requested source or only the configured selected path.

***

##### Type Literal

\{ `operation`: `"materialize"`; `options`: \{ `inputs`: `"preserve"` \| `"inline"`; `maxOutputCodeUnits?`: `number`; `suppressComments?`: `boolean`; \}; \}

###### operation

> `readonly` **operation**: `"materialize"`

Configured conditional materialization.

###### options

> `readonly` **options**: `object`

Output topology independent of traversal.

###### options.inputs

> `readonly` **inputs**: `"preserve"` \| `"inline"`

Preserve input commands or expand active inclusion occurrences.

###### options.maxOutputCodeUnits?

> `readonly` `optional` **maxOutputCodeUnits?**: `number`

Maximum total output UTF-16 units; default 10000000.

###### options.suppressComments?

> `readonly` `optional` **suppressComments?**: `boolean`

Suppress eligible comments during export; default false.

***

##### Type Literal

\{ `operation`: `"export-project"`; `options`: [`ExportOptions`](#exportoptions); \}

###### operation

> `readonly` **operation**: `"export-project"`

Export with explicit conditional retention and input arrangement.

###### options

> `readonly` **options**: [`ExportOptions`](#exportoptions)

Export semantics independent of the configured traversal.

***

### ProjectEdit

> **ProjectEdit** = \{ `expected`: `string`; `kind`: `"replace"`; `path`: `string`; `range`: [`SourceRange`](#sourcerange); `replacement`: `string`; \} \| \{ `kind`: `"insert"`; `offset`: `number`; `path`: `string`; `text`: `string`; \}

Proposed source edit. Ordered by path and offset; touching replacements are allowed, overlaps are not.

#### Union Members

##### Type Literal

\{ `expected`: `string`; `kind`: `"replace"`; `path`: `string`; `range`: [`SourceRange`](#sourcerange); `replacement`: `string`; \}

###### expected

> `readonly` **expected**: `string`

Exact old substring precondition.

###### kind

> `readonly` **kind**: `"replace"`

Replace/delete inclusive range; deletion uses empty replacement.

###### path

> `readonly` **path**: `string`

Source path.

###### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Nonempty inclusive range.

###### replacement

> `readonly` **replacement**: `string`

Replacement source.

***

##### Type Literal

\{ `kind`: `"insert"`; `offset`: `number`; `path`: `string`; `text`: `string`; \}

###### kind

> `readonly` **kind**: `"insert"`

Insert between code units, including empty input/EOF.

###### offset

> `readonly` **offset**: `number`

Offset from zero through source.length; never splits a surrogate pair.

###### path

> `readonly` **path**: `string`

Source path.

###### text

> `readonly` **text**: `string`

Inserted source.

***

### ProjectFilePath

> **ProjectFilePath** = `string`

A normalized, forward-slash path inside a virtual PrepTeX project.

Public operations reject absolute paths and paths that escape the project root.

***

### ProjectIssueCode

> **ProjectIssueCode** = `"malformed-syntax"` \| `"opaque-region"` \| `"scan-limit"` \| `"unknown-condition"` \| `"unsupported-condition"` \| `"unsupported-effect"` \| `"unsupported-assignment"` \| `"binding-redefined"` \| `"dynamic-input"` \| `"file-only-input"` \| `"missing-entry"` \| `"missing-input"` \| `"ambiguous-input"` \| `"invalid-input-path"` \| `"input-cycle"` \| `"cross-file-conditional"` \| `"interpretation-limit"` \| `"structural-error"`

Stable source/view failure and coverage categories.

***

### ProjectSourceChange

> **ProjectSourceChange** = \{ `file`: [`SourceFile`](#sourcefile); `kind`: `"upsert"`; \} \| \{ `kind`: `"remove"`; `path`: `string`; \}

Atomic source change; conflicting or older revisions are rejected.

#### Union Members

##### Type Literal

\{ `file`: [`SourceFile`](#sourcefile); `kind`: `"upsert"`; \}

###### file

> `readonly` **file**: [`SourceFile`](#sourcefile)

Caller-owned replacement source.

###### kind

> `readonly` **kind**: `"upsert"`

Upsert discriminant.

***

##### Type Literal

\{ `kind`: `"remove"`; `path`: `string`; \}

###### kind

> `readonly` **kind**: `"remove"`

Removal discriminant.

###### path

> `readonly` **path**: `string`

Existing normalized or normalizable path.

***

### ProjectView

> **ProjectView** = [`ProjectViewBase`](#projectviewbase) & \{ `root`: [`ConfiguredContainerNode`](#configuredcontainernode) & `object`; `status`: `"ready"`; \} \| \{ `reason`: [`ProjectIssue`](#projectissue); `root`: `null`; `status`: `"incomplete"` \| `"blocked"`; \}

A complete structural view or explicit failure with no invented partial AST.

***

### SectionLevel

> **SectionLevel** = `0` \| `1` \| `2` \| `3` \| `4` \| `5`

A supported section depth, where `0` represents the `document` environment.

***

### SnapshotId

> **SnapshotId** = `string`

Opaque deterministic content identity; compare exactly, never parse or persist as authorization.

***

### SourceScope

> **SourceScope** = \{ `kind`: `"all-files"`; \} \| \{ `kind`: `"files"`; `paths`: readonly `string`[]; \}

Explicit set of independent source files. No execution state is shared between files.

#### Union Members

##### Type Literal

\{ `kind`: `"all-files"`; \}

###### kind

> `readonly` **kind**: `"all-files"`

Every supplied file.

***

##### Type Literal

\{ `kind`: `"files"`; `paths`: readonly `string`[]; \}

###### kind

> `readonly` **kind**: `"files"`

One or more explicitly requested source files.

###### paths

> `readonly` **paths**: readonly `string`[]

Unique file paths; results use canonical path order.

***

### SyntaxFact

> **SyntaxFact** = [`SyntaxFactBase`](#syntaxfactbase) & \{ `arguments`: readonly [`SourceRange`](#sourcerange)[]; `body`: [`SourceRange`](#sourcerange) \| `null`; `form`: `string`; `kind`: `"definition"`; `name`: `string` \| `null`; `starred`: `boolean`; \} \| \{ `kind`: `"command-use"`; `name`: `string`; \} \| \{ `key`: [`LiteralArgument`](#literalargument); `kind`: `"label"`; \} \| \{ `command`: `"ref"` \| `"pageref"` \| `"eqref"`; `key`: [`LiteralArgument`](#literalargument); `kind`: `"reference"`; \} \| \{ `kind`: `"condition-declaration"`; `name`: `string` \| `null`; \} \| \{ `command`: `string`; `kind`: `"condition-test"`; `testKind`: `"literal"` \| `"primitive"` \| `"named-candidate"`; \} \| \{ `delimiter`: `"else"` \| `"fi"`; `kind`: `"condition-delimiter"`; \} \| \{ `kind`: `"condition-assignment"`; `name`: `string`; `value`: `boolean`; \} \| \{ `kind`: `"input"`; `target`: [`LiteralArgument`](#literalargument); \} \| \{ `command`: `string`; `kind`: `"opaque"`; \}

Exhaustive inventory facts; definition targets are excluded from command uses.

***

### TransformationRequest

> **TransformationRequest** = `Exclude`\<[`OperationRequest`](#operationrequest), [`AnalysisRequest`](#analysisrequest) \| \{ `operation`: `"source-inventory"` \| `"resolve-view"`; \}\>

Executable transformation subset of the public operation union.

***

### ViewId

> **ViewId** = `string`

Identity of one snapshot and normalized semantic configuration.

***

### WarningDiagnosticCode

> **WarningDiagnosticCode** = `Exclude`\<[`DiagnosticCode`](#diagnosticcode), [`SyntaxError`](#syntaxerror)\>

A diagnostic code that can be returned after a successful parse.

## Variables

### projectOperations

> `const` **projectOperations**: readonly [`OperationDescriptor`](#operationdescriptor)[]

Frozen operation requirements shared by capability checks and execution.

## Functions

### applyProjectEdits()

> **applyProjectEdits**(`snapshot`, `plan`, `view?`): [`ProjectSnapshot`](#projectsnapshot)

Atomically apply a checked edit proposal and return a new source snapshot.

#### Parameters

##### snapshot

[`ProjectSnapshot`](#projectsnapshot)

Exact original source authority; never changed in place.

##### plan

[`ProjectEditPlan`](#projecteditplan)

Ordered original ranges, expected contents, and operation preconditions.

##### view?

[`ProjectView`](#projectview)

Required for selected-path edits; every inclusion must permit each edit.

#### Returns

[`ProjectSnapshot`](#projectsnapshot)

A frozen new snapshot. Changed file revisions advance by one; non-advancing/overflowing revisions fail.

#### Throws

[ProjectOperationError](#projectoperationerror) for stale results, invalid edits, or occurrence conflicts; nothing is applied on failure.

***

### checkOperationCapability()

> **checkOperationCapability**(`model`, `request`): [`OperationCapability`](#operationcapability)

Check operation/model compatibility without generating artifacts or modifying sources.

#### Parameters

##### model

[`ProjectSnapshot`](#projectsnapshot) \| [`ProjectView`](#projectview)

Source snapshot or configured view.

##### request

[`OperationRequest`](#operationrequest)

Typed operation with its semantic options.

#### Returns

[`OperationCapability`](#operationcapability)

Frozen eligibility and machine-readable reasons, including later-stage unavailability.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument for malformed requests or stale snapshots.

***

### createProjectSnapshot()

> **createProjectSnapshot**(`files`, `scanOptions?`): [`ProjectSnapshot`](#projectsnapshot)

Scan every supplied source independently without requiring structural validity.

#### Parameters

##### files

readonly [`SourceFile`](#sourcefile)[]

Caller-owned source files, never mutated; duplicate normalized paths are rejected.

##### scanOptions?

[`ScanOptions`](#scanoptions-2) = `{}`

Recognized protected regions and inventory nesting bounds.

#### Returns

[`ProjectSnapshot`](#projectsnapshot)

A deterministic, deeply frozen, transport-safe snapshot in path order.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument for invalid inputs. Source errors are localized coverage issues.

***

### indexProjectView()

> **indexProjectView**(`view`): [`ConfiguredIndex`](#configuredindex)

Build a reusable index of recognized reached facts, without emitting source.

#### Parameters

##### view

[`ProjectView`](#projectview)

Configured trace, including an explicitly marked incomplete trace.

#### Returns

[`ConfiguredIndex`](#configuredindex)

Frozen entries in execution order, with exact view identity and coverage.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument for an invalid transported view.

***

### inspectProject()

> **inspectProject**(`snapshot`, `request?`): [`InventoryResult`](#inventoryresult)

Obtain located recognized syntax without interpreting, serializing, or generating output.

#### Parameters

##### snapshot

[`ProjectSnapshot`](#projectsnapshot)

Source authority; returned facts are validated source-derived data.

##### request?

[`InventoryRequest`](#inventoryrequest) = `{}`

Optional explicit file scope and fact kinds; empty kinds returns no facts.

#### Returns

[`InventoryResult`](#inventoryresult)

Frozen inventory, exact result identity, and coverage for only the requested files.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument for stale snapshots, missing requested files, or malformed options.

***

### isConfiguredContainerNode()

> **isConfiguredContainerNode**(`node`): `node is ConfiguredContainerNode`

Narrow a configured node to the exhaustive container union.

#### Parameters

##### node

[`ConfiguredNode`](#configurednode)

#### Returns

`node is ConfiguredContainerNode`

***

### isContainerNode()

> **isContainerNode**(`node`): `node is ContainerNode`

Tests whether a syntax-tree node owns child nodes.

#### Parameters

##### node

[`AstNode`](#astnode)

Node to inspect.

#### Returns

`node is ContainerNode`

`true` when `node` is a [ContainerNode](#containernode).

***

### isInputHandlingMode()

> **isInputHandlingMode**(`value`): `value is InputHandlingMode`

Tests whether a runtime value is a supported [InputHandlingMode](#inputhandlingmode).

#### Parameters

##### value

`unknown`

Untrusted runtime value to validate.

#### Returns

`value is InputHandlingMode`

`true` when `value` is a supported mode.

***

### ~~mergeProjects()~~

> **mergeProjects**(`base`, `updates`): [`ParsedProject`](#parsedproject)

Combines two parsed projects without mutating either input.

A file from `updates` replaces the matching base file when its version is greater
than or equal to the base version. Canonical, deeply frozen files retain object
identity when they win; mutable transported files are copied and frozen first.

#### Parameters

##### base

[`ParsedProject`](#parsedproject)

Existing parsed project.

##### updates

[`ParsedProject`](#parsedproject)

Incremental files to add or replace.

#### Returns

[`ParsedProject`](#parsedproject)

A new immutable project snapshot.

#### Throws

[PrepTexError](#preptexerror) When either snapshot violates the public data contract.

#### Deprecated

Use updateProjectSnapshot for new source workflows, including explicit deletions. Revision conflict rules differ; see docs/migration-0.3.md.

***

### ~~parseDocument()~~

> **parseDocument**(`source`, `options?`): [`ParseResult`](#parseresult)

Parses a LaTeX document into a PrepTeX syntax tree.

This function is synchronous, does not mutate `source` or `options`, and returns
deeply frozen tree data. PrepTeX recognizes a practical structural subset of
LaTeX; it does not expand macros or run TeX.

#### Parameters

##### source

`string`

Complete LaTeX source text.

##### options?

[`ParseOptions`](#parseoptions) = `{}`

Optional tokenization and source-label settings.

#### Returns

[`ParseResult`](#parseresult)

The immutable tree, declarations, references, and non-fatal diagnostics.

#### Throws

[PrepTexSyntaxError](#preptexsyntaxerror) When supported syntax is malformed or unbalanced.

#### Throws

[PrepTexError](#preptexerror) When a runtime argument violates the public contract.

#### Deprecated

Retained for legacy file-local AST consumers in 0.3.0. New integrations should use createProjectSnapshot and resolveProjectView; see docs/migration-0.3.md.

***

### ~~parseProject()~~

> **parseProject**(`files`, `options?`): [`ParsedProject`](#parsedproject)

Parses a collection of versioned virtual files into an immutable project.

Every supplied file is parsed, including files that are not reachable from a
later entry point. Paths are normalized to forward-slash project-relative paths.
The function is synchronous and does not mutate the input array or its entries.

#### Parameters

##### files

readonly [`SourceFile`](#sourcefile)[]

Versioned virtual source files. Paths must be unique after normalization.

##### options?

[`ProjectParseOptions`](#projectparseoptions) = `{}`

Tokenization settings applied to every file.

#### Returns

[`ParsedProject`](#parsedproject)

A transport-safe project containing plain objects and arrays.

#### Throws

[PrepTexSyntaxError](#preptexsyntaxerror) When any file contains malformed supported syntax.

#### Throws

[PrepTexError](#preptexerror) When a path, source, version, or option is invalid.

#### Deprecated

Retained for legacy file-local AST consumers in 0.3.0. Use createProjectSnapshot and resolveProjectView for new project workflows; see docs/migration-0.3.md.

***

### planTransformation()

> **planTransformation**(`model`, `request`): [`TransformationResult`](#transformationresult)

Plan identity/comment edits or generate a configured export without changing sources.

#### Parameters

##### model

[`ProjectSnapshot`](#projectsnapshot) \| [`ProjectView`](#projectview)

Source snapshot for source-local work, configured view for selected work/exports.

##### request

[`TransformationRequest`](#transformationrequest)

Operation, independent retention/topology policies, and resource limits.

#### Returns

[`TransformationResult`](#transformationresult)

Frozen edits, exact preview artifacts and mappings, dependency metadata and coverage.

#### Throws

[ProjectOperationError](#projectoperationerror) for unavailable models, incompatible shared-file contexts or output limits.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument for malformed options or stale transports.

***

### resolveProjectView()

> **resolveProjectView**(`snapshot`, `configuration`): [`ProjectView`](#projectview)

Resolve reached boolean tests and active literal inputs, then parse the selected token stream.

#### Parameters

##### snapshot

[`ProjectSnapshot`](#projectsnapshot)

Exact source snapshot; unrelated malformed files do not block a healthy entry.

##### configuration

[`ViewConfiguration`](#viewconfiguration)

Entry, traversal, boolean policy, profile, and bounded interpretation settings.

#### Returns

[`ProjectView`](#projectview)

A deeply frozen ready view or explicit incomplete/blocked trace with no complete AST.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument for malformed options or stale source identity.

***

### runAnalysis()

> **runAnalysis**(`model`, `request`): [`AnalysisResult`](#analysisresult)

Analyze recognized references or conservative command-use evidence independently.

#### Parameters

##### model

[`ProjectSnapshot`](#projectsnapshot) \| [`ProjectView`](#projectview)

A view for references; source snapshot or view for command-use candidates.

##### request

Analysis and options; incomplete views require allowIncomplete explicitly.

###### operation

`"references"` \| `"unused-commands"`

Independent analysis; unused-command analysis also accepts source snapshots.

###### options?

[`AnalysisOptions`](#analysisoptions)

Partial view observations require explicit opt-in; source scope is for source models only.

#### Returns

[`AnalysisResult`](#analysisresult)

Frozen qualified findings, detailed observations and exact operation identity; no artifacts.

#### Throws

[ProjectOperationError](#projectoperationerror) when the model does not meet operation requirements.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument for malformed requests or stale transports.

***

### runProjectPipeline()

> **runProjectPipeline**(`files`, `options`): [`ProjectPipelineResult`](#projectpipelineresult)

Compose snapshot creation, configured interpretation, ordered analyses and export.

#### Parameters

##### files

readonly [`SourceFile`](#sourcefile)[]

Caller-owned source strings and finite revisions; never modified.

##### options

[`ProjectPipelineOptions`](#projectpipelineoptions)

Separate scan, interpretation, analysis and export settings.

#### Returns

[`ProjectPipelineResult`](#projectpipelineresult)

Frozen source/view/result data equivalent to the individual public calls.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument for malformed or mixed legacy/new options.

#### Throws

[ProjectOperationError](#projectoperationerror) when the view is not exportable, or an analysis/export fails.

#### Remarks

This synchronous convenience function has no I/O or persistent workflow state.
Use independent operations when an incomplete view or analysis should be retained without export.

***

### ~~serializeDocument()~~

> **serializeDocument**(`root`, `options?`): `string`

Serializes one parsed syntax tree back to LaTeX.

With no options, this preserves the source spelling represented by the tree.
Transformations are read-only and node objects and IDs retain their identity.
`\input` commands are always preserved because no project is available here.

#### Parameters

##### root

[`AstRoot`](#astroot)

Immutable tree returned by [parseDocument](#parsedocument) or [parseProject](#parseproject).

##### options?

[`SerializeOptions`](#serializeoptions) = `{}`

Optional comment and conditional transformations.

#### Returns

`string`

Serialized LaTeX source.

#### Throws

[PrepTexError](#preptexerror) When the tree or a runtime option is invalid.

#### Deprecated

Retained for legacy AST round trips. Use planTransformation on original source snapshots or configured views for new workflows; see docs/migration-0.3.md.

***

### ~~transformProject()~~

> **transformProject**(`entryPath`, `project`, `options?`): [`TransformResult`](#transformresult)

Transforms a parsed project into one or more LaTeX output files.

The operation is synchronous and does not mutate the project or its trees.
Relative `\input` paths are resolved from the including file. Flattening rejects
missing, ambiguous, and circular inputs with typed errors.

#### Parameters

##### entryPath

`string`

Project-relative path of the entry file.

##### project

[`ParsedProject`](#parsedproject)

Project returned by [parseProject](#parseproject) or [mergeProjects](#mergeprojects).

##### options?

[`TransformOptions`](#transformoptions) = `{}`

Serialization and input-handling settings.

#### Returns

[`TransformResult`](#transformresult)

Immutable generated files. `Separate` emits every project file; other modes emit one.

#### Throws

[PrepTexError](#preptexerror) When an argument is invalid, the entry is absent, or
an input target is unresolved or circular.

#### Deprecated

Retained with legacy whitelist and input-mode semantics. New integrations should use planTransformation or runProjectPipeline; see docs/migration-0.3.md.

***

### updateProjectSnapshot()

> **updateProjectSnapshot**(`snapshot`, `changes`, `scanOptions?`): [`ProjectSnapshot`](#projectsnapshot)

Apply source additions/replacements/removals atomically, reusing unchanged scans.
Equal revision with different contents, older revisions, duplicate changes, and absent removals fail.

#### Parameters

##### snapshot

[`ProjectSnapshot`](#projectsnapshot)

Exact source snapshot; mutable transported copies are validated and rebuilt.

##### changes

readonly [`ProjectSourceChange`](#projectsourcechange)[]

Caller-owned changes; ordering does not affect the resulting identity.

##### scanOptions?

[`ScanOptions`](#scanoptions-2)

Optional replacement scan settings; omission retains the current settings.

#### Returns

[`ProjectSnapshot`](#projectsnapshot)

A deeply frozen snapshot; identical inputs retain snapshot identity. Unchanged contents/settings retain token and fact arrays, including revision-only updates. No caller source is modified.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument on an invalid/conflicting change or stale snapshot.

***

### validateProjectEditPlan()

> **validateProjectEditPlan**(`snapshot`, `plan`, `view?`): `void`

Validate an edit proposal without applying it.

#### Parameters

##### snapshot

[`ProjectSnapshot`](#projectsnapshot)

Exact source precondition.

##### plan

[`ProjectEditPlan`](#projecteditplan)

Ordered edits with exact expected substrings and source/operation identity.

##### view?

[`ProjectView`](#projectview)

Required for a view-dependent proposal; must match its snapshot and view IDs.

#### Returns

`void`

Nothing on success. All validation completes before a caller can apply any edit.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument for stale identity, malformed operations, ranges, overlaps, or surrogate-pair splits.

#### Throws

[ProjectOperationError](#projectoperationerror) for incompatible occurrence edits, invalid identity edits, or output limits.

***

### walkConfiguredNodes()

> **walkConfiguredNodes**(`root`): readonly [`ConfiguredNode`](#configurednode)[]

Return nodes in depth-first source/execution order; the returned array is frozen.

#### Parameters

##### root

[`ConfiguredNode`](#configurednode)

#### Returns

readonly [`ConfiguredNode`](#configurednode)[]
