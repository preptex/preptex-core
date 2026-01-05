import React, { useMemo } from 'react';
import './App.css';

import { ASTview, Codeview, ControlPanel, Filetree } from './components';
import { useFiles } from './model/useFiles';
import { useControl } from './model/useControl';
import { useCoreProcess } from './model/useCoreProcess';
import { TreeLayoutBuilder } from './components/astview/treebuilder';

function App() {
  const seedFiles = useMemo<Record<string, string>>(() => ({}), []);

  const {
    filesByName,
    fileNames,
    selectedFile,
    selectFile,
    mutation,
    upsertFiles,
    upsertTextFiles,
    removeFile,
  } = useFiles(seedFiles);

  const { options, setOptions } = useControl();

  const code = filesByName[selectedFile] ?? '';

  const {
    result: coreRun,
    transform,
    project,
    projectVersion,
  } = useCoreProcess(selectedFile, mutation, options);

  const rootNode = useMemo(() => {
    void projectVersion;
    const astRoot = project?.getRoots()?.[selectedFile];
    if (!astRoot) return null;
    return new TreeLayoutBuilder().build(astRoot);
  }, [projectVersion, selectedFile, project]);

  const onDownload = (name: string) => {
    const text = filesByName[name] ?? '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const normalizeOutputName = (raw: string): string => {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return '';
    // If user provided an extension, respect it. Otherwise default to .processed.tex
    const hasExt = /\.[^./\\]+$/.test(trimmed);
    return hasExt ? trimmed : `${trimmed}.processed.tex`;
  };

  const writeOutputsToTree = (outputs: Record<string, string>) => {
    const next: Record<string, string> = {};
    const overrideName = normalizeOutputName(options.outputName);
    for (const [name, text] of Object.entries(outputs)) {
      const isEntry = name === selectedFile;
      const newname =
        overrideName && isEntry ? overrideName : name.replace(/\.tex$/i, '') + '.processed.tex';
      next[newname] = text;
    }
    upsertTextFiles(next);
  };

  const onTransform = () => {
    const outputs = transform(selectedFile);
    if (!outputs) return;
    writeOutputsToTree(outputs);
  };

  const onSelectFile = (name: string) => {
    selectFile(name);
  };

  const onRemove = (name: string) => {
    removeFile(name);
  };

  return (
    <div className="App">
      <div className="AppCell AppCell--leftTop">
        <Filetree
          files={fileNames}
          selected={selectedFile}
          onSelect={onSelectFile}
          onDownload={onDownload}
          onRemove={onRemove}
          onUploadFiles={(fl) => upsertFiles(fl)}
        />
      </div>

      <div className="AppCell AppCell--leftBottom">
        <ControlPanel
          options={options}
          onChange={setOptions}
          entryFile={selectedFile}
          availableIfConditions={coreRun?.declaredConditions ?? []}
          onTransform={onTransform}
        />
      </div>

      <div className="AppCell AppCell--middle">
        <Codeview filename={selectedFile} code={code} />
      </div>

      <div className="AppCell AppCell--right">{rootNode ? <ASTview root={rootNode} /> : null}</div>
    </div>
  );
}

export default App;
