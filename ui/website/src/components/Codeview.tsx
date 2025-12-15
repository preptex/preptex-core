import React, { useMemo } from 'react';

export type CodeviewProps = {
  filename?: string;
  code: string;
};

export default function Codeview({ filename, code }: CodeviewProps) {
  const lines = useMemo(() => (code ? code.split(/\r?\n/) : ['']), [code]);

  return (
    <section aria-label="Code view">
      <h2>Codeview</h2>
      {filename ? <div className="PaneMeta">{filename}</div> : null}

      <div className="CodeviewContainer">
        <pre className="LineNumbers" aria-hidden>
          <code>
            {lines.map(
              (_, i) =>
                // keep newline so pre preserves spacing
                (i + 1).toString() + '\n'
            )}
          </code>
        </pre>

        <pre className="CodeviewPre">
          <code>{code}</code>
        </pre>
      </div>
    </section>
  );
}
