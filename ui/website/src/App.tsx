import React, { useMemo, useState } from 'react';
import './App.css';

import { ASTview, Codeview, ControlPanel, Filetree } from './components';

type InputCmdHandlingUI = 'none' | 'flatten' | 'recursive';

type CoreOptionsUI = {
  suppressComments: boolean;
  handleInputCmd: InputCmdHandlingUI;
  ifDecisions: string[];
};

function App() {
  const filesByName = useMemo<Record<string, string>>(
    () => ({
      'basic.tex': String.raw`\\documentclass{article}
\\begin{document}
Hello from basic.tex
\\end{document}
`,
      'sub.tex': String.raw`This is sub.tex content.
\\section{Sub}
`,
    }),
    []
  );

  const fileNames = useMemo(() => Object.keys(filesByName), [filesByName]);
  const [selectedFile, setSelectedFile] = useState<string>(fileNames[0] ?? '');

  const [options, setOptions] = useState<CoreOptionsUI>({
    suppressComments: false,
    handleInputCmd: 'none',
    ifDecisions: [],
  });

  const code = filesByName[selectedFile] ?? '';

  const astText = useMemo(() => {
    return JSON.stringify(
      {
        file: selectedFile,
        options,
        note: 'AST rendering not wired to @preptex/core yet.',
      },
      null,
      2
    );
  }, [options, selectedFile]);

  return (
    <div className="App">
      <div className="AppCell AppCell--leftTop">
        <Filetree files={fileNames} selected={selectedFile} onSelect={setSelectedFile} />
      </div>

      <div className="AppCell AppCell--leftBottom">
        <ControlPanel options={options} onChange={setOptions} />
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
