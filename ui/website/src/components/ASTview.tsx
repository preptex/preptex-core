import React from 'react';

export type ASTviewProps = {
  filename?: string;
  ast: string;
};

export default function ASTview({ filename, ast }: ASTviewProps) {
  return (
    <section aria-label="AST view">
      <h2>ASTview</h2>
      {filename ? <div className="PaneMeta">{filename}</div> : null}
      <pre className="AstviewPre">
        <code>{ast}</code>
      </pre>
    </section>
  );
}
