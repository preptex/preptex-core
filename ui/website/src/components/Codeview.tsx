import React from 'react';

export type CodeviewProps = {
  filename?: string;
  code: string;
};

export default function Codeview({ filename, code }: CodeviewProps) {
  return (
    <section aria-label="Code view">
      <h2>Codeview</h2>
      {filename ? <div className="PaneMeta">{filename}</div> : null}
      <pre className="CodeviewPre">
        <code>{code}</code>
      </pre>
    </section>
  );
}
