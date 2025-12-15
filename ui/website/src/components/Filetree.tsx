import React, { useRef } from 'react';

export type FiletreeProps = {
  files: string[];
  selected?: string;
  onSelect: (filename: string) => void;
  onDownload?: (filename: string) => void;
  onRemove?: (filename: string) => void;
  onUploadFiles?: (files: FileList) => void;
};

export default function Filetree({
  files,
  selected,
  onSelect,
  onDownload,
  onRemove,
  onUploadFiles,
}: FiletreeProps) {
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
            <div key={f} className="FiletreeRow">
              <button
                type="button"
                className={selected === f ? 'FiletreeItem FiletreeItem--active' : 'FiletreeItem'}
                onClick={() => onSelect(f)}
              >
                {f}
              </button>

              {onDownload ? (
                <button
                  type="button"
                  className="FiletreeDownload"
                  aria-label={`Download ${f}`}
                  title={`Download ${f}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDownload(f);
                  }}
                >
                  ⬇
                </button>
              ) : null}

              {onRemove ? (
                <button
                  type="button"
                  className="FiletreeRemove"
                  aria-label={`Remove ${f}`}
                  title={`Remove ${f}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(f);
                  }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
