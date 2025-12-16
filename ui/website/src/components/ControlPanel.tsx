import './ControlPanel.css';

type InputCmdHandlingUI = 'none' | 'flatten' | 'recursive';

export type CoreOptionsUI = {
  suppressComments: boolean;
  handleInputCmd: InputCmdHandlingUI;
  handleIfConditions: boolean;
  ifDecisions: string[];
};

export type ControlPanelProps = {
  options: CoreOptionsUI;
  onChange: (next: CoreOptionsUI) => void;
  availableIfConditions?: string[];
  entryFile?: string;
  onTransform?: () => void;
};

export default function ControlPanel({
  options,
  onChange,
  availableIfConditions = [],
  entryFile = '',
  onTransform,
}: ControlPanelProps) {
  const toggleSuppressComments = () => {
    onChange({ ...options, suppressComments: !options.suppressComments });
  };

  const toggleHandleIfConditions = () => {
    onChange({ ...options, handleIfConditions: !options.handleIfConditions });
  };

  const toggleCondition = (cond: string) => {
    if (!options.handleIfConditions) return;
    const exists = options.ifDecisions.includes(cond);
    const nextIfs = exists
      ? options.ifDecisions.filter((c) => c !== cond)
      : [...options.ifDecisions, cond];
    onChange({ ...options, ifDecisions: nextIfs });
  };

  return (
    <section aria-label="Control panel">
      <h2>Control panel</h2>

      <div className="ControlSections" role="list">
        <div className="ControlSection" role="listitem">
          <div className="ControlSectionTitle">Entry</div>
          <div className="PaneMeta">{entryFile || 'No file selected'}</div>
        </div>

        <div className="ControlSection" role="listitem">
          <label className="ControlSectionTitle" htmlFor="handleInputCmd">
            Input
          </label>
          <select
            id="handleInputCmd"
            className="ControlSelect"
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

        <div className="ControlSection" role="listitem">
          <div className="ControlSectionTitle">Comments</div>
          <button
            type="button"
            className={
              options.suppressComments
                ? 'ControlItem ConditionItem ConditionItem--selected ControlToggleFull'
                : 'ControlItem ConditionItem ControlToggleFull'
            }
            aria-pressed={options.suppressComments}
            onClick={toggleSuppressComments}
          >
            Suppress comments
          </button>
        </div>

        <div className="ControlSection" role="listitem">
          <button
            type="button"
            className={
              options.handleIfConditions
                ? 'ControlItem ConditionItem ConditionItem--selected ControlToggleFull'
                : 'ControlItem ConditionItem ControlToggleFull'
            }
            aria-pressed={options.handleIfConditions}
            onClick={toggleHandleIfConditions}
          >
            Conditions
          </button>

          <div
            className={
              options.handleIfConditions
                ? 'ConditionsPanel ConditionsPanel--open'
                : 'ConditionsPanel'
            }
          >
            <ul className="ConditionsList" role="listbox" aria-label="Available if conditions">
              {availableIfConditions.map((cond) => {
                const selected = options.ifDecisions.includes(cond);
                return (
                  <li key={cond}>
                    <button
                      type="button"
                      className={
                        selected
                          ? 'ControlItem ConditionItem ConditionItem--selected'
                          : 'ControlItem ConditionItem'
                      }
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
        </div>
      </div>

      <div className="ControlSection" role="listitem">
        {onTransform ? (
          <button
            type="button"
            className="ControlButton"
            onClick={onTransform}
            disabled={!entryFile}
            title={entryFile ? `Transform ${entryFile}` : 'Select a file first'}
          >
            Transform
          </button>
        ) : null}
      </div>
    </section>
  );
}
