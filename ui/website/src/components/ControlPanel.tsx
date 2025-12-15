import React, { useMemo } from 'react';

type InputCmdHandlingUI = 'none' | 'flatten' | 'recursive';

export type CoreOptionsUI = {
  suppressComments: boolean;
  handleInputCmd: InputCmdHandlingUI;
  ifDecisions: string[];
};

export type ControlPanelProps = {
  options: CoreOptionsUI;
  onChange: (next: CoreOptionsUI) => void;
  availableIfConditions?: string[];
  files?: string[];
  entryFile?: string;
  onEntryChange?: (filename: string) => void;
};

export default function ControlPanel({
  options,
  onChange,
  availableIfConditions = [],
  files = [],
  entryFile = '',
  onEntryChange,
}: ControlPanelProps) {
  const placeholderConds = useMemo<string[]>(
    () => ['draft', 'short', 'withFigures', 'arxiv', 'cameraReady'],
    []
  );

  const conditions = availableIfConditions;

  const toggleCondition = (cond: string) => {
    const exists = options.ifDecisions.includes(cond);
    const nextIfs = exists
      ? options.ifDecisions.filter((c) => c !== cond)
      : [...options.ifDecisions, cond];
    onChange({ ...options, ifDecisions: nextIfs });
  };

  return (
    <section aria-label="Control panel">
      <h2>Control panel</h2>

      <div className="ControlRow">
        <label className="ControlLabel" htmlFor="entryFile">
          Entry file
        </label>
        <select
          id="entryFile"
          value={entryFile}
          onChange={(e) => onEntryChange?.(e.target.value)}
          disabled={files.length === 0}
        >
          {files.length === 0 ? (
            <option value="">No files</option>
          ) : (
            files.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="ControlRow">
        <label className="ControlLabel">
          <input
            type="checkbox"
            checked={options.suppressComments}
            onChange={(e) => onChange({ ...options, suppressComments: e.target.checked })}
          />
          <span>Suppress comments</span>
        </label>
      </div>

      <div className="ControlRow">
        <label className="ControlLabel" htmlFor="handleInputCmd">
          Handle \\input
        </label>
        <select
          id="handleInputCmd"
          value={options.handleInputCmd}
          onChange={(e) =>
            onChange({ ...options, handleInputCmd: e.target.value as InputCmdHandlingUI })
          }
        >
          <option value="none">none</option>
          <option value="flatten">flatten</option>
          <option value="recursive">recursive</option>
        </select>
      </div>

      <div className="ControlRow">
        <div className="ControlLabel">If conditions</div>
        <ul className="ConditionsList" role="listbox" aria-label="Available if conditions">
          {availableIfConditions.map((cond) => {
            const selected = options.ifDecisions.includes(cond);
            return (
              <li key={cond}>
                <button
                  type="button"
                  className={selected ? 'ConditionItem ConditionItem--selected' : 'ConditionItem'}
                  aria-pressed={selected}
                  onClick={() => toggleCondition(cond)}
                >
                  {cond}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
