import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

import { ASTview, Codeview, ControlPanel, Filetree } from './components';
import { useFiles } from './model/useFiles';
import { useControl } from './model/useControl';
import { useCoreProcess } from './model/useCoreProcess';

type InputCmdHandlingUI = 'none' | 'flatten' | 'recursive';

type CoreOptionsUI = {
  suppressComments: boolean;
  handleInputCmd: InputCmdHandlingUI;
  ifDecisions: string[];
};

function App() {
  const seedFiles = useMemo<Record<string, string>>(() => ({}), []);

  const { filesByName, fileNames, selectedFile, selectFile, upsertFiles } = useFiles(seedFiles);
  const [entryFile, setEntryFile] = useState<string>(selectedFile || fileNames[0] || '');

  useEffect(() => {
    if (!entryFile && fileNames.length > 0) {
      setEntryFile(fileNames[0]);
    }
  }, [fileNames, entryFile]);

  useEffect(() => {
    if (entryFile && selectedFile !== entryFile) {
      selectFile(entryFile);
    }
  }, [entryFile, selectFile]);

  const { options, setOptions } = useControl();

  const code = filesByName[selectedFile] ?? '';

  const coreRun = useCoreProcess(entryFile, filesByName, options);

  const astText = useMemo(() => {
    return JSON.stringify(
      {
        file: selectedFile,
        options,
        core: coreRun,
      },
      null,
      2
    );
  }, [options, selectedFile, coreRun]);

  return (
    <div className="App">
      <div className="AppCell AppCell--leftTop">
        <Filetree
          files={fileNames}
          selected={selectedFile}
          onSelect={(name) => selectFile(name)}
          onUploadFiles={(fl) => upsertFiles(fl)}
        />
      </div>

      <div className="AppCell AppCell--leftBottom">
        <ControlPanel
          options={options}
          onChange={setOptions}
          files={fileNames}
          entryFile={entryFile}
          onEntryChange={setEntryFile}
          availableIfConditions={coreRun?.declaredConditions ?? []}
        />
      </div>

      <div className="AppCell AppCell--middle">
        <Codeview filename={selectedFile} code={code} />
      </div>

      <div className="AppCell AppCell--right">
        <ASTview filename={selectedFile} ast={astText} />
      </div>
    </div>
  );
}

export default App;
