import type { SourceRange } from '../../api-types.js';
import type {
  AnalysisLocation,
  MetadataAuthor,
  MetadataField,
  ProjectMetadata,
  ProjectSnapshot,
  ProjectView,
  SourceToken,
} from '../../project-types.js';
import { walkConfiguredNodes } from '../../project-types.js';
import { inspectProjectCatalog } from './catalog.js';
import { getCommandSignature, scanCommandTokens } from './commands.js';
import { sourceEnvironments } from './environments.js';
import { freeze, identity, lineStarts, rangeAt, record } from './shared.js';
import { validateSnapshot } from './snapshot.js';
import { readBracedGroupTokens, tokenizeFile } from './tokenize.js';
import { validateView } from './view.js';

const AUTHOR_NOTE_COMMANDS = new Set(['thanks', 'affil', 'institute', 'email']);
const INLINE_FORMAT_COMMANDS = new Set([
  'textbf',
  'textit',
  'textrm',
  'textsf',
  'texttt',
  'textsc',
  'textsl',
  'textmd',
  'textup',
  'emph',
  'underline',
  'mbox',
]);

function normalizeInlineLatex(raw: string, stripNotes = false): { text: string; notes: string[] } {
  const tokens = tokenizeFile(raw);
  const out: string[] = [];
  const notes: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.kind === 'comment') continue;
    if (tok.kind === 'open' || tok.kind === 'close') continue;
    if (tok.kind === 'space') {
      out.push(' ');
      continue;
    }
    if (tok.kind === 'command') {
      if (AUTHOR_NOTE_COMMANDS.has(tok.name)) {
        const grp = readBracedGroupTokens(tokens, i + 1);
        if (grp) {
          notes.push(normalizeInlineLatex(grp.text, false).text);
          if (!stripNotes) out.push(normalizeInlineLatex(grp.text, false).text);
          i = grp.nextIndex - 1;
          continue;
        }
      }
      if (INLINE_FORMAT_COMMANDS.has(tok.name)) {
        continue;
      }
      if (tok.name === '\\' || tok.name === 'newline') {
        out.push(' ');
        continue;
      }
      if (tok.name === '&' || tok.name === '%' || tok.name === '$' || tok.name === '#') {
        out.push(tok.name);
        continue;
      }
      continue;
    }
    out.push(tok.value.replace(/~/g, ' '));
  }

  return {
    text: out.join('').replace(/\s+/g, ' ').trim(),
    notes,
  };
}

function parseAuthors(
  rawSource: string,
  contentStart: number,
  snapshotId: string,
  occurrenceId: string | null,
  path: string,
  starts: readonly number[]
): MetadataAuthor[] {
  const tokens = tokenizeFile(rawSource);
  const segments: { startOffset: number; endOffset: number }[] = [];
  let depth = 0;
  let segStart = 0;

  for (const tok of tokens) {
    if (tok.kind === 'open') depth++;
    else if (tok.kind === 'close') depth = Math.max(0, depth - 1);
    else if (depth === 0 && tok.kind === 'command' && tok.name === 'and') {
      segments.push({ startOffset: segStart, endOffset: tok.range.start });
      segStart = tok.range.end + 1;
    }
  }
  segments.push({ startOffset: segStart, endOffset: rawSource.length });

  const authors: MetadataAuthor[] = [];
  for (const seg of segments) {
    const rawSeg = rawSource.slice(seg.startOffset, seg.endOffset);
    const trimmed = rawSeg.trim();
    if (!trimmed) continue;
    const leadingWs = /^\s*/.exec(rawSeg)?.[0].length ?? 0;
    const start = contentStart + seg.startOffset + leadingWs;
    const end = start + trimmed.length - 1;
    const parsed = normalizeInlineLatex(trimmed, true);
    authors.push({
      name: parsed.text,
      rawSource: trimmed,
      notes: parsed.notes,
      location: {
        snapshotId,
        occurrenceId,
        path,
        range: rangeAt(starts, start, end),
      },
    });
  }
  return authors;
}

export interface MetadataFieldEditInfo {
  readonly field: MetadataField;
  readonly shortRange: SourceRange | null;
  readonly shortOuterRange: SourceRange | null;
  readonly mandatoryOuterRange: SourceRange | null;
  readonly isBraced: boolean;
}

export interface InternalMetadataResult {
  readonly metadata: ProjectMetadata;
  readonly editableFields: ReadonlyMap<
    'title' | 'author' | 'date' | 'abstract',
    MetadataFieldEditInfo
  >;
}

export function extractMetadataWithEditInfo(
  model: ProjectSnapshot | ProjectView
): InternalMetadataResult {
  const rawModel = record(model, 'metadata model');
  const normalized =
    rawModel['kind'] === 'snapshot' ? validateSnapshot(model) : validateView(model);
  const snapshot = normalized.kind === 'snapshot' ? normalized : normalized.snapshot;
  const view = normalized.kind === 'view' ? normalized : null;

  const filesByPath = new Map(snapshot.files.map((f) => [f.path, f]));
  const startsByPath = new Map(snapshot.files.map((f) => [f.path, lineStarts(f.source)]));

  const commandNodeKeys = new Map<string, string>();
  const envNodeKeys = new Map<string, string>();
  let sectionCount = 0;
  let mathCount = 0;

  if (view && view.status === 'ready') {
    for (const node of walkConfiguredNodes(view.root)) {
      if (node.kind === 'section') sectionCount++;
      else if (node.kind === 'math') mathCount++;
      else if (node.kind === 'command') {
        const firstTok = node.children[0];
        if (firstTok?.kind === 'token' && firstTok.location.primary) {
          const p = firstTok.location.primary;
          commandNodeKeys.set(`${p.path}:${p.occurrenceId}:${p.range.start}`, node.occurrenceKey);
        }
      } else if (node.kind === 'environment' && node.syntax.opening) {
        const op = node.syntax.opening;
        envNodeKeys.set(
          `${op.path}:${op.origin.occurrenceId}:${op.range.start}`,
          node.occurrenceKey
        );
      }
    }
  } else {
    for (const file of snapshot.files) {
      let mathOpen = false;
      for (const tok of file.tokens) {
        if (tok.kind === 'command') {
          if (
            tok.name === 'section' ||
            tok.name === 'subsection' ||
            tok.name === 'subsubsection' ||
            tok.name === 'paragraph' ||
            tok.name === 'subparagraph'
          ) {
            sectionCount++;
          }
        } else if (tok.kind === 'math') {
          if (tok.value === '\\(' || tok.value === '\\[') mathCount++;
          else if (tok.value === '$' || tok.value === '$$') {
            if (!mathOpen) mathCount++;
            mathOpen = !mathOpen;
          }
        }
      }
    }
  }

  const catalog = inspectProjectCatalog(normalized);

  const editableFields = new Map<'title' | 'author' | 'date' | 'abstract', MetadataFieldEditInfo>();

  let title: MetadataField | null = null;
  let rawAuthorField: MetadataField | null = null;
  let authors: MetadataAuthor[] = [];
  let date: MetadataField | null = null;
  let abstractField: MetadataField | null = null;
  let documentClass: ProjectMetadata['documentClass'] = null;
  const packages: {
    readonly names: readonly string[];
    readonly options: readonly string[];
    readonly location: AnalysisLocation;
  }[] = [];
  let bibStyle: string | null = null;
  const bibResources: string[] = [];
  const bibLocations: AnalysisLocation[] = [];
  const keywords: string[] = [];

  const scanCommandAt = (
    name: string,
    path: string,
    occurrenceId: string | null,
    rangeStart: number
  ) => {
    const file = filesByPath.get(path);
    const starts = startsByPath.get(path);
    if (!file || !starts) return null;
    const tokIdx = file.tokens.findIndex((t) => t.range.start === rangeStart);
    if (tokIdx < 0) return null;
    const sig = getCommandSignature(name);
    if (!sig) return null;
    const call = scanCommandTokens(file.tokens, tokIdx, sig);
    const endTok = file.tokens[call.endIndex]!;
    return {
      file,
      starts,
      call,
      location: {
        snapshotId: snapshot.id,
        occurrenceId,
        path,
        range: rangeAt(starts, rangeStart, endTok.range.end),
      },
      nodeKey:
        occurrenceId !== null
          ? (commandNodeKeys.get(`${path}:${occurrenceId}:${rangeStart}`) ?? null)
          : null,
    };
  };

  const buildFieldFromCall = (
    scanned: NonNullable<ReturnType<typeof scanCommandAt>>
  ): MetadataFieldEditInfo | null => {
    const opt = scanned.call.args.find((a) => a.spec.kind === 'optional');
    const mand = scanned.call.args.find((a) => a.spec.kind === 'mandatory');
    if (!mand) return null;

    const rawSource = scanned.file.source.slice(mand.innerStart, mand.innerEnd + 1);
    const shortRaw = opt ? scanned.file.source.slice(opt.innerStart, opt.innerEnd + 1) : null;
    const field: MetadataField = {
      text: normalizeInlineLatex(rawSource).text,
      rawSource,
      shortText: shortRaw !== null ? normalizeInlineLatex(shortRaw).text : null,
      location: scanned.location,
      contentLocation: {
        snapshotId: snapshot.id,
        occurrenceId: scanned.location.occurrenceId,
        path: scanned.file.path,
        range: rangeAt(scanned.starts, mand.innerStart, mand.innerEnd),
      },
      nodeKey: scanned.nodeKey,
    };
    return {
      field,
      shortRange: opt ? rangeAt(scanned.starts, opt.innerStart, opt.innerEnd) : null,
      shortOuterRange: opt ? rangeAt(scanned.starts, opt.start, opt.end - 1) : null,
      mandatoryOuterRange: rangeAt(scanned.starts, mand.start, mand.end - 1),
      isBraced: Boolean(mand.braced),
    };
  };

  const commandLocations: {
    readonly name: string;
    readonly path: string;
    readonly occurrenceId: string | null;
    readonly start: number;
  }[] = [];

  if (view) {
    for (const r of view.reachedFacts) {
      if (r.fact.kind === 'command-use' && r.fact.context.definitionBodies.length === 0) {
        commandLocations.push({
          name: r.fact.name,
          path: r.origin.path,
          occurrenceId: r.origin.occurrenceId,
          start: r.fact.range.start,
        });
      }
    }
  } else {
    for (const file of snapshot.files) {
      for (const f of file.facts) {
        if (f.kind === 'command-use' && f.context.definitionBodies.length === 0) {
          commandLocations.push({
            name: f.name,
            path: file.path,
            occurrenceId: null,
            start: f.range.start,
          });
        }
      }
    }
  }

  for (const item of commandLocations) {
    if (
      item.name !== 'title' &&
      item.name !== 'author' &&
      item.name !== 'date' &&
      item.name !== 'documentclass' &&
      item.name !== 'usepackage' &&
      item.name !== 'RequirePackage' &&
      item.name !== 'bibliographystyle' &&
      item.name !== 'bibliography' &&
      item.name !== 'addbibresource' &&
      item.name !== 'keywords'
    ) {
      continue;
    }
    const scanned = scanCommandAt(item.name, item.path, item.occurrenceId, item.start);
    if (!scanned) continue;

    if (item.name === 'title' && !title) {
      const info = buildFieldFromCall(scanned);
      if (info) {
        title = info.field;
        editableFields.set('title', info);
      }
    } else if (item.name === 'author' && !rawAuthorField) {
      const info = buildFieldFromCall(scanned);
      if (info) {
        rawAuthorField = info.field;
        editableFields.set('author', info);
        if (info.field.contentLocation) {
          authors = parseAuthors(
            info.field.rawSource,
            info.field.contentLocation.range.start,
            snapshot.id,
            item.occurrenceId,
            item.path,
            scanned.starts
          );
        }
      }
    } else if (item.name === 'date' && !date) {
      const info = buildFieldFromCall(scanned);
      if (info) {
        date = info.field;
        editableFields.set('date', info);
      }
    } else if (item.name === 'documentclass' && !documentClass) {
      const opt = scanned.call.args.find((a) => a.spec.kind === 'optional');
      const mand = scanned.call.args.find((a) => a.spec.kind === 'mandatory');
      if (mand) {
        const name = scanned.file.source.slice(mand.innerStart, mand.innerEnd + 1).trim();
        const opts = opt
          ? scanned.file.source
              .slice(opt.innerStart, opt.innerEnd + 1)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        documentClass = { name, options: opts, location: scanned.location };
      }
    } else if (item.name === 'usepackage' || item.name === 'RequirePackage') {
      const opt = scanned.call.args.find((a) => a.spec.kind === 'optional');
      const mand = scanned.call.args.find((a) => a.spec.kind === 'mandatory');
      if (mand) {
        const names = scanned.file.source
          .slice(mand.innerStart, mand.innerEnd + 1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const opts = opt
          ? scanned.file.source
              .slice(opt.innerStart, opt.innerEnd + 1)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        packages.push({ names, options: opts, location: scanned.location });
      }
    } else if (item.name === 'bibliographystyle' && !bibStyle) {
      const mand = scanned.call.args.find((a) => a.spec.kind === 'mandatory');
      if (mand) {
        bibStyle = scanned.file.source.slice(mand.innerStart, mand.innerEnd + 1).trim();
        bibLocations.push(scanned.location);
      }
    } else if (item.name === 'bibliography' || item.name === 'addbibresource') {
      const mand = scanned.call.args.find((a) => a.spec.kind === 'mandatory');
      if (mand) {
        const items = scanned.file.source
          .slice(mand.innerStart, mand.innerEnd + 1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        bibResources.push(...items);
        bibLocations.push(scanned.location);
      }
    } else if (item.name === 'keywords') {
      const mand = scanned.call.args.find((a) => a.spec.kind === 'mandatory');
      if (mand) {
        const rawKw = scanned.file.source.slice(mand.innerStart, mand.innerEnd + 1);
        for (const piece of rawKw.split(/[,;]|\\and/)) {
          const cleaned = normalizeInlineLatex(piece).text;
          if (cleaned) keywords.push(cleaned);
        }
      }
    }
  }

  // Extract abstract environment & count environments
  let environmentCount = 0;
  let figureCount = 0;
  let tableCount = 0;

  if (view && view.status === 'ready') {
    for (const node of walkConfiguredNodes(view.root)) {
      if (node.kind !== 'environment') continue;
      environmentCount++;
      if (node.name === 'figure' || node.name === 'figure*') figureCount++;
      if (node.name === 'table' || node.name === 'table*') tableCount++;
      if (node.name === 'abstract' && !abstractField && node.syntax.body && node.location.primary) {
        const bodyFile = filesByPath.get(node.syntax.body.path);
        const rawAbs = bodyFile
          ? bodyFile.source.slice(node.syntax.body.range.start, node.syntax.body.range.end + 1)
          : '';
        const field: MetadataField = {
          text: normalizeInlineLatex(rawAbs).text,
          rawSource: rawAbs,
          shortText: null,
          location: {
            snapshotId: snapshot.id,
            occurrenceId: node.location.primary.occurrenceId,
            path: node.location.primary.path,
            range: node.location.primary.range,
          },
          contentLocation: {
            snapshotId: snapshot.id,
            occurrenceId: node.syntax.body.occurrenceId,
            path: node.syntax.body.path,
            range: node.syntax.body.range,
          },
          nodeKey: node.occurrenceKey,
        };
        abstractField = field;
        editableFields.set('abstract', {
          field,
          shortRange: null,
          shortOuterRange: null,
          mandatoryOuterRange: null,
          isBraced: false,
        });
      }
    }
  } else {
    for (const env of sourceEnvironments(snapshot)) {
      if (env.context.definitionBodies.length > 0) continue;
      environmentCount++;
      if (env.name === 'figure' || env.name === 'figure*') figureCount++;
      if (env.name === 'table' || env.name === 'table*') tableCount++;
      if (env.name === 'abstract' && !abstractField && env.body) {
        const file = filesByPath.get(env.path);
        const rawAbs = file ? file.source.slice(env.body.start, env.body.end + 1) : '';
        const field: MetadataField = {
          text: normalizeInlineLatex(rawAbs).text,
          rawSource: rawAbs,
          shortText: null,
          location: {
            snapshotId: snapshot.id,
            occurrenceId: null,
            path: env.path,
            range: env.range,
          },
          contentLocation: {
            snapshotId: snapshot.id,
            occurrenceId: null,
            path: env.path,
            range: env.body,
          },
          nodeKey: null,
        };
        abstractField = field;
        editableFields.set('abstract', {
          field,
          shortRange: null,
          shortOuterRange: null,
          mandatoryOuterRange: null,
          isBraced: false,
        });
      }
    }
  }

  const commandUseCount = catalog.commands.reduce((acc, c) => acc + c.occurrences.length, 0);
  const citationCount = catalog.citations.reduce((acc, c) => acc + c.occurrences.length, 0);
  const labelCount = catalog.labels.reduce((acc, l) => acc + l.declarations.length, 0);
  const referenceCount = catalog.labels.reduce((acc, l) => acc + l.occurrences.length, 0);

  const metadata: ProjectMetadata = freeze({
    kind: 'metadata',
    snapshotId: snapshot.id,
    viewId: view ? view.id : null,
    resultId: identity('metadata', [snapshot.id, view?.id ?? null, 1]),
    title,
    authors,
    rawAuthorField,
    date,
    abstract: abstractField,
    documentClass,
    packages,
    bibliography: {
      style: bibStyle,
      resources: bibResources,
      locations: bibLocations,
    },
    keywords,
    stats: {
      totalFiles: snapshot.files.length,
      reachedFiles: view
        ? new Set(view.occurrences.map((o) => o.path)).size
        : snapshot.files.length,
      sectionCount,
      environmentCount,
      commandUseCount,
      introducedCommandCount: catalog.introducedCommands.length,
      undefinedCommandCount: catalog.usedUndefinedCommands.length,
      mathCount,
      figureCount,
      tableCount,
      citationCount,
      labelCount,
      referenceCount,
    },
  });

  return { metadata, editableFields };
}

/**
 * Extract structured document metadata (`title`, `authors`, `date`, `abstract`, `documentClass`,
 * `packages`, `bibliography`, `keywords`, and structural statistics) from a snapshot or view.
 *
 * @param model - Source snapshot or configured view.
 * @returns Frozen {@link ProjectMetadata}.
 * @throws {@link PrepTexError} with `InvalidArgument` for malformed models.
 */
export function extractProjectMetadata(model: ProjectSnapshot | ProjectView): ProjectMetadata {
  return extractMetadataWithEditInfo(model).metadata;
}
