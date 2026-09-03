**@preptex/core v0.2.1**

***

# @preptex/core v0.2.1

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

### InputHandlingMode

Controls how `\input` nodes are handled while transforming a project.

#### Enumeration Members

##### Flatten

> **Flatten**: `"flatten"`

Emit the entry file with reachable `\input` targets inlined.

##### Preserve

> **Preserve**: `"preserve"`

Emit the entry file and preserve each `\input` command literally.

##### Separate

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

##### InvalidArgument

> **InvalidArgument**: `"invalid-argument"`

A runtime value does not satisfy the documented public input type.

##### MissingEntry

> **MissingEntry**: `"missing-entry"`

The requested project entry path is absent.

##### MissingInput

> **MissingInput**: `"missing-input"`

A flattened `\input` target cannot be resolved.

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

## Interfaces

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

[`NodeBase`](#nodebase).[`id`](#id-12)

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

[`NodeBase`](#nodebase).[`id`](#id-12)

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

[`NodeBase`](#nodebase).[`id`](#id-12)

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

[`NodeBase`](#nodebase).[`id`](#id-12)

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

[`NodeBase`](#nodebase).[`id`](#id-12)

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

[`NodeBase`](#nodebase).[`id`](#id-12)

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

[`ParseResult`](#parseresult).[`path`](#path-2)

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

### ParseOptions

Options for parsing one LaTeX document.

#### Properties

##### enabledTokens?

> `readonly` `optional` **enabledTokens?**: readonly [`TokenType`](#tokentype)[]

Token categories recognized by the lexer.

Omit this field to enable every supported category. Disabled constructs are
preserved as text where possible.

##### maximumSectionLevel?

> `readonly` `optional` **maximumSectionLevel?**: [`SectionLevel`](#sectionlevel)

Deepest section command represented as a section node.

Deeper section commands are represented as ordinary command nodes. Omit this
field to recognize all supported levels.

##### sourcePath?

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

### ProjectParseOptions

Options applied uniformly while parsing a virtual project.

#### Properties

##### enabledTokens?

> `readonly` `optional` **enabledTokens?**: readonly [`TokenType`](#tokentype)[]

Token categories recognized by the lexer.

Omit this field to enable every supported category. Disabled constructs are
preserved as text where possible.

##### maximumSectionLevel?

> `readonly` `optional` **maximumSectionLevel?**: [`SectionLevel`](#sectionlevel)

Deepest section command represented as a section node.

Deeper section commands are represented as ordinary command nodes. Omit this
field to recognize all supported levels.

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

### SerializeOptions

Options for serializing one parsed syntax tree.

#### Extended by

- [`TransformOptions`](#transformoptions)

#### Properties

##### enabledConditions?

> `readonly` `optional` **enabledConditions?**: readonly `string`[]

Conditions whose `if` branch is retained.

Omit this field to preserve conditional syntax. Pass an empty array to resolve
every recognized condition to its `else` branch. Resolving conditions also
removes recognized `\newif` declarations and their generated toggle commands.
Names are compared case-sensitively.

##### suppressComments?

> `readonly` `optional` **suppressComments?**: `boolean`

Replace recognized comments and newly empty comment lines; defaults to `false`.

***

### SourceFile

One versioned source file supplied to [parseProject](#parseproject).

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

[`NodeBase`](#nodebase).[`id`](#id-12)

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

### TransformOptions

Options for transforming a parsed project.

#### Extends

- [`SerializeOptions`](#serializeoptions)

#### Properties

##### enabledConditions?

> `readonly` `optional` **enabledConditions?**: readonly `string`[]

Conditions whose `if` branch is retained.

Omit this field to preserve conditional syntax. Pass an empty array to resolve
every recognized condition to its `else` branch. Resolving conditions also
removes recognized `\newif` declarations and their generated toggle commands.
Names are compared case-sensitively.

###### Inherited from

[`SerializeOptions`](#serializeoptions).[`enabledConditions`](#enabledconditions)

##### inputHandling?

> `readonly` `optional` **inputHandling?**: [`InputHandlingMode`](#inputhandlingmode)

How `\input` commands affect the generated file set; defaults to `Preserve`.

##### suppressComments?

> `readonly` `optional` **suppressComments?**: `boolean`

Replace recognized comments and newly empty comment lines; defaults to `false`.

###### Inherited from

[`SerializeOptions`](#serializeoptions).[`suppressComments`](#suppresscomments)

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

### AstNode

> **AstNode** = [`TextNode`](#textnode) \| [`NewLineNode`](#newlinenode) \| [`CommentNode`](#commentnode) \| [`CommandNode`](#commandnode) \| [`ConditionDeclarationNode`](#conditiondeclarationnode) \| [`EnvironmentNode`](#environmentnode) \| [`ConditionNode`](#conditionnode) \| [`ConditionBranchNode`](#conditionbranchnode) \| [`MathNode`](#mathnode) \| [`GroupNode`](#groupnode) \| [`SectionNode`](#sectionnode) \| [`InputNode`](#inputnode) \| [`AstRoot`](#astroot)

The exhaustive discriminated union of public PrepTeX syntax-tree nodes.

***

### ConditionName

> **ConditionName** = `string`

The name of a boolean condition declared with LaTeX's `\newif`.

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

### LineEnding

> **LineEnding** = "\n" \| "\r" \| "\r\n"

An exact source line-ending sequence.

***

### MathDelimiter

> **MathDelimiter** = `"$"` \| `"$$"` \| "\\(" \| "\\\["

An opening delimiter recognized for a LaTeX math node.

***

### NodeId

> **NodeId** = `number`

A node identifier that is unique within one parsed file.

***

### ProjectFilePath

> **ProjectFilePath** = `string`

A normalized, forward-slash path inside a virtual PrepTeX project.

Public operations reject absolute paths and paths that escape the project root.

***

### SectionLevel

> **SectionLevel** = `0` \| `1` \| `2` \| `3` \| `4` \| `5`

A supported section depth, where `0` represents the `document` environment.

***

### WarningDiagnosticCode

> **WarningDiagnosticCode** = `Exclude`\<[`DiagnosticCode`](#diagnosticcode), [`SyntaxError`](#syntaxerror)\>

A diagnostic code that can be returned after a successful parse.

## Functions

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

### mergeProjects()

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

***

### parseDocument()

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

***

### parseProject()

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

***

### serializeDocument()

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

***

### transformProject()

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
