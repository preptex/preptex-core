import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export type CodeviewProps = {
  filename?: string;
  code: string;
};

export default function CodeMirrorView({ filename, code }: CodeviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const initialCodeRef = useRef(code);

  // Mount editor once
  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;

    const state = EditorState.create({
      doc: initialCodeRef.current,
      extensions: [EditorView.editable.of(false)],
    });

    viewRef.current = new EditorView({
      state,
      parent: hostRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  // Update document when code changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === code) return;

    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: code,
      },
    });
  }, [code]);

  return (
    <div className="CodeviewContainer">
      <div className="CodeviewHeader">
        <h2 className="CodeviewTitle">Code</h2>
        {filename ? <div className="PaneMeta">{filename}</div> : null}
      </div>
      <div className="CodeviewEditor" ref={hostRef} />
    </div>
  );
}
