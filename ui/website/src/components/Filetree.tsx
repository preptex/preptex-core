import React, { useRef } from 'react';

export type FiletreeProps = {
  files: string[];
  selected?: string;
  onSelect: (filename: string) => void;
  onDownload?: (filename: string) => void;
  onRemove?: (filename: string) => void;
  onUploadFiles?: (files: FileList) => void;
};

function shortenFilenameMiddle(filename: string, maxLength = 30): string {
  if (filename.length <= maxLength) return filename;

  const lastDot = filename.lastIndexOf('.');
  const hasExt = lastDot > 0 && lastDot < filename.length - 1;
  const ext = hasExt ? filename.slice(lastDot) : '';
  const base = hasExt ? filename.slice(0, lastDot) : filename;

  const ellipsis = '...';
  const remaining = maxLength - ext.length - ellipsis.length;

  const headLen = 5 + Math.ceil(remaining / 2);
  const tailLen = remaining - headLen;
  return base.slice(0, headLen) + ellipsis + base.slice(Math.max(0, base.length - tailLen)) + ext;
}

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
                className={
                  selected === f
                    ? 'ControlItem FiletreeItem FiletreeItem--active'
                    : 'ControlItem FiletreeItem'
                }
                onClick={() => onSelect(f)}
                title={f}
              >
                {shortenFilenameMiddle(f)}
              </button>

              {onDownload ? (
                <button
                  type="button"
                  className="ControlItem FiletreeDownload"
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
                  className="ControlItem FiletreeRemove"
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
