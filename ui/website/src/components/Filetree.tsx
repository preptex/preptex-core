import React, { useRef } from 'react';

export type FiletreeProps = {
  files: string[];
  selected?: string;
  onSelect: (filename: string) => void;
  onUploadFiles?: (files: FileList) => void;
};

export default function Filetree({ files, selected, onSelect, onUploadFiles }: FiletreeProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const triggerPicker = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const onFilesChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const fl = e.target.files;
    if (fl && onUploadFiles) {
      onUploadFiles(fl);
    }
  };

  return (
    <section aria-label="File tree">
      <h2>Filetree</h2>
      {onUploadFiles ? (
        <div style={{ marginBottom: 8 }}>
          <button type="button" className="FiletreeItem" onClick={triggerPicker}>
            Upload files…
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={onFilesChange}
            style={{ display: 'none' }}
          />
        </div>
      ) : null}
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
