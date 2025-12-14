import React from 'react';

export type FiletreeProps = {
  files: string[];
  selected?: string;
  onSelect: (filename: string) => void;
};

export default function Filetree({ files, selected, onSelect }: FiletreeProps) {
  return (
    <section aria-label="File tree">
      <h2>Filetree</h2>
      <div className="FiletreeList" role="list">
        {files.length === 0 ? (
          <div>No files</div>
        ) : (
          files.map((f) => (
            <button
              key={f}
              type="button"
              className={selected === f ? 'FiletreeItem FiletreeItem--active' : 'FiletreeItem'}
              onClick={() => onSelect(f)}
            >
              {f}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
