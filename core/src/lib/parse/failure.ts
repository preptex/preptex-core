/**
 * An expected failure caused by malformed syntax in the input document.
 *
 * This class is internal. The public facade translates it to a
 * `PrepTexSyntaxError`; invariant and programmer errors must use ordinary
 * `Error` instances so that they are not mistaken for user input failures.
 */
export class ParseFailure extends Error {
  readonly position: number | undefined;
  readonly line: number | undefined;

  constructor(
    message: string,
    location: { readonly position?: number; readonly line?: number } = {}
  ) {
    super(message);
    this.name = 'ParseFailure';
    this.position = location.position;
    this.line = location.line;
  }
}
