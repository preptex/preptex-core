**@preptex/core v0.4.0**

***

# @preptex/core v0.4.0

PrepTeX's environment-neutral public API for parsing and transforming virtual
LaTeX projects.

## Enumerations

### PrepTexErrorCode

Stable machine-readable categories for exceptions thrown by PrepTeX.

#### Enumeration Members

##### EditConflict

> **EditConflict**: `"edit-conflict"`

Occurrence-specific edits cannot be represented by one physical file.

##### InvalidArgument

> **InvalidArgument**: `"invalid-argument"`

A runtime value does not satisfy the documented public input type.

##### InvalidEdit

> **InvalidEdit**: `"invalid-edit"`

Source edit ranges or preconditions are invalid.

##### OperationUnavailable

> **OperationUnavailable**: `"operation-unavailable"`

The requested operation cannot run against this representation or coverage.

##### OutputLimit

> **OutputLimit**: `"output-limit"`

Emission exceeded the caller's configured output bound.

##### StaleResult

> **StaleResult**: `"stale-result"`

Source or configured identity no longer matches the proposal.

## Classes

### PrepTexError

Base class for expected PrepTeX failures.

#### Extends

- `Error`

#### Extended by

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

[`SourceLocation`](#sourcelocation).[`path`](#path-9)

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`range`](#range-5)

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact source identity.

***

### AnalysisOptions

Options shared by independently runnable configured analyses.

#### Properties

##### allowIncomplete?

> `readonly` `optional` **allowIncomplete?**: `boolean`

Accept observations up to the view's failure boundary; default false.

***

### AnalysisResult

Analysis output with qualified findings and exact operation dependencies.

#### Properties

##### commands

> `readonly` **commands**: readonly [`CommandUsage`](#commandusage)[]

Command evidence, empty for reference analysis.

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-3)

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

> `readonly` **code**: `"not-implemented"` \| `"wrong-model"` \| `"view-not-ready"` \| `"missing-file"` \| `"edit-unavailable"`

Stable reason.

##### failure?

> `readonly` `optional` **failure?**: [`OperationFailure`](#operationfailure)

Located edit failure when code is edit-unavailable; absent for model requirements.

##### message

> `readonly` **message**: `string`

Display explanation.

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

### ConditionRealizationRequest

Request for condition-only source realization without structural AST construction.

#### Properties

##### conditions?

> `readonly` `optional` **conditions?**: [`ConditionPolicy`](#conditionpolicy)

Boolean condition evaluation policy; default { mode: 'source' }.

##### entryPath?

> `readonly` `optional` **entryPath?**: `string`

Entry virtual path; optional when snapshot has a single file, main.tex, or traversal is file-only.

##### inputs?

> `readonly` `optional` **inputs?**: `"preserve"` \| `"inline"`

Preserve active \input{...} commands across separate realized files, or inline active inputs into the entry artifact; default 'preserve'.

##### limits?

> `readonly` `optional` **limits?**: [`ViewLimits`](#viewlimits)

Optional interpretation resource bounds.

##### maxOutputCodeUnits?

> `readonly` `optional` **maxOutputCodeUnits?**: `number`

Maximum total output size in UTF-16 code units; default 10,000,000, maximum 100,000,000.

##### scope?

> `readonly` `optional` **scope?**: [`SourceScope`](#sourcescope)

Target files when traversal is 'file-only'; defaults to all files, or [entryPath] when entryPath is provided.

##### stripDeclarationsAndSetters?

> `readonly` `optional` **stripDeclarationsAndSetters?**: `boolean`

Strip \newif\ifX and reached [\global]\Xtrue/\Xfalse assignments along with \if.../\else/\fi; default true.

##### traversal?

> `readonly` `optional` **traversal?**: `"project"` \| `"file-only"`

Follow active literal inputs across project files, or evaluate files independently; default 'project'.

***

### ConditionRealizationResult

Condition-realized source output with edit plans, artifacts, and condition decisions.

#### Properties

##### artifacts

> `readonly` **artifacts**: readonly [`GeneratedArtifact`](#generatedartifact)[]

Realized LaTeX artifacts in deterministic path order when status === 'ready'; empty on failure.

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-3)

Coverage and encountered issues.

##### decisions

> `readonly` **decisions**: readonly [`ConditionDecision`](#conditiondecision)[]

Condition decisions in encounter order.

##### dependencies

> `readonly` **dependencies**: readonly [`ArtifactDependency`](#artifactdependency)[]

Remaining input relationships in emitted artifacts.

##### editPlan

> `readonly` **editPlan**: [`ProjectEditPlan`](#projecteditplan) \| `null`

Per-file source edit plan when inputs === 'preserve' and status === 'ready'; otherwise null.

##### kind

> `readonly` **kind**: `"condition-realization"`

Result discriminant.

##### occurrences

> `readonly` **occurrences**: readonly [`InputOccurrence`](#inputoccurrence)[]

Inclusion occurrences visited during condition traversal.

##### provenance

> `readonly` **provenance**: [`OperationProvenance`](#operationprovenance)

Exact operation provenance.

##### reason

> `readonly` **reason**: [`ProjectIssue`](#projectissue) \| `null`

First blocking or incomplete issue, or null when status is 'ready'.

##### resultId

> `readonly` **resultId**: `string`

Deterministic result identity.

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact source snapshot identity.

##### status

> `readonly` **status**: `"ready"` \| `"incomplete"` \| `"blocked"`

Complete condition realization, or incomplete/blocked when a condition or input could not be resolved.

***

### ConfiguredEnvironmentDelimiter

Located delimiter in one configured inclusion.

#### Extends

- [`EnvironmentDelimiter`](#environmentdelimiter)

#### Properties

##### name

> `readonly` **name**: `string`

Name inside braces, without expansion.

###### Inherited from

[`EnvironmentDelimiter`](#environmentdelimiter).[`name`](#name-4)

##### nameRange

> `readonly` **nameRange**: [`SourceRange`](#sourcerange)

Inclusive original range of the name alone.

###### Inherited from

[`EnvironmentDelimiter`](#environmentdelimiter).[`nameRange`](#namerange-1)

##### origin

> `readonly` **origin**: [`VersionedSourceOrigin`](#versionedsourceorigin)

Exact selected origin and file revision.

##### path

> `readonly` **path**: `string`

Normalized project-relative source path.

###### Inherited from

[`EnvironmentDelimiter`](#environmentdelimiter).[`path`](#path-2)

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

###### Inherited from

[`EnvironmentDelimiter`](#environmentdelimiter).[`range`](#range-3)

***

### ConfiguredEnvironmentSyntax

Exact delimiters when each is one literal physical command.

#### Properties

##### body

> `readonly` **body**: [`VersionedSourceOrigin`](#versionedsourceorigin) \| `null`

Contiguous original body including empty bodies (end=start-1); null for disjoint/multi-file syntax.

##### closing

> `readonly` **closing**: [`ConfiguredEnvironmentDelimiter`](#configuredenvironmentdelimiter) \| `null`

Closer or null for a delimiter assembled from disjoint source.

##### hasArguments

> `readonly` **hasArguments**: `boolean`

An optional/braced argument immediately follows the opener; renaming cannot adapt it.

##### opening

> `readonly` **opening**: [`ConfiguredEnvironmentDelimiter`](#configuredenvironmentdelimiter) \| `null`

Opener or null for a delimiter assembled from disjoint source.

***

### ConfiguredIndex

Reusable configured fact index in execution order.

#### Properties

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-3)

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

##### location

> `readonly` **location**: [`NodeLocation`](#nodelocation)

Original line/start/end extents with file revisions; no envelope across omitted gaps.

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

### EnvironmentDelimiter

A complete literal begin/end command in original source.

#### Extends

- [`SourceLocation`](#sourcelocation)

#### Extended by

- [`ConfiguredEnvironmentDelimiter`](#configuredenvironmentdelimiter)

#### Properties

##### name

> `readonly` **name**: `string`

Name inside braces, without expansion.

##### nameRange

> `readonly` **nameRange**: [`SourceRange`](#sourcerange)

Inclusive original range of the name alone.

##### path

> `readonly` **path**: `string`

Normalized project-relative source path.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`path`](#path-9)

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`range`](#range-5)

***

### EnvironmentInventory

Frozen source environment inventory; no entry or configured view required.

#### Properties

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-3)

Recognition limitations; candidates do not erase healthy results.

##### environments

> `readonly` **environments**: readonly [`SourceEnvironment`](#sourceenvironment)[]

Path/offset ordered matched regions and candidates.

##### kind

> `readonly` **kind**: `"environments"`

Result discriminant.

##### resultId

> `readonly` **resultId**: `string`

Canonical request/content identity.

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact source authority.

***

### EnvironmentSelection

Reference to one recognized physical source environment.

#### Properties

##### environmentId

> `readonly` **environmentId**: `string`

Inventory occurrence ID within the snapshot.

##### kind

> `readonly` **kind**: `"source-environment"`

Selection discriminant.

##### path

> `readonly` **path**: `string`

Original path.

##### snapshotId

> `readonly` **snapshotId**: `string`

Owning source identity.

##### version

> `readonly` **version**: `number`

Original revision.

***

### ExportOptions

Output policies for a configured project. No filename rewriting is performed.

#### Properties

##### inputs

> `readonly` **inputs**: `"preserve"` \| `"inline"`

Preserve input commands and relative files, or expand active occurrences.

##### maxOutputCodeUnits?

> `readonly` `optional` **maxOutputCodeUnits?**: `number`

Total UTF-16 output limit across artifacts, default 10000000; maximum 100000000.

##### nodeEdits?

> `readonly` `optional` **nodeEdits?**: readonly [`NodeEditAction`](#nodeeditaction)[]

Selected-node actions before final export; nonempty actions require inline output.

##### suppressCommentEnvironments?

> `readonly` `optional` **suppressCommentEnvironments?**: `boolean`

Remove selected complete comment environments independently of percent suppression; default false.

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

> `readonly` **coverage**: [`Coverage`](#coverage-3)

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

### NodeSelection

Reference to one configured structural node, including its inclusion context.

#### Properties

##### kind

> `readonly` **kind**: `"node"`

Selection discriminant.

##### nodeKey

> `readonly` **nodeKey**: `string`

Unique node occurrence key within that view.

##### snapshotId

> `readonly` **snapshotId**: `string`

Owning original source identity.

##### viewId

> `readonly` **viewId**: `string`

Owning configured interpretation identity.

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

> `readonly` **id**: `"edit-nodes"` \| `"remove-environments"` \| `"source-inventory"` \| `"realize-conditions"` \| `"resolve-view"` \| `"references"` \| `"unused-commands"` \| `"suppress-comments"` \| `"export-project"`

Stable operation name.

##### implemented

> `readonly` **implemented**: `boolean`

Whether execution is shipped in this release.

##### representation

> `readonly` **representation**: `"snapshot"` \| `"view"`

Required model representation.

##### resultKind

> `readonly` **resultKind**: `"view"` \| `"inventory"` \| `"findings"` \| `"edits"` \| `"artifacts"` \| `"transformation"`

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

### ProjectSourceIndex

Clone-safe lookup index; reuse only with its exact snapshot/view.

#### Properties

##### files

> `readonly` **files**: readonly [`SourceLookupFile`](#sourcelookupfile)[]

Path-sorted indexes.

##### id

> `readonly` **id**: `string`

Versioned deterministic index identity.

##### kind

> `readonly` **kind**: `"source-index"`

Index discriminant.

##### model

> `readonly` **model**: [`ProjectSnapshot`](#projectsnapshot) \| [`ProjectView`](#projectview)

Immutable source/view authority used to reconstruct transported indexes.

##### snapshotId

> `readonly` **snapshotId**: `string`

Original snapshot identity.

##### viewId

> `readonly` **viewId**: `string` \| `null`

Configured identity, null for independent source lookup.

***

### ProjectViewBase

Fields shared by ready, incomplete, and blocked configured results.

#### Properties

##### configuration

> `readonly` **configuration**: [`NormalizedViewConfiguration`](#normalizedviewconfiguration)

Canonical semantic settings.

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-3)

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

> `readonly` **status**: `"matched"` \| `"unresolved"` \| `"duplicate"` \| `"missing"` \| `"unknown-coverage"`

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

> `readonly` **coverage**: [`Coverage`](#coverage-3)

Recognized syntax coverage and localized diagnostics.

##### facts

> `readonly` **facts**: readonly [`SyntaxFact`](#syntaxfact)[]

Located facts in source order, then deterministic fact-kind order.

##### path

> `readonly` **path**: `string`

Stable virtual path used by entry selection and `\input` resolution.

###### Inherited from

[`SourceFile`](#sourcefile).[`path`](#path-8)

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

Caller-owned finite number used to resolve incremental update conflicts.

###### Inherited from

[`SourceFile`](#sourcefile).[`version`](#version-4)

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

### SelectedToken

A selected lexical token with distinct projected and original coordinates.

#### Properties

##### interpretation

> `readonly` **interpretation**: `"opaque"` \| `"structure"` \| `"verbatim"`

Opaque stored syntax or active verbatim region is a leaf; structural delimiters there never execute.

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

### SourceEnvironment

Located source environment; candidates never authorize a whole-region edit.

#### Properties

##### body

> `readonly` **body**: [`SourceRange`](#sourcerange) \| `null`

Inclusive body range; empty bodies have end=start-1; null for candidates.

##### closing

> `readonly` **closing**: [`EnvironmentDelimiter`](#environmentdelimiter) \| `null`

Located closer, null for an unmatched opening delimiter.

##### context

> `readonly` **context**: [`FactContext`](#factcontext)

Source-only context, not evidence of execution.

##### id

> `readonly` **id**: `string`

Snapshot-local identifier; do not persist across edits.

##### name

> `readonly` **name**: `string` \| `null`

Literal name, or null for a dynamic/malformed delimiter.

##### opening

> `readonly` **opening**: [`EnvironmentDelimiter`](#environmentdelimiter) \| `null`

Located opener, null for an unmatched closing delimiter.

##### path

> `readonly` **path**: `string`

Original file path.

##### protected

> `readonly` **protected**: `boolean`

Protected region grammar rather than nested environment matching.

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Whole extent when matched; otherwise the known delimiter range only.

##### reason

> `readonly` **reason**: `string` \| `null`

Null when matched; explanation of incomplete recognition otherwise.

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact original source identity.

##### status

> `readonly` **status**: `"matched"` \| `"candidate"`

Complete matched region or unresolved delimiter.

##### version

> `readonly` **version**: `number`

Caller-owned original revision.

***

### SourceFile

One versioned source file supplied to [createProjectSnapshot](#createprojectsnapshot).

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

Caller-owned finite number used to resolve incremental update conflicts.

***

### SourceInterval

Plain-data augmented interval tree node; not an executable parser class.

#### Properties

##### hit

> `readonly` **hit**: [`SourceLookupHit`](#sourcelookuphit)

Indexed hit.

##### left

> `readonly` **left**: [`SourceInterval`](#sourceinterval) \| `null`

Earlier intervals or null.

##### maxEnd

> `readonly` **maxEnd**: `number`

Largest inclusive end in this subtree.

##### right

> `readonly` **right**: [`SourceInterval`](#sourceinterval) \| `null`

Later intervals or null.

***

### SourceLocation

A location in an original source string; ranges are inclusive UTF-16.

#### Extended by

- [`SourceOrigin`](#sourceorigin)
- [`SyntaxFactBase`](#syntaxfactbase)
- [`AnalysisLocation`](#analysislocation)
- [`EnvironmentDelimiter`](#environmentdelimiter)

#### Properties

##### path

> `readonly` **path**: `string`

Normalized project-relative source path.

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

***

### SourceLookupFile

Per-file immutable source-search data.

#### Properties

##### intervals

> `readonly` **intervals**: [`SourceInterval`](#sourceinterval) \| `null`

Balanced interval tree, null for no entries.

##### length

> `readonly` **length**: `number`

Original UTF-16 length; also the EOF insertion offset.

##### lineStarts

> `readonly` **lineStarts**: readonly `number`[]

Zero-based line starts; CRLF occupies two source units and one line boundary.

##### path

> `readonly` **path**: `string`

Original virtual path.

##### version

> `readonly` **version**: `number`

Original revision.

***

### SourceLookupQuery

Point or inclusive-overlap query in original source coordinates.

#### Properties

##### end?

> `readonly` `optional` **end?**: `number`

Inclusive end; omission performs a point lookup.

##### kinds?

> `readonly` `optional` **kinds?**: readonly (`"node"` \| `"token"` \| `"environment"`)[]

Categories to return; omission returns all, empty returns none.

##### occurrenceId?

> `readonly` `optional` **occurrenceId?**: `string`

Optional inclusion filter for configured node hits.

##### path

> `readonly` **path**: `string`

Original file path.

##### start

> `readonly` **start**: `number`

Zero-based original UTF-16 point/start; EOF returns no point hit.

***

### SourceOrigin

A location of one selected source occurrence.

#### Extends

- [`SourceLocation`](#sourcelocation)

#### Extended by

- [`VersionedSourceOrigin`](#versionedsourceorigin)

#### Properties

##### occurrenceId

> `readonly` **occurrenceId**: `string`

Inclusion occurrence containing this span.

##### path

> `readonly` **path**: `string`

Normalized project-relative source path.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`path`](#path-9)

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`range`](#range-5)

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact source snapshot identity.

***

### SourceRange

An inclusive source range in the original JavaScript string.

Offsets count UTF-16 code units and `line` is one-based. For an empty document,
the root range is `start = 0`, `end = -1`, and `line = 1`.

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

##### index

> `readonly` **index**: `number`

Zero-based index in the owning file's token stream.

##### kind

> `readonly` **kind**: [`SourceTokenKind`](#sourcetokenkind-1)

Lexical category; tokenizes raw source unconditionally without macro/verbatim state.

##### name

> `readonly` **name**: `string`

Command name without leading `\`, or `""` when `kind !== 'command'`.

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Inclusive original range.

##### value

> `readonly` **value**: `string`

Exact source substring.

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

[`SourceLocation`](#sourcelocation).[`path`](#path-9)

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

###### Inherited from

[`SourceLocation`](#sourcelocation).[`range`](#range-5)

##### recognition

> `readonly` **recognition**: `"candidate"` \| `"recognized"`

Whether this construct is recognized or retained as an unresolved candidate.

***

### TransformationResult

Successful transformation preview/export, with sources unchanged.

#### Properties

##### artifacts

> `readonly` **artifacts**: readonly [`GeneratedArtifact`](#generatedartifact)[]

Preview/export files, in deterministic path order.

##### coverage

> `readonly` **coverage**: [`Coverage`](#coverage-3)

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

### VersionedSourceOrigin

Original selected span with its caller-owned file revision.

#### Extends

- [`SourceOrigin`](#sourceorigin)

#### Properties

##### occurrenceId

> `readonly` **occurrenceId**: `string`

Inclusion occurrence containing this span.

###### Inherited from

[`SourceOrigin`](#sourceorigin).[`occurrenceId`](#occurrenceid-2)

##### path

> `readonly` **path**: `string`

Normalized project-relative source path.

###### Inherited from

[`SourceOrigin`](#sourceorigin).[`path`](#path-12)

##### range

> `readonly` **range**: [`SourceRange`](#sourcerange)

Original source range, never a projected offset.

###### Inherited from

[`SourceOrigin`](#sourceorigin).[`range`](#range-6)

##### snapshotId

> `readonly` **snapshotId**: `string`

Exact source snapshot identity.

###### Inherited from

[`SourceOrigin`](#sourceorigin).[`snapshotId`](#snapshotid-11)

##### version

> `readonly` **version**: `number`

Finite revision of the original file in the owning snapshot.

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

### BooleanValues

> **BooleanValues** = `Readonly`\<`Record`\<`string`, `boolean`\>\>

Named values, case-sensitive; names exclude the if prefix and primitives.

***

### ConditionPolicy

> **ConditionPolicy** = \{ `initialValues?`: [`BooleanValues`](#booleanvalues); `mode`: `"source"`; \} \| \{ `mode`: `"manual"`; `values`: [`BooleanValues`](#booleanvalues); \} \| \{ `initialValues?`: [`BooleanValues`](#booleanvalues); `mode`: `"source-with-overrides"`; `overrides`: [`BooleanValues`](#booleanvalues); \} \| \{ `mode`: `"none"`; \}

Source tracking, permanent manual forcing, initial seeds, and condition-free assertions have distinct semantics.

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

##### Type Literal

\{ `mode`: `"none"`; \}

###### mode

> `readonly` **mode**: `"none"`

Assert no conditionals exist in the reached source; any conditional syntax stops with unrealized-condition.

***

### ConfiguredContainerNode

> **ConfiguredContainerNode** = [`ConfiguredNodeBase`](#configurednodebase) & \{ `children`: readonly [`ConfiguredNode`](#configurednode)[]; `kind`: `"root"`; \} \| \{ `children`: readonly [`ConfiguredNode`](#configurednode)[]; `kind`: `"environment"`; `name`: `string`; `syntax`: [`ConfiguredEnvironmentSyntax`](#configuredenvironmentsyntax); \} \| \{ `children`: readonly [`ConfiguredNode`](#configurednode)[]; `kind`: `"group"`; \} \| \{ `children`: readonly [`ConfiguredNode`](#configurednode)[]; `delimiter`: [`MathDelimiter`](#mathdelimiter); `kind`: `"math"`; \} \| \{ `children`: readonly [`ConfiguredNode`](#configurednode)[]; `kind`: `"section"`; `level`: `1` \| `2` \| `3` \| `4` \| `5`; `name`: `string`; `starred`: `boolean`; \}

Configured containers, with a complete ordered child list only in ready views.

***

### ConfiguredNode

> **ConfiguredNode** = [`ConfiguredContainerNode`](#configuredcontainernode) \| [`ConfiguredNodeBase`](#configurednodebase) & `object`

Exhaustive configured structure. Leaf tokens are never re-lexed across source joins.

***

### InterpretationProfile

> **InterpretationProfile** = `"direct-latex-v1"`

Supported source/interpretation grammar, not a promise of TeX equivalence.

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

### NodeEditAction

> **NodeEditAction** = \{ `kind`: `"remove-node"`; `selection`: [`NodeSelection`](#nodeselection); \} \| \{ `kind`: `"rename-environment"`; `name`: `string`; `selection`: [`NodeSelection`](#nodeselection); \} \| \{ `kind`: `"wrap-node"`; `name`: `string`; `selection`: [`NodeSelection`](#nodeselection); \}

Tree-selected change; all references belong to the same original view.

#### Union Members

##### Type Literal

\{ `kind`: `"remove-node"`; `selection`: [`NodeSelection`](#nodeselection); \}

###### kind

> `readonly` **kind**: `"remove-node"`

Remove the complete subtree.

###### selection

> `readonly` **selection**: [`NodeSelection`](#nodeselection)

Selected construct.

***

##### Type Literal

\{ `kind`: `"rename-environment"`; `name`: `string`; `selection`: [`NodeSelection`](#nodeselection); \}

###### kind

> `readonly` **kind**: `"rename-environment"`

Rename both environment delimiters, retaining the body.

###### name

> `readonly` **name**: `string`

Literal argument-free environment name.

###### selection

> `readonly` **selection**: [`NodeSelection`](#nodeselection)

Selected environment.

***

##### Type Literal

\{ `kind`: `"wrap-node"`; `name`: `string`; `selection`: [`NodeSelection`](#nodeselection); \}

###### kind

> `readonly` **kind**: `"wrap-node"`

Retain the node inside a new environment.

###### name

> `readonly` **name**: `string`

Literal argument-free wrapper name.

###### selection

> `readonly` **selection**: [`NodeSelection`](#nodeselection)

Selected construct.

***

### NodeLocation

> **NodeLocation** = \{ `kind`: `"none"`; `primary`: `null`; `spans`: readonly \[\]; \} \| \{ `kind`: `"single"`; `primary`: [`VersionedSourceOrigin`](#versionedsourceorigin); `spans`: readonly \[[`VersionedSourceOrigin`](#versionedsourceorigin)\]; \} \| \{ `kind`: `"multiple"`; `primary`: [`VersionedSourceOrigin`](#versionedsourceorigin); `spans`: readonly [`VersionedSourceOrigin`](#versionedsourceorigin)[]; \}

Original locations, never an envelope across omitted source.

#### Union Members

##### Type Literal

\{ `kind`: `"none"`; `primary`: `null`; `spans`: readonly \[\]; \}

###### kind

> `readonly` **kind**: `"none"`

No contributing source, for an empty root.

###### primary

> `readonly` **primary**: `null`

No primary jump.

###### spans

> `readonly` **spans**: readonly \[\]

Empty origins.

***

##### Type Literal

\{ `kind`: `"single"`; `primary`: [`VersionedSourceOrigin`](#versionedsourceorigin); `spans`: readonly \[[`VersionedSourceOrigin`](#versionedsourceorigin)\]; \}

###### kind

> `readonly` **kind**: `"single"`

One contiguous original extent.

###### primary

> `readonly` **primary**: [`VersionedSourceOrigin`](#versionedsourceorigin)

The sole span.

###### spans

> `readonly` **spans**: readonly \[[`VersionedSourceOrigin`](#versionedsourceorigin)\]

Exactly one span.

***

##### Type Literal

\{ `kind`: `"multiple"`; `primary`: [`VersionedSourceOrigin`](#versionedsourceorigin); `spans`: readonly [`VersionedSourceOrigin`](#versionedsourceorigin)[]; \}

###### kind

> `readonly` **kind**: `"multiple"`

Ordered disjoint or multi-file extents.

###### primary

> `readonly` **primary**: [`VersionedSourceOrigin`](#versionedsourceorigin)

First contributing span, for navigation only.

###### spans

> `readonly` **spans**: readonly [`VersionedSourceOrigin`](#versionedsourceorigin)[]

Every contributing extent in encounter order.

***

### NodeTransformationRequest

> **NodeTransformationRequest** = \{ `operation`: `"edit-nodes"`; `options`: \{ `actions`: readonly [`NodeEditAction`](#nodeeditaction)[]; `maxOutputCodeUnits?`: `number`; `target`: `"selected"` \| `"artifact"`; \}; \} \| \{ `operation`: `"remove-environments"`; `options`: \{ `maxOutputCodeUnits?`: `number`; `names`: readonly `string`[]; `target`: `"selected"` \| `"artifact"`; \}; \}

Additional transformations using configured nodes over a realized ProjectView.

#### Union Members

##### Type Literal

\{ `operation`: `"edit-nodes"`; `options`: \{ `actions`: readonly [`NodeEditAction`](#nodeeditaction)[]; `maxOutputCodeUnits?`: `number`; `target`: `"selected"` \| `"artifact"`; \}; \}

###### operation

> `readonly` **operation**: `"edit-nodes"`

Batch of configured node actions.

###### options

> `readonly` **options**: `object`

Source edits or fully materialized/inlined artifacts.

###### options.actions

> `readonly` **actions**: readonly [`NodeEditAction`](#nodeeditaction)[]

Ordered actions; at most 10000.

###### options.maxOutputCodeUnits?

> `readonly` `optional` **maxOutputCodeUnits?**: `number`

Total output UTF-16 bound, default 10000000.

###### options.target

> `readonly` **target**: `"selected"` \| `"artifact"`

Source previews preserve every unmapped slice; artifact mode specializes occurrences.

***

##### Type Literal

\{ `operation`: `"remove-environments"`; `options`: \{ `maxOutputCodeUnits?`: `number`; `names`: readonly `string`[]; `target`: `"selected"` \| `"artifact"`; \}; \}

###### operation

> `readonly` **operation**: `"remove-environments"`

Remove matching literal environments from the realized view.

###### options

> `readonly` **options**: `object`

Explicit selected or artifact scope.

###### options.maxOutputCodeUnits?

> `readonly` `optional` **maxOutputCodeUnits?**: `number`

Total output UTF-16 bound, default 10000000.

###### options.names

> `readonly` **names**: readonly `string`[]

Case-sensitive literal names; nonempty, sorted during normalization.

###### options.target

> `readonly` **target**: `"selected"` \| `"artifact"`

Configured selected occurrences or artifact export.

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

> **OperationRequest** = [`NodeTransformationRequest`](#nodetransformationrequest) \| \{ `operation`: `"source-inventory"`; `options?`: [`InventoryRequest`](#inventoryrequest); \} \| \{ `operation`: `"realize-conditions"`; `options`: [`ConditionRealizationRequest`](#conditionrealizationrequest); \} \| \{ `operation`: `"resolve-view"`; `options`: [`ViewConfiguration`](#viewconfiguration); \} \| \{ `operation`: `"references"` \| `"unused-commands"`; `options?`: [`AnalysisOptions`](#analysisoptions); \} \| \{ `operation`: `"suppress-comments"`; `options?`: \{ `maxOutputCodeUnits?`: `number`; `suppressCommentEnvironments?`: `boolean`; `target?`: `"selected"`; \}; \} \| \{ `operation`: `"export-project"`; `options`: [`ExportOptions`](#exportoptions); \}

Public requests for independent inventory, condition realization, interpretation, analysis, and transformation.

#### Union Members

[`NodeTransformationRequest`](#nodetransformationrequest)

***

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

\{ `operation`: `"realize-conditions"`; `options`: [`ConditionRealizationRequest`](#conditionrealizationrequest); \}

###### operation

> `readonly` **operation**: `"realize-conditions"`

Condition-only source realization on a project snapshot.

###### options

> `readonly` **options**: [`ConditionRealizationRequest`](#conditionrealizationrequest)

Condition realization settings.

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

Independent structural analysis over a realized ProjectView.

###### options?

> `readonly` `optional` **options?**: [`AnalysisOptions`](#analysisoptions)

Partial view observations require explicit opt-in.

***

##### Type Literal

\{ `operation`: `"suppress-comments"`; `options?`: \{ `maxOutputCodeUnits?`: `number`; `suppressCommentEnvironments?`: `boolean`; `target?`: `"selected"`; \}; \}

###### operation

> `readonly` **operation**: `"suppress-comments"`

Configured comment suppression on a realized ProjectView.

###### options?

> `readonly` `optional` **options?**: `object`

Selected-path comment suppression options.

###### options.maxOutputCodeUnits?

> `readonly` `optional` **maxOutputCodeUnits?**: `number`

Maximum total preview size in UTF-16 code units; default 10,000,000, maximum 100,000,000.

###### options.suppressCommentEnvironments?

> `readonly` `optional` **suppressCommentEnvironments?**: `boolean`

Also remove recognized comment environments; default false. Verbatim remains protected.

###### options.target?

> `readonly` `optional` **target?**: `"selected"`

Inspect only the configured selected path; default 'selected'.

***

##### Type Literal

\{ `operation`: `"export-project"`; `options`: [`ExportOptions`](#exportoptions); \}

###### operation

> `readonly` **operation**: `"export-project"`

Export a realized ProjectView with explicit input arrangement.

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

> **ProjectIssueCode** = `"malformed-syntax"` \| `"opaque-region"` \| `"scan-limit"` \| `"unknown-condition"` \| `"unsupported-condition"` \| `"unsupported-effect"` \| `"unsupported-assignment"` \| `"binding-redefined"` \| `"unrealized-condition"` \| `"dynamic-input"` \| `"file-only-input"` \| `"missing-entry"` \| `"missing-input"` \| `"ambiguous-input"` \| `"invalid-input-path"` \| `"input-cycle"` \| `"cross-file-conditional"` \| `"interpretation-limit"` \| `"structural-error"`

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

### SnapshotId

> **SnapshotId** = `string`

Opaque deterministic content identity; compare exactly, never parse or persist as authorization.

***

### SourceLookupHit

> **SourceLookupHit** = \{ `kind`: `"token"`; `location`: [`SourceLocation`](#sourcelocation); `tokenIndex`: `number`; \} \| \{ `kind`: `"environment"`; `location`: [`SourceLocation`](#sourcelocation); `selection`: [`EnvironmentSelection`](#environmentselection); \} \| \{ `depth`: `number`; `kind`: `"node"`; `location`: [`VersionedSourceOrigin`](#versionedsourceorigin); `order`: `number`; `selection`: [`NodeSelection`](#nodeselection); \}

One immutable hit returned by original-source lookup.

#### Union Members

##### Type Literal

\{ `kind`: `"token"`; `location`: [`SourceLocation`](#sourcelocation); `tokenIndex`: `number`; \}

###### kind

> `readonly` **kind**: `"token"`

Source lexical token.

###### location

> `readonly` **location**: [`SourceLocation`](#sourcelocation)

Original extent.

###### tokenIndex

> `readonly` **tokenIndex**: `number`

Original token index in its file.

***

##### Type Literal

\{ `kind`: `"environment"`; `location`: [`SourceLocation`](#sourcelocation); `selection`: [`EnvironmentSelection`](#environmentselection); \}

###### kind

> `readonly` **kind**: `"environment"`

Located source environment.

###### location

> `readonly` **location**: [`SourceLocation`](#sourcelocation)

Known original extent.

###### selection

> `readonly` **selection**: [`EnvironmentSelection`](#environmentselection)

Safe identity for subsequent inspection.

***

##### Type Literal

\{ `depth`: `number`; `kind`: `"node"`; `location`: [`VersionedSourceOrigin`](#versionedsourceorigin); `order`: `number`; `selection`: [`NodeSelection`](#nodeselection); \}

###### depth

> `readonly` **depth**: `number`

Structural depth, root is zero.

###### kind

> `readonly` **kind**: `"node"`

Configured node occurrence.

###### location

> `readonly` **location**: [`VersionedSourceOrigin`](#versionedsourceorigin)

Exact matching original span with revision and inclusion.

###### order

> `readonly` **order**: `number`

Stable configured encounter order.

###### selection

> `readonly` **selection**: [`NodeSelection`](#nodeselection)

View-bound selection.

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

### SourceTokenKind

> **SourceTokenKind** = `"comment"` \| `"space"` \| `"command"` \| `"open"` \| `"close"` \| `"math"` \| `"text"`

Lexical category of an unconditional source token.

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

### createProjectSourceIndex()

> **createProjectSourceIndex**(`model`): [`ProjectSourceIndex`](#projectsourceindex)

Build a clone-safe original-source interval index once per immutable model.

#### Parameters

##### model

[`ProjectSnapshot`](#projectsnapshot) \| [`ProjectView`](#projectview)

Source snapshot or configured view; incomplete views have no node hits.

#### Returns

[`ProjectSourceIndex`](#projectsourceindex)

Frozen per-file line/interval indexes. Canonical repeat calls reuse object identity.

#### Throws

[PrepTexError](#preptexerror) on malformed source/view transports.

#### Remarks

Construction costs O(n log n) for n indexed spans. Queries prune nonoverlapping subtrees;
nodes with several origins are indexed separately and repeated inclusions remain distinct.

***

### getSelectedEnvironment()

> **getSelectedEnvironment**(`snapshot`, `selection`): [`SourceEnvironment`](#sourceenvironment)

Resolve a source-environment selection without trusting copied delimiter data.

#### Parameters

##### snapshot

[`ProjectSnapshot`](#projectsnapshot)

Exact owning snapshot.

##### selection

[`EnvironmentSelection`](#environmentselection)

Public inventory identity and file revision.

#### Returns

[`SourceEnvironment`](#sourceenvironment)

Canonical frozen environment, which may be a non-editable candidate.

#### Throws

[ProjectOperationError](#projectoperationerror) with StaleResult for an obsolete or unknown selection.

***

### getSelectedNode()

> **getSelectedNode**(`view`, `selection`): [`ConfiguredNode`](#configurednode)

Resolve a selection against canonical immutable structure.

#### Parameters

##### view

[`ProjectView`](#projectview)

Exact owning view; transported structure is reconstructed.

##### selection

[`NodeSelection`](#nodeselection)

Snapshot/view/node identity, never a caller-constructed AST.

#### Returns

[`ConfiguredNode`](#configurednode)

The original frozen node with line/start/end spans and delimiter metadata.

#### Throws

[ProjectOperationError](#projectoperationerror) with StaleResult for stale/unknown selections.

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

### inspectProjectEnvironments()

> **inspectProjectEnvironments**(`snapshot`, `scope?`): [`EnvironmentInventory`](#environmentinventory)

Inspect literal environment syntax independently of condition resolution.

#### Parameters

##### snapshot

[`ProjectSnapshot`](#projectsnapshot)

Original source authority; transported derived data is rebuilt.

##### scope?

[`SourceScope`](#sourcescope)

All files by default, or an explicit nonempty file scope.

#### Returns

[`EnvironmentInventory`](#environmentinventory)

Frozen path/offset ordered matches and located candidates with coverage.

#### Throws

[PrepTexError](#preptexerror) for malformed scope or absent files.

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

### lookupProjectSource()

> **lookupProjectSource**(`index`, `query`): readonly [`SourceLookupHit`](#sourcelookuphit)[]

Find tokens, environment occurrences and nodes intersecting original source.

#### Parameters

##### index

[`ProjectSourceIndex`](#projectsourceindex)

Owning immutable index; mutable transported indexes are rebuilt on each call.

##### query

[`SourceLookupQuery`](#sourcelookupquery)

Inclusive UTF-16 point/range and optional category/inclusion filters.

#### Returns

readonly [`SourceLookupHit`](#sourcelookuphit)[]

Frozen hits, nodes innermost first then encounter order; other hits follow by start/end/kind.
A multi-span node contributes each intersecting span. EOF point queries return no hits.

#### Throws

[PrepTexError](#preptexerror) for invalid bounds, paths, filters or index identity.

***

### planTransformation()

> **planTransformation**(`model`, `request`): [`TransformationResult`](#transformationresult)

Plan condition realization, comment/node source edits, or a configured export without changing sources.

#### Parameters

##### model

[`ProjectSnapshot`](#projectsnapshot) \| [`ProjectView`](#projectview)

Source snapshot for condition realization, configured view for structural edits/exports.

##### request

[`TransformationRequest`](#transformationrequest)

Operation, retention/topology policies, and resource limits.

#### Returns

[`TransformationResult`](#transformationresult)

Frozen edits, exact preview artifacts and mappings, dependency metadata and coverage.

#### Throws

[ProjectOperationError](#projectoperationerror) for unavailable models, incompatible shared-file contexts or output limits.

#### Throws

[PrepTexError](#preptexerror) with InvalidArgument for malformed options or stale transports.

***

### realizeProjectConditions()

> **realizeProjectConditions**(`snapshot`, `request?`): [`ConditionRealizationResult`](#conditionrealizationresult)

Realize conditional branches and boolean declarations/setters over a project snapshot
without constructing a structural AST (Pipeline B, INV-3 & INV-5).

#### Parameters

##### snapshot

[`ProjectSnapshot`](#projectsnapshot)

Source authority to evaluate.

##### request?

[`ConditionRealizationRequest`](#conditionrealizationrequest) = `{}`

Condition policy, traversal, input handling, and output limits.

#### Returns

[`ConditionRealizationResult`](#conditionrealizationresult)

Frozen realization result containing decisions, checked editPlan, and realized artifacts.

***

### resolveProjectView()

> **resolveProjectView**(`snapshot`, `configuration`): [`ProjectView`](#projectview)

Resolve reached boolean tests and active literal inputs, then parse the selected token stream
into a condition-free structural AST (Pipeline A Step 1 & Step 2, INV-4 & INV-5).

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

Analyze recognized references or conservative command-use evidence over a realized ProjectView.

#### Parameters

##### model

[`ProjectSnapshot`](#projectsnapshot) \| [`ProjectView`](#projectview)

Configured view; incomplete views require allowIncomplete explicitly.

##### request

Analysis and options.

###### operation

`"references"` \| `"unused-commands"`

Independent structural analysis over a realized ProjectView.

###### options?

[`AnalysisOptions`](#analysisoptions)

Partial view observations require explicit opt-in.

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

### selectProjectNode()

> **selectProjectNode**(`view`, `nodeKey`): [`NodeSelection`](#nodeselection)

Select a canonical configured node without copying mutable parser state.

#### Parameters

##### view

[`ProjectView`](#projectview)

Owning configured view.

##### nodeKey

`string`

Node occurrence key obtained by traversal or indexed lookup.

#### Returns

[`NodeSelection`](#nodeselection)

A deeply frozen model-bound reference. Root references are inspectable but not editable.

#### Throws

[ProjectOperationError](#projectoperationerror) with StaleResult if no such node exists.

***

### sourceOffsetAt()

> **sourceOffsetAt**(`index`, `path`, `line`, `column?`): `number`

Convert an original source line and UTF-16 column to a source offset.

#### Parameters

##### index

[`ProjectSourceIndex`](#projectsourceindex)

Owning source index.

##### path

`string`

Original virtual file path.

##### line

`number`

One-based line number, including an empty final line after a newline.

##### column?

`number` = `0`

Zero-based raw UTF-16 column; default zero. Includes original newline units.

#### Returns

`number`

Original offset; the last line permits EOF. No source normalization is performed.

#### Throws

[PrepTexError](#preptexerror) for absent files or out-of-range coordinates.

***

### tokenizeFile()

> **tokenizeFile**(`source`): readonly [`SourceToken`](#sourcetoken)[]

Stateless whole-file tokenizer (Stage 0, INV-1 & INV-2).
Scans a raw LaTeX string once from 0 to source.length without any condition,
input, or environment state.

#### Parameters

##### source

`string`

#### Returns

readonly [`SourceToken`](#sourcetoken)[]

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

[ProjectOperationError](#projectoperationerror) for incompatible occurrence edits, invalid canonical edits, or output limits.

***

### walkConfiguredNodes()

> **walkConfiguredNodes**(`root`): readonly [`ConfiguredNode`](#configurednode)[]

Return nodes in depth-first source/execution order; the returned array is frozen.

#### Parameters

##### root

[`ConfiguredNode`](#configurednode)

#### Returns

readonly [`ConfiguredNode`](#configurednode)[]
