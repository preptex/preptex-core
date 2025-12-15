import { useCallback, useMemo, useState } from 'react';

export type FilesMap = Record<string, string>;

export function useFiles(initial: FilesMap = {}) {
  const [filesByName, setFilesByName] = useState<FilesMap>({ ...initial });
  const [selectedFile, setSelectedFile] = useState<string>(Object.keys(initial)[0] ?? '');

  const fileNames = useMemo(() => Object.keys(filesByName), [filesByName]);

  const selectFile = useCallback((name: string) => setSelectedFile(name), []);

  const upsertFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const entries = await Promise.all(
        files.map(
          (f) =>
            new Promise<[string, string]>((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(reader.error);
              reader.onload = () => resolve([f.name, String(reader.result ?? '')]);
              reader.readAsText(f);
            })
        )
      );

      setFilesByName((prev) => {
        const next: FilesMap = { ...prev };
        for (const [name, text] of entries) {
          next[name] = text;
        }
        return next;
      });

      if (!selectedFile && entries.length > 0) {
        setSelectedFile(entries[0][0]);
      }
    },
    [selectedFile]
  );

  const upsertTextFiles = useCallback((entries: Record<string, string>) => {
    setFilesByName((prev) => ({ ...prev, ...entries }));
  }, []);

  const removeFile = useCallback(
    (name: string) => {
      setFilesByName((prev) => {
        if (!(name in prev)) return prev;
        const next: FilesMap = { ...prev };
        delete next[name];

        if (selectedFile === name) {
          const nextSelected = Object.keys(next)[0] ?? '';
          setSelectedFile(nextSelected);
        }

        return next;
      });
    },
    [selectedFile]
  );

  return {
    filesByName,
    fileNames,
    selectedFile,
    selectFile,
    upsertFiles,
    upsertTextFiles,
    removeFile,
  } as const;
}
