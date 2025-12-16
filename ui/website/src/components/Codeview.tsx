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
        <div className="CodeviewGrid" role="presentation">
          {lines.map((line, i) => (
            <React.Fragment key={i}>
              <code className="LineNumberCell" aria-hidden>
                {i + 1}
              </code>
              <code className="CodeCell">{line === '' ? '\u00A0' : line}</code>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
