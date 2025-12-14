import React from 'react';

type InputCmdHandlingUI = 'none' | 'flatten' | 'recursive';

export type CoreOptionsUI = {
  suppressComments: boolean;
  handleInputCmd: InputCmdHandlingUI;
  ifDecisions: string[];
};

export type ControlPanelProps = {
  options: CoreOptionsUI;
  onChange: (next: CoreOptionsUI) => void;
};

export default function ControlPanel({ options, onChange }: ControlPanelProps) {
  const ifText = options.ifDecisions.join('\n');

  return (
    <section aria-label="Control panel">
      <h2>Control panel</h2>

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
        <label className="ControlLabel" htmlFor="ifDecisions">
          If decisions (one per line)
        </label>
        <textarea
          id="ifDecisions"
          value={ifText}
          rows={6}
          onChange={(e) => {
            const next = e.target.value
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean);
            onChange({ ...options, ifDecisions: next });
          }}
        />
      </div>
    </section>
  );
}
