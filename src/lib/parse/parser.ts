import { CallStack } from './callstack';
import { AstNode, AstRoot, SectionNode } from './types';
import { CoreOptions, Artifact } from '../options';
import { Lexer, TokenType } from './tokens';

export class Parser {
  constructor(
    private stack: CallStack,
    private options: CoreOptions
  ) {}

  parse(input: string): AstRoot {
    const lexer = new Lexer(input);
    const tokens = Array.from(lexer.stream());

    const root: AstRoot = { type: 'Root', start: 0, end: input.length, children: [] };
    const sectionLevels: Record<string, 1 | 2 | 3> = {
      section: 1,
      subsection: 2,
      subsubsection: 3,
    };

    const nodeStack: AstNode[] = [root];
    const childrenOf = (): AstNode[] => (nodeStack[nodeStack.length - 1] as any).children;

    let i = 0;
    const n = tokens.length;

    const pushNode = (node: AstNode) => {
      childrenOf().push(node);
    };

    const popSectionsGte = (lvl: number) => {
      while (nodeStack.length > 1) {
        const top = nodeStack[nodeStack.length - 1] as any;
        if (top.type === 'Section' && top.level >= lvl) {
          nodeStack.pop();
        } else {
          break;
        }
      }
    };

    const parseMathSpan = (startIndex: number): { node: AstNode; nextIndex: number } => {
      const open = tokens[startIndex];
      const openVal = open.value; // '$', '$$', '\\(', '\\['
      const closing =
        openVal === '$' || openVal === '$$'
          ? openVal
          : openVal === '\\('
            ? '\\)'
            : openVal === '\\['
              ? '\\]'
              : openVal;
      let idx = startIndex + 1;
      const children: AstNode[] = [];
      while (idx < n) {
        const t = tokens[idx];
        if (t.type === TokenType.MathDelim && t.value === closing) {
          const node: AstNode = {
            type: 'Math',
            delim: openVal,
            children,
            start: open.start,
            end: t.end,
          } as any;
          return { node, nextIndex: idx + 1 };
        }
        // Recursively parse nested math spans
        if (t.type === TokenType.MathDelim) {
          const nested = parseMathSpan(idx);
          children.push(nested.node);
          idx = nested.nextIndex;
          continue;
        }
        // Parse groups inside math
        if (t.type === TokenType.LBrace) {
          const group = { type: 'Group', children: [], start: t.start, end: t.end } as any;
          children.push(group);
          // Simulate nested group consumption: use outer parse to walk tokens for group content
          // We will manually consume until matching RBrace here for math context
          let gDepth = 1;
          idx++;
          while (idx < n && gDepth > 0) {
            const gt = tokens[idx];
            if (gt.type === TokenType.LBrace) {
              gDepth++;
              children.push({ type: 'Text', value: '{', start: gt.start, end: gt.end } as any);
              idx++;
              continue;
            }
            if (gt.type === TokenType.RBrace) {
              gDepth--;
              if (gDepth > 0)
                children.push({ type: 'Text', value: '}', start: gt.start, end: gt.end } as any);
              group.end = gt.end;
              idx++;
              continue;
            }
            if (gt.type === TokenType.MathDelim) {
              const nested = parseMathSpan(idx);
              (group.children as AstNode[]).push(nested.node);
              idx = nested.nextIndex;
              continue;
            }
            if (gt.type === TokenType.Command) {
              (group.children as AstNode[]).push({
                type: 'Command',
                name: gt.value,
                start: gt.start,
                end: gt.end,
              } as any);
              idx++;
              continue;
            }
            if (gt.type === TokenType.Comment) {
              (group.children as AstNode[]).push({
                type: 'Comment',
                value: gt.value,
                start: gt.start,
                end: gt.end,
              } as any);
              idx++;
              continue;
            }
            if (gt.type === TokenType.Text) {
              (group.children as AstNode[]).push({
                type: 'Text',
                value: gt.value,
                start: gt.start,
                end: gt.end,
              } as any);
              idx++;
              continue;
            }
            idx++;
          }
          continue;
        }
        if (t.type === TokenType.Command) {
          children.push({
            type: 'Command',
            name: t.value,
            start: t.start,
            end: t.end,
          } as any);
          idx++;
          continue;
        }
        if (t.type === TokenType.Comment) {
          children.push({ type: 'Comment', value: t.value, start: t.start, end: t.end } as any);
          idx++;
          continue;
        }
        if (t.type === TokenType.Text) {
          // In math mode, split text containing command-like sequences into Text + Command nodes
          let remaining = t.value;
          let cursorStart = t.start;
          const cmdRegex = /(.*?)\\([a-zA-Z]+)(.*)/s;
          while (remaining.length > 0) {
            const m = cmdRegex.exec(remaining);
            if (!m) {
              children.push({
                type: 'Text',
                value: remaining,
                start: cursorStart,
                end: t.end,
              } as any);
              break;
            }
            const pre = m[1];
            const cmdName = m[2];
            const post = m[3];
            const preLen = pre.length;
            if (preLen > 0) {
              children.push({
                type: 'Text',
                value: pre,
                start: cursorStart,
                end: cursorStart + preLen,
              } as any);
              cursorStart += preLen;
            }
            // Command node
            children.push({
              type: 'Command',
              name: cmdName,
              start: cursorStart,
              end: cursorStart + cmdName.length + 1, // include backslash
            } as any);
            cursorStart += cmdName.length + 1;
            remaining = post;
          }
          idx++;
          continue;
        }
        idx++;
      }
      // Unterminated math span fallback
      const node: AstNode = {
        type: 'Math',
        delim: openVal,
        children,
        start: open.start,
        end: tokens[Math.max(idx - 1, startIndex)].end,
      } as any;
      return { node, nextIndex: idx };
    };

    const parseBraceNodes = (
      startIndex: number
    ): { nodes: AstNode[]; nextIndex: number; endPos: number } => {
      if (startIndex >= n || tokens[startIndex].type !== TokenType.LBrace) {
        return {
          nodes: [],
          nextIndex: startIndex,
          endPos: startIndex < n ? tokens[startIndex].end : input.length,
        };
      }
      const openTok = tokens[startIndex];
      let idx = startIndex + 1;
      let depth = 1;
      const nodes: AstNode[] = [];
      let endPos = openTok.end;
      while (idx < n && depth > 0) {
        const t = tokens[idx];
        if (t.type === TokenType.LBrace) {
          depth++;
          nodes.push({ type: 'Text', value: '{', start: t.start, end: t.end } as any);
          idx++;
          continue;
        }
        if (t.type === TokenType.RBrace) {
          depth--;
          if (depth > 0)
            nodes.push({ type: 'Text', value: '}', start: t.start, end: t.end } as any);
          endPos = t.end;
          idx++;
          continue;
        }
        if (t.type === TokenType.MathDelim) {
          const math = parseMathSpan(idx);
          nodes.push(math.node);
          idx = math.nextIndex;
          endPos = math.node.end;
          continue;
        }
        if (t.type === TokenType.Command) {
          nodes.push({
            type: 'Command',
            name: t.value,
            start: t.start,
            end: t.end,
          } as any);
          endPos = t.end;
          idx++;
          continue;
        }
        if (t.type === TokenType.Comment) {
          nodes.push({ type: 'Comment', value: t.value, start: t.start, end: t.end } as any);
          endPos = t.end;
          idx++;
          continue;
        }
        if (t.type === TokenType.Text) {
          nodes.push({ type: 'Text', value: t.value, start: t.start, end: t.end } as any);
          endPos = t.end;
          idx++;
          continue;
        }
        idx++;
      }
      return { nodes, nextIndex: idx, endPos };
    };

    const parseBracketNodes = (
      startIndex: number
    ): { nodes: AstNode[]; nextIndex: number; endPos: number } => {
      if (startIndex >= n || tokens[startIndex].type !== TokenType.LBracket) {
        return {
          nodes: [],
          nextIndex: startIndex,
          endPos: startIndex < n ? tokens[startIndex].end : input.length,
        };
      }
      const openTok = tokens[startIndex];
      let idx = startIndex + 1;
      const nodes: AstNode[] = [];
      let endPos = openTok.end;
      while (idx < n) {
        const t = tokens[idx];
        if (t.type === TokenType.RBracket) {
          endPos = t.end;
          idx++;
          break;
        }
        if (t.type === TokenType.MathDelim) {
          const math = parseMathSpan(idx);
          nodes.push(math.node);
          idx = math.nextIndex;
          endPos = math.node.end;
          continue;
        }
        if (t.type === TokenType.Command) {
          nodes.push({
            type: 'Command',
            name: t.value,
            start: t.start,
            end: t.end,
          } as any);
          endPos = t.end;
          idx++;
          continue;
        }
        if (t.type === TokenType.Comment) {
          nodes.push({ type: 'Comment', value: t.value, start: t.start, end: t.end } as any);
          endPos = t.end;
          idx++;
          continue;
        }
        if (t.type === TokenType.Text) {
          nodes.push({ type: 'Text', value: t.value, start: t.start, end: t.end } as any);
          endPos = t.end;
          idx++;
          continue;
        }
        idx++;
      }
      return { nodes, nextIndex: idx, endPos };
    };

    while (i < n) {
      const tok = tokens[i];
      if (tok.type === TokenType.Command && tok.value in sectionLevels) {
        const level = sectionLevels[tok.value as keyof typeof sectionLevels];
        // Check for starred form (next token is Text "*")
        let starred = false;
        let j = i + 1;
        if (j < n && tokens[j].type === TokenType.Text && tokens[j].value === '*') {
          starred = true;
          j++;
        }
        // Optional short title then mandatory brace title
        const shortData = parseBracketNodes(j);
        const k = shortData.nextIndex;
        const braceData = parseBraceNodes(k);
        const titleNodes = braceData.nodes;
        const secEnd = braceData.endPos;
        // Normalize stack: discard any non-Section nodes so we are at a Section or Root
        while (nodeStack.length > 1) {
          const topAny = nodeStack[nodeStack.length - 1] as any;
          if (topAny.type !== 'Section') {
            nodeStack.pop();
            continue;
          }
          break;
        }
        // Now close sections at same or higher level to make the new section correctly placed
        popSectionsGte(level);
        const sec: SectionNode = {
          type: 'Section',
          level,
          starred,
          shortTitle: shortData.nodes.length ? shortData.nodes : undefined,
          title: titleNodes,
          children: [],
          start: tok.start,
          end: secEnd,
        };
        pushNode(sec);
        nodeStack.push(sec);
        i = braceData.nextIndex;
        continue;
      }

      // Minimal handling of other tokens to keep AST usable
      // Environments nesting
      if (tok.type === TokenType.BeginEnv) {
        const env = {
          type: 'Environment',
          name: tok.value,
          children: [],
          start: tok.start,
          end: tok.end,
        } as any;
        pushNode(env);
        this.stack.push(tok);
        nodeStack.push(env);
        i++;
        continue;
      }
      if (tok.type === TokenType.EndEnv) {
        // pop matching BeginEnv
        let opener;
        while ((opener = this.stack.pop())) {
          if (opener.type === TokenType.BeginEnv && opener.value === tok.value) break;
        }
        const top = nodeStack[nodeStack.length - 1] as any;
        if (top && top.type === 'Environment' && top.name === tok.value) {
          top.end = tok.end;
          nodeStack.pop();
        }
        i++;
        continue;
      }
      // Brace groups nesting
      if (tok.type === TokenType.LBrace) {
        const group = { type: 'Group', children: [], start: tok.start, end: tok.end } as any;
        pushNode(group);
        this.stack.push(tok);
        nodeStack.push(group);
        i++;
        continue;
      }
      if (tok.type === TokenType.RBrace) {
        let opener;
        while ((opener = this.stack.pop())) {
          if (opener.type === TokenType.LBrace) break;
        }
        const top = nodeStack[nodeStack.length - 1] as any;
        if (top && top.type === 'Group') {
          top.end = tok.end;
          nodeStack.pop();
        }
        i++;
        continue;
      }
      // Math spans
      if (tok.type === TokenType.MathDelim) {
        const math = parseMathSpan(i);
        pushNode(math.node);
        i = math.nextIndex;
        continue;
      }
      // Plain tokens
      if (tok.type === TokenType.Text) {
        pushNode({ type: 'Text', value: tok.value, start: tok.start, end: tok.end } as any);
      } else if (tok.type === TokenType.Comment) {
        pushNode({ type: 'Comment', value: tok.value, start: tok.start, end: tok.end } as any);
      } else if (tok.type === TokenType.Command) {
        pushNode({
          type: 'Command',
          name: tok.value,
          start: tok.start,
          end: tok.end,
        } as any);
      }
      i++;
    }

    return root;
  }

  export(ast: AstRoot, _options: CoreOptions): Artifact {
    void ast; // silence unused for now
    void _options;
    // TODO: Implement export pipeline according to options.
    return { kind: 'text', content: '' };
  }
}
