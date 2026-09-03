import type { ConditionName, ProjectFilePath, SectionLevel, TokenType } from '../api-types.js';

/** Controls how `\input` nodes are handled while transforming a project. */
export enum InputHandlingMode {
  /** Emit the entry file and preserve each `\input` command literally. */
  Preserve = 'preserve',
  /** Emit the entry file with reachable `\input` targets inlined. */
  Flatten = 'flatten',
  /** Emit every parsed project file separately without inlining. */
  Separate = 'separate',
}

/** Options for parsing one LaTeX document. */
export interface ParseOptions {
  /**
   * Token categories recognized by the lexer.
   *
   * Omit this field to enable every supported category. Disabled constructs are
   * preserved as text where possible.
   */
  readonly enabledTokens?: readonly TokenType[];
  /**
   * Deepest section command represented as a section node.
   *
   * Deeper section commands are represented as ordinary command nodes. Omit this
   * field to recognize all supported levels.
   */
  readonly maximumSectionLevel?: SectionLevel;
  /** Virtual path attached to diagnostics; defaults to `<input>`. */
  readonly sourcePath?: ProjectFilePath;
}

/** Options applied uniformly while parsing a virtual project. */
export interface ProjectParseOptions {
  /**
   * Token categories recognized by the lexer.
   *
   * Omit this field to enable every supported category. Disabled constructs are
   * preserved as text where possible.
   */
  readonly enabledTokens?: readonly TokenType[];
  /**
   * Deepest section command represented as a section node.
   *
   * Deeper section commands are represented as ordinary command nodes. Omit this
   * field to recognize all supported levels.
   */
  readonly maximumSectionLevel?: SectionLevel;
}

/** Options for serializing one parsed syntax tree. */
export interface SerializeOptions {
  /** Replace recognized comments and newly empty comment lines; defaults to `false`. */
  readonly suppressComments?: boolean;
  /**
   * Conditions whose `if` branch is retained.
   *
   * Omit this field to preserve conditional syntax. Pass an empty array to resolve
   * every recognized condition to its `else` branch. Resolving conditions also
   * removes recognized `\newif` declarations and their generated toggle commands.
   * Names are compared case-sensitively.
   */
  readonly enabledConditions?: readonly ConditionName[];
}

/** Options for transforming a parsed project. */
export interface TransformOptions extends SerializeOptions {
  /** How `\input` commands affect the generated file set; defaults to `Preserve`. */
  readonly inputHandling?: InputHandlingMode;
}

/**
 * Tests whether a runtime value is a supported {@link InputHandlingMode}.
 *
 * @param value - Untrusted runtime value to validate.
 * @returns `true` when `value` is a supported mode.
 */
export function isInputHandlingMode(value: unknown): value is InputHandlingMode {
  return Object.values(InputHandlingMode).some((mode) => mode === value);
}
